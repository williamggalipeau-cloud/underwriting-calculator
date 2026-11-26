"use client";

// Phase J: underwritten vs. actual + projected performance, per asset
// (Asset Summary → Details) and for the whole fund (Portfolio Return).
import { useMemo } from "react";
import { RETURN_METRICS, YEAR_METRICS, attribution, compare, compareRows, freezeBaseline, fundRows, fundRowsXlsx } from "@/lib/uwActual";
import { writeXlsx } from "@/lib/xlsx";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";

const today = () => new Date().toISOString().slice(0, 10);
const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${Math.round(a)}`;
  return n < 0 ? `(${s})` : s;
};
const fmtV = (v, unit) => (v == null || !isFinite(v) ? "—" : unit === "$" ? fmtM(v) : unit === "%" ? `${v.toFixed(2)}%` : `${v.toFixed(2)}x`);
const fmtD = (v, unit) => (v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${unit === "$" ? fmtM(Math.abs(v)) : unit === "%" ? `${Math.abs(v).toFixed(2)} pts` : `${Math.abs(v).toFixed(2)}x`}`);
const tone = (v, better = 1) => (!isFinite(v) || Math.abs(v) < 1e-9 ? "text-gray-500" : v * better > 0 ? "text-emerald-700" : "text-red-600");
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium";

