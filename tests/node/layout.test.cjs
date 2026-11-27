// 11/23 layout release: firm-wide header strip (lib/enterprise.js), fund type
// tag (lib/fundTypes.js) and Baywise workbook properties (lib/xlsx.js), on
// fictional data only.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const E = j(R + "/lib/enterprise.js");
const T = j(R + "/lib/fundTypes.js");
const X = j(R + "/lib/xlsx.js");
const { underwrite } = j(R + "/lib/calculations.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const TODAY = "2026-11-23";
const unit = (id, sf, status, tenant) => ({ id, squareFeet: sf, leaseStatus: status, tenantName: tenant });
const deal = (id, inputs) => ({ id, inputs: { fundName: "Fund A", acquisitionDate: "2025-06-01", purchasePrice: 10_000_000, squareFootage: 100_000, vacancyPct: 5, ...inputs } });

// 1. Owned assets only.
const deals = [
  deal("a", { units: [unit("1", 60_000, "occupied", "Acme"), unit("2", 40_000, "vacant", "")] }),
  deal("b", { fundName: "Fund B", purchasePrice: 20_000_000, squareFootage: 200_000, units: [unit("1", 100_000, "occupied", "Beta Co"), unit("2", 100_000, "occupied", "beta co ")] }),
  deal("c", { squareFootage: 50_000 }), // no rent roll: 95% leased from vacancy
  deal("pipeline", { acquisitionDate: "2027-03-01" }), // not acquired yet
  deal("sold", { realizedSaleDate: "2026-06-30" }), // sold
  deal("screener", { fundName: "" }), // Underwriter / unassigned
  deal("nodate", { acquisitionDate: "" }),
];
const f = E.firmSummary(deals, {}, {}, { todayISO: TODAY });
ok(f.assets === 3, `owned assets only: ${f.assets} (pipeline, sold, unassigned and undated left out)`);
ok(f.funds === 2, `"across N funds": ${f.funds}`);
ok(f.aum === 40_000_000, `AUM falls back to purchase price with no marks: ${f.aum}`);
ok(f.sf === 350_000, `square feet: ${f.sf}`);
ok(f.tenants === 2, `tenants: each tenant once per asset (Beta Co twice in one asset = 1): ${f.tenants}`);
const leased = 60_000 + 200_000 + 50_000 * 0.95;
ok(Math.abs(f.leasedSF - leased) < 1e-6 && Math.abs(f.occupancy - (leased / 350_000) * 100) < 1e-9, `occupancy = leased SF ÷ SF: ${f.occupancy.toFixed(2)}%`);

// 2. Valuation marks drive AUM (latest mark on or before today).
const FX = require(R + "/tests/e2e/fixture.cjs");
const sample = FX.workspaceData().deals.filter((d) => d.inputs.fundName && d.inputs.acquisitionDate && d.inputs.acquisitionDate <= TODAY).slice(0, 3).map((d) => ({ ...d, irrFlows: underwrite(d.inputs).irrFlows }));
if (sample.length >= 2) {
  const s0 = E.firmSummary(sample, {}, {}, { todayISO: TODAY });
  ok(s0.assets >= 1 && s0.aum > 0, `sample deals: ${s0.assets} owned, AUM ${E.fmtAum(s0.aum)}`);
  const first = [...sample].sort((a, b) => a.inputs.acquisitionDate.localeCompare(b.inputs.acquisitionDate))[0];
  const marks = { [first.id]: { "2026-09-30": { value: 99_000_000 } } };
  const s1 = E.firmSummary(sample, marks, {}, { todayISO: TODAY });
  ok(s1.aum > s0.aum, `an appraisal mark raises AUM: ${E.fmtAum(s0.aum)} → ${E.fmtAum(s1.aum)}`);
  const s2 = E.firmSummary(sample, { [first.id]: { "2026-12-31": { value: 99_000_000 } } }, {}, { todayISO: TODAY });
  ok(s2.aum === s0.aum, "a mark dated after today is ignored");
} else {
  ok(false, "sample deals available");
}

// 3. Formatting and definitions.
ok(E.fmtAum(90_812_345) === "$90.8M" && E.fmtAum(1_234_000_000) === "$1.23B" && E.fmtAum(0) === "$0", "fmtAum: $90.8M, $1.23B, $0");
ok(["aum", "sf", "assets", "tenants", "occupancy"].every((k) => typeof E.FIGURE_DEFS[k] === "string" && E.FIGURE_DEFS[k].length > 10), "every figure has a hover definition");
ok(E.firmSummary([], {}, {}, { todayISO: TODAY }).assets === 0 && isNaN(E.firmSummary([], {}, {}, { todayISO: TODAY }).occupancy), "empty firm: 0 assets, occupancy n/a");

// 4. Fund type tag.
ok(T.FUND_TYPES.join() === "Fund,Separate Account,Joint Venture", "three fund types");
ok(T.fundType(undefined) === "Fund" && T.fundType("bogus") === "Fund" && T.fundType("Joint Venture") === "Joint Venture", "missing or unknown type reads as Fund");
const funds = { "Fund A": {}, "SMA 1": { type: "Separate Account" }, "JV X": { type: "Joint Venture" } };
const names = Object.keys(funds);
ok(T.filterFundsByType(names, funds, "All").length === 3 && T.filterFundsByType(names, funds, "Fund").join() === "Fund A" && T.filterFundsByType(names, funds, "Separate Account").join() === "SMA 1", "type filter");
ok(T.fundOptionLabel("Fund A", funds) === "Fund A" && T.fundOptionLabel("JV X", funds) === "JV X · Joint Venture", "picker labels");
ok(E.firmSummary([deal("t", { fundName: "SMA 1" })], {}, funds, { todayISO: TODAY }).assets === 1, "the type tag changes no calculation (a Separate Account asset still counts)");

// 5. Excel workbooks are titled Baywise, and still read back.
(async () => {
  const blob = X.writeXlsx([["Asset", "Value"], ["One", 5]], { sheetName: "Asset summary" });
  const text = Buffer.from(await blob.arrayBuffer()).toString("utf8");
  ok(text.includes("<dc:title>Baywise · Asset summary</dc:title>") && text.includes("<dc:creator>Baywise</dc:creator>") && text.includes("<Application>Baywise</Application>"), "workbook title and author are Baywise");
  const t2 = Buffer.from(await X.writeXlsx([["a"]], { sheetName: "S", title: "Baywise · Fund A valuations" }).arrayBuffer()).toString("utf8");
  ok(t2.includes("<dc:title>Baywise · Fund A valuations</dc:title>"), "custom workbook title");
  const grid = await X.readXlsxGrid(await blob.arrayBuffer());
  ok(JSON.stringify(grid).includes("Asset") && JSON.stringify(grid).includes("One"), `the workbook still reads back with no title row: ${JSON.stringify(grid).slice(0, 60)}`);
  if (fail) { console.log(`\n${fail} failed`); process.exitCode = 1; } else console.log("\nall passed");
})();
