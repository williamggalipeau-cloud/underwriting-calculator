// 1.1.9 (user, 11/26): Finance → Firm Economics (lib/firmEconomics.js) on the
// fictional fixture (Model Fund I test copy).
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const G = j(R + "/lib/gpEconomics.js");
const FE = j(R + "/lib/firmEconomics.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1) => Math.abs(a - b) < e;
const TODAY = "2026-11-26";

const data = FX.workspaceData();
const fn = "Model Fund I";
const deals = data.deals.filter((d) => d.inputs.fundName === fn && !d.id.startsWith("test-")).map((d) => SP.snapshotDeal(d.inputs, d.id));
const base = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], ...SP.SAMPLE_FUND_FEE_TERMS, acqFeePct: 1, dispFeePct: 0.5, name: fn, capitalActivity: [] };
const run = (terms) => { const f = G.fundGpEconomics(fn, deals, terms, { todayISO: TODAY }); return { f, fe: FE.firmEconomics([f]) }; };

// This firm as the only GP and the sponsor (the default parties).
const { f, fe } = run(base);
const t = fe.totals;
const px = f.parties;
ok(fe.shown && fe.rows.length === 1, "shown: the firm is both GP and sponsor in Model Fund I");
ok(close(t.equity, px.gp.equity) && t.spEquity === 0, `firm equity = all the GP capital; the sponsor's co-invest is that share, nothing separate (${(t.equity / 1e6).toFixed(2)}M)`);
ok(run({ ...base, sponsorCommitPct: 2 }).fe.totals.equity === t.equity, "an older sponsor co-invest % adds nothing (1.1.10)");
ok(close(t.fees, f.fees.total) && close(t.fees, px.sponsor.fees + px.gp.fees), `fees counted once: ${(t.fees / 1e6).toFixed(2)}M = the portfolio's fees`);
ok(close(t.promote, f.promote.total) && close(t.coinvest, px.gp.coinvest + px.sponsor.coinvest), "both sides of the promote and both co-invests reach the firm");
ok(close(t.total, px.gp.total + px.sponsor.total), "Firm Economics = GP Economics + Sponsor Economics when the firm is both");
ok(close(fe.years.reduce((s, y) => s + y.total, 0), t.total) && close(fe.years.at(-1).cumulative, t.total), "by year adds up to the total; cumulative ends at it");
ok(close(fe.feesByType.reduce((s, x) => s + x.life, 0), t.fees) && close(fe.feesByType.reduce((s, x) => s + x.toDate, 0), t.feesToDate), "fees by type add up (life and to date)");
ok(close(t.roe, ((t.promote + t.coinvest) / t.equity) * 100, 0.01) && close(t.roeWithFees, (t.total / t.equity) * 100, 0.01) && t.multiple > 1 && t.multipleWithFees > t.multiple, `ROE on capital only ${t.roe.toFixed(0)}%, with fees ${t.roeWithFees.toFixed(0)}%`);
ok(t.irr > 0 && t.irr < 500, `IRR on capital only: ${t.irr.toFixed(1)}%`);
ok(close(t.revenueYield.pct, (t.fees / t.revenueYield.committed) * 100, 0.001), `Revenue Yield ${t.revenueYield.perYearPct.toFixed(2)}% a year on the firm's fees`);

// An outside GP partner: 40% of the GP capital, 35 of the GP side's 70% of the promote.
const ext = run({ ...base, gpParties: [{ id: "gp1", who: "firm", capitalPct: 60, promotePct: 35 }, { id: "gp2", who: "external", name: "Fictional Capital LP", capitalPct: 40, promotePct: 35 }] });
const e = ext.fe.totals, r0 = ext.fe.rows[0];
ok(close(e.gpEquity, 0.6 * px.gp.equity) && close(e.equity, 0.6 * px.gp.equity), "outside partner: firm equity = the firm's 60% of the GP capital");
ok(close(e.gpPromote, 0.35 * f.promote.total, 2) && close(e.sponsorPromote, 0.3 * f.promote.total, 2), "promote by the agreements: GP side 70% of which the firm has 35 points; sponsor side 30%");
ok(close(e.gpCoinvest, 0.6 * px.gp.coinvest), "co-invest profit follows the firm's capital share");
ok(r0.outsideGp.join() === "Fictional Capital LP" && close(r0.capShare, 60, 0.01) && close(r0.gpPromoteShare, 50, 0.01), "by portfolio: the outside partner named, the firm's shares shown");
ok(close(ext.fe.years.reduce((s, y) => s + y.total, 0), e.total), "outside partner: by year still adds up");

// 1.1.10: the GP earns no fees (an older fee to the GP reads as the sponsor's, all the firm's); outsourced fees count for nobody.
const gpFee = run({ ...base, feeToPm: "gp", feeToCm: "third", gpParties: [{ id: "gp1", who: "firm", capitalPct: 60, promotePct: 70 }, { id: "gp2", who: "external", name: "X", capitalPct: 40, promotePct: 0 }] }).fe;
ok(close(gpFee.feesByType.find((x) => x.key === "pm").life, f.fees.pm) && gpFee.feesByType.find((x) => x.key === "cm").life === 0, "an older PM fee to the GP: all the firm's (sponsor); outsourced CM: not counted");

// The firm is always the sponsor: every portfolio counts, even with no GP capital of its own.
const noGp = run({ ...base, sponsorWho: "external", gpParties: [{ id: "gp1", who: "external", name: "X", capitalPct: 100, promotePct: 100 }] }).fe;
ok(noGp.shown && noGp.totals.equity === 0 && close(noGp.totals.fees, f.fees.total) && noGp.totals.gpPromote === 0, "an outside GP with all the capital and the GP side: the firm keeps its fees (and the sponsor's promote, none here)");

// Excel carries the sections.
const x = FE.firmXlsx(fe, { title: "T" });
ok(["Summary", "Returns", "By portfolio", "Fees by type", "By year", "Promote split", "By asset"].every((s) => x.some((row) => row[0] === s)), "Excel / PDF sections");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
