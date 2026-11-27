// 1.1.17: writes the fictional sample documents the building and site facts
// are read from, and the signed sample SNDAs, as HTML, prints them to PDF and
// writes the abstract Claude would read from each:
// docs/sample-deal-docs/asset-facts/.
//   - three assets: a property condition report, a Phase I environmental
//     report, a survey and a roof warranty;
//   - the two assets with a sample loan agreement: an SNDA for each lease
//     marked signed in the fund.
// Every fact is read from scripts/sample-deal-docs/fund.json (Model Fund I as
// the app builds it); nothing is typed in here. Fictional only.
// Usage: node scripts/sample-deal-docs/asset_facts.cjs [--no-pdf]
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const fund = require("./fund.json");
const dir = path.join(R, "docs", "sample-deal-docs", "asset-facts");
const FACT_ASSETS = ["sample-deal-1", "sample-deal-2", "sample-deal-3"];
const SLUG = { "sample-deal-1": "airport-flex", "sample-deal-2": "route9", "sample-deal-3": "harbor-light" };
const css = `body{font:11.5px/1.55 Georgia,serif;color:#111}h1{font-size:17px;text-align:center;margin:0 0 4px}h2{font-size:12.5px;margin:16px 0 4px}
.banner{font:bold 11px Arial;color:#b42318;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:14px}.c{text-align:center}.muted{color:#555;font-size:10.5px}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left;font-size:11px}th{background:#f3f3f3}`;
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const n0 = (v) => Number(v).toLocaleString("en-US");
const page = (title, sub, body) => `<html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL DOCUMENT</div>
<h1>${title.toUpperCase()}</h1><p class="c muted">${sub}</p>${body}<p class="muted" style="margin-top:22px">This document is fictional and was created for software testing.</p></body></html>`;
const where = (a) => `${a.name}, ${a.address}, ${a.city}, ${a.state} ${a.zip}`;
// A date a few weeks before the acquisition, for the diligence reports.
const before = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

