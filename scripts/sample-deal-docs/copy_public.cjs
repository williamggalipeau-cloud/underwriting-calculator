// Copies the Model Fund I sample documents and their abstracts into
// public/sample-docs/ so the app can upload them for the user
// (Sample data → Add sample documents, user 11/25), and writes
// public/sample-docs/manifest.json. Fictional documents only.
// Usage: node scripts/sample-deal-docs/copy_public.cjs
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const OUT = path.join(R, "public", "sample-docs");
const FUND_I = ["Airport Flex Park", "Route 9 Small Bay", "Harbor Light Industrial", "Ridgeway Trade Center", "Canal Street Workshops", "Mill Creek Business Park", "Southpoint Flex", "Granite Ave Industrial", "Lakeshore Service Center"];
const PREFIX = { "airport-flex": "Airport Flex Park", route9: "Route 9 Small Bay", "harbor-light": "Harbor Light Industrial", "mill-creek": "Mill Creek Business Park", lakeshore: "Lakeshore Service Center", "model-fund-i": "" };
const assetOf = (name) => { const k = Object.keys(PREFIX).find((p) => name.startsWith(p + "-")); return k === undefined ? null : PREFIX[k]; };
// Asset documents that belong to a tenant's lease (insurance certificate, estoppel).
// A document about one tenant names it in its abstract (app.lease_tenant), so the upload links it to that tenant's lease.
fs.rmSync(OUT, { recursive: true, force: true });
const manifest = { deals: [], dispositions: [], leases: [], credit: [], gpAgreements: [] };
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };

