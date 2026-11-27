// Writes lib/sampleDocTerms.json: what the sample documents add to Model
// Fund I in the app (the terms the app did not already hold: contract dates
// and deposits, the loan's lender terms, the executed caps, the IC approval
// and its conditions, closing-statement actuals, the LPA's investment limits,
// and the appraisals behind the marks). lib/sampleFund.js applies it, so the
// app holds exactly what the documents say.
//
// It is produced by reading every Model Fund I abstract into the fund with
// the app's own apply functions (lib/dealDocApply.js), as a user would by
// clicking Apply on each document. It refuses to write when a document
// disagrees with a figure the app already holds, or when applying a document
// moves an asset's loan, equity or returns: fix the generator instead.
//   node scripts/sample-deal-docs/make_terms.cjs          writes the file
//   node scripts/sample-deal-docs/make_terms.cjs --check  exits 1 if it is stale
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const DA = j(R + "/lib/dealDocApply.js");
const { underwrite } = j(R + "/lib/calculations.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");

const AS_OF = "2026-11-27";
// The order a deal's documents arrive in.
const ORDER = ["om", "loi", "psa", "closing_acq", "loan", "rate_cap", "ic_memo", "t12", "lpa", "ppm"];
const docDir = path.join(R, "docs", "sample-deal-docs", "deals", "abstracts");
const PREFIX = { "airport-flex": "Airport Flex Park", route9: "Route 9 Small Bay", "harbor-light": "Harbor Light Industrial", "mill-creek": "Mill Creek Business Park", lakeshore: "Lakeshore Service Center", "model-fund-i": "" };
const assetOf = (name) => { const k = Object.keys(PREFIX).find((p) => name.startsWith(p + "-")); return k === undefined ? null : PREFIX[k]; };
const figures = (inputs) => { const r = underwrite(inputs); return JSON.stringify([r.returns.irr, r.returns.equityMultiple, r.debt.loanAmount, r.debt.equityRequired, r.annualCashFlows.map((c) => Math.round(c.pretaxCashFlow))]); };
const baseTerms = () => ({ ...DEFAULT_FUND_TERMS, ...SP.SAMPLE_FUND_FEE_TERMS, name: SP.SAMPLE_FUND_NAME, targetEquity: SP.SAMPLE_FUND_COMMITMENTS });
// Leaf-level differences between two plain objects: [[path, value], …]. Arrays are one value.
function leaves(before, after, at = []) {
  const out = [];
  for (const k of Object.keys(after ?? {})) {
    const a = before?.[k], b = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (b && typeof b === "object" && !Array.isArray(b) && (a == null || (typeof a === "object" && !Array.isArray(a)))) out.push(...leaves(a ?? {}, b, [...at, k]));
    else out.push([[...at, k].join("."), b]);
  }
  return out;
}

function computeTerms() {
  const base = buildSampleFund({ todayISO: AS_OF, docTerms: false });
  const problems = [];
  let terms = baseTerms();
  const deals = Object.fromEntries(base.deals.map((d) => [d.id, d.inputs]));
  const names = fs.readdirSync(docDir).map((f) => f.replace(/\.json$/, "")).filter((n) => assetOf(n) !== null).sort();
  const docs = names.map((name) => ({ name, id: `sample:${name}`, abstract: JSON.parse(fs.readFileSync(path.join(docDir, `${name}.json`), "utf8")) })).map((d) => ({ ...d, doc_type: d.abstract.doc_type, title: d.abstract.title }));
  const marks = {};
  for (const doc of docs.filter((d) => ORDER.includes(d.doc_type)).sort((a, b) => ORDER.indexOf(a.doc_type) - ORDER.indexOf(b.doc_type))) {
    const asset = assetOf(doc.name);
    const deal = asset ? base.deals.find((d) => d.inputs.propertyName === asset) : null;
    const inputs = deal ? deals[deal.id] : {};
    const rows = DA.compareDoc(doc, { inputs, terms });
    for (const r of rows.filter((x) => x.differs && !(x.appValue == null || x.appValue === "" || x.appValue === "modeled"))) problems.push(`${doc.name}: "${r.label}" is ${JSON.stringify(r.appValue)} in the app but ${JSON.stringify(r.docValue)} in the document`);
    const a = DA.applyDoc(doc, rows.filter((x) => x.differs).map((x) => x.key), { inputs, terms });
    if (deal) {
      if (figures(inputs) !== figures(a.inputs)) problems.push(`${doc.name}: applying it changes the asset's loan, equity or returns`);
      deals[deal.id] = a.inputs;
    }
    terms = a.terms;
  }
  for (const doc of docs.filter((d) => d.doc_type === "appraisal")) {
    const deal = base.deals.find((d) => d.inputs.propertyName === assetOf(doc.name));
    const cur = base.valuations[deal.id] ?? {};
    const am = DA.appraisalMark(doc, deal.inputs, cur, underwrite(deal.inputs));
    const was = cur[am.quarter];
    if (!was || Math.abs(was.value - am.mark.value) > 0.5 || Math.abs(Number(was.capRate) - Number(am.mark.capRate)) > 0.005) problems.push(`${doc.name}: the appraisal (${am.mark.value} at ${am.mark.capRate}%) is not the app's ${am.quarter} mark (${was?.value} at ${was?.capRate}%)`);
    (marks[deal.id] ??= {})[am.quarter] = { source: "appraisal", appraiser: am.mark.appraiser, notes: am.mark.notes.replace(/, p\. \d+$/, "") };
  }
  // Document ids are database ids, set when the documents are uploaded; they are not part of the sample data.
  const noIds = (ls) => ls.filter(([p]) => !/(^|\.)docId$/.test(p)).map(([p, v]) => [p, Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== "docId")) : x)) : v]);
  const out = { asOf: AS_OF, deals: {}, fund: noIds(leaves(baseTerms(), terms)), marks };
  for (const d of base.deals) { const l = noIds(leaves(d.inputs, deals[d.id])); if (l.length) out.deals[d.id] = l; }
  return { out, problems };
}

if (require.main === module) {
  const { out, problems } = computeTerms();
  if (problems.length) { console.error("The sample documents do not tie to Model Fund I:\n  " + problems.join("\n  ")); process.exit(1); }
  const text = JSON.stringify(out, null, 1) + "\n";
  const file = path.join(R, "lib", "sampleDocTerms.json");
  if (process.argv.includes("--check")) {
    if ((fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "") !== text) { console.error("lib/sampleDocTerms.json is stale: run node scripts/sample-deal-docs/make_terms.cjs"); process.exit(1); }
    console.log("lib/sampleDocTerms.json is current");
  } else { fs.writeFileSync(file, text); console.log("wrote lib/sampleDocTerms.json:", Object.entries(out.deals).map(([k, v]) => `${k} ${v.length}`).join(", "), "| fund", out.fund.length, "| marks", Object.keys(out.marks).length); }
}
module.exports = { computeTerms, assetOf, ORDER, AS_OF };
