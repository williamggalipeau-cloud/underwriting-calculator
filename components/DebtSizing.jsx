"use client";

function fmt(n, decimals = 0) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n, decimals = 2) {
  if (!isFinite(n)) return "—";
  return `${fmt(n, decimals)}%`;
}

function fmtDollar(n, decimals = 0) {
  if (!isFinite(n)) return "—";
  return `$${fmt(n, decimals)}`;
}

function fmtM(n) {
  if (!isFinite(n) || n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${fmt(n / 1_000_000, 2)}M`;
  return fmtDollar(n);
}

function StatusBadge({ status, label }) {
  const colors = {
    good: "bg-green-50 text-green-700 border-green-200",
    warn: "bg-yellow-50 text-yellow-700 border-yellow-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${colors[status]}`}>
      {label}
    </span>
  );
}

function MetricRow({ label, value, sub, status, statusLabel, highlight }) {
  return (
    <div className={`flex items-center justify-between py-3 border-b border-gray-100 last:border-0 ${highlight ? "bg-blue-50 -mx-4 px-4 rounded" : ""}`}>
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        {status && statusLabel && <StatusBadge status={status} label={statusLabel} />}
        <span className={`text-sm font-semibold tabular-nums ${highlight ? "text-blue-700" : "text-gray-900"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

function dscrStatus(dscr) {
  if (dscr >= 1.35) return { status: "good", label: "Strong" };
  if (dscr >= 1.20) return { status: "good", label: "Acceptable" };
  if (dscr >= 1.10) return { status: "warn", label: "Tight" };
  return { status: "bad", label: "Below min" };
}

function ltvStatus(ltv) {
  if (ltv <= 60) return { status: "good", label: "Conservative" };
  if (ltv <= 70) return { status: "good", label: "Standard" };
  if (ltv <= 75) return { status: "warn", label: "Elevated" };
  return { status: "bad", label: "High" };
}

const constraintColors = {
  LTV:          "bg-blue-50 text-blue-700 border-blue-200",
  DSCR:         "bg-purple-50 text-purple-700 border-purple-200",
  LTC:          "bg-orange-50 text-orange-700 border-orange-200",
  "Debt Yield": "bg-teal-50 text-teal-700 border-teal-200",
};

export default function DebtSizingPanel({ debt }) {
  const { dscr } = debt;
  const ds = dscrStatus(dscr);
  const ls = ltvStatus(debt.ltv);
  const binding = debt.bindingConstraint ?? "LTV";
  const bindingColor = constraintColors[binding] ?? constraintColors.LTV;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">Debt Sizing</h2>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${bindingColor}`}>
          Sized by {binding}
        </span>
      </div>

      {/* Key callouts */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className={`rounded-xl border p-4 ${ds.status === "bad" ? "border-red-200 bg-red-50" : ds.status === "warn" ? "border-yellow-200 bg-yellow-50" : "border-green-200 bg-green-50"}`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">DSCR</p>
          <p className={`text-2xl font-bold ${ds.status === "bad" ? "text-red-700" : ds.status === "warn" ? "text-yellow-700" : "text-green-700"}`}>
            {fmt(dscr, 2)}x
          </p>
          <p className={`text-xs mt-1 ${ds.status === "bad" ? "text-red-600" : ds.status === "warn" ? "text-yellow-600" : "text-green-600"}`}>
            {ds.label} — min. typically 1.25x
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${ls.status === "bad" ? "border-red-200 bg-red-50" : ls.status === "warn" ? "border-yellow-200 bg-yellow-50" : "border-green-200 bg-green-50"}`}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">LTV</p>
          <p className={`text-2xl font-bold ${ls.status === "bad" ? "text-red-700" : ls.status === "warn" ? "text-yellow-700" : "text-green-700"}`}>
            {fmtPct(debt.ltv, 1)}
          </p>
          <p className={`text-xs mt-1 ${ls.status === "bad" ? "text-red-600" : ls.status === "warn" ? "text-yellow-600" : "text-green-600"}`}>
            {ls.label} — max. typically 75%
          </p>
        </div>
      </div>

      {/* Metrics table */}
      <div className="bg-white border border-gray-200 rounded-xl px-4">
        <MetricRow label="Loan Amount" value={fmtDollar(debt.loanAmount)} highlight />
        {debt.tiReserveEnabled && (
          <>
            <MetricRow
              label="TI Reserve (Holdback)"
              sub="Lender commitment — not disbursed at close"
              value={fmtM(debt.tiReserveTotal)}
            />
            <MetricRow
              label="Total Commitment"
              sub="Loan + TI reserve"
              value={fmtM(debt.totalCommitment)}
              highlight
            />
          </>
        )}
        <MetricRow
          label="Equity Required"
          sub="Purchase price + closing costs − loan"
          value={fmtDollar(debt.equityRequired)}
        />
        <MetricRow label="Annual Debt Service" value={fmtDollar(debt.annualDebtService)} />
        <MetricRow label="Monthly Payment" value={fmtDollar(debt.monthlyPayment)} />
        <MetricRow
          label="Loan Constant"
          sub="Annual debt service ÷ loan amount"
          value={fmtPct(debt.loanConstant, 2)}
        />
        <MetricRow
          label="DSCR"
          sub="Year 1 NOI ÷ annual debt service"
          value={`${fmt(debt.dscr, 2)}x`}
          status={ds.status}
          statusLabel={ds.label}
        />
        <MetricRow
          label="Adjusted DSCR"
          sub="After TI & leasing commissions"
          value={`${fmt(debt.adjustedDscr, 2)}x`}
          status={dscrStatus(debt.adjustedDscr).status}
          statusLabel={dscrStatus(debt.adjustedDscr).label}
        />
        <MetricRow
          label="LTV"
          sub="Loan ÷ purchase price"
          value={fmtPct(debt.ltv, 1)}
          status={ls.status}
          statusLabel={ls.label}
        />
        <MetricRow
          label="LTC"
          sub="Loan ÷ (purchase price + closing costs)"
          value={fmtPct(debt.ltc, 1)}
        />
        <MetricRow
          label="Debt Yield"
          sub="Year 1 NOI ÷ loan amount"
          value={fmtPct(debt.debtYield, 2)}
        />
        <MetricRow
          label="Year 1 NOI"
          sub="Used for loan sizing constraints"
          value={fmtM(debt.year1NOI)}
        />
        <MetricRow
          label="Effective Interest Rate"
          sub={debt.capPremium > 0 ? `Incl. $${fmt(debt.capPremium)} cap premium at close` : undefined}
          value={fmtPct(debt.effectiveRate, 2)}
        />
        {debt.capPremium > 0 && (
          <MetricRow
            label="Rate Cap Premium"
            sub="Upfront cost added to equity at close"
            value={fmtDollar(debt.capPremium)}
          />
        )}
      </div>

      {/* Constraint comparison */}
      {debt.constraintAmounts && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Sizing Constraints — Implied Loan</h3>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Constraint</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">Max Loan</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide w-24">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { name: "LTV",        amount: debt.constraintAmounts.ltv,        enabled: true },
                  { name: "DSCR",       amount: debt.constraintAmounts.dscr,       enabled: debt.constraintAmounts.dscr != null },
                  { name: "LTC",        amount: debt.constraintAmounts.ltc,        enabled: debt.constraintAmounts.ltc != null },
                  { name: "Debt Yield", amount: debt.constraintAmounts.debtYield,  enabled: debt.constraintAmounts.debtYield != null },
                ].map(({ name, amount, enabled }) => {
                  const isBinding = name === binding;
                  return (
                    <tr key={name} className={isBinding ? "bg-blue-50" : "hover:bg-gray-50"}>
                      <td className={`px-3 py-2 font-medium ${isBinding ? "text-blue-700" : "text-gray-600"}`}>
                        {name}
                        {isBinding && <span className="ml-1.5 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">binding</span>}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${isBinding ? "text-blue-700" : enabled ? "text-gray-700" : "text-gray-300"}`}>
                        {enabled && amount != null ? fmtM(amount) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!enabled ? (
                          <span className="text-xs text-gray-300">off</span>
                        ) : isBinding ? (
                          <span className="text-xs font-semibold text-blue-600">binding</span>
                        ) : (
                          <span className="text-xs text-emerald-600">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
