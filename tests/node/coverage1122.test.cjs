// 1.1.22: sample data coverage (AGENTS.md "Sample data for everything").
// Every tab and every document type the app knows has sample data in Model
// Fund I, so each screen can be tested without typing anything in.
//   - A tab with no data set listed here fails: a new tab ships with its
//     sample data and its line below.
//   - A document type with no sample document fails.
//   - PENDING lists what is still missing and the patch that closes it. A
//     pending entry that now has sample data also fails, so the lists can
//     only shrink.
const path = require("path");
const fs = require("fs");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { TABS } = j(R + "/lib/tabs.js");
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { samplePipelineDeals } = j(R + "/lib/samplePipeline.js");
const { SAMPLE_FUND_FEE_TERMS } = j(R + "/lib/samplePortfolio.js");
const { DOC_TYPES } = j(R + "/lib/dealDocTypes.js");
const { ACQ_TYPES, FILED_ELSEWHERE_TYPES } = j(R + "/lib/acquisitionDocs.js");
const { DISP_DOC_TYPES } = j(R + "/lib/dispositionDocs.js");
const { LEASING_DOC_TYPES } = j(R + "/lib/leasingDocs.js");
const { FACT_DOC_TYPES } = j(R + "/lib/assetFacts.js");
const { RESEARCH_TYPES } = j(R + "/lib/research.js");
const PM = j(R + "/lib/propertyMgmt.js");
const manifest = JSON.parse(fs.readFileSync(R + "/public/sample-docs/manifest.json", "utf8"));

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const T = "2026-11-27";
const f = buildSampleFund({ todayISO: T });
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const SFD = j(R + "/lib/sampleFundData.js");
const { SAMPLE_FUND_NAME, SAMPLE_FUND_COMMITMENTS } = j(R + "/lib/samplePortfolio.js");
const { toQuickInputs } = j(R + "/lib/pipeline.js");
const { QUICK_DEFAULTS, toMainInputs } = j(R + "/lib/quickUnderwrite.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");
// 1.1.26: the sample joint venture and separate account (lib/sampleVentures.js).
const VEN = j(R + "/lib/sampleVentures.js").buildSampleVentures({ baseInputs: DEFAULT_INPUTS });
// 1.1.28: with their remaining tab data (lib/sampleVentureData.js).
const VD = j(R + "/lib/sampleVentureData.js");
const venDeals = VEN.deals.map((d) => ({ ...d, inputs: VD.withSampleVentureData(d.inputs, d.id, { todayISO: "2026-11-27" }) }));
const venAssets = venDeals.map((d) => d.inputs), venHeld = venAssets.filter((a) => !a.realizedSaleDate);
const venFunds = Object.fromEntries(Object.entries(VEN.funds).map(([name, t]) => [name, { ...t, ...VD.sampleVentureFundData(name, venDeals, t, { todayISO: "2026-11-27" }) }]));
const pipeline = samplePipelineDeals(T);
// The sample pipeline deal under contract, screened as Load Model Fund I screens it (app/page.jsx pipelineToDeal).
const pl = pipeline.find((r) => r.id === SFD.SAMPLE_IMPACT_PIPELINE_ID);
const quick = { ...QUICK_DEFAULTS, ...toQuickInputs(pl), acquisitionDate: pl.expectedClose };
const candidate = { id: "pl-sample-1", linked: true, quick, pipelineId: pl.id, inputs: toMainInputs(quick, { ...DEFAULT_INPUTS, propertyName: pl.name, address: pl.address, city: pl.city, state: pl.state, squareFootage: pl.sf, fundName: "", units: [] }) };
const benchmarks = SFD.withSampleBenchmarks(undefined, { todayISO: T });
const terms0 = { ...DEFAULT_FUND_TERMS, ...SAMPLE_FUND_FEE_TERMS, name: SAMPLE_FUND_NAME, targetEquity: SAMPLE_FUND_COMMITMENTS, ...f.termsPatch, delinquency: f.credit.delinquency };
const terms = { ...terms0, ...SFD.sampleFundData(f.deals, terms0, { todayISO: T, valuations: f.valuations, candidates: [candidate], benchmarks }) };
const { withSampleComps } = j(R + "/lib/sampleComps.js");
const deals = f.deals.map((d) => withSampleComps(d, T)), any = (fn) => deals.some((d) => fn(d.inputs)), all = (fn) => deals.every((d) => fn(d.inputs));
const n = (x) => (Array.isArray(x) ? x.length : x && typeof x === "object" ? Object.keys(x).length : 0);
const sales = deals.flatMap((d) => d.inputs.dispositions ?? []);

