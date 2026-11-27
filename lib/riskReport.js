// ─── Phase L: risk report (internal only) ────────────────────────────────────
// Sections built from the app's own data for a fund at a date. Concentration
// limits default to the
// plan's examples and can be changed per fund (terms.riskLimits).
//
//   leasing       expirations by year (% of SF and rent), 12-month rollover,
//                 vacancy, by asset and fund
//   tenants       largest tenants by rent across the fund
//   industry      SIC 2-digit groups: share of rent per asset and for the fund
//   debt          per loan: balance, rate, maturity, DSCR, cap and its expiry
//   lenders       debt by lender: balance, share, loans, assets, spread,
//                 maturities; HHI
//   caps          caps in force by counterparty: notional, strike, expiry,
//                 market value (the exposure if it failed); HHI; missing
//   geography     state and metro (city): share of value, NOI, SF, assets
//   valuation     marks vs. cost, implied cap vs. exit cap
//   environmental Phase I / II, RECs, remediation, NFA, flood zone, wildfire,
//                 heat, per asset (inputs.envRisk), open items
//   execution     underwriting gaps (phase J), budget variances (phase I),
//                 fund plan gap (phase K)
//   watch         assets ranked by a risk score, with the reasons

import { addMonthsISO } from "@/lib/leases";
import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears } from "@/lib/fundTimeline";
import { marketCapCost } from "@/lib/capPricer";
import { sicTitle } from "@/lib/sicCodes";
import { fundRows } from "@/lib/uwActual";
import { varianceReport } from "@/lib/businessPlan";
import { checkLimits, limitInputs } from "@/lib/fundLimits";
import { COLORS as TI_COLORS, tiCoverage } from "@/lib/tiFunding";
import { applyStress } from "@/lib/stress";
import { insuranceGaps, lenderInsuranceGaps } from "@/lib/dealDocApply";
import { riskFlags as leaseRiskFlags } from "@/lib/leaseViews";
import { agedRent } from "@/lib/agedRent";
import { creditRows } from "@/lib/creditReview";
import { vacantUnits } from "@/lib/home";
import { unitsToday } from "@/lib/leaseHistory";
import { notSold } from "@/lib/assetStatus";

export const DEFAULT_RISK_LIMITS = {
  industryAssetPct: 40, // no industry above 40% of an asset's rent
  industryFundPct: 20, // … or 20% of fund rent
  lenderPct: 35, // no lender over 35% of fund debt
  capProviderPct: 50, // no counterparty over 50% of capped notional
  statePct: 30, // no more than 30% of value in one state
  metroPct: 25, // … or 25% in one metro
  tenantFundPct: 10, // no tenant over 10% of fund rent
};
// "Risks first" thresholds (user, 11/26, 1.1.8), per portfolio as
// terms.riskThresholds. Amber at the threshold, red at the stated harsher level.
export const DEFAULT_RISK_THRESHOLDS = {
  vacancyDays: 180, // a unit vacant this long (red at 1.5×)
  rolloverPct: 30, // an asset's rent expiring within 12 months (red at 45%)
  largeTenantPct: 10, // a tenant this share of an asset's rent …
  largeTenantMonths: 18, // … expiring within this many months with no renewal in the pipeline (red within 6)
  noticeDays: 90, // a renewal notice deadline within this many days (red within 30)
  fundCliffPct: 25, // any one year's expirations as a share of fund rent (red at 35%)
  maturityMonths: 18, // a loan maturing within (red within 6)
  dscrCushion: 0.1, // DSCR within this of its test (amber); below the test (red)
  capExpiryMonths: 12, // a rate cap expiring within
  ltvMaxPct: 75, // LTV above (red), within 5 pts (amber)
  debtYieldMinPct: 8, // debt yield below (red)
  markBelowCostPct: 5, // a mark this far below cost (red at 10%)
  nearLimitPct: 90, // "near limit": at this share of a limit or more
};
export const RISK_THRESHOLD_LABELS = {
  vacancyDays: "Vacant unit, days", rolloverPct: "Asset rollover in 12 months, % of rent", largeTenantPct: "Large tenant, % of asset rent", largeTenantMonths: "Large tenant expiring within, months",
  noticeDays: "Renewal notice deadline within, days", fundCliffPct: "Fund rollover cliff, % of rent in a year", maturityMonths: "Loan maturity within, months", dscrCushion: "DSCR cushion over its test, x",
  capExpiryMonths: "Rate cap expiring within, months", ltvMaxPct: "LTV limit, %", debtYieldMinPct: "Debt yield minimum, %", markBelowCostPct: "Mark below cost, %", nearLimitPct: "Near limit, % of a limit",
};
// Standard shocks for the risk report (Stress Testing has the sliders).
const NO_SHOCK = { vacancyDelta: 0, rentEscDelta: 0, rateDelta: 0, exitCapDelta: 0, opexDelta: 0, constructionDelta: 0 };
export const SHOCKS = [
  ["rent", "Rent growth −3 pts", { rentEscDelta: 3 }],
  ["vacancy", "Vacancy +10 pts", { vacancyDelta: 10 }],
  ["exitCap", "Exit cap +75 bps", { exitCapDelta: 0.75 }],
  ["rate", "Rates +200 bps", { rateDelta: 200 }],
  ["combined", "All four together", { rentEscDelta: 3, vacancyDelta: 10, exitCapDelta: 0.75, rateDelta: 200 }],
];
export const ENV_FIELDS = [
  ["phase1Date", "Phase I ESA date", "date"],
  ["recs", "Recognized environmental conditions", "text"],
  ["phase2", "Phase II / remediation", "text"],
  ["nfa", "No-further-action letter", "bool"],
  ["hazmatTenants", "Tenants using hazardous materials", "text"],
  ["floodZone", "FEMA flood zone", "text"],
  ["wildfire", "Wildfire exposure", "level"],
  ["heat", "Extreme heat exposure", "level"],
  ["notes", "Notes", "text"],
];
export const LEVELS = ["", "low", "moderate", "high"];

