"use client";

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
        <div className="grid grid-cols-2 gap-3">
          <Field label="TI — New Lease" value={inputs.tiPerSFNew} field="tiPerSFNew" prefix="$" suffix="/SF" step={0.5} onChange={set} />
          <Field label="TI — Renewal" value={inputs.tiPerSFRenewal} field="tiPerSFRenewal" prefix="$" suffix="/SF" step={0.5} onChange={set} />
          <Field label="LC — New Lease" value={inputs.leasingCommissionNewPct} field="leasingCommissionNewPct" suffix="% lease val" step={0.5} onChange={set} />
          <Field label="LC — Renewal" value={inputs.leasingCommissionRenewalPct} field="leasingCommissionRenewalPct" suffix="% lease val" step={0.5} onChange={set} />
        </div>
      </div>

      {/* Financing */}
      <div>
        <SectionHeader title="Financing" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="LTV" value={inputs.ltvPct} field="ltvPct" suffix="%" step={5} onChange={set} />
          <Field label="Interest Rate" value={inputs.interestRatePct} field="interestRatePct" suffix="%" step={0.25} onChange={set} />
          <Field label="Amortization" value={inputs.amortizationYears} field="amortizationYears" suffix="yrs" step={5} onChange={set} />
          <Field label="I/O Period" value={inputs.ioPeriodYears} field="ioPeriodYears" suffix="yrs" step={1} onChange={set} />
        </div>
      </div>

      {/* Exit */}
      <div>
        <SectionHeader title="Exit Assumptions" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hold Period" value={inputs.holdPeriodYears} field="holdPeriodYears" suffix="yrs" step={1} min={1} onChange={set} />
          <Field label="Exit Cap Rate" value={inputs.exitCapRatePct} field="exitCapRatePct" suffix="%" step={0.25} onChange={set} />
          <Field label="Selling Costs" value={inputs.sellingCostsPct} field="sellingCostsPct" suffix="%" step={0.25} onChange={set} />
        </div>
      </div>
    </div>
  );
}
