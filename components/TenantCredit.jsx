"use client";

import { useState } from "react";
import { addCreditDoc, deleteCreditDoc, updateCreditDoc } from "@/lib/creditDocs";
import { fileLink } from "@/lib/leaseDocs";
import { CREDIT_KINDS, FIGURES, FIGURE_LABEL, KIND_LABEL, annualRentOf, checkFigures, creditFlags, docDate, figuresPrompt, latestRating, parseFigures } from "@/lib/tenantCredit";

const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const input = "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs";
const SEV = { high: "border-red-200 bg-red-50 text-red-800", medium: "border-amber-200 bg-amber-50 text-amber-800", low: "border-gray-200 bg-white text-gray-600" };
const showFig = (k, v) => {
  if (v == null || v === "") return "—";
  const kind = FIGURES.find((f) => f[0] === k)?.[2];
  if (kind === "money") return `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (kind === "ratio") return `${Number(v).toFixed(2)}x`;
  return String(v);
};

function FigureInputs({ value, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {FIGURES.map(([k, l, kind]) => (
        <label key={k} className="flex flex-col gap-0.5 text-[11px] text-gray-500">
          {l}
          <input
            type={kind === "text" ? "text" : "number"}
            value={value[k] ?? ""}
            onChange={(e) => onChange({ ...value, [k]: e.target.value === "" ? undefined : kind === "text" ? e.target.value : Number(e.target.value) })}
            className={input}
            aria-label={l}
          />
        </label>
      ))}
    </div>
  );
}

// One credit document: details, figures with their checks, Claude read-in.
function CreditDoc({ doc, lease, annualRent, onChanged, onError }) {
  const [edit, setEdit] = useState(false);
  const [fig, setFig] = useState(doc.figures ?? {});
  const [prompt, setPrompt] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const { figures, checks, rentPctOfRevenue } = checkFigures(doc.figures ?? {}, doc.subject === "tenant" ? annualRent : NaN);
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await onChanged(); } catch (e) { onError(e.message || String(e)); } finally { setBusy(false); }
  };
  const shown = FIGURES.filter(([k]) => figures[k] != null && figures[k] !== "");
  return (
    <li className="rounded-md border border-gray-200 bg-white px-2.5 py-2" data-testid="credit-doc">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">{KIND_LABEL[doc.kind]}</span>
        <span className="font-medium">{doc.subject === "guarantor" ? `Guarantor${doc.subject_name ? `: ${doc.subject_name}` : ""}` : "Tenant"}</span>
        <span className="text-gray-500">{doc.source || "source not given"}{doc.audited ? " · audited" : doc.audited === false ? " · unaudited" : ""} · {doc.kind === "credit_report" ? "report" : "period"} {docDate(doc) || "—"}</span>
        <span className="text-[10px] text-gray-400">{doc.uploaded_by_email ? `by ${doc.uploaded_by_email}` : ""} · figures {doc.figures_source === "claude" ? "read by Claude" : "entered"}</span>
        <div className="ml-auto flex gap-2">
          {doc.file?.path && <button type="button" disabled={busy} onClick={() => run(async () => window.open(await fileLink(doc.file.path), "_blank", "noopener"))} className="text-blue-700 hover:underline">{doc.file.name}</button>}
          <button type="button" onClick={() => setEdit(!edit)} className="text-gray-500 hover:text-gray-800">{edit ? "Close" : "Figures"}</button>
          <button type="button" disabled={busy} onClick={() => window.confirm("Delete this credit document and its file?") && run(() => deleteCreditDoc(doc))} className="text-gray-400 hover:text-red-600" aria-label="Delete credit document">✕</button>
        </div>
      </div>
      {shown.length > 0 && (
        <p className="mt-1 text-[11px] text-gray-700">
          {shown.map(([k]) => `${FIGURE_LABEL[k]} ${showFig(k, figures[k])}`).join(" · ")}
          {isFinite(rentPctOfRevenue) && <> · <span className={rentPctOfRevenue > 15 ? "font-medium text-amber-700" : ""}>rent {rentPctOfRevenue.toFixed(1)}% of revenue</span></>}
        </p>
      )}
      {checks.filter((c) => !c.ok).map((c, i) => <p key={i} className="text-[11px] text-red-700">⚠ {c.text}</p>)}
      {edit && (
        <div className="mt-2 space-y-2 rounded-md bg-gray-50 p-2">
          <FigureInputs value={fig} onChange={setFig} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(() => updateCreditDoc(doc.id, { figures: fig, figures_source: "manual" }))} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Save figures</button>
            {doc.file?.path && (
              <button type="button" disabled={busy} onClick={async () => {
                try { setPrompt(figuresPrompt({ tenant: lease.tenant, kind: doc.kind, fileName: doc.file.name, url: await fileLink(doc.file.path) })); } catch (e) { onError(e.message || String(e)); }
              }} className={`${btn} border-blue-200 bg-blue-50 text-blue-700`}>Read figures with Claude</button>
            )}
          </div>
          {prompt && (
            <div className="space-y-1">
              <textarea readOnly value={prompt} aria-label="Figures prompt" className="h-24 w-full rounded border border-gray-200 p-1.5 font-mono text-[10px]" />
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='Paste the JSON: { "figures": { … }, "quotes": { … } }' aria-label="Figures JSON" className="h-16 w-full rounded border border-gray-300 p-1.5 font-mono text-[10px]" />
              <button type="button" disabled={busy || !paste.trim()} onClick={() => {
                const { figures: f, errors } = parseFigures(paste);
                if (!f || errors.length) return onError(errors.join(" "));
                run(async () => { await updateCreditDoc(doc.id, { figures: f, figures_source: "claude" }); setFig(f); setPaste(""); setPrompt(""); });
              }} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Check and save</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// Tenant credit on a lease (owners and editors only): credit reports and
// tenant / guarantor financial statements, key figures and flags.
export default function TenantCredit({ lease, docs, workspaceId, units, onApply, onChanged, onError }) {
  const [adding, setAdding] = useState(false);
  const [meta, setMeta] = useState({ kind: "credit_report", subject: "tenant", subject_name: "", source: "", audited: "", period_end: "", report_date: "", notes: "" });
  const [fig, setFig] = useState({});
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const linked = (units ?? []).filter((u) => (lease.unit_ids ?? []).includes(u.id));
  const annualRent = annualRentOf(lease.abstract, linked[0]);
  const flags = creditFlags(docs, { abs: lease.abstract, asOf: new Date().toISOString().slice(0, 10) });
  const rating = latestRating(docs);
  const save = async () => {
    setBusy(true);
    try {
      const m = { ...meta, audited: meta.audited === "" ? null : meta.audited === "yes", period_end: meta.period_end || null, report_date: meta.report_date || null, figures: fig, figures_source: "manual" };
      await addCreditDoc(workspaceId, lease, file, m);
      setAdding(false); setFile(null); setFig({});
      await onChanged();
    } catch (e) {
      onError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const applyRating = () => {
    const u = linked[0];
    if (!u || !rating) return;
    const next = (units ?? []).map((x) => (x.id === u.id ? { ...x, creditRating: rating.rating } : x));
    const ok = onApply?.(lease.deal_id, next, [{ key: "creditRating", field: "Credit rating", from: u.creditRating, to: rating.rating, unitId: u.id, unitName: u.name }], `From tenant credit report (${rating.source || "credit report"}, ${rating.date})`);
    if (!ok) onError("Couldn't change the rent roll: open this asset and try again.");
  };
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-xs" data-testid="tenant-credit">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-gray-800">Tenant credit</p>
        <span className="text-[11px] text-gray-500">Credit reports and tenant / guarantor financial statements. Owners and editors only: viewers can&apos;t see or open these.</span>
        {rating && linked[0] && (
          linked[0].creditRating === rating.rating ? (
            <span className="ml-auto text-[11px] text-emerald-700">Unit {linked[0].name} credit rating: {rating.rating} ✓</span>
          ) : (
            <button type="button" onClick={applyRating} className={`${btn} ml-auto border-violet-300 bg-white text-violet-800 hover:bg-violet-50`}>Apply rating {rating.rating} to unit {linked[0].name}</button>
          )
        )}
      </div>
      {flags.length > 0 && (
        <div className="space-y-1">
          {flags.map((f, i) => <p key={i} className={`rounded border px-2 py-1 text-[11px] ${SEV[f.severity]}`} data-testid="credit-flag">{f.severity === "low" ? "" : "⚠ "}{f.text}</p>)}
        </div>
      )}
      {docs.length > 0 && <ul className="space-y-1.5">{[...docs].sort((a, b) => (docDate(a) < docDate(b) ? 1 : -1)).map((d) => <CreditDoc key={d.id} doc={d} lease={lease} annualRent={annualRent} onChanged={onChanged} onError={onError} />)}</ul>}
      {adding ? (
        <div className="space-y-2 rounded-md border border-gray-200 bg-white p-2">
          <div className="flex flex-wrap gap-2">
            <select value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })} className={input} aria-label="Document type">{CREDIT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} className={input} aria-label="Whose">{[["tenant", "Tenant"], ["guarantor", "Guarantor"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {meta.subject === "guarantor" && <input value={meta.subject_name} onChange={(e) => setMeta({ ...meta, subject_name: e.target.value })} placeholder="Guarantor name" className={input} aria-label="Guarantor name" />}
            <input value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} placeholder="Source (e.g. D&B, audited by …)" className={`${input} w-56`} aria-label="Source" />
            {meta.kind === "credit_report" || meta.kind === "bank_reference" ? (
              <label className="flex items-center gap-1 text-gray-500">Report date <input type="date" value={meta.report_date} onChange={(e) => setMeta({ ...meta, report_date: e.target.value })} className={input} aria-label="Report date" /></label>
            ) : (
              <>
                <label className="flex items-center gap-1 text-gray-500">Period end <input type="date" value={meta.period_end} onChange={(e) => setMeta({ ...meta, period_end: e.target.value })} className={input} aria-label="Period end" /></label>
                <select value={meta.audited} onChange={(e) => setMeta({ ...meta, audited: e.target.value })} className={input} aria-label="Audited">{[["", "Audited?"], ["yes", "Audited"], ["no", "Unaudited"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </>
            )}
            <label className={`${btn} cursor-pointer border-gray-300 bg-white text-gray-700`}>
              {file ? file.name : "Choose PDF…"}
              <input type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Credit document PDF" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <p className="text-[11px] text-gray-500">Key figures (optional; you can also read them with Claude after saving). Ratios are calculated from their parts when left blank and checked when entered.</p>
          <FigureInputs value={fig} onChange={setFig} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className={`${btn} border-violet-600 bg-violet-600 text-white`}>{busy ? "Saving…" : "Save credit document"}</button>
            <button type="button" onClick={() => setAdding(false)} className={`${btn} border-gray-200 bg-white text-gray-600`}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${btn} border-violet-300 bg-white text-violet-800 hover:bg-violet-50`}>+ Add credit report or statements</button>
      )}
    </div>
  );
}
