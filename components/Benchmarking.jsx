"use client";

// Phase Y: Benchmarking (Portfolio Management). The fund's and each asset's
// returns against licensed benchmarks the firm uploads (NCREIF, Preqin,
// Cambridge Associates) and a public market equivalent against listed REITs.
// Uploads are kept with the firm's comps settings (comps.benchmarks).
import { useMemo, useRef, useState } from "react";
import { gridFromFile } from "@/lib/comps";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";
import {
  INDEXES, MONTHLY, PERIODS, PME_SERIES, QUARTILE_LABEL, VINTAGE_SOURCES, benchmarkReport, benchmarkXlsx, benchmarksOf, detectIndexColumns,
  detectMonthlyColumns, detectVintageColumns, fundBenchmarkBase, importBenchmark, label, parseIndex, parseMonthly, parseVintage,
} from "@/lib/benchmarks";

const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`);
const pts = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)} pts`);
const x2 = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}x`);
const metricFmt = (m, v) => (m === "irr" ? pct(v) : x2(v));
const qLabel = (q) => (q ? `${q.slice(5)} ${q.slice(0, 4)}` : "—");
const Q_CLS = { 1: "bg-emerald-50 text-emerald-800", 2: "bg-sky-50 text-sky-800", 3: "bg-amber-50 text-amber-800", 4: "bg-red-50 text-red-700" };

function Upload({ b, onSave, email }) {
  const ref = useRef(null);
  const [kind, setKind] = useState("index");
  const [key, setKey] = useState("npiInd");
  const [source, setSource] = useState("");
  const [pending, setPending] = useState(null); // { grid, det, fileName }
  const [msg, setMsg] = useState(null);
  const keys = kind === "index" ? INDEXES : kind === "vintage" ? VINTAGE_SOURCES : [];
  async function onFile(file) {
    setMsg(null);
    try {
      const grid = await gridFromFile(file);
      const det = kind === "index" ? detectIndexColumns(grid) : kind === "vintage" ? detectVintageColumns(grid) : detectMonthlyColumns(grid);
      if (!det.ok) { setMsg({ ok: false, text: kind === "index" ? "Couldn't find a Quarter column and a Total (or Income and Appreciation) column." : kind === "vintage" ? "Couldn't find a Vintage column and quartile columns (e.g. \"Net IRR Median\", or Metric + Median)." : "Couldn't find a Date column and a series column (e.g. \"FTSE Nareit Industrial\", \"EGP\", \"S&P 500\")." }); return; }
      setPending({ grid, det, fileName: file.name });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  const h = (i) => (i >= 0 ? `"${pending.det.headers[i]}"` : "—");
  function doImport() {
    const { grid, det, fileName } = pending;
    const meta = { source: source.trim(), fileName, by: email ?? "" };
    let next, n;
    if (kind === "index") { const rows = parseIndex(grid, det); next = importBenchmark(b, { kind, key, rows, meta }); n = `${rows.length} quarters of ${label(key)}`; }
    else if (kind === "vintage") { const rows = parseVintage(grid, det); next = importBenchmark(b, { kind, key, rows, meta }); n = `${rows.length} ${label(key)} quartile rows`; }
    else { const series = parseMonthly(grid, det); next = importBenchmark(b, { kind, series, meta }); n = `${Object.keys(series).map(label).join(", ")}`; }
    onSave(next);
    setPending(null);
    setMsg({ ok: true, text: `Imported ${n}.` });
  }
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs" data-testid="bm-upload">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">Kind<select aria-label="Benchmark kind" value={kind} onChange={(e) => { const k = e.target.value; setKind(k); setKey(k === "index" ? "npiInd" : k === "vintage" ? "preqin" : ""); setPending(null); }} className="rounded border border-gray-300 px-1.5 py-1"><option value="index">Quarterly index (NCREIF)</option><option value="vintage">Vintage quartiles (Preqin / Cambridge)</option><option value="monthly">Monthly returns (REITs, for PME)</option></select></label>
        {keys.length > 0 && <label className="flex flex-col gap-0.5">Benchmark<select aria-label="Benchmark" value={key} onChange={(e) => setKey(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">{keys.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
        <label className="flex flex-col gap-0.5">Source / license note<input aria-label="Benchmark source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. NCREIF subscription, Q3 2026 release" className="w-64 rounded border border-gray-300 px-1.5 py-1" /></label>
        <button type="button" onClick={() => ref.current?.click()} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Choose file</button>
        <input ref={ref} type="file" accept=".csv,.xlsx" className="hidden" data-testid="bm-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      </div>
      {pending && (
        <div className="rounded-lg border border-blue-200 bg-white p-2" data-testid="bm-mapping">
          <p className="mb-1 font-medium">{pending.fileName}: columns found</p>
          {kind === "index" && <p>Quarter ← {h(pending.det.map.quarter)} · Total ← {h(pending.det.map.total)} · Income ← {h(pending.det.map.income)} · Appreciation ← {h(pending.det.map.appreciation)}</p>}
          {kind === "vintage" && <p>Vintage ← {h(pending.det.vintage)} · Strategy ← {h(pending.det.strategy)} · {pending.det.isWide ? ["irr", "tvpi", "dpi"].map((m) => `${m.toUpperCase()} median ← ${h(pending.det.wide[m].median)}`).join(" · ") : `Metric ← ${h(pending.det.metric)} · Median ← ${h(pending.det.long.median)}`}</p>}
          {kind === "monthly" && <p>Date ← {h(pending.det.date)} · {Object.entries(pending.det.series).map(([k, i]) => `${label(k)} ← ${h(i)}`).join(" · ")}</p>}
          <div className="mt-1.5 flex gap-2"><button type="button" onClick={doImport} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Import</button><button type="button" onClick={() => setPending(null)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Cancel</button></div>
        </div>
      )}
      {msg && <p className={msg.ok ? "text-emerald-700" : "text-red-700"} data-testid="bm-msg">{msg.text}</p>}
      <p className="text-gray-500">Returns can be % (2.1) or decimals (0.021). Uploading the same benchmark again replaces it. Sample files: docs/sample-benchmarks (fictional).</p>
    </div>
  );
}

function Chart({ chart }) {
  const lines = [["fund", "Fund", "#2563eb"], ["npiInd", "NPI Industrial", "#7c3aed"], ["npi", "NPI", "#059669"], ["odce", "ODCE", "#d97706"]].filter(([k]) => chart[k]?.length > 1);
  if (!lines.length || (chart.fund?.length ?? 0) < 2) return null;
  const all = lines.flatMap(([k]) => chart[k].map((p) => p.v));
  const lo = Math.min(100, ...all), hi = Math.max(...all);
  const W = 640, H = 180, P = 28;
  const n = chart.fund.length;
  const xy = (i, v) => [P + (i / Math.max(1, n - 1)) * (W - 2 * P), H - P - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 2 * P)];
  return (
    <figure className="rounded-xl border border-gray-200 bg-white p-3" data-testid="bm-chart">
      <figcaption className="mb-1 text-xs font-semibold text-gray-700">Growth of 100 since the fund&apos;s first quarter (unlevered, time-weighted)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Growth of 100: fund vs. NCREIF indexes">
        <line x1={P} x2={W - P} y1={xy(0, 100)[1]} y2={xy(0, 100)[1]} stroke="#e5e7eb" />
        <text x={2} y={xy(0, hi)[1] + 4} fontSize="9" fill="#6b7280">{hi.toFixed(0)}</text>
        <text x={2} y={xy(0, lo)[1] + 4} fontSize="9" fill="#6b7280">{lo.toFixed(0)}</text>
        <text x={P} y={H - 8} fontSize="9" fill="#6b7280">{qLabel(chart.fund[0].q)}</text>
        <text x={W - P} y={H - 8} fontSize="9" fill="#6b7280" textAnchor="end">{qLabel(chart.fund.at(-1).q)}</text>
        {lines.map(([k, , c]) => <polyline key={k} fill="none" stroke={c} strokeWidth={k === "fund" ? 2.5 : 1.5} points={chart[k].map((p, i) => xy(i, p.v).join(",")).join(" ")} />)}
      </svg>
      <p className="text-[11px] text-gray-500">{lines.map(([k, l, c]) => <span key={k} className="mr-3"><span style={{ color: c }}>■</span> {l} {chart[k].at(-1).v.toFixed(1)}</span>)}</p>
    </figure>
  );
}

export default function Benchmarking({ deals = [], funds = {}, marks = {}, curve, comps, onChange, canEdit = false, email = null }) {
  const names = useMemo(() => [...new Set(deals.map((d) => d.inputs?.fundName?.trim()).filter(Boolean))].sort(), [deals]);
  const [pick, setPick] = useState(null);
  const fundName = names.includes(pick) ? pick : names[0];
  const [strategy, setStrategy] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const b = benchmarksOf(comps);
  const todayISO = new Date().toISOString().slice(0, 10);
  const base = useMemo(() => {
    if (!fundName) return null;
    try { return fundBenchmarkBase(fundName, deals.filter((d) => d.inputs?.fundName?.trim() === fundName), { ...DEFAULT_FUND_TERMS, ...(funds[fundName] ?? {}), name: fundName }, marks, { todayISO, curve }); } catch { return null; }
  }, [fundName, deals, funds, marks, todayISO, curve]);
  const r = useMemo(() => (base ? benchmarkReport(base, b, { strategy }) : null), [base, b, strategy]);
  if (!names.length) return <p className="text-sm text-gray-500">Put deals in a fund to benchmark it here.</p>;
  if (!r) return <p className="text-sm text-gray-500">Couldn&apos;t build the fund&apos;s returns for benchmarking.</p>;
  const save = (next) => canEdit && onChange({ ...comps, benchmarks: next });
  const loaded = [...INDEXES.filter(([k]) => b.index[k]), ...VINTAGE_SOURCES.filter(([k]) => b.vintage[k]), ...MONTHLY.filter(([k]) => b.monthly[k])];
  const srcOf = (k) => b.index[k] ?? b.vintage[k] ?? b.monthly[k];

  async function exportPdf() {
    const { benchmarkPdf } = await import("@/lib/benchmarkPdf");
    downloadBlob(await benchmarkPdf(r, b, { todayISO }), `benchmarking-${todayISO}.pdf`);
  }

  return (
    <section className="space-y-4" data-testid="benchmarking">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Benchmarking <span className="text-sm font-normal text-gray-500">· {fundName}</span></h2>
          <p className="text-xs text-gray-500">Through {qLabel(r.endQ)} · vintage {r.vintage ?? "—"}. Unlevered time-weighted returns vs. NCREIF, net returns vs. Preqin and Cambridge quartiles, and a public market equivalent.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {names.length > 1 && <select aria-label="Fund" value={fundName} onChange={(e) => setPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">{names.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
          {canEdit && <button type="button" onClick={() => setShowUpload(!showUpload)} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Upload benchmark</button>}
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(benchmarkXlsx(r, b), { sheetName: "Benchmarking", title: `Baywise · ${fundName} benchmarking (internal)` }), `benchmarking-${todayISO}.xlsx`)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>
          <button type="button" onClick={exportPdf} className={`${btn} border-gray-300 bg-white text-gray-700`}>PDF</button>
        </div>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="bm-license">Licensed data: benchmark figures come from the firm&apos;s own subscriptions and are internal by default. Check each license before using them in LP reports.</p>
      {showUpload && canEdit && <Upload b={b} onSave={save} email={email} />}
      <p className="text-[11px] text-gray-500" data-testid="bm-sources">{loaded.length ? <>Loaded: {loaded.map(([k, l]) => `${l}${srcOf(k).source ? ` (${srcOf(k).source})` : ""}, ${String(srcOf(k).at).slice(0, 10)}`).join(" · ")}</> : "No benchmarks uploaded yet: the fund's own returns are shown. Upload NCREIF, Preqin / Cambridge and monthly REIT returns to compare."}</p>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-800">Time-weighted return vs. NCREIF (annualized over a year)</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="bm-twr">
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="px-2.5 py-2 text-left font-medium">Period</th><th className="px-2.5 py-2 text-right font-medium">Fund total</th><th className="px-2.5 py-2 text-right font-medium">Income / appreciation</th>{INDEXES.map(([k, l]) => <th key={k} className="px-2.5 py-2 text-right font-medium">{l.replace("NCREIF ", "")}</th>)}</tr></thead>
              <tbody>{r.periods.map((x) => (
                <tr key={x.period} className="border-t border-gray-100" data-testid="bm-period">
                  <td className="px-2.5 py-1.5">{x.label}{x.quarters ? <span className="text-gray-400"> · {x.quarters} q</span> : null}</td>
                  <td className="px-2.5 py-1.5 text-right font-semibold">{x.fund ? pct(x.fund.total) : <span className="font-normal text-gray-400">not enough history</span>}</td>
                  <td className="px-2.5 py-1.5 text-right text-gray-600">{x.fund ? `${pct(x.fund.income)} / ${pct(x.fund.appreciation)}` : ""}</td>
                  {INDEXES.map(([k]) => <td key={k} className="px-2.5 py-1.5 text-right">{x.index[k] ? <>{pct(x.index[k].total)} <span className={x.fund && x.fund.total >= x.index[k].total ? "text-emerald-700" : "text-red-700"}>({pts(x.fund ? x.fund.total - x.index[k].total : null)})</span></> : <span className="text-gray-300">—</span>}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <Chart chart={r.chart} />
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Net returns vs. vintage {r.vintage ?? "—"} peers</h3>
          {r.strategies.length > 1 && <select aria-label="Strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1 text-xs"><option value="">First listed strategy</option>{r.strategies.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
        </div>
        {r.net?.nm && <p className="text-xs text-amber-800">Net returns not yet meaningful: {r.net.nm}.</p>}
        <div className="grid gap-3 md:grid-cols-2" data-testid="bm-vintage">
          {VINTAGE_SOURCES.map(([src, l]) => {
            const v = r.vintageQ[src];
            return (
              <div key={src} className="rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid={`bm-vintage-${src}`}>
                <p className="mb-1 font-semibold">{l}{v?.irr?.row?.strategy ? <span className="font-normal text-gray-500"> · {v.irr.row.strategy}</span> : null}</p>
                {!v ? <p className="text-gray-400">Not uploaded.</p> : (
                  <table className="w-full tabular-nums"><thead className="text-gray-500"><tr><th className="text-left font-medium">Net</th><th className="text-right font-medium">Fund</th><th className="text-right font-medium">Top</th><th className="text-right font-medium">Median</th><th className="text-right font-medium">Bottom</th><th className="text-right font-medium">Quartile</th></tr></thead>
                    <tbody>{["irr", "tvpi", "dpi"].map((m) => <tr key={m} className="border-t border-gray-100"><td className="py-1">{m.toUpperCase()}</td><td className="text-right font-semibold">{metricFmt(m, v[m].value)}</td><td className="text-right">{metricFmt(m, v[m].row?.uq)}</td><td className="text-right">{metricFmt(m, v[m].row?.median)}</td><td className="text-right">{metricFmt(m, v[m].row?.lq)}</td><td className="text-right">{v[m].quartile ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${Q_CLS[v[m].quartile]}`}>{QUARTILE_LABEL[v[m].quartile]}</span> : <span className="text-gray-400">{v[m].row ? "—" : `no ${r.vintage} row`}</span>}</td></tr>)}</tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-800">Public market equivalent (LP cash flows invested in listed REITs instead)</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="bm-pme">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-2.5 py-2 text-left font-medium">Index</th>{PERIODS.map(([k, l]) => <th key={k} className="px-2.5 py-2 text-right font-medium">{l}</th>)}</tr></thead>
            <tbody>{r.pme.map((x) => (
              <tr key={x.key} className="border-t border-gray-100" data-testid="bm-pme-row">
                <td className="px-2.5 py-1.5">{x.label}{x.peers != null && x.peers < 4 ? <span className="text-amber-700"> · {x.peers} of 4 peers some months</span> : null}</td>
                {PERIODS.map(([k]) => { const v = x.by?.[k]; return <td key={k} className="px-2.5 py-1.5 text-right">{!x.loaded ? <span className="text-gray-300">not uploaded</span> : !v ? <span className="text-gray-300">—</span> : v.missing ? <span className="text-gray-400">not covered</span> : <><span className={`font-semibold ${v.ks >= 1 ? "text-emerald-700" : "text-red-700"}`}>{v.ks.toFixed(2)}</span> <span className="text-gray-500">· {pct(v.fundIrr)} vs {pct(v.indexIrr)}</span></>}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500">KS-PME (Kaplan-Schoar): above 1.00 the fund beat the index. Then the fund&apos;s net LP IRR vs. the index-equivalent IRR (the same cash flows in the index). Listed REITs carry less leverage (about 25–35%) than a value-add fund (about 60%), so part of any gap is leverage.</p>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-800">Assets vs. NCREIF (since each asset&apos;s first quarter)</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="bm-assets">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500"><tr>{["Asset", "From", "Quarters", "Total", "Income / appreciation", "Benchmark", "Spread"].map((h, i) => <th key={h} className={`px-2.5 py-2 font-medium ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>{r.assets.map((a) => (
              <tr key={a.id} className="border-t border-gray-100">
                <td className="px-2.5 py-1.5">{a.name}</td><td className="px-2.5 py-1.5">{qLabel(a.since)}</td><td className="px-2.5 py-1.5 text-right">{a.quarters}</td>
                <td className="px-2.5 py-1.5 text-right font-semibold">{a.si ? pct(a.si.total) : <span className="font-normal text-gray-400">first quarter not complete</span>}</td>
                <td className="px-2.5 py-1.5 text-right text-gray-600">{a.si ? `${pct(a.si.income)} / ${pct(a.si.appreciation)}` : ""}</td>
                <td className="px-2.5 py-1.5 text-right">{a.bench ? `${pct(a.bench.total)} ${label(a.benchKey).replace("NCREIF ", "")}` : "—"}</td>
                <td className={`px-2.5 py-1.5 text-right ${a.spread == null ? "" : a.spread >= 0 ? "text-emerald-700" : "text-red-700"}`}>{pts(a.spread)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500">Unlevered, NCREIF style: income = NOI ÷ (value at start + ½ capex − ⅓ NOI); appreciation = change in value less capex, over the same base. Values are the quarterly marks (Valuation tab), held at cost in the first quarters and rolled forward between appraisals.</p>
      </div>
    </section>
  );
}
