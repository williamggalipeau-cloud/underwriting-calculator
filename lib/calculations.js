// ─── Loan math ────────────────────────────────────────────────────────────────

function monthlyPayment(principal, annualRate, amortYears) {
  if (annualRate === 0) return principal / (amortYears * 12);
  const r = annualRate / 12;
  const n = amortYears * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function remainingBalance(principal, annualRate, amortYears, monthsPaid) {
  if (annualRate === 0) return principal - (principal / (amortYears * 12)) * monthsPaid;
  const r = annualRate / 12;
  const n = amortYears * 12;
  return (
    principal *
    ((Math.pow(1 + r, n) - Math.pow(1 + r, monthsPaid)) /
      (Math.pow(1 + r, n) - 1))
  );
}

// ─── IRR solver (bisection method) ───────────────────────────────────────────

function npvAtRate(cashFlows, rate) {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

export function calcIRR(cashFlows) {
  let lo = -0.9999;
  let hi = 10.0;

  const npvLo = npvAtRate(cashFlows, lo);
  const npvHi = npvAtRate(cashFlows, hi);

  if (npvLo * npvHi > 0) return NaN;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npvAtRate(cashFlows, mid);
    if (Math.abs(npvMid) < 0.01) return mid;
    if (npvMid * npvLo < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ─── Closing cost calculation ─────────────────────────────────────────────────

const DEFAULT_CLOSING_COSTS = {
  titleInsuranceOwnerPct: 0.30,
  titleInsuranceLenderPct: 0.20,
  transferTaxPct: 0.50,
  loanOriginationPct: 1.00,
  legalFees: 15000,
  environmentalReport: 3500,
  appraisal: 7500,
  surveyAndPCA: 5000,
  miscClosingCosts: 2500,
};

function computeClosingCosts(inputs, loanAmount) {
  const { purchasePrice } = inputs;
  const cc = inputs.closingCosts ?? DEFAULT_CLOSING_COSTS;

  const titleInsuranceOwner  = purchasePrice * (cc.titleInsuranceOwnerPct / 100);
  const titleInsuranceLender = loanAmount    * (cc.titleInsuranceLenderPct / 100);
  const transferTax          = purchasePrice * (cc.transferTaxPct / 100);
  const loanOrigination      = loanAmount    * (cc.loanOriginationPct / 100);
  const { legalFees, environmentalReport, appraisal, surveyAndPCA, miscClosingCosts } = cc;

  const total =
    titleInsuranceOwner + titleInsuranceLender + transferTax +
    loanOrigination + legalFees + environmentalReport +
    appraisal + surveyAndPCA + miscClosingCosts;

  return {
    titleInsuranceOwner,
    titleInsuranceLender,
    transferTax,
    loanOrigination,
    legalFees,
    environmentalReport,
    appraisal,
    surveyAndPCA,
    miscClosingCosts,
    total,
    totalAsPctOfPurchasePrice: (total / purchasePrice) * 100,
  };
}

// ─── Selling cost calculation ─────────────────────────────────────────────────

const DEFAULT_SELLING_COSTS = {
  brokerCommissionPct:  2.00,
  transferTaxPct:       0.50,
  titleInsurancePct:    0.20,
  legalFees:            15000,
  miscDispositionCosts: 5000,
};

export function computeSellingCosts(sellingCosts, exitValue) {
  const sc = sellingCosts ?? DEFAULT_SELLING_COSTS;
  const brokerCommission  = exitValue * ((sc.brokerCommissionPct  ?? 0) / 100);
  const transferTax       = exitValue * ((sc.transferTaxPct       ?? 0) / 100);
  const titleInsurance    = exitValue * ((sc.titleInsurancePct    ?? 0) / 100);
  const legalFees         = sc.legalFees          ?? 0;
  const miscDisposition   = sc.miscDispositionCosts ?? 0;
  const total = brokerCommission + transferTax + titleInsurance + legalFees + miscDisposition;
  return {
    brokerCommission,
    transferTax,
    titleInsurance,
    legalFees,
    miscDisposition,
    total,
    totalAsPctOfExitValue: exitValue > 0 ? (total / exitValue) * 100 : 0,
  };
}

// ─── Landlord expense calculation ─────────────────────────────────────────────
//
// NNN  → tenant pays taxes, insurance, utilities, maintenance, janitorial
// MG   → landlord pays taxes + insurance
// Gross → landlord pays all operating expenses

function landlordExpenses(inputs, sf) {
  const {
    leaseType,
    realEstateTaxPSF,
    insurancePSF,
    utilitiesPSF,
    maintenancePSF,
    janitorialPSF,
  } = inputs;

  const pays = (paysIt, psf) => (paysIt ? psf * sf : 0);

  const isGross = leaseType === "Gross";
  const isMG    = leaseType === "MG";

  return {
    realEstateTax: pays(isMG || isGross, realEstateTaxPSF),
    insurance:     pays(isMG || isGross, insurancePSF),
    utilities:     pays(isGross,         utilitiesPSF),
    maintenance:   pays(isGross,         maintenancePSF),
    janitorial:    pays(isGross,         janitorialPSF),
  };
}

// ─── Construction cost calculation ───────────────────────────────────────────

export function computeConstructionCostPSF(cc) {
  if (!cc) return 0;
  const base =
    (cc.demolition      ?? 0) +
    (cc.partitionWalls  ?? 0) +
    (cc.electrical      ?? 0) +
    (cc.plumbing        ?? 0) +
    (cc.hvac            ?? 0) +
    (cc.flooring        ?? 0) +
    (cc.painting        ?? 0) +
    (cc.lighting        ?? 0) +
    (cc.doorsHardware   ?? 0) +
    (cc.overheadDoors   ?? 0) +
    (cc.miscConstruction ?? 0);
  const afterGC          = base        * (1 + (cc.generalConditionsPct ?? 0) / 100);
  const afterOP          = afterGC     * (1 + (cc.overheadProfitPct    ?? 0) / 100);
  const afterContingency = afterOP     * (1 + (cc.contingencyPct       ?? 0) / 100);
  return afterContingency;
}

// ─── Rollover cost calculation (normalized annually) ─────────────────────────

function annualRolloverCosts(inputs, effectiveRentPSF) {
  const {
    squareFootage,
    avgLeaseTerm,
    renewalProbabilityPct,
    tiPerSFRenewal,
    leasingCommissionNewPct,
    leasingCommissionRenewalPct,
  } = inputs;

  if (avgLeaseTerm <= 0) return 0;

  const tiPerSFNew = inputs.constructionCosts
    ? computeConstructionCostPSF(inputs.constructionCosts)
    : (inputs.tiPerSFNew ?? 0);

  const rolloverSF = squareFootage / avgLeaseTerm;
  const renewalRate = renewalProbabilityPct / 100;
  const newLeaseSF = rolloverSF * (1 - renewalRate);
  const renewalSF  = rolloverSF * renewalRate;

  const tiNew      = newLeaseSF * tiPerSFNew;
  const tiRenewal  = renewalSF  * tiPerSFRenewal;

  const lcNew      = newLeaseSF  * effectiveRentPSF * avgLeaseTerm * (leasingCommissionNewPct / 100);
  const lcRenewal  = renewalSF   * effectiveRentPSF * avgLeaseTerm * (leasingCommissionRenewalPct / 100);

  return tiNew + tiRenewal + lcNew + lcRenewal;
}

// ─── Unit-level lease simulation ─────────────────────────────────────────────

function simulateUnit(unit, inputs, holdPeriodYears) {
  const results = Array.from({ length: holdPeriodYears }, () => ({
    revenue: 0,
    otherIncome: 0,
    tiAndLeasing: 0,
    realEstateTax: 0,
    insurance: 0,
    utilities: 0,
    maintenance: 0,
    janitorial: 0,
    occupiedMonths: 0,
  }));

  // Per-unit lease type determines landlord expense responsibility
  const unitLeaseType = unit.leaseType ?? inputs.leaseType ?? "NNN";
  const isGross = unitLeaseType === "Gross";
  const isMG    = unitLeaseType === "MG";
  const sf      = unit.squareFeet;

  const unitOpEx = {
    realEstateTax: (isMG || isGross) ? (inputs.realEstateTaxPSF ?? 0) * sf : 0,
    insurance:     (isMG || isGross) ? (inputs.insurancePSF     ?? 0) * sf : 0,
    utilities:     isGross           ? (inputs.utilitiesPSF     ?? 0) * sf : 0,
    maintenance:   isGross           ? (inputs.maintenancePSF   ?? 0) * sf : 0,
    janitorial:    isGross           ? (inputs.janitorialPSF    ?? 0) * sf : 0,
  };

  // Per-unit other income (flat each year)
  const annualOtherIncome = (unit.otherIncomePSF ?? 0) * sf;

  // Per-unit LC rates (fall back to property-level)
  const lcNewPct     = ((unit.leasingCommissionNewPct     ?? inputs.leasingCommissionNewPct)     ?? 0) / 100;
  const lcRenewalPct = ((unit.leasingCommissionRenewalPct ?? inputs.leasingCommissionRenewalPct) ?? 0) / 100;

  // Fill constant per-year values
  for (let yr = 0; yr < holdPeriodYears; yr++) {
    results[yr].otherIncome    = annualOtherIncome;
    results[yr].realEstateTax  = unitOpEx.realEstateTax;
    results[yr].insurance      = unitOpEx.insurance;
    results[yr].utilities      = unitOpEx.utilities;
    results[yr].maintenance    = unitOpEx.maintenance;
    results[yr].janitorial     = unitOpEx.janitorial;
  }

  let occupied        = unit.leaseStatus === "occupied";
  let countdown       = occupied ? unit.monthsRemaining : 0;
  let vacantCountdown = !occupied ? Math.max(1, inputs.downtimeBetweenLeases) : 0;
  let contractRentPSF = unit.currentRentPSF;

  for (let m = 0; m < holdPeriodYears * 12; m++) {
    const yr = Math.floor(m / 12);
    const marketRent = inputs.rentPerSF * Math.pow(1 + inputs.annualRentEscalationPct / 100, m / 12);

    if (occupied) {
      results[yr].revenue       += (contractRentPSF * sf) / 12;
      results[yr].occupiedMonths++;
      countdown--;

      if (countdown <= 0) {
        const renewP       = unit.renewalProbabilityPct / 100;
        const newTermYears = unit.newLeaseTerm / 12;
        const tiNewPSF = inputs.constructionCosts
          ? computeConstructionCostPSF(inputs.constructionCosts)
          : (unit.tiNewPSF ?? inputs.tiPerSFNew ?? 0);
        const ti = (renewP * (unit.tiRenewalPSF ?? 0) + (1 - renewP) * tiNewPSF) * sf;
        const lc = (
          renewP       * marketRent * newTermYears * lcRenewalPct +
          (1 - renewP) * marketRent * newTermYears * lcNewPct
        ) * sf;
        results[yr].tiAndLeasing += ti + lc;

        const expectedVacancy = Math.round((1 - renewP) * inputs.downtimeBetweenLeases);
        contractRentPSF = marketRent;

        if (expectedVacancy <= 0) {
          countdown = unit.newLeaseTerm;
        } else {
          occupied        = false;
          vacantCountdown = expectedVacancy;
        }
      }
    } else {
      vacantCountdown--;
      if (vacantCountdown <= 0) {
        occupied  = true;
        countdown = unit.newLeaseTerm;
      }
    }
  }

  return results;
}

// ─── Floating rate / hedging helpers ─────────────────────────────────────────
//
// CRE floating rate loans (bridge, 3+1+1, etc.) price as index + spread.
// Hedging:
//   cap  → limits effective rate to capStrikeRate (upfront premium)
//   swap → synthetic fixed rate at swapFixedRate
//
// For fixed rate loans (floatingRate falsy) always returns interestRatePct.

function getEffectiveRate(inputs) {
  if (!inputs.floatingRate) return inputs.interestRatePct / 100;

  const floating = ((inputs.indexRatePct ?? 0) + (inputs.spreadPct ?? 0)) / 100;

  if (inputs.hedgingType === "cap" && inputs.capStrikeRatePct) {
    return Math.min(floating, inputs.capStrikeRatePct / 100);
  }
  if (inputs.hedgingType === "swap" && inputs.swapFixedRatePct) {
    return inputs.swapFixedRatePct / 100;
  }
  return floating;
}

// Extension fee charged in the year each option is exercised.
// Extension 1 is exercised at the end of year loanTermYears (year loanTermYears + 1 of hold).
// Extension 2 is exercised at the end of year loanTermYears + extensionTermYears, etc.
function extensionFeeForYear(inputs, year, loanBalance) {
  if (!inputs.extensionCount || inputs.extensionCount === 0) return 0;
  const initialTerm  = inputs.loanTermYears ?? 10;
  const extTerm      = inputs.extensionTermYears ?? 1;
  const extFeePct    = (inputs.extensionFeePct ?? 0) / 100;
  for (let ext = 1; ext <= inputs.extensionCount; ext++) {
    if (year === initialTerm + (ext - 1) * extTerm) {
      return loanBalance * extFeePct;
    }
  }
  return 0;
}

// ─── Core underwriting model ──────────────────────────────────────────────────

export function underwrite(inputs) {
  const {
    squareFootage,
    purchasePrice,
    rentPerSF,
    annualRentEscalationPct,
    vacancyPct,
    creditLossPct,
    otherIncomePSF,
    managementFeePct,
    capitalReservesPSF,
    ltvPct,
    interestRatePct,
    amortizationYears,
    ioPeriodYears,
    holdPeriodYears,
    exitCapRatePct,
    sellingCostsPct,
  } = inputs;

  // ── Acquisition ──
  const loanAmount           = purchasePrice * (ltvPct / 100);
  const closingCostsDetail   = computeClosingCosts(inputs, loanAmount);
  const hedgingPremium       = (inputs.hedgingType === "cap")
    ? loanAmount * ((inputs.capPremiumPct ?? 0) / 100)
    : 0;
  const totalAcquisitionCost = purchasePrice + closingCostsDetail.total + hedgingPremium;
  const equityRequired       = totalAcquisitionCost - loanAmount;
  const capPremium           = hedgingPremium; // alias for display

  // ── Debt (year 1 metrics for summary) ──
  const effectiveRate            = getEffectiveRate(inputs);
  const ioAnnualDebtService1     = loanAmount * effectiveRate;
  const amortPayment1            = monthlyPayment(loanAmount, effectiveRate, amortizationYears);
  const amortAnnualDebtService1  = amortPayment1 * 12;
  const loanConstant             = amortizationYears > 0 ? amortAnnualDebtService1 / loanAmount : effectiveRate;

  // Rate schedule constant for floating (index+spread); fixed otherwise
  const displayRateSchedule = Array.from({ length: holdPeriodYears }, () => effectiveRate * 100);

  // ── Pre-compute unit simulations ──
  const hasUnits    = (inputs.units ?? []).length > 0;
  const safeUnits   = inputs.units ?? [];
  const totalUnitSF = hasUnits ? safeUnits.reduce((s, u) => s + u.squareFeet, 0) : squareFootage;
  const unitSims    = hasUnits
    ? safeUnits.map((u) => simulateUnit(u, inputs, holdPeriodYears))
    : [];

  // ── Year-by-year cash flows ──
  const annualCashFlows = [];

  for (let year = 1; year <= holdPeriodYears; year++) {
    const i               = year - 1;
    const escalation      = Math.pow(1 + annualRentEscalationPct / 100, i);
    const effectiveRentPSF = rentPerSF * escalation;

    let grossRevenue, physicalVacancy, tiLC, opExpenses;

    if (hasUnits) {
      const unitRevenue     = unitSims.reduce((s, yr) => s + yr[i].revenue, 0);
      const unitOtherIncome = unitSims.reduce((s, yr) => s + yr[i].otherIncome, 0);
      const scheduled       = effectiveRentPSF * totalUnitSF;
      grossRevenue          = scheduled + unitOtherIncome;
      physicalVacancy       = Math.max(0, scheduled - unitRevenue);
      tiLC                  = unitSims.reduce((s, yr) => s + yr[i].tiAndLeasing, 0);
      // Operating expenses derived from per-unit lease types
      opExpenses = {
        realEstateTax: unitSims.reduce((s, yr) => s + yr[i].realEstateTax, 0),
        insurance:     unitSims.reduce((s, yr) => s + yr[i].insurance,     0),
        utilities:     unitSims.reduce((s, yr) => s + yr[i].utilities,     0),
        maintenance:   unitSims.reduce((s, yr) => s + yr[i].maintenance,   0),
        janitorial:    unitSims.reduce((s, yr) => s + yr[i].janitorial,    0),
      };
    } else {
      grossRevenue    = (effectiveRentPSF + otherIncomePSF) * squareFootage;
      physicalVacancy = grossRevenue * (vacancyPct / 100);
      tiLC            = annualRolloverCosts(inputs, effectiveRentPSF);
      opExpenses      = landlordExpenses(inputs, squareFootage);
    }

    const postVacancy = grossRevenue - physicalVacancy;
    const creditLoss  = postVacancy * (creditLossPct / 100);
    const egr         = postVacancy - creditLoss;

    const sf          = hasUnits ? totalUnitSF : squareFootage;
    const mgmtFee     = egr * (managementFeePct / 100);
    const leasingFees = (inputs.leasingFeesPSF ?? 0) * sf;
    const capReserves = capitalReservesPSF * sf;
    const totalOpEx   =
      opExpenses.realEstateTax +
      opExpenses.insurance +
      opExpenses.utilities +
      opExpenses.maintenance +
      opExpenses.janitorial +
      mgmtFee +
      leasingFees +
      capReserves;

    const noi         = egr - totalOpEx;
    const adjustedNOI = noi - tiLC;

    // ── Debt service (rate constant; balance tracks amortization) ──
    const isIO       = year <= ioPeriodYears;
    const prevBalance = annualCashFlows.length > 0
      ? annualCashFlows[annualCashFlows.length - 1].loanBalance
      : loanAmount;

    let annualDS, balance;
    if (isIO) {
      annualDS = prevBalance * effectiveRate;
      balance  = prevBalance;
    } else {
      const amortMonthsElapsed  = (year - 1 - ioPeriodYears) * 12;
      const remainingAmortYears = Math.max(amortizationYears - amortMonthsElapsed / 12, 1 / 12);
      const pmt = monthlyPayment(prevBalance, effectiveRate, remainingAmortYears);
      annualDS  = pmt * 12;
      balance   = remainingBalance(prevBalance, effectiveRate, remainingAmortYears, 12);
    }

    // Extension fee (charged in year the option is exercised)
    const extFee   = extensionFeeForYear(inputs, year, prevBalance);
    const pretaxCF = adjustedNOI - annualDS - extFee;

    annualCashFlows.push({
      year,
      grossRevenue,
      physicalVacancy,
      creditLoss,
      effectiveGrossRevenue: egr,
      realEstateTax:  opExpenses.realEstateTax,
      insurance:      opExpenses.insurance,
      utilities:      opExpenses.utilities,
      maintenance:    opExpenses.maintenance,
      janitorial:     opExpenses.janitorial,
      managementFee:  mgmtFee,
      leasingFees,
      capitalReserves: capReserves,
      operatingExpenses: totalOpEx,
      noi,
      tiAndLeasing:   tiLC,
      adjustedNOI,
      interestRate:   effectiveRate * 100,
      extensionFee:   extFee,
      debtService:    annualDS,
      pretaxCashFlow: pretaxCF,
      loanBalance:    balance,
    });
  }

  // ── Exit ──
  const exitNOI            = annualCashFlows[holdPeriodYears - 1].noi;
  const exitValue          = exitNOI / (exitCapRatePct / 100);
  const sellingCostsDetail = computeSellingCosts(inputs.sellingCosts, exitValue);
  const finalBalance       = annualCashFlows[holdPeriodYears - 1].loanBalance;
  const equityReversion    = exitValue - sellingCostsDetail.total - finalBalance;

  // ── Returns ──
  const year1NOI         = annualCashFlows[0].noi;
  const year1AdjNOI      = annualCashFlows[0].adjustedNOI;
  const goingInCapRate   = (year1NOI / purchasePrice) * 100;
  const adjGoingInCapRate = (year1AdjNOI / purchasePrice) * 100;

  const year1CashOnCash = (annualCashFlows[0].pretaxCashFlow / equityRequired) * 100;
  const avgCashOnCash   =
    (annualCashFlows.reduce((s, cf) => s + cf.pretaxCashFlow, 0) /
      holdPeriodYears /
      equityRequired) * 100;

  const irrFlows = [
    -equityRequired,
    ...annualCashFlows.slice(0, holdPeriodYears - 1).map((cf) => cf.pretaxCashFlow),
    annualCashFlows[holdPeriodYears - 1].pretaxCashFlow + equityReversion,
  ];

  const irr               = calcIRR(irrFlows) * 100;
  const totalDistributions =
    annualCashFlows.reduce((s, cf) => s + cf.pretaxCashFlow, 0) + equityReversion;
  const equityMultiple    = totalDistributions / equityRequired;
  const npv               = npvAtRate(irrFlows, 0.08);

  // ── Debt metrics ──
  const year1DS = annualCashFlows[0].debtService;
  const dscr    = year1NOI / year1DS;
  const adjDscr = year1AdjNOI / year1DS;
  const ltv     = (loanAmount / purchasePrice) * 100;

  const avgAnnualRollover = annualCashFlows.reduce((s, cf) => s + cf.tiAndLeasing, 0) / holdPeriodYears;

  const debt = {
    loanAmount,
    annualDebtService: year1DS,
    monthlyPayment: ioPeriodYears > 0 ? ioAnnualDebtService1 / 12 : amortPayment1,
    dscr,
    adjustedDscr: adjDscr,
    ltv,
    equityRequired,
    loanConstant:       loanConstant * 100,
    effectiveRate:      effectiveRate * 100,
    capPremium,
    rateSchedule:       displayRateSchedule,
  };

  const returns = {
    goingInCapRate,
    adjustedGoingInCapRate: adjGoingInCapRate,
    exitCapRate: exitCapRatePct,
    yearOneCashOnCash: year1CashOnCash,
    averageCashOnCash: avgCashOnCash,
    equityMultiple,
    irr,
    npv,
    exitValue,
    sellingCosts:        sellingCostsDetail.total,
    sellingCostsPct:     sellingCostsDetail.totalAsPctOfExitValue,
    equityReversion,
    totalEquityInvested: equityRequired,
    annualRolloverCosts: avgAnnualRollover,
  };

  return { annualCashFlows, debt, returns, closingCosts: closingCostsDetail, sellingCosts: sellingCostsDetail };
}

// ─── Waterfall / promote calculation ─────────────────────────────────────────
//
// Implements a standard CRE LP/GP waterfall:
//   1. Return of capital  — LP first, then GP (pro-rata within each)
//   2. Preferred return   — LP accrues compound pref on outstanding capital
//   3. GP catch-up        — GP receives catchUpGpPct of distributions until
//                           GP's cumulative profit = gpSplit% of total profit
//   4. Profit tiers       — remaining split per tier based on overall IRR
//
// irrFlows: [-equity, cf1, cf2, ..., cfN+exitReversion]

export function computeWaterfall(irrFlows, equityRequired, waterfall) {
  const lpPct     = (waterfall.lpEquityPct    ?? 90)  / 100;
  const gpPct     = 1 - lpPct;
  const lpEquity  = equityRequired * lpPct;
  const gpEquity  = equityRequired * gpPct;
  const prefRate  = (waterfall.preferredReturnPct ?? 8) / 100;
  const catchUpGP = (waterfall.catchUpGpPct    ?? 100) / 100;
  const tiers     = (waterfall.tiers ?? [{ irrThreshold: null, lpSplit: 80, gpSplit: 20 }])
    .slice()
    .sort((a, b) => (a.irrThreshold ?? Infinity) - (b.irrThreshold ?? Infinity));

  // Determine applicable tier using overall project IRR
  const projectIRR = calcIRR(irrFlows) * 100;
  let activeTier = tiers[tiers.length - 1];
  for (const t of tiers) {
    if (t.irrThreshold === null || projectIRR <= t.irrThreshold) {
      activeTier = t;
      break;
    }
  }
  const lpSplit = (activeTier.lpSplit ?? 80) / 100;
  const gpSplit = (activeTier.gpSplit ?? 20) / 100;

  // Year-by-year distribution
  let lpCapOut      = lpEquity;   // LP capital still outstanding
  let gpCapOut      = gpEquity;   // GP capital still outstanding
  let lpPrefAccrued = 0;          // accrued but unpaid preferred
  let gpProfitTotal = 0;          // cumulative GP profit (for catch-up tracking)
  let lpProfitTotal = 0;

  const lpFlows = [-lpEquity];
  const gpFlows = [-gpEquity];
  const yearlyDist = [];

  for (let i = 1; i < irrFlows.length; i++) {
    let avail = irrFlows[i];
    let lp = 0, gp = 0;

    if (avail <= 0) {
      // Additional draw or negative CF — split pro-rata
      lp = avail * lpPct;
      gp = avail * gpPct;
    } else {
      // Accrue compound preferred on LP outstanding capital
      lpPrefAccrued += lpCapOut * prefRate;

      // Step 1 — LP preferred return
      if (lpPrefAccrued > 0 && avail > 0) {
        const pay = Math.min(avail, lpPrefAccrued);
        lp += pay;
        lpPrefAccrued -= pay;
        avail -= pay;
      }

      // Step 2a — Return LP capital
      if (lpCapOut > 0 && avail > 0) {
        const roc = Math.min(avail, lpCapOut);
        lp += roc;
        lpCapOut -= roc;
        avail -= roc;
      }

      // Step 2b — Return GP capital
      if (gpCapOut > 0 && avail > 0) {
        const roc = Math.min(avail, gpCapOut);
        gp += roc;
        gpCapOut -= roc;
        avail -= roc;
      }

      // Step 3 — GP catch-up
      // GP gets catchUpGP% of profits until GP profit = gpSplit / (lpSplit+gpSplit) of all profit
      if (catchUpGP > 0 && avail > 0) {
        const totalProfitSoFar = lpProfitTotal + gpProfitTotal + avail;
        const gpTargetProfit   = totalProfitSoFar * gpSplit;
        const gpNeeded         = Math.max(0, gpTargetProfit - gpProfitTotal);
        // GP can only receive catchUpGP% of available per period
        const catchUp = Math.min(avail * catchUpGP, gpNeeded, avail);
        if (catchUp > 0) {
          gp += catchUp;
          gpProfitTotal += catchUp;
          avail -= catchUp;
        }
      }

      // Step 4 — Profit split per active tier
      if (avail > 0) {
        const lpProfit = avail * lpSplit;
        const gpProfit = avail * gpSplit;
        lp += lpProfit;
        gp += gpProfit;
        lpProfitTotal += lpProfit;
        gpProfitTotal += gpProfit;
        avail = 0;
      }
    }

    lpFlows.push(lp);
    gpFlows.push(gp);
    yearlyDist.push({ year: i, lp, gp });
  }

  const lpIRR = calcIRR(lpFlows) * 100;
  const gpIRR = calcIRR(gpFlows) * 100;
  const lpDist = lpFlows.slice(1).reduce((s, v) => s + Math.max(0, v), 0);
  const gpDist = gpFlows.slice(1).reduce((s, v) => s + Math.max(0, v), 0);

  return {
    lpEquity,
    gpEquity,
    lpIRR,
    gpIRR,
    lpEquityMultiple: lpEquity > 0 ? lpDist / lpEquity : 0,
    gpEquityMultiple: gpEquity > 0 ? gpDist / gpEquity : 0,
    lpTotalDistributions: lpDist,
    gpTotalDistributions: gpDist,
    gpPromote:    gpDist - gpEquity,   // GP upside above capital return
    activeTier,
    projectIRR,
    yearlyDist,
    lpFlows,
    gpFlows,
  };
}

// ─── Sensitivity tables ───────────────────────────────────────────────────────

export function buildSensitivityTable(baseInputs, rowVar, colVar, rowValues, colValues) {
  return rowValues.map((rowVal) =>
    colValues.map((colVal) => {
      const inputs = { ...baseInputs, [rowVar]: rowVal, [colVar]: colVal };
      const { returns } = underwrite(inputs);
      return {
        irr: returns.irr,
        equityMultiple: returns.equityMultiple,
        cashOnCash: returns.yearOneCashOnCash,
      };
    })
  );
}

export function sensitivityRange(base, steps, stepSize) {
  const half = Math.floor(steps / 2);
  return Array.from({ length: steps }, (_, i) => {
    const delta = (i - half) * stepSize;
    return Math.round((base + delta) * 100) / 100;
  });
}
