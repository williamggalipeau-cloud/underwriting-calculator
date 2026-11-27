// Model Fund I, built in one place (1.1.13, user 11/27: everything ties out).
// app/page.jsx "Load Model Fund I" and the tests (the tie-out test, the
// document generators' export) all call buildSampleFund, so the sample fund
// in a test is the fund the app loads.
//
// Returns { deals, credit, market, valuations, termsPatch }:
//   deals       the nine sample assets with business plans, leasing, tenant
//               credit, submarket tags, construction data and the terms that
//               exist only in the sample documents (lib/sampleDocTerms.js);
//   credit      addSampleCredit's result (delinquency for the fund);
//   market      the sample submarket data; valuations: the sample marks;
//   termsPatch  what the sample documents add to Model Fund I's terms (the
//               LPA limits, legal entities).
import { withSampleAssetFacts, withSampleSnda } from "@/lib/sampleAssetFacts";
import { withSampleResearch, withSampleResearchExtra } from "@/lib/sampleResearch";
import { withSamplePropertyMgmt } from "@/lib/samplePropertyMgmt";
import { buildSampleDeals, SAMPLE_FUND_NAME } from "@/lib/samplePortfolio";
import { DEFAULT_INPUTS } from "@/lib/defaultInputs";
import { addSamplePlans } from "@/lib/samplePlans";
import { addSampleLeasing, withSampleDocProspect } from "@/lib/sampleLeasing";
import { addSampleCredit } from "@/lib/sampleCredit";
import { addSampleMarketAndMarks } from "@/lib/sampleMarket";
import { importConstruction, parseInvoices, parseJobs } from "@/lib/construction";
import { SAMPLE_CONSTRUCTION_AS_OF, SAMPLE_CONSTRUCTION_INVOICES_CSV, SAMPLE_CONSTRUCTION_JOBS_CSV } from "@/lib/sampleConstruction";
import { parseCSV } from "@/lib/fundTerms";
import { withSampleLeaseSteps } from "@/lib/sampleLeaseSteps";
import { applySampleDocMarks, applySampleDocTerms, sampleFundTermsPatch, withSampleSaleComps } from "@/lib/sampleDocTerms";

