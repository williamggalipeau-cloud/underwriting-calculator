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
ok(f.years.every((y) => close(y.total, y.fees + y.promote + y.coinvest, 1e-6)), "total GP income = fees + promote + co-invest, each year");
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

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
