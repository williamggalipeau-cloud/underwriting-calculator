"use client";

// 1.1.17 (user, 11/27): SNDAs. A status for each lease, the loan's rule for
// which leases need one, the signed documents (uploaded here, read by
// Claude) and coverage of the loan. Shown on the Leases tab.
import { useEffect, useRef, useState } from "react";
import { SNDA_RULES, SNDA_STATUSES, SNDA_TAG, applySndaDoc, setSnda, sndaCoverage, sndaDocRows, sndaDocs, sndaRows, sndaRuleOf, sndaXlsx } from "@/lib/snda";
import { createDealDocWithFallback, dealFileLink, listDealDocs } from "@/lib/dealDocs";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const pct = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(0)}%`);
const CLS = { signed: "bg-emerald-100 text-emerald-800", requested: "bg-amber-100 text-amber-800", required: "bg-red-100 text-red-800", not_required: "bg-gray-100 text-gray-700" };
const inp = "rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs disabled:border-transparent disabled:bg-transparent";

export function SndaBadge({ status, label }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CLS[status] ?? CLS.not_required}`} data-testid="snda-badge">{label}</span>;
}

function AssetSnda({ deal, canEdit, onUpdateInputs, workspaceId, email, docs, reload, todayISO }) {
  const inputs = deal.inputs;
  const rows = sndaRows(inputs);
  const cov = sndaCoverage(inputs);
  const rule = sndaRuleOf(inputs);
  const lender = inputs.loanTerms?.lender || inputs.lenderName || "";
  const mine = sndaDocs(docs, deal.id);
  const fileRef = useRef(null);
  const [target, setTarget] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState("");
  const update = (fn) => onUpdateInputs?.(deal.id, fn);
  const setRule = (patch) => update((cur) => ({ ...cur, loanTerms: { ...(cur.loanTerms ?? {}), ...patch } }));
  const setStatus = (unitId, status) => update((cur) => setSnda(cur, unitId, { status, lender: status && status !== "not_required" ? (cur.units.find((u) => u.id === unitId)?.snda?.lender || lender) : "", ...(status === "requested" ? { requestedOn: cur.units.find((u) => u.id === unitId)?.snda?.requestedOn || todayISO } : {}), ...(status === "signed" ? { signedOn: cur.units.find((u) => u.id === unitId)?.snda?.signedOn || todayISO } : {}) }));
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !target || !workspaceId) return;
    try {
      await createDealDocWithFallback(workspaceId, { dealId: deal.id, fundName: inputs.fundName ?? "", docType: "other", title: `${SNDA_TAG(target.unit)} ${file.name}`, files: [file] }, email);
      await reload();
      setMsg(`Uploaded the SNDA for ${target.tenant}. Have Claude read it (Library → Documents), then apply it here to mark the lease signed.`);
    } catch (err) { setMsg(`Couldn't upload: ${err.message || err}`); }
  }
  const openFile = async (d) => { const f = d.doc.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); };
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid="snda-asset">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{inputs.propertyName || deal.id}</p>
          <p className="text-gray-500">Lender: {lender || "not entered"} · <span data-testid="snda-coverage">{cov.label}{cov.required ? ` · ${cov.signed} of ${cov.required} required signed` : ""} · rent covered {pct(cov.rentCoveredPct)} · SF covered {pct(cov.sfCoveredPct)}</span></p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col"><span className="text-[10px] text-gray-500">The loan requires an SNDA from</span>
            <select aria-label="SNDA rule" value={rule.rule} disabled={!canEdit} onChange={(e) => setRule({ sndaRule: e.target.value })} className={inp} data-testid="snda-rule">{SNDA_RULES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          {rule.rule === "min_sf" && <label className="flex flex-col"><span className="text-[10px] text-gray-500">Size (SF)</span><input aria-label="SNDA minimum SF" type="number" value={inputs.loanTerms?.sndaMinSF ?? ""} disabled={!canEdit} onChange={(e) => setRule({ sndaMinSF: e.target.value === "" ? null : Number(e.target.value) })} className={`${inp} w-24`} /></label>}
        </div>
      </div>
      {rule.rule === "none" && <p className="rounded bg-gray-50 px-2 py-1 text-gray-600" data-testid="snda-none">No requirement is set for this loan, so none is assumed. Set it above when the loan agreement says which leases need one.</p>}
      {msg && <p className="rounded bg-blue-50 px-2 py-1 text-blue-900" role="status">{msg}</p>}
      <div className="overflow-x-auto">
        <table className="w-full tabular-nums">
          <thead className="text-gray-500"><tr>{["Unit", "Tenant", "SF", "Lease end", "SNDA", "Lender", "Requested", "Signed", "Document"].map((h) => <th key={h} className={`px-1.5 py-1 font-medium ${h === "SF" ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const d = mine.filter((x) => x.unit === r.unit);
              return (
                <tr key={r.unitId} className="border-t border-gray-100 align-top" data-testid="snda-row">
                  <td className="px-1.5 py-1">{r.unit}</td><td className="px-1.5 py-1">{r.tenant}</td><td className="px-1.5 py-1 text-right">{Math.round(r.sf).toLocaleString("en-US")}</td><td className="px-1.5 py-1">{usDate(r.leaseEnd)}</td>
                  <td className="px-1.5 py-1">
                    <SndaBadge status={r.status} label={r.label} />
                    {canEdit && <select aria-label={`SNDA status for ${r.tenant}`} value={r.entered ? r.status : ""} onChange={(e) => setStatus(r.unitId, e.target.value)} className={`${inp} ml-1`}>{SNDA_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                  </td>
                  <td className="px-1.5 py-1">{r.required ? r.lender || lender : "—"}</td>
                  <td className="px-1.5 py-1">{r.status === "requested" || r.requestedOn ? (canEdit ? <input aria-label={`SNDA requested date for ${r.tenant}`} type="date" value={r.requestedOn} onChange={(e) => update((cur) => setSnda(cur, r.unitId, { requestedOn: e.target.value }))} className={inp} /> : usDate(r.requestedOn)) : "—"}</td>
                  <td className="px-1.5 py-1">{r.signed ? (canEdit ? <input aria-label={`SNDA signed date for ${r.tenant}`} type="date" value={r.signedOn} onChange={(e) => update((cur) => setSnda(cur, r.unitId, { signedOn: e.target.value }))} className={inp} /> : usDate(r.signedOn)) : "—"}</td>
                  <td className="px-1.5 py-1">
                    {d.map((x) => (
                      <span key={x.id} className="mr-2 inline-flex items-center gap-1" data-testid="snda-doc">
                        <button type="button" onClick={() => openFile(x)} className="text-blue-700 hover:underline">{x.name}</button>
                        {x.doc.abstract?.doc_type === "snda" && <button type="button" onClick={() => setOpen(open === x.id ? null : x.id)} className="rounded border border-gray-300 px-1 text-[10px]" data-testid="snda-terms">{open === x.id ? "Hide terms" : "Terms"}</button>}
                      </span>
                    ))}
                    {canEdit && workspaceId && <button type="button" onClick={() => { setTarget(r); fileRef.current?.click(); }} className="text-[11px] text-blue-700 hover:underline" data-testid="snda-upload">Upload PDF</button>}
                    {d.filter((x) => x.id === open).map((x) => {
                      const terms = sndaDocRows(x.doc.abstract, inputs);
                      return (
                        <div key={x.id} className="mt-1 rounded border border-gray-200 bg-gray-50 p-2" data-testid="snda-terms-panel">
                          <table className="w-full"><tbody>{terms.map((t) => <tr key={t.key} className="align-top"><td className="pr-2 text-gray-500">{t.label}</td><td className={t.ok === false ? "font-medium text-red-700" : ""}>{String(t.value)}{t.ok === false && t.now ? ` (the asset has ${t.now})` : ""}{t.quote && <span className="block text-[10px] italic text-gray-500">&quot;{t.quote}&quot;</span>}</td></tr>)}</tbody></table>
                          {canEdit && !r.signed && <button type="button" onClick={() => update((cur) => applySndaDoc(cur, x.doc.abstract, x.id).inputs)} className="mt-1 rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white" data-testid="snda-apply">Mark this lease signed from the document</button>}
                        </div>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={9} className="px-1.5 py-2 text-gray-500">No occupied units on the rent roll.</td></tr>}
          </tbody>
        </table>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden" data-testid="snda-file" onChange={onFile} />
    </div>
  );
}

export default function SndaView({ deals = [], title = "", canEdit = false, onUpdateInputs, workspaceId = null, email = null, todayISO = new Date().toISOString().slice(0, 10) }) {
  const [docs, setDocs] = useState([]);
  const reload = () => (workspaceId ? listDealDocs(workspaceId).then(setDocs).catch(() => {}) : Promise.resolve());
  useEffect(() => { reload(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportX = async () => downloadBlob(await writeXlsx(sndaXlsx(deals), { sheetName: "SNDAs" }), `${safeFileName(title || "snda")}-sndas-${todayISO}.xlsx`);
  return (
    <div className="space-y-3" data-testid="snda-view">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="max-w-3xl text-xs text-gray-500">A subordination, non-disturbance and attornment agreement (SNDA) is signed by the tenant, the landlord and the lender. Each lease has a status; the loan&apos;s rule says which leases need one. Upload the signed PDF on its lease; once Claude has read it, apply it to mark the lease signed.</p>
        <button type="button" onClick={exportX} disabled={!deals.length} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40" data-testid="snda-excel">Excel</button>
      </div>
      {deals.map((d) => <AssetSnda key={d.id} deal={d} canEdit={canEdit} onUpdateInputs={onUpdateInputs} workspaceId={workspaceId} email={email} docs={docs} reload={reload} todayISO={todayISO} />)}
      {deals.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No assets.</p>}
    </div>
  );
}
