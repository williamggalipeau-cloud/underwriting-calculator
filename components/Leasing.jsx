"use client";

// Phase R: Leasing tab (Asset Management, after Leases). Leasing Pipeline
// and Rent Comps for one asset, with a whole-fund view of the pipeline.
// Data lives on each asset (inputs.leasing); onUpdate(dealId, fn) edits it.
import { useEffect, useRef, useState } from "react";
import VacantUnits from "@/components/VacantUnits";
import {
  ACTIVE_PROSPECT_STAGES, PROSPECT_SOURCES, PROSPECT_STAGES, RENT_COMP_FIELDS, allProspects, detectRentCompMapping, filterRentComps, importRentComps, leasingOf,
  leasingXlsx, makeProspect, makeRentComp, netEffective, pipelineTotals, rentCompStats, rentCompsFromFile, rentVsComps, stageLabel, vsPlan,
} from "@/lib/leasing";
import { downloadBlob } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";
import { COMPS_DOC_TYPES, PROSPECT_DOC_TYPES, leasingDocs, leasingTypeLabel, uploadLeasingDoc } from "@/lib/leasingDocs";
import { dealFileLink, listDealDocs } from "@/lib/dealDocs";

// Upload area for a prospect or the rent comps (signed in to the firm).
function Docs({ docs, types, ctx, compact = false }) {
  const ref = useRef(null);
  const [type, setType] = useState(types[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!ctx) return null;
  const open = async (d) => { const f = d.doc.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); };
  return (
    <div className={compact ? "min-w-[9rem]" : "flex flex-wrap items-center gap-2"} data-testid="leasing-docs">
      {docs.map((d) => <button key={d.id} type="button" onClick={() => open(d)} className="block text-left text-[11px] text-blue-700 hover:underline">{d.typeLabel}: {d.name}</button>)}
      {ctx.canEdit && (
        <span className="flex items-center gap-1">
          <select aria-label="Leasing document type" value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-gray-200 px-1 py-0.5 text-[11px]">{types.map((k) => <option key={k} value={k}>{leasingTypeLabel(k)}</option>)}</select>
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-40">{busy ? "…" : "Upload"}</button>
          <input ref={ref} type="file" accept="application/pdf" className="hidden" data-testid="leasing-file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); setMsg(null); try { await ctx.upload(type, f); } catch (err) { setMsg(err.message); } finally { setBusy(false); } }} />
        </span>
      )}
      {msg && <span className="text-[11px] text-red-700">{msg}</span>}
    </div>
  );
}

const inp = "rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:bg-transparent disabled:border-transparent";
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const num = (v) => (v === "" || v == null ? null : Number(v));
const psf = (v) => (v == null || !Number.isFinite(v) ? "—" : `$${v.toFixed(2)}`);
const pct = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const STAGE_CLS = { inquiry: "bg-gray-100 text-gray-700", tour: "bg-sky-50 text-sky-800", proposal: "bg-indigo-50 text-indigo-800", loi: "bg-violet-50 text-violet-800", leaseout: "bg-amber-50 text-amber-800", signed: "bg-emerald-50 text-emerald-800", lost: "bg-red-50 text-red-700" };

