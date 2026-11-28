// 1.1.25: the lease in effect today on the screens that list leases: the risk
// report, Tenant Credit, the SNDA list, the fund limits, the asset report,
// Vacant Units, the asset KPIs and aged rent. Each reads a unit with leases
// signed since purchase (lib/leaseHistory.js) on its lease in effect on the
// date; an asset with none is read exactly as before. The model is untouched.
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { underwrite } = j(R + "/lib/calculations.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const LH = j(R + "/lib/leaseHistory.js");
const C = j(R + "/lib/creditReview.js");
const RR = j(R + "/lib/riskReport.js");
const S = j(R + "/lib/snda.js");
const FL = j(R + "/lib/fundLimits.js");
const AR = j(R + "/lib/assetReport.js");
const H = j(R + "/lib/home.js");
const BP = j(R + "/lib/businessPlan.js");
const DQ = j(R + "/lib/delinquency.js");
const L = j(R + "/lib/leasing.js");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const T = "2026-11-27";
const f = buildSampleFund({ todayISO: T });
const terms = { ...DEFAULT_FUND_TERMS, name: "Model Fund I" };
const d0 = f.deals[0], A = d0.inputs; // Airport Flex Park, bought 2026-01-30
const unit = (n) => A.units.find((u) => u.name === n);
const NEW1 = "Example Robotics LLC", NEW12 = "Sample Bike Repair", NEW3 = "Fictional Pet Supply";

// ── Nothing changes for a fund with no leases signed since purchase ──
const before = {
  credit: JSON.stringify(C.creditRows(f.deals, { asOf: T })), risk: JSON.stringify(RR.riskReport(f.deals, terms, { asOf: T }).tenants),
  snda: JSON.stringify(f.deals.map((d) => [S.sndaRows(d.inputs), S.sndaCoverage(d.inputs)])), vacant: JSON.stringify(H.vacantUnits(f.deals, { todayISO: T })),
};
check(JSON.stringify(f.deals.map((d) => [S.sndaRows(d.inputs, { todayISO: T }), S.sndaCoverage(d.inputs, { todayISO: T })])) === before.snda, "Model Fund I (no later leases): the SNDA list and coverage are the same with and without a date");
check(JSON.stringify(FL.limitInputs(f.deals, { todayISO: T })) === JSON.stringify(FL.limitInputs(f.deals)), "and the fund limit inputs are the same with and without a date");
check(f.deals.every((d) => LH.inputsToday(d.inputs, T) === d.inputs), "and every asset is read as it is (the same object)");

// ── One asset with leases signed since purchase ──
const add = (inp, name, lease) => { const r = LH.addLaterLease(inp, unit(name).id, lease, { by: "test", at: `${T}T00:00:00Z` }); if (r.error) throw new Error(r.error); return r.inputs; };
let B = A;
B = add(B, "001", { id: "t1", kind: "new", tenantName: NEW1, start: "2026-09-01", end: "2031-08-31", rentPSF: 22, escalationPct: 0 }); // purchase lease ended 7/30/2026; SNDA signed by the old tenant
B = add(B, "002", { id: "t2", kind: "renewal", tenantName: unit("002").tenantName, start: "2026-10-01", end: "2029-09-30", rentPSF: 20, escalationPct: 0 }); // SNDA signed
B = add(B, "012", { id: "t3", kind: "new", tenantName: NEW12, start: "2026-06-01", end: "2031-05-31", rentPSF: 21, escalationPct: 0 }); // vacant at purchase
B = add(B, "003", { id: "t4", kind: "new", tenantName: NEW3, start: "2027-03-01", end: "2032-02-29", rentPSF: 23, escalationPct: 0 }); // purchase lease runs to 12/30/2026, then a two-month gap
const deals = f.deals.map((d) => (d.id === d0.id ? { ...d, inputs: B } : d));
const old1 = unit("001").tenantName, old3 = unit("003").tenantName, sf1 = unit("001").squareFeet, sf12 = unit("012").squareFeet;
check(JSON.stringify(underwrite(B)) === JSON.stringify(underwrite(LH.addLaterLease(A, unit("001").id, { id: "t1", kind: "new", tenantName: NEW1, start: "2026-09-01", end: "2031-08-31", rentPSF: 22 }).inputs)) === false, "the test asset's four leases do change its model (so the screens below are being tested on a real difference)");

// Tenant Credit
const cr = C.creditRows(deals, { asOf: T }).filter((r) => r.dealId === d0.id);
const c1 = cr.find((r) => r.unit === "001"), c2 = cr.find((r) => r.unit === "002"), c12 = cr.find((r) => r.unit === "012"), c3 = cr.find((r) => r.unit === "003");
check(c1?.tenant === NEW1 && c1.leaseEnd === "2031-08-31" && near(c1.rent, 22 * sf1) && !cr.some((r) => r.tenant === old1), `Tenant Credit lists the new tenant in unit 001 with its lease end and rent, not the former tenant (${c1?.tenant}, ${c1?.leaseEnd}, ${c1?.rent})`);
check(c2?.leaseEnd === "2029-09-30" && near(c2.rent, 20 * unit("002").squareFeet), "the renewed tenant shows its renewal's end and rent");
check(c12?.tenant === NEW12 && near(c12.rent, 21 * sf12), "the unit vacant at purchase shows its new tenant");
check(c3?.tenant === old3 && c3.leaseEnd === unit("003").leaseEnd, "a lease that starts in the future changes nothing today");
const crLater = C.creditRows(deals, { asOf: "2027-01-15" }).filter((r) => r.dealId === d0.id);
check(!crLater.some((r) => r.unit === "003"), "between the purchase lease and the next one (1/15/2027) the unit is vacant: no credit row");
check(C.creditRows(deals, { asOf: "2027-03-15" }).find((r) => r.dealId === d0.id && r.unit === "003")?.tenant === NEW3, "and once it starts, its tenant is listed");

// Risk report
const r0 = RR.riskReport(f.deals, terms, { asOf: T }), r1 = RR.riskReport(deals, terms, { asOf: T });
const names = r1.tenants.map((t) => t.tenant);
check(names.includes(NEW1) && names.includes(NEW12) && !names.includes(old1), "the risk report's tenant list has the tenants in place today");
check(r1.tenants.find((t) => t.tenant === NEW1)?.leaseEnd === "2031-08-31", "with today's lease end");
const row0 = r0.leasing.assets.find((a) => a.id === d0.id), row1 = r1.leasing.assets.find((a) => a.id === d0.id);
check(JSON.stringify(row0) !== JSON.stringify(row1) && JSON.stringify(r0.leasing.assets.filter((a) => a.id !== d0.id)) === JSON.stringify(r1.leasing.assets.filter((a) => a.id !== d0.id)), "the lease rollover table changes for that asset only");
check(JSON.stringify(r1.tenants) !== before.risk, "and the tenant concentration is recalculated on today's rents");

// Fund limits
const li = FL.limitInputs(deals, { todayISO: T }).assets.find((a) => a.id === d0.id), liOld = FL.limitInputs(deals).assets.find((a) => a.id === d0.id);
check(near(li.tenants[NEW1], 22 * sf1) && li.tenants[old1] === undefined && liOld.tenants[old1] > 0, "the fund limits' largest-tenant figures use today's tenants when given a date (and the rent roll at purchase without one)");
check(JSON.stringify({ ...li, tenants: 0, rent: 0, units: 0 }) === JSON.stringify({ ...liOld, tenants: 0, rent: 0, units: 0 }) && li.rent > liOld.rent, "only the tenants and their total rent move (equity, loan and value are from the asset as it is)");

// SNDAs
const sr = S.sndaRows(B, { todayISO: T });
const s1 = sr.find((r) => r.unit === "001"), s2 = sr.find((r) => r.unit === "002"), s12 = sr.find((r) => r.unit === "012");
check(unit("001").snda?.status === "signed" && s1.tenant === NEW1 && s1.status === "required" && !s1.signed && s1.formerTenant === true, `the former tenant's signed SNDA no longer counts for the new tenant: required again (${s1.status})`);
check(s2.signed && s2.formerTenant === false, "a renewal keeps its tenant's signed SNDA");
check(s12?.tenant === NEW12 && s12.status === "required", "the new tenant in the unit vacant at purchase is on the list, required by the loan's rule (all leases)");
const cov0 = S.sndaCoverage(A, { todayISO: T }), cov1 = S.sndaCoverage(B, { todayISO: T });
check(cov1.leases === cov0.leases + 1 && cov1.signed === cov0.signed - 1 && cov1.outstanding === cov0.outstanding + 2 && cov1.outstandingTenants.includes(NEW1), `coverage follows: one more lease, one fewer signed, two more outstanding (${cov0.leases}/${cov0.signed}/${cov0.outstanding} → ${cov1.leases}/${cov1.signed}/${cov1.outstanding})`);
const abs = { doc_type: "snda", tenant: NEW1, unit: "001", lender: A.lenderName, date: "2026-09-15" };
const ap = S.applySndaDoc(B, abs, "doc-1", { todayISO: T });
const s1b = S.sndaRows(ap.inputs, { todayISO: T }).find((r) => r.unit === "001");
check(ap.applied && ap.inputs.units.find((u) => u.name === "001").snda.tenant === NEW1 && s1b.signed && s1b.signedOn === "2026-09-15" && !s1b.formerTenant, "a signed SNDA from the new tenant is matched to today's tenant, recorded for it, and counts");
check(S.applySndaDoc(B, { ...abs, tenant: old1 }, null, { todayISO: T }).applied === false, "an SNDA naming the former tenant is not applied to the new tenant's lease");
check(S.sndaXlsx([{ id: d0.id, inputs: B }], { todayISO: T }).some((r) => r[2] === NEW1 && r[4] === "2031-08-31"), "the Excel export lists today's tenant and lease end");

// Vacant Units
const v0 = H.vacantUnits(f.deals, { todayISO: T }).filter((r) => r.dealId === d0.id), v1 = H.vacantUnits(deals, { todayISO: T }).filter((r) => r.dealId === d0.id);
check(v0.length === 1 && v1.length === 0, `Vacant Units: the unit vacant at purchase is no longer listed once its lease is recorded (${v0.length} → ${v1.length})`);
const vGap = H.vacantUnits(deals, { todayISO: "2027-01-15" }).filter((r) => r.dealId === d0.id);
check(vGap.length === 1 && JSON.stringify(vGap[0]).includes("2026-12-31"), "in the gap before the next lease the unit is listed, vacant since the day after its lease ended");

// Asset KPIs and the asset report
const k0 = BP.assetKpis(A, T), k1 = BP.assetKpis(B, T);
check(k1.occupancy > k0.occupancy && near(k1.occupancy, 100) && k1.walt > k0.walt && k1.rentPSF !== k0.rentPSF, `occupancy, average rent and WALT are on today's leases (${k0.occupancy.toFixed(1)}% → ${k1.occupancy.toFixed(1)}%, WALT ${k0.walt.toFixed(2)} → ${k1.walt.toFixed(2)})`);
check(JSON.stringify(BP.assetKpis(B, A.acquisitionDate)) === JSON.stringify(BP.assetKpis(A, A.acquisitionDate)), "on the purchase date the KPIs are the rent roll at purchase");
const snap = (ds) => ds.map((d) => snapshotDeal(d.inputs, d.id));
const ar0 = AR.buildAssetReport(snap(f.deals), terms, {}, { assetId: d0.id, qEnd: "2026-09-30", todayISO: T }), ar1 = AR.buildAssetReport(snap(deals), terms, {}, { assetId: d0.id, qEnd: "2026-09-30", todayISO: T });
check(ar0.operations.vacantUnits === 1 && ar1.operations.vacantUnits === 0 && ar1.operations.occupancy > ar0.operations.occupancy, `the asset report at 9/30/2026 counts the unit leased since purchase as occupied (${ar0.operations.vacantUnits} → ${ar1.operations.vacantUnits} vacant)`);
check(ar0.operations.expiring.some((x) => x.unit === "003") && ar1.operations.expiring.some((x) => x.unit === "003" && x.tenant === old3) && !ar1.operations.expiring.some((x) => x.unit === "001"), "its leases expiring in 12 months are today's: unit 003's purchase lease still, unit 001's new lease not");

// Aged rent
const month = { asOf: "2026-10-31", rows: [{ property: "p1", tenantCode: "t-new", tenant: NEW1, unit: "001", current: 0, d0_30: 1000, d31_60: 0, d61_90: 0, d90: 0, prepay: 0, total: 1000 }] };
const map = { properties: { p1: d0.id }, tenants: { "t-new": unit("001").id } };
const ag = DQ.aggregate(month, map, [{ id: d0.id, inputs: B }]);
const at = (ag.tenants ?? ag.list ?? []).find?.((t) => t.tenantCode === "t-new");
check(at && near(at.monthlyRent, (22 * sf1) / 12), `aged rent compares a balance with the monthly rent of the lease in effect on the report date (${at?.monthlyRent})`);

// Active Leasing: downtime against the plan is counted from today's lease end
const p = { unitId: unit("002").id, expectedStart: "2029-12-01", proposedRentPSF: 21 };
const withPlan = (inp) => ({ ...inp, businessPlan: { revisions: [{ plan: { leasing: [{ unitId: unit("002").id, targetRentPSF: 20, downtimeMonths: 3 }] } }] } });
const vA = L.vsPlan(withPlan(A), p, T), vB = L.vsPlan(withPlan(B), p, T);
check(vA && vB && vB.downtime < vA.downtime && near(vB.downtime, 2, 0.2), `a prospect's downtime is counted from the end of the lease in effect today (${vA?.downtime} → ${vB?.downtime} months)`);

console.log(`leasetoday1125: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
