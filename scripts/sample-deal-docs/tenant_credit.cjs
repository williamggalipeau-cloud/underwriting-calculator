// Writes the fictional tenant credit sample documents (phase D) as HTML and
// prints them to PDF: docs/sample-deal-docs/tenant-credit/.
// Usage: node scripts/sample-deal-docs/tenant_credit.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "..", "tests", "fixtures", "tenant-credit");
const data = require(path.join(dir, "expected.json"));

const money = (n) => `$${Number(n).toLocaleString("en-US")}`;
const css = `body{font:11px/1.45 Arial,sans-serif;color:#111}h1{font-size:17px;margin:0 0 4px}h2{font-size:13px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}td.n{text-align:right}
.banner{color:#b42318;font-weight:bold;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:12px}.muted{color:#555}`;
const banner = '<div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL CREDIT DOCUMENT</div>';

function creditReport(d) {
  const f = d.figures;
  return `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${banner}
<h1>Business Credit Report</h1><p class="muted">${d.source} · Report date: ${d.report_date_long} · Report no. ${d.ref}</p>
<h2>Subject</h2><table><tr><th>Business name</th><td>${d.subject_legal}</td></tr><tr><th>Address</th><td>${d.address}</td></tr>
<tr><th>Industry</th><td>${d.industry}</td></tr><tr><th>Years in business</th><td>${d.years}</td></tr></table>
<h2>Scores</h2><table><tr><th>Credit Score</th><td>${f.score} (scale 1–100; higher is lower risk)</td></tr>
<tr><th>Risk Rating</th><td>${f.rating}</td></tr><tr><th>Payment index</th><td>${d.paydex}</td></tr></table>
<h2>Trade experience</h2><table><tr><th>Trade lines</th><td>${d.trades}</td></tr><tr><th>Highest credit</th><td>${money(d.high_credit)}</td></tr>
<tr><th>Past due</th><td>${money(d.past_due)}</td></tr><tr><th>Liens, judgments, bankruptcies</th><td>${d.public_records}</td></tr></table>
<p class="muted">${d.comment}</p><p class="muted">This report is fictional and was created for software testing.</p></body></html>`;
}

function statements(d) {
  const f = d.figures;
  const row = (l, v) => `<tr><td>${l}</td><td class="n">${money(v)}</td></tr>`;
  return `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${banner}
<h1>${d.subject_legal}</h1><p class="muted">${d.title} · ${d.period_label} · ${d.basis}</p>
<h2>Income statement</h2><table>${row("Revenue", f.revenue)}${row("Cost of sales", d.cogs)}${row("Operating expenses", d.opex)}
${row("EBITDA", f.ebitda)}${row("Depreciation and amortization", d.da)}${row("Interest expense", d.interest)}${row("Income taxes", d.taxes)}${row("Net income", f.netIncome)}</table>
<h2>Balance sheet (at period end)</h2><table>${row("Total current assets", f.currentAssets)}${row("Property and equipment, net", d.ppe)}
${row("Total current liabilities", f.currentLiabilities)}${row("Total debt (bank loan and notes)", f.totalDebt)}${row("Total equity", f.equity)}</table>
<p class="muted">${d.comment}</p><p class="muted">These statements are fictional and were created for software testing.</p></body></html>`;
}

function personal(d) {
  const f = d.figures;
  const row = (l, v) => `<tr><td>${l}</td><td class="n">${money(v)}</td></tr>`;
  return `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${banner}
<h1>Personal Financial Statement</h1><p class="muted">${d.subject_legal} · as of ${d.period_label} · ${d.basis}</p>
<h2>Assets</h2><table>${row("Cash and securities", d.cash)}${row("Real estate (net of mortgages)", d.re)}${row("Business interests", d.business)}${row("Total current assets", f.currentAssets)}</table>
<h2>Liabilities</h2><table>${row("Notes and credit lines", f.totalDebt)}${row("Total current liabilities", f.currentLiabilities)}</table>
<h2>Net worth</h2><table>${row("Net worth (equity)", f.equity)}${row("Annual income", f.revenue)}</table>
<p class="muted">${d.comment}</p><p class="muted">This statement is fictional and was created for software testing.</p></body></html>`;
}

(async () => {
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const d of data.documents) {
    const html = d.kind === "credit_report" ? creditReport(d) : d.subject === "guarantor" ? personal(d) : statements(d);
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
  console.log(`${data.documents.length} PDFs`);
  await b.close();
})();
