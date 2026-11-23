// ─── Phase L: risk report (internal only) ────────────────────────────────────
// Sections built from the app's own data for a fund at a date. Never in the
// shareable report; viewers don't see it. Concentration limits default to the
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

import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears } from "@/lib/fundTimeline";
import { marketCapCost } from "@/lib/capPricer";
import { sicTitle } from "@/lib/sicCodes";
import { fundRows } from "@/lib/uwActual";
import { varianceReport } from "@/lib/businessPlan";
import { checkLimits, limitInputs } from "@/lib/fundLimits";

export const DEFAULT_RISK_LIMITS = {
  industryAssetPct: 40, // no industry above 40% of an asset's rent
  industryFundPct: 20, // … or 20% of fund rent
  lenderPct: 35, // no lender over 35% of fund debt
  capProviderPct: 50, // no counterparty over 50% of capped notional
  statePct: 30, // no more than 30% of value in one state
  metroPct: 25, // … or 25% in one metro
  tenantFundPct: 10, // no tenant over 10% of fund rent
};
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

export function riskReport(deals, terms, { asOf, values = {}, curve, planGap = null, lineBalance = 0 } = {}) {
  const lim = { ...DEFAULT_RISK_LIMITS, ...(terms.riskLimits ?? {}) };
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
    return { id: d.id, name: inp.propertyName || d.id, inp, r, acq, cost, value, t, cf, units: (inp.units ?? []).filter((u) => (Number(u.squareFeet) || 0) > 0) };
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
    const loan = a.r?.debt?.loanAmount ?? 0;
    const maturity = inp.loanTermYears ? addYears(a.acq, Number(inp.loanTermYears)) : "";
    const dscr = a.cf && a.cf.debtService ? a.cf.noi / a.cf.debtService : null;
    const minDscr = Number(inp.minDscr) || 1.25;
    const capped = (Number(inp.capStrikeRatePct) || 0) > 0 || (inp.capStrikeRatesByYear ?? []).some((x) => x > 0);
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
    const row = { id: a.id, name: a.name, loan, lender: inp.lenderName || "", spreadPct: Number(inp.spreadPct) || 0, maturity, dscr, minDscr, capped, strike, capEnd, provider, capValue, ltv: a.value > 0 ? (loan / a.value) * 100 : null };
    if (maturity && monthsBetween(asOf, maturity) <= 18) flag(a, "Debt", `loan matures ${maturity}`, monthsBetween(asOf, maturity) <= 6 ? 3 : 2);
    if (dscr != null && dscr < minDscr) flag(a, "Debt", `DSCR ${dscr.toFixed(2)}x below the ${minDscr.toFixed(2)}x test`, 3);
    else if (dscr != null && dscr < minDscr + 0.1) flag(a, "Debt", `DSCR ${dscr.toFixed(2)}x within 0.10x of the ${minDscr.toFixed(2)}x test`, 1);
    if (!capped && loan > 0) flag(a, "Debt", "floating-rate loan with no cap", 2);
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
    uncapped: debt.filter((d) => !d.capped && d.loan > 0).map((d) => d.name),
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
    for (const o of open) flag(a, "Environmental", o, /RECs|flood/.test(o) ? 2 : 1);
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

  // ── Fund limits (LPA / PPM and internal) ──
  const fundLimits = checkLimits(terms, limitInputs(deals, { values, lineBalance }));
  for (const l of fundLimits) if (l.status === "breached") flag(null, "Fund limits", `${l.label}: ${l.actual?.toFixed(1)} vs. limit ${l.limit}`, 3);

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

export function riskXlsx(fundName, r) {
  const rows = [[`${fundName}: risk report as of ${r.asOf} (INTERNAL - not for distribution)`], []];
  if (r.fundLimits?.length) rows.push(["Fund limit", "Source", "Limit", "Actual", "Largest", "Status"], ...r.fundLimits.map((l) => [l.label, l.source, l.limit, l.actual, l.what, l.status]), []);
  rows.push(["Watch list", "Score", "Reasons"], ...r.watch.map((w) => [w.name, w.score, w.reasons.join("; ")]), []);
  rows.push(["Fund-level flags"], ...r.fundFlags.map((f) => [`${f.section}: ${f.text}`]), []);
  rows.push(["Lease expirations (fund)", ...r.leasing.years.map(String), "12-month rollover (% rent)", "Vacancy (% SF)"], ["% of rent", ...r.leasing.fund.by.map((b) => b.rentPct), r.leasing.fund.rollover12RentPct, r.leasing.fund.vacancyPct], []);
  rows.push(["Tenant", "Rent", "% of fund rent", "Assets", "Earliest expiry"], ...r.tenants.map((t) => [t.tenant, t.rent, t.pct, t.assets.join(", "), t.leaseEnd]), []);
  rows.push(["Industry (SIC 2-digit)", "% of fund rent"], ...r.industry.fund.map((g) => [g.title, g.rentPct]), []);
  rows.push(["Lender", "Balance", "% of fund debt", "Loans", "Assets", "Spread %", "Maturities"], ...r.lenders.rows.map((l) => [l.lender, l.balance, l.pct, l.loans, l.assets.join(", "), l.spreadPct, l.maturities.join(", ")]), ["HHI", r.lenders.hhi], []);
  rows.push(["Cap counterparty", "Notional", "% of capped", "Market value (exposure)", "Caps", "Expiries"], ...r.caps.byProvider.map((p) => [p.provider, p.notional, p.pct, p.value, p.caps, p.expiries.join(", ")]), ["HHI", r.caps.hhi], []);
  rows.push(["State", "% of value", "% of NOI", "SF", "Assets"], ...r.geography.states.map((s) => [s.name, s.valuePct, s.noiPct, s.sf, s.assets]), []);
  rows.push(["Asset", "Loan", "Lender", "Maturity", "DSCR", "Test", "Cap strike (SOFR)", "Cap expires", "Provider"], ...r.debt.map((d) => [d.name, d.loan, d.lender, d.maturity, d.dscr, d.minDscr, d.strike, d.capEnd, d.provider]), []);
  rows.push(["Environmental", "Phase I", "RECs", "NFA", "Flood zone", "Wildfire", "Heat", "Open items"], ...r.environmental.map((e) => [e.name, e.phase1Date ?? "", e.recs ?? "", e.nfa ? "yes" : "", e.floodZone ?? "", e.wildfire ?? "", e.heat ?? "", e.open.join("; ")]));
  return rows;
}
