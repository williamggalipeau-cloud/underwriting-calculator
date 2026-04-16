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
  renewalProbabilityPct: 60,
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
  tiPerSFNew: 8.0,
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

  holdPeriodYears: 7,
  exitCapRatePct: 6.75,
  sellingCostsPct: 2.0,
  sellingCosts: {
    brokerCommissionPct:  2.00,
    transferTaxPct:       0.50,
    titleInsurancePct:    0.20,
    legalFees:            15000,
    miscDispositionCosts: 5000,
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

  units: [],
};

const DEMO_ASSETS = [
  { propertyName: "Sunrise Business Park",    squareFootage: 45000,  purchasePrice: 6500000,  rentPerSF: 13.0, exitCapRatePct: 6.50, holdPeriodYears: 8,  ltvPct: 65, vacancyPct:  8 },
  { propertyName: "Lakeside Distribution",    squareFootage: 120000, purchasePrice: 15000000, rentPerSF: 11.0, exitCapRatePct: 6.00, holdPeriodYears: 7,  ltvPct: 60, vacancyPct:  5 },
  { propertyName: "Metro Flex Complex",       squareFootage: 28000,  purchasePrice: 4200000,  rentPerSF: 16.0, exitCapRatePct: 7.00, holdPeriodYears: 5,  ltvPct: 65, vacancyPct: 12 },
  { propertyName: "Harbor Industrial",        squareFootage: 85000,  purchasePrice: 11000000, rentPerSF: 12.0, exitCapRatePct: 6.25, holdPeriodYears: 10, ltvPct: 60, vacancyPct:  7 },
  { propertyName: "Westside Light Industrial",squareFootage: 35000,  purchasePrice: 5800000,  rentPerSF: 15.0, exitCapRatePct: 6.75, holdPeriodYears: 6,  ltvPct: 65, vacancyPct: 10 },
  { propertyName: "Crossroads Warehouse",     squareFootage: 180000, purchasePrice: 20000000, rentPerSF:  9.5, exitCapRatePct: 5.75, holdPeriodYears: 8,  ltvPct: 55, vacancyPct:  5 },
  { propertyName: "Tech Park Flex",           squareFootage: 22000,  purchasePrice: 3800000,  rentPerSF: 18.0, exitCapRatePct: 7.25, holdPeriodYears: 5,  ltvPct: 65, vacancyPct: 15 },
  { propertyName: "Valley Business Center",   squareFootage: 65000,  purchasePrice: 8500000,  rentPerSF: 13.5, exitCapRatePct: 6.50, holdPeriodYears: 7,  ltvPct: 65, vacancyPct:  8 },
  { propertyName: "Airport Commerce Park",    squareFootage: 95000,  purchasePrice: 13000000, rentPerSF: 11.5, exitCapRatePct: 6.00, holdPeriodYears: 9,  ltvPct: 60, vacancyPct:  6 },
  { propertyName: "Summit Industrial",        squareFootage: 42000,  purchasePrice: 6000000,  rentPerSF: 14.0, exitCapRatePct: 6.75, holdPeriodYears: 6,  ltvPct: 65, vacancyPct: 10 },
];

function generateDemoFund() {
  return DEMO_ASSETS.map((asset) => {
    const inputs = {
      ...DEFAULT_INPUTS,
      ...asset,
      fundName: "Fund I",
      annualRentEscalationPct: 3.0,
      closingCosts: {
        titleInsuranceOwner:  Math.round(asset.purchasePrice * 0.003),
        titleInsuranceLender: Math.round(asset.purchasePrice * asset.ltvPct / 100 * 0.002),
        transferTax:          Math.round(asset.purchasePrice * 0.005),
        loanOrigination:      Math.round(asset.purchasePrice * asset.ltvPct / 100 * 0.01),
        acquisitionFee:       Math.round(asset.purchasePrice * 0.01),
        legalFees:            15000,
        environmentalReport:  3500,
        appraisal:            7500,
        surveyAndPCA:         5000,
        miscClosingCosts:     2500,
      },
    };
    const result = underwrite(inputs);
    const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      id,
      inputs,
      irrFlows: [...(result.irrFlows ?? [])],
      metrics: {
        irr:                result.returns.irr,
        equityMultiple:     result.returns.equityMultiple,
        yearOneCashOnCash:  result.returns.yearOneCashOnCash,
        equityRequired:     result.debt.equityRequired,
        loanAmount:         result.debt.loanAmount,
      },
    };
  });
}

