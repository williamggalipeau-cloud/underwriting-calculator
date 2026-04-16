"use client";

import { useMemo, useState } from "react";
import { underwrite } from "@/lib/calculations";
import DealInputsPanel from "@/components/DealInputs";
import DebtSizingPanel from "@/components/DebtSizing";
import ReturnsAnalysis from "@/components/ReturnsAnalysis";
import SensitivityTables from "@/components/SensitivityTables";
import UnitRoll from "@/components/UnitRoll";
import CapitalAnalysis from "@/components/CapitalAnalysis";
import FundAnalysis from "@/components/FundAnalysis";

const DEFAULT_INPUTS = {
  propertyName: "Small Bay Industrial",
  fundName: "",
  squareFootage: 60000,
  purchasePrice: 9000000,
  closingCosts: {
    titleInsuranceOwnerPct:  0.30,
    titleInsuranceLenderPct: 0.20,
    transferTaxPct:          0.50,
    loanOriginationPct:      1.00,
    acquisitionFeePct:       1.00,
    legalFees:               15000,
    environmentalReport:     3500,
    appraisal:               7500,
    surveyAndPCA:            5000,
    miscClosingCosts:        2500,
  },

  // Multi-tenant: 20 units @ ~3,000 SF avg, 2-yr leases, 60% renewal
  unitCount: 20,
  avgLeaseTerm: 2,
  renewalProbabilityPct: 60,
  downtimeBetweenLeases: 2,

  // Modified Gross — landlord pays taxes + insurance
  leaseType: "NNN",

  rentPerSF: 14.0,
  annualRentEscalationPct: 3.0,
  vacancyPct: 10,
  creditLossPct: 1.0,
  otherIncomePSF: 0.25,

  // Landlord-paid operating expenses
  realEstateTaxPSF: 1.20,
  insurancePSF: 0.35,
  utilitiesPSF: 0.50,
  maintenancePSF: 0.40,
  janitorialPSF: 0.20,

  managementFeePct: 6,
  leasingFeesPSF: 0.10,
  capitalReservesPSF: 0.30,

  // Rollover costs — construction cost breakdown drives tiPerSFNew
  constructionCosts: {
    demolition:           0.25,
    partitionWalls:       0.75,
    electrical:           1.50,
    plumbing:             0.50,
    hvac:                 1.25,
    flooring:             0.75,
    painting:             0.30,
    lighting:             0.60,
    doorsHardware:        0.35,
    overheadDoors:        0.50,
    landscaping:          0.15,
    roofing:              0.50,
    signage:              0.10,
    miscConstruction:     0.25,
    generalConditionsPct: 10,
    overheadProfitPct:    10,
    contingencyPct:        5,
  },
  tiPerSFNew: 8.0,       // fallback if constructionCosts not present
  tiPerSFRenewal: 2.0,
  leasingCommissionNewPct: 6.0,
  leasingCommissionRenewalPct: 2.0,

  loanCovenants: {
    dscrEnabled:      true,
    dscrMin:          1.25,
    debtYieldEnabled: false,
    debtYieldMin:     8.0,
    ltvEnabled:       false,
    ltvMax:           75,
    occupancyEnabled: false,
    occupancyMin:     85,
  },

  lenderName: "",

  loanSizingConstraints: {
    minDSCREnabled:     false,
    minDSCR:            1.25,
    maxLTCEnabled:      false,
    maxLTCPct:          75,
    minDebtYieldEnabled: false,
    minDebtYieldPct:    8.0,
  },

  tiReserve: {
    enabled:        false,
    reservePSF:     8.0,
    minDrawDSCR:    1.10,
  },

  ltvPct: 65,
  interestRatePct: 7.50,   // fixed rate (used when floatingRate is false)
  amortizationYears: 25,
  loanTermYears: 3,         // initial term (3+1+1)
  extensionCount: 2,
  extensionTermYears: 1,
  extensionFeePct: 0.25,    // % of loan balance per extension
  ioPeriodYears: 0,

  // Floating rate (index + spread)
  floatingRate: true,
  indexRatePct: 5.25,       // e.g., SOFR
  spreadPct: 2.50,          // spread over index

  // Hedging
  hedgingType: "cap",       // "none" | "cap" | "swap"
  capStrikeRatePct: 9.50,   // rate cap strike
  capTermYears: 3,          // cap term in years (typically = initial loan term)
  capPremiumPct: 1.00,      // upfront cap premium (% of loan)
  swapFixedRatePct: 7.75,   // used only if hedgingType = "swap"
  swapTermYears: 3,         // swap term in years

  holdPeriodYears: 7,
  exitCapRatePct: 6.75,
  sellingCostsPct: 2.0,   // fallback if sellingCosts breakdown not present
  sellingCosts: {
    brokerCommissionPct:  2.00,
    transferTaxPct:       0.50,
    titleInsurancePct:    0.20,
    legalFees:            15000,
    miscDispositionCosts: 5000,
  },

  // Concessions
  freeRentMonthsNew: 1,         // free rent months given to new tenants
  freeRentMonthsRenewal: 0,     // free rent months given on renewals
  tiConcessionPSFNew: 0,        // TI allowance as income concession — new lease ($/SF)
  tiConcessionPSFRenewal: 0,    // TI allowance as income concession — renewal ($/SF)

  // Asset management fee allocations (charged by AM to the asset)
  amFeeItems: [],  // [{ id, label, basis: "psf"|"fixed"|"pctEGR", value }]

  // Custom rollover costs (charged at each lease rollover event, per SF)
  customRolloverItems: [],  // [{ id, label, psf }]

  // User-defined custom line items
  customIncomeItems: [],       // [{ id, label, psf }]
  customExpenseItems: [],      // [{ id, label, psf }]
  customDispositionItems: [],  // [{ id, label, basis: "pct"|"fixed", value }]

  // LP / GP waterfall
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

  units: [],
};

