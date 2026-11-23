const R = require("path").resolve(__dirname, "..", ".."); const fs = require("fs"); const { execFileSync } = require("child_process");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const T = j(R + "/lib/dealDocTypes.js"); const A = j(R + "/lib/dealDocApply.js"); const V = j(R + "/lib/leaseViews.js");
const c = j(R + "/lib/calculations.js"); const sp = j(R + "/lib/samplePortfolio.js"); const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
let fail = 0; const ok = (cnd, m) => { console.log((cnd ? "PASS " : "FAIL ") + m); if (!cnd) fail++; };
const D = R + "/docs/sample-deal-docs/deals";
const abs = (n) => JSON.parse(fs.readFileSync(`${D}/abstracts/${n}.json`));
const doc = (n, deal = "D") => ({ id: "doc-" + n, doc_type: abs(n).doc_type, deal_id: deal, fund_name: "Model Fund I", title: abs(n).title, abstract: abs(n), applied_fields: {} });
const asOf = "2026-11-22";
for (const n of ["airport-flex-loan", "route9-loan", "airport-flex-cap-2026", "route9-cap-2026"]) {
  const probs = T.checkLocally(abs(n), execFileSync("pdftotext", ["-layout", `${D}/${n}.pdf`, "-"]).toString());
  ok(probs.length === 0, `${n}: quotes in the PDF, figures in quotes${probs.length ? " — " + probs.slice(0, 2).join("; ") : ""}`);
}
const deals = sp.buildSampleDeals(TEST_INPUTS);
const af = deals.find((d) => d.inputs.propertyName === "Airport Flex Park").inputs;
const r9 = deals.find((d) => d.inputs.propertyName === "Route 9 Small Bay").inputs;

// Loan agreement → Debt inputs
const lr = A.compareDoc(doc("airport-flex-loan"), { inputs: af });
const diff = lr.filter((r) => r.differs).map((r) => r.target);
ok(!lr.find((r) => r.target === "spreadPct").differs && !lr.find((r) => r.target === "loanTermYears").differs && !lr.find((r) => r.target === "extensionFeeAmount").differs, "loan agreement matches the model's spread, term and extension fee");
ok(diff.includes("loanAmountActual") && diff.includes("loanCovenants.dscr") && diff.includes("loanTerms.capMaxStrikePct"), "loan amount, covenants and cap requirement to apply");
const la = A.applyDoc(doc("airport-flex-loan"), lr.map((r) => r.key), { inputs: af });
ok(la.inputs.loanAmountActual === 4980000 && la.inputs.loanCovenants.dscr === 1.3 && la.inputs.loanCovenants.debtYieldPct === 8.5 && la.inputs.loanTerms.capMinRating === "A" && la.inputs.loanTerms.maturityDate === "2029-01-30" && la.inputs.loanTerms.docId, "loan terms, covenants and cap requirement stored");
const ra = c.underwrite(la.inputs), rb = c.underwrite(af);
ok(ra.debt.loanAmount === 4980000 && ra.debt.bindingConstraint === "Loan agreement" && Math.abs(ra.returns.irr - rb.returns.irr) < 1e-9, "engine uses the actual loan (same amount here: same IRR)");
const r9l = A.applyDoc(doc("route9-loan"), A.compareDoc(doc("route9-loan"), { inputs: r9 }).map((r) => r.key), { inputs: { ...r9, loanSizingConstraints: { ...r9.loanSizingConstraints, minDSCR: 1.6 } } });
ok(c.underwrite(r9l.inputs).debt.loanAmount === 9125000, "actual loan replaces the sizing tests even when a test would bind lower");
const ct = A.covenantTests(la.inputs, ra);
ok(ct.length === af.holdPeriodYears && ct.every((t) => t.dscrOk) && ct[0].dscr > 1.3, `covenant tests by year (year-1 DSCR ${ct[0].dscr.toFixed(2)}x ≥ 1.30x)`);
const tight = A.covenantTests({ ...la.inputs, loanCovenants: { dscr: 1.9, debtYieldPct: 12, ltvPct: 60 } }, ra);
ok(!tight[0].dscrOk && !tight[0].dyOk && !tight[0].ltvOk, "breaches flagged when covenants are tighter than the model");

