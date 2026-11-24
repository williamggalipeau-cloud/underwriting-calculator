"use client";

// Phase M: Deal Screener shows pipeline deals only, with a "Model in fund"
// picker: the chosen fund with vs. without this deal (modeling only).
import { useMemo, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { fundOptionLabel } from "@/lib/fundTypes";
import { writeXlsx } from "@/lib/xlsx";
import { IMPACT_ROWS, fundImpact, impactXlsx, isPipeline } from "@/lib/fundImpact";

const fmt = (v, u) => (v == null || !isFinite(v) ? "—" : u === "%" ? `${v.toFixed(1)}%` : u === "x" ? `${v.toFixed(2)}x` : `$${(v / 1e6).toFixed(2)}M`);
const fmtD = (v, u) => {
  if (v == null || !isFinite(v)) return "—";
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  return u === "%" ? `${s}${a.toFixed(1)} pts` : u === "x" ? `${s}${a.toFixed(2)}x` : `${s}$${(a / 1e6).toFixed(2)}M`;
};
const tone = (v, good = 1) => (v == null || Math.abs(v) < 1e-9 ? "text-gray-400" : v * good > 0 ? "text-emerald-700" : "text-red-600");
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");

// The pipeline deals to pick from, and the notice for an owned asset.
export function ScreenerPicker({ activeDeal, deals, todayISO, onSelect, owned, pipelineRow = null, onSyncRow = null }) {
  const q = activeDeal.quick ?? {};
  const diffs = pipelineRow ? [
    ["askingPrice", "price", q.purchasePrice],
    ["noi", "NOI", q.noiYear1],
    ["expectedClose", "close date", q.acquisitionDate],
  ].filter(([k, , v]) => v != null && v !== "" && String(pipelineRow[k] ?? "") !== String(v)) : [];
  const pipe = deals.filter((d) => isPipeline(d, todayISO));
  return (
    <div className="space-y-2" data-testid="screener-picker">
      {owned && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="screener-owned">
          <span className="font-semibold">{activeDeal.inputs.propertyName}</span> is an owned asset of {activeDeal.inputs.fundName} (acquired {usDate(activeDeal.inputs.acquisitionDate)}). Deal Screener is for pipeline deals; owned assets are on the Asset Management tabs.
        </p>
      )}
      {!owned && diffs.length > 0 && onSyncRow && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900" data-testid="screener-sync">
          The screener&apos;s {diffs.map(([, l]) => l).join(", ")} differ from the Pipeline row.
          <button type="button" onClick={() => onSyncRow(Object.fromEntries(diffs.map(([k, , v]) => [k, v])))} className="rounded border border-sky-300 bg-white px-2 py-0.5 font-medium">Update pipeline row</button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-gray-500">Pipeline Deals:</span>
        {pipe.length === 0 ? <span className="text-gray-400">none yet. Add them on the Pipeline tab and press Screen.</span> : pipe.map((d) => (
          <button key={d.id} type="button" onClick={() => onSelect(d.id)} className={`rounded-full border px-2.5 py-0.5 ${d.id === activeDeal.id ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-blue-300"}`} data-testid="screener-deal">
            {d.inputs.propertyName || "Unnamed deal"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScreenerFundImpact({ activeDeal, deals, funds, todayISO, curve, defaultFund = "" }) {
  const names = Object.keys(funds);
  const [pick, setPick] = useState(null);
  const fund = names.includes(pick) ? pick : names.includes(defaultFund) ? defaultFund : names[0];
  const [base, setBase] = useState("all");
  const terms = useMemo(() => (fund ? { ...DEFAULT_FUND_TERMS, ...(funds[fund] ?? {}), name: fund } : null), [funds, fund]);
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fund && d.id !== activeDeal.id), [deals, fund, activeDeal.id]);
  const r = useMemo(() => {
    if (!terms) return null;
    try { return fundImpact(fundDeals, terms, [activeDeal], { todayISO, curve, base }); } catch { return null; }
  }, [fundDeals, terms, activeDeal, todayISO, curve, base]);
  if (!names.length) return null;
  return (
    <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/30 p-3" data-testid="screener-impact">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Model in fund <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">Scenario — not actual</span></h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Model in fund" value={fund} onChange={(e) => setPick(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">{names.map((n) => <option key={n} value={n}>{fundOptionLabel(n, funds)}</option>)}</select>
          <select aria-label="Compare against" value={base} onChange={(e) => setBase(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">
            <option value="all">vs. owned + other pipeline assets</option>
            <option value="owned">vs. owned assets only</option>
          </select>
          {r && <button type="button" onClick={() => downloadBlob(writeXlsx(impactXlsx(fund, r), { sheetName: "Fund impact", title: `Baywise · ${fund} fund impact (scenario)` }), `${safeFileName(fund)}-impact-${safeFileName(activeDeal.inputs.propertyName || "deal")}.xlsx`)} className="rounded border border-gray-300 bg-white px-2 py-1">Excel</button>}
        </div>
      </div>
      {!r ? <p className="text-xs text-gray-500">Couldn&apos;t run the fund with this deal.</p> : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <table className="w-full text-xs tabular-nums" data-testid="impact-returns">
              <thead className="text-gray-500"><tr><th className="py-1 text-left font-medium">{fund}</th><th className="py-1 text-right font-medium">Without</th><th className="py-1 text-right font-medium">With</th><th className="py-1 text-right font-medium">Change</th></tr></thead>
              <tbody>
                {IMPACT_ROWS.map(([k, l, u]) => (
                  <tr key={k} className="border-t border-indigo-100"><td className="py-1">{l}</td><td className="py-1 text-right">{fmt(r.without.returns[k], u)}</td><td className="py-1 text-right font-semibold">{fmt(r.with.returns[k], u)}</td><td className={`py-1 text-right ${tone(r.change[k])}`}>{fmtD(r.change[k], u)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-xs" data-testid="impact-capital">
              <div className="flex justify-between"><span>Equity this deal needs</span><span className="font-semibold tabular-nums">{fmt(r.change.equity, "$")}</span></div>
              <div className="flex justify-between"><span>Dry powder before → after</span><span className={`tabular-nums ${r.overCommitted ? "font-semibold text-red-700" : ""}`}>{fmt(r.without.dryPowder, "$")} → {fmt(r.with.dryPowder, "$")}{r.dryPowderUsedPct != null ? ` (${r.dryPowderUsedPct.toFixed(1)}% used)` : ""}</span></div>
              <div className="flex justify-between"><span>Largest tenant, % of fund rent</span><span className="tabular-nums">{fmt(r.without.conc.tenant.value, "%")} → {fmt(r.with.conc.tenant.value, "%")}</span></div>
              <div className="flex justify-between"><span>Largest state, % of value</span><span className="tabular-nums">{fmt(r.without.conc.state.value, "%")} → {fmt(r.with.conc.state.value, "%")} {r.with.conc.state.what ? `(${r.with.conc.state.what})` : ""}</span></div>
              <div className="flex justify-between"><span>Fund leverage (LTV)</span><span className="tabular-nums">{fmt(r.without.conc.ltv.value, "%")} → {fmt(r.with.conc.ltv.value, "%")}</span></div>
              <div className="pt-1" data-testid="impact-limits">
                {r.limits.length === 0 ? <span className="text-gray-400">No fund limits set (Reports → Fund limits).</span>
                  : r.newBreaches.length ? <span className="font-semibold text-red-700">Would breach: {r.newBreaches.map((l) => `${l.label} (${l.actual?.toFixed(1)} vs. ${l.limit})`).join("; ")}</span>
                  : <span className="text-emerald-700">No new limit breaches ({r.limits.length} limits checked).</span>}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-500">Modeling only: the fund and this deal are not changed. Net figures run through the fund&apos;s sub line, expenses and waterfall. {r.base === "all" ? "Without = owned assets plus the fund's other pipeline assets." : "Without = owned assets only."}</p>
        </>
      )}
    </section>
  );
}
