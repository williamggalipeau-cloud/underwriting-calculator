// Stress Testing: lower rent increases above 5% (user, 11/23), fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R }});
const { applyStress } = j(R + "/lib/stress.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const base = { vacancyDelta: 0, rentEscDelta: 0, rateDelta: 0, exitCapDelta: 0, opexDelta: 0, constructionDelta: 0 };
const d = FX.workspaceData().deals.find((x) => x.id === "sample-deal-1");
const esc = d.inputs.annualRentEscalationPct ?? 3;
ok(applyStress(d.inputs, { ...base, rentEscDelta: 8 }).annualRentEscalationPct === esc - 8, `an 8% cut takes market rent growth from ${esc}% to ${esc - 8}% (rents fall)`);
const irr = (k) => underwrite(applyStress(d.inputs, { ...base, rentEscDelta: k })).returns.irr;
const i0 = irr(0), i5 = irr(5), i10 = irr(10);
ok(isFinite(i10) && i10 < i5 && i5 < i0, `IRR keeps falling past 5%: ${i0.toFixed(2)}% → ${i5.toFixed(2)}% (5) → ${i10.toFixed(2)}% (10)`);
ok(applyStress(d.inputs, base).annualRentEscalationPct === esc, "no cut, no change");
if (fail) { console.log(`\n${fail} failed`); process.exitCode = 1; } else console.log("\nall passed");
