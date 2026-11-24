// Asset quarterly report (lib/assetReport.js, 11/24): investors get a report
// for the portfolio or one asset. Fictional fixture fund with its dates moved
// two years earlier so the assets have marks and history.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const A = j(R + "/lib/assetReport.js");
const Q = j(R + "/lib/quarterlyReport.js");
const BP = j(R + "/lib/businessPlan.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const shift = (iso) => (iso ? `${Number(iso.slice(0, 4)) - 2}${iso.slice(4)}` : iso);
const data = FX.workspaceData();
const fn = "Model Fund I";
const terms = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], name: fn, finalClose: shift(data.funds[fn].finalClose) };
const deals = data.deals.filter((d) => d.inputs.fundName === fn).map((d) => {
  const inputs = { ...d.inputs, acquisitionDate: shift(d.inputs.acquisitionDate) };
  if (d.id === "sample-deal-2") {
    const plan = BP.seedPlan(inputs), budget = BP.budgetFromModel(inputs);
    const actuals = {};
    for (let m = 1; m <= 9; m++) { const ym = `2026-${String(m).padStart(2, "0")}`; const b = BP.budgetMonth(budget, ym); if (b) actuals[ym] = { ...b, noi: b.noi * 0.9 }; }
    inputs.businessPlan = { revisions: [{ n: 1, plan, budget }], actuals };
  }
  return snapshotDeal(inputs, d.id);
});
const marks = { "sample-deal-2": { "2026-09-30": { value: 14_000_000, source: "appraisal" } } };
const qEnd = "2026-09-30";
const r = A.buildAssetReport(deals, terms, marks, { assetId: "sample-deal-2", qEnd, todayISO: "2026-11-24" });
ok(r && r.scope === "asset" && r.assetId === "sample-deal-2" && r.quarter === "2026-Q3" && r.asset.name === "Route 9 Small Bay", `asset report: ${r?.asset.name}, ${r?.quarterLabel}`);
ok(r.value.end === 14_000_000 && r.value.basis === "appraisal" && r.value.start != null && Math.abs(r.value.change - (r.value.end - r.value.start)) < 1 && Math.abs(r.value.unrealized - (r.value.end - r.value.cost)) < 1, `value ${r.value.end}, change ${Math.round(r.value.change)} over the quarter, unrealized vs. cost`);
ok(r.returns.irr != null && isFinite(r.returns.tvpi), `equity IRR ${r.returns.irr?.toFixed(1)}%, multiple ${r.returns.tvpi?.toFixed(2)}x at the mark`);
ok(r.operations.noiYtd && Math.abs(r.operations.noiYtd.vsPlanPct + 10) < 0.01 && r.operations.noiYtd.months === 9, "NOI year to date 10% under plan, 9 months");
ok(r.plan && r.plan.milestones.length > 0 && r.plan.milestones.every((m) => ["open", "due", "late", "done"].includes(m.status)) && r.operations.occupancyTarget != null, "business plan: milestones with status, KPI targets");
ok(r.debt.loan > 0 && r.debt.ltv > 0 && !r.internal, "debt and LTV; no internal block in the shareable version");
const ri = A.buildAssetReport(deals, terms, marks, { assetId: "sample-deal-2", qEnd, todayISO: "2026-11-24", kind: "internal" });
ok(ri.internal && Array.isArray(ri.internal.budget) && ri.internal.budget.some((x) => /Net operating income|rent/i.test(x.line)), `internal: budget variances (${ri.internal.budget.length})`);
ok(A.buildAssetReport(deals, terms, marks, { assetId: "nope", qEnd }) === null, "an unknown asset: no report");
const L = A.draftAssetLetter(r);
ok(/Route 9 Small Bay/.test(L) && /valued at \$14\.0 million \(appraisal/.test(L) && /year to date, -10\.0% against plan/.test(L), "the draft letter uses the asset's figures");
const xs = A.assetReportXlsx(ri, { letter: "Hello", notes: "Note" });
ok(xs[0][0].includes("Route 9 Small Bay") && xs.some((x) => x[0] === "Equity IRR (%)") && xs.some((x) => x[0] === "Budget variances") && xs.some((x) => x[0] === "Internal notes"), "Excel rows");
// Issued separately from the fund report, versioned per asset
let st = Q.issueReport({}, r, { by: "a@example.com" });
st = Q.issueReport(st, r, { by: "a@example.com" });
ok(st.issued.length === 2 && st.issued[1].v === 2 && st.issued[1].assetId === "sample-deal-2" && st.issued[1].id === "rep-2026-Q3-shareable-sample-deal-2-2" && st.issued[0].assetName === "Route 9 Small Bay", "issued and versioned per asset");
const fr = Q.buildQuarterlyReport(deals, terms, marks, { qEnd, todayISO: "2026-11-24" });
st = Q.issueReport(st, fr, {});
ok(st.issued.at(-1).v === 1 && !st.issued.at(-1).assetId, "the fund report keeps its own versions");
console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