// ── Tabs: the data sets each one shows ──
// [tab, data set, has sample data?]
const DATA = [
  ["pipeline", "pipeline deals", pipeline.length > 0],
  ["quick", "assets to screen", deals.length > 0],
  ["impact", "saved scenarios", n(terms.impactScenarios) > 0],
  ["research", "rent comps", all((a) => n(a.leasing?.comps) > 0)],
  ["research", "sale comps", any((a) => n(a.salesComps?.comps) > 0)],
  ["research", "third-party research", all((a) => n(a.research) > 0)],
  ["acqdocs", "acquisition documents", manifest.deals.some((d) => ACQ_TYPES.some((t) => t.key === d.docType))],
  ["dispcand", "assets with hold plans", all((a) => Number(a.holdPeriodYears) > 0)],
  ["sellhold", "sell / hold decisions", n(terms.sellHold?.decisions) > 0],
  ["forsale", "sales in progress", sales.length > 0],
  ["offers", "offers", sales.some((s) => n(s.offers) > 0)],
  ["trackrecord", "sold assets", venAssets.some((a) => (a.dispositions ?? []).some((s) => s.stage === "closed" && s.closing?.date))],
  ["dispdocs", "disposition documents", manifest.dispositions.length > 0],
  ["assets", "owned assets", deals.length === 9],
  ["plan", "business plans", all((a) => n(a.businessPlan?.revisions) > 0)],
  ["units", "rent rolls", all((a) => n(a.units) > 0)],
  ["units", "a tenant that moved out with no replacement", venAssets.some((a) => (a.units ?? []).some((u) => u.moveOut?.date))],
  ["assets", "building and site facts on the joint venture's and separate account's assets", venAssets.every((a) => n(a.building) > 0 && n(a.site) > 0)],
  ["plan", "business plans with actuals on the joint venture's and separate account's assets", venAssets.every((a) => n(a.businessPlan?.revisions) > 0 && n(a.businessPlan?.actuals) > 0)],
  ["leasing", "leasing prospects on their held assets", venHeld.length === 3 && venHeld.every((a) => n(a.leasing?.prospects) > 0)],
  ["credit", "tenant credit stories on their held assets", venHeld.every((a) => a.units.some((u) => u.sampleCreditStory))],
  ["credit", "aged receivables on the joint venture and separate account", Object.values(venFunds).every((t) => n(t.delinquency?.months) > 0)],
  ...PM.PM_TAB_IDS.flatMap((tab) => PM.PM_TABS[tab].sections.filter((s) => !["appeals", "claims"].includes(s.key)).map((s) => [tab, `${s.label ?? s.key} on their held assets`, venHeld.every((a) => PM.rowsOf(a, s.key).length > 0)])),
  ["distributions", "distribution proposals on the joint venture and separate account", Object.values(venFunds).every((t) => n(t.distributions?.proposals) > 0)],
  ["units", "leases signed since purchase", venAssets.every((a) => (a.units ?? []).some((u) => n(u.laterLeases) > 0))],
  ["fund", "joint venture and separate account", Object.values(VEN.funds).map((t) => t.type).sort().join() === "Joint Venture,Separate Account"],
  ["gppartners", "outside GP partners of the joint venture and separate account", VEN.gp.agreements.length === 2],
  ["leases", "lease abstracts", manifest.leases.length > 0],
  ["credit", "tenant credit", any((a) => (a.units ?? []).some((u) => n(u.credit?.records ?? u.credit) > 0))],
  ["credit", "tenant credit documents", manifest.credit.some((c) => c.kind === "tenant")],
  ["leasing", "leasing prospects", any((a) => n(a.leasing?.prospects ?? a.leasingProspects) > 0)],
  // An asset is held at cost for its first six months, so only older ones are marked.
  ["valuations", "marks on assets held over six months", deals.filter((d) => d.inputs.acquisitionDate <= "2026-03-31").every((d) => n(f.valuations?.[d.id]) > 0)],
  ["debt", "loans", any((a) => Number(a.ltvPct) > 0)],
  ["cashflow", "cash flows", deals.length > 0],
  ["returns", "returns", deals.length > 0],
  ["sensitivity", "sensitivities", deals.length > 0],
  ...PM.PM_TAB_IDS.flatMap((tab) => PM.PM_TABS[tab].sections.map((s) => [tab, s.label ?? s.key, any((a) => PM.rowsOf(a, s.key).length > 0)])),
  ["fundsummary", "fund terms", Number(terms.mgmtFeePct) > 0],
  ["fund", "capital activity", n(terms.capitalActivity) > 0],
  ["fund", "fund plan versions", n(terms.fundPlan?.versions) > 0],
  ["funddebt", "asset loans", any((a) => Number(a.ltvPct) > 0)],
  ["distributions", "distribution proposals", n(terms.distributions?.proposals) > 0],
  ["stress", "assets to stress", deals.length > 0],
  ["benchmark", "benchmark series", ["index", "vintage", "monthly"].every((k) => n(benchmarks?.[k]) > 0)],
  ["gpecon", "fee terms", Number(terms.mgmtFeePct) > 0],
  ["sponsorecon", "fee terms", Number(terms.mgmtFeePct) > 0],
  ["firmecon", "fee terms", Number(terms.mgmtFeePct) > 0],
  ["gppartners", "GP partner agreements", manifest.gpAgreements.length > 0],
  ["market", "submarket statistics", n(f.market?.stats) > 0],
  ["documents", "library documents", manifest.deals.length > 0],
  ["reports", "issued reports", n(terms.reports?.issued) > 0],
];
// Still missing, with the patch that adds it.
const PENDING_DATA = {};
for (const t of TABS) check(DATA.some(([tab]) => tab === t.id), `tab "${t.label}" (${t.id}) has no sample data set listed in this test`);
for (const [tab, name, has] of DATA) {
  const key = `${tab} / ${name}`, pending = PENDING_DATA[key];
  check(TABS.some((t) => t.id === tab), `${key}: no such tab`);
  if (pending) check(!has, `${key} now has sample data: remove it from PENDING_DATA`);
  else check(has, `${key}: no sample data in Model Fund I`);
}
for (const key of Object.keys(PENDING_DATA)) check(DATA.some(([tab, name]) => `${tab} / ${name}` === key), `PENDING_DATA "${key}" matches no data set`);

