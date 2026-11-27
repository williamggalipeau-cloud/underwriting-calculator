// ─── Sample light-industrial portfolio ───────────────────────────────────────
// Builds a fund of direct-NOI light-industrial deals structured like the
// Quick Underwrite deal (65% LTV floating-rate IO bridge loan at SOFR +
// spread, 3 + 1 + 1 term, rate caps, lender-funded capex, 1.5% AM fee on
// equity, 6% sale costs) so the Portfolio Return tab has something to show.
// All nine have closed: acquisitions run from January to mid-November 2026
// (final close 12/31/2025), so every asset is owned. Every asset is held
// four years, so all exit in 2030, within the fund's five-year term.
// Figures are illustrative, not market data.

import { sampleMediaFor } from "@/lib/sampleMedia";
import { withRiskTestData } from "@/lib/sampleRiskData";
import { withSampleComps } from "@/lib/sampleComps";
import { underwrite } from "@/lib/calculations";
import { QUICK_DEFAULTS, toMainInputs } from "@/lib/quickUnderwrite";
import { withLocation } from "@/lib/assetLocations";
import { toRentRollNOI, withMarkToMarket } from "@/lib/sampleRentRolls";

export const SAMPLE_FUND_NAME = "Model Fund I";
// 1.1.12 (user, 11/27: "doing this manually is NOT an option"): the version of
// the Model Fund I sample material. When an owner opens a firm that has the
// sample fund and an older (or no) sampleDataVersion on its terms, the app
// adds what's missing by itself (app/page.jsx syncSampleData): sample tenant
// credit and aged rent, the sample documents (credit reports included) and
// the sample GP partners. Raise this number whenever a release adds sample
// material, and add the step to syncSampleData.
// Version 3 (1.1.13): the fund and asset documents rewritten from the fund,
// the terms they add (lib/sampleDocTerms.js), property managers and legal
// entities.
// Version 4 (1.1.14): the same steps again, for a firm where version 3 saved
// the fund's terms but not the assets' (see syncSampleData). Every step adds
// only what is missing, so a firm that is already complete changes nothing.
export const SAMPLE_DATA_VERSION = 4;
// Name the sample fund had before it was renamed (for saved workspaces).
export const OLD_SAMPLE_FUND_NAME = "Light Industrial Fund I";
// Total commitments (LP + GP) of the sample fund.
export const SAMPLE_FUND_COMMITMENTS = 100_000_000;
// The sample fund's management fee: 1.5% a year at the fund level, on LP
// commitments through the investment period, then on LP invested capital,
// with two quarters of expenses held as fund cash. feeModel marks workspaces
// already moved off the old asset-level 1.5% asset management fee.
// Lender sizing tests for Model Fund I assets: the loan is the lesser of the
// LTV loan and the loans these allow (see underwrite()).
export const FUND_SIZING_CONSTRAINTS = { minDSCREnabled: true, minDSCR: 1.25, maxLTCEnabled: true, maxLTCPct: 75, minDebtYieldEnabled: true, minDebtYieldPct: 8 };
export const withSizingConstraints = (inputs) => {
  const c = inputs.loanSizingConstraints ?? {};
  return {
    ...inputs,
    loanSizingConstraints: {
      ...c,
      minDSCREnabled: true, minDSCR: c.minDSCR || FUND_SIZING_CONSTRAINTS.minDSCR,
      maxLTCEnabled: true, maxLTCPct: c.maxLTCPct || FUND_SIZING_CONSTRAINTS.maxLTCPct,
      minDebtYieldEnabled: true, minDebtYieldPct: c.minDebtYieldPct || FUND_SIZING_CONSTRAINTS.minDebtYieldPct,
    },
  };
};

export const SAMPLE_FUND_FEE_TERMS = { mgmtFeePct: 1.5, mgmtFeeBasis: "commitments-then-invested", cashReserveQuarters: 2, feeModel: "fund-v1", portfolioManager: "Taylor Brooks" };

// Cap pricing scaled to loan size from the base deal ($350k initial and
// $250k replacement on a $7.3M loan).
const INITIAL_CAP_PER_LOAN = 350_000 / 7_300_000;
const REPLACEMENT_CAP_PER_LOAN = 250_000 / 7_300_000;

