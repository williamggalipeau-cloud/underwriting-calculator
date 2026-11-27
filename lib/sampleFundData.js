// 1.1.22: fictional fund-level records on Model Fund I, so every fund tab has
// something to show: sell / hold decisions, the fund's original plan and its
// targets, a distribution proposal and an issued quarterly report.
//
// Nothing here carries a figure of its own (AGENTS.md: everything ties out).
// Each record is what the app itself saves when a user presses the button on
// that tab, made by the same function the tab calls, from the fund as it is:
//   - Sell / Hold: "Sell now" on the assets that have a sale in progress;
//   - Fund plan: freezePlan(fundProjection(…)) as "Original plan", with the
//     plan's own returns as the fund's targets;
//   - Distribution Analysis: the proposal for the last completed quarter
//     (distributable → chooseDistribution at 100%);
//   - Reports: the internal report for the last completed quarter
//     (buildQuarterlyReport → issueReport);
//   - Portfolio Return, capital activity: one sub line draw per purchase, for
//     the asset's equity on its purchase date (what the fund model assumes,
//     so no fund figure moves; the test checks that);
//   - Portfolio Impact: the sample pipeline deal under contract added to the
//     fund, saved as a scenario (fundImpact → saveScenarioVersion).
// The benchmark series (Benchmarking) are the firm's, not the fund's:
// sampleBenchmarks() below, from the fictional files in docs/sample-benchmarks.
// The dates and the author are fixed, so the records are the same for a
// given fund and date.
import { ACTIVE_SALE_STAGES } from "@/lib/dispositions";
import { addPlanVersion, freezePlan, fundProjection } from "@/lib/fundPlan";
import { chooseDistribution, distributable } from "@/lib/distributions";
import { buildQuarterlyReport, draftLetter, issueReport, quarterSummary } from "@/lib/quarterlyReport";
import { lastCompletedQuarterEnd } from "@/lib/valuations";
import { fundImpact, saveScenarioVersion } from "@/lib/fundImpact";
import { benchmarksOf, fundBenchmarkBase, importBenchmark, reportBenchmarks } from "@/lib/benchmarks";
import BENCH from "@/lib/sampleBenchmarks.json";
import { SAMPLE_FUND_NAME, snapshotDeal } from "@/lib/samplePortfolio";

