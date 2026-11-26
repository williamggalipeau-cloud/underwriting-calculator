// Writes the fictional sample GP partner agreements (1.1.10, user 11/26) as
// HTML, prints them to PDF and writes the abstract Claude would read from
// each (doc_type gp_agreement, with quotes): docs/sample-deal-docs/gp-agreements/.
// Data: docs/sample-deal-docs/gp-agreements/agreements.json. Fictional only.
// Usage: node scripts/sample-deal-docs/gp_agreements.cjs
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "..", "docs", "sample-deal-docs", "gp-agreements");
const data = require(path.join(dir, "agreements.json"));
const words = { 40: "forty percent (40%)", 50: "fifty percent (50%)" };
const css = `body{font:11.5px/1.55 Georgia,serif;color:#111}h1{font-size:17px;text-align:center;margin:0 0 4px}h2{font-size:12.5px;margin:16px 0 4px}
.banner{font:bold 11px Arial;color:#b42318;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:14px}.c{text-align:center}.muted{color:#555;font-size:10.5px}`;

function quotes(a) {
  const cap = words[a.capital_pct], pro = words[a.promote_pct_of_gp_side];
  return {
    parties: `This ${a.title} is entered into as of ${a.effective_long} between Example Fund GP LLC (the "General Partner") and ${a.partner_name} (the "Partner").`,
    scope: `This Agreement governs ${a.scope_text}.`,
    capital: `The Partner shall fund ${cap} of the GP Commitment${a.deal ? " allocable to the Property" : ""}, and the General Partner shall fund the balance.`,
    promote: `The Partner shall be entitled to ${pro} of the Promote distributed to the General Partner${a.deal ? " in respect of the Property" : ""}.`,
    fees: "The Partner shall not be entitled to any fee. All asset management, acquisition, disposition and other fees are payable to the Sponsor.",
    effective: `This Agreement is effective as of ${a.effective_long}.`,
  };
}
function html(a) {
  const q = quotes(a);
  return `<html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL AGREEMENT</div>
<h1>${a.title.toUpperCase()}</h1><p class="c muted">${a.portfolio}${a.deal ? ` · ${a.deal}` : ""}</p>
<p>${q.parties}</p>
<h2>1. Scope</h2><p>1.1 Defined terms used and not defined here have the meanings in the limited partnership agreement of the Fund.</p><p>1.2 ${q.scope}</p>
<h2>2. Capital</h2><p>2.1 ${q.capital}</p><p>2.2 Capital calls on the GP Commitment shall be made at the same time as calls on the limited partners.</p>
<h2>3. Promote</h2><p>3.1 ${q.promote}</p><p>3.2 The Sponsor retains the balance of the Promote not distributed to the General Partner.</p>
<h2>4. Fees</h2><p>4.1 ${q.fees}</p>
<h2>5. Term</h2><p>5.1 ${q.effective} It continues until the ${a.deal ? "Property is sold" : "Fund is dissolved"}.</p>
<p style="margin-top:28px">EXAMPLE FUND GP LLC &nbsp;&nbsp; By: ____________ (fictional) &nbsp;&nbsp;&nbsp;&nbsp; ${a.partner_name.toUpperCase()} &nbsp;&nbsp; By: ____________ (fictional)</p>
<p class="muted">This agreement is fictional and was created for software testing.</p></body></html>`;
}

(async () => {
  for (const f of fs.readdirSync(dir)) if (/\.(pdf|html)$/.test(f) || f === "abstracts") fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  fs.mkdirSync(path.join(dir, "abstracts"), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const a of data.agreements) {
    const hp = path.join(dir, "html", a.file.replace(/\.pdf$/, ".html"));
    fs.writeFileSync(hp, html(a));
    await p.goto("file://" + hp);
    await p.pdf({ path: path.join(dir, a.file), format: "Letter", printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
      footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document</div>',
      margin: { top: "0.8in", bottom: "0.8in", left: "0.9in", right: "0.9in" } });
    const q = quotes(a);
    const abstract = { doc_type: "gp_agreement", title: a.title, partner_name: a.partner_name, portfolio: a.portfolio, deal: a.deal, capital_pct: a.capital_pct, promote_pct_of_gp_side: a.promote_pct_of_gp_side, fees: "None", effective_date: a.effective_date,
      quotes: { partner_name: `${q.parties} (p.1)`, scope: `${q.scope} (§1.2)`, capital_pct: `${q.capital} (§2.1)`, promote_pct_of_gp_side: `${q.promote} (§3.1)`, fees: `${q.fees} (§4.1)`, effective_date: `${q.effective} (§5.1)` } };
    fs.writeFileSync(path.join(dir, "abstracts", a.file.replace(/\.pdf$/, ".json")), JSON.stringify(abstract, null, 1));
  }
  console.log(`${data.agreements.length} agreements`);
  await b.close();
})();
