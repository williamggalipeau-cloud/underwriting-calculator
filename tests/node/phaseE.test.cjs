const R = require("path").resolve(__dirname, "..", ".."); const fs = require("fs"); const { execFileSync } = require("child_process");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const T = j(R + "/lib/dealDocTypes.js"); const A = j(R + "/lib/dealDocApply.js"); const V = j(R + "/lib/leaseViews.js");
const c = j(R + "/lib/calculations.js"); const sp = j(R + "/lib/samplePortfolio.js"); const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
let fail = 0; const ok = (cnd, m) => { console.log((cnd ? "PASS " : "FAIL ") + m); if (!cnd) fail++; };
const D = R + "/docs/sample-deal-docs/deals";
const abs = (n) => JSON.parse(fs.readFileSync(`${D}/abstracts/${n}.json`));
const doc = (n, extra = {}) => { const a = abs(n); return { id: "doc-" + n, doc_type: a.doc_type, deal_id: "D", fund_name: "Model Fund I", title: a.title, abstract: a, applied_fields: {}, ...extra }; };
const asOf = "2026-11-22";

// Local check against the PDF text, for every sample
for (const f of fs.readdirSync(D + "/abstracts").sort()) {
  const n = f.replace(".json", "");
  const text = execFileSync("pdftotext", ["-layout", `${D}/${n}.pdf`, "-"]).toString();
  const probs = T.checkLocally(abs(n), text);
  ok(probs.length === 0, `${n}: every quote is in the PDF and every figure in its quote${probs.length ? ` — ${probs.slice(0, 2).join("; ")}` : ""}`);
}
// A wrong figure is caught
const bad = abs("airport-flex-om"); bad.fields.find((f) => f.key === "asking_price").value = "$7,900,000";
ok(T.checkLocally(bad).some((p) => /7900000/.test(p)), "a figure not in its quote is flagged");

// Deal inputs: Airport Flex sample deal
const deals = sp.buildSampleDeals(TEST_INPUTS);
const af = deals.find((d) => d.inputs.propertyName === "Airport Flex Park").inputs;
const r9 = deals.find((d) => d.inputs.propertyName === "Route 9 Small Bay").inputs;

// OM
const om = A.compareDoc(doc("airport-flex-om"), { inputs: af });
ok(om.find((r) => r.target === "purchasePrice").docValue === 7500000 && /\+\$300,000/.test(om.find((r) => r.target === "purchasePrice").note), "OM asking $7.5M vs underwritten $7.2M (+$300,000)");
ok(!om.find((r) => r.target === "squareFootage").differs && om.find((r) => r.target === "vacancyPct").docValue === 8.3, "OM SF matches; vacancy from 91.7% occupancy = 8.3%");
const omNew = A.applyDoc(doc("airport-flex-om"), om.map((r) => r.key), { inputs: {} });
ok(omNew.inputs.propertyName === "Airport Flex Park" && omNew.inputs.city === "Las Vegas" && omNew.inputs.purchasePrice === 7500000 && omNew.inputs.yearBuilt === 1998, "New deal from OM: name, city, price, year built");

// T-12
const t12 = A.compareDoc(doc("airport-flex-t12"), { inputs: af });
const tax = t12.find((r) => r.target === "realEstateTaxPSF");
ok(tax.docValue === 1.25 && tax.appValue === 1.2 && tax.differs, `T-12 taxes $30,000 / 24,000 SF = $1.25 vs $1.20 (${tax.note})`);
ok(t12.find((r) => r.target === "managementFeePct").docValue === 6, "T-12 management fee 6% of revenue");
ok(t12.find((r) => r.target === "insurancePSF").flag === true, "insurance $0.40 vs $0.35 flagged (>10%)");
const t12a = A.applyDoc(doc("airport-flex-t12"), ["real_estate_taxes→realEstateTaxPSF"], { inputs: af });
ok(t12a.inputs.realEstateTaxPSF === 1.25 && t12a.inputs.insurancePSF === 0.35 && t12a.entries.length === 1, "apply only the ticked T-12 line");

