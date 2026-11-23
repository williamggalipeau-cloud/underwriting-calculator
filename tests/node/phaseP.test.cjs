// Phase P: Dispositions (lib/dispositions.js) on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const D = j(R + "/lib/dispositions.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1) => Math.abs(a - b) < e;

const data = FX.workspaceData();
const units = [
  { id: "u1", name: "Suite A", squareFeet: 6000, leaseStatus: "occupied", currentRentPSF: 12, tenantName: "Example Co" },
  { id: "u2", name: "Suite B", squareFeet: 18000, leaseStatus: "occupied", currentRentPSF: 11, tenantName: "Fictional LLC" },
];
const base = data.deals.find((d) => d.id === "sample-deal-1");
const inputs = { ...base.inputs, units, squareFootage: 24000 };
const DATE = "2026-12-31";

// ── Sale subject ──
const whole = D.makeSale({ targetPrice: 9e6, reason: "hold_reached" });
const part = D.makeSale({ scope: "partial", unitIds: ["u1"] });
ok(whole.stage === "preparing" && whole.scope === "whole" && whole.offers.length === 0, "a new sale starts in Preparing");
const sw = D.saleSubject(inputs, whole), sp = D.saleSubject(inputs, part);
ok(sw.share === 1 && sw.sf === 24000 && sp.share === 0.25 && sp.sf === 6000 && sp.units[0].id === "u1", "subject: whole asset, or the chosen units with their share of SF");
ok(sp.rent === 6000 * 12, "the part sold carries its rent roll");
const rest = D.remainingInputs(inputs, part);
ok(rest.units.length === 1 && rest.units[0].id === "u2" && rest.squareFootage === 18000 && close(rest.purchasePrice, inputs.purchasePrice * 0.75), "partial sale: the rest is re-modeled without the units sold");

// ── Net proceeds ──
const m = D.modelAt(inputs, DATE);
const np = D.netProceeds(inputs, whole, 1e7, DATE);
ok(m.loanBalance > 0 && m.sellingCostsPct > 0 && close(np.costs, 1e7 * m.sellingCostsPct / 100) && close(np.payoff, m.loanBalance) && close(np.net, 1e7 - np.costs - np.payoff), "net proceeds = price − selling costs − loan payoff (model balance at the date)");
const npp = D.netProceeds(inputs, part, 3e6, DATE);
ok(close(npp.payoff, m.loanBalance * 0.25) && close(npp.psf, 500) && npp.capPct > 0, "partial: its share of the loan, $/SF on its SF, cap on its NOI share");

// ── Offers ──
let sale = { ...whole, offers: [D.makeOffer({ buyer: "Example REIT", price: 9.5e6, round: "initial" }), D.makeOffer({ buyer: "Fictional Fund", price: 1.01e7, round: "best_final" })] };
const other = { ...D.makeSale(), offers: [D.makeOffer({ buyer: "example reit ", price: 5e6, date: "2026-06-01" })] };
const all = [{ dealId: "sample-deal-1", asset: "Airport Flex Park", sale }, { dealId: "sample-deal-2", asset: "Route 9 Small Bay", sale: other }];
const cmp = D.offersCompared(inputs, sale, { allSales: all, todayISO: DATE });
ok(cmp[0].buyer === "Fictional Fund" && cmp[0].net > cmp[1].net, "offers side by side, best net proceeds first");
ok(cmp[1].earlier.length === 1 && cmp[1].earlier[0].asset === "Route 9 Small Bay", "a buyer's earlier offer on another asset shows with them (name matched loosely)");
sale = D.selectOffer(sale, sale.offers[1].id);
ok(sale.offers.filter((o) => o.selected).length === 1 && sale.offers[1].selected, "one offer can be selected");
sale = D.selectOffer(sale, sale.offers[0].id);
ok(sale.offers[0].selected && !sale.offers[1].selected, "selecting another unselects the first");
sale = D.changeContractPrice(sale, 9.3e6, { reason: "Roof credit", by: "t@example.com" });
ok(sale.contract.price === 9.3e6 && sale.contract.priceLog[0].from === 9.5e6 && sale.contract.priceLog[0].reason === "Roof credit", "price changes under contract are logged");

