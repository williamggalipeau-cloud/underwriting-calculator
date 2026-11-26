"use client";

// Reports → Quarterly report → Report on: one asset (user, 11/24). The asset's
// quarterly performance report for investors: shareable or internal, an
// editable letter, PDF and Excel, issued versions frozen (kept with the fund's
// reports, tagged with the asset).
import { useState } from "react";
import { assetReportXlsx, draftAssetLetter } from "@/lib/assetReport";
import { issueReport } from "@/lib/quarterlyReport";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";
import { assetFileLinks, imageDataUrl, isSamplePath } from "@/lib/assetPhotos";

const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40";
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`);
const x2 = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}x`);
const fmtM = (v) => (v == null || !isFinite(v) ? "—" : Math.abs(v) >= 1e6 ? `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toFixed(2)}M` : `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const MS = { done: "text-emerald-700", late: "text-red-700", due: "text-amber-700", open: "text-gray-600" };

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-gray-900">{value}</div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </div>
  );
}

export default function AssetReportPanel({ r, fundName, store, canEdit, email, onFundTermsChange }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const k = r.kind;
  const dk = `${r.quarter}:${r.assetId}`;
  const draft = store.drafts?.[dk] ?? {};
  const letter = draft.letter ?? draftAssetLetter(r);
  const notes = draft.notes ?? "";
  const saveDraft = (patch) => canEdit && onFundTermsChange(fundName, { reports: { ...store, drafts: { ...(store.drafts ?? {}), [dk]: { letter, notes, ...patch } } } });
  // Every issued report, for viewers too (1.1.8: Internal only; earlier shareable copies are kept, marked retired).
  const issued = (store.issued ?? []).filter((x) => x.quarter === r.quarter && x.assetId === r.assetId);
  const base = `${safeFileName(r.asset.name)}-${r.quarter}-${k}-asset-report`;
  const pdf = async (rep, opts, name) => {
    setBusy(true);
    try {
      let cover = null;
      if (rep.asset.cover && (email || isSamplePath(rep.asset.cover))) {
        try { const links = await assetFileLinks([rep.asset.cover]); if (links[rep.asset.cover]) cover = await imageDataUrl(links[rep.asset.cover], { maxW: 900 }); } catch { /* no photo */ }
      }
      const { assetReportPdf } = await import("@/lib/assetReportPdf");
      downloadBlob(await assetReportPdf(rep, { ...opts, cover }), name);
    } catch (e) { setMsg({ ok: false, text: `Couldn't make the PDF: ${e.message}` }); } finally { setBusy(false); }
  };
  const issue = () => {
    if (!canEdit) return;
    if (!window.confirm(`Issue the ${k} ${r.quarterLabel} report for ${r.asset.name}? Its figures are frozen as they are now (with you and today's date). Nothing is sent: download it and upload it to the investor portal.`)) return;
    onFundTermsChange(fundName, { reports: issueReport(store, r, { letter, notes, by: email ?? "" }) });
    setMsg({ ok: true, text: `Issued the ${k} ${r.quarterLabel} report for ${r.asset.name}.` });
  };
  const v = r.value, o = r.operations;
  return (
    <div className="space-y-4" data-testid="asset-report">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-gray-900">{r.asset.name} <span className="text-sm font-normal text-gray-500">· {r.quarterLabel} · {r.fund.name}</span></h3>
          <p className="text-xs text-gray-500">{[r.asset.address, r.asset.city].filter(Boolean).join(", ")} · {Math.round(r.asset.sf).toLocaleString("en-US")} SF · acquired {usDate(r.asset.acq)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => pdf(r, { letter, notes }, `${base}-draft.pdf`)}>{busy ? "Making PDF…" : "PDF (draft)"}</button>
          <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => downloadBlob(writeXlsx(assetReportXlsx(r, { letter, notes }), { sheetName: "Asset report", title: `Baywise · ${r.asset.name} ${r.quarterLabel} report` }), `${base}.xlsx`)}>Excel</button>
          {canEdit && <button type="button" onClick={issue} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Issue report</button>}
        </div>
      </div>
      {msg && <p className={`rounded-lg border px-3 py-2 text-xs ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} data-testid="report-msg">{msg.text}</p>}
      {k === "internal" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Internal version: adds underwritten vs. actual, budget variances and internal notes. Not for distribution.</p>}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="asset-report-stats">
        <Stat label="Value" value={fmtM(v.end)} sub={`${v.basis}${v.impliedCap != null ? ` · ${pct(v.impliedCap)} cap` : ""}`} />
        <Stat label="Change in quarter" value={v.change != null ? fmtM(v.change) : "—"} sub={v.changePct != null ? pct(v.changePct) : "first quarter"} />
        <Stat label="Unrealized gain" value={fmtM(v.unrealized)} sub={`cost ${fmtM(v.cost)}`} />
        <Stat label="Equity IRR to date" value={r.returns.irr != null ? pct(r.returns.irr) : "n/m"} sub="at the mark" />
        <Stat label="Equity multiple" value={x2(r.returns.tvpi)} />
        <Stat label="Occupancy" value={pct(o.occupancy)} sub={o.occupancyTarget != null ? `plan ${pct(o.occupancyTarget)}` : ""} />
      </div>
      {r.returns.note && <p className="text-xs text-amber-800">Returns: {r.returns.note}.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="text-xs">
          <div className="flex items-center justify-between font-semibold text-gray-700">
            <span>Letter</span>
            {canEdit && <button type="button" onClick={() => window.confirm("Replace the letter with a fresh draft from the figures?") && saveDraft({ letter: draftAssetLetter(r) })} className="font-normal text-blue-700 hover:underline">Redraft from the figures</button>}
          </div>
          <textarea aria-label="Letter" disabled={!canEdit} value={letter} onChange={(e) => saveDraft({ letter: e.target.value })} rows={14} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs leading-relaxed" />
          {k === "internal" && (
            <label className="mt-2 block">
              <span className="font-semibold text-gray-700">Internal notes (internal version only)</span>
              <textarea aria-label="Internal notes" disabled={!canEdit} value={notes} onChange={(e) => saveDraft({ notes: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs" />
            </label>
          )}
        </div>
        <div className="space-y-3 text-xs">
          <table className="w-full tabular-nums rounded-xl border border-gray-200" data-testid="asset-report-ops">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-2.5 py-1.5 text-left font-medium">Operations</th><th className="px-2.5 py-1.5 text-right font-medium">Actual</th><th className="px-2.5 py-1.5 text-right font-medium">Plan</th></tr></thead>
            <tbody>
              <tr className="border-t border-gray-100"><td className="px-2.5 py-1">Occupancy</td><td className="px-2.5 py-1 text-right">{pct(o.occupancy)}</td><td className="px-2.5 py-1 text-right text-gray-500">{pct(o.occupancyTarget)}</td></tr>
              <tr className="border-t border-gray-100"><td className="px-2.5 py-1">Average rent ($/SF)</td><td className="px-2.5 py-1 text-right">{o.rentPSF != null ? o.rentPSF.toFixed(2) : "—"}</td><td className="px-2.5 py-1 text-right text-gray-500">{o.rentTarget != null ? o.rentTarget.toFixed(2) : "—"}</td></tr>
              <tr className="border-t border-gray-100"><td className="px-2.5 py-1">WALT (years)</td><td className="px-2.5 py-1 text-right">{o.walt != null ? o.walt.toFixed(1) : "—"}</td><td className="px-2.5 py-1 text-right text-gray-500">{o.waltTarget != null ? o.waltTarget.toFixed(1) : "—"}</td></tr>
              <tr className="border-t border-gray-100"><td className="px-2.5 py-1">NOI year to date</td><td className="px-2.5 py-1 text-right">{o.noiYtd ? fmtM(o.noiYtd.actual) : "no actuals"}</td><td className="px-2.5 py-1 text-right text-gray-500">{o.noiYtd ? `${fmtM(o.noiYtd.plan)} (${pct(o.noiYtd.vsPlanPct)})` : "—"}</td></tr>
              <tr className="border-t border-gray-100"><td className="px-2.5 py-1">Leases expiring in 12 months</td><td className="px-2.5 py-1 text-right">{o.expiring.length} · {Math.round(o.expiringSF).toLocaleString("en-US")} SF</td><td className="px-2.5 py-1 text-right text-gray-500">{o.prospects} prospects</td></tr>
              <tr className="border-t border-gray-100"><td className="px-2.5 py-1">Debt</td><td className="px-2.5 py-1 text-right">{fmtM(r.debt.loan)}{r.debt.ltv != null ? ` · ${pct(r.debt.ltv)} LTV` : ""}</td><td className="px-2.5 py-1 text-right text-gray-500">matures {usDate(r.debt.maturity)}</td></tr>
            </tbody>
          </table>
          {r.benchmark && <p className="rounded-lg border border-gray-200 px-3 py-2" data-testid="asset-report-bench">Benchmark since {r.benchmark.since}: asset {pct(r.benchmark.total)} a year vs. {r.benchmark.benchLabel} {pct(r.benchmark.bench)}{r.benchmark.spread != null ? ` (${r.benchmark.spread >= 0 ? "+" : ""}${r.benchmark.spread.toFixed(1)} pts)` : ""}.</p>}
          {r.plan && (
            <div className="rounded-xl border border-gray-200 p-2" data-testid="asset-report-plan">
              <p className="mb-1 font-semibold text-gray-700">Business plan · revision {r.plan.revision}{r.plan.recommendation ? ` · ${r.plan.recommendation}` : ""}</p>
              <ul className="space-y-0.5">{r.plan.milestones.slice(0, 8).map((m, i) => <li key={i} className="flex justify-between gap-2"><span>{m.label}</span><span className={`whitespace-nowrap ${MS[m.status] ?? ""}`}>{usDate(m.due)} · {m.status}</span></li>)}</ul>
            </div>
          )}
          {k === "internal" && r.internal && <p className="text-gray-600" data-testid="asset-internal-summary">{r.internal.uw ? `Underwritten IRR ${pct(r.internal.uw.uwIrr)} vs. ${pct(r.internal.uw.irr)} now` : "No frozen underwriting baseline"} · {r.internal.budget.length} flagged budget variance{r.internal.budget.length === 1 ? "" : "s"}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-3 text-xs" data-testid="report-issued">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Issued · {r.asset.name} · {r.quarterLabel}</h3>
        {issued.length === 0 ? <p className="text-gray-400">Nothing issued for this asset and quarter yet.</p> : (
          <ul className="space-y-1.5">{issued.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-2 py-1.5" data-testid="issued-report">
              <span><span className="font-semibold">v{x.v} · {x.kind === "shareable" ? "Shareable (retired)" : "Internal"}</span> <span className="text-gray-500">· issued {usDate(String(x.at).slice(0, 10))}{x.by ? ` by ${x.by}` : ""} · value {fmtM(x.report.value.end)}</span></span>
              <button type="button" disabled={busy} className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => pdf(x.report, { letter: x.letter, notes: x.notes, issued: x }, `${safeFileName(x.assetName || r.asset.name)}-${x.quarter}-${x.kind}-asset-report-v${x.v}.pdf`)}>PDF</button>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}
