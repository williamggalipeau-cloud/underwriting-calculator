"use client";

import { useMemo, useState } from "react";
import { DATE_KINDS, RISK_TYPES, criticalDateRows, criticalDates, riskFlagRows, riskFlags } from "@/lib/leaseViews";
import { writeXlsx } from "@/lib/xlsx";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";

const fmtISO = (iso) => {
  if (!iso) return "On request";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
};
const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const SEV_STYLE = { high: "border-red-200 bg-red-50 text-red-800", medium: "border-amber-200 bg-amber-50 text-amber-800", low: "border-gray-200 bg-gray-50 text-gray-700" };
const ROW_STYLE = { past: "bg-red-50/70 text-red-900", soon: "bg-amber-50/80", later: "", standing: "text-gray-500" };
const STATUS_BADGE = { past: ["Past", "bg-red-100 text-red-800"], soon: ["≤ 90 days", "bg-amber-100 text-amber-800"], later: ["", ""], standing: ["On request", "bg-gray-100 text-gray-600"] };

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-900" aria-label={label}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// Every deadline from the abstracts (plus financial statements due, for
// owners and editors), oldest first: red when past, amber within 90 days.
export function CriticalDatesView({ leases, assetName, title, asOf, credit, docs, onReport }) {
  const [asset, setAsset] = useState("all");
  const [kind, setKind] = useState("all");
  const [show, setShow] = useState("upcoming"); // upcoming | all
  const all = useMemo(() => criticalDates(leases, { assetName, asOf, credit, docs }), [leases, assetName, asOf, credit, docs]);
  const assets = [...new Set(all.map((r) => r.asset))].sort();
  const kinds = [...new Set(all.map((r) => r.kind))];
  const rows = all.filter((r) => (asset === "all" || r.asset === asset) && (kind === "all" || r.kind === kind) && (show === "all" || r.status !== "past" || r.days >= -365));
  const shown = show === "all" ? rows : rows.filter((r) => !["lease_date", "commencement", "rent_commencement"].includes(r.kind) && (r.status !== "past" || r.days >= -90));
  const counts = { past: shown.filter((r) => r.status === "past").length, soon: shown.filter((r) => r.status === "soon").length };
  const exportXlsx = async () => downloadBlob(await writeXlsx(criticalDateRows(shown), { sheetName: "Critical dates", colWidths: [11, 14, 7, 24, 28, 22, 34, 30, 40, 10, 34, 50, 6] }), `${safeFileName(title)}-critical-dates.xlsx`);
  return (
    <div className="space-y-2" data-testid="critical-dates">
      <div className="flex flex-wrap items-center gap-3">
        {assets.length > 1 && <Select label="Asset" value={asset} onChange={setAsset} options={[["all", "All assets"], ...assets.map((a) => [a, a])]} />}
        <Select label="Type" value={kind} onChange={setKind} options={[["all", "All types"], ...kinds.map((k) => [k, DATE_KINDS[k] ?? k])]} />
        <Select label="Show" value={show} onChange={setShow} options={[["upcoming", "Upcoming and last 90 days"], ["all", "All dates, incl. history"]]} />
        <span className="text-xs text-gray-500">{shown.length} dates · <span className="text-red-700">{counts.past} past</span> · <span className="text-amber-700">{counts.soon} within 90 days</span></span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportXlsx} disabled={!shown.length} className={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>Export to Excel</button>
          <button type="button" onClick={onReport} className={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>Abstraction report (PDF)</button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500">No critical dates: abstract a lease or review a document to see its deadlines here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>{["Date", "", "Asset", "Tenant", "Event", "Notice", "Action", "Clause"].map((h, i) => <th key={i} className="px-2.5 py-1.5 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const [badge, bs] = STATUS_BADGE[r.status];
                return (
                  <tr key={i} className={`border-t border-gray-100 align-top ${ROW_STYLE[r.status]}`} data-status={r.status}>
                    <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{fmtISO(r.date)}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">
                      {badge && <span className={`rounded px-1 py-px text-[10px] font-medium ${bs}`}>{badge}</span>}
                      {isFinite(r.days) && r.status !== "standing" && <span className="ml-1 text-[10px] text-gray-500">{r.days < 0 ? `${-r.days}d ago` : `in ${r.days}d`}</span>}
                    </td>
                    <td className="px-2.5 py-1.5">{r.asset}</td>
                    <td className="px-2.5 py-1.5">{r.tenant}</td>
                    <td className="px-2.5 py-1.5 font-medium">
                      {r.label}
                      <span className="ml-1 text-[10px] font-normal text-gray-400">{r.kindLabel}</span>
                      {r.calculation && <p className="text-[10px] font-normal text-blue-700">= {r.calculation}</p>}
                    </td>
                    <td className="px-2.5 py-1.5">{r.notice || "—"}</td>
                    <td className="px-2.5 py-1.5">{r.action || "—"}</td>
                    <td className="px-2.5 py-1.5 text-[11px] text-gray-500" title={r.quote}>{r.clause ? `§ ${r.clause}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        Dates come from each lease&apos;s abstract and each reviewed document on the Documents tab (calculated dates show their arithmetic; insurance turns amber 60 days before expiry); SNDA and estoppel response periods run from a request, so they have no date.
        {credit ? " Financial statements due come from lease clauses requiring statements and the statements on file under Tenant credit." : ""}{" "}
        Reminders: nothing is sent from the app. A Claude scheduled task could check these dates weekly and notify you before notice deadlines; ask Claude to set one up if you want it.
      </p>
    </div>
  );
}

// Every risk flag with its clause and quote, most severe first.
export function RiskFlagsView({ leases, assetName, title, onReport }) {
  const [asset, setAsset] = useState("all");
  const [type, setType] = useState("all");
  const [sev, setSev] = useState("all");
  const all = useMemo(() => riskFlags(leases, { assetName }), [leases, assetName]);
  const assets = [...new Set(all.map((r) => r.asset))].sort();
  const types = RISK_TYPES.filter(([k]) => all.some((r) => r.type === k));
  const rows = all.filter((r) => (asset === "all" || r.asset === asset) && (type === "all" || r.type === type) && (sev === "all" || r.severity === sev));
  const exportXlsx = async () => downloadBlob(await writeXlsx(riskFlagRows(rows), { sheetName: "Risk flags", colWidths: [9, 20, 24, 28, 30, 60, 10, 60, 6] }), `${safeFileName(title)}-risk-flags.xlsx`);
  return (
    <div className="space-y-2" data-testid="risk-flags">
      <div className="flex flex-wrap items-center gap-3">
        {assets.length > 1 && <Select label="Asset" value={asset} onChange={setAsset} options={[["all", "All assets"], ...assets.map((a) => [a, a])]} />}
        <Select label="Type" value={type} onChange={setType} options={[["all", "All types"], ...types.map(([k, l]) => [k, l])]} />
        <Select label="Severity" value={sev} onChange={setSev} options={[["all", "All"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]]} />
        <span className="text-xs text-gray-500">{rows.length} flag{rows.length === 1 ? "" : "s"} · {rows.filter((r) => r.severity === "high").length} high</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportXlsx} disabled={!rows.length} className={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>Export to Excel</button>
          <button type="button" onClick={onReport} className={`${btn} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>Abstraction report (PDF)</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500">No risk flags.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${SEV_STYLE[r.severity] ?? SEV_STYLE.low}`} data-testid="risk-row">
              <p className="font-semibold">
                <span className="mr-1.5 rounded bg-white/70 px-1 text-[10px] uppercase">{r.severity}</span>
                {r.title}
                <span className="ml-2 font-normal opacity-80">{r.asset} · {r.tenant}</span>
                {r.clause && <span className="ml-1 text-[10px] font-normal opacity-70">§ {r.clause}</span>}
                <span className="ml-2 rounded bg-white/60 px-1 text-[10px] font-normal">{r.typeLabel}</span>
              </p>
              <p className="text-[11px]">{r.detail}</p>
              {r.quote && <p className="text-[11px] italic opacity-80">“{r.quote}”{r.page ? ` (p. ${r.page})` : ""}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
