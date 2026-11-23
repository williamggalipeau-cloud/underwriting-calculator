// Phase R: Leasing tab (lib/leasing.js) on fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const L = j(R + "/lib/leasing.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const TODAY = "2026-11-23";

const inputs = {
  propertyName: "Fictional Dock", rentPerSF: 11, units: [
    { id: "u1", name: "Suite A", squareFeet: 10000, leaseStatus: "vacant" },
    { id: "u2", name: "Suite B", squareFeet: 20000, leaseStatus: "occupied", currentRentPSF: 10, leaseEnd: "2027-03-31", tenantName: "Example Co" },
  ],
  businessPlan: { revisions: [{ plan: { leasing: [{ unitId: "u1", action: "Lease up", targetRentPSF: 12, downtimeMonths: 6, tiPSF: 8 }, { unitId: "u2", action: "Renew", targetRentPSF: 10.3, downtimeMonths: 0, tiPSF: 2 }] } }] },
};

// ── Net effective rent ──
ok(close(L.netEffective({ proposedRentPSF: 12, termMonths: 60, freeMonths: 0, tiPSF: 0 }), 12), "no concessions: net effective = rent");
ok(close(L.netEffective({ proposedRentPSF: 12, termMonths: 60, freeMonths: 3, tiPSF: 10 }), (12 * 5 - 3 + 10 * 0 - 10) / 5), "free rent and TI spread over the term");
const esc = L.netEffective({ askingRentPSF: 10, termMonths: 24, escalationPct: 10 });
ok(close(esc, (10 + 11) / 2), "escalations raise the average (asking used when no proposal)");
ok(L.netEffective({ proposedRentPSF: 12 }) === null, "no term, no figure");

// ── vs. plan ──
const p1 = L.makeProspect({ unitId: "u1", tenant: "Fictional Logistics", proposedRentPSF: 11.4, termMonths: 60, expectedStart: "2027-05-23" });
ok(p1.stage === "inquiry" && p1.kind === "new", "a new prospect starts at Inquiry");
const v1 = L.vsPlan(inputs, p1, TODAY);
ok(close(v1.rentVsPct, -5) && v1.targetRentPSF === 12 && v1.downtime === 6 && v1.downtimeVs === 0, "vacant unit: rent 5% below plan; downtime 6 months from today, on plan");
const p2 = L.makeProspect({ unitId: "u2", kind: "renewal", proposedRentPSF: 10.5, expectedStart: "2027-04-01" });
const v2 = L.vsPlan(inputs, p2, TODAY);
ok(v2.rentVsPct > 0 && v2.downtime === 0 && v2.action === "Renew", "renewal: from the lease end, above the plan rent");
ok(L.vsPlan({ ...inputs, businessPlan: null }, p1, TODAY) === null, "no plan, no comparison");

// ── Pipeline across assets ──
const deals = [{ id: "a", inputs: { ...inputs, leasing: { prospects: [p1, { ...p2, stage: "signed", sf: 20000 }] } } }, { id: "b", inputs: { propertyName: "Other", leasing: { prospects: [L.makeProspect({ stage: "tour", sf: 5000 })] } } }];
const all = L.allProspects(deals);
ok(all.length === 3 && all[2].asset === "Other", "fund view: every asset's prospects");
const t = L.pipelineTotals(all);
ok(t.inquiry.count === 1 && t.signed.count === 1 && t.signed.sf === 20000 && t.tour.sf === 5000, "totals by stage");

// ── Rent comps import ──
const grid = [
  ["Fictional CoStar export"],
  ["Building Address", "City", "Submarket", "Tenant Name", "SF Leased", "Starting Rent", "Sign Date", "Lease Term", "Free Rent", "TI Allowance", "Lease Type"],
  ["100 Example Way", "Reno", "Airport", "Fictional Parts", "12,000", "$11.50", "2026-03-15", 60, 2, 5, "NNN"],
  ["200 Sample Rd", "Reno", "Airport", "Example Freight", 30000, 10.25, "09/01/2025", 84, 4, 8, "NNN"],
  ["", "", "", "", "", "", "", "", "", "", ""],
  ["300 Model St", "Sparks", "I-80", "No Rent Co", 8000, "", "2026-01-01", 36, 0, 0, "MG"],
];
const det = L.detectRentCompMapping(grid);
ok(det.ok && det.headerRow === 1 && det.mapping.rentPSF === 5 && det.mapping.address === 0 && det.mapping.tiPSF === 9, "columns matched like Sales Comps (header row found)");
const imp = L.importRentComps([], grid, det, { source: "costar.xlsx" });
ok(imp.added === 2 && imp.skipped === 1 && imp.comps[0].sf === 12000 && imp.comps[0].rentPSF === 11.5 && imp.comps[1].signDate === "2025-09-01" && imp.comps[0].source === "costar.xlsx", "rows imported (numbers and dates cleaned); a row without rent skipped");
const again = L.importRentComps(imp.comps, [grid[1], ["100 Example Way", "Reno", "Airport", "Fictional Parts", 12000, 11.75, "2026-03-15", 60, 2, 5, "NNN"]], { ...det, headerRow: 0 });
ok(again.updated === 1 && again.added === 0 && again.comps[0].rentPSF === 11.75 && again.comps[0].id === imp.comps[0].id, "the same comp updates in place (not duplicated)");
const det2 = L.detectRentCompMapping([["Addr", "Rate", "Who"], ["1 X St", 9, "T"]], { address: "Addr", rentPSF: "Rate" });
ok(det2.ok && det2.mapping.address === 0 && det2.mapping.rentPSF === 1, "remembered column names are used for odd headers");

// ── Filters, stats, vs. comps ──
const comps = imp.comps;
ok(L.filterRentComps(comps, { since: "2026-01-01" }).length === 1 && L.filterRentComps(comps, { minSF: 20000 }).length === 1 && L.filterRentComps(comps, { submarket: "air" }).length === 2, "filters: date, size, submarket");
const st = L.rentCompStats(comps);
ok(st.count === 2 && close(st.avg, (11.5 * 12000 + 10.25 * 30000) / 42000) && close(st.median, (10.25 + 11.5) / 2) && st.low === 10.25 && st.high === 11.5, "stats: SF-weighted average, median, range");
ok(L.rentCompStats([{ ...comps[0], include: false }, comps[1]]).count === 1, "excluded comps are left out");
const vs = L.rentVsComps(inputs, st);
ok(vs.inPlace === 10 && close(vs.inPlaceVsPct, (10 - st.avg) / st.avg * 100) && vs.market === 11, "in-place and model market rent against the comps");

// ── Excel ──
const x = L.leasingXlsx(L.allProspects([deals[0]]), comps.map((c) => ({ ...c, asset: "Fictional Dock" })), { todayISO: TODAY });
ok(x[1].includes("Net effective ($/SF)") && x[2][0] === "Fictional Dock" && x.some((r) => r[0] === "Rent comps") && x.filter((r) => r[1] === "100 Example Way").length === 1, "Excel: pipeline and rent comps");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
