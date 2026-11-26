"use client";

// Phase L: fund limits, actual vs. limit (Reports tab). Limits come from the
// fund's LPA / PPM (applied on the Documents tab) and internal limits added
// here. A pre-acquisition check shows a pipeline deal's effect.
import { useMemo, useState } from "react";
import { LIMIT_KEYS } from "@/lib/dealDocTypes";
import { STATUS_STYLE, checkLimits, limitInputs, limitsXlsx, preAcquisition } from "@/lib/fundLimits";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const fmt = (v, unit) => (v == null || !isFinite(v) ? "—" : unit === "%" ? `${v.toFixed(1)}%` : unit === "years" ? `${v.toFixed(1)} yrs` : unit === "$" ? `$${Math.round(v).toLocaleString("en-US")}` : String(v));
const th = "px-2.5 py-2 font-medium";
const td = "px-2.5 py-1.5";

function Badge({ status }) {
  const s = STATUS_STYLE[status];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`} data-testid="limit-status">{s.label}</span>;
}

export default function FundLimits({ fundName, terms, deals, values, lineBalance, pipeline = [], canEdit, onFundTermsChange }) {
  const inputs = useMemo(() => limitInputs(deals, { values, lineBalance }), [deals, values, lineBalance]);
  const rows = useMemo(() => checkLimits(terms, inputs), [terms, inputs]);
  const [candId, setCandId] = useState("");
  const cand = pipeline.find((d) => d.id === candId) ?? null;
  const pre = useMemo(() => (cand ? preAcquisition(terms, deals, cand, { values, lineBalance }) : null), [cand, terms, deals, values, lineBalance]);
  const [nk, setNk] = useState("single_asset_pct");
  const [nv, setNv] = useState("");
  const internal = terms.internalLimits ?? [];
  const addInternal = () => {
    const unit = nk === "hold_years" ? "years" : "%";
    if (!(Number(nv) > 0)) return;
    const label = LIMIT_KEYS.find(([k]) => k === nk)?.[1] ?? nk;
    onFundTermsChange(fundName, { internalLimits: [...internal.filter((l) => l.key !== nk), { key: nk, label, limit: Number(nv), unit, basis: "internal" }] });
    setNv("");
  };
  const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {});

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-3" data-testid="fund-limits">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Fund limits · actual vs. limit</h3>
          <p className="text-xs text-gray-500">Limits from the LPA / PPM (apply them on the Documents tab) and internal limits. Near = at 90% of the limit or more.{rows.length ? ` ${counts.breached ?? 0} breached, ${counts.near ?? 0} near, ${counts.within ?? 0} within, ${counts.review ?? 0} to review.` : ""}</p>
        </div>
        {rows.length > 0 && <button type="button" onClick={() => downloadBlob(writeXlsx(limitsXlsx(fundName, rows), { sheetName: "Fund limits", title: `Baywise · ${fundName} fund limits` }), `${safeFileName(fundName)}-fund-limits.xlsx`)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">Excel</button>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500" data-testid="no-limits">No limits yet. Upload the fund&apos;s LPA or PPM on the Documents tab and use its investment limits, or add an internal limit below.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500">
              <tr>{["Limit", "Source", "Limit", "Actual", "Largest", "Headroom", "Status", ...(pre ? [`With ${cand.inputs.propertyName || "the deal"}`] : [])].map((h, i) => <th key={i} className={`${th} ${i >= 2 && i <= 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.key}`} className="border-t border-gray-100" data-testid="limit-row">
                  <td className={td}>{r.label}</td>
                  <td className={`${td} text-gray-500`} title={r.quote || undefined}>{r.source === "document" ? `LPA / PPM${r.clause ? ` §${r.clause}` : ""}` : "Internal"}{r.quote ? " ⓘ" : ""}</td>
                  <td className={`${td} text-right`}>{r.unit === "text" ? r.limit : fmt(r.limit, r.unit)}</td>
                  <td className={`${td} text-right font-semibold`}>{fmt(r.actual, r.unit)}</td>
                  <td className={`${td} text-gray-600`}>{r.what || "—"}</td>
                  <td className={`${td} text-right`}>{fmt(r.headroom, r.unit)}</td>
                  <td className={td}><Badge status={r.status} /></td>
                  {pre && <td className={td} data-testid="pre-status"><Badge status={pre[i].status} /> <span className="text-gray-500">{fmt(pre[i].actual, r.unit)}</span>{pre[i].newBreach && <span className="ml-1 font-semibold text-red-700">new breach</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-2 text-xs">
        {pipeline.length > 0 && (
          <label className="flex items-center gap-1.5">
            <span className="text-gray-600">Pre-acquisition check:</span>
            <select aria-label="Pipeline deal" value={candId} onChange={(e) => setCandId(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">
              <option value="">Choose a pipeline deal</option>
              {pipeline.map((d) => <option key={d.id} value={d.id}>{d.inputs.propertyName || d.id}</option>)}
            </select>
          </label>
        )}
        {canEdit && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-gray-600">Add an internal limit:</span>
            <select aria-label="Internal limit" value={nk} onChange={(e) => setNk(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">
              {LIMIT_KEYS.filter(([k]) => !["property_type", "non_core_pct", "other"].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input aria-label="Internal limit value" type="number" step="0.5" value={nv} onChange={(e) => setNv(e.target.value)} placeholder={nk === "hold_years" ? "years" : "%"} className="w-20 rounded border border-gray-300 px-1.5 py-1 text-right" />
            <button type="button" onClick={addInternal} className="rounded border border-blue-300 bg-white px-2 py-1 font-medium text-blue-700">Add</button>
            {internal.map((l) => (
              <button key={l.key} type="button" onClick={() => onFundTermsChange(fundName, { internalLimits: internal.filter((x) => x.key !== l.key) })} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 hover:bg-red-50 hover:text-red-700" title="Remove this internal limit">{l.label}: {l.limit}{l.unit === "%" ? "%" : ` ${l.unit}`} ×</button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
