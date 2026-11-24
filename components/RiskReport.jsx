"use client";

// Phase L: the internal risk report (Reports tab, owners and editors only).
import { useEffect, useMemo, useState } from "react";
import { listDealDocs } from "@/lib/dealDocs";
import { listLeases } from "@/lib/leaseDocs";
import { DEFAULT_RISK_LIMITS, ENV_FIELDS, LEVELS, concentrationChange, riskReport, riskXlsx } from "@/lib/riskReport";
import { COLORS as TI_COLORS } from "@/lib/tiFunding";
import StateTileMap from "@/components/StateTileMap";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`;
  return n < 0 ? `(${s})` : s;
};
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const th = "px-2 py-1.5 font-medium";
const td = "px-2 py-1";

function Sec({ title, testId, children, right }) {
  return (
    <section className="rounded-xl border border-gray-200 p-3" data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-gray-800">{title}</h4>{right}</div>
      {children}
    </section>
  );
}
function T({ head, rows, right = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-gray-50 text-gray-500"><tr>{head.map((h, i) => <th key={i} className={`${th} ${right.includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-gray-100">{r.map((c, k) => <td key={k} className={`${td} ${right.includes(k) ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const over = (v, lim) => (v > lim ? <span className="font-semibold text-red-700">{pct(v)}</span> : pct(v));

// A heading over related sections (user, 11/24: group the report by similar risks).
function Group({ id, title, desc, children }) {
  return (
    <section className="space-y-3" data-testid={`risk-group-${id}`} aria-label={title}>
      <div className="border-b-2 border-red-200 pb-1 pt-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">{title}</h2>
        <p className="text-[11px] text-gray-500">{desc}</p>
      </div>
      {children}
    </section>
  );
}

export default function RiskReport({ fundName, terms, deals, values, asOf, curve, planGap, lineBalance = 0, email, canEdit, onFundTermsChange, onApplyDeal, workspaceId = null, prev = null }) {
  const [docs, setDocs] = useState(null);
  const [docsErr, setDocsErr] = useState("");
  const [withActions, setWithActions] = useState(false);
  const [sel, setSel] = useState(null); // { dealId, name, quarter, label, need }
  const [act, setAct] = useState({ kind: "postpone", to: "", pct: 25, amount: 0 });
  const actions = terms.tiScenario?.actions ?? [];
  const saveActions = (next) => canEdit && onFundTermsChange(fundName, { tiScenario: { ...(terms.tiScenario ?? {}), actions: next, updatedAt: new Date().toISOString(), by: email ?? "" } });
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    Promise.all([listLeases(workspaceId).catch(() => []), listDealDocs(workspaceId).catch(() => [])])
      .then(([leases, dealDocs]) => live && setDocs({ leases, dealDocs }))
      .catch((e) => live && setDocsErr(e.message));
    return () => { live = false; };
  }, [workspaceId]);
  const today = new Date().toISOString().slice(0, 10);
  const r = useMemo(() => riskReport(deals, terms, { asOf, values, curve, planGap, lineBalance, tiAsOf: today, docs, tiActions: withActions ? actions : [] }), [deals, terms, asOf, values, curve, planGap, lineBalance, today, docs, withActions, actions]);
  const [busy, setBusy] = useState(false);
  const prevR = useMemo(() => (prev && prev.deals.length ? riskReport(prev.deals, terms, { asOf: prev.asOf, values: prev.values, curve, lineBalance: prev.lineBalance }) : null), [prev, terms, curve]);
  const change = useMemo(() => concentrationChange(r, prevR), [r, prevR]);
  r.change = change;
  const lim = r.limits;
  const store = terms.reports ?? {};
  const issued = (store.riskIssued ?? []).filter((x) => x.asOf === asOf);
  const base = `${safeFileName(fundName)}-risk-report-${asOf}`;
  const setLimit = (k, v) => canEdit && onFundTermsChange(fundName, { riskLimits: { ...(terms.riskLimits ?? {}), [k]: v === "" ? DEFAULT_RISK_LIMITS[k] : Number(v) } });
  const setEnv = (dealId, name, k, v) => onApplyDeal?.(dealId, (inp) => ({ ...inp, envRisk: { ...(inp.envRisk ?? {}), [k]: v } }), [{ key: `envRisk.${k}`, field: `Environmental: ${ENV_FIELDS.find(([f]) => f === k)?.[1] ?? k}`, from: "", to: String(v) }], "Environmental and climate");

  async function pdf(rep, issuedAt) {
    setBusy(true);
    try {
      const { riskReportPdf } = await import("@/lib/riskReportPdf");
      downloadBlob(await riskReportPdf(fundName, rep, { issued: issuedAt }), `${base}${issuedAt ? `-v${issuedAt.v}` : ""}.pdf`);
    } finally { setBusy(false); }
  }
  const issue = () => {
    if (!window.confirm(`Issue the risk report as of ${usDate(asOf)}? Its figures are frozen with you and today's date.`)) return;
    const same = (store.riskIssued ?? []).filter((x) => x.asOf === asOf).length;
    onFundTermsChange(fundName, { reports: { ...store, riskIssued: [...(store.riskIssued ?? []), JSON.parse(JSON.stringify({ id: `risk-${asOf}-${same + 1}`, v: same + 1, asOf, by: email ?? "", at: new Date().toISOString(), report: r }))] } });
  };

  return (
    <div className="space-y-3" data-testid="risk-report">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        <span><span className="font-semibold">Internal — not for distribution.</span> Risk report as of {usDate(asOf)} (the quarter end). Never part of the shareable report.</span>
        <span className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => pdf(r, null)} className="rounded-lg border border-red-200 bg-white px-3 py-1 font-medium text-red-800">{busy ? "Making PDF…" : "PDF"}</button>
          <button type="button" onClick={() => downloadBlob(writeXlsx(riskXlsx(fundName, r), { sheetName: "Risk report", title: `Baywise · ${fundName} risk report (internal)` }), `${base}.xlsx`)} className="rounded-lg border border-red-200 bg-white px-3 py-1 font-medium text-red-800">Excel</button>
          {canEdit && <button type="button" onClick={issue} className="rounded-lg bg-red-700 px-3 py-1 font-medium text-white">Issue risk report</button>}
        </span>
      </div>

      {/* Summary at the top of every risk report (user, 11/24): watch list, change vs. last quarter, issued reports. */}
      <Group id="summary" title="Summary" desc="The watch list, what moved since last quarter, and the reports issued for this date; details by risk follow.">
      <div className="grid gap-2 sm:grid-cols-3" data-testid="risk-summary">
        <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs">
          <p className="text-[11px] text-gray-500">Watch list</p>
          <p className="text-sm font-semibold">{r.watch.length} asset{r.watch.length === 1 ? "" : "s"} flagged{r.fundFlags.length ? ` · ${r.fundFlags.length} fund-level flag${r.fundFlags.length === 1 ? "" : "s"}` : ""}</p>
          <p className="text-gray-600">{r.watch.slice(0, 3).map((w) => `${w.name} (${w.score})`).join(", ") || "Nothing flagged"}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
          <p className="text-[11px] text-gray-500">Change vs. last quarter</p>
          {!prevR ? <p className="text-gray-400">No prior quarter to compare with.</p> : (() => {
            const up = change.filter((c) => c.change != null && c.change > 1e-9 && !/HHI/.test(c.label)).sort((a, b) => b.change - a.change);
            return <><p className="text-sm font-semibold">{up.length} concentration{up.length === 1 ? "" : "s"} up</p><p className="text-gray-600">{up.slice(0, 3).map((c) => `${c.label} +${c.change.toFixed(1)} pts`).join(", ") || "None rose"}</p></>;
          })()}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
          <p className="text-[11px] text-gray-500">Issued reports ({usDate(asOf)})</p>
          <p className="text-sm font-semibold">{issued.length ? `${issued.length} issued · latest v${issued.at(-1).v}` : "Draft (not issued)"}</p>
          <p className="text-gray-600">{issued.length ? `${usDate(issued.at(-1).at.slice(0, 10))}${issued.at(-1).by ? ` by ${issued.at(-1).by}` : ""}` : "Issue it to freeze its figures."}</p>
        </div>
      </div>
      <Sec title="Watch list" testId="risk-watch">
        {r.watch.length === 0 ? <p className="text-xs text-gray-400">No asset flags.</p> : (
          <T head={["Asset", "Score", "Reasons"]} right={[1]} rows={r.watch.map((w) => [w.name, w.score, <ul key="r" className="list-disc pl-4">{w.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>])} />
        )}
        {r.fundFlags.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-red-800" data-testid="risk-fund-flags">{r.fundFlags.map((f, i) => <li key={i}>{f.section}: {f.text}</li>)}</ul>}
      </Sec>

      <Sec title={`Change vs. last quarter${prev ? ` (${usDate(prev.asOf)})` : ""}`} testId="risk-change">
        {!prevR ? <p className="text-xs text-gray-400">No prior quarter to compare with.</p> : (
          <T head={["Concentration", "Now", "Last quarter", "Change"]} right={[1, 2, 3]} rows={change.map((c) => {
            const hh = /HHI/.test(c.label);
            const f = (v) => (v == null ? "—" : hh ? Math.round(v).toLocaleString("en-US") : pct(v));
            return [`${c.label}${c.name ? ` · ${c.name}` : ""}`, f(c.now), `${f(c.prev)}${c.prevName && c.prevName !== c.name ? ` · ${c.prevName}` : ""}`, c.change == null ? "—" : <span className={Math.abs(c.change) < 1e-9 ? "text-gray-400" : c.change > 0 ? "text-red-700" : "text-emerald-700"}>{`${c.change > 0 ? "+" : ""}${hh ? Math.round(c.change) : `${c.change.toFixed(1)} pts`}`}</span>];
          })} />
        )}
      </Sec>

      <Sec title={`Issued risk reports · ${usDate(asOf)}`} testId="risk-issued">
        {issued.length === 0 ? <p className="text-xs text-gray-400">None issued for this date.</p> : (
          <ul className="space-y-1 text-xs">{issued.map((x) => (
            <li key={x.id} className="flex items-center justify-between rounded border border-gray-100 px-2 py-1"><span>v{x.v} · issued {usDate(x.at.slice(0, 10))}{x.by ? ` by ${x.by}` : ""} · {x.report.watch.length} assets on the watch list</span><button type="button" onClick={() => pdf(x.report, x)} className="rounded border border-gray-300 px-2 py-0.5">PDF</button></li>
          ))}</ul>
        )}
      </Sec>
      </Group>

      <Group id="tenant" title="Tenant and Leasing" desc="Lease expirations and rollover, and risks written into the leases.">
      <div className="grid gap-3 lg:grid-cols-2">
        <Sec title="Leasing: expirations by year (% of rent)" testId="risk-leasing">
          <T head={["", ...r.leasing.years.map(String), "12-mo rollover", "Vacant (SF)"]} right={[1, 2, 3, 4, 5, 6, 7, 8]}
            rows={[["Fund", ...r.leasing.fund.by.map((b) => pct(b.rentPct, 0)), pct(r.leasing.fund.rollover12RentPct, 0), pct(r.leasing.fund.vacancyPct, 0)],
              ...r.leasing.assets.map((a) => [a.name, ...a.by.map((b) => pct(b.rentPct, 0)), pct(a.rollover12RentPct, 0), pct(a.vacancyPct, 0)])]} />
        </Sec>
        <Sec title="Lease risk flags" testId="risk-lease-flags">
          {!r.leaseFlags ? <p className="text-xs text-gray-400">{workspaceId ? (docsErr || "Loading leases…") : "Sign in to see the lease risk flags."}</p> : r.leaseFlags.rows.length === 0 ? <p className="text-xs text-gray-400">No abstracted leases with risk flags.</p> : (
            <>
              <T head={["Type", "Flags", "High"]} right={[1, 2]} rows={r.leaseFlags.byType.map((x) => [x.type, x.n, x.high])} />
              <T head={["Asset", "Tenant", "Flag", "Severity"]} rows={r.leaseFlags.rows.filter((x) => x.severity === "high").slice(0, 15).map((x) => [x.asset, x.tenant, x.title, x.severity])} />
            </>
          )}
        </Sec>
      </div>
      </Group>

      <Group id="financial" title="Financial" desc="Debt and coverage, TI funding, stress tests and marks.">
      <Sec title="Debt" testId="risk-debt">
        <T head={["Asset", "Loan", "LTV", "Lender", "SOFR +", "Matures", "DSCR", "Test", "Cap strike", "Cap expires", "Provider", "Cap value"]} right={[1, 2, 4, 6, 7, 8, 11]}
          rows={r.debt.map((d) => [d.name, fmtM(d.loan), pct(d.ltv), d.lender || "—", pct(d.spreadPct, 2), usDate(d.maturity), d.dscr == null ? "—" : <span className={d.dscr < d.minDscr ? "font-semibold text-red-700" : ""}>{d.dscr.toFixed(2)}x</span>, `${d.minDscr.toFixed(2)}x`, d.capped ? pct(d.strike, 2) : "none", d.capped ? usDate(d.capEnd) : "—", d.provider || (d.capped ? <span className="text-amber-700">not entered</span> : "—"), fmtM(d.capValue)])} />
      </Sec>
      {r.ti && (
        <Sec title={`TI funding coverage, next 8 quarters${withActions ? " · with scenario actions" : ""}`} testId="risk-ti" right={<span className="flex items-center gap-3 text-[11px] text-gray-500"><span>Facility → asset cash flow → sub line (to {usDate(r.ti.lineExpires)}) → capital call</span><label className="flex items-center gap-1 text-gray-700"><input type="checkbox" aria-label="Show with scenario actions" checked={withActions} onChange={(e) => setWithActions(e.target.checked)} />With scenario actions ({actions.length})</label></span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500"><tr><th className={`${th} text-left`}>Asset</th>{r.ti.quarters.map((q) => <th key={q.quarter} className={`${th} text-center`}>{q.label}</th>)}</tr></thead>
              <tbody>
                {r.ti.assets.map((a) => (
                  <tr key={a.id} data-testid="ti-row">
                    <td className={`${td} whitespace-nowrap`}>{a.name}<span className="ml-1 text-[10px] text-gray-400">{a.facility ? `${fmtM(a.facility.total)} facility, ${a.facility.minDscr.toFixed(2)}x` : "no facility"}</span></td>
                    {a.cells.map((c) => (
                      <td key={c.quarter} className="p-0.5">
                        <div data-testid="ti-cell" data-color={c.color} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} onClick={() => canEdit && (c.need > 0 || c.postponedOut) && setSel({ dealId: a.id, name: a.name, quarter: c.quarter, label: c.label, need: c.need })} style={{ background: TI_COLORS[c.color].fill, outline: sel?.dealId === a.id && sel?.quarter === c.quarter ? "2px solid #111" : undefined }} className={`h-7 rounded text-center text-[10px] leading-7 text-white ${canEdit && c.need > 0 ? "cursor-pointer" : ""}`}
                          title={c.need > 0 ? `${c.label}: need ${fmtM(c.need)} · facility ${fmtM(c.fromFacility)}${c.testFailed ? ` (draw test fails: DSCR ${c.dscr?.toFixed(2)}x < ${a.facility.minDscr.toFixed(2)}x)` : a.facility && c.headroomPct != null ? ` (NOI could fall ${c.headroomPct.toFixed(0)}% before draws stop)` : ""} · cash flow ${fmtM(c.fromCash)} · sub line ${fmtM(c.fromLine)} · capital call ${fmtM(c.call)}` : `${c.label}: no TI due`}>
                          {c.need > 0 ? fmtM(c.need).replace("$", "") : ""}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-gray-200 font-semibold" data-testid="ti-call-row"><td className={td}>Capital call needed</td>{r.ti.fundCall.map((x, i) => <td key={i} className={`${td} text-center ${x > 1 ? "text-red-700" : "text-gray-400"}`}>{x > 1 ? fmtM(x) : "—"}</td>)}</tr>
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="mt-2 space-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2 text-xs" data-testid="ti-actions">
              {sel ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{sel.name} · {sel.label} · need {fmtM(sel.need)}:</span>
                  <select aria-label="TI action" value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value })} className="rounded border border-gray-300 px-1.5 py-0.5">
                    <option value="postpone">Postpone to</option>
                    <option value="cut">Cut by</option>
                    <option value="call">Plan a capital call of</option>
                  </select>
                  {act.kind === "postpone" && (
                    <select aria-label="Postpone to quarter" value={act.to} onChange={(e) => setAct({ ...act, to: e.target.value })} className="rounded border border-gray-300 px-1.5 py-0.5">
                      <option value="">quarter…</option>
                      {r.ti.quarters.filter((q) => q.quarter > sel.quarter).map((q) => <option key={q.quarter} value={q.quarter}>{q.label}</option>)}
                    </select>
                  )}
                  {act.kind === "cut" && <><input aria-label="Cut percent" type="number" value={act.pct} onChange={(e) => setAct({ ...act, pct: e.target.value })} className="w-16 rounded border border-gray-300 px-1 py-0.5 text-right" />%</>}
                  {act.kind === "call" && <>$<input aria-label="Planned call amount" type="number" value={act.amount} onChange={(e) => setAct({ ...act, amount: e.target.value })} className="w-28 rounded border border-gray-300 px-1 py-0.5 text-right" /></>}
                  <button type="button" disabled={act.kind === "postpone" && !act.to} onClick={() => { saveActions([...actions, { dealId: sel.dealId, asset: sel.name, quarter: sel.quarter, kind: act.kind, ...(act.kind === "postpone" ? { to: act.to } : act.kind === "cut" ? { pct: Number(act.pct) } : { amount: Number(act.amount) }) }]); setWithActions(true); }} className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white disabled:opacity-40">Add to scenario</button>
                </div>
              ) : <p className="text-gray-500">Click a cell to postpone its TI, cut it, or plan a capital call. Modeling only: nothing changes on the asset; carry chosen actions into the business plan yourself (a new revision).</p>}
              {actions.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" data-testid="ti-action-list">
                  {actions.map((x, i) => (
                    <li key={i} className="rounded bg-white px-1.5 py-0.5 ring-1 ring-blue-200">
                      {x.asset} {x.quarter.slice(0, 4)} Q{Math.floor((Number(x.quarter.slice(5, 7)) - 1) / 3) + 1}: {x.kind === "postpone" ? `postpone to ${x.to.slice(0, 4)} Q${Math.floor((Number(x.to.slice(5, 7)) - 1) / 3) + 1}` : x.kind === "cut" ? `cut ${x.pct}%` : `plan a ${fmtM(x.amount)} call`}
                      <button type="button" aria-label="Remove action" onClick={() => saveActions(actions.filter((_, k) => k !== i))} className="ml-1 text-gray-400 hover:text-red-600">×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-600">{Object.entries(TI_COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: c.fill }} />{c.label}</span>)}</div>
        </Sec>
      )}
      <Sec title="Stress tests (levered IRR; red = DSCR below its test in some year)" testId="risk-stress">
        <T head={["", "Base", ...r.stress.shocks.map((x) => x.label)]} right={[1, 2, 3, 4, 5, 6]}
          rows={[["Fund (equity-weighted)", pct(r.stress.fund.baseIrr), ...r.stress.fund.byShock.map((x) => `${pct(x.irr)}${x.breaches ? ` · ${x.breaches} breach${x.breaches > 1 ? "es" : ""}` : ""}`)],
            ...r.stress.assets.map((a) => [a.name, pct(a.baseIrr), ...a.results.map((x) => <span key={x.key} className={x.breach ? "font-semibold text-red-700" : ""} title={x.minDscr != null ? `Lowest DSCR ${x.minDscr.toFixed(2)}x (test ${a.test.toFixed(2)}x)` : undefined}>{pct(x.irr)}</span>)])]} />
      </Sec>
        <Sec title="Valuation: marks vs. cost" testId="risk-valuation">
          <T head={["Asset", "Cost", "Value", "vs. cost", "Implied cap", "Exit cap"]} right={[1, 2, 3, 4, 5]} rows={r.valuation.map((v) => [v.name, fmtM(v.cost), fmtM(v.value), v.unrealizedPct == null ? "—" : <span className={v.unrealizedPct < 0 ? "text-red-700" : ""}>{pct(v.unrealizedPct)}</span>, pct(v.impliedCap, 2), pct(v.exitCap, 2)])} />
        </Sec>
      </Group>

      <Group id="concentration" title="Concentration" desc="Fund limits, and exposure to single tenants, industries, places, lenders and cap counterparties.">
      {r.fundLimits.length > 0 && (
        <Sec title="Fund limits (LPA / PPM and internal)" testId="risk-fund-limits">
          <T head={["Limit", "Source", "Limit", "Actual", "Largest", "Status"]} right={[2, 3]} rows={r.fundLimits.map((l) => [l.label, l.source, l.unit === "text" ? l.limit : `${l.limit}${l.unit === "%" ? "%" : ` ${l.unit}`}`, l.actual == null ? "—" : `${l.actual.toFixed(1)}${l.unit === "%" ? "%" : ` ${l.unit}`}`, l.what || "—", <span key="s" className={l.status === "breached" ? "font-semibold text-red-700" : l.status === "near" ? "text-amber-700" : ""}>{l.status}</span>])} />
        </Sec>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <Sec title={`Largest tenants (limit ${lim.tenantFundPct}% of fund rent)`} testId="risk-tenants">
          <T head={["Tenant", "Rent", "% fund", "Asset", "Expires"]} right={[1, 2]} rows={r.tenants.map((x) => [x.tenant, fmtM(x.rent), over(x.pct, lim.tenantFundPct), x.assets.join(", "), usDate(x.leaseEnd)])} />
        </Sec>
        <Sec title={`Industry (SIC 2-digit) · limits ${lim.industryAssetPct}% of an asset, ${lim.industryFundPct}% of the fund`} testId="risk-industry">
          <T head={["Fund industry", "% of rent"]} right={[1]} rows={r.industry.fund.slice(0, 8).map((g) => [g.title, over(g.rentPct, lim.industryFundPct)])} />
          <T head={["Asset", "Largest industry", "% of asset rent"]} right={[2]} rows={r.industry.assets.map((a) => [a.name, a.groups[0]?.title ?? "—", a.groups[0] ? over(a.groups[0].rentPct, lim.industryAssetPct) : "—"])} />
          {r.industry.unclassifiedPct > 0 && <p className="mt-1 text-[11px] text-gray-500">{pct(r.industry.unclassifiedPct)} of rent has no SIC code (Rent Roll).</p>}
        </Sec>
      </div>
        <Sec title="Geography (share of value)" testId="risk-geo">
          <StateTileMap states={r.geography.states} limitPct={lim.statePct} />
          <T head={["State", "% value", "% NOI", "Assets"]} right={[1, 2, 3]} rows={r.geography.states.map((s) => [s.name, over(s.valuePct, lim.statePct), pct(s.noiPct), s.assets])} />
          <T head={["Metro (city)", "% value", "% NOI", "Assets"]} right={[1, 2, 3]} rows={r.geography.metros.map((s) => [s.name, over(s.valuePct, lim.metroPct), pct(s.noiPct), s.assets])} />
        </Sec>
      <div className="grid gap-3 lg:grid-cols-2">
        <Sec title={`Debt by lender · HHI ${r.lenders.hhi.toLocaleString("en-US")} · limit ${lim.lenderPct}%`} testId="risk-lenders">
          <T head={["Lender", "Balance", "% of debt", "Loans", "Spread", "Maturities"]} right={[1, 2, 3, 4]} rows={r.lenders.rows.map((l) => [l.lender, fmtM(l.balance), over(l.pct, lim.lenderPct), l.loans, pct(l.spreadPct, 2), l.maturities.map(usDate).join(", ")])} />
        </Sec>
        <Sec title={`Rate cap counterparties · HHI ${r.caps.hhi.toLocaleString("en-US")} · limit ${lim.capProviderPct}%`} testId="risk-caps">
          <T head={["Counterparty", "Notional", "% capped", "Exposure (cap value)", "Caps", "Expiries"]} right={[1, 2, 3, 4]} rows={r.caps.byProvider.map((p) => [p.provider, fmtM(p.notional), over(p.pct, lim.capProviderPct), fmtM(p.value), p.caps, p.expiries.map(usDate).join(", ")])} />
          {r.caps.missing.length > 0 && <p className="mt-1 text-[11px] text-amber-800">No provider entered (Debt tab → Rate cap): {r.caps.missing.join(", ")}.</p>}
        </Sec>
      </div>
      <Sec title="Concentration limits used here" testId="risk-limits">
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(DEFAULT_RISK_LIMITS).map(([k]) => (
            <label key={k} className="flex items-center gap-1">
              <span className="text-gray-600">{{ industryAssetPct: "Industry, % of asset rent", industryFundPct: "Industry, % of fund rent", lenderPct: "Lender, % of debt", capProviderPct: "Cap counterparty, % of capped", statePct: "State, % of value", metroPct: "Metro, % of value", tenantFundPct: "Tenant, % of fund rent" }[k]}</span>
              <input aria-label={`Risk limit ${k}`} type="number" disabled={!canEdit} value={lim[k]} onChange={(e) => setLimit(k, e.target.value)} className="w-16 rounded border border-gray-300 px-1 py-0.5 text-right" />%
            </label>
          ))}
        </div>
      </Sec>
      </Group>

      <Group id="operational" title="Operational" desc="Executing the plan, insurance, and environmental and climate.">
      <div className="grid gap-3 lg:grid-cols-2">
        <Sec title="Execution" testId="risk-execution">
          <T head={["Asset", "IRR underwritten", "IRR now", "Gap"]} right={[1, 2, 3]} rows={r.execution.uw.map((x) => [x.name, pct(x.uwIrr), pct(x.irr), isFinite(x.gap) ? `${x.gap >= 0 ? "+" : ""}${x.gap.toFixed(1)} pts` : "—"])} />
          {r.execution.budget.map((b) => <p key={b.id} className="mt-1 text-[11px] text-gray-600">{b.name}: over budget on {b.lines.join(", ")}</p>)}
          {r.execution.planGap && <p className="mt-1 text-[11px] text-gray-600">Fund plan: projected net LP IRR {pct(r.execution.planGap.current)} vs. plan {pct(r.execution.planGap.plan)}.</p>}
          {!r.execution.uw.length && !r.execution.budget.length && <p className="text-xs text-gray-400">No baselines or budget actuals yet.</p>}
        </Sec>
        <Sec title="Insurance certificates" testId="risk-insurance">
          {!r.insurance ? <p className="text-xs text-gray-400">{workspaceId ? (docsErr || "Loading documents…") : "Sign in to check the insurance certificates on file."}</p> : (
            <T head={["Asset", "Certificates", "Gaps"]} right={[1]} rows={r.insurance.map((x) => [x.name, x.certificates, x.gaps.length ? <ul key="g" className="list-disc pl-4">{x.gaps.map((g, i) => <li key={i} className={g.severity === "high" ? "text-red-700" : g.severity === "medium" ? "text-amber-800" : ""}>{g.text}</li>)}</ul> : "—"])} />
          )}
          <p className="mt-1 text-[11px] text-gray-400">Expired or expiring (60 days) policies, missing tenant certificates, and tenant coverage below the lease&apos;s requirements (Documents tab). Coverage against loan requirements comes once loan agreements carry them.</p>
        </Sec>
      </div>
      <Sec title="Environmental and climate" testId="risk-env" right={<span className="text-[11px] text-gray-500">Entered per asset; upload Phase I / II reports on the Documents tab.</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500"><tr><th className={`${th} text-left`}>Asset</th>{ENV_FIELDS.map(([k, l]) => <th key={k} className={`${th} text-left`}>{l}</th>)}<th className={`${th} text-left`}>Open items</th></tr></thead>
            <tbody>
              {r.environmental.map((e) => (
                <tr key={e.id} className="border-t border-gray-100" data-testid="env-row">
                  <td className={td}>{e.name}</td>
                  {ENV_FIELDS.map(([k, l, kind]) => (
                    <td key={k} className={td}>
                      {kind === "bool" ? (
                        <input type="checkbox" aria-label={`${l} ${e.name}`} disabled={!canEdit} checked={!!e[k]} onChange={(ev) => setEnv(e.id, e.name, k, ev.target.checked)} />
                      ) : kind === "level" ? (
                        <select aria-label={`${l} ${e.name}`} disabled={!canEdit} value={e[k] ?? ""} onChange={(ev) => setEnv(e.id, e.name, k, ev.target.value)} className="rounded border border-gray-300 px-1 py-0.5">{LEVELS.map((v) => <option key={v} value={v}>{v || "—"}</option>)}</select>
                      ) : (
                        <input aria-label={`${l} ${e.name}`} type={kind === "date" ? "date" : "text"} disabled={!canEdit} defaultValue={e[k] ?? ""} onBlur={(ev) => ev.target.value !== (e[k] ?? "") && setEnv(e.id, e.name, k, ev.target.value)} className="w-28 rounded border border-gray-300 px-1 py-0.5" />
                      )}
                    </td>
                  ))}
                  <td className={`${td} text-amber-800`}>{e.open.join("; ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>
      </Group>

    </div>
  );
}
