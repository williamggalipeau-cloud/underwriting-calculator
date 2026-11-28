// ─── Phase K: fund plan vs. actual ───────────────────────────────────────────
// The fund's own plan, frozen from the fund model (usually at launch or final
// close), tracked against what the fund actually does.
//
//   fundProjection(deals, terms)   the fund model as it stands: LP capital
//                                  called and distributed by quarter, equity
//                                  deployed and assets bought by quarter, fund
//                                  NOI by calendar year, gross and net returns,
//                                  GP promote, and a summary per asset.
//                                  Always the pure model (capital activity
//                                  ignored), so a plan and a re-forecast are
//                                  comparable.
//   freezePlan(projection, meta)   a plan version: plain numbers, so later
//                                  edits to deals never change it. Versions are
//                                  kept in the fund's terms (terms.fundPlan);
//                                  v1 is the original plan, later ones are
//                                  re-forecasts.
//   planCompare(plan, current, actual, asOf)
//                                  since-inception plan vs. actual to date, and
//                                  projected returns: plan vs. current forecast
//                                  vs. the fund's targets.
//   planQuarters(plan, current, actualQuarters)
//                                  by quarter: called, distributed, deployed.
//   planAttribution(plan, current) the change in projected net profit split by
//                                  asset and by cause.
//
// LP figures throughout (the GP's commitment is shown separately as promote).

import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears, assetQuarterlyEvents, computeDatedWaterfall, fundDates, parseDate, quarterKey, xirr } from "@/lib/fundTimeline";
import { fundLpEvents } from "@/lib/fundFlows";

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const fin = (v) => (typeof v === "number" && isFinite(v) ? v : null);

import { incentiveWaterfall } from "@/lib/fundTypes";
export function waterfallConfig(terms) {
  const inc = incentiveWaterfall(terms);
  return {
    lpEquityPct: 100 - (terms.gpCommitPct ?? 5),
    preferredReturnPct: inc ? inc.preferredReturnPct : terms.prefPct,
    catchUpGpPct: inc ? inc.catchUpGpPct : terms.catchUpGpPct,
    tiers: inc ? inc.tiers : terms.tiers,
    tierMethod: terms.tierMethod === "cliff" ? "cliff" : "marginal", // 1.1.12: marginal unless the LPA says otherwise
    mgmtFeePct: 0, // fund expenses are in the events (lib/fundExpenses)
    incomeTreatment: terms.incomeTreatment ?? "prefThenROC",
    feeStartISO: terms.finalClose,
  };
}

export function distPolicy(terms) {
  return (terms.distributionPolicy ?? "reserve") === "payout"
    ? { mode: "payout", payoutPct: terms.incomePayoutPct ?? 100 }
    : { mode: "reserve", reserveYears: terms.reserveYears ?? 1 };
}

// GP promote = GP distributions less the GP's pro-rata share of all
// distributions (its upside above its share; the plan's definition, 11/23).
export function gpPromote(wf) {
  const total = wf.lpTotalDistributions + wf.gpTotalDistributions;
  const eq = wf.lpEquity + wf.gpEquity;
  return eq > 0 ? wf.gpTotalDistributions - (wf.gpEquity / eq) * total : 0;
}

