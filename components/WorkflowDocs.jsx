"use client";

// Documents panel in a workflow tab (user, 11/24): the library's documents of
// this tab's types, for the assets (or portfolios) the tab shows, with an
// upload limited to those types and a link to the full Document Library.
// Collapsed until opened, so the tab itself stays first.
import { useCallback, useEffect, useState } from "react";
import { TYPE } from "@/lib/dealDocTypes";
import { fundType } from "@/lib/fundTypes";
import { createDealDocWithFallback, dealFileLink, listDealDocs } from "@/lib/dealDocs";
import { MAX_FILE_MB } from "@/lib/leaseDocs";
import { attachesTo, classifyDoc, STATUS_LABEL } from "@/lib/docLibrary";

const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const sel = "rounded-md border border-gray-300 bg-white px-2 py-1";
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" }) : "—");

// types: type ids listed here; uploadTypes: type ids that can be uploaded here;
// deals: the assets in view ({ id, inputs }); portfolios: portfolio names in
// view (for portfolio-level types); funds: terms by name (JVA / SMA by type).
export default function WorkflowDocs({ label = "Documents", workspaceId, canEdit, email, types, uploadTypes = types, deals = [], portfolios = [], funds = {}, onOpenLibrary }) {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [type, setType] = useState(null);
  const [asset, setAsset] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!workspaceId) return;
    try { setDocs(await listDealDocs(workspaceId)); } catch (e) { setError(e.message || String(e)); }
  }, [workspaceId]);
  useEffect(() => { load(); }, [load]);
  if (!workspaceId) return null;

  const ids = new Set(deals.map((d) => d.id));
  const nameOf = (id) => deals.find((d) => d.id === id)?.inputs?.propertyName ?? "";
  const rows = (docs ?? []).map((d) => ({ d, c: classifyDoc(d) }))
    .filter(({ d, c }) => (!types || types.includes(c.typeId)) && (d.deal_id ? ids.has(d.deal_id) : portfolios.includes((d.fund_name ?? "").trim())))
    .sort((a, b) => (b.d.created_at ?? "").localeCompare(a.d.created_at ?? ""));
  const toPortfolio = portfolio && portfolios.includes(portfolio) ? portfolio : portfolios[0] ?? "";
  const upTypes = (uploadTypes ?? []).filter((k) => TYPE[k] && (!TYPE[k].fundType || fundType(funds?.[toPortfolio]?.type) === TYPE[k].fundType) && (attachesTo(k) === "portfolio" ? portfolios.length : deals.length));
  const t = upTypes.includes(type) ? type : upTypes[0];
  const level = t ? attachesTo(t) : "asset";
  const toAsset = asset && ids.has(asset) ? asset : deals[0]?.id ?? "";

  async function upload(files) {
    if (!files.length || !t) return;
    setBusy(true);
    try {
      await createDealDocWithFallback(workspaceId, { dealId: level === "portfolio" ? null : toAsset, fundName: level === "portfolio" ? toPortfolio : (deals.find((d) => d.id === toAsset)?.inputs?.fundName ?? "").trim(), docType: t, title: "", files }, email);
      await load();
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }
  const openFile = async (d) => {
    try { const url = await dealFileLink(d.files?.[0]?.path); window.open(url, "_blank", "noopener"); } catch (e) { setError(e.message || String(e)); }
  };

  return (
    <details className="rounded-xl border border-gray-200 bg-white text-xs" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="workflow-docs">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">{label} <span className="font-normal text-gray-500">({docs === null ? "…" : rows.length})</span></summary>
      <div className="space-y-2 border-t border-gray-100 px-3 py-2">
        {error && <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">{error}</p>}
        {rows.length === 0 ? <p className="text-gray-500">None yet.</p> : (
          <table className="w-full">
            <tbody>
              {rows.map(({ d, c }) => (
                <tr key={d.id} className="border-b border-gray-100 last:border-0" data-testid="workflow-doc">
                  <td className="py-1 pr-2"><span className="font-semibold">{c.name || c.typeLabel}</span><div className="text-[10px] text-gray-500">{c.typeLabel}{d.deal_id ? ` · ${nameOf(d.deal_id)}` : ` · ${d.fund_name}`}</div></td>
                  <td className="whitespace-nowrap py-1 pr-2 text-gray-500">{fmt(d.created_at)}</td>
                  <td className="py-1 pr-2"><span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px]">{STATUS_LABEL[d.status] ?? "Uploaded"}</span></td>
                  <td className="py-1 text-right">{d.files?.length > 0 && <button type="button" onClick={() => openFile(d)} className="font-medium text-blue-700 hover:underline">Open</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {canEdit && upTypes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select value={t} onChange={(e) => setType(e.target.value)} className={sel} aria-label={`${label}: type`}>{upTypes.map((k) => <option key={k} value={k}>{TYPE[k].label}</option>)}</select>
              {level === "portfolio" ? (portfolios.length > 1 && <select value={toPortfolio} onChange={(e) => setPortfolio(e.target.value)} className={sel} aria-label={`${label}: portfolio`}>{portfolios.map((p) => <option key={p} value={p}>{p}</option>)}</select>)
                : (deals.length > 1 && <select value={toAsset} onChange={(e) => setAsset(e.target.value)} className={sel} aria-label={`${label}: asset`}>{deals.map((d) => <option key={d.id} value={d.id}>{d.inputs?.propertyName || "Untitled"}</option>)}</select>)}
              <label className={`${btn} cursor-pointer border-blue-200 bg-white text-blue-700`}>{busy ? "Uploading…" : "+ Upload PDF"}
                <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" disabled={busy} aria-label={`${label}: upload`} onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; upload(f); }} />
              </label>
              <span className="text-gray-500">PDF, up to {MAX_FILE_MB} MB</span>
            </div>
          ) : <span />}
          {onOpenLibrary && <button type="button" onClick={onOpenLibrary} className="text-blue-700 hover:underline">See all in Document Library →</button>}
        </div>
      </div>
    </details>
  );
}
