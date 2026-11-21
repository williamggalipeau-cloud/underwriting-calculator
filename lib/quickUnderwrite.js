// ─── Quick underwrite: NOI-driven acquisition model ──────────────────────────
//
// A lightweight alternative to the rent-roll engine in calculations.js. Starts
// from a forward 12-month NOI and an annual growth rate rather than unit-level
// rents, and models a floating-rate bridge loan with rate caps, extensions,
// lender- or equity-funded capex, an asset-management fee and a sale.
//
// Conventions:
//   - Year 0 is closing; years 1..hold are annual periods.
//   - Exit value = final-year NOI / exit cap rate.
//   - Replacement caps are bought at the end of each cap term while the loan
//     is still outstanding (never in the exit year).
//   - Extension fees are charged in the last year of the term being extended.
//   - SOFR for year y comes from the Pensford forward curve when
//     sofrCurveSource is "pensford" (averaged over each year of the hold from
//     acquisitionDate), else sofrCurve[y-1] when set, else flat sofrPct.
//     Caps are held for every year of the hold, so the index is limited to
//     capStrikePct (0 = no cap limit). All-in rate = min(SOFR, strike) + spread.
//   - Amortizing loans re-amortize each year at that year's rate over the
//     remaining amortization term (standard floating-rate convention).

import { calcIRR } from "@/lib/calculations";
import { annualCurveForHold, FORWARD_CURVE_AS_OF } from "@/lib/forwardCurve";

export const QUICK_DEFAULTS = {
  propertyType: "Light industrial",
  purchasePrice: 10_000_000,
  closingCosts: 400_000,
  noiYear1: 650_000,
  noiGrowthPct: 35,
  holdYears: 4,
  exitCapPct: 4.0,
  saleCostPct: 6,

  ltvPct: 65,
  capex: 800_000,
  capexLenderFunded: true,
  sofrPct: 3.91,
  acquisitionDate: "2026-02-13",
  sofrCurveSource: "pensford", // "pensford" | "manual" (sofrCurve, or flat sofrPct if empty)
  sofrIndex: "avgSofr30D", // Pensford series: "avgSofr30D" (30D Average SOFR) | "termSofr1M"
  sofrCurve: [], // per-year SOFR %, used when sofrCurveSource is "manual"
  capStrikePct: 3.91, // at-the-money as of 11/20/2026; 0 = uncapped
  spreadPct: 1.75,
  amortYears: 0, // 0 = interest-only
  initialTermYears: 3,
  extensionCount: 2,
  extensionTermYears: 1,
  extensionFee: 100_000,

  initialCapCost: 350_000,
  capTermYears: 1,
  replacementCapCost: 250_000,

  amFeePct: 1.5, // % of invested equity, per year
};

// Per-year SOFR curve the model uses for this deal.
export function resolvedSofrCurve(inp) {
  if (inp.sofrCurveSource === "pensford") {
    return annualCurveForHold(inp.acquisitionDate || FORWARD_CURVE_AS_OF, inp.holdYears, inp.sofrIndex ?? "avgSofr30D");
  }
  return inp.sofrCurve ?? [];
}

export function sofrForYear(inp, year) {
  const c = resolvedSofrCurve(inp);
  return Array.isArray(c) && c[year - 1] != null && isFinite(c[year - 1]) ? c[year - 1] : inp.sofrPct;
}

export function allInRateForYear(inp, year) {
  const sofr = sofrForYear(inp, year);
  const index = inp.capStrikePct > 0 ? Math.min(sofr, inp.capStrikePct) : sofr;
  return (index + inp.spreadPct) / 100;
}

// One year of debt service on a balance; returns { payment, endBalance }.
function debtYear(balance, rate, amortYears, yearsElapsed) {
  if (!amortYears) return { payment: balance * rate, endBalance: balance };
  const remainingMonths = Math.max(1, (amortYears - yearsElapsed) * 12);
  const r = rate / 12;
  const pmt =
    r === 0
      ? balance / remainingMonths
      : (balance * r * Math.pow(1 + r, remainingMonths)) / (Math.pow(1 + r, remainingMonths) - 1);
  let b = balance;
  for (let m = 0; m < 12 && b > 0; m++) b = b * (1 + r) - pmt;
  return { payment: pmt * 12, endBalance: Math.max(0, b) };
}

