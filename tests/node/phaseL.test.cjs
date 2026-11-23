// Phase L: Asset Return additions (lib/assetFees.js): GP profit, GP promote,
// GP ROE and projected fee revenue, on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const F = j(R + "/lib/assetFees.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ── The user's example (11/23) ──
const ex = F.gpEconomics({ lpEquity: 9_000_000, gpEquity: 1_000_000, lpTotalDistributions: 17_400_000, gpTotalDistributions: 2_600_000 });
ok(close(ex.gpProfit, 1_600_000) && close(ex.gpPromote, 600_000) && close(ex.gpRoe, 160), "example: GP profit $1.6M, GP promote $0.6M, GP ROE 160%");
ok(F.gpEconomics({ lpEquity: 1, gpEquity: 0, lpTotalDistributions: 2, gpTotalDistributions: 0 }).gpRoe === null, "no GP equity: no ROE");

// ── On a real deal ──
const d = FX.workspaceData().deals.find((x) => x.id === "sample-deal-2");
const r = underwrite(d.inputs);
const g = F.gpEconomics(r.waterfall);
ok(close(g.gpProfit, r.waterfall.gpPromote), "GP profit = the waterfall's old 'GP Promote' (GP distributions − GP equity)");
ok(g.gpPromote <= g.gpProfit + 1e-6 && g.gpPromote >= -1e-6, `GP promote ${(g.gpPromote / 1e3).toFixed(0)}k ≤ GP profit ${(g.gpProfit / 1e3).toFixed(0)}k`);
ok(close(g.gpRoe, (g.gpProfit / r.waterfall.gpEquity) * 100), `GP ROE ${g.gpRoe.toFixed(1)}% = profit ÷ GP equity`);

// ── Fee revenue ──
const inputs = { ...d.inputs, cmFeePct: 0.5 };
const r2 = underwrite(inputs);
const fr = F.feeRevenue(r2.annualCashFlows, 8);
ok(fr.rows.length === r2.annualCashFlows.length && fr.rows.every((x) => close(x.total, x.pm + x.cm)), "one row per hold year: PM + CM");
ok(close(fr.rows[0].pm, r2.annualCashFlows[0].managementFee) && close(fr.rows[0].cm, inputs.purchasePrice * 0.005), "PM fee from the cash flow; CM fee 0.5% of price");
ok(close(fr.total, fr.pm + fr.cm) && fr.pv < fr.total && fr.pv > 0, `total ${Math.round(fr.total).toLocaleString()}, PV at 8% ${Math.round(fr.pv).toLocaleString()}`);
ok(close(F.feeRevenue(r2.annualCashFlows, 0).pv, fr.total), "PV at 0% = total");
ok(F.feeRevenue([], 8).total === 0, "no cash flows: zero");
const rows = F.feeRevenueXlsx("Route 9", fr, g);
ok(rows.some((x) => x[0] === "Present value") && rows.some((x) => /GP promote/.test(x[0])) && !rows.some((x) => /asset management fee/i.test(x[0]) && typeof x[1] === "number"), "Excel: PV and GP rows; no per-asset AM fee line");

// ── Sample drawings (lib/sampleMedia.js) ──
const fs = require("fs");
const SM = j(R + "/lib/sampleMedia.js");
const AP = j(R + "/lib/assetPhotos.js");
const sp = j(R + "/lib/samplePortfolio.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
const built = sp.buildSampleDeals(TEST_INPUTS);
ok(built.length === 9 && built.every((b) => b.inputs.assetMedia.photos.length === 4 && b.inputs.assetMedia.photos[0].cover && b.inputs.assetMedia.floorPlan.kind === "image"), "every sample asset is built with 4 drawn photos (exterior as cover) and a drawn plan");
const files = built.flatMap((b) => [...b.inputs.assetMedia.photos.map((p) => p.path), b.inputs.assetMedia.floorPlan.path]);
ok(files.every((f) => AP.isSamplePath(f) && fs.existsSync(R + "/public/sample-media/" + f.slice(7))), `all ${files.length} drawings exist in public/sample-media`);
ok(AP.sampleUrl("sample:x.svg") === "/underwriting-calculator/sample-media/x.svg", "sample path → app URL under the base path");
const b2 = built[1].inputs;
ok(b2.units.every((u) => b2.assetMedia.floorPlan.boxes[u.id]) && Object.values(b2.assetMedia.floorPlan.boxes).every((x) => x.x >= SM.PLAN_AREA.x - 1e-9 && x.x + x.w <= SM.PLAN_AREA.x + SM.PLAN_AREA.w + 1e-9), "a box for every unit, inside the drawn building");
const planSvg = fs.readFileSync(R + "/public/sample-media/route-9-small-bay-floorplan.svg", "utf8");
ok(b2.units.every((u) => planSvg.includes(`>${u.name}<`)), "the drawn plan labels every unit");
const keep = { id: "sample-deal-2", inputs: { ...b2, assetMedia: { photos: [{ id: "mine", path: "w/x.jpg" }] } } };
ok(SM.withSampleMedia(keep) === keep, "Sample data → add drawings: an asset with its own photos is left alone");
const bare = { id: "sample-deal-2", inputs: { ...b2, assetMedia: undefined, address: "kept" } };
const added = SM.withSampleMedia(bare);
ok(added.inputs.assetMedia.photos.length === 4 && added.inputs.address === "kept", "an asset with none gets the drawings; nothing else changes");
ok(SM.withSampleMedia({ id: "x", inputs: { propertyName: "My Real Building" } }).inputs.assetMedia === undefined, "non-sample assets never get drawings");
ok(!AP.isSamplePath("w1/sample-deal-2/photos/1-a.jpg"), "stored paths aren't sample paths");

// ── Full business plan PDF data (lib/businessPlanExtras.js) ──
const BX = j(R + "/lib/businessPlanExtras.js");
const xin = { ...b2, uwBaseline: { at: "2026-03-16T00:00:00Z", by: "am@example.com", inputs: { ...b2, assetMedia: undefined } }, businessPlan: { revisions: [], actuals: { "2026-08": { noi: 50000 }, "2026-09": { noi: 54000 } } } };
const xd = BX.planExtrasData(xin, { asOf: "2026-11-23" });
ok(xd.photos.length === 4 && xd.cover.id.endsWith("exterior") && xd.planOnImage, "photos, cover and the plan image");
ok(xd.unitBoxes.length === b2.units.length && xd.unitBoxes.every((u) => u.box && u.color && ["occupied", "expiring", "vacant"].includes(u.status)), "each unit with its box and lease-status colour");
ok(/^https:\/\/www\.google\.com\/maps\//.test(xd.location.link) && xd.location.address.includes("Kent"), `location: ${xd.location.address}`);
ok(close(xd.actualNoi.noi, 52000 * 12) && xd.actualNoi.months === 2, "actual NOI annualized");
ok(xd.uw && xd.uw.c.returns.irr && xd.uw.attr.rows.length > 0, "underwritten vs. actual included when there is a baseline");
const plain = BX.planExtrasData({ ...b2, assetMedia: undefined }, { asOf: "2026-11-23" });
ok(!plain.planOnImage && plain.photos.length === 0 && plain.unitBoxes.every((u) => u.box) && plain.uw === null, "no media: the schematic boxes, no photos, no baseline section");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
