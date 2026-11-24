"use client";

// Acquisitions → Acquisition Documents (user, 11/24): every document from
// buying an asset, by deal stage, for Deal Screener deals, pipeline deals
// and owned assets. The same store as Library → Documents (each file kept
// once), where Claude reads them in. Loan, rate cap and insurance documents
// are shown read-only (uploaded on Debt and Property Management).
import { useEffect, useMemo, useState } from "react";
import { ACQ_STAGES, ACQ_UPLOAD_TYPES, acquisitionDocs, uploadAcqDoc } from "@/lib/acquisitionDocs";
import { dealFileLink, listDealDocs } from "@/lib/dealDocs";

const sel = "rounded border border-gray-200 px-1.5 py-1 text-xs";
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const READ_ONLY_WHERE = { loan: "Debt", rate_cap: "Debt", insurance_cert: "Insurance" };

export default function AcquisitionDocs({ workspaceId = null, email = null, deals = [], pipeline = [], canEdit = false, scopeName = "", onOpenLibrary }) {
  const [docs, setDocs] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState({ deal: "", type: "", stage: "" });
  const [up, setUp] = useState({ deal: "", type: "om" });
  const [busy, setBusy] = useState(false);
  const load = () => { if (!workspaceId) return; listDealDocs(workspaceId).then(setDocs).catch((e) => setErr(e.message)); };
  useEffect(load, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => acquisitionDocs(docs ?? [], deals, pipeline), [docs, deals, pipeline]);
  const shown = rows.filter((r) => (!filter.deal || r.dealId === filter.deal) && (!filter.type || r.type === filter.type) && (!filter.stage || r.group === filter.stage));
  const dealOpts = useMemo(() => [...deals].filter((d) => d.inputs?.propertyName).sort((a, b) => a.inputs.propertyName.localeCompare(b.inputs.propertyName)), [deals]);
  const upload = async (file) => {
    if (!file || !up.deal) return;
    setBusy(true); setErr("");
    try { await uploadAcqDoc(workspaceId, { dealId: up.deal, type: up.type, file }, email); load(); setFilter((f) => ({ ...f, deal: up.deal })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const have = new Set(rows.filter((r) => r.dealId === filter.deal).map((r) => r.type));
  return (
    <div className="space-y-3 text-gray-900" data-testid="acq-documents">
      <div>
        <h2 className="text-lg font-bold">Acquisition Documents</h2>
        <p className="text-xs text-gray-500">{scopeName ? `${scopeName}: e` : "E"}very document from buying an asset, by deal stage, for Deal Screener deals, pipeline deals and owned assets. The same store as Library → Documents, where Claude reads them in. Loan, rate cap and insurance documents are shown here read-only; upload them on Debt and Insurance.</p>
      </div>
      {!workspaceId ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">Sign in to the firm to see and upload documents.</p> : (
        <>
          {canEdit && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs" data-testid="acq-upload">
              <label className="flex flex-col gap-0.5">Deal or asset<select aria-label="Upload for deal" value={up.deal} onChange={(e) => setUp({ ...up, deal: e.target.value })} className={sel}><option value="">Choose…</option>{dealOpts.map((d) => <option key={d.id} value={d.id}>{d.inputs.propertyName}{d.inputs.fundName ? ` · ${d.inputs.fundName}` : " · Deal Screener"}</option>)}</select></label>
              <label className="flex flex-col gap-0.5">Document<select aria-label="Upload type" value={up.type} onChange={(e) => setUp({ ...up, type: e.target.value })} className={sel}>{ACQ_STAGES.map(([s, sl, ts]) => <optgroup key={s} label={sl}>{ts.filter(([k]) => ACQ_UPLOAD_TYPES.some((t) => t.key === k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}</select></label>
              <label className={`rounded-lg border px-3 py-1.5 font-medium ${up.deal && !busy ? "cursor-pointer border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "border-gray-200 bg-white text-gray-400"}`}>
                {busy ? "Uploading…" : "Upload PDF"}
                <input type="file" accept="application/pdf" className="hidden" data-testid="acq-file" disabled={!up.deal || busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }} />
              </label>
            </div>
          )}
          {err && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{err}</p>}
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="flex items-center gap-1">Deal<select aria-label="Filter deal" value={filter.deal} onChange={(e) => setFilter({ ...filter, deal: e.target.value })} className={sel}><option value="">All</option>{dealOpts.map((d) => <option key={d.id} value={d.id}>{d.inputs.propertyName}</option>)}</select></label>
            <label className="flex items-center gap-1">Stage<select aria-label="Filter stage" value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })} className={sel}><option value="">All</option>{ACQ_STAGES.map(([s, sl]) => <option key={s} value={s}>{sl}</option>)}</select></label>
            <label className="flex items-center gap-1">Document<select aria-label="Filter type" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} className={sel}><option value="">All</option>{ACQ_STAGES.map(([s, sl, ts]) => <optgroup key={s} label={sl}>{ts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}</select></label>
          </div>
          {filter.deal && (
            <div className="grid gap-2 rounded-xl border border-gray-200 p-3 text-xs sm:grid-cols-2 lg:grid-cols-5" data-testid="acq-checklist">
              {ACQ_STAGES.map(([s, sl, ts]) => (
                <div key={s}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{sl}</p>
                  <ul className="space-y-0.5">{ts.map(([k, l, how]) => <li key={k} className={have.has(k) ? "text-emerald-700" : "text-gray-400"}>{have.has(k) ? "✓" : "○"} {l}{how === "readonly" ? <span className="text-gray-400"> (on {READ_ONLY_WHERE[k]})</span> : null}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
          {docs == null ? <p className="text-xs text-gray-400">Loading…</p> : shown.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No acquisition documents yet.</p> : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500"><tr>{["Deal or asset", "Status", "Stage", "Document", "File", "Read in", "Uploaded"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>{shown.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100" data-testid="acq-doc-row">
                    <td className="px-2 py-1.5 font-medium">{r.deal}{r.fund && <span className="block text-[10px] font-normal text-gray-400">{r.fund}</span>}</td>
                    <td className="px-2 py-1.5 text-gray-600">{r.status}</td>
                    <td className="px-2 py-1.5 text-gray-600">{r.groupLabel}</td>
                    <td className="px-2 py-1.5">{r.typeLabel}{r.readOnly && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500" title={`Uploaded on ${READ_ONLY_WHERE[r.type]}`}>read-only · {READ_ONLY_WHERE[r.type]}</span>}</td>
                    <td className="px-2 py-1.5"><button type="button" onClick={async () => { const f = r.doc.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); }} className="text-blue-700 hover:underline">{r.name}</button>{r.files > 1 && <span className="ml-1 text-gray-400">+{r.files - 1}</span>}</td>
                    <td className="px-2 py-1.5">{r.abstracted ? <span className="text-emerald-700">Yes</span> : ["om", "rent_roll", "t12", "loi", "psa", "ic_memo", "closing_acq", "estoppel"].includes(r.type) && onOpenLibrary ? <button type="button" onClick={onOpenLibrary} className="text-blue-700 hover:underline">Read in →</button> : <span className="text-gray-400">Stored</span>}</td>
                    <td className="px-2 py-1.5 text-gray-500">{usDate(String(r.uploadedAt ?? "").slice(0, 10))}{r.by ? ` · ${r.by}` : ""}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
