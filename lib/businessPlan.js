// Asset business plan and budget vs. plan (phase I).
//
// Stored on the deal: inputs.businessPlan = {
//   revisions: [{ n, at, by, note, reason, changes, plan, budget, model }],   // revision 1 = closing, never changed
//   actuals: { "YYYY-MM": { line: amount } },  // monthly actuals (income statement import or by hand)
//   actualsSource: { file, importedAt, by },
//   comments: { "<period>|<line>": text },     // one comment per variance
//   thresholdPct: 5,                           // amber over this, red over twice this
// }
// Every amount is signed like an income statement: income +, expenses −.
import { underwrite } from "@/lib/calculations";
import { unitsToday } from "@/lib/leaseHistory";

export const LINES = [
  ["rent", "Base rent and other income", "income"],
  ["recoveries", "Expense recoveries", "income"],
  ["vacancy", "Vacancy and credit loss", "income"],
  ["egr", "Effective gross revenue", "total"],
  ["taxes", "Real estate taxes", "expense"],
  ["insurance", "Insurance", "expense"],
  ["utilities", "Utilities", "expense"],
  ["repairs", "Repairs, maintenance and janitorial", "expense"],
  ["management", "Management fee", "expense"],
  ["otherOpex", "Other operating expenses", "expense"],
  ["opex", "Total operating expenses", "total"],
  ["noi", "Net operating income", "total"],
  ["capital", "TI, leasing and capital", "below"],
  ["debtService", "Debt service", "below"],
  ["cashFlow", "Cash flow", "total"],
];
export const LINE_LABEL = Object.fromEntries(LINES.map(([k, l]) => [k, l]));
const OPEX = ["taxes", "insurance", "utilities", "repairs", "management", "otherOpex"];
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return isFinite(n) ? (neg ? -n : n) : 0;
};
const ym = (iso) => String(iso).slice(0, 7);
export function addMonths(ymStr, k) {
  const [y, m] = ymStr.split("-").map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const monthsBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

// ── Budget (locked from the underwriting) ──
// On NNN deals the model nets recoverable expenses out of revenue and
// expenses; the budget grosses them back up (inputs PSF × SF, flat) as both an
// expense and a recovery, so lines compare with an income statement. NOI is
// the model's.
export function budgetFromModel(inputs, { label = "Closing budget", at = new Date().toISOString(), results = null } = {}) {
  const r = results ?? underwrite(inputs);
  const sf = Number(inputs.squareFootage) || 0;
  const years = r.annualCashFlows.map((cf, i) => {
    const modelOpex = { taxes: cf.realEstateTax, insurance: cf.insurance, utilities: cf.utilities, repairs: (cf.maintenance ?? 0) + (cf.janitorial ?? 0) };
    const net = Object.values(modelOpex).every((v) => !v) && !cf.noiOverride;
    const gross = net ? { taxes: (inputs.realEstateTaxPSF ?? 0) * sf, insurance: (inputs.insurancePSF ?? 0) * sf, utilities: (inputs.utilitiesPSF ?? 0) * sf, repairs: ((inputs.maintenancePSF ?? 0) + (inputs.janitorialPSF ?? 0)) * sf } : modelOpex;
    const recoveries = net ? Object.values(gross).reduce((s, v) => s + v, 0) : 0;
    const otherOpex = (cf.operatingExpenses ?? 0) - Object.values(modelOpex).reduce((s, v) => s + (v ?? 0), 0) - (cf.managementFee ?? 0);
    const L = {
      rent: cf.grossRevenue, recoveries, vacancy: cf.effectiveGrossRevenue - cf.grossRevenue,
      taxes: -gross.taxes, insurance: -gross.insurance, utilities: -gross.utilities, repairs: -gross.repairs,
      management: -(cf.managementFee ?? 0), otherOpex: -otherOpex,
      capital: -((cf.tiAndLeasing ?? 0) + (cf.capReplacement ?? 0)), debtService: -(cf.debtService ?? 0),
    };
    L.egr = L.rent + L.recoveries + L.vacancy;
    L.opex = OPEX.reduce((s, k) => s + L[k], 0);
    L.noi = cf.noi;
    L.cashFlow = cf.pretaxCashFlow;
    for (const k of Object.keys(L)) L[k] = r2(L[k] ?? 0);
    return { year: i + 1, lines: L };
  });
  return { label, lockedAt: at, start: ym(inputs.acquisitionDate || at), sf, years };
}
// Budget for one month: the hold year's line ÷ 12 (outside the hold: none).
export function budgetMonth(budget, month) {
  if (!budget?.years?.length) return null;
  const k = monthsBetween(budget.start, month);
  if (k < 0) return null;
  const y = budget.years[Math.floor(k / 12)];
  return y ? Object.fromEntries(Object.entries(y.lines).map(([key, v]) => [key, v / 12])) : null;
}

// ── Actuals: monthly income statement (CSV/Excel grid) ──
const COLMAP = [
  [/^base rent|^rental income|^rent$|^other income|^miscellaneous income/i, "rent"],
  [/recover|reimburse|^cam income/i, "recoveries"],
  [/vacancy|credit loss|bad debt|concession/i, "vacancy"],
  [/tax/i, "taxes"], [/insurance/i, "insurance"], [/utilit|electric|water|gas/i, "utilities"],
  [/repair|maint|janitor|landscap|snow/i, "repairs"], [/management fee|mgmt/i, "management"],
  [/net operating income|^noi$/i, "noi"],
];
export const lineForColumn = (h) => COLMAP.find(([re]) => re.test(String(h ?? "").trim()))?.[1] ?? null;
// Returns { properties: { key: { code, name, months: { "YYYY-MM": lines } } }, warnings }.
export function parseIncomeStatement(grid) {
  const hi = grid.findIndex((r) => (r ?? []).some((c) => /^month$|^period$/i.test(String(c ?? "").trim())));
  const warnings = [];
  if (hi < 0) return { properties: {}, warnings: ["No header row with a Month column."] };
  const H = grid[hi].map((c) => String(c ?? "").trim());
  const at = (re) => H.findIndex((h) => re.test(h));
  const cMonth = at(/^month$|^period$/i), cProp = at(/^property$|^property code$/i), cName = at(/^property name$/i);
  const valueCols = H.map((h, i) => [i, h]).filter(([i]) => ![cMonth, cProp, cName].includes(i));
  const properties = {};
  for (const r of grid.slice(hi + 1)) {
    if (!r || !r[cMonth]) continue;
    const m = String(r[cMonth]).trim().match(/^(\d{4})-(\d{1,2})/) ?? String(r[cMonth]).trim().match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/);
    if (!m) continue;
    const month = m[1].length === 4 ? `${m[1]}-${m[2].padStart(2, "0")}` : `${m[2]}-${m[1].padStart(2, "0")}`;
    const code = cProp >= 0 ? String(r[cProp] ?? "").trim() : "";
    const name = cName >= 0 ? String(r[cName] ?? "").trim() : "";
    const key = code || name;
    const p = (properties[key] ??= { code, name, months: {} });
    const L = Object.fromEntries(LINES.map(([k]) => [k, 0]));
    let other = 0, noiReported = null;
    for (const [i, h] of valueCols) {
      const line = lineForColumn(h);
      const v = num(r[i]);
      if (line === "noi") noiReported = v;
      else if (line) L[line] += v;
      else if (v) other += v < 0 ? v : 0;
    }
    L.otherOpex += other;
    L.egr = L.rent + L.recoveries + L.vacancy;
    L.opex = OPEX.reduce((s, k) => s + L[k], 0);
    L.noi = L.egr + L.opex;
    if (noiReported != null && Math.abs(noiReported - L.noi) > 1) warnings.push(`${key} ${month}: lines add to ${r2(L.noi)}, the statement's NOI is ${noiReported}`);
    delete L.capital; delete L.debtService; delete L.cashFlow;
    for (const k of Object.keys(L)) L[k] = r2(L[k]);
    p.months[month] = L;
  }
  return { properties, warnings };
}
// Which deal each statement property belongs to (by name, then code).
export function matchProperties(parsed, deals) {
  const low = (s) => String(s ?? "").toLowerCase().trim();
  return Object.fromEntries(Object.entries(parsed.properties).map(([key, p]) => [key, (deals.find((d) => low(d.inputs.propertyName) === low(p.name)) ?? deals.find((d) => low(d.inputs.yardiCode) === low(p.code)))?.id ?? null]));
}

