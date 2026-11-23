const R = require("path").resolve(__dirname, "..", ".."); const fs = require("fs"); const { execFileSync } = require("child_process");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const T = j(R + "/lib/dealDocTypes.js"); const A = j(R + "/lib/dealDocApply.js"); const Vn = j(R + "/lib/valuations.js");
const c = j(R + "/lib/calculations.js"); const sp = j(R + "/lib/samplePortfolio.js"); const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
let fail = 0; const ok = (cnd, m) => { console.log((cnd ? "PASS " : "FAIL ") + m); if (!cnd) fail++; };
const D = R + "/docs/sample-deal-docs/deals";
const abs = (n) => JSON.parse(fs.readFileSync(`${D}/abstracts/${n}.json`));
const doc = (n) => ({ id: "doc-" + n, doc_type: "appraisal", deal_id: "D", title: abs(n).title, abstract: abs(n), applied_fields: {} });
for (const n of ["airport-flex-appraisal-2026q3", "route9-appraisal-2026q2"]) {
  const probs = T.checkLocally(abs(n), execFileSync("pdftotext", ["-layout", `${D}/${n}.pdf`, "-"]).toString());
  ok(probs.length === 0, `${n}: quotes in the PDF${probs.length ? " — " + probs[0] : ""}`);
}
const deals = sp.buildSampleDeals(TEST_INPUTS);
const afDeal = deals.find((d) => d.inputs.propertyName === "Airport Flex Park");
const r9Deal = deals.find((d) => d.inputs.propertyName === "Route 9 Small Bay");
const af = afDeal.inputs, r9 = r9Deal.inputs;
const a = A.appraisalMark(doc("airport-flex-appraisal-2026q3"), af, {}, c.underwrite(af));
ok(a.quarter === "2026-09-30" && !a.heldAtCost && a.mark.value === 7650000 && a.mark.source === "appraisal" && a.mark.appraiser.startsWith("Fictional Valuation") && a.mark.capRate === 6.25 && a.mark.docId, "Airport Flex: Q3 2026 appraisal mark (value, source, appraiser, cap rate, document)");
ok(a.rows.every((r) => r.differs) && a.mark.notes.includes("p. 1"), "every mark field differs from an empty quarter; notes cite the page");
const noi = a.vsUw.find((r) => /NOI/.test(r.label)), gi = a.vsUw.find((r) => /going-in/.test(r.label)), xc = a.vsUw.find((r) => /exit/.test(r.label)), pv = a.vsUw.find((r) => /purchase/.test(r.label));
ok(noi && /year 1/.test(noi.label) && Math.abs(noi.diffPct - ((478000 - noi.underwriting) / noi.underwriting) * 100) < 1e-9, `NOI vs underwritten year 1 (${noi.diffPct.toFixed(1)}%)`);
ok(Math.round(xc.diffBp) === -50 && Math.abs(pv.diffPct - 6.25) < 0.01 && isFinite(gi.diffBp), `cap 6.25% vs 6.75% exit = −50 bp; value +6.25% vs price; going-in ${Math.round(gi.diffBp)} bp`);
const r = A.appraisalMark(doc("route9-appraisal-2026q2"), r9, {}, null);
ok(r.quarter === "2026-06-30" && r.heldAtCost, "Route 9: Q2 2026 is inside the cost hold (acquired 3/16/2026) → warning");
const existing = A.appraisalMark(doc("airport-flex-appraisal-2026q3"), af, { "2026-09-30": { value: 7400000, source: "internal" } });
ok(existing.existing.value === 7400000 && existing.rows.find((x) => x.key === "source").appValue === "internal", "replacing an internal mark is shown");
const same = A.appraisalMark(doc("airport-flex-appraisal-2026q3"), af, { "2026-09-30": a.mark });
ok(same.rows.every((x) => !x.differs), "once applied, nothing differs");
// The Valuations engine uses it as the Q3 fair value (appraisal basis)
const val = Vn.assetValuation(sp.snapshotDeal(af, "AF"), { "2026-09-30": a.mark }, { todayISO: "2026-11-22" });
const q3 = val.rows.find((x) => x.quarterEnd === "2026-09-30");
ok(q3 && q3.value === 7650000 && q3.basis === "appraisal", `Valuations Q3 2026: $${q3?.value?.toLocaleString()} (${q3?.basis})`);
const valR9 = Vn.assetValuation(sp.snapshotDeal(r9, "R9"), { [r.quarter]: r.mark }, { todayISO: "2026-11-22" });
const q2 = valR9.rows.find((x) => x.quarterEnd === "2026-06-30");
ok(q2 && q2.heldAtCost && q2.value !== 12800000, "Route 9 Q2 2026 stays at cost (the appraisal isn't used)");
const pr = T.dealDocPrompt({ doc: { id: "x", doc_type: "appraisal" }, assetName: "A", links: [] });
ok(/appraisal_validate/.test(pr) && /Do NOT call appraisal_show/.test(pr), "appraisal prompt: appraisal_validate, never appraisal_show");
console.log(fail ? fail + " FAILED" : "ALL PASS"); process.exit(fail ? 1 : 0);
