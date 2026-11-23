"use client";

// Phase K: Fund Plan tab (Portfolio Management, before Fund Return). The
// fund's plan, frozen from the fund model, against what the fund has done
// (LP capital called and distributed, assets bought, NAV from the Valuation
// tab) and against the current forecast (the fund model as it stands now).
import { useMemo, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { fundOptionLabel } from "@/lib/fundTypes";
import { fundValuation, quarterLabel } from "@/lib/valuations";
import { quarterKey } from "@/lib/fundTimeline";
import { writeXlsx } from "@/lib/xlsx";
import {
  actualQuartersFromValuation,
  addPlanVersion,
  freezePlan,
  fundPlanXlsx,
  fundProjection,
  planAttribution,
  planCompare,
  planQuarters,
} from "@/lib/fundPlan";
import FundTypeBadge from "@/components/FundTypeBadge";

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${Math.round(a).toLocaleString("en-US")}`;
  return n < 0 ? `(${s})` : s;
};
const fmt = (v, unit) => (v == null || !isFinite(v) ? "—" : unit === "$" ? fmtM(v) : unit === "%" ? `${v.toFixed(1)}%` : unit === "x" ? `${v.toFixed(2)}x` : Math.round(v).toLocaleString("en-US"));
const fmtD = (v, unit) => {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) < 1e-9) return unit === "%" ? "0.0 pts" : unit === "x" ? "0.00x" : unit === "$" ? "$0" : "0";
  const s = v > 0 ? "+" : "−";
  const a = Math.abs(v);
  return unit === "$" ? `${s}${fmtM(a)}` : unit === "%" ? `${s}${a.toFixed(1)} pts` : unit === "x" ? `${s}${a.toFixed(2)}x` : `${s}${Math.round(a)}`;
};
const tone = (v) => (v == null || !isFinite(v) || Math.abs(v) < 1e-9 ? "text-gray-400" : v > 0 ? "text-emerald-700" : "text-red-600");
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const today = () => new Date().toISOString().slice(0, 10);
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const th = "px-2.5 py-2 font-medium";
const td = "px-2.5 py-1.5";

// Cumulative LP capital called and distributed: plan (dashed), actual
// (solid), current forecast (light).
function PlanChart({ rows }) {
  if (!rows.length) return null;
  const W = 720, H = 180, L = 56, B = 22;
  let cf = 0, df = 0;
  const pts = rows.map((r) => { cf += r.forecastCalled; df += r.forecastDistributed; return { ...r, cumFc: cf, cumFd: df }; });
  const max = Math.max(1, ...pts.flatMap((p) => [p.cumPlanCalled, p.cumPlanDistributed, p.cumFc, p.cumFd, p.cumActualCalled ?? 0, p.cumActualDistributed ?? 0]));
  const x = (i) => L + (i / Math.max(1, pts.length - 1)) * (W - L - 8);
  const y = (v) => H - B - (v / max) * (H - B - 8);
  const line = (k) => pts.map((p, i) => (p[k] == null ? null : `${x(i)},${y(p[k])}`)).filter(Boolean).join(" ");
  const series = [
    ["cumPlanCalled", "#2563eb", "5 4", "Plan called"],
    ["cumActualCalled", "#1d4ed8", "", "Actual called"],
    ["cumFc", "#93c5fd", "", "Forecast called"],
    ["cumPlanDistributed", "#059669", "5 4", "Plan distributed"],
    ["cumActualDistributed", "#047857", "", "Actual distributed"],
    ["cumFd", "#6ee7b7", "", "Forecast distributed"],
  ];
  return (
    <div className="overflow-x-auto" data-testid="plan-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Cumulative LP capital called and distributed: plan, actual and forecast">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - 8} y1={y(max * f)} y2={y(max * f)} stroke="#e5e7eb" />
            <text x={L - 6} y={y(max * f) + 3} textAnchor="end" fontSize="9" fill="#6b7280">{fmtM(max * f)}</text>
          </g>
        ))}
        {pts.map((p, i) => (i % Math.max(1, Math.ceil(pts.length / 8)) === 0 ? <text key={p.quarter} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6b7280">{p.quarter.replace("-", " ")}</text> : null))}
        {series.map(([k, c, dash]) => <polyline key={k} points={line(k)} fill="none" stroke={c} strokeWidth="1.8" strokeDasharray={dash} />)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-gray-500">
        {series.map(([k, c, dash, label]) => (
          <span key={k} className="flex items-center gap-1">
            <svg width="16" height="6"><line x1="0" x2="16" y1="3" y2="3" stroke={c} strokeWidth="2" strokeDasharray={dash} /></svg>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FundPlan({ deals, funds = {}, marks = {}, curve, canEdit, email, onFundTermsChange }) {
  const fundNames = useMemo(() => [...new Set(deals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))], [deals]);
  const [fundPick, setFundPick] = useState(null);
  const fundName = fundNames.includes(fundPick) ? fundPick : fundNames[0];
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fundName), [deals, fundName]);
  const terms = useMemo(() => ({ ...DEFAULT_FUND_TERMS, ...(funds[fundName] ?? {}), name: fundName }), [funds, fundName]);
  const asOfToday = today();
  const current = useMemo(() => (fundName ? fundProjection(fundDeals, terms, { todayISO: asOfToday, curve }) : null), [fundName, fundDeals, terms, asOfToday, curve]);
  const val = useMemo(() => (fundName ? fundValuation(fundDeals, marks, terms, { todayISO: asOfToday, curve }) : null), [fundName, fundDeals, marks, terms, asOfToday, curve]);
  const versions = terms.fundPlan?.versions ?? [];
  const [vPick, setVPick] = useState(null);
  const plan = versions.find((v) => v.v === vPick) ?? versions[0] ?? null;
  const [note, setNote] = useState("");
  const [showQuarters, setShowQuarters] = useState(false);
  const targets = terms.fundPlanTargets ?? {};

  if (!fundName) {
    return <p className="text-sm text-gray-500">Put deals in a fund (Fund field) to plan the fund here.</p>;
  }

  const lastQ = val?.quarters.at(-1) ?? null;
  const asOf = lastQ?.quarterEnd ?? asOfToday;
  const actualQs = actualQuartersFromValuation(val?.quarters ?? []);
  const bought = (current?.assets ?? []).filter((a) => a.acq <= asOf);
  const actual = lastQ && !lastQ.net?.nm
    ? { called: lastQ.net.contrib, distributed: lastQ.net.dist, nav: lastQ.net.lpNav, deployed: bought.reduce((s, a) => s + a.equity, 0), acquired: bought.length }
    : { called: 0, distributed: 0, nav: lastQ?.net?.lpNav ?? null, deployed: bought.reduce((s, a) => s + a.equity, 0), acquired: bought.length };
  const tgt = { netIrr: targets.netIrrPct ?? null, tvpi: targets.netMultiple ?? null, grossIrr: targets.grossIrrPct ?? null };

  const freeze = () => {
    if (!canEdit || !current) return;
    const first = versions.length === 0;
    const label = first ? "Original plan" : `Re-forecast ${versions.length}`;
    if (!window.confirm(first ? "Freeze the fund model as it stands as the fund's original plan? It is kept as it is; later changes to deals don't change it." : `Save the fund model as it stands as "${label}"? The original plan and earlier re-forecasts stay.`)) return;
    const p = freezePlan(current, { label, by: email ?? "", note: note.trim() });
    const next = addPlanVersion(terms.fundPlan, p);
    onFundTermsChange(fundName, { fundPlan: next });
    setVPick(next.versions.at(-1).v);
    setNote("");
  };
  const setTarget = (k, v) => canEdit && onFundTermsChange(fundName, { fundPlanTargets: { ...targets, [k]: v === "" ? null : Number(v) } });

  const cmp = plan ? planCompare(plan, current, actual, asOf, tgt) : null;
  const qRows = plan ? planQuarters(plan, current, actualQs) : [];
  const attr = plan ? planAttribution(plan, current) : null;
  const fileBase = `${safeFileName(fundName)}-fund-plan`;

  return (
    <section className="space-y-4" data-testid="fund-plan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            Fund Plan <span className="text-sm font-normal text-gray-500">· {fundName}</span>
            <FundTypeBadge type={funds[fundName]?.type} />
          </h2>
          <p className="text-xs text-gray-500">
            The fund&apos;s plan, frozen from the fund model, against what the fund has done (actuals through {quarterLabel(asOf)}, from capital activity and the Valuation tab) and the current forecast (the fund model today).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fundNames.length > 1 && (
            <select aria-label="Fund" value={fundName} onChange={(e) => { setFundPick(e.target.value); setVPick(null); }} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {fundNames.map((n) => <option key={n} value={n}>{fundOptionLabel(n, funds)}</option>)}
            </select>
          )}
          {versions.length > 0 && (
            <select aria-label="Plan version" value={plan?.v ?? ""} onChange={(e) => setVPick(Number(e.target.value))} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {versions.map((v) => <option key={v.v} value={v.v}>{`v${v.v} · ${v.label} · ${usDate(String(v.at).slice(0, 10))}`}</option>)}
            </select>
          )}
          {plan && (
            <>
              <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => downloadBlob(writeXlsx(fundPlanXlsx(fundName, plan, cmp, qRows, attr), { sheetName: "Fund plan", title: `Baywise · ${fundName} fund plan vs. actual` }), `${fileBase}.xlsx`)}>Excel</button>
              <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={async () => { const { fundPlanPdf } = await import("@/lib/fundPlanPdf"); downloadBlob(await fundPlanPdf(fundName, plan, cmp, qRows, attr, { asOf, type: funds[fundName]?.type }), `${fileBase}-report.pdf`); }}>PDF report</button>
            </>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs" data-testid="plan-freeze">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={versions.length ? "Why re-forecast? (optional)" : "Note (optional), e.g. Final close model"} className="min-w-[220px] flex-1 rounded border border-gray-300 bg-white px-2 py-1" />
          <button type="button" onClick={freeze} className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700">
            {versions.length ? "Save a re-forecast" : "Freeze the original plan"}
          </button>
          <span className="text-gray-500">{versions.length ? `${versions.length} version${versions.length > 1 ? "s" : ""} kept; the original never changes.` : "Freezes the fund model as it stands today."}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs" data-testid="plan-targets">
        <span className="font-medium text-gray-700">Targets</span>
        {[
          ["netIrrPct", "Net LP IRR %"],
          ["netMultiple", "Net LP multiple x"],
          ["grossIrrPct", "Gross IRR %"],
        ].map(([k, l]) => (
          <label key={k} className="flex items-center gap-1">
            <span className="text-gray-500">{l}</span>
            <input aria-label={l} type="number" step="0.1" disabled={!canEdit} value={targets[k] ?? ""} onChange={(e) => setTarget(k, e.target.value)} className="w-20 rounded border border-gray-300 px-1.5 py-1 text-right" />
          </label>
        ))}
      </div>

      {!plan ? (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600" data-testid="no-plan">
          <p className="font-medium text-gray-800">No plan frozen yet.</p>
          <p className="mt-1 text-xs">
            Freeze the fund model (usually the final close model) as the original plan. Then this tab tracks capital called, deployment, distributions, NAV and projected returns against it.
            Today&apos;s forecast: net LP IRR {fmt(current?.returns.netLpIrr, "%")}, net LP multiple {fmt(current?.returns.netLpTvpi, "x")}, gross IRR {fmt(current?.returns.grossIrr, "%")}, GP promote {fmtM(current?.returns.gpPromote)}.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500" data-testid="plan-meta">
            Comparing against <span className="font-medium text-gray-700">v{plan.v} · {plan.label}</span>, frozen {usDate(String(plan.at).slice(0, 10))}{plan.by ? ` by ${plan.by}` : ""}{plan.note ? ` (“${plan.note}”)` : ""}.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="plan-to-date">
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>{[`Since inception · ${quarterLabel(asOf)}`, "Plan", "Actual", "Variance"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {cmp.toDate.map((r) => (
                    <tr key={r.key} className="border-t border-gray-100">
                      <td className={td}>{r.label}</td>
                      <td className={`${td} text-right`}>{fmt(r.plan, r.unit)}</td>
                      <td className={`${td} text-right font-semibold`}>{fmt(r.actual, r.unit)}</td>
                      <td className={`${td} text-right ${tone(r.variance)}`}>{fmtD(r.variance, r.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="plan-returns">
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>{["Projected (life of fund)", "Plan", "Forecast", "Change", "Target"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {cmp.projected.map((r) => {
                    const below = r.target != null && r.current != null && r.current < r.target;
                    return (
                      <tr key={r.key} className="border-t border-gray-100">
                        <td className={td}>{r.label}</td>
                        <td className={`${td} text-right`}>{fmt(r.plan, r.unit)}</td>
                        <td className={`${td} text-right font-semibold ${below ? "text-red-600" : ""}`} title={below ? `Below the target of ${fmt(r.target, r.unit)}` : undefined}>{fmt(r.current, r.unit)}</td>
                        <td className={`${td} text-right ${tone(r.variance)}`}>{fmtD(r.variance, r.unit)}</td>
                        <td className={`${td} text-right text-gray-500`}>{fmt(r.target, r.unit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">LP capital called and distributed, cumulative</h3>
            <PlanChart rows={qRows} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="plan-causes">
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500">
                  <tr><th className={`${th} text-left`}>Change in projected net profit, by cause</th><th className={`${th} text-right`}>Change</th></tr>
                </thead>
                <tbody>
                  {attr.causes.map((c) => (
                    <tr key={c.key} className="border-t border-gray-100"><td className={td}>{c.label}</td><td className={`${td} text-right ${tone(c.delta)}`}>{fmtD(c.delta, "$")}</td></tr>
                  ))}
                  <tr className="border-t border-gray-200 font-semibold"><td className={td}>Total (forecast − plan)</td><td className={`${td} text-right ${tone(attr.total)}`}>{fmtD(attr.total, "$")}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="plan-assets">
              <table className="w-full text-xs tabular-nums">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>{["By asset", "Plan profit", "Forecast profit", "Change", "IRR plan → now"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {attr.byAsset.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className={td}>
                        {r.name}
                        {r.status !== "in plan" && <span className={`ml-1.5 rounded px-1 py-0.5 text-[10px] ${r.status === "added" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{r.status === "added" ? "not in plan" : "dropped"}</span>}
                      </td>
                      <td className={`${td} text-right`}>{fmtM(r.planProfit)}</td>
                      <td className={`${td} text-right`}>{fmtM(r.currentProfit)}</td>
                      <td className={`${td} text-right ${tone(r.delta)}`}>{fmtD(r.delta, "$")}</td>
                      <td className={`${td} text-right text-gray-600`}>{fmt(r.planIrr, "%")} → {fmt(r.currentIrr, "%")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="plan-years">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500">
                <tr>{["Year", "Fund NOI plan", "Fund NOI forecast", "LP cash yield plan", "LP cash yield forecast"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {[...new Set([...plan.years.map((y) => y.year), ...current.years.map((y) => y.year)])].sort().map((y) => {
                  const p = plan.years.find((r) => r.year === y), c = current.years.find((r) => r.year === y);
                  return (
                    <tr key={y} className="border-t border-gray-100">
                      <td className={td}>{y}</td>
                      <td className={`${td} text-right`}>{fmtM(p?.noi)}</td>
                      <td className={`${td} text-right`}>{fmtM(c?.noi)}</td>
                      <td className={`${td} text-right`}>{fmt(p?.cashYield, "%")}</td>
                      <td className={`${td} text-right`}>{fmt(c?.cashYield, "%")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-gray-200">
            <button type="button" onClick={() => setShowQuarters((s) => !s)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-gray-800" aria-expanded={showQuarters}>
              By quarter: called, distributed and deployed <span className="text-xs font-normal text-gray-500">{showQuarters ? "Hide" : `Show ${qRows.length} quarters`}</span>
            </button>
            {showQuarters && (
              <div className="overflow-x-auto" data-testid="plan-quarters">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>{["Quarter", "Called plan", "Called actual", "Called forecast", "Distributed plan", "Distributed actual", "Distributed forecast", "Deployed plan", "Deployed forecast"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {qRows.map((q) => (
                      <tr key={q.quarter} className={`border-t border-gray-100 ${q.quarter === quarterKey(asOf) ? "bg-blue-50/50" : ""}`}>
                        <td className={td}>{q.quarter.replace("-", " ")}</td>
                        <td className={`${td} text-right`}>{fmtM(q.planCalled)}</td>
                        <td className={`${td} text-right font-medium`}>{q.actualCalled == null ? "" : fmtM(q.actualCalled)}</td>
                        <td className={`${td} text-right text-gray-500`}>{fmtM(q.forecastCalled)}</td>
                        <td className={`${td} text-right`}>{fmtM(q.planDistributed)}</td>
                        <td className={`${td} text-right font-medium`}>{q.actualDistributed == null ? "" : fmtM(q.actualDistributed)}</td>
                        <td className={`${td} text-right text-gray-500`}>{fmtM(q.forecastDistributed)}</td>
                        <td className={`${td} text-right`}>{fmtM(q.planDeployed)}</td>
                        <td className={`${td} text-right text-gray-500`}>{fmtM(q.forecastDeployed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-[11px] leading-snug text-gray-400">
            LP figures. Actual capital called and distributed come from capital activity when it has been entered (otherwise the model to date), as on the Valuation tab; NAV is the latest quarter&apos;s LP NAV. The plan has no NAV of its own, so NAV and interim TVPI show actuals only.
            The cause split is an estimate: pricing is the change in purchase price on plan assets; operations, financing and exits is the rest of their change; fees, fund expenses and the sub line is the change in net profit the assets&apos; gross profit doesn&apos;t explain. GP promote = GP distributions above its pro-rata share.
          </p>
        </>
      )}
    </section>
  );
}