for (const [set, key] of [["deals", "deals"], ["dispositions", "dispositions"]]) {
  const dir = path.join(R, "docs", "sample-deal-docs", set);
  for (const f of fs.readdirSync(path.join(dir, "abstracts")).sort()) {
    const name = f.replace(/\.json$/, "");
    const asset = assetOf(name);
    if (asset === null) continue; // not Model Fund I (e.g. Riverside billing)
    const abstract = JSON.parse(fs.readFileSync(path.join(dir, "abstracts", f), "utf8"));
    copy(path.join(dir, `${name}.pdf`), path.join(OUT, set, `${name}.pdf`));
    copy(path.join(dir, "abstracts", f), path.join(OUT, set, `${name}.json`));
    manifest[key].push({ name, file: `${set}/${name}.pdf`, abstract: `${set}/${name}.json`, docType: abstract.doc_type, asset: asset || null, fund: asset ? null : "Model Fund I", leaseTenant: abstract.app?.lease_tenant ?? null, title: abstract.title ?? name });
  }
}
const leases = JSON.parse(fs.readFileSync(path.join(R, "docs", "sample-leases", "index.json"), "utf8"));
for (const l of leases) {
  if (!FUND_I.includes(l.asset)) continue;
  const first = l.files[0].replace(/\.pdf$/, "");
  const abs = path.join(R, "docs", "sample-leases", "abstracts", `${first}.json`);
  for (const f of l.files) copy(path.join(R, "docs", "sample-leases", f), path.join(OUT, "leases", f));
  if (fs.existsSync(abs)) copy(abs, path.join(OUT, "leases", `${first}.json`));
  manifest.leases.push({ asset: l.asset, tenant: l.tenant, files: l.files.map((f) => `leases/${f}`), abstract: fs.existsSync(abs) ? `leases/${first}.json` : null });
}
// 1.1.9: the sample credit reports (tenant-screening/), read off the same
// file as the app's sample credit records. Tenant reports are filed on their
// asset, tagged to the tenant; prospect screenings on the prospect.
const reports = JSON.parse(fs.readFileSync(path.join(R, "lib", "sampleCreditReports.json"), "utf8"));
const TYPE = { app: "credit_screening", agency: "credit_report", own: "credit_memo" };
for (const [kind, list] of [["tenant", reports.tenants], ["prospect", reports.prospects]]) {
  for (const r of list) {
    copy(path.join(R, "docs", "sample-deal-docs", "tenant-screening", r.file), path.join(OUT, "credit", r.file));
    manifest.credit.push({ kind, asset: r.asset ?? null, tenant: r.tenant, type: TYPE[r.source], file: `credit/${r.file}`, title: r.file });
  }
}
// 1.1.10: the sample GP partner agreements and the abstracts Claude would read
// from them (Sample data → Add sample GP partners).
const gpDir = path.join(R, "docs", "sample-deal-docs", "gp-agreements");
for (const a of JSON.parse(fs.readFileSync(path.join(gpDir, "agreements.json"), "utf8")).agreements) {
  const base = a.file.replace(/\.pdf$/, "");
  copy(path.join(gpDir, a.file), path.join(OUT, "gp-agreements", a.file));
  copy(path.join(gpDir, "abstracts", `${base}.json`), path.join(OUT, "gp-agreements", `${base}.json`));
  manifest.gpAgreements.push({ partner: a.partner_name, portfolio: a.portfolio, deal: a.deal, file: `gp-agreements/${a.file}`, abstract: `gp-agreements/${base}.json` });
}
// 1.1.17: the documents behind the building and site facts, and the signed SNDAs.
const afDir = path.join(R, "docs", "sample-deal-docs", "asset-facts");
manifest.assetFacts = [];
for (const d of JSON.parse(fs.readFileSync(path.join(afDir, "index.json"), "utf8"))) {
  copy(path.join(afDir, d.file), path.join(OUT, "asset-facts", d.file));
  copy(path.join(afDir, "abstracts", `${d.name}.json`), path.join(OUT, "asset-facts", `${d.name}.json`));
  manifest.assetFacts.push({ name: d.name, kind: d.kind, asset: d.asset, unit: d.unit, tenant: d.tenant, file: `asset-facts/${d.file}`, abstract: `asset-facts/${d.name}.json`, title: d.title });
}
// 1.1.21: Property Management documents (tax bill, insurance declarations, service contract).
const pmDir = path.join(R, "docs", "sample-deal-docs", "property-mgmt");
manifest.propertyMgmt = [];
for (const d of JSON.parse(fs.readFileSync(path.join(pmDir, "index.json"), "utf8"))) {
  copy(path.join(pmDir, d.file), path.join(OUT, "property-mgmt", d.file));
  copy(path.join(pmDir, "abstracts", `${d.name}.json`), path.join(OUT, "property-mgmt", `${d.name}.json`));
  manifest.propertyMgmt.push({ name: d.name, kind: d.kind, section: d.section, asset: d.asset, file: `property-mgmt/${d.file}`, abstract: `property-mgmt/${d.name}.json`, title: d.title });
}
// 1.1.21: the market reports behind three assets' third-party research items.
const rsDir = path.join(R, "docs", "sample-deal-docs", "research");
manifest.research = [];
for (const d of JSON.parse(fs.readFileSync(path.join(rsDir, "index.json"), "utf8"))) {
  copy(path.join(rsDir, d.file), path.join(OUT, "research", d.file));
  copy(path.join(rsDir, "abstracts", `${d.name}.json`), path.join(OUT, "research", `${d.name}.json`));
  manifest.research.push({ name: d.name, kind: d.kind, researchId: d.researchId, asset: d.asset, file: `research/${d.file}`, abstract: `research/${d.name}.json`, title: d.title });
}
// 1.1.23: a sample document for each document type that had none
// (scripts/sample-deal-docs/more_docs.cjs), each into the list it belongs to.
const moreDir = path.join(R, "docs", "sample-deal-docs", "more");
manifest.acquisition = [];
manifest.leasing = [];
for (const d of JSON.parse(fs.readFileSync(path.join(moreDir, "index.json"), "utf8"))) {
  copy(path.join(moreDir, d.file), path.join(OUT, "more", d.file));
  copy(path.join(moreDir, "abstracts", `${d.name}.json`), path.join(OUT, "more", `${d.name}.json`));
  const abstract = JSON.parse(fs.readFileSync(path.join(moreDir, "abstracts", `${d.name}.json`), "utf8"));
  const base = { name: d.name, asset: d.asset, file: `more/${d.file}`, abstract: `more/${d.name}.json`, title: d.title };
  if (d.list === "library") manifest.deals.push({ ...base, docType: d.type, fund: null, leaseTenant: abstract.app?.lease_tenant ?? null });
  else if (d.list === "disposition") manifest.dispositions.push({ ...base, docType: d.type, fund: null, leaseTenant: abstract.app?.lease_tenant ?? null });
  else if (d.list === "pm") manifest.propertyMgmt.push({ ...base, kind: d.type, section: d.type });
  else if (d.list === "acquisition") manifest.acquisition.push({ ...base, type: d.type });
  else if (d.list === "leasing") manifest.leasing.push({ ...base, type: d.type, prospectId: d.link.prospectId ?? null, target: d.link.target ?? null, compIds: d.link.compIds ?? null, compRents: d.link.compRents ?? null });
  // The zoning report and the rent comp report are also the file of a third-party research item.
  if (d.link.researchId) manifest.research.push({ ...base, kind: d.type === "comps" ? "rent_survey" : d.type, researchId: d.link.researchId, compIds: d.link.compIds ?? null, compRents: d.link.compRents ?? null });
}
// 1.1.23: sample documents the fund already has, filed again under the
// third-party research item that summarises them (as a firm files a copy of
// a report with its research).
for (const [researchId, kind, asset, file, abstract, title] of [
  ["srs-1-appraisal", "appraisal", "Airport Flex Park", "deals/airport-flex-appraisal-2026q3.pdf", "deals/airport-flex-appraisal-2026q3.json", "Airport Flex Park appraisal (research copy)"],
  ["srs-1-environmental", "environmental", "Airport Flex Park", "asset-facts/airport-flex-phase1.pdf", "asset-facts/airport-flex-phase1.json", "Airport Flex Park Phase I report (research copy)"],
  ["srs-1-pca", "pca", "Airport Flex Park", "asset-facts/airport-flex-pcr.pdf", "asset-facts/airport-flex-pcr.json", "Airport Flex Park property condition report (research copy)"],
  ["srs-1-credit", "credit", "Airport Flex Park", "credit/screening-blue-mesa-fulfillment.pdf", null, "Blue Mesa Fulfillment credit screening report (research copy)"],
  ["srs-3-bov", "bov", "Harbor Light Industrial", "dispositions/harbor-light-bov.pdf", "dispositions/harbor-light-bov.json", "Harbor Light Industrial broker opinion (research copy)"],
]) {
  if (!fs.existsSync(path.join(OUT, file))) throw new Error(`research copy: ${file} is not among the sample documents`);
  manifest.research.push({ name: `${researchId}-copy`, kind, researchId, asset, file, abstract, title, copy: true });
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUT, "README.md"), "Copies of the fictional Model Fund I sample documents (docs/sample-deal-docs, docs/sample-leases, and the sample credit reports) for Sample data → Add sample documents. Regenerate with node scripts/sample-deal-docs/copy_public.cjs; do not edit here.\n");
console.log(`deals ${manifest.deals.length}, dispositions ${manifest.dispositions.length}, leases ${manifest.leases.length}, credit ${manifest.credit.length}, GP agreements ${manifest.gpAgreements.length}`);
