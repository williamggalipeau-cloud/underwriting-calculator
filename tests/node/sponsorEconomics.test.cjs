// GP vs. Sponsor Economics (lib/gpEconomics.js, user 11/24): the parties
// (this firm or outside companies), who is paid each fee (sponsor, GP, or a
// third party: nobody's revenue), the promote split (portfolio and per asset),
// the sponsor's co-invest, and the firm's view for each role. Fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const W = j(R + "/lib/gpEconomics.js");
const { snapshotDeal, SAMPLE_FUND_FEE_TERMS } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1) => Math.abs(a - b) < e;
const TODAY = "2026-11-24";
const data = FX.workspaceData();
const fn = "Model Fund I";
const base = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], ...SAMPLE_FUND_FEE_TERMS, name: fn, capitalActivity: [] };
const deals = data.deals.filter((d) => d.inputs.fundName === fn && !d.id.startsWith("test-")).map((d) => snapshotDeal(d.inputs, d.id));
const run = (patch) => W.fundGpEconomics(fn, deals, { ...base, ...patch }, { todayISO: TODAY });

// Default: this firm is both; every fee to the sponsor; all promote to the GP.
const d = run({});
const P = d.parties;
ok(P.parties.firmRole === "both" && Object.values(P.parties.feeTo).every((v) => v === "sponsor") && P.parties.promoteGpPct === 100, "default: this firm is GP and sponsor; fees to the sponsor; promote to the GP");
ok(close(P.sponsor.fees, d.fees.total) && P.gp.fees === 0 && P.third.fees === 0, "default: all fee income is the sponsor's");
ok(close(P.gp.promote, d.promote.total) && close(P.sponsor.promote, 0) && close(P.gp.coinvest, d.coinvest.profit), "default: the GP has the promote and the co-invest profit");
ok(close(P.sponsor.total + P.gp.total, d.fees.total + d.promote.total + d.coinvest.profit, 2), "firm is both: the two add up to today's total GP economics");
ok(close(P.sponsor.revenueYield.pct, d.revenueYield.pct, 1e-6), "default: Revenue Yield unchanged");
ok(P.gp.irr != null && close(P.gp.roe, (P.gp.total / P.gp.equity) * 100, 1e-6), "GP return on invested capital (ROE, multiple, IRR when no split)");

// External operator; firm is the GP; PM outsourced; disposition fee to the GP; 40 / 60 promote with an asset override.
const ext = run({ sponsorWho: "external", sponsorName: "Fictional Operating Partners LLC", feeToPm: "third", pmThirdParty: "Example Property Services", feeToDisp: "gp", gpParties: [{ id: "gp1", who: "firm", capitalPct: 100, promotePct: 40 }], promoteGpPctByAsset: { "sample-deal-2": 30 } });
const E = ext.parties;
ok(E.parties.firmRole === "gp" && E.parties.sponsor.name === "Fictional Operating Partners LLC", "an outside operator; this firm is the GP");
ok(close(E.third.fees, ext.fees.pm) && close(E.gp.fees, ext.fees.disp) && close(E.sponsor.fees, ext.fees.mgmt + ext.fees.cm + ext.fees.acq), "outsourced property management is nobody's revenue; disposition fee to the GP; the rest to the sponsor");
ok(close(E.sponsor.fees + E.gp.fees + E.third.fees, ext.fees.total), "every fee is accounted for once");
const a0 = ext.assets.find((a) => a.id === "sample-deal-2");
const expectGp = ext.assets.reduce((s, a) => s + a.promote * (a.id === "sample-deal-2" ? 0.3 : 0.4), 0);
ok(close(E.gp.promote, expectGp) && close(E.gp.promote + E.sponsor.promote, ext.promote.total) && a0.promote > 0, "promote split 40 / 60, with one asset at 30 / 70");
ok(E.gp.irr === null && close(E.gp.total, E.gp.coinvest + E.gp.promote + E.gp.fees), "GP return = co-invest profit + promote share + fees paid to the GP (no IRR once split)");
ok(close(E.sponsor.revenueYield.fees, E.sponsor.fees) && E.sponsor.revenueYield.pct < d.revenueYield.pct, "Revenue Yield counts only the sponsor's fees");
ok(E.years.every((y) => close(y.sponsor.fees + y.gp.fees + y.third, (ext.years.find((z) => z.year === y.year)?.fees ?? 0), 1)), "by year: sponsor + GP + third-party fees = the year's fees");