export function quickUnderwrite(inp) {
  const hold = Math.max(1, Math.round(inp.holdYears));
  const g = inp.noiGrowthPct / 100;

  const loanAtClose = inp.purchasePrice * (inp.ltvPct / 100);
  const loan = loanAtClose + (inp.capexLenderFunded ? inp.capex : 0);
  const equity =
    inp.purchasePrice - loanAtClose + inp.closingCosts + inp.initialCapCost +
    (inp.capexLenderFunded ? 0 : inp.capex);

  const amFee = equity * (inp.amFeePct / 100);

  // Extensions needed to reach the hold period.
  const extTerm = Math.max(1, inp.extensionTermYears);
  const extensionsNeeded = Math.min(
    Math.max(0, inp.extensionCount),
    Math.max(0, Math.ceil((hold - inp.initialTermYears) / extTerm))
  );
  const extensionYears = new Set();
  for (let k = 0; k < extensionsNeeded; k++) {
    extensionYears.add(inp.initialTermYears + k * extTerm);
  }

  const capTerm = Math.max(1, inp.capTermYears);
  const years = [];
  let balance = loan;
  for (let y = 1; y <= hold; y++) {
    const sofr = sofrForYear(inp, y);
    const rate = allInRateForYear(inp, y);
    const { payment: debtService, endBalance } = debtYear(balance, rate, inp.amortYears, y - 1);
    balance = endBalance;
    const noi = inp.noiYear1 * Math.pow(1 + g, y - 1);
    const capCost = y < hold && y % capTerm === 0 ? inp.replacementCapCost : 0;
    const extFee = extensionYears.has(y) ?inp.extensionFee : 0;
    const operatingCF = noi - debtService - amFee - capCost - extFee;

    let salePrice = 0, saleCosts = 0, loanPayoff = 0;
    if (y === hold) {
      salePrice = noi / (inp.exitCapPct / 100);
      saleCosts = salePrice * (inp.saleCostPct / 100);
      loanPayoff = balance;
    }
    const netCF = operatingCF + salePrice - saleCosts - loanPayoff;

    years.push({
      year: y,
      sofr,
      rate,
      noi,
      debtService,
      amFee,
      capCost,
      extFee,
      salePrice,
      saleCosts,
      loanPayoff,
      netCF,
      dscr: debtService > 0 ? noi / debtService : Infinity,
      debtYield: loan > 0 ? (noi / loan) * 100 : Infinity,
    });
  }

  const flows = [-equity, ...years.map((r) => r.netCF)];
  const distributions = years.reduce((s, r) => s + r.netCF, 0);
  const irr = calcIRR(flows) * 100;
  const totalCapCost = inp.initialCapCost + years.reduce((s, r) => s + r.capCost, 0);

  const warnings = [];
  if (loan / inp.purchasePrice > inp.ltvPct / 100 + 1e-9) {
    warnings.push(
      `Loan is ${((loan / inp.purchasePrice) * 100).toFixed(1)}% of purchase price (above the ${inp.ltvPct}% LTV) because capex is lender-funded. Loan-to-cost is ${((loan / (inp.purchasePrice + inp.capex)) * 100).toFixed(1)}%.`
    );
  }
  if (hold > inp.initialTermYears + inp.extensionCount * extTerm) {
    warnings.push(
      `Hold of ${hold} years exceeds the fully extended loan term (${inp.initialTermYears + inp.extensionCount * extTerm} years); a refinance would be needed.`
    );
  }
  const negYears = years.filter((r) => r.year < hold && r.netCF < 0).map((r) => r.year);
  if (negYears.length) {
    warnings.push(`Equity must fund shortfalls in year${negYears.length > 1 ? "s" : ""} ${negYears.join(", ")}.`);
  }
  const goingInCap = (inp.noiYear1 / inp.purchasePrice) * 100;
  if (inp.exitCapPct < goingInCap - 0.25) {
    warnings.push(
      `Exit cap (${inp.exitCapPct.toFixed(2)}%) is ${(goingInCap - inp.exitCapPct).toFixed(2)} pts below the going-in cap (${goingInCap.toFixed(2)}%); returns rely on cap-rate compression.`
    );
  }

  const rates = years.map((r) => r.rate);
  return {
    rate: rates[0],
    rateMin: Math.min(...rates),
    rateMax: Math.max(...rates),
    loan,
    equity,
    debtService: years[0].debtService,
    amFee,
    extensionsNeeded,
    totalCapCost,
    years,
    flows,
    distributions,
    profit: distributions - equity,
    equityMultiple: distributions / equity,
    irr,
    goingInCap,
    yearOneCoC: (years[0].netCF / equity) * 100,
    warnings,
  };
}

