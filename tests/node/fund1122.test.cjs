// 1.1.22: the fund-level sample records on Model Fund I (lib/sampleFundData.js)
// and the firm's sample benchmark series. Each record must be what the app's
// own function returns for the fund as it is, and adding them must not move
// any fund figure (AGENTS.md: everything ties out).
const path = require("path");
const { execFileSync } = require("child_process");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const S = j(R + "/lib/sampleFundData.js");
const FP = j(R + "/lib/fundPlan.js");
const { fundImpact } = j(R + "/lib/fundImpact.js");
const { buildQuarterlyReport } = j(R + "/lib/quarterlyReport.js");
const { dispositionCandidates } = j(R + "/lib/dispositionCandidates.js");
const { capitalSummary } = j(R + "/lib/fundSummary.js");
const B = j(R + "/lib/benchmarks.js");
const { samplePipelineDeals } = j(R + "/lib/samplePipeline.js");
const { toQuickInputs } = j(R + "/lib/pipeline.js");
const { QUICK_DEFAULTS, toMainInputs } = j(R + "/lib/quickUnderwrite.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;
const T = "2026-11-27";
const f = buildSampleFund({ todayISO: T });
const terms = { ...DEFAULT_FUND_TERMS, ...SP.SAMPLE_FUND_FEE_TERMS, name: SP.SAMPLE_FUND_NAME, targetEquity: SP.SAMPLE_FUND_COMMITMENTS, ...f.termsPatch, delinquency: f.credit.delinquency };
const snaps = f.deals.map((d) => SP.snapshotDeal(d.inputs, d.id));
const pl = samplePipelineDeals(T).find((r) => r.id === S.SAMPLE_IMPACT_PIPELINE_ID);
const quick = { ...QUICK_DEFAULTS, ...toQuickInputs(pl), acquisitionDate: pl.expectedClose };
const candidate = { id: "pl-sample-1", linked: true, quick, pipelineId: pl.id, inputs: toMainInputs(quick, { ...DEFAULT_INPUTS, propertyName: pl.name, address: pl.address, city: pl.city, state: pl.state, squareFootage: pl.sf, fundName: "", units: [] }) };
const benchmarks = S.withSampleBenchmarks(undefined, { todayISO: T });
const opts = { todayISO: T, valuations: f.valuations, candidates: [candidate], benchmarks };
const p = S.sampleFundData(f.deals, terms, opts);
const after = { ...terms, ...p };

// ── What is added ──
check(["capitalActivity", "impactScenarios", "sellHold", "fundPlan", "fundPlanTargets", "reports"].every((k) => p[k]), `the patch holds capital activity, a scenario, decisions, the plan, targets and a report (${Object.keys(p)})`);
check(!p.distributions, "no distribution proposal: nothing is distributable while every purchase is on the sub line");

// ── Capital activity: one sub line draw per purchase, for its equity ──
const ca = p.capitalActivity;
check(ca.length === 9 && ca.every((a) => a.type === "draw"), "nine sub line draws");
for (const d of snaps) {
  const a = ca.find((x) => x.purpose === `acq:${d.id}`);
  check(a && a.date === d.inputs.acquisitionDate && near(a.amount, d.metrics.equityRequired), `${d.inputs.propertyName}: drawn on its purchase date for its equity`);
}
// Adding the ledger moves no fund figure.
const before = FP.fundProjection(snaps, terms, { todayISO: T }), withLedger = FP.fundProjection(snaps, { ...terms, capitalActivity: ca }, { todayISO: T });
for (const k of Object.keys(before.returns)) check(near(before.returns[k], withLedger.returns[k], 1e-6), `fund ${k} is the same with the sample capital activity (${before.returns[k]} vs ${withLedger.returns[k]})`);
check(JSON.stringify(before.quarters) === JSON.stringify(withLedger.quarters), "the fund's quarterly projection is the same with the sample capital activity");
// Portfolio Summary: without a ledger "called" is an estimate (the purchase
// equity to date); with it, nothing is called and that equity is on the sub
// line, which is what the fund model and the quarterly report already say.
// Deployed capital and dry powder are the same either way.
const sa = capitalSummary(terms, snaps, T), sb = capitalSummary({ ...terms, capitalActivity: ca }, snaps, T);
check(sa.calledSource.startsWith("model") && near(sa.called, sa.deployed), "without the ledger, called is the model's purchase equity to date");
check(sb.calledSource === "capital activity" && sb.called === 0 && near(sb.lineDrawn, sa.deployed, 0.05), `with it, nothing is called and the purchase equity is on the sub line (${sb.lineDrawn} vs ${sa.deployed})`);
check(near(sb.deployed, sa.deployed) && near(sb.dryPowder, sa.dryPowder, 0.05) && near(sb.dryPowderAfterReserves, sa.dryPowderAfterReserves, 0.05) && sb.assets === sa.assets, "deployed capital and dry powder are unchanged");
check(sb.lineDrawn <= sb.lineSize, "the draws fit the subscription line");

// ── Fund plan: the projection, frozen; targets are its returns ──
const plan = p.fundPlan.versions[0];
check(p.fundPlan.versions.length === 1 && plan.v === 1 && plan.label === "Original plan", "one plan version, the original plan");
const cur = JSON.parse(JSON.stringify(FP.fundProjection(snaps, terms, { todayISO: T })));
check(JSON.stringify(plan.returns) === JSON.stringify(cur.returns) && JSON.stringify(plan.quarters) === JSON.stringify(cur.quarters), "the original plan is the fund model as it stands");
check(near(p.fundPlanTargets.netIrrPct, plan.returns.netLpIrr) && near(p.fundPlanTargets.netMultiple, plan.returns.netLpTvpi) && near(p.fundPlanTargets.grossIrrPct, plan.returns.grossIrr), "the targets are the plan's own returns");

// ── Sell / Hold: "Sell now" on exactly the assets with a sale in progress ──
const selling = f.deals.filter((d) => (d.inputs.dispositions ?? []).some((s) => ["preparing", "marketing", "offers", "contract"].includes(s.stage))).map((d) => d.id).sort();
check(selling.length > 0 && JSON.stringify(Object.keys(p.sellHold.decisions).sort()) === JSON.stringify(selling) && Object.values(p.sellHold.decisions).every((x) => x.decision === "sell"), `sell decisions on the assets being sold (${selling})`);
const cands = dispositionCandidates(snaps, { [SP.SAMPLE_FUND_NAME]: after }, { todayISO: "2029-06-30", valuations: f.valuations });
check((cands.rows ?? []).filter((r) => r.decision).every((r) => r.decision.text === "Sell now"), "Disposition Candidates reads the decisions as Sell now");

// ── Portfolio Impact: the saved scenario is what the tab computes ──
const sc = p.impactScenarios[0], ver = sc.versions[0];
const live = JSON.parse(JSON.stringify(fundImpact(f.deals, after, [candidate], { todayISO: T, base: "all" })));
check(p.impactScenarios.length === 1 && sc.versions.length === 1 && ver.candidates[0].name === pl.name, "one scenario with the pipeline deal under contract");
const liveBefore = JSON.parse(JSON.stringify(fundImpact(f.deals, terms, [candidate], { todayISO: T, base: "all" })));
check(JSON.stringify(ver.result.with.returns) === JSON.stringify(liveBefore.with.returns) && JSON.stringify(ver.result.without.returns) === JSON.stringify(liveBefore.without.returns), "the scenario's result is the fund impact as computed");
check(near(live.with.returns.netLpIrr, ver.result.with.returns.netLpIrr, 1e-6), "and it is the same once the sample records are on the fund");

// ── Reports: the issued report is last quarter's report ──
const iss = p.reports.issued[0];
const marks = Object.fromEntries(f.deals.map((d) => [d.id, f.valuations[d.id] ?? {}]));
const rep = JSON.parse(JSON.stringify(buildQuarterlyReport(snaps, after, marks, { qEnd: "2026-09-30", todayISO: T, kind: "internal" })));
check(p.reports.issued.length === 1 && iss.quarter === "2026-Q3" && iss.kind === "internal" && iss.v === 1, "one issued internal report for 2026 Q3");
for (const k of ["returns", "nav", "capital", "portfolio", "debt"]) check(JSON.stringify(iss.report[k]) === JSON.stringify(rep[k]), `the issued report's ${k} is the report as built now`);
check(iss.report.portfolio.length === f.deals.filter((d) => d.inputs.acquisitionDate <= "2026-09-30").length, "it lists the assets owned at quarter end");
check(!!iss.report.benchmarks, "it carries the benchmark section");

// ── Only what is missing ──
check(Object.keys(S.sampleFundData(f.deals, after, opts)).length === 0, "nothing is added a second time");
const own = { ...terms, capitalActivity: [{ id: "x", date: "2026-02-01", type: "call", amount: 1000, purpose: "fees" }], sellHold: { decisions: { "sample-deal-1": { decision: "hold", years: 5 } } }, fundPlanTargets: { netIrrPct: 12 } };
const p2 = S.sampleFundData(f.deals, own, opts);
check(!p2.capitalActivity && !p2.sellHold && !p2.fundPlanTargets && p2.fundPlan, "a ledger, decisions and targets the user entered are left alone");
check(Object.keys(S.sampleFundData([], terms, opts)).length === 0 && Object.keys(S.sampleFundData(f.deals.map((d) => ({ ...d, id: `x-${d.id}` })), terms, opts)).length === 0, "nothing without the sample assets");
check(!S.sampleFundData(f.deals, terms, { ...opts, candidates: [] }).impactScenarios, "no scenario when the pipeline deal has not been screened");

// ── Benchmark series ──
check(Object.keys(benchmarks.index).sort().join() === B.INDEXES.map(([k]) => k).sort().join() && Object.keys(benchmarks.vintage).sort().join() === B.VINTAGE_SOURCES.map(([k]) => k).sort().join() && Object.keys(benchmarks.monthly).sort().join() === B.MONTHLY.map(([k]) => k).sort().join(), "every index, vintage source and monthly series has a sample");
check(Object.values(benchmarks.index).concat(Object.values(benchmarks.vintage), Object.values(benchmarks.monthly)).every((x) => x.source === S.SAMPLE_BENCHMARK_SOURCE && x.rows.length > 0), "each is marked as a fictional sample");
check(S.withSampleBenchmarks(benchmarks, { todayISO: T }) === benchmarks, "nothing is added a second time");
const mine = { index: { npi: { source: "NCREIF", rows: [{ q: "2026-Q3", total: 1 }] } } };
const merged = S.withSampleBenchmarks(mine, { todayISO: T });
check(merged.index.npi.source === "NCREIF" && merged.index.npi.rows.length === 1 && merged.index.odce.rows.length > 1, "a series the firm uploaded is kept");
try { execFileSync("node", [R + "/scripts/sample-benchmarks/make_benchmarks.cjs", "--check"], { stdio: "pipe" }); check(true, ""); } catch (e) { check(false, `lib/sampleBenchmarks.json is stale: ${String(e.stderr || e.message).trim()}`); }
const base = B.fundBenchmarkBase(SP.SAMPLE_FUND_NAME, snaps, after, marks, { todayISO: T });
const br = B.benchmarkReport(base, B.benchmarksOf({ benchmarks }));
check(!!br && JSON.stringify(br).length > 200, "the Benchmarking report builds from the sample series");

// ── The pipeline candidate helper ──
check(S.samplePipelineCandidate([candidate], [pl])?.id === candidate.id, "the screened pipeline deal is found");
check(S.samplePipelineCandidate([{ ...candidate, inputs: { ...candidate.inputs, fundName: "Model Fund I" } }], [pl]) === null && S.samplePipelineCandidate(f.deals, [pl]) === null, "not once it is in a fund, and not when it was never screened");

console.log(`fund1122: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
