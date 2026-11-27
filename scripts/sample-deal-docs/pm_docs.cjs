// 1.1.21: writes the fictional Property Management sample documents for
// three assets, as HTML, prints them to PDF and writes the abstract of each:
// docs/sample-deal-docs/property-mgmt/.
//   - a property tax bill (the next installment on the Property Taxes tab);
//   - the owner's insurance declarations (the three policies on Insurance);
//   - a service contract (the HVAC contract on Service Contracts).
// Every figure is read from scripts/sample-deal-docs/fund.json (Model Fund I
// as the app builds it, lib/samplePropertyMgmt.js); nothing is typed in here.
// Fictional only.
// Usage: node scripts/sample-deal-docs/pm_docs.cjs [--no-pdf]
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const fund = require("./fund.json");
const dir = path.join(R, "docs", "sample-deal-docs", "property-mgmt");
const PM_ASSETS = ["sample-deal-1", "sample-deal-2", "sample-deal-3"];
const SLUG = { "sample-deal-1": "airport-flex", "sample-deal-2": "route9", "sample-deal-3": "harbor-light" };
const css = `body{font:11.5px/1.55 Georgia,serif;color:#111}h1{font-size:17px;text-align:center;margin:0 0 4px}h2{font-size:12.5px;margin:16px 0 4px}
.banner{font:bold 11px Arial;color:#b42318;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:14px}.c{text-align:center}.muted{color:#555;font-size:10.5px}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left;font-size:11px}th{background:#f3f3f3}`;
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const usd = (v) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;
const page = (title, sub, body) => `<html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL DOCUMENT</div>
<h1>${title.toUpperCase()}</h1><p class="c muted">${sub}</p>${body}<p class="muted" style="margin-top:22px">This document is fictional and was created for software testing.</p></body></html>`;
const where = (a) => `${a.address}, ${a.city}, ${a.state} ${a.zip}`;

