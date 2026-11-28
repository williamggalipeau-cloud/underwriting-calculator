// 1.1.27: the fictional sample documents of the sample joint venture and
// separate account (lib/sampleVentures.js), as HTML, printed to PDF, with the
// abstract of each: docs/sample-deal-docs/ventures/.
//   - the joint venture agreement and the separate account agreement;
//   - the two outside GP partners' agreements;
//   - the sold asset's closing statement, post-closing true-up and
//     distribution notice;
//   - a Phase I and a Phase II report for the asset whose Phase I
//     recognized a condition;
//   - the year-end 2025 appraisal behind each asset's mark.
//
// Every figure a document shares with the app is read from the two
// portfolios as the app builds them (on the fixed date below); nothing the
// app holds is typed in here (AGENTS.md: everything ties out). Facts the app
// does not hold (a report's author, a notice's date) are written here and
// nowhere else. Each abstract value's quote is a sentence of its document.
// Fictional only.
// Usage: node scripts/sample-deal-docs/venture_docs.cjs [--no-pdf] [--check]
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const V = j(R + "/lib/sampleVentures.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");
const { tiersLabel } = j(R + "/lib/dealDocApply.js");
const VD = j(R + "/lib/sampleVentureData.js");
const dir = path.join(R, "docs", "sample-deal-docs", "ventures");
const AS_OF = V.SAMPLE_VENTURE_AS_OF;

const v = V.buildSampleVentures({ baseInputs: DEFAULT_INPUTS, todayISO: AS_OF });
const inp = (id) => v.deals.find((d) => d.id === id).inputs;
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const usd = (x) => `$${Math.round(Number(x)).toLocaleString("en-US")}`;
const num = (x) => Math.round(Number(x)).toLocaleString("en-US");
const where = (a) => `${a.address}, ${a.city}, ${a.state}`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const css = `body{font:11.5px/1.55 Georgia,serif;color:#111}h1{font-size:17px;text-align:center;margin:0 0 4px}h2{font-size:12.5px;margin:16px 0 4px}p{margin:4px 0}
.banner{font:bold 11px Arial;color:#b42318;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:14px}.c{text-align:center}.muted{color:#555;font-size:10.5px}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left;font-size:11px}th{background:#f3f3f3}`;
const page = (heading, sub, body) => `<html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL DOCUMENT</div>
<h1>${heading.toUpperCase()}</h1><p class="c muted">${sub}</p>${body}<p class="muted" style="margin-top:22px">This document is fictional and was created for software testing.</p></body></html>`;
const SAMPLE = { made_with: "Sample (fictional)", validated: false };

// sections: [[heading, [[key, value, sentence] | sentence]]]: numbered
// sentences under their heading; a keyed one is an abstract field quoted
// from its sentence.
const docs = [];
function numbered(sections) {
  const fields = [], quotes = {};
  let body = "";
  sections.forEach(([h, rows], si) => {
    body += `<h2>${si + 1}. ${h}</h2>`;
    rows.forEach((r, ri) => {
      const [key, value, sentence] = Array.isArray(r) ? r : [null, null, r];
      body += `<p>${si + 1}.${ri + 1} ${sentence}</p>`;
      if (key) { fields.push({ key, value, status: "found", clause: `${si + 1}.${ri + 1}`, evidence: [{ quote: sentence, page: 1 }] }); quotes[key] = sentence; }
    });
  });
  return { body, fields, quotes };
}
// A document with abstract fields (library and sale documents).
function doc({ name, list, type, dealId = null, fund = null, heading, sub, title, sections, docType = type, extra = {} }) {
  const n = numbered(sections), a = dealId ? inp(dealId) : null;
  docs.push({ name, list, type, dealId, asset: a?.propertyName ?? null, fund, title, html: page(heading, sub, n.body), extra,
    abstract: { doc_type: docType, title, ...(a ? { asset: a.propertyName } : { fund }), summary: sub, fields: n.fields, critical_dates: [], app: { ...SAMPLE, files: [`${name}.pdf`] } } });
}

