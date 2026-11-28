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
// --check: write to a temporary folder and compare with docs/sample-yardi (exit 1 if they differ).
const CHECK = process.argv.includes("--check");
const REAL = path.join(R, "docs", "sample-yardi");
const OUT = CHECK ? fs.mkdtempSync(path.join(require("os").tmpdir(), "yardi-")) : REAL;
fs.mkdirSync(OUT, { recursive: true });

// 1.1.13 (everything ties out): the fund the app loads (lib/sampleFund.js),
// so every property, unit, tenant, SF and rent here is the app's. The files
// as they were before (built from the test scenario's inputs) are kept for
// the tests in tests/fixtures/sample-yardi.
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const deals = buildSampleFund({ todayISO: "2026-11-27", docTerms: false }).deals;
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

// Construction manager (Yardi Construction Manager-style) as of Oct 31, 2026:
// TI and capital jobs by unit (budget, committed, invoiced, paid) and their
// invoices, for the later "TI spend by unit" enhancement of the business plan.
// TI budgets = the unit's TI/SF assumption × SF. Generic columns, not Yardi's.
// The Tenant column is the unit's tenant on the rent roll (blank for a vacant unit: no tenant is signed yet).
// [asset, unit or "", job name, category, kind (new|renewal|capex), new tenant (unused), budget override, committed %, invoiced %, paid share of invoiced, status, start, completion, scheduled (target) completion]
const JOBS = [
  ["Airport Flex Park", "001", "Unit 001 re-tenant TI", "Tenant Improvements", "new", "", null, 1.078, 1.078, 1, "Complete", "2026-08-03", "2026-09-12", "2026-09-12"], // 7.8% over
  ["Airport Flex Park", "002", "Unit 002 renewal TI", "Tenant Improvements", "renewal", "", null, 0.95, 0.95, 1, "Complete", "2026-09-08", "2026-09-30", "2026-09-30"],
  ["Airport Flex Park", "012", "Unit 012 lease-up TI", "Tenant Improvements", "new", "", null, 0.75, 0.40, 1, "In progress", "2026-10-01", "", "2026-12-15"],
  ["Airport Flex Park", "", "Roof replacement, Building B", "Capital Improvements", "capex", "", 180000, 0.98, 0.55, 0.9, "In progress", "2026-09-15", "", "2027-01-29"],
  ["Route 9 Small Bay", "017", "Unit 017 lease-up TI", "Tenant Improvements", "new", "", null, 1, 1, 1, "Complete", "2026-05-04", "2026-06-26", "2026-06-26"],
  ["Route 9 Small Bay", "018", "Unit 018 lease-up TI", "Tenant Improvements", "new", "", null, 0, 0, 0, "Not started", "", "", "2027-03-31"],
  ["Route 9 Small Bay", "001", "Unit 001 renewal TI", "Tenant Improvements", "renewal", "", null, 1, 1, 1, "Complete", "2026-09-01", "2026-09-20", "2026-09-20"],
  ["Harbor Light Industrial", "016", "Unit 016 lease-up TI", "Tenant Improvements", "new", "", null, 0.9, 0.6, 0.8, "In progress", "2026-09-14", "", "2026-11-20"],
  ["Harbor Light Industrial", "", "Parking lot resurfacing", "Capital Improvements", "capex", "", 95000, 1, 1, 1, "Complete", "2026-07-06", "2026-08-21", "2026-08-21"],
  ["Ridgeway Trade Center", "014", "Unit 014 lease-up TI", "Tenant Improvements", "new", "", null, 1.344, 1.344, 0.85, "Complete", "2026-07-20", "2026-10-09", "2026-10-09"], // 34% over
  ["Mill Creek Business Park", "021", "Unit 021 lease-up TI", "Tenant Improvements", "new", "", null, 0.6, 0.25, 1, "In progress", "2026-10-05", "", "2027-01-08"],
];
// 1.1.30: the capital projects of each asset's underwriting (lib/sampleCapital.js
// sampleCapitalJobs) as jobs named after the projects, so the Asset Business
// Plan's Capital plan reads what was spent from these invoices. The two
// capital jobs above are kept as they were; the rest follow, in asset order.
const { sampleCapitalJobs } = j(R + "/lib/sampleCapital.js");
for (const d of deals) for (const cj of sampleCapitalJobs(d.inputs, d.id)) {
  if (JOBS.some((x) => x[0] === d.inputs.propertyName && x[2] === cj.name)) continue;
  JOBS.push([d.inputs.propertyName, "", cj.name, "Capital Improvements", "capex", "", cj.budget, cj.committed / cj.budget, cj.invoiced / cj.budget, cj.status === "Complete" ? 1 : 0.9, cj.status, cj.start, cj.completion, cj.scheduled]);
}
const VENDORS = { "Tenant Improvements": ["Example Builders Inc.", "Sample Electric Co.", "Fictional HVAC Services"], "Capital Improvements": ["Test Roofing & Paving LLC", "Example Builders Inc."] };
const jobRows = [["Job Code", "Property", "Property Name", "Unit", "Job Name", "Category", "Tenant", "Original Budget", "Revisions", "Revised Budget", "Committed", "Invoiced to Date", "Paid to Date", "Retainage Held", "Remaining Budget", "Status", "Start Date", "Completion Date", "Scheduled Completion"]];
const invRows = [["Job Code", "Property", "Unit", "Vendor", "Invoice Number", "Invoice Date", "Cost Code", "Description", "Amount", "Status"]];
const construction = { asOf: "2026-10-31", jobs: [], totals: { budget: 0, committed: 0, invoiced: 0, paid: 0 } };
let invNo = 1000;
JOBS.forEach(([asset, unitName, name, cat, kind, newTenant, bOverride, cPct, iPct, paidShare, status, start, done, target], k) => {
  const p = props.find((x) => x.name === asset);
  const u = unitName ? p.inputs.units.find((x) => x.name === unitName) : null;
  const budget = bOverride ?? r2((kind === "renewal" ? u.tiRenewalPSF : u.tiNewPSF) * u.squareFeet);
  const revisions = cPct > 1 ? r2(budget * (cPct - 1)) : 0; // overruns approved as budget revisions
  const committed = r2(budget * cPct), invoiced = r2(budget * iPct);
  // Split the invoiced amount into up to three invoices (the last takes the rounding).
  const n = invoiced ? (invoiced > 20000 ? 3 : 2) : 0;
  const parts = Array.from({ length: n }, (_, i) => (i < n - 1 ? r2(Math.round((invoiced / n) / 10) * 10) : 0));
  if (n) parts[n - 1] = r2(invoiced - parts.slice(0, -1).reduce((s, x) => s + x, 0));
  const paidTarget = r2(invoiced * paidShare);
  let paid = 0;
  const code = `${p.code}-J${String(k + 1).padStart(2, "0")}`;
  parts.forEach((amt, i) => {
    const isPaid = r2(paid + amt) <= paidTarget + 0.01;
    if (isPaid) paid = r2(paid + amt);
    const d = new Date(Date.parse(start) + (i + 1) * 14 * 86400000).toISOString().slice(0, 10);
    const vendor = VENDORS[cat][i % VENDORS[cat].length];
    invRows.push([code, p.code, unitName, vendor, `INV-${++invNo}`, d > "2026-10-31" ? "2026-10-31" : d, cat === "Capital Improvements" ? "CAP-100" : "TI-200", `${name}, draw ${i + 1}`, amt, isPaid ? "Paid" : "Approved"]);
  });
  const retainage = status === "Complete" ? 0 : r2(paid * 0.1);
  const revised = r2(budget + revisions);
  jobRows.push([code, p.code, asset, unitName, name, cat, newTenant || u?.tenantName || "", budget, revisions, revised, committed, invoiced, paid, retainage, r2(revised - invoiced), status, start, done, target]);
  construction.jobs.push({ code, asset, unit: unitName, category: cat, budget, revised, committed, invoiced, paid, status, overrunPct: r2(((invoiced - budget) / budget) * 100) });
  for (const [key, v] of [["budget", budget], ["committed", committed], ["invoiced", invoiced], ["paid", paid]]) construction.totals[key] = r2(construction.totals[key] + v);
});
const cmNote = ["SAMPLE – FICTIONAL – FOR TESTING ONLY (generic layout in the style of a construction manager export, not a Yardi template)"];
fs.writeFileSync(path.join(OUT, "construction-jobs-2026-10.csv"), csv([["Construction Job Summary as of 10/31/2026"], cmNote, [], ...jobRows]));
fs.writeFileSync(path.join(OUT, "construction-invoices-2026-10.csv"), csv([["Construction Invoice Detail through 10/31/2026"], cmNote, [], ...invRows]));
expected.construction = construction;
fs.writeFileSync(path.join(OUT, "expected.json"), JSON.stringify({ properties: props.map((p) => ({ code: p.code, name: p.name })), scenarios: SC.map(([a, u, ch, , note]) => ({ asset: a, unit: u, charge: ch, note })), ...expected }, null, 1));
if (CHECK) {
  const stale = fs.readdirSync(OUT).filter((f) => !fs.existsSync(path.join(REAL, f)) || fs.readFileSync(path.join(OUT, f), "utf8") !== fs.readFileSync(path.join(REAL, f), "utf8"));
  if (stale.length) { console.error("docs/sample-yardi is stale (" + stale.join(", ") + "): run node scripts/sample-yardi/generate.cjs and update lib/sampleConstruction.js"); process.exit(1); }
  console.log("docs/sample-yardi is current");
} else console.log("ok", expected);
