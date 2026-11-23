// Phase J: underwritten vs. actual + projected (lib/uwActual.js) on the
// fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const J = j(R + "/lib/uwActual.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const AS_OF = "2026-11-23";

const deals = FX.workspaceData().deals;
const d = structuredClone(deals.find((x) => x.id === "sample-deal-1")); // Airport Flex Park, acquired 1/30/2026
d.inputs.businessPlan = { revisions: [], actuals: {} };
d.inputs.assetMedia = { photos: [] };

// ── Baseline ──
const b = J.freezeBaseline(d.inputs, { by: "am@example.com", at: "2026-01-30T12:00:00Z" });
ok(b.at === "2026-01-30T12:00:00Z" && b.by === "am@example.com" && b.source === "closing", "baseline: when, who, source");
ok(!("businessPlan" in b.inputs) && !("assetMedia" in b.inputs) && !("uwBaseline" in b.inputs) && b.inputs.purchasePrice === d.inputs.purchasePrice, "baseline keeps the model inputs, not tracking data");
d.inputs.purchasePrice += 1; ok(b.inputs.purchasePrice === d.inputs.purchasePrice - 1, "baseline is a frozen copy"); d.inputs.purchasePrice -= 1;
ok(J.freezeBaseline({ ...d.inputs, icApproved: { irr: 14 } }).source === "ic", "source is ic when the IC-approved figures are on the deal");

// ── Scenario matches the model ──
const s = J.scenario(d.inputs);
const u = underwrite(d.inputs);
ok(close(s.returns.irr, u.returns.irr) && close(s.returns.em, u.returns.equityMultiple) && s.years.length === d.inputs.holdPeriodYears, `scenario = model: IRR ${s.returns.irr.toFixed(2)}%, ${s.years.length} years`);
ok(close(s.years[0].noi, u.annualCashFlows[0].noi) && close(s.years[0].cashFlow, u.annualCashFlows[0].pretaxCashFlow) && close(s.years[0].dscr, u.annualCashFlows[0].noi / u.annualCashFlows[0].debtService), "year 1 NOI, cash flow and DSCR from the model");
ok(isFinite(s.returns.unleveredIrr) && s.returns.unleveredIrr < s.returns.irr, `unlevered IRR ${s.returns.unleveredIrr.toFixed(2)}% (below levered with positive leverage)`);

// ── No actuals, nothing changed → no gap ──
const c0 = J.compare(b, d.inputs, AS_OF);
ok(close(c0.returns.irr.v, 0) && c0.years.every((y) => y.status === "projected") && c0.actual.actualMonths === 0, "unchanged deal, no actuals: zero gap, all years projected");
const a0 = J.attribution(b, d.inputs, AS_OF);
ok(a0.rows.every((r) => close(r.delta, 0)) && close(a0.gap, 0), "attribution: every cause 0");

// ── Actual NOI by hold year ──
const acts = {};
const m0 = d.inputs.acquisitionDate.slice(0, 7); // 2026-01
const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
for (const m of months) acts[m] = { noi: 50000 };
acts["2025-12"] = { noi: 99999 }; // before acquisition: ignored
acts["2027-01"] = { noi: 99999 }; // after as-of: ignored
const cur = structuredClone(d.inputs);
cur.businessPlan = { actuals: acts };
const by = J.actualsByYear(cur, AS_OF);
ok(m0 === "2026-01" && by[1]?.months === 6 && by[1].noi === 300000 && !by[0] && Object.keys(by).length === 1, "actuals grouped by hold year (before acquisition and after today ignored)");
ok(J.currentHoldYear(cur, AS_OF) === 1 && J.currentHoldYear(cur, "2027-02-01") === 2 && J.currentHoldYear(cur, "2025-01-01") === 0, "current hold year");

