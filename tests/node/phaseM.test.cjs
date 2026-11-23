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

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
