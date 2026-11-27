"use client";

// Phase L: the internal risk report (Reports tab, owners and editors only).
import { useEffect, useMemo, useState } from "react";
import { listDealDocs } from "@/lib/dealDocs";
import { listLeases } from "@/lib/leaseDocs";
import { listCreditDocs } from "@/lib/creditDocs";
import { DEFAULT_RISK_LIMITS, DEFAULT_RISK_THRESHOLDS, RISK_THRESHOLD_LABELS, concentrationChange, riskReport, riskXlsx } from "@/lib/riskReport";
import { DEFAULT_CREDIT_THRESHOLDS, SCORE_TYPES, STATUS_LABEL } from "@/lib/creditReview";
import { BUCKETS } from "@/lib/delinquency";
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
const LEVEL_CLS = { red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-800" };
const Level = ({ l }) => <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_CLS[l] ?? "bg-gray-100 text-gray-700"}`}>{l === "red" ? "Red" : l === "amber" ? "Amber" : l}</span>;
const Count = ({ rows }) => {
  const red = rows.filter((x) => x.level === "red").length, amb = rows.filter((x) => x.level === "amber").length;
  return <span className="ml-2 inline-flex gap-1 align-middle">{red > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{red}</span>}{amb > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{amb}</span>}</span>;
};
// The exception list for a risk group: only what needs attention, worst first (1.1.8).
function RiskRows({ rows, owner = true, empty }) {
  if (!rows.length) return <p className="text-xs text-emerald-700">{empty}</p>;
  return <T head={["Asset", "Risk", "Measure", "Threshold", "Key date", ...(owner ? ["Owner"] : []), "Level"]} rows={rows.map((x) => [x.asset, x.risk, x.measure, x.threshold, x.keyDate ? (/^\d{4}$/.test(x.keyDate) ? x.keyDate : usDate(x.keyDate)) : "—", ...(owner ? [x.owner || "—"] : []), <Level key="l" l={x.level} />])} />;
}
// Reference tables, collapsed under the exceptions (1.1.8).
const Ref = ({ title, testId, children }) => (
  <details className="rounded-xl border border-gray-200 bg-gray-50/40 p-2" data-testid={testId}>
    <summary className="cursor-pointer text-xs font-medium text-gray-600">{title} (reference)</summary>
    <div className="mt-2 space-y-3">{children}</div>
  </details>
);
const STATUS_CLS = { weak: "bg-red-100 text-red-800", watch: "bg-amber-100 text-amber-800", missing: "bg-gray-100 text-gray-700", ok: "bg-emerald-50 text-emerald-800" };

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
    Promise.all([listLeases(workspaceId).catch(() => []), listDealDocs(workspaceId).catch(() => []), listCreditDocs(workspaceId).catch(() => [])])
      .then(([leases, dealDocs, creditDocs]) => live && setDocs({ leases, dealDocs, creditDocs }))
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
  const setThreshold = (k, v) => canEdit && onFundTermsChange(fundName, { riskThresholds: { ...(terms.riskThresholds ?? {}), [k]: v === "" ? DEFAULT_RISK_THRESHOLDS[k] : Number(v) } });
  const setCreditThreshold = (k, v) => canEdit && onFundTermsChange(fundName, { creditThresholds: { ...(terms.creditThresholds ?? {}), [k]: v === "" ? DEFAULT_CREDIT_THRESHOLDS[k] : Number(v) } });
  const kri = Object.fromEntries((change ?? []).map((c) => [c.key, c.change]));

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
        <span><span className="font-semibold">Internal — not for distribution.</span> Risk report as of {usDate(asOf)} (the quarter end).</span>
        <span className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => pdf(r, null)} className="rounded-lg border border-red-200 bg-white px-3 py-1 font-medium text-red-800">{busy ? "Making PDF…" : "PDF"}</button>
          <button type="button" onClick={() => downloadBlob(writeXlsx(riskXlsx(fundName, r), { sheetName: "Risk report", title: `Baywise · ${fundName} risk report (internal)` }), `${base}.xlsx`)} className="rounded-lg border border-red-200 bg-white px-3 py-1 font-medium text-red-800">Excel</button>
          {canEdit && <button type="button" onClick={issue} className="rounded-lg bg-red-700 px-3 py-1 font-medium text-white">Issue risk report</button>}
        </span>
      </div>

      {/* Summary at the top of every risk report (user, 11/24): watch list, KRI Trending (1.1.5). */}
      <Group id="summary" title="Summary" desc="The watch list and the KRIs that moved since last quarter; details by risk follow, and the reports issued for this date are at the bottom.">
      <div className="grid gap-2 sm:grid-cols-4" data-testid="risk-summary">
        <div className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs">
          <p className="text-[11px] text-gray-500">Watch list</p>
          <p className="text-sm font-semibold">{r.watch.length} asset{r.watch.length === 1 ? "" : "s"} flagged{r.fundFlags.length ? ` · ${r.fundFlags.length} fund-level flag${r.fundFlags.length === 1 ? "" : "s"}` : ""}</p>
          <p className="text-gray-600">{r.watch.slice(0, 3).map((w) => `${w.name} (${w.score})`).join(", ") || "Nothing flagged"}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
          <p className="text-[11px] text-gray-500">KRI Trending</p>
          {!prevR ? <p className="text-gray-500">No prior quarter to compare with.</p> : (() => {
            const up = change.filter((c) => c.change != null && c.change > 1e-9 && !/HHI/.test(c.label)).sort((a, b) => b.change - a.change);
            return <><p className="text-sm font-semibold">{up.length} KRI{up.length === 1 ? "" : "s"} up vs. last quarter</p><p className="text-gray-600">{up.slice(0, 3).map((c) => `${c.label} +${c.change.toFixed(1)} pts`).join(", ") || "None rose"}</p></>;
          })()}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs" data-testid="risk-summary-aged">
          <p className="text-[11px] text-gray-500">Rent 60+ days past due</p>
          {!r.aged ? <p className="text-gray-500">No aged receivables uploaded.</p> : <><p className={`text-sm font-semibold ${r.aged.late60.amount > 0 ? "text-red-700" : ""}`}>{fmtM(r.aged.late60.amount)} ({r.aged.late60.tenants} tenant{r.aged.late60.tenants === 1 ? "" : "s"})</p><p className="text-gray-600">As of {usDate(r.aged.asOf)} · all past due {fmtM(r.aged.fund.pastDue)}</p></>}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
          <p className="text-[11px] text-gray-500">Issued reports ({usDate(asOf)})</p>
          <p className="text-sm font-semibold">{issued.length ? `${issued.length} issued · latest v${issued.at(-1).v}` : "Draft (not issued)"}</p>
          <p className="text-gray-600">{issued.length ? `${usDate(issued.at(-1).at.slice(0, 10))}${issued.at(-1).by ? ` by ${issued.at(-1).by}` : ""}` : "Issue it to freeze its figures."}</p>
        </div>
      </div>
      <Sec title="Watch list" testId="risk-watch">
        {r.watch.length === 0 ? <p className="text-xs text-gray-500">No asset flags.</p> : (
          <T head={["Asset", "Score", "Reasons"]} right={[1]} rows={r.watch.map((w) => [w.name, w.score, <ul key="r" className="list-disc pl-4">{w.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>])} />
        )}
        {r.fundFlags.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-red-800" data-testid="risk-fund-flags">{r.fundFlags.map((f, i) => <li key={i}>{f.section}: {f.text}</li>)}</ul>}
      </Sec>

      <Sec title={`KRI Trending${prev ? ` (vs. ${usDate(prev.asOf)})` : ""}`} testId="risk-change">
        {!prevR ? <p className="text-xs text-gray-500">No prior quarter to compare with.</p> : (
          <T head={["KRI", "Now", "Last quarter", "Change"]} right={[1, 2, 3]} rows={change.map((c) => {
            const hh = /HHI/.test(c.label);
            const f = (v) => (v == null ? "—" : hh ? Math.round(v).toLocaleString("en-US") : pct(v));
            return [`${c.label}${c.name ? ` · ${c.name}` : ""}`, f(c.now), `${f(c.prev)}${c.prevName && c.prevName !== c.name ? ` · ${c.prevName}` : ""}`, c.change == null ? "—" : <span className={Math.abs(c.change) < 1e-9 ? "text-gray-500" : c.change > 0 ? "text-red-700" : "text-emerald-700"}>{`${c.change > 0 ? "+" : ""}${hh ? Math.round(c.change) : `${c.change.toFixed(1)} pts`}`}</span>];
          })} />
        )}
      </Sec>

      </Group>

      <Group id="tenant" title="Tenant and Leasing" desc="Only what needs attention, worst first; the full tables are collapsed underneath.">
      <Sec title={<>Leasing Risks<Count rows={r.leasingRisks} /></>} testId="risk-leasing-risks" right={<span className="text-[11px] text-gray-500">Thresholds: {fundName}&apos;s (Risk thresholds, below)</span>}>
        <RiskRows rows={r.leasingRisks} empty="No leasing risks over their thresholds." />
      </Sec>
      <Sec title={<>Tenant Credit{r.credit.length > 0 && <span className="ml-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{r.credit.length}</span>}</>} testId="risk-credit" right={<span className="text-[11px] text-gray-500">Flagged tenants only; every tenant on Asset Management → Tenant Credit</span>}>
        {r.credit.length === 0 ? <p className="text-xs text-emerald-700">No tenant flagged for weak credit.</p> : (
          <T head={["Tenant", "Asset", "Annual rent", "% fund rent", "Lease ends", "Status", "Why flagged", "Latest record"]} right={[2, 3]} rows={r.credit.map((c) => [c.tenant, c.asset, fmtM(c.rent), pct(c.pctFundRent), usDate(c.leaseEnd), <span key="s" className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLS[c.status]}`}>{STATUS_LABEL[c.status]}</span>, <ul key="w" className="list-disc pl-4">{c.reasons.map((x, i) => <li key={i} className={x.level === "weak" ? "text-red-800" : "text-amber-800"}>{x.text}</li>)}</ul>, c.latest ? `${c.latest.sourceLabel}${c.latest.date ? ` · ${usDate(c.latest.date)}` : ""}` : "None on file"])} />
        )}
      </Sec>
      <Sec title="Aged Rent" testId="risk-aged" right={r.aged ? <span className="text-[11px] text-gray-500">Yardi aged receivables as of {usDate(r.aged.asOf)}{r.aged.prevAsOf ? `; change vs. ${usDate(r.aged.prevAsOf)}` : ""}</span> : null}>
        {!r.aged ? <p className="text-xs text-gray-500">No aged receivables uploaded for {fundName}: upload the Yardi aged receivables report on Asset Management → Rent Roll.</p> : r.aged.tenants.length === 0 ? <p className="text-xs text-emerald-700">No rent past due.</p> : (
          <T head={["Tenant", "Asset", ...BUCKETS.slice(1).map(([, l]) => l), "Past due", "Deposit", "Net exposure", "Change"]} right={[2, 3, 4, 5, 6, 7, 8, 9, 10]}
            rows={[...r.aged.tenants.map((t) => [t.tenant, t.asset, ...["d30", "d60", "d90", "d180", "over180"].map((k) => <span key={k} className={["d90", "d180", "over180"].includes(k) && t.buckets[k] > 0 ? "font-semibold text-red-700" : ""}>{t.buckets[k] ? fmtM(t.buckets[k]) : "—"}</span>), fmtM(t.pastDue), fmtM(t.deposit), <span key="n" className={t.net > 0 ? "text-red-700" : "text-emerald-700"}>{fmtM(t.net)}</span>, t.change == null ? "—" : `${t.change > 0 ? "+" : ""}${fmtM(t.change)}`]),
              [<b key="f">{fundName}</b>, "", ...["d30", "d60", "d90", "d180", "over180"].map((k) => <b key={k}>{r.aged.fund.buckets[k] ? fmtM(r.aged.fund.buckets[k]) : "—"}</b>), <b key="p">{fmtM(r.aged.fund.pastDue)}</b>, <b key="d">{fmtM(r.aged.fund.deposit)}</b>, <b key="n">{fmtM(r.aged.fund.net)}</b>, r.aged.fund.change == null ? "—" : `${r.aged.fund.change > 0 ? "+" : ""}${fmtM(r.aged.fund.change)}`]]} />
        )}
        <p className="mt-1 text-[11px] text-gray-500">Red: 61+ days late (61–90, 91–180, over 180). Net exposure = past due less the tenant&apos;s security deposit. A tenant 60+ days late is also flagged in Tenant Credit.</p>
      </Sec>
      <Ref title="Lease expirations by year (% of rent)" testId="risk-leasing-ref">
        <Sec title="Leasing: expirations by year (% of rent)" testId="risk-leasing">
          <T head={["", ...r.leasing.years.map(String), "12-mo rollover", "Vacant (SF)"]} right={[1, 2, 3, 4, 5, 6, 7, 8]}
            rows={[["Fund", ...r.leasing.fund.by.map((b) => pct(b.rentPct, 0)), pct(r.leasing.fund.rollover12RentPct, 0), pct(r.leasing.fund.vacancyPct, 0)],
              ...r.leasing.assets.map((a) => [a.name, ...a.by.map((b) => pct(b.rentPct, 0)), pct(a.rollover12RentPct, 0), pct(a.vacancyPct, 0)])]} />
        </Sec>
      </Ref>
        <Sec title="Lease risk flags" testId="risk-lease-flags">
          {!r.leaseFlags ? <p className="text-xs text-gray-500">{workspaceId ? (docsErr || "Loading leases…") : "Sign in to see the lease risk flags."}</p> : r.leaseFlags.rows.length === 0 ? <p className="text-xs text-gray-500">No abstracted leases with risk flags.</p> : (
            <>
              <T head={["Type", "Flags", "High"]} right={[1, 2]} rows={r.leaseFlags.byType.map((x) => [x.type, x.n, x.high])} />
              <T head={["Asset", "Tenant", "Flag", "Severity"]} rows={r.leaseFlags.rows.filter((x) => x.severity === "high").slice(0, 15).map((x) => [x.asset, x.tenant, x.title, x.severity])} />
            </>
          )}
        </Sec>
      </Group>

      <Group id="financial" title="Financial" desc="Debt, TI funding, stress tests and marks: exceptions first, full tables collapsed.">
      <Sec title={<>Debt Risks<Count rows={r.debtRisks} /></>} testId="risk-debt-risks">
        <RiskRows rows={r.debtRisks} empty="No debt risks over their thresholds." />
        <p className="mt-1 text-[11px] text-gray-500">Checked: maturity, DSCR vs. its test (and within {r.thresholds.dscrCushion.toFixed(2)}x), floating with no cap, cap expiry, LTV vs. {r.thresholds.ltvMaxPct}%, debt yield vs. {r.thresholds.debtYieldMinPct}%, DSCR at the cap strike, refinance gap at maturity (sized at today&apos;s tests).</p>
      </Sec>
      <Ref title="Loan schedule" testId="risk-debt-ref">
      <Sec title="Debt" testId="risk-debt">
        <T head={["Asset", "Loan", "LTV", "Lender", "SOFR +", "Matures", "DSCR", "Test", "Cap strike", "Cap expires", "Provider", "Cap value"]} right={[1, 2, 4, 6, 7, 8, 11]}
          rows={r.debt.map((d) => [d.name, fmtM(d.loan), pct(d.ltv), d.lender || "—", pct(d.spreadPct, 2), usDate(d.maturity), d.dscr == null ? "—" : <span className={d.dscr < d.minDscr ? "font-semibold text-red-700" : ""}>{d.dscr.toFixed(2)}x</span>, `${d.minDscr.toFixed(2)}x`, d.capped ? pct(d.strike, 2) : d.rateType === "Fixed" ? "fixed rate" : d.rateType === "Swapped" ? "swapped" : "none", d.capped ? usDate(d.capEnd) : "—", d.provider || (d.capped ? <span className="text-amber-700">not entered</span> : "—"), fmtM(d.capValue)])} />
      </Sec>
      </Ref>
      {r.ti && (
        <Sec title={`TI funding coverage, next 8 quarters${withActions ? " · with scenario actions" : ""}`} testId="risk-ti" right={<span className="flex items-center gap-3 text-[11px] text-gray-500"><span>Facility → asset cash flow → sub line (to {usDate(r.ti.lineExpires)}) → capital call</span><label className="flex items-center gap-1 text-gray-700"><input type="checkbox" aria-label="Show with scenario actions" checked={withActions} onChange={(e) => setWithActions(e.target.checked)} />With scenario actions ({actions.length})</label></span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500"><tr><th className={`${th} text-left`}>Asset</th>{r.ti.quarters.map((q) => <th key={q.quarter} className={`${th} text-center`}>{q.label}</th>)}</tr></thead>
              <tbody>
                {r.ti.assets.map((a) => (
                  <tr key={a.id} data-testid="ti-row">
                    <td className={`${td} whitespace-nowrap`}>{a.name}<span className="ml-1 text-[10px] text-gray-500">{a.facility ? `${fmtM(a.facility.total)} facility, ${a.facility.minDscr.toFixed(2)}x` : "no facility"}</span></td>
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
                <tr className="border-t border-gray-200 font-semibold" data-testid="ti-call-row"><td className={td}>Capital call needed</td>{r.ti.fundCall.map((x, i) => <td key={i} className={`${td} text-center ${x > 1 ? "text-red-700" : "text-gray-500"}`}>{x > 1 ? fmtM(x) : "—"}</td>)}</tr>
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
                      <button type="button" aria-label="Remove action" onClick={() => saveActions(actions.filter((_, k) => k !== i))} className="ml-1 text-gray-500 hover:text-red-600">×</button>
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
      <Sec title={<>Valuation Risks<Count rows={r.valuationRisks} /></>} testId="risk-valuation-risks">
        <RiskRows rows={r.valuationRisks} empty={`No asset marked more than ${r.thresholds.markBelowCostPct}% below cost.`} />
      </Sec>
      <Ref title="Marks vs. cost, every asset" testId="risk-valuation-ref">
        <Sec title="Valuation: marks vs. cost" testId="risk-valuation">
          <T head={["Asset", "Cost", "Value", "vs. cost", "Implied cap", "Exit cap"]} right={[1, 2, 3, 4, 5]} rows={r.valuation.map((v) => [v.name, fmtM(v.cost), fmtM(v.value), v.unrealizedPct == null ? "—" : <span className={v.unrealizedPct < 0 ? "text-red-700" : ""}>{pct(v.unrealizedPct)}</span>, pct(v.impliedCap, 2), pct(v.exitCap, 2)])} />
        </Sec>
      </Ref>
      </Group>

      <Group id="concentration" title="Concentration" desc="Every limit (LPA / PPM and internal), worst first; the exposure tables are collapsed underneath.">
      <Sec title={<>Limit Checks{r.limitChecks.filter((x) => x.status !== "ok").length > 0 && <span className="ml-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{r.limitChecks.filter((x) => x.status !== "ok").length}</span>}</>} testId="risk-limit-checks">
        <T head={["Limit", "Source", "Largest exposure", "Now", "Limit", "KRI vs. last qtr", "Status"]} right={[3, 4, 5]} rows={r.limitChecks.map((l) => {
          const u = l.unit === "%" ? "%" : ` ${l.unit ?? ""}`;
          const k = kri[l.key];
          return [l.label, l.source, l.largest || "—", l.now == null ? "—" : `${l.now.toFixed(1)}${u}`, `${l.limit}${u}`, k == null ? "—" : `${k > 0 ? "+" : ""}${k.toFixed(1)} pts`, <span key="s" className={l.status === "breached" ? "font-semibold text-red-700" : l.status === "near" ? "font-semibold text-amber-700" : "text-emerald-700"}>{l.status === "breached" ? "Breached" : l.status === "near" ? "Near limit" : "OK"}</span>];
        })} />
        <p className="mt-1 text-[11px] text-gray-500">&quot;Near limit&quot; = at {r.thresholds.nearLimitPct}% of a limit or more.</p>
      </Sec>
      <Ref title="Fund limits, tenants, industry, geography, lenders and cap counterparties" testId="risk-concentration-ref">
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
      </Ref>
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
      <Sec title="Risk thresholds used here" testId="risk-thresholds">
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.keys(DEFAULT_RISK_THRESHOLDS).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <span className="text-gray-600">{RISK_THRESHOLD_LABELS[k]}</span>
              <input aria-label={`Risk threshold ${k}`} type="number" step="any" disabled={!canEdit} value={r.thresholds[k]} onChange={(e) => setThreshold(k, e.target.value)} className="w-16 rounded border border-gray-300 px-1 py-0.5 text-right" />
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs" data-testid="credit-thresholds">
          <span className="font-medium text-gray-700">Weak credit below:</span>
          {SCORE_TYPES.map(([k, l]) => (
            <label key={k} className="flex items-center gap-1">
              <span className="text-gray-600">{l}</span>
              <input aria-label={`Credit threshold ${k}`} type="number" disabled={!canEdit} value={{ ...DEFAULT_CREDIT_THRESHOLDS, ...(terms.creditThresholds ?? {}) }[k]} onChange={(e) => setCreditThreshold(k, e.target.value)} className="w-16 rounded border border-gray-300 px-1 py-0.5 text-right" />
            </label>
          ))}
          <span className="text-gray-500">Our own assessment: &quot;Weak&quot;.</span>
        </div>
      </Sec>
      </Group>

      <Group id="operational" title="Operational" desc="Executing the plan and insurance.">
      <div className="grid gap-3 lg:grid-cols-2">
        <Sec title="Execution" testId="risk-execution">
          <T head={["Asset", "IRR underwritten", "IRR now", "Gap"]} right={[1, 2, 3]} rows={r.execution.uw.map((x) => [x.name, pct(x.uwIrr), pct(x.irr), isFinite(x.gap) ? `${x.gap >= 0 ? "+" : ""}${x.gap.toFixed(1)} pts` : "—"])} />
          {r.execution.budget.map((b) => <p key={b.id} className="mt-1 text-[11px] text-gray-600">{b.name}: over budget on {b.lines.join(", ")}</p>)}
          {r.execution.planGap && <p className="mt-1 text-[11px] text-gray-600">Fund plan: projected net LP IRR {pct(r.execution.planGap.current)} vs. plan {pct(r.execution.planGap.plan)}.</p>}
          {!r.execution.uw.length && !r.execution.budget.length && <p className="text-xs text-gray-500">No baselines or budget actuals yet.</p>}
        </Sec>
        <Sec title="Insurance certificates" testId="risk-insurance">
          {!r.insurance ? <p className="text-xs text-gray-500">{workspaceId ? (docsErr || "Loading documents…") : "Sign in to check the insurance certificates on file."}</p> : (
            <T head={["Asset", "Certificates", "Gaps"]} right={[1]} rows={r.insurance.map((x) => [x.name, x.certificates, x.gaps.length ? <ul key="g" className="list-disc pl-4">{x.gaps.map((g, i) => <li key={i} className={g.severity === "high" ? "text-red-700" : g.severity === "medium" ? "text-amber-800" : ""}>{g.text}</li>)}</ul> : "—"])} />
          )}
          <p className="mt-1 text-[11px] text-gray-500">Expired or expiring (60 days) policies, missing tenant certificates, and tenant coverage below the lease&apos;s requirements (Documents tab). Coverage against loan requirements comes once loan agreements carry them.</p>
        </Sec>
      </div>
      {/* Environmental and climate removed from the risk report (user, 11/25, 1.1.5: not critical); the entries stay on each asset. */}
      </Group>

      {/* Issued risk reports (user, 11/25, 1.1.5): at the bottom of the report. */}
      <Sec title={`Issued risk reports · ${usDate(asOf)}`} testId="risk-issued">
        {issued.length === 0 ? <p className="text-xs text-gray-500">None issued for this date.</p> : (
          <ul className="space-y-1 text-xs">{issued.map((x) => (
            <li key={x.id} className="flex items-center justify-between rounded border border-gray-100 px-2 py-1"><span>v{x.v} · issued {usDate(x.at.slice(0, 10))}{x.by ? ` by ${x.by}` : ""} · {x.report.watch.length} assets on the watch list</span><button type="button" onClick={() => pdf(x.report, x)} className="rounded border border-gray-300 px-2 py-0.5">PDF</button></li>
          ))}</ul>
        )}
      </Sec>
    </div>
  );
}