// Two GP parties (user, 11/24): this firm 70% of the GP capital and 30% of the promote; an outside GP 30% / 20%; the sponsor 50%.
const two = run({ gpParties: [{ id: "a", who: "firm", capitalPct: 70, promotePct: 30 }, { id: "b", who: "external", name: "Example Capital GP", capitalPct: 30, promotePct: 20 }] });
const TW = two.parties;
const [ga, gb] = TW.gp.parties;
ok(TW.parties.promoteGpPct === 50 && TW.parties.sponsorPromotePct === 50 && close(TW.gp.promote, two.promote.total * 0.5) && close(TW.sponsor.promote, two.promote.total * 0.5), "promote: GP side 50% (30 + 20), sponsor 50%");
ok(close(ga.promote, TW.gp.promote * 0.6) && close(gb.promote, TW.gp.promote * 0.4) && close(ga.equity, TW.gp.equity * 0.7) && close(gb.coinvest, TW.gp.coinvest * 0.3), "each GP party: its capital share (co-invest) and its promote share");
ok(close(ga.total + gb.total, TW.gp.total) && gb.label === "Example Capital GP" && ga.label === "This firm", "the parties add up to the total GP economics");
const fTwo = W.firmPartyEconomics([two], "gp");
ok(fTwo.count === 1 && close(fTwo.totals.total, TW.gp.total) && close(fTwo.totals.firmShare, ga.total) && fTwo.byParty.length === 2 && fTwo.byParty[0].who === "firm", "GP view: total GP economics, then split by party (this firm first)");
const legacy = W.partiesOf({ gpWho: "external", gpName: "Old GP", promoteGpPct: 60 });
ok(legacy.gpParties.length === 1 && legacy.gpParties[0].name === "Old GP" && legacy.promoteGpPct === 60 && legacy.firmRole === "sponsor", "older single-GP terms still read");

// Sponsor co-invest alongside the LPs.
const co = run({ sponsorCommitPct: 2 }).parties;
ok(co.sponsor.equity > 0 && co.sponsor.coinvest > 0 && close(co.sponsor.total, co.sponsor.fees + co.sponsor.promote + co.sponsor.coinvest), "sponsor co-invest earns at the LPs' net multiple");

// Firm view: only the portfolios where this firm has the role count.
const firmGp = W.firmPartyEconomics([d, ext], "gp");
const firmSp = W.firmPartyEconomics([d, ext], "sponsor");
const firmSpAll = W.firmPartyEconomics([d, ext], "sponsor", { includeExternal: true });
ok(firmGp.count === 2 && close(firmGp.totals.promote, P.gp.promote + E.gp.promote), "GP view: both portfolios (the firm is the GP in each)");
ok(firmSp.count === 1 && close(firmSp.totals.fees, P.sponsor.fees) && firmSp.rows.length === 1, "Sponsor view: only the portfolio where the firm is the sponsor");
ok(firmSpAll.rows.length === 2 && firmSpAll.rows.some((r) => !r.ours) && close(firmSpAll.totals.fees, firmSp.totals.fees), "outside sponsors can be listed, never in the totals");
ok(firmSp.totals.revenueYield && firmGp.totals.roe > 0 && firmGp.years.length > 0 && firmSp.years.length > 0, "Revenue Yield on Sponsor; ROE on GP; years for both");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