export function quickSensitivity(inp, growthValues, exitCapValues) {
  return growthValues.map((g) =>
    exitCapValues.map((c) => {
      const r = quickUnderwrite({ ...inp, noiGrowthPct: g, exitCapPct: c });
      return { irr: r.irr, em: r.equityMultiple };
    })
  );
}

// Maps Quick Underwrite inputs onto the full underwriting engine's inputs
// (lib/calculations.js) in direct-NOI mode, so every other tab analyses the
// same deal. `base` supplies everything the quick model doesn't cover
// (rent-roll fields, covenants, waterfall); deal terms are overwritten.
export function toMainInputs(q, base) {
  const ioYears = q.amortYears ? 0 : Math.max(1, Math.round(q.holdYears));
  return {
    ...base,
    noiOverrideEnabled: true,
    noiYear1: q.noiYear1,
    noiGrowthPct: q.noiGrowthPct,

    purchasePrice: q.purchasePrice,
    closingCosts: {
      titleInsuranceOwner: 0,
      titleInsuranceLender: 0,
      transferTax: 0,
      loanOrigination: 0,
      acquisitionFee: 0,
      legalFees: 0,
      environmentalReport: 0,
      appraisal: 0,
      surveyAndPCA: 0,
      miscClosingCosts: q.closingCosts,
    },
    capexBudget: q.capex,
    capexLenderFunded: q.capexLenderFunded,

    ltvPct: q.ltvPct,
    loanSizingConstraints: {
      ...(base.loanSizingConstraints ?? {}),
      minDSCREnabled: false,
      maxLTCEnabled: false,
      minDebtYieldEnabled: false,
    },
    tiReserve: { ...(base.tiReserve ?? {}), enabled: false },
    amortizationYears: q.amortYears || 25,
    ioPeriodYears: ioYears,
    loanTermYears: q.initialTermYears,
    extensionCount: q.extensionCount,
    extensionTermYears: q.extensionTermYears,
    extensionFeeAmount: q.extensionFee,
    extensionFeePct: 0,

    floatingRate: true,
    indexRatePct: q.sofrPct,
    sofrForwardCurve: [...resolvedSofrCurve(q)],
    acquisitionDate: q.acquisitionDate ?? base.acquisitionDate,
    spreadPct: q.spreadPct,
    hedgingType: "cap",
    // Main engine's strike is on the all-in rate; quick model's is on SOFR.
    capStrikeRatePct: q.capStrikePct > 0 ? q.capStrikePct + q.spreadPct : 0,
    capTermYears: q.capTermYears,
    capPremiumAmount: q.initialCapCost,
    capPremiumPct: 0,
    capReplacementCost: q.replacementCapCost,

    holdPeriodYears: Math.max(1, Math.round(q.holdYears)),
    exitCapRatePct: q.exitCapPct,
    sellingCostsPct: q.saleCostPct,
    sellingCosts: {
      brokerCommissionPct: q.saleCostPct,
      transferTaxPct: 0,
      titleInsurancePct: 0,
      legalFees: 0,
      miscDispositionCosts: 0,
    },
    customDispositionItems: [],
    amFeeItems: [{ id: "quick-am-fee", label: "Asset mgmt fee", basis: "pctEquity", value: q.amFeePct }],
  };
}
