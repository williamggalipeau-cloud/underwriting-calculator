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

export default function DebtSizingPanel({ debt }) {
  const { dscr } = debt;
  const ds = dscrStatus(dscr);
  const ls = ltvStatus(debt.ltv);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">Debt Sizing</h2>
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
      </div>
    </div>
  );
}
