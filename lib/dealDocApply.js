// ─── Applying deal documents to the model (phase E) ─────────────────────────
// Each document type compares its abstract with the app's values, field by
// field; the user ticks the fields to take. Nothing changes until they apply,
// and each change is logged as from the document.
//
//   compareDoc(doc, { inputs, terms, results }) → rows [{ key, label, kind, appValue, docValue, differs, note, target }]
//   applyDoc(doc, keys, { inputs, terms }) → { inputs?, terms?, entries[] }
//   rentRollDiff / applyRentRoll, insuranceGaps, icVariance

import { TYPE, docField, fieldValue, numberOf, dateOf } from "@/lib/dealDocTypes";
import { fieldOf as leaseField } from "@/lib/leaseAbstract";
import { monthsBetween, monthsRemainingFor } from "@/lib/leases";
import { suggestSic } from "@/lib/sicCodes";

const r2 = (n) => Math.round(n * 100) / 100;
const close = (a, b, tol) => isFinite(a) && isFinite(b) && Math.abs(a - b) <= tol;

// Field → deal input: [doc key, input key, label, kind, transform(doc value, inputs, abs) → input value]
const DEAL_TARGETS = {
  om: [
    ["property_name", "propertyName", "Property name", "text"],
    ["address", "address", "Street address", "text"],
    ["city", "city", "City", "text"],
    ["state", "state", "State", "text"],
    ["zip", "zip", "ZIP", "text"],
    ["square_feet", "squareFootage", "Square footage", "number"],
    ["units", "unitCount", "Unit count", "number"],
    ["year_built", "yearBuilt", "Year built", "number"],
    ["asking_price", "purchasePrice", "Purchase price (asking)", "money"],
    ["in_place_noi", "noiYear1", "Year-1 NOI (used with Direct NOI)", "money"],
    ["occupancy", "vacancyPct", "Vacancy % (100 − occupancy)", "pct", (v) => r2(100 - v)],
  ],
  loi: [
    ["purchase_price", "purchasePrice", "Purchase price", "money"],
    ["deposit", "dealTerms.deposit", "Deposit", "money"],
    ["dd_days", "dealTerms.ddDays", "Due diligence (days)", "days"],
    ["closing_days", "dealTerms.closingDays", "Closing after due diligence (days)", "days"],
    ["financing_contingency", "dealTerms.financingContingency", "Financing contingency", "text"],
    ["loi_date", "dealTerms.loiDate", "LOI date", "date"],
  ],
  psa: [
    ["purchase_price", "purchasePrice", "Purchase price", "money"],
    ["initial_deposit", "dealTerms.deposit", "Initial deposit", "money"],
    ["additional_deposit", "dealTerms.additionalDeposit", "Additional deposit", "money"],
    ["deposit_hard_date", "dealTerms.depositHardDate", "Deposit goes hard", "date"],
    ["dd_expiry", "dealTerms.ddExpiry", "Due diligence expires", "date"],
    ["closing_date", "dealTerms.closingDate", "Closing date", "date"],
    ["reps_survival_months", "dealTerms.repsSurvivalMonths", "Reps survival (months)", "months"],
    ["reps_cap", "dealTerms.repsCap", "Reps cap", "money"],
    ["psa_date", "dealTerms.psaDate", "PSA effective date", "date"],
  ],
  closing_acq: [
    ["contract_price", "purchasePrice", "Purchase price (actual)", "money"],
    ["closing_date", "acquisitionDate", "Acquisition date (actual)", "date"],
    ["closing_costs", "closingCosts", "Closing costs (one line, per the statement)", "money", (v, inp) => ({ ...Object.fromEntries(Object.keys(inp.closingCosts ?? {}).map((k) => [k, 0])), miscClosingCosts: v })],
    ["loan_proceeds", "actualBasis.loanProceeds", "Loan proceeds (actual)", "money"],
    ["equity_funded", "actualBasis.equityFunded", "Equity funded (actual)", "money"],
    ["seller_credits", "actualBasis.sellerCredits", "Seller credits", "money"],
    ["prorations", "actualBasis.prorations", "Prorations", "money"],
    ["deposits_transferred", "actualBasis.depositsTransferred", "Security deposits transferred", "money"],
  ],
  closing_disp: [
    ["sale_price", "realizedSalePrice", "Sale price (realized; replaces exit value)", "money"],
    ["selling_costs", "realizedSellingCosts", "Selling costs (realized)", "money"],
    ["closing_date", "holdPeriodYears", "Hold (years, to the sale)", "years", (v, inp) => Math.max(1, Math.round(monthsBetween(inp.acquisitionDate || v, v) / 12))],
    ["closing_date", "realizedSaleDate", "Sale date", "date"],
    ["net_proceeds", "realizedNetProceeds", "Net proceeds to equity", "money"],
    ["loan_payoff", "realizedLoanPayoff", "Loan payoff", "money"],
  ],
};

