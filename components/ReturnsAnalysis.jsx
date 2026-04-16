"use client";

function fmt(n, decimals = 0) {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtPct(n, d = 1) { return isFinite(n) ? `${fmt(n, d)}%` : "—"; }
function fmtDollar(n, d = 0) { return isFinite(n) ? `$${fmt(n, d)}` : "—"; }
function fmtM(n) {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${fmt(n / 1_000_000, 2)}M`;
  return fmtDollar(n);
}

function tier(val, great, good, ok) {
  if (val >= great) return "great";
  if (val >= good) return "good";
  if (val >= ok) return "ok";
  return "bad";
}

const tierColors = {
  great: { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  good:  { text: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
  ok:    { text: "text-yellow-700",  bg: "bg-yellow-50",  border: "border-yellow-200" },
  bad:   { text: "text-red-700",     bg: "bg-red-50",     border: "border-red-200" },
};

function KPI({ label, value, sub, t }) {
  const c = t ? tierColors[t] : { text: "text-gray-900", bg: "bg-gray-50", border: "border-gray-200" };
  return (
    <div className={`rounded-xl border p-4 ${c.bg} ${c.border}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function WaterfallSection({ wf }) {
  if (!wf) return null;

  const irrTierLP = tier(wf.lpIRR, 18, 14, 10);
  const irrTierGP = tier(wf.gpIRR, 25, 20, 15);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">LP / GP Waterfall</h3>

      {/* Active tier callout */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <span className="font-semibold">Active promote tier: </span>
        Project IRR {fmtPct(wf.projectIRR)} →{" "}
        LP {wf.activeTier?.lpSplit ?? "—"}% / GP {wf.activeTier?.gpSplit ?? "—"}%
        {wf.activeTier?.irrThreshold
          ? ` (below ${wf.activeTier.irrThreshold}% IRR hurdle)`
          : " (above all thresholds)"}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <KPI label="LP IRR"            value={fmtPct(wf.lpIRR)}           sub="Levered, after waterfall"       t={irrTierLP} />
        <KPI label="GP IRR"            value={fmtPct(wf.gpIRR)}           sub="Including promote"              t={irrTierGP} />
        <KPI label="LP Equity Multiple" value={`${fmt(wf.lpEquityMultiple, 2)}x`} sub="LP distributions ÷ LP equity" />
        <KPI label="GP Equity Multiple" value={`${fmt(wf.gpEquityMultiple, 2)}x`} sub="GP distributions ÷ GP equity" />
      </div>

      {/* Summary rows */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {[
          { label: "LP Equity Invested",     value: fmtM(wf.lpEquity),             sub: "LP share of total equity" },
          { label: "GP Equity Invested",     value: fmtM(wf.gpEquity),             sub: "GP co-invest" },
          { label: "LP Total Distributions", value: fmtM(wf.lpTotalDistributions), sub: "Cash flows + reversion to LP" },
          { label: "GP Total Distributions", value: fmtM(wf.gpTotalDistributions), sub: "Cash flows + reversion to GP" },
          { label: "GP Promote",             value: fmtM(wf.gpPromote),            sub: "GP upside above capital return" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">{label}</p>
              {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      {/* Year-by-year distribution table */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 mb-2">Annual Distributions</h4>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Year", "Total CF", "LP", "GP", "GP %"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {wf.yearlyDist.map(({ year, lp, gp }) => {
                const total = lp + gp;
                const gpSharePct = total > 0 ? (gp / total) * 100 : 0;
                return (
                  <tr key={year} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-medium text-gray-700">Y{year}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtM(total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700 font-medium">{fmtM(lp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{fmtM(gp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtPct(gpSharePct, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ReturnsAnalysis({ returns, cashFlows, waterfall }) {
  const irrTier   = tier(returns.irr, 18, 14, 10);
  const netIrrTier = waterfall ? tier(waterfall.lpIRR, 18, 14, 10) : null;
  const emTier    = tier(returns.equityMultiple, 2.5, 2.0, 1.5);
  const cocTier   = tier(returns.yearOneCashOnCash, 9, 7, 5);
  const capTier   = tier(returns.goingInCapRate, 7, 5.5, 4.5);

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-900">Returns Analysis</h2>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI label="Gross IRR" value={fmtPct(returns.irr)} sub="Levered, before promote" t={irrTier} />
        {waterfall
          ? <KPI label="Net LP IRR" value={fmtPct(waterfall.lpIRR)} sub="After LP/GP waterfall" t={netIrrTier} />
          : <KPI label="Equity Multiple" value={`${fmt(returns.equityMultiple, 2)}x`} sub="Total distributions ÷ equity" t={emTier} />
        }
        <KPI label="Year 1 Cash-on-Cash" value={fmtPct(returns.yearOneCashOnCash)} sub="Pre-tax cash flow ÷ equity" t={cocTier} />
        <KPI label="Going-In Cap Rate" value={fmtPct(returns.goingInCapRate)} sub="Year 1 NOI ÷ purchase price" t={capTier} />
      </div>
      {waterfall && (
        <div className="grid grid-cols-2 gap-3">
          <KPI label="Equity Multiple" value={`${fmt(returns.equityMultiple, 2)}x`} sub="Total distributions ÷ equity" t={emTier} />
          <KPI label="LP Equity Multiple" value={`${fmt(waterfall.lpEquityMultiple, 2)}x`} sub="LP distributions ÷ LP equity" />
        </div>
      )}

      {/* Secondary metrics */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {[
          { label: "Adjusted Cap Rate", value: fmtPct(returns.adjustedGoingInCapRate), sub: "Year 1 NOI after TI & leasing commissions" },
          { label: "Avg. Annual TI + LC", value: fmtM(returns.annualRolloverCosts), sub: "Normalized rollover costs over hold period" },
          { label: "Avg. Cash-on-Cash", value: fmtPct(returns.averageCashOnCash), sub: "Average over hold period" },
          { label: "Exit Value", value: fmtM(returns.exitValue), sub: `At ${returns.exitCapRate}% exit cap rate` },
          { label: "Disposition Costs", value: fmtM(returns.sellingCosts), sub: `${returns.sellingCostsPct?.toFixed(2) ?? "—"}% of exit value` },
          { label: "Equity Reversion", value: fmtM(returns.equityReversion), sub: "After loan payoff & selling costs" },
          { label: "Total Equity Invested", value: fmtM(returns.totalEquityInvested) },
          { label: "NPV (8% hurdle)", value: fmtM(returns.npv), sub: returns.npv > 0 ? "Positive — clears hurdle" : "Negative — below hurdle" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">{label}</p>
              {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      {/* Cash flow table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Annual Cash Flows</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[
                  "Year", "Gross Rev.", "Vacancy", "Credit Loss",
                  "EGR", "Op. Exp.", "NOI", "TI + LC", "Adj. NOI",
                  "Debt Svc.", "Ext. Fee", "Pre-Tax CF",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cashFlows.map((cf) => (
                <tr key={cf.year} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-700">Y{cf.year}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtM(cf.grossRevenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-500">({fmtM(cf.physicalVacancy)})</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-500">({fmtM(cf.creditLoss)})</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtM(cf.effectiveGrossRevenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-500">({fmtM(cf.operatingExpenses)})</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{fmtM(cf.noi)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-orange-600">({fmtM(cf.tiAndLeasing)})</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-700">{fmtM(cf.adjustedNOI)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-500">({fmtM(cf.debtService)})</td>
                  <td className="px-3 py-2 text-right tabular-nums text-orange-500">
                    {cf.extensionFee > 0 ? `(${fmtM(cf.extensionFee)})` : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${cf.pretaxCashFlow >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {cf.pretaxCashFlow >= 0
                      ? fmtM(cf.pretaxCashFlow)
                      : `(${fmtM(Math.abs(cf.pretaxCashFlow))})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          TI + LC = normalized tenant improvements & leasing commissions. Op. Exp. reflects landlord-paid costs per lease type.
        </p>
      </div>

      {/* LP / GP waterfall */}
      {waterfall && <WaterfallSection wf={waterfall} />}
    </div>
  );
}
