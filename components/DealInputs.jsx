"use client";

import { computeConstructionCostPSF, computeSellingCosts } from "@/lib/calculations";

function Field({ label, value, field, prefix, suffix, step = 1, min = 0, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
        {prefix && (
          <span className="px-3 py-2 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm font-medium">
            {prefix}
          </span>
        )}
        <input
          type={typeof value === "string" ? "text" : "number"}
          value={value}
          step={step}
          min={min}
          onChange={(e) =>
            onChange(
              field,
              typeof value === "string" ? e.target.value : parseFloat(e.target.value) || 0
            )
          }
          className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
        />
        {suffix && (
          <span className="px-3 py-2 bg-gray-50 border-l border-gray-200 text-gray-500 text-sm font-medium">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ClosingCostsSection({ cc, purchasePrice, loanAmount, onChange }) {
  const rows = [
    { label: "Title Insurance (Owner)",  field: "titleInsuranceOwnerPct",  basis: "pp",   step: 0.05 },
    { label: "Title Insurance (Lender)", field: "titleInsuranceLenderPct", basis: "loan", step: 0.05 },
    { label: "Transfer / Recording Tax", field: "transferTaxPct",          basis: "pp",   step: 0.05 },
    { label: "Loan Origination",         field: "loanOriginationPct",      basis: "loan", step: 0.25 },
    { label: "Legal Fees",               field: "legalFees",               basis: "fixed", step: 500  },
    { label: "Phase I ESA",              field: "environmentalReport",     basis: "fixed", step: 250  },
    { label: "Appraisal",                field: "appraisal",               basis: "fixed", step: 500  },
    { label: "Survey / PCA",             field: "surveyAndPCA",            basis: "fixed", step: 250  },
    { label: "Misc / Other",             field: "miscClosingCosts",        basis: "fixed", step: 500  },
  ];

  const computed = (row) => {
    const v = cc[row.field];
    if (row.basis === "pp")   return purchasePrice * (v / 100);
    if (row.basis === "loan") return loanAmount    * (v / 100);
    return v;
  };

  const total = rows.reduce((s, r) => s + computed(r), 0);
  const totalPct = purchasePrice > 0 ? (total / purchasePrice) * 100 : 0;

  return (
    <div>
      <SectionHeader
        title="Closing Costs"
        subtitle={`Total: ${fmtK(total)} (${totalPct.toFixed(2)}% of purchase price)`}
      />
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide w-28">Input</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide w-20">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const val = cc[row.field];
              const amt = computed(row);
              const basisLabel = row.basis === "pp" ? "% of PP" : row.basis === "loan" ? "% of loan" : "$";
              return (
                <tr key={row.field} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">{row.label}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      {row.basis === "fixed" && (
                        <span className="px-2 py-1.5 bg-gray-50 border-r border-gray-200 text-gray-400 text-xs">$</span>
                      )}
                      <input
                        type="number"
                        aria-label={row.label}
                        value={val}
                        step={row.step}
                        min={0}
                        onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1.5 text-xs text-gray-900 bg-white outline-none min-w-0 w-16"
                      />
                      {row.basis !== "fixed" && (
                        <span className="px-2 py-1.5 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs whitespace-nowrap">
                          {basisLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtK(amt)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300">
              <td className="px-3 py-2 font-semibold text-gray-900 text-xs" colSpan={2}>Total Closing Costs</td>
              <td className="px-3 py-2 text-right font-bold text-gray-900 tabular-nums text-xs">{fmtK(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ConstructionCostsSection({ cc, avgUnitSF, onChange }) {
  if (!cc) return null;

  const lineItems = [
    { label: "Demolition & cleanup",     field: "demolition",      step: 0.05 },
    { label: "Partition walls",          field: "partitionWalls",  step: 0.05 },
    { label: "Electrical",               field: "electrical",      step: 0.10 },
    { label: "Plumbing",                 field: "plumbing",        step: 0.05 },
    { label: "HVAC / mechanical",        field: "hvac",            step: 0.10 },
    { label: "Flooring",                 field: "flooring",        step: 0.05 },
    { label: "Painting",                 field: "painting",        step: 0.05 },
    { label: "Lighting",                 field: "lighting",        step: 0.05 },
    { label: "Doors & hardware",         field: "doorsHardware",   step: 0.05 },
    { label: "Overhead / dock doors",    field: "overheadDoors",   step: 0.05 },
    { label: "Misc / allowance",         field: "miscConstruction", step: 0.05 },
  ];

  const markups = [
    { label: "General conditions",  field: "generalConditionsPct", step: 1 },
    { label: "Overhead & profit",   field: "overheadProfitPct",    step: 1 },
    { label: "Contingency",         field: "contingencyPct",       step: 1 },
  ];

  const base    = lineItems.reduce((s, r) => s + (cc[r.field] ?? 0), 0);
  const totalPSF = computeConstructionCostPSF(cc);
  const totalPerUnit = totalPSF * avgUnitSF;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-2">
        Construction Costs — New Lease TI
        <span className="ml-2 font-bold text-blue-700">${totalPSF.toFixed(2)}/SF · {fmtK(totalPerUnit)}/unit</span>
      </p>
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="px-3 py-1.5 text-center font-semibold text-gray-500 uppercase tracking-wide w-24">$/SF</th>
              <th className="px-3 py-1.5 text-right font-semibold text-gray-500 uppercase tracking-wide w-20">$/Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineItems.map((row) => {
              const val = cc[row.field] ?? 0;
              return (
                <tr key={row.field} className="hover:bg-gray-50">
                  <td className="px-3 py-1 text-gray-700 font-medium">{row.label}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      <span className="px-2 py-1 bg-gray-50 border-r border-gray-200 text-gray-400 text-xs">$</span>
                      <input
                        type="number"
                        aria-label={row.label}
                        value={val}
                        step={row.step}
                        min={0}
                        onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-14"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums text-gray-500">{fmtK(val * avgUnitSF)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-1.5 text-xs font-semibold text-gray-700" colSpan={2}>Base subtotal</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs font-semibold text-gray-700">{fmtK(base * avgUnitSF)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Markup inputs */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-gray-100">
            {markups.map((row) => {
              const val = cc[row.field] ?? 0;
              return (
                <tr key={row.field} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-700 font-medium">{row.label}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      <input
                        type="number"
                        aria-label={row.label}
                        value={val}
                        step={row.step}
                        min={0}
                        onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-14"
                      />
                      <span className="px-2 py-1 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 text-xs">applied on total</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50 border-t-2 border-blue-200">
              <td className="px-3 py-1.5 text-xs font-bold text-blue-800" colSpan={2}>Total TI (new lease)</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs font-bold text-blue-800">{fmtK(totalPerUnit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ExitCostsSection({ sc, onChange }) {
  if (!sc) return null;

  const rows = [
    { label: "Broker Commission",   field: "brokerCommissionPct",  basis: "pct", step: 0.25 },
    { label: "Transfer / Recording Tax", field: "transferTaxPct",  basis: "pct", step: 0.05 },
    { label: "Title Insurance",     field: "titleInsurancePct",    basis: "pct", step: 0.05 },
    { label: "Legal Fees",          field: "legalFees",            basis: "fixed", step: 1000 },
    { label: "Misc / Other",        field: "miscDispositionCosts", basis: "fixed", step: 1000 },
  ];

  // Estimate exit value for display using a placeholder note
  // (actual exit value is computed in calculations; we show $/unit for reference)
  const totalPct = rows.filter(r => r.basis === "pct").reduce((s, r) => s + (sc[r.field] ?? 0), 0);
  const totalFixed = rows.filter(r => r.basis === "fixed").reduce((s, r) => s + (sc[r.field] ?? 0), 0);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-2">
        Disposition Costs
        <span className="ml-2 text-gray-400 font-normal">
          {totalPct.toFixed(2)}% of exit value + {fmtK(totalFixed)} fixed
        </span>
      </p>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="px-3 py-1.5 text-center font-semibold text-gray-500 uppercase tracking-wide w-32">Input</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const val = sc[row.field] ?? 0;
              return (
                <tr key={row.field} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-700 font-medium whitespace-nowrap">{row.label}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      {row.basis === "fixed" && (
                        <span className="px-2 py-1 bg-gray-50 border-r border-gray-200 text-gray-400 text-xs">$</span>
                      )}
                      <input
                        type="number"
                        aria-label={row.label}
                        value={val}
                        step={row.step}
                        min={0}
                        onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-20"
                      />
                      {row.basis === "pct" && (
                        <span className="px-2 py-1 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs">% of sale</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LEASE_TYPES = [
  { id: "NNN",   label: "NNN",          description: "Tenant pays taxes, insurance, maintenance" },
  { id: "MG",    label: "Modified Gross", description: "Landlord pays taxes & insurance" },
  { id: "Gross", label: "Full Gross",    description: "Landlord pays all operating expenses" },
];

function fmtK(n) {
  if (n === 0) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function DealInputsPanel({ inputs, onChange }) {
  const set = (field, value) => onChange({ ...inputs, [field]: value });

  const setCC = (field, value) =>
    onChange({ ...inputs, closingCosts: { ...inputs.closingCosts, [field]: value } });

  const avgUnitSize =
    inputs.unitCount > 0 ? Math.round(inputs.squareFootage / inputs.unitCount) : 0;

  const isMG    = inputs.leaseType === "MG";
  const isGross = inputs.leaseType === "Gross";

  return (
    <div className="space-y-7">
      {/* Property */}
      <div>
        <SectionHeader title="Property" />
        <div className="grid grid-cols-1 gap-3">
          <Field label="Property Name" value={inputs.propertyName} field="propertyName" onChange={set} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Square Footage" value={inputs.squareFootage} field="squareFootage" suffix="SF" step={1000} onChange={set} />
            <Field label="Purchase Price" value={inputs.purchasePrice} field="purchasePrice" prefix="$" step={100000} onChange={set} />
          </div>
        </div>
      </div>

      {/* Closing Costs */}
      <ClosingCostsSection
        cc={inputs.closingCosts}
        purchasePrice={inputs.purchasePrice}
        loanAmount={inputs.purchasePrice * (inputs.ltvPct / 100)}
        onChange={setCC}
      />

      {/* Multi-tenant */}
      <div>
        <SectionHeader title="Multi-Tenant" subtitle={avgUnitSize > 0 ? `Avg unit: ${avgUnitSize.toLocaleString()} SF` : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit Count" value={inputs.unitCount} field="unitCount" suffix="units" step={1} onChange={set} />
          <Field label="Avg Lease Term" value={inputs.avgLeaseTerm} field="avgLeaseTerm" suffix="yrs" step={0.5} onChange={set} />
          <Field label="Renewal Probability" value={inputs.renewalProbabilityPct} field="renewalProbabilityPct" suffix="%" step={5} onChange={set} />
          <Field label="Downtime" value={inputs.downtimeBetweenLeases} field="downtimeBetweenLeases" suffix="mo" step={1} onChange={set} />
        </div>
      </div>

      {/* Lease Structure */}
      <div>
        <SectionHeader title="Lease Structure" />
        <div className="flex flex-col gap-2">
          {LEASE_TYPES.map((lt) => (
            <button
              key={lt.id}
              type="button"
              onClick={() => onChange({ ...inputs, leaseType: lt.id })}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                inputs.leaseType === lt.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${inputs.leaseType === lt.id ? "text-blue-700" : "text-gray-700"}`}>
                  {lt.label}
                </span>
                {inputs.leaseType === lt.id && (
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Selected</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{lt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Income */}
      <div>
        <SectionHeader title="Income" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base Rent" value={inputs.rentPerSF} field="rentPerSF" prefix="$" suffix="/SF/yr" step={0.25} onChange={set} />
          <Field label="Escalation" value={inputs.annualRentEscalationPct} field="annualRentEscalationPct" suffix="%" step={0.5} onChange={set} />
          <Field label="Physical Vacancy" value={inputs.vacancyPct} field="vacancyPct" suffix="%" step={0.5} onChange={set} />
          <Field label="Credit Loss" value={inputs.creditLossPct} field="creditLossPct" suffix="% of EGR" step={0.25} onChange={set} />
          <div className="col-span-2">
            <Field label="Other Income" value={inputs.otherIncomePSF} field="otherIncomePSF" prefix="$" suffix="/SF/yr" step={0.05} onChange={set} />
          </div>
        </div>
      </div>

      {/* Operating Expenses */}
      <div>
        <SectionHeader
          title="Operating Expenses"
          subtitle={
            inputs.leaseType === "NNN"
              ? "NNN — all pass through to tenant; enter for reference only"
              : inputs.leaseType === "MG"
              ? "MG — taxes & insurance are landlord-paid (highlighted)"
              : "Gross — all are landlord-paid"
          }
        />
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Real Estate Tax", field: "realEstateTaxPSF", landlordPaid: isMG || isGross },
            { label: "Insurance",       field: "insurancePSF",     landlordPaid: isMG || isGross },
            { label: "Utilities",       field: "utilitiesPSF",     landlordPaid: isGross },
            { label: "Maintenance",     field: "maintenancePSF",   landlordPaid: isGross },
            { label: "Janitorial",      field: "janitorialPSF",    landlordPaid: isGross },
          ].map(({ label, field, landlordPaid }) => (
            <div key={field} className={`rounded-lg ${landlordPaid ? "ring-1 ring-amber-300" : ""}`}>
              <div className="flex flex-col gap-1">
                <label htmlFor={`expense-${field}`} className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  {label}
                  {landlordPaid && (
                    <span className="text-amber-600 text-xs font-semibold">★ landlord</span>
                  )}
                </label>
                <div className={`flex items-center border rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden ${landlordPaid ? "border-amber-300" : "border-gray-200"}`}>
                  <span className="px-3 py-2 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm font-medium">$</span>
                  <input
                    id={`expense-${field}`}
                    type="number"
                    value={inputs[field]}
                    step={0.05}
                    min={0}
                    onChange={(e) => set(field, parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
                  />
                  <span className="px-3 py-2 bg-gray-50 border-l border-gray-200 text-gray-500 text-sm font-medium">/SF</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
          <Field label="Mgmt. Fee" value={inputs.managementFeePct} field="managementFeePct" suffix="% EGR" step={0.5} onChange={set} />
          <Field label="Leasing Fees" value={inputs.leasingFeesPSF} field="leasingFeesPSF" prefix="$" suffix="/SF/yr" step={0.05} onChange={set} />
          <Field label="Capital Reserves" value={inputs.capitalReservesPSF} field="capitalReservesPSF" prefix="$" suffix="/SF/yr" step={0.05} onChange={set} />
        </div>
      </div>

      {/* Rollover Costs */}
      <div>
        <SectionHeader title="Rollover Costs" subtitle="Normalized annually over avg lease term" />
        <ConstructionCostsSection
          cc={inputs.constructionCosts}
          avgUnitSF={inputs.unitCount > 0 ? Math.round(inputs.squareFootage / inputs.unitCount) : inputs.squareFootage}
          onChange={(field, value) =>
            onChange({ ...inputs, constructionCosts: { ...inputs.constructionCosts, [field]: value } })
          }
        />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="TI — Renewal" value={inputs.tiPerSFRenewal} field="tiPerSFRenewal" prefix="$" suffix="/SF" step={0.5} onChange={set} />
          <div />
          <Field label="LC — New Lease" value={inputs.leasingCommissionNewPct} field="leasingCommissionNewPct" suffix="% lease val" step={0.5} onChange={set} />
          <Field label="LC — Renewal" value={inputs.leasingCommissionRenewalPct} field="leasingCommissionRenewalPct" suffix="% lease val" step={0.5} onChange={set} />
        </div>
      </div>

      {/* Financing */}
      <div>
        <SectionHeader title="Financing" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="LTV" value={inputs.ltvPct} field="ltvPct" suffix="%" step={5} onChange={set} />
          <Field label="Amortization" value={inputs.amortizationYears} field="amortizationYears" suffix="yrs" step={5} onChange={set} />
          <Field label="I/O Period" value={inputs.ioPeriodYears} field="ioPeriodYears" suffix="yrs" step={1} onChange={set} />
        </div>

        {/* Loan term + extensions */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            Loan Term
            <span className="ml-2 font-bold text-blue-700">
              {inputs.loanTermYears}
              {inputs.extensionCount > 0
                ? " + " + Array(inputs.extensionCount).fill(`${inputs.extensionTermYears}`).join("+")
                : ""} yrs
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Initial Term" value={inputs.loanTermYears} field="loanTermYears" suffix="yrs" step={1} onChange={set} />
            <Field label="Extensions" value={inputs.extensionCount} field="extensionCount" suffix="options" step={1} onChange={set} />
            <Field label="Ext. Length" value={inputs.extensionTermYears} field="extensionTermYears" suffix="yrs" step={1} onChange={set} />
            <Field label="Ext. Fee" value={inputs.extensionFeePct} field="extensionFeePct" suffix="% / ext" step={0.05} onChange={set} />
          </div>
        </div>

        {/* Rate type */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex gap-2 mb-3">
            {["fixed", "floating"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...inputs, floatingRate: t === "floating" })}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  (t === "floating") === !!inputs.floatingRate
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {t === "fixed" ? "Fixed Rate" : "Floating Rate"}
              </button>
            ))}
          </div>
          {inputs.floatingRate ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Index Rate" value={inputs.indexRatePct} field="indexRatePct" suffix="%" step={0.05} onChange={set} />
              <Field label="Spread" value={inputs.spreadPct} field="spreadPct" suffix="%" step={0.10} onChange={set} />
              <div className="col-span-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 font-medium">
                Effective rate: {((inputs.indexRatePct ?? 0) + (inputs.spreadPct ?? 0)).toFixed(2)}%
                {inputs.hedgingType === "cap" && inputs.capStrikeRatePct
                  ? ` (capped at ${inputs.capStrikeRatePct}%)`
                  : inputs.hedgingType === "swap" && inputs.swapFixedRatePct
                  ? ` → swapped to ${inputs.swapFixedRatePct}% fixed`
                  : ""}
              </div>
            </div>
          ) : (
            <Field label="Interest Rate" value={inputs.interestRatePct} field="interestRatePct" suffix="%" step={0.25} onChange={set} />
          )}
        </div>

        {/* Hedging */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">Hedging</p>
          <div className="flex gap-2 mb-3">
            {["none", "cap", "swap"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...inputs, hedgingType: t })}
                className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  inputs.hedgingType === t
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {t === "none" ? "None" : t === "cap" ? "Rate Cap" : "Swap"}
              </button>
            ))}
          </div>
          {inputs.hedgingType === "cap" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cap Strike" value={inputs.capStrikeRatePct} field="capStrikeRatePct" suffix="%" step={0.25} onChange={set} />
              <Field label="Cap Premium" value={inputs.capPremiumPct} field="capPremiumPct" suffix="% of loan" step={0.10} onChange={set} />
            </div>
          )}
          {inputs.hedgingType === "swap" && (
            <Field label="Swap Fixed Rate" value={inputs.swapFixedRatePct} field="swapFixedRatePct" suffix="%" step={0.25} onChange={set} />
          )}
        </div>
      </div>

      {/* Exit */}
      <div>
        <SectionHeader title="Exit Assumptions" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Hold Period" value={inputs.holdPeriodYears} field="holdPeriodYears" suffix="yrs" step={1} min={1} onChange={set} />
          <Field label="Exit Cap Rate" value={inputs.exitCapRatePct} field="exitCapRatePct" suffix="%" step={0.25} onChange={set} />
        </div>
        <ExitCostsSection
          sc={inputs.sellingCosts}
          onChange={(field, value) =>
            onChange({ ...inputs, sellingCosts: { ...inputs.sellingCosts, [field]: value } })
          }
        />
      </div>
    </div>
  );
}
