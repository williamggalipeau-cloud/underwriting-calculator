// ─── Phase J: underwritten vs. actual performance ───────────────────────────
// Underwritten baseline: a frozen copy of the asset's model inputs, stored as
//   inputs.uwBaseline = { at, by, source, note, inputs }
// ("closing" = the closing model; "ic" = frozen while the IC-approved figures
// were on the deal). Metrics are recomputed from the frozen inputs, so the
// baseline always runs through the same model as today.
// Actual + projected: phase I's monthly actuals (NOI) for months that have
// them, the current model for the rest of the hold. Capital and debt service
// come from the model (the income statement import has no such lines).
import { underwrite, calcIRR } from "@/lib/calculations";

// Never part of the baseline: tracking data, not underwriting.
const EXCLUDE = new Set(["businessPlan", "assetMedia", "uwBaseline", "icApproved"]);

export function freezeBaseline(inputs, { by = "", at = new Date().toISOString(), note = "" } = {}) {
  const snap = {};
  for (const [k, v] of Object.entries(inputs ?? {})) if (!EXCLUDE.has(k)) snap[k] = v;
  return { at, by, note, source: inputs?.icApproved ? "ic" : "closing", inputs: structuredClone(snap) };
}

const r2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b ? (a / b) * 100 : NaN);

// Year rows and returns for one set of inputs.
export function scenario(inputs) {
  const r = underwrite(inputs);
  const { debt, returns, annualCashFlows: cfs } = r;
  const equity = debt.equityRequired;
  const loan = debt.loanAmount;
  const totalCost = equity + loan;
  const hold = inputs.holdPeriodYears;
  const years = cfs.slice(0, hold).map((cf, i) => {
    const occ = cf.grossRevenue > 0 && cf.physicalVacancy > 0 ? (1 - cf.physicalVacancy / cf.grossRevenue) * 100 : 100 - (Number(inputs.vacancyPct) || 0);
    const capital = -((cf.tiAndLeasing ?? 0) + (cf.capReplacement ?? 0));
    return {
      year: i + 1,
      noi: cf.noi,
      occupancy: occ,
      capital,
      debtService: -(cf.debtService ?? 0),
      cashFlow: cf.pretaxCashFlow,
      coc: pct(cf.pretaxCashFlow, equity),
      dscr: cf.debtService > 0 ? cf.noi / cf.debtService : NaN,
      debtYield: pct(cf.noi, loan),
    };
  });
  const netExit = returns.exitValue - returns.sellingCosts;
  const unlev = [-totalCost, ...years.map((y, i) => y.noi - (cfs[i].tiAndLeasing ?? 0) + (i === years.length - 1 ? netExit : 0))];
  return {
    years,
    exitReversion: returns.equityReversion,
    returns: {
      irr: returns.irr,
      unleveredIrr: calcIRR(unlev) * 100,
      em: returns.equityMultiple,
      exitCap: returns.exitCapRate,
      exitValue: returns.exitValue,
      goingInCap: returns.goingInCapRate,
      totalCost,
      equity,
      loan,
    },
    irrFlows: r.irrFlows,
    unleveredFlows: unlev,
  };
}

// Months between "YYYY-MM" a and b (b − a).
const monthIdx = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;

// Actual NOI by hold year: { [year]: { months, noi } } (year 1 starts in the
// acquisition month).
export function actualsByYear(inputs, asOf) {
  const acts = inputs?.businessPlan?.actuals ?? {};
  const start = (inputs?.acquisitionDate || "").slice(0, 7);
  if (!start) return {};
  const end = asOf ? asOf.slice(0, 7) : "9999-12";
  const out = {};
  for (const [m, l] of Object.entries(acts)) {
    if (m > end || !isFinite(l?.noi)) continue;
    const k = monthIdx(m) - monthIdx(start);
    if (k < 0) continue;
    const y = Math.floor(k / 12) + 1;
    out[y] = out[y] ?? { months: 0, noi: 0 };
    out[y].months += 1;
    out[y].noi += l.noi;
  }
  return out;
}

