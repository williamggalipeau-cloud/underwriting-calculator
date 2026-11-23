// Phase M: Pipeline (lib/pipeline.js) with the fictional CoStar-style export
// and internal spreadsheet in docs/sample-pipeline.
const R = require("path").resolve(__dirname, "..", "..");
const fs = require("fs");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const P = j(R + "/lib/pipeline.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const { diffWorkspace, auditSnapshot } = j(R + "/lib/audit.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const TODAY = "2026-11-23";
const grid = (f) => parseCSV(fs.readFileSync(R + "/docs/sample-pipeline/" + f, "utf8"));

// ── CoStar export ──
const g1 = grid("costar-for-sale-2026-11.csv");
const m1 = P.detectPipelineMapping(g1);
ok(["name", "address", "city", "state", "market", "sf", "askingPrice", "capRatePct", "source", "seller"].every((k) => m1.mapping[k] != null), `CoStar columns matched: ${Object.keys(m1.mapping).join(", ")}`);
const r1 = P.importPipeline([], g1, m1, { source: "costar", today: TODAY, by: "analyst@example.com" });
ok(r1.added === 5 && r1.updated === 0 && r1.deals.every((d) => d.stage === "watching" && d.dateAdded === TODAY), "5 CoStar properties added as Watching");
const gl = r1.deals.find((d) => d.name === "Glendale Commerce Center");
ok(gl.askingPrice === 10400000 && gl.sf === 52000 && gl.capRatePct === 6.4 && gl.source === "Fictional Partners Realty" && gl.seller === "Example Holdings LLC" && gl.market === "Reno East", "values parsed ($, %, commas)");
const dx = P.derived(gl);
ok(close(dx.psf, 200) && close(dx.noi, 665600), "derived: $200/SF, NOI from the cap rate");
ok(gl.probabilityPct === 10 && gl.owner === "analyst@example.com", "default probability by stage; deal lead = who uploaded");

// ── Internal spreadsheet: updates matches, adds the rest ──
const g2 = grid("internal-pipeline.csv");
const m2 = P.detectPipelineMapping(g2);
const r2 = P.importPipeline(r1.deals, g2, m2, { source: "internal", today: TODAY });
ok(r2.added === 1 && r2.updated === 2 && r2.deals.length === 6, `internal file: 2 updated (same name and address), 1 added (${r2.deals.length} deals)`);
const rb = r2.deals.find((d) => d.name === "Riverbend Flex");
ok(rb.stage === "loi" && rb.noi === 494000 && rb.targetFund === "Model Fund I" && rb.expectedClose === "2027-02-26" && rb.source === "Sample Brokerage Group", "update keeps CoStar fields and takes the stage, NOI, fund, close date");
ok(r2.deals.find((d) => d.name === "Prairie Works").stage === "passed", "stage text 'Passed' → Passed / lost");
// Remembered mapping
const remembered = { headers: m1.headers, mapping: m1.mapping };
const m1b = P.detectPipelineMapping(g1, remembered);
ok(m1b.remembered && JSON.stringify(m1b.mapping) === JSON.stringify(m1.mapping), "the column match is remembered per source");
const again = P.importPipeline(r2.deals, g1, m1b, { source: "costar", today: TODAY });
ok(again.added === 0 && again.updated === 5 && again.deals.find((d) => d.name === "Riverbend Flex").stage === "loi", "re-uploading CoStar updates, never duplicates, and keeps the stage set in the app");
let threw = false; try { P.detectPipelineMapping([["foo", "bar"], [1, 2]]); } catch { threw = true; }
ok(threw, "a file without pipeline columns is refused");

// ── Views ──
const t = P.totalsByStage(r2.deals);
const w = t.find((x) => x.stage === "watching");
ok(w.count === 3 && t.find((x) => x.stage === "loi").count === 1 && t.find((x) => x.stage === "screening").count === 1 && t.find((x) => x.stage === "passed").count === 1, "totals by stage");
ok(close(t.find((x) => x.stage === "loi").weighted, 7315000 * 0.4), "probability-weighted value (LOI 40%)");
ok(P.filterPipeline(r2.deals, { stage: "active" }).length === 5 && P.filterPipeline(r2.deals, { stage: "all", fund: "Model Fund I" }).length === 2, "filters: active stages; target fund");
const xl = P.pipelineXlsx(r2.deals);
ok(xl.length === 7 && xl[0].includes("Probability %") && xl.some((r) => r.includes("LOI")), "Excel rows");
ok(P.templateRows()[0].length === P.PIPELINE_FIELDS.length, "template has every column");
ok(JSON.stringify(P.toQuickInputs(rb)) === JSON.stringify({ purchasePrice: 7315000, noiYear1: 494000, acquisitionDate: "2027-02-26" }), "Screen: price, NOI and close date to Deal Screener");

// ── Change log ──
const a = auditSnapshot({ deals: [], savedDeals: [], funds: {}, comps: {}, valuations: {}, baseCurve: null, pipeline: { deals: r2.deals } });
const nextDeals = r2.deals.map((d) => (d.name === "Harborview Business Park" ? { ...d, stage: "loi" } : d)).filter((d) => d.name !== "Prairie Works");
const b = auditSnapshot({ deals: [], savedDeals: [], funds: {}, comps: {}, valuations: {}, baseCurve: null, pipeline: { deals: [...nextDeals, P.makePipelineDeal({ name: "New One" })] } });
const log = diffWorkspace(a, b).filter((e) => e.area === "Pipeline");
ok(log.some((e) => e.item === "Harborview Business Park" && /Stage/i.test(e.field) && e.from === "screening" && e.to === "loi") && log.some((e) => e.item === "Prairie Works" && e.field === "Removed") && log.some((e) => e.item === "New One" && e.field === "Added"), "every pipeline change is logged (stage, removed, added)");

// ── Fund impact (lib/fundImpact.js) ──
const FI = j(R + "/lib/fundImpact.js");
const sp = j(R + "/lib/samplePortfolio.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
const terms = { ...DEFAULT_FUND_TERMS, ...FX.workspaceData().funds["Model Fund I"], name: "Model Fund I", capitalActivity: [], limits: [{ key: "single_asset_pct", label: "Single asset", limit: 8, unit: "%" }] };
const fdeals = sp.buildSampleDeals(TEST_INPUTS);
const cand = { id: "cand", inputs: { ...fdeals[2].inputs, propertyName: "Candidate", fundName: "", acquisitionDate: "2027-03-31" } };
ok(FI.isPipeline(cand, TODAY) && !FI.isPipeline(fdeals[0], TODAY) && FI.isPipeline({ inputs: { fundName: "F", acquisitionDate: "2027-01-01" } }, TODAY), "pipeline = no fund, or bought after today");
const im = FI.fundImpact(fdeals, terms, [cand], { todayISO: TODAY });
ok(im.without.assets === 9 && im.with.assets === 10, "with vs. without: the candidate is added, nothing else changes");
ok(["grossIrr", "netLpIrr", "netLpTvpi"].every((k) => close(im.change[k], im.with.returns[k] - im.without.returns[k])), "change = with − without");
ok(im.change.equity > 0 && close(im.without.dryPowder - im.with.dryPowder, im.change.equity, 1) && im.dryPowderUsedPct > 0, `equity ${(im.change.equity / 1e6).toFixed(2)}M uses ${im.dryPowderUsedPct.toFixed(1)}% of dry powder`);
ok(fdeals[0].inputs.fundName === "Model Fund I" && cand.inputs.fundName === "", "modeling only: inputs untouched");
const big = { id: "big", inputs: { ...cand.inputs, propertyName: "Big", purchasePrice: 40_000_000 } };
const ib = FI.fundImpact(fdeals, terms, [big], { todayISO: TODAY });
ok(ib.newBreaches.some((l) => l.key === "single_asset_pct") && ib.limits[0].before.status !== "breached", "a $40M candidate would breach the 8% single-asset limit");
const owned = FI.fundImpact(fdeals.map((d, i) => (i === 8 ? { ...d, inputs: { ...d.inputs, acquisitionDate: "2027-06-30" } } : d)), terms, [cand], { todayISO: TODAY, base: "owned" });
ok(owned.without.assets === 8, "base 'owned': other pipeline assets left out");
const two = FI.fundImpact(fdeals, terms, [cand, big], { todayISO: TODAY });
ok(two.shares.length === 2 && close(two.shares.reduce((t, x) => t + x.share, 0), two.change.netLpIrr, 1e-6), "several candidates: each one's share adds to the combined change");
ok(FI.impactXlsx("Model Fund I", two)[0][0].includes("Scenario - not actual") && FI.impactXlsx("Model Fund I", two).some((r) => r[0] === "Candidate"), "Excel: labelled a scenario, with each candidate's share");

// ── Compare, break-even, sensitivity, saved scenarios ──
const opts = { todayISO: TODAY };
const rk = FI.compareCandidates(fdeals, terms, [cand, big], opts);
ok(rk.length === 2 && rk[0].name === "Candidate" && (rk[1].netLpIrr == null || rk[0].netLpIrr >= rk[1].netLpIrr) && rk.find((x) => x.name === "Big").breaches.length > 0, "compare: ranked by net LP IRR change (not meaningful last), with breaches");
const be = FI.breakEvenPrice(fdeals, { ...terms, limits: [] }, cand, opts);
const atBe = FI.fundImpact(fdeals, { ...terms, limits: [] }, [{ ...cand, inputs: { ...cand.inputs, purchasePrice: be.price } }], opts);
const above = FI.fundImpact(fdeals, { ...terms, limits: [] }, [{ ...cand, inputs: { ...cand.inputs, purchasePrice: be.price * 1.03 } }], opts);
ok(be.price > 0 && atBe.with.returns.netLpIrr >= be.target - 1e-6 && above.with.returns.netLpIrr < be.target, `break-even price ${(be.price / 1e6).toFixed(2)}M: at it the fund IRR holds, 3% above it doesn't`);
const sn = FI.sensitivity(fdeals, terms, cand, opts);
ok(sn.grid.length === 3 && sn.grid.every((row) => row[0] > row[2]) && sn.grid[0][1] > sn.grid[2][1], "sensitivity: a lower price or a lower exit cap means a higher fund IRR");
let scs = FI.saveScenarioVersion([], { name: "Q1 2027: test", by: "vp@example.com", base: "all", candidates: [cand], result: im });
ok(scs.length === 1 && scs[0].versions[0].v === 1 && scs[0].versions[0].candidates[0].inputs.purchasePrice === cand.inputs.purchasePrice, "scenario saved as v1 with its candidates' inputs and results");
const v1copy = JSON.stringify(scs[0].versions[0]);
scs = FI.saveScenarioVersion(scs, { id: scs[0].id, note: "price cut", base: "all", candidates: [{ ...cand, inputs: { ...cand.inputs, purchasePrice: 9e6 } }], result: im });
ok(scs[0].versions.length === 2 && scs[0].versions[1].v === 2 && JSON.stringify(scs[0].versions[0]) === v1copy && scs[0].name === "Q1 2027: test", "a change saves v2; v1 stays frozen");
im.change.netLpIrr = 999; ok(scs[0].versions[0].result.change.netLpIrr !== 999, "saved results are copies (they don't shift later)");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