// ── Closing ──
const withSale = { ...inputs, dispositions: [sale, part] };
const closed = D.closeSale(withSale, sale.id, { date: "2026-10-15", price: 9.3e6 });
const cs = closed.dispositions[0].closing;
ok(closed.dispositions[0].stage === "closed" && cs.price === 9.3e6 && close(cs.net, 9.3e6 - cs.costs - cs.loanPayoff), "closing statement recorded: price, costs, payoff, net");
ok(closed.realizedSalePrice === 9.3e6 && closed.realizedSaleDate === "2026-10-15" && close(closed.realizedSellingCosts, cs.costs), "a whole sale sets the asset's realized sale (the model uses it)");
const closedPart = D.closeSale(withSale, part.id, { date: "2026-10-15", price: 3e6, costs: 60000, loanPayoff: 1e6 });
ok(!closedPart.realizedSalePrice && closedPart.dispositions[1].closing.net === 1940000, "a partial sale doesn't sell the whole asset; given costs and payoff are used");
ok(closed.dispositions[1].stage === "preparing", "other sales untouched");

// ── Track record ──
const deals = [{ id: "sample-deal-1", inputs: { ...closed, dispositions: [closed.dispositions[0], closedPart.dispositions[1]] } }];
const marks = { "sample-deal-1": { "2026-06-30": { value: 8.8e6 }, "2026-12-31": { value: 9.9e6 } } };
const tr = D.trackRecord(deals, marks);
const w = tr.find((r) => !r.partial), p = tr.find((r) => r.partial);
ok(tr.length === 2 && w.salePrice === 9.3e6 && w.purchasePrice === inputs.purchasePrice && w.holdYears > 0, "track record: every closed sale");
const real = underwrite({ ...closed, holdPeriodYears: Math.max(1, Math.round(w.holdYears)) });
ok(close(w.irr, real.returns.irr, 1e-6) && Number.isFinite(w.multiple) && w.uw && Number.isFinite(w.uw.irr), "whole sale: realized IRR from the model with the sale; underwriting alongside");
ok(w.lastMark.quarter === "2026-06-30" && close(w.vsMarkPct, (9.3e6 - 8.8e6) / 8.8e6 * 100, 1e-9), "vs. the last mark before the sale");
ok(p.sf === 6000 && close(p.purchasePrice, inputs.purchasePrice * 0.25) && p.netProceeds === 1940000 && Number.isFinite(p.irr) && close(p.lastMark.value, 8.8e6 * 0.25), "partial: figures cover the part sold");
const tot = D.trackTotals(tr);
ok(tot.at(-1).key === "Firm" && tot.at(-1).sales === 2 && tot[0].key === "Model Fund I", "fund and firm totals");

// ── All / active and Excel ──
const dl = [{ id: "a", inputs: { propertyName: "A", dispositions: [D.makeSale(), { ...D.makeSale(), stage: "withdrawn" }] } }, { id: "b", inputs: { propertyName: "B" } }];
ok(D.allSales(dl).length === 2 && D.activeSales(dl).length === 1, "all sales vs. active ones");
const x = D.salesXlsx([{ asset: "Airport Flex Park", fund: "Model Fund I", inputs: withSale, sale }], { todayISO: DATE });
ok(x[0].includes("Best net proceeds") && x[1][0] === "Airport Flex Park" && x.some((r) => r[0] === "Offers") && x.filter((r) => r[1] === "Example REIT" || r[1] === "Fictional Fund").length === 2, "Excel: sales with offers side by side");
const tx = D.trackXlsx(tr);
ok(tx[0].includes("Underwritten IRR (%)") && tx.some((r) => r[0] === "Firm"), "Excel: track record with totals");

