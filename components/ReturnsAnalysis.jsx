"use client";

import { useMemo, useState } from "react";
import { underwrite } from "@/lib/calculations";

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

// Targets the header used to flag (moved here 11/23): red below these.
export const TARGETS = { irr: 14, em: 2.0, coc: 7, dscr: 1.25 };

function KPI({ label, value, sub, t, warn }) {
  const c = warn ? tierColors.bad : t ? tierColors[t] : { text: "text-gray-900", bg: "bg-gray-50", border: "border-gray-200" };
  return (
    <div className={`rounded-xl border p-4 ${c.bg} ${c.border}`} title={warn || undefined} data-testid={warn ? "kpi-below-target" : undefined}>
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

import { AssetCashYield } from "@/components/CashYield";
import { assetCashYield } from "@/lib/cashYield";

export default function ReturnsAnalysis({ returns, cashFlows, waterfall, inputs, savedDeals = [], dscr }) {
  const [selectedId, setSelectedId] = useState("active");

  const selectedInputs = useMemo(() => {
    if (selectedId === "active") return inputs;
    return savedDeals.find((d) => d.id === selectedId)?.inputs ?? inputs;
  }, [selectedId, savedDeals, inputs]);

  const selectedResults = useMemo(() => {
    if (selectedId === "active") return { returns, cashFlows, waterfall, dscr };
    const r = underwrite(selectedInputs);
    return { returns: r.returns, cashFlows: r.annualCashFlows, waterfall: r.waterfall, dscr: r.debt?.dscr };
  }, [selectedId, selectedInputs, returns, cashFlows, waterfall, dscr]);

  const { returns: r, cashFlows: cfs, waterfall: wf, dscr: dscrSel } = selectedResults;
  const below = (v, target, unit, what) => (isFinite(v) && v < target ? `Below target: ${what} under ${target}${unit}` : "");
  const irrWarn = below(r.irr, TARGETS.irr, "%", "IRR");
  const emWarn = below(r.equityMultiple, TARGETS.em, "x", "equity multiple");
  const cocWarn = below(r.yearOneCashOnCash, TARGETS.coc, "%", "year-1 cash-on-cash");
  const dscrWarn = below(dscrSel, TARGETS.dscr, "x", "DSCR");

  // Rollover TI/LC over the hold plus any up-front capex budget.
  const totalCapEx = cfs.reduce((s, cf) => s + (cf.tiAndLeasing ?? 0), 0) + (selectedInputs?.capexBudget ?? 0);
  const capExPct   = selectedInputs?.purchasePrice > 0 ? (totalCapEx / selectedInputs.purchasePrice) * 100 : null;

  const irrTier    = tier(r.irr, 18, 14, 10);
  const netIrrTier = wf ? tier(wf.lpIRR, 18, 14, 10) : null;
  const emTier     = tier(r.equityMultiple, 2.5, 2.0, 1.5);
  const cocTier    = tier(r.yearOneCashOnCash, 9, 7, 5);
  const capTier    = tier(r.goingInCapRate, 7, 5.5, 4.5);

  const dealOptions = [
    { id: "active", label: inputs?.propertyName || "Active Deal" },
    ...savedDeals.map((d) => ({ id: d.id, label: d.inputs?.propertyName || "Unnamed" })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Returns Analysis</h2>
        {dealOptions.length > 1 && (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {dealOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI label="Gross IRR" value={fmtPct(r.irr)} sub="Levered, before promote" t={irrTier} warn={irrWarn} />
        {wf
          ? <KPI label="Net LP IRR" value={fmtPct(wf.lpIRR)} sub="After LP/GP waterfall" t={netIrrTier} />
          : <KPI label="Equity Multiple" value={`${fmt(r.equityMultiple, 2)}x`} sub="Total distributions ÷ equity" t={emTier} warn={emWarn} />
        }
        <KPI label="Year 1 Cash-on-Cash" value={fmtPct(r.yearOneCashOnCash)} sub="Pre-tax cash flow ÷ equity" t={cocTier} warn={cocWarn} />
        <KPI label="Going-In Cap Rate" value={fmtPct(r.goingInCapRate)} sub="Year 1 NOI ÷ purchase price" t={capTier} />
        <KPI label="DSCR (year 1)" value={isFinite(dscrSel) ? `${dscrSel.toFixed(2)}x` : "—"} sub="NOI ÷ debt service" warn={dscrWarn} />
      </div>
      {wf && (
        <div className="grid grid-cols-2 gap-3">
          <KPI label="Equity Multiple" value={`${fmt(r.equityMultiple, 2)}x`} sub="Total distributions ÷ equity" t={emTier} warn={emWarn} />
          <KPI label="LP Equity Multiple" value={`${fmt(wf.lpEquityMultiple, 2)}x`} sub="LP distributions ÷ LP equity" />
        </div>
      )}

      {/* Secondary metrics */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {[
          { label: "Adjusted Cap Rate",     value: fmtPct(r.adjustedGoingInCapRate), sub: "Year 1 NOI after TI & leasing commissions" },
          { label: "Avg. Annual TI + LC",   value: fmtM(r.annualRolloverCosts),      sub: "Normalized rollover costs over hold period" },
          { label: "Total CapEx",           value: fmtM(totalCapEx),                 sub: capExPct != null ? `${capExPct.toFixed(1)}% of purchase price` : "TI + LC over hold period" },
          { label: "Avg. Cash-on-Cash",     value: fmtPct(r.averageCashOnCash),      sub: "Average over hold period" },
          { label: "Exit Value",            value: fmtM(r.exitValue),                sub: `At ${r.exitCapRate}% exit cap rate` },
          { label: "Disposition Costs",     value: fmtM(r.sellingCosts),             sub: `${r.sellingCostsPct?.toFixed(2) ?? "—"}% of exit value` },
          { label: "Equity Reversion",      value: fmtM(r.equityReversion),          sub: "After loan payoff & selling costs" },
          { label: "Total Equity Invested", value: fmtM(r.totalEquityInvested) },
          { label: "NPV (8% hurdle)",       value: fmtM(r.npv),                      sub: r.npv > 0 ? "Positive — clears hurdle" : "Negative — below hurdle" },
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

      <AssetCashYield data={assetCashYield(cfs, r.totalEquityInvested)} equity={r.totalEquityInvested} />

      {/* Cash flow table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Annual Cash Flows</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Year", "Gross Rev.", "Vacancy", "Credit Loss", "EGR", "Op. Exp.", "NOI", "TI + LC", "Adj. NOI", "Debt Svc.", "Ext. Fee", "Caps / AM Fee", "Pre-Tax CF"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cfs.map((cf) => (
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
                  <td className="px-3 py-2 text-right tabular-nums text-orange-500">
                    {(cf.capReplacement ?? 0) + (cf.belowLineAMFees ?? 0) > 0
                      ? `(${fmtM((cf.capReplacement ?? 0) + (cf.belowLineAMFees ?? 0))})`
                      : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${cf.pretaxCashFlow >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {cf.pretaxCashFlow >= 0 ? fmtM(cf.pretaxCashFlow) : `(${fmtM(Math.abs(cf.pretaxCashFlow))})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {cfs[0]?.noiOverride
            ? "Direct NOI mode: NOI is entered directly, so revenue and expense build-up columns are not used. Caps / AM Fee = replacement rate caps plus asset-management fees charged below NOI."
            : "TI + LC = normalized tenant improvements & leasing commissions. Op. Exp. reflects landlord-paid costs per lease type. Caps / AM Fee = replacement rate caps."}
        </p>
      </div>

      {/* LP / GP waterfall */}
      {wf && <WaterfallSection wf={wf} />}
    </div>
  );
}