const ASSETS = [
  { propertyName: "Airport Flex Park", unitCount: 12, acquisitionDate: "2026-01-30",       squareFootage: 24_000, purchasePrice: 7_200_000,  noiYear1: 486_000, noiGrowthPct: 25, holdYears: 4, exitCapPct: 6.75, capex: 300_000,   spreadPct: 2.00 },
  { propertyName: "Route 9 Small Bay", unitCount: 18, acquisitionDate: "2026-03-16",       squareFootage: 42_000, purchasePrice: 12_500_000, noiYear1: 800_000, noiGrowthPct: 30, holdYears: 4, exitCapPct: 6.50, capex: 1_000_000, spreadPct: 1.75 },
  { propertyName: "Harbor Light Industrial", unitCount: 16, acquisitionDate: "2026-04-30", squareFootage: 36_000, purchasePrice: 9_800_000,  noiYear1: 686_000, noiGrowthPct: 20, holdYears: 4, exitCapPct: 7.00, capex: 400_000,   spreadPct: 2.25 },
  { propertyName: "Ridgeway Trade Center", unitCount: 14, acquisitionDate: "2026-06-15",   squareFootage: 28_000, purchasePrice: 8_400_000,  noiYear1: 525_000, noiGrowthPct: 35, holdYears: 4, exitCapPct: 6.25, capex: 600_000,   spreadPct: 1.85 },
  { propertyName: "Canal Street Workshops", unitCount: 9, acquisitionDate: "2026-07-15",  squareFootage: 18_000, purchasePrice: 5_400_000,  noiYear1: 365_000, noiGrowthPct: 22, holdYears: 4, exitCapPct: 6.75, capex: 250_000,   spreadPct: 2.10 },
  { propertyName: "Mill Creek Business Park", unitCount: 22, acquisitionDate: "2026-08-14", squareFootage: 50_000, purchasePrice: 14_800_000, noiYear1: 962_000, noiGrowthPct: 28, holdYears: 4, exitCapPct: 6.50, capex: 1_200_000, spreadPct: 1.80 },
  { propertyName: "Southpoint Flex", unitCount: 15, acquisitionDate: "2026-09-30",         squareFootage: 32_000, purchasePrice: 9_100_000,  noiYear1: 610_000, noiGrowthPct: 33, holdYears: 4, exitCapPct: 6.25, capex: 700_000,   spreadPct: 1.90 },
  { propertyName: "Granite Ave Industrial", unitCount: 12, acquisitionDate: "2026-10-15",  squareFootage: 26_000, purchasePrice: 7_600_000,  noiYear1: 520_000, noiGrowthPct: 24, holdYears: 4, exitCapPct: 6.75, capex: 350_000,   spreadPct: 2.00 },
  { propertyName: "Lakeshore Service Center", unitCount: 18, acquisitionDate: "2026-11-13", squareFootage: 40_000, purchasePrice: 11_600_000, noiYear1: 760_000, noiGrowthPct: 30, holdYears: 4, exitCapPct: 7.00, capex: 900_000,   spreadPct: 2.25 },
];

// Earlier default acquisition dates (when six assets were still pipeline),
// by sample deal id. Saved workspaces still on these move to the current
// dates; a date the user changed is kept.
const PREVIOUS_DATES = {
  "sample-deal-1": "2026-04-30",
  "sample-deal-2": "2026-07-15",
  "sample-deal-3": "2026-09-30",
  "sample-deal-4": "2026-12-15",
  "sample-deal-5": "2027-03-01",
  "sample-deal-6": "2027-05-14",
  "sample-deal-7": "2027-08-02",
  "sample-deal-8": "2027-10-15",
  "sample-deal-9": "2027-12-15",
};
// Earlier default hold periods (years), by sample deal id; saved workspaces
// still on these move to the current hold (4 years). A hold the user changed
// is kept.
const PREVIOUS_HOLDS = {
  "sample-deal-1": 5,
  "sample-deal-3": 5,
  "sample-deal-4": 3,
  "sample-deal-6": 5,
  "sample-deal-8": 3,
  "sample-deal-9": 5,
};
export function currentSampleHold(dealId, hold) {
  const i = Number(String(dealId).replace("sample-deal-", "")) - 1;
  if (PREVIOUS_HOLDS[dealId] && hold === PREVIOUS_HOLDS[dealId] && ASSETS[i]) return ASSETS[i].holdYears;
  return hold;
}

