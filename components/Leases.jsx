"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FILE_KINDS,
  MAX_FILE_MB,
  STATUS_LABEL,
  addLeaseFiles,
  createLease,
  deleteLease,
  PROJECT_REF,
  fileLink,
  fileLinks,
  fmtBytes,
  listLeases,
  removeLeaseFile,
  saveAbstract,
  updateLease,
} from "@/lib/leaseDocs";
import { STATUS_TEXT, abstractIndustry, abstractPrompt, documentTitle, fieldLabel, groupedFields, missingFields, parseAbstract } from "@/lib/leaseAbstract";
import { sicLabel } from "@/lib/sicCodes";
import { abstractUnitValues, applyAbstract, compareWithUnit, leaseMismatches, showValue } from "@/lib/leaseApply";
import { leaseAnalytics, unitStats } from "@/lib/leases";
import { newUnit } from "@/components/UnitRoll";
import { CriticalDatesView, RiskFlagsView } from "@/components/LeaseViews";
import TenantCredit from "@/components/TenantCredit";
import { listCreditDocs } from "@/lib/creditDocs";
import { listDealDocs } from "@/lib/dealDocs";
import { estoppelChecks } from "@/lib/dealDocApply";
import { planDates } from "@/lib/businessPlan";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";

const STATUS_STYLE = {
  uploaded: "border-gray-200 bg-gray-50 text-gray-700",
  abstracted: "border-amber-200 bg-amber-50 text-amber-800",
  applied: "border-emerald-200 bg-emerald-50 text-emerald-800",
};
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" }) : "—");
const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";

