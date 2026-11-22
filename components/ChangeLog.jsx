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

export default function ChangeLog({ log: browserLog = [], user, onUserChange, signedInEmail = null, dbLog = null, dbName }) {
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

      {log.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
          No changes recorded yet. Edits you make from now on will appear here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                {["When", "Who", "Area", "Item", "Field", "From", "To"].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((e) => (
                <tr key={e.id} className={`border-t border-gray-100 align-top ${e.note ? "bg-blue-50/40" : ""}`}>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-600">{fmtTime(e.at)}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-medium">{e.user}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-600">{e.area}</td>
                  <td className="px-2.5 py-1.5">{e.item}</td>
                  <td className="px-2.5 py-1.5">{e.note ? <span className="text-gray-500">{e.field}</span> : e.field}{e.source && <span className="ml-1.5 rounded bg-violet-50 px-1 py-px text-[10px] text-violet-700" title={e.source}>{e.source}</span>}</td>
                  <td className="px-2.5 py-1.5 text-red-700">{e.note ? "" : formatValue(e.from)}</td>
                  <td className="px-2.5 py-1.5 text-emerald-700">{e.note ? "" : formatValue(e.to)}</td>
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

      <p className="text-[11px] leading-relaxed text-gray-400">
        Repeated edits to the same field by the same person within a minute are combined into one entry; an edit undone within that
        minute is dropped. Loading, importing or resetting a workspace and loading the sample fund are recorded as one entry. The working
        log is stored in the workspace data, so it is a working record rather than a tamper-proof audit trail; the database log is the
        verified one. The latest {(10000).toLocaleString()} changes are kept.
      </p>
    </div>
  );
}
