export type LeaseType = "NNN" | "MG" | "Gross";

export interface Unit {
  id: string;
  name: string;                    // "101", "Bay A", etc.
  squareFeet: number;
  tenantName: string;              // "" if vacant
  leaseStatus: "occupied" | "vacant";
  currentRentPSF: number;          // contracted rent ($/SF/yr); ignored if vacant
  monthsRemaining: number;         // months left on current lease; 0 if vacant
  newLeaseTerm: number;            // months for next/renewal lease
  renewalProbabilityPct: number;   // unit-specific override of deal-level
  tiNewPSF: number;                // TI for new tenant — unit-specific override
  tiRenewalPSF: number;            // TI for renewal — unit-specific override
}

export interface ClosingCostBreakdown {
  titleInsuranceOwnerPct: number;   // % of purchase price
  titleInsuranceLenderPct: number;  // % of loan amount
  transferTaxPct: number;           // % of purchase price
  loanOriginationPct: number;       // % of loan amount
  legalFees: number;                // fixed $
  environmentalReport: number;      // fixed $ (Phase I ESA)
  appraisal: number;                // fixed $
  surveyAndPCA: number;             // fixed $ (survey + property condition assessment)
  miscClosingCosts: number;         // fixed $ catch-all
}

export interface DealInputs {
  // Property
  propertyName: string;
  squareFootage: number;
  purchasePrice: number;
  closingCosts: ClosingCostBreakdown;

  // Multi-tenant
  unitCount: number;
  avgLeaseTerm: number;          // years
  renewalProbabilityPct: number; // % of expiring tenants that renew
  downtimeBetweenLeases: number; // months of vacancy between tenants

  // Lease structure
  leaseType: LeaseType;

  // Income
  rentPerSF: number;
  annualRentEscalationPct: number;
  vacancyPct: number;            // stabilized physical vacancy
  creditLossPct: number;         // bad debt / non-payment as % of EGR
  otherIncomePSF: number;        // storage, parking, antenna, etc.

  // Landlord-paid operating expenses ($/SF/yr)
  // Which are landlord-paid depends on leaseType:
  //   NNN  → landlord pays none of these (passes through to tenant)
  //   MG   → landlord pays taxes + insurance
  //   Gross → landlord pays all of these
  realEstateTaxPSF: number;
  insurancePSF: number;
  utilitiesPSF: number;
  maintenancePSF: number;
  janitorialPSF: number;

  // Management & reserves (always landlord)
  managementFeePct: number;      // % of EGR
  capitalReservesPSF: number;

  // Rollover costs (normalized annually over avg lease term)
  tiPerSFNew: number;            // TI allowance for new tenants
  tiPerSFRenewal: number;        // TI allowance for renewals
  leasingCommissionNewPct: number;     // % of total lease value (rent × term)
  leasingCommissionRenewalPct: number;

  // Unit-level lease roll (optional; when present, replaces portfolio vacancy/TI logic)
  units: Unit[];

  // Financing
  ltvPct: number;
  interestRatePct: number;
  amortizationYears: number;
  loanTermYears: number;
  ioPeriodYears: number;

  // Exit
  holdPeriodYears: number;
  exitCapRatePct: number;
  sellingCostsPct: number;
}

export interface AnnualCashFlow {
  year: number;
  grossRevenue: number;
  physicalVacancy: number;
  creditLoss: number;
  effectiveGrossRevenue: number;
  // Expense breakdown
  realEstateTax: number;
  insurance: number;
  utilities: number;
  maintenance: number;
  janitorial: number;
  managementFee: number;
  capitalReserves: number;
  operatingExpenses: number;   // sum of all above
  noi: number;
  // Below-NOI costs
  tiAndLeasing: number;        // normalized TI + leasing commissions
  adjustedNOI: number;         // NOI after TI/LC
  debtService: number;
  pretaxCashFlow: number;
  loanBalance: number;
}

export interface DebtMetrics {
  loanAmount: number;
  annualDebtService: number;
  monthlyPayment: number;
  dscr: number;                // based on NOI
  adjustedDscr: number;        // based on adjusted NOI (after TI/LC)
  ltv: number;
  equityRequired: number;
  loanConstant: number;
}

export interface ReturnsMetrics {
  goingInCapRate: number;
  adjustedGoingInCapRate: number; // using adjusted NOI
  exitCapRate: number;
  yearOneCashOnCash: number;
  averageCashOnCash: number;
  equityMultiple: number;
  irr: number;
  npv: number;
  exitValue: number;
  equityReversion: number;
  totalEquityInvested: number;
  annualRolloverCosts: number; // avg annual TI + LC
}

export interface ComputedClosingCosts {
  titleInsuranceOwner: number;
  titleInsuranceLender: number;
  transferTax: number;
  loanOrigination: number;
  legalFees: number;
  environmentalReport: number;
  appraisal: number;
  surveyAndPCA: number;
  miscClosingCosts: number;
  total: number;
  totalAsPctOfPurchasePrice: number;
}

export interface UnderwritingResults {
  annualCashFlows: AnnualCashFlow[];
  debt: DebtMetrics;
  returns: ReturnsMetrics;
  closingCosts: ComputedClosingCosts;
}

export interface SensitivityCell {
  irr: number;
  equityMultiple: number;
  cashOnCash: number;
}

export type SensitivityTable = SensitivityCell[][];