// Occupancy from the rent roll today (leased SF ÷ SF), or NaN without one.
export function rentRollOccupancy(inputs) {
  const us = inputs?.units ?? [];
  const sf = us.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0);
  if (!sf) return NaN;
  return (us.filter((u) => u.leaseStatus === "occupied").reduce((s, u) => s + (Number(u.squareFeet) || 0), 0) / sf) * 100;
}

// The hold year containing asOf (1-based), or 0 before acquisition.
export function currentHoldYear(inputs, asOf) {
  const start = (inputs?.acquisitionDate || "").slice(0, 7);
  if (!start || !asOf) return 0;
  const k = monthIdx(asOf.slice(0, 7)) - monthIdx(start);
  return k < 0 ? 0 : Math.floor(k / 12) + 1;
}

// Actual to date + the current model for the rest. Each year has a status:
// actual (12 months in), partial (some months; the rest from the model) or
// projected.
export function actualPlusProjected(inputs, asOf) {
  const cur = scenario(inputs);
  const acts = actualsByYear(inputs, asOf);
  const cy = currentHoldYear(inputs, asOf);
  const occNow = rentRollOccupancy(inputs);
  const { equity, loan } = cur.returns;
  const years = cur.years.map((m) => {
    const a = acts[m.year];
    const months = a?.months ?? 0;
    const noi = months >= 12 ? a.noi : months > 0 ? a.noi + (m.noi * (12 - months)) / 12 : m.noi;
    const cashFlow = m.cashFlow + (noi - m.noi);
    return {
      ...m,
      status: months >= 12 ? "actual" : months > 0 ? "partial" : "projected",
      actualMonths: months,
      noi,
      occupancy: m.year === cy && isFinite(occNow) ? occNow : m.occupancy,
      cashFlow,
      coc: pct(cashFlow, equity),
      dscr: m.debtService < 0 ? noi / -m.debtService : NaN,
      debtYield: pct(noi, loan),
    };
  });
  const flows = [-equity, ...years.map((y, i) => y.cashFlow + (i === years.length - 1 ? cur.exitReversion : 0))];
  const unlev = cur.unleveredFlows.map((f, i) => (i === 0 ? f : f + (years[i - 1].noi - cur.years[i - 1].noi)));
  const dist = flows.slice(1).reduce((s, f) => s + f, 0);
  return {
    years,
    model: cur,
    returns: { ...cur.returns, irr: calcIRR(flows) * 100, unleveredIrr: calcIRR(unlev) * 100, em: dist / equity },
    actualMonths: Object.values(acts).reduce((s, a) => s + a.months, 0),
  };
}

export const YEAR_METRICS = [
  ["noi", "NOI", "$"],
  ["occupancy", "Occupancy", "%"],
  ["capital", "TI, leasing and capital", "$"],
  ["cashFlow", "Cash flow", "$"],
  ["coc", "Cash-on-cash", "%"],
  ["dscr", "DSCR", "x"],
];
export const RETURN_METRICS = [
  ["irr", "Levered IRR", "%"],
  ["unleveredIrr", "Unlevered IRR", "%"],
  ["em", "Equity multiple", "x"],
  ["exitValue", "Exit value", "$"],
  ["exitCap", "Exit cap", "%"],
  ["totalCost", "Total cost", "$"],
  ["loan", "Loan", "$"],
];

const variance = (u, a) => ({ u, a, v: isFinite(u) && isFinite(a) ? a - u : NaN, vPct: isFinite(u) && isFinite(a) && u ? ((a - u) / Math.abs(u)) * 100 : NaN });

