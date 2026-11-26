"use client";

// Phase M: Deal Screener shows pipeline deals only, with a "Model in fund"
// picker: the chosen fund with vs. without this deal (modeling only).
import { useMemo, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { fundOptionLabel } from "@/lib/fundTypes";
import { writeXlsx } from "@/lib/xlsx";
import { IMPACT_ROWS, fundImpact, impactXlsx } from "@/lib/fundImpact";

const fmt = (v, u) => (v == null || !isFinite(v) ? "—" : u === "%" ? `${v.toFixed(1)}%` : u === "x" ? `${v.toFixed(2)}x` : `$${(v / 1e6).toFixed(2)}M`);
const fmtD = (v, u) => {
  if (v == null || !isFinite(v)) return "—";
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  return u === "%" ? `${s}${a.toFixed(1)} pts` : u === "x" ? `${s}${a.toFixed(2)}x` : `${s}$${(a / 1e6).toFixed(2)}M`;
};
const tone = (v, good = 1) => (v == null || Math.abs(v) < 1e-9 ? "text-gray-500" : v * good > 0 ? "text-emerald-700" : "text-red-600");
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");

// The notice for an owned asset, and the offer to update the Pipeline row
// when the screener's figures differ from it. (The deals to pick from are in
// the Pipeline Deal dropdown since 1.1.6: components/PipelineDealPicker.jsx.)
export function ScreenerPicker({ activeDeal, owned, pipelineRow = null, onSyncRow = null, activeRows = [], onPickRow = null }) {
  const q = activeDeal.quick ?? {};
  const diffs = pipelineRow ? [
    ["askingPrice", "price", q.purchasePrice],
    ["noi", "NOI", q.noiYear1],
    ["expectedClose", "close date", q.acquisitionDate],
  ].filter(([k, , v]) => v != null && v !== "" && String(pipelineRow[k] ?? "") !== String(v)) : [];
  if (!owned && !(diffs.length > 0 && onSyncRow)) return null;
  return (
    <div className="space-y-2" data-testid="screener-picker">
      {owned && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="screener-owned">
          <span className="font-semibold">{activeDeal.inputs.propertyName}</span> is an owned asset of {activeDeal.inputs.fundName} (acquired {usDate(activeDeal.inputs.acquisitionDate)}). Deal Screener is for pipeline deals; owned assets are on the Asset Management tabs. Choose a Pipeline Deal above.
        </p>
      )}
      {/* 1.1.11 (UI review): no dead end: the active Pipeline deals to pick from. */}
      {owned && onPickRow && (
        activeRows.length ? (
          <div className="rounded-lg border border-gray-200 bg-white p-3" data-testid="screener-pick-list">
            <p className="mb-2 text-xs font-semibold text-gray-700">Screen a pipeline deal</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeRows.map((r) => (
                <button key={r.id} type="button" onClick={() => onPickRow(r.id)} className="rounded-lg border border-gray-200 px-3 py-2 text-left text-xs hover:border-blue-300 hover:bg-blue-50">
                  <b className="block text-sm text-gray-900">{r.name}</b>
                  <span className="text-gray-600">{[r.stage ? r.stage[0].toUpperCase() + r.stage.slice(1) : "", r.askingPrice > 0 ? `$${(r.askingPrice / 1e6).toFixed(1)}M` : "", r.sf > 0 ? `${Math.round(r.sf).toLocaleString("en-US")} SF` : ""].filter(Boolean).join(" · ")}</span>
                </button>
              ))}
            </div>
          </div>
        ) : <p className="text-xs text-gray-600" data-testid="screener-pick-empty">No active deals on the Pipeline. Add one in Acquisitions → Pipeline, then screen it here.</p>
      )}
      {!owned && diffs.length > 0 && onSyncRow && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900" data-testid="screener-sync">
          The screener&apos;s {diffs.map(([, l]) => l).join(", ")} differ from the Pipeline row.
          <button type="button" onClick={() => onSyncRow(Object.fromEntries(diffs.map(([k, , v]) => [k, v])))} className="rounded border border-sky-300 bg-white px-2 py-0.5 font-medium">Update pipeline row</button>
        </p>
      )}
    </div>
  );
}