// ── Part 2: documents ──
const DD = j(R + "/lib/dispositionDocs.js");
const title = DD.dispTitle({ saleId: "sale-1", offerId: "offer-2", type: "offer_letter", name: "LOI.pdf" });
ok(title === "[sale:sale-1/offer:offer-2] Offer letter / LOI: LOI.pdf", "document title carries the sale, offer and type");
const pt = DD.parseDispTitle(title);
ok(pt.saleId === "sale-1" && pt.offerId === "offer-2" && pt.type === "offer_letter" && pt.name === "LOI.pdf", "and reads back");
ok(DD.parseDispTitle("Org chart: x.pdf") === null && DD.parseDispTitle(DD.dispTitle({ saleId: "s", type: "bov", name: "a: b.pdf" })).name === "a: b.pdf", "other documents ignored; colons in file names kept");
const listed = DD.dispositionDocs([{ id: "1", deal_id: "sample-deal-1", title: DD.dispTitle({ saleId: "s1", type: "bov", name: "BOV.pdf" }), files: [{ uploaded_by_email: "t@example.com" }] }, { id: "2", deal_id: "sample-deal-1", title: "OM: x.pdf" }], data.deals);
ok(listed.length === 1 && listed[0].asset === "Airport Flex Park" && listed[0].typeLabel === "BOV" && listed[0].by === "t@example.com", "disposition documents among all documents, with asset and uploader");
(async () => {
  const calls = [];
  const fake = (failNew) => async (ws, a) => { calls.push(a.docType); if (failNew && a.docType !== "other" && !["psa", "estoppel", "closing_disp"].includes(a.docType)) throw new Error('new row violates check constraint "deal_documents_doc_type_check"'); return { id: "x", ...a }; };
  const r1 = await DD.uploadDispDoc("w1", { dealId: "d", saleId: "s", type: "bov", file: { name: "b.pdf" } }, "t@example.com", fake(true));
  ok(r1.docType === "other" && calls.join() === "bov,other" && /^\[sale:s\] BOV: b\.pdf$/.test(r1.title), "before the SQL: a new type falls back to Other (type kept in the title)");
  calls.length = 0;
  const r2 = await DD.uploadDispDoc("w1", { dealId: "d", saleId: "s", type: "bov", file: { name: "b.pdf" } }, "t@example.com", fake(false));
  ok(r2.docType === "bov" && calls.join() === "bov", "after the SQL: the real type");
  let threw = false;
  try { await DD.uploadDispDoc("w1", { dealId: "d", saleId: "s", type: "psa", file: { name: "p.pdf" } }, null, async () => { throw new Error("Storage quota exceeded"); }); } catch { threw = true; }
  ok(threw, "other upload errors are not hidden");

  // ── Part 2: waterfall split ──
  const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
  const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
  const fd = data.deals.filter((d) => d.inputs.fundName === "Model Fund I").map((d) => snapshotDeal(d.inputs, d.id));
  const terms = { ...DEFAULT_FUND_TERMS, ...data.funds["Model Fund I"], name: "Model Fund I" };
  const early = D.saleDistribution(fd, terms, "sample-deal-1", { date: "2026-11-20", net: 4e6 });
  ok(early && close(early.lp + early.gp + early.held, 4e6) && early.gp === 0, "an early sale's proceeds go to the LPs (return of capital first)");
  const big = D.saleDistribution(fd, terms, "sample-deal-1", { date: "2029-11-20", net: 9e7 });
  ok(big.gp > 0 && big.lp > big.gp && close(big.lp + big.gp + big.held, 9e7), "a large later sale reaches the promote: LP / GP split by the fund's waterfall");
  ok(D.saleDistribution(fd, terms, "x", null) === null, "no closing, no split");
  console.log(fail ? `${fail} FAILED` : "ALL PASS");
  process.exitCode = fail ? 1 : 0;
})();
if (false) console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
