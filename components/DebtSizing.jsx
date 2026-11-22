"use client";

import RateCapSchedule from "@/components/RateCapSchedule";

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

// ─── Covenant compliance ──────────────────────────────────────────────────────

function covenantStatus(value, threshold, isMax) {
  if (!isFinite(value)) return "—";
  const breach = isMax ? value > threshold : value < threshold;
  const margin = isMax
    ? (threshold - value) / threshold
    : (value - threshold) / threshold;
  if (breach)        return "breach";
  if (margin < 0.05) return "warn";
  return "pass";
}

const statusStyles = {
  pass:   { cell: "text-emerald-700 font-medium", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warn:   { cell: "text-yellow-700 font-medium",  badge: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  breach: { cell: "text-red-700 font-bold",        badge: "bg-red-50 text-red-700 border-red-200" },
  "—":    { cell: "text-gray-300",                 badge: "bg-gray-50 text-gray-400 border-gray-200" },
};

function CovenantCompliance({ cashFlows, inputs }) {
  const cv = inputs.loanCovenants ?? {};

  const covenants = [
    cv.dscrEnabled      && { key: "dscr", label: "DSCR",       threshold: cv.dscrMin      ?? 1.25, isMax: false, fmtV: (v) => `${fmt(v, 2)}x`    },
    cv.debtYieldEnabled && { key: "dy",   label: "Debt Yield", threshold: cv.debtYieldMin ?? 8.0,  isMax: false, fmtV: (v) => fmtPct(v, 2)        },
    cv.ltvEnabled       && { key: "ltv",  label: "LTV",        threshold: cv.ltvMax       ?? 75,   isMax: true,  fmtV: (v) => fmtPct(v, 1)        },
    cv.occupancyEnabled && { key: "occ",  label: "Occupancy",  threshold: cv.occupancyMin ?? 85,   isMax: false, fmtV: (v) => fmtPct(v, 1)        },
  ].filter(Boolean);

  if (covenants.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center">
        <p className="text-sm font-medium text-gray-400">No covenants configured</p>
        <p className="text-xs text-gray-300 mt-1">Enable covenants in Deal Inputs → Financing → Loan Covenants.</p>
      </div>
    );
  }

  const rows = cashFlows.map((cf) => {
    const dscr = cf.debtService > 0 ? cf.noi / cf.debtService : null;
    const dy   = cf.loanBalance  > 0 ? (cf.noi / cf.loanBalance) * 100 : null;
    const imp  = cf.noi > 0 && inputs.exitCapRatePct > 0 ? cf.noi / (inputs.exitCapRatePct / 100) : null;
    const ltv  = imp && cf.loanBalance > 0 ? (cf.loanBalance / imp) * 100 : null;
    const occ  = cf.grossRevenue > 0 ? ((cf.grossRevenue - cf.physicalVacancy) / cf.grossRevenue) * 100 : null;
    return { year: cf.year, dscr, dy, ltv, occ };
  });

  const breachYears = rows.filter((r) =>
    covenants.some(({ key, threshold, isMax }) => {
      const v = r[key]; return v != null && covenantStatus(v, threshold, isMax) === "breach";
    })
  );
  const warnYears = rows.filter((r) =>
    covenants.some(({ key, threshold, isMax }) => {
      const v = r[key]; return v != null && covenantStatus(v, threshold, isMax) === "warn";
    })
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Covenant Compliance</h3>

      <div className={`rounded-xl border px-4 py-3 text-sm ${
        breachYears.length > 0  ? "border-red-200 bg-red-50 text-red-800" :
        warnYears.length   > 0  ? "border-yellow-200 bg-yellow-50 text-yellow-800" :
                                   "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}>
        {breachYears.length > 0 ? (
          <><span className="font-semibold">Covenant breach</span> in {breachYears.length === 1 ? `Year ${breachYears[0].year}` : `${breachYears.length} years`}.{warnYears.length > 0 && ` Warning zone in ${warnYears.length} additional year${warnYears.length > 1 ? "s" : ""}.`}</>
        ) : warnYears.length > 0 ? (
          <><span className="font-semibold">Covenant warning</span> — within 5% of threshold in {warnYears.length} year{warnYears.length > 1 ? "s" : ""}. No outright breaches.</>
        ) : (
          <><span className="font-semibold">All covenants met</span> — full hold period compliance.</>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {covenants.map(({ key, label, threshold, isMax, fmtV }) => (
          <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
            <span className="text-gray-500">{label} </span>
            <span className="font-semibold text-gray-700">{isMax ? "≤" : "≥"} {fmtV(threshold)}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Year</th>
              {covenants.map(({ key, label, threshold, isMax, fmtV }) => (
                <th key={key} className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {label}
                  <span className="ml-1 text-gray-300 font-normal normal-case">({isMax ? "≤" : "≥"}{fmtV(threshold)})</span>
                </th>
              ))}
              <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const ys = covenants.map(({ key, threshold, isMax }) => {
                const v = r[key]; return v != null ? covenantStatus(v, threshold, isMax) : "—";
              });
              const worst = ys.includes("breach") ? "breach" : ys.includes("warn") ? "warn" : ys.every((s) => s === "pass") ? "pass" : "—";
              const rowBg = worst === "breach" ? "bg-red-50" : worst === "warn" ? "bg-yellow-50/60" : "";
              return (
                <tr key={r.year} className={`transition-colors hover:brightness-95 ${rowBg}`}>
                  <td className="px-3 py-2 font-medium text-gray-700">Y{r.year}</td>
                  {covenants.map(({ key, fmtV }, ci) => {
                    const v = r[key]; const s = statusStyles[ys[ci]] ?? statusStyles["—"];
                    return <td key={key} className={`px-3 py-2 text-right tabular-nums ${s.cell}`}>{v != null ? fmtV(v) : "—"}</td>;
                  })}
                  <td className="px-3 py-2 text-center">
                    {worst === "breach" ? <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Breach</span>
                     : worst === "warn" ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-yellow-50 text-yellow-700 border-yellow-200">Warning</span>
                     : worst === "pass" ? <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Pass</span>
                     : <span className="text-xs text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">LTV estimated as loan balance ÷ (NOI ÷ exit cap rate). Occupancy = (scheduled − vacancy) ÷ scheduled.</p>
    </div>
  );
}

// ─── TI Reserve ──────────────────────────────────────────────────────────────

function TIReserveSection({ debt, cashFlows }) {
  if (!debt.tiReserveEnabled) return null;

  const totalShortfall = cashFlows.reduce((s, cf) => s + (cf.tiDrawShortfall ?? 0), 0);
  const utilizationPct = debt.tiReserveTotal > 0 ? (debt.totalTIDrawn / debt.tiReserveTotal) * 100 : 0;
  const anyShortfall = cashFlows.some((cf) => (cf.tiDrawShortfall ?? 0) > 0);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">TI Reserve Analysis</h3>

      <div className={`rounded-xl border px-4 py-3 text-sm ${anyShortfall ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        {anyShortfall ? (
          <><span className="font-semibold">Draw shortfall detected</span> — equity must fund {fmtM(totalShortfall)} in TI costs that failed the DSCR draw test.</>
        ) : (
          <><span className="font-semibold">All draws approved</span> — reserve fully covers projected TI costs over the hold period.</>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Reserve",   value: fmtM(debt.tiReserveTotal),  sub: "Committed by lender" },
          { label: "Total Drawn",     value: fmtM(debt.totalTIDrawn),    sub: `${fmt(utilizationPct, 0)}% utilized` },
          { label: "Total Shortfall", value: fmtM(totalShortfall),       sub: anyShortfall ? "Equity-funded gap" : "None", warn: anyShortfall },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} className={`rounded-xl border p-3 ${warn ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
            <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${warn ? "text-red-500" : "text-gray-500"}`}>{label}</p>
            <p className={`text-lg font-bold tabular-nums ${warn ? "text-red-700" : "text-gray-900"}`}>{value}</p>
            {sub && <p className={`text-xs mt-0.5 ${warn ? "text-red-500" : "text-gray-400"}`}>{sub}</p>}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Year", "TI Needed", "DSCR", "Draw Approved", "Shortfall", "Reserve Remaining", "Status"].map((h) => (
                <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cashFlows.map((cf) => {
              const needed    = cf.tiDrawNeeded    ?? 0;
              const approved  = cf.tiDrawApproved  ?? 0;
              const shortfall = cf.tiDrawShortfall ?? 0;
              const remaining = cf.tiReserveRemaining ?? 0;
              const dscr      = cf.debtService > 0 ? cf.noi / cf.debtService : null;
              const hasShortfall = shortfall > 0;
              const hasActivity  = needed > 0;
              let statusLabel, statusColor;
              if (!hasActivity)       { statusLabel = "No TI";    statusColor = "text-gray-400"; }
              else if (hasShortfall)  { statusLabel = "Shortfall"; statusColor = "text-red-600 font-semibold"; }
              else                    { statusLabel = "Approved";  statusColor = "text-emerald-600 font-semibold"; }
              return (
                <tr key={cf.year} className={`transition-colors ${hasShortfall ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"}`}>
                  <td className="px-3 py-2 font-medium text-gray-700">Y{cf.year}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{needed > 0 ? fmtM(needed) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${dscr != null && dscr < 1.10 ? "text-red-600" : "text-gray-600"}`}>
                    {dscr != null ? `${fmt(dscr, 2)}x` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{approved > 0 ? fmtM(approved) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${hasShortfall ? "text-red-600 font-semibold" : "text-gray-300"}`}>{hasShortfall ? fmtM(shortfall) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtM(remaining)}</td>
                  <td className={`px-3 py-2 text-right ${statusColor}`}>{statusLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DebtSizingPanel({ debt, cashFlows, inputs, cap, onCapChange }) {
  const { dscr } = debt;
  const ds = dscrStatus(dscr);
  const ls = ltvStatus(debt.ltv);
  const binding = debt.bindingConstraint ?? "LTV";
  const bindingColor = constraintColors[binding] ?? constraintColors.LTV;

  return (
    <div className="space-y-8">
      <div>
      <div className="flex items-center justify-between mb-5">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-gray-900" title={inputs.propertyName || "Unnamed deal"}>{inputs.propertyName || "Unnamed deal"}</p>
          <h2 className="text-sm font-semibold text-gray-500">Debt</h2>
        </div>
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

      {/* Rate cap: settings and the full schedule */}
      {inputs?.hedgingType === "cap" && <RateCapSchedule cap={cap} inputs={inputs} loanAmount={debt.loanAmount} onChange={onCapChange} />}

      {/* Lender name */}
      {inputs?.lenderName && (
        <div className="rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lender</span>
          <span className="text-sm font-semibold text-gray-900">{inputs.lenderName}</span>
        </div>
      )}

      {/* Covenant compliance */}
      {cashFlows && inputs && (
        <CovenantCompliance cashFlows={cashFlows} inputs={inputs} />
      )}

      {/* TI Reserve */}
      {cashFlows && debt.tiReserveEnabled && (
        <TIReserveSection debt={debt} cashFlows={cashFlows} />
      )}
    </div>
  );
}
