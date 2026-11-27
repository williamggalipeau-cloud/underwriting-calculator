// 1.1.21: the sample leases' rent steps on their units, the figures that
// moved with them, and the load step that updates saved sample values only
// where they are still the earlier sample figure.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { underwrite } = j(R + "/lib/calculations.js");
const LA = j(R + "/lib/leaseApply.js");
const LS = j(R + "/lib/sampleLeaseSteps.js");
const DT = j(R + "/lib/sampleDocTerms.js");
const SD = j(R + "/lib/sampleDocs.js");
const CH = require(R + "/lib/sampleTermChanges.json");
const DOCS = require(R + "/lib/sampleDocChanges.json");
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const f = buildSampleFund({ todayISO: "2026-11-27" });
const index = JSON.parse(fs.readFileSync(R + "/docs/sample-leases/index.json", "utf8")).filter((l) => l.fund);

check((() => { try { execFileSync(process.execPath, [R + "/scripts/sample-leases/make_steps.cjs", "--check"], { stdio: "pipe" }); return true; } catch { return false; } })(), "lib/sampleLeaseSteps.json is what the lease abstracts state (make_steps.cjs --check)");
let stepped = 0;
for (const l of index) {
  const d = f.deals.find((x) => x.inputs.propertyName === l.asset), a = d.inputs, u = a.units.find((x) => x.tenantName === l.tenant);
  const abs = JSON.parse(fs.readFileSync(`${R}/docs/sample-leases/abstracts/${l.files[0].replace(/\.pdf$/, ".json")}`, "utf8"));
  const fromLease = LA.abstractUnitValues(abs, a).values.rentSteps;
  stepped++;
  check(JSON.stringify(u.rentSteps) === JSON.stringify(fromLease) && LA.stepOn(u.rentSteps, a.acquisitionDate).rentPSF === u.currentRentPSF && u.rentSteps.at(-1).end === u.leaseEnd, `${l.asset}: ${l.tenant}'s unit holds the lease's rent steps; the step in force at acquisition is the unit's rent and the last one ends with the lease`);
  check(!LA.compareWithUnit(abs, u, a).some((r) => r.differs), `${l.asset}: the lease and the rent roll agree on every term, rent steps included`);
  // The lease wins: the model pays the step in force, not the unit's monthly escalation.
  const flat = underwrite({ ...a, units: a.units.map((x) => (x.id === u.id ? { ...x, rentSteps: undefined } : x)) }), withSteps = underwrite(a);
  const d1 = withSteps.annualCashFlows[0].noi - flat.annualCashFlows[0].noi;
  check(Math.abs(d1) > 1 && Math.abs(d1) < 1000 && Math.abs(withSteps.returns.irr - flat.returns.irr) < 0.01 && withSteps.debt.loanAmount === flat.debt.loanAmount, `${l.asset}: the steps move year-one NOI by $${Math.round(d1)} (under $1,000), IRR by under 0.01 points, the loan not at all`);
}
check(stepped === 9 && f.deals.every((d) => d.inputs.units.filter((u) => u.rentSteps?.length).length === 1), "one unit on each of the nine sample assets has rent steps");
// The load step for the steps.
{
  const d = f.deals[2], bare = { ...d.inputs, units: d.inputs.units.map(({ rentSteps: _s, ...u }) => u) };
  const once = LS.withSampleLeaseSteps(bare, d.id);
  const strip = (x) => JSON.stringify({ ...x, units: x.units.map(({ rentSteps: _s, ...u }) => u) });
  check(strip(once) === strip(bare) && once.units.every((u, i) => JSON.stringify(u.rentSteps) === JSON.stringify(d.inputs.units[i].rentSteps)) && LS.withSampleLeaseSteps(once, d.id) === once, "the load puts the steps on the unit, once, and changes nothing else");
  const moved = { ...bare, units: bare.units.map((u) => (u.rentSteps === undefined && d.inputs.units.find((x) => x.id === u.id).rentSteps ? { ...u, tenantName: "Someone Else LLC" } : u)) };
  const own = { ...bare, units: bare.units.map((u) => (d.inputs.units.find((x) => x.id === u.id).rentSteps ? { ...u, rentSteps: [{ start: "2026-01-01", rentPSF: 1 }] } : u)) };
  check(LS.withSampleLeaseSteps(moved, d.id) === moved && LS.withSampleLeaseSteps(own, d.id) === own && LS.withSampleLeaseSteps(bare, "deal-1") === bare, "a unit with another tenant, a unit with steps of its own, and a non-sample asset are left alone");
}
// The figures that moved: the changes file is exactly the difference the documents show, and the built fund holds the new values.
{
  const list = CH["8"];
  check(list.length === 11 && list.every(([id, field, from, to]) => f.deals.some((d) => d.id === id) && from !== to && typeof field === "string"), "eleven saved sample figures change in version 8");
  const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
  check(list.every(([id, field, , to]) => { const a = f.deals.find((d) => d.id === id).inputs; return get(a, field.startsWith("sale.") ? `dispositions.0.${field.slice(5)}` : field) === to; }), "the fund as built holds each new value");
  const ic = JSON.parse(fs.readFileSync(R + "/docs/sample-deal-docs/deals/abstracts/airport-flex-ic-memo.json", "utf8"));
  const noi1 = Math.round(underwrite(f.deals[0].inputs).annualCashFlows[0].noi);
  check(JSON.stringify(ic).includes(`$${noi1.toLocaleString("en-US")}`) && f.deals[0].inputs.icApproved.noi1 === noi1, `Airport Flex Park: the IC memo's year-one NOI is the model's ($${noi1.toLocaleString("en-US")})`);
  for (const [id, slug] of [["sample-deal-3", "harbor-light"], ["sample-deal-6", "mill-creek"]]) {
    const sale = f.deals.find((d) => d.id === id).inputs.dispositions[0];
    const bov = fs.readFileSync(`${R}/docs/sample-deal-docs/dispositions/abstracts/${slug}-bov.json`, "utf8"), loi = fs.readFileSync(`${R}/docs/sample-deal-docs/dispositions/abstracts/${slug}-loi.json`, "utf8");
    const usd = (v) => `$${v.toLocaleString("en-US")}`;
    check(bov.includes(usd(sale.bovs[0].price)) && bov.includes(usd(sale.targetPrice)) && bov.includes(`${sale.bovs[0].capPct.toFixed(2)}%`) && loi.includes(usd(sale.offers[0].price)), `${slug}: the sale's value, list price, cap rate and offer are the ones its broker opinion and offer letter state`);
  }
  // Old → new, only where untouched; twice changes nothing more.
  const old = (d) => { let a = d.inputs; for (const [id, field, from] of list) if (id === d.id) { const keys = (field.startsWith("sale.") ? `dispositions.0.${field.slice(5)}` : field).split("."); const set = (o, ks) => { const c = Array.isArray(o) ? [...o] : { ...o }; c[ks[0]] = ks.length === 1 ? from : set(o[ks[0]], ks.slice(1)); return c; }; a = set(a, keys); } return a; };
  for (const id of ["sample-deal-1", "sample-deal-3", "sample-deal-6"]) {
    const d = f.deals.find((x) => x.id === id), before = old(d);
    const after = DT.withSampleTermChanges(before, id, { fromVersion: 7 });
    check(JSON.stringify(before) !== JSON.stringify(d.inputs) && JSON.stringify(after) === JSON.stringify(d.inputs) && DT.withSampleTermChanges(after, id, { fromVersion: 7 }) === after, `${d.inputs.propertyName}: a version-7 asset is brought to the new figures, and a second pass changes nothing`);
    check(DT.withSampleTermChanges(before, id, { fromVersion: 8 }) === before, `${d.inputs.propertyName}: a firm already at version 8 is not touched`);
  }
  const d3 = f.deals.find((x) => x.id === "sample-deal-3"), b3 = old(d3);
  const edited = { ...b3, dispositions: [{ ...b3.dispositions[0], targetPrice: 11000000, offers: [{ ...b3.dispositions[0].offers[0], price: 9990000 }, ...b3.dispositions[0].offers.slice(1)] }] };
  const e2 = DT.withSampleTermChanges(edited, "sample-deal-3", { fromVersion: 7 });
  check(e2.dispositions[0].targetPrice === 11000000 && e2.dispositions[0].offers[0].price === 9990000 && e2.dispositions[0].bovs[0].price === 10200000, "a list price and an offer the user changed are kept; the untouched broker opinion is updated");
  const mine = { ...b3, dispositions: [{ id: "mine", stage: "marketing", startedFrom: "Sell/Hold", targetPrice: 10450000 }] };
  check(DT.withSampleTermChanges(mine, "sample-deal-3", { fromVersion: 7 }) === mine && DT.withSampleTermChanges({ ...b3, dispositions: [] }, "sample-deal-3", { fromVersion: 7 }).dispositions.length === 0, "a sale the user started, or no sale at all, is left alone");
}
// The five documents are replaced, not doubled.
{
  const names = [...DOCS["8"], ...DOCS.sales["8"]];
  check(names.length === 5 && names.every((n) => fs.existsSync(`${R}/public/sample-docs/${n.includes("ic-memo") ? "deals" : "dispositions"}/${n}`)), "five rewritten documents are listed for version 8, and their new copies are published");
  const sample = { app: { made_with: "Sample (fictional)" } };
  const stored = [
    { id: "a", deal_id: "sample-deal-1", title: "IC memo", abstract: sample, files: [{ name: "airport-flex-ic-memo.pdf" }] },
    { id: "b", deal_id: "sample-deal-1", title: "OM", abstract: sample, files: [{ name: "airport-flex-om.pdf" }] },
    { id: "c", deal_id: "sample-deal-3", title: "[sale:s1] BOV: harbor-light-bov.pdf", abstract: sample, files: [{ name: "harbor-light-bov.pdf" }] },
    { id: "d", deal_id: "sample-deal-3", title: "[sale:s1] BOV: harbor-light-bov.pdf", abstract: { app: { made_with: "Claude" } }, files: [{ name: "harbor-light-bov.pdf" }] },
    { id: "e", deal_id: "sample-deal-2", title: "[sale:s2] BOV: route9-bov.pdf", abstract: sample, files: [{ name: "route9-bov.pdf" }] },
  ];
  const gone = [...SD.supersededSampleDocs(stored, DOCS, { fromVersion: 7 }), ...SD.supersededSampleSaleDocs(stored, DOCS, { fromVersion: 7 })].map((x) => x.id).sort().join();
  check(gone === "a,c" && SD.supersededSampleDocs(stored, DOCS, { fromVersion: 8 }).length + SD.supersededSampleSaleDocs(stored, DOCS, { fromVersion: 8 }).length === 0, `from version 7 the earlier IC memo and broker opinion are removed; a document read by Claude, an unchanged document and a firm at version 8 are not (${gone})`);
}
console.log(`${pass} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
