// 1.1.16: price per SF, break-even occupancy and the comps of a sale
// (lib/assetMetrics.js), with the screens' data builders that use them.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const M = j(R + "/lib/assetMetrics.js");
const C = j(R + "/lib/calculations.js");
const DS = j(R + "/lib/dispositions.js");
const DC = j(R + "/lib/dispositionCandidates.js");
const FD = j(R + "/lib/fundDebt.js");
const T = j(R + "/lib/sampleDocTerms.js");
const { makeComp } = j(R + "/lib/comps.js");
const { SAMPLE_DATA_VERSION } = j(R + "/lib/samplePortfolio.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const data = FX.workspaceData();
const d1 = data.deals.find((d) => d.id === "sample-deal-1");
const inp = d1.inputs;
const T0 = "2026-11-27";

// ── Price per SF ──
ok(M.perSF(12500000, 42000) === 12500000 / 42000 && M.perSF(100, 0) === null && M.perSF(null, 100) === null && M.perSF("x", 100) === null, "price per SF: amount over SF; no SF or no amount gives nothing, never 0 or infinity");
ok(M.assetSF(inp) === 24000 && M.assetSF({ units: [{ squareFeet: 100 }, { squareFeet: 250 }] }) === 350 && M.assetSF({}) === 0, "the asset's SF: the entered total, else the units'");
const u = C.underwrite(inp);
ok(close(M.allInBasis(inp), u.debt.equityRequired + u.debt.loanAmount - u.debt.capPremium, 1e-6) && close(M.allInBasis(inp, u), M.allInBasis(inp)), "all-in basis = the model's total cost without the rate cap premium (price + closing costs + capital plan)");

// ── Break-even occupancy ──
const y1 = u.annualCashFlows[0];
const be = M.breakEvenOccupancy(inp, { year: 1 });
ok(close(be.breakEvenPct, ((y1.operatingExpenses + y1.debtService) / y1.grossRevenue) * 100) && close(be.occupancyPct, (1 - y1.physicalVacancy / y1.grossRevenue) * 100) && close(be.cushionPts, be.occupancyPct - be.breakEvenPct), "break-even occupancy = (operating expenses + debt service) ÷ potential gross income; cushion = occupancy − break-even");
const fake = (vac, ds) => ({ annualCashFlows: [{ grossRevenue: 1000, operatingExpenses: 300, debtService: ds, physicalVacancy: vac }] });
const st = (vac, ds) => M.breakEvenOccupancy({}, { year: 1, model: fake(vac, ds) });
ok(st(50, 400).status === "ok" && st(50, 400).label === "Comfortable" && close(st(50, 400).breakEvenPct, 70) && close(st(50, 400).cushionPts, 25), "70% break-even at 95% occupancy: 25 points, comfortable");
ok(st(50, 560).status === "amber" && st(50, 600.01).status === "red" && st(50, 550).status === "ok" && st(50, 600).status === "amber", "flag: amber under 10 points of cushion, red under 5 (10 and 5 themselves are not flagged down a level)");
ok(st(50, 800).cushionPts < 0 && st(50, 800).status === "red" && M.breakEvenOccupancy({}, { year: 1, model: { annualCashFlows: [{ grossRevenue: 0 }] } }) === null && M.breakEvenOccupancy({}, { year: 1, model: { annualCashFlows: [] } }) === null, "below break-even is red; no income or no model gives nothing");
ok(M.holdYearAt({ acquisitionDate: "2026-01-30", holdPeriodYears: 4 }, "2026-11-27") === 1 && M.holdYearAt({ acquisitionDate: "2026-01-30", holdPeriodYears: 4 }, "2027-02-01") === 2 && M.holdYearAt({ acquisitionDate: "2020-01-01", holdPeriodYears: 4 }, T0) === 4 && M.holdYearAt({ acquisitionDate: "2027-01-01", holdPeriodYears: 4 }, T0) === 1, "the hold year in progress (year 1 before the purchase; never past the hold)");
ok(M.breakEvenOccupancy(inp, { todayISO: T0 }).year === 1 && close(M.breakEvenOccupancy(inp, { todayISO: T0 }).breakEvenPct, be.breakEvenPct), "with a date, the year in progress is used");
// Portfolio Debt and Disposition Candidates show the same figure for the same asset and year.
const loans = FD.fundLoans(data.deals.filter((d) => d.inputs.fundName === inp.fundName), {}, T0);
const l1 = loans.find((l) => l.id === d1.id);
const cm = DC.candidateMetrics(inp, { "2026-09-30": { value: 8400000 }, "2026-06-30": { value: 8000000 }, "2027-03-31": { value: 9000000 } }, T0);
ok(l1.breakEven && close(l1.breakEven.breakEvenPct, cm.breakEven.breakEvenPct, 1e-9) && close(l1.breakEven.breakEvenPct, be.breakEvenPct, 1e-9), "Portfolio Debt, Disposition Candidates and the library agree on the asset's break-even occupancy");
ok(cm.value === 8400000 && cm.valueDate === "2026-09-30" && close(cm.valuePSF, 8400000 / 24000) && close(cm.basisPSF, M.allInBasis(inp) / 24000), "candidates: value per SF from the latest mark on or before today (a later mark is ignored), basis per SF from the all-in basis");
ok(DC.candidateMetrics(inp, {}, T0).valuePSF === null && DC.latestMark({ "2026-09-30": { value: 0 } }, T0) === null, "no mark: no value per SF");

// ── The comps of a sale ──
const acq = [makeComp({ id: "a1", name: "100 Fictional Way", saleDate: "2026-06-01", price: 9000000, sf: 30000, capRate: 6.4 }), makeComp({ id: "a2", name: "200 Example Rd", saleDate: "2026-08-15", price: 7200000, sf: 25000, capRate: 6.6 })];
const withAcq = { ...inp, salesComps: { comps: acq, marketGrowthPct: 3, spreadBp: 25, filters: { sinceISO: "", minSF: "", maxSF: "", type: "" } } };
const sale = { ...DS.makeSale({ reason: "plan_complete", targetPrice: 8200000 }), id: "s1", stage: "contract", bovs: [{ ...DS.makeBov(), id: "b1", broker: "Fictional Brokers", price: 8000000 }, { ...DS.makeBov(), id: "b2", broker: "", price: null }], offers: [{ ...DS.makeOffer(), id: "o1", buyer: "Example Buyer", price: 7900000, selected: true }, { ...DS.makeOffer(), id: "o2", buyer: "Other", price: 7000000 }] };
ok(M.saleCompsOf(sale) === null && M.saleCompsState(sale).comps.length === 0 && M.saleCompsView(withAcq, sale, { todayISO: T0 }).count === 0, "a sale starts with no comps of its own");
const c1 = M.copyAcquisitionComps(withAcq, sale, { todayISO: T0 });
ok(c1.added === 2 && c1.state.comps.length === 2 && c1.state.startedAt === T0 && c1.state.comps.every((c, i) => c.id !== acq[i].id && c.copiedFrom === acq[i].id && c.price === acq[i].price), "Copy from the acquisition set: copies with their own ids, the date the set started");
const s2 = { ...sale, comps: c1.state };
const c2 = M.copyAcquisitionComps(withAcq, s2, { todayISO: "2027-01-01" });
ok(c2.added === 0 && c2.state.comps.length === 2 && c2.state.startedAt === T0, "copying again adds nothing and keeps the start date");
ok(withAcq.salesComps.comps.length === 2 && withAcq.salesComps.comps[0].id === "a1", "the acquisition set is not changed");
const v = M.saleCompsView(withAcq, s2, { todayISO: T0 });
const np = DS.netProceeds(withAcq, s2, 7900000, s2.targetClose || T0);
ok(v.used === 2 && close(v.avgPsf, (300 + 288) / 2) && close(v.avgCapPct, 6.5) && close(v.rows[0].price, 294 * 24000) && close(v.rows[1].price, v.noi / 0.065) && v.rows[0].vsCompsPct === null, "the comps in use: average $/SF and cap rate; implied value by each");
ok(v.rows.map((r) => r.key).join() === "comps_psf,comps_cap,bov:b1,asking,offer:o1" && v.rows[4].label === "Offer under contract (Example Buyer)" && close(v.rows[4].psf, np.psf) && close(v.rows[4].capPct, np.capPct) && close(v.rows[2].vsCompsPct, (8000000 / (294 * 24000) - 1) * 100), "then the broker opinions with a price, the asking price and the selected offer, with the Offers view's own $/SF and cap rate");
const off = { ...s2, comps: { ...s2.comps, comps: s2.comps.comps.map((c, i) => (i === 0 ? { ...c, include: false } : c)) } };
ok(M.saleCompsView(withAcq, off, { todayISO: T0 }).used === 1 && close(M.saleCompsView(withAcq, off, { todayISO: T0 }).avgPsf, 288), "a comp not in use is left out");
const none = { ...sale, stage: "marketing", targetPrice: null, bovs: [], offers: [], comps: c1.state };
ok(M.saleCompsView(withAcq, none, { todayISO: T0 }).rows.length === 2, "with no opinion, asking price or offer, only the comps' rows show");
const x = M.saleCompsXlsx([{ asset: "Airport Flex Park", inputs: withAcq, sale: s2 }, { asset: "No comps", inputs: withAcq, sale }], { todayISO: T0 });
ok(x[0][0] === "Disposition comps" && x.filter((r) => r[0] === "Airport Flex Park").length === 2 + 5 && !x.some((r) => r[0] === "No comps") && x.some((r) => r[1] === "Comps, by $ / SF" && r[2] === 7056000 && r[3] === 294), "Excel: the comps and what they imply, per sale that has comps");
const saved = M.saveSaleComps({ comps: c1.state.comps, market: { x: 1 }, benchmarks: [1] }, { todayISO: T0 });
ok(!("market" in saved) && !("benchmarks" in saved) && saved.comps.length === 2 && saved.startedAt === T0, "only the comps fields are saved on the sale");

// ── Sample sales (the automatic load) ──
const sampleSale = { ...sale, id: "ss", startedFrom: "Sample sale (fictional)", createdAt: "2026-11-27T12:00:00.000Z" };
const filled = T.withSampleSaleComps({ ...withAcq, dispositions: [sampleSale, sale] });
ok(filled.dispositions[0].comps.comps.length === 2 && filled.dispositions[0].comps.startedAt === "2026-11-27" && !filled.dispositions[1].comps, "a sample sale gets its comps from the asset's acquisition comps; a sale the user started is left alone");
ok(T.withSampleSaleComps(filled) === filled && T.withSampleSaleComps({ ...inp, salesComps: undefined, dispositions: [sampleSale] }).dispositions[0].comps === undefined, "run again, nothing changes; with no acquisition comps, nothing is added");
ok(SAMPLE_DATA_VERSION >= 5, "the automatic load's version is 5 or later");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
