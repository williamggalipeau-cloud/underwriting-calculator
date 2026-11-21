// ─── Sample light-industrial portfolio ───────────────────────────────────────
// Builds a fund of direct-NOI light-industrial deals structured like the
// Quick Underwrite deal (65% LTV floating-rate IO bridge loan at SOFR +
// spread, 3 + 1 + 1 term, rate caps, lender-funded capex, 1.5% AM fee on
// equity, 6% sale costs) so the Portfolio Return tab has something to show.
// Figures are illustrative, not market data.

import { underwrite } from "@/lib/calculations";
import { QUICK_DEFAULTS, toMainInputs } from "@/lib/quickUnderwrite";

export const SAMPLE_FUND_NAME = "Light Industrial Fund I";

// Cap pricing scaled to loan size from the base deal ($350k initial and
// $250k replacement on a $7.3M loan).
const INITIAL_CAP_PER_LOAN = 350_000 / 7_300_000;
const REPLACEMENT_CAP_PER_LOAN = 250_000 / 7_300_000;

const ASSETS = [
  { propertyName: "Airport Flex Park",       squareFootage: 24_000, purchasePrice: 7_200_000,  noiYear1: 486_000, noiGrowthPct: 25, holdYears: 5, exitCapPct: 6.75, capex: 300_000,   spreadPct: 2.00 },
  { propertyName: "Route 9 Small Bay",       squareFootage: 42_000, purchasePrice: 12_500_000, noiYear1: 800_000, noiGrowthPct: 30, holdYears: 4, exitCapPct: 6.50, capex: 1_000_000, spreadPct: 1.75 },
  { propertyName: "Harbor Light Industrial", squareFootage: 36_000, purchasePrice: 9_800_000,  noiYear1: 686_000, noiGrowthPct: 20, holdYears: 5, exitCapPct: 7.00, capex: 400_000,   spreadPct: 2.25 },
  { propertyName: "Ridgeway Trade Center",   squareFootage: 28_000, purchasePrice: 8_400_000,  noiYear1: 525_000, noiGrowthPct: 35, holdYears: 3, exitCapPct: 6.25, capex: 600_000,   spreadPct: 1.85 },
];

function sampleId() {
  return `sample-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function snapshotDeal(inputs, id = sampleId()) {
  const r = underwrite(inputs);
  return {
    id,
    inputs,
    irrFlows: [...(r.irrFlows ?? [])],
    metrics: {
      irr: r.returns.irr,
      equityMultiple: r.returns.equityMultiple,
      yearOneCashOnCash: r.returns.yearOneCashOnCash,
      equityRequired: r.debt.equityRequired,
      loanAmount: r.debt.loanAmount,
    },
  };
}

// baseInputs: full-model defaults for fields the quick model doesn't set.
export function buildSamplePortfolio(baseInputs) {
  return ASSETS.map(({ propertyName, squareFootage, ...a }) => {
    const loan = a.purchasePrice * (QUICK_DEFAULTS.ltvPct / 100) + a.capex;
    const quick = {
      ...QUICK_DEFAULTS,
      ...a,
      closingCosts: Math.round(a.purchasePrice * 0.04),
      initialCapCost: Math.round((loan * INITIAL_CAP_PER_LOAN) / 1000) * 1000,
      replacementCapCost: Math.round((loan * REPLACEMENT_CAP_PER_LOAN) / 1000) * 1000,
      extensionFee: Math.round((loan * 0.0125) / 1000) * 1000,
      sofrCurve: [],
    };
    const inputs = toMainInputs(quick, {
      ...baseInputs,
      propertyName,
      squareFootage,
      fundName: SAMPLE_FUND_NAME,
      units: [],
    });
    return snapshotDeal(inputs);
  });
}