// LOI / PSA
const loi = A.applyDoc(doc("airport-flex-loi"), A.compareDoc(doc("airport-flex-loi"), { inputs: af }).filter((r) => r.target.startsWith("dealTerms")).map((r) => r.key), { inputs: af });
ok(loi.inputs.dealTerms.deposit === 150000 && loi.inputs.dealTerms.ddDays === 45 && loi.inputs.purchasePrice === 7200000, "LOI deal terms applied without changing the price");
const psa = A.compareDoc(doc("airport-flex-psa"), { inputs: af });
ok(!psa.find((r) => r.target === "purchasePrice").differs && psa.find((r) => r.target === "dealTerms.closingDate").docValue === "2026-01-30", "PSA price matches the model; closing date read");

// IC memo
const icRows = A.compareDoc(doc("airport-flex-ic-memo"), { inputs: af });
const icA = A.applyDoc(doc("airport-flex-ic-memo"), icRows.map((r) => r.key), { inputs: af });
ok(icA.inputs.icApproved.price === 7200000 && icA.inputs.icApproved.irr === 29.5 && icA.inputs.icConditions.length === 4 && icA.inputs.purchasePrice === af.purchasePrice, "IC baseline and 4 conditions stored; model unchanged");
const resAf = c.underwrite(af);
const iv = A.icVariance(icA.inputs.icApproved, af, resAf);
const irrRow = iv.find((r) => r.key === "irr");
ok(iv.length >= 10 && Math.abs(irrRow.current - resAf.returns.irr) < 1e-9 && Math.abs(irrRow.diff - (resAf.returns.irr - 29.5)) < 1e-9, `IC approved vs current: IRR ${irrRow.approved}% vs ${irrRow.current.toFixed(1)}%`);
const icB = A.applyDoc(doc("airport-flex-ic-memo"), ["icConditions"], { inputs: { ...af, icConditions: [{ id: "c1", text: "Lender term sheet at 65% LTV or better", deadline: "2026-01-10", done: true, doneBy: "x" }] } });
ok(icB.inputs.icConditions.find((x) => x.text.startsWith("Lender")).done === true, "re-applying keeps conditions already ticked off");

// Closing statements
const ca = A.applyDoc(doc("airport-flex-closing-acq"), A.compareDoc(doc("airport-flex-closing-acq"), { inputs: af }).map((r) => r.key), { inputs: af });
ok(ca.inputs.actualBasis.equityFunded === 2424250 && ca.inputs.acquisitionDate === "2026-01-30" && Object.values(ca.inputs.closingCosts).reduce((a, b) => a + b, 0) === 288000, "acquisition closing: actual basis, date, closing costs total $288,000");
const dRows = A.compareDoc(doc("route9-closing-disp"), { inputs: r9 });
const dA = A.applyDoc(doc("route9-closing-disp"), dRows.map((r) => r.key), { inputs: r9 });
ok(dA.inputs.realizedSalePrice === 14850000 && dA.inputs.realizedSellingCosts === 386100 && dA.inputs.realizedSaleDate === "2026-10-30" && dA.inputs.holdPeriodYears === 1, `disposition: realized sale, costs, date, hold ${dA.inputs.holdPeriodYears}`);
const rSold = c.underwrite(dA.inputs);
ok(rSold.returns.exitValue === 14850000 && Math.abs(rSold.returns.equityReversion - (14850000 - 386100 - rSold.annualCashFlows[0].loanBalance)) < 1, "engine uses the realized price and costs");
ok(c.underwrite(r9).returns.exitValue !== 14850000, "without a realized sale the modelled exit value is used");

// Rent roll
const mk = (name, sf) => ({ id: "new-" + name, name, squareFeet: sf, leaseStatus: "occupied", currentRentPSF: 0, monthsRemaining: 12, newLeaseTerm: 24, renewalProbabilityPct: 60, leaseType: "NNN" });
const rd = A.rentRollDiff(abs("airport-flex-rent-roll"), af.units, af, mk);
ok(rd.added.length === 1 && rd.added[0].tenantName === "Desert Aero Parts LLC" && rd.added[0].sicCode, `rent roll: Desert Aero is new (SIC ${rd.added[0].sicCode})`);
ok(rd.changed.length >= 1 && rd.removed.length === af.units.length - 3, `changed ${rd.changed.length}, not in document ${rd.removed.length}`);
const merge = A.applyRentRoll(abs("airport-flex-rent-roll"), af.units, af, mk, "merge");
const repl = A.applyRentRoll(abs("airport-flex-rent-roll"), af.units, af, mk, "replace");
ok(merge.units.length === af.units.length + 1 && repl.units.length === 4, `merge keeps the rest (${merge.units.length}); replace leaves the document's 4`);
ok(repl.entries.some((e) => e.field === "Unit removed") && merge.entries.every((e) => e.field !== "Unit removed"), "change-log entries per unit");