export const SAMPLE_FUND_DATA_BY = "Sample data (fictional)";
const SAMPLE_SALE = "Sample sale (fictional)";
const isSampleDeal = (d) => String(d?.id).startsWith("sample-deal-") && d.inputs?.fundName === SAMPLE_FUND_NAME;
const r2 = (x) => Math.round(x * 100) / 100;
const at = (iso) => `${iso}T17:00:00.000Z`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// deals: every deal of the firm; terms: Model Fund I's terms as they are;
// valuations: { dealId: marks }. Returns the patch for the fund's terms: only
// the records the fund does not have yet (a list the user has started is
// left alone), or {} when there is nothing to add.
// candidates: Deal Screener deals to test in Portfolio Impact (the sample
// pipeline deal under contract); benchmarks: the firm's benchmark series.
export function sampleFundData(deals, terms, { todayISO, valuations = {}, curve, candidates = [], benchmarks = null } = {}) {
  // As the fund tabs see them: each asset with its model's results.
  const fundDeals = (deals ?? []).filter(isSampleDeal).map((d) => (d.irrFlows ? d : snapshotDeal(d.inputs, d.id)));
  if (!fundDeals.length || !terms) return {};
  const patch = {};
  const qEnd = lastCompletedQuarterEnd(todayISO);
  const marks = Object.fromEntries(fundDeals.map((d) => [d.id, valuations[d.id] ?? {}]));

  // Capital activity: each purchase drawn on the subscription line.
  if (!(terms.capitalActivity ?? []).length && terms.subLineEnabled !== false) {
    const bought = fundDeals.filter((d) => d.inputs.acquisitionDate && d.inputs.acquisitionDate <= todayISO && d.metrics?.equityRequired > 0);
    if (bought.length) patch.capitalActivity = bought.map((d) => ({ id: `sca-${d.id}`, date: d.inputs.acquisitionDate, type: "draw", amount: r2(d.metrics.equityRequired), purpose: `acq:${d.id}`, notes: `Fictional sample: sub line draw for the purchase of ${d.inputs.propertyName}` }));
  }

  // Portfolio Impact: the fund with the pipeline deal under contract.
  if (!(terms.impactScenarios ?? []).length && candidates.length) {
    const rawFund = (deals ?? []).filter(isSampleDeal);
    const result = fundImpact(rawFund, { ...terms, name: SAMPLE_FUND_NAME }, candidates, { todayISO, curve, base: "all" });
    if (result) patch.impactScenarios = saveScenarioVersion([], { id: "sc-sample-1", name: `${SAMPLE_FUND_NAME}: ${candidates.map((c) => c.inputs.propertyName).join(" + ")}`, note: "Fictional sample scenario.", by: SAMPLE_FUND_DATA_BY, at: at(todayISO), base: "all", candidates, result });
  }

  // Sell / Hold: the assets being sold are decided "Sell now".
  if (!Object.keys(terms.sellHold?.decisions ?? {}).length) {
    const selling = fundDeals.filter((d) => (d.inputs.dispositions ?? []).some((s) => s.startedFrom === SAMPLE_SALE && ACTIVE_SALE_STAGES.includes(s.stage)));
    if (selling.length) patch.sellHold = { ...(terms.sellHold ?? {}), decisions: Object.fromEntries(selling.map((d) => [d.id, { decision: "sell" }])) };
  }

  // Fund plan: the fund model as it stands, frozen as the original plan.
  if (!(terms.fundPlan?.versions ?? []).length) {
    const current = fundProjection(fundDeals, terms, { todayISO, curve });
    if (current) {
      const plan = freezePlan(current, { label: "Original plan", by: SAMPLE_FUND_DATA_BY, at: at(todayISO), note: "Fictional sample: the fund model on the day the sample data was added." });
      patch.fundPlan = addPlanVersion(terms.fundPlan, plan);
      const k = plan.returns ?? {};
      if (!Object.values(terms.fundPlanTargets ?? {}).some((v) => v != null) && Number.isFinite(k.netLpIrr)) {
        patch.fundPlanTargets = { netIrrPct: r2(k.netLpIrr), netMultiple: r2(k.netLpTvpi), grossIrrPct: r2(k.grossIrr) };
      }
    }
  }

  // Distribution Analysis: last quarter's proposal, at all of the distributable cash.
  if (!(terms.distributions?.proposals ?? []).length) {
    const calc = distributable(fundDeals, terms, qEnd, { todayISO, curve });
    const choice = { mode: "pct", value: 100 };
    const pick = calc ? chooseDistribution(calc, terms, choice) : null;
    if (pick && pick.amount > 0) {
      patch.distributions = { ...(terms.distributions ?? {}), proposals: [{ id: `dp-sample-${calc.quarter}`, quarter: calc.quarter, qEnd, amount: pick.amount, lp: pick.lp, gp: pick.gp, distributable: calc.total, projectedCash: calc.split.projectedBalance, choice, by: SAMPLE_FUND_DATA_BY, savedAt: at(addDays(qEnd, 20)), status: "proposed" }] };
    }
  }

  // Reports: last quarter's internal report, issued.
  if (!(terms.reports?.issued ?? []).length) {
    const t = { ...terms, ...patch };
    let report = buildQuarterlyReport(fundDeals, t, marks, { qEnd, todayISO, curve, kind: "internal" });
    // With the benchmark section, as the Reports tab adds it.
    try {
      const base = fundBenchmarkBase(SAMPLE_FUND_NAME, fundDeals, t, marks, { todayISO: addDays(qEnd, 1), curve });
      const bench = benchmarks ? reportBenchmarks(base, benchmarksOf({ benchmarks }), { strategy: t.reports?.benchmarkStrategy ?? "" }) : null;
      if (report && bench) report = { ...report, benchmarks: bench };
    } catch { /* the report is issued without the benchmark section */ }
    if (report?.portfolio?.length) {
      const summary = quarterSummary(report, null, { issued: [], watch: null });
      patch.reports = issueReport(terms.reports, report, { letter: draftLetter(report), notes: "Fictional sample report.", by: SAMPLE_FUND_DATA_BY, at: at(addDays(qEnd, 30)), summary });
    }
  }
  return patch;
}

// The firm's benchmark series with the fictional sample series added where
// the firm has none of that series (a series the user uploaded is kept).
// Returns the same object when there is nothing to add.
export const SAMPLE_BENCHMARK_SOURCE = "Sample (fictional)";
export function withSampleBenchmarks(benchmarks, { todayISO } = {}) {
  let b = benchmarksOf({ benchmarks }), added = 0;
  const meta = (fileName) => ({ source: SAMPLE_BENCHMARK_SOURCE, fileName, by: SAMPLE_FUND_DATA_BY, at: at(todayISO ?? "2026-11-27") });
  for (const kind of ["index", "vintage"]) for (const [key, v] of Object.entries(BENCH[kind])) {
    if ((b[kind][key]?.rows ?? []).length) continue;
    b = importBenchmark(b, { kind, key, rows: v.rows, meta: meta(v.fileName) }); added++;
  }
  const monthly = Object.fromEntries(Object.entries(BENCH.monthly).filter(([k]) => !(b.monthly[k]?.rows ?? []).length).map(([k, v]) => [k, v.rows]));
  if (Object.keys(monthly).length) { b = importBenchmark(b, { kind: "monthly", series: monthly, meta: meta(Object.values(BENCH.monthly)[0].fileName) }); added++; }
  return added ? b : benchmarks;
}

// The Deal Screener deal of the sample pipeline deal under contract (the one
// Portfolio Impact tests), or null when the firm has not screened it.
export const SAMPLE_IMPACT_PIPELINE_ID = "sample-pl-1";
export function samplePipelineCandidate(deals, pipelineRows = []) {
  const row = (pipelineRows ?? []).find((r) => r.id === SAMPLE_IMPACT_PIPELINE_ID);
  const d = (deals ?? []).find((x) => x.pipelineId === SAMPLE_IMPACT_PIPELINE_ID || (row?.dealId && x.id === row.dealId));
  return d && !d.inputs?.fundName?.trim() ? d : null;
}
