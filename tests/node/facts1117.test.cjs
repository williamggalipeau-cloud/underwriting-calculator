// 1.1.17: the industrial characteristics of an asset (lib/assetFacts.js) and
// SNDAs (lib/snda.js), with their sample data and documents.
const fs = require("fs");
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const F = j(R + "/lib/assetFacts.js");
const S = j(R + "/lib/snda.js");
const SA = j(R + "/lib/sampleAssetFacts.js");
const SD = j(R + "/lib/sampleDocs.js");
const FD = j(R + "/lib/fundDebt.js");
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { SAMPLE_DATA_VERSION } = j(R + "/lib/samplePortfolio.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const T0 = "2026-11-27";

// ── The twelve characteristics (user, 11/27) are all there ──
const bk = F.BUILDING_FIELDS.map((f) => f[0]), sk = F.SITE_FIELDS.map((f) => f[0]);
const need = { "1 clear height": ["clearHeightFt"], "2 dock and drive-in doors": ["dockDoors", "driveInDoors"], "3 truck court and trailer stalls": ["truckCourtFt", "trailerStalls"], "4 land and footprint": ["landAcres", "footprintSF"],
  "5 power": ["powerAmps", "powerVolts", "powerPhase"], "6 slab and flatness": ["slabIn", "slabReinforcement", "floorFF", "floorFL"], "7 column spacing and speed bay": ["columnSpacingW", "columnSpacingD", "speedBayFt"], "8 sprinklers": ["sprinklerType"],
  "9 office": ["officeSF"], "10 roof and paving life": ["roofType", "roofYear", "roofWarrantyTo", "roofLifeYears", "pavingSurface", "pavingYear", "pavingLifeYears", "dollyPads"] };
for (const [g, ks] of Object.entries(need)) ok(ks.every((k) => bk.includes(k)), `Building has ${g}`);
ok(["portName", "portMiles", "portMinutes", "drayageTripsPerShift", "railName", "railMiles", "airportName", "airportMiles", "freewayName", "freewayMiles", "pop30", "pop60"].every((k) => sk.includes(k)), "Location and site has 11 drayage and last-mile proximity");
ok(["phase1Date", "phase1Result", "phase2Date", "phase2Result", "envOpenItems", "zoning", "industrialByRight", "residentialAdjacency", "truckRestrictions", "freewayNoResidential"].every((k) => sk.includes(k)), "Location and site has 12 environmental and zoning buffer");
ok(F.BUILDING_FIELDS.filter((f) => f[3]?.hint).map((f) => f[0]).join() === "clearHeightFt,truckCourtFt,slabIn,roofLifeYears,pavingLifeYears", "range hints on clear height, truck court and slab (and the default lives)");

// ── Entering and calculating ──
let inp = { propertyName: "Fictional Park", squareFootage: 42000, acquisitionDate: "2026-03-16", holdPeriodYears: 4 };
for (const [k, v] of [["clearHeightFt", "24"], ["dockDoors", "6"], ["landAcres", "2.6"], ["footprintSF", "42,000"], ["officeSF", "4200"], ["sprinklerType", "ESFR"], ["roofYear", "2019"], ["pavingYear", "2014"], ["dollyPads", "Yes"]]) inp = F.setFact(inp, "building", k, v);
const f = F.assetFacts(inp, { todayISO: T0 });
ok(inp.building.dockDoors === 6 && inp.building.footprintSF === 42000 && inp.building.dollyPads === "yes" && inp.building.clearHeightFt === 24, "typed values are cleaned for their type (numbers, yes / no)");
ok(f.sfPerDockDoor === 7000 && close(f.siteCoveragePct, (42000 / (2.6 * 43560)) * 100) && close(f.officePct, 10) && f.esfr === true, "SF per dock door 7,000; site coverage = footprint ÷ land; office 10%; ESFR");
ok(f.roof.life === 20 && f.roof.endYear === 2039 && f.roof.remaining === 13 && f.roof.insideHold === false, "roof: 20-year life unless entered, 13 years left, beyond the hold");
ok(f.paving.life === 15 && f.paving.endYear === 2029 && f.paving.remaining === 3 && f.paving.insideHold === true, "paving: 15-year life unless entered, 3 years left, ends inside the hold (2030)");
ok(F.assetFacts(F.setFact(inp, "building", "roofLifeYears", "12"), { todayISO: T0 }).roof.endYear === 2031, "the expected life can be changed per asset");
ok(F.factFlags(inp, { todayISO: T0 }).length === 1 && /paving/i.test(F.factFlags(inp, { todayISO: T0 })[0]), "flag: the paving's life ends inside the hold; nothing else");
ok(F.setFact(inp, "building", "dockDoors", "").building.dockDoors === undefined && F.assetFacts({ squareFootage: 100 }).sfPerDockDoor === null && F.assetFacts({ squareFootage: 100, building: { dockDoors: 0 } }).sfPerDockDoor === null, "an empty value clears a fact; no doors or 0 doors gives no ratio");
ok(F.setFact(inp, "building", "notAField", 5) === inp, "an unknown field is ignored");
const site = F.setFact(F.setFact(inp, "site", "phase1Result", "Recognized environmental condition"), "site", "industrialByRight", "no");
ok(F.factFlags(site, { todayISO: T0 }).length === 3, "open environmental items and a use not allowed by right are flagged too");
const rows = F.factRows(inp, { todayISO: T0 });
ok(rows.some((r) => r[1] === "SF per dock door" && r[2] === "7,000") && rows.some((r) => r[1] === "Paving remaining useful life" && r[2] === "3 years (to 2029)") && rows.every((r) => r[2] !== ""), "report rows: entered facts and the calculated ones");

// ── Import and export ──
const deals = [{ id: "a", inputs: inp }, { id: "b", inputs: { propertyName: "Other Park", squareFootage: 1000 } }];
const grid = F.factsGrid(deals);
ok(grid[0][0] === "Asset" && grid[0].length === 1 + F.BUILDING_FIELDS.length + F.SITE_FIELDS.length && grid[1][grid[0].indexOf("Clear height (ft)")] === 24 && grid[2][1] === "", "export: one row per asset, a column for each field");
const back = F.importFacts(grid, [{ id: "a", inputs: { ...inp, building: {} } }, deals[1]]);
ok(back.matched === 1 && JSON.stringify(Object.entries(back.updates.a.building).sort()) === JSON.stringify(Object.entries(inp.building).sort()) && !back.updates.b, "import: the exported file gives the same facts back; an asset with a blank row is unchanged");
const g2 = [["Property Name", "clear height (ft)", "Dock-High Doors", "Zoning", "Made up column"], ["fictional park", "30", "", "M1", "x"], ["Nowhere", "20", "1", "", ""]];
const r2 = F.importFacts(g2, deals);
ok(r2.updates.a.building.clearHeightFt === 30 && r2.updates.a.building.dockDoors === 6 && r2.updates.a.site.zoning === "M1" && r2.cells === 2 && r2.unknownAssets.join() === "Nowhere" && r2.unknownColumns.join() === "Made up column", "import: names and headers matched loosely; blank cells change nothing; unknown assets and columns are reported");

// ── SNDAs ──
const U = (name, tenant, sf, extra = {}) => ({ id: `u-${name}`, name, tenantName: tenant, squareFeet: sf, currentRentPSF: 10, leaseStatus: tenant ? "occupied" : "vacant", leaseEnd: "2028-01-01", ...extra });
const base = { propertyName: "Fictional Park", lenderName: "Fictional Bank", units: [U("001", "A Co", 5000), U("002", "B Co", 3000), U("003", "C Co", 2000), U("004", "", 1000)] };
const none = S.sndaCoverage(base);
ok(none.rule === "none" && none.required === 0 && none.status === "none" && none.label === "No requirement set" && S.sndaRows(base).every((r) => r.status === "not_required") && S.sndaRows(base).length === 3, "no rule set: none is required (user, 11/27); vacant units are not listed");
const all = { ...base, loanTerms: { sndaRule: "all" } };
ok(S.sndaCoverage(all).required === 3 && S.sndaCoverage(all).outstanding === 3 && S.sndaCoverage(all).label === "3 outstanding" && S.sndaRows(all)[0].label === "Required, not requested", "rule: all leases");
const min = { ...base, loanTerms: { sndaRule: "min_sf", sndaMinSF: 3000 } };
ok(S.sndaCoverage(min).required === 2 && S.sndaRuleText(min) === "leases of 3,000 SF or more", "rule: leases at or over a size");
let st = S.setSnda(S.setSnda(all, "u-001", { status: "signed", signedOn: "2026-03-09" }), "u-002", { status: "requested", requestedOn: "2026-11-05" });
const c = S.sndaCoverage(st);
ok(c.signed === 1 && c.outstanding === 2 && c.requested === 1 && c.notRequested === 1 && close(c.rentCoveredPct, 50) && close(c.sfCoveredPct, 50) && c.outstandingTenants.join() === "B Co,C Co", "coverage: 1 of 3 signed, 50% of occupied rent and SF covered; who is outstanding");
ok(S.sndaCoverage(S.setSnda(st, "u-003", { status: "not_required" })).required === 2, "a lease can be marked not required whatever the rule");
const full = S.setSnda(S.setSnda(st, "u-002", { status: "signed" }), "u-003", { status: "signed" });
ok(S.sndaCoverage(full).status === "complete" && S.sndaCoverage(full).label === "Complete" && close(S.sndaCoverage(full).rentCoveredPct, 100), "all signed: complete");
// The signed document.
const abs = { doc_type: "snda", tenant: "c co", unit: "003", lender: "Fictional Bank", landlord: "Owner LLC", date: "2026-11-20", non_disturbance: "x", attornment: "y", lender_cure_days: 30, lender_liability: "z", quotes: { tenant: "q" } };
const ap = S.applySndaDoc(st, abs, "doc-9");
ok(ap.applied && S.sndaRows(ap.inputs)[2].signed && ap.inputs.units[2].snda.signedOn === "2026-11-20" && ap.inputs.units[2].snda.docId === "doc-9" && ap.inputs.units[2].snda.lender === "Fictional Bank", "applying a signed SNDA marks its lease signed, with the date, the lender and the document");
ok(!S.applySndaDoc(st, { ...abs, tenant: "Nobody Inc", unit: "9" }).applied && /isn't a tenant/.test(S.applySndaDoc(st, { ...abs, tenant: "Nobody Inc", unit: "9" }).reason) && !S.applySndaDoc(st, { doc_type: "om" }).applied, "a document for a tenant not on the rent roll, or not an SNDA, changes nothing");
const dr = S.sndaDocRows({ ...abs, lender: "Another Bank" }, st);
ok(dr.find((r) => r.key === "lender").ok === false && dr.find((r) => r.key === "tenant").ok === true && dr.find((r) => r.key === "tenant").quote === "q", "the terms are shown against the asset: a different lender is called out");
ok(S.parseSndaTitle(`${S.SNDA_TAG("003")} c-co-snda.pdf`).unit === "003" && S.sndaDocs([{ id: "d", deal_id: "x", title: "[snda:003] f.pdf" }, { id: "e", deal_id: "x", title: "OM" }], "x").length === 1, "the document is filed on the asset with its unit in the title");
const x = S.sndaXlsx([{ id: "a", inputs: st }]);
ok(x[0][0] === "SNDA status by lease" && x.filter((r) => r[0] === "Fictional Park").length === 4 && x.some((r) => r[8] === "2 outstanding"), "Excel: status by lease and coverage by loan");

// ── Sample data: written from the fund ──
const fund = buildSampleFund({ todayISO: T0 });
ok(fund.deals.length === 9 && fund.deals.every((d) => Object.keys(d.inputs.building ?? {}).length >= 20 && Object.keys(d.inputs.site ?? {}).length >= 15 && d.inputs.building.footprintSF === d.inputs.squareFootage), "all nine sample assets have building and site facts; the footprint is the asset's SF");
ok(fund.deals.every((d) => { const a = F.assetFacts(d.inputs, { todayISO: T0 }); return a.siteCoveragePct > 20 && a.siteCoveragePct < 60 && a.officePct >= 5 && a.officePct <= 15 && a.roof && a.paving; }), "their ratios are plausible (site coverage 20–60%, office 5–15%) and both lives are calculated");
const sn = fund.deals.filter((d) => SA.SAMPLE_SNDA_ASSETS.includes(d.id));
ok(sn.length === 2 && sn.every((d) => { const c2 = S.sndaCoverage(d.inputs); return c2.rule === "all" && c2.signed === 2 && c2.requested === 2 && c2.required === c2.leases && c2.outstanding === c2.leases - 2 && S.sndaRows(d.inputs).filter((r) => r.signed).every((r) => r.lender === d.inputs.lenderName); }), "the two assets with a sample loan agreement: every lease required, two signed, two requested, with the asset's own lender");
ok(fund.deals.filter((d) => !SA.SAMPLE_SNDA_ASSETS.includes(d.id)).every((d) => S.sndaCoverage(d.inputs).status === "none"), "the other seven have no requirement set");
const loans = FD.fundLoans(fund.deals, fund.valuations, T0);
ok(S.sndaByLoan(loans).length === loans.length && S.sndaByLoan(loans).filter((r) => r.status === "outstanding").length === 2 && FD.fundDebtXlsx("Model Fund I", loans, T0).some((r) => r[0] === "SNDA coverage"), "Portfolio Debt: a coverage row per loan, two with SNDAs outstanding; in its Excel");
// Nothing of the user's is replaced by the automatic load.
const mine = { ...fund.deals[0].inputs, building: { clearHeightFt: 99 }, site: {} };
ok(SA.withSampleAssetFacts(mine, "sample-deal-1").building.clearHeightFt === 99 && Object.keys(SA.withSampleAssetFacts(mine, "sample-deal-1").site).length > 10, "the load fills only a section with nothing in it");
ok(SA.withSampleSnda(fund.deals[0].inputs, "sample-deal-1") === fund.deals[0].inputs && SA.withSampleSnda({ ...fund.deals[0].inputs, loanTerms: { sndaRule: "min_sf" }, units: fund.deals[0].inputs.units.map((u) => ({ ...u, snda: undefined })) }, "sample-deal-1").loanTerms.sndaRule === "min_sf", "SNDA statuses are added once; a rule the user set is kept");
ok(SAMPLE_DATA_VERSION === 10, "the automatic load's version is 10 (1.1.23)");
// 1.1.18: the load as app/page.jsx runs it, twice over (the second pass is the
// safety step of 1.1.14). The credit step must not put back the units as they
// were at the start, or the SNDA statuses set by the first pass are lost.
{
  const SC = j(R + "/lib/sampleCredit.js");
  const bare = buildSampleFund({ todayISO: T0 });
  const start = bare.deals.map((d) => ({ ...d, inputs: { ...d.inputs, loanTerms: (() => { const { sndaRule, ...rest } = d.inputs.loanTerms ?? {}; return rest; })(), units: d.inputs.units.map(({ snda, ...u }) => u) } }));
  ok(start.every((d) => d.inputs.units.every((u) => !u.snda) && !d.inputs.loanTerms.sndaRule), "a firm saved before 1.1.17 has no SNDA rule and no statuses");
  const credit = SC.addSampleCredit(start, { todayISO: T0, funds: {}, fundName: "Model Fund I" });
  const step = (d, repair = false) => ({ ...d, inputs: SA.withSampleSnda(SA.withSampleAssetFacts(SC.mergeCreditUpdate(d.inputs, credit.updates[d.id]), d.id), d.id, { repair }) });
  const twice = start.map((d) => step(d)).map((d) => step(d));
  const counts = (ds) => ds.filter((d) => SA.SAMPLE_SNDA_ASSETS.includes(d.id)).map((d) => { const c = S.sndaCoverage(d.inputs); return `${c.signed}/${c.requested}`; }).join();
  ok(counts(twice) === "2/2,2/2", `after both passes of the load, each of the two assets has two leases signed and two requested (${counts(twice)})`);
  ok(twice.every((d) => d.inputs.units.every((u) => u.leaseStatus !== "occupied" || !u.tenantName || u.credit)), "and the credit records are there too");
  // What 1.1.17 did: the update replaced the unit list.
  const old = (d) => ({ ...d, inputs: SA.withSampleSnda(SA.withSampleAssetFacts(credit.updates[d.id] ? { ...d.inputs, ...credit.updates[d.id] } : d.inputs, d.id), d.id) });
  const broken = start.map(old).map(old);
  ok(counts(broken) === "0/0,0/0" && broken.filter((d) => SA.SAMPLE_SNDA_ASSETS.includes(d.id)).every((d) => d.inputs.loanTerms.sndaRule === "all"), "the 1.1.17 load is reproduced: the rule saved, every status lost");
  const repaired = broken.map((d) => step(d, true)).map((d) => step(d, true));
  ok(counts(repaired) === "2/2,2/2", "the next load repairs a firm left that way");
  const userRule = { ...broken[0], inputs: { ...broken[0].inputs, loanTerms: { ...broken[0].inputs.loanTerms, sndaRule: "min_sf", sndaMinSF: 5000 } } };
  ok(S.sndaCoverage(step(userRule, true).inputs).signed === 0 && step(userRule, true).inputs.loanTerms.sndaRule === "min_sf", "a rule the user changed is not touched by the repair");
  // mergeCreditUpdate takes only the credit fields.
  const d0 = twice[0].inputs, edited = { ...d0, units: d0.units.map((u, i) => (i === 0 ? { ...u, tenantName: "Renamed By User", currentRentPSF: 99 } : u)) };
  const merged = SC.mergeCreditUpdate(edited, credit.updates[twice[0].id]);
  ok(merged.units[0].tenantName === "Renamed By User" && merged.units[0].currentRentPSF === 99 && merged.units[0].snda?.status === "signed" && merged.units[0].credit && SC.mergeCreditUpdate(edited, undefined) === edited, "the credit step keeps everything else on a unit (a rename, a rent, an SNDA status)");
}

// ── The sample documents say what the fund holds ──
const man = require(R + "/public/sample-docs/manifest.json");
const dir = R + "/public/sample-docs/";
ok(man.assetFacts.length === 16 && man.assetFacts.filter((m) => m.kind === "snda").length === 4 && [...new Set(man.assetFacts.filter((m) => m.kind !== "snda").map((m) => m.asset))].length === 3 && man.assetFacts.every((m) => fs.existsSync(dir + m.file) && fs.existsSync(dir + m.abstract)), "16 documents: four each on three assets and four signed SNDAs, every file there");
const dealOf = (name) => fund.deals.find((d) => d.inputs.propertyName === name);
const disagree = [];
for (const m of man.assetFacts.filter((x) => x.kind !== "snda")) {
  const a = JSON.parse(fs.readFileSync(dir + m.abstract, "utf8")), d = dealOf(m.asset);
  const rs = F.factDocRows(a, d.inputs);
  if (!F.isFactDoc(a) || !rs.length || rs.some((r) => r.differs || r.now == null || !r.quote)) disagree.push(m.name);
  if (JSON.stringify(F.applyFactDoc(d.inputs, a)) !== JSON.stringify(d.inputs)) disagree.push(m.name + " (apply)");
}
ok(disagree.length === 0, `every fact in a property condition report, Phase I report, survey and roof warranty is the one the asset holds, with its quote; applying one changes nothing${disagree.length ? ": " + disagree.join(", ") : ""}`);
const sndaOff = [];
for (const m of man.assetFacts.filter((x) => x.kind === "snda")) {
  const a = JSON.parse(fs.readFileSync(dir + m.abstract, "utf8")), d = dealOf(m.asset);
  const u = d.inputs.units.find((z) => z.name === a.unit);
  const u0 = require(R + "/scripts/sample-deal-docs/fund.json").assets.find((z) => z.id === d.id);
  if (!u || u.tenantName !== a.tenant || u.snda?.status !== "signed" || u.snda.signedOn !== a.date || a.lender !== d.inputs.lenderName || a.loan_amount !== u0.loan.amount || S.sndaDocRows(a, d.inputs).some((r) => r.ok === false) || JSON.stringify(S.applySndaDoc(d.inputs, a).inputs.units.find((z) => z.name === a.unit).snda) !== JSON.stringify({ ...u.snda, docId: null })) sndaOff.push(m.name);
}
ok(sndaOff.length === 0, `every signed sample SNDA names a tenant, unit, lender, loan amount and date the fund holds, and its lease is marked signed on that date${sndaOff.length ? ": " + sndaOff.join(", ") : ""}`);
// The loader.
const plan = SD.sampleDocPlan(man, { deals: fund.deals });
const facts = plan.add.filter((p) => p.kind === "fact");
ok(facts.length === 16 && facts.filter((p) => p.factKind === "snda").every((p) => /^\[snda:00[12]\] /.test(p.docTitle)) && facts.filter((p) => p.factKind === "pcr").every((p) => /^\[fact:pcr\] .*-pcr\.pdf$/.test(p.docTitle)), "the loader files each on its asset, tagged with its kind or its unit");
const again = SD.sampleDocPlan(man, { deals: fund.deals, docs: facts.map((p) => ({ deal_id: p.dealId, title: p.docTitle, files: [{ name: p.file.split("/").pop() }] })) });
ok(again.add.filter((p) => p.kind === "fact").length === 0, "run again, nothing is uploaded twice");
ok(F.factDocs(facts.map((p) => ({ id: p.name, deal_id: p.dealId, title: p.docTitle })), "sample-deal-1").length === 4 && S.sndaDocs(facts.map((p) => ({ id: p.name, deal_id: p.dealId, title: p.docTitle })), "sample-deal-1").length === 2, "asset setup finds the four source documents, the Leases tab the two SNDAs");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