// Cap confirmations
const capA = A.capFromDoc(doc("airport-flex-cap-2026"), la.inputs);
ok(capA.holdYear === 1 && capA.provider === "Fictional Capital Markets LLC" && capA.strikePct === 3.91 && capA.premium === 27858 && capA.notional === 4980000, "Airport Flex cap read: year 1, provider, strike, premium, notional");
const chA = A.capChecks(capA, la.inputs);
ok(chA.filter((k) => k.severity !== "low").length === 0 && chA.some((k) => /replacement cap is needed/.test(k.text)), `Airport Flex cap passes; replacement needed before maturity (${chA.map((k) => k.text).join(" | ")})`);
const capped = A.applyDoc(doc("airport-flex-cap-2026"), [`executedCap:1`], { inputs: la.inputs }).inputs;
ok(capped.executedCaps.length === 1 && capped.capPremiumAmount === 27858 && capped.capStrikeRatesByYear[0] === 5.91 && capped.capStrikeRatePct === 5.91, "executed cap → premium and all-in strike (3.91% + 2.00%) in the cash flows");
const capped2 = A.applyExecutedCap(capped, { ...capA, premium: 30000 });
ok(capped2.executedCaps.length === 1 && capped2.capPremiumAmount === 30000, "re-applying replaces the year's executed cap");
const ren = A.applyExecutedCap(capped, { ...capA, holdYear: 2, effective: "2027-01-30", termination: "2028-01-30", premium: 31000, strikePct: 4.0 });
ok(ren.capReplacementCosts[0] === 31000 && ren.capStrikeRatesByYear[1] === 6 && ren.capStrikeRatesByYear[0] === 5.91, "a renewal sets that year's replacement cost and strike only");
const r9c = A.applyDoc(doc("route9-loan"), A.compareDoc(doc("route9-loan"), { inputs: r9 }).map((r) => r.key), { inputs: r9 }).inputs;
const chB = A.capChecks(A.capFromDoc(doc("route9-cap-2026"), r9c), r9c);
ok(chB.some((k) => /rated BBB\+, below the loan's minimum A/.test(k.text)) && chB.some((k) => /Notional \$9,000,000 is below the loan of \$9,125,000/.test(k.text)), `Route 9 cap flagged: ${chB.filter((k) => k.severity === "high").map((k) => k.text).join(" | ")}`);
ok(A.ratingRank("A+") < A.ratingRank("A") && A.ratingRank("A2") === A.ratingRank("A") && A.ratingRank("BBB+") > A.ratingRank("A-"), "rating scale incl. Moody's");
ok(A.capChecks(capA, af).some((k) => /No loan agreement applied/.test(k.text)), "without a loan agreement the check says so");

// Critical dates
const dd = V.criticalDates([], { asOf, docs: [doc("airport-flex-loan", "AF"), doc("airport-flex-cap-2026", "AF")], assetName: () => "Airport Flex Park" });
const exp = dd.find((r) => r.kind === "cap_expiry"), rep = dd.find((r) => r.kind === "cap_replacement");
ok(exp.date === "2027-01-30" && rep.date === "2016-12-31".replace("2016", "2026") && rep.status === "soon", `cap expiry 1/30/2027; replacement due 12/31/2026 (30 days before, from the loan) — ${rep.status}`);
ok(dd.some((r) => r.label === "Initial maturity" && r.date === "2029-01-30") && dd.some((r) => r.label === "First extension notice deadline" && r.date === "2028-12-01"), "loan maturity and extension notice deadline");

// Prompt
const pr = T.dealDocPrompt({ doc: { id: "x", doc_type: "loan" }, assetName: "A", links: [] });
ok(/loan_validate_abstract/.test(pr) && /Do NOT call loan_show_abstract/.test(pr), "loan prompt validates with loan_validate_abstract, never shows");
const pr2 = T.dealDocPrompt({ doc: { id: "y", doc_type: "rate_cap" }, assetName: "A", links: [] });
ok(/no validator/.test(pr2), "cap confirmation prompt: read, checked locally");
console.log(fail ? fail + " FAILED" : "ALL PASS"); process.exit(fail ? 1 : 0);