// Unit count of a sample asset (saved workspaces from before units were set
// carry the generic default of 20).
export function sampleUnitCount(dealId) {
  const i = Number(String(dealId).replace("sample-deal-", "")) - 1;
  return ASSETS[i]?.unitCount ?? null;
}

export function currentSampleDate(dealId, date) {
  const i = Number(String(dealId).replace("sample-deal-", "")) - 1;
  if (PREVIOUS_DATES[dealId] && date === PREVIOUS_DATES[dealId] && ASSETS[i]) return ASSETS[i].acquisitionDate;
  return date;
}

function sampleId() {
  return `sample-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function snapshotDeal(inputs, id = sampleId()) {
  const r = underwrite(inputs);
  return {
    id,
    inputs,
    irrFlows: [...(r.irrFlows ?? [])],
    // Operating cash by hold year and the sale proceeds, for quarterly income.
    opFlows: r.annualCashFlows.map((cf) => cf.pretaxCashFlow),
    reversion: r.returns.equityReversion,
    exitValue: r.returns.exitValue, // gross sale price, for the disposition fee (11/24)
    // Distribution reserve basis by hold year: debt service + TI/leasing + AM, PM and CM fees.
    reserveBasis: r.annualCashFlows.map((cf) => (cf.debtService ?? 0) + (cf.tiAndLeasing ?? 0) + (cf.assetMgmtFees ?? cf.belowLineAMFees ?? 0) + (cf.managementFee ?? 0) + (cf.constructionMgmtFee ?? 0)),
    metrics: {
      irr: r.returns.irr,
      equityMultiple: r.returns.equityMultiple,
      yearOneCashOnCash: r.returns.yearOneCashOnCash,
      equityRequired: r.debt.equityRequired,
      loanAmount: r.debt.loanAmount,
    },
  };
}

// Editable, linked deals for the nine sample assets: each carries its Quick
// Underwrite inputs and full-model inputs, in the sample fund.
// baseInputs: full-model defaults for fields the quick model doesn't set.
export function buildSampleDeals(baseInputs) {
  return ASSETS.map(({ propertyName, squareFootage, unitCount, acquisitionDate, ...a }, i) => {
    const loan = a.purchasePrice * (QUICK_DEFAULTS.ltvPct / 100) + a.capex;
    const quick = {
      ...QUICK_DEFAULTS,
      ...a,
      closingCosts: Math.round(a.purchasePrice * 0.04),
      initialCapCost: Math.round((loan * INITIAL_CAP_PER_LOAN) / 1000) * 1000,
      replacementCapCost: Math.round((loan * REPLACEMENT_CAP_PER_LOAN) / 1000) * 1000,
      extensionFee: Math.round((loan * 0.0125) / 1000) * 1000,
      acquisitionDate,
      sofrCurveSource: "pensford",
      sofrCurve: [],
    };
    const inputs = toMainInputs(quick, withLocation({
      ...baseInputs,
      propertyName,
      squareFootage,
      unitCount,
      acquisitionDate,
      fundName: SAMPLE_FUND_NAME,
      units: [],
    }));
    // Fictional extension notice periods (days before maturity), for the
    // Dashboard's Calendar (11/24).
    inputs.extensionNoticeDays = [60, 90, 60, 30, 90, 60, 45, 90, 60][i] ?? 60;
    // Fictional asset managers: the Owner column on the Dashboard (11/24).
    inputs.assetManager = ["Alex Morgan", "Jordan Lee", "Sam Patel"][i % 3];
    // Rent-roll NOI: the rent roll is calibrated so year-1 NOI matches the
    // asset's Quick Underwrite NOI; the deal is not linked to Quick Underwrite.
    const direct = underwrite(inputs).annualCashFlows;
    const target = { y1: direct[0]?.noi ?? 0, exit: direct[direct.length - 1]?.noi ?? 0 };
    const built = withSizingConstraints(toRentRollNOI(withMarkToMarket(inputs, i + 1), target, i + 1, underwrite));
    // Drawn photos and floor plan (phase L, lib/sampleMedia.js).
    // Risk test data (phase L, lib/sampleRiskData.js): made-up lenders, cap
    // counterparties and environmental entries.
    // Mock sales and rent comps (11/24, lib/sampleComps.js): fictional.
    return withSampleComps(withRiskTestData({ id: `sample-deal-${i + 1}`, linked: false, quick, inputs: { ...built, assetMedia: sampleMediaFor(propertyName, built.units) } }));
  });
}
