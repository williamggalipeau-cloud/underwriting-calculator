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
import { buildSampleDeals, SAMPLE_FUND_NAME } from "@/lib/samplePortfolio";
import { DEFAULT_INPUTS } from "@/lib/defaultInputs";
import { addSamplePlans } from "@/lib/samplePlans";
import { addSampleLeasing } from "@/lib/sampleLeasing";
import { addSampleCredit } from "@/lib/sampleCredit";
import { addSampleMarketAndMarks } from "@/lib/sampleMarket";
import { importConstruction, parseInvoices, parseJobs } from "@/lib/construction";
import { SAMPLE_CONSTRUCTION_AS_OF, SAMPLE_CONSTRUCTION_INVOICES_CSV, SAMPLE_CONSTRUCTION_JOBS_CSV } from "@/lib/sampleConstruction";
import { parseCSV } from "@/lib/fundTerms";
import { applySampleDocMarks, applySampleDocTerms, sampleFundTermsPatch } from "@/lib/sampleDocTerms";

export function buildSampleFund({ todayISO = new Date().toISOString().slice(0, 10), funds = {}, market = undefined, valuations = {}, docTerms = true } = {}) {
  let built = buildSampleDeals(DEFAULT_INPUTS);
  // 1.1.4: sample business plans and actuals, and the sample leasing pipeline.
  const plans = addSamplePlans(built, { todayISO });
  built = built.map((d) => (plans.updates[d.id] ? { ...d, inputs: { ...d.inputs, businessPlan: plans.updates[d.id] } } : d));
  const leasing = addSampleLeasing(built, { todayISO });
  built = built.map((d) => (leasing.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...leasing.updates[d.id] } } : d));
  // 1.1.8: sample tenant credit and a sample aged receivables report on the fund.
  const credit = addSampleCredit(built, { todayISO, funds, fundName: SAMPLE_FUND_NAME });
  built = built.map((d) => (credit.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...credit.updates[d.id] } } : d));
  // 1.1.5: sample submarkets (each asset tagged) and marks.
  const mkt = addSampleMarketAndMarks({ market, valuations, deals: built, todayISO });
  built = built.map((d) => (mkt.tags[d.id] ? { ...d, inputs: { ...d.inputs, submarketId: mkt.tags[d.id] } } : d));
  // 1.1.6: construction test data (TI and capital jobs with invoices).
  const cons = importConstruction(built, { jobs: parseJobs(parseCSV(SAMPLE_CONSTRUCTION_JOBS_CSV)), invoices: parseInvoices(parseCSV(SAMPLE_CONSTRUCTION_INVOICES_CSV)), asOf: SAMPLE_CONSTRUCTION_AS_OF, source: "sample" });
  built = built.map((d) => (cons.updates[d.id] ? { ...d, inputs: { ...d.inputs, construction: cons.updates[d.id] } } : d));
  // 1.1.13: the terms that exist only in the sample documents (lender,
  // covenants, executed caps, contract dates, the IC approval, sales and
  // their offers, property managers…), so the app holds what the documents say.
  if (docTerms) built = built.map((d) => ({ ...d, inputs: applySampleDocTerms(d.inputs, d.id) }));
  return { deals: built, credit, market: mkt.market, valuations: docTerms ? applySampleDocMarks(mkt.valuations) : mkt.valuations, termsPatch: docTerms ? sampleFundTermsPatch() : {} };
}