const sum = (xs) => xs.reduce((s, x) => s + (Number(x) || 0), 0);
const rentOf = (u) => (u.leaseStatus === "occupied" ? (Number(u.currentRentPSF) || 0) * (Number(u.squareFeet) || 0) : 0);
const hhi = (shares) => Math.round(sum(shares.map((p) => p * p))); // shares in %
const monthsBetween = (a, b) => {
  const x = new Date(`${a}T00:00:00Z`), y = new Date(`${b}T00:00:00Z`);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth()) + (y.getUTCDate() - x.getUTCDate()) / 30;
};
const fmtShort = (n) => `${n < 0 ? "−" : ""}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
const holdYearAt = (acq, iso) => { let t = 1; while (addYears(acq, t) <= iso && t < 50) t++; return t; };

function group(rows, key, weights) {
  const g = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const cur = g.get(k) ?? { key: k, items: [] , ...Object.fromEntries(Object.keys(weights).map((w) => [w, 0])) };
    for (const [w, f] of Object.entries(weights)) cur[w] += Number(f(r)) || 0;
    cur.items.push(r);
    g.set(k, cur);
  }
  return [...g.values()];
}

export function riskReport(deals0, terms, { asOf, values = {}, curve, planGap = null, lineBalance = 0, tiAsOf = null, docs = null, tiActions = null } = {}) {
  const deals = notSold(deals0, asOf); // 1.1.26: assets sold by the report date are not in it
  const lim = { ...DEFAULT_RISK_LIMITS, ...(terms.riskLimits ?? {}) };
  const th = { ...DEFAULT_RISK_THRESHOLDS, ...(terms.riskThresholds ?? {}) };
  const flags = []; // { assetId, asset, section, text, weight }
  const flag = (a, section, text, weight = 1) => flags.push({ assetId: a?.id ?? null, asset: a?.name ?? "Fund", section, text, weight });

  const assets = deals.map((d) => {
    const inp = d.inputs ?? {};
    let r = null;
    try { r = underwrite(inp); } catch { r = null; }
    const acq = acquisitionDate(d, terms);
    const cost = (Number(inp.purchasePrice) || 0) + (Number(inp.capexBudget) || 0);
    const value = Number(values[d.id]) > 0 ? Number(values[d.id]) : cost;
    const t = holdYearAt(acq, asOf);
    const cf = r?.annualCashFlows?.[Math.min(t, r.annualCashFlows.length) - 1];
    return { id: d.id, name: inp.propertyName || d.id, inp, r, acq, cost, value, t, cf, units: unitsToday(inp, asOf).filter((u) => (Number(u.squareFeet) || 0) > 0) }; // 1.1.25: each unit on its lease in effect on the report date
  });

  // ── Leasing ──
  const yr0 = Number(asOf.slice(0, 4));
  const years = Array.from({ length: 6 }, (_, i) => yr0 + i);
  const leasingRow = (units) => {
    const sf = sum(units.map((u) => u.squareFeet)), rent = sum(units.map(rentOf));
    const by = years.map((y) => {
      const us = units.filter((u) => u.leaseStatus === "occupied" && u.leaseEnd && Number(u.leaseEnd.slice(0, 4)) === y);
      return { year: y, sfPct: sf ? (sum(us.map((u) => u.squareFeet)) / sf) * 100 : 0, rentPct: rent ? (sum(us.map(rentOf)) / rent) * 100 : 0 };
    });
    const in12 = addYears(asOf, 1);
    const roll = units.filter((u) => u.leaseStatus === "occupied" && u.leaseEnd && u.leaseEnd <= in12);
    const vac = units.filter((u) => u.leaseStatus !== "occupied");
    return { sf, rent, by, rollover12RentPct: rent ? (sum(roll.map(rentOf)) / rent) * 100 : 0, vacancyPct: sf ? (sum(vac.map((u) => u.squareFeet)) / sf) * 100 : 0 };
  };
  const leasing = { years, assets: assets.map((a) => ({ id: a.id, name: a.name, ...leasingRow(a.units) })), fund: leasingRow(assets.flatMap((a) => a.units)) };
  for (const a of leasing.assets) {
    if (a.rollover12RentPct >= 30) flag(a, "Leasing", `${a.rollover12RentPct.toFixed(0)}% of rent expires within 12 months`, 2);
    if (a.vacancyPct >= 15) flag(a, "Leasing", `${a.vacancyPct.toFixed(0)}% vacant`, 1);
  }

  // ── Tenants ──
  const tmap = new Map();
  for (const a of assets) for (const u of a.units) {
    const n = (u.tenantName ?? "").trim();
    if (!n || u.leaseStatus !== "occupied") continue;
    const cur = tmap.get(n) ?? { tenant: n, rent: 0, sf: 0, assets: new Set(), leaseEnd: "", sic: u.sicCode ?? "" };
    cur.rent += rentOf(u); cur.sf += Number(u.squareFeet) || 0; cur.assets.add(a.name);
    if (u.leaseEnd && (!cur.leaseEnd || u.leaseEnd < cur.leaseEnd)) cur.leaseEnd = u.leaseEnd;
    tmap.set(n, cur);
  }
  const fundRent = leasing.fund.rent;
  const tenants = [...tmap.values()].map((x) => ({ ...x, assets: [...x.assets], pct: fundRent ? (x.rent / fundRent) * 100 : 0 })).sort((x, y) => y.rent - x.rent).slice(0, 10);
  for (const x of tenants) if (x.pct > lim.tenantFundPct) flag(null, "Tenants", `${x.tenant} is ${x.pct.toFixed(1)}% of fund rent (limit ${lim.tenantFundPct}%)`, 2);

  // ── Industry (SIC 2-digit) ──
  const sic2 = (u) => (String(u.sicCode ?? "").trim().slice(0, 2) || "");
  const ind = (units) => {
    const rent = sum(units.map(rentOf));
    return group(units.filter((u) => u.leaseStatus === "occupied"), sic2, { rent: rentOf, sf: (u) => u.squareFeet })
      .map((g) => ({ code: g.key, title: sicTitle(g.items[0]?.sicCode) ? `${g.key} · ${sicTitle(g.items[0].sicCode)}` : g.key, rentPct: rent ? (g.rent / rent) * 100 : 0, sf: g.sf }))
      .sort((x, y) => y.rentPct - x.rentPct);
  };
  const industry = { fund: ind(assets.flatMap((a) => a.units)), assets: assets.map((a) => ({ id: a.id, name: a.name, groups: ind(a.units) })), limits: { asset: lim.industryAssetPct, fund: lim.industryFundPct } };
  for (const g of industry.fund) if (g.rentPct > lim.industryFundPct) flag(null, "Industry", `SIC ${g.code} is ${g.rentPct.toFixed(1)}% of fund rent (limit ${lim.industryFundPct}%)`, 2);
  for (const a of industry.assets) { const top = a.groups[0]; if (top && top.rentPct > lim.industryAssetPct) flag(a, "Industry", `SIC ${top.code} is ${top.rentPct.toFixed(0)}% of the asset's rent (limit ${lim.industryAssetPct}%)`, 1); }
  const unclassified = sum(assets.flatMap((a) => a.units.filter((u) => u.leaseStatus === "occupied" && !sic2(u)).map(rentOf)));
  industry.unclassifiedPct = fundRent ? (unclassified / fundRent) * 100 : 0;

  // ── Debt, lenders and caps ──
  const debt = assets.map((a) => {
    const inp = a.inp;
    // 1.1.12 (code review): the balance at the report date, not the original
    // loan (amortization and paydowns), for LTV, debt yield and lender shares.
    const originalLoan = a.r?.debt?.loanAmount ?? 0;
    const prevBal = a.t > 1 ? a.r?.annualCashFlows?.[a.t - 2]?.loanBalance : null;
    const loan = prevBal != null && isFinite(prevBal) && prevBal >= 0 ? prevBal : originalLoan;
    const maturity = inp.loanTermYears ? addYears(a.acq, Number(inp.loanTermYears)) : "";
    const dscr = a.cf && a.cf.debtService ? a.cf.noi / a.cf.debtService : null;
    const minDscr = Number(inp.minDscr) || 1.25;
    // 1.1.12 (code review): a cap only matters on a floating-rate loan hedged
    // with one. Fixed-rate and swapped loans aren't "floating with no cap",
    // and a strike left on a fixed loan isn't a cap.
    const floating = !!inp.floatingRate;
    const hasStrike = (Number(inp.capStrikeRatePct) || 0) > 0 || (inp.capStrikeRatesByYear ?? []).some((x) => x > 0);
    const swapped = floating && inp.hedgingType === "swap";
    const capped = floating && !swapped && hasStrike && (inp.hedgingType == null || inp.hedgingType === "cap");
    const unhedged = floating && !capped && !swapped && loan > 0;
    const rateType = !floating ? "Fixed" : swapped ? "Swapped" : capped ? "Capped" : "Floating, no cap";
    const allIn = (inp.capStrikeRatesByYear ?? [])[a.t - 1] ?? inp.capStrikeRatePct ?? 0;
    const strike = capped ? Math.max(0, allIn - (Number(inp.spreadPct) || 0)) : 0;
    const capTerm = Number(inp.capTermYears) || 1;
    const capStart = addYears(a.acq, Math.floor((a.t - 1) / capTerm) * capTerm);
    const capEnd = addYears(capStart, capTerm);
    const provider = capped ? ((inp.capProviders ?? {})[String(Math.floor((a.t - 1) / capTerm) * capTerm + 1)] ?? (inp.capProviders ?? {})["1"] ?? "") : "";
    let capValue = null;
    if (capped && loan > 0) {
      try { capValue = marketCapCost({ notional: loan, strikePct: strike, dateISO: asOf, months: Math.max(1, Math.round(monthsBetween(asOf, capEnd))), curve, valuationISO: asOf }); } catch { capValue = null; }
    }
    const row = { id: a.id, name: a.name, loan, lender: inp.lenderName || "", spreadPct: Number(inp.spreadPct) || 0, maturity, dscr, minDscr, capped, unhedged, rateType, originalLoan, strike, capEnd, provider, capValue, ltv: a.value > 0 ? (loan / a.value) * 100 : null };
    if (maturity && monthsBetween(asOf, maturity) <= 18) flag(a, "Debt", `loan matures ${maturity}`, monthsBetween(asOf, maturity) <= 6 ? 3 : 2);
    if (dscr != null && dscr < minDscr) flag(a, "Debt", `DSCR ${dscr.toFixed(2)}x below the ${minDscr.toFixed(2)}x test`, 3);
    else if (dscr != null && dscr < minDscr + 0.1) flag(a, "Debt", `DSCR ${dscr.toFixed(2)}x within 0.10x of the ${minDscr.toFixed(2)}x test`, 1);
    if (unhedged) flag(a, "Debt", "floating-rate loan with no cap", 2);
    if (capped && monthsBetween(asOf, capEnd) <= 12) flag(a, "Debt", `rate cap expires ${capEnd}`, 1);
    return row;
  });
  const totalDebt = sum(debt.map((d) => d.loan));
  const lenders = group(debt.filter((d) => d.loan > 0), (d) => d.lender || "(no lender entered)", { balance: (d) => d.loan, spreadW: (d) => d.loan * d.spreadPct })
    .map((g) => ({ lender: g.key, balance: g.balance, pct: totalDebt ? (g.balance / totalDebt) * 100 : 0, loans: g.items.length, assets: g.items.map((x) => x.name), spreadPct: g.balance ? g.spreadW / g.balance : 0, maturities: g.items.map((x) => x.maturity).filter(Boolean).sort() }))
    .sort((x, y) => y.balance - x.balance);
  for (const l of lenders) if (l.pct > lim.lenderPct) flag(null, "Lenders", `${l.lender} holds ${l.pct.toFixed(1)}% of fund debt (limit ${lim.lenderPct}%)`, 2);
  const capRows = debt.filter((d) => d.capped);
  const totalCapped = sum(capRows.map((d) => d.loan));
  const caps = {
    byProvider: group(capRows, (d) => d.provider || "(no provider entered)", { notional: (d) => d.loan, value: (d) => d.capValue ?? 0 })
      .map((g) => ({ provider: g.key, notional: g.notional, pct: totalCapped ? (g.notional / totalCapped) * 100 : 0, value: g.value, caps: g.items.length, assets: g.items.map((x) => x.name), expiries: g.items.map((x) => x.capEnd).sort() }))
      .sort((x, y) => y.notional - x.notional),
    missing: capRows.filter((d) => !d.provider).map((d) => d.name),
    uncapped: debt.filter((d) => d.unhedged).map((d) => d.name),
  };
  caps.hhi = hhi(caps.byProvider.map((p) => p.pct));
  for (const p of caps.byProvider) if (p.provider !== "(no provider entered)" && p.pct > lim.capProviderPct) flag(null, "Caps", `${p.provider} wrote ${p.pct.toFixed(1)}% of capped notional (limit ${lim.capProviderPct}%)`, 2);
  if (caps.missing.length) flag(null, "Caps", `no cap provider entered for ${caps.missing.join(", ")}`, 1);

  // ── Geography ──
  const totalValue = sum(assets.map((a) => a.value));
  const noiOf = (a) => a.cf?.noi ?? 0;
  const geo = (key) => group(assets, key, { value: (a) => a.value, noi: noiOf, sf: (a) => a.inp.squareFootage })
    .map((g) => ({ name: g.key, valuePct: totalValue ? (g.value / totalValue) * 100 : 0, noiPct: sum(assets.map(noiOf)) ? (g.noi / sum(assets.map(noiOf))) * 100 : 0, sf: g.sf, assets: g.items.length }))
    .sort((x, y) => y.valuePct - x.valuePct);
  const geography = { states: geo((a) => a.inp.state), metros: geo((a) => (a.inp.city ? `${a.inp.city}, ${a.inp.state ?? ""}`.trim() : "")) };
  for (const s of geography.states) if (s.valuePct > lim.statePct) flag(null, "Geography", `${s.name} is ${s.valuePct.toFixed(1)}% of fund value (limit ${lim.statePct}%)`, 2);
  for (const s of geography.metros) if (s.valuePct > lim.metroPct) flag(null, "Geography", `${s.name} is ${s.valuePct.toFixed(1)}% of fund value (limit ${lim.metroPct}%)`, 1);

  // ── Valuation ──
  const valuation = assets.map((a) => {
    const fwd = a.r?.annualCashFlows?.[Math.min(a.t, a.r.annualCashFlows.length - 1)]?.noi ?? null;
    const implied = a.value > 0 && fwd != null ? (fwd / a.value) * 100 : null;
    const row = { id: a.id, name: a.name, cost: a.cost, value: a.value, unrealizedPct: a.cost ? ((a.value - a.cost) / a.cost) * 100 : null, impliedCap: implied, exitCap: Number(a.inp.exitCapRatePct) || null };
    if (row.unrealizedPct != null && row.unrealizedPct < -5) flag(a, "Valuation", `marked ${row.unrealizedPct.toFixed(1)}% below cost`, 2);
    return row;
  });

  // ── Environmental and climate ──
  const environmental = assets.map((a) => {
    const e = a.inp.envRisk ?? {};
    const open = [];
    if (!e.phase1Date) open.push("no Phase I ESA on file");
    else if (monthsBetween(e.phase1Date, asOf) > 60) open.push("Phase I ESA over 5 years old");
    if (e.recs && !e.nfa) open.push("RECs without a no-further-action letter");
    if (/^(A|V)/i.test(String(e.floodZone ?? "").trim())) open.push(`flood zone ${e.floodZone}`);
    if (e.wildfire === "high") open.push("high wildfire exposure");
    if (e.heat === "high") open.push("high extreme-heat exposure");
    // Not flagged or shown (user, 11/25, 1.1.5: not critical); kept for reference.
    return { id: a.id, name: a.name, ...e, open };
  });

  // ── Execution ──
  const uw = fundRows(deals.map((d) => ({ id: d.id, inputs: d.inputs })), asOf);
  for (const x of uw) if (isFinite(x.gap) && x.gap < -1) flag({ id: x.id, name: x.name }, "Execution", `IRR ${x.gap.toFixed(1)} pts behind underwriting`, x.gap < -3 ? 3 : 2);
  const budget = [];
  for (const a of assets) {
    const bp = a.inp.businessPlan;
    if (!bp?.revisions?.length || !Object.keys(bp.actuals ?? {}).length) continue;
    try {
      const rep = varianceReport(bp, { kind: "ytd", end: asOf.slice(0, 7), sf: a.inp.squareFootage });
      const red = rep.rows.filter((r2) => r2.flag === "red");
      if (red.length) { budget.push({ id: a.id, name: a.name, lines: red.map((r2) => r2.label) }); flag(a, "Execution", `${red.length} budget line${red.length > 1 ? "s" : ""} over the variance threshold`, 1); }
    } catch { /* skip */ }
  }
  const execution = { uw, budget, planGap };

  // ── Insurance and lease risk flags (documents in the database; null = not
  // loaded, e.g. signed out) ──
  let insurance = null, leaseFlags = null;
  if (docs) {
    const ids = new Set(assets.map((a) => a.id));
    const nameOf = (id) => assets.find((a) => a.id === id)?.name ?? id;
    const leases = (docs.leases ?? []).filter((l) => ids.has(l.deal_id));
    const certs = (docs.dealDocs ?? []).filter((d) => d.doc_type === "insurance_cert" && ids.has(d.deal_id));
    const loans = (docs.dealDocs ?? []).filter((d) => d.doc_type === "loan" && ids.has(d.deal_id));
    insurance = assets.map((a) => {
      const own = certs.filter((c) => c.deal_id === a.id && !c.lease_id);
      const ten = certs.filter((c) => c.deal_id === a.id && c.lease_id);
      const gaps = [];
      if (!own.length) gaps.push({ severity: "medium", text: "No owner's insurance certificate on file" });
      for (const c of [...own, ...ten]) {
        const lease = c.lease_id ? leases.find((l) => l.id === c.lease_id) : null;
        for (const g of insuranceGaps(c.abstract ?? {}, { leaseAbs: lease?.abstract ?? null, asOf })) gaps.push({ ...g, text: `${lease ? `${lease.tenant}: ` : ""}${g.text}` });
      }
      // The lender's insurance requirements (loan agreement abstract) vs. the owner's certificate.
      const loanDoc = loans.filter((d) => d.deal_id === a.id && d.abstract).at(-1);
      if (loanDoc) {
        const best = own.filter((c) => c.abstract).at(-1);
        const lg = best ? lenderInsuranceGaps(best.abstract, loanDoc.abstract) : lenderInsuranceGaps({ policies: [] }, loanDoc.abstract);
        for (const g of best ? lg : lg.filter((x) => x.severity === "high").slice(0, 1).map((x) => ({ ...x, text: "No owner's certificate to check against the loan's insurance requirements" }))) gaps.push({ ...g, text: `Lender: ${g.text}` });
      }
      const missing = leases.filter((l) => l.deal_id === a.id && !ten.some((c) => c.lease_id === l.id)).map((l) => l.tenant);
      if (missing.length) gaps.push({ severity: "medium", text: `No tenant certificate for ${missing.join(", ")}` });
      for (const g of gaps.filter((x) => x.severity === "high")) flag(a, "Insurance", g.text, 2);
      return { id: a.id, name: a.name, gaps, certificates: own.length + ten.length };
    });
    const lf = leaseRiskFlags(leases, { assetName: nameOf });
    leaseFlags = { rows: lf, byType: group(lf, (x) => x.typeLabel, { n: () => 1, high: (x) => (x.severity === "high" ? 1 : 0) }).map((g) => ({ type: g.key, n: g.n, high: g.high })) };
    for (const x of lf.filter((y) => y.severity === "high")) flag(assets.find((a) => a.name === x.asset) ?? null, "Lease risk", `${x.tenant}: ${x.title}`, 1);
  }

  // ── Stress tests: each asset under the standard shocks ──
  const stressRows = assets.map((a) => {
    const base = a.r?.returns?.irr ?? null;
    const minDscr = Number(a.inp.minDscr) || 1.25;
    const res = SHOCKS.map(([key, , f]) => {
      try {
        const s2 = underwrite(applyStress(a.inp, { ...NO_SHOCK, ...f }));
        const low = Math.min(...s2.annualCashFlows.filter((c) => c.debtService > 0).map((c) => c.noi / c.debtService));
        return { key, irr: s2.returns.irr, em: s2.returns.equityMultiple, minDscr: isFinite(low) ? low : null, breach: isFinite(low) && low < minDscr };
      } catch {
        return { key, irr: null, em: null, minDscr: null, breach: false };
      }
    });
    const comb = res.find((x) => x.key === "combined");
    if (comb?.breach) flag(a, "Stress", `DSCR falls to ${comb.minDscr.toFixed(2)}x (test ${minDscr.toFixed(2)}x) with all four shocks`, 2);
    return { id: a.id, name: a.name, equity: a.r?.debt?.equityRequired ?? 0, baseIrr: base, test: minDscr, results: res };
  });
  const eqTot = sum(stressRows.map((x) => x.equity));
  const wIrr = (pick) => (eqTot > 0 ? sum(stressRows.map((x) => (pick(x) ?? 0) * x.equity)) / eqTot : null);
  const stress = {
    shocks: SHOCKS.map(([k, l]) => ({ key: k, label: l })),
    assets: stressRows,
    fund: { baseIrr: wIrr((x) => x.baseIrr), byShock: SHOCKS.map(([k]) => ({ key: k, irr: wIrr((x) => x.results.find((y) => y.key === k)?.irr), breaches: stressRows.filter((x) => x.results.find((y) => y.key === k)?.breach).length })) },
  };

  // ── TI funding coverage (the next 8 quarters from tiAsOf, default asOf) ──
  let ti = null;
  try { ti = tiCoverage(deals, terms, { asOf: tiAsOf ?? asOf, curve, actions: tiActions ?? [] }); } catch { ti = null; }
  if (ti) {
    for (const a of ti.assets) {
      const fails = a.cells.filter((c) => c.testFailed);
      const calls = a.cells.filter((c) => c.call > 1);
      if (fails.length) flag({ id: a.id, name: a.name }, "TI funding", `fails its TI draw test in ${fails.map((c) => c.label).join(", ")}`, 2);
      if (calls.length) flag({ id: a.id, name: a.name }, "TI funding", `TI needs a capital call in ${calls.map((c) => c.label).join(", ")}`, 2);
    }
  }

  // ── Fund limits (LPA / PPM and internal) ──
  const fundLimits = checkLimits(terms, limitInputs(deals, { values, lineBalance, todayISO: asOf }));
  for (const l of fundLimits) if (l.status === "breached") flag(null, "Fund limits", `${l.label}: ${l.actual?.toFixed(1)} vs. limit ${l.limit}`, 3);

  // ── Risks first (user, 11/26, 1.1.8): only exceptions, worst first ──
  const owner = (a) => String(a.inp.leasingManager ?? "").trim() || String(a.inp.assetManager ?? "").trim() || String(terms.portfolioManager ?? "").trim();
  const lvl = (red) => (red ? "red" : "amber");
  const byLevel = (x, y) => (x.level === y.level ? 0 : x.level === "red" ? -1 : 1);
  // Leasing Risks
  const leasingRisks = [];
  const vu = (() => { try { return vacantUnits(deals, { todayISO: asOf }); } catch { return []; } })();
  for (const v of vu) if (v.daysVacant >= th.vacancyDays) leasingRisks.push({ assetId: v.dealId, asset: v.asset, risk: `Vacancy: unit ${v.unit || "?"} vacant ${v.daysVacant} days`, measure: `${v.daysVacant} d`, threshold: `${th.vacancyDays} d`, keyDate: "", owner: v.leasingManager || owner(assets.find((a) => a.id === v.dealId) ?? { inp: {} }), level: lvl(v.daysVacant >= th.vacancyDays * 1.5) });
  for (const la of leasing.assets) if (la.rollover12RentPct >= th.rolloverPct) { const a = assets.find((x) => x.id === la.id); leasingRisks.push({ assetId: la.id, asset: la.name, risk: "Rollover concentration", measure: `${la.rollover12RentPct.toFixed(0)}% of rent`, threshold: `${th.rolloverPct}% within 12 mo`, keyDate: "", owner: owner(a), level: lvl(la.rollover12RentPct >= 45) }); }
  for (const a of assets) {
    const rent = sum(a.units.map(rentOf));
    const renewals = (a.inp.leasing?.prospects ?? []).filter((p) => p.kind === "renewal" && !["lost"].includes(p.stage));
    for (const u of a.units.filter((x) => x.leaseStatus === "occupied" && x.leaseEnd)) {
      const share = rent ? (rentOf(u) / rent) * 100 : 0;
      const mo = monthsBetween(asOf, u.leaseEnd);
      if (share >= th.largeTenantPct && mo >= 0 && mo <= th.largeTenantMonths && !renewals.some((p) => p.unitId === u.id)) leasingRisks.push({ assetId: a.id, asset: a.name, risk: `Large tenant expiring, no renewal in the pipeline: ${u.tenantName || u.name} (${share.toFixed(0)}% of rent)`, measure: `${share.toFixed(0)}%`, threshold: `${th.largeTenantPct}%, ${th.largeTenantMonths} mo`, keyDate: u.leaseEnd, owner: owner(a), level: lvl(mo <= 6) });
      const nm = Number(u.renewalNoticeMonths);
      if (nm > 0) {
        const deadline = addMonthsISO(u.leaseEnd, -nm); // month-end safe
        const days = Math.round((Date.parse(deadline) - Date.parse(asOf)) / 864e5);
        if (days >= 0 && days <= th.noticeDays) leasingRisks.push({ assetId: a.id, asset: a.name, risk: `Renewal notice deadline: ${u.tenantName || u.name} (unit ${u.name || "?"})`, measure: `${days} days`, threshold: `${th.noticeDays} days`, keyDate: deadline, owner: owner(a), level: lvl(days <= 30) });
      }
    }
  }
  leasing.fund.by.forEach((b) => { if (b.rentPct >= th.fundCliffPct) leasingRisks.push({ assetId: null, asset: "Fund", risk: `Rollover cliff: ${b.year}`, measure: `${b.rentPct.toFixed(0)}% of rent`, threshold: `${th.fundCliffPct}%`, keyDate: String(b.year), owner: String(terms.portfolioManager ?? ""), level: lvl(b.rentPct >= 35) }); });
  leasingRisks.sort(byLevel);
  // Debt Risks
  const debtRisks = [];
  for (const d of debt) {
    const a = assets.find((x) => x.id === d.id);
    if (!(d.loan > 0)) continue;
    const push = (risk, measure, threshold, keyDate, red) => debtRisks.push({ assetId: d.id, asset: d.name, risk, measure, threshold, keyDate, owner: owner(a), level: lvl(red) });
    if (d.maturity) { const mo = monthsBetween(asOf, d.maturity); if (mo <= th.maturityMonths) push("Loan maturity", `${Math.max(0, mo).toFixed(0)} mo`, `${th.maturityMonths} mo`, d.maturity, mo <= 6); }
    if (d.dscr != null && d.dscr < d.minDscr) push("DSCR below its test", `${d.dscr.toFixed(2)}x`, `${d.minDscr.toFixed(2)}x`, "", true);
    else if (d.dscr != null && d.dscr < d.minDscr + th.dscrCushion) push("DSCR near its test", `${d.dscr.toFixed(2)}x`, `${d.minDscr.toFixed(2)}x + ${th.dscrCushion.toFixed(2)}`, "", false);
    if (d.unhedged) push("Floating rate with no cap", "no cap", "cap required", "", true);
    else if (d.capped && monthsBetween(asOf, d.capEnd) <= th.capExpiryMonths) push("Rate cap expires", `${Math.max(0, monthsBetween(asOf, d.capEnd)).toFixed(0)} mo`, `${th.capExpiryMonths} mo`, d.capEnd, false);
    if (d.ltv != null && d.ltv > th.ltvMaxPct) push("LTV above limit", `${d.ltv.toFixed(0)}%`, `${th.ltvMaxPct}%`, "", true);
    else if (d.ltv != null && d.ltv > th.ltvMaxPct - 5) push("LTV near limit", `${d.ltv.toFixed(0)}%`, `${th.ltvMaxPct}%`, "", false);
    const noi = a?.cf?.noi ?? null;
    if (noi != null) {
      const dy = (noi / d.loan) * 100;
      if (dy < th.debtYieldMinPct) push("Debt yield below minimum", `${dy.toFixed(1)}%`, `${th.debtYieldMinPct}%`, "", true);
      if (d.capped) {
        const ds = d.loan * ((d.strike + d.spreadPct) / 100); // interest at the cap strike
        const shock = ds > 0 ? noi / ds : null;
        if (shock != null && shock < d.minDscr) push("Rate shock: DSCR at the cap strike", `${shock.toFixed(2)}x`, `${d.minDscr.toFixed(2)}x test`, "", true);
      }
      if (d.maturity) {
        const rr = a?.r?.annualCashFlows ?? [];
        const yr = Math.max(1, Math.min(rr.length, Math.round(monthsBetween(a.acq, d.maturity) / 12) + 1));
        const noiM = rr[yr - 1]?.noi ?? noi;
        const exitCap = Number(a.inp.exitCapRatePct) || 0;
        const valueM = exitCap > 0 ? noiM / (exitCap / 100) : 0;
        const maxLoan = Math.min(valueM * (th.ltvMaxPct / 100), noiM / (th.debtYieldMinPct / 100));
        const gap = maxLoan - d.loan;
        if (valueM > 0 && gap < 0) push("Refinance gap at maturity (sized at today's tests)", fmtShort(gap), "$0", d.maturity, gap < -0.1 * d.loan);
      }
    }
  }
  debtRisks.sort(byLevel);
  // Valuation Risks (rows inside every threshold are dropped)
  const valuationRisks = valuation.filter((v) => v.unrealizedPct != null && v.unrealizedPct <= -th.markBelowCostPct)
    .map((v) => ({ assetId: v.id, asset: v.name, risk: "Mark below cost", measure: `${v.unrealizedPct.toFixed(1)}%`, threshold: `−${th.markBelowCostPct}%`, keyDate: "", owner: owner(assets.find((a) => a.id === v.id)), level: lvl(v.unrealizedPct <= -2 * th.markBelowCostPct) }))
    .sort(byLevel);
  // Concentration Limit Checks: one row per limit, worst first.
  const near = th.nearLimitPct / 100;
  const st = (v, limit) => (v == null || !limit ? "ok" : v > limit ? "breached" : v >= limit * near ? "near" : "ok");
  const topInd = industry.assets.map((x) => ({ name: x.name, g: x.groups[0] })).filter((x) => x.g).sort((x, y) => y.g.rentPct - x.g.rentPct)[0];
  const capRowsP = caps.byProvider.filter((p) => p.provider !== "(no provider entered)");
  const limitChecks = [
    { key: "tenant", label: "Single tenant (fund rent)", largest: tenants[0]?.tenant ?? "", now: tenants[0]?.pct ?? null, limit: lim.tenantFundPct },
    { key: "industry", label: "Industry (fund rent)", largest: industry.fund[0]?.title ?? "", now: industry.fund[0]?.rentPct ?? null, limit: lim.industryFundPct },
    { key: "industryAsset", label: "Industry (one asset's rent)", largest: topInd ? `${topInd.g.title} · ${topInd.name}` : "", now: topInd?.g.rentPct ?? null, limit: lim.industryAssetPct },
    { key: "lender", label: "Single lender (fund debt)", largest: lenders[0]?.lender ?? "", now: lenders[0]?.pct ?? null, limit: lim.lenderPct },
    { key: "cap", label: "Cap counterparty (capped notional)", largest: capRowsP[0]?.provider ?? "", now: capRowsP[0]?.pct ?? null, limit: lim.capProviderPct },
    { key: "state", label: "State (fund value)", largest: geography.states[0]?.name ?? "", now: geography.states[0]?.valuePct ?? null, limit: lim.statePct },
    { key: "metro", label: "Metro (fund value)", largest: geography.metros[0]?.name ?? "", now: geography.metros[0]?.valuePct ?? null, limit: lim.metroPct },
  ].map((x) => ({ ...x, unit: "%", source: "Internal", status: st(x.now, x.limit) }));
  for (const l of fundLimits) if (typeof l.limit === "number") limitChecks.push({ key: `fl-${l.label}`, label: l.label, largest: l.what || "", now: l.actual ?? null, limit: l.limit, unit: l.unit, source: l.source || "LPA / PPM", status: l.status === "breached" ? "breached" : st(l.actual, l.limit) });
  const SO = { breached: 0, near: 1, ok: 2 };
  limitChecks.sort((x, y) => SO[x.status] - SO[y.status] || (y.limit ? (y.now ?? 0) / y.limit : 0) - (x.limit ? (x.now ?? 0) / x.limit : 0));
  for (const l of limitChecks.filter((x) => x.status === "near")) flag(null, "Limits", `${l.label} near its limit: ${l.now?.toFixed(1)}${l.unit === "%" ? "%" : ""} of ${l.limit}${l.unit === "%" ? "%" : ""}`, 1);

  // ── Aged Rent and Tenant Credit (user, 11/26, 1.1.8) ──
  const aged = agedRent(terms.delinquency, deals);
  const credit = creditRows(deals, { creditDocs: docs?.creditDocs ?? [], leases: docs?.leases ?? [], aged, thresholds: terms.creditThresholds ?? null, asOf });
  for (const c of credit.filter((x) => x.status === "weak")) flag(assets.find((a) => a.id === c.dealId) ?? null, "Tenant credit", `${c.tenant}: ${c.reasons.filter((r2) => r2.level === "weak").map((r2) => r2.text).join("; ")}`, 2);

  // ── Watch list ──
  const byAsset = new Map();
  for (const f of flags.filter((x) => x.assetId)) {
    const cur = byAsset.get(f.assetId) ?? { id: f.assetId, name: f.asset, score: 0, reasons: [] };
    cur.score += f.weight; cur.reasons.push(`${f.section}: ${f.text}`);
    byAsset.set(f.assetId, cur);
  }
  const watch = [...byAsset.values()].sort((x, y) => y.score - x.score);
  const fundFlags = flags.filter((x) => !x.assetId);

  return {
    asOf,
    fundLimits,
    thresholds: th,
    leasingRisks,
    debtRisks,
    valuationRisks,
    limitChecks,
    aged,
    // Flagged tenants only (the Tenant Credit tab has everyone); slim rows so an issued report stays small.
    credit: credit.filter((c) => c.status === "weak" || c.status === "watch").map((c) => ({ dealId: c.dealId, asset: c.asset, unitId: c.unitId, unit: c.unit, tenant: c.tenant, rent: c.rent, pctFundRent: c.pctFundRent, leaseEnd: c.leaseEnd, reviewDue: c.reviewDue, status: c.status, reasons: c.reasons, latest: c.latest ? { sourceLabel: c.latest.sourceLabel, date: c.latest.date, score: c.latest.score, scoreType: c.latest.scoreType, rating: c.latest.rating } : null, late60: c.late60 })),
    ti,
    stress,
    insurance,
    leaseFlags,
    limits: lim,
    leasing,
    tenants,
    industry,
    debt,
    lenders: { rows: lenders, hhi: hhi(lenders.map((l) => l.pct)), total: totalDebt },
    caps,
    geography,
    valuation,
    environmental,
    execution,
    watch,
    fundFlags,
    flags,
  };
}