// ── The joint venture agreement and the separate account agreement ──
const SPONSOR = "Example Sponsor LLC";
for (const [name, type] of [[V.SAMPLE_JV_NAME, "jva"], [V.SAMPLE_SMA_NAME, "sma"]]) {
  const t = v.funds[name], jv = type === "jva";
  const investor = jv ? t.partnerName : t.clientName, inv = jv ? "Investor Member" : "Client", sp = jv ? "Sponsor Member" : "Manager";
  const first = t.tiers[0], last = t.tiers.at(-1);
  const feeSentence = `The ${sp} is paid an asset management fee of ${t.mgmtFeePct}% per year of invested equity.`;
  doc({ name: `${slug(name)}-${type}`, list: "library", type, fund: name, heading: jv ? "Limited Liability Company Agreement" : "Investment Management Agreement", sub: `${name} · ${jv ? "Joint venture" : "Separate account"} · effective ${long(t.finalClose)}`, title: `${name} ${jv ? "JVA" : "SMA"} (excerpt)`,
    sections: [
      ["Parties", [
        ["fund_name", name, jv ? `This Agreement governs ${name}, a joint venture between the ${inv} and the ${sp}.` : `This Agreement establishes ${name}, a separate account managed for the ${inv} by the ${sp}.`],
        [jv ? "partner_name" : "client_name", investor, `The ${inv} is ${investor}.`],
        `The ${sp} is ${SPONSOR}, which manages the investments.`,
      ]],
      ["Capital", [
        ["commitments", usd(t.targetEquity), `Total equity commitments are ${usd(t.targetEquity)}.`],
        ["gp_commit_pct", `${t.gpCommitPct}%`, `The ${sp} commits ${t.gpCommitPct}% of the total equity and the ${inv} the balance.`],
      ]],
      ["Fees", [
        ["mgmt_fee_pct", `${t.mgmtFeePct}%`, feeSentence],
        ["mgmt_fee_basis", "Invested equity", feeSentence],
        ["am_fee_paid_to", `The ${sp} (the sponsor)`, `The asset management fee is paid to the ${sp}, the sponsor.`],
        ["pm_fee_paid_to", `The ${sp} (the sponsor)`, `Property management is carried out by the ${sp}, the sponsor, for a fee of ${inp(jv ? "sample-jv-2" : "sample-sma-1").managementFeePct}% of each property's revenue.`],
        ["cm_fee_paid_to", `The ${sp} (the sponsor)`, `Construction management is carried out by the ${sp}, the sponsor, for a fee of ${inp(jv ? "sample-jv-2" : "sample-sma-1").cmFeePct}% of construction spending.`],
      ]],
      ["Distributions", [
        ["pref_pct", `${t.prefPct}%`, `Distributions are made first to the parties in proportion to their capital until each has received a preferred return of ${t.prefPct}% per year and the return of its capital.`],
        ["catch_up_pct", `${t.catchUpGpPct}%`, `There is no catch-up to the ${sp}: the catch-up is ${t.catchUpGpPct}%.`],
        ["promote", tiersLabel(t.tiers), `Distributions are then split ${first.lpSplit}% to the capital and ${first.gpSplit}% to the ${sp} as promote until the ${inv} has achieved a ${first.irrThreshold}% IRR, and thereafter ${last.lpSplit}% and ${last.gpSplit}%.`],
        ["tier_method", "Marginal", "Each split applies only to the distributions made within its tier, and no split applies retroactively to distributions already made."],
      ]],
      ["Term", [
        ["investment_period_years", `${t.investmentPeriodYears} years`, `The investment period is ${t.investmentPeriodYears} years from ${long(t.finalClose)}.`],
        ["term_years", `${t.termYears} years`, `The term is ${t.termYears} years from ${long(t.finalClose)}.`],
        ["extension_count", `${t.extensionCount}`, `The term may be extended ${t.extensionCount} times with the ${inv}'s consent.`],
        ["extension_years", `${t.extensionYears} year`, `Each extension is for ${t.extensionYears} year.`],
      ]],
    ] });
}

