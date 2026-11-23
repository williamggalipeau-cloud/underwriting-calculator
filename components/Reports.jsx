"use client";

// Phase L: Reports tab (Library). The quarterly performance report in a
// shareable and an internal version, with an editable letter; issued
// versions keep their figures frozen. PDF and Excel. The app never sends
// anything: download and upload to the investor portal.
import { useMemo, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { fundOptionLabel } from "@/lib/fundTypes";
import { lastCompletedQuarterEnd, quarterLabel } from "@/lib/valuations";
import { writeXlsx } from "@/lib/xlsx";
import { REPORT_KINDS, buildQuarterlyReport, draftLetter, issueReport, reportXlsx } from "@/lib/quarterlyReport";
import { assetFileLinks, imageDataUrl, isSamplePath } from "@/lib/assetPhotos";
import FundTypeBadge from "@/components/FundTypeBadge";
import FundLimits from "@/components/FundLimits";
import RiskReport from "@/components/RiskReport";

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`;
  return n < 0 ? `(${s})` : s;
};
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`);
const x2 = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}x`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const prevQ = (q) => { const d = new Date(`${q}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 0)).toISOString().slice(0, 10); };

async function coverImages(r, signedIn) {
  const items = r.portfolio.filter((x) => x.cover && (signedIn || isSamplePath(x.cover)));
  if (!items.length) return {};
  let links = {};
  try { links = await assetFileLinks(items.map((x) => x.cover)); } catch { return {}; }
  const out = {};
  for (const x of items) {
    if (!links[x.cover]) continue;
    try { out[x.id] = await imageDataUrl(links[x.cover], { maxW: 900 }); } catch { /* left out */ }
  }
  return out;
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

export default function Reports({ deals, funds = {}, marks = {}, curve, canEdit, email, onFundTermsChange, onApplyDeal, pipeline = [] }) {
  const [view, setView] = useState("quarterly");
  const fundNames = useMemo(() => [...new Set(deals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))], [deals]);
  const [fundPick, setFundPick] = useState(null);
  const fundName = fundNames.includes(fundPick) ? fundPick : fundNames[0];
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fundName), [deals, fundName]);
  const terms = useMemo(() => ({ ...DEFAULT_FUND_TERMS, ...(funds[fundName] ?? {}), name: fundName }), [funds, fundName]);
  const t0 = new Date().toISOString().slice(0, 10);
  const lastQ = lastCompletedQuarterEnd(t0);
  const qs = useMemo(() => { const o = []; let q = lastQ; for (let i = 0; i < 6; i++) { o.push(q); q = prevQ(q); } return o; }, [lastQ]);
  const [qPick, setQPick] = useState(null);
  const qEnd = qs.includes(qPick) ? qPick : lastQ;
  const [kind, setKind] = useState("shareable");
  const k = canEdit ? kind : "shareable"; // viewers see the shareable version only
  const report = useMemo(() => (fundName ? buildQuarterlyReport(fundDeals, terms, marks, { qEnd, todayISO: t0, curve, kind: k }) : null), [fundName, fundDeals, terms, marks, qEnd, t0, curve, k]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  if (!fundName || !report) return <p className="text-sm text-gray-500">Put deals in a fund (Fund field) to report on it here.</p>;

  const store = terms.reports ?? {};
  const dk = report.quarter;
  const draft = store.drafts?.[dk] ?? {};
  const letter = draft.letter ?? draftLetter(report);
  const notes = draft.notes ?? "";
  const saveDraft = (patch) => canEdit && onFundTermsChange(fundName, { reports: { ...store, drafts: { ...(store.drafts ?? {}), [dk]: { letter, notes, ...patch } } } });
  const issued = (store.issued ?? []).filter((x) => x.quarter === dk && (canEdit || x.kind === "shareable"));
  const base = `${safeFileName(fundName)}-${dk}-${k}-report`;

  async function pdf(r, opts, name) {
    setBusy(true);
    try {
      const covers = await coverImages(r, !!email);
      const { quarterlyReportPdf } = await import("@/lib/quarterlyReportPdf");
      downloadBlob(await quarterlyReportPdf(r, { ...opts, covers }), name);
    } catch (e) {
      setMsg({ ok: false, text: `Couldn't make the PDF: ${e.message}` });
    } finally {
      setBusy(false);
    }
  }
  const issue = () => {
    if (!canEdit) return;
    if (!window.confirm(`Issue the ${k} ${report.quarterLabel} report? Its figures are frozen as they are now (with you and today's date); later changes don't alter it. Nothing is sent: download it and upload it to the investor portal.`)) return;
    onFundTermsChange(fundName, { reports: issueReport(store, report, { letter, notes, by: email ?? "" }) });
    setMsg({ ok: true, text: `Issued the ${k} ${report.quarterLabel} report.` });
  };

  const r = report;
  return (
    <section className="space-y-4" data-testid="reports">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            Reports <span className="text-sm font-normal text-gray-500">· {fundName}</span>
            <FundTypeBadge type={funds[fundName]?.type} />
          </h2>
          <p className="text-xs text-gray-500">Quarterly performance report from the app&apos;s figures. Issue it to freeze the figures; the app never sends anything.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fundNames.length > 1 && (
            <select aria-label="Fund" value={fundName} onChange={(e) => setFundPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {fundNames.map((n) => <option key={n} value={n}>{fundOptionLabel(n, funds)}</option>)}
            </select>
          )}
          <select aria-label="Quarter" value={qEnd} onChange={(e) => setQPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
            {qs.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
          </select>
          {canEdit && (
            <select aria-label="Version" value={k} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {REPORT_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          <button type="button" disabled={busy} className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => pdf(r, { letter, notes }, `${base}-draft.pdf`)}>{busy ? "Making PDF…" : "PDF (draft)"}</button>
          <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => downloadBlob(writeXlsx(reportXlsx(r, { letter, notes }), { sheetName: "Quarterly report", title: `Baywise · ${fundName} ${r.quarterLabel} report` }), `${base}.xlsx`)}>Excel</button>
          {canEdit && <button type="button" onClick={issue} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Issue report</button>}
        </div>
      </div>

      {canEdit && (
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs w-fit" role="tablist">
          {[["quarterly", "Quarterly report"], ["risk", "Risk report (internal)"]].map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 font-medium ${view === v ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      )}
      {view === "risk" && canEdit ? (
        <RiskReport
          fundName={fundName}
          terms={terms}
          deals={fundDeals.filter((d) => report.portfolio.some((x) => x.id === d.id))}
          values={Object.fromEntries(report.portfolio.map((x) => [x.id, x.value]))}
          asOf={report.qEnd}
          lineBalance={report.nav.lineBalance}
          curve={curve}
          planGap={report.plan ? { plan: report.plan.projected.find((x) => x.key === "netLpIrr")?.plan ?? null, current: report.plan.projected.find((x) => x.key === "netLpIrr")?.current ?? null } : null}
          email={email}
          canEdit={canEdit}
          onFundTermsChange={onFundTermsChange}
          onApplyDeal={onApplyDeal}
        />
      ) : (
      <>
      {msg && <p className={`rounded-lg border px-3 py-2 text-xs ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} data-testid="report-msg">{msg.text}</p>}
      {k === "internal" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="internal-banner">Internal version: adds underwritten vs. actual, budget variances and internal notes. Not for distribution.</p>}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="report-stats">
        <Stat label="Net LP IRR" value={r.returns.note ? "n/m" : pct(r.returns.netIrr)} />
        <Stat label="TVPI" value={x2(r.returns.tvpi)} />
        <Stat label="DPI" value={x2(r.returns.dpi)} />
        <Stat label="LP NAV" value={fmtM(r.nav.end)} />
        <Stat label="LP called" value={`${fmtM(r.capital.called)} (${pct(r.capital.pctCalled)})`} />
        <Stat label="Gross IRR" value={pct(r.returns.grossIrr)} />
      </div>
      {r.returns.note && <p className="text-xs text-amber-800">Net returns not yet meaningful: {r.returns.note}.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="text-xs">
          <div className="flex items-center justify-between font-semibold text-gray-700">
            <span>Letter</span>
            {canEdit && <button type="button" onClick={() => window.confirm("Replace the letter with a fresh draft from the figures?") && saveDraft({ letter: draftLetter(r) })} className="font-normal text-blue-700 hover:underline">Redraft from the figures</button>}
          </div>
          <textarea aria-label="Letter" disabled={!canEdit} value={letter} onChange={(e) => saveDraft({ letter: e.target.value })} rows={14} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs leading-relaxed" />
        </div>
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="report-portfolio">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500"><tr>{["Asset", "Value", "Occupancy", "NOI actual", "NOI plan"].map((h, i) => <th key={h} className={`px-2.5 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {r.portfolio.map((x) => (
                  <tr key={x.id} className="border-t border-gray-100"><td className="px-2.5 py-1.5">{x.name}</td><td className="px-2.5 py-1.5 text-right">{fmtM(x.value)}</td><td className="px-2.5 py-1.5 text-right">{pct(x.occupancy)}</td><td className="px-2.5 py-1.5 text-right">{x.noiActual != null ? fmtM(x.noiActual) : "—"}</td><td className="px-2.5 py-1.5 text-right">{fmtM(x.noiPlan)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {k === "internal" && (
            <label className="block text-xs">
              <span className="font-semibold text-gray-700">Internal notes (internal version only)</span>
              <textarea aria-label="Internal notes" disabled={!canEdit} value={notes} onChange={(e) => saveDraft({ notes: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs" />
            </label>
          )}
          {k === "internal" && r.internal && (
            <p className="text-xs text-gray-600" data-testid="internal-summary">{r.internal.uw.length} asset{r.internal.uw.length === 1 ? "" : "s"} with an underwriting baseline · {r.internal.budget.length} flagged budget variance{r.internal.budget.length === 1 ? "" : "s"}</p>
          )}
        </div>
      </div>

      {canEdit && (
        <FundLimits
          fundName={fundName}
          terms={terms}
          deals={fundDeals.filter((d) => r.portfolio.some((x) => x.id === d.id))}
          values={Object.fromEntries(r.portfolio.map((x) => [x.id, x.value]))}
          lineBalance={r.nav.lineBalance}
          pipeline={pipeline}
          canEdit={canEdit}
          onFundTermsChange={onFundTermsChange}
        />
      )}

      <div className="rounded-xl border border-gray-200 p-3 text-xs" data-testid="report-issued">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Issued · {r.quarterLabel}</h3>
        {issued.length === 0 ? (
          <p className="text-gray-400">Nothing issued for this quarter yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {issued.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-2 py-1.5" data-testid="issued-report">
                <span><span className="font-semibold">v{x.v} · {x.kind}</span> <span className="text-gray-500">· issued {usDate(String(x.at).slice(0, 10))}{x.by ? ` by ${x.by}` : ""} · NAV {fmtM(x.report.nav.end)}</span></span>
                <button type="button" disabled={busy} className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => pdf(x.report, { letter: x.letter, notes: x.notes, issued: x }, `${safeFileName(fundName)}-${x.quarter}-${x.kind}-report-v${x.v}.pdf`)}>PDF</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </>
      )}
    </section>
  );
}
