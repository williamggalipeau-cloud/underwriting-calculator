// 1.1.12 (code review, 11/27): the LP / GP waterfall and XIRR, against
// hand-worked cases. GP capital is paid pro rata; the waterfall (pref →
// return of capital → catch-up → tiers) runs on the LPs' share; tiers are
// marginal by default (user, 11/27), cliff on request.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const T = j(R + "/lib/fundTimeline.js");
const C = j(R + "/lib/calculations.js");
const P = j(R + "/lib/fundPlan.js");
const A = j(R + "/lib/assetFees.js");
const DA = j(R + "/lib/dealDocApply.js");
const { DEFAULT_FUND_TERMS, termsToRows } = j(R + "/lib/fundTerms.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 0.005) => Math.abs(a - b) < e;
const one = (proceeds, cfg = {}) => T.computeDatedWaterfall(
  [{ date: "2026-01-01", amount: -100, kind: "call" }, { date: "2027-01-01", amount: proceeds, kind: "capital" }],
  { lpEquityPct: 90, preferredReturnPct: 8, catchUpGpPct: 100, tiers: [{ irrThreshold: null, lpSplit: 80, gpSplit: 20 }], ...cfg });

// XIRR
ok(close(T.xirr([{ date: "2026-01-01", amount: -100 }, { date: "2027-01-01", amount: 110 }]) * 100, 10, 1e-6), "XIRR: −100, +110 a year later = 10%");
ok(close(T.xirr([{ date: "2026-01-01", amount: -100 }, { date: "2028-01-01", amount: 121 }]) * 100, 10, 0.02), "XIRR: −100, +121 two years later = 10%");
ok(Number.isNaN(T.xirr([{ date: "2026-01-01", amount: -100 }])), "XIRR: no sign change → not a number");

// One tier, full catch-up: 100 of profit on 100 (LPs 90, GP 10), 8% pref, 80/20.
//   GP capital: 10% of 200 = 20 (10 back, 10 profit). LPs' side 180: pref 7.2,
//   capital 90, catch-up 1.8 (so carry = 20% of 9), then 81 split 80/20.
//   Carry = 1.8 + 16.2 = 18 = 20% of the LPs' side's 90 profit. LPs 72. GP 28.
const full = one(200);
ok(close(full.gpCarry, 18) && close(full.lpTotalDistributions - full.lpEquity, 72) && close(full.gpTotalDistributions - full.gpEquity, 28), `full catch-up: carry 18, LP profit 72, GP profit 28 (${full.gpCarry.toFixed(2)}, ${(full.lpTotalDistributions - full.lpEquity).toFixed(2)})`);
ok(close(full.lpTotalDistributions + full.gpTotalDistributions, 200) && close(A.gpEconomics(full).gpPromote, 18), "every dollar is distributed; the promote is the carry");
// No catch-up: carry = 20% of what's left after pref and capital = 0.2 × 82.8.
ok(close(one(200, { catchUpGpPct: 0 }).gpCarry, 16.56), "no catch-up: carry 16.56");
// A partial catch-up reaches the same split when there is enough profit…
ok(close(one(200, { catchUpGpPct: 50 }).gpCarry, 18), "50% catch-up, ample profit: the same 18");
// …and pays the GP its rate of each dollar when there isn't: 2 left after pref and capital.
const thin100 = one((7.2 + 90 + 2) / 0.9), thin50 = one((7.2 + 90 + 2) / 0.9, { catchUpGpPct: 50 });
ok(close(thin100.gpCarry, 1.8 + 0.2 * 0.2) && close(thin50.gpCarry, 1.0), `thin profit: 100% catch-up 1.84, 50% catch-up 1.00 (${thin100.gpCarry.toFixed(3)}, ${thin50.gpCarry.toFixed(3)})`);
// Below the pref: no carry; the GP capital still gets its pro-rata share.
const low = one(105);
ok(low.gpCarry === 0 && close(low.gpTotalDistributions, 10.5) && close(low.lpTotalDistributions, 94.5), "below the pref: no carry, GP capital paid pro rata");

// Marginal tiers (the default): 80/20 to a 12% IRR, 70/30 to 18%, 60/40 after.
//   Proceeds 150: LPs' side 135. Pref 7.2, capital 90, catch-up 1.8 (LP at 97.2).
//   To 12% (100.8): LP needs 3.6 → 4.5 at 80/20 (GP 0.9).
//   To 18% (106.2): LP needs 5.4 → 7.714 at 70/30 (GP 2.314).
//   Rest 23.786 at 60/40: LP 14.271, GP 9.514.  Carry 14.529; LP 120.471; GP capital 15.
const tiers = [{ irrThreshold: 12, lpSplit: 80, gpSplit: 20 }, { irrThreshold: 18, lpSplit: 70, gpSplit: 30 }, { irrThreshold: null, lpSplit: 60, gpSplit: 40 }];
const m = one(150, { tiers });
ok(close(m.gpCarry, 14.529) && close(m.lpTotalDistributions, 120.471) && close(m.gpTotalDistributions, 15 + 14.529) && m.tierMethod === "marginal" && m.activeTier.irrThreshold === null, `marginal tiers, hand-worked: carry 14.529, LP 120.471 (${m.gpCarry.toFixed(3)}, ${m.lpTotalDistributions.toFixed(3)})`);
// At a hurdle the LPs' IRR is exactly the hurdle; more proceeds never pay the LPs less.
const at12 = one((7.2 + 90 + 1.8 + 4.5) / 0.9, { tiers });
ok(close(at12.lpIRR, 12, 0.01), `the first tier ends when the LPs reach a 12% IRR (${at12.lpIRR.toFixed(3)}%)`);
let mono = true, prev = -1;
for (let x = 100; x <= 300; x += 0.5) { const lp = one(x, { tiers }).lpTotalDistributions; if (lp < prev - 1e-9) mono = false; prev = lp; }
ok(mono, "marginal: more proceeds never reduce what the LPs receive");
const hi = one(400, { tiers }), hi1 = one(401, { tiers });
ok(close(hi1.gpCarry - hi.gpCarry, 0.9 * 0.4) && close(hi1.lpTotalDistributions - hi.lpTotalDistributions, 0.9 * 0.6), "top tier: of each extra dollar, the LPs' side splits 60 / 40 and the GP capital takes its 10%");

// Cliff (on request): the tier the whole IRR lands in applies to all profit, so the LPs can lose at a hurdle.
const c1 = one(117.9, { tiers, tierMethod: "cliff" }), c2 = one(118.1, { tiers, tierMethod: "cliff" });
ok(c1.tierMethod === "cliff" && c2.lpTotalDistributions < c1.lpTotalDistributions, "cliff: crossing 18% lowers the LPs' distributions (why marginal is the default)");

// Income before a sale: pref and capital only; the excess (and the GP capital's share of it) waits for the sale.
const inc = T.computeDatedWaterfall([{ date: "2026-01-01", amount: -100, kind: "call" }, { date: "2027-01-01", amount: 20, kind: "income" }, { date: "2028-01-01", amount: 200, kind: "capital" }], { lpEquityPct: 90, preferredReturnPct: 8, catchUpGpPct: 100, tiers });
const r1 = inc.ledger.find((r) => r.kind === "income");
ok(close(r1.pref, 7.2) && close(r1.rocLp, 10.8) && r1.carry === 0 && close(r1.gp, 2) && close(inc.lpTotalDistributions + inc.gpTotalDistributions, 220), "income: pref then capital, no carry; all cash is distributed by the end");

// The single-asset (annual) waterfall is the same engine.
const ann = C.computeWaterfall([-100, 0, 0, 200], 100, { lpEquityPct: 90, preferredReturnPct: 8, catchUpGpPct: 100, tiers });
const dated = T.computeDatedWaterfall([{ date: "2001-01-01", amount: -100, kind: "call" }, { date: "2004-01-01", amount: 200, kind: "capital" }], { lpEquityPct: 90, preferredReturnPct: 8, catchUpGpPct: 100, tiers });
ok(close(ann.lpTotalDistributions, dated.lpTotalDistributions) && close(ann.gpCarry, dated.gpCarry) && ann.yearlyDist.length === 3 && close(ann.lpFlows[0], -90), "annual waterfall = dated waterfall (compound pref over the gap years)");

// Fund terms: marginal by default, in the CSV, and read from the LPA.
ok(DEFAULT_FUND_TERMS.tierMethod === "marginal" && P.waterfallConfig(DEFAULT_FUND_TERMS).tierMethod === "marginal" && P.waterfallConfig({ ...DEFAULT_FUND_TERMS, tierMethod: "cliff" }).tierMethod === "cliff", "fund terms: marginal by default; cliff when set");
ok(termsToRows(DEFAULT_FUND_TERMS).some((r) => r[0] === "Promote tier method" && r[1] === "Marginal"), "terms export shows the tier method");
ok(JSON.stringify(DA.tiersOf("80/20 to a 12% IRR; 70/30 to an 18% IRR; 60/40 thereafter")) === JSON.stringify(tiers) && DA.tiersOf("a promote") === null, "LPA promote text → tiers");
ok(DA.tierMethodOf("Marginal") === "marginal" && DA.tierMethodOf("Each split applies only to the distributions within its tier") === "marginal" && DA.tierMethodOf("the split applies to all distributions once the hurdle is met") === "cliff" && DA.tierMethodOf("") === null, "LPA tier method → marginal / cliff");
const lpa = require(R + "/docs/sample-deal-docs/deals/abstracts/model-fund-i-lpa.json");
const val = (k) => lpa.fields.find((f) => f.key === k)?.value;
ok(val("tier_method") === "Marginal" && JSON.stringify(DA.tiersOf(val("promote"))) === JSON.stringify(DEFAULT_FUND_TERMS.tiers), "the sample LPA states marginal tiers that match Model Fund I's terms");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
