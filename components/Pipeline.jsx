"use client";

// Phase M: Pipeline tab (Acquisitions, first). Every deal being watched.
import { CONTRACT_DATES } from "@/lib/contractDates";
import { useMemo, useRef, useState } from "react";
import { gridFromFile } from "@/lib/comps";
import { downloadBlob } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";
import { DEFAULT_FUND_TERMS, safeFileName } from "@/lib/fundTerms";
import { RANKS, pipelineReport, pipelineReportPdf, pipelineReportXlsx } from "@/lib/pipelineReport";
import {
  ACTIVE_STAGES,
  PIPELINE_FIELDS,
  STAGE_PROBABILITY,
  STAGES,
  derived,
  detectPipelineMapping,
  filterPipeline,
  importPipeline,
  makePipelineDeal,
  pipelineXlsx,
  stageLabel,
  templateRows,
  totalsByStage,
} from "@/lib/pipeline";

// Purchase contract dates (11/24); the deal closing is Expected close.
const PURCHASE_DATES = CONTRACT_DATES.filter(([k]) => k !== "closingDate");

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`;
};
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const th = "px-2 py-1.5 font-medium";
const td = "px-2 py-1";
const inp = "w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:bg-transparent disabled:border-transparent";
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const STAGE_CLS = { watching: "bg-gray-100 text-gray-700", screening: "bg-sky-50 text-sky-800", loi: "bg-indigo-50 text-indigo-800", psa: "bg-amber-50 text-amber-800", closed: "bg-emerald-50 text-emerald-800", passed: "bg-red-50 text-red-700" };

function PipelineReport({ pipeline, deals, funds, curve, canEdit, email, onChange }) {
  const names = Object.keys(funds);
  const [fund, setFund] = useState(names[0] ?? "");
  const [rankBy, setRankBy] = useState("price");
  const [rep, setRep] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  if (!names.length) return null;
  const build = () => {
    const terms = { ...DEFAULT_FUND_TERMS, ...(funds[fund] ?? {}), name: fund };
    const r = pipelineReport(pipeline, deals, terms, { todayISO: today, curve, rankBy });
    setRep(r);
    return r;
  };
  const saved = (pipeline?.reports ?? []).filter((x) => x.fund === fund);
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-3 text-xs" data-testid="pipeline-report">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Pipeline report</h3>
        <select aria-label="Report fund" value={fund} onChange={(e) => { setFund(e.target.value); setRep(null); }} className="rounded border border-gray-300 px-1.5 py-1">{names.map((n) => <option key={n}>{n}</option>)}</select>
        <select aria-label="Rank top 10 by" value={rankBy} onChange={(e) => { setRankBy(e.target.value); setRep(null); }} className="rounded border border-gray-300 px-1.5 py-1">{RANKS.map(([k, l]) => <option key={k} value={k}>Top 10 by {l.toLowerCase()}</option>)}</select>
        <button type="button" onClick={build} className={`${btn} border-gray-300 bg-white text-gray-700`}>Preview</button>
        <button type="button" onClick={async () => { const r = rep ?? build(); downloadBlob(await pipelineReportPdf(r), `${safeFileName(fund)}-pipeline-report-${today}.pdf`); }} className={`${btn} border-gray-300 bg-white text-gray-700`}>PDF</button>
        <button type="button" onClick={() => { const r = rep ?? build(); downloadBlob(writeXlsx(pipelineReportXlsx(r), { sheetName: "Pipeline report", title: `Baywise · ${fund} pipeline report` }), `${safeFileName(fund)}-pipeline-report-${today}.xlsx`); }} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>
        {canEdit && <button type="button" onClick={() => { const r = rep ?? build(); onChange({ ...pipeline, reports: [...(pipeline?.reports ?? []), JSON.parse(JSON.stringify({ id: `pr-${Date.now().toString(36)}`, fund, at: new Date().toISOString(), by: email ?? "", rankBy, report: r }))] }); }} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Save dated version</button>}
      </div>
      {rep && (
        <div className="space-y-1" data-testid="pipeline-report-preview">
          <p>{rep.totals.count} active deals for {fund}: {fmtM(rep.totals.price)} ({fmtM(rep.totals.weightedPrice)} probability-weighted), {fmtM(rep.totals.equity)} of equity needed against {fmtM(rep.dryPowder)} of dry powder.{rep.closings.some((q) => q.enough === false) ? <span className="font-semibold text-red-700"> Not enough dry powder for every expected closing.</span> : ""}</p>
          {rep.combined && <p>Whole pipeline (screened deals): fund net LP IRR {rep.combined.without.returns.netLpIrr?.toFixed(1)}% → {rep.combined.with.returns.netLpIrr?.toFixed(1)}%{rep.combined.newBreaches.length ? <span className="font-semibold text-red-700"> · would breach {rep.combined.newBreaches.map((l) => l.label).join(", ")}</span> : ""}.</p>}
          <ol className="list-decimal pl-5">{rep.top.map((r) => <li key={r.id}>{r.summary}</li>)}</ol>
        </div>
      )}
      {saved.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="pipeline-report-versions">
          {saved.map((x) => <li key={x.id}><button type="button" onClick={async () => downloadBlob(await pipelineReportPdf(x.report), `${safeFileName(fund)}-pipeline-report-${x.at.slice(0, 10)}.pdf`)} className="rounded bg-gray-100 px-2 py-0.5 hover:bg-gray-200">{usDate(x.at.slice(0, 10))}{x.by ? ` · ${x.by}` : ""} · PDF</button></li>)}
        </ul>
      )}
    </div>
  );
}

export default function Pipeline({ pipeline, onChange, fundNames = [], canEdit, email, onScreen, onConvert, onSendToFundImpact, deals: allDeals = [], funds = {}, curve, workingOn = "" }) {
  const deals = pipeline?.deals ?? [];
  const [f, setF] = useState({ stage: "active", fund: workingOn, market: "", owner: "" }); // starts on the "Working on" fund
  const [msg, setMsg] = useState(null);
  const [source, setSource] = useState("costar");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", address: "", city: "", state: "", sf: "", askingPrice: "", capRatePct: "", targetFund: "" });
  const fileRef = useRef(null);
  const today = new Date().toISOString().slice(0, 10);
  const shown = useMemo(() => filterPipeline(deals, f), [deals, f]);
  const totals = useMemo(() => totalsByStage(deals), [deals]);
  const markets = [...new Set(deals.map((d) => d.market).filter(Boolean))].sort();
  const owners = [...new Set(deals.map((d) => d.owner).filter(Boolean))].sort();

  const save = (nextDeals, extra = {}) => canEdit && onChange({ ...pipeline, ...extra, deals: nextDeals });
  const update = (id, patch) => save(deals.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  async function upload(file) {
    try {
      const grid = await gridFromFile(file);
      const info = detectPipelineMapping(grid, pipeline?.mappings?.[source]);
      const r = importPipeline(deals, grid, info, { source, today, by: email ?? "" });
      save(r.deals, { mappings: { ...(pipeline?.mappings ?? {}), [source]: { headers: info.headers, mapping: info.mapping } } });
      const cols = Object.keys(info.mapping).map((k) => PIPELINE_FIELDS.find((x) => x.key === k)?.label).join(", ");
      setMsg({ ok: true, text: `${file.name}: ${r.added} added, ${r.updated} updated (same name and address)${r.skipped ? `, ${r.skipped} skipped (no name or address)` : ""}. Columns used${info.remembered ? " (remembered)" : ""}: ${cols}.` });
    } catch (e) {
      setMsg({ ok: false, text: `${file.name}: ${e.message}` });
    }
  }
  const addDeal = () => {
    if (!draft.name.trim()) return;
    save([...deals, makePipelineDeal({ ...draft, stage: "watching", source: "Entered" }, { today, by: email ?? "" })]);
    setDraft({ name: "", address: "", city: "", state: "", sf: "", askingPrice: "", capRatePct: "", targetFund: "" });
    setAdding(false);
  };

  return (
    <section className="space-y-3" data-testid="pipeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Pipeline</h2>
          <p className="text-xs text-gray-500">Every deal being watched. Upload a CoStar export or an internal spreadsheet, or add deals by hand. Screen opens a deal in Deal Screener; Convert to asset puts a closed deal in its fund.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {canEdit && (
            <>
              <select aria-label="Upload source" value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
                <option value="costar">CoStar export</option>
                <option value="internal">Internal spreadsheet</option>
              </select>
              <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} border-blue-200 bg-blue-50 text-blue-700`}>Upload</button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" data-testid="pipeline-file" onChange={(e) => { const x = e.target.files?.[0]; if (x) upload(x); e.target.value = ""; }} />
              <button type="button" onClick={() => downloadBlob(writeXlsx(templateRows(), { sheetName: "Pipeline", title: "Baywise · pipeline template" }), "pipeline-template.xlsx")} className={`${btn} border-gray-300 bg-white text-gray-700`}>Template</button>
              <button type="button" onClick={() => setAdding((a) => !a)} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Add deal</button>
            </>
          )}
          <button type="button" onClick={() => downloadBlob(writeXlsx(pipelineXlsx(shown), { sheetName: "Pipeline", title: "Baywise · pipeline" }), `pipeline-${today}.xlsx`)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>
        </div>
      </div>

      {msg && <p className={`rounded-lg border px-3 py-2 text-xs ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} data-testid="pipeline-msg">{msg.text}</p>}

      {adding && canEdit && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs" data-testid="pipeline-add">
          {[["name", "Name", "w-48"], ["address", "Address", "w-48"], ["city", "City", "w-28"], ["state", "State", "w-14"], ["sf", "SF", "w-24"], ["askingPrice", "Asking price", "w-28"], ["capRatePct", "Cap rate %", "w-20"]].map(([k, l, w]) => (
            <label key={k} className="flex flex-col gap-0.5"><span className="text-gray-600">{l}</span><input aria-label={`New ${l}`} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={`${w} rounded border border-gray-300 px-1.5 py-1`} /></label>
          ))}
          <label className="flex flex-col gap-0.5"><span className="text-gray-600">Target fund</span><select aria-label="New target fund" value={draft.targetFund} onChange={(e) => setDraft({ ...draft, targetFund: e.target.value })} className="rounded border border-gray-300 px-1.5 py-1"><option value="">—</option>{fundNames.map((n) => <option key={n}>{n}</option>)}</select></label>
          <button type="button" disabled={!draft.name.trim()} onClick={addDeal} className={`${btn} border-blue-600 bg-blue-600 text-white disabled:opacity-40`}>Save</button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="pipeline-totals">
        {totals.map((t) => (
          <button key={t.stage} type="button" onClick={() => setF({ ...f, stage: f.stage === t.stage ? "active" : t.stage })} className={`rounded-lg border px-3 py-2 text-left ${f.stage === t.stage ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"}`}>
            <div className="text-[10px] uppercase tracking-wide text-gray-400">{t.label}</div>
            <div className="text-sm font-semibold tabular-nums text-gray-900">{t.count} · {fmtM(t.value)}</div>
            <div className="text-[10px] text-gray-500">{Math.round(t.sf).toLocaleString("en-US")} SF{t.stage !== "closed" && t.stage !== "passed" ? ` · weighted ${fmtM(t.weighted)}` : ""}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select aria-label="Filter stage" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} className="rounded border border-gray-300 px-1.5 py-1">
          <option value="active">Active (watching to PSA)</option><option value="all">All stages</option>{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select aria-label="Filter fund" value={f.fund} onChange={(e) => setF({ ...f, fund: e.target.value })} className="rounded border border-gray-300 px-1.5 py-1"><option value="">All funds</option>{fundNames.map((n) => <option key={n}>{n}</option>)}</select>
        <select aria-label="Filter market" value={f.market} onChange={(e) => setF({ ...f, market: e.target.value })} className="rounded border border-gray-300 px-1.5 py-1"><option value="">All markets</option>{markets.map((n) => <option key={n}>{n}</option>)}</select>
        <select aria-label="Filter lead" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} className="rounded border border-gray-300 px-1.5 py-1"><option value="">All leads</option>{owners.map((n) => <option key={n}>{n}</option>)}</select>
        <span className="text-gray-500">{shown.length} of {deals.length} deals</span>
      </div>

      {deals.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500" data-testid="pipeline-empty">No pipeline deals yet. Upload a CoStar export or an internal spreadsheet (the template shows the columns), or add a deal.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500">
              <tr>{["Deal", "Market", "SF", "Asking", "$/SF", "Cap", "Stage", "Prob. %", "Lead", "Target fund", "Next step", "Expected close", ""].map((h, i) => <th key={i} className={`${th} ${[2, 3, 4, 5, 7].includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const x = derived(d);
                return (
                  <tr key={d.id} className="border-t border-gray-100 align-top" data-testid="pipeline-row">
                    <td className={`${td} min-w-[160px]`}><div className="font-medium text-gray-900">{d.name}</div><div className="text-[10px] text-gray-500">{[d.address, d.city, d.state].filter(Boolean).join(", ")}</div>{d.source && <div className="text-[10px] text-gray-400">{d.source}</div>}</td>
                    <td className={td}>{d.market || "—"}</td>
                    <td className={`${td} text-right`}>{d.sf ? Math.round(d.sf).toLocaleString("en-US") : "—"}</td>
                    <td className={`${td} text-right`}>{fmtM(d.askingPrice)}</td>
                    <td className={`${td} text-right`}>{x.psf ? `$${x.psf.toFixed(0)}` : "—"}</td>
                    <td className={`${td} text-right`}>{x.cap ? `${x.cap.toFixed(2)}%` : "—"}</td>
                    <td className={td}>
                      <select aria-label={`Stage ${d.name}`} disabled={!canEdit} value={d.stage} onChange={(e) => update(d.id, { stage: e.target.value, probabilityPct: STAGE_PROBABILITY[e.target.value] })} className={`rounded px-1 py-0.5 text-[11px] font-medium ${STAGE_CLS[d.stage]}`}>
                        {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      {d.stage === "passed" && <input aria-label={`Pass reason ${d.name}`} disabled={!canEdit} defaultValue={d.passReason} placeholder="Reason" onBlur={(e) => e.target.value !== d.passReason && update(d.id, { passReason: e.target.value })} className={`${inp} mt-1`} />}
                    </td>
                    <td className={`${td} min-w-[64px] text-right`}><input aria-label={`Probability ${d.name}`} type="number" disabled={!canEdit} value={d.probabilityPct ?? ""} onChange={(e) => update(d.id, { probabilityPct: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} text-right`} /></td>
                    <td className={`${td} min-w-[150px]`}><input aria-label={`Lead ${d.name}`} disabled={!canEdit} defaultValue={d.owner} onBlur={(e) => e.target.value !== d.owner && update(d.id, { owner: e.target.value })} className={inp} /></td>
                    <td className={td}><select aria-label={`Target fund ${d.name}`} disabled={!canEdit} value={d.targetFund} onChange={(e) => update(d.id, { targetFund: e.target.value })} className="rounded border border-gray-200 px-1 py-0.5 text-[11px]"><option value="">—</option>{fundNames.map((n) => <option key={n}>{n}</option>)}</select></td>
                    <td className={`${td} min-w-[140px]`}>
                      <input aria-label={`Next step ${d.name}`} disabled={!canEdit} defaultValue={d.nextStep} placeholder="Next step" onBlur={(e) => e.target.value !== d.nextStep && update(d.id, { nextStep: e.target.value })} className={inp} />
                      <input aria-label={`Next date ${d.name}`} type="date" disabled={!canEdit} value={d.nextDate || ""} onChange={(e) => update(d.id, { nextDate: e.target.value })} className={`${inp} mt-0.5`} />
                    </td>
                    <td className={td}>
                      <input aria-label={`Expected close ${d.name}`} type="date" disabled={!canEdit} value={d.expectedClose || ""} onChange={(e) => update(d.id, { expectedClose: e.target.value })} className={inp} title="Deal closing" />
                      <details className="mt-0.5" data-testid="pipeline-contract-dates">
                        <summary className="cursor-pointer text-[10px] text-blue-700">Contract dates{PURCHASE_DATES.some(([k]) => d[k]) ? ` (${PURCHASE_DATES.filter(([k]) => d[k]).length})` : ""}</summary>
                        <div className="mt-1 space-y-0.5">
                          {PURCHASE_DATES.map(([k, l]) => (
                            <label key={k} className="flex items-center justify-between gap-1 text-[10px] text-gray-500">{l}<input aria-label={`${l} ${d.name}`} type="date" disabled={!canEdit} value={d[k] || ""} onChange={(e) => update(d.id, { [k]: e.target.value })} className={`${inp} w-28`} /></label>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {canEdit && (
                        <div className="flex flex-col items-start gap-0.5">
                          {ACTIVE_STAGES.includes(d.stage) && <button type="button" onClick={() => onScreen?.(d)} className="text-blue-700 hover:underline">{d.dealId ? "Open in Screener" : "Screen"}</button>}
                          {ACTIVE_STAGES.includes(d.stage) && onSendToFundImpact && <button type="button" onClick={() => onSendToFundImpact(d)} className="text-blue-700 hover:underline">Send to Fund Impact</button>}
                          {d.stage === "closed" && !d.converted && <button type="button" onClick={() => onConvert?.(d)} className="font-medium text-emerald-700 hover:underline">Convert to asset</button>}
                          {d.converted && <span className="text-emerald-700">In {d.targetFund || "a fund"}</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <PipelineReport pipeline={pipeline} deals={allDeals} funds={funds} curve={curve} canEdit={canEdit} email={email} onChange={onChange} />
      {deals.some((d) => d.notes) && <p className="text-[11px] text-gray-400">Notes are kept with each deal and exported to Excel.</p>}
    </section>
  );
}

export { stageLabel };