const FIELD_STATUS_STYLE = {
  found: "bg-emerald-50 text-emerald-700",
  calculated: "bg-blue-50 text-blue-700",
  unclear: "bg-amber-50 text-amber-800",
  not_in_lease: "bg-gray-100 text-gray-500",
};
const RISK_STYLE = { high: "border-red-200 bg-red-50 text-red-800", medium: "border-amber-200 bg-amber-50 text-amber-800", low: "border-gray-200 bg-gray-50 text-gray-700" };
const fmtISO = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso ?? "")) return iso || "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
};
const money = (v, dp = 2) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}` : "—");
const daysFrom = (iso) => Math.round((new Date(`${iso}T00:00:00`) - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00")) / 86400000);

// Combined-document page → { file, page } using the abstract's document
// ranges (document i is the lease's file i).
function pageTarget(abs, files, page) {
  const docs = abs?.documents ?? [];
  if (!page || !files?.length) return null;
  if (docs.length && docs.length === files.length) {
    const i = docs.findIndex((d) => page >= d.start_page && page <= d.end_page);
    if (i >= 0) return { file: files[i], page: page - docs[i].start_page + 1 };
  }
  return { file: files[0], page };
}

// Quotes with page links that open the PDF at that page.
function Evidence({ items, abs, files, onOpen }) {
  if (!items?.length) return null;
  return (
    <div className="mt-0.5 space-y-0.5">
      {items.map((e, i) => {
        const t = pageTarget(abs, files, e.page);
        return (
          <p key={i} className="text-[11px] italic leading-snug text-gray-500">
            “{e.quote}”
            {t && (
              <button type="button" onClick={() => onOpen(t.file.path, t.page)} className="ml-1 not-italic text-blue-600 hover:underline" title={`Open ${t.file.name} at page ${t.page}`}>p. {e.page}</button>
            )}
          </p>
        );
      })}
    </div>
  );
}

// The abstract: key terms by template group, rent schedule, critical dates
// and risk flags, each with its clause and quotes.
function AbstractViewer({ lease, onOpen }) {
  const abs = lease.abstract;
  const [section, setSection] = useState("terms");
  const files = lease.files ?? [];
  const groups = useMemo(() => groupedFields(abs), [abs]);
  const missing = missingFields(abs);
  const ind = abstractIndustry(abs);
  const rent = abs.rent_schedule ?? [];
  const dates = [...(abs.critical_dates ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const risks = [...(abs.risks ?? [])].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity));
  const tabs = [["terms", `Key terms (${(abs.fields ?? []).length})`], ["rent", `Rent schedule (${rent.length})`], ["dates", `Critical dates (${dates.length})`], ["risks", `Risk flags (${risks.length})`]];
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3" data-testid="abstract-viewer">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{abs.title || "Lease abstract"}</p>
          {abs.summary && <p className="mt-0.5 max-w-3xl text-gray-600">{abs.summary}</p>}
          <p className="mt-1 text-[11px] text-gray-500">
            {ind.business && <>Business: <span className="text-gray-800">{ind.business}</span> · </>}
            {ind.sic && <>SIC <span className="text-gray-800">{sicLabel(ind.sic)}</span> · </>}
            Abstracted {fmtWhen(lease.abstracted_at)}{lease.abstracted_by_email ? ` by ${lease.abstracted_by_email}` : ""}
            {abs.app?.made_with ? ` · ${abs.app.made_with}` : ""}
          </p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${abs.app?.validated ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`} title={abs.app?.validated ? "Every quote, figure and date was matched to the PDF by the CREparser connector" : "Not validated by the connector: check the quotes before relying on it"}>
          {abs.app?.validated ? "✓ Validated against the PDF" : "Not validated"}
        </span>
      </div>
      {(abs.documents ?? []).length > 1 && (
        <p className="mt-1 text-[11px] text-gray-500">Documents: {abs.documents.map((d) => `${d.title}${d.date ? ` (${fmtISO(d.date)})` : ""}, pp. ${d.start_page}–${d.end_page}`).join(" · ")}. Terms changed by a later document show the earlier value.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setSection(k)} className={`rounded-md px-2.5 py-1 font-medium ${section === k ? "bg-white text-blue-700 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-800"}`}>{l}</button>
        ))}
      </div>

      {section === "terms" && (
        <div className="mt-2 space-y-3">
          {groups.map((g) => (
            <div key={g.id}>
              <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</h4>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
                {g.fields.map((f) => (
                  <div key={f.key} className="grid gap-x-3 px-2.5 py-1.5 sm:grid-cols-[11rem_1fr]">
                    <div className="text-gray-500">
                      {fieldLabel(f)}
                      {f.clause && <span className="ml-1 text-[10px] text-gray-400">§ {f.clause}</span>}
                    </div>
                    <div>
                      <span className="text-gray-900">{f.value}</span>
                      <span className={`ml-1.5 rounded px-1 py-px text-[10px] ${FIELD_STATUS_STYLE[f.status] ?? ""}`}>{STATUS_TEXT[f.status] ?? f.status}</span>
                      {f.governed_by && <span className="ml-1.5 rounded bg-violet-50 px-1 py-px text-[10px] text-violet-700">Amended by {documentTitle(abs, f.governed_by)}</span>}
                      {f.detail && <p className="text-[11px] text-gray-600">{f.detail}</p>}
                      {f.calculation && <p className="text-[11px] text-blue-700">= {f.calculation}</p>}
                      <Evidence items={f.evidence} abs={abs} files={files} onOpen={onOpen} />
                      {(f.history ?? []).map((h, i) => (
                        <div key={i} className="mt-1 rounded bg-gray-50 px-2 py-1">
                          <p className="text-[11px] text-gray-600"><span className="font-medium">Before ({documentTitle(abs, h.document)}):</span> <span className="line-through decoration-gray-400">{h.value}</span></p>
                          <Evidence items={h.evidence} abs={abs} files={files} onOpen={onOpen} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {missing.length > 0 && <p className="text-[11px] text-gray-400">Not in this abstract ({missing.length} template fields): {missing.join(", ")}.</p>}
        </div>
      )}

      {section === "rent" && (
        rent.length ? (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full tabular-nums">
              <thead className="bg-gray-50 text-gray-500"><tr>{["Period", "From", "To", "$/SF/yr", "Monthly", "Annual", "Source"].map((h) => <th key={h} className={`px-2.5 py-1.5 font-medium ${["Period", "Source"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {rent.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 align-top">
                    <td className="px-2.5 py-1.5">{r.period}{r.space ? ` · ${r.space}` : ""}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtISO(r.start)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtISO(r.end)}</td>
                    <td className="px-2.5 py-1.5 text-right">{r.rate != null ? money(r.rate, 2) : "—"}</td>
                    <td className="px-2.5 py-1.5 text-right">{money(r.monthly_rent)}</td>
                    <td className="px-2.5 py-1.5 text-right">{money(r.annual_rent ?? (r.monthly_rent != null ? r.monthly_rent * 12 : null))}</td>
                    <td className="px-2.5 py-1.5">
                      <span className={`rounded px-1 py-px text-[10px] ${FIELD_STATUS_STYLE[r.status] ?? ""}`} title={r.calculation || ""}>{STATUS_TEXT[r.status] ?? r.status}</span>
                      {r.clause && <span className="ml-1 text-[10px] text-gray-400">§ {r.clause}</span>}
                      {r.governed_by && <span className="ml-1 text-[10px] text-violet-700">{documentTitle(abs, r.governed_by)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-2.5 py-1.5 text-[11px] text-gray-400">Annual = monthly × 12 where the lease gives no annual figure. Hover “Calculated” for the arithmetic.</p>
          </div>
        ) : <p className="mt-2 text-gray-400">No rent schedule in this abstract.</p>
      )}

      {section === "dates" && (
        dates.length ? (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full">
              <thead className="bg-gray-50 text-gray-500"><tr>{["Date", "", "Event", "Notice", "Action", "Clause"].map((h, i) => <th key={i} className="px-2.5 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {dates.map((d, i) => {
                  const days = daysFrom(d.date);
                  return (
                    <tr key={i} className={`border-t border-gray-100 align-top ${days < 0 ? "text-gray-400" : days <= 90 ? "bg-amber-50/70" : ""}`}>
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{fmtISO(d.date)}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-[11px]">{days < 0 ? "past" : days === 0 ? "today" : `in ${days} days`}</td>
                      <td className="px-2.5 py-1.5 font-medium">{d.label}{d.status === "calculated" && <span className="ml-1 text-[10px] font-normal text-blue-700" title={d.calculation || ""}>calculated</span>}</td>
                      <td className="px-2.5 py-1.5">{d.notice || "—"}</td>
                      <td className="px-2.5 py-1.5">{d.action || "—"}</td>
                      <td className="px-2.5 py-1.5 text-[11px] text-gray-500">{d.clause ? `§ ${d.clause}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-gray-400">No critical dates in this abstract.</p>
      )}

      {section === "risks" && (
        risks.length ? (
          <div className="mt-2 space-y-1.5">
            {risks.map((r, i) => (
              <div key={i} className={`rounded-lg border px-2.5 py-1.5 ${RISK_STYLE[r.severity] ?? RISK_STYLE.low}`}>
                <p className="font-semibold"><span className="mr-1.5 rounded bg-white/70 px-1 text-[10px] uppercase">{r.severity}</span>{r.title}{r.clause && <span className="ml-1 text-[10px] font-normal opacity-70">§ {r.clause}</span>}</p>
                <p className="text-[11px]">{r.detail}</p>
                <Evidence items={r.evidence} abs={abs} files={files} onOpen={onOpen} />
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-gray-400">No risk flags in this abstract.</p>
      )}
    </div>
  );
}

// "Abstract with Claude": a ready-made prompt with 1-hour links to the
// lease's files, and a box to paste the finished abstract and save it.
function AbstractPanel({ lease, assetName, units, userId, email, onSaved, onError }) {
  const [prompt, setPrompt] = useState("");
  const [madeAt, setMadeAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [errors, setErrors] = useState([]);
  const linked = units.filter((u) => (lease.unit_ids ?? []).includes(u.id));
  const make = async () => {
    setBusy(true);
    try {
      const links = await fileLinks(lease);
      setPrompt(abstractPrompt({ lease, assetName, units: linked, links, saver: userId ? { userId, email, projectRef: PROJECT_REF } : null }));
      setMadeAt(new Date());
      setCopied(false);
    } catch (e) {
      onError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      onError("Couldn't copy. Select the text in the box and copy it.");
    }
  };
  const save = async () => {
    const { abstract, errors: errs } = parseAbstract(paste);
    setErrors(errs);
    if (!abstract || errs.length) return;
    setBusy(true);
    try {
      await saveAbstract(lease.id, abstract);
      setPaste("");
      await onSaved();
    } catch (e) {
      onError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const expired = madeAt && Date.now() - madeAt.getTime() > 55 * 60 * 1000;
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid="abstract-panel">
      <div>
        <p className="font-semibold text-gray-800">1. Abstract the lease in a Claude session</p>
        <p className="text-gray-600">Creates a prompt with links to this lease&apos;s {(lease.files ?? []).length} document{(lease.files ?? []).length === 1 ? "" : "s"} (in order; the links work for 1 hour) and the Model Fund I template. Paste it into a Claude chat that has the CREparser Lease Abstraction connector (and, to save directly, the Supabase connector).</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button type="button" disabled={busy || !(lease.files ?? []).length} onClick={make} className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>{prompt ? "Make a new prompt" : "Create prompt"}</button>
          {prompt && <button type="button" onClick={copy} className={`${btn} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>{copied ? "Copied ✓" : "Copy prompt"}</button>}
          {expired && <span className="self-center text-amber-700">The links have expired: make a new prompt.</span>}
        </div>
        {prompt && <textarea readOnly value={prompt} aria-label="Abstract prompt" className="mt-1.5 h-40 w-full rounded-md border border-gray-200 bg-white p-2 font-mono text-[11px] text-gray-800" />}
      </div>
      <div>
        <p className="font-semibold text-gray-800">2. Save the abstract</p>
        <p className="text-gray-600">If the session saved it through the Supabase connector, it appears here when you refresh. Otherwise paste the JSON it gave you.</p>
        <textarea value={paste} onChange={(e) => { setPaste(e.target.value); setErrors([]); }} placeholder='{ "title": "…", "fields": [ … ], "rent_schedule": [ … ], … }' aria-label="Abstract JSON" className="mt-1.5 h-24 w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-[11px]" />
        {errors.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-red-700">{errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}{errors.length > 8 && <li>…and {errors.length - 8} more</li>}</ul>
        )}
        <div className="mt-1.5 flex gap-2">
          <button type="button" disabled={busy || !paste.trim()} onClick={save} className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>{busy ? "Saving…" : "Save abstract"}</button>
          <button type="button" disabled={busy} onClick={onSaved} className={`${btn} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Refresh</button>
        </div>
      </div>
    </div>
  );
}

// Picks PDFs and lets the user set each one's kind and order.
function FilePicker({ files, onChange, disabled }) {
  const ref = useRef(null);
  const add = (list) => {
    const pdfs = [...list].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    const next = [...files, ...pdfs.map((file) => ({ file, kind: "amendment" }))];
    if (next.length && !files.length) next[0] = { ...next[0], kind: "lease" };
    onChange(next);
  };
  const move = (i, d) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <input ref={ref} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Choose lease PDFs" onChange={(e) => { add(e.target.files ?? []); e.target.value = ""; }} />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!disabled) add(e.dataTransfer.files ?? []); }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500"
      >
        <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={`${btn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}>Choose PDFs…</button>
        <span>or drop them here. Put the base lease first, then amendments in date order. PDF only, up to {MAX_FILE_MB} MB each.</span>
      </div>
      {files.length > 0 && (
        <ol className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-2 py-1 text-xs">
              <span className="w-5 text-right text-gray-400">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-gray-900">{f.file.name}</span>
              <span className="text-gray-400">{fmtBytes(f.file.size)}</span>
              <select value={f.kind} onChange={(e) => onChange(files.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className="rounded border border-gray-200 bg-white px-1 py-0.5" aria-label={`Type of ${f.file.name}`}>
                {FILE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">↑</button>
              <button type="button" disabled={i === files.length - 1} onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">↓</button>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label={`Remove ${f.file.name}`}>✕</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Rent roll effect of a change: occupancy, WALT and mark to market.
function rollStats(units, inputs) {
  const st = unitStats({ ...inputs, units });
  const la = leaseAnalytics({ ...inputs, units }, inputs.acquisitionDate && /^\d{4}-\d{2}-\d{2}$/.test(inputs.acquisitionDate) ? inputs.acquisitionDate : undefined);
  return { units: st.units, vacant: st.vacant, occ: st.occupancyPct, walt: la.walt, mtm: la.markToMarketPct, inPlace: la.inPlaceRentPSF };
}
const pct1 = (n) => (isFinite(n) ? `${n.toFixed(1)}%` : "—");
const yrs = (n) => (isFinite(n) ? `${n.toFixed(2)} yrs` : "—");

// "Apply to rent roll": the abstract next to a rent roll unit (or a new
// unit), field by field. Ticked fields are applied; the lease is marked
// applied and linked to the unit; each change is logged as from the abstract.
function ApplyPanel({ lease, units, inputs, email, onApply, onDone, onError }) {
  const abs = lease.abstract;
  const linked = units.filter((u) => (lease.unit_ids ?? []).includes(u.id));
  const [target, setTarget] = useState(linked[0]?.id ?? "new");
  const premises = String(abs.fields?.find((f) => f.key === "premises")?.value ?? "").split(",")[0].trim();
  const [unitName, setUnitName] = useState(premises || "New unit");
  const unit = target === "new" ? null : units.find((u) => u.id === target) ?? null;
  const rows = useMemo(() => compareWithUnit(abs, unit, inputs), [abs, unit, inputs]);
  const [ticked, setTicked] = useState(() => new Set(rows.filter((r) => r.differs).map((r) => r.key)));
  const [busy, setBusy] = useState(false);
  const pick = (id) => {
    setTarget(id);
    const u = id === "new" ? null : units.find((x) => x.id === id) ?? null;
    setTicked(new Set(compareWithUnit(abs, u, inputs).filter((r) => r.differs).map((r) => r.key)));
  };
  const toggle = (k) => setTicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const make = (name, sf) => newUnit(name, sf, inputs);
  const preview = useMemo(() => {
    try {
      return applyAbstract(units, abs, { target, fields: [...ticked], inputs, newUnit: make, unitName });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, abs, target, ticked, inputs, unitName]);
  const before = rollStats(units, inputs);
  const after = preview ? rollStats(preview.units, inputs) : before;
  const differing = rows.filter((r) => r.differs).length;
  const tenant = abstractUnitValues(abs, inputs).values.tenantName || lease.tenant;

  const apply = async () => {
    if (!preview) return;
    if (target !== "new" && !preview.entries.length) return onError("Tick at least one field that differs.");
    setBusy(true);
    try {
      const entries = preview.entries.map((e) => ({ ...e, unitId: preview.unit.id, unitName: preview.unit.name }));
      const ok = onApply?.(lease.deal_id, preview.units, entries, `From lease abstract (${tenant})`);
      if (!ok) throw new Error("Couldn't change the rent roll: open this asset (or unlock the workspace) and try again.");
      await updateLease(lease.id, {
        status: "applied",
        applied_at: new Date().toISOString(),
        applied_by_email: email ?? null,
        unit_ids: [...new Set([...(lease.unit_ids ?? []), preview.unit.id])],
        ...(lease.tenant ? {} : { tenant }),
      });
      await onDone();
    } catch (e) {
      onError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3" data-testid="apply-panel">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5">
          <span className="font-medium text-gray-700">Apply to</span>
          <select value={target} onChange={(e) => pick(e.target.value)} className="w-72 rounded-md border border-gray-300 bg-white px-2 py-1" aria-label="Rent roll unit">
            {linked.map((u) => <option key={u.id} value={u.id}>{u.name}{u.tenantName ? ` · ${u.tenantName}` : " · vacant"} (linked)</option>)}
            {units.filter((u) => !linked.includes(u)).map((u) => <option key={u.id} value={u.id}>{u.name}{u.tenantName ? ` · ${u.tenantName}` : " · vacant"}</option>)}
            <option value="new">+ New unit, prefilled from the abstract</option>
          </select>
        </label>
        {target === "new" && (
          <label className="flex flex-col gap-0.5">
            <span className="font-medium text-gray-700">New unit name</span>
            <input value={unitName} onChange={(e) => setUnitName(e.target.value)} className="w-40 rounded-md border border-gray-300 bg-white px-2 py-1" aria-label="New unit name" />
          </label>
        )}
        <p className="flex-1 text-gray-600">
          {target === "new"
            ? "Adds a unit with every field from the abstract (other assumptions from the deal's defaults)."
            : `${differing} of ${rows.length} fields differ from the rent roll; those are ticked. Untick any you don't want to change.`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
        <table className="w-full">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="w-8 px-2 py-1.5" />
              <th className="px-2 py-1.5 text-left font-medium">Field</th>
              <th className="px-2 py-1.5 text-left font-medium">{unit ? `Rent roll (${unit.name})` : "Rent roll"}</th>
              <th className="px-2 py-1.5 text-left font-medium">Lease abstract</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-t border-gray-100 align-top ${r.differs ? "" : "text-gray-400"}`} data-testid={`apply-row-${r.key}`}>
                <td className="px-2 py-1.5 text-center">
                  {target === "new" ? <span className="text-emerald-600">✓</span> : (
                    <input type="checkbox" checked={ticked.has(r.key)} disabled={!r.differs} onChange={() => toggle(r.key)} aria-label={`Apply ${r.label}`} />
                  )}
                </td>
                <td className="px-2 py-1.5 font-medium">{r.label}</td>
                <td className="px-2 py-1.5">{unit ? showValue(r.kind, r.unitValue) : "—"}</td>
                <td className="px-2 py-1.5">
                  <span className={r.differs ? "text-gray-900" : ""}>{showValue(r.kind, r.abstractValue)}</span>
                  {!r.differs && <span className="ml-1 text-[10px]">same</span>}
                  {r.note && <p className="text-[11px] text-amber-700">{r.note}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 sm:grid-cols-4" data-testid="apply-effect">
        {[
          ["Units / vacant", `${before.units} / ${before.vacant ?? "—"}`, `${after.units} / ${after.vacant ?? "—"}`],
          ["Occupancy (SF)", pct1(before.occ), pct1(after.occ)],
          ["WALT (by rent)", yrs(before.walt), yrs(after.walt)],
          ["Mark to market", pct1(before.mtm), pct1(after.mtm)],
        ].map(([l, a, b]) => (
          <div key={l}>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{l}</p>
            <p className="tabular-nums">{a} <span className="text-gray-400">→</span> <span className={a !== b ? "font-semibold text-emerald-700" : ""}>{b}</span></p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">
        Rent steps drive the cash flow while this lease runs (abated months at $0); renewal options are exercised when the option rent is at or below market. Each change is logged in the Change log as from this abstract.
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={busy || !preview || (target !== "new" && !preview.entries.length)} onClick={apply} className={`${btn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}>
          {busy ? "Applying…" : target === "new" ? `Add unit ${unitName || ""}` : `Apply ${preview?.entries.length ?? 0} field${preview?.entries.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" disabled={busy} onClick={onDone} className={`${btn} border-gray-200 bg-white text-gray-600`}>Cancel</button>
      </div>
    </div>
  );
}

// Mismatch flag: where the linked rent roll unit(s) differ from the abstract.
// Estoppel flag: an estoppel (Documents tab) that differs from the lease or unit.
function EstoppelFlag({ lease, units, docs }) {
  const est = (docs ?? []).filter((d) => d.doc_type === "estoppel" && d.lease_id === lease.id && d.abstract);
  if (!est.length) return null;
  const unit = units.find((u) => (lease.unit_ids ?? []).includes(u.id));
  const bad = est.flatMap((d) => estoppelChecks(d, lease.abstract ?? null, unit)).filter((r) => !r.ok);
  return bad.length ? (
    <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800" title={bad.map((r) => `${r.label}: estoppel ${r.estoppel ?? "—"}, lease ${r.lease ?? "—"}`).join("\n")} data-testid="estoppel-flag">⚠ Estoppel differs: {bad.map((r) => r.label).join(", ")}</span>
  ) : (
    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800" data-testid="estoppel-flag">✓ Estoppel matches</span>
  );
}

function MismatchFlag({ lease, units, inputs }) {
  if (!lease.abstract || !inputs) return null;
  const linked = units.filter((u) => (lease.unit_ids ?? []).includes(u.id));
  if (!linked.length) return <span className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-500" data-testid="lease-flag">Not on the rent roll yet</span>;
  const diffs = linked.flatMap((u) => leaseMismatches(lease.abstract, u, inputs).map((r) => ({ ...r, unit: u.name })));
  if (!diffs.length) return <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800" data-testid="lease-flag">✓ Rent roll matches the lease</span>;
  const title = diffs.map((d) => `${d.unit} · ${d.label}: rent roll ${showValue(d.kind, d.unitValue)}, lease ${showValue(d.kind, d.abstractValue)}`).join("\n");
  return (
    <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800" title={title} data-testid="lease-flag">
      ⚠ Rent roll differs: {[...new Set(diffs.map((d) => d.label.replace(/ \(.*\)$/, "")))].join(", ")}
    </span>
  );
}

function LeaseCard({ lease, assetName, units, inputs, canEdit, workspaceId, email, userId, credit, dealDocs, onApply, onChanged, onCreditChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(null); // "abstract" | "view" | "apply" | "credit" | null
  const [adding, setAdding] = useState([]);
  const [editing, setEditing] = useState(false);
  const [tenant, setTenant] = useState(lease.tenant);
  const [unitIds, setUnitIds] = useState(lease.unit_ids ?? []);
  const unitName = (id) => units.find((u) => u.id === id)?.name ?? "(removed unit)";
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (path, page) =>
    run(async () => {
      const url = await fileLink(path);
      window.open(page ? `${url}#page=${page}` : url, "_blank", "noopener");
    });
  const files = lease.files ?? [];
  const move = (i, d) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    run(() => updateLease(lease.id, { files: next }));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {editing ? (
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} className="w-64 rounded border border-gray-300 px-2 py-1 text-sm font-semibold" aria-label="Tenant" />
          ) : (
            <h3 className="text-sm font-semibold">{lease.tenant || lease.title || "Untitled lease"}</h3>
          )}
          <p className="mt-0.5 text-gray-500">
            {assetName}
            {" · "}
            {(lease.unit_ids ?? []).length ? `Unit ${(lease.unit_ids ?? []).map(unitName).join(", ")}` : "Not linked to a rent roll unit"}
            {" · added "}{fmtWhen(lease.created_at)}{lease.created_by_email ? ` by ${lease.created_by_email}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[lease.status] ?? STATUS_STYLE.uploaded}`} title={lease.applied_at ? `Applied ${fmtWhen(lease.applied_at)}` : ""}>{STATUS_LABEL[lease.status] ?? lease.status}</span>
          <MismatchFlag lease={lease} units={units} inputs={inputs} />
          <EstoppelFlag lease={lease} units={units} docs={dealDocs} />
        </div>
      </div>

      {editing && (
        <div className="mt-2 rounded-lg bg-gray-50 p-2">
          <p className="mb-1 font-medium text-gray-600">Rent roll units this lease covers</p>
          {units.length === 0 ? (
            <p className="text-gray-400">This asset has no rent roll yet. Apply to rent roll adds the unit from the abstract.</p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
              {units.map((u) => (
                <label key={u.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={unitIds.includes(u.id)} onChange={(e) => setUnitIds((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))} />
                  {u.name}{u.tenantName ? ` · ${u.tenantName}` : ""}
                </label>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(async () => { await updateLease(lease.id, { tenant: tenant.trim(), unit_ids: unitIds }); setEditing(false); })} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Save</button>
            <button type="button" onClick={() => { setEditing(false); setTenant(lease.tenant); setUnitIds(lease.unit_ids ?? []); }} className={`${btn} border-gray-200 bg-white text-gray-600`}>Cancel</button>
          </div>
        </div>
      )}

      <ol className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
        {files.map((f, i) => (
          <li key={f.path} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
            <span className="w-5 text-right text-gray-400">{i + 1}.</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">{FILE_KINDS.find(([k]) => k === f.kind)?.[1].split(" ")[0] ?? f.kind}</span>
            <button type="button" disabled={busy} onClick={() => open(f.path)} className="min-w-0 flex-1 truncate text-left font-medium text-blue-700 hover:underline">{f.name}</button>
            <span className="text-gray-400">{f.size ? fmtBytes(f.size) : ""}</span>
            {canEdit && (
              <>
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" disabled={busy || i === files.length - 1} onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">↓</button>
                <button type="button" disabled={busy} onClick={() => window.confirm(`Delete ${f.name} from this lease? The file is removed from storage.`) && run(() => removeLeaseFile(lease, f.path))} className="text-gray-400 hover:text-red-600" aria-label={`Delete ${f.name}`}>✕</button>
              </>
            )}
          </li>
        ))}
        {files.length === 0 && <li className="px-2 py-1.5 text-gray-400">No documents.</li>}
      </ol>

      {canEdit && adding.length > 0 && (
        <div className="mt-2 space-y-2">
          <FilePicker files={adding} onChange={setAdding} disabled={busy} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(async () => { await addLeaseFiles(lease, workspaceId, adding, email); setAdding([]); })} className={`${btn} border-blue-600 bg-blue-600 text-white`}>{busy ? "Uploading…" : `Upload ${adding.length}`}</button>
            <button type="button" onClick={() => setAdding([])} className={`${btn} border-gray-200 bg-white text-gray-600`}>Cancel</button>
          </div>
        </div>
      )}

      {panel === "view" && lease.abstract && <AbstractViewer lease={lease} onOpen={open} />}
      {panel === "credit" && canEdit && (
        <TenantCredit lease={lease} docs={credit ?? []} workspaceId={workspaceId} units={units} onApply={onApply} onChanged={onCreditChanged} onError={onError} />
      )}
      {panel === "apply" && lease.abstract && canEdit && inputs && (
        <ApplyPanel lease={lease} units={units} inputs={inputs} email={email} onApply={onApply} onError={onError} onDone={async () => { setPanel(null); await onChanged(); }} />
      )}
      {panel === "abstract" && canEdit && (
        <AbstractPanel lease={lease} assetName={assetName} units={units} userId={userId} email={email} onError={onError} onSaved={async () => { await onChanged(); }} />
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {canEdit && adding.length === 0 && (
          <label className={`${btn} cursor-pointer border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>
            + Add documents
            <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => { setAdding([...(e.target.files ?? [])].map((file) => ({ file, kind: "amendment" }))); e.target.value = ""; }} />
          </label>
        )}
        {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className={`${btn} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Edit tenant / units</button>}
        {lease.abstract && (
          <button type="button" onClick={() => setPanel(panel === "view" ? null : "view")} className={`${btn} ${panel === "view" ? "border-blue-600 bg-blue-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>{panel === "view" ? "Hide abstract" : "View abstract"}</button>
        )}
        {canEdit && lease.abstract && inputs && (
          <button type="button" onClick={() => setPanel(panel === "apply" ? null : "apply")} className={`${btn} ${panel === "apply" ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50"}`}>{panel === "apply" ? "Close apply" : lease.status === "applied" ? "Review against rent roll" : "Apply to rent roll"}</button>
        )}
        {canEdit && (
          <button type="button" onClick={() => setPanel(panel === "credit" ? null : "credit")} className={`${btn} ${panel === "credit" ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"}`} title="Credit reports and financial statements (owners and editors only)">Tenant credit{credit?.length ? ` (${credit.length})` : ""}</button>
        )}
        {canEdit && (
          <button type="button" onClick={() => setPanel(panel === "abstract" ? null : "abstract")} className={`${btn} ${panel === "abstract" ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>{lease.abstract ? "Re-abstract with Claude" : "Abstract with Claude"}</button>
        )}
        {canEdit && lease.abstract && (
          <button type="button" disabled={busy} onClick={() => window.confirm("Remove this lease's abstract? The documents stay.") && run(async () => { await saveAbstract(lease.id, null); setPanel(null); })} className={`${btn} border-gray-200 bg-white text-gray-500 hover:text-red-600`}>Remove abstract</button>
        )}
        {canEdit && (
          <button type="button" disabled={busy} onClick={() => window.confirm(`Delete the lease for ${lease.tenant || "this tenant"} and all ${files.length} of its documents? This can't be undone.`) && run(() => deleteLease(lease))} className={`${btn} ml-auto border-transparent text-gray-400 hover:text-red-600`}>Delete lease</button>
        )}
      </div>
    </div>
  );
}

export default function Leases({ workspace, signedIn, email, userId, canEdit, deal, fundDeals, fundName, dealInputs, onApplyUnits, extraDates = [] }) {
  const [scope, setScope] = useState("asset");
  const [leases, setLeases] = useState(null);
  const [error, setError] = useState(null);
  const [newFiles, setNewFiles] = useState([]);
  const [newTenant, setNewTenant] = useState("");
  const [newUnits, setNewUnits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("leases"); // leases | dates | risks
  const [credit, setCredit] = useState(null); // owners and editors only
  const [reporting, setReporting] = useState(false);
  const wsId = workspace?.id;

  const refresh = useCallback(async () => {
    if (!wsId) return;
    try {
      setLeases(await listLeases(wsId));
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [wsId]);
  useEffect(() => {
    // Loads this workspace's leases; nothing to load without one.
    refresh();
  }, [refresh]);
  const [dealDocs, setDealDocs] = useState([]);
  useEffect(() => {
    // Deal documents' deadlines for Critical dates (phase E).
    if (!wsId) return;
    let alive = true;
    listDealDocs(wsId).then((d) => alive && setDealDocs(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [wsId]);
  const refreshCredit = useCallback(async () => {
    if (!wsId || !canEdit) return;
    try {
      const list = await listCreditDocs(wsId);
      setCredit(list);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [wsId, canEdit]);
  useEffect(() => {
    // Credit documents: owners and editors only.
    refreshCredit();
  }, [refreshCredit]);

  const units = deal?.inputs?.units ?? [];
  const dealName = (id) => fundDeals.find((d) => d.id === id)?.inputs?.propertyName ?? (id === deal?.id ? deal.inputs.propertyName : "Asset not in this fund");
  const inputsOf = (id) => (id === deal?.id ? deal.inputs : dealInputs?.(id) ?? fundDeals.find((d) => d.id === id)?.inputs ?? null);
  const unitsOf = (id) => inputsOf(id)?.units ?? [];
  const shown = useMemo(() => {
    if (!leases) return [];
    if (scope === "asset") return leases.filter((l) => l.deal_id === deal?.id);
    const ids = new Set(fundDeals.map((d) => d.id));
    return leases.filter((l) => ids.has(l.deal_id));
  }, [leases, scope, deal?.id, fundDeals]);
  const byAsset = useMemo(() => {
    const m = new Map();
    for (const l of shown) m.set(l.deal_id, [...(m.get(l.deal_id) ?? []), l]);
    return [...m.entries()].sort((a, b) => dealName(a[0]).localeCompare(dealName(b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  async function addLease(e) {
    e.preventDefault();
    if (!newFiles.length) return;
    setBusy(true);
    try {
      const tenantGuess = newTenant.trim() || units.find((u) => newUnits.includes(u.id))?.tenantName || "";
      await createLease(wsId, { dealId: deal.id, tenant: tenantGuess, unitIds: newUnits, files: newFiles }, email);
      setNewFiles([]);
      setNewTenant("");
      setNewUnits([]);
      await refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const tenants = [...new Set(units.map((u) => u.tenantName).filter(Boolean))];
  const scopeTitle = scope === "asset" ? deal?.inputs?.propertyName || "Asset" : fundName || "Fund";
  const today = new Date().toISOString().slice(0, 10);
  const creditFor = canEdit ? credit ?? [] : null;
  const docsFor = useMemo(() => {
    const ids = new Set(scope === "asset" ? [deal?.id] : fundDeals.map((d) => d.id));
    return dealDocs.filter((d) => (d.deal_id ? ids.has(d.deal_id) : scope === "fund" && d.fund_name === fundName));
  }, [dealDocs, scope, deal?.id, fundDeals, fundName]);
  // Business plan milestones, and (fund scope) entities' annual-report dates (phase N).
  const milestonesFor = useMemo(() => [...planDates(scope === "asset" ? (deal ? [deal] : []) : fundDeals), ...(scope === "asset" ? [] : extraDates)], [scope, deal, fundDeals, extraDates]);
  async function report() {
    setReporting(true);
    try {
      const { leaseReportPdf } = await import("@/lib/leaseReportPdf");
      downloadBlob(await leaseReportPdf(shown, { title: scopeTitle, assetName: dealName, asOf: today, credit: creditFor }), `${safeFileName(scopeTitle)}-lease-abstraction-report.pdf`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setReporting(false);
    }
  }
  const fundCount = leases ? leases.filter((l) => fundDeals.some((d) => d.id === l.deal_id)).length : 0;

  return (
    <div className="space-y-4 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Leases</h2>
          <p className="text-xs text-gray-500">
            Lease PDFs for each asset, stored privately in the database, and their abstracts (key terms, rent schedule, critical dates and risk flags, each with its clause and quote). Apply an abstract to the rent roll field by field; flags show where the rent roll differs from the lease.
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
          {[["asset", deal?.inputs?.propertyName || "This asset"], ["fund", `Whole fund${fundName ? ` (${fundName})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-3 py-1 font-medium ${scope === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      </div>

      {!signedIn || !wsId ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
          Leases are stored in the database. Sign in and open a workspace to see and upload them.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 text-xs" role="tablist">
            {[["leases", `Leases (${shown.length})`], ["dates", "Critical dates"], ["risks", "Risk flags"]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`-mb-px border-b-2 px-3 py-1.5 font-medium ${view === k ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{l}</button>
            ))}
            {reporting && <span className="ml-2 text-gray-400">Making the report…</span>}
          </div>
          {view === "dates" && <CriticalDatesView leases={shown} assetName={dealName} title={scopeTitle} asOf={today} credit={creditFor} docs={docsFor} milestones={milestonesFor} onReport={report} />}
          {view === "risks" && <RiskFlagsView leases={shown} assetName={dealName} title={scopeTitle} onReport={report} />}
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-700" aria-label="Dismiss">✕</button>
            </p>
          )}

          {view === "leases" && scope === "asset" && canEdit && deal && (
            <form onSubmit={addLease} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-xs">
              <h3 className="text-sm font-semibold">Add a lease to {deal.inputs.propertyName || "this asset"}</h3>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-0.5">
                  <span className="text-gray-600">Tenant</span>
                  <input list="lease-tenants" value={newTenant} onChange={(e) => setNewTenant(e.target.value)} placeholder="Tenant name" className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1.5" />
                  <datalist id="lease-tenants">{tenants.map((t) => <option key={t} value={t} />)}</datalist>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-gray-600">Rent roll unit(s)</span>
                  {units.length ? (
                    <select multiple value={newUnits} onChange={(e) => setNewUnits([...e.target.selectedOptions].map((o) => o.value))} className="h-20 w-64 rounded-md border border-gray-300 bg-white px-1 py-1">
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.tenantName ? ` · ${u.tenantName}` : " · vacant"}</option>)}
                    </select>
                  ) : (
                    <span className="w-64 py-1.5 text-gray-400">No rent roll yet: the lease can create the unit later.</span>
                  )}
                </label>
              </div>
              <FilePicker files={newFiles} onChange={setNewFiles} disabled={busy} />
              <button type="submit" disabled={busy || !newFiles.length} className={`${btn} border-blue-600 bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700`}>
                {busy ? "Uploading…" : `Upload lease${newFiles.length ? ` (${newFiles.length} document${newFiles.length > 1 ? "s" : ""})` : ""}`}
              </button>
            </form>
          )}
          {!canEdit && <p className="text-xs text-gray-500">You can open these documents. Owners and editors can add and change them.</p>}

          {view !== "leases" ? null : leases === null ? (
            <p className="text-xs text-gray-400">Loading leases…</p>
          ) : shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
              {scope === "asset" ? `No leases for ${deal?.inputs?.propertyName || "this asset"} yet.` : "No leases in this fund yet."}
              {" "}Sample leases for every Model Fund I asset are in the repository under docs/sample-leases.
            </div>
          ) : (
            <div className="space-y-4">
              {scope === "fund" && <p className="text-xs text-gray-500">{fundCount} lease{fundCount === 1 ? "" : "s"} across {byAsset.length} of {fundDeals.length} assets.</p>}
              {byAsset.map(([dealId, ls]) => (
                <div key={dealId} className="space-y-2">
                  {scope === "fund" && <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dealName(dealId)}</h3>}
                  {ls.map((l) => (
                    <LeaseCard
                      key={l.id}
                      lease={l}
                      assetName={dealName(l.deal_id)}
                      units={unitsOf(l.deal_id)}
                      inputs={inputsOf(l.deal_id)}
                      onApply={onApplyUnits}
                      credit={creditFor?.filter((c) => c.lease_id === l.id)}
                      onCreditChanged={refreshCredit}
                      dealDocs={dealDocs}
                      canEdit={canEdit}
                      workspaceId={wsId}
                      email={email}
                      userId={userId}
                      onChanged={refresh}
                      onError={setError}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
