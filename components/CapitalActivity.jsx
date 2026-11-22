"use client";

import { useRef, useState } from "react";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { ACTIVITY_TYPES, PURPOSES, activityFromFile, activityXlsx, newActivityId } from "@/lib/capitalActivity";

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`;
};
const total = (rows, type) => rows.filter((a) => a.type === type).reduce((s, a) => s + (Number(a.amount) || 0), 0);

// Ledger of actual capital calls and sub line draws / repayments for a fund.
export default function CapitalActivity({ fundName, activity = [], deals, otherAssets = [], onChange }) {
  // Every property in the workspace can be tagged: this fund's assets first,
  // then the rest (other funds, deals without a fund, saved copies).
  const allAssets = [...deals, ...otherAssets.filter((a) => !deals.some((d) => d.id === a.id))];
  const sortByName = (xs) => [...xs].sort((a, b) => (a.inputs?.propertyName || "").localeCompare(b.inputs?.propertyName || ""));
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...activity].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const update = (id, patch) => onChange(activity.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const drop = (id) => onChange(activity.filter((a) => a.id !== id));
  const add = () => onChange([...activity, { id: newActivityId(), date: today, type: "call", amount: 0, purpose: "other", notes: "" }]);

  async function handleFile(file) {
    try {
      const { rows, skipped } = await activityFromFile(file, allAssets);
      if (!rows.length) {
        setMsg({ ok: false, text: "No rows with a date and amount were found." });
        return;
      }
      const replace =
        activity.length > 0 &&
        window.confirm(`Replace the ${activity.length} existing entries with the ${rows.length} in the file? (Cancel adds them instead.)`);
      onChange(replace ? rows : [...activity, ...rows]);
      setMsg({
        ok: true,
        text: `Imported ${rows.length} entr${rows.length === 1 ? "y" : "ies"}${skipped ? `; ${skipped} row${skipped === 1 ? "" : "s"} skipped (no date, amount or type)` : ""}.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e.message || String(e) });
    }
  }

  const sel = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-xs font-semibold text-gray-700">Capital activity (actuals)</h5>
          <p className="text-[10px] text-gray-400">
            Enter each capital call and sub line draw or repayment as it happens. With entries, called capital and the line balance to date
            come from here; only needs after today come from the model.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button type="button" onClick={add} className="rounded-lg bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700">
            Add entry
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50">
            Import…
          </button>
          <button
            type="button"
            onClick={async () => downloadBlob(await activityXlsx(activity, allAssets), `${safeFileName(fundName)}-capital-activity.xlsx`)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50"
          >
            {activity.length ? "Export" : "Template"}
          </button>
        </div>
      </div>
      {msg && <p className={`mt-1 text-[11px] ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      {sorted.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-gray-500">
              <tr className="border-b border-gray-200">
                {["Date", "Type", "Amount ($)", "Purpose", "Notes", ""].map((h) => (
                  <th key={h} className="px-1.5 py-1 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} className={`border-b border-gray-100 ${a.date > today ? "opacity-60" : ""}`}>
                  <td className="px-1.5 py-1">
                    <input type="date" value={a.date} onChange={(e) => e.target.value && update(a.id, { date: e.target.value })} className={sel} aria-label="Date" />
                  </td>
                  <td className="px-1.5 py-1">
                    <select value={a.type} onChange={(e) => update(a.id, { type: e.target.value })} className={sel} aria-label="Type">
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      value={a.amount || ""}
                      placeholder="0"
                      onChange={(e) => update(a.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                      className={`${sel} w-32 text-right`}
                      aria-label="Amount"
                    />
                  </td>
                  <td className="px-1.5 py-1">
                    <select value={a.purpose ?? "other"} onChange={(e) => update(a.id, { purpose: e.target.value })} className={`${sel} max-w-[14rem]`} aria-label="Purpose">
                      <optgroup label={`Acquisition — ${fundName}`}>
                        {sortByName(deals).map((d) => (
                          <option key={d.id} value={`acq:${d.id}`}>{d.inputs?.propertyName || "Unnamed deal"}</option>
                        ))}
                      </optgroup>
                      {otherAssets.length > 0 && (
                        <optgroup label="Acquisition — other properties">
                          {sortByName(allAssets.slice(deals.length)).map((d) => (
                            <option key={d.id} value={`acq:${d.id}`}>
                              {d.inputs?.propertyName || "Unnamed deal"}
                              {d.inputs?.fundName?.trim() ? ` (${d.inputs.fundName.trim()})` : " (no fund)"}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Other">
                        {PURPOSES.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td className="px-1.5 py-1">
                    <input value={a.notes ?? ""} onChange={(e) => update(a.id, { notes: e.target.value })} className={`${sel} w-40`} aria-label="Notes" />
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    <button type="button" onClick={() => drop(a.id)} className="text-gray-400 hover:text-red-600" aria-label="Delete entry">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-gray-400">
            Calls {fmtM(total(activity, "call"))} · line draws {fmtM(total(activity, "draw"))} · line repayments {fmtM(total(activity, "repay"))}.
            Amounts are LP + GP. Tag an acquisition with its asset so the model doesn&apos;t count that purchase again. Entries dated after
            today are greyed out and count from their date.
          </p>
        </div>
      )}
    </div>
  );
}