// Key concentration figures and their change from last quarter's report.
export function concentrationChange(now, prev) {
  const top = (rows, k = "pct") => (rows?.length ? { name: rows[0].lender ?? rows[0].provider ?? rows[0].name ?? rows[0].title ?? rows[0].tenant, v: rows[0][k] } : { name: "", v: null });
  const items = (r) => r && {
    lender: top(r.lenders.rows),
    cap: top(r.caps.byProvider.filter((p) => p.provider !== "(no provider entered)")),
    state: top(r.geography.states, "valuePct"),
    metro: top(r.geography.metros, "valuePct"),
    industry: top(r.industry.fund, "rentPct"),
    tenant: top(r.tenants),
    rollover: { name: "", v: r.leasing.fund.rollover12RentPct },
    vacancy: { name: "", v: r.leasing.fund.vacancyPct },
    lenderHhi: { name: "", v: r.lenders.hhi },
    capHhi: { name: "", v: r.caps.hhi },
  };
  const a = items(now), b = items(prev);
  const LABELS = { lender: "Largest lender, % of debt", cap: "Largest cap counterparty, % of capped", state: "Largest state, % of value", metro: "Largest metro, % of value", industry: "Largest industry, % of fund rent", tenant: "Largest tenant, % of fund rent", rollover: "Rent expiring in 12 months, %", vacancy: "Vacancy, % of SF", lenderHhi: "Lender HHI", capHhi: "Cap counterparty HHI" };
  return Object.keys(LABELS).map((k) => ({ key: k, label: LABELS[k], name: a[k].name, now: a[k].v, prev: b ? b[k].v : null, prevName: b ? b[k].name : "", change: b && a[k].v != null && b[k].v != null ? a[k].v - b[k].v : null }));
}

