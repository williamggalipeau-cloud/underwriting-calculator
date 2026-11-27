// 1.1.21: the sample third-party research items on the nine Model Fund I
// assets and the three market report PDFs, tied to the app's market data
// and rent comps.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const RS = j(R + "/lib/research.js");
const SR = j(R + "/lib/sampleResearch.js");
const L = j(R + "/lib/leasing.js");
const SD = j(R + "/lib/sampleDocs.js");
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const f = buildSampleFund({ todayISO: "2026-11-27" });
const all = RS.allResearch(f.deals), sum = RS.researchSummary(all);
check(all.length === 18 && sum.byType.market === 9 && sum.byType.rent_survey === 9, "every sample asset has a market report and a rent survey (18 items)");
check(["marketRent", "rentGrowth", "vacancy", "exitCap"].every((k) => sum.covered.includes(k)) && sum.files === 3, `market rent, rent growth, vacancy and exit cap have support; three items have a file (${sum.covered}; ${sum.files})`);
const types = RS.RESEARCH_TYPES.map(([k]) => k), assumptions = RS.RESEARCH_ASSUMPTIONS.map(([k]) => k), blank = Object.keys(RS.makeResearch());
check(all.every(({ r }) => types.includes(r.type) && r.assumptions.every((k) => assumptions.includes(k)) && blank.every((k) => k in r) && Object.keys(r).every((k) => blank.includes(k)) && /^\d{4}-\d{2}-\d{2}$/.test(r.date)), "each item has exactly the fields the tab saves, a known type and known assumptions");
for (const d of f.deals) {
  const a = d.inputs, [m, s] = RS.researchOf(a), { stat, growthPct } = SR.sampleMarketStat(a, f.market), rc = L.rentCompStats(a.leasing.comps);
  check(stat.quarter === SR.SAMPLE_RESEARCH_QUARTER && stat.submarketId === a.submarketId && m.keyFigures.includes(`$${stat.askingRentSmallBayPSF.toFixed(2)}/SF`) && m.keyFigures.includes(`vacancy ${stat.vacancyPct}%`) && m.keyFigures.includes(`cap rate ${stat.capRatePct}%`) && m.keyFigures.includes(`${growthPct}%`), `${a.propertyName}: the market report states its submarket's Q3 2026 small-bay rent, vacancy, cap rate and rent growth`);
  check(s.keyFigures.includes(`${rc.count} comparable leases`) && s.keyFigures.includes(`average $${rc.avg.toFixed(2)}/SF`) && s.keyFigures.includes(`$${rc.low.toFixed(2)} to $${rc.high.toFixed(2)}/SF`), `${a.propertyName}: the rent survey states the asset's rent comp statistics`);
}
// The load step.
{
  const d = f.deals[4], { research: _r, ...bare } = d.inputs;
  const once = SR.withSampleResearch(bare, d.id, f.market);
  check(JSON.stringify(once.research) === JSON.stringify(d.inputs.research) && SR.withSampleResearch(once, d.id, f.market) === once, "the load adds the same items, once");
  const mine = { ...bare, research: [{ id: "mine" }] };
  check(SR.withSampleResearch(mine, d.id, f.market) === mine && SR.withSampleResearch(bare, d.id, null).research.map((r) => r.type).join() === "rent_survey" && SR.withSampleResearch({ propertyName: "x" }, "deal-1", f.market).research === undefined, "an asset with research of its own and a non-sample asset are left alone; with no market data only the rent survey is added");
}
// The three PDFs.
{
  const dir = R + "/docs/sample-deal-docs/research", index = JSON.parse(fs.readFileSync(dir + "/index.json", "utf8")), flat = (t) => t.replace(/\s+/g, " ");
  check(index.length === 3, "three market report PDFs");
  for (const x of index) {
    const abs = JSON.parse(fs.readFileSync(`${dir}/abstracts/${x.name}.json`, "utf8")), text = flat(execFileSync("pdftotext", ["-layout", `${dir}/${x.file}`, "-"]).toString());
    const d = f.deals.find((y) => y.id === x.dealId), item = RS.researchOf(d.inputs).find((r) => r.id === x.researchId), { stat, growthPct } = SR.sampleMarketStat(d.inputs, f.market);
    const missing = Object.entries(abs.quotes).filter(([, q]) => !text.includes(flat(q.replace(/ \(§[\d.]+\)$/, ""))));
    check(missing.length === 0 && /SAMPLE – FICTIONAL/.test(text), `${x.name}: every quote is in the PDF, which is marked fictional${missing.length ? ` (${missing.map(([k]) => k)})` : ""}`);
    check(item && item.fileName === x.file && abs.title === item.title && abs.quarter === stat.quarter && abs.vacancy_pct === stat.vacancyPct && abs.small_bay_rent_psf === stat.askingRentSmallBayPSF && abs.cap_rate_pct === stat.capRatePct && abs.small_bay_rent_growth_pct === growthPct && abs.inventory_sf === stat.inventorySF, `${x.name}: its figures are the submarket's, and its research item names the file`);
  }
  const manifest = require(R + "/public/sample-docs/manifest.json");
  const add = SD.sampleDocPlan(manifest, { deals: f.deals, docs: [], leases: [] }).add.filter((x) => x.kind === "research");
  check(add.length === 3 && add.every((x) => { const t = RS.parseResearchTitle(x.docTitle); return t && RS.researchOf(f.deals.find((d) => d.id === x.dealId).inputs).some((r) => r.id === t.researchId && r.fileName === t.name) && fs.existsSync(`${R}/public/sample-docs/${x.file}`); }), "the load files each PDF under its research item's id, so the item finds its file");
  const stored = add.map((x, i) => ({ id: `d${i}`, deal_id: x.dealId, title: x.docTitle, files: [{ name: x.file.split("/").pop() }] }));
  check(SD.sampleDocPlan(manifest, { deals: f.deals, docs: stored, leases: [] }).add.filter((x) => x.kind === "research").length === 0, "run again, nothing is uploaded twice");
}
console.log(`${pass} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
