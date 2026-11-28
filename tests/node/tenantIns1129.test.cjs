// 1.1.29: tenant insurance on the Insurance tab (lib/tenantInsurance.js).
// One row per tenant in place today: what the lease requires, the proof on
// file, its expiry and any shortfall (the Risk Report's own check), and the
// Dashboard's actions and events. A tenant only on the rent roll gets a row
// and an action to upload its lease.
const fs = require("fs"), path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const TI = j(R + "/lib/tenantInsurance.js"), DA = j(R + "/lib/dealDocApply.js"), H = j(R + "/lib/home.js");
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const AS_OF = "2026-11-27";
const lease02 = JSON.parse(fs.readFileSync(R + "/tests/fixtures/sample-leases/abstracts/02-airport-flex-park-desert-aero.json"));
const certAbs = JSON.parse(fs.readFileSync(R + "/tests/fixtures/deal-docs/abstracts/airport-flex-insurance-desert-aero.json"));
const unit = (id, tenant, sf = 5000, status = "occupied") => ({ id, name: id.toUpperCase(), tenantName: tenant, squareFeet: sf, leaseStatus: status, currentRentPSF: 12, leaseEnd: "2029-12-31" });
const inputs = { propertyName: "Example Park", acquisitionDate: "2024-01-01", units: [unit("u1", "Desert Aero Services"), unit("u2", "Desert Aero Services", 3000), unit("u3", "Rent Roll Only LLC"), unit("u4", "Lease Not Read Inc"), unit("u5", "", 4000, "vacant"), unit("u6", "No Proof Co")] };
const leases = [
  { id: "L1", deal_id: "d1", tenant: "Desert Aero Services", unit_ids: ["u1"], abstract: lease02 },
  { id: "L4", deal_id: "d1", tenant: "Lease Not Read Inc.", unit_ids: [], abstract: null },
  { id: "L6", deal_id: "d1", tenant: "Someone else", unit_ids: ["u6"], abstract: lease02 },
  { id: "LX", deal_id: "other", tenant: "Rent Roll Only LLC", unit_ids: [], abstract: lease02 },
];
const cert = (over = {}) => ({ id: "C1", deal_id: "d1", doc_type: "insurance_cert", lease_id: "L1", title: "Desert Aero COI", created_at: "2026-03-02T10:00:00Z", abstract: certAbs, ...over });
const rows = (certs, inp = inputs) => TI.tenantInsuranceRows(inp, { dealId: "d1", leases, certs, asOf: AS_OF });
const by = (rs, t) => rs.find((r) => r.tenant === t);