// T-12 lines → $/SF (or %) inputs.
const T12_TARGETS = [
  ["real_estate_taxes", "realEstateTaxPSF", "Real estate tax $/SF"],
  ["insurance", "insurancePSF", "Insurance $/SF"],
  ["utilities", "utilitiesPSF", "Utilities $/SF"],
  ["repairs_maintenance", "maintenancePSF", "Maintenance $/SF"],
  ["janitorial", "janitorialPSF", "Janitorial $/SF"],
  ["other_income", "otherIncomePSF", "Other income $/SF"],
];

// LPA / PPM fields → fund terms.
const TERM_TARGETS = [
  ["commitments", "targetEquity", "Total commitments ($)", "money"],
  ["gp_commit_pct", "gpCommitPct", "GP commitment (%)", "pct"],
  ["mgmt_fee_pct", "mgmtFeePct", "Management fee (%)", "pct"],
  ["pref_pct", "prefPct", "Preferred return (%)", "pct"],
  ["catch_up_pct", "catchUpGpPct", "GP catch-up (%)", "pct"],
  ["investment_period_years", "investmentPeriodYears", "Investment period (years)", "years"],
  ["term_years", "termYears", "Fund term (years)", "years"],
  ["extension_count", "extensionCount", "Extension options", "number"],
  ["extension_years", "extensionYears", "Extension length (years)", "years"],
  ["sub_line_pct", "subLineSizePct", "Sub line size (%)", "pct"],
];

const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function set(o, path, v) {
  const ks = path.split(".");
  if (ks.length === 1) return { ...o, [path]: v };
  return { ...o, [ks[0]]: set(o[ks[0]] ?? {}, ks.slice(1).join("."), v) };
}
const same = (kind, a, b) => {
  if (a == null || a === "") return b == null || b === "";
  if (["money", "number", "days", "months", "years"].includes(kind)) return close(Number(a), Number(b), Math.max(0.5, Math.abs(Number(b)) * 0.0005));
  if (kind === "pct") return close(Number(a), Number(b), 0.005);
  if (typeof a === "object") return JSON.stringify(a) === JSON.stringify(b);
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
};
const closingTotal = (cc) => Object.values(cc ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);

