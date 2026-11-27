// 1.1.26: the sample joint venture and separate account (lib/sampleVentures.js).
// Terms as the user confirmed them, four assets with fixed past dates, what
// happened since purchase written through the functions the tabs call, and
// the tie-out: asset to portfolio to firm.
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const V = j(R + "/lib/sampleVentures.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");
const { underwrite } = j(R + "/lib/calculations.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const LH = j(R + "/lib/leaseHistory.js");
const BP = j(R + "/lib/businessPlan.js");
const D = j(R + "/lib/dispositions.js");
const G = j(R + "/lib/gpEconomics.js");
const FE = j(R + "/lib/firmEconomics.js");
const C = j(R + "/lib/creditReview.js");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const T = "2026-11-27";
const v = V.buildSampleVentures({ baseInputs: DEFAULT_INPUTS, todayISO: T });
const by = (id) => v.deals.find((d) => d.id === id).inputs;
const jv = v.funds[V.SAMPLE_JV_NAME], sma = v.funds[V.SAMPLE_SMA_NAME];

// ── Terms (user, 11/27) ──
check(jv.type === "Joint Venture" && jv.partnerName === "Example Pension Fund" && jv.targetEquity === 80_000_000 && jv.finalClose.startsWith("2022"), "the joint venture: Example Pension Fund, $80,000,000, set up 2022");
check(sma.type === "Separate Account" && sma.clientName === "Fictional Insurance Company" && sma.targetEquity === 25_000_000 && sma.finalClose.startsWith("2023"), "the separate account: Fictional Insurance Company, $25,000,000, set up 2023");
check(jv.mgmtFeePct === 0.75 && sma.mgmtFeePct === 1.25 && [jv, sma].every((t) => t.mgmtFeeBasis === "invested"), "asset management 0.75% (joint venture) and 1.25% (separate account), on invested equity");
check(v.deals.every((d) => d.inputs.managementFeePct === 5 && d.quick.pmFeePct === 5 && d.quick.cmFeePct === 1.5 && d.quick.amFeePct === 0 && !(d.inputs.amFeeItems ?? []).some((x) => Number(x.value) > 0)), "property management 5.0% and construction management 1.5% on every asset; no second asset management fee at the asset level");
const tiers = (t) => JSON.stringify(t.tiers.map((x) => [x.irrThreshold, x.lpSplit, x.gpSplit]));
check([jv, sma].every((t) => t.prefPct === 8 && t.catchUpGpPct === 0 && tiers(t) === "[[14,80,20],[null,70,30]]" && !(t.incentiveFeePct > 0)), "both: 8% preferred return, then 20% to a 14% IRR and 30% above; no catch-up, no incentive fee");
const ext = (t) => t.gpParties.find((g) => g.who === "external"), own = (t) => t.gpParties.find((g) => g.who === "firm");
check([jv, sma].every((t) => t.gpCommitPct === 10 && ext(t).capitalPct === 50 && ext(t).promotePct === 25 && own(t).capitalPct === 50 && own(t).promotePct === 75) && ext(jv).name === "Placeholder Capital Partners LP" && ext(sma).name === "Demo Holdings Family Office", "both: a 10% sponsor co-invest, half funded by the outside GP partner, which takes 25% of the promote");
check(v.gp.partners.length === 2 && v.gp.agreements.length === 2 && v.gp.agreements.every((a) => a.status === "checked" && a.capitalPct === 50 && a.gpSideSharePct === 25), "the partners and their agreements are in the firm's GP partner list, checked");

// ── Assets ──
check(v.deals.length === 4 && v.deals.filter((d) => d.inputs.fundName === V.SAMPLE_JV_NAME).length === 3 && by("sample-sma-1").fundName === V.SAMPLE_SMA_NAME, "three joint venture assets and one separate account asset");
check(v.deals.every((d) => d.inputs.purchasePrice >= 48_000_000 && d.inputs.purchasePrice <= 51_000_000 && d.inputs.units.length >= 60 && d.inputs.units.length <= 80 && d.inputs.holdPeriodYears === 4), "each about $50,000,000, 60 to 80 units, a four-year hold");
check(v.deals.map((d) => d.inputs.acquisitionDate).join() === "2022-06-15,2023-02-28,2023-11-15,2023-06-30", "bought mid-2022, early 2023, late 2023 and mid-2023");
check(v.deals.every((d) => new Set(d.inputs.units.map((u) => u.id)).size === d.inputs.units.length && d.inputs.units.every((u) => u.id.startsWith(`${d.id}-u`))), "unit ids are fixed and unique");
const again = V.buildSampleVentures({ baseInputs: DEFAULT_INPUTS, todayISO: "2027-06-01" });
check(JSON.stringify(again.deals) === JSON.stringify(v.deals) && JSON.stringify(again.valuations) === JSON.stringify(v.valuations), "the assets and marks are fixed: built on another day they are identical");
check(v.deals.every((d) => d.inputs.sofrCurveSource !== "pensford" && d.quick.sofrCurveSource === "manual"), "each asset carries its own rate path, so the live curve does not move it");
const names = new Set(buildSampleFund({ todayISO: T }).deals.map((d) => d.inputs.propertyName));
check(v.deals.every((d) => !names.has(d.inputs.propertyName) && /^Example /.test(d.inputs.propertyName)), "fictional names, none shared with Model Fund I");

// ── The closing model is kept, and what happened since is on top of it ──
for (const d of v.deals) {
  const i = d.inputs, b = i.uwBaseline?.inputs;
  check(b && i.uwBaseline.source === "closing" && b.units.length === i.units.length && b.units.every((u) => !(u.laterLeases ?? []).length) && !(b.dispositions ?? []).length, `${i.propertyName}: the closing model is kept as the underwriting baseline, with no later leases or sale in it`);
  const later = i.units.flatMap((u) => LH.laterLeasesOf(u).map((l) => ({ u, l })));
  check(later.length >= 40 && later.every(({ u, l }) => LH.laterLeaseError({ ...u, laterLeases: u.laterLeases.filter((x) => x.id !== l.id) }, i, l) === "" && l.start > i.acquisitionDate && l.source === "Sample lease"), `${i.propertyName}: ${later.length} leases signed since purchase, each one the Add lease form would accept`);
}
const st = (i, day) => i.units.reduce((m, u) => { const s = LH.leaseToday(u, i, day).status; m[s] = (m[s] ?? 0) + 1; return m; }, {});
for (const id of ["sample-jv-2", "sample-jv-3", "sample-sma-1"]) check(!st(by(id), T).ended, `${by(id).propertyName}: no lease has ended with nothing recorded as of 11/27/2026`);
check(!st(by("sample-jv-1"), "2026-06-30").ended, "the sold asset: none ended with nothing recorded on its sale date");

// On plan: close to the closing model. Behind plan: far under it.
const irr = (inp) => underwrite(inp).returns.irr;
for (const id of ["sample-jv-2", "sample-sma-1"]) { const i = by(id), a = irr(i), b = irr(i.uwBaseline.inputs); check(b > 11 && b < 18 && a >= b && a - b < 5, `${i.propertyName} is on plan: ${a.toFixed(1)}% now against ${b.toFixed(1)}% underwritten`); }
const cI = by("sample-jv-3"), cNow = underwrite(cI), cUw = underwrite(cI.uwBaseline.inputs);
const occ = (i, day) => BP.assetKpis(i, day).occupancy;
check(cUw.returns.irr > 12 && cNow.returns.irr < 0 && cNow.returns.exitValue < cUw.returns.exitValue * 0.75, `the asset behind plan: ${cNow.returns.irr.toFixed(1)}% now against ${cUw.returns.irr.toFixed(1)}% underwritten`);
check(occ(cI, cI.acquisitionDate) < 72 && occ(cI, T) > 68 && occ(cI, T) < 80 && cI.units.filter((u) => u.leaseStatus !== "occupied" && !LH.laterLeasesOf(u).length).length >= 15, `it was bought part vacant and is ${occ(cI, T).toFixed(0)}% leased today`);
const cost = (i) => i.purchasePrice + (i.capexBudget ?? 0), lastMark = (id) => Object.entries(v.valuations[id]).sort().at(-1)[1].value;
check(lastMark("sample-jv-3") < cost(cI) && ["sample-jv-2", "sample-sma-1"].every((id) => lastMark(id) > cost(by(id))), `it is marked below cost (${lastMark("sample-jv-3").toLocaleString()} against ${cost(cI).toLocaleString()}); the two on plan are above`);

// ── The sold asset and the Track Record ──
const aI = by("sample-jv-1"), sale = aI.dispositions[0];
check(aI.dispositions.length === 1 && sale.stage === "closed" && sale.closing.date === "2026-06-30" && aI.realizedSaleDate === "2026-06-30" && aI.realizedSalePrice === sale.closing.price && near(sale.closing.net, sale.closing.price - sale.closing.costs - sale.closing.loanPayoff), "the asset bought 6/15/2022 was sold 6/30/2026; the asset holds the closing's price and date");
const tr = D.trackRecord(v.deals.map((d) => ({ id: d.id, inputs: d.inputs })), v.valuations);
check(tr.length === 1 && tr[0].asset === aI.propertyName && tr[0].salePrice === sale.closing.price && near(tr[0].irr, underwrite(aI).returns.irr, 0.01) && near(tr[0].uw.irr, irr(aI.uwBaseline.inputs), 0.01) && tr[0].irr > tr[0].uw.irr && tr[0].holdYears > 3.9 && tr[0].holdYears < 4.2, `Track Record: one sale, ${tr[0]?.irr.toFixed(1)}% realized against ${tr[0]?.uw.irr.toFixed(1)}% underwritten`);
check(tr[0].lastMark && tr[0].lastMark.quarter <= "2026-06-30" && tr[0].vsMarkPct > 0 && tr[0].vsMarkPct < 12, `it sold ${tr[0]?.vsMarkPct?.toFixed(1)}% above its last mark`);
check(Object.keys(v.valuations["sample-jv-1"]).every((q) => q <= "2026-06-30"), "the sold asset has no mark after its sale");

// ── Tie-out: asset to portfolio to firm ──
const res = Object.entries(v.funds).map(([name, terms]) => {
  const deals = v.deals.filter((d) => d.inputs.fundName === name).map((d) => SP.snapshotDeal(d.inputs, d.id));
  return { name, terms, deals, f: G.fundGpEconomics(name, deals, terms, { todayISO: T }) };
});
for (const { name, deals, f } of res) {
  const pm = deals.reduce((s, d) => s + underwrite(d.inputs).annualCashFlows.reduce((t, y) => t + (y.managementFee ?? 0), 0), 0);
  const cm = deals.reduce((s, d) => s + underwrite(d.inputs).annualCashFlows.reduce((t, y) => t + (y.constructionMgmtFee ?? 0), 0), 0);
  check(near(f.fees.pm, pm, 2) && near(f.fees.cm, cm, 2) && f.fees.mgmt > 0 && near(f.fees.total, f.fees.mgmt + f.fees.pm + f.fees.cm, 2), `${name}: the portfolio's property and construction management fees are its assets' fees (${Math.round(f.fees.pm).toLocaleString()}, ${Math.round(f.fees.cm).toLocaleString()})`);
  const fe = FE.firmEconomics([f]).totals, px = f.parties.gp.parties;
  const firm = px.find((g) => g.who === "firm"), out = px.find((g) => g.who !== "firm");
  check(near(fe.fees, f.fees.total, 2) && near(firm.equity, out.equity, 2) && near(firm.promote, 3 * out.promote, 2) && near(firm.promote + out.promote, f.promote.total, 2) && near(fe.promote, firm.promote, 2), `${name}: the firm earns every fee, half the GP capital and three quarters of the promote; the partner the rest`);
}
const all = FE.firmEconomics(res.map((r) => r.f)).totals;
check(near(all.fees, res.reduce((s, r) => s + r.f.fees.total, 0), 2) && near(all.promote, res.reduce((s, r) => s + FE.firmEconomics([r.f]).totals.promote, 0), 2) && all.promote > 0, "Firm Economics for both is the sum of the two portfolios");
check(res.every((r) => r.f.promote.total > 0), "each portfolio earns a promote (the joint venture's is held down by the asset behind plan)");

// ── Screens that list leases read today's leases on these assets (1.1.25) ──
const cr = C.creditRows(v.deals, { asOf: T });
const newTenants = v.deals.flatMap((d) => d.inputs.units.flatMap((u) => LH.laterLeasesOf(u).filter((l) => l.kind === "new" && l.start <= T && l.end >= T).map((l) => l.tenantName)));
check(newTenants.length > 20 && newTenants.every((n) => cr.some((r) => r.tenant === n)), `Tenant Credit lists the ${newTenants.length} tenants that moved in since purchase`);

// ── The load adds only what is missing ──
const toDeal = (r) => ({ id: `pl-test-${r.id}`, linked: true, quick: {}, inputs: { propertyName: r.name, fundName: "" }, pipelineId: r.id });
const add1 = V.sampleVenturesToAdd({ deals: [], funds: {}, valuations: {}, gp: null, pipeline: [] }, { baseInputs: DEFAULT_INPUTS, todayISO: T, toDeal });
check(add1.added.assets === 4 && add1.added.portfolios === 2 && add1.added.pipeline === 2 && add1.deals.length === 6 && add1.pipeline.every((r) => r.targetFund === V.SAMPLE_JV_NAME && add1.deals.some((d) => d.id === r.dealId)) && add1.pipeline.map((r) => r.stage).join() === "psa,loi", "a firm with none gets two portfolios, four assets and two screened pipeline deals (one under contract, one at LOI)");
const have = { deals: add1.deals, funds: { ...add1.funds, [V.SAMPLE_JV_NAME]: { ...add1.funds[V.SAMPLE_JV_NAME], prefPct: 9 } }, valuations: add1.valuations, gp: add1.gp, pipeline: add1.pipeline };
const add2 = V.sampleVenturesToAdd(have, { baseInputs: DEFAULT_INPUTS, todayISO: T, toDeal });
check(add2.deals.length === 0 && Object.keys(add2.funds).length === 0 && Object.keys(add2.valuations).length === 0 && add2.pipeline.length === 0 && JSON.stringify(add2.gp) === JSON.stringify(add1.gp), "run again, it adds nothing (terms the user changed are not put back)");
const add3 = V.sampleVenturesToAdd({ ...have, deals: have.deals.filter((d) => d.id !== "sample-jv-2") }, { baseInputs: DEFAULT_INPUTS, todayISO: T, toDeal });
check(add3.deals.length === 1 && add3.deals[0].id === "sample-jv-2", "a missing asset alone is added back");
// ── Construction management on construction spending (user, 11/27) ──
for (const d of v.deals) {
  const i = d.inputs, cf = underwrite(i).annualCashFlows;
  const asValue = underwrite({ ...i, cmFeeBasis: "value" }).annualCashFlows;
  check(i.cmFeeBasis === "spend" && d.quick.cmFeeBasis === "spend" && cf[0].constructionMgmtFee >= 0.015 * i.capexBudget - 1 && cf.every((y) => y.constructionMgmtFee >= 0 && y.constructionMgmtFee <= 0.015 * (i.capexBudget + y.tiAndLeasing) + 1) && cf.reduce((s, y) => s + y.constructionMgmtFee, 0) < 0.1 * asValue.reduce((s, y) => s + y.constructionMgmtFee, 0) && asValue.every((y) => near(y.constructionMgmtFee, 0.015 * i.purchasePrice)), `${i.propertyName}: the fee is 1.5% of the capital budget (year 1) and each year's tenant improvements, not 1.5% of the price every year`);
}
const mf1 = buildSampleFund({ todayISO: T }).deals[0].inputs;
check((mf1.cmFeeBasis ?? "value") === "value" && underwrite(mf1).annualCashFlows.every((y) => near(y.constructionMgmtFee, (mf1.cmFeePct / 100) * mf1.purchasePrice)), "Model Fund I keeps its fee on asset value, as before");
check(SP.SAMPLE_DATA_VERSION === 11, "the sample data version is 11");

console.log(`ventures1126: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
