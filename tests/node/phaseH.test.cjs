const R = require("path").resolve(__dirname, "..", ".."); const fs = require("fs"); const { execFileSync } = require("child_process");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const T = j(R + "/lib/dealDocTypes.js"); const A = j(R + "/lib/dealDocApply.js"); const Q = j(R + "/lib/delinquency.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const sp = j(R + "/lib/samplePortfolio.js"); const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
let fail = 0; const ok = (cnd, m) => { console.log((cnd ? "PASS " : "FAIL ") + m); if (!cnd) fail++; };
const near = (a, b, t = 0.01) => Math.abs(a - b) <= t;
const r2 = (n) => Math.round(n * 100) / 100;
// ── Delinquency (mock Yardi aged receivables) ──
const Y = R + "/tests/fixtures/sample-yardi"; const exp = JSON.parse(fs.readFileSync(Y + "/expected.json"));
const deals = sp.buildSampleDeals(TEST_INPUTS).map((d, i) => ({ id: d.id ?? "D" + i, inputs: d.inputs }));
const months = {};
let mapping = {};
for (const m of Object.keys(exp.months)) {
  const p = Q.parseAgedReport(parseCSV(fs.readFileSync(`${Y}/aged-receivables-${m.slice(0, 7)}.csv`, "utf8")));
  ok(p.asOf === m && p.rows.length === exp.months[m].rows && p.warnings.length === 0, `${m}: report date and ${p.rows.length} rows, no warnings ${p.warnings.join("; ")}`);
  ok(near(p.rows.reduce((s, r) => s + r.total, 0), exp.months[m].total), `${m}: total ${exp.months[m].total}`);
  mapping = Q.suggestMapping(p.rows, deals, mapping);
  months[m] = { rows: p.rows };
}
const allCodes = new Set(Object.values(months).flatMap((x) => x.rows.map((r) => r.tenantCode)));
ok(Object.keys(mapping.properties).length === 9 && [...allCodes].every((c) => mapping.tenants[c]), "mapping: 9 properties and every tenant matched to a unit");
const oct = Q.aggregate(months["2026-10-31"], mapping, deals);
ok(oct.unmapped.length === 0 && near(oct.fund.total, 39093.36), `Oct fund total ${oct.fund.total}`);
ok(near(oct.fund.delinquent, 42685.45), `Oct past due ${oct.fund.delinquent} (42,685.45)`);
ok(near(oct.fund.pctRent, 11.15, 0.01), `Oct past due ${oct.fund.pctRent.toFixed(2)}% of monthly rent`);
const by = (a, asset) => a.tenants.find((t) => t.asset === asset);
const rid = by(oct, "Ridgeway Trade Center"), hl = by(oct, "Harbor Light Industrial"), mc = by(oct, "Mill Creek Business Park"), ls = by(oct, "Lakeshore Service Center"), so = by(oct, "Southpoint Flex");
ok(near(rid.buckets.over180, rid.monthlyRent * 3, 0.05) && near(rid.monthsOwed, 6), "Ridgeway: 3 months over 180 days, 6 months owed");
ok(near(hl.buckets.d180, hl.monthlyRent) && near(hl.monthsOwed, 4), "Harbor Light: 91–180 bucket, 4 months owed");
ok(mc.buckets.prepay < 0 && mc.delinquent === 0, "Mill Creek: prepaid credit, not delinquent");
ok(ls.delinquent === 0 && ls.buckets.current > 0, "Lakeshore: current only, not delinquent");
ok(so.byCharge.cam > 0 && !so.byCharge.rent, "Southpoint: CAM charge only");
const late = (a) => !!by(a, "Airport Flex Park") && by(a, "Airport Flex Park").delinquent > 0;
ok(!late(oct) && late(Q.aggregate(months["2026-09-30"], mapping, deals)), "Airport Flex 003 late in September, caught up in October");
const tr = Q.trend({ months, mapping }, deals);
ok(tr.length === 3 && isNaN(tr[0].change) && near(tr[2].change, r2(tr[2].delinquent - tr[1].delinquent)), "trend: three months with month-over-month change");
const coll = Q.collections(parseCSV(fs.readFileSync(Y + "/tenant-ledger.csv", "utf8")), mapping, deals);
const c9 = coll.find((c) => c.asset === "Route 9 Small Bay"), cc = coll.find((c) => c.asset === "Canal Street Workshops"), ca = coll.find((c) => c.asset === "Airport Flex Park");
ok(coll.length === 3 && near(c9.collectedPct, 200 / 3) && c9.belowAssumption && near(cc.collectedPct, 250 / 3) && near(ca.collectedPct, 100) && !ca.belowAssumption, `collections: Route 9 ${c9?.collectedPct?.toFixed(1)}%, Canal ${cc?.collectedPct?.toFixed(1)}%, Airport ${ca?.collectedPct?.toFixed(1)}%`);
// ── Estoppel, CAM, billing ──
const D = R + "/tests/fixtures/deal-docs"; // the pre-1.1.13 copies: they differ from the model on purpose
const abs = (n) => JSON.parse(fs.readFileSync(`${D}/abstracts/${n}.json`));
for (const n of ["airport-flex-estoppel-desert-aero", "lakeshore-cam-2025", "riverside-billing-2026-12"]) {
  const probs = T.checkLocally(abs(n), execFileSync("pdftotext", ["-layout", `${D}/${n}.pdf`, "-"]).toString());
  ok(probs.length === 0, `${n}: quotes in the PDF${probs.length ? " — " + probs[0] : ""}`);
}
const L = R + "/tests/fixtures/sample-leases/abstracts";
const lease = (f, id, deal, tenant) => ({ id, deal_id: deal, tenant, abstract: JSON.parse(fs.readFileSync(`${L}/${f}.json`)), unit_ids: [] });
const leases = [lease("02-airport-flex-park-desert-aero", "L-da", "AF", "Desert Aero Parts LLC"), lease("10-lakeshore-north-texas-fleet", "L-nt", "LS", "North Texas Fleet Service LLC"),
  lease("14-riverside-citrus-belt-logistics", "L-cb", "RV", "Citrus Belt Logistics, LLC")];
const est = { doc_type: "estoppel", deal_id: "AF", lease_id: "L-da", abstract: abs("airport-flex-estoppel-desert-aero") };
const unit = { id: "u104", name: "104", squareFeet: 2000, currentRentPSF: 15.5, leaseStart: "2025-03-01", leaseEnd: "2028-02-29", securityDeposit: 2500 };
const rows = A.estoppelChecks(est, leases[0].abstract, unit);
const row = (l) => rows.find((r) => r.label === l);
console.log(rows.map((r) => `   ${r.ok ? "ok " : "BAD"} ${r.label}: ${r.estoppel} | ${r.lease} | ${r.unit}`).join("\n"));
ok(!row("Expiration").ok && row("Expiration").estoppel === "2028-02-28" && row("Expiration").lease === "2028-02-29", "estoppel: expiration Feb 28 vs the lease's Feb 29 flagged");
ok(!row("Landlord defaults or claims").ok && row("Landlord defaults or claims").severity === "high", "estoppel: $1,200 HVAC credit claim flagged (high)");
ok(["Commencement", "Monthly base rent", "Security deposit", "Renewal options", "Amendments", "Tenant defaults"].every((l) => row(l)?.ok), "estoppel: commencement, rent $2,583.33, deposit, renewal, amendments and tenant defaults match");
ok(!rows.find((r) => r.label === "Prepaid rent"), "estoppel: no prepaid rent row for $0");
const cam = A.camCheck({ doc_type: "cam", deal_id: "LS", abstract: abs("lakeshore-cam-2025") }, leases);
const nt = cam.tenants[0];
ok(near(cam.fee.pct, 4.5) && nt.share === 5.5 && nt.billedShare === 6 && nt.feeCap === 4, "CAM: fee 4.5% of revenue vs 4% cap; share 6.00% billed vs 5.50%");
ok(near(nt.recoverable, 0.055 * (180000 - 1200)) && near(nt.diff, 10800 - 9834) && nt.issues.length === 2, `CAM: recoverable $${nt.recoverable} vs billed $10,800 → over-billed $${nt.diff}`);
ok(cam.tenants[1].noLease, "CAM: tenant without an abstracted lease is shown, not checked");
const bill = A.billingCheck({ doc_type: "billing", deal_id: "RV", abstract: abs("riverside-billing-2026-12") }, leases);
ok(near(bill[0].diff, 0) && near(bill[1].due, 4880) && near(bill[1].diff, -166.67), "billing: Nov 2026 correct; Dec 2026 under-billed $166.67 (Lease Year 4 rent $4,880)");
const pr = T.dealDocPrompt({ doc: { id: "x", doc_type: "cam" }, assetName: "A", links: [] });
ok(T.DOC_TYPES.some((x) => x.id === "estoppel" && x.validator === "estoppel_validate") && /cam_validate/.test(pr) && /Do NOT call cam_show/.test(pr), "prompts: *_validate, never *_show");
console.log(fail ? fail + " FAILED" : "ALL PASS"); process.exit(fail ? 1 : 0);
