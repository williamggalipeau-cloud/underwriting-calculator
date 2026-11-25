// Version 1.1 (user, 11/25): Claude reads disposition documents (BOV, LOI /
// offer letter, PSA, closing statement) and they apply field by field to the
// sale, its offers or its closing; an LOI updates that buyer's offer and keeps
// the earlier terms in its history. Fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const A = j(R + "/lib/dispositionApply.js");
const D = j(R + "/lib/dispositions.js");
const sp = j(R + "/lib/samplePortfolio.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const f = (key, value, quote = `${key}: ${value}`) => ({ key, value, status: "found", evidence: [{ quote, page: 1 }] });

const deal = sp.buildSampleDeals(TEST_INPUTS)[1];
const sale = D.makeSale({ targetPrice: 13000000 });
const offer = D.makeOffer({ buyer: "Example Logistics REIT", date: "2026-11-06", price: 13400000, deposit: 250000, ddDays: 45, closingDays: 30, financingContingency: true });
const other = D.makeOffer({ buyer: "Sample Capital", price: 13100000 });
let inputs = { ...deal.inputs, dispositions: [{ ...sale, stage: "offers", offers: [offer, other], bovs: [D.makeBov({ broker: "Fictional Brokerage", price: 12800000 })] }] };
const meta = (type, offerId = null) => ({ type, saleId: sale.id, offerId });

// ── LOI from a buyer with an offer: update it, keep the earlier terms ──
const loi = { doc_type: "offer_letter", fields: [f("buyer", "Example Logistics REIT"), f("loi_date", "November 20, 2026"), f("purchase_price", "$13,750,000"), f("deposit", "$400,000"), f("dd_days", "30 days"), f("closing_days", "30 days"), f("financing_contingency", "Buyer's obligations are not contingent on financing")] };
const L = A.dispositionRows(inputs, meta("offer_letter"), loi);
ok(/offer from Example Logistics REIT/.test(L.target) && L.offer?.id === offer.id, "an LOI is matched to that buyer's offer");
const byKey = (rows, k) => rows.find((r) => r.key === k);
ok(byKey(L.rows, "price").differs && byKey(L.rows, "price").docValue === 13750000 && byKey(L.rows, "price").appValue === 13400000 && /price/.test(byKey(L.rows, "price").quote), "price: offer now vs. the LOI, with its quote");
ok(!byKey(L.rows, "closingDays").differs && !byKey(L.rows, "closingDays").checked, "a field that matches is shown but not ticked");
ok(byKey(L.rows, "financingContingency").docValue === false && byKey(L.rows, "financingContingency").differs, "\"not contingent on financing\" reads as no financing contingency");
const LA = A.applyDisposition(inputs, meta("offer_letter"), loi, L.rows.filter((r) => r.checked).map((r) => r.key), { docId: "doc-loi2", by: "t@example.com", todayISO: "2026-11-25" });
const o2 = LA.inputs.dispositions[0].offers.find((o) => o.id === offer.id);
ok(o2.price === 13750000 && o2.deposit === 400000 && o2.ddDays === 30 && o2.financingContingency === false && o2.docId === "doc-loi2", "applied: the offer takes the LOI's terms");
ok(o2.history?.length === 1 && o2.history[0].terms.price === 13400000 && o2.history[0].terms.ddDays === 45 && o2.history[0].terms.financingContingency === true, "the earlier terms are kept in the offer's history (user, 11/25)");
ok(LA.inputs.dispositions[0].offers.length === 2 && LA.entries.some((e) => e.field === "Price" && e.from === 13400000 && e.to === 13750000), "no new offer; the change log gets each field");
ok(D.offersCompared(LA.inputs, LA.inputs.dispositions[0], { todayISO: "2026-11-25" }).find((o) => o.id === offer.id).net > D.offersCompared(inputs, inputs.dispositions[0], { todayISO: "2026-11-25" }).find((o) => o.id === offer.id).net, "net proceeds recalculate with the higher price");

// ── LOI from a new buyer: a new offer ──
const loiNew = { doc_type: "offer_letter", fields: [f("buyer", "Fictional Industrial Fund III"), f("purchase_price", "$13,500,000")] };
const N = A.dispositionRows(inputs, meta("offer_letter"), loiNew);
ok(!N.offer && /new offer/.test(N.target), "a new buyer: a new offer");
const NA = A.applyDisposition(inputs, meta("offer_letter"), loiNew, N.rows.map((r) => r.key), { docId: "d-new" });
ok(NA.inputs.dispositions[0].offers.length === 3 && NA.inputs.dispositions[0].offers[2].buyer === "Fictional Industrial Fund III" && NA.inputs.dispositions[0].offers[2].price === 13500000, "the new offer is added");

// ── BOV: update that broker's BOV; target price only when ticked ──
const bov = { doc_type: "bov", fields: [f("broker", "Fictional Brokerage"), f("value_low", "$12,900,000"), f("value_mid", "$13,300,000"), f("value_high", "$13,700,000"), f("cap_rate", "5.75%"), f("list_price", "$13,950,000"), f("marketing_timeline", "8 weeks")] };
const B = A.dispositionRows(inputs, meta("bov"), bov);
ok(/BOV from Fictional Brokerage/.test(B.target) && byKey(B.rows, "price").docValue === 13300000 && byKey(B.rows, "targetPrice").checked === false, "BOV: that broker's entry; the target price is offered but not ticked");
const BA = A.applyDisposition(inputs, meta("bov"), bov, B.rows.filter((r) => r.checked).map((r) => r.key), { docId: "d-bov" });
const s2 = BA.inputs.dispositions[0];
ok(s2.bovs.length === 1 && s2.bovs[0].price === 13300000 && s2.bovs[0].capPct === 5.75 && /12,900,000/.test(s2.bovs[0].notes) && s2.targetPrice === 13000000, "applied to the BOV; target price unchanged");
ok(A.applyDisposition(inputs, meta("bov"), bov, ["targetPrice"]).inputs.dispositions[0].targetPrice === 13950000, "ticked: the target price takes the list price");

// ── PSA: the contract terms and dates (to the Dashboard) ──
const psa = { doc_type: "psa", fields: [f("psa_date", "December 1, 2026"), f("purchase_price", "$13,750,000"), f("initial_deposit", "$400,000"), f("additional_deposit", "$200,000"), f("deposit_hard_date", "December 31, 2026"), f("dd_expiry", "December 31, 2026"), f("closing_date", "January 30, 2027")] };
const P = A.dispositionRows(inputs, meta("psa"), psa);
ok(byKey(P.rows, "deposit").docValue === 600000 && byKey(P.rows, "stage").docValue === "contract", "PSA: deposits added; the sale moves to Under contract");
const PA = A.applyDisposition(inputs, meta("psa"), psa, P.rows.map((r) => r.key), { docId: "d-psa", by: "t@example.com" });
const c = PA.inputs.dispositions[0].contract;
ok(c.price === 13750000 && c.deposit === 600000 && c.hardDate === "2026-12-31" && c.ddDeadline === "2026-12-31" && c.closingDate === "2027-01-30" && c.psaDate === "2026-12-01" && PA.inputs.dispositions[0].stage === "contract", "applied: contract price, deposit, dates and stage");
ok(c.priceLog?.length === 1 && c.priceLog[0].reason === "From the PSA", "the contract price change is logged");
const H = j(R + "/lib/home.js");
ok(typeof H.actionsAndCalendar === "function", "the Dashboard reads sale contract dates (lib/home.js)");

// ── Closing statement: the realized sale ──
const cls = { doc_type: "closing_disp", fields: [f("closing_date", "January 30, 2027"), f("sale_price", "$13,750,000"), f("credits", "$50,000"), f("selling_costs", "$310,000"), f("loan_payoff", "$8,900,000"), f("net_proceeds", "$4,490,000")] };
const C = A.dispositionRows(PA.inputs, meta("closing_disp"), cls);
ok(byKey(C.rows, "costs").docValue === 360000 && byKey(C.rows, "netCheck").info && !byKey(C.rows, "netCheck").checked, "closing: costs include credits to the buyer; net proceeds shown to check");
const CA = A.applyDisposition(PA.inputs, meta("closing_disp"), cls, C.rows.filter((r) => r.checked).map((r) => r.key), { docId: "d-close" });
const sc = CA.inputs.dispositions[0];
ok(sc.stage === "closed" && sc.closing.price === 13750000 && sc.closing.costs === 360000 && sc.closing.loanPayoff === 8900000 && sc.closing.net === 13750000 - 360000 - 8900000 && sc.closing.docId === "d-close", "applied: the sale is closed with the statement's figures");
ok(CA.inputs.realizedSalePrice === 13750000 && CA.inputs.realizedSaleDate === "2027-01-30", "a whole sale sets the asset's realized sale");

// ── Nothing ticked, or the sale gone ──
ok(A.applyDisposition(inputs, meta("psa"), psa, []).inputs === inputs, "nothing ticked: nothing changes");
ok(A.dispositionRows(inputs, { type: "psa", saleId: "gone" }, psa).error, "a document whose sale was removed says so");
ok(A.canReview("bov") && A.canReview("offer_letter") && A.canReview("psa") && A.canReview("closing_disp") && !A.canReview("listing_agreement"), "the four document types Claude reads");

// ── The sample documents (docs/sample-deal-docs/dispositions), end to end ──
{
  const fs = require("fs");
  const dir = R + "/docs/sample-deal-docs/dispositions/abstracts/";
  const T = j(R + "/lib/dealDocTypes.js");
  const files = fs.readdirSync(dir);
  ok(files.length === 12 && files.every((f) => T.checkLocally(JSON.parse(fs.readFileSync(dir + f))).length === 0), "12 sample abstracts (BOV, LOI, PSA, closing for 3 assets) pass the app's local check");
  const ab = (n) => JSON.parse(fs.readFileSync(dir + n + ".json"));
  const r9 = sp.buildSampleDeals(TEST_INPUTS).find((d) => d.inputs.propertyName === "Route 9 Small Bay");
  const s0 = D.makeSale();
  let inp = { ...r9.inputs, dispositions: [s0] };
  const m0 = (type) => ({ type, saleId: s0.id });
  const all = (t) => A.dispositionRows(inp, m0(t), ab(t === "offer_letter" ? "route9-loi" : t === "closing_disp" ? "route9-closing-disp" : `route9-${t}`)).rows.filter((x) => x.checked).map((x) => x.key);
  inp = A.applyDisposition(inp, m0("bov"), ab("route9-bov"), all("bov")).inputs;
  inp = A.applyDisposition(inp, m0("offer_letter"), ab("route9-loi"), all("offer_letter")).inputs;
  inp = A.applyDisposition(inp, m0("psa"), ab("route9-psa"), all("psa")).inputs;
  inp = A.applyDisposition(inp, m0("closing_disp"), ab("route9-closing-disp"), all("closing_disp")).inputs;
  const z = inp.dispositions[0];
  ok(z.bovs[0].broker === "Fictional Industrial Advisors" && z.bovs[0].price === 14600000 && z.offers[0].buyer === "Example Logistics REIT" && z.offers[0].price === 14400000 && z.offers[0].financingContingency === false, "Route 9: BOV and offer from the sample BOV and LOI");
  ok(z.contract.price === 14500000 && z.contract.closingDate === "2027-01-29" && z.contract.deposit === 500000, "Route 9: contract from the sample PSA");
  ok(z.stage === "closed" && z.closing.price === 14500000 && z.closing.net === 14500000 - 45000 - 315000 - 9400000 && z.closing.net === 4740000, "Route 9: closed from the sample closing statement; net matches the statement ($4,740,000)");
}

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
