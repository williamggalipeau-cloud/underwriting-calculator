"use client";

// Phase X: Distribution Analysis tab (Portfolio Management, after Fund
// Return). Each quarter's distributable cash (asset cash from Yardi or entered,
// else the model's projected cash), reserves, the LP / GP split per the LPA,
// yields, the last 4 quarters, proposals and recording a paid distribution.
import { useMemo, useRef, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { fundOptionLabel } from "@/lib/fundTypes";
import { fundValuation, lastCompletedQuarterEnd, quarterLabel } from "@/lib/valuations";
import { newActivityId } from "@/lib/capitalActivity";
import { writeXlsx } from "@/lib/xlsx";
import {
  FUND_MONTHS,
  SUB_LINE_RULES,
  WC_MONTHS,
  cashReportFromFile,
  chooseDistribution,
  distributable,
  distributionXlsx,
  history,
  isoFromReportDate,
  prevQuarterEnd,
  quarterEndOf,
  yields,
} from "@/lib/distributions";
import { quarterKey } from "@/lib/fundTimeline";
import FundTypeBadge from "@/components/FundTypeBadge";

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`;
  return n < 0 ? `(${s})` : s;
};
const fmtP = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}%`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const today = () => new Date().toISOString().slice(0, 10);
const th = "px-2.5 py-2 font-medium";
const td = "px-2.5 py-1.5";
const inp = "w-28 rounded border border-gray-300 px-1.5 py-1 text-right tabular-nums disabled:bg-gray-50";
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";

function MoneyInput({ value, placeholder, onChange, disabled, label }) {
  return (
    <input
      aria-label={label}
      type="number"
      step="1"
      disabled={disabled}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={inp}
    />
  );
}

export default function DistributionAnalysis({ deals, funds = {}, marks = {}, curve, canEdit, email, onFundTermsChange }) {
  const fundNames = useMemo(() => [...new Set(deals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))], [deals]);
  const [fundPick, setFundPick] = useState(null);
  const fundName = fundNames.includes(fundPick) ? fundPick : fundNames[0];
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fundName), [deals, fundName]);
  const terms = useMemo(() => ({ ...DEFAULT_FUND_TERMS, ...(funds[fundName] ?? {}), name: fundName }), [funds, fundName]);
  const t0 = today();
  const lastQ = lastCompletedQuarterEnd(t0);
  const quarterOpts = useMemo(() => {
    const out = [];
    let q = lastQ;
    for (let i = 0; i < 6; i++) { out.push(q); q = prevQuarterEnd(q); }
    return out;
  }, [lastQ]);
  const [qPick, setQPick] = useState(null);
  const qEnd = quarterOpts.includes(qPick) ? qPick : lastQ;
  const calc = useMemo(() => (fundName ? distributable(fundDeals, terms, qEnd, { todayISO: t0, curve }) : null), [fundName, fundDeals, terms, qEnd, t0, curve]);
  const val = useMemo(() => (fundName ? fundValuation(fundDeals, marks, terms, { todayISO: t0, curve }) : null), [fundName, fundDeals, marks, terms, t0, curve]);
  const [choice, setChoice] = useState({ mode: "pct", value: 100 });
  const [msg, setMsg] = useState(null);
  const [paidDate, setPaidDate] = useState(t0);
  const fileRef = useRef(null);

  if (!fundName || !calc) {
    return <p className="text-sm text-gray-500">Put deals in a fund (Fund field) to plan its distributions here.</p>;
  }

  const store = terms.distributions ?? {};
  const qk = calc.quarter;
  const vq = [...(val?.quarters ?? [])].reverse().find((q) => q.quarterEnd <= qEnd);
  const lpContributed = vq && !vq.net?.nm ? vq.net.contrib : 0;
  const lpNav = vq?.net?.lpNav ?? 0;
  const pick = chooseDistribution(calc, terms, choice);
  const y = yields(pick.lp, { lpContributed, lpNav });
  const hist = history(terms.capitalActivity, qEnd, { lpContributed, gpCommitPct: terms.gpCommitPct ?? 5 });
  const proposals = (store.proposals ?? []).filter((p) => p.quarter === qk);

  const saveStore = (patch) => canEdit && onFundTermsChange(fundName, { distributions: { ...store, ...patch } });
  const setCash = (dealId, field, v) => {
    const qCash = { ...(store.cash?.[qk] ?? {}) };
    qCash[dealId] = { ...(qCash[dealId] ?? {}), [field]: v, ...(field === "balance" ? { source: v == null ? undefined : "manual" } : {}) };
    saveStore({ cash: { ...(store.cash ?? {}), [qk]: qCash } });
  };

  async function upload(file) {
    try {
      const r = await cashReportFromFile(file, fundDeals, store.yardiMapping);
      if (!r.rows.length) { setMsg({ ok: false, text: r.error ?? "No balances matched this fund's assets." }); return; }
      // The report's as-of date picks the quarter (else the quarter shown).
      const iso = isoFromReportDate(r.rows[0].asOf);
      const tq = iso ? quarterEndOf(iso) : qEnd;
      const tk = quarterKey(tq);
      const qCash = { ...(store.cash?.[tk] ?? {}) };
      for (const row of r.rows) qCash[row.dealId] = { ...(qCash[row.dealId] ?? {}), balance: row.balance, source: "yardi", file: file.name, asOf: row.asOf };
      saveStore({ cash: { ...(store.cash ?? {}), [tk]: qCash }, yardiMapping: r.mapping });
      if (tq !== qEnd) setQPick(tq);
      const target = distributable(fundDeals, terms, tq, { todayISO: t0, curve });
      const missing = target.held.filter((a) => !r.rows.some((x) => x.dealId === a.id)).map((a) => a.name);
      setMsg({ ok: true, text: `Loaded ${r.rows.length} balance${r.rows.length === 1 ? "" : "s"} for ${quarterLabel(tq)} from ${file.name}.${r.unmatched.length ? ` Not matched: ${r.unmatched.map((u) => u.key).join(", ")}.` : ""}${missing.length ? ` No balance for ${missing.join(", ")}: projected cash is used.` : ""}` });
    } catch (e) {
      setMsg({ ok: false, text: `Couldn't read ${file.name}: ${e.message}` });
    }
  }

  const saveProposal = () => {
    if (!canEdit) return;
    const p = { id: `dp-${Date.now().toString(36)}`, quarter: qk, qEnd, amount: pick.amount, lp: pick.lp, gp: pick.gp, distributable: calc.total, projectedCash: calc.split.projectedBalance, choice, by: email ?? "", savedAt: new Date().toISOString(), status: "proposed" };
    saveStore({ proposals: [...(store.proposals ?? []), p] });
    setMsg({ ok: true, text: `Proposal saved: ${fmtM(pick.amount)} for ${quarterLabel(qEnd)}.` });
  };
  const recordPaid = (p) => {
    if (!canEdit) return;
    if (!window.confirm(`Record ${fmtM(p.amount)} as paid on ${usDate(paidDate)}? It is added to the fund's capital activity as a distribution (LP ${fmtM(p.lp)}, GP ${fmtM(p.gp)}).`)) return;
    const entry = { id: newActivityId(), date: paidDate, type: "distribution", amount: Math.round(p.amount * 100) / 100, purpose: "other", notes: `${quarterLabel(p.qEnd)} distribution (LP ${Math.round(p.lp)}, GP ${Math.round(p.gp)})` };
    onFundTermsChange(fundName, {
      capitalActivity: [...(terms.capitalActivity ?? []), entry],
      distributions: { ...store, proposals: (store.proposals ?? []).map((x) => (x.id === p.id ? { ...x, status: "paid", paidDate, activityId: entry.id } : x)) },
    });
    setMsg({ ok: true, text: `Recorded ${fmtM(p.amount)} paid on ${usDate(paidDate)} in capital activity.` });
  };
  const fileBase = `${safeFileName(fundName)}-distribution-${qk}`;

  return (
    <section className="space-y-4" data-testid="distribution-analysis">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            Distribution Analysis <span className="text-sm font-normal text-gray-500">· {fundName}</span>
            <FundTypeBadge type={funds[fundName]?.type} />
          </h2>
          <p className="text-xs text-gray-500">Distributable cash for the quarter, after {WC_MONTHS} months of asset expenses, {FUND_MONTHS} months of fund expenses and any sub line repayment; split LP / GP by the fund&apos;s waterfall.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fundNames.length > 1 && (
            <select aria-label="Fund" value={fundName} onChange={(e) => setFundPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {fundNames.map((n) => <option key={n} value={n}>{fundOptionLabel(n, funds)}</option>)}
            </select>
          )}
          <select aria-label="Quarter" value={qEnd} onChange={(e) => setQPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
            {quarterOpts.map((q) => <option key={q} value={q}>{quarterLabel(q)} (ends {usDate(q)})</option>)}
          </select>
          {canEdit && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} border-blue-200 bg-blue-50 text-blue-700`}>Upload Yardi cash</button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" data-testid="yardi-cash-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </>
          )}
          <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => downloadBlob(writeXlsx(distributionXlsx(fundName, calc, pick, y, hist), { sheetName: "Distribution", title: `Baywise · ${fundName} distribution analysis` }), `${fileBase}.xlsx`)}>Excel</button>
          <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={async () => { const { distributionPdf } = await import("@/lib/distributionPdf"); downloadBlob(await distributionPdf(fundName, calc, pick, y, hist, { type: funds[fundName]?.type }), `${fileBase}.pdf`); }}>PDF</button>
        </div>
      </div>

      {msg && <p className={`rounded-lg border px-3 py-2 text-xs ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} data-testid="dist-msg">{msg.text}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="dist-assets">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-gray-50 text-gray-500">
            <tr>{["Asset", "Cash at quarter end", "Source", "Lender reserves", "Committed TI / capex", `Working capital (${WC_MONTHS} mo. opex)`, "Distributable"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {calc.held.map((a) => {
              const e = store.cash?.[qk]?.[a.id] ?? {};
              return (
                <tr key={a.id} className="border-t border-gray-100" data-testid="dist-asset-row">
                  <td className={td}>{a.name}</td>
                  <td className={`${td} text-right`}><MoneyInput label={`Cash ${a.name}`} value={e.balance} placeholder={Math.round(a.projected).toString()} disabled={!canEdit} onChange={(v) => setCash(a.id, "balance", v)} /></td>
                  <td className={`${td} text-right`}>
                    {a.source === "projected" ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800" title="The model's operating cash for the quarter">projected, no balance entered</span>
                    ) : (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800" title={e.file ? `${e.file}${e.asOf ? `, as of ${e.asOf}` : ""}` : "Entered by hand"}>{a.source === "yardi" ? "Yardi" : "entered"}</span>
                    )}
                  </td>
                  <td className={`${td} text-right`}><MoneyInput label={`Reserves ${a.name}`} value={e.reserves} placeholder="0" disabled={!canEdit} onChange={(v) => setCash(a.id, "reserves", v)} /></td>
                  <td className={`${td} text-right`}><MoneyInput label={`Committed ${a.name}`} value={e.committed} placeholder="0" disabled={!canEdit} onChange={(v) => setCash(a.id, "committed", v)} /></td>
                  <td className={`${td} text-right text-gray-600`}>{fmtM(a.wc)}</td>
                  <td className={`${td} text-right font-semibold`}>{fmtM(a.distributable)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-gray-200 font-semibold">
              <td className={td}>Assets</td>
              <td className={`${td} text-right`}>{fmtM(calc.split.actualBalance + calc.split.projectedBalance)}</td>
              <td className={`${td} text-right text-[10px] font-normal text-gray-500`}>{calc.split.projectedCount ? `${calc.split.projectedCount} projected` : "all actual"}</td>
              <td colSpan={3} />
              <td className={`${td} text-right`}>{fmtM(calc.assetsTotal)}</td>
            </tr>
          </tbody>
        </table>
        {calc.assets.some((a) => a.status !== "held") && (
          <p className="border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">Not included: {calc.assets.filter((a) => a.status !== "held").map((a) => `${a.name} (${a.status})`).join(", ")}.</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-gray-200 p-3 text-xs" data-testid="dist-fund">
          <h3 className="text-sm font-semibold text-gray-800">Fund cash and sub line</h3>
          <div className="flex items-center justify-between gap-2">
            <span>Fund cash <span className="text-gray-400">({calc.fund.cashSource === "entered" ? "entered" : "projected, none entered"})</span></span>
            <MoneyInput label="Fund cash" value={store.fundCash?.[qk]} placeholder={Math.round(calc.fund.cash).toString()} disabled={!canEdit} onChange={(v) => saveStore({ fundCash: { ...(store.fundCash ?? {}), [qk]: v } })} />
          </div>
          <div className="flex justify-between"><span>Less fund minimum ({FUND_MONTHS} months of fee and sub line costs)</span><span className="tabular-nums">{fmtM(-calc.fund.min)}</span></div>
          <div className="flex justify-between font-medium"><span>Fund cash available</span><span className="tabular-nums">{fmtM(calc.fund.excess)}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
            <label className="flex items-center gap-1.5">
              <span>Sub line term sheet</span>
              <select aria-label="Sub line rule" disabled={!canEdit} value={calc.subLine.rule} onChange={(e) => saveStore({ subLine: { ...(store.subLine ?? {}), rule: e.target.value } })} className="rounded border border-gray-300 px-1.5 py-1">
                {SUB_LINE_RULES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            {calc.subLine.rule === "fixed" && <MoneyInput label="Sub line repayment" value={store.subLine?.amount} placeholder="0" disabled={!canEdit} onChange={(v) => saveStore({ subLine: { ...(store.subLine ?? {}), amount: v } })} />}
          </div>
          <div className="flex justify-between text-gray-600"><span>Sub line balance at {usDate(qEnd)}</span><span className="tabular-nums">{fmtM(calc.subLine.balance)}</span></div>
          <div className="flex justify-between font-medium"><span>Less sub line repayment</span><span className="tabular-nums">{fmtM(-calc.subLine.repay)}</span></div>
        </div>

        <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-xs" data-testid="dist-total">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Distributable cash · {quarterLabel(qEnd)}</h3>
            <span className="text-lg font-bold tabular-nums text-gray-900">{fmtM(calc.total)}</span>
          </div>
          {calc.split.projectedCount > 0 && (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-900" data-testid="dist-projected-note">
              Cash balances: {fmtM(calc.split.actualBalance)} actual, {fmtM(calc.split.projectedBalance)} projected ({calc.split.projectedCount} asset{calc.split.projectedCount > 1 ? "s" : ""} with no balance entered).
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-blue-100 pt-2">
            <span className="font-medium">Distribute</span>
            <select aria-label="Distribution basis" value={choice.mode} onChange={(e) => setChoice({ mode: e.target.value, value: e.target.value === "pct" ? 100 : Math.round(calc.total) })} className="rounded border border-gray-300 px-1.5 py-1">
              <option value="pct">% of distributable</option>
              <option value="amount">an amount ($)</option>
            </select>
            <input aria-label="Distribution value" type="number" value={choice.value} onChange={(e) => setChoice({ ...choice, value: e.target.value })} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
            <span>Distribution</span><span className="text-right font-semibold" data-testid="dist-amount">{fmtM(pick.amount)}</span>
            <span>To LPs</span><span className="text-right">{fmtM(pick.lp)}</span>
            <span>To the GP</span><span className="text-right">{fmtM(pick.gp)}</span>
            {pick.heldBack > 1 && <><span className="text-amber-800" title="Under the LPA's income treatment, income beyond the pref and capital outstanding waits for the next capital event">Held by the waterfall</span><span className="text-right text-amber-800">{fmtM(pick.heldBack)}</span></>}
            <span className="text-gray-500">Stays in reserve</span><span className="text-right text-gray-500">{fmtM(pick.retained)}</span>
          </div>
          {pick.heldBack > 1 && (
            <p className="rounded bg-amber-50 px-2 py-1 text-amber-900" data-testid="dist-held-note">
              {lpContributed > 0
                ? "Part of this would be held by the waterfall: under the LPA's income treatment, income beyond the pref and the capital outstanding waits for the next sale."
                : "LPs haven't funded capital yet (purchases are on the sub line), so under the LPA this cash can't go to investors yet. Consider using it to repay the sub line (set the sub line term sheet rule above)."}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-blue-100 pt-2 tabular-nums" data-testid="dist-yield">
            <span title="LP distribution × 4 ÷ LP contributed capital">Yield on LP contributed capital (annualized)</span><span className="text-right font-semibold">{fmtP(y.onContributed)}</span>
            <span title="LP distribution × 4 ÷ LP NAV at the quarter">Yield on LP NAV (annualized)</span><span className="text-right font-semibold">{fmtP(y.onNav)}</span>
            <span className="text-gray-500">LP contributed / LP NAV</span><span className="text-right text-gray-500">{fmtM(lpContributed)} / {fmtM(lpNav)}</span>
          </div>
          {canEdit && (
            <button type="button" onClick={saveProposal} disabled={!(pick.amount > 0)} className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">Save proposal</button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="dist-history">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500">
              <tr>{["Quarter", "Distributed", "Yield (annualized)"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {hist.quarters.map((h) => (
                <tr key={h.quarter} className="border-t border-gray-100"><td className={td}>{h.quarter.replace("-", " ")}</td><td className={`${td} text-right`}>{fmtM(h.amount)}</td><td className={`${td} text-right`}>{fmtP(h.yield)}</td></tr>
              ))}
              <tr className="border-t border-gray-200 font-semibold"><td className={td}>Trailing 12 months</td><td className={`${td} text-right`}>{fmtM(hist.ttm)}</td><td className={`${td} text-right`}>{fmtP(hist.ttmYield)}</td></tr>
              <tr className="border-t border-gray-100 bg-blue-50/50"><td className={td}>{quarterLabel(qEnd)} proposed</td><td className={`${td} text-right`}>{fmtM(pick.amount)}</td><td className={`${td} text-right`}>{fmtP(y.onContributed)}</td></tr>
            </tbody>
          </table>
          <p className="px-3 py-1.5 text-[11px] text-gray-400">Recorded distributions from capital activity (type Distribution paid).</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3 text-xs" data-testid="dist-proposals">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-800">Proposals · {quarterLabel(qEnd)}</h3>
            {canEdit && <label className="flex items-center gap-1.5 text-gray-600">Paid on <input aria-label="Paid date" type="date" value={paidDate} onChange={(e) => e.target.value && setPaidDate(e.target.value)} className="rounded border border-gray-300 px-1.5 py-0.5" /></label>}
          </div>
          {proposals.length === 0 ? (
            <p className="text-gray-400">None saved for this quarter.</p>
          ) : (
            <ul className="space-y-1.5">
              {proposals.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 px-2 py-1.5" data-testid="dist-proposal">
                  <span>
                    <span className="font-semibold tabular-nums">{fmtM(p.amount)}</span> <span className="text-gray-500">(LP {fmtM(p.lp)}, GP {fmtM(p.gp)}) · {usDate(p.savedAt.slice(0, 10))}{p.by ? ` · ${p.by}` : ""}</span>
                  </span>
                  {p.status === "paid" ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">Paid {usDate(p.paidDate)}</span>
                  ) : canEdit ? (
                    <button type="button" onClick={() => recordPaid(p)} className="rounded border border-emerald-300 bg-white px-2 py-0.5 font-medium text-emerald-700 hover:bg-emerald-50">Record as paid</button>
                  ) : (
                    <span className="text-gray-400">Proposed</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-gray-400">No approval step yet (that comes with automated workflow, phase V). Recording a payment adds a &quot;Distribution paid&quot; entry to the fund&apos;s capital activity; it feeds this history and doesn&apos;t change the fund model.</p>
        </div>
      </div>
    </section>
  );
}