// ── The outside GP partners' agreements ──
const words = { 25: "twenty-five percent (25%)", 50: "fifty percent (50%)" };
for (const a of v.gp.agreements.filter((x) => V.SAMPLE_VENTURE_NAMES.includes(x.portfolio))) {
  const partner = v.gp.partners.find((p) => p.id === a.partnerId).name, jv = a.portfolio === V.SAMPLE_JV_NAME;
  const q = {
    partner_name: `This GP Co-Investment Agreement is entered into as of ${long(a.effective)} between ${SPONSOR} (the "Sponsor") and ${partner} (the "Partner").`,
    scope: `This Agreement governs the Sponsor's co-investment in ${a.portfolio} and every investment it makes.`,
    capital_pct: `The Partner shall fund ${words[a.capitalPct]} of the Sponsor's capital commitment to ${a.portfolio}, and the Sponsor shall fund the balance.`,
    promote_pct_of_gp_side: `The Partner shall be entitled to ${words[a.gpSideSharePct]} of the promote distributed to the Sponsor by ${a.portfolio}.`,
    fees: "The Partner shall not be entitled to any fee. All asset management, property management, construction management and other fees are payable to the Sponsor.",
    effective_date: `This Agreement is effective as of ${long(a.effective)}.`,
  };
  const name = `gp-co-investment-agreement-${slug(partner)}`;
  const body = `<p>${q.partner_name}</p><h2>1. Scope</h2><p>1.1 ${q.scope}</p><h2>2. Capital</h2><p>2.1 ${q.capital_pct}</p><p>2.2 The Partner funds its share at the same time as the Sponsor funds its own.</p>
<h2>3. Promote</h2><p>3.1 ${q.promote_pct_of_gp_side}</p><p>3.2 The Sponsor retains the balance of the promote.</p><h2>4. Fees</h2><p>4.1 ${q.fees}</p><h2>5. Term</h2><p>5.1 ${q.effective_date} It continues until ${a.portfolio} is wound up.</p>`;
  docs.push({ name, list: "gp", type: "gp_agreement", dealId: null, asset: null, fund: a.portfolio, title: `GP Co-Investment Agreement (${partner})`, html: page("GP Co-Investment Agreement", `${a.portfolio} · ${jv ? "Joint venture" : "Separate account"}`, body), extra: { partner, portfolio: a.portfolio },
    abstract: { doc_type: "gp_agreement", title: "GP Co-Investment Agreement", partner_name: partner, portfolio: a.portfolio, deal: null, capital_pct: a.capitalPct, promote_pct_of_gp_side: a.gpSideSharePct, fees: "None", effective_date: a.effective,
      quotes: { partner_name: `${q.partner_name} (p.1)`, scope: `${q.scope} (§1.1)`, capital_pct: `${q.capital_pct} (§2.1)`, promote_pct_of_gp_side: `${q.promote_pct_of_gp_side} (§3.1)`, fees: `${q.fees} (§4.1)`, effective_date: `${q.effective_date} (§5.1)` } } });
}