export function compareDoc(doc, { inputs = {}, terms = {} } = {}) {
  const abs = doc.abstract;
  const type = doc.doc_type;
  if (!abs) return [];
  const rows = [];
  if (DEAL_TARGETS[type]) {
    for (const [key, target, label, kind, fn] of DEAL_TARGETS[type]) {
      const raw = fieldValue(abs, type, key);
      if (raw == null) continue;
      const docValue = fn ? fn(raw, inputs, abs) : raw;
      if (docValue == null || (typeof docValue === "number" && !isFinite(docValue))) continue;
      let appValue = get(inputs, target);
      let differs = !same(kind, appValue, docValue);
      let note = "";
      if (target === "closingCosts") {
        appValue = closingTotal(inputs.closingCosts);
        differs = !close(appValue, raw, 0.5);
        note = "Replaces the closing cost lines with one line for the statement's total";
      }
      if (target === "noiYear1" && !inputs.noiOverrideEnabled) note = "Used only when NOI is entered directly (Direct NOI)";
      if (target === "purchasePrice" && isFinite(Number(appValue)) && isFinite(Number(docValue))) {
        const d = Number(docValue) - Number(appValue);
        if (d) note = `${d > 0 ? "+" : "−"}$${Math.abs(d).toLocaleString("en-US")} vs the underwritten price`;
      }
      rows.push({ key: `${key}→${target}`, docKey: key, target, label, kind: target === "closingCosts" ? "money" : kind, appValue, docValue: target === "closingCosts" ? raw : docValue, setValue: docValue, differs, note });
    }
  }
  if (type === "t12") {
    const sf = Number(inputs.squareFootage) || 0;
    for (const [key, target, label] of T12_TARGETS) {
      const annual = fieldValue(abs, type, key);
      if (annual == null || !(sf > 0)) continue;
      const psf = r2(annual / sf);
      const app = Number(inputs[target]) || 0;
      const variance = app ? ((psf - app) / app) * 100 : NaN;
      rows.push({ key: `${key}→${target}`, docKey: key, target, label, kind: "money", appValue: app, docValue: psf, setValue: psf, differs: !close(app, psf, 0.005), note: `$${Math.round(annual).toLocaleString("en-US")} / ${sf.toLocaleString("en-US")} SF${isFinite(variance) ? ` · ${variance >= 0 ? "+" : ""}${variance.toFixed(0)}% vs underwriting` : ""}`, flag: isFinite(variance) && Math.abs(variance) > 10 });
    }
    const fee = fieldValue(abs, type, "management_fee");
    const egr = ["gross_rent", "other_income", "recoveries"].map((k) => fieldValue(abs, type, k) ?? 0).reduce((a, b) => a + b, 0);
    if (fee != null && egr > 0) {
      const pct = r2((fee / egr) * 100);
      rows.push({ key: "management_fee→managementFeePct", docKey: "management_fee", target: "managementFeePct", label: "Management fee (% of revenue)", kind: "pct", appValue: inputs.managementFeePct, docValue: pct, setValue: pct, differs: !close(Number(inputs.managementFeePct), pct, 0.005), note: `$${Math.round(fee).toLocaleString("en-US")} / $${Math.round(egr).toLocaleString("en-US")} revenue` });
    }
  }
  if (type === "lpa" || type === "ppm") {
    for (const [key, target, label, kind] of TERM_TARGETS) {
      const v = fieldValue(abs, "lpa", key);
      if (v == null) continue;
      rows.push({ key: `${key}→${target}`, docKey: key, target, label, kind, appValue: terms[target], docValue: v, setValue: v, differs: !same(kind, terms[target], v), note: "", scope: "fund" });
    }
    for (const l of abs.limits ?? []) {
      const cur = (terms.limits ?? []).find((x) => x.key === l.key);
      const docValue = l.unit === "text" ? l.limit : numberOf(l.limit);
      rows.push({ key: `limit:${l.key}`, docKey: l.key, target: `limits.${l.key}`, label: `Limit: ${l.label}`, kind: l.unit === "%" ? "pct" : l.unit === "years" ? "years" : l.unit === "$" ? "money" : "text", appValue: cur ? cur.limit : null, docValue, setValue: { ...l, limit: docValue }, differs: !cur || !same(l.unit === "text" ? "text" : "number", cur.limit, docValue), note: l.basis ?? "", limit: l, scope: "fund" });
    }
  }
  if (type === "ic_memo") {
    const snap = icSnapshot(abs);
    rows.push({ key: "icApproved", docKey: "ic", target: "icApproved", label: "As-approved baseline (reference; doesn't change the model)", kind: "text", appValue: inputs.icApproved ? `approved ${inputs.icApproved.approval_date ?? ""}` : null, docValue: `approved ${snap.approval_date ?? ""}, ${Object.keys(snap).length - 2} figures`, setValue: snap, differs: JSON.stringify(inputs.icApproved ?? null) !== JSON.stringify(snap) });
    const conds = (abs.conditions ?? []).map((c, i) => ({ id: `c${i + 1}`, text: c.text, deadline: c.deadline || "", done: false }));
    if (conds.length) {
      const keep = new Map((inputs.icConditions ?? []).map((c) => [c.text, c]));
      const merged = conds.map((c) => keep.get(c.text) ?? c);
      rows.push({ key: "icConditions", docKey: "conditions", target: "icConditions", label: "Conditions of approval (checklist)", kind: "text", appValue: (inputs.icConditions ?? []).length ? `${inputs.icConditions.length} conditions` : null, docValue: `${conds.length} conditions`, setValue: merged, differs: JSON.stringify((inputs.icConditions ?? []).map((c) => c.text)) !== JSON.stringify(conds.map((c) => c.text)) });
    }
  }
  return rows;
}