// Insurance
const lease02 = JSON.parse(fs.readFileSync(R + "/docs/sample-leases/abstracts/02-airport-flex-park-desert-aero.json"));
const req = A.leaseInsuranceRequirements(lease02);
ok(req.cglOccurrence === 1000000 && req.cglAggregate === 2000000 && req.umbrella === 2000000 && req.auto === 1000000 && req.workersComp && req.waiver, "lease insurance requirements parsed");
const tg = A.insuranceGaps(abs("airport-flex-insurance-desert-aero"), { leaseAbs: lease02, asOf });
ok(tg.length === 1 && /umbrella \$1,000,000 is below the lease's \$2,000,000/.test(tg[0].text), `tenant certificate gap: ${tg.map((g) => g.text).join("; ")}`);
const og = A.insuranceGaps(abs("airport-flex-insurance-owner"), { asOf });
ok(og.length === 2 && og.every((g) => /expires 2027-01-15/.test(g.text)), `owner policies expiring within 60 days: ${og.length}`);

// LPA → fund terms and limits
const terms = { targetEquity: 100000000, gpCommitPct: 5, mgmtFeePct: 1.5, prefPct: 9, catchUpGpPct: 100, investmentPeriodYears: 2, termYears: 5, extensionCount: 2, extensionYears: 1, subLineSizePct: 80, limits: [] };
const lr = A.compareDoc(doc("model-fund-i-lpa", { deal_id: null }), { terms });
ok(lr.filter((r) => !r.key.startsWith("limit:")).every((r) => !r.differs), "LPA fund terms match Model Fund I's");
ok(lr.filter((r) => r.key.startsWith("limit:")).length === 8 && lr.filter((r) => r.key.startsWith("limit:")).every((r) => r.differs), "8 investment limits to apply");
const la = A.applyDoc(doc("model-fund-i-lpa", { deal_id: null }), ["limit:state_pct", "limit:fund_ltv_pct"], { terms });
ok(la.terms.limits.length === 2 && la.terms.limits.find((x) => x.key === "state_pct").limit === 35 && la.terms.limits[0].quote, "limits applied one by one with clause and quote");
const la2 = A.applyDoc(doc("model-fund-i-ppm", { deal_id: null }), ["limit:state_pct"], { terms: la.terms });
ok(la2.terms.limits.filter((x) => x.key === "state_pct").length === 1, "a limit applied again replaces, not duplicates");

// Documents' deadlines in Critical dates
const docs = ["airport-flex-psa", "airport-flex-ic-memo", "airport-flex-insurance-owner", "airport-flex-loi"].map((n) => doc(n));
const dd = V.criticalDates([], { asOf, docs, assetName: () => "Airport Flex Park" });
ok(dd.filter((r) => r.source === "document").length === 4 + 2 + 3 + 1, `document deadlines listed (${dd.length})`);
const ins = dd.filter((r) => r.kind === "insurance_expiry");
ok(ins.filter((r) => r.status === "soon").length === 2 && ins.find((r) => r.date === "2027-01-30").status === "later", "insurance amber within 60 days (1/15/27), later at 69 days (1/30/27)");
ok(dd.find((r) => r.label.startsWith("Closing")).status === "past", "PSA closing (past) red");

// Prompt
const pr = T.dealDocPrompt({ doc: { id: "x", doc_type: "t12" }, assetName: "Airport Flex Park", links: [{ name: "t12.pdf", url: "https://example/x" }], saver: { userId: "u", email: "e@x", projectRef: "p" } });
ok(/t12_validate/.test(pr) && /Do NOT call t12_show/.test(pr) && /save_deal_abstract\('x'/.test(pr), "T-12 prompt: validate, never show, save through save_deal_abstract");
const pr2 = T.dealDocPrompt({ doc: { id: "y", doc_type: "psa" }, assetName: "A", links: [] });
ok(/no validator/.test(pr2) && !/psa_validate/.test(pr2), "PSA prompt: no validator, checked locally");
ok(T.parseDealAbstract(JSON.stringify(abs("airport-flex-om")), "t12").errors.length === 1, "abstract of the wrong type rejected");

console.log(fail ? fail + " FAILED" : "ALL PASS"); process.exit(fail ? 1 : 0);
