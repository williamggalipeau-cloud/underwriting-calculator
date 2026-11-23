// Phase L: Asset Return additions (lib/assetFees.js): GP profit, GP promote,
// GP ROE and projected fee revenue, on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const F = j(R + "/lib/assetFees.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ── The user's example (11/23) ──
const ex = F.gpEconomics({ lpEquity: 9_000_000, gpEquity: 1_000_000, lpTotalDistributions: 17_400_000, gpTotalDistributions: 2_600_000 });
ok(close(ex.gpProfit, 1_600_000) && close(ex.gpPromote, 600_000) && close(ex.gpRoe, 160), "example: GP profit $1.6M, GP promote $0.6M, GP ROE 160%");
ok(F.gpEconomics({ lpEquity: 1, gpEquity: 0, lpTotalDistributions: 2, gpTotalDistributions: 0 }).gpRoe === null, "no GP equity: no ROE");

// ── On a real deal ──
const d = FX.workspaceData().deals.find((x) => x.id === "sample-deal-2");
const r = underwrite(d.inputs);
const g = F.gpEconomics(r.waterfall);
ok(close(g.gpProfit, r.waterfall.gpPromote), "GP profit = the waterfall's old 'GP Promote' (GP distributions − GP equity)");
ok(g.gpPromote <= g.gpProfit + 1e-6 && g.gpPromote >= -1e-6, `GP promote ${(g.gpPromote / 1e3).toFixed(0)}k ≤ GP profit ${(g.gpProfit / 1e3).toFixed(0)}k`);
ok(close(g.gpRoe, (g.gpProfit / r.waterfall.gpEquity) * 100), `GP ROE ${g.gpRoe.toFixed(1)}% = profit ÷ GP equity`);

// ── Fee revenue ──
const inputs = { ...d.inputs, cmFeePct: 0.5 };
const r2 = underwrite(inputs);
const fr = F.feeRevenue(r2.annualCashFlows, 8);
ok(fr.rows.length === r2.annualCashFlows.length && fr.rows.every((x) => close(x.total, x.pm + x.cm)), "one row per hold year: PM + CM");
ok(close(fr.rows[0].pm, r2.annualCashFlows[0].managementFee) && close(fr.rows[0].cm, inputs.purchasePrice * 0.005), "PM fee from the cash flow; CM fee 0.5% of price");
ok(close(fr.total, fr.pm + fr.cm) && fr.pv < fr.total && fr.pv > 0, `total ${Math.round(fr.total).toLocaleString()}, PV at 8% ${Math.round(fr.pv).toLocaleString()}`);
ok(close(F.feeRevenue(r2.annualCashFlows, 0).pv, fr.total), "PV at 0% = total");
ok(F.feeRevenue([], 8).total === 0, "no cash flows: zero");
const rows = F.feeRevenueXlsx("Route 9", fr, g);
ok(rows.some((x) => x[0] === "Present value") && rows.some((x) => /GP promote/.test(x[0])) && !rows.some((x) => /asset management fee/i.test(x[0]) && typeof x[1] === "number"), "Excel: PV and GP rows; no per-asset AM fee line");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