function pcr(a) {
  const b = a.building, date = before(a.acquisitionDate, 35);
  const q = {
    clearHeightFt: `The warehouse has a minimum clear height of ${b.clearHeightFt} feet measured to the underside of the roof structure.`,
    dockDoors: `Loading is by ${b.dockDoors} dock-high doors and ${b.driveInDoors} grade-level drive-in doors.`,
    truckCourtFt: `The truck court is ${b.truckCourtFt} feet deep, with ${b.trailerStalls} marked trailer stalls.`,
    powerAmps: `Electrical service is ${n0(b.powerAmps)} amps at ${b.powerVolts} volts, ${b.powerPhase}-phase.`,
    slabIn: `The floor slab is ${b.slabIn} inches thick with ${b.slabReinforcement.toLowerCase()} reinforcement. Measured floor flatness is FF ${b.floorFF} and levelness FL ${b.floorFL}.`,
    columnSpacingW: `Columns are spaced ${b.columnSpacingW} feet by ${b.columnSpacingD} feet.`,
    sprinklerType: `The building is protected by ${b.sprinklerType === "ESFR" ? "an ESFR" : `a ${b.sprinklerType.toLowerCase()}`} sprinkler system.`,
    officeSF: `Office build-out totals ${n0(b.officeSF)} square feet of the ${n0(a.sf)} square foot building.`,
    roofType: `The roof is a ${b.roofType} membrane installed in ${b.roofYear}, with an expected useful life of ${b.roofLifeYears} years.`,
    pavingSurface: `Paving is ${b.pavingSurface.toLowerCase()}, last resurfaced in ${b.pavingYear}, with an expected useful life of ${b.pavingLifeYears} years. Concrete dolly pads are ${b.dollyPads === "yes" ? "present" : "not present"}.`,
  };
  const body = `<p>Prepared for ${a.propertyCompany} by Fictional Building Consultants, Inc. Site visit and report dated ${long(date)}.</p>
<h2>1. Property</h2><p>${where(a)}. A single-storey multi-tenant industrial building of ${n0(a.sf)} square feet.</p>
<h2>2. Structure and floor</h2><p>2.1 ${q.clearHeightFt}</p><p>2.2 ${q.slabIn}</p><p>2.3 ${q.columnSpacingW}</p>
<h2>3. Loading and truck court</h2><p>3.1 ${q.dockDoors}</p><p>3.2 ${q.truckCourtFt}</p>
<h2>4. Building systems</h2><p>4.1 ${q.powerAmps}</p><p>4.2 ${q.sprinklerType}</p><p>4.3 ${q.officeSF}</p>
<h2>5. Roof and paving</h2><p>5.1 ${q.roofType}</p><p>5.2 ${q.pavingSurface}</p>
<h2>6. Summary of facts</h2><table><tr><th>Item</th><th>Finding</th></tr>
<tr><td>Clear height</td><td>${b.clearHeightFt} ft</td></tr><tr><td>Dock-high / drive-in doors</td><td>${b.dockDoors} / ${b.driveInDoors}</td></tr><tr><td>Truck court / trailer stalls</td><td>${b.truckCourtFt} ft / ${b.trailerStalls}</td></tr>
<tr><td>Power</td><td>${n0(b.powerAmps)} A, ${b.powerVolts} V, ${b.powerPhase}-phase</td></tr><tr><td>Slab</td><td>${b.slabIn} in, ${b.slabReinforcement}; FF ${b.floorFF} / FL ${b.floorFL}</td></tr>
<tr><td>Sprinklers</td><td>${b.sprinklerType}</td></tr><tr><td>Office</td><td>${n0(b.officeSF)} SF</td></tr><tr><td>Roof</td><td>${b.roofType}, ${b.roofYear}</td></tr><tr><td>Paving</td><td>${b.pavingSurface}, ${b.pavingYear}</td></tr></table>`;
  const keys = ["clearHeightFt", "dockDoors", "driveInDoors", "truckCourtFt", "trailerStalls", "powerAmps", "powerVolts", "powerPhase", "slabIn", "slabReinforcement", "floorFF", "floorFL", "columnSpacingW", "columnSpacingD", "sprinklerType", "officeSF", "roofType", "roofYear", "roofLifeYears", "pavingSurface", "pavingYear", "pavingLifeYears", "dollyPads"];
  const src = { driveInDoors: "dockDoors", trailerStalls: "truckCourtFt", powerVolts: "powerAmps", powerPhase: "powerAmps", slabReinforcement: "slabIn", floorFF: "slabIn", floorFL: "slabIn", columnSpacingD: "columnSpacingW", roofYear: "roofType", roofLifeYears: "roofType", pavingYear: "pavingSurface", pavingLifeYears: "pavingSurface", dollyPads: "pavingSurface" };
  return { kind: "pcr", title: "Property Condition Report", date, html: page("Property Condition Report", `${a.name} · ${long(date)}`, body),
    abstract: { doc_type: "pcr", title: `${a.name} property condition report`, asset: a.name, report_date: date, prepared_by: "Fictional Building Consultants, Inc.", building: Object.fromEntries(keys.map((k) => [k, b[k]])), quotes: Object.fromEntries(keys.map((k) => [k, q[src[k] ?? k]])) } };
}
function phase1(a) {
  const s = a.site, date = s.phase1Date;
  const q = {
    phase1Date: `This Phase I Environmental Site Assessment was completed on ${long(date)} in accordance with ASTM E1527-21.`,
    phase1Result: "This assessment has revealed no recognized environmental conditions in connection with the property.",
    phase2Result: "No further investigation, including a Phase II assessment, is recommended.",
  };
  const body = `<p>Prepared for ${a.propertyCompany} by Fictional Environmental Services, LLC.</p>
<h2>1. Property</h2><p>${where(a)}.</p><h2>2. Scope</h2><p>2.1 ${q.phase1Date}</p><p>2.2 The assessment included a site reconnaissance, interviews, and a review of regulatory records and historical sources.</p>
<h2>3. Findings</h2><p>3.1 ${q.phase1Result}</p><p>3.2 No controlled recognized environmental conditions or historical recognized environmental conditions were identified.</p>
<h2>4. Recommendation</h2><p>4.1 ${q.phase2Result}</p>`;
  return { kind: "phase1", title: "Phase I Environmental Site Assessment", date, html: page("Phase I Environmental Site Assessment", `${a.name} · ${long(date)}`, body),
    abstract: { doc_type: "phase1", title: `${a.name} Phase I environmental report`, asset: a.name, report_date: date, prepared_by: "Fictional Environmental Services, LLC", site: { phase1Date: date, phase1Result: s.phase1Result, phase2Result: s.phase2Result }, quotes: q } };
}
function survey(a) {
  const b = a.building, s = a.site, date = before(a.acquisitionDate, 28);
  const q = {
    landAcres: `The parcel contains ${b.landAcres} acres, more or less.`,
    footprintSF: `The building footprint measures ${n0(b.footprintSF)} square feet.`,
    zoning: `The property is zoned ${s.zoning}. Industrial use is permitted by right.`,
    residentialAdjacency: `Adjoining residential uses: ${s.residentialAdjacency}. Posted truck route restrictions: ${s.truckRestrictions}.`,
    freewayName: `Access to ${s.freewayName} is ${s.freewayMiles} miles from the property and does not pass along a residential street.`,
  };
  const body = `<p>ALTA/NSPS Land Title Survey prepared for ${a.propertyCompany} by Fictional Land Surveying, Inc., dated ${long(date)}.</p>
<h2>1. Property</h2><p>${where(a)}.</p><h2>2. Area</h2><p>2.1 ${q.landAcres}</p><p>2.2 ${q.footprintSF}</p>
<h2>3. Zoning</h2><p>3.1 ${q.zoning}</p><p>3.2 ${q.residentialAdjacency}</p><h2>4. Access</h2><p>4.1 ${q.freewayName}</p>`;
  return { kind: "survey", title: "ALTA/NSPS Land Title Survey", date, html: page("ALTA/NSPS Land Title Survey", `${a.name} · ${long(date)}`, body),
    abstract: { doc_type: "survey", title: `${a.name} survey`, asset: a.name, report_date: date, prepared_by: "Fictional Land Surveying, Inc.", building: { landAcres: b.landAcres, footprintSF: b.footprintSF },
      site: { zoning: s.zoning, industrialByRight: s.industrialByRight, residentialAdjacency: s.residentialAdjacency, truckRestrictions: s.truckRestrictions, freewayName: s.freewayName, freewayMiles: s.freewayMiles, freewayNoResidential: s.freewayNoResidential },
      quotes: { landAcres: q.landAcres, footprintSF: q.footprintSF, zoning: q.zoning, industrialByRight: q.zoning, residentialAdjacency: q.residentialAdjacency, truckRestrictions: q.residentialAdjacency, freewayName: q.freewayName, freewayMiles: q.freewayName, freewayNoResidential: q.freewayName } } };
}
function roofWarranty(a) {
  const b = a.building, date = `${b.roofYear}-06-15`;
  const q = {
    roofType: `Fictional Roofing Systems Co. warrants the ${b.roofType} membrane roofing system installed on the building.`,
    roofYear: `The roofing system was completed in ${b.roofYear}.`,
    roofWarrantyTo: `This warranty expires on December 31, ${b.roofWarrantyTo}.`,
  };
  const body = `<p>Issued to the owner of the building at ${where(a)}.</p><h2>1. System</h2><p>1.1 ${q.roofType}</p><p>1.2 ${q.roofYear}</p>
<h2>2. Term</h2><p>2.1 ${q.roofWarrantyTo}</p><p>2.2 The warranty transfers to a subsequent owner on written notice.</p>
<h2>3. Coverage</h2><p>3.1 Leaks caused by defects in the membrane or its installation are repaired at no cost to the owner.</p>`;
  return { kind: "roof_warranty", title: "Roof Warranty", date, html: page("Roofing System Warranty", `${a.name} · issued ${b.roofYear}`, body),
    abstract: { doc_type: "roof_warranty", title: `${a.name} roof warranty`, asset: a.name, report_date: date, prepared_by: "Fictional Roofing Systems Co.", building: { roofType: b.roofType, roofYear: b.roofYear, roofWarrantyTo: b.roofWarrantyTo }, quotes: q } };
}
function snda(a, u) {
  const date = u.snda.signedOn, lender = u.snda.lender;
  const q = {
    tenant: `This Subordination, Non-Disturbance and Attornment Agreement is made as of ${long(date)} among ${lender} ("Lender"), ${a.propertyCompany} ("Landlord") and ${u.tenant} ("Tenant").`,
    unit: `Tenant leases Unit ${u.name}, containing ${n0(u.sf)} square feet, at ${a.name} (the "Premises").`,
    lender: `Lender has made a loan to Landlord in the original principal amount of $${n0(a.loan.amount)}, secured by a deed of trust on the property.`,
    non_disturbance: "So long as Tenant is not in default beyond any applicable cure period, Lender shall not disturb Tenant's possession of the Premises under the Lease.",
    attornment: "If Lender succeeds to Landlord's interest, Tenant shall attorn to Lender as its landlord under the Lease.",
    lender_cure_days: "Tenant shall give Lender notice of any Landlord default and thirty (30) days to cure it before exercising any remedy.",
    lender_liability: "Lender shall not be liable for any act or omission of a prior landlord, bound by rent paid more than one month in advance, or responsible for any security deposit it has not received.",
  };
  const body = `<p>${q.tenant}</p><h2>1. Lease and loan</h2><p>1.1 ${q.unit}</p><p>1.2 ${q.lender}</p>
<h2>2. Subordination</h2><p>2.1 The Lease is and shall remain subordinate to the lien of the deed of trust.</p>
<h2>3. Non-disturbance</h2><p>3.1 ${q.non_disturbance}</p><h2>4. Attornment</h2><p>4.1 ${q.attornment}</p>
<h2>5. Lender's rights</h2><p>5.1 ${q.lender_cure_days}</p><p>5.2 ${q.lender_liability}</p>
<p style="margin-top:26px">${lender.toUpperCase()} &nbsp; By: ____________ (fictional) &nbsp;&nbsp; ${a.propertyCompany.toUpperCase()} &nbsp; By: ____________ (fictional) &nbsp;&nbsp; ${u.tenant.toUpperCase()} &nbsp; By: ____________ (fictional)</p>`;
  return { kind: "snda", unit: u.name, tenant: u.tenant, title: "Subordination, Non-Disturbance and Attornment Agreement", date, html: page("Subordination, Non-Disturbance and Attornment Agreement", `${a.name} · Unit ${u.name} · ${u.tenant}`, body),
    abstract: { doc_type: "snda", title: `${a.name} SNDA: ${u.tenant}`, asset: a.name, tenant: u.tenant, unit: u.name, lender, landlord: a.propertyCompany, loan_amount: a.loan.amount, date,
      non_disturbance: "Tenant's possession is not disturbed while it is not in default beyond a cure period", attornment: "Tenant attorns to the lender if it succeeds the landlord", lender_cure_days: 30,
      lender_liability: "Not liable for a prior landlord's acts, rent prepaid more than one month, or a deposit it did not receive",
      quotes: { tenant: `${q.tenant} (p.1)`, unit: `${q.unit} (§1.1)`, lender: `${q.lender} (§1.2)`, landlord: `${q.tenant} (p.1)`, date: `${q.tenant} (p.1)`, non_disturbance: `${q.non_disturbance} (§3.1)`, attornment: `${q.attornment} (§4.1)`, lender_cure_days: `${q.lender_cure_days} (§5.1)`, lender_liability: `${q.lender_liability} (§5.2)` } } };
}
const slugify = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  const noPdf = process.argv.includes("--no-pdf");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  fs.mkdirSync(path.join(dir, "abstracts"), { recursive: true });
  const docs = [];
  for (const a of fund.assets) {
    if (FACT_ASSETS.includes(a.id)) for (const d of [pcr(a), phase1(a), survey(a), roofWarranty(a)]) docs.push({ ...d, asset: a.name, dealId: a.id, name: `${SLUG[a.id]}-${d.kind.replace(/_/g, "-")}` });
    for (const u of a.units) if (u.snda?.status === "signed") docs.push({ ...snda(a, u), asset: a.name, dealId: a.id, name: `${SLUG[a.id] ?? a.id}-snda-${slugify(u.tenant)}` });
  }
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
    index.push({ name: d.name, kind: d.kind, asset: d.asset, dealId: d.dealId, unit: d.unit ?? null, tenant: d.tenant ?? null, file: `${d.name}.pdf`, title: d.abstract.title });
  }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index, null, 1));
  console.log(`${docs.length} documents (${index.filter((x) => x.kind === "snda").length} SNDAs)`);
  if (b) await b.close();
})();
