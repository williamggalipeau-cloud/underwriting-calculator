// Phase X: Distribution Analysis (lib/distributions.js) on the fictional
// fixture and the fictional Yardi cash file (tests/fixtures/sample-yardi).
const R = require("path").resolve(__dirname, "..", "..");
const fs = require("fs");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const X = j(R + "/lib/distributions.js");
const { hasCapitalActivity } = j(R + "/lib/fundFlows.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const TODAY = "2026-11-23";

const data = FX.workspaceData();
const fn = "Model Fund I";
const base = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], name: fn, capitalActivity: [] };
const raw = data.deals.filter((d) => d.inputs.fundName === fn && /^sample-deal-/.test(d.id));
const deals = raw.map((d) => snapshotDeal(d.inputs, d.id));
const byName = (n) => deals.find((d) => d.inputs.propertyName === n);
const Q3 = "2026-09-30", Q4_27 = "2027-12-31";

// ── Quarter helpers ──
ok(X.quarterEndOf("2026-08-14") === "2026-09-30" && X.quarterStartOf("2026-09-30") === "2026-07-01" && X.prevQuarterEnd("2026-03-31") === "2025-12-31", "quarter end / start / previous");
ok(X.isoFromReportDate("09/30/2026") === "2026-09-30" && X.isoFromReportDate("2026-09-30") === "2026-09-30" && X.isoFromReportDate("46295") === "2026-09-30" && X.isoFromReportDate("Sept") === null, "report dates: US, ISO, Excel serial");

// ── One asset ──
const afp = byName("Airport Flex Park");
const a0 = X.assetDistributable(afp, base, Q3);
const u = underwrite(afp.inputs);
ok(a0.status === "held" && a0.source === "projected" && close(a0.balance, a0.projected), "no balance entered: projected cash used, labelled projected");
ok(close(a0.wc, (u.annualCashFlows[0].operatingExpenses * 3) / 12, 1e-3), `working capital = 3 months of year-1 opex (${Math.round(a0.wc).toLocaleString()})`);
const a1 = X.assetDistributable(afp, base, Q3, { balance: 500_000, reserves: 50_000, committed: 25_000, source: "yardi" });
ok(a1.source === "yardi" && close(a1.distributable, 500_000 - 50_000 - 25_000 - a1.wc), "entered balance − reserves − committed − working capital");
ok(X.assetDistributable(afp, base, Q3, { balance: 1000 }).distributable === 0, "never below zero");
ok(X.assetDistributable(byName("Lakeshore Service Center"), base, Q3).status === "not yet acquired", "bought after the quarter: excluded");
ok(X.assetDistributable(afp, base, "2032-12-31").status === "sold", "sold before the quarter: excluded");

// ── Yardi cash report (tests/fixtures/sample-yardi/cash-balances-2026-09.csv) ──
const csv = fs.readFileSync(R + "/tests/fixtures/sample-yardi/cash-balances-2026-09.csv", "utf8");
const grid = csv.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "")));
const rep = X.parseCashReport(grid, deals, {});
ok(rep.rows.length === 6 && rep.unmatched.length === 0, `6 balances matched by name, Total row skipped (${rep.rows.length})`);
ok(close(rep.rows.find((r) => r.dealId === byName("Route 9 Small Bay").id).balance, 312_904.66) && close(rep.rows.find((r) => r.dealId === byName("Mill Creek Business Park").id).balance, -12_340), "amounts with commas; (12,340.00) read as negative");
ok(!rep.rows.some((r) => r.dealId === byName("Southpoint Flex").id), "Southpoint Flex has no balance (fallback case)");
ok(rep.mapping.afp01 === afp.id && X.parseCashReport(grid.map((r, i) => (i && r[1] ? [r[0], "renamed", ...r.slice(2)] : r)), deals, rep.mapping).rows.length === 6, "codes remembered: matched again by code after a rename");
ok(X.isoFromReportDate(rep.rows[0].asOf) === Q3, "as-of date read (9/30/2026)");
ok(X.parseCashReport([["foo", "bar"], [1, 2]], deals).error, "no header: a clear error");