// ── Document types: a sample document of each ──
// A property condition report, Phase I report, survey and SNDA filed on another tab count on the acquisition checklist too (lib/acquisitionDocs.js).
const FACT_ACQ = { pcr: "pca", phase1: "phase1_esa", survey: "title_survey", snda: "snda" };
const have = {
  library: new Set([...manifest.deals.map((d) => d.docType), ...manifest.dispositions.map((d) => d.docType).filter((t) => DOC_TYPES.some((x) => x.id === t))]),
  acquisition: new Set([...manifest.deals.map((d) => d.docType), ...(manifest.acquisition ?? []).map((d) => d.type), ...manifest.assetFacts.map((d) => FACT_ACQ[d.kind]).filter((k) => FILED_ELSEWHERE_TYPES.includes(k))]),
  disposition: new Set(manifest.dispositions.map((d) => d.docType)),
  leasing: new Set([...manifest.credit.map((c) => c.type), ...(manifest.leasing ?? []).map((d) => d.type)]),
  fact: new Set(manifest.assetFacts.map((d) => d.kind)),
  research: new Set(manifest.research.map((d) => ({ market_report: "market" }[d.kind] ?? d.kind))),
  "property management": new Set(manifest.propertyMgmt.map((d) => d.section)),
};
const LISTS = {
  library: DOC_TYPES.map((t) => t.id).filter((id) => id !== "other"),
  acquisition: ACQ_TYPES.map((t) => t.key),
  disposition: DISP_DOC_TYPES.map(([k]) => k),
  leasing: LEASING_DOC_TYPES.map(([k]) => k),
  fact: FACT_DOC_TYPES.map(([k]) => k).filter((k) => k !== "snda"),
  research: RESEARCH_TYPES.map(([k]) => k).filter((k) => k !== "other"),
  "property management": PM.PM_TAB_IDS.flatMap((tab) => PM.PM_TABS[tab].sections.map((s) => s.key)),
};
// Still missing, with the patch that adds it.
const PENDING_DOCS = { "library": {}, "acquisition": {}, "disposition": {}, "leasing": {}, "fact": {}, "research": {}, "property management": {} };
for (const [list, ids] of Object.entries(LISTS)) {
  for (const id of ids) {
    const has = have[list].has(id), pending = PENDING_DOCS[list][id];
    if (pending) check(!has, `${list} document type "${id}" now has a sample: remove it from PENDING_DOCS`);
    else check(has, `${list} document type "${id}": no sample document`);
  }
  for (const id of Object.keys(PENDING_DOCS[list])) check(ids.includes(id), `PENDING_DOCS ${list} "${id}" is not a document type`);
}

console.log(`coverage1122: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