// IC memo → the as-approved snapshot stored on the deal.
export function icSnapshot(abs) {
  const out = { doc: abs.title ?? "IC memo" };
  for (const k of ["approval_date", "approvers", "price", "total_cost", "loan", "equity", "noi1", "going_in_cap", "exit_cap", "irr", "multiple", "coc1", "hold_years", "capex"]) {
    const v = fieldValue(abs, "ic_memo", k);
    if (v != null) out[k] = v;
  }
  return out;
}

// Applies the chosen rows. Returns new inputs (deal types) or terms (fund
// types) and change-log entries ({ key, field, from, to }).
export function applyDoc(doc, keys, { inputs = {}, terms = {} } = {}) {
  const rows = compareDoc(doc, { inputs, terms }).filter((r) => keys.includes(r.key));
  let nextInputs = inputs;
  let nextTerms = terms;
  const entries = [];
  for (const r of rows) {
    if (r.scope === "fund") {
      if (r.target.startsWith("limits.")) {
        const limits = (nextTerms.limits ?? []).filter((x) => x.key !== r.docKey);
        nextTerms = { ...nextTerms, limits: [...limits, { ...r.setValue, docId: doc.id, quote: r.limit.evidence?.[0]?.quote ?? "" }] };
      } else {
        nextTerms = { ...nextTerms, [r.target]: r.setValue };
        if (r.target === "subLineSizePct") nextTerms.subLineEnabled = r.setValue > 0;
      }
    } else {
      nextInputs = set(nextInputs, r.target, r.setValue);
      if (r.target === "squareFootage" && nextInputs.units?.length) {/* rent roll units keep their own SF */}
    }
    entries.push({ key: r.target, field: r.label, from: r.appValue ?? undefined, to: typeof r.setValue === "object" ? r.docValue : r.setValue });
  }
  if (doc.doc_type === "closing_acq" && rows.length) nextInputs = set(nextInputs, "actualBasis.docId", doc.id);
  if (doc.doc_type === "closing_disp" && rows.length) nextInputs = set(nextInputs, "realizedSaleDocId", doc.id);
  return { inputs: nextInputs, terms: nextTerms, entries };
}

// ─── Rent roll ───────────────────────────────────────────────────────────────
export function docUnit(u, base, inputs) {
  const leaseEnd = dateOf(u.lease_end) || "";
  const occupied = String(u.status ?? "occupied").toLowerCase() !== "vacant";
  const business = u.business ?? "";
  return {
    ...base,
    name: String(u.name ?? base.name),
    squareFeet: numberOf(u.sf) || base.squareFeet,
    tenantName: occupied ? String(u.tenant ?? "") : "",
    businessDescription: business,
    sicCode: suggestSic(business) || base.sicCode || "",
    leaseStatus: occupied ? "occupied" : "vacant",
    leaseType: ["NNN", "MG", "Gross"].includes(u.lease_type) ? u.lease_type : base.leaseType,
    currentRentPSF: isFinite(numberOf(u.rent_psf)) ? numberOf(u.rent_psf) : base.currentRentPSF,
    annualEscalationPct: isFinite(numberOf(u.escalation_pct)) ? numberOf(u.escalation_pct) : base.annualEscalationPct,
    leaseStart: dateOf(u.lease_start) || "",
    leaseEnd,
    monthsRemaining: occupied ? Math.max(1, monthsRemainingFor(inputs, leaseEnd) ?? base.monthsRemaining ?? 12) : 0,
  };
}
const UNIT_KEYS = [["tenantName", "Tenant"], ["squareFeet", "SF"], ["leaseStatus", "Status"], ["leaseType", "Lease type"], ["currentRentPSF", "Rent $/SF"], ["leaseEnd", "Lease end"], ["annualEscalationPct", "Escalation %"]];

