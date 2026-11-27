"use client";

// Phase M: Portfolio Impact tab (Acquisitions, last). Candidates from the
// pipeline modeled into a fund, never changing it until "Add to fund".
import { useMemo, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { fundOptionLabel } from "@/lib/fundTypes";
import { writeXlsx } from "@/lib/xlsx";
import { IMPACT_ROWS, breakEvenPrice, compareCandidates, fundImpact, impactXlsx, isPipeline, saveScenarioVersion, sensitivity } from "@/lib/fundImpact";

const fmt = (v, u) => (v == null || !isFinite(v) ? "—" : u === "%" ? `${v.toFixed(2)}%` : u === "x" ? `${v.toFixed(2)}x` : `$${(v / 1e6).toFixed(2)}M`);
const fmtD = (v, u) => {
  if (v == null || !isFinite(v)) return "—";
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  return u === "%" ? `${s}${a.toFixed(2)} pts` : u === "x" ? `${s}${a.toFixed(2)}x` : `${s}$${(a / 1e6).toFixed(2)}M`;
};
const tone = (v) => (v == null || Math.abs(v) < 1e-9 ? "text-gray-500" : v > 0 ? "text-emerald-700" : "text-red-600");
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";

export default function FundImpact({ deals, funds, curve, canEdit, email, preselect = [], initialFund = "", onFundTermsChange, onAddToFund }) {
  const today = new Date().toISOString().slice(0, 10);
  const names = Object.keys(funds);
  // Opens in the fund the Screener's deal targets (user, 11/25, 1.1.6).
  const [pick, setPick] = useState(initialFund || null);
  const fund = names.includes(pick) ? pick : names[0];
  const [base, setBase] = useState("all");
  const terms = useMemo(() => (fund ? { ...DEFAULT_FUND_TERMS, ...(funds[fund] ?? {}), name: fund } : null), [funds, fund]);
  const pipeline = useMemo(() => deals.filter((d) => isPipeline(d, today, terms?.finalClose) && (!d.inputs.fundName?.trim() || d.inputs.fundName.trim() === fund)), [deals, today, terms, fund]);
  const [sel, setSel] = useState(() => new Set(preselect));
  const cands = pipeline.filter((d) => sel.has(d.id));
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fund), [deals, fund]);
  const opts = { todayISO: today, curve, base };
  const r = useMemo(() => (terms && cands.length ? fundImpact(fundDeals, terms, cands, { todayISO: today, curve, base }) : null), [terms, cands, fundDeals, today, curve, base]);
  const ranked = useMemo(() => (terms && cands.length > 1 ? compareCandidates(fundDeals, terms, cands, { todayISO: today, curve, base }) : null), [terms, cands, fundDeals, today, curve, base]);
  const [extra, setExtra] = useState({}); // { [id]: { be, sens } }
  const [scName, setScName] = useState("");
  const [note, setNote] = useState("");
  const [view, setView] = useState(null); // { sid, v }
  const scenarios = terms?.impactScenarios ?? [];
  const shown = view ? scenarios.find((s) => s.id === view.sid)?.versions.find((x) => x.v === view.v) : null;

  if (!names.length) return <p className="text-sm text-gray-500">Set up a fund first (Portfolio Return → New fund).</p>;
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const run = (id, kind) => {
    const c = cands.find((x) => x.id === id);
    if (!c) return;
    const val = kind === "be" ? breakEvenPrice(fundDeals, terms, c, opts, { targetIrr: terms.fundPlanTargets?.netIrrPct ?? null }) : sensitivity(fundDeals, terms, c, opts);
    setExtra((e) => ({ ...e, [id]: { ...(e[id] ?? {}), [kind]: val } }));
  };
  const save = (sid = null) => {
    if (!canEdit || !r) return;
    const nm = scName.trim() || scenarios.find((s) => s.id === sid)?.name || `${fund}: ${cands.map((c) => c.inputs.propertyName).join(" + ")}`;
    onFundTermsChange(fund, { impactScenarios: saveScenarioVersion(scenarios, { id: sid, name: nm, note: note.trim(), by: email ?? "", base, candidates: cands, result: r }) });
    setNote("");
  };
  const res = shown?.result ?? r;

  return (
    <section className="space-y-3" data-testid="fund-impact-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">Portfolio Impact <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800">Scenario — not actual</span></h2>
          <p className="text-xs text-gray-500">Model pipeline deals into a fund before buying them. Nothing changes the fund until you press Add to fund.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Fund" value={fund} onChange={(e) => { setPick(e.target.value); setView(null); }} className="rounded-lg border border-gray-300 px-2 py-1.5">{names.map((n) => <option key={n} value={n}>{fundOptionLabel(n, funds)}</option>)}</select>
          <select aria-label="Compare against" value={base} onChange={(e) => setBase(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5"><option value="all">vs. owned + other pipeline assets</option><option value="owned">vs. owned assets only</option></select>
          {res && <button type="button" onClick={async () => { const { fundImpactPdf } = await import("@/lib/fundImpactPdf"); const sc = shown ? scenarios.find((x) => x.id === view.sid) : null; downloadBlob(await fundImpactPdf(fund, res, { scenario: sc?.name ?? "", version: shown ?? null }), `${safeFileName(fund)}-fund-impact${shown ? `-v${shown.v}` : ""}.pdf`); }} className={`${btn} border-gray-300 bg-white text-gray-700`}>PDF</button>}
          {res && <button type="button" onClick={() => downloadBlob(writeXlsx(impactXlsx(fund, res, { scenario: shown ? `${scenarios.find((s) => s.id === view.sid)?.name} v${shown.v}` : "" }), { sheetName: "Fund impact", title: `Baywise · ${fund} fund impact (scenario)` }), `${safeFileName(fund)}-fund-impact.xlsx`)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-3" data-testid="impact-candidates">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Candidates <span className="font-normal text-gray-500">(pipeline deals with no fund or bought after today)</span></h3>
        {pipeline.length === 0 ? <p className="text-xs text-gray-500">No pipeline deals. Screen one on the Pipeline tab first.</p> : (
          <div className="flex flex-wrap gap-2 text-xs">
            {pipeline.map((d) => (
              <label key={d.id} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${sel.has(d.id) ? "border-indigo-400 bg-indigo-50" : "border-gray-200"}`}>
                <input type="checkbox" aria-label={`Candidate ${d.inputs.propertyName}`} checked={sel.has(d.id)} onChange={() => { toggle(d.id); setView(null); }} />
                {d.inputs.propertyName || "Unnamed"} <span className="text-gray-500">${((d.inputs.purchasePrice ?? 0) / 1e6).toFixed(1)}M · close {usDate(d.inputs.acquisitionDate)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {shown && <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900" data-testid="impact-viewing">Viewing saved version v{shown.v} of “{scenarios.find((s) => s.id === view.sid)?.name}”, saved {usDate(shown.at.slice(0, 10))}{shown.by ? ` by ${shown.by}` : ""}: frozen results ({shown.candidates.map((c) => c.name).join(", ")}). <button type="button" onClick={() => setView(null)} className="font-medium underline">Back to live</button></p>}

      {res && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-gray-200 p-3">
            <table className="w-full text-xs tabular-nums" data-testid="impact-tab-returns">
              <thead className="text-gray-500"><tr><th className="py-1 text-left font-medium">{fund}</th><th className="py-1 text-right font-medium">Without</th><th className="py-1 text-right font-medium">With</th><th className="py-1 text-right font-medium">Change</th></tr></thead>
              <tbody>
                {IMPACT_ROWS.map(([k, l, u]) => <tr key={k} className="border-t border-gray-100"><td className="py-1">{l}</td><td className="py-1 text-right">{fmt(res.without.returns[k], u)}</td><td className="py-1 text-right font-semibold">{fmt(res.with.returns[k], u)}</td><td className={`py-1 text-right ${tone(res.change[k])}`}>{fmtD(res.change[k], u)}</td></tr>)}
                <tr className="border-t border-gray-100"><td className="py-1">Equity</td><td className="py-1 text-right">{fmt(res.without.equity, "$")}</td><td className="py-1 text-right font-semibold">{fmt(res.with.equity, "$")}</td><td className="py-1 text-right">{fmtD(res.change.equity, "$")}</td></tr>
                <tr className="border-t border-gray-100"><td className="py-1">Dry powder</td><td className="py-1 text-right">{fmt(res.without.dryPowder, "$")}</td><td className={`py-1 text-right font-semibold ${res.overCommitted ? "text-red-700" : ""}`}>{fmt(res.with.dryPowder, "$")}</td><td className="py-1 text-right">{res.dryPowderUsedPct != null ? `${res.dryPowderUsedPct.toFixed(1)}% used` : "—"}</td></tr>
                {[["tenant", "Largest tenant, % rent"], ["state", "Largest state, % value"], ["ltv", "Fund LTV"]].map(([k, l]) => <tr key={k} className="border-t border-gray-100"><td className="py-1">{l}</td><td className="py-1 text-right">{fmt(res.without.conc[k].value, "%")}</td><td className="py-1 text-right font-semibold">{fmt(res.with.conc[k].value, "%")}</td><td className="py-1 text-right text-gray-500">{res.with.conc[k].what}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 p-3 text-xs" data-testid="impact-tab-limits">
              <h4 className="mb-1 font-semibold text-gray-800">Fund limits</h4>
              {res.limits.length === 0 ? <p className="text-gray-500">No limits set (Reports → Fund limits).</p> : (
                <ul className="space-y-0.5">{res.limits.map((l) => <li key={`${l.source}-${l.key}`} className={l.newBreach ? "font-semibold text-red-700" : l.status === "breached" ? "text-red-600" : l.status === "near" ? "text-amber-700" : "text-gray-700"}>{l.label}: {l.before?.actual != null ? l.before.actual.toFixed(1) : "—"} → {l.actual != null ? l.actual.toFixed(1) : "—"} (limit {String(l.limit)}){l.newBreach ? " · new breach" : ""}</li>)}</ul>
              )}
            </div>
            {(ranked || res.shares) && (
              <div className="rounded-xl border border-gray-200 p-3 text-xs" data-testid="impact-compare">
                <h4 className="mb-1 font-semibold text-gray-800">Compare candidates (each alone; ranked by fund net LP IRR)</h4>
                <table className="w-full tabular-nums"><tbody>
                  {(ranked ?? []).map((x, i) => {
                    const sh = res.shares?.find((y) => y.id === x.id);
                    return <tr key={x.id} className="border-t border-gray-100"><td className="py-1">{i + 1}. {x.name}</td><td className={`py-1 text-right ${tone(x.netLpIrr)}`}>{fmtD(x.netLpIrr, "%")}</td><td className="py-1 text-right text-gray-500">share of combined {fmtD(sh?.share, "%")}</td><td className="py-1 text-right text-red-700">{x.breaches.join(", ")}</td></tr>;
                  })}
                </tbody></table>
              </div>
            )}
          </div>
        </div>
      )}

      {!shown && cands.length > 0 && (
        <div className="space-y-2 rounded-xl border border-gray-200 p-3 text-xs" data-testid="impact-tools">
          {cands.map((c) => {
            const e = extra[c.id] ?? {};
            return (
              <div key={c.id} className="flex flex-wrap items-start gap-3 border-t border-gray-100 pt-2 first:border-0 first:pt-0" data-testid="impact-candidate">
                <span className="w-44 font-medium">{c.inputs.propertyName}</span>
                <button type="button" onClick={() => run(c.id, "be")} className={`${btn} border-gray-300 bg-white text-gray-700`}>Break-even price</button>
                {e.be && <span data-testid="impact-be">{e.be.price ? `${fmt(e.be.price, "$")} (${e.be.capped ? "≥ " : ""}${e.be.vsAsk != null ? `${e.be.vsAsk >= 0 ? "+" : ""}${e.be.vsAsk.toFixed(1)}% vs. price` : "150% of price"}) keeps fund net LP IRR ≥ ${e.be.target.toFixed(2)}% with no new breach` : e.be.note}</span>}
                <button type="button" onClick={() => run(c.id, "sens")} className={`${btn} border-gray-300 bg-white text-gray-700`}>Sensitivity</button>
                {e.sens && (
                  <table className="tabular-nums" data-testid="impact-sens"><thead><tr><th className="pr-2 text-left font-medium text-gray-500">Exit cap ↓ / price →</th>{e.sens.prices.map((p) => <th key={p} className="px-2 text-right font-medium text-gray-500">{fmt(p, "$")}</th>)}</tr></thead>
                    <tbody>{e.sens.grid.map((row, i) => <tr key={i}><td className="pr-2 text-gray-500">{e.sens.caps[i].toFixed(2)}%</td>{row.map((v, k) => <td key={k} className="px-2 text-right">{fmt(v, "%")}</td>)}</tr>)}</tbody></table>
                )}
                {canEdit && <button type="button" onClick={() => window.confirm(`Add ${c.inputs.propertyName} to ${fund}? It becomes an asset of the fund (closing ${usDate(c.inputs.acquisitionDate)}), logged. This is the only step here that changes the fund.`) && onAddToFund?.(c.id, fund)} className={`${btn} ml-auto border-emerald-300 bg-white text-emerald-700`}>Add to fund</button>}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-gray-200 p-3 text-xs" data-testid="impact-scenarios">
        <h3 className="text-sm font-semibold text-gray-800">Saved scenarios · {fund}</h3>
        {canEdit && r && !shown && (
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Scenario name" value={scName} onChange={(e) => setScName(e.target.value)} placeholder="Name, e.g. Q1 2027: Reno + Boise" className="w-64 rounded border border-gray-300 px-2 py-1" />
            <input aria-label="Version note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-48 rounded border border-gray-300 px-2 py-1" />
            <button type="button" onClick={() => save(null)} className={`${btn} border-indigo-600 bg-indigo-600 text-white`}>Save as new scenario</button>
          </div>
        )}
        {scenarios.length === 0 ? <p className="text-gray-500">None saved. A saved version is frozen: later changes save a new version.</p> : (
          <ul className="space-y-1.5">
            {scenarios.map((s) => (
              <li key={s.id} className="rounded border border-gray-100 px-2 py-1.5" data-testid="impact-scenario">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  {s.versions.map((v) => <button key={v.v} type="button" onClick={() => setView({ sid: s.id, v: v.v })} className={`rounded px-1.5 py-0.5 ${view?.sid === s.id && view?.v === v.v ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"}`} title={`${usDate(v.at.slice(0, 10))}${v.by ? ` · ${v.by}` : ""}${v.note ? ` · ${v.note}` : ""}`}>v{v.v}</button>)}
                  {canEdit && r && !shown && <button type="button" onClick={() => save(s.id)} className="text-indigo-700 hover:underline">Save current as v{s.versions.length + 1}</button>}
                  {canEdit && <button type="button" onClick={() => { const last = s.versions.at(-1); setSel(new Set(last.candidates.map((c) => c.id).filter((id) => deals.some((d) => d.id === id)))); setBase(last.base); setView(null); }} className="text-gray-600 hover:underline">Load candidates</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