function taxBill(a) {
  const pm = a.propertyMgmt, parcel = pm.parcels[0], bill = pm.bills.find((b) => !b.paidDate), second = pm.bills.filter((b) => !b.paidDate)[1];
  const county = parcel.notes.split(" assessor")[0];
  const q = {
    parcel: `Parcel number: ${parcel.apn}.`,
    owner: `Assessed owner: ${a.propertyCompany}.`,
    assessed_value: `Assessed value for tax year ${bill.year}: ${usd(parcel.assessedValue)}.`,
    tax_rate: `Combined tax rate: ${parcel.taxRatePct}%.`,
    amount: `${bill.installment} installment due: ${usd(bill.amount)}.`,
    due_date: `Pay by ${long(bill.dueDate)} to avoid penalty.`,
    second: `The ${second.installment} installment of ${usd(second.amount)} is due ${long(second.dueDate)}.`,
  };
  const body = `<p class="c">${county} Treasurer · Property Tax Statement · Tax year ${bill.year}</p>
<h2>1. Property</h2><p>1.1 ${q.parcel}</p><p>1.2 Situs: ${a.name}, ${where(a)}.</p><p>1.3 ${q.owner}</p>
<h2>2. Assessment</h2><p>2.1 ${q.assessed_value}</p><p>2.2 ${q.tax_rate}</p>
<h2>3. Amount due</h2><p>3.1 ${q.amount}</p><p>3.2 ${q.due_date}</p><p>3.3 ${q.second}</p>
<table><tr><th>Installment</th><th>Amount</th><th>Due</th></tr>${pm.bills.filter((b) => !b.paidDate).map((b) => `<tr><td>${b.installment}</td><td>${usd(b.amount)}</td><td>${long(b.dueDate)}</td></tr>`).join("")}</table>`;
  return { kind: "tax_bill", section: "bills", title: `${bill.year} property tax statement`, html: page("Property Tax Statement", `${a.name} · Tax year ${bill.year}`, body),
    abstract: { doc_type: "tax_bill", title: `${a.name} ${bill.year} property tax statement`, asset: a.name, parcel: parcel.apn, owner: a.propertyCompany, tax_year: bill.year, assessed_value: parcel.assessedValue, tax_rate_pct: parcel.taxRatePct,
      installments: pm.bills.filter((b) => !b.paidDate).map((b) => ({ installment: b.installment, amount: b.amount, due_date: b.dueDate })),
      quotes: { parcel: `${q.parcel} (§1.1)`, owner: `${q.owner} (§1.3)`, assessed_value: `${q.assessed_value} (§2.1)`, tax_rate_pct: `${q.tax_rate} (§2.2)`, amount: `${q.amount} (§3.1)`, due_date: `${q.due_date} (§3.2)`, second: `${q.second} (§3.3)` } } };
}
function declarations(a) {
  const pol = a.propertyMgmt.policies, total = pol.reduce((s, p) => s + p.premium, 0);
  const line = (p) => `${p.type}, policy ${p.policyNo}: limit ${usd(p.limit)}${p.deductible ? `, deductible ${usd(p.deductible)}` : ""}, annual premium ${usd(p.premium)}, effective ${long(p.effective)}, expires ${long(p.renewalDate)}.`;
  const q = { insured: `Named insured: ${a.propertyCompany}.`, insurer: `Insurer: ${pol[0].carrier}.`, broker: `Producer: ${pol[0].broker}.`, total: `Total annual premium: ${usd(total)}.` };
  const body = `<h2>1. Parties</h2><p>1.1 ${q.insured}</p><p>1.2 ${q.insurer}</p><p>1.3 ${q.broker}</p><p>1.4 Insured location: ${a.name}, ${where(a)}.</p>
<h2>2. Coverages</h2>${pol.map((p, i) => `<p>2.${i + 1} ${line(p)}</p>`).join("")}
<h2>3. Premium</h2><p>3.1 ${q.total}</p>`;
  return { kind: "insurance_policy", section: "policies", title: "Insurance declarations", html: page("Policy Declarations", `${a.name} · Owner's property, liability and umbrella policies`, body),
    abstract: { doc_type: "insurance_policy", title: `${a.name} owner's insurance declarations`, asset: a.name, insured: a.propertyCompany, insurer: pol[0].carrier, broker: pol[0].broker, total_premium: total,
      policies: pol.map((p) => ({ coverage: p.type, policy_no: p.policyNo, limit: p.limit, deductible: p.deductible, premium: p.premium, effective: p.effective, expiry: p.renewalDate })),
      quotes: { insured: `${q.insured} (§1.1)`, insurer: `${q.insurer} (§1.2)`, broker: `${q.broker} (§1.3)`, total_premium: `${q.total} (§3.1)`, ...Object.fromEntries(pol.map((p, i) => [p.policyNo, `${line(p)} (§2.${i + 1})`])) } } };
}
function serviceContract(a) {
  const c = a.propertyMgmt.contracts.find((x) => x.service === "HVAC");
  const q = {
    parties: `This Service Agreement is made as of ${long(c.start)} between ${a.propertyCompany} ("Owner") and ${c.vendor} ("Contractor").`,
    service: `Contractor shall provide quarterly preventive maintenance of the rooftop heating, ventilation and air-conditioning units at ${a.name}.`,
    term: `The term begins on ${long(c.start)} and ends on ${long(c.end)}.`,
    annual_cost: `Owner shall pay ${usd(c.annualCost)} per year, in equal quarterly installments.`,
    renewal: c.autoRenew ? `This Agreement renews for successive one-year terms unless either party gives ${c.noticeDays} days' written notice before the end of the term.` : `This Agreement does not renew automatically; either party may end it on ${c.noticeDays} days' written notice.`,
  };
  const body = `<p>${q.parties}</p><h2>1. Services</h2><p>1.1 ${q.service}</p><h2>2. Term</h2><p>2.1 ${q.term}</p><p>2.2 ${q.renewal}</p>
<h2>3. Fee</h2><p>3.1 ${q.annual_cost}</p><h2>4. Insurance</h2><p>4.1 Contractor shall carry commercial general liability insurance naming Owner as an additional insured.</p>
<p style="margin-top:26px">${a.propertyCompany.toUpperCase()} &nbsp; By: ____________ (fictional) &nbsp;&nbsp; ${c.vendor.toUpperCase()} &nbsp; By: ____________ (fictional)</p>`;
  return { kind: "service_contract", section: "contracts", title: "HVAC service agreement", html: page("Service Agreement", `${a.name} · ${c.vendor}`, body),
    abstract: { doc_type: "service_contract", title: `${a.name} HVAC service agreement`, asset: a.name, owner: a.propertyCompany, vendor: c.vendor, service: c.service, start: c.start, end: c.end, annual_cost: c.annualCost, auto_renew: !!c.autoRenew, notice_days: c.noticeDays,
      quotes: { vendor: `${q.parties} (p.1)`, service: `${q.service} (§1.1)`, start: `${q.term} (§2.1)`, end: `${q.term} (§2.1)`, auto_renew: `${q.renewal} (§2.2)`, notice_days: `${q.renewal} (§2.2)`, annual_cost: `${q.annual_cost} (§3.1)` } } };
}

(async () => {
  const noPdf = process.argv.includes("--no-pdf");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  fs.mkdirSync(path.join(dir, "abstracts"), { recursive: true });
  const docs = [];
  for (const a of fund.assets) if (PM_ASSETS.includes(a.id)) for (const d of [taxBill(a), declarations(a), serviceContract(a)]) docs.push({ ...d, asset: a.name, dealId: a.id, name: `${SLUG[a.id]}-${d.kind.replace(/_/g, "-")}` });
  let b = null, p = null;
  if (!noPdf) { const { chromium } = require("playwright"); b = await chromium.launch(); p = await b.newPage(); }
  const index = [];
  for (const d of docs) {
    const hp = path.join(dir, "html", `${d.name}.html`);
    fs.writeFileSync(hp, d.html);
    fs.writeFileSync(path.join(dir, "abstracts", `${d.name}.json`), JSON.stringify({ ...d.abstract, app: { made_with: "Sample (fictional)", validated: false } }, null, 1));
    if (p) {
      await p.goto("file://" + hp);
      await p.pdf({ path: path.join(dir, `${d.name}.pdf`), format: "Letter", printBackground: true, displayHeaderFooter: true,
        headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
        footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document</div>',
        margin: { top: "0.8in", bottom: "0.8in", left: "0.9in", right: "0.9in" } });
    }
    index.push({ name: d.name, kind: d.kind, section: d.section, asset: d.asset, dealId: d.dealId, file: `${d.name}.pdf`, title: d.abstract.title });
  }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index, null, 1));
  console.log(`${docs.length} Property Management documents`);
  if (b) await b.close();
})();
