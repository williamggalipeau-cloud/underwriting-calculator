// Regression check (npm run test:regression): the nine sample deals' IRR,
// equity multiple and yearly cash flows must match tests/regression/expected.json
// exactly. A change here means the model's numbers moved: only update
// expected.json (UPDATE=1) when that change is intended and explained.
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const sp = j(R + "/lib/samplePortfolio.js");
const c = j(R + "/lib/calculations.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
const out = sp.buildSampleDeals(TEST_INPUTS).map((d) => {
  const r = c.underwrite(d.inputs);
  return [d.inputs.propertyName, r.returns.irr, r.returns.equityMultiple, JSON.stringify(r.irrFlows.map(Math.round))];
});
const file = path.join(__dirname, "expected.json");
if (process.env.UPDATE) {
  fs.writeFileSync(file, JSON.stringify(out) + "\n");
  console.log("expected.json updated");
  process.exit(0);
}
const expected = JSON.parse(fs.readFileSync(file, "utf8"));
let fail = 0;
out.forEach((row, i) => {
  const same = JSON.stringify(row) === JSON.stringify(expected[i]);
  console.log(`${same ? "PASS" : "FAIL"} ${row[0]}${same ? "" : `: expected ${JSON.stringify(expected[i])}, got ${JSON.stringify(row)}`}`);
  if (!same) fail++;
});
if (expected.length !== out.length) { console.log(`FAIL deal count ${out.length} vs ${expected.length}`); fail++; }
console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