function newDeal(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    inputs: { ...DEFAULT_INPUTS, propertyName: "New Deal", ...overrides },
  };
}

const TABS = [
  { id: "units",       label: "Unit Roll" },
  { id: "debt",        label: "Debt" },
  { id: "capital",     label: "Capital" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "returns",     label: "Asset Return" },
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
  const [deals, setDeals] = useState([
    { id: "deal-1", inputs: { ...DEFAULT_INPUTS } },
  ]);
  const [activeDealId, setActiveDealId] = useState("deal-1");
  const [activeTab, setActiveTab] = useState("units");
  const [savedDeals, setSavedDeals] = useState([]);

  const activeDeal = deals.find((d) => d.id === activeDealId) ?? deals[0];
  const inputs = activeDeal.inputs;

  function setInputs(updater) {
    setDeals((prev) =>
      prev.map((d) =>
        d.id === activeDealId
          ? { ...d, inputs: typeof updater === "function" ? updater(d.inputs) : updater }
          : d
      )
    );
  }

  function handleAddDeal() {
    const d = newDeal();
    setDeals((prev) => [...prev, d]);
    setActiveDealId(d.id);
    setActiveTab("units");
  }

  function handleCloseDeal(id) {
    setDeals((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (next.length === 0) {
        const fresh = newDeal({ propertyName: "Small Bay Industrial" });
        setActiveDealId(fresh.id);
        return [fresh];
      }
      if (id === activeDealId) {
        setActiveDealId(next[next.length - 1].id);
      }
      return next;
    });
  }

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

  function handleLoadDemo() {
    setSavedDeals((prev) => [...prev, ...generateDemoFund()]);
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
        <aside className="w-80 shrink-0 sticky top-[73px] max-h-[calc(100vh-90px)] flex flex-col gap-0">
          {/* Deal switcher */}
          <div className="bg-white rounded-t-2xl border border-b-0 border-gray-200 shadow-sm px-3 pt-3 pb-0">
            <div className="flex items-center gap-1 overflow-x-auto pb-0 scrollbar-hide">
              {deals.map((deal) => {
                const isActive = deal.id === activeDealId;
                return (
                  <div
                    key={deal.id}
                    className={`flex items-center gap-1 shrink-0 rounded-t-lg px-3 py-2 cursor-pointer border-b-2 transition-all ${
                      isActive
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                    onClick={() => setActiveDealId(deal.id)}
                  >
                    <span className="text-xs font-medium max-w-[100px] truncate">
                      {deal.inputs.propertyName || "Unnamed"}
                    </span>
                    {deals.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleCloseDeal(deal.id); }}
                        className={`ml-0.5 rounded-full w-4 h-4 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors ${isActive ? "text-blue-400" : "text-gray-300"}`}
                        title="Close deal"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
              {/* New deal button */}
              <button
                type="button"
                onClick={handleAddDeal}
                title="Add new deal"
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors ml-0.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Inputs panel */}
          <div className="bg-white rounded-b-2xl border border-gray-200 shadow-sm p-5 overflow-y-auto flex-1">
            <DealInputsPanel
              key={activeDealId}
              inputs={inputs}
              onChange={setInputs}
              fundNames={[...new Set(savedDeals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))]}
            />
          </div>
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
                onLoadDemo={handleLoadDemo}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
