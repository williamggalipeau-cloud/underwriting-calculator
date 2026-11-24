// Phase W: GP Economics (lib/gpEconomics.js) on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const W = j(R + "/lib/gpEconomics.js");
const P = j(R + "/lib/fundPlan.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1) => Math.abs(a - b) < e;
const TODAY = "2026-11-24";

const data = FX.workspaceData();
const fn = "Model Fund I";
const { SAMPLE_FUND_FEE_TERMS } = j(R + "/lib/samplePortfolio.js");
const terms = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], ...SAMPLE_FUND_FEE_TERMS, name: fn, capitalActivity: [] }; // the sample 1.5% fund fee
const deals = data.deals.filter((d) => d.inputs.fundName === fn && !d.id.startsWith("test-")).map((d) => snapshotDeal(d.inputs, d.id));
ok(deals.length >= 5, `fixture fund: ${deals.length} assets`);

const f = W.fundGpEconomics(fn, deals, terms, { todayISO: TODAY });
const proj = P.fundProjection(deals, terms, { todayISO: TODAY });
ok(close(f.promote.total, proj.returns.gpPromote, 1), `fund promote ${(f.promote.total / 1e6).toFixed(2)}M matches Fund Return's (fund plan) GP promote`);
ok(f.promote.total > 0 && close(f.years.reduce((s, y) => s + y.promote, 0), f.promote.total, 1), "promote by year adds up to the fund's promote");
ok(close(f.promote.realized + f.promote.projected, f.promote.total), "promote split realized / projected");
ok(close(f.years.reduce((s, y) => s + y.coinvest, 0), f.coinvest.profit, 1) && close(f.coinvest.profit + f.promote.total, f.coinvest.gpProfit, 1), "co-invest profit by year adds up; co-invest + promote = GP profit");
ok(f.coinvest.equity > 0 && f.coinvest.multiple > 1 && f.coinvest.irr > 0 && f.coinvest.roe > 0, `GP equity ${(f.coinvest.equity / 1e6).toFixed(2)}M: multiple ${f.coinvest.multiple.toFixed(2)}x, IRR ${f.coinvest.irr.toFixed(1)}%, ROE ${f.coinvest.roe.toFixed(0)}%`);
ok(f.fees.mgmt > 0 && f.fees.pm > 0, `fees: asset management (fund fee) ${(f.fees.mgmt / 1e6).toFixed(2)}M, property management ${(f.fees.pm / 1e6).toFixed(2)}M`);
ok(close(f.fees.total, f.fees.mgmt + f.fees.pm + f.fees.cm) && close(f.years.reduce((s, y) => s + y.fees, 0), f.fees.total), "fee revenue = AM + PM + CM, by year");
ok(f.years.every((y) => close(y.total, y.fees + y.promote, 1e-6) && y.income === y.total), "each year's GP income = fees + promote; co-invest profit is not income (user, 11/24)");
ok(close(f.years.reduce((s0, y) => s0 + y.coinvest, 0), f.coinvest.profit, 1) && f.years.filter((y) => y.coinvest).every((y) => f.assets.some((a) => a.exit.slice(0, 4) === y.year && a.coinvest)), "co-invest profit only in the years assets are sold, adding to the total");
ok(f.assets.length === deals.length && close(f.assets.reduce((s, a) => s + a.promote, 0), f.promote.total, 1) && close(f.assets.reduce((s, a) => s + a.promoteWeight, 0), 100, 1e-6), "asset promote allocated by share of gross profit, adding to the fund's");
ok(close(f.assets.reduce((s, a) => s + a.pm + a.cm, 0), f.fees.pm + f.fees.cm, 1), "asset fees add up to the fund's PM and CM");
ok(f.type === "Fund" && f.mode === "model", "fund type and the model basis");

// Fee vs. the fund management fee in the expense engine
const zero = W.fundGpEconomics(fn, deals, { ...terms, mgmtFeePct: 0 }, { todayISO: TODAY });
ok(zero.fees.mgmt === 0 && zero.fees.pm === f.fees.pm, "no fund fee: no asset management fee; PM unchanged");

