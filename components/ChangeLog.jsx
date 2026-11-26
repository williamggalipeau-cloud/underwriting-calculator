"use client";

import { useMemo, useState } from "react";
import { downloadBlob } from "@/lib/fundTerms";
import { formatValue } from "@/lib/audit";
import { writeXlsx } from "@/lib/xlsx";

const fmtTime = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString([], { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const PAGE = 200;

// A note-only entry (bulk action, workspace note) has no from/to values.
const noteOnly = (e) => !!e.note && e.from === undefined && e.to === undefined;

// Restore one record as of a date: pick it, pick the date, preview, apply.
function RestorePanel({ records, preview, onRestore }) {
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState("");
  const [date, setDate] = useState("");
  const [pv, setPv] = useState(null);
  const [msg, setMsg] = useState(null);
  const chosen = records.find((r) => JSON.stringify(r.path) === rec);
  const input = "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900";
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Restore a deal or fund as of a date…</button>;
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid="restore-panel">
      <p className="font-semibold">Restore as of a date</p>
      <p className="text-gray-500">Undoes this record&apos;s logged changes made after the date, newest first. Nothing else is touched; the restore is saved and logged.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5"><span className="text-gray-500">Deal or fund</span>
          <select aria-label="Restore record" value={rec} onChange={(e) => { setRec(e.target.value); setPv(null); setMsg(null); }} className={input}>
            <option value="">Choose…</option>
            {records.map((r) => <option key={JSON.stringify(r.path)} value={JSON.stringify(r.path)}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5"><span className="text-gray-500">As of (end of day)</span>
          <input type="date" aria-label="Restore date" value={date} onChange={(e) => { setDate(e.target.value); setPv(null); setMsg(null); }} className={input} />
        </label>
        <button type="button" disabled={!chosen || !date} onClick={() => setPv(preview(chosen.path, date))} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Preview</button>
        <button type="button" onClick={() => { setOpen(false); setPv(null); setMsg(null); }} className="px-2 py-1.5 text-gray-500 hover:underline">Close</button>
      </div>
      {pv && (
        pv.changes.length === 0 ? <p className="text-gray-500" data-testid="restore-preview">No changes to undo after {date}{pv.skipped.length ? ` (${pv.skipped.length} couldn't be undone)` : ""}.</p> : (
          <div data-testid="restore-preview" className="space-y-2">
            <table className="w-full tabular-nums">
              <thead className="text-gray-500"><tr><th className="py-1 text-left font-medium">Field</th><th className="py-1 text-left font-medium">Now</th><th className="py-1 text-left font-medium">Restored</th></tr></thead>
              <tbody>{pv.changes.map((c) => <tr key={JSON.stringify(c.path)} className="border-t border-gray-100"><td className="py-1">{c.field}</td><td className="py-1 text-red-700">{formatValue(c.now)}</td><td className="py-1 text-emerald-700">{formatValue(c.restored)}</td></tr>)}</tbody>
            </table>
            {pv.skipped.length > 0 && <p className="text-amber-800">{pv.skipped.length} later change{pv.skipped.length === 1 ? "" : "s"} can&apos;t be undone here (a record added or removed, or changed elsewhere) and stay as they are.</p>}
            <button type="button" onClick={() => { if (!window.confirm(`Restore ${chosen.label} as of ${date}? ${pv.changes.length} field(s) change.`)) return; const r = onRestore(chosen.path, date, chosen.label.replace(/^[^:]+: /, "")); setMsg(r?.ok ? `Restored ${r.count} field${r.count === 1 ? "" : "s"}.` : r?.reason); setPv(null); }} className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700">Apply restore</button>
          </div>
        )
      )}
      {msg && <p role="status" data-testid="restore-msg" className="text-emerald-800">{msg}</p>}
    </div>
  );
}

export default function ChangeLog({ log: browserLog = [], user, onUserChange, signedInEmail = null, dbLog = null, dbName, canRevert = null, onRevert = null, restoreRecords = [], restorePreview = null, onRestore = null, deleted = [], onUndelete = null }) {
  const [revertMsg, setRevertMsg] = useState(null);
  const [source, setSource] = useState("auto");
  const useDb = dbLog && source !== "browser";
  const log = useDb ? dbLog : browserLog;
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [who, setWho] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [shown, setShown] = useState(PAGE);

  const areas = useMemo(() => [...new Set(log.map((e) => e.area))].sort(), [log]);
  const users = useMemo(() => [...new Set(log.map((e) => e.user))].sort(), [log]);
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return [...log]
      .reverse()
      .filter((e) => (!area || e.area === area) && (!who || e.user === who))
      .filter((e) => (!since || e.at.slice(0, 10) >= since) && (!until || e.at.slice(0, 10) <= until))
      .filter((e) => !text || `${e.item} ${e.field} ${formatValue(e.from)} ${formatValue(e.to)} ${e.note ?? ""} ${e.source ?? ""}`.toLowerCase().includes(text));
  }, [log, q, area, who, since, until]);

  async function exportXlsx() {
    const header = ["When", "Who", "Area", "Item", "Field", "From", "To", "Note"];
    const data = rows.map((e) => [e.at, e.user, e.area, e.item, e.field, formatValue(e.from), formatValue(e.to), e.note ?? e.source ?? ""]);
    downloadBlob(await writeXlsx([header, ...data], { sheetName: "Change log", colWidths: [22, 16, 16, 26, 40, 20, 20, 30] }), `change-log-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const input = "rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900";
  return (
    <div className="space-y-4 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Change Log</h2>
          <p className="text-xs text-gray-500">
            Every change to deals, fund terms, capital activity, valuations, comps and the forward curve: what changed, when, and who made it.
          </p>
        </div>
        {signedInEmail ? (
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            Signed in as <span className="font-semibold">{signedInEmail}</span>. Your changes are attributed to this email.
          </span>
        ) : (
          <label className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
            <span className="font-medium text-blue-900">Your name</span>
            <input
              value={user}
              onChange={(e) => onUserChange(e.target.value)}
              placeholder="Enter your name"
              className="w-44 rounded-md border border-blue-200 bg-white px-2 py-1 text-gray-900"
              aria-label="Your name for the change log"
            />
          </label>
        )}
      </div>
      {dbLog && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">Show</span>
          {[["auto", `Database: ${dbName || "workspace"} (verified)`], ["browser", "Working log"]].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSource(k)}
              className={`rounded-lg border px-2.5 py-1 font-medium ${(k === "browser") === (source === "browser") ? "border-blue-300 bg-blue-50 text-blue-800" : "border-gray-200 bg-white text-gray-600"}`}
            >
              {label}
            </button>
          ))}
          {useDb && (
            <span className="text-gray-500">
              Recorded by the database on each save: user from sign-in, server time; entries can&apos;t be edited or deleted.
            </span>
          )}
        </div>
      )}
      {!signedInEmail && !user.trim() && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Enter your name above so your changes are attributed to you. Until then they are logged as &quot;Unknown user&quot;.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs">
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Asset, field or value" className={`${input} w-52`} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">Area</span>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={input}>
            <option value="">All</option>
            {areas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">Who</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={input}>
            <option value="">Everyone</option>
            {users.map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">From</span>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-500">To</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={input} />
        </label>
        <span className="ml-auto text-gray-500">{rows.length} of {log.length} changes</span>
        <button type="button" onClick={exportXlsx} disabled={!rows.length} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          Export to Excel
        </button>
      </div>

      {onRestore && restoreRecords.length > 0 && <RestorePanel records={restoreRecords} preview={restorePreview} onRestore={onRestore} />}
      {deleted.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid="recently-deleted">
          <summary className="cursor-pointer font-semibold">Recently deleted ({deleted.length})</summary>
          <p className="mt-1 text-gray-500">Deleted deals and funds are kept in the database. Restore brings one back as it was when deleted (saved and logged).</p>
          <table className="mt-2 w-full">
            <tbody>
              {deleted.map((d) => (
                <tr key={`${d.kind}:${d.key}`} className="border-t border-gray-100">
                  <td className="py-1 text-gray-500">{d.type}</td>
                  <td className="py-1 font-medium">{d.name}</td>
                  <td className="py-1 text-gray-500">{d.at ? `deleted ${fmtTime(d.at)}` : ""}{d.by ? ` by ${d.by}` : ""}</td>
                  <td className="py-1 text-right">{onUndelete && <button type="button" onClick={() => { if (window.confirm(`Restore ${d.type.toLowerCase()} ${d.name}?`)) onUndelete(d); }} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50">Restore</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {revertMsg && (
        <p role="status" data-testid="revert-msg" className={`rounded-lg px-3 py-2 text-xs ${revertMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{revertMsg.text}</p>
      )}
      {log.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
          No changes recorded yet. Edits you make from now on will appear here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                {["When", "Who", "Area", "Item", "Field", "From", "To", ...(onRevert ? [""] : [])].map((h, i) => (
                  <th key={h || i} className="px-2.5 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((e) => (
                <tr key={e.id} className={`border-t border-gray-100 align-top ${noteOnly(e) ? "bg-blue-50/40" : ""}`}>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-600">{fmtTime(e.at)}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">{e.user}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-600">{e.area}</td>
                  <td className="px-2.5 py-1.5">{e.item}</td>
                  <td className="px-2.5 py-1.5">{noteOnly(e) ? <span className="text-gray-500">{e.field}</span> : e.field}{(e.source || (e.note && !noteOnly(e))) && <span className="ml-1.5 rounded bg-violet-50 px-1 py-px text-[10px] text-violet-700" title={e.source || e.note}>{e.source || e.note}</span>}</td>
                  <td className="px-2.5 py-1.5 text-red-700">{noteOnly(e) ? "" : formatValue(e.from)}</td>
                  <td className="px-2.5 py-1.5 text-emerald-700">{noteOnly(e) ? "" : formatValue(e.to)}</td>
                  {onRevert && (
                    <td className="px-2.5 py-1.5 text-right">
                      {(() => {
                        const c = noteOnly(e) ? { ok: false } : canRevert?.(e) ?? { ok: false };
                        return c.ok ? (
                          <button
                            type="button"
                            data-testid="revert"
                            title={`Put ${e.field} back to ${formatValue(e.from)}`}
                            onClick={() => {
                              if (!window.confirm(`Revert ${e.item} › ${e.field} from ${formatValue(e.to)} back to ${formatValue(e.from)}? The revert is saved and logged.`)) return;
                              const r = onRevert(e);
                              setRevertMsg(r?.ok ? { ok: true, text: `Reverted ${e.item} › ${e.field} to ${formatValue(e.from)}.` } : { ok: false, text: r?.reason || "Couldn't revert." });
                            }}
                            className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Revert
                          </button>
                        ) : c.reason ? <span className="text-[10px] text-gray-300" title={c.reason}>—</span> : null;
                      })()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > shown && (
            <div className="border-t border-gray-100 p-2 text-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="text-xs font-medium text-blue-700 hover:underline">
                Show {Math.min(PAGE, rows.length - shown)} more
              </button>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-gray-500">
        Repeated edits to the same field by the same person within a minute are combined into one entry; an edit undone within that
        minute is dropped. Loading, importing or resetting a workspace and loading the sample fund are recorded as one entry. The working
        log is stored in the workspace data, so it is a working record rather than a tamper-proof audit trail; the database log is the
        verified one. The latest {(10000).toLocaleString()} changes are kept.
      </p>
    </div>
  );
}
