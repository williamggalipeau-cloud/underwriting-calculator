"use client";

// Acquisitions → Research (11/24): Comps (moved from Asset Management) and
// Third-Party research, both tied to the asset. onUpdate(dealId, fn) edits
// the asset's inputs (salesComps, research), so every change is in the log.
import { useEffect, useRef, useState } from "react";
import SalesComps from "@/components/SalesComps";
import {
  RESEARCH_ASSUMPTIONS, RESEARCH_TYPES, allResearch, assumptionLabel, compsFor, makeResearch, parseResearchTitle, researchOf,
  researchSummary, researchTypeLabel, researchXlsx, safeLink, saveAssetComps, uploadResearchDoc,
} from "@/lib/research";
import { dealFileLink, listDealDocs } from "@/lib/dealDocs";
import { downloadBlob } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const inp = "rounded border border-gray-200 px-1.5 py-1 text-xs";
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const BLANK = { type: "market", title: "", provider: "", date: "", url: "", assumptions: [], keyFigures: "", summary: "" };

function ResearchForm({ initial, onSave, onCancel, canUpload }) {
  const [f, setF] = useState({ ...BLANK, ...initial });
  const [file, setFile] = useState(null);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (k) => set("assumptions", f.assumptions.includes(k) ? f.assumptions.filter((x) => x !== k) : [...f.assumptions, k]);
  function submit(e) {
    e.preventDefault();
    const url = f.url.trim() ? safeLink(f.url) : "";
    if (url === null) { setErr("Links must start with http:// or https://."); return; }
    if (!f.title.trim() && !file) { setErr("Give it a title or attach a PDF."); return; }
    onSave({ ...f, title: f.title.trim() || file?.name || "", url }, file);
  }
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs" data-testid="research-form">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-0.5">Type<select aria-label="Research type" value={f.type} onChange={(e) => set("type", e.target.value)} className={inp}>{RESEARCH_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="flex flex-col gap-0.5">Title<input aria-label="Research title" value={f.title} onChange={(e) => set("title", e.target.value)} className={inp} /></label>
        <label className="flex flex-col gap-0.5">Provider<input aria-label="Provider" value={f.provider} onChange={(e) => set("provider", e.target.value)} placeholder="e.g. a broker or appraiser" className={inp} /></label>
        <label className="flex flex-col gap-0.5">Report date<input aria-label="Report date" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inp} /></label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5">Link (optional)<input aria-label="Research link" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" className={inp} /></label>
        {canUpload ? (
          <label className="flex flex-col gap-0.5">PDF (optional){initial?.fileName ? <span className="text-gray-500">On file: {initial.fileName}</span> : null}<input aria-label="Research PDF" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" /></label>
        ) : <p className="self-end text-[11px] text-gray-500">Sign in to the firm workspace to attach a PDF; links work any time.</p>}
      </div>
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1"><legend className="mb-0.5">Assumptions it supports</legend>
        {RESEARCH_ASSUMPTIONS.map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={f.assumptions.includes(k)} onChange={() => toggle(k)} />{l}</label>)}
      </fieldset>
      <label className="flex flex-col gap-0.5">Key figures<input aria-label="Key figures" value={f.keyFigures} onChange={(e) => set("keyFigures", e.target.value)} placeholder="e.g. market rent $9.50/SF NNN; exit cap 5.75%" className={inp} /></label>
      <label className="flex flex-col gap-0.5">Summary<textarea aria-label="Research summary" value={f.summary} onChange={(e) => set("summary", e.target.value)} rows={3} placeholder="What it says and how it was used in the underwriting" className={inp} /></label>
      {err && <p className="text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>Save research</button>
        <button type="button" onClick={onCancel} className={`${btn} border-gray-300 bg-white text-gray-700`}>Cancel</button>
      </div>
    </form>
  );
}