// Underwritten vs. actual + projected, by year and for returns.
export function compare(baseline, inputs, asOf) {
  const u = scenario(baseline.inputs);
  const a = actualPlusProjected(inputs, asOf);
  const n = Math.max(u.years.length, a.years.length);
  const years = Array.from({ length: n }, (_, i) => {
    const uy = u.years[i], ay = a.years[i];
    return { year: i + 1, status: ay?.status ?? "—", metrics: Object.fromEntries(YEAR_METRICS.map(([k]) => [k, variance(uy?.[k] ?? NaN, ay?.[k] ?? NaN)])) };
  });
  const returns = Object.fromEntries(RETURN_METRICS.map(([k]) => [k, variance(u.returns[k], a.returns[k])]));
  return { underwritten: u, actual: a, years, returns };
}

// ── Attribution: the IRR gap split by cause ──
// Starting from the baseline, each group of inputs is switched to today's
// values in this order and the change in IRR credited to it; "Operations to
// date" is actual + projected vs. today's model; "Other" is what's left (any
// input not in a group).
export const GROUPS = [
  ["price", "Price and closing costs", ["purchasePrice", "closingCosts", "squareFootage"]],
  ["leasing", "Rent and leasing", ["units", "unitCount", "avgLeaseTerm", "renewalProbabilityPct", "downtimeBetweenLeases", "leaseType", "rentPerSF", "annualRentEscalationPct", "vacancyPct", "creditLossPct", "otherIncomePSF", "customIncomeItems", "freeRentMonthsNew", "freeRentMonthsRenewal", "tiConcessionPSFNew", "tiConcessionPSFRenewal", "tiPerSFNew", "tiPerSFRenewal", "leasingCommissionNewPct", "leasingCommissionRenewalPct", "customRolloverItems", "noiOverrideEnabled", "noiYear1", "noiGrowthPct"]],
  ["expenses", "Operating expenses and fees", ["realEstateTaxPSF", "insurancePSF", "utilitiesPSF", "maintenancePSF", "janitorialPSF", "managementFeePct", "leasingFeesPSF", "capitalReservesPSF", "customExpenseItems", "amFeeItems", "pmFeePct", "pmFeeBasis", "cmFeePct", "cmFeeBasis"]],
  ["capex", "Capex", ["capexBudget", "capexLenderFunded", "constructionCosts", "tiReserve"]],
  ["financing", "Financing (rate, proceeds)", ["loanCovenants", "lenderName", "loanSizingConstraints", "ltvPct", "interestRatePct", "amortizationYears", "loanTermYears", "extensionCount", "extensionTermYears", "extensionFeePct", "extensionFeeAmount", "ioPeriodYears", "floatingRate", "indexRatePct", "spreadPct", "hedgingType", "capStrikeRatePct", "capTermYears", "capPremiumPct", "capPremiumAmount", "capStrikeRatesByYear", "capReplacementCosts", "capReplacementCost", "swapFixedRatePct", "swapTermYears", "sofrForwardCurve", "loanAmountActual", "loanTerms", "executedCaps"]],
  ["timing", "Timing (dates, hold)", ["acquisitionDate", "holdPeriodYears"]],
  ["exit", "Exit cap and value", ["exitCapRatePct", "sellingCostsPct", "sellingCosts", "customDispositionItems", "realizedSalePrice", "realizedSellingCosts", "realizedSaleDate", "realizedNetProceeds", "realizedLoanPayoff"]],
];

