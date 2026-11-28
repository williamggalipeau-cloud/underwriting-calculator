"use client";

// Phase T: the four Property Management tabs from one component.
// tab: "taxes" | "insurance" | "condition" | "contracts". One asset (editable)
// or the whole fund (read-only, by asset). onUpdate(dealId, fn) edits inputs.
import { propertyManagerLabel } from "@/lib/propertyManager";
import { useEffect, useRef, useState } from "react";
import { PM_TABS, addToCapitalPlan, blankRow, pmDates, pmXlsx, rowsOf, setSection, taxSummary, insuranceSummary, conditionSummary, contractsSummary } from "@/lib/propertyMgmt";
import { addRevision } from "@/lib/businessPlan";
import { pmDocs, uploadPmDoc } from "@/lib/pmDocs";
import { dealFileLink, listDealDocs } from "@/lib/dealDocs";
import { listLeases } from "@/lib/leaseDocs";
import { TI_STATUS, setTenantInsurance, summaryLabel, tenantInsuranceRows, tenantInsuranceSheet, tenantInsuranceSummary } from "@/lib/tenantInsurance";
import TiSpend from "@/components/TiSpend";
import { downloadBlob } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const inp = "rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:bg-transparent disabled:border-transparent";
const money = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Math.round(Number(v)).toLocaleString("en-US")}`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");

function Cell({ col, value, onChange, disabled }) {
  const [k, label, type, opts] = col;
  if (type === "select") return <select aria-label={label} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={inp}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  if (type === "check") return <input aria-label={label} type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
  if (type === "date") return <input aria-label={label} type="date" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={inp} />;
  if (type === "money" || type === "number") return <input aria-label={label} type="number" step="any" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={`${inp} ${type === "money" ? "w-24" : "w-16"}`} />;
  return <input aria-label={label} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inp} ${k === "finding" || k === "notes" || k === "address" ? "w-48" : "w-28"}`} />;
}

function Summary({ tab, inputs, year }) {
  if (tab === "taxes") {
    const s = taxSummary(inputs, year);
    return <span>{year}: billed {money(s.billed)} · paid {money(s.paid)} · unpaid {money(s.unpaid)}{s.budget != null ? <> · budget {money(s.budget)} <b className={s.vsBudget > 0 ? "text-red-700" : "text-emerald-700"}>({s.vsBudgetPct != null ? `${s.vsBudgetPct >= 0 ? "+" : ""}${s.vsBudgetPct.toFixed(1)}%` : "—"})</b></> : " · no budget"} · assessed {money(s.assessed)} · appeal savings {money(s.appealSavings)}{s.openAppeals ? ` · ${s.openAppeals} pending appeal${s.openAppeals === 1 ? "" : "s"}` : ""}</span>;
  }
  if (tab === "insurance") { const s = insuranceSummary(inputs); return <span>{s.policies} polic{s.policies === 1 ? "y" : "ies"} · premium {money(s.premium)}/yr · property limit {money(s.propertyLimit)} · {s.openClaims} open claim{s.openClaims === 1 ? "" : "s"} · claimed {money(s.claimed)}, recovered {money(s.recovered)}</span>; }
  if (tab === "condition") { const s = conditionSummary(inputs); return <span>{s.open} open of {s.items} · open cost {money(s.openCost)} ({s.byUrgency.filter((u) => u.count).map((u) => `${u.urgency} ${money(u.cost)}`).join(", ") || "none"}) · completed {money(s.done)}</span>; }
  const s = contractsSummary(inputs);
  return <span>{s.contracts} contract{s.contracts === 1 ? "" : "s"} · {money(s.annualCost)}/yr · {s.autoRenew} auto-renew</span>;
}

// Upload area for one section of one asset (signed in to the firm).
function SectionDocs({ docs, upload, canEdit }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const open = async (d) => { const f = d.doc.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); };
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]" data-testid="pm-docs">
      {docs.map((d) => <button key={d.id} type="button" onClick={() => open(d)} className="text-blue-700 hover:underline">{d.name}</button>)}
      {canEdit && <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40">{busy ? "Uploading…" : "Upload PDF"}</button>}
      <input ref={ref} type="file" accept="application/pdf" className="hidden" data-testid="pm-file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); setMsg(null); try { await upload(f); } catch (err) { setMsg(err.message); } finally { setBusy(false); } }} />
      {msg && <span className="text-red-700">{msg}</span>}
    </div>
  );
}