// The report's groups (user, 11/24), in order; the Excel and PDF mark each with a heading row.
export const RISK_GROUPS = ["SUMMARY", "TENANT AND LEASING", "FINANCIAL", "CONCENTRATION", "OPERATIONAL"];

const riskBlock = (title, rows) => (rows?.length ? [[title, "Risk", "Measure", "Threshold", "Key date", "Owner", "Level"], ...rows.map((x) => [x.asset, x.risk, x.measure, x.threshold, x.keyDate, x.owner, x.level]), []] : [[title], ["None over their thresholds"], []]);
export function riskXlsx(fundName, r) {
  const rows = [[`${fundName}: risk report as of ${r.asOf} (INTERNAL - not for distribution)`], []];
  // Same order as the screen and PDF: summary, then Tenant and Leasing, Financial, Concentration, Operational.
  rows.push(["SUMMARY"]);
  const up = (r.change ?? []).filter((c) => c.change != null && c.change > 1e-9 && !/HHI/.test(c.label)).sort((a, b) => b.change - a.change);
  rows.push(["At a glance", "Count", "Largest"],
    ["Watch list (assets flagged)", r.watch.length, r.watch.slice(0, 3).map((w) => `${w.name} (${w.score})`).join(", ")],
    ["Fund-level flags", r.fundFlags.length, r.fundFlags[0] ? `${r.fundFlags[0].section}: ${r.fundFlags[0].text}` : ""],
    ["KRIs up vs. last quarter", r.change ? up.length : "no prior quarter", up.slice(0, 3).map((c) => `${c.label} +${c.change.toFixed(1)} pts`).join(", ")],
    ["Rent 60+ days past due", r.aged ? r.aged.late60.amount : "no aged receivables", r.aged ? `${r.aged.late60.tenants} tenant(s), as of ${r.aged.asOf}` : ""], []);
  rows.push(["Watch list", "Score", "Reasons"], ...r.watch.map((w) => [w.name, w.score, w.reasons.join("; ")]), []);
  rows.push(["Fund-level flags"], ...r.fundFlags.map((f) => [`${f.section}: ${f.text}`]), []);
  if (r.change) rows.push(["KRI (KRI Trending vs. last quarter)", "Now", "Last quarter", "Change"], ...r.change.map((c) => [`${c.label}${c.name ? ` (${c.name})` : ""}`, c.now, c.prev, c.change]), []);
  rows.push(["TENANT AND LEASING"]);
  if (r.leasingRisks) rows.push(...riskBlock("Leasing Risks", r.leasingRisks));
  if (r.credit) rows.push(...(r.credit.length ? [["Tenant Credit", "Asset", "Annual rent", "% of fund rent", "Lease ends", "Status", "Why flagged", "Latest record"], ...r.credit.map((c) => [c.tenant, c.asset, c.rent, c.pctFundRent, c.leaseEnd, c.status, c.reasons.map((x) => x.text).join("; "), c.latest ? `${c.latest.sourceLabel} ${c.latest.date ?? ""}`.trim() : "None on file"]), []] : [["Tenant Credit"], ["No tenant flagged for weak credit"], []]));
  if (r.aged !== undefined) rows.push(...(r.aged && r.aged.tenants.length ? [[`Aged Rent (as of ${r.aged.asOf})`, "Asset", "1-30", "31-60", "61-90", "91-180", "Over 180", "Past due", "Deposit", "Net exposure", "Change"], ...r.aged.tenants.map((t) => [t.tenant, t.asset, t.buckets.d30, t.buckets.d60, t.buckets.d90, t.buckets.d180, t.buckets.over180, t.pastDue, t.deposit, t.net, t.change]), ["Fund", "", r.aged.fund.buckets.d30, r.aged.fund.buckets.d60, r.aged.fund.buckets.d90, r.aged.fund.buckets.d180, r.aged.fund.buckets.over180, r.aged.fund.pastDue, r.aged.fund.deposit, r.aged.fund.net, r.aged.fund.change], []] : [["Aged Rent"], [r.aged ? "No rent past due" : "No aged receivables uploaded"], []]));
  rows.push(["Lease expirations (fund)", ...r.leasing.years.map(String), "12-month rollover (% rent)", "Vacancy (% SF)"], ["% of rent", ...r.leasing.fund.by.map((b) => b.rentPct), r.leasing.fund.rollover12RentPct, r.leasing.fund.vacancyPct], []);
  if (r.leaseFlags) rows.push(["Lease risk flags", "Asset", "Tenant", "Severity", "Clause"], ...r.leaseFlags.rows.map((x) => [`${x.typeLabel}: ${x.title}`, x.asset, x.tenant, x.severity, x.clause]), []);
  rows.push(["FINANCIAL"]);
  if (r.debtRisks) rows.push(...riskBlock("Debt Risks", r.debtRisks));
  if (r.valuationRisks) rows.push(...riskBlock("Valuation Risks", r.valuationRisks));
  rows.push(["Asset", "Loan", "Lender", "Maturity", "DSCR", "Test", "Cap strike (SOFR)", "Cap expires", "Provider"], ...r.debt.map((d) => [d.name, d.loan, d.lender, d.maturity, d.dscr, d.minDscr, d.strike, d.capEnd, d.provider]), []);
  if (r.ti) {
    rows.push(["TI funding", ...r.ti.quarters.map((q) => q.label)]);
    for (const a of r.ti.assets) rows.push([a.name, ...a.cells.map((c) => (c.need > 0 ? `${TI_COLORS[c.color].label}: need ${Math.round(c.need)}${c.call > 1 ? `, call ${Math.round(c.call)}` : ""}` : "-"))]);
    rows.push(["Capital call needed", ...r.ti.fundCall.map((x) => Math.round(x))], []);
  }
  if (r.stress) {
    rows.push(["Stress (levered IRR %)", "Base", ...r.stress.shocks.map((x) => x.label)]);
    rows.push(["Fund (equity-weighted)", r.stress.fund.baseIrr, ...r.stress.fund.byShock.map((x) => x.irr)]);
    for (const a of r.stress.assets) rows.push([a.name, a.baseIrr, ...a.results.map((x) => (x.breach ? `${x.irr?.toFixed(1)} (DSCR ${x.minDscr?.toFixed(2)}x < ${a.test.toFixed(2)}x)` : x.irr))]);
    rows.push([]);
  }
  if (r.valuation?.length) rows.push(["Valuation", "Cost", "Value", "vs. cost %", "Implied cap %", "Exit cap %"], ...r.valuation.map((v) => [v.name, v.cost, v.value, v.unrealizedPct, v.impliedCap, v.exitCap]), []);
  rows.push(["CONCENTRATION"]);
  if (r.limitChecks) rows.push(["Limit Checks", "Source", "Largest exposure", "Now", "Limit", "Status"], ...r.limitChecks.map((l) => [l.label, l.source, l.largest, l.now, l.limit, l.status === "near" ? "near limit" : l.status]), []);
  if (r.fundLimits?.length) rows.push(["Fund limit", "Source", "Limit", "Actual", "Largest", "Status"], ...r.fundLimits.map((l) => [l.label, l.source, l.limit, l.actual, l.what, l.status]), []);
  rows.push(["Tenant", "Rent", "% of fund rent", "Assets", "Earliest expiry"], ...r.tenants.map((t) => [t.tenant, t.rent, t.pct, t.assets.join(", "), t.leaseEnd]), []);
  rows.push(["Industry (SIC 2-digit)", "% of fund rent"], ...r.industry.fund.map((g) => [g.title, g.rentPct]), []);
  rows.push(["State", "% of value", "% of NOI", "SF", "Assets"], ...r.geography.states.map((s) => [s.name, s.valuePct, s.noiPct, s.sf, s.assets]), []);
  rows.push(["Lender", "Balance", "% of fund debt", "Loans", "Assets", "Spread %", "Maturities"], ...r.lenders.rows.map((l) => [l.lender, l.balance, l.pct, l.loans, l.assets.join(", "), l.spreadPct, l.maturities.join(", ")]), ["HHI", r.lenders.hhi], []);
  rows.push(["Cap counterparty", "Notional", "% of capped", "Market value (exposure)", "Caps", "Expiries"], ...r.caps.byProvider.map((p) => [p.provider, p.notional, p.pct, p.value, p.caps, p.expiries.join(", ")]), ["HHI", r.caps.hhi], []);
  rows.push(["OPERATIONAL"]);
  if (r.execution?.uw?.length) rows.push(["Execution", "IRR underwritten", "IRR now", "Gap (pts)"], ...r.execution.uw.map((x) => [x.name, x.uwIrr, x.irr, x.gap]), []);
  if (r.insurance) rows.push(["Insurance", "Certificates", "Gaps"], ...r.insurance.map((x) => [x.name, x.certificates, x.gaps.map((g) => `${g.severity}: ${g.text}`).join("; ") || "-"]), []);
  return rows;
}