const TABS = [
  { id: "units",       label: "Unit Roll" },
  { id: "debt",        label: "Debt" },
  { id: "capital",     label: "Capital" },
  { id: "returns",     label: "Asset Return" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "fund",        label: "Portfolio Return" },
];

function fmtPct(n) {
  return isFinite(n) ? `${n.toFixed(1)}%` : "—";
}
function fmtX(n) {
  return isFinite(n) ? `${n.toFixed(2)}x` : "—";
}
function fmtDollarM(n) {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function Home() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [activeTab, setActiveTab] = useState("units");
  const [savedDeals, setSavedDeals] = useState([]);

  const results = useMemo(() => underwrite(inputs), [inputs]);

  const { debt, returns, annualCashFlows, waterfall, irrFlows } = results;

  function handleSaveDeal() {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setSavedDeals((prev) => [
      ...prev,
      {
        id,
        inputs: { ...inputs },
        irrFlows: [...(irrFlows ?? [])],
        metrics: {
          irr: returns.irr,
          equityMultiple: returns.equityMultiple,
          yearOneCashOnCash: returns.yearOneCashOnCash,
          equityRequired: debt.equityRequired,
          loanAmount: debt.loanAmount,
        },
      },
    ]);
  }

  function handleRemoveDeal(id) {
    setSavedDeals((prev) => prev.filter((d) => d.id !== id));
  }

  const summaryItems = [
    { label: "IRR", value: fmtPct(returns.irr), good: returns.irr >= 14 },
    { label: "Eq. Multiple", value: fmtX(returns.equityMultiple), good: returns.equityMultiple >= 2 },
    { label: "CoC Y1", value: fmtPct(returns.yearOneCashOnCash), good: returns.yearOneCashOnCash >= 7 },
    { label: "Cap Rate", value: fmtPct(returns.goingInCapRate), good: true },
    { label: "DSCR", value: `${debt.dscr.toFixed(2)}x`, good: debt.dscr >= 1.25 },
    { label: "Equity", value: fmtDollarM(debt.equityRequired), good: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 mr-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Industrial UW</h1>
              <p className="text-xs text-gray-400 leading-tight">
                {inputs.propertyName || "Unnamed Deal"}
                {inputs.fundName && <span className="ml-1.5 text-gray-300">· {inputs.fundName}</span>}
              </p>
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-1">
            {summaryItems.map(({ label, value, good }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
              >
                <span className="text-xs text-gray-500">{label}</span>
                <span className={`text-xs font-bold tabular-nums ${good ? "text-gray-900" : "text-red-600"}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 flex gap-6 items-start">
        {/* Left: inputs */}
        <aside className="w-80 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sticky top-[73px] max-h-[calc(100vh-90px)] overflow-y-auto">
          <h2 className="text-base font-semibold text-gray-900 mb-5">Deal Inputs</h2>
          <DealInputsPanel
            inputs={inputs}
            onChange={setInputs}
            fundNames={[...new Set(savedDeals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))]}
          />
        </aside>

        {/* Right: results */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Tab bar */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {tab.label}
                {tab.id === "units" && inputs.units.length > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "units" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                    {inputs.units.length}
                  </span>
                )}
                {tab.id === "fund" && savedDeals.length > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "fund" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                    {savedDeals.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {activeTab === "units" && (
              <UnitRoll
                units={inputs.units}
                inputs={inputs}
                onChange={(units) => setInputs((prev) => ({ ...prev, units }))}
              />
            )}
            {activeTab === "debt" && <DebtSizingPanel debt={debt} cashFlows={annualCashFlows} inputs={inputs} />}
            {activeTab === "capital" && <CapitalAnalysis debt={debt} cashFlows={annualCashFlows} inputs={inputs} />}
            {activeTab === "returns" && (
              <ReturnsAnalysis returns={returns} cashFlows={annualCashFlows} waterfall={waterfall} />
            )}
            {activeTab === "sensitivity" && (
              <SensitivityTables
                inputs={inputs}
                baseIRR={returns.irr}
                baseEM={returns.equityMultiple}
              />
            )}
            {activeTab === "fund" && (
              <FundAnalysis
                savedDeals={savedDeals}
                currentDeal={{ inputs, irrFlows: irrFlows ?? [], metrics: { irr: returns.irr, equityMultiple: returns.equityMultiple, yearOneCashOnCash: returns.yearOneCashOnCash, equityRequired: debt.equityRequired, loanAmount: debt.loanAmount } }}
                onSave={handleSaveDeal}
                onRemove={handleRemoveDeal}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