const money = (v) => (v > 0 ? `$${Math.round(v).toLocaleString("en-US")}` : "—");
const histDate = (row) => row.stageDate || (row.stage === "closed" ? row.expectedClose : "") || "";

// The Pipeline row's figures (what a model is built from).
function RowFigures({ row, dim = false }) {
  const f = [["Asking price", money(row.askingPrice)], ["NOI", money(row.noi)], ["Size", row.sf > 0 ? `${Math.round(row.sf).toLocaleString("en-US")} SF` : "—"], ["Expected close", usDate(row.expectedClose)]];
  return (
    <div className={`mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4 ${dim ? "opacity-60" : ""}`} data-testid="row-figures">
      {f.map(([k, v]) => <div key={k} className="rounded-md bg-white/70 px-2 py-1 text-[11px] text-gray-500">{k}<b className="block text-sm text-gray-900">{v}</b></div>)}
    </div>
  );
}

const linkBtn = "rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50";

// Deal Screener (user, 11/25, 1.1.6): what the picked Pipeline row shows
// above the screener (lib/screenerPicker.js screenerState).
export function ScreenerRowCard({ row, state, justScreened = false, canEdit = false, onImpact = null, onComps = null, onOpenAsset = null, onOpenPipeline = null }) {
  const kind = state?.kind;
  if (kind === "closed") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="screener-closed">
        <span className="font-semibold">{row.name}</span> · Closed{histDate(row) ? ` ${usDate(histDate(row))}` : ""}{" "}
        {state.asset ? (
          <>→ now an asset of {state.asset.inputs.fundName}. {onOpenAsset && <button type="button" onClick={onOpenAsset} className={`${linkBtn} ml-1`}>Open asset →</button>}
            <span className="mt-1 block text-[11px]">Opens on its Asset Business Plan, like every owned asset; its screening is kept with the asset.</span></>
        ) : (
          <>, not converted to an asset yet. {onOpenPipeline && <button type="button" onClick={onOpenPipeline} className={`${linkBtn} ml-1`}>Convert it on the Pipeline →</button>}</>
        )}
      </div>
    );
  }
  if (kind === "passed") {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700" data-testid="screener-passed">
        <span className="font-semibold">{row.name}</span> · Passed / lost{histDate(row) ? ` ${usDate(histDate(row))}` : ""}
        <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">READ-ONLY</span>
        {row.passReason && <span className="mt-1 block">Reason: &ldquo;{row.passReason}&rdquo;</span>}
        <span className="mt-1 block text-[11px]">
          {state.model ? "The screening as it stood is shown below, greyed. " : "It was never screened; the Pipeline figures are below. "}
          To change it, move the deal back to an active stage on the Pipeline.
          {onOpenPipeline && <button type="button" onClick={onOpenPipeline} className={`${linkBtn} ml-2`}>Open Pipeline →</button>}
        </span>
        {!state.model && <RowFigures row={row} dim />}
      </div>
    );
  }
  if (kind === "new") {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900" data-testid="screener-new">
        <span className="font-semibold">{row.name}</span> · not screened yet. {canEdit ? "Pick it again to build its model from these Pipeline figures." : "An editor's pick builds its model from these Pipeline figures."}
        <RowFigures row={row} />
      </div>
    );
  }
  // Screened: the next steps for this deal.
  return (
    <div className="space-y-2">
      {justScreened && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900" data-testid="screener-just-screened">
          <span className="font-semibold">{row.name}</span> was screened from its Pipeline row just now (logged). Built from:
          <RowFigures row={row} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="screener-next">
        <span>Next for this deal:</span>
        {onImpact && <button type="button" onClick={onImpact} className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">Portfolio Impact{row.targetFund ? ` in ${row.targetFund}` : ""} →</button>}
        {onComps && <button type="button" onClick={onComps} className={linkBtn}>Comps →</button>}
        <span className="text-[11px] text-emerald-800">{row.targetFund ? "Target fund from the Pipeline row. " : "No target fund on the Pipeline row yet. "}Both tabs open on this deal.</span>
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
                {r.limits.length === 0 ? <span className="text-gray-500">No fund limits set (Reports → Fund limits).</span>
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
