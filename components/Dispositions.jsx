"use client";

// Phase P: Dispositions group. view: "forsale" | "offers" | "trackrecord".
// Sales live on each asset (inputs.dispositions); onUpdate(dealId, fn) edits
// one asset's inputs (saved and logged like any edit).
import { CONTRACT_DATES } from "@/lib/contractDates";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_SALE_STAGES, BUYER_TYPES, ROUNDS, SALE_REASONS, SALE_STAGES, activeSales, allSales, changeContractPrice, closeSale, makeBov, makeOffer, makeSale,
  netProceeds, offersCompared, reasonLabel, saleDistribution, saleSubject, salesXlsx, selectOffer, stageLabel, trackRecord, trackTotals, trackXlsx,
} from "@/lib/dispositions";
import { CLOSED_DOC_TYPES, DISP_DOC_TYPES, OFFER_DOC_TYPES, SALE_DOC_TYPES, dispTypeLabel, dispositionDocs, uploadDispDoc } from "@/lib/dispositionDocs";
import { dealFileLink, listDealDocs } from "@/lib/dealDocs";
import { DEFAULT_FUND_TERMS } from "@/lib/fundTerms";
import { downloadBlob } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const money = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Math.round(Number(v)).toLocaleString("en-US")}`);
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const inp = "rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:bg-transparent disabled:border-transparent";
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const num = (v) => (v === "" || v == null ? null : Number(v));
const STAGE_CLS = { preparing: "bg-gray-100 text-gray-700", marketing: "bg-sky-50 text-sky-800", offers: "bg-indigo-50 text-indigo-800", contract: "bg-amber-50 text-amber-800", closed: "bg-emerald-50 text-emerald-800", withdrawn: "bg-red-50 text-red-700" };

function Field({ label, children }) {
  return <label className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">{label}</span>{children}</label>;
}

// Upload area for a sale, offer or closed sale (signed in, editors only).
function DocBox({ docs = [], types, docCtx, label = "Documents", compact = false }) {
  const ref = useRef(null);
  const [type, setType] = useState(types[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const open = async (d) => { const f = d.doc.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); };
  if (!docCtx) return compact ? null : <p className="text-[11px] text-gray-400">{label}: sign in to the firm to upload (BOVs, listing agreement, OM, PSA, closing statement…).</p>;
  return (
    <div className={compact ? "" : "rounded border border-gray-200 bg-white p-2"} data-testid="disp-docs">
      {!compact && <p className="mb-1 font-semibold">{label}</p>}
      {docs.length > 0 && <ul className="mb-1 space-y-0.5">{docs.map((d) => <li key={d.id}><button type="button" onClick={() => open(d)} className="text-left text-blue-700 hover:underline">{d.typeLabel}: {d.name}</button>{d.by ? <span className="text-gray-400"> · {d.by}</span> : null}</li>)}</ul>}
      {docCtx.canEdit && (
        <div className="flex flex-wrap items-center gap-1.5">
          {types.length > 1 && <select aria-label="Document type" value={type} onChange={(e) => setType(e.target.value)} className={inp}>{types.map((k) => <option key={k} value={k}>{dispTypeLabel(k)}</option>)}</select>}
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">{busy ? "Uploading…" : `Upload ${types.length === 1 ? dispTypeLabel(types[0]) : "PDF"}`}</button>
          <input ref={ref} type="file" accept="application/pdf" className="hidden" data-testid="disp-file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); setMsg(null); try { await docCtx.upload({ ...docCtx.at, type: types.length === 1 ? types[0] : type, file: f }); setMsg(`Uploaded ${f.name}.`); } catch (err) { setMsg(err.message); } finally { setBusy(false); } }} />
          {msg && <span className="text-[11px] text-gray-500">{msg}</span>}
        </div>
      )}
    </div>
  );
}

// ── One sale, expanded ──
function SaleCard({ x, sales, canEdit, onUpdateSale, onClose, todayISO, docs = [], docCtx = null, split = null }) {
  const s = x.sale;
  const sub = saleSubject(x.inputs, s);
  const offers = offersCompared(x.inputs, s, { allSales: sales, todayISO });
  const set = (patch, label) => onUpdateSale((cur) => ({ ...cur, ...patch }), label);
  const setIn = (key, patch) => onUpdateSale((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  const [closing, setClosing] = useState(null);
  const sel = offers.find((o) => o.selected);
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-xs" data-testid="sale-card">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Stage">
          <select aria-label="Stage" value={s.stage} disabled={!canEdit} onChange={(e) => set({ stage: e.target.value })} className={inp}>{SALE_STAGES.map(([k, l]) => <option key={k} value={k} disabled={k === "closed"}>{l}</option>)}</select>
        </Field>
        {s.stage === "withdrawn" && <Field label="Withdrawn because"><input aria-label="Withdrawn reason" value={s.withdrawnReason ?? ""} disabled={!canEdit} onChange={(e) => set({ withdrawnReason: e.target.value })} className={`${inp} w-48`} /></Field>}
        <Field label="Reason"><select aria-label="Reason" value={s.reason} disabled={!canEdit} onChange={(e) => set({ reason: e.target.value })} className={inp}>{SALE_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Target price"><input aria-label="Target price" type="number" value={s.targetPrice ?? ""} disabled={!canEdit} onChange={(e) => set({ targetPrice: num(e.target.value) })} className={`${inp} w-28`} /></Field>
        <Field label="Target cap (%)"><input aria-label="Target cap" type="number" step="0.05" value={s.targetCapPct ?? ""} disabled={!canEdit} onChange={(e) => set({ targetCapPct: num(e.target.value) })} className={`${inp} w-20`} /></Field>
        <Field label="Target close"><input aria-label="Target close" type="date" value={s.targetClose ?? ""} disabled={!canEdit} onChange={(e) => set({ targetClose: e.target.value })} className={inp} /></Field>
        <span className="pb-1 text-gray-500">{sub.sf ? `${Math.round(sub.sf).toLocaleString("en-US")} SF${s.targetPrice ? ` · $${(s.targetPrice / sub.sf).toFixed(0)}/SF` : ""}` : ""}</span>
      </div>

      {/* Broker */}
      <div>
        <p className="mb-1 font-semibold">Broker opinions of value</p>
        <table className="w-full tabular-nums">
          <thead className="text-gray-500"><tr><th className="text-left font-medium">Broker</th><th className="text-right font-medium">Price</th><th className="text-right font-medium">Cap (%)</th><th className="text-right font-medium">Fee (%)</th><th className="text-left font-medium pl-2">Notes</th><th /></tr></thead>
          <tbody>
            {(s.bovs ?? []).map((b) => (
              <tr key={b.id} className={s.brokerChosen && s.brokerChosen === b.broker ? "bg-emerald-50" : ""}>
                {["broker", "price", "capPct", "feePct", "notes"].map((k) => (
                  <td key={k} className={k === "broker" || k === "notes" ? "pl-0" : "text-right"}>
                    <input aria-label={`BOV ${k}`} type={["price", "capPct", "feePct"].includes(k) ? "number" : "text"} value={b[k] ?? ""} disabled={!canEdit} onChange={(e) => onUpdateSale((cur) => ({ ...cur, bovs: cur.bovs.map((z) => (z.id === b.id ? { ...z, [k]: ["price", "capPct", "feePct"].includes(k) ? num(e.target.value) : e.target.value } : z)) }))} className={`${inp} ${k === "notes" ? "w-48" : k === "broker" ? "w-36" : "w-24 text-right"}`} />
                  </td>
                ))}
                <td>{canEdit && <button type="button" onClick={() => set({ brokerChosen: b.broker })} className="text-[11px] text-blue-700 hover:underline">{s.brokerChosen === b.broker ? "Chosen" : "Choose"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && <button type="button" onClick={() => onUpdateSale((cur) => ({ ...cur, bovs: [...(cur.bovs ?? []), makeBov()] }))} className="mt-1 text-[11px] text-blue-700 hover:underline">+ Add BOV</button>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Field label="Listing fee (%)"><input aria-label="Listing fee" type="number" step="0.05" value={s.listing?.feePct ?? ""} disabled={!canEdit} onChange={(e) => setIn("listing", { feePct: num(e.target.value) })} className={`${inp} w-20`} /></Field>
          <Field label="Listing term (months)"><input aria-label="Listing term" type="number" value={s.listing?.termMonths ?? ""} disabled={!canEdit} onChange={(e) => setIn("listing", { termMonths: num(e.target.value) })} className={`${inp} w-20`} /></Field>
          <Field label="Exclusions"><input aria-label="Listing exclusions" value={s.listing?.exclusions ?? ""} disabled={!canEdit} onChange={(e) => setIn("listing", { exclusions: e.target.value })} className={`${inp} w-48`} /></Field>
          <Field label="CAs signed"><input aria-label="CAs signed" type="number" value={s.marketing?.casSigned ?? 0} disabled={!canEdit} onChange={(e) => setIn("marketing", { casSigned: num(e.target.value) ?? 0 })} className={`${inp} w-16`} /></Field>
          <Field label="Tours"><input aria-label="Tours" type="number" value={s.marketing?.tours ?? 0} disabled={!canEdit} onChange={(e) => setIn("marketing", { tours: num(e.target.value) ?? 0 })} className={`${inp} w-16`} /></Field>
          <Field label="Call for offers"><input aria-label="Call for offers" type="date" value={s.marketing?.callForOffers ?? ""} disabled={!canEdit} onChange={(e) => setIn("marketing", { callForOffers: e.target.value })} className={inp} /></Field>
        </div>
      </div>

      {/* Offers on this sale */}
      <div>
        <p className="mb-1 font-semibold">Offers ({offers.length}) · best net proceeds first</p>
        {offers.length > 0 && (
          <table className="w-full tabular-nums" data-testid="sale-offers">
            <thead className="text-gray-500"><tr><th className="text-left font-medium">Buyer</th><th className="text-left font-medium">Round</th><th className="text-right font-medium">Price</th><th className="text-right font-medium">$/SF</th><th className="text-right font-medium">Cap</th><th className="text-right font-medium">Costs</th><th className="text-right font-medium">Loan payoff</th><th className="text-right font-medium">Net proceeds</th><th /></tr></thead>
            <tbody>{offers.map((o) => (
              <tr key={o.id} className={`border-t border-gray-100 ${o.selected ? "bg-emerald-50 font-medium" : ""}`}>
                <td>{o.buyer || "—"}{o.earlier.length > 0 && <span className="ml-1 rounded bg-violet-50 px-1 text-[10px] text-violet-700" title={o.earlier.map((e) => `${e.asset}: ${money(e.price)} (${usDate(e.date)})`).join("; ")}>{o.earlier.length} earlier</span>}</td>
                <td>{ROUNDS.find(([k]) => k === o.round)?.[1]}</td>
                <td className="text-right">{money(o.price)}</td><td className="text-right">{o.psf ? `$${o.psf.toFixed(0)}` : "—"}</td><td className="text-right">{pct(o.capPct, 2)}</td>
                <td className="text-right">{money(o.costs)}</td><td className="text-right">{money(o.payoff)}</td><td className="text-right font-semibold">{money(o.net)}</td>
                <td className="text-right">{canEdit && <button type="button" onClick={() => onUpdateSale((cur) => selectOffer(cur, o.id))} className="text-[11px] text-blue-700 hover:underline">{o.selected ? "Selected ✓" : "Select"}</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {canEdit && <button type="button" onClick={() => onUpdateSale((cur) => ({ ...cur, offers: [...(cur.offers ?? []), makeOffer({ date: todayISO })], stage: ["preparing", "marketing"].includes(cur.stage) ? "offers" : cur.stage }))} className="mt-1 text-[11px] text-blue-700 hover:underline">+ Add offer (edit it on the Offers tab)</button>}
      </div>

      {/* Contract */}
      <div className="flex flex-wrap items-end gap-2">
        <p className="w-full font-semibold">Under contract</p>
        {CONTRACT_DATES.map(([k, l]) => (
          <Field key={k} label={l}><input aria-label={l} type="date" value={s.contract?.[k] ?? ""} disabled={!canEdit} onChange={(e) => setIn("contract", { [k]: e.target.value })} className={inp} /></Field>
        ))}
        <Field label="Deposit"><input aria-label="Deposit" type="number" value={s.contract?.deposit ?? ""} disabled={!canEdit} onChange={(e) => setIn("contract", { deposit: num(e.target.value) })} className={`${inp} w-24`} /></Field>
        <Field label="Contract price">
          <input aria-label="Contract price" type="number" defaultValue={s.contract?.price ?? sel?.price ?? ""} disabled={!canEdit} onBlur={(e) => { const v = num(e.target.value); if (v != null && v !== (s.contract?.price ?? sel?.price)) onUpdateSale((cur) => changeContractPrice(cur, v, { reason: window.prompt("Reason for the price change (credit, re-trade…)?") || "" })); }} className={`${inp} w-28`} />
        </Field>
        {(s.contract?.priceLog ?? []).length > 0 && <span className="pb-1 text-gray-500">Price changes: {s.contract.priceLog.map((p) => `${money(p.from)} → ${money(p.to)}${p.reason ? ` (${p.reason})` : ""}`).join("; ")}</span>}
      </div>

      {/* Closing */}
      {s.closing ? (
        <div className="space-y-1">
          <p className="rounded bg-emerald-50 px-2 py-1.5 text-emerald-900" data-testid="sale-closed">Closed {usDate(s.closing.date)}: price {money(s.closing.price)}, costs {money(s.closing.costs)}, loan payoff {money(s.closing.loanPayoff)}, net proceeds {money(s.closing.net)}.{s.scope !== "partial" ? " The asset's model now uses this sale (Portfolio Return, valuations, header figures)." : ""}</p>
          {split && <p className="rounded bg-white px-2 py-1.5 text-gray-700" data-testid="sale-split">Through {x.fund}&apos;s waterfall: LPs {money(split.lp)}, GP {money(split.gp)} ({split.gpPct.toFixed(1)}% to the GP){split.held > 1 ? `, ${money(split.held)} held back` : ""}.</p>}
        </div>
      ) : canEdit && ACTIVE_SALE_STAGES.includes(s.stage) && (
        closing ? (
          <div className="flex flex-wrap items-end gap-2 rounded border border-emerald-200 bg-white p-2">
            <Field label="Closing date"><input aria-label="Closed on" type="date" value={closing.date} onChange={(e) => setClosing({ ...closing, date: e.target.value })} className={inp} /></Field>
            <Field label="Sale price"><input aria-label="Sale price" type="number" value={closing.price} onChange={(e) => setClosing({ ...closing, price: e.target.value })} className={`${inp} w-28`} /></Field>
            <Field label="Selling costs (blank = model)"><input aria-label="Selling costs" type="number" value={closing.costs} onChange={(e) => setClosing({ ...closing, costs: e.target.value })} className={`${inp} w-28`} /></Field>
            <Field label="Loan payoff (blank = model)"><input aria-label="Loan payoff" type="number" value={closing.payoff} onChange={(e) => setClosing({ ...closing, payoff: e.target.value })} className={`${inp} w-28`} /></Field>
            {closing.date && closing.price && <span className="pb-1 text-gray-600">Net ≈ {money(netProceeds(x.inputs, s, Number(closing.price), closing.date).net)}</span>}
            <button type="button" disabled={!closing.date || !closing.price} onClick={() => { onClose({ date: closing.date, price: Number(closing.price), costs: num(closing.costs), loanPayoff: num(closing.payoff) }); setClosing(null); }} className={`${btn} border-emerald-600 bg-emerald-600 text-white disabled:opacity-40`}>Record closing</button>
            <button type="button" onClick={() => setClosing(null)} className="text-gray-500 hover:underline">Cancel</button>
          </div>
        ) : <button type="button" onClick={() => setClosing({ date: s.contract?.closingDate || todayISO, price: s.contract?.price ?? sel?.price ?? "", costs: "", payoff: "" })} className={`${btn} border-emerald-300 bg-white text-emerald-800`}>Record closing statement…</button>
      )}
      <DocBox docs={docs.filter((d) => !d.offerId)} types={s.closing ? [...SALE_DOC_TYPES, ...CLOSED_DOC_TYPES.filter((k) => !SALE_DOC_TYPES.includes(k))] : SALE_DOC_TYPES} docCtx={docCtx && { ...docCtx, at: { dealId: x.dealId, saleId: s.id } }} label="Sale documents (BOVs, listing agreement, OM, PSA, estoppels, closing statement)" />
    </div>
  );
}

// ── Start a sale ──
function NewSale({ deals, onStart }) {
  const [dealId, setDealId] = useState("");
  const [scope, setScope] = useState("whole");
  const [unitIds, setUnitIds] = useState([]);
  const [reason, setReason] = useState("plan_complete");
  const d = deals.find((x) => x.id === dealId);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-xs" data-testid="new-sale">
      <Field label="Asset"><select aria-label="Sale asset" value={dealId} onChange={(e) => { setDealId(e.target.value); setUnitIds([]); }} className={inp}><option value="">Choose…</option>{deals.map((x) => <option key={x.id} value={x.id}>{x.inputs.propertyName || x.id}</option>)}</select></Field>
      <Field label="What's sold"><select aria-label="What's sold" value={scope} onChange={(e) => setScope(e.target.value)} className={inp}><option value="whole">Whole asset</option><option value="partial" disabled={!(d?.inputs.units ?? []).length}>Selected units</option></select></Field>
      {scope === "partial" && d && (
        <div className="flex max-w-xl flex-wrap gap-1.5">{(d.inputs.units ?? []).map((u) => (
          <label key={u.id} className="flex items-center gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5"><input type="checkbox" checked={unitIds.includes(u.id)} onChange={(e) => setUnitIds(e.target.checked ? [...unitIds, u.id] : unitIds.filter((z) => z !== u.id))} />{u.name || u.id} · {Number(u.squareFeet || 0).toLocaleString("en-US")} SF</label>
        ))}</div>
      )}
      <Field label="Reason"><select aria-label="Sale reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inp}>{SALE_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <button type="button" disabled={!dealId || (scope === "partial" && !unitIds.length)} onClick={() => { onStart(dealId, makeSale({ scope, unitIds, reason })); setDealId(""); setUnitIds([]); setScope("whole"); }} className={`${btn} border-blue-600 bg-blue-600 text-white disabled:opacity-40`}>Start sale</button>
    </div>
  );
}

export default function Dispositions({ view = "forsale", deals = [], valuations = {}, canEdit = false, onUpdate, todayISO = new Date().toISOString().slice(0, 10), scopeName = "", workspaceId = null, email = null, funds = {}, fundDeals = [], initialOpen = null }) {
  const [open, setOpen] = useState(initialOpen);
  const [showDone, setShowDone] = useState(false);
  const [allDocs, setAllDocs] = useState([]);
  const [docFilter, setDocFilter] = useState({ asset: "", type: "" });
  const reload = () => (workspaceId ? listDealDocs(workspaceId).then(setAllDocs).catch(() => {}) : Promise.resolve());
  useEffect(() => { reload(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const dDocs = useMemo(() => dispositionDocs(allDocs, deals), [allDocs, deals]);
  const docCtx = workspaceId ? { canEdit, upload: async (a) => { await uploadDispDoc(workspaceId, a, email); await reload(); } } : null;
  const docsFor = (saleId, offerId = undefined) => dDocs.filter((d) => d.saleId === saleId && (offerId === undefined || d.offerId === offerId));
  const splitFor = (x) => {
    if (!x.sale.closing || !x.fund || !funds[x.fund]) return null;
    try { return saleDistribution(fundDeals.filter((d) => d.inputs?.fundName === x.fund), { ...DEFAULT_FUND_TERMS, ...funds[x.fund], name: x.fund }, x.dealId, x.sale.closing); } catch { return null; }
  };
  const pdf = async (kind, rows) => {
    const { salesPdf, trackPdf } = await import("@/lib/dispositionsPdf");
    const blob = kind === "track" ? await trackPdf(rows, { todayISO, scopeName }) : await salesPdf(rows, { todayISO, scopeName });
    downloadBlob(blob, `${kind === "track" ? "track-record" : "assets-for-sale"}-${todayISO}.pdf`);
  };
  const sales = useMemo(() => allSales(deals), [deals]);
  const owned = deals.filter((d) => d.inputs.fundName && d.inputs.acquisitionDate && d.inputs.acquisitionDate <= todayISO && !(d.inputs.realizedSaleDate && d.inputs.realizedSaleDate <= todayISO));
  const updateSale = (dealId, saleId) => (fn) => onUpdate(dealId, (inp) => ({ ...inp, dispositions: (inp.dispositions ?? []).map((s) => (s.id === saleId ? fn(s) : s)) }));
  const exportX = async (rows, name, kind) => downloadBlob(await writeXlsx(kind === "track" ? trackXlsx(rows) : salesXlsx(rows, { todayISO }), { sheetName: name }), `${name.toLowerCase().replace(/\s+/g, "-")}-${todayISO}.xlsx`);

  if (view === "dispdocs") {
    const saleName = new Map(sales.map((x) => [x.sale.id, `${x.asset}${x.sale.scope === "partial" ? " (part)" : ""} · ${stageLabel(x.sale.stage)}`]));
    const rowsD = dDocs.filter((d) => (!docFilter.asset || d.dealId === docFilter.asset) && (!docFilter.type || d.type === docFilter.type));
    const assets = [...new Map(dDocs.map((d) => [d.dealId, d.asset])).entries()];
    return (
      <div className="space-y-3 text-gray-900" data-testid="disp-documents">
        <div><h2 className="text-lg font-bold">Disposition Documents</h2><p className="text-xs text-gray-500">Every document on a sale, offer or closed sale. The same store as Library → Documents (each file kept once); upload them on the sale, its offers or its Track Record row.</p></div>
        {!workspaceId ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">Sign in to the firm to see and upload documents.</p> : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Field label="Asset"><select aria-label="Filter asset" value={docFilter.asset} onChange={(e) => setDocFilter({ ...docFilter, asset: e.target.value })} className={inp}><option value="">All</option>{assets.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></Field>
              <Field label="Type"><select aria-label="Filter type" value={docFilter.type} onChange={(e) => setDocFilter({ ...docFilter, type: e.target.value })} className={inp}><option value="">All</option>{DISP_DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            </div>
            {rowsD.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No disposition documents yet.</p> : (
              <table className="w-full text-xs"><thead className="bg-gray-50 text-gray-500"><tr>{["Asset", "Sale", "Offer", "Type", "File", "Uploaded by"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>{rowsD.map((d) => {
                  const offer = d.offerId ? sales.flatMap((x) => x.sale.offers ?? []).find((o) => o.id === d.offerId) : null;
                  return <tr key={d.id} className="border-t border-gray-100" data-testid="disp-doc-row"><td className="px-2 py-1">{d.asset}</td><td className="px-2 py-1 text-gray-600">{saleName.get(d.saleId) ?? "removed sale"}</td><td className="px-2 py-1 text-gray-600">{offer ? offer.buyer || "offer" : ""}</td><td className="px-2 py-1">{d.typeLabel}</td><td className="px-2 py-1"><button type="button" onClick={async () => { const f = d.doc.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); }} className="text-blue-700 hover:underline">{d.name}</button></td><td className="px-2 py-1 text-gray-500">{d.by ?? ""}</td></tr>;
                })}</tbody></table>
            )}
          </>
        )}
      </div>
    );
  }

  if (view === "trackrecord") {
    const rows = trackRecord(deals, valuations);
    return (
      <div className="space-y-3 text-gray-900" data-testid="track-record">
        <div className="flex items-end justify-between"><div><h2 className="text-lg font-bold">Track Record</h2><p className="text-xs text-gray-500">{scopeName ? `${scopeName}: ` : ""}every closed sale: realized results against the acquisition underwriting and the last valuation mark.</p></div>
          <div className="flex gap-2"><button type="button" disabled={!rows.length} onClick={() => pdf("track", rows)} className={`${btn} border-gray-300 bg-white disabled:opacity-40`}>PDF</button><button type="button" disabled={!rows.length} onClick={() => exportX(rows, "Track record", "track")} className={`${btn} border-gray-300 bg-white disabled:opacity-40`}>Excel</button></div></div>
        {rows.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No closed sales yet. Record a closing statement on Assets for Sale.</p> : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500"><tr>{["Asset", "Bought", "Purchase", "Sold", "Sale price", "Net proceeds", "Hold", "IRR", "UW IRR", "Multiple", "UW multiple", "Profit", "vs. last mark", ...(docCtx ? ["Documents"] : [])].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.saleId} className="border-t border-gray-100">
                  <td className="px-2 py-1">{r.asset}{r.partial && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-800">part · {Math.round(r.sf).toLocaleString("en-US")} SF</span>}<div className="text-[10px] text-gray-400">{r.fund}</div></td>
                  <td className="px-2 py-1">{usDate(r.purchaseDate)}</td><td className="px-2 py-1">{money(r.purchasePrice)}</td><td className="px-2 py-1">{usDate(r.saleDate)}</td><td className="px-2 py-1">{money(r.salePrice)}</td><td className="px-2 py-1">{money(r.netProceeds)}</td>
                  <td className="px-2 py-1">{r.holdYears != null ? `${r.holdYears.toFixed(1)} yr` : "—"}</td><td className="px-2 py-1 font-semibold">{pct(r.irr)}</td><td className="px-2 py-1 text-gray-500">{pct(r.uw?.irr)}</td>
                  <td className="px-2 py-1">{r.multiple != null && Number.isFinite(r.multiple) ? `${r.multiple.toFixed(2)}x` : "—"}</td><td className="px-2 py-1 text-gray-500">{r.uw?.multiple != null && Number.isFinite(r.uw.multiple) ? `${r.uw.multiple.toFixed(2)}x` : "—"}</td>
                  <td className="px-2 py-1">{money(r.profit)}</td><td className="px-2 py-1">{r.vsMarkPct != null ? `${r.vsMarkPct >= 0 ? "+" : ""}${r.vsMarkPct.toFixed(1)}%` : "no mark"}</td>
                  <td className="px-2 py-1"><DocBox compact docs={docsFor(r.saleId).filter((d) => CLOSED_DOC_TYPES.includes(d.type))} types={CLOSED_DOC_TYPES} docCtx={docCtx && { ...docCtx, at: { dealId: r.dealId, saleId: r.saleId } }} /></td>
                </tr>
              ))}</tbody>
            </table></div>
            <table className="text-xs tabular-nums" data-testid="track-totals"><thead className="text-gray-500"><tr>{["", "Sales", "Purchase", "Sale", "Net proceeds", "Profit"].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>{trackTotals(rows).map((t) => <tr key={t.key} className={t.key === "Firm" ? "font-semibold" : ""}><td className="px-2 py-1">{t.key}</td><td className="px-2 py-1">{t.sales}</td><td className="px-2 py-1">{money(t.purchase)}</td><td className="px-2 py-1">{money(t.sale)}</td><td className="px-2 py-1">{money(t.net)}</td><td className="px-2 py-1">{money(t.profit)}</td></tr>)}</tbody></table>
            <p className="text-[11px] text-gray-400">IRR, multiple and profit for a whole sale run through the asset&apos;s model with the realized sale; for a partial sale they cover the part sold (its share of equity in, its net proceeds out). UW = the frozen acquisition underwriting when there is one, else the model without the sale.</p>
          </>
        )}
      </div>
    );
  }

  if (view === "offers") {
    const rows = sales.filter((x) => showDone || ACTIVE_SALE_STAGES.includes(x.sale.stage));
    const setOffer = (x, offerId, patch) => updateSale(x.dealId, x.sale.id)((cur) => ({ ...cur, offers: cur.offers.map((o) => (o.id === offerId ? { ...o, ...patch } : o)) }));
    return (
      <div className="space-y-3 text-gray-900" data-testid="offers-view">
        <div className="flex items-end justify-between"><div><h2 className="text-lg font-bold">Offers</h2><p className="text-xs text-gray-500">Every offer received, by sale, with net proceeds after costs and loan payoff. Select one per sale.</p></div>
          <label className="text-xs text-gray-600"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Include closed and withdrawn</label></div>
        {rows.every((x) => !(x.sale.offers ?? []).length) && <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No offers yet. Add one on a sale (Assets for Sale).</p>}
        {rows.filter((x) => (x.sale.offers ?? []).length).map((x) => (
          <div key={x.sale.id} className="rounded-xl border border-gray-200 p-3 text-xs" data-testid="offer-group">
            <p className="mb-1 font-semibold">{x.asset} <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${STAGE_CLS[x.sale.stage]}`}>{stageLabel(x.sale.stage)}</span></p>
            <div className="overflow-x-auto"><table className="w-full tabular-nums">
              <thead className="text-gray-500"><tr>{["Buyer", "Type", "Broker", "Date", "Round", "Price", "Deposit", "DD days", "Close days", "Financing", "Notes", "Net proceeds", ""].map((h) => <th key={h} className="px-1 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{(() => { const list = offersCompared(x.inputs, x.sale, { allSales: sales, todayISO, sort: false }); const best = Math.max(...list.filter((z) => z.price).map((z) => z.net)); return list.map((o) => (
                <tr key={o.id} className={`border-t border-gray-100 ${o.selected ? "bg-emerald-50" : ""}`}>
                  <td className="px-1"><input aria-label="Buyer" value={o.buyer} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { buyer: e.target.value })} className={`${inp} w-32`} />{o.earlier.length > 0 && <div className="text-[10px] text-violet-700">Earlier: {o.earlier.map((e) => `${e.asset} ${money(e.price)}`).join("; ")}</div>}</td>
                  <td className="px-1"><select aria-label="Buyer type" value={o.buyerType} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { buyerType: e.target.value })} className={inp}>{BUYER_TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                  <td className="px-1"><input aria-label="Offer broker" value={o.broker} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { broker: e.target.value })} className={`${inp} w-24`} /></td>
                  <td className="px-1"><input aria-label="Offer date" type="date" value={o.date} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { date: e.target.value })} className={inp} /></td>
                  <td className="px-1"><select aria-label="Round" value={o.round} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { round: e.target.value })} className={inp}>{ROUNDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td className="px-1"><input aria-label="Offer price" type="number" value={o.price ?? ""} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { price: num(e.target.value) })} className={`${inp} w-28`} /><div className="text-[10px] text-gray-400">{o.psf ? `$${o.psf.toFixed(0)}/SF` : ""}{o.capPct ? ` · ${o.capPct.toFixed(2)}% cap` : ""}</div></td>
                  <td className="px-1"><input aria-label="Offer deposit" type="number" value={o.deposit ?? ""} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { deposit: num(e.target.value) })} className={`${inp} w-24`} /></td>
                  <td className="px-1"><input aria-label="DD days" type="number" value={o.ddDays ?? ""} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { ddDays: num(e.target.value) })} className={`${inp} w-14`} /></td>
                  <td className="px-1"><input aria-label="Closing days" type="number" value={o.closingDays ?? ""} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { closingDays: num(e.target.value) })} className={`${inp} w-14`} /></td>
                  <td className="px-1"><input aria-label="Financing contingency" type="checkbox" checked={!!o.financingContingency} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { financingContingency: e.target.checked })} /></td>
                  <td className="px-1"><input aria-label="Offer notes" value={o.notes} disabled={!canEdit} onChange={(e) => setOffer(x, o.id, { notes: e.target.value })} className={`${inp} w-36`} /><DocBox compact docs={docsFor(x.sale.id, o.id)} types={OFFER_DOC_TYPES} docCtx={docCtx && { ...docCtx, at: { dealId: x.dealId, saleId: x.sale.id, offerId: o.id } }} /></td>
                  <td className="px-1 font-semibold" data-testid="offer-net">{o.price ? money(o.net) : "—"}{o.price && o.net === best && list.filter((z) => z.price).length > 1 && <span className="ml-1 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700">best</span>}</td>
                  <td className="px-1">{canEdit && <button type="button" onClick={() => updateSale(x.dealId, x.sale.id)((cur) => selectOffer(cur, o.id))} className="text-[11px] text-blue-700 hover:underline">{o.selected ? "Selected ✓" : "Select"}</button>}</td>
                </tr>
              )); })()}</tbody>
            </table></div>
          </div>
        ))}
      </div>
    );
  }

  // Assets for Sale
  const rows = sales.filter((x) => showDone || ACTIVE_SALE_STAGES.includes(x.sale.stage));
  return (
    <div className="space-y-3 text-gray-900" data-testid="for-sale">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-bold">Assets for Sale</h2><p className="text-xs text-gray-500">{scopeName ? `${scopeName}: ` : ""}every sale in progress: what&apos;s sold, why and the target, stage, broker, marketing, contract and closing.</p></div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Include closed and withdrawn</label>
          <button type="button" disabled={!activeSales(deals).length} onClick={() => pdf("sales", activeSales(deals))} className={`${btn} border-gray-300 bg-white disabled:opacity-40`}>PDF</button>
          <button type="button" disabled={!activeSales(deals).length} onClick={() => exportX(activeSales(deals), "Assets for sale")} className={`${btn} border-gray-300 bg-white disabled:opacity-40`}>Excel</button>
        </div>
      </div>
      {canEdit && <NewSale deals={owned} onStart={(dealId, sale) => { onUpdate(dealId, (inp) => ({ ...inp, dispositions: [...(inp.dispositions ?? []), sale] })); setOpen(sale.id); }} />}
      {rows.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No sales in progress.</p> : (
        <div className="space-y-2">
          {rows.map((x) => {
            const sub = saleSubject(x.inputs, x.sale);
            const best = offersCompared(x.inputs, x.sale, { todayISO })[0];
            return (
              <div key={x.sale.id} className="rounded-xl border border-gray-200 bg-white" data-testid="sale-row">
                <button type="button" onClick={() => setOpen(open === x.sale.id ? null : x.sale.id)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-xs">
                  <span className="font-semibold">{x.asset}</span>
                  <span className="text-gray-500">{x.sale.scope === "partial" ? `Part: ${sub.units.map((u) => u.name || u.id).join(", ")} (${Math.round(sub.sf).toLocaleString("en-US")} SF)` : "Whole asset"}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STAGE_CLS[x.sale.stage]}`}>{stageLabel(x.sale.stage)}</span>
                  <span className="text-gray-500">{reasonLabel(x.sale.reason)}</span>
                  <span className="text-gray-600">Target {money(x.sale.targetPrice)}{x.sale.targetClose ? ` by ${usDate(x.sale.targetClose)}` : ""}</span>
                  <span className="ml-auto text-gray-600">{(x.sale.offers ?? []).length} offer{(x.sale.offers ?? []).length === 1 ? "" : "s"}{best ? ` · best net ${money(best.net)}` : ""}</span>
                </button>
                {open === x.sale.id && <div className="border-t border-gray-100 p-2"><SaleCard x={x} sales={sales} canEdit={canEdit} todayISO={todayISO} docs={docsFor(x.sale.id)} docCtx={docCtx} split={splitFor(x)} onUpdateSale={updateSale(x.dealId, x.sale.id)} onClose={(c) => onUpdate(x.dealId, (inp) => closeSale(inp, x.sale.id, c))} /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
