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

import { calcIRR } from "@/lib/calculations";

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

function annualDebtService(loan, rate, amortYears) {
  if (!amortYears) return loan * rate;
  const r = rate / 12;
  const n = amortYears * 12;
  if (r === 0) return loan / amortYears;
  return ((loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)) * 12;
}

function balanceAfter(loan, rate, amortYears, years) {
  if (!amortYears) return loan;
  const r = rate / 12;
  const n = amortYears * 12;
  const k = years * 12;
  if (r === 0) return loan * (1 - k / n);
  return (loan * (Math.pow(1 + r, n) - Math.pow(1 + r, k))) / (Math.pow(1 + r, n) - 1);
}

export function quickUnderwrite(inp) {
  const hold = Math.max(1, Math.round(inp.holdYears));
  const rate = (inp.sofrPct + inp.spreadPct) / 100;
  const g = inp.noiGrowthPct / 100;

  const loanAtClose = inp.purchasePrice * (inp.ltvPct / 100);
  const loan = loanAtClose + (inp.capexLenderFunded ? inp.capex : 0);
  const equity =
    inp.purchasePrice - loanAtClose + inp.closingCosts + inp.initialCapCost +
    (inp.capexLenderFunded ? 0 : inp.capex);

  const debtService = annualDebtService(loan, rate, inp.amortYears);
  const amFee = equity * (inp.amFeePct / 100);

  // Extensions needed to reach the hold period.
  const extTerm = Math.max(1, inp.extensionTermYears);
  const extensionsNeeded = Math.max(0, Math.ceil((hold - inp.initialTermYears) / extTerm));
  const extensionYears = new Set();
  for (let k = 0; k < extensionsNeeded; k++) {
    extensionYears.add(inp.initialTermYears + k * extTerm);
  }

  const capTerm = Math.max(1, inp.capTermYears);
  const years = [];
  for (let y = 1; y <= hold; y++) {
    const noi = inp.noiYear1 * Math.pow(1 + g, y - 1);
    const capCost = y < hold && y % capTerm === 0 ? inp.replacementCapCost : 0;
    const extFee = extensionYears.has(y) ?inp.extensionFee : 0;
    const operatingCF = noi - debtService - amFee - capCost - extFee;

    let salePrice = 0, saleCosts = 0, loanPayoff = 0;
    if (y === hold) {
      salePrice = noi / (inp.exitCapPct / 100);
      saleCosts = salePrice * (inp.saleCostPct / 100);
      loanPayoff = balanceAfter(loan, rate, inp.amortYears, hold);
    }
    const netCF = operatingCF + salePrice - saleCosts - loanPayoff;

    years.push({
      year: y,
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

  return {
    rate,
    loan,
    equity,
    debtService,
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
