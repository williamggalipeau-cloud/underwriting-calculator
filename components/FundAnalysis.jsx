"use client";

import { useState } from "react";
import {
  DEFAULT_FUND,
  acquisitionDate,
  byCalendarYear,
  computeDatedWaterfall,
  datedFlows,
  exitDate,
  fundDates,
  parseDate,
  xirr,
} from "@/lib/fundTimeline";

function fmtDate(iso) {
  const d = parseDate(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

// Default fund-level GP commitment (% of total fund equity).
const DEFAULT_GP_COMMIT_PCT = 5;
// Default fund-level preferred return to LPs (% per year).
const DEFAULT_PREF_PCT = 9;

function fmt(n, decimals = 0) {
  if (!isFinite(n) || n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n, d = 1) { return isFinite(n) && n != null ? `${fmt(n, d)}%` : "—"; }
function fmtX(n, d = 2) { return isFinite(n) && n != null ? `${fmt(n, d)}x` : "—"; }
function fmtM(n) {
  if (!isFinite(n) || n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${fmt(n / 1_000_000, 2)}M`;
  if (Math.abs(n) >= 1_000) return `$${fmt(n / 1_000, 1)}k`;
  return `$${fmt(n)}`;
}

// Group deals by fund name (empty string → "(No Fund)")
function groupByFund(deals) {
  const groups = {};
  for (const deal of deals) {
    const key = deal.inputs.fundName?.trim() || "(No Fund)";
    if (!groups[key]) groups[key] = [];
    groups[key].push(deal);
  }
  return groups;
}

function FundWaterfall({ wf, yearTotals }) {
  const lpGood  = (v, t) => isFinite(v) && v >= t;

  const kpis = [
    { label: "LP IRR",       value: fmtPct(wf.lpIRR),                      good: lpGood(wf.lpIRR, 12) },
    { label: "LP Multiple",  value: fmtX(wf.lpEquityMultiple),              good: lpGood(wf.lpEquityMultiple, 1.8) },
    { label: "LP Capital",   value: fmtM(wf.lpEquity),                      good: true },
    { label: "LP Dist.",     value: fmtM(wf.lpTotalDistributions),          good: true },
    { label: "GP IRR",       value: fmtPct(wf.gpIRR),                      good: lpGood(wf.gpIRR, 18) },
    { label: "GP Multiple",  value: fmtX(wf.gpEquityMultiple),              good: lpGood(wf.gpEquityMultiple, 2.5) },
    { label: "GP Capital",   value: fmtM(wf.gpEquity),                      good: true },
    { label: "GP Promote",   value: fmtM(wf.gpPromote),                     good: true },
  ];

  // Running LP / GP totals per calendar year (computed up front, not during render).
  const rows = wf.yearlyDist.reduce((acc, r) => {
    const prev = acc[acc.length - 1] ?? { lpCumul: 0, gpCumul: 0 };
    acc.push({ ...r, lpCumul: prev.lpCumul + r.lp, gpCumul: prev.gpCumul + r.gp });
    return acc;
  }, []);
  const totalAll = [...yearTotals.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">LP / GP Waterfall</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          Active tier: {wf.activeTier.irrThreshold != null ? `≤${wf.activeTier.irrThreshold}% IRR` : "Top tier"} · {wf.activeTier.lpSplit}/{wf.activeTier.gpSplit} split
        </span>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-4 gap-3">
        {kpis.map(({ label, value, good }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className={`text-sm font-bold tabular-nums ${good ? "text-gray-900" : "text-red-600"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Calendar-year table: capital calls (negative) and distributions */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Year", "Fund CF", "LP", "GP", "LP Cumul.", "GP Cumul."].map((h) => (
                <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ year, lp, gp, lpCumul, gpCumul }) => {
              const total = yearTotals.get(year) ?? 0;
              return (
                <tr key={year} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-700">{year}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${total < 0 ? "text-red-600" : "text-gray-600"}`}>{fmtM(total)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${lp < 0 ? "text-red-600" : "text-blue-700"}`}>{fmtM(lp)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-medium ${gp < 0 ? "text-red-600" : "text-purple-700"}`}>{fmtM(gp)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${lpCumul < 0 ? "text-red-500" : "text-blue-600"}`}>{fmtM(lpCumul)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${gpCumul < 0 ? "text-red-500" : "text-purple-600"}`}>{fmtM(gpCumul)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td className="px-3 py-2 font-semibold text-gray-700 text-xs">Net</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 text-xs">{fmtM(totalAll)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700 text-xs">{fmtM(wf.lpTotalDistributions - wf.lpEquity)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-purple-700 text-xs">{fmtM(wf.gpTotalDistributions - wf.gpEquity)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Capital calls (negative) are split by commitment on their dates; the LP pref compounds annually from each call.
        Distributions run pref → return of capital → GP catch-up → promote, in date order.
      </p>
    </div>
  );
}

// ── Fund timeline: each asset's hold against the investment period, term and extensions ──
function FundTimeline({ deals, fund }) {
  const fd = fundDates(fund);
  const start = parseDate(fund.finalClose).getTime();
  const lastExit = Math.max(...deals.map((d) => parseDate(exitDate(d, fund)).getTime()));
  const end = Math.max(parseDate(fd.extendedEnd).getTime(), lastExit);
  const x = (iso) => ((parseDate(iso).getTime() - start) / (end - start)) * 100;
  const firstYear = parseDate(fund.finalClose).getUTCFullYear() + 1;
  const lastYear = new Date(end).getUTCFullYear();
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-2 text-xs text-gray-600">
        <h4 className="text-xs font-semibold text-gray-700 mr-2">Fund timeline</h4>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-blue-100 border border-blue-200" />Investment period</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-amber-50 border border-amber-200" />Extensions</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#2a78d6]" />Hold</span>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
        <div className="relative ml-40 h-5 text-[10px] text-gray-400">
          {years.map((y) => (
            <span key={y} className="absolute -translate-x-1/2" style={{ left: `${x(`${y}-01-01`)}%` }}>{y}</span>
          ))}
        </div>
        <div className="relative">
          {/* bands */}
          <div className="absolute inset-y-0 left-40 right-0 pointer-events-none">
            <div className="absolute inset-y-0 bg-blue-50 border-x border-blue-100" style={{ left: 0, width: `${x(fd.investmentPeriodEnd)}%` }} />
            <div className="absolute inset-y-0 bg-amber-50/70 border-r border-amber-200" style={{ left: `${x(fd.fundEnd)}%`, width: `${x(fd.extendedEnd) - x(fd.fundEnd)}%` }} />
            <div className="absolute inset-y-0 border-l-2 border-gray-400" style={{ left: `${x(fd.fundEnd)}%` }} title={`Term ends ${fmtDate(fd.fundEnd)}`} />
          </div>
          {deals.map((d) => {
            const acq = acquisitionDate(d, fund);
            const ex = exitDate(d, fund);
            const late = ex > fd.extendedEnd;
            const ext = ex > fd.fundEnd && !late;
            return (
              <div key={d.id} className="relative flex items-center h-6">
                <span className="w-40 shrink-0 truncate pr-2 text-xs text-gray-700" title={d.inputs.propertyName}>{d.inputs.propertyName || "Unnamed"}</span>
                <div className="relative flex-1 h-full">
                  <div
                    className={`absolute top-1.5 h-3 rounded ${late ? "bg-[#e34948]" : "bg-[#2a78d6]"}`}
                    style={{ left: `${x(acq)}%`, width: `${Math.max(0.5, x(ex) - x(acq))}%` }}
                    title={`${fmtDate(acq)} → ${fmtDate(ex)}`}
                  />
                  {(ext || late) && (
                    <span
                      className={`absolute top-0.5 whitespace-nowrap text-[10px] font-medium ${
                        x(ex) > 85 ? "text-white" : late ? "text-red-600" : "text-amber-700"
                      }`}
                      // Near the right edge, sit the label inside the bar's end instead of past it.
                      style={x(ex) > 85 ? { right: `calc(${100 - x(ex)}% + 4px)` } : { left: `calc(${x(ex)}% + 4px)` }}
                    >
                      {late ? "past extensions" : "uses extension"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-2 ml-40">
          Final close {fmtDate(fund.finalClose)} · investment period to {fmtDate(fd.investmentPeriodEnd)} · term to {fmtDate(fd.fundEnd)} ·
          fully extended {fmtDate(fd.extendedEnd)}
        </p>
      </div>
    </div>
  );
}

function PerformanceAttribution({ deals, fundIRR, totalEquity, totalDistributions }) {
  const rows = deals.map((d) => {
    const equity    = d.metrics.equityRequired ?? 0;
    const equityWt  = totalEquity > 0 ? equity / totalEquity : 0;
    const assetIRR  = d.metrics.irr;
    const assetDist = d.irrFlows.slice(1).reduce((s, v) => s + Math.max(v, 0), 0);
    const distWt    = totalDistributions > 0 ? assetDist / totalDistributions : 0;
    const irrSpread = isFinite(assetIRR) && isFinite(fundIRR) ? assetIRR - fundIRR : NaN;
    const wtdContrib = isFinite(assetIRR) ? equityWt * assetIRR : NaN; // equity-weighted IRR contribution
    return { deal: d, equity, equityWt, assetIRR, assetDist, distWt, irrSpread, wtdContrib };
  });

  const maxWt = Math.max(...rows.map((r) => r.equityWt));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Performance Attribution</h3>
        <span className="text-xs text-gray-400">Equity-weighted contribution to fund IRR</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Asset", "Equity", "Equity Weight", "Asset IRR", "vs. Fund IRR", "EM", "Distributions", "Dist. Share", "IRR Contribution"].map((h) => (
                <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ deal, equity, equityWt, assetIRR, assetDist, distWt, irrSpread, wtdContrib }) => {
              const barW = maxWt > 0 ? (equityWt / maxWt) * 100 : 0;
              const spreadColor = !isFinite(irrSpread) ? "text-gray-400"
                : irrSpread > 0.5  ? "text-emerald-600 font-semibold"
                : irrSpread < -0.5 ? "text-red-600 font-semibold"
                : "text-gray-500";
              return (
                <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-800 whitespace-nowrap">{deal.inputs.propertyName || "Unnamed"}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtM(equity)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${barW}%` }} />
                      </div>
                      <span className="tabular-nums text-gray-600 w-10 text-right">{fmtPct(equityWt * 100, 1)}</span>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${isFinite(assetIRR) && assetIRR >= 14 ? "text-emerald-700" : "text-red-600"}`}>
                    {fmtPct(assetIRR)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${spreadColor}`}>
                    {isFinite(irrSpread) ? `${irrSpread >= 0 ? "+" : ""}${irrSpread.toFixed(1)}%` : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${isFinite(deal.metrics.equityMultiple) && deal.metrics.equityMultiple >= 2 ? "text-emerald-700" : "text-red-600"}`}>
                    {fmtX(deal.metrics.equityMultiple)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtM(assetDist)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${distWt * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-gray-600 w-10 text-right">{fmtPct(distWt * 100, 1)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-blue-700">
                    {isFinite(wtdContrib) ? `${fmtPct(wtdContrib, 2)} pts` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td className="px-3 py-2 font-semibold text-gray-700">Fund Total</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmtM(totalEquity)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">100%</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{fmtPct(fundIRR)}</td>
              <td className="px-3 py-2 text-right text-gray-300">—</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmtM(totalDistributions)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">100%</td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-blue-700">
                {fmtPct(rows.reduce((s, r) => s + (isFinite(r.wtdContrib) ? r.wtdContrib : 0), 0), 2)} pts
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        IRR Contribution = equity weight × asset IRR. Sum of contributions equals the equity-weighted average IRR (≠ fund IRR, which also reflects cash flow timing across assets).
      </p>
    </div>
  );
}

function DealRow({ deal, onRemove, fund }) {
  const fd = fundDates(fund);
  const acq = acquisitionDate(deal, fund);
  const ex = exitDate(deal, fund);
  const outsideIP = acq <= fund.finalClose || acq > fd.investmentPeriodEnd;
  const { inputs, metrics } = deal;
  const good = (v, threshold) => isFinite(v) && v >= threshold;
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2.5">
        <p className="text-sm font-medium text-gray-800">
          {inputs.propertyName || "Unnamed"}
          {deal.live && (
            <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded px-1 py-0.5">
              Live
            </span>
          )}
        </p>
        {inputs.fundName && <p className="text-xs text-gray-400">{inputs.fundName}</p>}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-600 tabular-nums">
        {fmt(inputs.squareFootage)} SF
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        {fmtM(inputs.purchasePrice)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        {fmtM(metrics.equityRequired)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${good(metrics.irr, 14) ? "text-emerald-700" : "text-red-600"}`}>
        {fmtPct(metrics.irr)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${good(metrics.equityMultiple, 2) ? "text-emerald-700" : "text-red-600"}`}>
        {fmtX(metrics.equityMultiple)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${good(metrics.yearOneCashOnCash, 7) ? "text-emerald-700" : "text-red-600"}`}>
        {fmtPct(metrics.yearOneCashOnCash)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums ${outsideIP ? "text-amber-700 font-medium" : "text-gray-600"}`} title={outsideIP ? "Outside the investment period" : undefined}>
        {fmtDate(acq)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums ${ex > fd.extendedEnd ? "text-red-600 font-medium" : ex > fd.fundEnd ? "text-amber-700" : "text-gray-600"}`}>
        {fmtDate(ex)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-500 tabular-nums">
        {inputs.holdPeriodYears}yr
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          onClick={() => onRemove(deal.id)}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function FundGroup({ fundName, deals, onRemove, onRemoveFund }) {
  // Fund-level GP commitment overrides each deal's LP/GP equity split.
  const [gpCommitPct, setGpCommitPct] = useState(DEFAULT_GP_COMMIT_PCT);
  const [prefPct, setPrefPct] = useState(DEFAULT_PREF_PCT);
  const [fund, setFund] = useState(DEFAULT_FUND);
  const fd = fundDates(fund);
  // Dated cash flows: each asset's flows on its acquisition date + t years.
  const allFlows = deals.flatMap((d) => datedFlows(d, d.irrFlows, fund));
  const yearTotals = byCalendarYear(allFlows);
  const fundIRR = xirr(allFlows) * 100;   // gross IRR (before waterfall), XIRR
  const totalEquity = deals.reduce((s, d) => s + (d.metrics.equityRequired ?? 0), 0);
  const totalPurchasePrice = deals.reduce((s, d) => s + (d.inputs.purchasePrice ?? 0), 0);
  const totalSF = deals.reduce((s, d) => s + (d.inputs.squareFootage ?? 0), 0);

  // Net LP IRR — compute waterfall if any deal has it enabled
  const waterfallDealForIRR = deals.find((d) => d.inputs.waterfallEnabled);
  const fundWaterfallConfig = waterfallDealForIRR
    ? { ...waterfallDealForIRR.inputs.waterfall, lpEquityPct: 100 - gpCommitPct, preferredReturnPct: prefPct }
    : null;
  const gpCommitAmount = totalEquity * (gpCommitPct / 100);
  const fundWf = fundWaterfallConfig ? computeDatedWaterfall(allFlows, fundWaterfallConfig) : null;
  const netLpIRR = fundWf ? fundWf.lpIRR : NaN;
  const outsideIP = deals.filter((d) => {
    const acq = acquisitionDate(d, fund);
    return acq <= fund.finalClose || acq > fd.investmentPeriodEnd;
  });
  const pastExtensions = deals.filter((d) => exitDate(d, fund) > fd.extendedEnd);
  const usingExtensions = deals.filter((d) => exitDate(d, fund) > fd.fundEnd && exitDate(d, fund) <= fd.extendedEnd);

  // Fund equity multiple: net distributions after closing / equity invested at
  // closing — the same definition as each asset's multiple (interim capital
  // calls count against distributions).
  const totalInvested = deals.reduce((s, d) => s + Math.abs(d.irrFlows[0] ?? 0), 0);
  const totalProceeds = deals.reduce((s, d) => s + d.irrFlows.slice(1).reduce((a, v) => a + v, 0), 0);
  const weightedEM = totalInvested > 0 ? totalProceeds / totalInvested : NaN;
  const totalDistributions = totalProceeds;

  // Calendar-year combined table: each asset's flows bucketed by calendar year.
  const dealYearTotals = deals.map((d) => byCalendarYear(datedFlows(d, d.irrFlows, fund)));
  const calendarYears = [...yearTotals.keys()].sort((a, b) => a - b);
  const yearRows = calendarYears.map((year) => ({
    year,
    total: yearTotals.get(year) ?? 0,
    byDeal: dealYearTotals.map((m) => m.get(year) ?? 0),
  }));

  const setFundField = (field) => (e) => {
    const v = e.target.type === "date" ? e.target.value : parseFloat(e.target.value);
    if (e.target.type === "date" ? !v : !isFinite(v) || v < 0) return;
    setFund((prev) => ({ ...prev, [field]: v }));
  };

  return (
    <div className="space-y-5">
      {/* Fund header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{fundName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{deals.length} asset{deals.length !== 1 ? "s" : ""} · {fmt(totalSF)} SF · {fmtM(totalPurchasePrice)} total purchase price</p>
          <button
            type="button"
            onClick={() => onRemoveFund(deals.map((d) => d.id))}
            className="mt-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Remove fund
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500">Gross IRR</p>
            <p className={`text-lg font-bold tabular-nums ${isFinite(fundIRR) && fundIRR >= 14 ? "text-emerald-700" : isFinite(fundIRR) ? "text-red-600" : "text-gray-400"}`}>
              {fmtPct(fundIRR)}
            </p>
          </div>
          {isFinite(netLpIRR) && (
            <div className="text-right">
              <p className="text-xs text-gray-500">Net LP IRR</p>
              <p className={`text-lg font-bold tabular-nums ${netLpIRR >= 12 ? "text-emerald-700" : "text-red-600"}`}>
                {fmtPct(netLpIRR)}
              </p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-gray-500">Eq. Multiple</p>
            <p className={`text-lg font-bold tabular-nums ${isFinite(weightedEM) && weightedEM >= 2 ? "text-emerald-700" : isFinite(weightedEM) ? "text-red-600" : "text-gray-400"}`}>
              {fmtX(weightedEM)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Equity</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">{fmtM(totalEquity)}</p>
          </div>
        </div>
      </div>

      {/* Fund-level GP commitment */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <label htmlFor={`gp-commit-${fundName}`} className="text-xs font-semibold text-gray-700">
          GP commitment
        </label>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
          <input
            id={`gp-commit-${fundName}`}
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={gpCommitPct}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setGpCommitPct(isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
            }}
            className="w-16 px-2 py-1.5 text-sm text-gray-900 outline-none tabular-nums"
          />
          <span className="px-2 py-1.5 bg-gray-50 border-l border-gray-200 text-gray-500 text-xs">% of fund equity</span>
        </div>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmtM(gpCommitAmount)}</span>
        <span className="text-xs text-gray-400">
          GP · {fmtM(totalEquity - gpCommitAmount)} LP ({fmt(100 - gpCommitPct, 1)}%)
        </span>
        <label htmlFor={`pref-${fundName}`} className="text-xs font-semibold text-gray-700 ml-auto">
          Preferred return
        </label>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
          <input
            id={`pref-${fundName}`}
            type="number"
            min={0}
            step={0.5}
            value={prefPct}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setPrefPct(isFinite(v) ? Math.max(0, v) : 0);
            }}
            className="w-16 px-2 py-1.5 text-sm text-gray-900 outline-none tabular-nums"
          />
          <span className="px-2 py-1.5 bg-gray-50 border-l border-gray-200 text-gray-500 text-xs">% / yr</span>
        </div>
      </div>

      {/* Fund terms */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs">
        <span className="font-semibold text-gray-700">Fund terms</span>
        <label className="flex items-center gap-1.5 text-gray-600">
          Final close
          <input type="date" value={fund.finalClose} onChange={setFundField("finalClose")} className="border border-gray-200 rounded-md px-2 py-1 text-gray-900" />
        </label>
        <label className="flex items-center gap-1.5 text-gray-600">
          Investment period
          <input type="number" min={0} step={0.5} value={fund.investmentPeriodYears} onChange={setFundField("investmentPeriodYears")} className="w-14 border border-gray-200 rounded-md px-2 py-1 text-gray-900 tabular-nums" />
          yrs
        </label>
        <label className="flex items-center gap-1.5 text-gray-600">
          Term
          <input type="number" min={1} step={1} value={fund.termYears} onChange={setFundField("termYears")} className="w-14 border border-gray-200 rounded-md px-2 py-1 text-gray-900 tabular-nums" />
          yrs
        </label>
        <label className="flex items-center gap-1.5 text-gray-600">
          Extensions
          <input type="number" min={0} step={1} value={fund.extensionCount} onChange={setFundField("extensionCount")} className="w-12 border border-gray-200 rounded-md px-2 py-1 text-gray-900 tabular-nums" />
          ×
          <input type="number" min={0} step={1} value={fund.extensionYears} onChange={setFundField("extensionYears")} className="w-12 border border-gray-200 rounded-md px-2 py-1 text-gray-900 tabular-nums" />
          yr
        </label>
        <span className="text-gray-400">
          Term ends {fmtDate(fd.fundEnd)} · fully extended {fmtDate(fd.extendedEnd)}
        </span>
      </div>

      {(outsideIP.length > 0 || pastExtensions.length > 0 || usingExtensions.length > 0) && (
        <ul className="space-y-1.5 text-xs">
          {outsideIP.length > 0 && (
            <li className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Acquired outside the investment period: {outsideIP.map((d) => d.inputs.propertyName).join(", ")}.
            </li>
          )}
          {usingExtensions.length > 0 && (
            <li className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Sold after the {fund.termYears}-year term, using extensions: {usingExtensions.map((d) => d.inputs.propertyName).join(", ")}.
            </li>
          )}
          {pastExtensions.length > 0 && (
            <li className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Sold after the fully extended term: {pastExtensions.map((d) => d.inputs.propertyName).join(", ")}.
            </li>
          )}
        </ul>
      )}

      <FundTimeline deals={deals} fund={fund} />

      {/* Deal roster */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Property", "SF", "Purchase Price", "Equity", "IRR", "EM", "CoC Y1", "Acquired", "Exit", "Hold", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap last:w-16">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <DealRow key={deal.id} deal={deal} onRemove={onRemove} fund={fund} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-2.5 text-xs font-semibold text-gray-600">Fund Total</td>
              <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmt(totalSF)} SF</td>
              <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmtM(totalPurchasePrice)}</td>
              <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmtM(totalEquity)}</td>
              <td className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${isFinite(fundIRR) && fundIRR >= 14 ? "text-emerald-700" : "text-red-600"}`}>{fmtPct(fundIRR)}</td>
              <td className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${isFinite(weightedEM) && weightedEM >= 2 ? "text-emerald-700" : "text-red-600"}`}>{fmtX(weightedEM)}</td>
              <td className="px-3 py-2.5" colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Performance attribution */}
      <div className="border-t border-gray-200 pt-5">
        <PerformanceAttribution
          deals={deals}
          fundIRR={fundIRR}
          totalEquity={totalEquity}
          totalDistributions={totalDistributions}
        />
      </div>

      {/* Fund-level waterfall */}
      {(() => {
        const waterfallDeal = waterfallDealForIRR;
        if (!waterfallDeal) return null;
        return (
          <div className="border-t border-gray-200 pt-5">
            <FundWaterfall wf={fundWf} yearTotals={yearTotals} />
            <p className="text-xs text-gray-400 mt-2">
              Catch-up and promote tiers from <span className="font-medium">{waterfallDeal.inputs.propertyName || "first deal"}</span>;
              GP commitment ({fmt(gpCommitPct, 1)}%) and preferred return ({fmt(prefPct, 1)}%) set at the fund level.
            </p>
          </div>
        );
      })()}

      {/* Combined cash flow table */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 mb-2">Combined Cash Flows by Calendar Year</h4>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Year</th>
                {deals.map((d) => (
                  <th key={d.id} className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {d.inputs.propertyName || "Unnamed"}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {yearRows.map(({ year, total, byDeal }) => (
                <tr key={year} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-700">{year}</td>
                  {byDeal.map((v, i) => (
                    <td key={deals[i].id} className={`px-3 py-2 text-right tabular-nums ${v === 0 ? "text-gray-300" : v < 0 ? "text-red-600" : "text-gray-600"}`}>
                      {v !== 0 ? fmtM(v) : "—"}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${total < 0 ? "text-red-700" : "text-gray-900"}`}>
                    {fmtM(total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FundAnalysis({ savedDeals, currentDeal, onSave, onRemove }) {
  const groups = groupByFund(savedDeals);
  const fundNames = Object.keys(groups);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Fund Analysis</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Open deals with a Fund name are included live. Add to Fund saves a fixed snapshot.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add to Fund
          {currentDeal.inputs.fundName?.trim() && (
            <span className="ml-1 text-blue-200">· {currentDeal.inputs.fundName}</span>
          )}
        </button>
      </div>

      {savedDeals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h12A2.25 2.25 0 0020.25 14.25V3M3.75 3h16.5M3.75 3l-.75 3h18l-.75-3" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">No deals saved yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Set a Fund name in Deal Inputs, then click <span className="font-medium">Add to Fund</span> to snapshot this deal.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {fundNames.map((name) => (
            <div key={name} className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-5">
              <FundGroup fundName={name} deals={groups[name]} onRemove={onRemove} onRemoveFund={(ids) => ids.forEach(onRemove)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
