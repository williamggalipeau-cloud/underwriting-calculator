"use client";

import { useState } from "react";
import {
  acquisitionDate,
  assetQuarterlyEvents,
  byCalendarYear,
  computeDatedWaterfall,
  exitDate,
  fundDates,
  parseDate,
  xirr,
} from "@/lib/fundTimeline";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName, termsToCSV, termsToXlsx } from "@/lib/fundTerms";
import { fundLpEvents, subLineTerms } from "@/lib/fundFlows";
import { actualCapital } from "@/lib/capitalActivity";
import CapitalActivity from "@/components/CapitalActivity";
import { DEFAULT_CURVE } from "@/lib/forwardCurve";

// Last day of a "YYYY-Qn" quarter as ISO.
function quarterEndISO(q) {
  const [y, n] = q.split("-Q").map(Number);
  return new Date(Date.UTC(y, n * 3, 0)).toISOString().slice(0, 10);
}

function fmtDate(iso) {
  const d = parseDate(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}


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

// Quarterly distribution schedule from the dated waterfall ledger.
function QuarterlySchedule({ wf, terms, lineBalanceAt }) {
  const rows = wf.quarterly.reduce((acc, r) => {
    const prev = acc[acc.length - 1] ?? { lpCumul: 0, gpCumul: 0 };
    acc.push({ ...r, lpCumul: prev.lpCumul + r.lp, gpCumul: prev.gpCumul + r.gp });
    return acc;
  }, []);
  const cell = (v, cls = "text-gray-700") =>
    Math.abs(v) < 0.5 ? <span className="text-gray-300">—</span> : <span className={v < 0 ? "text-red-600" : cls}>{fmtM(v)}</span>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Quarter", "Capital calls", "Income dist.", "Sale proceeds", "LP pref", "Return of capital", "Held for next sale", "GP catch-up", "LP split", "GP promote", "LP total", "GP total", "LP yield (ann.)", "LP cumul.", ...(lineBalanceAt ? ["Sub line bal."] : [])].map((h) => (
                <th key={h} className="px-2.5 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const yieldPct = r.lpCapOut > 0 && r.lpIncome > 0 ? ((r.lpIncome * 4) / r.lpCapOut) * 100 : NaN;
              return (
                <tr key={r.quarter} className="hover:bg-gray-50">
                  <td className="px-2.5 py-1.5 font-medium text-gray-700 whitespace-nowrap">{r.quarter.replace("-", " ")}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.calls)}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.income, "text-emerald-700")}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.capital, "text-emerald-700")}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.pref)}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.roc)}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.held, "text-amber-700")}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.catchUp)}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.splitLp)}</td>
                  <td className="px-2.5 py-1.5 text-right">{cell(r.promoteGp)}</td>
                  <td className="px-2.5 py-1.5 text-right font-medium">{cell(r.lp, "text-blue-700")}</td>
                  <td className="px-2.5 py-1.5 text-right font-medium">{cell(r.gp, "text-purple-700")}</td>
                  <td className="px-2.5 py-1.5 text-right text-gray-600">{isFinite(yieldPct) ? fmtPct(yieldPct) : <span className="text-gray-300">—</span>}</td>
                  <td className={`px-2.5 py-1.5 text-right ${r.lpCumul < 0 ? "text-red-500" : "text-blue-600"}`}>{fmtM(r.lpCumul)}</td>
                  {lineBalanceAt && <td className="px-2.5 py-1.5 text-right text-gray-600">{cell(lineBalanceAt(quarterEndISO(r.quarter)))}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Operating cash is earned evenly through each hold year and paid at calendar quarter ends.{" "}
        {(terms.distributionPolicy ?? "reserve") === "payout"
          ? `${fmt(terms.incomePayoutPct ?? 100, 0)}% is distributed and the rest reserved.`
          : `Each asset keeps a reserve of ${fmt(terms.reserveYears ?? 1, 2)} year(s) of debt service, TI/leasing and asset-management fees; income above it is distributed.`}{" "}
        The reserve covers shortfalls before capital calls and is returned at the asset&apos;s sale as return of capital.{" "}
        {terms.incomeTreatment === "full"
          ? "Income runs the full waterfall each quarter."
          : "Income pays the LP pref, then returns capital; once both are current, income is held and paid with the next sale, where promote applies."}{" "}
        LP yield = quarter&apos;s LP income × 4 ÷ LP capital outstanding.
      </p>
    </div>
  );
}

