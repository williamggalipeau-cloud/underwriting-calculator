"use client";

// Phase T: construction jobs (Yardi Construction Manager style upload) and TI
// spend by unit against the business plan. Used on Property Condition (with
// the upload) and on the Asset Business Plan (read-only summary).
import { useState } from "react";
import { capitalJobs, constructionXlsx, detectConstructionFile, importConstruction, parseInvoices, parseJobs, tiByUnit } from "@/lib/construction";
import { parseCSV, downloadBlob } from "@/lib/fundTerms";
import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";

const money = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Math.round(Number(v)).toLocaleString("en-US")}`);
const FLAG = { amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700" };

async function gridOf(file) {
  return file.name.toLowerCase().endsWith(".csv") ? parseCSV(await file.text()) : readXlsxGrid(await file.arrayBuffer());
}

export function TiByUnitTable({ inputs, compact = false }) {
  const t = tiByUnit(inputs);
  if (!t.rows.length) return compact ? null : <p className="text-xs text-gray-500">No TI planned or recorded by unit yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="ti-by-unit">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-gray-50 text-gray-500"><tr>{["Unit", "Tenant", "Plan", "Planned TI", "Job budget", "Committed", "Spent", "Remaining", "Over / (under)", "Status"].map((h) => <th key={h} className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{t.rows.map((r) => (
          <tr key={r.unitId} className="border-t border-gray-100" data-testid="ti-row">
            <td className="px-1.5 py-1 font-medium">{r.unit}</td><td className="px-1.5 py-1">{r.tenant}</td><td className="px-1.5 py-1 text-gray-500">{r.action}</td>
            <td className="px-1.5 py-1">{money(r.planned)}</td><td className="px-1.5 py-1">{money(r.budget)}</td><td className="px-1.5 py-1">{money(r.committed)}</td><td className="px-1.5 py-1 font-semibold">{money(r.spent)}</td><td className="px-1.5 py-1">{money(r.remaining)}</td>
            <td className="px-1.5 py-1">{r.overrunPct != null ? <span className={`rounded px-1 ${FLAG[r.flag] ?? ""}`} data-testid="ti-flag">{r.overrunPct >= 0 ? "+" : ""}{r.overrunPct.toFixed(1)}%</span> : "—"}</td><td className="px-1.5 py-1 text-gray-500">{r.status}</td>
          </tr>
        ))}
          <tr className="border-t border-gray-200 font-semibold"><td className="px-1.5 py-1" colSpan={3}>Total</td><td className="px-1.5 py-1">{money(t.totals.planned)}</td><td /><td className="px-1.5 py-1">{money(t.totals.committed)}</td><td className="px-1.5 py-1">{money(t.totals.spent)}</td><td colSpan={3} /></tr>
        </tbody>
      </table>
    </div>
  );
}

// Property Condition: upload, TI by unit, capital jobs. deals: the assets an upload may match.
export default function TiSpend({ deal, deals = [], canEdit = false, onUpdate }) {
  const [msg, setMsg] = useState(null);
  const cap = capitalJobs(deal.inputs);
  async function upload(files) {
    setMsg(null);
    try {
      const jobs = [], invoices = [];
      for (const f of files) {
        const g = await gridOf(f);
        const kind = detectConstructionFile(g);
        if (kind === "jobs") jobs.push(...parseJobs(g));
        else if (kind === "invoices") invoices.push(...parseInvoices(g));
        else throw new Error(`${f.name}: no job code / budget or invoice columns found.`);
      }
      const asOf = (String(files[0]?.name).match(/(\d{4}-\d{2})/)?.[1] ?? "");
      const r = importConstruction(deals, { jobs, invoices, asOf, source: "file" });
      for (const [id, c] of Object.entries(r.updates)) onUpdate(id, (cur) => ({ ...cur, construction: c }));
      setMsg(`Imported ${jobs.length} job${jobs.length === 1 ? "" : "s"} and ${invoices.length} invoice${invoices.length === 1 ? "" : "s"} into ${Object.keys(r.updates).length} asset${Object.keys(r.updates).length === 1 ? "" : "s"}${r.unmatched.length ? `; not matched to an asset: ${r.unmatched.join(", ")}` : ""}.`);
    } catch (e) { setMsg(e.message); }
  }
  return (
    <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-3" data-testid="construction">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Construction (Yardi Construction Manager) and TI spend by unit</h3>
        <div className="flex items-center gap-2 text-xs">
          {canEdit && <label className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium">Upload jobs / invoices<input type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" data-testid="construction-file" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) upload(fs); }} /></label>}
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(constructionXlsx(deals), { sheetName: "Construction" }), "construction-ti.xlsx")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium">Excel</button>
        </div>
      </div>
      <p className="text-[11px] text-gray-500">Upload the job summary and invoice detail exports (CSV or Excel; columns matched by name). Jobs match assets by property name or Yardi code and units by unit name; uploading again updates jobs by job code. A Yardi connection would pull these automatically later.{deal.inputs.construction?.asOf ? ` Last data: ${deal.inputs.construction.asOf}.` : ""}</p>
      {msg && <p role="status" className="text-xs text-gray-700" data-testid="construction-msg">{msg}</p>}
      <TiByUnitTable inputs={deal.inputs} />
      {cap.length > 0 && (
        <table className="w-full text-xs tabular-nums" data-testid="capital-jobs"><thead className="text-gray-500"><tr>{["Job", "Name", "Budget", "Committed", "Invoiced", "Paid", "Retainage", "Status", "Linked to"].map((h) => <th key={h} className="px-1.5 py-1 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>{cap.map((j) => <tr key={j.code} className="border-t border-gray-100"><td className="px-1.5 py-1">{j.code}</td><td className="px-1.5 py-1">{j.name}</td><td className="px-1.5 py-1">{money(j.revisedBudget)}</td><td className="px-1.5 py-1">{money(j.committed)}</td><td className="px-1.5 py-1">{money(j.invoiced)}</td><td className="px-1.5 py-1">{money(j.paid)}</td><td className="px-1.5 py-1">{money(j.retainage)}</td><td className="px-1.5 py-1">{j.status}</td><td className="px-1.5 py-1 text-gray-600">{j.finding ? `Finding: ${j.finding.system}` : j.contract ? `Contract: ${j.contract.vendor}` : <span className="text-gray-500">enter the job code on a finding or contract</span>}</td></tr>)}</tbody></table>
      )}
    </section>
  );
}