// The fund model as it stands. deals: fund deals (snapshots with irrFlows).
export function fundProjection(deals, terms, { todayISO, curve } = {}) {
  const fd = fundDates(terms);
  const policy = distPolicy(terms);
  const events = [];
  const gross = [];
  const assets = [];
  const noiByYear = {};
  for (const d of deals) {
    if (!Array.isArray(d.irrFlows) || d.irrFlows.length < 2) continue;
    const q = assetQuarterlyEvents(d, terms, policy);
    events.push(...q.events);
    gross.push(...q.gross);
    const acq = acquisitionDate(d, terms);
    const n = d.irrFlows.length - 1;
    const equity = -d.irrFlows[0];
    const back = sum(d.irrFlows.slice(1));
    assets.push({
      id: d.id,
      name: d.inputs?.propertyName || d.id,
      acq,
      exit: addYears(acq, n),
      holdYears: n,
      price: Number(d.inputs?.purchasePrice) || 0,
      equity,
      profit: back - equity,
      irr: fin(xirr(q.gross)) != null ? xirr(q.gross) * 100 : null,
      multiple: equity > 0 ? back / equity : null,
    });
    // Fund NOI by calendar year (each hold year's NOI in the year it starts).
    try {
      const r = underwrite({ ...d.inputs, holdPeriodYears: n });
      r.annualCashFlows.slice(0, n).forEach((cf, i) => {
        const y = addYears(acq, i).slice(0, 4);
        noiByYear[y] = (noiByYear[y] ?? 0) + (cf.noi ?? 0);
      });
    } catch {
      /* a deal the engine can't run adds no NOI */
    }
  }
  const model = { ...terms, capitalActivity: [] };
  const flows = fundLpEvents(events, model, { todayISO, curve, investmentPeriodEnd: fd.investmentPeriodEnd });
  const wf = computeDatedWaterfall(flows.events, { ...waterfallConfig(terms), feeAfterISO: flows.feeAfterISO });

  const quarters = {};
  const row = (k) => (quarters[k] ??= { quarter: k, called: 0, distributed: 0, incomeDistributed: 0, deployed: 0, acquired: 0 });
  // Operating (income) distributions, for cash yield: sale proceeds excluded.
  for (const l of wf.ledger ?? []) if (l.kind === "income" && l.lp > 0) row(quarterKey(l.date)).incomeDistributed += l.lp;
  for (const f of wf.lpFlows) {
    if (!f.amount) continue;
    const r = row(quarterKey(f.date));
    if (f.amount < 0) r.called += -f.amount;
    else r.distributed += f.amount;
  }
  for (const a of assets) {
    const r = row(quarterKey(a.acq));
    r.deployed += a.equity;
    r.acquired += 1;
  }
  const qList = Object.values(quarters).sort((a, b) => (a.quarter < b.quarter ? -1 : 1));

  // Cash yield by year: LP operating distributions in the year (sale proceeds
  // excluded) ÷ LP capital called by the year's end.
  const years = {};
  let cum = 0;
  for (const q of qList) {
    const y = q.quarter.slice(0, 4);
    cum += q.called;
    years[y] ??= { year: y, distributed: 0, incomeDistributed: 0, calledToDate: 0, noi: 0 };
    years[y].distributed += q.distributed;
    years[y].incomeDistributed += q.incomeDistributed;
    years[y].calledToDate = cum;
  }
  for (const [y, noi] of Object.entries(noiByYear)) (years[y] ??= { year: y, distributed: 0, incomeDistributed: 0, calledToDate: cum, noi: 0 }).noi = noi;
  const yearList = Object.values(years)
    .sort((a, b) => (a.year < b.year ? -1 : 1))
    .map((y) => ({ ...y, cashYield: y.calledToDate > 0 ? (y.incomeDistributed / y.calledToDate) * 100 : null }));

  const grossIn = -sum(gross.filter((g) => g.amount < 0).map((g) => g.amount));
  const grossOut = sum(gross.filter((g) => g.amount > 0).map((g) => g.amount));
  const netIn = wf.lpEquity + wf.gpEquity;
  const netOut = wf.lpTotalDistributions + wf.gpTotalDistributions;
  return {
    quarters: qList,
    years: yearList,
    assets,
    returns: {
      grossIrr: fin(xirr(gross) * 100),
      grossMultiple: grossIn > 0 ? grossOut / grossIn : null,
      grossProfit: grossOut - grossIn,
      netLpIrr: fin(wf.lpIRR),
      netLpTvpi: wf.lpEquity > 0 ? wf.lpTotalDistributions / wf.lpEquity : null,
      lpCalled: wf.lpEquity,
      lpDistributions: wf.lpTotalDistributions,
      gpDistributions: wf.gpTotalDistributions,
      gpPromote: gpPromote(wf),
      netProfit: netOut - netIn,
      // 1.1.29: the average year's cash yield (the years with capital called), for the cash yield target.
      avgCashYield: (() => { const ys = yearList.filter((y) => y.cashYield != null && y.calledToDate > 0); return ys.length ? sum(ys.map((y) => y.cashYield)) / ys.length : null; })(),
    },
    dates: { finalClose: terms.finalClose, investmentPeriodEnd: fd.investmentPeriodEnd, fundEnd: fd.fundEnd, extendedEnd: fd.extendedEnd },
    commitments: terms.targetEquity ?? 0,
  };
}

// A plan version. meta: { label, by, at, note }
export function freezePlan(projection, { label = "", by = "", at = new Date().toISOString(), note = "" } = {}) {
  return JSON.parse(JSON.stringify({ label, by, at, note, ...projection }));
}

// Versions on the fund's terms: { versions: [plan, ...] }; the first is the
// original plan, later ones re-forecasts.
export function addPlanVersion(fundPlan, plan) {
  const versions = [...(fundPlan?.versions ?? [])];
  const v = versions.length + 1;
  versions.push({ ...plan, v, label: plan.label || (v === 1 ? "Original plan" : `Re-forecast ${v - 1}`) });
  return { versions };
}