// ── Firm roll-up ──
const half = W.fundGpEconomics("Fictional Fund II", deals.slice(0, 2), { ...terms, name: "Fictional Fund II", type: "Separate Account" }, { todayISO: TODAY });
const firm = W.firmGpEconomics([f, half], { todayISO: TODAY, discountPct: 8 });
const t = firm.totals;
ok(close(t.fees, f.fees.total + half.fees.total) && close(t.promote, f.promote.total + half.promote.total) && close(t.coinvest, f.coinvest.profit + half.coinvest.profit, 2), "firm totals sum the funds");
ok(close(t.total, t.fees + t.promote + t.coinvest) && close(t.feesShare + t.promoteShare + t.coinvestShare, 100, 1e-6), "shares of GP income add to 100%");
ok(t.feesPv === undefined && t.discountPct === undefined, "no discount rate or fee present value (removed, user 11/24)");
ok(firm.assets.length === deals.length + 2 && firm.funds[1].type === "Separate Account", "assets of every fund, with types");
const x = W.gpEconomicsXlsx("All funds", firm);
ok(/GP economics \(internal\)/.test(x[0][0]) && x[3][0] === "Life of fund" && x.some((r) => r[0] === "Total GP income") && x.some((r) => r[0] === "Asset" && r[1] === "Fund"), "Excel: life of fund, years, funds, assets");
ok(W.firmGpEconomics([], { todayISO: TODAY }).totals.total === 0, "no funds: zeros");

// ── Revenue Yield (user, 11/24): GP fees ÷ committed capital ──
const A = j(R + "/lib/dealDocApply.js");
const ry = W.revenueYield({ fees: 12e6, feesToDate: 2e6, terms: { targetEquity: 160e6, gpCommitPct: 5 }, assets: [{ acq: "2024-01-01", exit: "2033-01-01" }] });
ok(close(ry.pct, 7.5, 1e-9) && close(ry.toDatePct, 1.25, 1e-9) && close(ry.lifeYears, 9, 0.01) && close(ry.perYearPct, 7.5 / ry.lifeYears, 1e-9) && ry.basis === "lp+gp" && ry.source === "default" && ry.fromCommitments, "fees $12M ÷ $160M LP + GP = 7.50%; per year over 9 years; to date 1.25%");
const lp = W.revenueYield({ fees: 12e6, feesToDate: 0, terms: { targetEquity: 160e6, gpCommitPct: 5, revenueYieldBasis: "lp", revenueYieldBasisSource: "doc" }, assets: [] });
ok(close(lp.committed, 152e6) && close(lp.pct, 12 / 152 * 100, 1e-9) && lp.source === "doc" && lp.perYearPct === null, "LP only: commitments less the GP's 5%; from the document");
const fb = W.revenueYield({ fees: 1e6, feesToDate: 0, terms: {}, lpEquity: 9e6, gpEquity: 1e6, assets: [] });
ok(!fb.fromCommitments && close(fb.committed, 10e6) && close(fb.pct, 10, 1e-9), "no commitments: total equity is the fallback");
ok(W.revenueYield({ fees: 1e6, feesToDate: 0, terms: { revenueYieldBasis: "lp" }, lpEquity: 9e6, gpEquity: 1e6 }).committed === 9e6, "fallback, LP only: LP equity");
const comb = W.combineRevenueYield([ry, fb]);
ok(close(comb.committed, 170e6) && close(comb.pct, 13 / 170 * 100, 1e-9) && comb.anyFallback, "combined: total fees ÷ total committed, flagged when any uses equity");
ok(f.revenueYield && f.revenueYield.fees === f.fees.total && f.revenueYield.committed > 0 && f.revenueYield.pct > 0 && f.revenueYield.toDatePct <= f.revenueYield.pct, `fixture fund: Revenue Yield ${f.revenueYield.pct?.toFixed(2)}%, to date ${f.revenueYield.toDatePct?.toFixed(2)}%`);
ok(t.revenueYield && close(t.revenueYield.fees, t.fees) && firm.byType.every((b) => b.revenueYield), "firm and each portfolio type carry Revenue Yield");
ok(x.some((r) => /Revenue Yield, life of portfolios/.test(r[0])) && x.some((r) => r[0] === "Fund" && r.includes("Revenue Yield (%)")), "Excel: Revenue Yield rows and columns");
ok(A.feeBasisOf("Management fee charged on LP commitments only") === "lp" && A.feeBasisOf("on the Limited Partners' Capital Commitments, excluding the General Partner") === "lp" && A.feeBasisOf("on aggregate commitments of the LP and GP") === "lp+gp" && A.feeBasisOf("") === null, "the document's wording → LP only or LP + GP");
const doc = { id: "d1", doc_type: "lpa", abstract: { fields: [{ key: "fees_charged_on", status: "found", value: "LP commitments only" }] } };
const rows = A.compareDoc(doc, { terms: {} }).filter((r0) => r0.target === "revenueYieldBasis");
ok(rows.length === 1 && rows[0].docValue === "LP commitments only" && rows[0].differs, "LPA → Revenue Yield basis offered to apply");
const ap = A.applyDoc(doc, rows.map((r0) => r0.key), { terms: { revenueYieldBasis: "lp+gp", revenueYieldBasisSource: "user" } });
ok(ap.terms.revenueYieldBasis === "lp" && ap.terms.revenueYieldBasisSource === "doc", "applied: LP only, marked as from the document");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