// ── The sold asset: closing statement, post-closing true-up, distribution notice ──
{
  const id = "sample-jv-1", G = inp(id), sale = (G.dispositions ?? []).find((s) => s.stage === "closed"), c = sale.closing, p = slug(G.propertyName);
  const buyer = "Example Logistics REIT", owner = `${G.propertyName} Owner LLC`, extra = { saleId: sale.id };
  const sub = (s) => `${G.propertyName} · ${s}`;
  doc({ name: `${p}-closing-disp`, list: "disposition", type: "closing_disp", dealId: id, extra, heading: "Seller's Closing Statement", sub: sub(`Sale closed ${long(c.date)}`), title: `${G.propertyName} closing statement (sale)`,
    sections: [
      ["Sale", [
        ["closing_date", long(c.date), `The sale of ${G.propertyName}, ${where(G)}, by ${owner} to ${buyer} closed on ${long(c.date)}.`],
        ["sale_price", usd(c.price), `The sale price is ${usd(c.price)}.`],
      ]],
      ["Charges to seller", [
        ["selling_costs", usd(c.costs), `Selling costs (the broker's commission to ${sale.brokerChosen}, title, transfer tax and legal fees) total ${usd(c.costs)}.`],
        ["loan_payoff", usd(c.loanPayoff), `The payoff of the seller's loan is ${usd(c.loanPayoff)}.`],
      ]],
      ["Net to seller", [
        ["net_proceeds", usd(c.net), `Net proceeds to the seller are ${usd(c.net)}.`],
      ]],
    ] });
  const trueUp = addDays(c.date, 90);
  doc({ name: `${p}-post-closing-true-up`, list: "disposition", type: "post_closing", docType: "disposition_post_closing", dealId: id, extra, heading: "Post-Closing True-Up", sub: sub(`As of ${long(trueUp)}`), title: `${G.propertyName} post-closing true-up`,
    sections: [
      ["The sale", [
        ["closing_date", long(c.date), `This statement settles the prorations of the sale of ${G.propertyName} that closed on ${long(c.date)}.`],
        ["sale_price", usd(c.price), `The sale price was ${usd(c.price)}.`],
      ]],
      ["True-up", [
        ["true_up_date", long(trueUp), `Rents, operating expense recoveries and real estate taxes have been reprorated as of ${long(trueUp)}.`],
        ["amount_due", "$0", "No further payment is due from either party: the amount due is $0."],
        ["holdback", "None", "No funds were held back at closing. The holdback is: None."],
      ]],
    ] });
  // 1.1.28 (user, 11/28): the proceeds are distributed to the capital partners per the waterfall.
  const t = v.funds[G.fundName], sd = VD.sampleSaleDistribution(G.fundName, v.deals, t, { todayISO: AS_OF }), paid = sd.paidDate;
  if (Math.abs(sd.amount - c.net) > 0.01 || Math.abs(sd.lp + sd.gp - sd.amount) > 0.02) throw new Error("the sale's distribution is not its net proceeds");
  const promote = sd.gp - sd.amount * (t.gpCommitPct / 100);
  doc({ name: `${p}-distribution-notice`, list: "disposition", type: "distribution_notice", docType: "disposition_distribution_notice", dealId: id, extra, heading: "Distribution Notice", sub: `${G.fundName} · ${long(paid)}`, title: `${G.fundName} distribution notice (${G.propertyName} sale)`,
    sections: [
      ["Distribution", [
        ["distribution_date", long(paid), `${G.fundName} will make a distribution on ${long(paid)}.`],
        ["amount", usd(c.net), `The amount distributed is ${usd(c.net)}.`],
        ["source", `Sale of ${G.propertyName}`, `The distribution is the net proceeds of the sale of ${G.propertyName}, which closed on ${long(c.date)}.`],
      ]],
      ["Allocation", [
        ["recipient", t.partnerName, `The distribution is allocated between ${t.partnerName} and the Sponsor Member under the distribution provisions of the joint venture agreement.`],
        ["to_partner", usd(sd.lp), `${t.partnerName} receives ${usd(sd.lp)}.`],
        ["to_sponsor", usd(sd.gp), `The Sponsor Member receives ${usd(sd.gp)}.`],
        ["promote", usd(promote), promote > 0.5 ? `The Sponsor Member's amount includes promote of ${usd(promote)}.` : `No promote is paid on this distribution: the members have not yet received the return of their capital and the preferred return. The promote is ${usd(promote)}.`],
      ]],
    ] });
}

// ── Phase I and Phase II reports (the asset whose Phase I recognized a condition) ──
{
  const id = V.SAMPLE_PHASE2_DEAL, F = inp(id), s = F.site, p = slug(F.propertyName), owner = `${F.propertyName} Owner LLC`, by = "Fictional Environmental Services, LLC";
  const fact = (kind, heading, date, sections, site) => {
    const n = numbered(sections);
    docs.push({ name: `${p}-${kind}`, list: "fact", type: kind, dealId: id, asset: F.propertyName, fund: null, title: `${F.propertyName} ${heading}`, html: page(heading, `${F.propertyName} · ${long(date)}`, `<p>Prepared for ${owner} by ${by}.</p>${n.body}`), extra: {},
      abstract: { doc_type: kind, title: `${F.propertyName} ${kind === "phase1" ? "Phase I" : "Phase II"} environmental report`, asset: F.propertyName, report_date: date, prepared_by: by, site, quotes: n.quotes, app: SAMPLE } });
  };
  fact("phase1", "Phase I Environmental Site Assessment", s.phase1Date, [
    ["Property", [`${where(F)}.`]],
    ["Scope", [["phase1Date", s.phase1Date, `This Phase I Environmental Site Assessment was completed on ${long(s.phase1Date)} in accordance with ASTM E1527-21.`]]],
    ["Findings", [["phase1Result", s.phase1Result, "This assessment has revealed a recognized environmental condition in connection with the property: a former dry cleaner operated on the adjoining parcel to the north."]]],
    ["Recommendation", ["A limited Phase II subsurface investigation along the northern boundary is recommended."]],
  ], { phase1Date: s.phase1Date, phase1Result: s.phase1Result });
  fact("phase2", "Phase II Environmental Site Assessment", s.phase2Date, [
    ["Property", [`${where(F)}.`]],
    ["Scope", [["phase2Date", s.phase2Date, `This Phase II Environmental Site Assessment was completed on ${long(s.phase2Date)}. Soil and groundwater were sampled at six borings along the northern boundary.`]]],
    ["Findings", [["phase2Result", s.phase2Result, "No chlorinated solvents or other contaminants were detected above the applicable screening levels in any sample."]]],
    ["Conclusion", ["No further investigation or remediation is recommended."]],
  ], { phase2Date: s.phase2Date, phase2Result: s.phase2Result });
}