// Plan cumulative figures up to a date.
export function planToDate(plan, asOf) {
  const k = quarterKey(asOf);
  const qs = (plan?.quarters ?? []).filter((q) => q.quarter <= k);
  const called = sum(qs.map((q) => q.called));
  const distributed = sum(qs.map((q) => q.distributed));
  return {
    called,
    distributed,
    deployed: sum(qs.map((q) => q.deployed)),
    acquired: sum(qs.map((q) => q.acquired)),
    dpi: called > 0 ? distributed / called : null,
  };
}

// actual: { called, distributed, nav, deployed, acquired, asOf } (LP figures
// from the Valuation tab's latest completed quarter; deployment from the
// assets bought by then). targets: { netIrr, tvpi, grossIrr } from the terms.
export function planCompare(plan, current, actual, asOf, targets = {}) {
  const p = planToDate(plan, asOf);
  const a = actual ?? {};
  const dpiA = a.called > 0 ? a.distributed / a.called : null;
  const tvpiA = a.called > 0 ? (a.distributed + (a.nav ?? 0)) / a.called : null;
  const toDate = [
    { key: "called", label: "LP capital called", unit: "$", plan: p.called, actual: a.called },
    { key: "deployed", label: "Equity deployed in assets", unit: "$", plan: p.deployed, actual: a.deployed },
    { key: "acquired", label: "Assets acquired", unit: "#", plan: p.acquired, actual: a.acquired },
    { key: "distributed", label: "LP distributions", unit: "$", plan: p.distributed, actual: a.distributed },
    { key: "dpi", label: "DPI", unit: "x", plan: p.dpi, actual: dpiA },
    { key: "nav", label: "LP NAV", unit: "$", plan: null, actual: a.nav },
    { key: "tvpi", label: "TVPI (interim)", unit: "x", plan: null, actual: tvpiA },
  ].map((r) => ({ ...r, variance: r.plan != null && r.actual != null ? r.actual - r.plan : null }));
  const pr = plan?.returns ?? {};
  const cr = current?.returns ?? {};
  const projected = [
    { key: "netLpIrr", label: "Net LP IRR", unit: "%", target: targets.netIrr ?? null },
    { key: "netLpTvpi", label: "Net LP multiple (TVPI at the end)", unit: "x", target: targets.tvpi ?? null },
    { key: "avgCashYield", label: "Cash yield (average year)", unit: "%", target: targets.cashYield ?? null },
    { key: "grossIrr", label: "Gross IRR", unit: "%", target: targets.grossIrr ?? null },
    { key: "grossMultiple", label: "Gross multiple", unit: "x", target: null },
    { key: "lpDistributions", label: "LP distributions (life of fund)", unit: "$", target: null },
    { key: "gpPromote", label: "GP promote", unit: "$", target: null },
    { key: "netProfit", label: "Net profit to LPs and GP", unit: "$", target: null },
  ].map((r) => ({ ...r, plan: fin(pr[r.key]), current: fin(cr[r.key]), variance: fin(pr[r.key]) != null && fin(cr[r.key]) != null ? cr[r.key] - pr[r.key] : null }));
  return { toDate, projected };
}

// By quarter. actualQuarters: [{ quarter: "2026-Q1", called, distributed }]
// (cumulative LP figures from the Valuation tab, turned into per-quarter).
export function planQuarters(plan, current, actualQuarters = []) {
  const keys = new Set([...(plan?.quarters ?? []).map((q) => q.quarter), ...(current?.quarters ?? []).map((q) => q.quarter)]);
  const by = (list) => new Map((list ?? []).map((q) => [q.quarter, q]));
  const P = by(plan?.quarters), C = by(current?.quarters), A = by(actualQuarters);
  let cp = 0, ca = 0, dp = 0, da = 0;
  return [...keys].sort().map((k) => {
    const p = P.get(k), c = C.get(k), a = A.get(k);
    cp += p?.called ?? 0;
    dp += p?.distributed ?? 0;
    if (a) { ca += a.called; da += a.distributed; }
    return {
      quarter: k,
      planCalled: p?.called ?? 0,
      actualCalled: a ? a.called : null,
      forecastCalled: c?.called ?? 0,
      planDistributed: p?.distributed ?? 0,
      actualDistributed: a ? a.distributed : null,
      forecastDistributed: c?.distributed ?? 0,
      planDeployed: p?.deployed ?? 0,
      forecastDeployed: c?.deployed ?? 0,
      cumPlanCalled: cp,
      cumActualCalled: a ? ca : null,
      cumPlanDistributed: dp,
      cumActualDistributed: a ? da : null,
    };
  });
}