export default function Leasing({ deal, deals = [], canEdit = false, onUpdate, onOpenDeal = null, todayISO = new Date().toISOString().slice(0, 10), scopeName = "", workspaceId = null, email = null }) {
  const [scope, setScope] = useState("asset");
  const [showDone, setShowDone] = useState(false);
  const [f, setF] = useState({ since: "", minSF: "", maxSF: "", submarket: "", leaseType: "" });
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null); // { grid, det } awaiting column confirmation
  const [allDocs, setAllDocs] = useState([]);
  const reload = () => (workspaceId ? listDealDocs(workspaceId).then(setAllDocs).catch(() => {}) : Promise.resolve());
  useEffect(() => { reload(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!deal) return <p className="text-xs text-gray-500">Choose an asset.</p>;
  const inputs = deal.inputs;
  const L = leasingOf(inputs);
  const units = inputs.units ?? [];
  const edit = (fn) => onUpdate(deal.id, (cur) => ({ ...cur, leasing: fn(leasingOf(cur)) }));
  const setP = (id, patch) => edit((l) => ({ ...l, prospects: l.prospects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const setC = (id, patch) => edit((l) => ({ ...l, comps: l.comps.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const rows = scope === "fund" ? allProspects(deals) : allProspects([deal]);
  const shown = rows.filter((x) => showDone || ACTIVE_PROSPECT_STAGES.includes(x.p.stage));
  const totals = pipelineTotals(rows);
  const comps = filterRentComps(L.comps, f);
  const stats = rentCompStats(comps);
  const vs = rentVsComps(inputs, stats);
  const lDocs = leasingDocs(allDocs);
  const ctxFor = (dealId, target) => (workspaceId ? { canEdit, upload: async (type, file) => { await uploadLeasingDoc(workspaceId, { dealId, target, type, file }, email); await reload(); } } : null);
  async function exportPdf() {
    const { leasingPdf } = await import("@/lib/leasingPdf");
    const cs = (scope === "fund" ? deals : [deal]).flatMap((d) => leasingOf(d.inputs).comps.map((c) => ({ ...c, asset: d.inputs.propertyName })));
    downloadBlob(await leasingPdf({ title: scope === "fund" ? scopeName || "All assets" : inputs.propertyName, rows, comps: cs, todayISO }), `leasing-${todayISO}.pdf`);
  }

  async function exportX() {
    downloadBlob(await writeXlsx(leasingXlsx(rows, (scope === "fund" ? deals : [deal]).flatMap((d) => leasingOf(d.inputs).comps.map((c) => ({ ...c, asset: d.inputs.propertyName }))), { todayISO }), { sheetName: "Leasing" }), `leasing-${todayISO}.xlsx`);
  }
  async function upload(file) {
    setMsg(null);
    try {
      const grid = await rentCompsFromFile(file);
      const det = detectRentCompMapping(grid, L.compMapping);
      if (!det.ok) { setMsg("Couldn't find the rent and address (or tenant) columns. Check the header row."); return; }
      setPending({ grid, det, name: file.name });
    } catch (e) { setMsg(e.message); }
  }
  function confirmImport() {
    const { grid, det, name } = pending;
    const r = importRentComps(L.comps, grid, det, { source: name });
    edit((l) => ({ ...l, comps: r.comps, compMapping: det.names }));
    setMsg(`Imported ${name}: ${r.added} added, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped (no rent or address)` : ""}.`);
    setPending(null);
  }

  return (
    <div className="space-y-5 text-gray-900" data-testid="leasing">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-bold">Active Leasing</h2><p className="text-xs text-gray-500">Leasing prospects and renewals by unit against the business plan, and rent comps for {inputs.propertyName}.</p></div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {[["asset", inputs.propertyName || "This asset"], ["fund", scopeName ? `All of ${scopeName}` : "All assets"]].map(([k, l]) => <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-2 py-1 ${scope === k ? "bg-white font-semibold shadow-sm" : "text-gray-500"}`}>{l}</button>)}
          </div>
          <button type="button" onClick={exportPdf} className={`${btn} border-gray-300 bg-white`}>PDF</button>
          <button type="button" onClick={exportX} className={`${btn} border-gray-300 bg-white`}>Excel</button>
        </div>
      </div>

      {/* ── Vacant Units (1.1.3, moved from the Dashboard) ── */}
      <VacantUnits
        deals={scope === "fund" ? deals : [deal]}
        todayISO={todayISO}
        showAsset={scope === "fund"}
        onAddProspect={canEdit ? (dealId, unitId, sf) => edit((l) => ({ ...l, prospects: [...l.prospects, makeProspect({ unitId, sf: sf || null })] })) : null}
        onOpenAsset={onOpenDeal ? (id) => { onOpenDeal(id); setScope("asset"); } : null}
      />

      {/* ── Leasing Pipeline ── */}
      <section className="space-y-2" data-testid="leasing-pipeline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Leasing Pipeline</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {PROSPECT_STAGES.map(([k, l]) => <span key={k} className={`rounded px-1.5 py-0.5 ${STAGE_CLS[k]}`}>{l} {totals[k].count}</span>)}
            <label className="text-gray-600"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show signed and lost</label>
            {canEdit && scope === "asset" && <button type="button" onClick={() => edit((l) => ({ ...l, prospects: [...l.prospects, makeProspect({ unitId: units.find((u) => u.leaseStatus !== "occupied")?.id ?? units[0]?.id ?? "" })] }))} className={`${btn} border-blue-600 bg-blue-600 text-white`}>+ Prospect</button>}
            {canEdit && scope === "asset" && <button type="button" onClick={() => { const u = units.filter((z) => z.leaseStatus === "occupied" && z.leaseEnd).sort((a, b) => (a.leaseEnd < b.leaseEnd ? -1 : 1))[0]; edit((l) => ({ ...l, prospects: [...l.prospects, makeProspect({ kind: "renewal", unitId: u?.id ?? "", tenant: u?.tenantName ?? "", sf: u?.squareFeet ?? null, source: "Existing tenant" })] })); }} className={`${btn} border-gray-300 bg-white`}>+ Renewal</button>}
          </div>
        </div>
        {shown.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-xs text-gray-500">No prospects{showDone ? "" : " in progress"}.</p> : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500"><tr>{[...(scope === "fund" ? ["Asset"] : []), "Unit", "Prospect / tenant", "Kind", "Source / broker", "Stage", "SF", "Asking", "Proposed", "Term (mo)", "Free (mo)", "TI/SF", "Net effective", "Start", "vs. plan rent", "Downtime vs. plan", "Next step", ...(workspaceId ? ["Documents"] : [])].map((h) => <th key={h} className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{shown.map((x) => {
                const p = x.p, ed = canEdit && scope === "asset";
                const set = (patch) => (scope === "asset" ? setP(p.id, patch) : onUpdate(x.dealId, (cur) => ({ ...cur, leasing: { ...leasingOf(cur), prospects: leasingOf(cur).prospects.map((z) => (z.id === p.id ? { ...z, ...patch } : z)) } })));
                const v = vsPlan(x.inputs, p, todayISO);
                const ner = netEffective(p);
                return (
                  <tr key={p.id} className="border-t border-gray-100 align-top" data-testid="prospect-row">
                    {scope === "fund" && <td className="px-1.5 py-1">{x.asset}</td>}
                    <td className="px-1.5 py-1"><select aria-label="Unit" value={p.unitId} disabled={!ed} onChange={(e) => set({ unitId: e.target.value })} className={inp}><option value="">—</option>{(x.inputs.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name || u.id}{u.leaseStatus !== "occupied" ? " (vacant)" : ""}</option>)}</select></td>
                    <td className="px-1.5 py-1"><input aria-label="Prospect" value={p.tenant} disabled={!ed} onChange={(e) => set({ tenant: e.target.value })} className={`${inp} w-32`} /></td>
                    <td className="px-1.5 py-1">{p.kind === "renewal" ? "Renewal" : "New"}</td>
                    <td className="px-1.5 py-1"><select aria-label="Source" value={p.source} disabled={!ed} onChange={(e) => set({ source: e.target.value })} className={inp}>{PROSPECT_SOURCES.map((s) => <option key={s}>{s}</option>)}</select><input aria-label="Broker" placeholder="Broker" value={p.broker} disabled={!ed} onChange={(e) => set({ broker: e.target.value })} className={`${inp} mt-0.5 block w-28`} /></td>
                    <td className="px-1.5 py-1"><select aria-label="Prospect stage" value={p.stage} disabled={!canEdit} onChange={(e) => set({ stage: e.target.value })} className={`${inp} ${STAGE_CLS[p.stage]}`}>{PROSPECT_STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{p.stage === "lost" && <input aria-label="Lost reason" placeholder="Why lost" value={p.lostReason} disabled={!canEdit} onChange={(e) => set({ lostReason: e.target.value })} className={`${inp} mt-0.5 block w-28`} />}</td>
                    {[["sf", "SF", "w-16"], ["askingRentPSF", "Asking rent", "w-16"], ["proposedRentPSF", "Proposed rent", "w-16"], ["termMonths", "Term", "w-12"], ["freeMonths", "Free months", "w-12"], ["tiPSF", "TI per SF", "w-14"]].map(([k, l, w]) => (
                      <td key={k} className="px-1.5 py-1"><input aria-label={l} type="number" step="any" value={p[k] ?? ""} disabled={!ed} onChange={(e) => set({ [k]: num(e.target.value) })} className={`${inp} ${w}`} /></td>
                    ))}
                    <td className="px-1.5 py-1 font-semibold" data-testid="prospect-ner">{psf(ner)}</td>
                    <td className="px-1.5 py-1"><input aria-label="Expected start" type="date" value={p.expectedStart} disabled={!ed} onChange={(e) => set({ expectedStart: e.target.value })} className={inp} /></td>
                    <td className="px-1.5 py-1" data-testid="prospect-vs-plan">{v ? <span className={v.rentVsPct != null && v.rentVsPct < 0 ? "text-red-700" : "text-emerald-700"}>{pct(v.rentVsPct)}<span className="block text-[10px] text-gray-400">plan {psf(v.targetRentPSF)}</span></span> : <span className="text-gray-400">no plan</span>}</td>
                    <td className="px-1.5 py-1">{v?.downtime != null ? <span className={v.downtimeVs > 0 ? "text-red-700" : "text-emerald-700"}>{v.downtime} mo{v.targetDowntime != null ? <span className="block text-[10px] text-gray-400">plan {v.targetDowntime} mo</span> : null}</span> : "—"}</td>
                    <td className="px-1.5 py-1"><input aria-label="Next step" value={p.nextStep} disabled={!ed} onChange={(e) => set({ nextStep: e.target.value })} className={`${inp} w-28`} /><input aria-label="Next date" type="date" value={p.nextDate} disabled={!ed} onChange={(e) => set({ nextDate: e.target.value })} className={`${inp} mt-0.5 block`} /></td>
                    {workspaceId && <td className="px-1.5 py-1"><Docs compact docs={lDocs.filter((d) => d.target === p.id)} types={PROSPECT_DOC_TYPES} ctx={ctxFor(x.dealId, p.id)} /></td>}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-400">Net effective rent = rent over the term (with escalations) less free rent and TI, per year. Plan = the latest business plan revision&apos;s leasing row for the unit; downtime runs from the lease end (or today, when vacant) to the expected start.{scope === "fund" ? " Edit prospects on each asset's own view." : ""}</p>
      </section>

      {/* ── Rent Comps ── */}
      {scope === "asset" && (
        <section className="space-y-2" data-testid="rent-comps">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Rent Comps</h3>
            {canEdit && (
              <div className="flex items-center gap-2 text-xs">
                <button type="button" onClick={() => edit((l) => ({ ...l, comps: [...l.comps, makeRentComp()] }))} className={`${btn} border-gray-300 bg-white`}>+ Comp</button>
                <label className={`${btn} cursor-pointer border-gray-300 bg-white`}>Upload CoStar / spreadsheet<input type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="rent-comp-file" onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ""; if (fl) upload(fl); }} /></label>
              </div>
            )}
          </div>
          {pending && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs" data-testid="rent-comp-mapping">
              <p className="mb-1 font-semibold">Columns found in {pending.name} (remembered for next time):</p>
              <p className="text-gray-700">{RENT_COMP_FIELDS.filter((x) => pending.det.names[x.key]).map((x) => `${x.label} ← "${pending.det.names[x.key]}"`).join(" · ")}</p>
              <div className="mt-1.5 flex gap-2"><button type="button" onClick={confirmImport} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Import</button><button type="button" onClick={() => setPending(null)} className="text-gray-600 hover:underline">Cancel</button></div>
            </div>
          )}
          {msg && <p role="status" className="text-xs text-gray-600" data-testid="leasing-msg">{msg}</p>}
          {workspaceId && <Docs docs={lDocs.filter((d) => d.target === "comps" && d.dealId === deal.id)} types={COMPS_DOC_TYPES} ctx={ctxFor(deal.id, "comps")} />}
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="flex flex-col"><span className="text-[10px] text-gray-500">Signed on or after</span><input aria-label="Comps since" type="date" value={f.since} onChange={(e) => setF({ ...f, since: e.target.value })} className={inp} /></label>
            <label className="flex flex-col"><span className="text-[10px] text-gray-500">Min SF</span><input aria-label="Min SF" type="number" value={f.minSF} onChange={(e) => setF({ ...f, minSF: e.target.value })} className={`${inp} w-20`} /></label>
            <label className="flex flex-col"><span className="text-[10px] text-gray-500">Max SF</span><input aria-label="Max SF" type="number" value={f.maxSF} onChange={(e) => setF({ ...f, maxSF: e.target.value })} className={`${inp} w-20`} /></label>
            <label className="flex flex-col"><span className="text-[10px] text-gray-500">Submarket</span><input aria-label="Submarket filter" value={f.submarket} onChange={(e) => setF({ ...f, submarket: e.target.value })} className={`${inp} w-28`} /></label>
            <label className="flex flex-col"><span className="text-[10px] text-gray-500">Lease type</span><input aria-label="Lease type filter" value={f.leaseType} onChange={(e) => setF({ ...f, leaseType: e.target.value })} className={`${inp} w-24`} /></label>
            <span className="ml-auto text-gray-500">{comps.length} of {L.comps.length} comps</span>
          </div>
          {stats && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs" data-testid="rent-comp-stats">
              <span>Comps ({stats.count}): avg <b>{psf(stats.avg)}</b> (SF-weighted) · median {psf(stats.median)} · {psf(stats.low)}–{psf(stats.high)}{stats.netEffectiveAvg != null ? ` · net effective ${psf(stats.netEffectiveAvg)}` : ""}</span>
              {vs && <span className="text-gray-600">In place {psf(vs.inPlace)} ({pct(vs.inPlaceVsPct)}) · model market rent {psf(vs.market)} ({pct(vs.marketVsPct)})</span>}
              {canEdit && <button type="button" onClick={() => { const v = Math.round(stats.avg * 100) / 100; if (window.confirm(`Set ${inputs.propertyName}'s market rent (model) from ${psf(vs?.market)} to the comps' average ${psf(v)}/SF? The model and returns update.`)) onUpdate(deal.id, (cur) => ({ ...cur, rentPerSF: v })); }} className={`${btn} border-blue-300 bg-white text-blue-700`}>Set market rent from comps</button>}
            </div>
          )}
          {L.comps.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500"><tr><th className="px-1.5 py-1.5 text-left font-medium">Use</th>{RENT_COMP_FIELDS.map((x) => <th key={x.key} className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">{x.label}</th>)}<th className="px-1.5 py-1.5 text-left font-medium">Net effective</th></tr></thead>
                <tbody>{comps.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100" data-testid="rent-comp-row">
                    <td className="px-1.5 py-1"><input aria-label="Use comp" type="checkbox" checked={c.include !== false} disabled={!canEdit} onChange={(e) => setC(c.id, { include: e.target.checked })} /></td>
                    {RENT_COMP_FIELDS.map((x) => {
                      const numeric = ["sf", "rentPSF", "termMonths", "freeMonths", "tiPSF"].includes(x.key);
                      return <td key={x.key} className="px-1.5 py-1"><input aria-label={`Comp ${x.label}`} type={x.key === "signDate" ? "date" : numeric ? "number" : "text"} step="any" value={c[x.key] ?? ""} disabled={!canEdit} onChange={(e) => setC(c.id, { [x.key]: numeric ? num(e.target.value) : e.target.value })} className={`${inp} ${numeric ? "w-16" : x.key === "address" ? "w-40" : "w-24"}`} /></td>;
                    })}
                    <td className="px-1.5 py-1">{psf(netEffective({ askingRentPSF: c.rentPSF, termMonths: c.termMonths, freeMonths: c.freeMonths, tiPSF: c.tiPSF }))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
