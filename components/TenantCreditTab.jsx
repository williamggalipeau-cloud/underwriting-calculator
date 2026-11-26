"use client";

// Asset Management → Tenant Credit (user, 11/26, 1.1.8): the credit review
// workspace for every tenant, one asset or all (lib/creditReview.js). The risk
// report's Tenant Credit section is its flagged rows. Credit is reviewed at
// renewal.
import { Fragment, useEffect, useMemo, useState } from "react";
import CreditForm from "@/components/CreditForm";
import { listLeases } from "@/lib/leaseDocs";
import { listCreditDocs } from "@/lib/creditDocs";
import { agedRent } from "@/lib/agedRent";
import { KIND_LABEL, docDate } from "@/lib/tenantCredit";
import { OWN_RATINGS, RESULTS, SCORE_TYPE_SHORT, STATUS_LABEL, creditFilter, creditOf, creditRows, latestText, makeFlag, recordFrom } from "@/lib/creditReview";

const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const fmtM = (n) => (n == null || !isFinite(n) ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const STATUS_CLS = { weak: "bg-red-100 text-red-800", watch: "bg-amber-100 text-amber-800", missing: "bg-gray-100 text-gray-700", ok: "bg-emerald-50 text-emerald-800" };
const btn = "rounded border px-2 py-0.5 text-[11px] font-medium";

export default function TenantCreditTab({ deal, deals = [], funds = {}, canEdit = false, email = null, workspaceId = null, onUpdate, onOpenLeases = null, todayISO = new Date().toISOString().slice(0, 10) }) {
  const [scope, setScope] = useState("asset");
  const [filter, setFilter] = useState("attention");
  const [open, setOpen] = useState(null); // unit id
  const [mode, setMode] = useState(null); // "record" | "flag" | { clear: flagId }
  const [flagDraft, setFlagDraft] = useState({ date: todayISO, reason: "" });
  const [clearNote, setClearNote] = useState("");
  const [db, setDb] = useState({ leases: [], creditDocs: [] });
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    Promise.all([listLeases(workspaceId).catch(() => []), listCreditDocs(workspaceId).catch(() => [])]).then(([leases, creditDocs]) => live && setDb({ leases, creditDocs }));
    return () => { live = false; };
  }, [workspaceId]);
  const shownDeals = useMemo(() => (scope === "asset" && deal ? [deal] : deals), [scope, deal, deals]);
  const rows = useMemo(() => {
    // Aged rent per fund (each fund's latest upload), for the 60+ days flag.
    const byFund = {};
    for (const d of shownDeals) (byFund[d.inputs.fundName ?? ""] ??= []).push(d);
    const tenants = Object.entries(byFund).flatMap(([f, ds]) => agedRent(funds?.[f]?.delinquency, deals.filter((d) => d.inputs.fundName === f))?.tenants.filter((t) => ds.some((d) => d.id === t.dealId)) ?? []);
    return creditRows(shownDeals, { creditDocs: db.creditDocs, leases: db.leases, aged: { tenants }, funds, asOf: todayISO });
  }, [shownDeals, deals, funds, db, todayISO]);
  const counts = { attention: creditFilter(rows, "attention", todayISO).length, review: creditFilter(rows, "review", todayISO).length, all: rows.length };
  const list = creditFilter(rows, filter, todayISO);
  const editUnit = (dealId, unitId, fn) => onUpdate(dealId, (cur) => ({ ...cur, units: (cur.units ?? []).map((u) => (u.id === unitId ? { ...u, credit: fn(creditOf(u)) } : u)) }));
  if (!deal && scope === "asset") return <p className="text-xs text-gray-500">Choose an asset.</p>;

  return (
    <section className="space-y-3 text-gray-900" data-testid="tenant-credit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Tenant Credit</h2>
          <p className="text-xs text-gray-500">The credit review of every tenant: screenings, credit reports, our own assessments and credit-change flags. Credit is reviewed at renewal (review due = the renewal notice deadline, else the lease end).</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
          {[["asset", deal?.inputs?.propertyName || "This asset"], ["fund", "All assets"]].map(([k, l]) => <button key={k} type="button" onClick={() => setScope(k)} className={`rounded px-2 py-1 ${scope === k ? "bg-blue-600 text-white" : "text-gray-700"}`}>{l}</button>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs" role="tablist" aria-label="Tenant Credit filter">
        {[["attention", `Needs attention ${counts.attention}`], ["review", `Review due at renewal (next 12 months) ${counts.review}`], ["all", `All tenants ${counts.all}`]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-md border px-2 py-1 ${filter === k ? "border-blue-500 bg-blue-50 font-semibold text-blue-700" : "border-gray-300 bg-white text-gray-700"}`}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-xs text-gray-500" data-testid="credit-empty">{filter === "attention" ? "No tenant needs attention." : filter === "review" ? "No credit review due at renewal in the next 12 months." : "No occupied units with a tenant name."}</p> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500"><tr>{["Tenant", "Asset", "Latest credit record", "Score vs. threshold", "Status", "Flags", "Rent 60+ late", "Annual rent", "Lease ends", "Review due (renewal)", ""].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{list.map((r) => {
              const isOpen = open === `${r.dealId}:${r.unitId}`;
              const l = r.latest;
              return (
                <Fragment key={`${r.dealId}:${r.unitId}`}>
                  <tr className="border-t border-gray-100 align-top" data-testid="credit-row">
                    <td className="px-2 py-1.5 font-medium">{r.tenant}<span className="block text-[10px] font-normal text-gray-400">unit {r.unit || "—"}</span></td>
                    <td className="px-2 py-1.5">{r.asset}</td>
                    <td className="px-2 py-1.5">{l ? <>{l.sourceLabel}<span className="block text-[10px] text-gray-400">{usDate(l.date)}</span></> : <span className="text-amber-700">None on file</span>}</td>
                    <td className="px-2 py-1.5">{l?.scoreType && l.score != null && l.score !== "" ? <span className={Number(l.score) < r.thresholds[l.scoreType] ? "font-semibold text-red-700" : ""}>{SCORE_TYPE_SHORT[l.scoreType]} {l.score} / {r.thresholds[l.scoreType]}</span> : l?.rating ? l.rating : "—"}</td>
                    <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLS[r.status]}`} data-testid="credit-status">{STATUS_LABEL[r.status]}</span></td>
                    <td className="px-2 py-1.5">{r.reasons.length ? <ul className="list-disc pl-4">{r.reasons.map((x, i) => <li key={i} className={x.level === "weak" ? "text-red-800" : "text-amber-800"}>{x.text}</li>)}</ul> : "—"}</td>
                    <td className={`px-2 py-1.5 text-right ${r.late60 > 0 ? "font-semibold text-red-700" : ""}`}>{r.late60 > 0 ? fmtM(r.late60) : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{fmtM(r.rent)}</td>
                    <td className="px-2 py-1.5">{usDate(r.leaseEnd)}</td>
                    <td className="px-2 py-1.5">{usDate(r.reviewDue)}</td>
                    <td className="px-2 py-1.5 text-right"><button type="button" onClick={() => { setOpen(isOpen ? null : `${r.dealId}:${r.unitId}`); setMode(null); }} className={`${btn} border-blue-200 text-blue-700`}>{isOpen ? "Close" : r.status === "missing" ? "Add record" : "Open"}</button></td>
                  </tr>
                  {isOpen && (
                    <tr data-testid="credit-detail"><td colSpan={11} className="bg-gray-50/60 px-3 py-2">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-1.5 text-xs">
                          <p className="font-semibold text-gray-700">Credit history: {r.tenant}</p>
                          {r.records.length === 0 && r.docs.length === 0 && r.flags.length === 0 && <p className="text-gray-500">No credit record yet.</p>}
                          <ul className="space-y-1">
                            {[...r.records.map((x) => ({ d: x.date || String(x.at).slice(0, 10), t: x.source === "own" ? `Own assessment: ${OWN_RATINGS.find(([k]) => k === x.rating)?.[1] ?? x.rating}${x.basis ? ` (${x.basis})` : ""}` : `${x.kind === "screening" ? "Screening" : "Report"}: ${x.provider}${x.score != null && x.score !== "" ? ` · ${SCORE_TYPE_SHORT[x.scoreType] ?? "score"} ${x.score}` : ""} · ${RESULTS.find(([k]) => k === x.result)?.[1] ?? ""}${x.issues ? ` · issues: ${x.issues}` : ""}${x.conditions ? ` · conditions: ${x.conditions}` : ""}`, by: x.by })),
                              ...r.docs.map((x) => ({ d: docDate(x), t: `${KIND_LABEL[x.kind] ?? x.kind} on the lease${x.figures?.score ? ` · score ${x.figures.score}` : ""}${x.figures?.rating ? ` · rating ${x.figures.rating}` : ""}`, by: "" })),
                              ...r.flags.map((f) => ({ d: f.date, t: `⚑ Credit change: ${f.reason}${f.status === "cleared" ? ` · cleared ${String(f.clearedAt).slice(0, 10)}${f.clearNote ? ` (${f.clearNote})` : ""}` : " · open"}`, by: f.by, flag: f }))]
                              .sort((a, b) => (a.d < b.d ? 1 : -1))
                              .map((x, i) => (
                                <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-2 py-1">
                                  <span><span className="text-gray-500">{usDate(x.d)}</span> · {x.t}{x.by ? <span className="text-gray-400"> · {x.by}</span> : null}</span>
                                  {canEdit && x.flag?.status === "open" && <button type="button" onClick={() => { setMode({ clear: x.flag.id }); setClearNote(""); }} className={`${btn} border-gray-300 text-gray-700`}>Clear flag</button>}
                                </li>
                              ))}
                          </ul>
                          {onOpenLeases && <button type="button" onClick={() => onOpenLeases(r.dealId)} className="text-[11px] text-blue-700 hover:underline">Credit reports and statements on the lease → Leases</button>}
                        </div>
                        <div className="space-y-2 text-xs">
                          {canEdit && !mode && (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => setMode("record")} className={`${btn} border-blue-300 bg-white text-blue-700`}>Add credit record</button>
                              <button type="button" onClick={() => { setMode("flag"); setFlagDraft({ date: todayISO, reason: "" }); }} className={`${btn} border-red-300 bg-white text-red-700`}>⚑ Flag credit change</button>
                            </div>
                          )}
                          {mode === "record" && <CreditForm saveLabel="Save credit record" onCancel={() => setMode(null)} onSave={(s) => { editUnit(r.dealId, r.unitId, (c) => ({ ...c, records: [...c.records, recordFrom(s, { kind: "report", by: email ?? "", tenant: r.tenant })] })); setMode(null); }} />}
                          {mode === "flag" && (
                            <div className="space-y-1.5 rounded-lg border border-red-100 bg-red-50/40 p-2" data-testid="credit-flag-form">
                              <label className="flex flex-col"><span className="text-[10px] text-gray-500">Date</span><input aria-label="Flag date" type="date" value={flagDraft.date} onChange={(e) => setFlagDraft({ ...flagDraft, date: e.target.value })} className="rounded border border-gray-300 px-1.5 py-0.5" /></label>
                              <label className="flex flex-col"><span className="text-[10px] text-gray-500">What changed</span><input aria-label="Flag reason" value={flagDraft.reason} onChange={(e) => setFlagDraft({ ...flagDraft, reason: e.target.value })} className="rounded border border-gray-300 px-1.5 py-0.5" /></label>
                              <div className="flex gap-2">
                                <button type="button" disabled={!flagDraft.reason.trim() || !flagDraft.date} onClick={() => { editUnit(r.dealId, r.unitId, (c) => ({ ...c, flags: [...c.flags, makeFlag({ ...flagDraft, by: email ?? "" })] })); setMode(null); }} className="rounded bg-red-700 px-2 py-0.5 font-medium text-white disabled:opacity-40">Flag</button>
                                <button type="button" onClick={() => setMode(null)} className="rounded border border-gray-300 bg-white px-2 py-0.5">Cancel</button>
                              </div>
                            </div>
                          )}
                          {mode?.clear && (
                            <div className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-2" data-testid="credit-clear-form">
                              <label className="flex flex-col"><span className="text-[10px] text-gray-500">Why it&apos;s cleared</span><input aria-label="Clear note" value={clearNote} onChange={(e) => setClearNote(e.target.value)} className="rounded border border-gray-300 px-1.5 py-0.5" /></label>
                              <div className="flex gap-2">
                                <button type="button" disabled={!clearNote.trim()} onClick={() => { editUnit(r.dealId, r.unitId, (c) => ({ ...c, flags: c.flags.map((f) => (f.id === mode.clear ? { ...f, status: "cleared", clearedAt: new Date().toISOString(), clearedBy: email ?? "", clearNote: clearNote.trim() } : f)) })); setMode(null); }} className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white disabled:opacity-40">Clear flag</button>
                                <button type="button" onClick={() => setMode(null)} className="rounded border border-gray-300 bg-white px-2 py-0.5">Cancel</button>
                              </div>
                            </div>
                          )}
                          <p className="text-[11px] text-gray-500">Latest: {latestText(l)}. Every change is saved with the asset and logged in the change log.</p>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">Weak: an open credit-change flag, a score below its threshold (portfolio setting: Risk report → Risk thresholds), our own assessment &quot;Weak&quot;, a declined screening, or rent 60+ days late. Watch: issues noted or conditions, a falling score, rising leverage or overdue statements on the lease. Missing: no credit record.</p>
    </section>
  );
}
