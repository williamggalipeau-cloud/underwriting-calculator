// 1.1.21: writes the fictional market reports behind three assets'
// third-party research items (Comps → Third-Party), as HTML, prints them to
// PDF and writes the abstract of each: docs/sample-deal-docs/research/.
// Every figure is the asset's submarket statistics for the quarter, read
// from scripts/sample-deal-docs/fund.json (lib/sampleResearch.js); nothing is
// typed in here. Fictional only.
// Usage: node scripts/sample-deal-docs/research_docs.cjs [--no-pdf]
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const fund = require("./fund.json");
const dir = path.join(R, "docs", "sample-deal-docs", "research");
const SLUG = { "sample-deal-1": "airport-flex", "sample-deal-2": "route9", "sample-deal-3": "harbor-light" };
const css = `body{font:11.5px/1.55 Georgia,serif;color:#111}h1{font-size:17px;text-align:center;margin:0 0 4px}h2{font-size:12.5px;margin:16px 0 4px}
.banner{font:bold 11px Arial;color:#b42318;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:14px}.c{text-align:center}.muted{color:#555;font-size:10.5px}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left;font-size:11px}th{background:#f3f3f3}`;
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const usd = (v) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;
const page = (title, sub, body) => `<html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL DOCUMENT</div>
<h1>${title.toUpperCase()}</h1><p class="c muted">${sub}</p>${body}<p class="muted" style="margin-top:22px">This document is fictional and was created for software testing.</p></body></html>`;
const where = (a) => `${a.address}, ${a.city}, ${a.state} ${a.zip}`;

const n0 = (v) => Math.round(Number(v)).toLocaleString("en-US");
function marketReport(a) {
  const item = a.research.find((r) => r.type === "market"), { sub, stat, growthPct } = a.marketReport;
  const q = `Q${stat.quarter.slice(-1)} ${stat.quarter.slice(0, 4)}`;
  const t = {
    submarket: `This report covers the ${sub.name.replace(" (fictional)", "")} industrial submarket of ${sub.metro} for ${q}.`,
    inventory: `Inventory stood at ${n0(stat.inventorySF)} square feet at the end of the quarter.`,
    vacancy: `The vacancy rate was ${stat.vacancyPct}% and the availability rate ${stat.availabilityPct}%.`,
    absorption: `Net absorption was ${n0(stat.netAbsorptionSF)} square feet in the quarter.`,
    rent: `Average asking rent was $${stat.askingRentPSF.toFixed(2)} per square foot per year across all sizes.`,
    small_bay_rent: `Small-bay space asked $${stat.askingRentSmallBayPSF.toFixed(2)} per square foot per year.`,
    growth: growthPct != null ? `Small-bay asking rent rose ${growthPct}% over the year.` : "",
    construction: `${n0(stat.underConstructionSF)} square feet were under construction and ${n0(stat.deliveriesSF)} square feet were delivered in the quarter.`,
    cap_rate: `Sales totalled $${n0(stat.salesVolume)} in the quarter at an average cap rate of ${stat.capRatePct}%.`,
  };
  const body = `<h2>1. Scope</h2><p>1.1 ${t.submarket}</p><h2>2. Supply and demand</h2><p>2.1 ${t.inventory}</p><p>2.2 ${t.vacancy}</p><p>2.3 ${t.absorption}</p><p>2.4 ${t.construction}</p>
<h2>3. Rents</h2><p>3.1 ${t.rent}</p><p>3.2 ${t.small_bay_rent}</p>${t.growth ? `<p>3.3 ${t.growth}</p>` : ""}<h2>4. Sales</h2><p>4.1 ${t.cap_rate}</p>`;
  const quotes = { submarket: `${t.submarket} (§1.1)`, inventory_sf: `${t.inventory} (§2.1)`, vacancy_pct: `${t.vacancy} (§2.2)`, net_absorption_sf: `${t.absorption} (§2.3)`, under_construction_sf: `${t.construction} (§2.4)`, asking_rent_psf: `${t.rent} (§3.1)`, small_bay_rent_psf: `${t.small_bay_rent} (§3.2)`, cap_rate_pct: `${t.cap_rate} (§4.1)` };
  if (t.growth) quotes.small_bay_rent_growth_pct = `${t.growth} (§3.3)`;
  return { kind: "market_report", researchId: item.id, fileName: item.fileName, title: item.title, html: page(`${q} Industrial Market Report`, `${sub.name.replace(" (fictional)", "")} · ${sub.metro} · ${item.provider}`, body),
    abstract: { doc_type: "market_report", title: item.title, asset: a.name, provider: item.provider, submarket: sub.name, quarter: stat.quarter, report_date: item.date, inventory_sf: stat.inventorySF, vacancy_pct: stat.vacancyPct, availability_pct: stat.availabilityPct, net_absorption_sf: stat.netAbsorptionSF,
      asking_rent_psf: stat.askingRentPSF, small_bay_rent_psf: stat.askingRentSmallBayPSF, small_bay_rent_growth_pct: growthPct, under_construction_sf: stat.underConstructionSF, deliveries_sf: stat.deliveriesSF, sales_volume: stat.salesVolume, cap_rate_pct: stat.capRatePct, quotes } };
}

(async () => {
  const noPdf = process.argv.includes("--no-pdf");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  fs.mkdirSync(path.join(dir, "abstracts"), { recursive: true });
  const docs = [];
  for (const a of fund.assets) if (SLUG[a.id] && a.marketReport) { const d = marketReport(a); docs.push({ ...d, asset: a.name, dealId: a.id, name: d.fileName.replace(/\.pdf$/, "") }); }
  let b = null, p = null;
  if (!noPdf) { const { chromium } = require("playwright"); b = await chromium.launch(); p = await b.newPage(); }
  const index = [];
  for (const d of docs) {
    const hp = path.join(dir, "html", `${d.name}.html`);
    fs.writeFileSync(hp, d.html);
    fs.writeFileSync(path.join(dir, "abstracts", `${d.name}.json`), JSON.stringify({ ...d.abstract, app: { made_with: "Sample (fictional)", validated: false } }, null, 1));
    if (p) {
      await p.goto("file://" + hp);
      await p.pdf({ path: path.join(dir, `${d.name}.pdf`), format: "Letter", printBackground: true, displayHeaderFooter: true,
        headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
        footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document</div>',
        margin: { top: "0.8in", bottom: "0.8in", left: "0.9in", right: "0.9in" } });
    }
    index.push({ name: d.name, kind: d.kind, researchId: d.researchId, asset: d.asset, dealId: d.dealId, file: `${d.name}.pdf`, title: d.abstract.title });
  }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index, null, 1));
  console.log(`${docs.length} market reports`);
  if (b) await b.close();
})();
