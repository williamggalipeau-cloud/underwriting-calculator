"use client";

import { useRef, useState } from "react";
import { downloadBlob, safeFileName } from "@/lib/fundTerms";
import { ACTIVITY_TYPES, PURPOSES, activityFromFile, activityXlsx, newActivityId, withRunningTotals } from "@/lib/capitalActivity";

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`;
};
const total = (rows, type) => rows.filter((a) => a.type === type).reduce((s, a) => s + (Number(a.amount) || 0), 0);

// Ledger of actual capital calls and sub line draws / repayments for a fund.
export default function CapitalActivity({ fundName, activity = [], autoActivity = [], deals, otherAssets = [], commitments = 0, onChange }) {
  // Every property in the workspace can be tagged: this fund's assets first,
  // then the rest (other funds, deals without a fund, saved copies).
  const allAssets = [...deals, ...otherAssets.filter((a) => !deals.some((d) => d.id === a.id))];
  const sortByName = (xs) => [...xs].sort((a, b) => (a.inputs?.propertyName || "").localeCompare(b.inputs?.propertyName || ""));
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const today = new Date().toISOString().slice(0, 10);
  // Automatic fund-expense entries (lib/fundExpenses) are shown with the
  // manual ones; "Keep" turns a quarter's automatic entries into manual ones.
  const sorted = withRunningTotals([...activity, ...autoActivity], commitments);
  const quarterOf = (iso) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
  const keepQuarter = (q) =>
    onChange([
      ...activity,
      ...autoActivity.filter((a) => quarterOf(a.date) === q).map(({ auto, id, ...a }) => ({ ...a, id: newActivityId(), source: "kept" })),
    ]);
  const last = sorted.at(-1)?.run;
  const runCell = (v, warn = false) => (
    <td className={`px-1.5 py-1 text-right whitespace-nowrap ${warn ? "text-red-600" : "text-gray-700"}`}>{v == null ? "—" : `${v < 0 ? "−" : ""}${fmtM(v)}`}</td>
  );
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
            onClick={async () => downloadBlob(await activityXlsx([...activity, ...autoActivity], allAssets, commitments), `${safeFileName(fundName)}-capital-activity.xlsx`)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50"
          >
            {activity.length || autoActivity.length ? "Export" : "Template"}
          </button>
        </div>
      </div>
      {msg && <p className={`mt-1 text-[11px] ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      {sorted.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-gray-500">
              <tr className="border-b border-gray-200">
                {["Date", "Type", "Amount ($)", "Purpose", "Source"].map((h) => (
                  <th key={h} className="px-1.5 py-1 text-left font-medium">{h}</th>
                ))}
                <th className="border-l border-gray-200 px-1.5 py-1 text-right font-medium" title="Capital calls to date, after this entry">Called to date</th>
                <th className="px-1.5 py-1 text-right font-medium" title="Sub line draws less repayments, after this entry">Line balance</th>
                {commitments > 0 && <th className="px-1.5 py-1 text-right font-medium" title="Commitments − called to date − line balance, after this entry">Dry powder</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) =>
                a.auto ? (
                  <tr key={a.id} className="border-b border-gray-100 bg-sky-50/40 text-gray-700">
                    <td className="px-1.5 py-1 whitespace-nowrap">{a.date}</td>
                    <td className="px-1.5 py-1 whitespace-nowrap">{ACTIVITY_TYPES.find((t) => t.value === a.type)?.label ?? a.type}</td>
                    <td className="px-1.5 py-1 text-right">{Math.round(a.amount).toLocaleString()}</td>
                    <td className="px-1.5 py-1">{PURPOSES.find((p) => p.value === a.purpose)?.label ?? a.purpose}</td>
                    <td className="px-1.5 py-1 whitespace-nowrap">
                      <span className="cursor-help rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800" title={a.notes}>Automatic</span>
                    </td>
                    <td className="border-l border-gray-100 px-1.5 py-1 text-right whitespace-nowrap text-gray-700">{fmtM(a.run.called)}</td>
                    {runCell(a.run.line, a.run.line < 0)}
                    {commitments > 0 && runCell(a.run.dryPowder, a.run.dryPowder < 0)}
                    <td className="px-1.5 py-1 text-right">
                      <button type="button" onClick={() => keepQuarter(quarterOf(a.date))} className="text-[10px] font-medium text-sky-700 hover:underline" title="Turn this quarter's automatic entries into manual entries you can edit">Keep</button>
                    </td>
                  </tr>
                ) : (
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
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${a.source === "kept" ? "bg-indigo-50 text-indigo-800" : a.source === "import" ? "bg-gray-100 text-gray-700" : "bg-emerald-50 text-emerald-800"}`}
                      title={a.notes || undefined}
                    >
                      {a.source === "kept" ? "Automatic, kept" : a.source === "import" ? "User imported" : "User added"}
                    </span>
                  </td>
                  <td className="border-l border-gray-100 px-1.5 py-1 text-right whitespace-nowrap text-gray-700">{fmtM(a.run.called)}</td>
                  {runCell(a.run.line, a.run.line < 0)}
                  {commitments > 0 && runCell(a.run.dryPowder, a.run.dryPowder < 0)}
                  <td className="px-1.5 py-1 text-right">
                    <button type="button" onClick={() => drop(a.id)} className="text-gray-400 hover:text-red-600" aria-label="Delete entry">✕</button>
                  </td>
                </tr>
                )
              )}
            </tbody>
            {last && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold text-gray-800">
                  <td className="px-1.5 py-1.5" colSpan={2}>Total ({sorted.length} entr{sorted.length === 1 ? "y" : "ies"})</td>
                  <td className="px-1.5 py-1.5 text-right text-[11px] font-normal text-gray-500" colSpan={3}>
                    calls {fmtM(total(activity, "call"))} · draws {fmtM(total(activity, "draw"))} · repayments {fmtM(total(activity, "repay"))}
                  </td>
                  <td className="border-l border-gray-100 px-1.5 py-1.5 text-right">{fmtM(last.called)}</td>
                  {runCell(last.line, last.line < 0)}
                  {commitments > 0 && runCell(last.dryPowder, last.dryPowder < 0)}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          <p className="mt-1 text-[10px] text-gray-400">
            The Source column shows how each entry was created: <span className="font-medium text-emerald-800">User added</span> (typed
            in), <span className="font-medium">User imported</span> (from a file), <span className="font-medium text-sky-800">Automatic</span> or{" "}
            <span className="font-medium text-indigo-800">Automatic, kept</span>; hover over it for details. Automatic rows are the fund&apos;s expenses to date: the quarterly management fee,
            monthly sub line interest and unused fees, the line draws that paid them once fund cash ran out, and their repayment from
            income or sale proceeds. Capital calls are never automatic: enter them yourself, no more than quarterly, once fund cash and the
            line are exhausted. They update with the model; <span className="font-medium">Keep</span> turns a quarter&apos;s automatic entries into
            manual ones, after which that quarter is not generated. Fund expense paid rows don&apos;t change called capital or the line.
            Running totals are after each entry, in date order: capital called to date, sub line balance (draws − repayments)
            {commitments > 0 ? ", and dry powder (commitments − called − line balance)" : ""}. They include entries dated after today. Amounts are LP + GP. Tag an acquisition with its asset so the model doesn&apos;t count that purchase again. Entries dated after
            today are greyed out and count from their date.
          </p>
        </div>
      )}
    </div>
  );
}
