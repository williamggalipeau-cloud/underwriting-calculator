"use client";

import { useMemo, useState } from "react";
import type { DealInputs } from "@/lib/types";
import { underwrite } from "@/lib/calculations";
import DealInputsPanel from "@/components/DealInputs";
import DebtSizingPanel from "@/components/DebtSizing";
import ReturnsAnalysis from "@/components/ReturnsAnalysis";
import SensitivityTables from "@/components/SensitivityTables";
import UnitRoll from "@/components/UnitRoll";

const DEFAULT_INPUTS: DealInputs = {
  propertyName: "Small Bay Industrial",
  squareFootage: 60000,
  purchasePrice: 9000000,
  closingCosts: {
    titleInsuranceOwnerPct:  0.30,
    titleInsuranceLenderPct: 0.20,
    transferTaxPct:          0.50,
    loanOriginationPct:      1.00,
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
  leaseType: "MG",

  rentPerSF: 14.0,
  annualRentEscalationPct: 3.0,
  vacancyPct: 10,
  creditLossPct: 1.0,
  otherIncomePSF: 0.25,

  // Landlord-paid operating expenses
  realEstateTaxPSF: 1.20,
  insurancePSF: 0.35,
  utilitiesPSF: 0.50,   // not paid under MG — entered for reference
  maintenancePSF: 0.40, // not paid under MG
  janitorialPSF: 0.20,  // not paid under MG

  managementFeePct: 6,
  capitalReservesPSF: 0.30,

  // Rollover costs (higher than big box due to short leases)
  tiPerSFNew: 8.0,
  tiPerSFRenewal: 2.0,
  leasingCommissionNewPct: 6.0,
  leasingCommissionRenewalPct: 2.0,

  ltvPct: 60,
  interestRatePct: 6.75,
  amortizationYears: 25,
  loanTermYears: 10,
  ioPeriodYears: 1,

  holdPeriodYears: 7,
  exitCapRatePct: 6.75,
  sellingCostsPct: 2.0,

  units: [], // empty = use portfolio-level assumptions; populate via Unit Roll tab
};

type Tab = "units" | "debt" | "returns" | "sensitivity";

const TABS: { id: Tab; label: string }[] = [
  { id: "units",       label: "Unit Roll" },
  { id: "debt",        label: "Debt Sizing" },
  { id: "returns",     label: "Returns" },
  { id: "sensitivity", label: "Sensitivity" },
];

function fmtPct(n: number) {
  return isFinite(n) ? `${n.toFixed(1)}%` : "—";
}
function fmtX(n: number) {
  return isFinite(n) ? `${n.toFixed(2)}x` : "—";
}
function fmtDollarM(n: number) {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function Home() {
  const [inputs, setInputs] = useState<DealInputs>(DEFAULT_INPUTS);
  const [activeTab, setActiveTab] = useState<Tab>("units");

  const results = useMemo(() => underwrite(inputs), [inputs]);

  const { debt, returns, annualCashFlows } = results;

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
              <p className="text-xs text-gray-400 leading-tight">{inputs.propertyName || "Unnamed Deal"}</p>
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
          <DealInputsPanel inputs={inputs} onChange={setInputs} />
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
            {activeTab === "debt" && <DebtSizingPanel debt={debt} />}
            {activeTab === "returns" && (
              <ReturnsAnalysis returns={returns} cashFlows={annualCashFlows} />
            )}
            {activeTab === "sensitivity" && (
              <SensitivityTables
                inputs={inputs}
                baseIRR={returns.irr}
                baseEM={returns.equityMultiple}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
