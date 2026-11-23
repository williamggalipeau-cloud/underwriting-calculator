"use client";

import { useMemo, useState } from "react";
import { DECISIONS, DEFAULT_REFI, assetSellHold, fundScenario } from "@/lib/sellHold";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";
import { actualNoi, valueAtCap } from "@/lib/assetMedia";

const pct = (v, d = 1) => (isFinite(v) ? `${v.toFixed(d)}%` : "n/m");
const x = (v) => (isFinite(v) ? `${v.toFixed(2)}x` : "—");
const m = (v) => {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a / 1e3)}k`;
  return v < 0 ? `(${s})` : s;
};
const fmtDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit", timeZone: "UTC" }) : "—");
const todayISO = () => new Date().toISOString().slice(0, 10);
const num = "w-20 rounded-md border border-gray-200 px-2 py-1 text-right text-gray-900";

// Decision label for a stored decision.
const decisionLabel = (dec, a) => {
  if (!dec || dec.decision === "base") return `Base plan (sell year ${a?.baseHold ?? "?"})`;
  if (dec.decision === "sell") return "Sell now";
  return `${dec.decision === "refi" ? "Refinance, hold" : "Hold"} to year ${dec.years}`;
};

function Bars({ options }) {
  const vals = options.map((o) => o.forwardIrr).filter(isFinite);
  const max = Math.max(1, ...vals.map(Math.abs));
  return (
    <div className="flex items-end gap-2 overflow-x-auto" style={{ height: 110 }}>
      {options.map((o) => (
        <div key={o.key} className="flex min-w-[2.5rem] flex-col items-center justify-end gap-1">
          <span className="text-[9px] tabular-nums text-gray-500">{isFinite(o.forwardIrr) ? o.forwardIrr.toFixed(0) : "n/m"}</span>
          <div className={`w-5 rounded-t ${o.forwardIrr < 0 ? "bg-red-400" : "bg-blue-500"}`} style={{ height: `${isFinite(o.forwardIrr) ? Math.max(2, (Math.abs(o.forwardIrr) / max) * 70) : 2}px` }} />
          <span className="text-[10px] text-gray-500">Y{o.years}</span>
        </div>
      ))}
    </div>
  );
}

export default function SellHold({ deal, fundDeals, fundName, terms, canEdit, onTermsChange, curve }) {
  const [scope, setScope] = useState("asset");
  const [scenarioName, setScenarioName] = useState("");
  const sh = terms?.sellHold ?? {};
  const decisionDate = sh.decisionDate || todayISO();
  const hurdle = terms?.hurdleRatePct ?? terms?.prefPct ?? 0;
  const save = (patch) => canEdit && onTermsChange({ sellHold: { ...sh, ...patch } });

  const analyses = useMemo(() => {
    if (!terms) return {};
    const out = {};
    for (const d of fundDeals) {
      out[d.id] = assetSellHold(d, {
        decisionDate,
        capRatePct: sh.capRates?.[d.id] ?? undefined,
        refi: sh.refi?.[d.id] ?? {},
        hurdlePct: hurdle,
        fund: terms,
      });
    }
    return out;
  }, [fundDeals, terms, decisionDate, sh.capRates, sh.refi, hurdle]);

  const decisions = sh.decisions ?? {};
  const suggested = Object.fromEntries(
    fundDeals.map((d) => {
      const b = analyses[d.id]?.best;
      return [d.id, b ? (b.key === "sell" ? { decision: "sell" } : { decision: b.decision, years: b.years }) : { decision: "base" }];
    })
  );
  const baseRes = useMemo(
    () => (terms ? fundScenario(fundDeals, terms, {}, { decisionDate, todayISO: todayISO(), curve, analyses }) : null),
    [fundDeals, terms, analyses, decisionDate, curve]
  );
  const scenRes = useMemo(
    () => (terms ? fundScenario(fundDeals, terms, decisions, { decisionDate, todayISO: todayISO(), curve, analyses }) : null),
    [fundDeals, terms, analyses, decisionDate, curve, decisions]
  );

  if (!terms) {
    return <p className="text-sm text-gray-500">Put this asset in a fund (Fund field) to run a sell / hold analysis.</p>;
  }

  const setDecision = (id, value) => {
    const [decision, years] = value.split(":");
    save({ decisions: { ...decisions, [id]: decision === "base" ? { decision: "base" } : { decision, years: years ? Number(years) : undefined } } });
  };
  const decValue = (dec) => (!dec || dec.decision === "base" ? "base" : dec.decision === "sell" ? "sell" : `${dec.decision}:${dec.years}`);

  async function exportXlsx() {
    const rows = [["Asset", "Option", "Exit date", "Value", "Net proceeds / reversion", "Cash-out", "Forward IRR %", "Forward multiple", `NPV at ${hurdle}%`, "Total IRR since purchase %", "Total multiple", "Breakeven exit cap %"]];
    for (const d of fundDeals) {
      const a = analyses[d.id];
      if (a?.status !== "ok") continue;
      for (const o of [a.sell, ...a.holds, ...a.refis]) {
        rows.push([d.inputs.propertyName, o.label, o.exitDate, Math.round(o.value), Math.round(o.proceeds), Math.round(o.cashOut ?? 0), isFinite(o.forwardIrr) ? +o.forwardIrr.toFixed(2) : "", isFinite(o.forwardMultiple) ? +o.forwardMultiple.toFixed(3) : "", Math.round(o.npv), isFinite(o.totalIrr) ? +o.totalIrr.toFixed(2) : "", isFinite(o.totalMultiple) ? +o.totalMultiple.toFixed(3) : "", isFinite(o.breakevenCap) ? +o.breakevenCap.toFixed(2) : ""]);
      }
    }
    downloadBlob(await writeXlsx(rows, { sheetName: "Sell hold", colWidths: [28, 26, 12, 14, 18, 12, 12, 14, 16, 12, 14] }), `${safeFileName(fundName)}-sell-hold.xlsx`);
  }

  const a = analyses[deal?.id];
  const inFund = fundDeals.some((d) => d.id === deal?.id);
  const refiT = { ...DEFAULT_REFI, ...(sh.refi?.[deal?.id] ?? {}) };
  const setRefi = (k, v) => save({ refi: { ...(sh.refi ?? {}), [deal.id]: { ...refiT, [k]: v } } });

  return (
    <div className="space-y-4 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Sell/Hold Analysis</h2>
          <p className="text-xs text-gray-500">
            Sell now, hold, or refinance and hold: forward return of holding against the fund&apos;s hurdle ({pct(hurdle, 2)}), and the effect on {fundName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-gray-600">
            Decision date
            <input type="date" value={decisionDate} disabled={!canEdit} onChange={(e) => e.target.value && save({ decisionDate: e.target.value })} className="rounded-md border border-gray-200 px-2 py-1 text-gray-900" />
          </label>
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {[["asset", deal?.inputs?.propertyName || "This asset"], ["fund", `Whole fund (${fundName})`]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-3 py-1 font-medium ${scope === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>{l}</button>
            ))}
          </div>
          <button type="button" onClick={exportXlsx} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Export to Excel</button>
        </div>
      </div>

      {scope === "asset" ? (
        !inFund ? (
          <p className="text-xs text-gray-500">This asset isn&apos;t in {fundName}.</p>
        ) : a?.status === "pipeline" ? (
          <p className="text-xs text-gray-500">Not yet acquired on the decision date ({fmtDate(a.acq)}).</p>
        ) : a?.status === "past-term" ? (
          <p className="text-xs text-gray-500">The decision date is past the fund&apos;s final extended term; the asset must be sold.</p>
        ) : a?.status === "ok" ? (
          <AssetView a={a} inputs={deal.inputs} hurdle={hurdle} canEdit={canEdit} capRate={sh.capRates?.[deal.id]} onCap={(v) => save({ capRates: { ...(sh.capRates ?? {}), [deal.id]: v } })} refiT={refiT} setRefi={setRefi} decision={decisions[deal.id]} onDecision={(v) => setDecision(deal.id, v)} decValue={decValue} />
        ) : null
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {["Asset", "Value now", "Net proceeds now", "Suggested", "Best NPV vs sell", "Decision", "Equity multiple"].map((h) => (
                    <th key={h} className={`px-2.5 py-2 font-medium ${h === "Asset" || h === "Decision" || h === "Suggested" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fundDeals.map((d) => {
                  const ad = analyses[d.id];
                  const ok = ad?.status === "ok";
                  // The option for the decision chosen (base plan = hold to the base year).
                  const dv = decValue(decisions[d.id]);
                  const [kind, yrs] = dv.split(":");
                  const chosen = !ok ? null : dv === "sell" ? ad.sell : (kind === "refi" ? ad.refis : ad.holds).find((o) => o.years === (kind === "base" ? ad.baseHold : Number(yrs)));
                  return (
                    <tr key={d.id} className="border-t border-gray-100">
                      <td className="px-2.5 py-1.5 font-medium">{d.inputs.propertyName}</td>
                      <td className="px-2.5 py-1.5 text-right">{ok ? m(ad.valueNow) : "—"}</td>
                      <td className="px-2.5 py-1.5 text-right">{ok ? m(ad.proceedsNow) : "—"}</td>
                      <td className="px-2.5 py-1.5">{ok ? ad.best.label : ad?.status === "pipeline" ? "Not yet acquired" : "—"}</td>
                      <td className="px-2.5 py-1.5 text-right">{ok ? m(ad.best.npv) : "—"}</td>
                      <td className="px-2.5 py-1.5">
                        <select value={decValue(decisions[d.id])} disabled={!canEdit || !ok} onChange={(e) => setDecision(d.id, e.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-1">
                          <option value="base">Base plan (year {ad?.baseHold ?? "?"})</option>
                          {ok && <option value="sell">Sell now</option>}
                          {ok && ad.holds.map((o) => <option key={o.key} value={`hold:${o.years}`}>Hold to year {o.years}{o.beyondTerm ? " (extension)" : ""}</option>)}
                          {ok && ad.refis.map((o) => <option key={o.key} value={`refi:${o.years}`}>Refinance, hold to year {o.years}{o.beyondTerm ? " (extension)" : ""}</option>)}
                        </select>
                      </td>
                      <td className="px-2.5 py-1.5 text-right" title={chosen && chosen.key !== "sell" ? `Since purchase; forward ${x(chosen.forwardMultiple)}` : "Since purchase"}>{chosen ? x(chosen.totalMultiple) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => save({ decisions: suggested })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100">Use suggested decisions</button>
              <button type="button" onClick={() => save({ decisions: {} })} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Reset to base plan</button>
            </div>
          )}

          {baseRes && scenRes && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>{["Fund returns", "Base plan", "Scenario", "Change"].map((h) => <th key={h} className={`px-2.5 py-2 font-medium ${h === "Fund returns" ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {[
                    ["Gross IRR", "grossIrr", "pct"],
                    ["Gross multiple", "grossMultiple", "x"],
                    ["Net fund IRR", "netFundIrr", "pct"],
                    ["Net fund multiple", "netFundMultiple", "x"],
                    ["Net LP IRR", "netLpIrr", "pct"],
                    ["Net LP multiple", "netLpMultiple", "x"],
                    [`Net LP NPV at ${pct(hurdle, 2)}`, "lpNpv", "m"],
                    ["LP distributions", "lpDistributions", "m"],
                    ["GP distributions (incl. promote)", "gpDistributions", "m"],
                  ].map(([label, k, f]) => {
                    const b = baseRes[k], s = scenRes[k];
                    const fmt = f === "pct" ? (v) => pct(v) : f === "x" ? x : m;
                    const d = s - b;
                    return (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="px-2.5 py-1.5">{label}</td>
                        <td className="px-2.5 py-1.5 text-right">{fmt(b)}</td>
                        <td className="px-2.5 py-1.5 text-right font-semibold">{fmt(s)}</td>
                        <td className={`px-2.5 py-1.5 text-right ${!isFinite(d) || Math.abs(d) < 1e-6 ? "text-gray-400" : d > 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {!isFinite(d) ? "—" : f === "pct" ? `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts` : f === "x" ? `${d >= 0 ? "+" : ""}${d.toFixed(2)}x` : `${d >= 0 ? "+" : ""}${m(d)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs">
            <h4 className="mb-1 font-semibold text-gray-700">Saved scenarios</h4>
            {(sh.scenarios ?? []).length === 0 ? (
              <p className="text-gray-400">None yet.</p>
            ) : (
              <ul className="mb-2 space-y-1">
                {sh.scenarios.map((sc, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{sc.name}</span>
                    <span className="text-gray-400">{fmtDate(sc.decisionDate)} · {Object.values(sc.decisions ?? {}).filter((d) => d.decision !== "base").length} changed</span>
                    {canEdit && <button type="button" onClick={() => save({ decisions: sc.decisions, decisionDate: sc.decisionDate })} className="text-blue-700 hover:underline">Load</button>}
                    {canEdit && <button type="button" onClick={() => save({ scenarios: sh.scenarios.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-600">Delete</button>}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!scenarioName.trim()) return; save({ scenarios: [...(sh.scenarios ?? []), { name: scenarioName.trim(), decisionDate, decisions, savedAt: new Date().toISOString() }] }); setScenarioName(""); }}>
                <input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="Scenario name, e.g. Sell Harbor & Canal 2027" className="w-72 rounded-md border border-gray-300 bg-white px-2 py-1" />
                <button type="submit" disabled={!scenarioName.trim()} className="rounded-lg bg-blue-600 px-3 py-1 font-medium text-white disabled:opacity-40">Save current decisions</button>
              </form>
            )}
          </div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-gray-400">
        Value = year-ahead NOI ÷ cap rate (the asset&apos;s exit cap unless changed), for selling now and selling later. Net proceeds = value − sale costs
        (the asset&apos;s sale cost %) − loan balance. Forward IRR = return on holding, with today&apos;s net proceeds as the amount re-invested; NPV discounts
        those flows at the fund&apos;s hurdle to the decision date (positive = holding beats selling). Breakeven exit cap = the exit cap at which holding just
        matches selling now. Refinancing: new interest-only loan at the lower of LTV × value and year-ahead NOI ÷ (min DSCR × rate), repaying the old loan;
        cash-out after financing costs is paid out. Fund returns re-run the fund with each asset&apos;s decision (sub line, fund expenses, waterfall).
        IRRs over less than a year show n/m.
      </p>
    </div>
  );
}

function AssetView({ a, inputs, hurdle, canEdit, capRate, onCap, refiT, setRefi, decision, onDecision, decValue }) {
  const rows = [a.sell, ...a.holds, ...a.refis];
  // Actual NOI from the business plan's imported actuals (phase I part 2).
  const act = actualNoi(inputs, new Date().toISOString().slice(0, 10));
  const actTile = act.months
    ? [["Actual NOI", m(act.noi), `${act.months < 12 ? `${act.months} mo annualized` : "trailing 12 mo"} · ${pct(((act.noi - a.noiFwd) / Math.abs(a.noiFwd || 1)) * 100, 1)} vs year-ahead · value ${m(valueAtCap(act.noi, a.exitCap))} at the same cap`]]
    : [];
  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 ${actTile.length ? "lg:grid-cols-8" : "lg:grid-cols-7"}`}>
        {[
          ["Year-ahead NOI", m(a.noiFwd)],
          ...actTile,
          ["Value now", m(a.valueNow), `at ${pct(a.exitCap, 2)} cap`],
          ["Loan balance", m(a.balNow)],
          ["Net proceeds now", m(a.proceedsNow), `after ${pct(a.salePct * 100, 1)} sale costs`],
          ["Suggested", a.best.label, `NPV ${m(a.best.npv)} vs selling`],
          ["Equity multiple", x(a.best.totalMultiple), `since purchase · ${a.best.key === "sell" ? "selling now" : `forward ${x(a.best.forwardMultiple)}`}`],
          ["Base plan", `Sell end of year ${a.baseHold}`],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-[11px] text-gray-500">{l}</p>
            <p className="text-sm font-bold tabular-nums">{v}</p>
            {s && <p className="text-[10px] text-gray-400">{s}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs">
        <label className="flex flex-col gap-0.5"><span className="text-gray-500">Cap rate (exit cap)</span>
          <input type="number" step={0.05} value={capRate ?? a.exitCap} disabled={!canEdit} onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v) && v > 0) onCap(v); }} className={num} />
        </label>
        <span className="text-gray-400">Refinance:</span>
        {[["ltvPct", "LTV %", 1], ["minDscr", "Min DSCR", 0.05], ["spreadPct", "Spread %", 0.05], ["feePct", "Financing cost %", 0.25], ["termYears", "Term (yrs)", 1]].map(([k, l, st]) => (
          <label key={k} className="flex flex-col gap-0.5"><span className="text-gray-500">{l}</span>
            <input type="number" step={st} value={refiT[k]} disabled={!canEdit} onChange={(e) => { const v = parseFloat(e.target.value); if (isFinite(v) && v >= 0) setRefi(k, v); }} className={num} />
          </label>
        ))}
        <span className="text-gray-500">New loan {m(a.refi.newLoan)} at {pct(a.refi.rate * 100, 2)} · cash-out {m(a.refi.cashOut)}{a.refi.cashOut < 0 ? " (paydown needed)" : ""}</span>
        <label className="ml-auto flex flex-col gap-0.5"><span className="text-gray-500">Decision for the fund scenario</span>
          <select value={decValue(decision)} disabled={!canEdit} onChange={(e) => onDecision(e.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-1">
            <option value="base">Base plan (year {a.baseHold})</option>
            <option value="sell">Sell now</option>
            {a.holds.map((o) => <option key={o.key} value={`hold:${o.years}`}>Hold to year {o.years}</option>)}
            {a.refis.map((o) => <option key={o.key} value={`refi:${o.years}`}>Refinance, hold to year {o.years}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-gray-50 text-gray-500">
            <tr>{["Option", "Sale date", "Sale value", "Net proceeds", "Cash-out", "Forward IRR", "Forward multiple", "Spread to hurdle", `NPV vs selling (${pct(hurdle, 2)})`, "Total IRR", "Total multiple", "Breakeven exit cap"].map((h) => <th key={h} className={`px-2.5 py-2 font-medium ${h === "Option" ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const spread = o.forwardIrr - hurdle;
              const best = o.key === a.best.key;
              return (
                <tr key={o.key} className={`border-t border-gray-100 ${best ? "bg-emerald-50/60" : ""}`}>
                  <td className="px-2.5 py-1.5 font-medium">{o.label}{best && <span className="ml-1 rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-800">suggested</span>}{o.beyondTerm && <span className="ml-1 text-[10px] text-amber-700">extension</span>}</td>
                  <td className="px-2.5 py-1.5 text-right">{fmtDate(o.exitDate)}</td>
                  <td className="px-2.5 py-1.5 text-right">{m(o.value)}</td>
                  <td className="px-2.5 py-1.5 text-right">{m(o.proceeds)}</td>
                  <td className="px-2.5 py-1.5 text-right">{o.cashOut ? m(o.cashOut) : "—"}</td>
                  <td className="px-2.5 py-1.5 text-right">{o.key === "sell" ? "—" : pct(o.forwardIrr)}</td>
                  <td className="px-2.5 py-1.5 text-right" title="Cash from the decision date on ÷ equity left in (net proceeds now less any cash-out)">{o.key === "sell" ? "—" : x(o.forwardMultiple)}</td>
                  <td className={`px-2.5 py-1.5 text-right ${!isFinite(spread) || o.key === "sell" ? "text-gray-400" : spread >= 0 ? "text-emerald-700" : "text-red-600"}`}>{o.key === "sell" || !isFinite(spread) ? "—" : `${spread >= 0 ? "+" : ""}${spread.toFixed(1)} pts`}</td>
                  <td className={`px-2.5 py-1.5 text-right font-semibold ${o.npv > 0 ? "text-emerald-700" : o.npv < 0 ? "text-red-600" : "text-gray-500"}`}>{o.key === "sell" ? "—" : m(o.npv)}</td>
                  <td className="px-2.5 py-1.5 text-right">{pct(o.totalIrr)}</td>
                  <td className="px-2.5 py-1.5 text-right">{x(o.totalMultiple)}</td>
                  <td className="px-2.5 py-1.5 text-right">{o.key === "sell" ? "—" : pct(o.breakevenCap, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-3"><p className="mb-1 text-xs font-semibold text-gray-700">Forward IRR by sale year (hold)</p><Bars options={a.holds} /></div>
        <div className="rounded-xl border border-gray-200 bg-white p-3"><p className="mb-1 text-xs font-semibold text-gray-700">Forward IRR by sale year (refinance &amp; hold)</p><Bars options={a.refis} /></div>
      </div>
    </div>
  );
}

export { DECISIONS, decisionLabel };