const safeIrr = (inp) => {
  try {
    const v = underwrite(inp).returns.irr;
    return isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
};

export function attribution(baseline, inputs, asOf) {
  const base = baseline.inputs;
  const cur = Object.fromEntries(Object.entries(inputs).filter(([k]) => !EXCLUDE.has(k)));
  const startIrr = safeIrr(base);
  let step = { ...base };
  let prev = startIrr;
  const rows = [];
  for (const [key, label, keys] of GROUPS) {
    const changed = keys.filter((k) => JSON.stringify(base[k]) !== JSON.stringify(cur[k]));
    for (const k of keys) {
      if (k in cur) step[k] = cur[k];
      else delete step[k];
    }
    const irr = safeIrr(step);
    rows.push({ key, label, delta: irr - prev, changed });
    prev = irr;
  }
  const modelIrr = safeIrr(cur);
  const other = modelIrr - prev;
  rows.push({ key: "other", label: "Other inputs", delta: isFinite(other) ? other : 0, changed: Object.keys(cur).filter((k) => !GROUPS.some(([, , ks]) => ks.includes(k)) && JSON.stringify(base[k]) !== JSON.stringify(cur[k])) });
  const actual = actualPlusProjected(inputs, asOf);
  rows.push({ key: "operations", label: "Operations to date (actual vs. model)", delta: actual.returns.irr - modelIrr, changed: actual.actualMonths ? [`${actual.actualMonths} months of actuals`] : [] });
  return { startIrr, endIrr: actual.returns.irr, gap: actual.returns.irr - startIrr, rows: rows.map((r) => ({ ...r, delta: r2(r.delta) })) };
}

// ── Whole fund: assets ranked by return gap (shortfall first) ──
export function fundRows(deals, asOf) {
  const rows = [];
  for (const d of deals) {
    const b = d.inputs?.uwBaseline;
    if (!b?.inputs) continue;
    try {
      const c = compare(b, d.inputs, asOf);
      const cy = currentHoldYear(d.inputs, asOf);
      const y = c.years.find((x) => x.year === cy) ?? c.years[0];
      rows.push({
        id: d.id,
        name: d.inputs.propertyName || d.id,
        frozen: b.at,
        uwIrr: c.returns.irr.u, irr: c.returns.irr.a, gap: c.returns.irr.v,
        uwEm: c.returns.em.u, em: c.returns.em.a,
        year: y?.year, status: y?.status,
        uwNoi: y?.metrics.noi.u, noi: y?.metrics.noi.a, noiVarPct: y?.metrics.noi.vPct,
        actualMonths: c.actual.actualMonths,
      });
    } catch {
      // a deal whose model can't run is left out
    }
  }
  return rows.sort((a, b) => (isFinite(a.gap) ? a.gap : 0) - (isFinite(b.gap) ? b.gap : 0));
}

// ── Excel rows ──
export function compareRows(name, c, attr) {
  const head = ["Year", "Status", ...YEAR_METRICS.flatMap(([, l]) => [`${l} (underwritten)`, `${l} (actual + projected)`, `${l} variance`])];
  const body = c.years.map((y) => [y.year, y.status, ...YEAR_METRICS.flatMap(([k]) => [y.metrics[k].u, y.metrics[k].a, y.metrics[k].v].map((v) => (isFinite(v) ? r2(v) : "")))]);
  const ret = [["Return", "Underwritten", "Actual + projected", "Variance"], ...RETURN_METRICS.map(([k, l]) => [l, ...[c.returns[k].u, c.returns[k].a, c.returns[k].v].map((v) => (isFinite(v) ? r2(v) : ""))])];
  const at = attr ? [["IRR gap by cause", "Points of IRR", "Inputs changed"], ...attr.rows.map((r) => [r.label, r.delta, r.changed.join(", ")]), ["Total gap", r2(attr.gap), ""]] : [];
  return [[`${name}: underwritten vs. actual + projected`], [], head, ...body, [], ...ret, [], ...at];
}

export function fundRowsXlsx(rows) {
  return [["Asset", "Baseline frozen", "Underwritten IRR", "Actual + projected IRR", "Gap (points)", "Underwritten multiple", "Actual + projected multiple", "Hold year", "Status", "NOI underwritten", "NOI actual + projected", "NOI variance %", "Months of actuals"],
    ...rows.map((r) => [r.name, (r.frozen || "").slice(0, 10), ...[r.uwIrr, r.irr, r.gap, r.uwEm, r.em].map((v) => (isFinite(v) ? r2(v) : "")), r.year ?? "", r.status ?? "", ...[r.uwNoi, r.noi, r.noiVarPct].map((v) => (isFinite(v) ? r2(v) : "")), r.actualMonths])];
}
