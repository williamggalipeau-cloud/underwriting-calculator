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
  titleInsuranceOwner:  27000,
  titleInsuranceLender: 11700,
  transferTax:          45000,
  loanOrigination:      58500,
  acquisitionFee:       90000,
  legalFees:            15000,
  environmentalReport:  3500,
  appraisal:            7500,
  surveyAndPCA:         5000,
  miscClosingCosts:     2500,
};

function computeClosingCosts(inputs, loanAmount) {
  const { purchasePrice } = inputs;
  const cc = inputs.closingCosts ?? DEFAULT_CLOSING_COSTS;

  // Support legacy % fields for old snapshots
  const titleInsuranceOwner  = cc.titleInsuranceOwner  ?? (purchasePrice * ((cc.titleInsuranceOwnerPct  ?? 0) / 100));
  const titleInsuranceLender = cc.titleInsuranceLender ?? (loanAmount    * ((cc.titleInsuranceLenderPct ?? 0) / 100));
  const transferTax          = cc.transferTax          ?? (purchasePrice * ((cc.transferTaxPct          ?? 0) / 100));
  const loanOrigination      = cc.loanOrigination      ?? (loanAmount    * ((cc.loanOriginationPct      ?? 0) / 100));
  const acquisitionFee       = cc.acquisitionFee       ?? (purchasePrice * ((cc.acquisitionFeePct       ?? 0) / 100));
  const { legalFees, environmentalReport, appraisal, surveyAndPCA, miscClosingCosts } = cc;

  const total =
    titleInsuranceOwner + titleInsuranceLender + transferTax +
    loanOrigination + acquisitionFee + legalFees + environmentalReport +
    appraisal + surveyAndPCA + miscClosingCosts;

  return {
    titleInsuranceOwner,
    titleInsuranceLender,
    transferTax,
    loanOrigination,
    acquisitionFee,
    legalFees,
    environmentalReport,
    appraisal,
    surveyAndPCA,
    miscClosingCosts,
    total,
    totalAsPctOfPurchasePrice: purchasePrice > 0 ? (total / purchasePrice) * 100 : 0,
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

export function computeSellingCosts(sellingCosts, exitValue, customDispositionItems = []) {
  const sc = sellingCosts ?? DEFAULT_SELLING_COSTS;
  const brokerCommission  = exitValue * ((sc.brokerCommissionPct  ?? 0) / 100);
  const transferTax       = exitValue * ((sc.transferTaxPct       ?? 0) / 100);
  const titleInsurance    = exitValue * ((sc.titleInsurancePct    ?? 0) / 100);
  const legalFees         = sc.legalFees          ?? 0;
  const miscDisposition   = sc.miscDispositionCosts ?? 0;
  const customTotal       = customDispositionItems.reduce((sum, it) => {
    if (it.basis === "pct") return sum + exitValue * ((it.value ?? 0) / 100);
    return sum + (it.value ?? 0);
  }, 0);
  const total = brokerCommission + transferTax + titleInsurance + legalFees + miscDisposition + customTotal;
  return {
    brokerCommission,
    transferTax,
    titleInsurance,
    legalFees,
    miscDisposition,
    customTotal,
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
    (cc.landscaping     ?? 0) +
    (cc.roofing         ?? 0) +
    (cc.signage         ?? 0) +
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
    revenue: 0,          // actual contracted rent collected (occupied months)
    scheduledRevenue: 0, // gross potential: contracted when occupied, market when vacant
    vacancyLoss: 0,      // rent lost during vacant periods (at market rate)
    tiConcession: 0,     // TI allowance booked as income-side deduction at rollover
    creditLoss: 0,       // bad debt (% of net revenue after vacancy)
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

  // Per-unit expense PSF — falls back to property-level rates
  const reTaxPSF  = unit.realEstateTaxPSF ?? inputs.realEstateTaxPSF ?? 0;
  const insPSF    = unit.insurancePSF     ?? inputs.insurancePSF     ?? 0;
  const utilsPSF  = unit.utilitiesPSF     ?? inputs.utilitiesPSF     ?? 0;
  const maintPSF  = unit.maintenancePSF   ?? inputs.maintenancePSF   ?? 0;
  const janitPSF  = unit.janitorialPSF    ?? inputs.janitorialPSF    ?? 0;

  const unitOpEx = {
    realEstateTax: (isMG || isGross) ? reTaxPSF  * sf : 0,
    insurance:     (isMG || isGross) ? insPSF    * sf : 0,
    utilities:     isGross           ? utilsPSF  * sf : 0,
    maintenance:   isGross           ? maintPSF  * sf : 0,
    janitorial:    isGross           ? janitPSF  * sf : 0,
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

  // Per-unit in-lease escalation (annual % bump on contracted rent during lease term)
  const inLeaseEscPct = (unit.annualEscalationPct ?? inputs.annualRentEscalationPct ?? 0) / 100;
  const monthlyEscFactor = Math.pow(1 + inLeaseEscPct, 1 / 12);

  let occupied        = unit.leaseStatus === "occupied";
  let countdown       = occupied ? unit.monthsRemaining : 0;
  const unitDowntime = unit.downtimeBetweenLeases ?? inputs.downtimeBetweenLeases ?? 2;
  let vacantCountdown = !occupied ? Math.max(1, unitDowntime) : 0;
  let contractRentPSF = unit.currentRentPSF;

  for (let m = 0; m < holdPeriodYears * 12; m++) {
    const yr = Math.floor(m / 12);
    const marketRent = inputs.rentPerSF * Math.pow(1 + inputs.annualRentEscalationPct / 100, m / 12);

    if (occupied) {
      const monthRevenue = (contractRentPSF * sf) / 12;
      results[yr].revenue          += monthRevenue;
      results[yr].scheduledRevenue += monthRevenue; // scheduled = contracted when occupied
      results[yr].occupiedMonths++;

      // Apply monthly in-lease escalation bump to contracted rent
      contractRentPSF *= monthlyEscFactor;
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

        // Free rent: income cost of rent-free period (deducted via tiAndLeasing)
        const freeRentNew     = (unit.freeRentMonthsNew     ?? inputs.freeRentMonthsNew     ?? 0) / 12;
        const freeRentRenewal = (unit.freeRentMonthsRenewal ?? inputs.freeRentMonthsRenewal ?? 0) / 12;
        const freeRentCost = (
          (1 - renewP) * freeRentNew     * marketRent * sf +
          renewP       * freeRentRenewal * marketRent * sf
        );

        // TI concession: income-side deduction at rollover (separate from capital TI)
        const tiConcNew     = (unit.tiConcessionPSFNew     ?? inputs.tiConcessionPSFNew     ?? 0) * sf;
        const tiConcRenewal = (unit.tiConcessionPSFRenewal ?? inputs.tiConcessionPSFRenewal ?? 0) * sf;
        const tiConc = (1 - renewP) * tiConcNew + renewP * tiConcRenewal;
        results[yr].tiConcession   += tiConc;
        results[yr].scheduledRevenue -= tiConc; // deduct from gross as income concession

        // Custom rollover items ($/SF at each lease event)
        const customRollover = (inputs.customRolloverItems ?? [])
          .reduce((sum, it) => sum + (it.psf ?? 0) * sf, 0);

        results[yr].tiAndLeasing += ti + lc + freeRentCost + customRollover;

        const expectedVacancy = Math.round((1 - renewP) * unitDowntime);
        // Re-leased at market rent; new lease uses its own escalation going forward
        contractRentPSF = marketRent;

        if (expectedVacancy <= 0) {
          countdown = unit.newLeaseTerm;
        } else {
          occupied        = false;
          vacantCountdown = expectedVacancy;
        }
      }
    } else {
      // Vacant month: loss is at market rate; scheduled also uses market rate
      const monthVacancyLoss = (marketRent * sf) / 12;
      results[yr].vacancyLoss      += monthVacancyLoss;
      results[yr].scheduledRevenue += monthVacancyLoss;
      vacantCountdown--;
      if (vacantCountdown <= 0) {
        occupied  = true;
        countdown = unit.newLeaseTerm;
      }
    }
  }

  // Per-unit credit loss applied annually on net revenue after vacancy
  const unitCreditLossPct = (unit.creditLossPct ?? inputs.creditLossPct ?? 0) / 100;
  for (let y = 0; y < holdPeriodYears; y++) {
    const netRev = results[y].scheduledRevenue - results[y].vacancyLoss;
    results[y].creditLoss = netRev * unitCreditLossPct;
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

function getEffectiveRate(inputs, year = 1) {
  if (!inputs.floatingRate) return inputs.interestRatePct / 100;

  // Per-year SOFR forward curve: if populated, use curve value for this year;
  // otherwise fall back to flat indexRatePct.
  const curve = inputs.sofrForwardCurve;
  const curveSOFR =
    Array.isArray(curve) && curve.length >= year && curve[year - 1] != null
      ? curve[year - 1]
      : (inputs.indexRatePct ?? 0);

  const floating = (curveSOFR + (inputs.spreadPct ?? 0)) / 100;

  if (inputs.hedgingType === "cap" && inputs.capStrikeRatePct) {
    const capTerm = inputs.capTermYears ?? inputs.loanTermYears ?? 999;
    if (year <= capTerm) return Math.min(floating, inputs.capStrikeRatePct / 100);
  }
  if (inputs.hedgingType === "swap" && inputs.swapFixedRatePct) {
    const swapTerm = inputs.swapTermYears ?? inputs.loanTermYears ?? 999;
    if (year <= swapTerm) return inputs.swapFixedRatePct / 100;
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

  // ── Pre-compute unit simulations (needed for Year 1 NOI and loan sizing) ──
  const hasUnits    = (inputs.units ?? []).length > 0;
  const safeUnits   = inputs.units ?? [];
  const totalUnitSF = hasUnits ? safeUnits.reduce((s, u) => s + u.squareFeet, 0) : squareFootage;
  const unitSims    = hasUnits
    ? safeUnits.map((u) => simulateUnit(u, inputs, holdPeriodYears))
    : [];

  // ── Year 1 NOI pre-computation (for loan sizing constraints) ──
  // Mirrors the year-loop logic for year=1 but runs before loanAmount is known.
  let _y1NOI = 0;
  {
    const sf_ = hasUnits ? totalUnitSF : squareFootage;
    const customIncome_  = (inputs.customIncomeItems  ?? []).reduce((s, it) => s + (it.psf ?? 0) * sf_, 0);
    const customOpEx_    = (inputs.customExpenseItems ?? []).reduce((s, it) => s + (it.psf ?? 0) * sf_, 0);
    let grossRev_, vacancy_, opEx_;
    if (hasUnits) {
      const unitScheduled_   = unitSims.reduce((s, yr) => s + yr[0].scheduledRevenue, 0);
      const unitVacancyLoss_ = unitSims.reduce((s, yr) => s + yr[0].vacancyLoss, 0);
      const unitOtherInc_    = unitSims.reduce((s, yr) => s + yr[0].otherIncome, 0);
      grossRev_ = unitScheduled_ + unitOtherInc_ + customIncome_;
      vacancy_  = unitVacancyLoss_;
      opEx_ = {
        realEstateTax: unitSims.reduce((s, yr) => s + yr[0].realEstateTax, 0),
        insurance:     unitSims.reduce((s, yr) => s + yr[0].insurance,     0),
        utilities:     unitSims.reduce((s, yr) => s + yr[0].utilities,     0),
        maintenance:   unitSims.reduce((s, yr) => s + yr[0].maintenance,   0),
        janitorial:    unitSims.reduce((s, yr) => s + yr[0].janitorial,    0),
      };
    } else {
      const renewalRate_  = (inputs.renewalProbabilityPct ?? 0) / 100;
      const avgLease_     = inputs.avgLeaseTerm ?? 1;
      const rollSF_       = squareFootage / avgLease_;
      const tiConc_       = (inputs.tiConcessionPSFNew     ?? 0) * rollSF_ * (1 - renewalRate_)
                          + (inputs.tiConcessionPSFRenewal ?? 0) * rollSF_ * renewalRate_;
      grossRev_ = (rentPerSF + otherIncomePSF) * squareFootage + customIncome_ - tiConc_;
      vacancy_  = grossRev_ * (vacancyPct / 100);
      opEx_     = landlordExpenses(inputs, squareFootage);
    }
    const postVac_ = grossRev_ - vacancy_;
    const credLoss_ = postVac_ * (creditLossPct / 100);
    const egr_      = postVac_ - credLoss_;
    const mgmt_     = egr_ * (managementFeePct / 100);
    const leasFees_ = (inputs.leasingFeesPSF ?? 0) * sf_;
    const capRes_   = capitalReservesPSF * sf_;
    const amFees_   = (inputs.amFeeItems ?? []).reduce((sum, it) => {
      if (it.basis === "psf")    return sum + (it.value ?? 0) * sf_;
      if (it.basis === "pctEGR") return sum + egr_ * ((it.value ?? 0) / 100);
      return sum + (it.value ?? 0);
    }, 0);
    const totalOpEx_ =
      opEx_.realEstateTax + opEx_.insurance + opEx_.utilities +
      opEx_.maintenance + opEx_.janitorial + mgmt_ + leasFees_ +
      capRes_ + customOpEx_ + amFees_;
    _y1NOI = egr_ - totalOpEx_;
  }

  // ── Acquisition — multi-constraint loan sizing ──
  // Binding constraint = min(LTV, DSCR, LTC, Debt Yield) where each is enabled.
  const ltvLoanAmount    = purchasePrice * (ltvPct / 100);
  const effectiveRateY1  = getEffectiveRate(inputs, 1);
  // Loan constant (annual DS per $1 of loan) is rate-independent of loan size
  const _pmtPer1 = monthlyPayment(1, effectiveRateY1, amortizationYears);
  const _loanConstant = ioPeriodYears > 0 ? effectiveRateY1 : _pmtPer1 * 12;

  const lsc = inputs.loanSizingConstraints ?? {};

  let dscrLimitAmount = Infinity;
  if (lsc.minDSCREnabled && (lsc.minDSCR ?? 0) > 0 && _loanConstant > 0) {
    dscrLimitAmount = _y1NOI / (_loanConstant * (lsc.minDSCR ?? 1.25));
  }

  // LTC: use preliminary CC (based on LTV loan) to break the circular dependency
  let ltcLimitAmount = Infinity;
  if (lsc.maxLTCEnabled && (lsc.maxLTCPct ?? 0) > 0) {
    const prelimCC  = computeClosingCosts(inputs, ltvLoanAmount);
    const totalCost = purchasePrice + prelimCC.total;
    ltcLimitAmount  = totalCost * ((lsc.maxLTCPct ?? 75) / 100);
  }

  let debtYieldLimitAmount = Infinity;
  if (lsc.minDebtYieldEnabled && (lsc.minDebtYieldPct ?? 0) > 0) {
    debtYieldLimitAmount = _y1NOI / ((lsc.minDebtYieldPct ?? 8) / 100);
  }

  const _candidates = [
    { name: "LTV",        amount: ltvLoanAmount        },
    { name: "DSCR",       amount: dscrLimitAmount       },
    { name: "LTC",        amount: ltcLimitAmount        },
    { name: "Debt Yield", amount: debtYieldLimitAmount  },
  ].filter((c) => isFinite(c.amount) && c.amount > 0);

  const _binding         = _candidates.reduce((mn, c) => (c.amount < mn.amount ? c : mn), _candidates[0]);
  const loanAmount       = _binding.amount;
  const bindingConstraint = _binding.name;

  const closingCostsDetail   = computeClosingCosts(inputs, loanAmount);
  const hedgingPremium       = (inputs.hedgingType === "cap")
    ? loanAmount * ((inputs.capPremiumPct ?? 0) / 100)
    : 0;
  const totalAcquisitionCost = purchasePrice + closingCostsDetail.total + hedgingPremium;
  const equityRequired       = totalAcquisitionCost - loanAmount;
  const capPremium           = hedgingPremium; // alias for display

  // ── Debt (year 1 metrics for summary) ──
  const effectiveRate            = getEffectiveRate(inputs, 1);
  const ioAnnualDebtService1     = loanAmount * effectiveRate;
  const amortPayment1            = monthlyPayment(loanAmount, effectiveRate, amortizationYears);
  const amortAnnualDebtService1  = amortPayment1 * 12;
  const loanConstant             = amortizationYears > 0 ? amortAnnualDebtService1 / loanAmount : effectiveRate;

  // Rate schedule per year — hedge only applies within its term
  const displayRateSchedule = Array.from({ length: holdPeriodYears }, (_, i) =>
    getEffectiveRate(inputs, i + 1) * 100
  );

  // ── TI Reserve (lender holdback, drawn down as TI is incurred) ──
  const tiRes            = inputs.tiReserve ?? {};
  const tiReserveEnabled = !!(tiRes.enabled);
  const _tiSF            = hasUnits ? totalUnitSF : squareFootage;
  const tiReserveTotal   = tiReserveEnabled ? (tiRes.reservePSF ?? 0) * _tiSF : 0;
  const _minDrawDSCR     = tiRes.minDrawDSCR ?? 1.10;
  let   tiReserveRemaining = tiReserveTotal;
  let   totalTIDrawn       = 0;

  // ── Year-by-year cash flows ──
  const annualCashFlows = [];

  for (let year = 1; year <= holdPeriodYears; year++) {
    const i               = year - 1;
    const escalation      = Math.pow(1 + annualRentEscalationPct / 100, i);
    const effectiveRentPSF = rentPerSF * escalation;

    let grossRevenue, physicalVacancy, tiLC, opExpenses;

    // Custom income and expense items (portfolio-level, always applied)
    const sf = hasUnits ? totalUnitSF : squareFootage;
    const customIncome  = (inputs.customIncomeItems  ?? []).reduce((s, it) => s + (it.psf ?? 0) * sf, 0);
    const customOpExAmt = (inputs.customExpenseItems ?? []).reduce((s, it) => s + (it.psf ?? 0) * sf, 0);

    let tiConcessionAmt = 0;
    let unitCreditLoss  = 0;

    if (hasUnits) {
      // Income driven entirely by unit-level simulation:
      // scheduledRevenue = contracted rent when occupied, market rent when vacant
      //                    (already reduced by TI concessions at rollover events)
      // vacancyLoss = market rent lost during turnover periods
      const unitScheduled   = unitSims.reduce((s, yr) => s + yr[i].scheduledRevenue, 0);
      const unitVacancyLoss = unitSims.reduce((s, yr) => s + yr[i].vacancyLoss, 0);
      const unitOtherIncome = unitSims.reduce((s, yr) => s + yr[i].otherIncome, 0);
      tiConcessionAmt       = unitSims.reduce((s, yr) => s + yr[i].tiConcession, 0);
      unitCreditLoss        = unitSims.reduce((s, yr) => s + yr[i].creditLoss,   0);
      grossRevenue          = unitScheduled + unitOtherIncome + customIncome;
      physicalVacancy       = unitVacancyLoss;
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
      const renewalRate = (inputs.renewalProbabilityPct ?? 0) / 100;
      const avgLeaseTerm = inputs.avgLeaseTerm ?? 1;
      const rolloverSF = squareFootage / avgLeaseTerm;
      const tiConcNewAnnual     = (inputs.tiConcessionPSFNew     ?? 0) * rolloverSF * (1 - renewalRate);
      const tiConcRenewalAnnual = (inputs.tiConcessionPSFRenewal ?? 0) * rolloverSF * renewalRate;
      tiConcessionAmt = tiConcNewAnnual + tiConcRenewalAnnual;
      grossRevenue    = (effectiveRentPSF + otherIncomePSF) * squareFootage + customIncome - tiConcessionAmt;
      physicalVacancy = grossRevenue * (vacancyPct / 100);
      tiLC            = annualRolloverCosts(inputs, effectiveRentPSF);
      opExpenses      = landlordExpenses(inputs, squareFootage);
    }

    const postVacancy = grossRevenue - physicalVacancy;
    const creditLoss  = hasUnits ? unitCreditLoss : postVacancy * (creditLossPct / 100);
    const egr         = postVacancy - creditLoss;

    const mgmtFee     = egr * (managementFeePct / 100);
    const leasingFees = (inputs.leasingFeesPSF ?? 0) * sf;
    const capReserves = capitalReservesPSF * sf;
    const amFees      = (inputs.amFeeItems ?? []).reduce((sum, it) => {
      if (it.basis === "psf")    return sum + (it.value ?? 0) * sf;
      if (it.basis === "pctEGR") return sum + egr * ((it.value ?? 0) / 100);
      return sum + (it.value ?? 0); // "fixed"
    }, 0);
    const totalOpEx   =
      opExpenses.realEstateTax +
      opExpenses.insurance +
      opExpenses.utilities +
      opExpenses.maintenance +
      opExpenses.janitorial +
      mgmtFee +
      leasingFees +
      capReserves +
      customOpExAmt +
      amFees;

    const noi         = egr - totalOpEx;
    const adjustedNOI = noi - tiLC;

    // ── Debt service — rate respects hedge term (cap/swap expires after its term) ──
    const yearRate    = getEffectiveRate(inputs, year);
    const isIO        = year <= ioPeriodYears;
    const prevBalance = annualCashFlows.length > 0
      ? annualCashFlows[annualCashFlows.length - 1].loanBalance
      : loanAmount;

    let annualDS, balance;
    if (isIO) {
      annualDS = prevBalance * yearRate;
      balance  = prevBalance;
    } else {
      const amortMonthsElapsed  = (year - 1 - ioPeriodYears) * 12;
      const remainingAmortYears = Math.max(amortizationYears - amortMonthsElapsed / 12, 1 / 12);
      const pmt = monthlyPayment(prevBalance, yearRate, remainingAmortYears);
      annualDS  = pmt * 12;
      balance   = remainingBalance(prevBalance, yearRate, remainingAmortYears, 12);
    }

    // Extension fee (charged in year the option is exercised)
    const extFee = extensionFeeForYear(inputs, year, prevBalance);

    // ── TI draw from reserve ──
    // Lender releases holdback funds if current-year DSCR meets the draw test.
    // Approved draws increase the outstanding balance for subsequent years.
    let tiDrawNeeded    = tiLC;
    let tiDrawApproved  = 0;
    let tiDrawShortfall = 0;
    if (tiReserveEnabled && tiDrawNeeded > 0 && tiReserveRemaining > 0) {
      const currentDSCR = annualDS > 0 ? noi / annualDS : Infinity;
      if (currentDSCR >= _minDrawDSCR) {
        tiDrawApproved    = Math.min(tiDrawNeeded, tiReserveRemaining);
        tiReserveRemaining -= tiDrawApproved;
        totalTIDrawn      += tiDrawApproved;
      }
      tiDrawShortfall = tiDrawNeeded - tiDrawApproved;
    }

    // Equity bears only the TI shortfall (drawn amount is reimbursed by lender)
    const pretaxCF = noi - (tiLC - tiDrawApproved) - annualDS - extFee;
    // Loan balance grows by the draw amount (disbursed from holdback into balance)
    balance += tiDrawApproved;

    annualCashFlows.push({
      year,
      grossRevenue,
      physicalVacancy,
      tiConcession: tiConcessionAmt,
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
      interestRate:        yearRate * 100,
      extensionFee:        extFee,
      debtService:         annualDS,
      pretaxCashFlow:      pretaxCF,
      loanBalance:         balance,
      tiDrawNeeded,
      tiDrawApproved,
      tiDrawShortfall,
      tiReserveRemaining,
    });
  }

  // ── Exit ──
  const exitNOI            = annualCashFlows[holdPeriodYears - 1].noi;
  const exitValue          = exitNOI / (exitCapRatePct / 100);
  const sellingCostsDetail = computeSellingCosts(inputs.sellingCosts, exitValue, inputs.customDispositionItems ?? []);
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

  const ltc = (purchasePrice + closingCostsDetail.total) > 0
    ? (loanAmount / (purchasePrice + closingCostsDetail.total)) * 100
    : 0;
  const debtYield = loanAmount > 0 ? (_y1NOI / loanAmount) * 100 : 0;

  const debt = {
    loanAmount,
    annualDebtService: year1DS,
    monthlyPayment: ioPeriodYears > 0 ? ioAnnualDebtService1 / 12 : amortPayment1,
    dscr,
    adjustedDscr: adjDscr,
    ltv,
    ltc,
    debtYield,
    year1NOI: _y1NOI,
    equityRequired,
    loanConstant:        loanConstant * 100,
    effectiveRate:       effectiveRate * 100,
    capPremium,
    rateSchedule:        displayRateSchedule,
    bindingConstraint,
    constraintAmounts: {
      ltv:        Math.round(ltvLoanAmount),
      dscr:       isFinite(dscrLimitAmount)       ? Math.round(dscrLimitAmount)       : null,
      ltc:        isFinite(ltcLimitAmount)         ? Math.round(ltcLimitAmount)         : null,
      debtYield:  isFinite(debtYieldLimitAmount)   ? Math.round(debtYieldLimitAmount)   : null,
    },
    tiReserveEnabled,
    tiReserveTotal,
    totalTIDrawn,
    totalCommitment: loanAmount + tiReserveTotal,
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

  const waterfallResult = (inputs.waterfallEnabled && inputs.waterfall)
    ? computeWaterfall(irrFlows, equityRequired, inputs.waterfall)
    : null;

  return { annualCashFlows, debt, returns, irrFlows, closingCosts: closingCostsDetail, sellingCosts: sellingCostsDetail, waterfall: waterfallResult };
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