function FundWaterfall({ wf, yearTotals, terms, lineBalanceAt }) {
  const [view, setView] = useState("quarterly");
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

      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs w-fit">
        {[
          ["quarterly", "Quarterly distributions"],
          ["annual", "Annual summary"],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={`px-3 py-1.5 font-medium ${view === k ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {view === "quarterly" && <QuarterlySchedule wf={wf} terms={terms} lineBalanceAt={lineBalanceAt} />}

      {/* Calendar-year table: capital calls (negative) and distributions */}
      {view === "annual" && (<>
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
        Sale proceeds run pref → return of capital → GP catch-up → promote, in date order.
      </p>
      </>)}
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

// Fund-level expenses and fund cash (lib/fundExpenses), by quarter.
function FundExpensesCard({ fx, terms, ipEnd, todayISO }) {
  const [open, setOpen] = useState(false);
  if (!fx || !fx.periods.length) return null;
  const t = fx.totals;
  const fm = (n) => (Math.abs(n) < 0.5 ? "—" : fmtM(n));
  const qLabel = (iso) => `Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1} ${iso.slice(0, 4)}`;
  const now = fx.periods.findLast((p) => p.quarter <= todayISO);
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-gray-700">Fund expenses &amp; fund cash</h4>
        <span className="text-[11px] text-gray-400">
          {fmt(terms.mgmtFeePct ?? 0, 2)}% management fee, quarterly in advance, on {terms.mgmtFeeBasis === "invested" ? "LP invested capital" : `LP commitments to ${fmtDate(ipEnd)}, then LP invested capital`} · sub line costs monthly ·
          minimum cash {fmt(terms.cashReserveQuarters ?? 2, 0)} quarters of projected expenses
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Management fees", fm(t.fees), "Over the fund's life"],
          ["Sub line costs", fm(t.lineCosts), "Interest + unused fees, incl. expense draws"],
          ["Expense calls", fm(t.called), "Quarterly calls to repay draws and restore cash"],
          ["Distributed", fm(t.distributed), "Operating income after expenses and cash"],
          ["Fund cash now", now ? fm(now.cashEnd) : "—", now ? `End of ${qLabel(now.quarter)}` : ""],
          ["Fee this quarter", now ? fm(now.fee) : "—", now ? `on ${fmtM(now.feeBasis)}` : ""],
        ].map(([label, value, sub]) => (
          <div key={label}>
            <p className="text-gray-500">{label}</p>
            <p className="text-sm font-bold tabular-nums text-gray-900">{value}</p>
            <p className="text-[10px] text-gray-400">{sub}</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-[11px] font-medium text-blue-700 hover:underline">
        {open ? "Hide" : "Show"} by quarter
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full tabular-nums">
            <thead className="text-gray-500">
              <tr className="border-b border-gray-200">
                {["Quarter", "Fee basis", "Mgmt fee", "Line interest", "Unused fee", "Expense-draw interest", "Paid from cash", "Drawn on line", "Income in", "Called", "Distributed", "Cash at end", "Minimum"].map((h) => (
                  <th key={h} className={`px-1.5 py-1 font-medium ${h === "Quarter" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fx.periods.map((p) => (
                <tr key={p.quarter} className={`border-b border-gray-100 ${p.quarter > todayISO ? "text-gray-500" : "text-gray-800"}`}>
                  <td className="px-1.5 py-1">{qLabel(p.quarter)}</td>
                  {[p.feeBasis, p.fee, p.lineInterest, p.lineUnused, p.bridgeInterest, p.fromCash, p.drawn, p.income, p.called, p.distributed, p.cashEnd, p.target].map((v, i) => (
                    <td key={i} className="px-1.5 py-1 text-right">{fm(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-gray-400">Quarters after today (grey) are projections. Fees are LP-only; the part of a call that paid fees is called from LPs only.</p>
        </div>
      )}
    </div>
  );
}

function FundGroup({ fundName, deals, otherAssets = [], terms, curve = DEFAULT_CURVE, onTermsChange, onEditTerms, onRemove, onRemoveFund }) {
  // Fund terms (timeline, GP commitment, pref, catch-up, tiers, fee) come
  // from the fund's saved terms; the inline inputs below edit them.
  const fund = terms;
  const gpCommitPct = terms.gpCommitPct;
  const prefPct = terms.prefPct;
  const setGpCommitPct = (v) => onTermsChange({ gpCommitPct: v });
  const setPrefPct = (v) => onTermsChange({ prefPct: v });
  const fd = fundDates(fund);
  // Dated cash flows: each asset's flows on its acquisition date + t years.
  // Quarterly cash flows per asset: waterfall events (after the payout /
  // reserve policy) and gross flows (for the fund's gross IRR and tables).
  const distPolicy =
    (terms.distributionPolicy ?? "reserve") === "payout"
      ? { mode: "payout", payoutPct: terms.incomePayoutPct ?? 100 }
      : { mode: "reserve", reserveYears: terms.reserveYears ?? 1 };
  const assetFlows = deals.map((d) => assetQuarterlyEvents(d, fund, distPolicy));
  const allFlows = assetFlows.flatMap((a) => a.gross);
  const waterfallEvents = assetFlows.flatMap((a) => a.events);
  const yearTotals = byCalendarYear(allFlows);
  const fundIRR = xirr(allFlows) * 100;   // gross IRR (before waterfall), XIRR
  const totalEquity = deals.reduce((s, d) => s + (d.metrics.equityRequired ?? 0), 0);
  const totalPurchasePrice = deals.reduce((s, d) => s + (d.inputs.purchasePrice ?? 0), 0);
  const totalSF = deals.reduce((s, d) => s + (d.inputs.squareFootage ?? 0), 0);

  // Net LP IRR from the fund's own waterfall terms.
  const fundWaterfallConfig = {
    lpEquityPct: 100 - gpCommitPct,
    preferredReturnPct: prefPct,
    catchUpGpPct: terms.catchUpGpPct,
    tiers: terms.tiers,
    // The management fee is a fund expense (lib/fundExpenses): its calls are
    // already in the event stream, so the waterfall adds none of its own.
    mgmtFeePct: 0,
    incomeTreatment: terms.incomeTreatment ?? "prefThenROC",
    feeStartISO: terms.finalClose,
  };
  const gpCommitAmount = totalEquity * (gpCommitPct / 100);
  const todayISO = new Date().toISOString().slice(0, 10);
  // Subscription line (model): capital needs draw on the line first; LP calls
  // repay each draw after maxDays (plus interest and unused fees).
  // The model alone (no capital activity): sub line + fund expenses.
  const modelFlows = fundLpEvents(waterfallEvents, { ...terms, capitalActivity: [] }, { todayISO, curve, investmentPeriodEnd: fd.investmentPeriodEnd });
  const modelSub = { events: modelFlows.events, stats: modelFlows.lineStats };
  // LP flows the fund returns use: the model, or actual capital activity to
  // date plus the model after today (lib/fundFlows).
  const flows = fundLpEvents(waterfallEvents, terms, { todayISO, curve, investmentPeriodEnd: fd.investmentPeriodEnd });
  const usingActuals = flows.mode === "actual";
  const line = usingActuals ? flows.lineStats : modelSub.stats;
  const fundWf = computeDatedWaterfall(flows.events, { ...fundWaterfallConfig, feeAfterISO: flows.feeAfterISO });
  const modelWf = usingActuals ? computeDatedWaterfall(modelSub.events, fundWaterfallConfig) : fundWf;
  const fundWfNoLine = modelSub.stats
    ? computeDatedWaterfall(fundLpEvents(waterfallEvents, { ...terms, capitalActivity: [], subLineEnabled: false }, { todayISO, curve, investmentPeriodEnd: fd.investmentPeriodEnd }).events, fundWaterfallConfig)
    : modelWf;
  const netLpIRR = fundWf ? fundWf.lpIRR : NaN;

  // Header returns, all on one basis: multiple = total distributions ÷ total
  // capital contributed (later capital calls count as capital).
  //   Gross:    asset-level equity cash flows, before fund fees and promote.
  //   Net fund: all investors (LP + GP) after the waterfall and fund fees;
  //             promote moves money between LP and GP, so only fund-level
  //             fees and distribution timing separate it from gross.
  //   Net LP:   LPs after pref, catch-up, promote and fees.
  const grossIn = -allFlows.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0);
  const grossOut = allFlows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const grossMultiple = grossIn > 0 ? grossOut / grossIn : NaN;
  const netFundIRR = xirr([...fundWf.lpFlows, ...fundWf.gpFlows]) * 100;
  const netFundIn = fundWf.lpEquity + fundWf.gpEquity;
  const netFundMultiple = netFundIn > 0 ? (fundWf.lpTotalDistributions + fundWf.gpTotalDistributions) / netFundIn : NaN;

  // ── Capital called & dry powder ──
  // Capital calls from the waterfall ledger (purchases, later shortfall calls
  // and fund-fee calls), LP + GP, by date.
  const calls = modelWf.ledger
    .filter((r) => r.kind === "call" || r.kind === "fee")
    .map((r) => ({ date: r.date, amount: -(r.lp + r.gp) }))
    .filter((c) => c.amount > 0);
  const calledBy = (iso) => calls.filter((c) => c.date <= iso).reduce((s, c) => s + c.amount, 0);
  const commitments = terms.targetEquity ?? 0;
  const calledToDate = calledBy(todayISO);
  const calledThroughIP = calledBy(fd.investmentPeriodEnd);
  const projectedCalls = calls.reduce((s, c) => s + c.amount, 0);
  // Sub line draws are repaid from future LP calls, so the outstanding
  // balance is already spoken for: dry powder = commitments − LP capital
  // called − line outstanding.
  const lineAt = (iso) => (modelSub.stats ? modelSub.stats.balanceAt(iso) : 0);
  const modelCapital = {
    commitments,
    calledToDate,
    dryPowderToday: commitments - calledToDate - lineAt(todayISO),
    projectedCalls,
    uncommitted: commitments - projectedCalls,
    dryPowderAtIPEnd: commitments - calledThroughIP - lineAt(fd.investmentPeriodEnd),
    pctCalledToDate: commitments > 0 ? (calledToDate / commitments) * 100 : NaN,
    ipOpen: todayISO <= fd.investmentPeriodEnd,
    lineToday: lineAt(todayISO),
  };
  // Actual capital activity (calls, line draws / repayments) replaces the
  // model up to today; only needs after today come from the model: asset
  // capital needs before the sub line (purchases, shortfalls) and fund fees.
  const activity = terms.capitalActivity ?? [];
  const modelNeeds = [
    ...waterfallEvents
      .filter((e) => e.kind === "call" && e.amount < 0)
      .map((e) => ({ date: e.date, amount: -e.amount, dealId: e.dealId, purchase: e.purchase })),
    // Fund expense calls (management fee, sub line costs, cash top-ups).
    ...modelSub.events.filter((e) => e.fundExpense && e.amount < 0).map((e) => ({ date: e.date, amount: -e.amount })),
  ];
  // Automatic fund-expense entries count as activity alongside manual ones.
  const manualActivity = activity.filter((a) => !a.auto);
  const actual = actualCapital(manualActivity.length ? [...manualActivity, ...(flows.autoActivity ?? [])] : manualActivity, {
    todayISO,
    ipEndISO: fd.investmentPeriodEnd,
    commitments,
    modelCalls: modelNeeds,
  });
  const capital = actual.hasActuals
    ? { ...actual, commitments, ipOpen: modelCapital.ipOpen, actual: true }
    : modelCapital;
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
  const dealYearTotals = assetFlows.map((a) => byCalendarYear(a.gross));
  const calendarYears = [...yearTotals.keys()].sort((a, b) => a - b);
  const yearRows = calendarYears.map((year) => ({
    year,
    total: yearTotals.get(year) ?? 0,
    byDeal: dealYearTotals.map((m) => m.get(year) ?? 0),
  }));

  const setFundField = (field) => (e) => {
    const v = e.target.type === "date" ? e.target.value : parseFloat(e.target.value);
    if (e.target.type === "date" ? !v : !isFinite(v) || v < 0) return;
    onTermsChange({ [field]: v });
  };
  const exportTerms = (kind) => {
    const t = { ...terms, name: fundName };
    const base = `${safeFileName(fundName)}_fund_terms`;
    if (kind === "xlsx") downloadBlob(termsToXlsx(t), `${base}.xlsx`);
    else downloadBlob(new Blob([termsToCSV(t)], { type: "text/csv" }), `${base}.csv`);
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
          <span className="mx-2 text-gray-300">·</span>
          <button type="button" onClick={onEditTerms} className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
            Edit all terms
          </button>
          <span className="mx-2 text-gray-300">·</span>
          <button type="button" onClick={() => exportTerms("xlsx")} className="mt-1.5 text-xs text-blue-600 hover:text-blue-700">
            Export terms (Excel)
          </button>
          <span className="mx-1 text-gray-300">/</span>
          <button type="button" onClick={() => exportTerms("csv")} className="mt-1.5 text-xs text-blue-600 hover:text-blue-700">
            CSV
          </button>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {[
            { label: "Gross", irr: fundIRR, mult: grossMultiple, note: "Assets, before fund fees & promote", irrGood: 14 },
            { label: "Net fund", irr: netFundIRR, mult: netFundMultiple, note: `All investors, after fund fees${usingActuals ? "; actual capital calls to date, model after" : ""}`, irrGood: 14, actuals: usingActuals },
            { label: "Net LP", irr: netLpIRR, mult: fundWf.lpEquityMultiple, note: `After pref, promote & fees${usingActuals ? "; actual capital calls to date, model after" : ""}`, irrGood: 12, actuals: usingActuals },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-right" title={m.note}>
              <p className="text-[11px] font-medium text-gray-500">
                {m.label}
                {m.actuals && <span className="ml-1 rounded bg-blue-50 px-1 text-[9px] font-semibold text-blue-700">actual calls</span>}
              </p>
              <p className="text-base font-bold tabular-nums leading-tight">
                <span className={isFinite(m.irr) && m.irr >= m.irrGood ? "text-emerald-700" : isFinite(m.irr) ? "text-red-600" : "text-gray-400"}>
                  {fmtPct(m.irr)}
                </span>
                <span className="text-gray-300 font-normal"> · </span>
                <span className="text-gray-900">{fmtX(m.mult)}</span>
              </p>
              <p className="text-[10px] text-gray-400">IRR · multiple</p>
            </div>
          ))}
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Equity</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">{fmtM(totalEquity)}</p>
            {terms.targetEquity > 0 && (
              <p className="text-[11px] text-gray-400 tabular-nums">
                {fmt((totalEquity / terms.targetEquity) * 100, 0)}% of {fmtM(terms.targetEquity)} commitments
              </p>
            )}
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

      <FundExpensesCard fx={flows.expenses} terms={terms} ipEnd={fd.investmentPeriodEnd} todayISO={todayISO} />

      {/* Subscription line */}
      {line && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-xs font-semibold text-gray-700">
              Subscription line{usingActuals && <span className="ml-1.5 font-normal text-gray-400">· projected from tomorrow (actual activity through {fmtDate(flows.actualThrough)})</span>}
            </h4>
            <span className="text-[11px] text-gray-400">
              {fmtM(line.size)} facility ({fmt(terms.subLineSizePct, 0)}% of {line.sizedOn === "commitments" ? "commitments" : "planned calls — enter commitments to size on fund size"})
              {" "}· 30D avg SOFR + {fmt(terms.subLineSpreadPct, 2)}% · {fmt(terms.subLineUnusedFeePct, 2)}% unused · repaid within {fmt(terms.subLineMaxDays, 0)} days
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {[
              ["Peak balance", fmtM(line.peak), `${fmtPct((line.peak / line.size) * 100, 0)} of facility`],
              ["Interest", fmtM(line.interest), `Avg draw outstanding ${fmt(line.avgDays, 0)} days`],
              ["Unused fees", fmtM(line.unusedFees), `Through ${fmtDate(line.endDate)}`],
              ["Net LP IRR", `${fmtPct(fundWf.lpIRR)}`, usingActuals ? `${fmtPct(modelWf.lpIRR)} model only` : `${fmtPct(fundWfNoLine.lpIRR)} without the line`],
              ["Net LP multiple", fmtX(fundWf.lpEquityMultiple), usingActuals ? `${fmtX(modelWf.lpEquityMultiple)} model only` : `${fmtX(fundWfNoLine.lpEquityMultiple)} without the line`],
              ["Net fund IRR", fmtPct(netFundIRR), usingActuals ? `${fmtPct(xirr([...modelWf.lpFlows, ...modelWf.gpFlows]) * 100)} model only` : `${fmtPct(xirr([...fundWfNoLine.lpFlows, ...fundWfNoLine.gpFlows]) * 100)} without the line`],
            ].map(([label, value, sub]) => (
              <div key={label}>
                <p className="text-gray-500">{label}</p>
                <p className="text-sm font-bold tabular-nums text-gray-900">{value}</p>
                <p className="text-[10px] text-gray-400">{sub}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            {usingActuals &&
              "Interest and fees on the line to date are in your actual calls; these figures cover tomorrow onward: draws still outstanding are repaid after the max days with interest, and future needs draw on the line. "}
            Purchases and shortfalls draw on the line first; each draw is repaid by an LP capital call after the max days outstanding
            (or called directly if the line is full). Interest and unused fees are paid with those calls, so they reduce LP returns.
          </p>
        </div>
      )}

      {/* Capital called & dry powder */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-700">Capital &amp; dry powder</h4>
          <span className="text-[11px] text-gray-400">
            As of {fmtDate(todayISO)} · investment period {capital.ipOpen ? `open until ${fmtDate(fd.investmentPeriodEnd)}` : `ended ${fmtDate(fd.investmentPeriodEnd)}`}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-gray-500">Total commitments</span>
            <span className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <span className="px-2 py-1 bg-gray-50 border-r border-gray-200 text-gray-500">$</span>
              <input
                type="number"
                min={0}
                step={1_000_000}
                value={commitments || ""}
                placeholder="Enter fund size"
                onChange={(e) => onTermsChange({ targetEquity: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full min-w-0 px-2 py-1 text-sm text-gray-900 outline-none tabular-nums"
              />
            </span>
          </label>
          {[
            ["Called to date", fmtM(capital.calledToDate), `${capital.commitments > 0 ? `${fmtPct(capital.pctCalledToDate, 0)} of commitments` : "LP + GP, incl. fees"}${capital.actual ? " · actual" : ""}`],
            ["Dry powder today", capital.commitments > 0 ? fmtM(capital.dryPowderToday) : "—", capital.untaggedAmount > 0 ? "Commitments − called − line − untagged purchases" : capital.actual || line ? "Commitments − called − sub line outstanding" : "Commitments − called to date", capital.dryPowderToday < 0],
            capital.actual
              ? ["Commitments used incl. plans", fmtM(capital.projectedCalls), `Called + line${capital.untaggedAmount > 0 ? " + untagged" : ""} + ${fmtM(capital.futureNeeds)} future needs`]
              : ["Planned deals will call", fmtM(capital.projectedCalls), line ? "LP calls incl. sub line repayments & costs" : "All calls for the fund's current deals"],
            ["Uncommitted capital", capital.commitments > 0 ? fmtM(capital.uncommitted) : "—", "Left for new deals after planned ones", capital.uncommitted < 0],
            ["Dry powder at IP end", capital.commitments > 0 ? fmtM(capital.dryPowderAtIPEnd) : "—", `If no other deals by ${fmtDate(fd.investmentPeriodEnd)}`, capital.dryPowderAtIPEnd < 0],
          ].map(([label, value, sub, bad]) => (
            <div key={label}>
              <p className="text-gray-500">{label}</p>
              <p className={`text-sm font-bold tabular-nums ${bad ? "text-red-600" : "text-gray-900"}`}>{value}</p>
              <p className="text-[10px] text-gray-400">{sub}</p>
            </div>
          ))}
        </div>
        {capital.commitments > 0 && capital.uncommitted < 0 && (
          <p className="mt-2 text-[11px] text-red-600">
            {`Planned deals need ${fmtM(-capital.uncommitted)} more than the fund's commitments.`}
          </p>
        )}
        {capital.actual ? (
          <p className="mt-2 text-[11px] text-gray-500">
            From your capital activity through {fmtDate(capital.lastDate)}: sub line outstanding today{" "}
            <span className="font-semibold text-gray-800">{fmtM(capital.lineToday)}</span>{" "}(deducted from dry powder, as it is repaid with
            future calls). Future needs are the model&apos;s purchases dated after today (except assets you&apos;ve tagged as funded),
            shortfalls and fund fees, before any sub line. The model alone assumed {fmtM(modelCapital.calledToDate)} called and{" "}
            {fmtM(modelCapital.lineToday)} on the line by today.
          </p>
        ) : (
          line && (
            <p className="mt-2 text-[11px] text-gray-500">
              Modelled: every purchase is drawn on the sub line and repaid by a call after {fmt(terms.subLineMaxDays, 0)} days. Sub line
              outstanding today: <span className="font-semibold text-gray-800">{fmtM(capital.lineToday)}</span>. Enter your actual capital
              calls below to replace this with what happened.
            </p>
          )
        )}
        {capital.actual && capital.untaggedPast.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-700">
            No capital activity is tagged to{" "}
            {capital.untaggedPast
              .map((c) => `${deals.find((d) => d.id === c.dealId)?.inputs.propertyName ?? "an asset"} (bought ${fmtDate(c.date)})`)
              .join(", ")}
            . Until it is, its equity ({fmtM(capital.untaggedAmount)} in total) is assumed called on the model date, in dry powder and in
            fund returns. If it was funded by a call or line draw entered under another purpose, set that entry&apos;s purpose to the
            asset. If it hasn&apos;t closed yet, move its acquisition date to the expected closing date.
          </p>
        )}
        {!(capital.commitments > 0) && (
          <p className="mt-2 text-[11px] text-gray-500">Enter the fund&apos;s total commitments to see dry powder.</p>
        )}
        <CapitalActivity fundName={fundName} activity={activity} autoActivity={flows.autoActivity ?? []} deals={deals} otherAssets={otherAssets} commitments={terms.targetEquity ?? 0} onChange={(next) => onTermsChange({ capitalActivity: next })} />
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
      <div className="border-t border-gray-200 pt-5">
        <FundWaterfall wf={fundWf} yearTotals={yearTotals} terms={terms} lineBalanceAt={line || usingActuals ? flows.lineAt : undefined} />
        <p className="text-xs text-gray-400 mt-2">
          Fund terms: {fmt(gpCommitPct, 1)}% GP commitment, {fmt(prefPct, 1)}% pref, {fmt(terms.catchUpGpPct, 0)}% GP catch-up,
          tiers {terms.tiers.map((t) => `${t.irrThreshold == null ? "above" : `≤${t.irrThreshold}%`} ${t.lpSplit}/${t.gpSplit}`).join(" · ")}
          {terms.mgmtFeePct > 0 ? ` · ${fmt(terms.mgmtFeePct, 2)}% management fee (${fmtM(flows.expenses?.totals.fees ?? 0)} total, paid as a fund expense)` : " · no fund-level management fee"}.
        </p>
      </div>

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

export default function FundAnalysis({ savedDeals, currentDeal, onSave, onRemove, funds = {}, onFundTermsChange, onNewFund, onEditFund, onDeleteFund, curve, allAssets = [], unassigned = [], onAssignFund }) {
  const groups = groupByFund(savedDeals);
  // Funds with terms but no deals yet still show (as empty cards).
  const fundNames = [...new Set([...Object.keys(funds), ...Object.keys(groups)])];
  const termsFor = (name) => ({ ...DEFAULT_FUND_TERMS, ...(funds[name] ?? {}), name });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Fund Analysis</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Open deals with a Fund name are included live. Add to Fund saves a fixed snapshot.
          </p>
        </div>
        <div className="flex items-center gap-2">
        {onNewFund && (
          <button
            type="button"
            onClick={onNewFund}
            className="text-sm font-medium text-blue-600 border border-blue-200 hover:border-blue-300 bg-white px-4 py-2 rounded-lg"
          >
            New fund
          </button>
        )}
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
      </div>

      {unassigned.length > 0 && fundNames.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold">
            {unassigned.length} open {unassigned.length === 1 ? "property isn't" : "properties aren't"} in any fund, so {unassigned.length === 1 ? "it's" : "they're"} left
            out of fund returns, attribution, capital activity, valuations and the asset summary.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unassigned.map((u) => (
              <span key={u.id} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2 py-1">
                <span className="font-medium text-gray-800">{u.name}</span>
                {fundNames.length === 1 ? (
                  <button type="button" onClick={() => onAssignFund?.(u.id, fundNames[0])} className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 hover:bg-blue-100">
                    Add to {fundNames[0]}
                  </button>
                ) : (
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && onAssignFund?.(u.id, e.target.value)}
                    className="rounded border border-blue-200 bg-white px-1 py-0.5 text-blue-700"
                    aria-label={`Add ${u.name} to a fund`}
                  >
                    <option value="">Add to fund…</option>
                    {fundNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {fundNames.length === 0 ? (
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
              {groups[name]?.length ? (
                <FundGroup
                  curve={curve}
                  fundName={name}
                  deals={groups[name]}
                  otherAssets={allAssets.filter((a) => !groups[name].some((d) => d.id === a.id))}
                  terms={termsFor(name)}
                  onTermsChange={(patch) => onFundTermsChange?.(name, patch)}
                  onEditTerms={() => onEditFund?.(name)}
                  onRemove={onRemove}
                  onRemoveFund={(ids) => {
                    ids.forEach(onRemove);
                    onDeleteFund?.(name);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      No deals yet. Type <span className="font-medium">{name}</span> in a deal&apos;s Fund field (left panel) to add it.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => onEditFund?.(name)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                      Edit terms
                    </button>
                    <button type="button" onClick={() => onDeleteFund?.(name)} className="text-xs text-gray-400 hover:text-red-500">
                      Delete fund
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
