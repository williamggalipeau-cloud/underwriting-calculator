"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import {
  DUE_DAYS,
  MIN_IRR_YEARS,
  fundValuation,
  gridFromMarksFile,
  marksFromGrid,
  marksTemplateXlsx,
  quarterLabel,
  valuationHistoryXlsx,
} from "@/lib/valuations";

const fmt = (n, d = 0) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${fmt(a)}`;
  return n < 0 ? `(${s})` : s;
};
const fmtPct = (n, d = 1) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(d)}%`);
const fmtX = (n) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};
const irrText = (irr, years) => (years < MIN_IRR_YEARS ? "n/m" : fmtPct(irr));

const BASIS = {
  appraisal: { label: "Appraisal", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  internal: { label: "Internal", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  rollforward: { label: "Roll-forward", cls: "bg-gray-50 text-gray-600 border-gray-200" },
  cost: { label: "Cost", cls: "bg-gray-50 text-gray-500 border-gray-200" },
  held: { label: "Cost (first 6 mo)", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};
function BasisBadge({ row }) {
  if (row.overdue) return <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Appraisal overdue</span>;
  if (row.appraisalPending) return <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Appraisal due</span>;
  const b = BASIS[row.heldAtCost ? "held" : row.basis];
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${b.cls}`}>{b.label}</span>;
}

function Stat({ label, value, sub, tone }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-base font-bold tabular-nums ${tone === "bad" ? "text-red-600" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

// Editable quarter-by-quarter marks for one asset.
function MarkEditor({ asset, marks, onChange }) {
  const set = (q, patch) => {
    const cur = marks[q] ?? {};
    const next = { ...cur, ...patch };
    const empty = !(next.value > 0) && !next.appraiser && !next.notes && !(next.capex > 0) && !(next.capRate > 0);
    const copy = { ...marks };
    if (empty) delete copy[q];
    else copy[q] = next;
    onChange(copy);
  };
  const numIn = (v) => (v === "" ? undefined : Number(v));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-gray-500">
          <tr className="border-b border-gray-200">
            {["Quarter", "Type", "Fair value ($)", "Source", "Appraiser", "Cap rate %", "Capex since ($)", "Notes", "Basis used", "Value used", "NAV", "IRR", "TVPI"].map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {asset.rows.map((r) => {
            const m = marks[r.quarterEnd] ?? {};
            return (
              <tr key={r.quarterEnd} className="border-b border-gray-100">
                <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-700">{quarterLabel(r.quarterEnd)}</td>
                <td className="px-2 py-1 whitespace-nowrap text-gray-500" title={r.heldAtCost ? "Held at cost for the first 6 months after acquisition" : ""}>{r.heldAtCost ? "At cost (first 6 mo)" : r.appraisalQuarter ? "Appraisal" : "Internal"}</td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    step="10000"
                    value={m.value ?? ""}
                    placeholder={fmt(r.value)}
                    disabled={r.heldAtCost && !(m.value > 0)}
                    title={r.heldAtCost ? (r.markIgnored ? "Not used: the asset is held at cost for its first 6 months. Clear it or keep it for reference." : "Held at cost for the first 6 months after acquisition") : ""}
                    onChange={(e) => set(r.quarterEnd, { value: numIn(e.target.value), source: m.source ?? (r.appraisalQuarter ? "appraisal" : "internal") })}
                    className={`w-32 rounded border px-1.5 py-0.5 text-right disabled:bg-gray-50 ${r.markIgnored ? "border-amber-300 text-gray-400 line-through" : "border-gray-300"}`}
                    aria-label={`Fair value ${quarterLabel(r.quarterEnd)}`}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={m.source ?? (r.appraisalQuarter ? "appraisal" : "internal")}
                    onChange={(e) => set(r.quarterEnd, { source: e.target.value })}
                    className="rounded border border-gray-300 px-1 py-0.5"
                  >
                    <option value="appraisal">Appraisal</option>
                    <option value="internal">Internal</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input value={m.appraiser ?? ""} onChange={(e) => set(r.quarterEnd, { appraiser: e.target.value })} className="w-32 rounded border border-gray-300 px-1.5 py-0.5" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="0.05" value={m.capRate ?? ""} onChange={(e) => set(r.quarterEnd, { capRate: numIn(e.target.value) })} className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-right" />
                </td>
                <td className="px-2 py-1">
                  <input type="number" step="10000" value={m.capex ?? ""} onChange={(e) => set(r.quarterEnd, { capex: numIn(e.target.value) })} className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-right" />
                </td>
                <td className="px-2 py-1">
                  <input value={m.notes ?? ""} onChange={(e) => set(r.quarterEnd, { notes: e.target.value })} className="w-36 rounded border border-gray-300 px-1.5 py-0.5" />
                </td>
                <td className="px-2 py-1 whitespace-nowrap"><BasisBadge row={r} /></td>
                <td className="px-2 py-1 text-right font-semibold text-gray-900">{fmtM(r.value)}</td>
                <td className="px-2 py-1 text-right">{fmtM(r.nav)}</td>
                <td className="px-2 py-1 text-right">{irrText(r.irr, r.yearsHeld)}</td>
                <td className="px-2 py-1 text-right">{fmtX(r.tvpi)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[10px] text-gray-400">
        Quarters ending within 6 months of acquisition are held at cost (purchase price + capex budget, plus capex added), whatever the quarter; no appraisal is due for them. After that, leave Fair value blank to use the roll-forward (last mark plus capex since). An entered Q1/Q3 value overrides the roll-forward.
      </p>
    </div>
  );
}

function ImportPanel({ deals, valuation, onImport, onClose }) {
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  async function handle(file) {
    try {
      const res = marksFromGrid(await gridFromMarksFile(file), deals);
      if (!res.count) {
        setMsg({ ok: false, text: `No marks imported.${res.unmatched.length ? ` Unknown assets: ${res.unmatched.join(", ")}.` : ""}` });
        return;
      }
      onImport(res.updates);
      setMsg({
        ok: true,
        text: `Imported ${res.count} mark${res.count === 1 ? "" : "s"}.` +
          (res.skipped ? ` ${res.skipped} row${res.skipped === 1 ? "" : "s"} skipped (no date or value).` : "") +
          (res.unmatched.length ? ` Not matched to an asset: ${res.unmatched.join(", ")}.` : ""),
      });
    } catch (e) {
      setMsg({ ok: false, text: e.message || String(e) });
    }
  }
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">Import marks</h4>
        <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:text-gray-800">Close</button>
      </div>
      <p className="text-xs text-gray-600">
        Upload an Excel (.xlsx) or CSV file with columns <span className="font-medium">Asset, Quarter end, Fair value</span>{" "}and optionally
        Source (Appraisal / Internal), Appraiser, Cap rate, Capex since last mark and Notes. Asset names must match the deal names. Any date in a
        quarter (or &quot;2026 Q2&quot;) is filed at that quarter end. Imported marks replace existing ones for the same asset and quarter. An exported
        valuation history can be re-imported.
      </p>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Choose file…</button>
        <button type="button" onClick={async () => downloadBlob(await marksTemplateXlsx(valuation), "valuation-marks-template.xlsx")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          Download template (your assets & quarters)
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}

export default function Valuations({ deals, funds = {}, marks = {}, onMarksChange, curve }) {
  const fundNames = useMemo(() => [...new Set(deals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))], [deals]);
  const [fundPick, setFundPick] = useState(null);
  const fundName = fundNames.includes(fundPick) ? fundPick : fundNames[0];
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fundName), [deals, fundName]);
  const terms = useMemo(() => ({ ...DEFAULT_FUND_TERMS, ...(funds[fundName] ?? {}), name: fundName }), [funds, fundName]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const val = useMemo(
    () => (fundName ? fundValuation(fundDeals, marks, terms, { todayISO, curve }) : null),
    [fundName, fundDeals, marks, terms, todayISO, curve]
  );
  const [asOfPick, setAsOfPick] = useState(null);
  const [open, setOpen] = useState(null);
  const [showImport, setShowImport] = useState(false);

  if (!fundName) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-600">No fund assets yet.</p>
        <p className="mt-1 text-xs text-gray-400">Put deals in a fund (Fund field, or Load Model Fund I) to value them here.</p>
      </div>
    );
  }

  const quarters = val.quarters;
  const asOf = quarters.some((q) => q.quarterEnd === asOfPick) ? asOfPick : quarters.at(-1)?.quarterEnd;
  const fq = quarters.find((q) => q.quarterEnd === asOf);
  const heldAssets = val.assets.filter((a) => a.byQuarter.has(asOf));
  const sched = val.schedule;
  const overdue = sched.filter((s) => s.status === "overdue");
  const due = sched.filter((s) => s.status === "due");
  const upcoming = sched.filter((s) => s.status === "upcoming");
  const nextDate = upcoming[0]?.quarterEnd;
  const nextGroup = upcoming.filter((s) => s.quarterEnd === nextDate);
  const doneCount = sched.filter((s) => s.status === "done").length;

  const setAssetMarks = (id, m) => onMarksChange({ ...marks, [id]: m });
  const importMarks = (updates) => {
    const next = { ...marks };
    for (const [id, qs] of Object.entries(updates)) next[id] = { ...(next[id] ?? {}), ...qs };
    onMarksChange(next);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Valuations</h2>
          <p className="text-xs text-gray-500">
            Quarterly fair value by asset. Q2 and Q4 are independent appraisals; Q1 and Q3 roll the last mark forward (plus capex). NAV and
            interim returns follow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fundNames.length > 1 && (
            <select value={fundName} onChange={(e) => setFundPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {fundNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {quarters.length > 0 && (
            <label className="flex items-center gap-1.5">
              <span className="text-gray-500">As of</span>
              <select value={asOf} onChange={(e) => setAsOfPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
                {[...quarters].reverse().map((q) => <option key={q.quarterEnd} value={q.quarterEnd}>{quarterLabel(q.quarterEnd)} ({fmtDate(q.quarterEnd)})</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => setShowImport((v) => !v)} className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700">Import marks</button>
          <button
            type="button"
            disabled={!quarters.length}
            onClick={async () => downloadBlob(await valuationHistoryXlsx(val), `${safeFileName(fundName)}-valuations.xlsx`)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Export history
          </button>
        </div>
      </div>

      {showImport && <ImportPanel deals={fundDeals} valuation={val} onImport={importMarks} onClose={() => setShowImport(false)} />}

      {/* Appraisal schedule */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-gray-700">Appraisal schedule (Q2 & Q4)</h4>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">{overdue.length} overdue</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{due.length} due now</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{doneCount} done</span>
            {nextDate && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">Next: {quarterLabel(nextDate)} · {nextGroup.length} asset{nextGroup.length === 1 ? "" : "s"}</span>}
          </div>
        </div>
        {(overdue.length > 0 || due.length > 0 || nextGroup.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...overdue, ...due, ...nextGroup].map((s) => (
              <button
                key={`${s.assetId}-${s.quarterEnd}`}
                type="button"
                disabled={s.status === "upcoming"}
                onClick={() => { setOpen(s.assetId); setAsOfPick(null); }}
                title={s.status === "upcoming" ? "Not yet due" : "Open this asset to enter the appraisal"}
                className={`rounded-lg border px-2 py-1 text-[11px] ${
                  s.status === "overdue" ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    : s.status === "due" ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : "border-gray-200 bg-gray-50 text-gray-500"
                }`}
              >
                {s.asset} · {quarterLabel(s.quarterEnd)}
                {s.status === "overdue" && " · overdue"}
                {s.status === "due" && ` · due by ${fmtDate(s.dueBy)}`}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[10px] text-gray-400">
          An appraisal is due at each Q2 and Q4 end after the acquisition quarter (assets are held at cost in that quarter) and is overdue {DUE_DAYS} days
          after quarter end. Until it is entered, the asset is carried at its roll-forward value.
        </p>
      </div>

      {!fq ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
          No completed quarters yet. The first asset is valued at the end of its acquisition quarter.
        </div>
      ) : (
        <>
          {/* Fund NAV & interim returns */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <h4 className="mb-2 text-xs font-semibold text-gray-700">Fund NAV · {quarterLabel(asOf)}</h4>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Gross asset value" value={fmtM(fq.gav)} sub={`${fq.assets} asset${fq.assets === 1 ? "" : "s"}`} />
                <Stat label="Debt" value={fmtM(fq.debt)} />
                <Stat label="Asset cash reserves" value={fmtM(fq.reserves)} />
                <Stat label="Fund NAV" value={fmtM(fq.nav)} sub="Value − debt + reserves" />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <h4 className="mb-2 text-xs font-semibold text-gray-700">Gross (asset level, before fund costs & promote)</h4>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Interim IRR" value={irrText(fq.gross.irr, fq.yearsSinceFirstCall)} sub={fq.yearsSinceFirstCall < MIN_IRR_YEARS ? "Under 1 year since first investment" : "Since inception, NAV as ending value"} />
                <Stat label="TVPI" value={fmtX(fq.gross.tvpi)} tone={fq.gross.tvpi < 1 ? "bad" : undefined} sub={`${fmtM(fq.gross.contrib)} invested`} />
                <Stat label="DPI" value={fmtX(fq.gross.dpi)} sub={`${fmtM(fq.gross.dist)} distributed`} />
                <Stat label="RVPI" value={fmtX(fq.gross.rvpi)} />
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <h4 className="mb-2 text-xs font-semibold text-gray-700">
                Net LP (hypothetical liquidation at NAV)
                {val.flowsMode === "actual" && <span className="ml-1.5 rounded bg-blue-50 px-1 text-[9px] font-semibold text-blue-700">actual calls</span>}
              </h4>
              {fq.net.nm ? (
                <p className="text-xs text-gray-500">n/m — {fq.net.nm}. Sub line balance {fmtM(fq.lineBalance)}.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Interim IRR" value={irrText(fq.net.irr, fq.yearsSinceFirstCall)} />
                  <Stat label="TVPI" value={fmtX(fq.net.tvpi)} tone={fq.net.tvpi < 1 ? "bad" : undefined} sub={`${fmtM(fq.net.contrib)} called`} />
                  <Stat label="DPI" value={fmtX(fq.net.dpi)} sub={`${fmtM(fq.net.dist)} distributed`} />
                  <Stat label="LP NAV" value={fmtM(fq.net.lpNav)} sub={`RVPI ${fmtX(fq.net.rvpi)} · after ${fmtM(fq.lineBalance)} sub line`} />
                </div>
              )}
            </div>
          </div>

          {/* Assets */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {["Asset", "Fair value", "Basis", "Last appraisal", "Value / SF", "Implied cap", "Unrealized vs cost", "Loan", "Equity NAV", "Interim IRR", "TVPI", "DPI", ""].map((h, i) => (
                    <th key={i} className={`px-2.5 py-2 font-medium whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heldAssets.map((a) => {
                  const r = a.byQuarter.get(asOf);
                  const isOpen = open === a.id;
                  return (
                    <Fragment key={a.id}>
                      <tr className={`border-t border-gray-100 ${isOpen ? "bg-blue-50/40" : "hover:bg-gray-50"}`}>
                        <td className="px-2.5 py-2 text-left">
                          <div className="font-medium text-gray-800">{a.name}</div>
                          <div className="text-[10px] text-gray-400">Acquired {fmtDate(a.acq)} · exit {fmtDate(a.exit)}</div>
                        </td>
                        <td className="px-2.5 py-2 text-right font-semibold text-gray-900">{fmtM(r.value)}</td>
                        <td className="px-2.5 py-2 text-right whitespace-nowrap"><BasisBadge row={r} /></td>
                        <td className="px-2.5 py-2 text-right text-gray-600">
                          {r.lastAppraisal ? `${fmtM(r.lastAppraisal.value)} · ${quarterLabel(r.lastAppraisal.quarterEnd)}` : "—"}
                        </td>
                        <td className="px-2.5 py-2 text-right">${fmt(r.psf)}</td>
                        <td className="px-2.5 py-2 text-right">{fmtPct(r.impliedCap, 2)}</td>
                        <td className={`px-2.5 py-2 text-right ${r.unrealized < 0 ? "text-red-600" : r.unrealized > 0 ? "text-emerald-700" : ""}`}>
                          {fmtM(r.unrealized)} <span className="text-gray-400">({fmtPct((r.unrealized / r.cost) * 100)})</span>
                        </td>
                        <td className="px-2.5 py-2 text-right">{fmtM(r.debt)}</td>
                        <td className="px-2.5 py-2 text-right font-semibold">{fmtM(r.nav)}</td>
                        <td className="px-2.5 py-2 text-right">{irrText(r.irr, r.yearsHeld)}</td>
                        <td className={`px-2.5 py-2 text-right ${r.tvpi < 1 ? "text-red-600" : ""}`}>{fmtX(r.tvpi)}</td>
                        <td className="px-2.5 py-2 text-right">{fmtX(r.dpi)}</td>
                        <td className="px-2.5 py-2 text-right">
                          <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
                            {isOpen ? "Close" : "Marks"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-blue-50/20">
                          <td colSpan={13} className="px-3 py-3">
                            <MarkEditor asset={a} marks={marks[a.id] ?? {}} onChange={(m) => setAssetMarks(a.id, m)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Fund by quarter */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {["Quarter", "Assets", "Gross asset value", "Debt", "Reserves", "Fund NAV", "Sub line", "Gross IRR", "Gross TVPI", "Gross DPI", "LP NAV", "Net LP IRR", "Net LP TVPI", "Net LP DPI"].map((h, i) => (
                    <th key={h} className={`px-2.5 py-2 font-medium whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...quarters].reverse().map((q) => (
                  <tr key={q.quarterEnd} className={`border-t border-gray-100 ${q.quarterEnd === asOf ? "bg-blue-50/40" : ""}`}>
                    <td className="px-2.5 py-1.5 text-left font-medium text-gray-700 whitespace-nowrap">{quarterLabel(q.quarterEnd)}</td>
                    <td className="px-2.5 py-1.5 text-right">{q.assets}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtM(q.gav)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtM(q.debt)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtM(q.reserves)}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold">{fmtM(q.nav)}</td>
                    <td className="px-2.5 py-1.5 text-right text-gray-500">{fmtM(q.lineBalance)}</td>
                    <td className="px-2.5 py-1.5 text-right">{irrText(q.gross.irr, q.yearsSinceFirstCall)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtX(q.gross.tvpi)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmtX(q.gross.dpi)}</td>
                    <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : fmtM(q.net.lpNav)}</td>
                    <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : irrText(q.net.irr, q.yearsSinceFirstCall)}</td>
                    <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : fmtX(q.net.tvpi)}</td>
                    <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : fmtX(q.net.dpi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            <span className="font-medium text-gray-500">Method:</span>{" "}assets are held at cost (price + capex budget) in the acquisition quarter.
            Each later quarter uses the entered mark if there is one, otherwise the last mark plus capex since. Equity NAV = fair value − loan
            balance + the asset&apos;s cash reserve. Interim returns use actual cash flows to date plus NAV as the ending value; IRRs under one year
            show n/m. Net LP assumes the fund sells everything at NAV on the quarter end, repays the sub line, and runs the proceeds through the
            fund waterfall. LP calls and the sub line balance are your actual capital activity when it&apos;s entered (Portfolio Return),
            otherwise the model. Closing costs and cap premiums are not in fair value, so TVPI starts below 1.0x.
          </p>
        </>
      )}
    </div>
  );
}
