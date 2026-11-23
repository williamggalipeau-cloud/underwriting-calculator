"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOC_TYPES, TYPE, BLOCKS, FIELDS, checkLocally, dealDocPrompt, parseDealAbstract } from "@/lib/dealDocTypes";
import { applyDoc, applyRentRoll, appraisalMark, billingCheck, camCheck, capChecks, capFromDoc, compareDoc, estoppelChecks, icVariance, insuranceGaps, rentRollDiff } from "@/lib/dealDocApply";
import { createDealDoc, dealFileLink, dealFileLinks, deleteDealDoc, listDealDocs, saveDealAbstract, updateDealDoc } from "@/lib/dealDocs";
import { listLeases, PROJECT_REF, fmtBytes, MAX_FILE_MB } from "@/lib/leaseDocs";
import { newUnit } from "@/components/UnitRoll";
import { underwrite } from "@/lib/calculations";

const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const STATUS = { uploaded: ["Uploaded – not abstracted", "border-gray-200 bg-gray-50 text-gray-700"], abstracted: ["Abstracted – review", "border-amber-200 bg-amber-50 text-amber-800"], applied: ["Applied", "border-emerald-200 bg-emerald-50 text-emerald-800"] };
const FIELD_STYLE = { found: "bg-emerald-50 text-emerald-700", calculated: "bg-blue-50 text-blue-700", unclear: "bg-amber-50 text-amber-800", not_in_document: "bg-gray-100 text-gray-500" };
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" }) : "—");
const show = (kind, v) => {
  if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return "—";
  if (kind === "money") return `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (kind === "pct") return `${Number(v).toFixed(2)}%`;
  if (kind === "x") return `${Number(v).toFixed(2)}x`;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v);
};

// Values with their quotes, page links and status.
function DocViewer({ doc, onOpen }) {
  const a = doc.abstract;
  const t = TYPE[doc.doc_type];
  const fields = FIELDS[doc.doc_type] ?? [];
  const labelOf = (k) => fields.find((f) => f[0] === k)?.[1] ?? k.replace(/_/g, " ");
  const block = BLOCKS[doc.doc_type];
  const rows = block ? a[block.key] ?? [] : [];
  const problems = useMemo(() => checkLocally(a), [a]);
  const file = doc.files?.[0];
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-xs" data-testid="doc-viewer">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{a.title || t?.label}</p>
          {a.summary && <p className="max-w-3xl text-gray-600">{a.summary}</p>}
        </div>
        <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${a.app?.validated ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {a.app?.validated ? "✓ Validated by the connector" : problems.length ? `Not connector-validated · ${problems.length} local check issue${problems.length === 1 ? "" : "s"}` : "Not connector-validated · checked locally"}
        </span>
      </div>
      {problems.length > 0 && <ul className="list-disc pl-5 text-[11px] text-amber-800">{problems.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}</ul>}
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-white">
        {(a.fields ?? []).map((f) => (
          <div key={f.key} className="grid gap-x-3 px-2.5 py-1.5 sm:grid-cols-[13rem_1fr]">
            <div className="text-gray-500">{labelOf(f.key)}{f.clause && <span className="ml-1 text-[10px] text-gray-400">§ {f.clause}</span>}</div>
            <div>
              <span className="text-gray-900">{f.value}</span>
              <span className={`ml-1.5 rounded px-1 py-px text-[10px] ${FIELD_STYLE[f.status] ?? ""}`}>{f.status}</span>
              {f.calculation && <p className="text-[11px] text-blue-700">= {f.calculation}</p>}
              {(f.evidence ?? []).map((e, i) => (
                <p key={i} className="text-[11px] italic text-gray-500">“{e.quote}”{e.page && file && <button type="button" onClick={() => onOpen(file.path, e.page)} className="ml-1 not-italic text-blue-600 hover:underline">p. {e.page}</button>}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
      {block && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
          <p className="px-2.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{block.label} ({rows.length})</p>
          <table className="w-full tabular-nums">
            <thead className="text-gray-500"><tr>{block.cols.map(([k, l]) => <th key={k} className="px-2 py-1 text-left font-medium">{l}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-gray-100">{block.cols.map(([k]) => <td key={k} className="px-2 py-1">{typeof r[k] === "boolean" ? (r[k] ? "Yes" : "No") : r[k] ?? "—"}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {(a.critical_dates ?? []).length > 0 && (
        <p className="text-[11px] text-gray-600"><span className="font-medium">Dates</span> (shown on Leases → Critical dates): {a.critical_dates.map((d) => `${d.date} ${d.label}`).join(" · ")}</p>
      )}
    </div>
  );
}

// Review with Claude: the prompt, and Save abstract (paste).
function ReviewPanel({ doc, assetName, userId, email, onSaved, onError }) {
  const [prompt, setPrompt] = useState("");
  const [paste, setPaste] = useState("");
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    try {
      const links = await dealFileLinks(doc);
      setPrompt(dealDocPrompt({ doc, assetName, links, saver: userId ? { userId, email, projectRef: PROJECT_REF } : null }));
    } catch (e) { onError(e.message || String(e)); }
  };
  const save = async () => {
    const { abstract, errors: errs } = parseDealAbstract(paste, doc.doc_type);
    setErrors(errs);
    if (!abstract || errs.length) return;
    abstract.app = { ...abstract.app, checked_locally: checkLocally(abstract).length === 0 };
    setBusy(true);
    try { await saveDealAbstract(doc.id, abstract); setPaste(""); await onSaved(); } catch (e) { onError(e.message || String(e)); } finally { setBusy(false); }
  };
  const t = TYPE[doc.doc_type];
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs" data-testid="review-panel">
      <p className="text-gray-600">
        {t?.validator ? `A Claude session with the CREparser Deal Review connector reads and validates it (${t.validator}; it never opens the connector's viewer, so no free documents are used).` : "A Claude session with the CREparser Deal Review connector reads it and quotes every value; there's no connector validator for this type, so the app checks the quotes locally."}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={make} disabled={!(doc.files ?? []).length} className={`${btn} border-blue-600 bg-blue-600 text-white`}>{prompt ? "Make a new prompt" : "Create prompt"}</button>
        {prompt && <button type="button" onClick={() => navigator.clipboard?.writeText(prompt)} className={`${btn} border-gray-200 bg-white text-gray-700`}>Copy prompt</button>}
      </div>
      {prompt && <textarea readOnly value={prompt} aria-label="Document prompt" className="h-36 w-full rounded-md border border-gray-200 bg-white p-2 font-mono text-[11px]" />}
      <textarea value={paste} onChange={(e) => { setPaste(e.target.value); setErrors([]); }} placeholder='{ "doc_type": "…", "fields": [ … ], "critical_dates": [ … ] }' aria-label="Document abstract JSON" className="h-24 w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-[11px]" />
      {errors.length > 0 && <ul className="list-disc pl-5 text-red-700">{errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <button type="button" disabled={busy || !paste.trim()} onClick={save} className={`${btn} border-blue-600 bg-blue-600 text-white`}>{busy ? "Saving…" : "Save abstract"}</button>
    </div>
  );
}

// Apply: app value vs document value per field; tick and apply.
function AppraisalApply({ doc, inputs, marks, onApplyMark, onDone, onError, email }) {
  const results = useMemo(() => { try { return underwrite(inputs); } catch { return null; } }, [inputs]);
  const a = appraisalMark(doc, inputs ?? {}, marks ?? {}, results);
  const [busy, setBusy] = useState(false);
  if (!a) return <p className="mt-2 text-xs text-red-700">The appraisal has no effective date or value.</p>;
  const differs = a.rows.filter((r) => r.differs);
  const apply = async () => {
    setBusy(true);
    try {
      if (!onApplyMark(doc.deal_id, a.quarter, a.mark, differs.map((r) => ({ key: r.key, field: r.label, from: r.appValue, to: r.docValue })), `From appraisal${doc.title ? ` (${doc.title})` : ""}`)) throw new Error("Couldn't change the valuation marks.");
      const now = new Date().toISOString();
      await updateDealDoc(doc.id, { status: "applied", applied_at: now, applied_by_email: email ?? null, applied_fields: { ...(doc.applied_fields ?? {}), [`mark:${a.quarter}`]: { at: now, by: email ?? null } } });
      await onDone();
    } catch (e) { onError(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs" data-testid="doc-apply">
      <p className="font-medium">Valuation mark for {a.quarterLabel} (quarter of the effective date)</p>
      {a.heldAtCost && <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800" data-testid="cost-hold-warning">⚠ {a.quarterLabel} is inside the 6-month cost hold after acquisition: the asset is held at cost that quarter, so this value won&apos;t be used. You can still record it.</p>}
      {a.existing && <p className="text-gray-600">Replaces the {a.existing.source ?? "entered"} mark of {show("money", a.existing.value)}.</p>}
      <table className="w-full rounded-lg bg-white">
        <thead className="text-gray-500"><tr><th className="px-2 py-1 text-left font-medium">Mark</th><th className="px-2 py-1 text-left font-medium">Now</th><th className="px-2 py-1 text-left font-medium">Appraisal</th></tr></thead>
        <tbody>{a.rows.map((r) => <tr key={r.key} className={`border-t border-gray-100 ${r.differs ? "" : "text-gray-400"}`}><td className="px-2 py-1">{r.label}</td><td className="px-2 py-1">{show(r.kind, r.appValue)}</td><td className="px-2 py-1">{show(r.kind, r.docValue)}</td></tr>)}</tbody>
      </table>
      {a.vsUw.length > 0 && (
        <table className="w-full rounded-lg bg-white" data-testid="appraisal-vs-uw">
          <thead className="text-gray-500"><tr>{["Appraisal vs underwriting", "Appraisal", "Underwriting", "Difference"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{a.vsUw.map((r) => <tr key={r.label} className="border-t border-gray-100"><td className="px-2 py-1">{r.label}</td><td className="px-2 py-1">{show(r.kind, r.appraisal)}</td><td className="px-2 py-1">{show(r.kind, r.underwriting)}</td><td className={`px-2 py-1 ${Math.abs(r.diffPct ?? (r.diffBp ?? 0) / 10) > 5 ? "font-medium text-amber-800" : ""}`}>{r.diffPct != null ? `${r.diffPct >= 0 ? "+" : ""}${r.diffPct.toFixed(1)}%` : `${r.diffBp >= 0 ? "+" : ""}${Math.round(r.diffBp)} bp`}</td></tr>)}</tbody>
        </table>
      )}
      <button type="button" disabled={busy || !differs.length} onClick={apply} className={`${btn} border-emerald-600 bg-emerald-600 text-white`}>{differs.length ? `Apply to the ${a.quarterLabel} mark` : "Already applied"}</button>
    </div>
  );
}

// Estoppel, CAM reconciliation and billing: checks only (nothing to apply).
function CheckPanel({ doc, leases, units }) {
  const t = doc.doc_type;
  const cell = (v) => (typeof v === "number" ? show("money", v) : v == null || v === "" ? "—" : String(v));
  if (t === "estoppel") {
    const lease = leases.find((l) => l.id === doc.lease_id);
    const unit = lease ? (units ?? []).find((u) => (lease.unit_ids ?? []).includes(u.id)) : null;
    const rows = estoppelChecks(doc, lease?.abstract ?? null, unit);
    return (
      <div className="mt-2 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs" data-testid="doc-apply">
        <p className="font-medium">{lease ? `Checked against ${lease.tenant || "the lease"}'s abstract${unit ? ` and unit ${unit.name}` : " (no rent roll unit linked)"}` : "Link this estoppel to its lease (upload it with the tenant chosen) to check it"}</p>
        <table className="w-full rounded bg-white"><thead className="text-gray-500"><tr>{["", "Estoppel", "Lease abstract", "Rent roll"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label} className={`border-t border-gray-100 ${r.ok ? "text-gray-500" : r.severity === "high" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`} data-testid="estoppel-row"><td className="px-2 py-1 font-medium">{r.ok ? "✓" : "⚠"} {r.label}</td><td className="px-2 py-1">{cell(r.estoppel)}</td><td className="px-2 py-1">{cell(r.lease)}</td><td className="px-2 py-1">{cell(r.unit)}</td></tr>)}</tbody></table>
      </div>
    );
  }
  if (t === "cam") {
    const c = camCheck(doc, leases);
    return (
      <div className="mt-2 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs" data-testid="doc-apply">
        <p className="font-medium">Recoverable under each lease vs billed{isFinite(c.fee.pct) ? ` · management fee ${c.fee.pct.toFixed(2)}% of revenue` : ""}</p>
        <table className="w-full rounded bg-white tabular-nums"><thead className="text-gray-500"><tr>{["Tenant", "Lease share", "Billed share", "Recoverable", "Billed", "Over (+) / under (−)", "Issues"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{c.tenants.map((r) => <tr key={r.tenant} className="border-t border-gray-100 align-top" data-testid="cam-row"><td className="px-2 py-1">{r.tenant}</td>{r.noLease ? <td colSpan={6} className="px-2 py-1 text-gray-500">No abstracted lease to check against</td> : <><td className="px-2 py-1">{r.share}%</td><td className="px-2 py-1">{isFinite(r.billedShare) ? `${r.billedShare}%` : "—"}</td><td className="px-2 py-1">{show("money", r.recoverable)}</td><td className="px-2 py-1">{show("money", r.billed)}</td><td className={`px-2 py-1 font-medium ${Math.abs(r.diff) > 1 ? (r.diff > 0 ? "text-red-700" : "text-amber-700") : "text-emerald-700"}`}>{isFinite(r.diff) ? `${r.diff > 0 ? "+" : r.diff < 0 ? "−" : ""}${show("money", Math.abs(r.diff))}` : "—"}</td><td className="px-2 py-1">{r.issues.join("; ") || "—"}</td></>}</tr>)}</tbody></table>
        <p className="text-[11px] text-gray-500">Recoverable = lease share × (expenses − management fee over the lease cap) − base year amount. Over-recovery (+) is owed back to the tenant; under-recovery (−) can be billed.</p>
      </div>
    );
  }
  const rows = billingCheck(doc, leases);
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs" data-testid="doc-apply">
      <p className="font-medium">Billed base rent vs the lease&apos;s rent schedule</p>
      <table className="w-full rounded bg-white tabular-nums"><thead className="text-gray-500"><tr>{["Tenant", "Month", "Billed", "Per the lease", "Difference"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-gray-100" data-testid="billing-row"><td className="px-2 py-1">{r.tenant}</td><td className="px-2 py-1">{r.month}</td><td className="px-2 py-1">{show("money", r.billed)}</td><td className="px-2 py-1">{r.noLease ? "no lease" : show("money", r.due)}</td><td className={`px-2 py-1 font-medium ${Math.abs(r.diff) > 0.5 ? "text-red-700" : "text-emerald-700"}`}>{isFinite(r.diff) ? (Math.abs(r.diff) > 0.5 ? `${r.diff > 0 ? "over-billed" : "under-billed"} ${show("money", Math.abs(r.diff))}` : "✓") : "—"}</td></tr>)}</tbody></table>
    </div>
  );
}

function ApplyPanel({ doc, inputs, terms, units, leaseAbs, leases, marks, onApplyMark, onApplyDeal, onApplyFund, onNewDeal, onDone, onError, email }) {
  if (["estoppel", "cam", "billing"].includes(doc.doc_type)) return <CheckPanel doc={doc} leases={leases ?? []} units={units} />;
  if (doc.doc_type === "appraisal") return <AppraisalApply doc={doc} inputs={inputs} marks={marks} onApplyMark={onApplyMark} onDone={onDone} onError={onError} email={email} />;
  return <ApplyPanelInner doc={doc} inputs={inputs} terms={terms} units={units} leaseAbs={leaseAbs} onApplyDeal={onApplyDeal} onApplyFund={onApplyFund} onNewDeal={onNewDeal} onDone={onDone} onError={onError} email={email} />;
}

function ApplyPanelInner({ doc, inputs, terms, units, leaseAbs, onApplyDeal, onApplyFund, onNewDeal, onDone, onError, email }) {
  const type = doc.doc_type;
  const fund = TYPE[type]?.scope === "fund";
  const rows = useMemo(() => compareDoc(doc, { inputs: inputs ?? {}, terms: terms ?? {} }), [doc, inputs, terms]);
  const [ticked, setTicked] = useState(() => new Set(rows.filter((r) => r.differs).map((r) => r.key)));
  const [mode, setMode] = useState("merge");
  const [busy, setBusy] = useState(false);
  const toggle = (k) => setTicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const label = `From ${TYPE[type]?.label ?? "document"}${doc.title ? ` (${doc.title})` : ""}`;
  const mark = async (keys) => {
    const now = new Date().toISOString();
    const applied = { ...(doc.applied_fields ?? {}) };
    for (const k of keys) applied[k] = { at: now, by: email ?? null };
    await updateDealDoc(doc.id, { status: "applied", applied_at: now, applied_by_email: email ?? null, applied_fields: applied });
  };
  const run = async (fn) => { setBusy(true); try { await fn(); await onDone(); } catch (e) { onError(e.message || String(e)); } finally { setBusy(false); } };

  if (type === "rent_roll") {
    const make = (name, sf) => newUnit(name, sf, inputs);
    const d = rentRollDiff(doc.abstract, units ?? [], inputs, make);
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs" data-testid="doc-apply">
        <p><span className="font-medium">{d.added.length} new</span> · <span className="font-medium">{d.changed.length} changed</span> · <span className="font-medium">{d.removed.length} not in the document</span> · {d.unchanged} unchanged</p>
        {d.changed.length > 0 && <ul className="list-disc pl-5">{d.changed.map((c) => <li key={c.unit.id}>Unit {c.unit.name}: {c.diffs.map((x) => `${x.label} ${show("text", x.from)} → ${show("text", x.to)}`).join("; ")}</li>)}</ul>}
        {d.added.length > 0 && <p>New: {d.added.map((u) => `${u.name} (${u.squareFeet} SF${u.tenantName ? `, ${u.tenantName}` : ""})`).join(", ")}</p>}
        {d.removed.length > 0 && <p className="text-amber-800">Not in the document: {d.removed.map((u) => u.name).join(", ")}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1"><input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge (update and add; keep the rest)</label>
          <label className="flex items-center gap-1"><input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace (remove units not in the document)</label>
          <button type="button" disabled={busy} onClick={() => run(async () => {
            const r = applyRentRoll(doc.abstract, units ?? [], inputs, make, mode);
            if (!onApplyDeal(doc.deal_id, (inp) => ({ ...inp, units: r.units }), r.entries, label)) throw new Error("Couldn't change the rent roll: open this asset and try again.");
            await mark(["units"]);
          })} className={`${btn} border-emerald-600 bg-emerald-600 text-white`}>Apply rent roll</button>
        </div>
      </div>
    );
  }

  const gaps = type === "insurance_cert" ? insuranceGaps(doc.abstract, { leaseAbs }) : type === "rate_cap" ? capChecks(capFromDoc(doc, inputs ?? {}), inputs ?? {}) : null;
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs" data-testid="doc-apply">
      {gaps && (
        <div className="space-y-1">
          <p className="font-medium">{type === "rate_cap" ? "Checked against the loan agreement's cap requirement and the loan" : leaseAbs ? "Checked against the tenant's lease requirements and policy dates" : "Policy dates checked (owner policies)"}</p>
          {gaps.length ? gaps.map((g, i) => <p key={i} className={`rounded border px-2 py-1 ${g.severity === "high" ? "border-red-200 bg-red-50 text-red-800" : g.severity === "medium" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-gray-200 bg-white"}`} data-testid="insurance-gap">⚠ {g.text}</p>) : <p className="text-emerald-700" data-testid="insurance-gap">✓ No gaps found</p>}
        </div>
      )}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="w-8" /><th className="px-2 py-1.5 text-left font-medium">Field</th><th className="px-2 py-1.5 text-left font-medium">{fund ? "Fund terms now" : "Model now"}</th><th className="px-2 py-1.5 text-left font-medium">Document</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={`border-t border-gray-100 align-top ${r.differs ? "" : "text-gray-400"}`} data-testid={`doc-row-${r.key}`}>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={ticked.has(r.key)} disabled={!r.differs} onChange={() => toggle(r.key)} aria-label={`Apply ${r.label}`} /></td>
                    <td className="px-2 py-1.5 font-medium">{r.label}{doc.applied_fields?.[r.key] && <span className="ml-1 text-[10px] font-normal text-emerald-700">applied {fmtWhen(doc.applied_fields[r.key].at)}</span>}</td>
                    <td className="px-2 py-1.5">{show(r.kind, r.appValue)}</td>
                    <td className={`px-2 py-1.5 ${r.flag ? "font-medium text-amber-800" : ""}`}>{show(r.kind, r.docValue)}{!r.differs && <span className="ml-1 text-[10px]">same</span>}{r.note && <p className="text-[11px] text-gray-500">{r.note}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || ![...ticked].some((k) => rows.find((r) => r.key === k)?.differs)} onClick={() => run(async () => {
              const keys = [...ticked].filter((k) => rows.find((r) => r.key === k)?.differs);
              const res = applyDoc(doc, keys, { inputs: inputs ?? {}, terms: terms ?? {} });
              const ok = fund ? onApplyFund(doc.fund_name, res.terms, res.entries, label) : onApplyDeal(doc.deal_id, () => res.inputs, res.entries, label);
              if (!ok) throw new Error(fund ? "Couldn't change the fund terms." : "Couldn't change the deal: open this asset (or unlock the workspace) and try again.");
              await mark(keys);
            })} className={`${btn} border-emerald-600 bg-emerald-600 text-white`}>Apply {[...ticked].filter((k) => rows.find((r) => r.key === k)?.differs).length} field(s)</button>
            {type === "om" && onNewDeal && (
              <button type="button" disabled={busy} onClick={() => run(async () => {
                const res = applyDoc(doc, rows.map((r) => r.key), { inputs: {}, terms: {} });
                const id = onNewDeal({ ...res.inputs, fundName: inputs?.fundName ?? "" }, `New deal from offering memo${doc.title ? ` (${doc.title})` : ""}`);
                if (!id) throw new Error("Couldn't add the deal.");
                await updateDealDoc(doc.id, { deal_id: id, status: "applied", applied_at: new Date().toISOString(), applied_by_email: email ?? null });
              })} className={`${btn} border-blue-300 bg-white text-blue-700`}>New deal from this OM</button>
            )}
          </div>
          <p className="text-[11px] text-gray-500">Fields you don&apos;t tick keep a mismatch badge on this document. {type === "ic_memo" ? "The as-approved baseline is a reference: it doesn't change the model." : ""}</p>
        </>
      )}
    </div>
  );
}

// IC conditions of approval checklist (ticked off with who and when, logged).
function Conditions({ deal, inputs, onApplyDeal, email }) {
  const conds = inputs?.icConditions ?? [];
  if (!conds.length) return null;
  const tick = (c) => {
    const next = conds.map((x) => (x.id === c.id ? { ...x, done: !x.done, doneBy: !x.done ? email ?? "" : "", doneAt: !x.done ? new Date().toISOString() : "" } : x));
    onApplyDeal(deal, (inp) => ({ ...inp, icConditions: next }), [{ key: "icConditions", field: `IC condition: ${c.text}`, from: c.done ? "done" : "open", to: c.done ? "open" : "done" }], "IC conditions of approval");
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs" data-testid="ic-conditions">
      <p className="mb-1 font-semibold">Conditions of approval ({conds.filter((c) => !c.done).length} open)</p>
      {conds.map((c) => (
        <label key={c.id} className="flex items-start gap-2 py-0.5">
          <input type="checkbox" checked={!!c.done} onChange={() => tick(c)} aria-label={c.text} />
          <span className={c.done ? "text-gray-400 line-through" : ""}>{c.text}{c.deadline ? <span className="ml-1 text-gray-500">(by {c.deadline})</span> : null}{c.done && c.doneBy ? <span className="ml-1 text-[10px] text-gray-400">{c.doneBy}, {fmtWhen(c.doneAt)}</span> : null}</span>
        </label>
      ))}
    </div>
  );
}

// IC approved vs current model.
export function IcVarianceTable({ ic, inputs }) {
  const results = useMemo(() => { try { return underwrite(inputs); } catch { return null; } }, [inputs]);
  const rows = icVariance(ic, inputs, results);
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white text-xs" data-testid="ic-variance">
      <p className="px-2.5 pt-2 font-semibold">IC approved vs current model{ic.approval_date ? ` (approved ${ic.approval_date}${ic.approvers ? ` by ${ic.approvers}` : ""})` : ""}</p>
      <table className="w-full tabular-nums">
        <thead className="text-gray-500"><tr>{["", "Approved", "Current", "Variance"].map((h) => <th key={h} className="px-2.5 py-1 text-right font-medium first:text-left">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-gray-100">
              <td className="px-2.5 py-1">{r.label}</td>
              <td className="px-2.5 py-1 text-right">{show(r.kind, r.approved)}</td>
              <td className="px-2.5 py-1 text-right">{show(r.kind, r.current)}</td>
              <td className={`px-2.5 py-1 text-right ${isFinite(r.diff) && r.diff !== 0 ? "font-medium" : "text-gray-400"}`}>{isFinite(r.diff) ? `${r.diff >= 0 ? "+" : "−"}${show(r.kind, Math.abs(r.diff))}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocCard({ doc, assetName, inputs, terms, units, leaseAbs, leases, marks, canEdit, userId, email, onApplyMark, onApplyDeal, onApplyFund, onNewDeal, onChanged, onError, fundList }) {
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState(false);
  const t = TYPE[doc.doc_type] ?? TYPE.other;
  const open = async (path, page) => {
    try { const url = await dealFileLink(path); window.open(page ? `${url}#page=${page}` : url, "_blank", "noopener"); } catch (e) { onError(e.message || String(e)); }
  };
  const pending = !doc.abstract || ["estoppel", "cam", "billing"].includes(doc.doc_type) ? [] : doc.doc_type === "appraisal" ? (appraisalMark(doc, inputs ?? {}, marks ?? {})?.rows ?? []).filter((r) => r.differs) : compareDoc(doc, { inputs: inputs ?? {}, terms: terms ?? {} }).filter((r) => r.differs);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid="doc-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t.label}{doc.title ? ` · ${doc.title}` : ""}</h3>
          {canEdit && !doc.deal_id && t.scope === "fund" && (fundList ?? []).length > 1 && (
            <label className="mt-0.5 flex items-center gap-1 text-gray-600">Fund
              <select value={doc.fund_name} disabled={busy} aria-label="Move to fund" data-testid="doc-card-fund" className="rounded border border-gray-300 bg-white px-1 py-0.5"
                onChange={async (e) => { setBusy(true); try { await updateDealDoc(doc.id, { fund_name: e.target.value }); await onChanged(); } catch (err) { onError(err.message || String(err)); } finally { setBusy(false); } }}>
                {[...new Set([doc.fund_name, ...fundList])].filter(Boolean).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          )}
          <p className="text-gray-500">{assetName} · added {fmtWhen(doc.created_at)}{doc.created_by_email ? ` by ${doc.created_by_email}` : ""} · applies to: {t.applies}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STATUS[doc.status]?.[1]}`}>{STATUS[doc.status]?.[0]}</span>
          {doc.abstract && pending.length > 0 && <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800" data-testid="doc-mismatch" title={pending.map((r) => r.label).join(", ")}>⚠ {pending.length} field{pending.length === 1 ? "" : "s"} differ from the {TYPE[doc.doc_type]?.scope === "fund" ? "fund terms" : "model"}</span>}
        </div>
      </div>
      <ol className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
        {(doc.files ?? []).map((f, i) => (
          <li key={f.path} className="flex items-center gap-2 px-2 py-1.5">
            <span className="w-5 text-right text-gray-400">{i + 1}.</span>
            <button type="button" onClick={() => open(f.path)} className="min-w-0 flex-1 truncate text-left font-medium text-blue-700 hover:underline">{f.name}</button>
            <span className="text-gray-400">{f.size ? fmtBytes(f.size) : ""}</span>
          </li>
        ))}
      </ol>
      {panel === "view" && doc.abstract && <DocViewer doc={doc} onOpen={open} />}
      {panel === "review" && canEdit && <ReviewPanel doc={doc} assetName={assetName} userId={userId} email={email} onError={onError} onSaved={async () => { setPanel("view"); await onChanged(); }} />}
      {panel === "apply" && canEdit && doc.abstract && <ApplyPanel doc={doc} inputs={inputs} terms={terms} units={units} leaseAbs={leaseAbs} leases={leases} marks={marks} onApplyMark={onApplyMark} onApplyDeal={onApplyDeal} onApplyFund={onApplyFund} onNewDeal={onNewDeal} email={email} onError={onError} onDone={async () => { setPanel(null); await onChanged(); }} />}
      <div className="mt-2 flex flex-wrap gap-2">
        {doc.abstract && <button type="button" onClick={() => setPanel(panel === "view" ? null : "view")} className={`${btn} border-emerald-200 bg-emerald-50 text-emerald-800`}>{panel === "view" ? "Hide abstract" : "View abstract"}</button>}
        {canEdit && doc.abstract && doc.doc_type !== "other" && <button type="button" onClick={() => setPanel(panel === "apply" ? null : "apply")} className={`${btn} border-emerald-300 bg-white text-emerald-800`}>{panel === "apply" ? "Close" : doc.doc_type === "insurance_cert" ? "Check coverage" : ["estoppel", "cam", "billing"].includes(doc.doc_type) ? "Check" : "Apply"}</button>}
        {canEdit && <button type="button" onClick={() => setPanel(panel === "review" ? null : "review")} className={`${btn} border-blue-200 bg-blue-50 text-blue-700`}>{doc.abstract ? "Re-review with Claude" : "Review with Claude"}</button>}
        {canEdit && <button type="button" disabled={busy} onClick={async () => { if (!window.confirm(`Delete this ${t.label.toLowerCase()} and its files?`)) return; setBusy(true); try { await deleteDealDoc(doc); await onChanged(); } catch (e) { onError(e.message || String(e)); } finally { setBusy(false); } }} className={`${btn} ml-auto border-transparent text-gray-400 hover:text-red-600`}>Delete</button>}
      </div>
    </div>
  );
}

export default function Documents({ workspace, signedIn, email, userId, canEdit, deal, fundDeals, fundName, funds, dealInputs, marks, onApplyMark, onApplyDeal, onApplyFund, onNewDeal }) {
  const [scope, setScope] = useState("asset");
  const [docs, setDocs] = useState(null);
  const [leases, setLeases] = useState([]);
  const [error, setError] = useState(null);
  const [type, setType] = useState("om");
  const [title, setTitle] = useState("");
  const [leaseId, setLeaseId] = useState("");
  const [fundSel, setFundSel] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const wsId = workspace?.id;
  const refresh = useCallback(async () => {
    if (!wsId) return;
    try {
      const [d, l] = await Promise.all([listDealDocs(wsId), listLeases(wsId)]);
      setDocs(d);
      setLeases(l);
      setError(null);
    } catch (e) { setError(e.message || String(e)); }
  }, [wsId]);
  useEffect(() => {
    // Loads this workspace's documents; nothing to load without one.
    refresh();
  }, [refresh]);

  const fundIds = useMemo(() => new Set(fundDeals.map((d) => d.id)), [fundDeals]);
  const assetName = (id) => (id === deal?.id ? deal.inputs.propertyName : fundDeals.find((d) => d.id === id)?.inputs?.propertyName ?? "Asset not in this fund");
  const inputsOf = (id) => (id === deal?.id ? deal.inputs : dealInputs?.(id) ?? fundDeals.find((d) => d.id === id)?.inputs ?? null);
  const shown = (docs ?? []).filter((d) => (scope === "asset" ? d.deal_id === deal?.id : (d.deal_id && fundIds.has(d.deal_id)) || (!d.deal_id && d.fund_name === fundName)));
  const fundDocs = shown.filter((d) => !d.deal_id);
  const assetDocs = shown.filter((d) => d.deal_id);
  const fundList = [...new Set([fundName, ...Object.keys(funds ?? {})].filter(Boolean))].sort();
  const types = deal ? DOC_TYPES : DOC_TYPES.filter((x) => x.scope === "fund");
  const t = TYPE[types.some((x) => x.id === type) ? type : types[0]?.id] ?? TYPE[type];
  const toFund = fundSel && fundList.includes(fundSel) ? fundSel : fundName || fundList[0] || "";
  const assetLeases = leases.filter((l) => l.deal_id === deal?.id);
  const icDeals = scope === "fund" ? fundDeals.filter((d) => inputsOf(d.id)?.icApproved) : deal?.inputs?.icApproved ? [deal] : [];

  async function upload(e) {
    e.preventDefault();
    if (!files.length) return;
    setBusy(true);
    try {
      await createDealDoc(wsId, { dealId: t.scope === "fund" ? null : deal.id, fundName: t.scope === "fund" ? toFund : fundName ?? "", docType: t.id, title: title.trim(), leaseId: (type === "insurance_cert" || type === "estoppel") && leaseId ? leaseId : null, files }, email);
      setFiles([]); setTitle(""); setLeaseId("");
      await refresh();
    } catch (err) { setError(err.message || String(err)); } finally { setBusy(false); }
  }

  const card = (d) => (
    <DocCard
      key={d.id}
      doc={d}
      assetName={d.deal_id ? assetName(d.deal_id) : `${d.fund_name || fundName} (fund)`}
      inputs={d.deal_id ? inputsOf(d.deal_id) : null}
      terms={!d.deal_id ? funds?.[d.fund_name] ?? {} : null}
      units={d.deal_id ? inputsOf(d.deal_id)?.units ?? [] : []}
      leaseAbs={d.lease_id ? leases.find((l) => l.id === d.lease_id)?.abstract ?? null : null}
      marks={d.deal_id ? marks?.[d.deal_id] ?? {} : {}}
      leases={leases}
      onApplyMark={onApplyMark}
      canEdit={canEdit}
      userId={userId}
      email={email}
      onApplyDeal={onApplyDeal}
      onApplyFund={onApplyFund}
      onNewDeal={onNewDeal}
      onChanged={refresh}
      onError={setError}
      fundList={fundList}
    />
  );

  return (
    <div className="space-y-4 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Documents</h2>
          <p className="text-xs text-gray-500">Deal and fund documents: offering memo, rent roll, T-12, LOI, PSA, IC memo, closing statements, insurance certificates and the fund&apos;s LPA and PPM. Review each with Claude (CREparser Deal Review connector), check the values against their quotes, and apply them to the model field by field. Deadlines appear on Leases → Critical dates.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
          {[["asset", deal?.inputs?.propertyName || "This asset"], ["fund", `Whole fund${fundName ? ` (${fundName})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-3 py-1 font-medium ${scope === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      </div>
      {!signedIn || !wsId ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">Documents are stored in the database. Sign in and open a workspace to see and upload them.</div>
      ) : (
        <>
          {error && <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"><span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss">✕</button></p>}
          {canEdit && (deal || fundList.length > 0) && (
            <form onSubmit={upload} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-xs" data-testid="doc-upload">
              <h3 className="text-sm font-semibold">Add a document</h3>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-0.5"><span className="text-gray-600">Type</span>
                  <select value={t.id} onChange={(e) => setType(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1.5" aria-label="Document type">
                    {types.map((x) => <option key={x.id} value={x.id}>{x.label}{x.scope === "fund" ? " (fund)" : ""}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5"><span className="text-gray-600">Title (optional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-56 rounded-md border border-gray-300 bg-white px-2 py-1.5" aria-label="Document title" /></label>
                {(type === "insurance_cert" || type === "estoppel") && (
                  <label className="flex flex-col gap-0.5"><span className="text-gray-600">{type === "estoppel" ? "Tenant (lease)" : "Whose policies"}</span>
                    <select value={leaseId} onChange={(e) => setLeaseId(e.target.value)} className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1.5" aria-label="Insured">
                      <option value="">{type === "estoppel" ? "Choose the lease…" : "Owner (the asset's policies)"}</option>
                      {assetLeases.map((l) => <option key={l.id} value={l.id}>Tenant: {l.tenant || "lease"}</option>)}
                    </select>
                  </label>
                )}
                {t.scope === "fund" && (
                  <label className="flex flex-col gap-0.5"><span className="text-gray-600">Assign to fund</span>
                    <select value={toFund} onChange={(e) => setFundSel(e.target.value)} className="w-56 rounded-md border border-gray-300 bg-white px-2 py-1.5" aria-label="Assign to fund" data-testid="doc-fund-select">
                      {fundList.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                )}
                <span className="pb-1.5 text-gray-500">{t.scope === "fund" ? `Stored with the fund ${toFund}` : `For ${deal.inputs.propertyName}`} · applies to {t.applies}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Choose document PDFs" onChange={(e) => { setFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} border-blue-200 bg-white text-blue-700`}>Choose PDFs…</button>
                <span className="text-gray-500">{files.length ? files.map((f) => f.name).join(", ") : `PDF only, up to ${MAX_FILE_MB} MB each, in order`}</span>
                <button type="submit" disabled={busy || !files.length} className={`${btn} border-blue-600 bg-blue-600 text-white`}>{busy ? "Uploading…" : "Upload"}</button>
              </div>
            </form>
          )}
          {!canEdit && <p className="text-xs text-gray-500">You can open these documents and their abstracts. Owners and editors can add, review and apply them.</p>}
          {icDeals.map((d) => (
            <div key={d.id} className="space-y-2">
              {scope === "fund" && <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{d.inputs.propertyName}</h3>}
              <IcVarianceTable ic={inputsOf(d.id).icApproved} inputs={inputsOf(d.id)} />
              {canEdit && <Conditions deal={d.id} inputs={inputsOf(d.id)} onApplyDeal={onApplyDeal} email={email} />}
            </div>
          ))}
          {docs === null ? <p className="text-xs text-gray-400">Loading documents…</p> : shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No documents yet. Sample documents for Airport Flex Park and Model Fund I are in the repository under docs/sample-deal-docs.</div>
          ) : (
            <div className="space-y-3">
              {fundDocs.length > 0 && <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fund documents</h3>}
              {fundDocs.map(card)}
              {scope === "fund" && assetDocs.length > 0 && <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Asset documents</h3>}
              {assetDocs.map(card)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