// ── Whole fund ──
const cash = Object.fromEntries(rep.rows.map((r) => [r.dealId, { balance: r.balance, source: "yardi" }]));
const terms = { ...base, distributions: { cash: { "2026-Q3": cash } } };
const c = X.distributable(deals, terms, Q3, { todayISO: TODAY });
ok(c.held.length === 7 && c.held.filter((a) => a.source === "projected").map((a) => a.name).join() === "Southpoint Flex", `7 assets held at 9/30/26; only Southpoint projected`);
ok(close(c.split.actualBalance, 941_639.18, 0.01) && c.split.projectedCount === 1, "actual vs. projected split of the cash balances");
ok(close(c.assetsTotal, c.held.reduce((s, a) => s + a.distributable, 0)), "assets total = sum of asset distributable");
ok(close(c.total, Math.max(0, c.assetsTotal + c.fund.excess - c.subLine.repay)), "distributable = assets + fund excess − sub line repayment");
ok(c.fund.min > 0 && c.fund.cashSource === "projected", `fund minimum: 6 months of fee and line costs (${Math.round(c.fund.min).toLocaleString()})`);
const cf = X.distributable(deals, { ...terms, distributions: { ...terms.distributions, fundCash: { "2026-Q3": c.fund.min + 250_000 } } }, Q3, { todayISO: TODAY });
ok(cf.fund.cashSource === "entered" && close(cf.fund.excess, 250_000) && close(cf.total, c.total + 250_000), "entered fund cash above the minimum adds to distributable");
const cd = X.distributable(deals, { ...terms, distributions: { ...terms.distributions, subLine: { rule: "clean-down" } } }, Q3, { todayISO: TODAY });
ok(cd.subLine.balance > 0 && close(cd.subLine.repay, cd.subLine.balance) && cd.total === Math.max(0, cd.assetsTotal + cd.fund.excess - cd.subLine.balance), `clean-down: repays the line balance first (${Math.round(cd.subLine.balance).toLocaleString()})`);
const fx = X.distributable(deals, { ...terms, distributions: { ...terms.distributions, subLine: { rule: "fixed", amount: 100_000 } } }, Q3, { todayISO: TODAY });
ok(close(fx.subLine.repay, 100_000) && close(fx.total, Math.max(0, c.total - 100_000)), "fixed repayment: $100k off the top");
ok(X.fundExpenseNext([{ quarter: "2026-07-01", fee: 9 }, { quarter: "2026-10-01", fee: 10, lineInterest: 1 }, { quarter: "2027-01-01", fee: 10, lineUnused: 2 }, { quarter: "2027-04-01", fee: 99 }], Q3) === 23, "fund minimum uses the next two quarters only");

// ── Choosing and splitting ──
const c27 = X.distributable(deals, base, Q4_27, { todayISO: TODAY });
const all = X.chooseDistribution(c27, base, { mode: "pct", value: 100 });
ok(close(all.amount, c27.total) && close(all.lp + all.gp + all.heldBack, all.amount, 1e-3) && close(all.retained, 0, 1e-6), `100%: ${Math.round(all.amount).toLocaleString()} split LP ${Math.round(all.lp).toLocaleString()} / GP ${Math.round(all.gp).toLocaleString()}`);
ok(all.lp > 0 && all.lp >= all.gp, "after LPs fund capital, income goes to LPs first (pref) per the LPA");
const half = X.chooseDistribution(c27, base, { mode: "pct", value: 50 });
ok(close(half.amount, c27.total / 2) && close(half.retained, c27.total / 2), "50%: half stays in reserve");
ok(close(X.chooseDistribution(c27, base, { mode: "amount", value: 1e12 }).amount, c27.total), "an amount is capped at distributable cash");
const early = X.chooseDistribution(c, base, { mode: "pct", value: 100 });
ok(close(early.lp + early.gp + early.heldBack, early.amount, 1e-3), "before LPs fund capital: amount = LP + GP + held by the waterfall");

// ── Yields and history ──
const y = X.yields(250_000, { lpContributed: 40_000_000, lpNav: 50_000_000 });
ok(close(y.onContributed, 2.5) && close(y.onNav, 2.0), "yield: LP × 4 ÷ contributed (2.50%), ÷ NAV (2.00%)");
ok(X.yields(1, {}).onContributed === null, "no capital: no yield");
const act = [
  { date: "2026-02-15", type: "distribution", amount: 100_000 },
  { date: "2026-05-15", type: "distribution", amount: 200_000 },
  { date: "2026-08-15", type: "distribution", amount: 300_000 },
  { date: "2026-08-20", type: "call", amount: 999_000 },
  { date: "2025-11-15", type: "distribution", amount: 50_000 },
  { date: "2026-10-15", type: "distribution", amount: 999 },
];
const h = X.history(act, "2026-12-31", { lpContributed: 40_000_000, gpCommitPct: 5 });
ok(h.quarters.map((q) => q.quarter).join() === "2025-Q4,2026-Q1,2026-Q2,2026-Q3" && h.quarters.map((q) => q.amount).join() === "50000,100000,200000,300000", "last 4 quarters before the one proposed (its own quarter excluded); distributions only");
ok(close(h.ttm, 650_000) && close(h.ttmYield, (650_000 * 0.95 / 40_000_000) * 100) && close(h.quarters[3].yield, (300_000 * 0.95 * 4 / 40_000_000) * 100), "trailing 12 months and each quarter's yield on the LP share");

// ── Recording a distribution doesn't switch the fund to actual calls ──
ok(!hasCapitalActivity({ capitalActivity: [{ date: "2026-10-15", type: "distribution", amount: 5 }] }) && hasCapitalActivity({ capitalActivity: [{ date: "2026-10-15", type: "call", amount: 5 }] }), "a recorded distribution alone keeps the fund on the model");

// ── Excel ──
const rows = X.distributionXlsx(fn, c, early, y, h);
ok(rows[0][0].includes("2026 Q3") && rows.some((r) => r[0] === "Distributable cash" && close(r[1], c.total)) && rows.some((r) => r[2] === "projected, no balance entered"), "Excel: title, total and the projected label");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