// Cumulative LP figures by quarter end → per quarter.
export function actualQuartersFromValuation(valQuarters = []) {
  let pc = 0, pd = 0;
  return valQuarters
    .filter((q) => q.net && !q.net.nm)
    .map((q) => {
      const r = { quarter: quarterKey(q.quarterEnd), called: q.net.contrib - pc, distributed: q.net.dist - pd, nav: q.net.lpNav };
      pc = q.net.contrib;
      pd = q.net.dist;
      return r;
    });
}

// Gap in projected net profit (current forecast − plan), by asset and by cause.
// Causes: deployment (assets added or dropped), pricing (purchase price paid
// vs. plan on plan assets), operations and exits (the rest of each plan
// asset's change), and fees, fund expenses and the sub line (the change in
// net profit not explained by the assets' gross profit).
export function planAttribution(plan, current) {
  const P = new Map((plan?.assets ?? []).map((a) => [a.id, a]));
  const C = new Map((current?.assets ?? []).map((a) => [a.id, a]));
  const ids = [...new Set([...P.keys(), ...C.keys()])];
  const byAsset = ids.map((id) => {
    const p = P.get(id), c = C.get(id);
    const status = p && c ? "in plan" : c ? "added" : "dropped";
    return {
      id,
      name: (c ?? p).name,
      status,
      planProfit: p?.profit ?? 0,
      currentProfit: c?.profit ?? 0,
      delta: (c?.profit ?? 0) - (p?.profit ?? 0),
      planIrr: p?.irr ?? null,
      currentIrr: c?.irr ?? null,
      priceDelta: p && c ? c.price - p.price : 0,
      acqShiftDays: p && c ? Math.round((parseDate(c.acq) - parseDate(p.acq)) / 86_400_000) : 0,
    };
  }).sort((a, b) => a.delta - b.delta);
  const deployment = sum(byAsset.filter((r) => r.status !== "in plan").map((r) => r.delta));
  const kept = byAsset.filter((r) => r.status === "in plan");
  // A higher price costs about the extra price (the extra equity and loan
  // both come back only through the asset's own cash flows).
  const pricing = sum(kept.map((r) => -r.priceDelta)) ;
  const operations = sum(kept.map((r) => r.delta)) - pricing;
  const grossDelta = sum(byAsset.map((r) => r.delta));
  const netDelta = (current?.returns?.netProfit ?? 0) - (plan?.returns?.netProfit ?? 0);
  const fund = netDelta - grossDelta;
  return {
    byAsset,
    causes: [
      { key: "deployment", label: "Deployment (assets added or dropped)", delta: deployment },
      { key: "pricing", label: "Pricing (purchase prices vs. plan)", delta: pricing },
      { key: "operations", label: "Operations, financing and exits (plan assets)", delta: operations },
      { key: "fund", label: "Fees, fund expenses and sub line", delta: fund },
    ],
    total: netDelta,
  };
}

// Excel rows (lib/xlsx writeXlsx).
export function fundPlanXlsx(fundName, plan, cmp, quarters, attr) {
  const rows = [
    [`${fundName}: fund plan vs. actual`],
    [`Plan: ${plan.label} (v${plan.v}), frozen ${String(plan.at).slice(0, 10)}${plan.by ? ` by ${plan.by}` : ""}`],
    [],
    ["Since inception", "Plan", "Actual", "Variance"],
    ...cmp.toDate.map((r) => [r.label, r.plan, r.actual, r.variance]),
    [],
    ["Projected returns", "Plan", "Current forecast", "Variance", "Target"],
    ...cmp.projected.map((r) => [r.label, r.plan, r.current, r.variance, r.target]),
    [],
    ["Quarter", "Plan called", "Actual called", "Forecast called", "Plan distributed", "Actual distributed", "Forecast distributed", "Plan deployed", "Forecast deployed"],
    ...quarters.map((q) => [q.quarter, q.planCalled, q.actualCalled, q.forecastCalled, q.planDistributed, q.actualDistributed, q.forecastDistributed, q.planDeployed, q.forecastDeployed]),
    [],
    ["Change in projected net profit by asset", "Status", "Plan profit", "Current profit", "Change"],
    ...attr.byAsset.map((r) => [r.name, r.status, r.planProfit, r.currentProfit, r.delta]),
    [],
    ["By cause", "Change"],
    ...attr.causes.map((c) => [c.label, c.delta]),
    ["Total", attr.total],
  ];
  return rows;
}
