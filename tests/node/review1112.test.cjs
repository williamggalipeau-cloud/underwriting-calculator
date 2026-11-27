// 1.1.12 (code review, 11/27): the calculation fixes, each pinned by a case.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const C = j(R + "/lib/calculations.js");
const T = j(R + "/lib/fundTimeline.js");
const F = j(R + "/lib/fundFlows.js");
const P = j(R + "/lib/fundPlan.js");
const RR = j(R + "/lib/riskReport.js");
const CR = j(R + "/lib/creditReview.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1) => Math.abs(a - b) < e;
const data = FX.workspaceData();
const d0 = data.deals.find((x) => x.id === "sample-deal-1");
const base = { ...d0.inputs, ioPeriodYears: 0, capexLenderFunded: false };

// Interest only (no amortization period) and all cash (0% LTV)
const amort = C.underwrite(base), io = C.underwrite({ ...base, amortizationYears: 0 });
ok(close(io.annualCashFlows[0].loanBalance, io.debt.loanAmount) && io.annualCashFlows[0].debtService < amort.annualCashFlows[0].debtService && io.annualCashFlows[0].debtService > 0 && isFinite(io.returns.irr) && io.returns.irr > 0, `0-year amortization = interest only (debt service ${Math.round(io.annualCashFlows[0].debtService)} vs ${Math.round(amort.annualCashFlows[0].debtService)} amortizing)`);
const cash = C.underwrite({ ...base, ltvPct: 0 });
ok(cash.debt.loanAmount === 0 && cash.annualCashFlows[0].debtService === 0 && isFinite(cash.returns.irr), "0% LTV = all cash: no loan, no debt service");
ok(C.underwrite({ ...base, ltvPct: 0, loanSizingConstraints: { minDSCREnabled: true, minDSCR: 1.25 } }).debt.loanAmount === 0, "0% LTV still binds with a DSCR constraint on");

// IRR needs money in and out
ok(Number.isNaN(C.calcIRR([0, 0, 0])) && Number.isNaN(C.calcIRR([100, 50])) && close(C.calcIRR([-100, 110]) * 100, 10, 0.01), "IRR: not a number without both an outflow and an inflow");

// Income dated on or before final close reaches the fund
const early = SP.snapshotDeal({ ...d0.inputs, acquisitionDate: "2025-01-15" }, d0.id);
const terms = { ...DEFAULT_FUND_TERMS, name: "F", finalClose: "2025-12-31", distributionPolicy: "payout", incomePayoutPct: 100, mgmtFeePct: 0, subLineEnabled: false, capitalActivity: [] };
const q = T.assetQuarterlyEvents(early, terms, P.distPolicy(terms));
const net = (ev) => ev.reduce((s, e) => s + e.amount, 0);
const before = q.events.filter((e) => e.kind === "income" && e.date <= "2025-12-31").reduce((s, e) => s + e.amount, 0);
ok(before > 0 && close(net(F.fundLpEvents(q.events, terms, { todayISO: "2026-11-27" }).events), net(q.events)), `income before final close is kept (${Math.round(before)} was dropped before)`);
let threw = false; try { F.fundLpEvents([], terms, { todayISO: "2026-11-27" }); } catch { threw = true; }
ok(!threw, "a fund with no cash flows doesn't throw");

// Risk report: only a floating loan with no hedge is "floating with no cap"; LTV on the current balance
const fn = "Model Fund I";
const fundDeals = data.deals.filter((d) => d.inputs.fundName === fn && !d.id.startsWith("test-"));
const mk = (patch) => fundDeals.map((d, i) => (i === 0 ? { ...d, inputs: { ...d.inputs, ...patch } } : d)).map((d) => SP.snapshotDeal(d.inputs, d.id));
const rep = (patch) => RR.riskReport(mk(patch), { ...DEFAULT_FUND_TERMS, name: fn }, { asOf: "2026-09-30" });
const row = (r) => r.debt.find((x) => x.id === fundDeals[0].id);
const noCap = (r) => r.debtRisks.some((x) => x.assetId === fundDeals[0].id && /no cap/.test(x.risk));
const fixed = rep({ floatingRate: false, interestRatePct: 6, capStrikeRatePct: 0, capStrikeRatesByYear: [] });
ok(row(fixed).rateType === "Fixed" && !row(fixed).capped && !noCap(fixed), "a fixed-rate loan isn't flagged \"floating rate with no cap\"");
const stale = rep({ floatingRate: false, interestRatePct: 6, capStrikeRatePct: 4 });
ok(!row(stale).capped && !stale.debtRisks.some((x) => x.assetId === fundDeals[0].id && /cap strike|cap expires/i.test(x.risk)), "a strike left on a fixed loan isn't treated as a cap");
const swap = rep({ floatingRate: true, hedgingType: "swap", swapFixedRatePct: 4, capStrikeRatePct: 0, capStrikeRatesByYear: [] });
ok(row(swap).rateType === "Swapped" && !noCap(swap), "a swapped loan isn't flagged either");
const naked = rep({ floatingRate: true, hedgingType: "none", capStrikeRatePct: 0, capStrikeRatesByYear: [] });
ok(row(naked).unhedged && noCap(naked), "a floating loan with no hedge still is");
const amz = RR.riskReport(mk({ ioPeriodYears: 0, amortizationYears: 20 }), { ...DEFAULT_FUND_TERMS, name: fn }, { asOf: "2029-09-30" });
ok(row(amz).loan < row(amz).originalLoan && row(amz).loan > 0, `debt figures use the balance at the report date (${Math.round(row(amz).loan)} vs ${Math.round(row(amz).originalLoan)} original)`);

// Month-end dates
ok(CR.reviewDue({ leaseEnd: "2027-05-31", renewalNoticeMonths: 3 }) === "2027-02-28", "review due: 5/31 less 3 months = 2/28 (not 3/3)");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