// ── The year-end 2025 appraisal behind each asset's mark ──
for (const d of v.deals) {
  const q = "2025-12-31", m = v.valuations[d.id]?.[q], a = d.inputs;
  if (!m || m.source !== "appraisal") throw new Error(`${a.propertyName}: no appraised mark at ${q}`);
  const report = addDays(q, 22);
  doc({ name: `${slug(a.propertyName)}-appraisal-2025q4`, list: "library", type: "appraisal", dealId: d.id, heading: "Appraisal Report", sub: `${a.propertyName} · As of ${long(q)}`, title: `${a.propertyName} appraisal ${long(q)}`,
    sections: [
      ["Assignment", [
        ["appraiser", m.appraiser, `This appraisal of ${a.propertyName}, ${where(a)}, was prepared by ${m.appraiser}.`],
        ["effective_date", long(q), `The effective date of value is ${long(q)}.`],
        ["report_date", long(report), `The date of this report is ${long(report)}.`],
        ["interest", "Leased fee", "The interest appraised is the leased fee interest."],
      ]],
      ["Value", [
        ["value", usd(m.value), `The market value of the property, as is, is ${usd(m.value)}.`],
        ["approaches", "Income capitalization and sales comparison", `The income capitalization and sales comparison approaches were used for the ${num(a.squareFootage)} square feet in ${a.unitCount} units.`],
      ]],
    ] });
}

(async () => {
  const noPdf = process.argv.includes("--no-pdf"), check = process.argv.includes("--check");
  const index = docs.map((d) => ({ name: d.name, list: d.list, type: d.type, asset: d.asset, fund: d.fund, dealId: d.dealId, file: `${d.name}.pdf`, title: d.title, ...d.extra }));
  if (check) {
    const stale = docs.filter((d) => { const p = path.join(dir, "html", `${d.name}.html`); return !fs.existsSync(p) || fs.readFileSync(p, "utf8") !== d.html; }).map((d) => d.name);
    const idx = fs.existsSync(path.join(dir, "index.json")) ? fs.readFileSync(path.join(dir, "index.json"), "utf8") : "";
    if (stale.length || idx !== JSON.stringify(index, null, 1)) { console.error(`docs/sample-deal-docs/ventures is stale (${stale.join(", ") || "index"}): run node scripts/sample-deal-docs/venture_docs.cjs`); process.exit(1); }
    console.log(`${docs.length} documents are current`); return;
  }
  for (const d of docs) {
    for (const fl of d.abstract.fields ?? []) for (const e of fl.evidence) if (!d.html.includes(e.quote)) throw new Error(`${d.name}: the quote for ${fl.key} is not in the document`);
    for (const [k, q] of Object.entries(d.abstract.quotes ?? {})) if (!d.html.includes(String(q).replace(/ \((p\.\d+|§[\d.]+)\)$/, ""))) throw new Error(`${d.name}: the quote for ${k} is not in the document`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  fs.mkdirSync(path.join(dir, "abstracts"), { recursive: true });
  let b = null, p = null;
  if (!noPdf) { const { chromium } = require("playwright"); b = await chromium.launch(); p = await b.newPage(); }
  for (const d of docs) {
    const hp = path.join(dir, "html", `${d.name}.html`);
    fs.writeFileSync(hp, d.html);
    fs.writeFileSync(path.join(dir, "abstracts", `${d.name}.json`), JSON.stringify(d.abstract, null, 1));
    if (p) {
      await p.goto("file://" + hp);
      await p.pdf({ path: path.join(dir, `${d.name}.pdf`), format: "Letter", printBackground: true, displayHeaderFooter: true,
        headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
        footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document</div>',
        margin: { top: "0.8in", bottom: "0.8in", left: "0.9in", right: "0.9in" } });
    }
  }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index, null, 1));
  console.log(`${docs.length} documents: ${[...new Set(docs.map((d) => d.list))].map((l) => `${docs.filter((d) => d.list === l).length} ${l}`).join(", ")}`);
  if (b) await b.close();
})();
