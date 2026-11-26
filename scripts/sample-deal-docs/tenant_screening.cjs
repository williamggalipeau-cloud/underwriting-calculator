// Writes the fictional sample credit reports (1.1.9, user 11/26) as HTML and
// prints them to PDF: docs/sample-deal-docs/tenant-screening/. The data is
// lib/sampleCreditReports.json, the same file lib/sampleCredit.js reads, so
// the app's sample credit records always match these reports.
//   screening app reports      (source "app": a tenant-screening service)
//   business credit reports    (source "agency": a credit bureau)
//   credit assessment memos    (source "own": our own assessment)
// Every provider and person is fictional; each page is marked SAMPLE.
// Usage: node scripts/sample-deal-docs/tenant_screening.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const dir = path.join(R, "docs", "sample-deal-docs", "tenant-screening");
const data = require(path.join(R, "lib", "sampleCreditReports.json"));

const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const ref = (d) => `S-${d.reportDate.replace(/-/g, "")}-${(d.tenant.length * 37) % 1000}`;
const css = `body{font:11px/1.45 Arial,sans-serif;color:#111}h1{font-size:17px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{width:34%;background:#f6f6f6}
.banner{color:#b42318;font-weight:bold;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:12px}.muted{color:#555}
.res{font-size:14px;font-weight:bold}.ok{color:#05603a}.cond{color:#93370d}.weak{color:#b42318}`;
const banner = '<div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL CREDIT DOCUMENT</div>';
const page = (body) => `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${banner}${body}<p class="muted">This document is fictional and was created for software testing. Any resemblance to a real business, person or report is coincidental.</p></body></html>`;
const band = (s) => (s >= 740 ? "Very good" : s >= 670 ? "Good" : s >= 580 ? "Fair" : "Poor");
const RESULT = { approved: ["Approved", "ok"], conditions: ["Approved with conditions", "cond"], declined: ["Declined", "weak"] };

// A tenant-screening service's report on the applicant business and its principal.
function screening(d, where) {
  const [res, cls] = RESULT[d.result] ?? [d.result, ""];
  const late = d.score < 650 ? 2 : 0;
  return page(`<h1>Tenant Screening Report</h1><p class="muted">${esc(d.provider)} · Report date: ${long(d.reportDate)} · Report no. ${ref(d)}</p>
<h2>Applicant</h2><table><tr><th>Business</th><td>${esc(d.tenant)}</td></tr><tr><th>Principal / guarantor</th><td>${esc(d.principal)} (fictional)</td></tr><tr><th>Space applied for</th><td>${esc(where)}</td></tr></table>
<h2>Recommendation</h2><p class="res ${cls}">${res}</p>${d.conditions ? `<p><b>Conditions:</b> ${esc(d.conditions)}</p>` : ""}
<h2>Credit</h2><table><tr><th>Consumer credit score (principal)</th><td>${d.score} (${band(d.score)}; scale 300–850)</td></tr>
<tr><th>Open trade lines</th><td>${6 + (d.score % 7)}</td></tr><tr><th>Late payments, last 24 months</th><td>${late ? `${late} × 30 days` : "None"}</td></tr>
<tr><th>Collections</th><td>None</td></tr><tr><th>Bankruptcies, liens, judgments</th><td>None found</td></tr></table>
<h2>Rental history and verification</h2><table><tr><th>Prior landlord reference</th><td>Verified (fictional reference)</td></tr><tr><th>Evictions</th><td>None found</td></tr>
<tr><th>Revenue verification</th><td>Bank statements, last 6 months, reviewed</td></tr></table>
${d.issues ? `<h2>Issues noted</h2><p>${esc(d.issues)}</p>` : ""}`);
}

// A business credit bureau's report on the tenant company.
function agency(d, where) {
  const [res] = RESULT[d.result] ?? [d.result];
  const scoreRow = d.scoreType === "paydex"
    ? `<tr><th>Payment index (Paydex-style)</th><td>${d.score} (scale 1–100; 80 = pays on time)</td></tr>`
    : `<tr><th>Business credit score (Intelliscore-style)</th><td>${d.score} (scale 1–100; higher is lower risk)</td></tr>`;
  return page(`<h1>Business Credit Report</h1><p class="muted">${esc(d.provider)} · Report date: ${long(d.reportDate)} · Report no. ${ref(d)}</p>
<h2>Subject</h2><table><tr><th>Business name</th><td>${esc(d.tenant)}</td></tr><tr><th>Location</th><td>${esc(where)}</td></tr>
<tr><th>Industry</th><td>${esc(d.industry)}</td></tr><tr><th>Years in business</th><td>${d.years}</td></tr></table>
<h2>Scores</h2><table>${scoreRow}<tr><th>Risk class</th><td>${d.score >= 70 ? "Low" : d.score >= 50 ? "Moderate" : "High"}</td></tr></table>
<h2>Trade experience</h2><table><tr><th>Trade lines</th><td>${d.trades}</td></tr><tr><th>Highest credit</th><td>${money(d.highCredit)}</td></tr>
<tr><th>Past due</th><td>${money(d.pastDue)}</td></tr><tr><th>Liens, judgments, bankruptcies</th><td>None</td></tr></table>
<h2>Leasing decision</h2><p class="res ok">${res}</p>`);
}

// Our own credit assessment, when no screening or bureau report exists.
function own(d, where) {
  const rating = { strong: "Strong", acceptable: "Acceptable", weak: "Weak" }[d.rating] ?? d.rating;
  return page(`<h1>Credit Assessment Memo</h1><p class="muted">Internal · ${long(d.reportDate)} · Prepared by ${esc(d.preparedBy)}</p>
<table><tr><th>Tenant</th><td>${esc(d.tenant)}</td></tr><tr><th>Premises</th><td>${esc(where)}</td></tr><tr><th>Why our own assessment</th><td>No screening report or credit bureau file was available for this tenant.</td></tr></table>
<h2>Rating</h2><p class="res ${d.rating === "weak" ? "weak" : "ok"}">${rating}</p>
<h2>Basis</h2><p>${esc(d.basis)}.</p>
<h2>Summary</h2><p>Revenue grew in each of the two years of statements provided, but margins are thin and the business has no trade history long enough to report. The principal's guaranty is limited to the first year.</p>
<h2>Recommendation</h2><p>Keep the tenant at renewal review with an increased security deposit (3 months) and quarterly statements; flag if rent is paid more than 30 days late.</p>`);
}

(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  const docs = [...data.tenants.map((d) => ({ d, where: d.asset })), ...data.prospects.map((d) => ({ d, where: "A vacant unit (prospect)" }))];
  for (const { d, where } of docs) {
    const html = d.source === "own" ? own(d, where) : d.source === "agency" ? agency(d, where) : screening(d, where);
    const hp = path.join(dir, "html", d.file.replace(/\.pdf$/, ".html"));
    fs.writeFileSync(hp, html);
    await p.goto("file://" + hp);
    await p.pdf({
      path: path.join(dir, d.file), format: "Letter", printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
      footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document</div>',
      margin: { top: "0.7in", bottom: "0.7in", left: "0.8in", right: "0.8in" },
    });
  }
  fs.writeFileSync(path.join(dir, "README.md"), "Fictional sample credit reports for the Model Fund I tenants and sample prospects (1.1.9). Generated from lib/sampleCreditReports.json by node scripts/sample-deal-docs/tenant_screening.cjs; do not edit here.\n");
  console.log(`${docs.length} PDFs`);
  await b.close();
})();
