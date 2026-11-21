"use client";

import { useMemo, useRef, useState } from "react";
import {
  COMP_FIELDS,
  adjustedPSF,
  compStats,
  compsFromGrid,
  compsTemplateXlsx,
  detectMapping,
  exampleComps,
  filterComps,
  gridFromFile,
  makeComp,
} from "@/lib/comps";
import { downloadBlob } from "@/lib/fundTerms";

export const DEFAULT_COMPS_STATE = {
  comps: [],
  marketGrowthPct: 3, // annual time adjustment for $/SF
  spreadBp: 25, // exit cap = comps median + spread
  filters: { sinceISO: "", minSF: "", maxSF: "", type: "" },
};

const fmt = (n, d = 0) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n) => (n == null || !isFinite(n) ? "—" : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${fmt(n)}`);
const fmtPSF = (n) => (n == null || !isFinite(n) ? "—" : `$${fmt(n, 0)}`);
const fmtPct = (n, d = 2) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(d)}%`);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function NumInput({ value, onChange, className = "", ...rest }) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className={`rounded-md border border-gray-300 px-2 py-1 text-xs tabular-nums ${className}`}
      {...rest}
    />
  );
}

// ── Import: pick a file, review the column mapping, then add or replace ──
function ImportPanel({ onImport, onClose }) {
  const [state, setState] = useState(null); // { grid, info, fileName }
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  async function handleFile(file) {
    setError("");
    try {
      const grid = await gridFromFile(file);
      const info = detectMapping(grid);
      setState({ grid, info, fileName: file.name });
    } catch (e) {
      setError(e.message || String(e));
      setState(null);
    }
  }

  let preview = null;
  let previewError = "";
  if (state) {
    try {
      preview = compsFromGrid(state.grid, state.info);
    } catch (e) {
      previewError = e.message;
    }
  }
  const dataRows = state ? state.grid.slice(state.info.headerRow + 1).filter((r) => r?.some((v) => String(v ?? "").trim())).length : 0;

  function setMap(key, idx) {
    setState((s) => {
      const mapping = { ...s.info.mapping };
      if (idx === "") delete mapping[key];
      else mapping[key] = Number(idx);
      return { ...s, info: { ...s.info, mapping } };
    });
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-800">Import sales comps</h4>
        <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:text-gray-800">Close</button>
      </div>
      <p className="text-xs text-gray-600">
        Upload an Excel (.xlsx) or CSV export. <span className="font-medium">From CoStar:</span> run a Sale Comps search, select the comps,
        choose Export → Excel, and include Sale Price, Sale Date, RBA, Price/SF and Actual Cap Rate. Crexi, LoopNet, RCA and broker
        spreadsheets work too. Columns are matched by name, and you can change the match below. The file stays in your browser.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
          Choose file…
        </button>
        <button
          type="button"
          onClick={async () => downloadBlob(await compsTemplateXlsx(), "sales-comps-template.xlsx")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Download blank template
        </button>
        {state && <span className="text-xs text-gray-500">{state.fileName}</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {state && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {COMP_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-600">{f.label}</span>
                <select
                  value={state.info.mapping[f.key] ?? ""}
                  onChange={(e) => setMap(f.key, e.target.value)}
                  className={`w-44 rounded-md border px-1.5 py-1 text-xs ${state.info.mapping[f.key] != null ? "border-blue-300 bg-white" : "border-gray-200 bg-gray-50 text-gray-400"}`}
                >
                  <option value="">— not in file —</option>
                  {state.info.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {previewError ? (
            <p className="text-xs text-red-600">{previewError}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-gray-600">
                {preview.length} of {dataRows} rows are sales with a price, $/SF or cap rate
                {dataRows > preview.length && ` (${dataRows - preview.length} skipped, e.g. price not disclosed)`}.
              </p>
              <button type="button" onClick={() => onImport(preview, "append")} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                Add {preview.length} comps
              </button>
              <button type="button" onClick={() => onImport(preview, "replace")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Replace current comps
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const BLANK = { name: "", saleDate: "", price: "", sf: "", capRate: "", propertyType: "" };

function ManualAdd({ onAdd }) {
  const [row, setRow] = useState(BLANK);
  const set = (k) => (e) => setRow((r) => ({ ...r, [k]: e.target.value }));
  const ok = row.name.trim() && (row.price || row.capRate);
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onAdd(makeComp(row));
        setRow(BLANK);
      }}
    >
      {[
        ["name", "Property / address", "text", "w-44"],
        ["saleDate", "Sale date", "date", "w-36"],
        ["price", "Sale price ($)", "number", "w-28"],
        ["sf", "Building SF", "number", "w-24"],
        ["capRate", "Cap rate (%)", "number", "w-20"],
        ["propertyType", "Type", "text", "w-28"],
      ].map(([k, label, type, w]) => (
        <label key={k} className="flex flex-col gap-0.5">
          <span className="text-gray-500">{label}</span>
          <input type={type} step="any" value={row[k]} onChange={set(k)} className={`rounded-md border border-gray-300 px-2 py-1 ${w}`} />
        </label>
      ))}
      <button type="submit" disabled={!ok} className="rounded-lg bg-gray-800 px-3 py-1.5 font-semibold text-white disabled:opacity-40">
        Add comp
      </button>
    </form>
  );
}

export default function SalesComps({ state, onChange, subject, onSetExitCap }) {
  const s = { ...DEFAULT_COMPS_STATE, ...state, filters: { ...DEFAULT_COMPS_STATE.filters, ...(state?.filters ?? {}) } };
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [sort, setSort] = useState({ key: "saleDate", dir: -1 });
  const update = (patch) => onChange({ ...s, ...patch });
  const setComps = (comps) => update({ comps });
  const setFilter = (k, v) => update({ filters: { ...s.filters, [k]: v } });

  const asOfISO = subject.acquisitionDate || new Date().toISOString().slice(0, 10);
  const adjOpts = { asOfISO, marketGrowthPct: Number(s.marketGrowthPct) || 0 };
  const filtered = useMemo(
    () =>
      filterComps(s.comps, {
        sinceISO: s.filters.sinceISO,
        minSF: Number(s.filters.minSF) || 0,
        maxSF: Number(s.filters.maxSF) || 0,
        type: s.filters.type,
      }),
    [s.comps, s.filters]
  );
  const stats = compStats(filtered, adjOpts);
  const hiddenCount = s.comps.length - filtered.length;

  const sorted = [...filtered].sort((a, b) => {
    const va = sort.key === "adjPSF" ? adjustedPSF(a, adjOpts) : a[sort.key];
    const vb = sort.key === "adjPSF" ? adjustedPSF(b, adjOpts) : b[sort.key];
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });

  const patchComp = (id, patch) => setComps(s.comps.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const hasExamples = s.comps.some((c) => c.example);

  // Subject comparison
  const subjPSF = subject.sf > 0 ? subject.price / subject.sf : null;
  const subjCap = subject.price > 0 ? (subject.noi1 / subject.price) * 100 : null;
  const medPSF = stats.adjPSF?.median;
  const medCap = stats.cap?.median;
  const valueAtPSF = medPSF && subject.sf ? medPSF * subject.sf : null;
  const valueAtCap = medCap ? subject.noi1 / (medCap / 100) : null;
  const exitPSF = subject.sf > 0 ? subject.exitValue / subject.sf : null;
  const suggestedExitCap = medCap != null ? medCap + (Number(s.spreadBp) || 0) / 100 : null;
  const exitAtSuggested = suggestedExitCap ? subject.exitNOI / (suggestedExitCap / 100) : null;

  const th = (key, label, align = "right") => (
    <th
      onClick={() => setSort((p) => ({ key, dir: p.key === key ? -p.dir : -1 }))}
      className={`cursor-pointer select-none px-2.5 py-2 font-medium text-gray-500 hover:text-gray-800 text-${align}`}
    >
      {label}
      {sort.key === key ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sales Comps</h2>
          <p className="text-xs text-gray-500">
            Recent sales to check your purchase price, going-in cap and exit cap for {subject.name || "this deal"}. Upload a CoStar or
            other export, or add comps by hand.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowImport((v) => !v)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            Import Excel / CSV
          </button>
          <button type="button" onClick={() => setShowAdd((v) => !v)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Add comp
          </button>
          {s.comps.length > 0 && (
            <button
              type="button"
              onClick={async () => downloadBlob(await compsTemplateXlsx(s.comps), `${(subject.name || "deal").replace(/[^\w-]+/g, "-")}-sales-comps.xlsx`)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Export comps
            </button>
          )}
          {s.comps.length > 0 && (
            <button
              type="button"
              onClick={() => window.confirm(`Remove all ${s.comps.length} comps?`) && setComps([])}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {showImport && (
        <ImportPanel
          onClose={() => setShowImport(false)}
          onImport={(rows, mode) => {
            const base = mode === "replace" ? [] : s.comps.filter((c) => !c.example);
            setComps([...base, ...rows]);
            setShowImport(false);
          }}
        />
      )}
      {showAdd && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <ManualAdd onAdd={(c) => setComps([...s.comps, c])} />
        </div>
      )}

      {s.comps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-600">No comps yet.</p>
          <p className="mt-1 text-xs text-gray-400">Import an export from CoStar, Crexi or a broker, or add comps by hand.</p>
          <button type="button" onClick={() => setComps(exampleComps())} className="mt-3 text-xs font-medium text-blue-600 hover:underline">
            Load example comps to try the tab
          </button>
        </div>
      ) : (
        <>
          {hasExamples && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              These are made-up example comps, not real sales. Importing a file replaces them.
            </p>
          )}

          {/* Filters & adjustments */}
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs">
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Sold on or after</span>
              <input type="date" value={s.filters.sinceISO} onChange={(e) => setFilter("sinceISO", e.target.value)} className="rounded-md border border-gray-300 px-2 py-1" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Min SF</span>
              <NumInput value={s.filters.minSF} onChange={(v) => setFilter("minSF", v)} className="w-24" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Max SF</span>
              <NumInput value={s.filters.maxSF} onChange={(v) => setFilter("maxSF", v)} className="w-24" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Type / market contains</span>
              <input value={s.filters.type} onChange={(e) => setFilter("type", e.target.value)} className="w-36 rounded-md border border-gray-300 px-2 py-1" />
            </label>
            <span className="h-8 w-px bg-gray-300" />
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Market growth / yr (time adj.)</span>
              <NumInput value={s.marketGrowthPct} step="0.5" onChange={(v) => update({ marketGrowthPct: v })} className="w-24" />
            </label>
            <p className="text-gray-400 max-w-xs">
              $/SF is moved from each sale date to {fmtDate(asOfISO)}{" "}(your acquisition date) at this rate, then each comp&apos;s own adjustment is applied.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Comps used" value={`${stats.used}`} sub={hiddenCount ? `${hiddenCount} hidden by filters` : `of ${s.comps.length}`} />
            <Stat
              label="Adjusted $/SF (median)"
              value={fmtPSF(stats.adjPSF?.median)}
              sub={stats.adjPSF ? `Avg ${fmtPSF(stats.adjPSF.mean)} · range ${fmtPSF(stats.adjPSF.min)}–${fmtPSF(stats.adjPSF.max)}` : "No $/SF data"}
            />
            <Stat
              label="Cap rate (median)"
              value={fmtPct(stats.cap?.median)}
              sub={stats.cap ? `Avg ${fmtPct(stats.cap.mean)} · range ${fmtPct(stats.cap.min)}–${fmtPct(stats.cap.max)} · ${stats.cap.n} with cap` : "No cap rate data"}
            />
            <Stat label="Size (median)" value={stats.size ? `${fmt(stats.size.median)} SF` : "—"} sub={stats.size ? `${fmt(stats.size.min)}–${fmt(stats.size.max)} SF` : ""} />
          </div>

          {/* Subject comparison */}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <h4 className="mb-2 text-xs font-semibold text-gray-700">Your deal vs. the comps</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="px-2.5 py-1.5 text-left font-medium"></th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Your deal</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Comps median</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Difference</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Value implied by comps</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-2.5 py-1.5 text-gray-700">Purchase price / SF</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPSF(subjPSF)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPSF(medPSF)}</td>
                    <td className={`px-2.5 py-1.5 text-right ${subjPSF > medPSF ? "text-red-500" : "text-green-600"}`}>
                      {subjPSF && medPSF ? `${subjPSF > medPSF ? "+" : ""}${(((subjPSF - medPSF) / medPSF) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      {fmtM(valueAtPSF)} {valueAtPSF && <span className="text-gray-400">vs {fmtM(subject.price)} price</span>}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-2.5 py-1.5 text-gray-700">Going-in cap (yr-1 NOI ÷ price)</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPct(subjCap)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPct(medCap)}</td>
                    <td className={`px-2.5 py-1.5 text-right ${subjCap < medCap ? "text-red-500" : "text-green-600"}`}>
                      {subjCap != null && medCap != null ? `${subjCap >= medCap ? "+" : ""}${Math.round((subjCap - medCap) * 100)} bp` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      {fmtM(valueAtCap)} {valueAtCap && <span className="text-gray-400">at {fmtPct(medCap)} cap</span>}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2.5 py-1.5 text-gray-700">Exit cap (year {subject.holdYears})</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPct(subject.exitCap)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPct(medCap)}</td>
                    <td className={`px-2.5 py-1.5 text-right ${subject.exitCap < medCap ? "text-red-500" : "text-green-600"}`}>
                      {medCap != null ? `${subject.exitCap >= medCap ? "+" : ""}${Math.round((subject.exitCap - medCap) * 100)} bp` : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right">
                      {fmtM(subject.exitValue)} exit <span className="text-gray-400">= {fmtPSF(exitPSF)}/SF</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {subject.exitCap < (medCap ?? -1) && (
              <p className="mt-2 text-[11px] text-red-600">
                Your exit cap is below where the comps traded. Exits are usually underwritten at or above today&apos;s cap rates.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs">
              <span className="text-gray-600">Set exit cap to comps median +</span>
              <NumInput value={s.spreadBp} step="5" onChange={(v) => update({ spreadBp: v })} className="w-16" />
              <span className="text-gray-600">bp =</span>
              <span className="font-semibold text-gray-900">{fmtPct(suggestedExitCap)}</span>
              {exitAtSuggested && <span className="text-gray-400">(exit value {fmtM(exitAtSuggested)})</span>}
              <button
                type="button"
                disabled={suggestedExitCap == null}
                onClick={() => onSetExitCap(Math.round(suggestedExitCap * 100) / 100)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Apply to deal
              </button>
            </div>
          </div>

          {/* Comps table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2.5 py-2 text-center font-medium text-gray-500">Use</th>
                  {th("name", "Property", "left")}
                  {th("saleDate", "Sale date")}
                  {th("price", "Price")}
                  {th("sf", "SF")}
                  {th("pricePSF", "$/SF")}
                  {th("capRate", "Cap")}
                  {th("yearBuilt", "Built")}
                  {th("clearHeight", "Clear ht")}
                  <th className="px-2.5 py-2 text-right font-medium text-gray-500">Adj. %</th>
                  {th("adjPSF", "Adj. $/SF")}
                  <th className="px-2.5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className={`border-t border-gray-100 ${c.include ? "" : "opacity-40"}`}>
                    <td className="px-2.5 py-1.5 text-center">
                      <input type="checkbox" checked={c.include} onChange={(e) => patchComp(c.id, { include: e.target.checked })} aria-label={`Use ${c.name}`} />
                    </td>
                    <td className="px-2.5 py-1.5 text-left">
                      <div className="font-medium text-gray-800">{c.name || "—"}</div>
                      <div className="text-[10px] text-gray-400">
                        {[c.city, c.state].filter(Boolean).join(", ")}
                        {c.submarket && ` · ${c.submarket}`}
                        {c.propertyType && ` · ${c.propertyType}`}
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right">{fmtDate(c.saleDate)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtM(c.price)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmt(c.sf)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPSF(c.pricePSF)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtPct(c.capRate)}</td>
                    <td className="px-2.5 py-1.5 text-right">{c.yearBuilt ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-right">{c.clearHeight ? `${c.clearHeight}'` : "—"}</td>
                    <td className="px-2.5 py-1.5 text-right">
                      <NumInput value={c.adjPct ?? 0} step="1" onChange={(v) => patchComp(c.id, { adjPct: v === "" ? 0 : v })} className="w-14 text-right" aria-label={`Adjustment for ${c.name}`} />
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold text-gray-900">{fmtPSF(adjustedPSF(c, adjOpts))}</td>
                    <td className="px-2.5 py-1.5 text-right">
                      <button type="button" onClick={() => setComps(s.comps.filter((x) => x.id !== c.id))} className="text-gray-400 hover:text-red-600" aria-label={`Remove ${c.name}`}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">
            Adj. % covers differences such as location, age, clear height or lease term (+ if the subject is better). Click a column to sort.
          </p>
        </>
      )}
    </div>
  );
}