// ── Variance ──
export const PERIODS = [["month", "Month"], ["quarter", "Quarter"], ["ytd", "Year to date"], ["itd", "Since closing"]];
// Months in a period ending `end` (YYYY-MM) that have actuals.
export function periodMonths(kind, end, actuals, start) {
  const all = Object.keys(actuals ?? {}).filter((m) => m <= end && (!start || m >= start)).sort();
  if (kind === "month") return all.filter((m) => m === end);
  if (kind === "quarter") { const q = Math.floor((Number(end.slice(5)) - 1) / 3) * 3 + 1; const qs = `${end.slice(0, 4)}-${String(q).padStart(2, "0")}`; return all.filter((m) => m >= qs); }
  if (kind === "ytd") return all.filter((m) => m.slice(0, 4) === end.slice(0, 4));
  return all;
}
export const periodKey = (kind, end) => `${kind}:${end}`;
export function flagFor(variance, base, thresholdPct = 5) {
  if (!isFinite(variance) || !base) return "";
  const pct = (variance / Math.abs(base)) * 100;
  if (pct >= -thresholdPct) return "";
  return pct < -2 * thresholdPct ? "red" : "amber";
}
// Plan (revision 1's budget) vs current budget vs actual, by line.
export function varianceReport(bp, { kind = "ytd", end, sf = 0 } = {}) {
  const revs = bp?.revisions ?? [];
  const plan = revs[0]?.budget, current = revs[revs.length - 1]?.budget;
  const months = periodMonths(kind, end, bp?.actuals, plan?.start);
  const sum = (getter) => {
    const out = Object.fromEntries(LINES.map(([k]) => [k, 0]));
    let any = false;
    for (const m of months) { const l = getter(m); if (!l) continue; any = true; for (const [k] of LINES) out[k] += l[k] ?? 0; }
    return any ? out : null;
  };
  const P = sum((m) => budgetMonth(plan, m)), C = sum((m) => budgetMonth(current, m)), A = sum((m) => bp.actuals[m]);
  const t = bp?.thresholdPct ?? 5;
  const rows = LINES.map(([k, label, kind2]) => {
    const hasActual = A && !["capital", "debtService", "cashFlow"].includes(k);
    const a = hasActual ? r2(A[k]) : null, c = C ? r2(C[k]) : null, p = P ? r2(P[k]) : null;
    const v = a != null && c != null ? r2(a - c) : null;
    return { key: k, label, kind: kind2, plan: p, current: c, actual: a, variance: v, variancePct: v != null && c ? (v / Math.abs(c)) * 100 : null, vsPlan: a != null && p != null ? r2(a - p) : null, actualPSF: a != null && sf ? a / sf : null, budgetPSF: c != null && sf ? c / sf : null, flag: v != null ? flagFor(v, c, t) : "", comment: bp?.comments?.[`${periodKey(kind, end)}|${k}`] ?? "" };
  });
  return { months, rows, from: months[0] ?? null, to: months[months.length - 1] ?? null, planLabel: plan?.label, currentLabel: current?.label, currentRevision: revs.length };
}
// Fund roll-up: NOI plan / budget / actual by asset for the period.
export function fundVariance(deals, { kind = "ytd", end } = {}) {
  // Assets with a plan, or with actuals but no plan yet (actual only, "no plan").
  const rows = deals.filter((d) => d.inputs.businessPlan?.revisions?.length || Object.keys(d.inputs.businessPlan?.actuals ?? {}).length).map((d) => {
    const v = varianceReport(d.inputs.businessPlan, { kind, end, sf: d.inputs.squareFootage });
    const noi = v.rows.find((r) => r.key === "noi");
    return { dealId: d.id, asset: d.inputs.propertyName, months: v.months.length, noPlan: !d.inputs.businessPlan?.revisions?.length, plan: noi.plan, current: noi.current, actual: noi.actual, variance: noi.variance, variancePct: noi.variancePct, flag: noi.flag };
  });
  const tot = (k, xs = rows) => xs.reduce((s, r) => s + (r[k] ?? 0), 0);
  const both = rows.filter((r) => r.actual != null && r.current != null);
  const cur = tot("current", both), act = tot("actual", both);
  return { rows, total: { plan: tot("plan"), current: tot("current"), actual: rows.some((r) => r.actual != null) ? tot("actual") : null, variance: both.length ? act - cur : null, variancePct: both.length && cur ? ((act - cur) / Math.abs(cur)) * 100 : null, comparedAssets: both.length } };
}