// New, changed and removed units (matched by unit name).
export function rentRollDiff(abs, units, inputs, newUnit) {
  const byName = new Map(units.map((u) => [String(u.name).trim().toLowerCase(), u]));
  const seen = new Set();
  const added = [];
  const changed = [];
  for (const du of abs.units ?? []) {
    const k = String(du.name).trim().toLowerCase();
    const cur = byName.get(k);
    if (!cur) { added.push(docUnit(du, newUnit(String(du.name), numberOf(du.sf) || 0), inputs)); continue; }
    seen.add(k);
    const next = docUnit(du, cur, inputs);
    const diffs = UNIT_KEYS.filter(([f]) => !same(typeof next[f] === "number" ? "number" : "text", cur[f], next[f])).map(([f, l]) => ({ field: f, label: l, from: cur[f], to: next[f] }));
    if (diffs.length) changed.push({ unit: next, before: cur, diffs });
  }
  const removed = units.filter((u) => !seen.has(String(u.name).trim().toLowerCase()) && !added.some((a) => a.name === u.name));
  return { added, changed, removed, unchanged: seen.size - changed.length };
}

// mode "merge": update matches and add new units, keep the rest; "replace":
// the rent roll becomes the document's units (matched units keep their ids
// and assumptions).
export function applyRentRoll(abs, units, inputs, newUnit, mode = "merge") {
  const d = rentRollDiff(abs, units, inputs, newUnit);
  const changedBy = new Map(d.changed.map((c) => [c.before.id, c.unit]));
  let out = units.map((u) => changedBy.get(u.id) ?? u);
  if (mode === "replace") {
    const removedIds = new Set(d.removed.map((u) => u.id));
    out = out.filter((u) => !removedIds.has(u.id));
  }
  out = [...out, ...d.added];
  const entries = [
    ...d.changed.flatMap((c) => c.diffs.map((x) => ({ key: x.field, field: x.label, from: x.from, to: x.to, unitId: c.unit.id, unitName: c.unit.name }))),
    ...d.added.map((u) => ({ key: "unit", field: "Unit added", from: undefined, to: `${u.squareFeet} SF${u.tenantName ? ` · ${u.tenantName}` : ""}`, unitId: u.id, unitName: u.name })),
    ...(mode === "replace" ? d.removed.map((u) => ({ key: "unit", field: "Unit removed", from: `${u.squareFeet} SF${u.tenantName ? ` · ${u.tenantName}` : ""}`, to: undefined, unitId: u.id, unitName: u.name })) : []),
  ];
  return { units: out, entries, diff: d };
}

// ─── Insurance ───────────────────────────────────────────────────────────────
const amt = (re, s) => {
  const m = s.match(re);
  return m ? Number(m[1].replace(/,/g, "")) : NaN;
};
// A lease's insurance requirements from its abstract.
export function leaseInsuranceRequirements(leaseAbs) {
  const f = leaseField(leaseAbs, "insurance_requirements");
  if (!f) return null;
  const s = String(f.value);
  return {
    cglOccurrence: amt(/(?:CGL|general liability)[^;]*?\$([\d,]+)[^;$]*?per occurrence/i, s),
    cglAggregate: amt(/\$([\d,]+)[^;$]*?aggregate/i, s),
    umbrella: amt(/umbrella[^;]*?\$([\d,]+)/i, s),
    auto: amt(/auto[^;]*?\$([\d,]+)/i, s),
    pollution: amt(/pollution[^;]*?\$([\d,]+)/i, s),
    workersComp: /workers'? ?comp/i.test(s),
    additionalInsured: /additional insured/i.test(s),
    waiver: /waiver of subrogation/i.test(s),
    clause: f.clause ?? "",
    text: s,
  };
}

