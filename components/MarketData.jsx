"use client";

// Phase U: Market Data tab (Market group, before Library). Submarket
// statistics by quarter with trends, uploads (CoStar / broker reports),
// assets tagged to submarkets, and each asset's assumptions vs. the market.
import { useState } from "react";
import { STAT_FIELDS, assetVsMarket, detectMarketMapping, importMarket, makeStat, makeSubmarket, marketOf, marketXlsx, quarterKey, quarterLabel, seriesFor, submarketSummary } from "@/lib/market";
import { parseCSV, downloadBlob } from "@/lib/fundTerms";
import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";

const inp = "rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:bg-transparent disabled:border-transparent";
const fmt = (v, unit) => (v == null || !Number.isFinite(Number(v)) ? "—" : unit === "pct" ? `${Number(v).toFixed(1)}%` : unit === "psf" ? `$${Number(v).toFixed(2)}` : unit === "money" ? `$${(Number(v) / 1e6).toFixed(1)}M` : Math.round(Number(v)).toLocaleString("en-US"));

function Spark({ values, label }) {
  const xs = values.filter((v) => v != null);
  if (xs.length < 2) return <span className="text-[10px] text-gray-400">—</span>;
  const min = Math.min(...xs), max = Math.max(...xs), W = 90, H = 24;
  const pts = values.map((v, i) => (v == null ? null : `${(i / (values.length - 1)) * W},${H - ((v - min) / (max - min || 1)) * (H - 4) - 2}`)).filter(Boolean).join(" ");
  return <svg width={W} height={H} role="img" aria-label={`${label} trend`} className="inline-block"><polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="1.5" /></svg>;
}

