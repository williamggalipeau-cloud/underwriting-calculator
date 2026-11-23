const R = require("path").resolve(__dirname, "..", ".."); const fs = require("fs");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const lv = j(R + "/lib/leaseViews.js"); const tc = j(R + "/lib/tenantCredit.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const dir = R + "/docs/sample-leases/abstracts";
const abs = (p) => JSON.parse(fs.readFileSync(`${dir}/${fs.readdirSync(dir).find((f) => f.startsWith(p))}`));
const files = fs.readdirSync(dir).sort();
const leases = files.map((f, i) => ({ id: "L" + i, deal_id: "D" + f.slice(0, 2), tenant: f.slice(3, -5), status: i === 0 ? "applied" : "abstracted", abstract: JSON.parse(fs.readFileSync(`${dir}/${f}`)) }));
const asOf = "2026-11-22";
const name = (id) => "Asset " + id;

// Critical dates
const cd = lv.criticalDates(leases, { assetName: name, asOf });
const n = leases.reduce((s, l) => s + l.abstract.critical_dates.length, 0);
ok(cd.filter((r) => r.source === "abstract" && r.date).length === n, `every abstract critical date is listed (${n})`);
const dated = cd.filter((r) => r.date).map((r) => r.date);
ok(dated.every((d, i) => i === 0 || dated[i - 1] <= d), "dates oldest first; response periods last");
ok(cd.filter((r) => r.kind === "response").length >= 12, `SNDA / estoppel response periods listed (${cd.filter((r) => r.kind === "response").length})`);
const r9 = cd.find((r) => r.dealId === "D03" && r.kind === "renewal_notice");
ok(r9.date === "2026-11-30" && r9.status === "soon" && r9.days === 8, `Route 9 renewal notice 11/30/2026 is within 90 days (${r9.status}, ${r9.days}d)`);
const t5 = cd.find((r) => r.dealId === "D05" && r.kind === "termination_notice");
ok(t5.status === "soon", "Ridgeway termination notice 1/31/2027 amber");
ok(cd.find((r) => r.kind === "lease_date").status === "past", "past dates red");
ok(!cd.some((r) => r.dealId === "D10" && r.kind.startsWith("termination")), "Lakeshore: no termination dates after the amendment");

// Risk flags
const rf = lv.riskFlags(leases, { assetName: name });
ok(rf.length === leases.reduce((s, l) => s + l.abstract.risks.length, 0), `every risk flag listed (${rf.length})`);
ok(rf[0].severity === "high" && rf.findIndex((r) => r.severity === "low") > rf.findLastIndex((r) => r.severity === "high"), "sorted most severe first");
ok(rf.filter((r) => r.type === "relocation").length === 2, "relocation flags typed (Granite Ave, Riverside)");
ok(rf.some((r) => r.type === "termination") && rf.some((r) => r.type === "environmental") && rf.some((r) => r.type === "guaranty"), "termination, environmental and guaranty types found");
ok(rf.every((r) => r.quote), "every flag carries its quote");

// Excel rows
const xr = lv.criticalDateRows(cd); ok(xr[0][0] === "Date" && xr.length === cd.length + 1, "critical dates Excel rows");
ok(lv.riskFlagRows(rf).length === rf.length + 1, "risk flags Excel rows");

// Asset summary
const sm = lv.leaseSummaryByDeal(leases, { asOf });
const s3 = sm.get("D03");
ok(s3.leases === 1 && s3.abstracted === 1 && s3.next.date === "2026-11-30", `per-asset summary: next date ${s3.next?.date}`);
ok(sm.get("D02").applied === 1 && sm.get("D02").risks === leases[0].abstract.risks.length, "applied and risk counts");

// Tenant credit
const exp = JSON.parse(fs.readFileSync(R + "/docs/sample-deal-docs/tenant-credit/expected.json"));
const docs = exp.documents.filter((d) => d.lease.startsWith("02")).map((d, i) => ({ id: "c" + i, lease_id: "L0", kind: d.kind, subject: d.subject, source: d.source, period_end: d.period_end ?? null, report_date: d.report_date ?? null, figures: d.figures }));
const fl = tc.creditFlags(docs, { abs: abs("02"), asOf });
const kinds = fl.map((f) => f.kind);
ok(exp.expected.desertAero.flags.every((k) => kinds.includes(k)), `Desert Aero flags: ${kinds.join(", ")}`);
ok(fl.find((f) => f.kind === "score").text.includes("78") && fl.find((f) => f.kind === "score").text.includes("64"), "falling score 78 → 64");
ok(/0\.60.*1\.05/.test(fl.find((f) => f.kind === "leverage").text), "leverage 0.60 → 1.05");
ok(fl.find((f) => f.kind === "stale").text.includes("guarantor"), "stale guarantor statement");
ok(!kinds.includes("due"), "no statement requirement in the sample lease");
ok(tc.latestRating(docs).rating === "Moderate risk (3 of 5)", "latest rating from the newest report");
const c25 = tc.checkFigures(docs[3].figures, 31000);
ok(c25.figures.currentRatio === 1.31 && c25.figures.debtToEquity === 1.05 && Math.abs(c25.rentPctOfRevenue - 0.765) < 0.01, `ratios calculated (CR ${c25.figures.currentRatio}, D/E ${c25.figures.debtToEquity}, rent ${c25.rentPctOfRevenue.toFixed(2)}%)`);
const bad = tc.checkFigures({ currentAssets: 100, currentLiabilities: 50, currentRatio: 3, revenue: 10, netIncome: 20 });
ok(bad.checks.filter((c) => !c.ok).length === 2, "wrong entered ratio and net income > revenue flagged");
const cascade = exp.documents.filter((d) => d.lease.startsWith("03")).map((d) => ({ kind: d.kind, subject: d.subject, report_date: d.report_date, figures: d.figures }));
ok(tc.creditFlags(cascade, { abs: abs("03"), asOf }).length === 0, "Cascade: one clean report, no flags");
ok(tc.creditFlags([], { abs: abs("03"), asOf })[0].kind === "missing", "no documents: missing flag");

// Statement requirement and due date (clause added to a copy)
const a = abs("14");
a.fields.push({ key: "financial_reporting", label: "Financial statements", section: "legal", value: "Tenant shall deliver annual financial statements within one hundred twenty (120) days after the end of each fiscal year", status: "found", clause: "24.3", evidence: [{ quote: "Tenant shall deliver its annual financial statements to Landlord within one hundred twenty (120) days after the end of each fiscal year." }] });
const req = tc.statementRequirement(a);
ok(req && req.days === 120 && req.frequency === "annual" && req.clause === "24.3", `requirement read: ${JSON.stringify(req && { d: req.days, f: req.frequency, c: req.clause })}`);
const due0 = tc.nextStatementDue(req, [], asOf);
ok(due0.periodEnd === "2025-12-31" && due0.due === "2026-04-30", `no statements on file: FY2025 due ${due0.due}`);
const due1 = tc.nextStatementDue(req, [{ kind: "financial_statement", subject: "tenant", period_end: "2025-12-31" }], asOf);
ok(due1.due === "2027-04-30", `FY2025 delivered: FY2026 due ${due1.due}`);
const cd2 = lv.criticalDates([{ id: "X", deal_id: "D14", tenant: "Citrus", abstract: a }], { asOf, credit: [] });
const sd = cd2.find((r) => r.kind === "statements_due");
ok(sd && sd.date === "2026-04-30" && sd.status === "past", "statements due added to critical dates (overdue → red)");
ok(!lv.criticalDates([{ id: "X", deal_id: "D14", tenant: "Citrus", abstract: a }], { asOf }).some((r) => r.kind === "statements_due"), "viewers (no credit data): no statements-due row");
const pf = tc.parseFigures('```json\n{ "figures": { "revenue": "4,050,000", "score": 64, "rating": "Moderate" }, "quotes": { "revenue": "Revenue $4,050,000" } }\n```');
ok(pf.figures.revenue === 4050000 && pf.figures.score === 64 && pf.figures.quotes.revenue, "Claude figures JSON parsed");
ok(tc.parseFigures("{ nope").errors.length === 1, "bad JSON rejected");

// PDF report builds
const { leaseReportPdf } = j(R + "/lib/leaseReportPdf.js");
leaseReportPdf(leases, { title: "Model Fund I", assetName: name, asOf }).then(async (blob) => {
  const buf = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync(require("path").join(require("os").tmpdir(), "baywise-lease-report.pdf"), buf);
  ok(buf.length > 20000 && buf.slice(0, 4).toString() === "%PDF", `abstraction report PDF built (${Math.round(buf.length / 1024)} KB)`);
  console.log(fail ? fail + " FAILED" : "ALL PASS"); process.exit(fail ? 1 : 0);
}).catch((e) => { console.log("FAIL PDF", e.message); process.exit(1); });