// Gaps in a certificate: lapsed or expiring policies (60 days), and, for a
// tenant certificate, anything below the lease's requirements.
export function insuranceGaps(certAbs, { leaseAbs = null, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const gaps = [];
  const pols = certAbs?.policies ?? [];
  const pol = (c) => pols.find((p) => String(p.coverage).toLowerCase() === c);
  const soon = new Date(new Date(`${asOf}T00:00:00Z`).getTime() + 60 * 86400000).toISOString().slice(0, 10);
  for (const p of pols) {
    const exp = dateOf(p.expiry) || p.expiry;
    if (exp && exp < asOf) gaps.push({ severity: "high", text: `${p.coverage} policy ${p.policy_no ?? ""} expired ${exp}` });
    else if (exp && exp <= soon) gaps.push({ severity: "medium", text: `${p.coverage} policy ${p.policy_no ?? ""} expires ${exp} (within 60 days)` });
  }
  const req = leaseAbs ? leaseInsuranceRequirements(leaseAbs) : null;
  if (req) {
    const need = (label, cov, field, min) => {
      if (!isFinite(min)) return;
      const p = pol(cov);
      const have = p ? numberOf(p[field] ?? p.limit) : NaN;
      if (!p) gaps.push({ severity: "high", text: `No ${label} on the certificate; the lease requires $${min.toLocaleString("en-US")}` });
      else if (!(have >= min)) gaps.push({ severity: "high", text: `${label} $${(have || 0).toLocaleString("en-US")} is below the lease's $${min.toLocaleString("en-US")}` });
    };
    need("general liability per occurrence", "cgl", "per_occurrence", req.cglOccurrence);
    need("general liability aggregate", "cgl", "aggregate", req.cglAggregate);
    need("umbrella", "umbrella", "limit", req.umbrella);
    need("auto liability", "auto", "limit", req.auto);
    need("pollution liability", "pollution", "limit", req.pollution);
    if (req.workersComp && !pol("workers_comp")) gaps.push({ severity: "medium", text: "No workers' compensation on the certificate; the lease requires it" });
    if (req.additionalInsured && pol("cgl") && pol("cgl").additional_insured !== true) gaps.push({ severity: "medium", text: "Landlord not shown as additional insured on the general liability policy" });
    if (req.waiver && !pols.some((p) => p.waiver_of_subrogation === true)) gaps.push({ severity: "low", text: "No waiver of subrogation shown" });
  }
  return gaps;
}

// ─── IC approved vs current ──────────────────────────────────────────────────
// results: underwrite(inputs). Returns rows [{ label, approved, current, diff, kind }].
export function icVariance(ic, inputs, results) {
  if (!ic) return [];
  const cf1 = results?.annualCashFlows?.[0] ?? {};
  const eq = results?.debt?.equityRequired;
  const cur = {
    price: inputs.purchasePrice,
    total_cost: (inputs.purchasePrice ?? 0) + (results?.closingCosts?.total ?? closingTotal(inputs.closingCosts)) + (inputs.capexBudget ?? 0),
    loan: results?.debt?.loanAmount,
    equity: eq,
    noi1: cf1.noi,
    going_in_cap: inputs.purchasePrice ? (cf1.noi / inputs.purchasePrice) * 100 : NaN,
    exit_cap: inputs.exitCapRatePct,
    irr: results?.returns?.irr,
    multiple: results?.returns?.equityMultiple,
    coc1: eq ? (cf1.pretaxCashFlow / eq) * 100 : NaN,
    hold_years: inputs.holdPeriodYears,
    capex: inputs.capexBudget,
  };
  const LBL = { price: ["Price", "money"], total_cost: ["Total cost", "money"], loan: ["Loan", "money"], equity: ["Equity", "money"], noi1: ["Year-1 NOI", "money"], going_in_cap: ["Going-in cap", "pct"], exit_cap: ["Exit cap", "pct"], irr: ["IRR", "pct"], multiple: ["Multiple", "x"], coc1: ["Year-1 cash-on-cash", "pct"], hold_years: ["Hold (years)", "number"], capex: ["Capex", "money"] };
  return Object.entries(LBL)
    .filter(([k]) => ic[k] != null)
    .map(([k, [label, kind]]) => ({ key: k, label, kind, approved: ic[k], current: cur[k], diff: isFinite(cur[k]) ? cur[k] - ic[k] : NaN }));
}

export const typeLabel = (t) => TYPE[t]?.label ?? t;
export { docField };