export function buildSampleFund({ todayISO = new Date().toISOString().slice(0, 10), funds = {}, market = undefined, valuations = {}, docTerms = true } = {}) {
  let built = buildSampleDeals(DEFAULT_INPUTS);
  // 1.1.21: the rent steps of each sample lease, on its tenant's unit (first,
  // so the plans, marks and everything else are built on the same cash flow).
  built = built.map((d) => ({ ...d, inputs: withSampleLeaseSteps(d.inputs, d.id) }));
  // 1.1.4: sample business plans and actuals, and the sample leasing pipeline.
  const plans = addSamplePlans(built, { todayISO });
  built = built.map((d) => (plans.updates[d.id] ? { ...d, inputs: { ...d.inputs, businessPlan: plans.updates[d.id] } } : d));
  const leasing = addSampleLeasing(built, { todayISO });
  built = built.map((d) => (leasing.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...leasing.updates[d.id] } } : d));
  // 1.1.23: one prospect with fixed terms, for the sample leasing documents.
  built = built.map((d) => ({ ...d, inputs: withSampleDocProspect(d.inputs, d.id) }));
  // 1.1.8: sample tenant credit and a sample aged receivables report on the fund.
  const credit = addSampleCredit(built, { todayISO, funds, fundName: SAMPLE_FUND_NAME });
  built = built.map((d) => (credit.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...credit.updates[d.id] } } : d));
  // 1.1.5: sample submarkets (each asset tagged) and marks.
  const mkt = addSampleMarketAndMarks({ market, valuations, deals: built, todayISO });
  built = built.map((d) => (mkt.tags[d.id] ? { ...d, inputs: { ...d.inputs, submarketId: mkt.tags[d.id] } } : d));
  // 1.1.6: construction test data (TI and capital jobs with invoices).
  const cons = importConstruction(built, { jobs: parseJobs(parseCSV(SAMPLE_CONSTRUCTION_JOBS_CSV)), invoices: parseInvoices(parseCSV(SAMPLE_CONSTRUCTION_INVOICES_CSV)), asOf: SAMPLE_CONSTRUCTION_AS_OF, source: "sample" });
  built = built.map((d) => (cons.updates[d.id] ? { ...d, inputs: { ...d.inputs, construction: cons.updates[d.id] } } : d));
  // 1.1.17: fictional building and site facts on every asset, and SNDA
  // statuses on the two assets with a sample loan agreement.
  built = built.map((d) => ({ ...d, inputs: withSampleSnda(withSampleAssetFacts(d.inputs, d.id), d.id) }));
  // 1.1.21: Property Management rows (taxes, insurance, condition findings,
  // service contracts), from each asset's budget and facts.
  built = built.map((d) => ({ ...d, inputs: withSamplePropertyMgmt(d.inputs, d.id) }));
  // 1.1.21: third-party research (a market report and a rent survey), from the submarket data and rent comps above.
  built = built.map((d) => ({ ...d, inputs: withSampleResearch(d.inputs, d.id, mkt.market) }));
  // 1.1.13: the terms that exist only in the sample documents (lender,
  // covenants, executed caps, contract dates, the IC approval, sales and
  // their offers, property managers…), so the app holds what the documents say.
  if (docTerms) built = built.map((d) => ({ ...d, inputs: withSampleSaleComps(applySampleDocTerms(d.inputs, d.id)) })); // 1.1.16: each sample sale's comps start from the asset's own
  // 1.1.23: research items of the remaining types (appraisal, environmental, property condition, credit, zoning, broker opinion), from what the asset holds.
  const marksNow = docTerms ? applySampleDocMarks(mkt.valuations) : mkt.valuations;
  built = built.map((d) => ({ ...d, inputs: withSampleResearchExtra(d.inputs, d.id, { valuations: marksNow }) }));
  // 1.1.13: fictional property managers. All at this firm, because Model Fund
  // I's terms pay the property management fee to the sponsor.
  built = built.map((d, i) => ({ ...d, inputs: { ...d.inputs, ...samplePropertyManager(i) } }));
  return { deals: built, credit, market: mkt.market, valuations: docTerms ? applySampleDocMarks(mkt.valuations) : mkt.valuations, termsPatch: docTerms ? { ...sampleFundTermsPatch(), entities: sampleEntities() } : {} };
}

// Fictional property managers for the sample assets, by position.
export const samplePropertyManager = (i) => ({ propertyManager: ["Jamie Rivera", "Taylor Kim", "Robin Castillo"][i % 3], propertyManagementFirm: { type: "sponsor", name: "" } });

// Model Fund I's legal entities (Portfolio Summary → legal entities and the
// ownership chart). The names are the ones the sample documents use: the
// LPA's fund, the GP in the GP partner agreements, and each lease's landlord
// (the property company that owns the asset). Fictional.
const PROPERTY_COMPANIES = ["Runway Vista", "Valley Freight", "Pier Junction", "Ridgeway Commerce", "Canal Street", "Mill Creek", "Southpoint", "Granite Avenue", "Lakeshore Service"];
export const SAMPLE_FUND_ENTITY = "Model Fund I, L.P.";
export const SAMPLE_GP_ENTITY = "Example Fund GP LLC";
export const samplePropertyCompany = (i) => `Model Fund I \u2014 ${PROPERTY_COMPANIES[i]} LLC`;
export function sampleEntities() {
  const base = { state: "DE", formed: "2025-09-15", einLast4: "", agent: "Fictional Registered Agents Inc.", annualReportDue: "2027-06-01", dealId: null, parentId: null };
  return [
    { ...base, id: "sample-ent-fund", name: SAMPLE_FUND_ENTITY, role: "fund" },
    { ...base, id: "sample-ent-gp", name: SAMPLE_GP_ENTITY, role: "gp", formed: "2025-09-01" },
    ...PROPERTY_COMPANIES.map((_, i) => ({ ...base, id: `sample-ent-asset-${i + 1}`, name: samplePropertyCompany(i), role: "asset", formed: "2025-12-01", dealId: `sample-deal-${i + 1}`, parentId: "sample-ent-fund" })),
  ];
}