export default function MarketData({ comps, onChange, deals = [], canEdit = false, onUpdateDeal }) {
  const market = marketOf(comps);
  const [sel, setSel] = useState(market.submarkets[0]?.id ?? "");
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null);
  const cur = market.submarkets.find((s) => s.id === sel) ?? market.submarkets[0] ?? null;
  const setMarket = (fn) => onChange((c) => ({ ...c, market: fn(marketOf(c)) }));
  const series = cur ? seriesFor(market, cur.id) : [];

  async function upload(file) {
    setMsg(null);
    try {
      const grid = file.name.toLowerCase().endsWith(".csv") ? parseCSV(await file.text()) : await readXlsxGrid(await file.arrayBuffer());
      const det = detectMarketMapping(grid, market.mapping);
      if (!det.ok) { setMsg("Couldn't find a quarter column and at least two statistics. Check the header row."); return; }
      setPending({ grid, det, name: file.name });
    } catch (e) { setMsg(e.message); }
  }
  function confirm() {
    const r = importMarket(market, pending.grid, pending.det, { source: pending.name, sourceDate: new Date().toISOString().slice(0, 10), defaultSubmarket: pending.det.mapping.submarket == null ? cur?.name ?? "" : "" });
    setMarket(() => r.market);
    if (!cur && r.market.submarkets[0]) setSel(r.market.submarkets[0].id);
    setMsg(`Imported ${pending.name}: ${r.added} quarters added, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped (no quarter or submarket)` : ""}.`);
    setPending(null);
  }

  return (
    <div className="space-y-4 text-gray-900" data-testid="market-data">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-bold">Market Data</h2><p className="text-xs text-gray-500">Submarket statistics by quarter, with each figure&apos;s source and date. Tag assets to their submarket to see their assumptions next to the market.</p></div>
        <div className="flex items-center gap-2 text-xs">
          {canEdit && <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium">Upload CoStar / broker report<input type="file" accept=".csv,.xlsx,.xls" className="hidden" data-testid="market-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} /></label>}
          <button type="button" disabled={!market.stats.length} onClick={async () => downloadBlob(await writeXlsx(marketXlsx(market), { sheetName: "Market data" }), "market-data.xlsx")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium disabled:opacity-40">Excel</button>
        </div>
      </div>
      {pending && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs" data-testid="market-mapping">
          <p className="mb-1 font-semibold">Columns found in {pending.name} (remembered for next time):</p>
          <p className="text-gray-700">{Object.entries(pending.det.names).map(([k, v]) => `${k === "submarket" ? "Submarket" : k === "quarter" ? "Quarter" : STAT_FIELDS.find(([f]) => f === k)?.[1] ?? k} ← "${v}"`).join(" · ")}</p>
          <div className="mt-1.5 flex gap-2"><button type="button" onClick={confirm} className="rounded-lg border border-blue-600 bg-blue-600 px-3 py-1 font-medium text-white">Import</button><button type="button" onClick={() => setPending(null)} className="text-gray-600 hover:underline">Cancel</button></div>
        </div>
      )}
      {msg && <p role="status" className="text-xs text-gray-700" data-testid="market-msg">{msg}</p>}

      {/* Submarkets */}
      <section className="space-y-2" data-testid="submarkets">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Submarket</span>
          {market.submarkets.map((s) => <button key={s.id} type="button" onClick={() => setSel(s.id)} className={`rounded-lg border px-2.5 py-1 ${cur?.id === s.id ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-gray-200 bg-white"}`}>{s.name || "Unnamed"}</button>)}
          {canEdit && <button type="button" onClick={() => { const s = makeSubmarket({ name: `Submarket ${market.submarkets.length + 1}` }); setMarket((m) => ({ ...m, submarkets: [...m.submarkets, s] })); setSel(s.id); }} className="rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-gray-600">+ Submarket</button>}
        </div>
        {cur && (
          <div className="flex flex-wrap items-end gap-2 text-xs">
            {[["name", "Name"], ["metro", "Metro"], ["propertyType", "Property type"]].map(([k, l]) => <label key={k} className="flex flex-col"><span className="text-[10px] text-gray-500">{l}</span><input aria-label={`Submarket ${l}`} value={cur[k] ?? ""} disabled={!canEdit} onChange={(e) => setMarket((m) => ({ ...m, submarkets: m.submarkets.map((s) => (s.id === cur.id ? { ...s, [k]: e.target.value } : s)) }))} className={`${inp} w-40`} /></label>)}
          </div>
        )}
      </section>

      {cur && (() => {
        const sum = submarketSummary(market, cur.id);
        return (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="market-summary">
              {[["Vacancy", fmt(sum.vacancy.latest, "pct"), sum.vacancy.change != null ? `${sum.vacancy.change >= 0 ? "+" : ""}${sum.vacancy.change.toFixed(1)} pts` : "", series.map((s) => s.vacancyPct)],
                ["Asking rent", fmt(sum.rent.latest, "psf"), sum.rent.annualPct != null ? `${sum.rent.annualPct >= 0 ? "+" : ""}${sum.rent.annualPct.toFixed(1)}%/yr` : "", series.map((s) => s.askingRentPSF)],
                ["Small-bay rent", fmt(sum.smallBay.latest, "psf"), sum.smallBay.annualPct != null ? `${sum.smallBay.annualPct >= 0 ? "+" : ""}${sum.smallBay.annualPct.toFixed(1)}%/yr` : "", series.map((s) => s.askingRentSmallBayPSF)],
                ["Cap rate", fmt(sum.cap.latest, "pct"), sum.cap.change != null ? `${sum.cap.change >= 0 ? "+" : ""}${(sum.cap.change * 100).toFixed(0)} bp` : "", series.map((s) => s.capRatePct)],
                ["Net absorption (4Q)", fmt(sum.absorption, "sf"), "SF", series.map((s) => s.netAbsorptionSF)]].map(([k, v, d, vals]) => (
                <div key={k} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"><p className="text-[11px] text-gray-500">{k}</p><p className="text-sm font-semibold tabular-nums">{v} <span className="text-[11px] font-normal text-gray-500">{d}</span></p><Spark values={vals} label={k} /></div>
              ))}
            </div>

            <section className="space-y-1.5">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Quarterly statistics: {cur.name}</h3>
                {canEdit && <button type="button" onClick={() => setMarket((m) => ({ ...m, stats: [...m.stats, makeStat({ submarketId: cur.id, quarter: quarterKey(new Date().toISOString().slice(0, 10)) })] }))} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium">+ Quarter</button>}</div>
              {series.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-xs text-gray-400">No statistics yet: upload a CoStar or broker report, or add a quarter.</p> : (
                <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full text-xs tabular-nums">
                  <thead className="bg-gray-50 text-gray-500"><tr><th className="px-1.5 py-1.5 text-left font-medium">Quarter</th>{STAT_FIELDS.map(([k, l]) => <th key={k} className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">{l}</th>)}<th className="px-1.5 py-1.5 text-left font-medium">Source</th></tr></thead>
                  <tbody>{series.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100" data-testid="market-row">
                      <td className="px-1.5 py-1"><input aria-label="Quarter" value={quarterLabel(s.quarter)} disabled={!canEdit} onChange={(e) => { const q = quarterKey(e.target.value); if (q) setMarket((m) => ({ ...m, stats: m.stats.map((x) => (x.id === s.id ? { ...x, quarter: q } : x)) })); }} className={`${inp} w-20`} /></td>
                      {STAT_FIELDS.map(([k, l]) => <td key={k} className="px-1.5 py-1"><input aria-label={l} type="number" step="any" value={s[k] ?? ""} disabled={!canEdit} onChange={(e) => setMarket((m) => ({ ...m, stats: m.stats.map((x) => (x.id === s.id ? { ...x, [k]: e.target.value === "" ? null : Number(e.target.value), source: x.source === "Manual" || !x.source ? "Manual" : `${x.source} (edited)`, sourceDate: new Date().toISOString().slice(0, 10) } : x)) }))} className={`${inp} w-20`} /></td>)}
                      <td className="px-1.5 py-1 text-[10px] text-gray-500">{s.source}{s.sourceDate ? ` · ${s.sourceDate}` : ""}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
          </>
        );
      })()}

      {/* Assets */}
      <section className="space-y-1.5" data-testid="market-assets">
        <h3 className="text-sm font-semibold">Assets and their market</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full text-xs tabular-nums">
          <thead className="bg-gray-50 text-gray-500"><tr><th className="px-1.5 py-1.5 text-left font-medium">Asset</th><th className="px-1.5 py-1.5 text-left font-medium">Submarket</th><th className="px-1.5 py-1.5 text-left font-medium">Rent $/SF (asset / market)</th><th className="px-1.5 py-1.5 text-left font-medium">Rent growth %/yr</th><th className="px-1.5 py-1.5 text-left font-medium">Vacancy %</th><th className="px-1.5 py-1.5 text-left font-medium">Exit cap / market cap</th></tr></thead>
          <tbody>{deals.map((d) => {
            const v = assetVsMarket(d.inputs, market);
            const cell = (key, unit) => { const r = v?.rows.find((x) => x.key === key); if (!r) return "—"; return <span>{fmt(r.asset, unit)} / {fmt(r.market, unit)}{r.diff != null ? <span className={`ml-1 text-[10px] ${Math.abs(r.diff) < 1e-9 ? "text-gray-400" : "text-gray-500"}`}>({r.diff >= 0 ? "+" : ""}{unit === "psf" ? `$${r.diff.toFixed(2)}` : `${r.diff.toFixed(2)}`})</span> : null}</span>; };
            return (
              <tr key={d.id} className="border-t border-gray-100" data-testid="market-asset-row">
                <td className="px-1.5 py-1 font-medium">{d.inputs.propertyName}<span className="block text-[10px] text-gray-400">{d.inputs.city}{d.inputs.state ? `, ${d.inputs.state}` : ""}</span></td>
                <td className="px-1.5 py-1"><select aria-label={`Submarket for ${d.inputs.propertyName}`} value={d.inputs.submarketId ?? ""} disabled={!canEdit} onChange={(e) => onUpdateDeal(d.id, (c) => ({ ...c, submarketId: e.target.value || null }))} className={inp}><option value="">—</option>{market.submarkets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                <td className="px-1.5 py-1">{cell("rent", "psf")}</td><td className="px-1.5 py-1">{cell("growth", "pct")}</td><td className="px-1.5 py-1">{cell("vacancy", "pct")}</td><td className="px-1.5 py-1">{cell("exitCap", "pct")}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <p className="text-[11px] text-gray-400">Market figures: the submarket&apos;s latest quarter; rent growth is the asking-rent trend over the last four quarters (small-bay when given). Asset figures are the model inputs.</p>
      </section>
    </div>
  );
}
