// Acquisitions → Research (lib/research.js) on fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const RS = j(R + "/lib/research.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

// ── Links: http(s) only ──
ok(RS.safeLink("https://example.com/report") === "https://example.com/report", "an https link is kept");
ok(RS.safeLink("example.com/r") === "https://example.com/r", "a bare host gets https://");
ok(RS.safeLink("http://example.com/") === "http://example.com/", "http is allowed");
ok(RS.safeLink("javascript:alert(1)") === null && RS.safeLink("data:text/html,x") === null && RS.safeLink("file:///etc/passwd") === null, "javascript:, data: and file: links are refused");
ok(RS.safeLink("") === null && RS.safeLink("  ") === null, "blank is no link");

// ── Items ──
const r1 = RS.makeResearch({ type: "appraisal", title: "Fictional appraisal", provider: "Example Valuation", date: "2026-09-30", assumptions: ["value", "exitCap"], keyFigures: "As-is value $24.5M; cap 5.75%" }, { by: "a@example.com", now: new Date("2026-11-24T00:00:00Z") });
ok(/^rs-/.test(r1.id) && r1.addedBy === "a@example.com" && r1.addedAt === "2026-11-24T00:00:00.000Z" && r1.docId === null, "a new research item with who added it");
ok(RS.researchTypeLabel("bov") === "Broker opinion of value" && RS.assumptionLabel("exitCap") === "Exit cap rate", "labels");
ok(RS.researchOf({}).length === 0 && RS.researchOf({ research: [r1] }).length === 1, "researchOf reads the asset");

// ── Comps per asset ──
const firm = { comps: [{ id: "c1", price: 1 }], marketGrowthPct: 4, spreadBp: 30, filters: { sinceISO: "2025-01-01" }, market: { series: [1, 2, 3] } };
const f0 = RS.compsFor({}, firm);
ok(!f0.own && f0.state.comps.length === 1 && f0.state.marketGrowthPct === 4 && f0.state.market === undefined, "no asset comps: the firm list as a start, without the firm market data");
const saved = RS.saveAssetComps({ ...f0.state, comps: [...f0.state.comps, { id: "c2" }], market: { leak: true } });
ok(saved.comps.length === 2 && saved.market === undefined, "a saved copy never carries market data");
const f1 = RS.compsFor({ salesComps: saved }, firm);
ok(f1.own && f1.state.comps.length === 2, "after an edit the asset's own comps are used");
ok(firm.comps.length === 1, "the firm list is unchanged");
ok(RS.compsFor({}, null).state.comps.length === 0, "no firm list: empty comps");

// ── Summary, all assets, Excel ──
const r2 = RS.makeResearch({ type: "market", title: "Q3 market report", date: "2026-10-15", assumptions: ["marketRent", "rentGrowth"], url: "https://example.com/q3" });
const r3 = RS.makeResearch({ type: "pca", title: "PCA", date: "2026-08-01", assumptions: ["capex"], docId: "d1", fileName: "pca.pdf" });
const deals = [{ id: "a", inputs: { propertyName: "Fictional Dock", research: [r1, r2] } }, { id: "b", inputs: { propertyName: "Sample Yard", research: [r3] } }, { id: "c", inputs: { propertyName: "Empty" } }];
const all = RS.allResearch(deals);
ok(all.length === 3 && all[0].r.title === "Q3 market report" && all[0].asset === "Fictional Dock" && all[2].asset === "Sample Yard", "every asset's research, newest first");
const s = RS.researchSummary(all);
ok(s.count === 3 && s.links === 1 && s.files === 1 && s.byType.appraisal === 1, "summary counts");
ok(s.covered.includes("value") && s.covered.includes("capex") && s.missing.join() === "vacancy,credit", `assumptions covered and missing: ${s.missing}`);
const x = RS.researchXlsx(all);
ok(x[0][0] === "Third-party research" && x[1].length === 11 && x.length === 5 && x[2][1] === "Market report" && x[4][5] === "Capital / repairs", "Excel rows");

// ── Uploaded PDFs: filed as Other, research id in the title ──
ok(RS.researchTitle("rs-1", "Report.pdf") === "[research:rs-1] Report.pdf", "title carries the research id");
const pt = RS.parseResearchTitle("[research:rs-1] Report: v2.pdf");
ok(pt.researchId === "rs-1" && pt.name === "Report: v2.pdf", "and is read back");
ok(RS.parseResearchTitle("[leasing:x] Proposal: a.pdf") === null, "other documents are not research");
let call = null;
RS.uploadResearchDoc("w1", { dealId: "a", researchId: "rs-9", file: { name: "m.pdf" } }, "a@example.com", (...args) => { call = args; return { id: "d9" }; });
ok(call[0] === "w1" && call[1].dealId === "a" && call[1].docType === "other" && call[1].title === "[research:rs-9] m.pdf" && call[2] === "a@example.com", "upload: on the asset, type Other");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
