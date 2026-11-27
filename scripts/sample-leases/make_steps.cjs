// Writes lib/sampleLeaseSteps.json (1.1.21): the rent steps each Model Fund I
// sample lease states, for its tenant's unit. lib/sampleFund.js puts them on
// the unit, so the model pays the lease's rent on the lease's dates instead
// of escalating the unit's rent a little each month.
//
// The steps are read from the lease abstracts with the app's own function
// (lib/leaseApply.js), as a user would by applying the lease. The leases are
// written from the unit's rent, escalation and expiration only
// (scripts/sample-leases/leases.py), never from a modelled figure, so the
// order is: export_fund.cjs → the leases → this file → export_fund.cjs again
// (the modelled figures) → the deal documents → make_terms.cjs.
//   node scripts/sample-leases/make_steps.cjs          writes the file
//   node scripts/sample-leases/make_steps.cjs --check  exits 1 if it is stale
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const LA = j(R + "/lib/leaseApply.js");
const { buildSampleDeals } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");

function compute() {
  const deals = buildSampleDeals(DEFAULT_INPUTS);
  const index = JSON.parse(fs.readFileSync(path.join(R, "docs", "sample-leases", "index.json"), "utf8")).filter((l) => l.fund);
  const out = {}, problems = [];
  for (const l of index) {
    const deal = deals.find((d) => d.inputs.propertyName === l.asset);
    const unit = deal?.inputs.units.find((u) => u.tenantName === l.tenant);
    const stem = l.files[0].replace(/\.pdf$/, "");
    if (!unit) { problems.push(`${stem}: ${l.tenant} is not on ${l.asset}'s rent roll`); continue; }
    const abs = JSON.parse(fs.readFileSync(path.join(R, "docs", "sample-leases", "abstracts", `${stem}.json`), "utf8"));
    const steps = LA.abstractUnitValues(abs, deal.inputs).values.rentSteps ?? [];
    const now = LA.stepOn(steps, deal.inputs.acquisitionDate);
    if (!steps.length) problems.push(`${stem}: the lease has no rent schedule`);
    else if (!now || Math.abs(now.rentPSF - unit.currentRentPSF) > 0.005) problems.push(`${stem}: the lease's rent on the acquisition date (${now?.rentPSF}) is not the unit's (${unit.currentRentPSF})`);
    for (let i = 1; i < steps.length; i++) if (Math.abs((steps[i].rentPSF / steps[i - 1].rentPSF - 1) * 100 - unit.annualEscalationPct) > 0.06) problems.push(`${stem}: step ${i + 1} does not grow at the unit's ${unit.annualEscalationPct}%`);
    if (steps.length && steps.at(-1).end !== unit.leaseEnd) problems.push(`${stem}: the last step ends ${steps.at(-1).end}, the unit's lease ${unit.leaseEnd}`);
    (out[deal.id] ??= {})[unit.name] = { tenant: unit.tenantName, rentSteps: steps };
  }
  return { out, problems };
}
const { out, problems } = compute();
if (problems.length) { console.error("The sample leases disagree with the rent rolls:\n  " + problems.join("\n  ")); process.exit(1); }
const text = JSON.stringify(out, null, 1) + "\n";
const file = path.join(R, "lib", "sampleLeaseSteps.json");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (cur !== text) { console.error("lib/sampleLeaseSteps.json is stale: run node scripts/sample-leases/make_steps.cjs"); process.exit(1); }
  console.log("lib/sampleLeaseSteps.json is current");
} else { fs.writeFileSync(file, text); console.log("wrote", file, Object.values(out).reduce((s, u) => s + Object.keys(u).length, 0), "units"); }
