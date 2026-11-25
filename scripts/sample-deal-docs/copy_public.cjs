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
const LEASE_TENANT = { "airport-flex-insurance-desert-aero": "Desert Aero Parts LLC", "airport-flex-estoppel-desert-aero": "Desert Aero Parts LLC" };
fs.rmSync(OUT, { recursive: true, force: true });
const manifest = { deals: [], dispositions: [], leases: [] };
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
    manifest[key].push({ name, file: `${set}/${name}.pdf`, abstract: `${set}/${name}.json`, docType: abstract.doc_type, asset: asset || null, fund: asset ? null : "Model Fund I", leaseTenant: LEASE_TENANT[name] ?? null, title: abstract.title ?? name });
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
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUT, "README.md"), "Copies of the fictional Model Fund I sample documents (docs/sample-deal-docs, docs/sample-leases) for Sample data → Add sample documents. Regenerate with node scripts/sample-deal-docs/copy_public.cjs; do not edit here.\n");
console.log(`deals ${manifest.deals.length}, dispositions ${manifest.dispositions.length}, leases ${manifest.leases.length}`);