// For every year metric a higher value is better except capital (a cost, already negative).
export default function UwVsActual({ deal, canEdit, email, onApplyDeal }) {
  const inputs = deal.inputs;
  const b = inputs.uwBaseline;
  const asOf = today();
  const data = useMemo(() => {
    if (!b?.inputs) return null;
    try {
      return { c: compare(b, inputs, asOf), attr: attribution(b, inputs, asOf) };
    } catch (e) {
      return { error: e.message };
    }
  }, [b, inputs, asOf]);
  const name = inputs.propertyName || "This asset";

  const freeze = (replace) => {
    if (replace && !window.confirm("Replace the frozen underwriting baseline with today's model? The comparison then starts again from today.")) return;
    const nb = freezeBaseline(inputs, { by: email ?? "" });
    onApplyDeal(deal.id, (inp) => ({ ...inp, uwBaseline: nb }), [{ key: "uwBaseline", field: "Underwriting baseline", from: b ? `frozen ${b.at.slice(0, 10)}` : "", to: `frozen ${nb.at.slice(0, 10)}` }], "Underwriting baseline");
  };

  if (!b?.inputs) {
    return (
      <section className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-xs text-gray-600" data-testid="uw-vs-actual">
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Underwritten vs. actual</h4>
        <p>No underwriting baseline yet. Freezing one keeps a copy of the model as underwritten (do it at closing{inputs.icApproved ? "; the IC-approved figures are on this deal" : ""}); actuals from the Asset Business Plan and the current model are then compared with it.</p>
        {canEdit && onApplyDeal && <button type="button" onClick={() => freeze(false)} className={`${btn} mt-2 border-blue-600 bg-blue-600 text-white`}>Freeze underwriting baseline</button>}
      </section>
    );
  }
  if (data?.error) return <p className="text-xs text-red-600" data-testid="uw-vs-actual">Underwritten vs. actual couldn&apos;t be calculated: {data.error}</p>;
  const { c, attr } = data;
  const maxAbs = Math.max(0.01, ...attr.rows.map((r) => Math.abs(r.delta)));

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 px-3 py-3" data-testid="uw-vs-actual">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Underwritten vs. actual + projected</h4>
          <p className="text-[11px] text-gray-500">
            Baseline frozen {usDate(b.at.slice(0, 10))}{b.by ? ` by ${b.by}` : ""} ({b.source === "ic" ? "with the IC-approved figures on the deal" : "closing model"}). Actuals: {c.actual.actualMonths} months of NOI from the Asset Business Plan; the rest from today&apos;s model.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => downloadBlob(writeXlsx(compareRows(name, c, attr), { sheetName: "Underwritten vs actual", title: `Baywise · ${name} underwritten vs. actual` }), `${safeFileName(name)}-underwritten-vs-actual.xlsx`)}>Excel</button>
          <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={async () => { const { uwActualPdf } = await import("@/lib/uwActualPdf"); downloadBlob(await uwActualPdf(name, b, c, attr, { asOf }), `${safeFileName(name)}-asset-management-report.pdf`); }}>PDF report</button>
          {canEdit && onApplyDeal && <button type="button" className={`${btn} border-gray-300 bg-white text-gray-500`} onClick={() => freeze(true)}>Replace baseline</button>}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
        <table className="w-full text-xs tabular-nums" data-testid="uw-returns">
          <thead className="text-gray-500"><tr className="border-b border-gray-200"><th className="py-1 text-left font-medium">Return</th><th className="py-1 text-right font-medium">Underwritten</th><th className="py-1 text-right font-medium">Actual + projected</th><th className="py-1 text-right font-medium">Variance</th></tr></thead>
          <tbody>
            {RETURN_METRICS.map(([k, l, unit]) => {
              const m = c.returns[k];
              const better = k === "exitCap" || k === "totalCost" ? -1 : 1;
              return (
                <tr key={k} className="border-b border-gray-100">
                  <td className="py-1">{l}</td>
                  <td className="py-1 text-right">{fmtV(m.u, unit)}</td>
                  <td className="py-1 text-right font-medium">{fmtV(m.a, unit)}</td>
                  <td className={`py-1 text-right ${k === "loan" ? "text-gray-500" : tone(m.v, better)}`}>{fmtD(m.v, unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div data-testid="uw-attribution">
          <p className="mb-1 text-xs font-medium text-gray-700">Levered IRR gap: <span className={tone(attr.gap)}>{fmtD(attr.gap, "%")}</span> ({fmtV(attr.startIrr, "%")} → {fmtV(attr.endIrr, "%")}), by cause</p>
          <ul className="space-y-1 text-xs">
            {attr.rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[13rem_1fr_4.5rem] items-center gap-2" title={r.changed.length ? `Changed: ${r.changed.join(", ")}` : "No change"}>
                <span className="truncate text-gray-600">{r.label}</span>
                <span className="relative h-2.5 rounded bg-gray-100">
                  <span className={`absolute top-0 h-2.5 rounded ${r.delta < 0 ? "right-1/2 bg-red-400" : "left-1/2 bg-emerald-500"}`} style={{ width: `${(Math.abs(r.delta) / maxAbs) * 50}%` }} />
                  <span className="absolute left-1/2 top-[-2px] h-3.5 w-px bg-gray-300" />
                </span>
                <span className={`text-right tabular-nums ${tone(r.delta)}`}>{fmtD(r.delta, "%")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-gray-500">Each group of inputs is switched from the baseline to today&apos;s values in turn (price, leasing, expenses, capex, financing, timing, exit) and the change in IRR credited to it; operations to date is actual NOI vs. the model.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums" data-testid="uw-years">
          <thead className="text-gray-500">
            <tr className="border-b border-gray-200">
              <th className="py-1 pr-2 text-left font-medium">By year</th>
              {c.years.map((y) => <th key={y.year} className="px-2 py-1 text-right font-medium whitespace-nowrap">Year {y.year}<div className="text-[9px] font-normal text-gray-500">{y.status}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {YEAR_METRICS.map(([k, l, unit]) => (
              <tr key={k} className="border-b border-gray-100 align-top">
                <td className="py-1 pr-2 text-gray-600 whitespace-nowrap">{l}<div className="text-[9px] text-gray-500">underwritten / actual + proj. / var.</div></td>
                {c.years.map((y) => {
                  const m = y.metrics[k];
                  return (
                    <td key={y.year} className="px-2 py-1 text-right whitespace-nowrap">
                      <div className="text-gray-500">{fmtV(m.u, unit)}</div>
                      <div className={y.status === "projected" ? "text-gray-700" : "font-semibold text-gray-900"}>{fmtV(m.a, unit)}</div>
                      <div className={`text-[10px] ${tone(m.v)}`}>{fmtD(m.v, unit)}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Whole fund: assets ranked by IRR gap (shortfall first).
export function FundUwTable({ deals, fundName, onOpen }) {
  const asOf = today();
  const rows = useMemo(() => fundRows(deals, asOf), [deals, asOf]);
  const without = deals.filter((d) => !d.inputs?.uwBaseline).length;
  if (!rows.length) {
    return (
      <p className="mb-4 rounded-xl border border-dashed border-gray-200 px-4 py-2 text-xs text-gray-500" data-testid="fund-uw">
        Underwritten vs. actual: no asset in {fundName} has a frozen underwriting baseline yet (Asset Summary → Details → Freeze underwriting baseline).
      </p>
    );
  }
  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3" data-testid="fund-uw">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Underwritten vs. actual + projected · {fundName}</h3>
        <div className="flex items-center gap-2 text-xs">
          {without > 0 && <span className="text-gray-500">{without} asset{without === 1 ? "" : "s"} without a baseline</span>}
          <button type="button" className={`${btn} border-gray-300 bg-white text-gray-700`} onClick={() => downloadBlob(writeXlsx(fundRowsXlsx(rows), { sheetName: "Underwritten vs actual", title: `Baywise · ${fundName} underwritten vs. actual` }), `${safeFileName(fundName)}-underwritten-vs-actual.xlsx`)}>Excel</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-gray-50 text-gray-500">
            <tr>{["Asset", "IRR underwritten", "IRR actual + proj.", "Gap", "Multiple uw. → act.", "Current year NOI uw. → act.", "NOI var.", "Months of actuals"].map((h, i) => <th key={h} className={`px-2 py-1.5 font-medium whitespace-nowrap ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100" data-testid="fund-uw-row">
                <td className="px-2 py-1.5 text-left">{onOpen ? <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => onOpen(r.id)}>{r.name}</button> : r.name}</td>
                <td className="px-2 py-1.5 text-right">{fmtV(r.uwIrr, "%")}</td>
                <td className="px-2 py-1.5 text-right font-medium">{fmtV(r.irr, "%")}</td>
                <td className={`px-2 py-1.5 text-right font-semibold ${tone(r.gap)}`}>{fmtD(r.gap, "%")}</td>
                <td className="px-2 py-1.5 text-right">{fmtV(r.uwEm, "x")} → {fmtV(r.em, "x")}</td>
                <td className="px-2 py-1.5 text-right">{fmtM(r.uwNoi)} → {fmtM(r.noi)} <span className="text-[10px] text-gray-500">yr {r.year} {r.status}</span></td>
                <td className={`px-2 py-1.5 text-right ${tone(r.noiVarPct)}`}>{isFinite(r.noiVarPct) ? `${r.noiVarPct > 0 ? "+" : ""}${r.noiVarPct.toFixed(1)}%` : "—"}</td>
                <td className="px-2 py-1.5 text-right text-gray-500">{r.actualMonths}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-gray-500">Ranked by IRR gap, largest shortfall first. Actual + projected = actual NOI to date (Asset Business Plan) and today&apos;s model for the rest of the hold.</p>
    </section>
  );
}
