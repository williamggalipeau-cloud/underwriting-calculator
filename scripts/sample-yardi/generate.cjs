// Fictional Yardi Voyager-style exports for Model Fund I (phase H tests):
// docs/sample-yardi/aged-receivables-2026-MM.csv (three month-ends),
// tenant-ledger.csv and income-statement-2026.csv (for phase I).
// Generic columns in the layout of the reports, not Yardi's templates.
// Every amount is a multiple of the unit's monthly rent on the sample rent
// rolls, so totals tie. Usage: node scripts/sample-yardi/generate.cjs
const path = require("path");
const fs = require("fs");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const sp = j(R + "/lib/samplePortfolio.js");
const c = j(R + "/lib/calculations.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
const OUT = path.join(R, "docs", "sample-yardi");
fs.mkdirSync(OUT, { recursive: true });

const deals = sp.buildSampleDeals(TEST_INPUTS);
const r2 = (n) => Math.round(n * 100) / 100;
const props = deals.map((d, i) => ({ code: `mf1-${String(i + 1).padStart(2, "0")}`, name: d.inputs.propertyName, inputs: d.inputs }));
const tcode = (pi, ui) => `t${String(pi + 1).padStart(4, "0")}${String(ui + 1).padStart(3, "0")}`;
const monthly = (u) => r2((u.currentRentPSF * u.squareFeet) / 12);
const unitOf = (name, unitName) => {
  const pi = props.findIndex((p) => p.name === name);
  const ui = props[pi].inputs.units.findIndex((u) => u.name === unitName);
  const u = props[pi].inputs.units[ui];
  if (!u || u.leaseStatus !== "occupied") throw new Error(`${name} ${unitName} not an occupied unit`);
  return { p: props[pi], pi, ui, u, code: tcode(pi, ui), rent: monthly(u) };
};
const MONTHS = ["2026-08-31", "2026-09-30", "2026-10-31"];

// Scenarios: [asset, unit, charge, { month: { bucket: multiple of monthly rent } }, note]
const SC = [
  ["Airport Flex Park", "003", "rent", { "2026-08-31": {}, "2026-09-30": { d30: 1 }, "2026-10-31": {} }, "Late in September, caught up in October"],
  ["Route 9 Small Bay", "005", "rent", { "2026-08-31": { d30: 1 }, "2026-09-30": { d30: 1, d60: 1 }, "2026-10-31": { d30: 1, d60: 1 } }, "Two months behind"],
  ["Harbor Light Industrial", "002", "rent", { "2026-08-31": { d30: 1, d60: 1 }, "2026-09-30": { d30: 1, d60: 1, d90: 1 }, "2026-10-31": { d30: 1, d60: 1, d90: 1, d180: 1 } }, "In default; notice served"],
  ["Ridgeway Trade Center", "004", "rent", { "2026-08-31": { d180: 3, over180: 1 }, "2026-09-30": { d180: 3, over180: 2 }, "2026-10-31": { d180: 3, over180: 3 } }, "In legal; reserved"],
  ["Canal Street Workshops", "001", "rent", { "2026-08-31": {}, "2026-09-30": { d30: 0.5 }, "2026-10-31": { d30: 0.5 } }, "Partial payments"],
  ["Mill Creek Business Park", "003", "rent", { "2026-08-31": { prepay: -1 }, "2026-09-30": { prepay: -1 }, "2026-10-31": { prepay: -2 } }, "Prepaid (credit balance)"],
  ["Southpoint Flex", "002", "cam", { "2026-08-31": { d30: 0.25 }, "2026-09-30": { d30: 0.25, d60: 0.25 }, "2026-10-31": { d60: 0.25, d90: 0.25 } }, "Disputes 2025 CAM reconciliation"],
  ["Granite Ave Industrial", "006", "rent", { "2026-08-31": {}, "2026-09-30": {}, "2026-10-31": { d30: 1 } }, "Late in October"],
  ["Lakeshore Service Center", "001", "rent", { "2026-08-31": { current: 1 }, "2026-09-30": { current: 1 }, "2026-10-31": { current: 1 } }, "Pays mid-month (current only)"],
];
const COLS = ["Property", "Property Name", "Tenant Code", "Tenant", "Unit", "Charge Code", "Current", "0-30", "31-60", "61-90", "91-180", "Over 180", "Prepayments", "Total"];
const esc = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (rows) => rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
const expected = { months: {} };
for (const m of MONTHS) {
  const rows = [];
  let total = 0;
  for (const [asset, unit, charge, by] of SC) {
    const t = unitOf(asset, unit);
    const b = by[m] ?? {};
    const v = (k) => r2((b[k] ?? 0) * (k === "prepay" ? t.rent : t.rent));
    const cells = ["current", "d30", "d60", "d90", "d180", "over180", "prepay"].map(v);
    const tot = r2(cells.reduce((a, x) => a + x, 0));
    if (cells.every((x) => x === 0)) continue;
    rows.push([t.p.code, t.p.name, t.code, t.u.tenantName, t.u.name, charge, ...cells, tot]);
    total += tot;
  }
  const [y, mo, d] = m.split("-");
  const title = [`Aged Receivables Report as of ${Number(mo)}/${Number(d)}/${y}`];
  const note = ["SAMPLE – FICTIONAL – FOR TESTING ONLY (generic layout, not a Yardi template)"];
  fs.writeFileSync(path.join(OUT, `aged-receivables-${m.slice(0, 7)}.csv`), csv([title, note, [], COLS, ...rows]));
  expected.months[m] = { rows: rows.length, total: r2(total) };
}

// Tenant ledger: charges, payments and credits for three tenants, Aug–Oct.
const led = [["Property", "Tenant Code", "Tenant", "Date", "Type", "Charge Code", "Description", "Amount"]];
for (const [asset, unit, pays] of [["Airport Flex Park", "003", [1, 0, 2]], ["Canal Street Workshops", "001", [1, 0.5, 1]], ["Route 9 Small Bay", "005", [0, 1, 1]]]) {
  const t = unitOf(asset, unit);
  ["2026-08", "2026-09", "2026-10"].forEach((ym, i) => {
    led.push([t.p.code, t.code, t.u.tenantName, `${ym}-01`, "Charge", "rent", "Base rent", t.rent]);
    if (pays[i]) led.push([t.p.code, t.code, t.u.tenantName, `${ym}-${i === 0 ? "05" : "20"}`, "Payment", "rent", "Payment received", r2(-pays[i] * t.rent)]);
  });
}
fs.writeFileSync(path.join(OUT, "tenant-ledger.csv"), csv([["Tenant Ledger, August 1 – October 31, 2026"], ["SAMPLE – FICTIONAL – FOR TESTING ONLY"], [], ...led]));

// Monthly income statement per asset from its acquisition month to Oct 2026:
// the closing budget (lib/businessPlan budgetFromModel, year 1 ÷ 12) with a
// few deliberate variances (phase I).
const B = j(R + "/lib/businessPlan.js");
const isRows = [["Property", "Property Name", "Month", "Base Rent", "Expense Recoveries", "Other Income", "Vacancy and Credit Loss", "Real Estate Taxes", "Insurance", "Utilities", "Repairs and Maintenance", "Management Fee", "Net Operating Income"]];
const VAR = {
  "Harbor Light Industrial": (mo) => ({ rent: mo >= 7 ? 0.92 : 1 }),          // rent shortfall from July
  "Route 9 Small Bay": () => ({ taxes: 1.15 }),                                // tax reassessment
  "Airport Flex Park": (mo) => ({ utilities: mo >= 6 && mo <= 9 ? 1.3 : 1 }),  // summer utilities
};
for (const p of props) {
  const bud = B.budgetFromModel(p.inputs);
  for (let mo = 1; mo <= 10; mo++) {
    const ymS = `2026-${String(mo).padStart(2, "0")}`;
    const L = B.budgetMonth(bud, ymS);
    if (!L) continue;
    const f = { rent: 1, taxes: 1, utilities: 1, ...(VAR[p.name]?.(mo) ?? {}) };
    const rent = r2(L.rent * 0.98 * f.rent), oth = r2(L.rent * 0.02 * f.rent), rec = r2(L.recoveries), vac = r2(L.vacancy);
    const tax = r2(L.taxes * f.taxes), ins = r2(L.insurance), utl = r2(L.utilities * f.utilities), rm = r2(L.repairs);
    const mgmt = r2(L.management + L.otherOpex);
    const noi = r2(rent + rec + oth + vac + tax + ins + utl + rm + mgmt);
    isRows.push([p.code, p.name, ymS, rent, rec, oth, vac, tax, ins, utl, rm, mgmt, noi]);
  }
}
fs.writeFileSync(path.join(OUT, "income-statement-2026.csv"), csv([["Income Statement by Month, January – October 2026"], ["SAMPLE – FICTIONAL – FOR TESTING ONLY"], [], ...isRows]));
fs.writeFileSync(path.join(OUT, "expected.json"), JSON.stringify({ properties: props.map((p) => ({ code: p.code, name: p.name })), scenarios: SC.map(([a, u, ch, , note]) => ({ asset: a, unit: u, charge: ch, note })), ...expected }, null, 1));
console.log("ok", expected);