const ap = J.actualPlusProjected(cur, AS_OF);
const y1m = s.years[0].noi;
ok(ap.years[0].status === "partial" && close(ap.years[0].noi, 300000 + (y1m * 6) / 12) && ap.years[1].status === "projected" && close(ap.years[1].noi, s.years[1].noi), "partial year: actual months + model for the rest; later years projected");
ok(close(ap.years[0].cashFlow - s.years[0].cashFlow, ap.years[0].noi - y1m), "cash flow moves with NOI (capital and debt service from the model)");
const lower = 300000 + (y1m * 6) / 12 < y1m;
ok(lower === (ap.returns.irr < s.returns.irr), `IRR follows actual NOI: ${s.returns.irr.toFixed(2)}% → ${ap.returns.irr.toFixed(2)}%`);
const occ = J.rentRollOccupancy({ units: [{ squareFeet: 600, leaseStatus: "occupied" }, { squareFeet: 400, leaseStatus: "vacant" }] });
ok(close(occ, 60) && isNaN(J.rentRollOccupancy({})), "rent roll occupancy");

// ── Changes since the baseline and attribution ──
cur.exitCapRatePct = d.inputs.exitCapRatePct + 0.5;
cur.purchasePrice = d.inputs.purchasePrice * 1.02;
cur.realEstateTaxPSF = (d.inputs.realEstateTaxPSF ?? 0) + 0.25;
const c = J.compare(b, cur, AS_OF);
ok(c.returns.exitCap.v > 0.49 && c.returns.irr.v < 0 && c.returns.exitValue.v < 0, `higher exit cap and price: IRR ${c.returns.irr.u.toFixed(2)}% → ${c.returns.irr.a.toFixed(2)}%`);
const at = J.attribution(b, cur, AS_OF);
const sum = at.rows.reduce((t2, r) => t2 + r.delta, 0);
ok(close(sum, at.gap, 0.05), `causes add up to the gap: ${sum.toFixed(2)} vs ${at.gap.toFixed(2)}`);
const row = (k) => at.rows.find((r) => r.key === k);
ok(row("price").delta < 0 && row("price").changed.includes("purchasePrice"), `price: ${row("price").delta} pts`);
ok(row("exit").delta < 0 && row("exit").changed.includes("exitCapRatePct"), `exit cap: ${row("exit").delta} pts`);
ok(row("expenses").changed.includes("realEstateTaxPSF"), `expenses: ${row("expenses").delta} pts (taxes)`);
ok(row("leasing").delta === 0 && row("financing").delta === 0 && row("timing").delta === 0, "unchanged groups contribute 0");
ok(close(row("operations").delta, ap.returns.irr - s.returns.irr, 0.05), `operations to date: ${row("operations").delta} pts`);
ok(at.rows.map((r) => r.key).join() === "price,leasing,expenses,capex,financing,timing,exit,other,operations", "attribution order");
ok(J.GROUPS.flatMap(([, , ks]) => ks).length === new Set(J.GROUPS.flatMap(([, , ks]) => ks)).size, "no input in two groups");

// ── Whole fund ranking ──
const e = structuredClone(deals.find((x) => x.id === "sample-deal-2"));
const eb = J.freezeBaseline(e.inputs, { at: "2026-03-16T00:00:00Z" });
e.inputs.exitCapRatePct -= 0.25; // outperforming
const rows = J.fundRows([{ id: d.id, inputs: { ...cur, uwBaseline: b } }, { id: e.id, inputs: { ...e.inputs, uwBaseline: eb } }, { id: "x", inputs: { ...d.inputs } }], AS_OF);
ok(rows.length === 2 && rows[0].id === d.id && rows[0].gap < 0 && rows[1].gap > 0, `ranked by gap, shortfall first: ${rows.map((r) => `${r.name} ${r.gap.toFixed(2)}`).join(", ")}`);
ok(rows[0].year === 1 && rows[0].status === "partial" && rows[0].actualMonths === 6, "current year and months of actuals");

// ── Excel rows ──
const xr = J.compareRows("Airport Flex Park", c, at);
ok(xr[0][0].includes("underwritten vs. actual") && xr.some((r) => r[0] === "Levered IRR") && xr.some((r) => r[0] === "Total gap"), "asset workbook rows: years, returns, attribution");
const fx = J.fundRowsXlsx(rows);
ok(fx.length === 3 && fx[0][4] === "Gap (points)", "fund workbook rows");

// Regression guard: freezing changes nothing in the model.
ok(close(underwrite({ ...d.inputs, uwBaseline: b }).returns.irr, u.returns.irr), "the baseline doesn't change the model");

if (fail) { console.log(`\n${fail} failed`); process.exitCode = 1; } else console.log("\nall passed");
