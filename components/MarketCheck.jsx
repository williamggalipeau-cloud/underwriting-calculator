"use client";

// Version 1.1 (user, 11/25): assumptions next to the submarket's figures in
// Market Data, flagged at the portfolio's levels (lib/marketCheck.js).
import { gapLabel, levelLabel, statusText } from "@/lib/marketCheck";

const fmt = (kind, v) => (v == null ? "—" : kind === "rent" ? `$${Number(v).toFixed(2)}` : `${Number(v).toFixed(2)}%`);
const CLS = { ok: "border-emerald-200 bg-emerald-50 text-emerald-800", amber: "border-amber-200 bg-amber-50 text-amber-800", red: "border-red-200 bg-red-50 text-red-800", none: "border-gray-200 bg-gray-50 text-gray-600" };
export const StatusChip = ({ r }) => <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${CLS[r.status]}`}>{r.status === "amber" || r.status === "red" ? "⚠ " : r.status === "ok" ? "✓ " : ""}{statusText(r)}</span>;

// One asset: a small table. check: marketCheck(); valueLabel: "This mark" / "Plan".
export default function MarketCheck({ check, title = "Market check", valueLabel = "This mark", testId = "market-check" }) {
  if (!check) return null;
  if (!check.submarket) {
    return <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500" data-testid={testId}>{title}: tag this asset to a submarket (Research → Market Data) to compare it with the market.</p>;
  }
  return (
    <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid={testId}>
      <p className="font-semibold text-gray-900">{title} <span className="font-normal text-gray-500">· vs. {check.submarket.name}{check.quarter ? `, ${check.quarter.replace("-", " ")}` : ""}{check.source ? ` (${check.source}${check.sourceDate ? `, ${check.sourceDate}` : ""})` : ""}</span></p>
      <table className="w-full tabular-nums">
        <thead className="text-[10px] text-gray-500"><tr><th className="py-1 text-left">Assumption</th><th className="text-right">{valueLabel}</th><th className="text-right">Market</th><th className="text-right">Difference</th><th className="text-right">Flag at</th><th className="pl-2 text-left">Status</th></tr></thead>
        <tbody>{check.rows.map((r) => (
          <tr key={r.kind} className="border-t border-gray-100" data-testid="market-check-row">
            <td className="py-1">{r.label}</td>
            <td className="text-right">{fmt(r.kind, r.asset)}</td>
            <td className="text-right">{fmt(r.kind, r.market)}</td>
            <td className="text-right">{gapLabel(r)}</td>
            <td className="text-right text-gray-500">{levelLabel(r)}</td>
            <td className="pl-2"><StatusChip r={r} /></td>
          </tr>
        ))}</tbody>
      </table>
      <p className="text-[10px] text-gray-500">Amber past the portfolio&apos;s flag level, red past {check.redMultiple ?? 1.5}× it. The levels are on the portfolio&apos;s terms (Edit fund / JV / SMA → Market check flag levels).</p>
    </div>
  );
}
