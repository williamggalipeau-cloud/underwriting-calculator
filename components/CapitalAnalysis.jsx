"use client";

function fmt(n, decimals = 0) {
  if (!isFinite(n) || n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtPct(n, d = 1) { return (isFinite(n) && n != null) ? `${fmt(n, d)}%` : "—"; }
function fmtM(n) {
  if (!isFinite(n) || n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${fmt(n / 1_000_000, 2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${fmt(n / 1_000, 1)}k`;
  return `$${fmt(n)}`;
}

const CONSTRAINT_STYLES = {
  LTV:          { dot: "bg-blue-500",   text: "text-blue-700",   badge: "bg-blue-50 text-blue-700 border-blue-200" },
  DSCR:         { dot: "bg-purple-500", text: "text-purple-700", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  LTC:          { dot: "bg-orange-500", text: "text-orange-700", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  "Debt Yield": { dot: "bg-teal-500",   text: "text-teal-700",   badge: "bg-teal-50 text-teal-700 border-teal-200" },
};

function ConstraintStrip({ debt }) {
  const binding = debt.bindingConstraint ?? "LTV";
  const ca      = debt.constraintAmounts ?? {};

  const constraints = [
    { name: "LTV",        amount: ca.ltv,        enabled: true },
    { name: "DSCR",       amount: ca.dscr,        enabled: ca.dscr != null },
    { name: "LTC",        amount: ca.ltc,         enabled: ca.ltc != null },
    { name: "Debt Yield", amount: ca.debtYield,   enabled: ca.debtYield != null },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Loan Sizing</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {constraints.map(({ name, amount, enabled }) => {
          const isBinding = name === binding;
          const s = CONSTRAINT_STYLES[name] ?? CONSTRAINT_STYLES.LTV;
          return (
            <div
              key={name}
              className={`rounded-xl border p-3 ${isBinding ? `${s.badge} border-current` : "bg-gray-50 border-gray-200"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold uppercase tracking-wide ${isBinding ? s.text : "text-gray-500"}`}>{name}</span>
                {isBinding && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${s.badge}`}>binding</span>
                )}
                {!enabled && (
                  <span className="text-xs text-gray-300 border border-gray-200 px-1.5 py-0.5 rounded-full">off</span>
                )}
              </div>
              <p className={`text-lg font-bold tabular-nums ${isBinding ? s.text : enabled ? "text-gray-700" : "text-gray-300"}`}>
                {enabled && amount != null ? fmtM(amount) : "—"}
              </p>
              {isBinding && (
                <p className={`text-xs mt-0.5 ${s.text}`}>= actual loan amount</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary strip */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {[
          { label: "Loan Amount",      value: fmtM(debt.loanAmount),      sub: `Sized by ${binding}` },
          debt.tiReserveEnabled && { label: "TI Reserve (Holdback)", value: fmtM(debt.tiReserveTotal), sub: "Committed by lender at close, held in escrow" },
          debt.tiReserveEnabled && { label: "Total Commitment",      value: fmtM(debt.totalCommitment), sub: "Loan + TI reserve" },
          { label: "Year 1 NOI",       value: fmtM(debt.year1NOI),        sub: "Pre-debt-service NOI used for sizing" },
          { label: "DSCR (Y1)",        value: `${fmt(debt.dscr, 2)}x`,    sub: "Year 1 NOI ÷ debt service" },
          { label: "Debt Yield",       value: fmtPct(debt.debtYield, 2),  sub: "Year 1 NOI ÷ loan amount" },
          { label: "LTC",              value: fmtPct(debt.ltc, 1),        sub: "Loan ÷ total acquisition cost" },
        ].filter(Boolean).map(({ label, value, sub }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">{label}</p>
              {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TIReserveSection({ debt, cashFlows }) {
  if (!debt.tiReserveEnabled) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <p className="text-sm font-medium text-gray-400">TI reserve is disabled</p>
        <p className="text-xs text-gray-300 mt-1">Enable in Deal Inputs → Financing → TI Reserve to model lender-funded tenant improvement draws.</p>
      </div>
    );
  }

  const totalNeeded   = cashFlows.reduce((s, cf) => s + (cf.tiDrawNeeded   ?? 0), 0);
  const totalApproved = cashFlows.reduce((s, cf) => s + (cf.tiDrawApproved ?? 0), 0);
  const totalShortfall = cashFlows.reduce((s, cf) => s + (cf.tiDrawShortfall ?? 0), 0);
  const utilizationPct = debt.tiReserveTotal > 0 ? (debt.totalTIDrawn / debt.tiReserveTotal) * 100 : 0;
  const anyShortfall  = cashFlows.some((cf) => (cf.tiDrawShortfall ?? 0) > 0);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">TI Reserve Analysis</h3>

      {/* Status callout */}
      <div className={`rounded-xl border px-4 py-3 text-sm ${anyShortfall ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
        {anyShortfall ? (
          <>
            <span className="font-semibold">Draw shortfall detected</span> — equity must fund {fmtM(totalShortfall)} in TI costs that failed the DSCR draw test.
          </>
        ) : (
          <>
            <span className="font-semibold">All draws approved</span> — reserve fully covers projected TI costs over the hold period.
          </>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Reserve",    value: fmtM(debt.tiReserveTotal),   sub: "Committed by lender" },
          { label: "Total Drawn",      value: fmtM(debt.totalTIDrawn),     sub: `${fmt(utilizationPct, 0)}% utilized` },
          { label: "Total Shortfall",  value: fmtM(totalShortfall),        sub: anyShortfall ? "Equity-funded gap" : "None", warn: anyShortfall },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} className={`rounded-xl border p-3 ${warn ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
            <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${warn ? "text-red-500" : "text-gray-500"}`}>{label}</p>
            <p className={`text-lg font-bold tabular-nums ${warn ? "text-red-700" : "text-gray-900"}`}>{value}</p>
            {sub && <p className={`text-xs mt-0.5 ${warn ? "text-red-500" : "text-gray-400"}`}>{sub}</p>}
          </div>
        ))}
      </div>

      {/* Year-by-year draw table */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 mb-2">Year-by-Year Draw Schedule</h4>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Year", "TI Needed", "DSCR", "Draw Approved", "Shortfall", "Reserve Remaining", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
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
                if (!hasActivity) {
                  statusLabel = "No TI";
                  statusColor = "text-gray-400";
                } else if (hasShortfall) {
                  statusLabel = "Shortfall";
                  statusColor = "text-red-600 font-semibold";
                } else {
                  statusLabel = "Approved";
                  statusColor = "text-emerald-600 font-semibold";
                }

                return (
                  <tr key={cf.year} className={`transition-colors ${hasShortfall ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"}`}>
                    <td className="px-3 py-2 font-medium text-gray-700">Y{cf.year}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{needed > 0 ? fmtM(needed) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${dscr != null && dscr < (debt.tiReserveEnabled ? 1.10 : 1.25) ? "text-red-600" : "text-gray-600"}`}>
                      {dscr != null ? `${fmt(dscr, 2)}x` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{approved > 0 ? fmtM(approved) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${hasShortfall ? "text-red-600 font-semibold" : "text-gray-300"}`}>
                      {hasShortfall ? fmtM(shortfall) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtM(remaining)}</td>
                    <td className={`px-3 py-2 text-right ${statusColor}`}>{statusLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          DSCR test uses Year 1 NOI ÷ debt service each year. Draws approved only when DSCR ≥ {
            /* We don't have minDrawDSCR here directly, show generic note */
            "minimum threshold"
          }. Approved draws increase the outstanding loan balance for subsequent years.
        </p>
      </div>
    </div>
  );
}

// ─── Covenant compliance ──────────────────────────────────────────────────────

function covenantStatus(value, threshold, isMax) {
  if (!isFinite(value)) return "—";
  const breach  = isMax ? value > threshold : value < threshold;
  const margin  = isMax
    ? (threshold - value) / threshold      // positive = headroom
    : (value - threshold) / threshold;     // positive = headroom
  if (breach)       return "breach";
  if (margin < 0.05) return "warn";        // within 5% of limit
  return "pass";
}

const statusStyles = {
  pass:   { cell: "text-emerald-700 font-medium", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warn:   { cell: "text-yellow-700 font-medium",  badge: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  breach: { cell: "text-red-700 font-bold",        badge: "bg-red-50 text-red-700 border-red-200" },
  "—":    { cell: "text-gray-300",                 badge: "bg-gray-50 text-gray-400 border-gray-200" },
};

function CovenantCompliance({ cashFlows, inputs, debt }) {
  const cv = inputs.loanCovenants ?? {};

  const covenants = [
    cv.dscrEnabled      && { key: "dscr",      label: "DSCR",       threshold: cv.dscrMin      ?? 1.25, isMax: false, fmt: (v) => `${fmt(v, 2)}x` },
    cv.debtYieldEnabled && { key: "dy",         label: "Debt Yield", threshold: cv.debtYieldMin ?? 8.0,  isMax: false, fmt: (v) => fmtPct(v, 2) },
    cv.ltvEnabled       && { key: "ltv",        label: "LTV",        threshold: cv.ltvMax       ?? 75,   isMax: true,  fmt: (v) => fmtPct(v, 1) },
    cv.occupancyEnabled && { key: "occ",        label: "Occupancy",  threshold: cv.occupancyMin ?? 85,   isMax: false, fmt: (v) => fmtPct(v, 1) },
  ].filter(Boolean);

  const anyEnabled = covenants.length > 0;

  if (!anyEnabled) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <p className="text-sm font-medium text-gray-400">No covenants configured</p>
        <p className="text-xs text-gray-300 mt-1">Enable covenants in Deal Inputs → Financing → Loan Covenants.</p>
      </div>
    );
  }

  // Compute per-year covenant values
  const rows = cashFlows.map((cf) => {
    const dscr = cf.debtService > 0 ? cf.noi / cf.debtService : null;
    const dy   = cf.loanBalance > 0 ? (cf.noi / cf.loanBalance) * 100 : null;
    // Implied LTV: loan balance / (NOI ÷ exit cap rate)
    const impliedValue = (cf.noi > 0 && inputs.exitCapRatePct > 0)
      ? cf.noi / (inputs.exitCapRatePct / 100) : null;
    const ltv  = (impliedValue && cf.loanBalance > 0)
      ? (cf.loanBalance / impliedValue) * 100 : null;
    // Occupancy proxy: (scheduled - vacancy) / scheduled
    const occ  = cf.grossRevenue > 0
      ? ((cf.grossRevenue - cf.physicalVacancy) / cf.grossRevenue) * 100 : null;
    return { year: cf.year, dscr, dy, ltv, occ };
  });

  // Summary: which years have any breach / warn
  const breachYears = rows.filter((r) =>
    covenants.some(({ key, threshold, isMax }) => {
      const val = r[key];
      return val != null && covenantStatus(val, threshold, isMax) === "breach";
    })
  );
  const warnYears = rows.filter((r) =>
    covenants.some(({ key, threshold, isMax }) => {
      const val = r[key];
      return val != null && covenantStatus(val, threshold, isMax) === "warn";
    })
  );

  const allClear = breachYears.length === 0 && warnYears.length === 0;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Covenant Compliance</h3>

      {/* Summary callout */}
      <div className={`rounded-xl border px-4 py-3 text-sm ${
        breachYears.length > 0
          ? "border-red-200 bg-red-50 text-red-800"
          : warnYears.length > 0
          ? "border-yellow-200 bg-yellow-50 text-yellow-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}>
        {breachYears.length > 0 ? (
          <>
            <span className="font-semibold">Covenant breach</span> in{" "}
            {breachYears.length === 1 ? `Year ${breachYears[0].year}` : `${breachYears.length} years`}.
            {warnYears.length > 0 && ` Warning zone in ${warnYears.length} additional year${warnYears.length > 1 ? "s" : ""}.`}
          </>
        ) : warnYears.length > 0 ? (
          <>
            <span className="font-semibold">Covenant warning</span> — within 5% of threshold in{" "}
            {warnYears.length} year{warnYears.length > 1 ? "s" : ""}. No outright breaches.
          </>
        ) : (
          <><span className="font-semibold">All covenants met</span> — full hold period compliance.</>
        )}
      </div>

      {/* Covenant thresholds strip */}
      <div className="flex flex-wrap gap-2">
        {covenants.map(({ key, label, threshold, isMax, fmt: fmtFn }) => (
          <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
            <span className="text-gray-500">{label} </span>
            <span className="font-semibold text-gray-700">{isMax ? "≤" : "≥"} {fmtFn(threshold)}</span>
          </div>
        ))}
      </div>

      {/* Year-by-year table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Year</th>
              {covenants.map(({ key, label, threshold, isMax, fmt: fmtFn }) => (
                <th key={key} className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {label}
                  <span className="ml-1 text-gray-300 font-normal normal-case">
                    ({isMax ? "≤" : "≥"}{fmtFn(threshold)})
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const yearStatuses = covenants.map(({ key, threshold, isMax }) => {
                const val = r[key];
                return val != null ? covenantStatus(val, threshold, isMax) : "—";
              });
              const worstStatus = yearStatuses.includes("breach") ? "breach"
                : yearStatuses.includes("warn") ? "warn"
                : yearStatuses.every((s) => s === "pass") ? "pass"
                : "—";

              const rowBg = worstStatus === "breach" ? "bg-red-50"
                : worstStatus === "warn" ? "bg-yellow-50/60"
                : "";

              return (
                <tr key={r.year} className={`transition-colors hover:brightness-95 ${rowBg}`}>
                  <td className="px-3 py-2 font-medium text-gray-700">Y{r.year}</td>
                  {covenants.map(({ key, threshold, isMax, fmt: fmtFn }, ci) => {
                    const val    = r[key];
                    const status = yearStatuses[ci];
                    const style  = statusStyles[status] ?? statusStyles["—"];
                    return (
                      <td key={key} className={`px-3 py-2 text-right tabular-nums ${style.cell}`}>
                        {val != null ? fmtFn(val) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    {worstStatus === "breach" ? (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Breach</span>
                    ) : worstStatus === "warn" ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-yellow-50 text-yellow-700 border-yellow-200">Warning</span>
                    ) : worstStatus === "pass" ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">Pass</span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        LTV estimated as loan balance ÷ (NOI ÷ exit cap rate). Occupancy = (gross scheduled − vacancy) ÷ gross scheduled.
      </p>
    </div>
  );
}

export default function CapitalAnalysis({ debt, cashFlows, inputs }) {
  return (
    <div className="space-y-8">
      <h2 className="text-base font-semibold text-gray-900">Capital Analysis</h2>
      <ConstraintStrip debt={debt} />
      <div className="border-t border-gray-200 pt-6">
        <CovenantCompliance cashFlows={cashFlows} inputs={inputs} debt={debt} />
      </div>
      <div className="border-t border-gray-200 pt-6">
        <TIReserveSection debt={debt} cashFlows={cashFlows} />
      </div>
    </div>
  );
}