// ── The plan ──
const today = () => new Date().toISOString().slice(0, 10);
function walt(units, asOf) {
  const occ = (units ?? []).filter((u) => u.leaseStatus === "occupied" && u.leaseEnd);
  const sf = occ.reduce((s, u) => s + (u.squareFeet || 0), 0);
  return sf ? occ.reduce((s, u) => s + (u.squareFeet || 0) * Math.max(0, (Date.parse(u.leaseEnd) - Date.parse(asOf)) / (365.25 * 86400000)), 0) / sf : 0;
}
export function assetKpis(inputs, asOf = today()) {
  const units = unitsToday(inputs, asOf); // 1.1.25: each unit on its lease in effect on the date
  const sf = units.reduce((s, u) => s + (u.squareFeet || 0), 0) || inputs.squareFootage || 0;
  const occ = units.filter((u) => u.leaseStatus === "occupied");
  const occSf = occ.reduce((s, u) => s + (u.squareFeet || 0), 0);
  return {
    occupancy: units.length && sf ? (occSf / sf) * 100 : NaN,
    rentPSF: occSf ? occ.reduce((s, u) => s + (u.currentRentPSF || 0) * (u.squareFeet || 0), 0) / occSf : NaN,
    walt: walt(units, asOf),
  };
}
// Revision 1, seeded from the IC memo and the closing model.
export function seedPlan(inputs, { asOf = inputs.acquisitionDate || today(), results = null } = {}) {
  const r = results ?? underwrite(inputs);
  const ic = inputs.icApproved ?? {};
  const hold = inputs.holdPeriodYears ?? r.annualCashFlows.length;
  const exitYear = (Number(String(inputs.acquisitionDate || asOf).slice(0, 4)) || 2026) + hold;
  const k = assetKpis(inputs, asOf);
  const horizon = `${exitYear}-12-31`;
  const leasing = (inputs.units ?? []).map((u) => {
    const vacant = u.leaseStatus !== "occupied";
    const rolls = !vacant && u.leaseEnd && u.leaseEnd <= horizon;
    return { unitId: u.id, unit: u.name, tenant: u.tenantName || "", sf: u.squareFeet || 0, leaseEnd: u.leaseEnd || "", action: vacant ? "Lease up" : rolls ? ((u.renewalProbabilityPct ?? 0) >= 50 ? "Renew" : "Re-tenant") : "Hold", targetRentPSF: r2((u.currentRentPSF || inputs.rentPerSF || 0) * (vacant ? 1 : 1.03)), downtimeMonths: vacant || ((u.renewalProbabilityPct ?? 0) < 50 && rolls) ? (u.downtimeBetweenLeases ?? inputs.downtimeBetweenLeases ?? 3) : 0, tiPSF: vacant || rolls ? ((u.renewalProbabilityPct ?? 0) >= 50 && !vacant ? u.tiRenewalPSF ?? 0 : u.tiNewPSF ?? inputs.tiPerSFNew ?? 0) : 0, note: "" };
  });
  const milestones = leasing.filter((l) => l.action !== "Hold").map((l, i) => ({ id: `m${i + 1}`, label: `${l.action === "Lease up" ? "Lease" : l.action} unit ${l.unit}${l.tenant ? ` (${l.tenant})` : ""}`, due: l.action === "Lease up" ? addMonthsISO(asOf, 6) : addMonthsISO(l.leaseEnd, -3), owner: "", status: "open" }));
  if (inputs.capexBudget) milestones.push({ id: `m${milestones.length + 1}`, label: "Complete the capital plan", due: addMonthsISO(asOf, 18), owner: "", status: "open" });
  milestones.push({ id: `m${milestones.length + 1}`, label: "Annual business plan review", due: addMonthsISO(asOf, 12), owner: "", status: "open" });
  return {
    thesis: ic.thesis || "",
    strategy: ic.strategy || "",
    leasing,
    capital: inputs.capexBudget ? [{ id: "c1", project: "Capital plan (underwriting)", scope: "", budget: inputs.capexBudget, start: asOf, end: addMonthsISO(asOf, 18), spent: 0, expectedReturn: "" }] : [],
    operating: { expenseTargets: "", recoveries: "", management: "", taxAppeal: "", insurance: "" },
    financing: { loan: inputs.loanAmountActual || r.debt?.loanAmount || 0, rate: inputs.floatingRate ? `SOFR + ${inputs.spreadPct ?? 0}%` : `${inputs.interestRatePct ?? 0}%`, maturityYears: inputs.loanTermYears ?? null, lender: inputs.lenderName || "", plan: "" },
    exit: { holdYears: hold, exitCapRatePct: inputs.exitCapRatePct ?? null, targetExit: `${exitYear}`, triggers: "" },
    milestones,
    kpis: [
      { key: "noi", label: "NOI (year 1)", target: r2(r.annualCashFlows[0]?.noi ?? 0), unit: "$" },
      { key: "occupancy", label: "Occupancy", target: isFinite(k.occupancy) ? r2(Math.max(k.occupancy, 95)) : 95, unit: "%" },
      { key: "rentPSF", label: "Average rent per SF", target: isFinite(k.rentPSF) ? r2(k.rentPSF) : 0, unit: "$/SF" },
      { key: "walt", label: "WALT", target: r2(k.walt), unit: "yrs" },
      { key: "capex", label: "Capex spent vs budget", target: inputs.capexBudget || 0, unit: "$" },
      { key: "irr", label: "Asset IRR (underwritten)", target: r2(r.returns?.irr ?? 0), unit: "%" },
    ],
    risks: [],
    recommendation: "Hold",
  };
}
function addMonthsISO(iso, k) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
// What the model looked like at a revision (to spot later changes).
export function modelFingerprint(inputs) {
  return {
    units: (inputs.units ?? []).map((u) => `${u.name}|${u.tenantName || ""}|${u.leaseStatus}|${u.currentRentPSF}|${u.leaseEnd || ""}`).sort().join(";"),
    loan: `${inputs.loanAmountActual ?? ""}|${inputs.ltvPct}|${inputs.interestRatePct}|${inputs.spreadPct}|${inputs.loanTermYears}|${inputs.lenderName ?? ""}`,
    exit: `${inputs.holdPeriodYears}|${inputs.exitCapRatePct}`,
    capex: `${inputs.capexBudget ?? 0}`,
  };
}
const FP_LABEL = { units: "Rent roll or leases", loan: "Loan", exit: "Hold or exit cap", capex: "Capex budget" };
export function modelChanges(prev, cur) {
  if (!prev) return [];
  return Object.keys(FP_LABEL).filter((k) => prev[k] !== cur[k]).map((k) => FP_LABEL[k]);
}
// Flattened differences between two plans (and budgets).
export function diffPlans(a, b) {
  const out = [];
  const flat = (o, p = "", acc = {}) => {
    if (Array.isArray(o)) o.forEach((x, i) => flat(x, `${p}[${x?.id ?? x?.unitId ?? x?.key ?? i}]`, acc));
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, acc);
    else acc[p] = o;
    return acc;
  };
  const A = flat(a?.plan ?? {}), B = flat(b?.plan ?? {});
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (String(A[k] ?? "") !== String(B[k] ?? "")) out.push({ field: k, from: A[k] ?? "", to: B[k] ?? "" });
  if ((a?.budget?.label ?? "") !== (b?.budget?.label ?? "")) out.push({ field: "budget", from: a?.budget?.label ?? "", to: b?.budget?.label ?? "" });
  return out;
}
// Create revision 1 or add the next revision (never edits an earlier one).
export function addRevision(bp, { plan, budget, inputs, by = "", at = new Date().toISOString(), note = "", reason = "" }) {
  const revs = bp?.revisions ?? [];
  const prev = revs[revs.length - 1];
  const rev = { n: revs.length + 1, at, by, note, reason: reason || (revs.length ? "Plan edit" : "Closing"), plan: structuredClone(plan), budget: structuredClone(budget ?? prev?.budget ?? null), model: modelFingerprint(inputs) };
  rev.changes = prev ? diffPlans(prev, rev) : [];
  return { thresholdPct: 5, actuals: {}, comments: {}, ...bp, revisions: [...revs, rev] };
}
export function milestoneStatus(m, asOf = today()) {
  if (m.status === "done") return "done";
  return m.due && m.due < asOf ? "late" : m.due && m.due <= addMonthsISO(asOf, 1) ? "due" : "open";
}
// KPI actuals vs target.
export function kpiActuals(inputs, asOf = today()) {
  const bp = inputs.businessPlan;
  const k = assetKpis(inputs, asOf);
  const months = Object.keys(bp?.actuals ?? {}).sort().slice(-12);
  const noi = months.length ? (months.reduce((s, m) => s + (bp.actuals[m].noi ?? 0), 0) * 12) / months.length : NaN;
  const cur = bp?.revisions?.[bp.revisions.length - 1]?.plan;
  const capex = (cur?.capital ?? []).reduce((s, c) => s + (Number(c.spent) || 0), 0);
  return { noi, occupancy: k.occupancy, rentPSF: k.rentPSF, walt: k.walt, capex, irr: NaN, noiMonths: months.length };
}
// Milestones as critical dates (Leases → Critical dates).
export function planDates(deals, asOf = today()) {
  return deals.flatMap((d) => {
    const revs = d.inputs.businessPlan?.revisions;
    const cur = revs?.[revs.length - 1]?.plan;
    return (cur?.milestones ?? []).filter((m) => m.due && m.status !== "done").map((m) => ({ date: m.due, kind: "milestone", label: m.label, asset: d.inputs.propertyName, dealId: d.id, status: milestoneStatus(m, asOf), owner: m.owner }));
  });
}

// ── Exports ──
export function budgetRows(bp) {
  const rev = bp.revisions[bp.revisions.length - 1];
  const head = ["Line", ...rev.budget.years.map((y) => `Year ${y.year}`)];
  return [head, ...LINES.map(([k, l]) => [l, ...rev.budget.years.map((y) => Math.round(y.lines[k]))]), [], ["Milestone", "Due", "Owner", "Status"], ...(rev.plan.milestones ?? []).map((m) => [m.label, m.due, m.owner, milestoneStatus(m)])];
}
export function varianceRows(rep) {
  return [["Line", "Plan (rev. 1)", "Current budget", "Actual", "Variance", "Variance %", "Actual $/SF", "Flag", "Comment"],
    ...rep.rows.map((r) => [r.label, r.plan ?? "", r.current ?? "", r.actual ?? "", r.variance ?? "", r.variancePct != null ? r2(r.variancePct) : "", r.actualPSF != null ? r2(r.actualPSF) : "", r.flag, r.comment])];
}