let rs = rows([cert()]);
check(rs.length === 4 && rs.map((r) => r.tenant).join("|") === "Desert Aero Services|Lease Not Read Inc|No Proof Co|Rent Roll Only LLC", "one row per tenant in place today (two units of one tenant are one row; vacant units none)");
const da = by(rs, "Desert Aero Services");
check(da.units.length === 2 && da.sf === 8000 && da.leaseId === "L1" && /General liability \$1,000,000 \/ \$2,000,000; umbrella \$2,000,000/.test(da.requirementsLabel) && /workers' compensation/.test(da.requirementsLabel), `the lease's requirements: ${da.requirementsLabel}`);
const direct = DA.insuranceGaps(certAbs, { leaseAbs: lease02, asOf: AS_OF }).filter((g) => !/expire[sd]/.test(g.text));
check(da.shortfalls.length === direct.length && da.shortfalls.every((g, i) => g.text === direct[i].text) && da.received === "2026-03-02", "the shortfall is the Risk Report's own check; proof received on the certificate's upload date unless entered");
check(by(rs, "Rent Roll Only LLC").status === "noLease" && by(rs, "Rent Roll Only LLC").requirementsLabel === "No lease requirements on file", "a tenant only on the rent roll: no lease requirements on file (another asset's lease does not count)");
check(by(rs, "Lease Not Read Inc").status === "noProof" && /not read in yet/.test(by(rs, "Lease Not Read Inc").requirementsLabel), "a lease matched by the tenant's name, not read in yet, and no proof");
check(by(rs, "No Proof Co").leaseId === "L6" && by(rs, "No Proof Co").status === "noProof", "a lease matched by its unit; no proof on file");

// Status from the certificate
const pol = (expiry, over = {}) => ({ coverage: "cgl", policy_no: "P1", per_occurrence: 1000000, aggregate: 2000000, expiry, additional_insured: true, waiver_of_subrogation: true, ...over });
const full = (expiry) => ({ policies: [pol(expiry), { coverage: "umbrella", limit: 2000000, expiry, waiver_of_subrogation: true }, { coverage: "auto", limit: 1000000, expiry }, { coverage: "workers_comp", expiry }] });
const st = (abs) => by(rows([cert({ abstract: abs })]), "Desert Aero Services");
check(st(full("2027-06-30")).status === "ok" && st(full("2027-06-30")).expiry === "2027-06-30", "meets the lease and current: in place");
check(st(full("2026-12-31")).status === "expiring" && st(full("2026-10-31")).status === "expired", "expiring within 60 days; expired");
check(st({ policies: [pol("2027-06-30", { per_occurrence: 500000 })] }).status === "shortfall", "below the lease: a shortfall");
check(st(null).status === "noProof" || st(null).certId === "C1", "a certificate not read in yet is on file");
check(rows([cert({ lease_id: null })]).find((r) => r.tenant === "Desert Aero Services").status === "noProof", "an owner's certificate (no lease) is not a tenant's proof");

// Summary and tracking
const sum = TI.tenantInsuranceSummary(rs);
check(sum.tenants === 4 && sum.noLease === 1 && sum.noProof === 2 && sum.noLease + sum.noProof + sum.expired + sum.shortfall + sum.expiring + sum.ok === 4, `summary counts add to the tenants: ${TI.summaryLabel(sum)}`);
const tracked = TI.setTenantInsurance(inputs, TI.tenantKey("No Proof Co"), { requested: "2026-11-01", notes: "Second request" });
check(by(rows([cert()], tracked), "No Proof Co").requested === "2026-11-01" && by(rows([cert()], tracked), "No Proof Co").notes === "Second request" && tracked.units === inputs.units, "proof requested and notes are recorded on the asset; nothing else changes");
check(TI.tenantInsuranceRows({ ...inputs, realizedSaleDate: "2026-06-30" }, { dealId: "d1", leases, certs: [cert()], asOf: AS_OF }).length === 0, "a sold asset has no tenant rows (the tenants are the buyer's)");

// Dashboard: grouped actions, dated expiries
const items = TI.tenantInsuranceItems(inputs, { dealId: "d1", asset: "Example Park", leases, certs: [cert({ abstract: full("2026-12-31") })], asOf: AS_OF });
check(items.filter((x) => x.date == null).length === 2 && /Upload 1 lease: 1 tenant has no lease on file/.test(items[0].text) && items[0].tab === "leases" && /Get proof of insurance: Lease Not Read Inc, No Proof Co/.test(items[1].text), "actions by asset: upload the lease; get proof");
check(items.filter((x) => x.date).length === 1 && items.find((x) => x.date).date === "2026-12-31" && /Tenant insurance expires: Desert Aero Services/.test(items.find((x) => x.date).text), "a certificate's expiry is a dated event");
const deals = [{ id: "d1", inputs: { ...inputs, fundName: "F" } }];
const ac = H.actionsAndCalendar(deals, { F: { name: "F", finalClose: "2024-01-01", termYears: 7 } }, {}, { todayISO: AS_OF, leases, dealDocs: [cert({ abstract: full("2026-12-31") })] });
check(ac.actions.filter((x) => x.kind === "tenantins").length === 2 && ac.calendar.some((x) => x.kind === "tenantins" && x.date === "2026-12-31"), "Actions Needed has the two actions; Upcoming Events has the expiry");
const acOut = H.actionsAndCalendar(deals, { F: { name: "F", finalClose: "2024-01-01", termYears: 7 } }, {}, { todayISO: AS_OF });
check(!acOut.actions.some((x) => x.kind === "tenantins"), "not signed in (leases unknown): no tenant insurance actions");
const sheet = TI.tenantInsuranceSheet(deals, { leases, certs: [cert()], asOf: AS_OF });
check(sheet.length === 5 && sheet[0][0] === "Asset" && sheet[1][1] === "Desert Aero Services", "Excel: one row per tenant");

console.log(`${pass} passed${fail ? `, ${fail} FAILED` : ""}`);
process.exitCode = fail ? 1 : 0;
