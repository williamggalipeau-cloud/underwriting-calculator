import { addMonthsISO, analysisStart, optionRentPSF, parseRenewalBasis } from "@/lib/leases";
import { laterLeaseMonths, laterLeaseRentOn, moveOutMonth } from "@/lib/leaseHistory";
import { addYears, computeDatedWaterfall } from "@/lib/fundTimeline";
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
  // 1.1.12 (code review): no IRR without money both in and out (all-zero
  // flows used to return 450%).
  if (!cashFlows.some((c) => c > 0) || !cashFlows.some((c) => c < 0)) return NaN;
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

export function simulateUnit(unit, inputs, holdPeriodYears) {
  const results = Array.from({ length: holdPeriodYears }, () => ({
    revenue: 0,          // actual contracted rent collected (occupied months)
    scheduledRevenue: 0, // gross potential: contracted when occupied, market when vacant
    vacancyLoss: 0,      // rent lost during vacant periods (at market rate)
    tiConcession: 0,     // TI allowance booked as income-side deduction at rollover
    creditLoss: 0,       // bad debt (% of net revenue after vacancy)
    otherIncome: 0,
    tiAndLeasing: 0,
    tiOnly: 0,           // tenant improvements alone (construction spending, for the construction management fee)
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
  // New-lease TI ($/SF): the unit's own rent roll figure, else the
  // construction-cost budget, else the property default.
  const tiNewPSFUnit = unit.tiNewPSF ?? (inputs.constructionCosts ? computeConstructionCostPSF(inputs.constructionCosts) : inputs.tiPerSFNew ?? 0);
  let pendingNewLease = null; // new-lease share still to be charged when re-let

  // Rent steps from an applied lease abstract: while the in-place lease runs,
  // each month's rent is the step in force on that date (abated months $0);
  // months outside the steps use the rent roll rent and escalation.
  const start = analysisStart(inputs);
  const steps = Array.isArray(unit.rentSteps) && unit.rentSteps.length && occupied
    ? unit.rentSteps.filter((s) => s && isFinite(s.rentPSF) && s.start).map((s) => ({ start: s.start, end: s.end || "9999-12-31", rentPSF: Number(s.rentPSF) }))
    : [];
  // The step in force at the start of hold month m.
  const stepAt = (m) => {
    const d = addMonthsISO(start, m);
    return steps.find((s) => s.start <= d && d <= s.end) ?? null;
  };
  let inPlaceLease = occupied; // the lease on the rent roll at the analysis start
  // Renewal options: the tenant renews on its option when the option rent is
  // at or below market (no downtime); otherwise the usual renewal assumptions.
  let optionsLeft = Math.max(0, Math.round(Number(unit.renewalOptions) || 0));
  const optionMonths = Math.round((Number(unit.renewalOptionYears) || 0) * 12) || unit.newLeaseTerm;
  const optionBasis = optionsLeft > 0 ? parseRenewalBasis(unit.renewalRentBasis) : null;

  // 1.1.24: leases signed after purchase (unit.laterLeases, lib/leaseHistory.js).
  // For the months a later lease covers, the unit earns that lease's rent and
  // its free rent, TI and commission are charged in its first month; between
  // the lease at purchase (or a vacancy at purchase) and the next later lease
  // the unit is vacant for the actual gap. The rollover assumptions below
  // apply only once the last later lease has ended. A unit with no later
  // leases takes none of these branches.
  const later = laterLeaseMonths(unit, inputs);
  // 1.1.27: a tenant that moved out with no replacement (unit.moveOut): the
  // lease running then ends that month (early, or after holding over), with
  // no renewal chance; the unit is vacant for its downtime and is then re-let
  // as a new lease. A lease recorded for later months takes over as above.
  const mo = moveOutMonth(unit, inputs);
  if (mo != null && occupied && !later.some((x) => x.ms < mo)) countdown = mo; // the lease at purchase runs to the move-out
  const vacate = () => { occupied = false; inPlaceLease = false; optionsLeft = 0; pendingNewLease = null; vacantCountdown = Math.max(1, unitDowntime); };

  for (let m = 0; m < holdPeriodYears * 12; m++) {
    const yr = Math.floor(m / 12);
    const marketRent = inputs.rentPerSF * Math.pow(1 + inputs.annualRentEscalationPct / 100, m / 12);

    if (later.length) {
      const L = later.find((x) => x.ms <= m && m < x.me);
      const more = later.some((x) => x.ms > m);
      if (L) {
        const l = L.lease, rent = laterLeaseRentOn(l, L.dateAt(m));
        if (m === L.ms) {
          const termYears = (L.me - L.ms) / 12;
          const lcPct = (l.lcPct != null ? Number(l.lcPct) / 100 : l.kind === "renewal" ? lcRenewalPct : lcNewPct);
          results[yr].tiAndLeasing += ((Number(l.tiPSF) || 0) + Number(l.rentPSF) * termYears * lcPct + ((Number(l.freeMonths) || 0) / 12) * Number(l.rentPSF)) * sf;
          results[yr].tiOnly += (Number(l.tiPSF) || 0) * sf;
        }
        if (m === L.me - 1 && !more) {
          // The last recorded lease's final month: hand back to the rollover
          // assumptions, which book this month's rent and then roll the lease.
          occupied = true; inPlaceLease = false; optionsLeft = 0; pendingNewLease = null;
          countdown = 1; contractRentPSF = rent;
        } else {
          const monthRevenue = (rent * sf) / 12;
          results[yr].revenue          += monthRevenue;
          results[yr].scheduledRevenue += monthRevenue;
          results[yr].occupiedMonths++;
          occupied = false; inPlaceLease = false; // the lease at purchase is over
          continue;
        }
      } else if (more && !occupied) {
        // The actual gap before the next recorded lease: vacant, at market rent.
        const monthVacancyLoss = (marketRent * sf) / 12;
        results[yr].vacancyLoss      += monthVacancyLoss;
        results[yr].scheduledRevenue += monthVacancyLoss;
        continue;
      }
    }

    if (occupied) {
      const step = inPlaceLease && steps.length ? stepAt(m) : null;
      if (step) contractRentPSF = step.rentPSF;
      const monthRevenue = (contractRentPSF * sf) / 12;
      results[yr].revenue          += monthRevenue;
      results[yr].scheduledRevenue += monthRevenue; // scheduled = contracted when occupied
      results[yr].occupiedMonths++;

      // Apply monthly in-lease escalation bump to contracted rent (a rent
      // step sets the next month's rent itself)
      if (!step) contractRentPSF *= monthlyEscFactor;
      else {
        // Carry the step's rent into the months after the steps end.
        const next = stepAt(m + 1);
        if (!next) contractRentPSF = step.rentPSF * monthlyEscFactor;
      }
      countdown--;

      if (countdown <= 0) {
        inPlaceLease = false;
        // 1.1.24: a lease signed since is recorded for later months, so this
        // lease's end is followed by the actual gap, not the rollover assumptions.
        if (later.some((x) => x.ms > m)) { occupied = false; continue; }
        if (mo === m + 1) { vacate(); continue; } // moved out: no rollover, vacant from next month
        // Renewal option: exercised when its rent is at or below market.
        const optRent = optionBasis && optionsLeft > 0 ? optionRentPSF(optionBasis, marketRent, contractRentPSF) : NaN;
        const exercise = isFinite(optRent) && optRent <= marketRent + 1e-9;
        if (exercise) optionsLeft--;
        const renewP       = exercise ? 1 : unit.renewalProbabilityPct / 100;
        const newTermYears = (exercise ? optionMonths : unit.newLeaseTerm) / 12;
        // TI and leasing commissions are charged to this unit when its lease
        // rolls: the renewal share now; the new-lease share now if the unit is
        // re-let without downtime, otherwise in the month it is re-let.
        const expectedVacancyNow = Math.round((1 - renewP) * unitDowntime);
        const newShare = expectedVacancyNow > 0 ? 0 : 1 - renewP;
        if (expectedVacancyNow > 0) pendingNewLease = 1 - renewP;
        const ti = (renewP * (unit.tiRenewalPSF ?? 0) + newShare * tiNewPSFUnit) * sf;
        const lc = (
          renewP   * marketRent * newTermYears * lcRenewalPct +
          newShare * marketRent * newTermYears * lcNewPct
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
        results[yr].tiOnly += ti;

        const expectedVacancy = Math.round((1 - renewP) * unitDowntime);
        // Re-leased at market rent (or the option rent); the new lease uses
        // its own escalation going forward
        contractRentPSF = exercise ? optRent : marketRent;

        if (exercise) {
          countdown = optionMonths;
        } else if (expectedVacancy <= 0) {
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
        // Re-let: the new lease's TI and leasing commission are charged to
        // this unit now (in full for a unit that started vacant).
        const share = pendingNewLease ?? 1;
        pendingNewLease = null;
        const newTermYears = unit.newLeaseTerm / 12;
        results[yr].tiAndLeasing += share * (tiNewPSFUnit + marketRent * newTermYears * lcNewPct) * sf;
        results[yr].tiOnly += share * tiNewPSFUnit * sf;
        occupied  = true;
        countdown = unit.newLeaseTerm;
        contractRentPSF = marketRent;
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
    // With replacement caps, the cap is renewed every term through the hold.
    const renewed = (inputs.capReplacementCost ?? 0) > 0 || (inputs.capReplacementCosts ?? []).some((c) => c > 0);
    // A per-year strike schedule (renewals struck at market) overrides the flat strike.
    const byYear = inputs.capStrikeRatesByYear;
    const strike = Array.isArray(byYear) && byYear[year - 1] > 0 ? byYear[year - 1] : inputs.capStrikeRatePct;
    if (renewed || year <= capTerm) return Math.min(floating, strike / 100);
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
  // No extension is needed in the year the property is sold.
  if (year >= (inputs.holdPeriodYears ?? Infinity)) return 0;
  const initialTerm  = inputs.loanTermYears ?? 10;
  const extTerm      = inputs.extensionTermYears ?? 1;
  const extFeePct    = (inputs.extensionFeePct ?? 0) / 100;
  for (let ext = 1; ext <= inputs.extensionCount; ext++) {
    if (year === initialTerm + (ext - 1) * extTerm) {
      return (inputs.extensionFeeAmount ?? 0) > 0 ? inputs.extensionFeeAmount : loanBalance * extFeePct;
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
    // pctEquity AM fees are excluded here: equity isn't known until the loan is sized.
    const amFees_   = (inputs.amFeeItems ?? []).reduce((sum, it) => {
      if (it.basis === "psf")    return sum + (it.value ?? 0) * sf_;
      if (it.basis === "pctEGR") return sum + egr_ * ((it.value ?? 0) / 100);
      if (it.basis === "pctEquity") return sum;
      return sum + (it.value ?? 0);
    }, 0);
    const totalOpEx_ =
      opEx_.realEstateTax + opEx_.insurance + opEx_.utilities +
      opEx_.maintenance + opEx_.janitorial + mgmt_ + leasFees_ +
      capRes_ + customOpEx_ + amFees_;
    _y1NOI = egr_ - totalOpEx_;
  }
  // Direct-NOI mode: NOI is an input (year-1 NOI growing at a fixed rate)
  // instead of being built from the rent roll.
  const noiOverride = !!inputs.noiOverrideEnabled;
  // The entered NOI is before property management. The PM fee is an
  // operating expense (NOI and value are net of it): pmFeePct of the asset
  // value (purchase price) per year when pmFeeBasis is "value", else of NOI.
  const pmPct = (inputs.pmFeePct ?? 0) / 100;
  const overrideNOIGross = (year) =>
    (inputs.noiYear1 ?? 0) * Math.pow(1 + (inputs.noiGrowthPct ?? 0) / 100, year - 1);
  const pmFeeFor = (year) =>
    inputs.pmFeeBasis === "value" ? (inputs.purchasePrice ?? 0) * pmPct : overrideNOIGross(year) * pmPct;
  const overrideNOI = (year) => overrideNOIGross(year) - pmFeeFor(year);
  if (noiOverride) _y1NOI = overrideNOI(1);

  // ── Acquisition — multi-constraint loan sizing ──
  // Binding constraint = min(LTV, DSCR, LTC, Debt Yield) where each is enabled.
  const ltvLoanAmount    = purchasePrice * (ltvPct / 100);
  const effectiveRateY1  = getEffectiveRate(inputs, 1);
  // Loan constant (annual DS per $1 of loan) is rate-independent of loan size
  const _pmtPer1 = monthlyPayment(1, effectiveRateY1, amortizationYears);
  // 1.1.12 (code review): no amortization period (0 or blank) = interest only.
  const interestOnly = !(amortizationYears > 0);
  const _loanConstant = ioPeriodYears > 0 || interestOnly ? effectiveRateY1 : _pmtPer1 * 12;

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
  ].filter((c) => isFinite(c.amount) && (c.amount > 0 || c.name === "LTV")); // 1.1.12: a 0% LTV (all cash) binds at a zero loan

  const _binding         = _candidates.reduce((mn, c) => (c.amount < mn.amount ? c : mn), _candidates[0] ?? { name: "LTV", amount: 0 });
  // Up-front capex budget: added to the loan when lender-funded, else paid by equity.
  const capexBudget      = inputs.capexBudget ?? 0;
  const capexLoanAmount  = inputs.capexLenderFunded ? capexBudget : 0;
  // An applied loan agreement (Documents tab) sets the actual loan amount.
  const loanAmount       = inputs.loanAmountActual > 0 ? inputs.loanAmountActual : _binding.amount + capexLoanAmount;
  const bindingConstraint = inputs.loanAmountActual > 0 ? "Loan agreement" : _binding.name;

  const closingCostsDetail   = computeClosingCosts(inputs, loanAmount);
  const hedgingPremium       = (inputs.hedgingType === "cap")
    ? ((inputs.capPremiumAmount ?? 0) > 0
        ? inputs.capPremiumAmount
        : loanAmount * ((inputs.capPremiumPct ?? 0) / 100))
    : 0;
  const totalAcquisitionCost = purchasePrice + closingCostsDetail.total + hedgingPremium + capexBudget;
  const equityRequired       = totalAcquisitionCost - loanAmount;
  const capPremium           = hedgingPremium; // alias for display

  // ── Debt (year 1 metrics for summary) ──
  const effectiveRate            = getEffectiveRate(inputs, 1);
  const ioAnnualDebtService1     = loanAmount * effectiveRate;
  const amortPayment1            = monthlyPayment(loanAmount, effectiveRate, amortizationYears);
  const amortAnnualDebtService1  = amortPayment1 * 12;
  const loanConstant             = ioPeriodYears > 0 || !(amortizationYears > 0)
    ? effectiveRate
    : amortAnnualDebtService1 / loanAmount;

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
      if (it.basis === "psf")       return sum + (it.value ?? 0) * sf;
      if (it.basis === "pctEGR")    return sum + egr * ((it.value ?? 0) / 100);
      if (it.basis === "pctEquity") return sum + equityRequired * ((it.value ?? 0) / 100);
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

    let noi           = egr - totalOpEx;
    // Direct-NOI mode: the entered NOI replaces the rent-roll build-up.
    // AM fees are charged below NOI (to equity) so they don't affect value.
    let belowLineAMFees = 0;
    let pmFeeOverride   = 0;
    if (noiOverride) {
      noi             = overrideNOI(year);
      pmFeeOverride   = pmFeeFor(year);
      belowLineAMFees = amFees;
      tiLC            = 0;
    }
    // Construction management, charged to the asset below NOI. cmFeeBasis:
    //   "value" (the default, as before): cmFeePct of the purchase price every year;
    //   "spend" (1.1.26, user 11/27): cmFeePct of construction spending, i.e. the
    //   capital budget (in year 1, when the model spends it) and each year's
    //   tenant improvements (not leasing commissions or free rent).
    const tiSpend = noiOverride ? 0 : unitSims.reduce((s, yr) => s + (yr[i].tiOnly ?? 0), 0);
    const cmFee = inputs.cmFeeBasis === "spend"
      ? ((year === 1 ? inputs.capexBudget ?? 0 : 0) + tiSpend) * ((inputs.cmFeePct ?? 0) / 100)
      : purchasePrice * ((inputs.cmFeePct ?? 0) / 100);
    const adjustedNOI = noi - tiLC;

    // ── Debt service — rate respects hedge term (cap/swap expires after its term) ──
    const yearRate    = getEffectiveRate(inputs, year);
    const isIO        = year <= ioPeriodYears || interestOnly;
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
    // Replacement rate cap bought at the end of each cap term while the loan is held.
    const capReplacement = inputs.hedgingType !== "cap" || year >= holdPeriodYears ? 0 : capReplacementCostAt(inputs, year);

    const pretaxCF = noi - (tiLC - tiDrawApproved) - annualDS - extFee - capReplacement - belowLineAMFees - cmFee;
    // Loan balance grows by the draw amount (disbursed from holdback into balance)
    balance += tiDrawApproved;

    // In direct-NOI mode the rent-roll line items don't drive NOI, so report
    // NOI as the top line and zero the build-up rather than show stale figures.
    const z = noiOverride;
    annualCashFlows.push({
      year,
      noiOverride:    z,
      grossRevenue:   z ? noi + pmFeeOverride : grossRevenue,
      physicalVacancy: z ? 0 : physicalVacancy,
      tiConcession:   z ? 0 : tiConcessionAmt,
      creditLoss:     z ? 0 : creditLoss,
      effectiveGrossRevenue: z ? noi + pmFeeOverride : egr,
      realEstateTax:  z ? 0 : opExpenses.realEstateTax,
      insurance:      z ? 0 : opExpenses.insurance,
      utilities:      z ? 0 : opExpenses.utilities,
      maintenance:    z ? 0 : opExpenses.maintenance,
      janitorial:     z ? 0 : opExpenses.janitorial,
      managementFee:  z ? pmFeeOverride : mgmtFee,
      leasingFees:    z ? 0 : leasingFees,
      capitalReserves: z ? 0 : capReserves,
      operatingExpenses: z ? pmFeeOverride : totalOpEx,
      noi,
      tiAndLeasing:   tiLC,
      adjustedNOI,
      interestRate:        yearRate * 100,
      extensionFee:        extFee,
      capReplacement,
      belowLineAMFees,
      assetMgmtFees:       amFees, // AM fees for the year (in opex for rent-roll deals, below NOI for direct NOI)
      constructionMgmtFee: cmFee,
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
  // A realized sale (disposition closing statement, Documents tab) replaces
  // the modelled exit value and, when given, the selling costs.
  const exitValue          = inputs.realizedSalePrice > 0 ? inputs.realizedSalePrice : exitNOI / (exitCapRatePct / 100);
  const sellingCostsDetail = inputs.realizedSalePrice > 0 && inputs.realizedSellingCosts > 0
    ? { ...computeSellingCosts(inputs.sellingCosts, exitValue, inputs.customDispositionItems ?? []), total: inputs.realizedSellingCosts, realized: true }
    : computeSellingCosts(inputs.sellingCosts, exitValue, inputs.customDispositionItems ?? []);
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
  // 1.1.12: one waterfall engine. The annual flows are placed a year apart and
  // run through the dated waterfall (lib/fundTimeline.js), so an asset's
  // LP / GP split follows the same rules as a fund's: GP capital pro rata,
  // compound pref, return of capital, catch-up, then marginal (or cliff)
  // tiers. Every positive year goes through the full waterfall.
  const base = "2001-01-01";
  const events = irrFlows.map((amount, i) => ({ date: addYears(base, i), amount: i === 0 ? -Math.abs(equityRequired) : amount, kind: i === 0 || amount < 0 ? "call" : "capital" }));
  const wf = computeDatedWaterfall(events, { ...waterfall, mgmtFeePct: 0, incomeTreatment: "full" });
  const byDate = new Map(wf.ledger.map((r) => [r.date, r]));
  const rowOf = (i) => byDate.get(addYears(base, i)) ?? { lp: 0, gp: 0 };
  const lpFlows = irrFlows.map((_, i) => rowOf(i).lp);
  const gpFlows = irrFlows.map((_, i) => rowOf(i).gp);
  const lpEquity = wf.lpEquity, gpEquity = wf.gpEquity;
  return {
    lpEquity,
    gpEquity,
    lpIRR: calcIRR(lpFlows) * 100,
    gpIRR: calcIRR(gpFlows) * 100,
    lpEquityMultiple: lpEquity > 0 ? wf.lpTotalDistributions / lpEquity : 0,
    gpEquityMultiple: gpEquity > 0 ? wf.gpTotalDistributions / gpEquity : 0,
    lpTotalDistributions: wf.lpTotalDistributions,
    gpTotalDistributions: wf.gpTotalDistributions,
    gpPromote: wf.gpTotalDistributions - gpEquity, // GP profit (its capital's return + the carry)
    gpCarry: wf.gpCarry, // the promote alone
    tierMethod: wf.tierMethod,
    activeTier: wf.activeTier,
    projectIRR: calcIRR(irrFlows) * 100,
    yearlyDist: irrFlows.slice(1).map((_, k) => ({ year: k + 1, lp: lpFlows[k + 1], gp: gpFlows[k + 1] })),
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

// The replacement rate cap bought at the end of hold year `year`. A cost
// entered for that year (capReplacementCosts[year − 1]) takes precedence;
// a year with no entry uses the flat cost at the end of each cap term.
// (1.1.15: an empty or short list used to make the later renewals free.)
export function capReplacementCostAt(inputs, year) {
  const perYear = Array.isArray(inputs.capReplacementCosts) ? inputs.capReplacementCosts[year - 1] : null;
  if (perYear != null && perYear !== "") return Number(perYear) || 0;
  const term = Math.max(1, inputs.capTermYears ?? 1);
  return (inputs.capReplacementCost ?? 0) > 0 && year % term === 0 ? inputs.capReplacementCost : 0;
}