function ThirdParty({ deal, deals, canEdit, onUpdate, workspaceId, email, scopeName, todayISO }) {
  const [scope, setScope] = useState("asset");
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [docs, setDocs] = useState([]);
  const [msg, setMsg] = useState(null);
  const reload = () => (workspaceId ? listDealDocs(workspaceId).then(setDocs).catch(() => {}) : Promise.resolve());
  useEffect(() => { reload(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = scope === "fund" ? allResearch(deals) : allResearch([deal]);
  const sum = researchSummary(items);
  const edit = (fn) => onUpdate(deal.id, (cur) => ({ ...cur, research: fn(researchOf(cur)) }));
  const fileDoc = (r) => docs.find((d) => d.id === r.docId) ?? docs.find((d) => parseResearchTitle(d.title)?.researchId === r.id);

  async function save(form, file) {
    setMsg(null);
    const existing = editing !== "new" ? researchOf(deal.inputs).find((r) => r.id === editing) : null;
    const r = existing ? { ...existing, ...form } : makeResearch(form, { by: email ?? "" });
    if (file && workspaceId) {
      try {
        const doc = await uploadResearchDoc(workspaceId, { dealId: deal.id, researchId: r.id, file }, email);
        r.docId = doc?.id ?? null;
        r.fileName = file.name;
        await reload();
      } catch (e) {
        setMsg(`The PDF didn't upload (${e.message}); the summary was saved without it.`);
      }
    }
    edit((list) => (existing ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r]));
    setEditing(null);
  }
  async function openFile(r) {
    const d = fileDoc(r);
    const f = d?.files?.[0];
    if (f) window.open(await dealFileLink(f.path), "_blank", "noopener");
  }
  async function exportX() {
    downloadBlob(await writeXlsx(researchXlsx(items), { sheetName: "Research" }), `third-party-research-${todayISO}.xlsx`);
  }
  async function exportPdf() {
    const { researchPdf } = await import("@/lib/researchPdf");
    downloadBlob(await researchPdf({ title: scope === "fund" ? scopeName || "All assets" : deal.inputs.propertyName, items, todayISO }), `third-party-research-${todayISO}.pdf`);
  }

  return (
    <div className="space-y-4" data-testid="third-party">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-gray-900">Third-Party</h3>
          <p className="text-xs text-gray-500">Reports and research used on {scope === "fund" ? "the assets in view" : deal.inputs.propertyName || "this asset"}: upload the PDF or add a link, and summarize what it supports.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Research view" value={scope} onChange={(e) => setScope(e.target.value)} className={inp}><option value="asset">This asset</option><option value="fund">All assets in view</option></select>
          {canEdit && scope === "asset" && <button type="button" onClick={() => setEditing("new")} className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>Add research</button>}
          <button type="button" onClick={exportX} disabled={!items.length} className={`${btn} border-gray-300 bg-white text-gray-700 disabled:opacity-40`}>Excel</button>
          <button type="button" onClick={exportPdf} disabled={!items.length} className={`${btn} border-gray-300 bg-white text-gray-700 disabled:opacity-40`}>PDF</button>
        </div>
      </div>
      {msg && <p className="text-xs text-red-700">{msg}</p>}
      {editing && <ResearchForm key={editing} initial={editing === "new" ? {} : researchOf(deal.inputs).find((r) => r.id === editing)} canUpload={!!workspaceId} onCancel={() => setEditing(null)} onSave={save} />}

      <div className="grid gap-3 sm:grid-cols-3" data-testid="research-summary">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3"><p className="text-xs text-gray-500">Reports</p><p className="text-lg font-bold tabular-nums">{sum.count}</p><p className="text-[11px] text-gray-500">{sum.files} PDF{sum.files === 1 ? "" : "s"} · {sum.links} link{sum.links === 1 ? "" : "s"}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 sm:col-span-2"><p className="text-xs text-gray-500">Assumptions supported</p>
          <p className="text-xs">{sum.covered.length ? sum.covered.map(assumptionLabel).join(", ") : "None yet"}</p>
          {sum.count > 0 && sum.missing.length > 0 && <p className="text-[11px] text-amber-700">No research yet for: {sum.missing.map(assumptionLabel).join(", ")}</p>}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No third-party research yet. Add the market reports, appraisals, broker opinions and other reports the underwriting relied on.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-500"><tr>{scope === "fund" && <th className="px-2.5 py-2">Asset</th>}<th className="px-2.5 py-2">Type</th><th className="px-2.5 py-2">Title</th><th className="px-2.5 py-2">Provider</th><th className="px-2.5 py-2">Date</th><th className="px-2.5 py-2">Supports</th><th className="px-2.5 py-2">Key figures / summary</th><th className="px-2.5 py-2">Source</th>{canEdit && scope === "asset" && <th />}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(({ asset, dealId, r }) => {
                const link = safeLink(r.url);
                return (
                  <tr key={`${dealId}-${r.id}`} data-testid="research-row" className="align-top">
                    {scope === "fund" && <td className="px-2.5 py-2">{asset}</td>}
                    <td className="px-2.5 py-2 whitespace-nowrap">{researchTypeLabel(r.type)}</td>
                    <td className="px-2.5 py-2 font-medium">{r.title}</td>
                    <td className="px-2.5 py-2">{r.provider || "—"}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">{usDate(r.date)}</td>
                    <td className="px-2.5 py-2">{(r.assumptions ?? []).map(assumptionLabel).join(", ") || "—"}</td>
                    <td className="px-2.5 py-2 max-w-md">{r.keyFigures && <p className="font-medium">{r.keyFigures}</p>}{r.summary && <p className="text-gray-600 whitespace-pre-line">{r.summary}</p>}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="block text-blue-700 hover:underline">Open link ↗</a>}
                      {r.docId && (workspaceId ? <button type="button" onClick={() => openFile(r)} className="block text-blue-700 hover:underline">{r.fileName || "PDF"}</button> : <span className="block text-gray-500">{r.fileName || "PDF"}</span>)}
                    </td>
                    {canEdit && scope === "asset" && (
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <button type="button" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r.id)} className="text-blue-700 hover:underline">Edit</button>{" "}
                        <button type="button" aria-label={`Remove ${r.title}`} onClick={() => window.confirm(`Remove "${r.title}"? Its PDF stays in Library → Documents.`) && edit((list) => list.filter((x) => x.id !== r.id))} className="text-red-600 hover:underline">Remove</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Research({ deal, deals = [], firmComps, subject, onSetExitCap, canEdit = false, onUpdate, workspaceId = null, email = null, scopeName = "", todayISO = new Date().toISOString().slice(0, 10) }) {
  const [view, setView] = useState("comps");
  if (!deal) return <p className="text-xs text-gray-500">Choose an asset.</p>;
  const { state, own } = compsFor(deal.inputs, firmComps);
  const tab = (k, l) => <button type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1 text-xs font-medium ${view === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{l}</button>;
  return (
    <div className="space-y-4" data-testid="research">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Comps</h2>
          <p className="text-xs text-gray-500">Comps and third-party research for {deal.inputs.propertyName || "this asset"}. Everything here is saved with the asset.</p>
        </div>
        <div role="tablist" aria-label="Comps sections" className="flex gap-1 rounded-lg bg-gray-100 p-1">{tab("comps", "Sales Comps")}{tab("thirdparty", "Third-Party")}</div>
      </div>
      {view === "comps" ? (
        <div className="space-y-2">
          {!own && (state.comps?.length ?? 0) > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="comps-firm-note">This asset has no comps of its own yet, so this is the firm comps list. Your first change saves a copy to this asset.</p>}
          <SalesComps
            state={state}
            onChange={(next) => canEdit && onUpdate(deal.id, (cur) => ({ ...cur, salesComps: saveAssetComps(next) }))}
            subject={subject}
            onSetExitCap={onSetExitCap}
          />
        </div>
      ) : (
        <ThirdParty deal={deal} deals={deals} canEdit={canEdit} onUpdate={onUpdate} workspaceId={workspaceId} email={email} scopeName={scopeName} todayISO={todayISO} />
      )}
    </div>
  );
}
