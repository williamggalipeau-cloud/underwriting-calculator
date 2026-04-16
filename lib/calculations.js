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

// ─── Rollover cost calculation (normalized annually) ─────────────────────────

function annualRolloverCosts(inputs, effectiveRentPSF) {
  const {
    squareFootage,
    avgLeaseTerm,
    renewalProbabilityPct,
    tiPerSFNew,
    tiPerSFRenewal,
    leasingCommissionNewPct,
    leasingCommissionRenewalPct,
  } = inputs;

  if (avgLeaseTerm <= 0) return 0;

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
    tiAndLeasing: 0,
    occupiedMonths: 0,
  }));

  let occupied        = unit.leaseStatus === "occupied";
  let countdown       = occupied ? unit.monthsRemaining : 0;
  let vacantCountdown = !occupied ? Math.max(1, inputs.downtimeBetweenLeases) : 0;
  let contractRentPSF = unit.currentRentPSF;

  for (let m = 0; m < holdPeriodYears * 12; m++) {
    const yr = Math.floor(m / 12);
    const marketRent = inputs.rentPerSF * Math.pow(1 + inputs.annualRentEscalationPct / 100, m / 12);

    if (occupied) {
      results[yr].revenue       += (contractRentPSF * unit.squareFeet) / 12;
      results[yr].occupiedMonths++;
      countdown--;

      if (countdown <= 0) {
        const renewP       = unit.renewalProbabilityPct / 100;
        const newTermYears = unit.newLeaseTerm / 12;
        const ti = (renewP * unit.tiRenewalPSF + (1 - renewP) * unit.tiNewPSF) * unit.squareFeet;
        const lc = (
          renewP       * marketRent * newTermYears * (inputs.leasingCommissionRenewalPct / 100) +
          (1 - renewP) * marketRent * newTermYears * (inputs.leasingCommissionNewPct    / 100)
        ) * unit.squareFeet;
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
  const totalAcquisitionCost = purchasePrice + closingCostsDetail.total;
  const equityRequired       = totalAcquisitionCost - loanAmount;

  // ── Debt ──
  const rate                   = interestRatePct / 100;
  const ioAnnualDebtService    = loanAmount * rate;
  const amortPayment           = monthlyPayment(loanAmount, rate, amortizationYears);
  const amortAnnualDebtService = amortPayment * 12;
  const loanConstant           = amortizationYears > 0 ? amortAnnualDebtService / loanAmount : rate;

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

    let grossRevenue, physicalVacancy, tiLC;

    if (hasUnits) {
      const unitRevenue = unitSims.reduce((s, yr) => s + yr[i].revenue, 0);
      const otherIncome = otherIncomePSF * totalUnitSF;
      const scheduled   = effectiveRentPSF * totalUnitSF;
      grossRevenue      = scheduled + otherIncome;
      physicalVacancy   = Math.max(0, scheduled - unitRevenue);
      tiLC              = unitSims.reduce((s, yr) => s + yr[i].tiAndLeasing, 0);
    } else {
      grossRevenue    = (effectiveRentPSF + otherIncomePSF) * squareFootage;
      physicalVacancy = grossRevenue * (vacancyPct / 100);
      tiLC            = annualRolloverCosts(inputs, effectiveRentPSF);
    }

    const postVacancy = grossRevenue - physicalVacancy;
    const creditLoss  = postVacancy * (creditLossPct / 100);
    const egr         = postVacancy - creditLoss;

    const sf          = hasUnits ? totalUnitSF : squareFootage;
    const opExpenses  = landlordExpenses(inputs, sf);
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

    const isIO     = year <= ioPeriodYears;
    const annualDS = isIO ? ioAnnualDebtService : amortAnnualDebtService;
    const pretaxCF = adjustedNOI - annualDS;

    const monthsPaid = isIO ? 0 : (year - ioPeriodYears) * 12;
    const balance    = isIO
      ? loanAmount
      : remainingBalance(loanAmount, rate, amortizationYears, monthsPaid);

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
      tiAndLeasing: tiLC,
      adjustedNOI,
      debtService:    annualDS,
      pretaxCashFlow: pretaxCF,
      loanBalance:    balance,
    });
  }

  // ── Exit ──
  const exitNOI         = annualCashFlows[holdPeriodYears - 1].noi;
  const exitValue       = exitNOI / (exitCapRatePct / 100);
  const sellingCosts    = exitValue * (sellingCostsPct / 100);
  const finalBalance    = annualCashFlows[holdPeriodYears - 1].loanBalance;
  const equityReversion = exitValue - sellingCosts - finalBalance;

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
    monthlyPayment: ioPeriodYears > 0 ? ioAnnualDebtService / 12 : amortPayment,
    dscr,
    adjustedDscr: adjDscr,
    ltv,
    equityRequired,
    loanConstant: loanConstant * 100,
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
    equityReversion,
    totalEquityInvested: equityRequired,
    annualRolloverCosts: avgAnnualRollover,
  };

  return { annualCashFlows, debt, returns, closingCosts: closingCostsDetail };
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
