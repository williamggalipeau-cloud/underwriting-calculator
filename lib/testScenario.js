// ─── Test Scenario ────────────────────────────────────────────────────────────
// Populates the app with a realistic Fund I scenario:
//   - Active deal: Small Bay Industrial - Phase I (60k SF, 20-unit rent roll)
//   - Fund I saved deals: 4 assets total including the active deal

import { underwrite } from "@/lib/calculations";
import { SAMPLE_FUND_NAME } from "@/lib/samplePortfolio";

function uid() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Unit roll for the active deal ────────────────────────────────────────────

const UNIT_DATA = [
  { name: "001", sf: 3200, tenant: "Smith Metal Works",       biz: "Metal fabrication & custom parts",   credit: "B+",  naics: "3320", lease: "NNN", rent: 13.50, esc: 3.0, mo: 8,  newTerm: 24, renewPct: 70, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "002", sf: 2800, tenant: "Premier Auto Parts",      biz: "Automotive parts distributor",        credit: "BB", naics: "4413", lease: "NNN", rent: 14.00, esc: 3.0, mo: 14, newTerm: 24, renewPct: 60, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "003", sf: 3000, tenant: "",                        biz: "",                                    credit: "",    naics: "",     lease: "NNN", rent: 14.00, esc: 3.0, mo: 0,  newTerm: 24, renewPct: 60, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2, vacant: true },
  { name: "004", sf: 3100, tenant: "Blue Ridge Plumbing",     biz: "Plumbing supply & contractor",        credit: "B",  naics: "4236", lease: "NNN", rent: 13.75, esc: 3.0, mo: 22, newTerm: 24, renewPct: 65, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "005", sf: 2900, tenant: "Apex Electrical Supply",  biz: "Electrical parts & wholesale",        credit: "BB", naics: "4231", lease: "NNN", rent: 14.25, esc: 3.0, mo: 6,  newTerm: 24, renewPct: 55, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 3 },
  { name: "006", sf: 3000, tenant: "Coastal Logistics",       biz: "Last-mile delivery & storage",        credit: "BB", naics: "4931", lease: "NNN", rent: 13.00, esc: 3.0, mo: 18, newTerm: 36, renewPct: 70, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "007", sf: 3200, tenant: "Mountain View Welding",   biz: "Structural & custom welding",         credit: "B",  naics: "3320", lease: "NNN", rent: 13.50, esc: 3.0, mo: 10, newTerm: 24, renewPct: 60, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.5, fr: 1, frR: 0, dtm: 2 },
  { name: "008", sf: 2800, tenant: "",                        biz: "",                                    credit: "",    naics: "",     lease: "NNN", rent: 14.00, esc: 3.0, mo: 0,  newTerm: 24, renewPct: 60, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2, vacant: true },
  { name: "009", sf: 3000, tenant: "Precision Parts Co.",     biz: "CNC machining & precision mfg.",      credit: "BB+",naics: "3320", lease: "NNN", rent: 14.50, esc: 3.5, mo: 20, newTerm: 24, renewPct: 75, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 0.5, fr: 1, frR: 0, dtm: 2 },
  { name: "010", sf: 3100, tenant: "Delta Storage Systems",   biz: "Commercial storage solutions",         credit: "B+", naics: "4931", lease: "NNN", rent: 13.25, esc: 3.0, mo: 16, newTerm: 24, renewPct: 65, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "011", sf: 2900, tenant: "Sun State HVAC",          biz: "HVAC installation & service",         credit: "BB", naics: "2382", lease: "MG",  rent: 15.00, esc: 3.0, mo: 12, newTerm: 24, renewPct: 60, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "012", sf: 3000, tenant: "Pacific Rim Imports",     biz: "Import goods & distribution",         credit: "BB", naics: "4200", lease: "NNN", rent: 13.75, esc: 3.0, mo: 24, newTerm: 24, renewPct: 70, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "013", sf: 3200, tenant: "Ironclad Security",       biz: "Security equipment & installation",   credit: "B+", naics: "5612", lease: "NNN", rent: 14.00, esc: 3.0, mo: 4,  newTerm: 24, renewPct: 50, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.5, fr: 1, frR: 0, dtm: 3 },
  { name: "014", sf: 2800, tenant: "Green Valley Foods",      biz: "Specialty food distribution",         credit: "BB",naics: "4240", lease: "MG",  rent: 15.50, esc: 3.0, mo: 18, newTerm: 24, renewPct: 65, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "015", sf: 3000, tenant: "Metro Print Shop",        biz: "Commercial printing & signage",       credit: "B",  naics: "3231", lease: "NNN", rent: 13.50, esc: 3.0, mo: 10, newTerm: 24, renewPct: 60, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.5, fr: 1, frR: 0, dtm: 2 },
  { name: "016", sf: 3100, tenant: "Allied Tool & Die",       biz: "Industrial tooling & die casting",    credit: "BB+",naics: "3320", lease: "NNN", rent: 14.25, esc: 3.5, mo: 22, newTerm: 36, renewPct: 75, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 0.5, fr: 1, frR: 0, dtm: 2 },
  { name: "017", sf: 2900, tenant: "",                        biz: "",                                    credit: "",    naics: "",     lease: "NNN", rent: 14.00, esc: 3.0, mo: 0,  newTerm: 24, renewPct: 60, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2, vacant: true },
  { name: "018", sf: 3000, tenant: "Swift Courier Services",  biz: "Same-day courier & freight",          credit: "B+", naics: "4921", lease: "NNN", rent: 13.00, esc: 3.0, mo: 8,  newTerm: 24, renewPct: 55, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
  { name: "019", sf: 3200, tenant: "Tri-State Electronics",   biz: "Electronics assembly & repair",       credit: "BB", naics: "3340", lease: "NNN", rent: 14.50, esc: 3.5, mo: 16, newTerm: 24, renewPct: 70, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 0.5, fr: 1, frR: 0, dtm: 2 },
  { name: "020", sf: 2800, tenant: "Keystone Fabricators",    biz: "Sheet metal & custom fabrication",    credit: "B+", naics: "3320", lease: "NNN", rent: 13.75, esc: 3.0, mo: 20, newTerm: 24, renewPct: 65, tiNew: 8.0, tiRen: 2.0, lc: 6, lcR: 2, cr: 1.0, fr: 1, frR: 0, dtm: 2 },
];

function buildUnits() {
  return UNIT_DATA.map((u) => ({
    id: uid(),
    name: u.name,
    squareFeet: u.sf,
    tenantName: u.tenant,
    businessDescription: u.biz,
    creditRating: u.credit,
    naicsCode: u.naics,
    leaseStatus: u.vacant ? "vacant" : "occupied",
    leaseType: u.lease,
    currentRentPSF: u.rent,
    annualEscalationPct: u.esc,
    monthsRemaining: u.vacant ? 0 : u.mo,
    newLeaseTerm: u.newTerm,
    renewalProbabilityPct: u.renewPct,
    downtimeBetweenLeases: u.dtm,
    creditLossPct: u.cr,
    freeRentMonthsNew: u.fr,
    freeRentMonthsRenewal: u.frR,
    tiConcessionPSFNew: 0,
    tiConcessionPSFRenewal: 0,
    tiNewPSF: u.tiNew,
    tiRenewalPSF: u.tiRen,
    leasingCommissionNewPct: u.lc,
    leasingCommissionRenewalPct: u.lcR,
    otherIncomePSF: 0.25,
    realEstateTaxPSF: 1.20,
    insurancePSF: 0.35,
    utilitiesPSF: u.lease === "NNN" ? 0 : 0.50,
    maintenancePSF: u.lease === "NNN" ? 0 : 0.40,
    janitorialPSF: u.lease === "NNN" ? 0 : 0.20,
  }));
}

// ─── Active deal inputs ────────────────────────────────────────────────────────

export const TEST_INPUTS = {
  propertyName: "Small Bay Industrial — Phase I",
  fundName: SAMPLE_FUND_NAME,
  acquisitionDate: "2026-02-27",
  squareFootage: 60000,
  purchasePrice: 9000000,

  closingCosts: {
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
  },

  unitCount: 20,
  avgLeaseTerm: 2,
  renewalProbabilityPct: 65,
  downtimeBetweenLeases: 2,
  leaseType: "NNN",

  rentPerSF: 14.0,
  annualRentEscalationPct: 3.0,
  vacancyPct: 10,
  creditLossPct: 1.0,
  otherIncomePSF: 0.25,

  realEstateTaxPSF: 1.20,
  insurancePSF: 0.35,
  utilitiesPSF: 0.50,
  maintenancePSF: 0.40,
  janitorialPSF: 0.20,

  managementFeePct: 6,
  leasingFeesPSF: 0.10,
  capitalReservesPSF: 0.30,

  constructionCosts: {
    demolition: 0.25, partitionWalls: 0.75, electrical: 1.50, plumbing: 0.50,
    hvac: 1.25, flooring: 0.75, painting: 0.30, lighting: 0.60,
    doorsHardware: 0.35, overheadDoors: 0.50, landscaping: 0.15, roofing: 0.50,
    signage: 0.10, miscConstruction: 0.25,
    generalConditionsPct: 10, overheadProfitPct: 10, contingencyPct: 5,
  },
  tiPerSFNew: 8.0,
  tiPerSFRenewal: 2.0,
  leasingCommissionNewPct: 6.0,
  leasingCommissionRenewalPct: 2.0,

  loanCovenants: {
    dscrEnabled: true,  dscrMin: 1.25,
    debtYieldEnabled: true, debtYieldMin: 8.0,
    ltvEnabled: false,  ltvMax: 75,
    occupancyEnabled: true, occupancyMin: 85,
  },

  lenderName: "First National Bank",

  loanSizingConstraints: {
    minDSCREnabled: true,  minDSCR: 1.25,
    maxLTCEnabled: false,  maxLTCPct: 75,
    minDebtYieldEnabled: false, minDebtYieldPct: 8.0,
  },

  tiReserve: { enabled: false, reservePSF: 8.0, minDrawDSCR: 1.10 },

  ltvPct: 65,
  interestRatePct: 7.50,
  amortizationYears: 25,
  loanTermYears: 3,
  extensionCount: 2,
  extensionTermYears: 1,
  extensionFeePct: 0.25,
  ioPeriodYears: 0,

  floatingRate: true,
  indexRatePct: 5.25,
  spreadPct: 2.50,

  hedgingType: "cap",
  capStrikeRatePct: 9.50,
  capTermYears: 3,
  capPremiumPct: 1.00,
  swapFixedRatePct: 7.75,
  swapTermYears: 3,

  holdPeriodYears: 4,
  exitCapRatePct: 6.50,
  sellingCostsPct: 2.0,
  sellingCosts: {
    brokerCommissionPct: 2.00, transferTaxPct: 0.50,
    titleInsurancePct: 0.20, legalFees: 15000, miscDispositionCosts: 5000,
  },

  freeRentMonthsNew: 1,
  freeRentMonthsRenewal: 0,
  tiConcessionPSFNew: 0,
  tiConcessionPSFRenewal: 0,

  amFeeItems: [],
  customRolloverItems: [],
  customIncomeItems: [],
  customExpenseItems: [],
  customDispositionItems: [],

  waterfallEnabled: true,
  waterfall: {
    lpEquityPct: 90,
    preferredReturnPct: 8.0,
    catchUpGpPct: 100,
    tiers: [
      { irrThreshold: 12,   lpSplit: 80, gpSplit: 20 },
      { irrThreshold: 18,   lpSplit: 70, gpSplit: 30 },
      { irrThreshold: null, lpSplit: 60, gpSplit: 40 },
    ],
  },

  units: [], // populated below
};

// ─── Other fund assets ─────────────────────────────────────────────────────────

const FUND_ASSETS = [
  {
    propertyName: "Eastside Distribution Hub", acquisitionDate: "2026-05-29",
    squareFootage: 120000, purchasePrice: 14500000,
    rentPerSF: 11.0, exitCapRatePct: 6.00, holdPeriodYears: 4, ltvPct: 60, vacancyPct: 5,
    lenderName: "Commerce Bank",
  },
  {
    propertyName: "Northgate Flex Center", acquisitionDate: "2026-08-31",
    squareFootage: 35000, purchasePrice: 5200000,
    rentPerSF: 15.50, exitCapRatePct: 7.00, holdPeriodYears: 4, ltvPct: 65, vacancyPct: 12,
    lenderName: "Regional Capital Group",
  },
  {
    propertyName: "Riverside Commerce Park", acquisitionDate: "2026-10-30",
    squareFootage: 80000, purchasePrice: 10800000,
    rentPerSF: 12.0, exitCapRatePct: 6.25, holdPeriodYears: 4, ltvPct: 62, vacancyPct: 7,
    lenderName: "Midwest Industrial Lenders",
  },
];

// Acquisition dates by property name (all closed, after the fund's final
// close), for workspaces saved before the test scenario had dates.
export const TEST_ACQUISITION_DATES = Object.fromEntries(
  [TEST_INPUTS, ...FUND_ASSETS].map((a) => [a.propertyName, a.acquisitionDate])
);

// Hold periods the test deals had before every asset moved to 4 years.
export const TEST_PREVIOUS_HOLDS = {
  "Small Bay Industrial — Phase I": 7,
  "Eastside Distribution Hub": 7,
  "Northgate Flex Center": 5,
  "Riverside Commerce Park": 8,
};

// ─── Generator ────────────────────────────────────────────────────────────────

export function generateTestScenario() {
  const units = buildUnits();
  const activeDealInputs = { ...TEST_INPUTS, units };

  // Build saved deal snapshots for all 4 Fund I assets
  const allFundInputs = [
    activeDealInputs,
    ...FUND_ASSETS.map((a) => ({
      ...TEST_INPUTS,
      ...a,
      fundName: SAMPLE_FUND_NAME,
      units: [],
      closingCosts: {
        titleInsuranceOwner:  Math.round(a.purchasePrice * 0.003),
        titleInsuranceLender: Math.round(a.purchasePrice * a.ltvPct / 100 * 0.002),
        transferTax:          Math.round(a.purchasePrice * 0.005),
        loanOrigination:      Math.round(a.purchasePrice * a.ltvPct / 100 * 0.01),
        acquisitionFee:       Math.round(a.purchasePrice * 0.01),
        legalFees: 15000, environmentalReport: 3500, appraisal: 7500,
        surveyAndPCA: 5000, miscClosingCosts: 2500,
      },
    })),
  ];

  const savedDeals = allFundInputs.map((inputs) => {
    const result = underwrite(inputs);
    return {
      id: uid(),
      inputs,
      irrFlows: [...(result.irrFlows ?? [])],
      metrics: {
        irr:               result.returns.irr,
        equityMultiple:    result.returns.equityMultiple,
        yearOneCashOnCash: result.returns.yearOneCashOnCash,
        equityRequired:    result.debt.equityRequired,
        loanAmount:        result.debt.loanAmount,
      },
    };
  });

  return { activeDealInputs, savedDeals };
}
