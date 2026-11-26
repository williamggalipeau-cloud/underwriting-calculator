// 1.1.9 (user, 11/26): fictional sample credit report PDFs, read off the same
// file as the sample credit records (lib/sampleCreditReports.json), uploaded
// by Add sample documents and linked from Tenant Credit.
const fs = require("fs");
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const SP = j(R + "/lib/samplePortfolio.js");
const SL = j(R + "/lib/sampleLeasing.js");
const SC = j(R + "/lib/sampleCredit.js");
const SD = j(R + "/lib/sampleDocs.js");
const LD = j(R + "/lib/leasingDocs.js");
const REPORTS = require(R + "/lib/sampleCreditReports.json");
const manifest = require(R + "/public/sample-docs/manifest.json");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const T = "2026-11-26";

// The PDFs exist (docs and the public copy) and say what the data says.
const all = [...REPORTS.tenants, ...REPORTS.prospects];
ok(all.every((r) => fs.existsSync(`${R}/docs/sample-deal-docs/tenant-screening/${r.file}`) && fs.existsSync(`${R}/public/sample-docs/credit/${r.file}`)), `${all.length} PDFs, in docs/ and public/sample-docs/credit/`);
ok((manifest.credit ?? []).length === all.length && manifest.credit.filter((c) => c.kind === "tenant").length === REPORTS.tenants.length, "manifest lists every report (tenants and prospects)");
const text = (f) => require("child_process").execFileSync("pdftotext", ["-layout", `${R}/docs/sample-deal-docs/tenant-screening/${f}`, "-"]).toString();
const bm = REPORTS.tenants.find((r) => r.tenant === "Blue Mesa Fulfillment");
ok(/SAMPLE – FICTIONAL/.test(text(bm.file)) && /612/.test(text(bm.file)) && /Approved with conditions/.test(text(bm.file)) && /Personal guaranty/.test(text(bm.file)), "Blue Mesa's screening report: marked fictional, score 612, approved with conditions");
const cc = REPORTS.tenants.find((r) => r.tenant === "Copper Canyon Tile & Stone");
ok(/Business Credit Report/.test(text(cc.file)) && /74/.test(text(cc.file)), "Copper Canyon: business credit report, payment index 74");
ok(/Credit Assessment Memo/.test(text(REPORTS.tenants.find((r) => r.source === "own").file)) && /Weak/.test(text(REPORTS.tenants.find((r) => r.source === "own").file)), "Riverbend Flooring: our own assessment memo, Weak");
ok(all.every((r) => !/turbotenant|d&b|dun|experian|equifax|transunion/i.test(`${r.provider ?? ""}`)), "providers are fictional names, no real companies");

// The sample credit records are read off the same file.
let deals = SP.buildSampleDeals({});
const L = SL.addSampleLeasing(deals, { todayISO: T });
deals = deals.map((d) => (L.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...L.updates[d.id] } } : d));
const S = SC.addSampleCredit(deals, { todayISO: T });
deals = deals.map((d) => (S.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...S.updates[d.id] } } : d));
const recOf = (asset, tenant) => deals.find((d) => d.inputs.propertyName === asset).inputs.units.find((u) => u.tenantName === tenant)?.credit?.records?.[0];
ok(REPORTS.tenants.every((r) => { const x = recOf(r.asset, r.tenant); return x && x.file === r.file && x.date === r.reportDate && (x.score ?? null) === (r.score ?? null) && x.source === r.source && (x.provider || "") === (r.provider || ""); }), "every story tenant's record = its report (score, date, source, provider, file)");
ok(!recOf("Granite Ave Industrial", "Granite Courier"), "Granite Courier has no record and no report (Missing)");
const screened = deals.flatMap((d) => (d.inputs.leasing?.prospects ?? []).filter((p) => p.screening).map((p) => ({ d, p })));
ok(screened.length >= 1 && screened.every(({ p }) => { const r = SC.sampleProspectReport(p.tenant); return r && p.screening.file === r.file && p.screening.score === r.score && p.screening.reportDate === r.reportDate; }), `prospect screenings (${screened.length}) = their reports`);
const L2 = SL.addSampleLeasing(SP.buildSampleDeals({}), { todayISO: "2027-03-02" });
ok(Object.values(L2.updates).flatMap((u) => u.leasing?.prospects ?? []).filter((p) => p.kind === "new").every((p) => SC.sampleProspectReport(p.tenant)), "a report for every new sample prospect name, whatever the date");

// Add sample documents: tenant reports on the asset tagged to the tenant,
// prospect screenings on the prospect; not twice.
const plan = SD.sampleDocPlan(manifest, { deals, docs: [], leases: [] });
const cr = plan.add.filter((x) => x.kind === "credit");
const tn = cr.filter((x) => x.creditKind === "tenant"), pr = cr.filter((x) => x.creditKind === "prospect");
ok(tn.length === REPORTS.tenants.length && tn.every((x) => x.target === LD.tenantDocTarget(x.tenant)), `${tn.length} tenant reports, tagged to their tenant`);
ok(pr.length === screened.length && pr.every((x) => screened.some(({ p }) => p.id === x.target)), `${pr.length} prospect screenings, on the screened prospects (reports for names not in the pipeline aren't listed)`);
const docs = cr.map((x) => ({ deal_id: x.dealId, title: LD.leasingTitle({ target: x.target, type: x.type, name: x.file.split("/").pop() }), files: [{ name: x.file.split("/").pop() }] }));
ok(SD.sampleDocPlan(manifest, { deals, docs, leases: [] }).add.filter((x) => x.kind === "credit").length === 0, "added once: a second run skips them");
const parsed = LD.leasingDocs(docs).find((x) => x.target === LD.tenantDocTarget("Blue Mesa Fulfillment"));
ok(parsed && parsed.typeLabel === "Credit screening report" && parsed.name === bm.file, "the title reads back as the tenant's credit screening report");
ok(LD.leasingDocs(docs).find((x) => x.name === cc.file)?.typeLabel === "Credit report" && LD.leasingDocs(docs).find((x) => x.target === LD.tenantDocTarget("Riverbend Flooring"))?.typeLabel === "Credit assessment memo", "credit report and assessment memo types");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