const summaryText = (tab, inputs, year) => {
  if (tab === "taxes") { const s = taxSummary(inputs, year); return `${year}: billed ${money(s.billed)}, paid ${money(s.paid)}, unpaid ${money(s.unpaid)}${s.budget != null ? `, budget ${money(s.budget)} (${s.vsBudgetPct != null ? `${s.vsBudgetPct >= 0 ? "+" : ""}${s.vsBudgetPct.toFixed(1)}%` : "-"})` : ""}, appeal savings ${money(s.appealSavings)}`; }
  if (tab === "insurance") { const s = insuranceSummary(inputs); return `${s.policies} policies, premium ${money(s.premium)}/yr, property limit ${money(s.propertyLimit)}, ${s.openClaims} open claims`; }
  if (tab === "condition") { const s = conditionSummary(inputs); return `${s.open} open of ${s.items}, open cost ${money(s.openCost)}, completed ${money(s.done)}`; }
  const s = contractsSummary(inputs); return `${s.contracts} contracts, ${money(s.annualCost)}/yr, ${s.autoRenew} auto-renew`;
};

export default function PropertyMgmt({ tab, deal, deals = [], canEdit = false, onUpdate, todayISO = new Date().toISOString().slice(0, 10), scopeName = "", workspaceId = null, email = null, onOpenTab = null }) {
  const T = PM_TABS[tab];
  const [scope, setScope] = useState("asset");
  const [year, setYear] = useState(todayISO.slice(0, 4));
  const [allDocs, setAllDocs] = useState([]);
  const [planMsg, setPlanMsg] = useState(null);
  const [leases, setLeases] = useState([]);
  const reload = () => (workspaceId ? Promise.all([listDealDocs(workspaceId).then(setAllDocs).catch(() => {}), tab === "insurance" ? listLeases(workspaceId).then(setLeases).catch(() => {}) : null]) : Promise.resolve());
  useEffect(() => { reload(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!deal) return <p className="text-xs text-gray-500">Choose an asset.</p>;
  const list = scope === "fund" ? deals : [deal];
  const dates = pmDates(list, todayISO, { within: 120 }).filter((d) => d.tab === tab);
  const ed = canEdit && scope === "asset";
  const setRows = (section, fn) => onUpdate(deal.id, (cur) => setSection(cur, section, fn(rowsOf(cur, section))));

  return (
    <div className="space-y-4 text-gray-900" data-testid={`pm-${tab}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-bold">{T.label}</h2>{scope === "asset" && propertyManagerLabel(deal.inputs) && <p className="text-xs text-gray-700" data-testid="pm-manager">Property manager: {propertyManagerLabel(deal.inputs)} <span className="text-gray-500">(set in the asset&apos;s inputs)</span></p>}<p className="text-xs text-gray-500">{scope === "fund" ? `Every asset${scopeName ? ` in ${scopeName}` : ""}` : deal.inputs.propertyName}. Dates within 60 days appear on Home.</p></div>
        <div className="flex items-center gap-2 text-xs">
          {tab === "taxes" && <label className="flex items-center gap-1">Tax year <input aria-label="Tax year" type="number" value={year} onChange={(e) => setYear(e.target.value)} className={`${inp} w-16`} /></label>}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {[["asset", deal.inputs.propertyName || "This asset"], ["fund", scopeName ? `All of ${scopeName}` : "All assets"]].map(([k, l]) => <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-2 py-1 ${scope === k ? "bg-white font-semibold shadow-sm" : "text-gray-500"}`}>{l}</button>)}
          </div>
          <button type="button" onClick={async () => { const { pmPdf } = await import("@/lib/pmPdf"); downloadBlob(await pmPdf(tab, list, { title: scope === "fund" ? scopeName || "All assets" : deal.inputs.propertyName, summaries: list.map((d) => ({ asset: d.inputs.propertyName, text: summaryText(tab, d.inputs, year) })), todayISO }), `${tab}-${todayISO}.pdf`); }} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium">PDF</button>
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(pmXlsx(tab, list, { year: tab === "taxes" ? year : null }), { sheetName: T.label.slice(0, 30) }), `${tab}-${todayISO}.xlsx`)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium">Excel</button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs" data-testid="pm-summary">
        {scope === "asset" ? <Summary tab={tab} inputs={deal.inputs} year={year} /> : (
          <table className="w-full"><tbody>{list.map((d) => <tr key={d.id}><td className="pr-3 font-medium">{d.inputs.propertyName}</td><td><Summary tab={tab} inputs={d.inputs} year={year} /></td></tr>)}</tbody></table>
        )}
      </div>

      {dates.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs" data-testid="pm-dates">
          <p className="mb-1 font-semibold text-amber-900">Coming up (120 days)</p>
          <ul className="space-y-0.5">{dates.map((d, i) => <li key={i}>{d.date ? <span className={`tabular-nums ${d.days < 0 ? "text-red-700" : "text-gray-600"}`}>{usDate(d.date)}{d.days != null ? ` · ${d.days < 0 ? `${-d.days} d overdue` : `${d.days} d`}` : ""} </span> : null}{d.text}</li>)}</ul>
        </div>
      )}

      {tab === "condition" && scope === "asset" && <TiSpend deal={deal} deals={deals.some((d) => d.id === deal.id) ? deals : [deal, ...deals]} canEdit={canEdit} onUpdate={onUpdate} />}
      {planMsg && <p role="status" className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-900" data-testid="pm-plan-msg">{planMsg}</p>}
      {tab === "insurance" && <h3 className="border-b border-gray-200 pb-1 text-base font-bold" data-testid="ins-property-heading">Property insurance <span className="text-xs font-normal text-gray-500">· the sponsor&apos;s policies on the asset, and its claims</span></h3>}
      {T.sections.map((s) => {
        const rows = list.flatMap((d) => rowsOf(d.inputs, s.key).map((r) => ({ d, r })));
        return (
          <section key={s.key} className="space-y-1.5" data-testid={`pm-section-${s.key}`}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{s.label} <span className="font-normal text-gray-500">({rows.length})</span></h3>
              {ed && <button type="button" onClick={() => setRows(s.key, (rs) => [...rs, blankRow(tab, s.key)])} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium">+ Add</button>}</div>
            {workspaceId && scope === "asset" && <SectionDocs docs={pmDocs(allDocs, [deal.id]).filter((x) => x.section === s.key)} canEdit={canEdit} upload={async (file) => { await uploadPmDoc(workspaceId, { dealId: deal.id, section: s.key, file }, email); await reload(); }} />}
            {rows.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-xs text-gray-500">None yet.</p> : (
              <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500"><tr>{scope === "fund" && <th className="px-1.5 py-1.5 text-left font-medium">Asset</th>}{s.cols.map(([k, l]) => <th key={k} className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">{l}</th>)}{s.key === "items" && <th className="px-1.5 py-1.5 text-left font-medium">Capital plan</th>}{ed && <th />}</tr></thead>
                <tbody>{rows.map(({ d, r }) => (
                  <tr key={r.id} className="border-t border-gray-100" data-testid={`pm-row-${s.key}`}>
                    {scope === "fund" && <td className="px-1.5 py-1">{d.inputs.propertyName}</td>}
                    {s.cols.map((c) => <td key={c[0]} className="px-1.5 py-1">{scope === "fund" ? (c[2] === "money" ? money(r[c[0]]) : c[2] === "date" ? usDate(r[c[0]]) : c[2] === "check" ? (r[c[0]] ? "Yes" : "") : String(r[c[0]] ?? "")) : <Cell col={c} value={r[c[0]]} disabled={!ed} onChange={(v) => setRows(s.key, (rs) => rs.map((x) => (x.id === r.id ? { ...x, [c[0]]: v } : x)))} />}</td>)}
                    {s.key === "items" && <td className="px-1.5 py-1 whitespace-nowrap">{r.planProjectId ? <span className="text-emerald-700">In the plan ✓</span> : ed ? <button type="button" onClick={() => { const next = addToCapitalPlan(deal.inputs, r.id, { by: email || "", addRevision }); if (!next) { setPlanMsg("Create the asset's business plan first (Asset Business Plan tab)."); return; } onUpdate(deal.id, () => next); setPlanMsg(`Added to ${deal.inputs.propertyName}'s capital plan as a new plan revision.`); }} className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">Add to capital plan</button> : ""}</td>}
                    {ed && <td className="px-1.5 py-1"><button type="button" aria-label="Remove row" onClick={() => { if (window.confirm("Remove this row?")) setRows(s.key, (rs) => rs.filter((x) => x.id !== r.id)); }} className="text-gray-500 hover:text-red-700">✕</button></td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        );
      })}
      {tab === "insurance" && <TenantInsurance list={list} scope={scope} ed={ed} leases={leases} certs={allDocs} todayISO={todayISO} signedIn={!!workspaceId} onUpdate={onUpdate} onOpenTab={onOpenTab} />}
    </div>
  );
}

// Tenant insurance (1.1.29; user, 11/28): each tenant's own liability cover,
// which the lease requires and the tenant proves with a certificate. One row
// per tenant in place today; the checks are the Risk Report's.
function TenantInsurance({ list, scope, ed, leases, certs, todayISO, signedIn, onUpdate, onOpenTab }) {
  const per = list.map((d) => ({ d, rows: tenantInsuranceRows(d.inputs, { dealId: d.id, leases, certs, asOf: todayISO }) }));
  const all = per.flatMap(({ d, rows }) => rows.map((r) => ({ d, r })));
  const sum = tenantInsuranceSummary(all.map((x) => x.r));
  const [only, setOnly] = useState(false);
  const shown = only ? all.filter((x) => x.r.status !== "ok") : all;
  const set = (d, r, patch) => onUpdate(d.id, (cur) => setTenantInsurance(cur, r.key, patch));
  return (
    <section className="space-y-2" data-testid="tenant-insurance">
      <h3 className="border-b border-gray-200 pb-1 text-base font-bold">Tenant insurance <span className="text-xs font-normal text-gray-500">· each tenant&apos;s own liability cover, which the lease requires and the tenant must prove</span></h3>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs" data-testid="ti-summary">
        <span>{summaryLabel(sum)}</span>
        <span className="flex items-center gap-3">
          <label className="flex items-center gap-1"><input type="checkbox" aria-label="Only tenants needing attention" checked={only} onChange={(e) => setOnly(e.target.checked)} />Only tenants needing attention</label>
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(tenantInsuranceSheet(list, { leases, certs, asOf: todayISO }), { sheetName: "Tenant insurance" }), `tenant-insurance-${todayISO}.xlsx`)} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-medium">Excel</button>
        </span>
      </div>
      {!signedIn && <p className="text-xs text-gray-500" data-testid="ti-signed-out">Leases and certificates are your firm&apos;s documents: sign in to check each tenant against them. Until then every tenant shows as having no lease on file.</p>}
      {sum.noLease > 0 && signedIn && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900" data-testid="ti-no-lease-note">
          {sum.noLease} tenant{sum.noLease === 1 ? " is" : "s are"} on the rent roll with no lease on file, so what insurance {sum.noLease === 1 ? "it" : "they"} must carry is unknown. This is on the Dashboard as an action.{" "}
          {onOpenTab && <button type="button" onClick={() => onOpenTab("leases")} className="font-medium text-blue-700 hover:underline" data-testid="ti-upload-lease">Upload leases</button>}
        </p>
      )}
      {shown.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-xs text-gray-500">{all.length ? "Every tenant's insurance is in place." : "No tenants in place."}</p> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200"><table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500"><tr>
            {scope === "fund" && <th className="px-1.5 py-1.5 text-left font-medium">Asset</th>}
            {["Tenant", "Units", "Status", "The lease requires", "Proof on file", "Expires", "Shortfall", "Proof requested", "Proof received", "Notes"].map((h) => <th key={h} className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>{shown.map(({ d, r }) => (
            <tr key={d.id + r.key} className="border-t border-gray-100 align-top" data-testid="ti-row">
              {scope === "fund" && <td className="px-1.5 py-1">{d.inputs.propertyName}</td>}
              <td className="px-1.5 py-1 font-medium">{r.tenant}</td>
              <td className="px-1.5 py-1 text-gray-600">{r.units.join(", ")}</td>
              <td className="px-1.5 py-1"><span className={`whitespace-nowrap rounded px-1.5 py-0.5 ${TI_STATUS[r.status].cls}`} data-testid="ti-status">{TI_STATUS[r.status].label}</span></td>
              <td className="px-1.5 py-1 text-gray-700">{r.requirementsLabel}</td>
              <td className="px-1.5 py-1">{r.certId ? <>{r.certTitle || "Certificate"}{!r.certRead && <span className="text-gray-500"> (not read in yet)</span>}</> : <span className="text-gray-500">None</span>}</td>
              <td className={`px-1.5 py-1 whitespace-nowrap tabular-nums ${r.status === "expired" ? "font-medium text-red-700" : r.status === "expiring" ? "text-amber-800" : ""}`}>{usDate(r.expiry) || "—"}</td>
              <td className="px-1.5 py-1 text-red-700">{r.shortfalls.map((x) => x.text).join("; ")}</td>
              <td className="px-1.5 py-1"><input type="date" aria-label={`Proof requested: ${r.tenant}`} value={r.requested} disabled={!ed} onChange={(e) => set(d, r, { requested: e.target.value })} className={inp} /></td>
              <td className="px-1.5 py-1"><input type="date" aria-label={`Proof received: ${r.tenant}`} value={r.received} disabled={!ed} onChange={(e) => set(d, r, { received: e.target.value })} className={inp} /></td>
              <td className="px-1.5 py-1"><input aria-label={`Notes: ${r.tenant}`} value={r.notes} disabled={!ed} onChange={(e) => set(d, r, { notes: e.target.value })} className={`${inp} w-36`} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="text-[11px] text-gray-500">A tenant&apos;s certificate is uploaded below (Insurance certificates) and linked to its lease. Expiry dates are on the Dashboard&apos;s Upcoming Events; missing proof and shortfalls are in Actions Needed.</p>
    </section>
  );
}
