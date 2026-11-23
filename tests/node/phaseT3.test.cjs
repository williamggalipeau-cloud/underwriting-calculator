// Phase T part 3: construction jobs / invoices and TI spend by unit (lib/construction.js) on the fictional sample exports.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const C = j(R + "/lib/construction.js");
const S = j(R + "/lib/sampleConstruction.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const fs = require("fs");
const expected = JSON.parse(fs.readFileSync(R + "/docs/sample-yardi/expected.json", "utf8")).construction;
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 0.05) => Math.abs(a - b) < e;

ok(S.SAMPLE_CONSTRUCTION_JOBS_CSV === fs.readFileSync(R + "/docs/sample-yardi/construction-jobs-2026-10.csv", "utf8") && S.SAMPLE_CONSTRUCTION_INVOICES_CSV === fs.readFileSync(R + "/docs/sample-yardi/construction-invoices-2026-10.csv", "utf8"), "the embedded sample files match docs/sample-yardi");
const jg = parseCSV(S.SAMPLE_CONSTRUCTION_JOBS_CSV), ig = parseCSV(S.SAMPLE_CONSTRUCTION_INVOICES_CSV);
ok(C.detectConstructionFile(jg) === "jobs" && C.detectConstructionFile(ig) === "invoices" && C.detectConstructionFile([["a", "b"], [1, 2]]) === null, "file kind detected from the header");
const jobs = C.parseJobs(jg), invoices = C.parseInvoices(ig);
ok(jobs.length === expected.jobs.length && invoices.length > 0, `${jobs.length} jobs, ${invoices.length} invoices`);
ok(expected.jobs.every((e) => { const x = jobs.find((y) => y.code === e.code); return x && x.originalBudget === e.budget && x.revisedBudget === e.revised && x.committed === e.committed && x.invoiced === e.invoiced && x.paid === e.paid && x.status === e.status && x.unit === e.unit; }), "every job matches expected.json (budget, revised, committed, invoiced, paid, status, unit)");
const sumInv = (code) => invoices.filter((i) => i.code === code).reduce((s, i) => s + i.amount, 0);
ok(close(sumInv("mf1-01-J01"), 17248, 1) && invoices[0].date === "2026-08-17" && invoices[0].vendor === "Example Builders Inc.", "invoices: amounts, dates, vendors");

// Assets with units named like the sample rent rolls.
const mk = (id, name, unitNames, plan) => ({ id, inputs: { propertyName: name, units: unitNames.map((u) => ({ id: `${id}-u${u}`, name: u, squareFeet: 2000, leaseStatus: "occupied", tenantName: "" })), businessPlan: plan ? { revisions: [{ plan: { leasing: plan } }] } : undefined } });
const deals = [
  mk("sample-deal-1", "Airport Flex Park", ["001", "002", "012"], [{ unitId: "sample-deal-1-u001", unit: "001", action: "Re-tenant", sf: 2000, tiPSF: 8 }, { unitId: "sample-deal-1-u002", unit: "002", action: "Renew", sf: 2000, tiPSF: 2 }]),
  mk("sample-deal-2", "Route 9 Small Bay", ["001", "017", "018"]),
  mk("sample-deal-4", "Ridgeway Trade Center", ["014"]),
];
const r = C.importConstruction(deals, { jobs, invoices, asOf: "2026-10-31", source: "sample" });
ok(Object.keys(r.updates).length === 3 && r.unmatched.includes("Harbor Light Industrial") && r.unmatched.includes("Mill Creek Business Park"), "jobs matched to assets by name; the rest reported as not matched");
const a1 = r.updates["sample-deal-1"];
ok(a1.jobs.length === 4 && a1.asOf === "2026-10-31" && a1.jobs.find((x) => x.code === "mf1-01-J01").unitId === "sample-deal-1-u001" && a1.jobs.find((x) => x.code === "mf1-01-J04").unitId === null && a1.jobs[0].source === "sample", "units matched by name; a capital job has no unit");
ok(a1.jobs.find((x) => x.code === "mf1-01-J01").invoices.length === 2, "each job carries its invoices");
const again = C.importConstruction([{ ...deals[0], inputs: { ...deals[0].inputs, construction: { jobs: a1.jobs.map((x) => (x.code === "mf1-01-J01" ? { ...x, notes: "keep me" } : x)) } } }], { jobs: [{ ...jobs[0], invoiced: 18000 }], invoices: [] });
const j1 = again.updates["sample-deal-1"].jobs;
ok(j1.length === 4 && j1.find((x) => x.code === "mf1-01-J01").invoiced === 18000 && j1.find((x) => x.code === "mf1-01-J01").notes === "keep me", "a second upload updates by job code (no duplicates, notes kept)");

// ── TI by unit ──
const inp1 = { ...deals[0].inputs, construction: a1 };
const t1 = C.tiByUnit(inp1);
const u001 = t1.rows.find((x) => x.unit === "001"), u002 = t1.rows.find((x) => x.unit === "002"), u012 = t1.rows.find((x) => x.unit === "012");
ok(u001.planned === 16000 && u001.spent === 17248 && close(u001.overrunPct, 7.8) && u001.flag === "amber", "unit 001: 7.8% over the plan's TI (16,000) — amber");
ok(u002.planned === 4000 && u002.spent === 3800 && u002.flag === "" && u002.remaining === 200, "unit 002 under plan, no flag");
ok(u012.planned === null && u012.budget === 16000 && u012.flag === "", "a unit not in the plan uses its job budget");
const ridge = C.tiByUnit({ ...deals[2].inputs, construction: r.updates["sample-deal-4"] }).rows[0];
ok(close(ridge.overrunPct, 34.4) && ridge.flag === "red", "Ridgeway unit 014: 34% over — red");
const r9 = C.tiByUnit({ ...deals[1].inputs, construction: r.updates["sample-deal-2"] }).rows.find((x) => x.unit === "018");
ok(r9.status === "Not started" && r9.flag === "" && r9.spent === 0, "a job not started isn't flagged");
ok(C.overrunFlag(3) === "" && C.overrunFlag(8) === "amber" && C.overrunFlag(25) === "red", "flags: over 5% amber, over 20% red");

// ── Capital jobs and links ──
const linked = { ...inp1, propertyMgmt: { items: [{ id: "i1", system: "Roof", yardiJob: "mf1-01-J04" }] } };
const cj = C.capitalJobs(linked);
ok(cj.length === 1 && cj[0].code === "mf1-01-J04" && cj[0].finding?.id === "i1", "a capital job links to the condition finding with its job code");
const x = C.constructionXlsx([{ id: "sample-deal-1", inputs: inp1 }]);
ok(x.some((row) => row[1] === "001" && row[12] === "amber") && x.some((row) => row[12] === "INV-1001"), "Excel: TI by unit with flags, and jobs with invoices");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
