"use client";

// A credit screening or assessment (1.1.8): on a prospect (Active Leasing,
// required before Signed) and as a new record on a tenant (Tenant Credit).
import { useState } from "react";
import { OWN_RATINGS, RESULTS, SCORE_TYPES, SCREEN_SOURCES, makeScreening, screeningMissing } from "@/lib/creditReview";

const inp = "rounded border border-gray-300 px-1.5 py-0.5 text-xs";

export default function CreditForm({ value = null, onSave, onCancel = null, saveLabel = "Save screening", canEdit = true }) {
  const [s, setS] = useState(() => makeScreening(value ?? {}));
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const miss = screeningMissing(s);
  const own = s.source === "own";
  return (
    <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/40 p-2 text-xs" data-testid="credit-form">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Screening source">
        {SCREEN_SOURCES.map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={s.source === k} disabled={!canEdit} onClick={() => set({ source: k })} className={`rounded-md border px-2 py-0.5 ${s.source === k ? "border-blue-500 bg-white font-semibold text-blue-700" : "border-gray-300 bg-white text-gray-700"}`}>{l}</button>
        ))}
      </div>
      {s.source && (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {!own && <label className="flex flex-col"><span className="text-[10px] text-gray-500">{s.source === "app" ? "Screening app (e.g. TurboTenant)" : "Credit agency (e.g. D&B, Experian Business)"}</span><input aria-label="Screening provider" value={s.provider} disabled={!canEdit} onChange={(e) => set({ provider: e.target.value })} className={inp} /></label>}
          {!own && <label className="flex flex-col"><span className="text-[10px] text-gray-500">Report date</span><input aria-label="Report date" type="date" value={s.reportDate} disabled={!canEdit} onChange={(e) => set({ reportDate: e.target.value })} className={inp} /></label>}
          {!own && <label className="flex flex-col"><span className="text-[10px] text-gray-500">Score type</span><select aria-label="Score type" value={s.scoreType} disabled={!canEdit} onChange={(e) => set({ scoreType: e.target.value })} className={inp}><option value="">No score</option>{SCORE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          {!own && s.scoreType && <label className="flex flex-col"><span className="text-[10px] text-gray-500">Score</span><input aria-label="Score" type="number" value={s.score ?? ""} disabled={!canEdit} onChange={(e) => set({ score: e.target.value === "" ? null : Number(e.target.value) })} className={inp} /></label>}
          {!own && <label className="flex flex-col"><span className="text-[10px] text-gray-500">Result</span><select aria-label="Screening result" value={s.result} disabled={!canEdit} onChange={(e) => set({ result: e.target.value })} className={inp}><option value="">Choose…</option>{RESULTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          {own && <label className="flex flex-col"><span className="text-[10px] text-gray-500">Our rating</span><select aria-label="Own rating" value={s.rating} disabled={!canEdit} onChange={(e) => set({ rating: e.target.value })} className={inp}><option value="">Choose…</option>{OWN_RATINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          {own && <label className="flex flex-col sm:col-span-2"><span className="text-[10px] text-gray-500">Basis (financials reviewed, references, bank statements…)</span><input aria-label="Assessment basis" value={s.basis} disabled={!canEdit} onChange={(e) => set({ basis: e.target.value })} className={inp} /></label>}
          <label className="flex flex-col sm:col-span-2"><span className="text-[10px] text-gray-500">Issues noted</span><input aria-label="Issues noted" value={s.issues} disabled={!canEdit} onChange={(e) => set({ issues: e.target.value })} className={inp} /></label>
          {!own && <label className="flex flex-col sm:col-span-2"><span className="text-[10px] text-gray-500">Conditions (guaranty, deposit…)</span><input aria-label="Conditions" value={s.conditions} disabled={!canEdit} onChange={(e) => set({ conditions: e.target.value })} className={inp} /></label>}
        </div>
      )}
      {miss.length > 0 && <p className="text-[11px] text-amber-800" data-testid="credit-missing">Still needed: {miss.join(", ")}.</p>}
      {canEdit && (
        <div className="flex gap-2">
          <button type="button" disabled={miss.length > 0} onClick={() => onSave(s)} className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white disabled:opacity-40">{saveLabel}</button>
          {onCancel && <button type="button" onClick={onCancel} className="rounded border border-gray-300 bg-white px-2 py-0.5">Cancel</button>}
        </div>
      )}
      {!own && <p className="text-[10px] text-gray-500">Attach the report PDF with the prospect&apos;s Documents (type &quot;Credit screening report&quot;).</p>}
    </div>
  );
}
