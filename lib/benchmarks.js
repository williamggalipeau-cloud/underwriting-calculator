// ─── Phase Y: Benchmarking (Portfolio Management) ────────────────────────────
// The fund's and each asset's returns against outside benchmarks. Benchmark
// data is licensed, so it is uploaded from the firm's own subscriptions
// (CSV / Excel exports), never fetched; every figure keeps its source, and
// the tab is marked "licensed data" (check each license before using a
// figure in an LP report). Kept with the firm's comps settings
// (comps.benchmarks), like the market data, so it saves with the firm
// record and is logged.
//
// Three kinds of benchmark:
//   index    NCREIF NPI, NPI Industrial, ODCE: quarterly total, income and
//            appreciation returns (%), property level, unlevered.
//   vintage  Preqin and Cambridge Associates: net IRR, TVPI and DPI quartiles
//            (top, median, bottom) by vintage year and strategy.
//   monthly  monthly total returns (%) of listed REIT indexes and REITs for a
//            public market equivalent (PME): FTSE Nareit Industrial (main),
//            the small-bay peer basket EastGroup, Rexford, Terreno and STAG
//            (equal weight), FTSE Nareit All Equity REITs and the S&P 500.
//
// The fund's side:
//   time-weighted return (TWR) by quarter, unlevered, NCREIF style, for each
//   asset and the fund, from the quarterly values (lib/valuations), NOI and
//   capital spent:  denominator = value at start + ½ capex − ⅓ NOI;
//   income = NOI ÷ denominator; appreciation = (value at end − value at start
//   − capex) ÷ denominator. The acquisition quarter (held at cost) starts the
//   series. Quarters chain-link; periods over a year are annualized.
//   PME (Kaplan-Schoar): (Σ distributions × I_end/I_t + NAV) ÷ Σ
//   contributions × I_end/I_t; above 1.0 the fund beat the index. The
//   index-equivalent IRR (Long-Nickels) is the IRR of the same contributions
//   and distributions with the index's ending value in place of the NAV.

import { quarterKey } from "@/lib/market";
import { fundValuation } from "@/lib/valuations";
import { xirr } from "@/lib/fundTimeline";

const num = (v) => { if (v == null || v === "") return null; const x = Number(String(v).replace(/[$,%\s]/g, "")); return Number.isFinite(x) ? x : null; };
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
const fin = (v) => (typeof v === "number" && isFinite(v) ? v : null);

export const INDEXES = [
  ["npi", "NCREIF NPI", "NCREIF"],
  ["npiInd", "NCREIF NPI Industrial", "NCREIF"],
  ["odce", "NCREIF ODCE", "NCREIF"],
];
export const VINTAGE_SOURCES = [
  ["preqin", "Preqin"],
  ["cambridge", "Cambridge Associates"],
];
export const MONTHLY = [
  ["nareitInd", "FTSE Nareit Industrial", "Nareit"],
  ["EGP", "EastGroup (EGP)", "Peer basket"],
  ["REXR", "Rexford (REXR)", "Peer basket"],
  ["TRNO", "Terreno (TRNO)", "Peer basket"],
  ["STAG", "STAG (STAG)", "Peer basket"],
  ["nareitAll", "FTSE Nareit All Equity REITs", "Nareit"],
  ["sp500", "S&P 500", "S&P"],
];
export const PEERS = ["EGP", "REXR", "TRNO", "STAG"];
export const PME_SERIES = [["nareitInd", "FTSE Nareit Industrial (main)"], ["basket", "Small-bay peer basket (EGP, REXR, TRNO, STAG)"], ["nareitAll", "FTSE Nareit All Equity REITs"], ["sp500", "S&P 500"]];
export const label = (k) => [...INDEXES, ...MONTHLY, ...VINTAGE_SOURCES, ...PME_SERIES].find(([v]) => v === k)?.[1] ?? k;

export const EMPTY_BENCHMARKS = Object.freeze({ index: {}, vintage: {}, monthly: {} });
export const benchmarksOf = (comps) => {
  const b = comps?.benchmarks ?? {};
  return { index: b.index ?? {}, vintage: b.vintage ?? {}, monthly: b.monthly ?? {} };
};

// ── Parsing ──
// "2026-09-30", "9/30/2026", "2026-09", "Sep 2026", "September 2026" → "2026-09".
const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function monthKey(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}`;
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/) || s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.toLowerCase().match(/^([a-z]{3})[a-z]*\.?\s*[-\s]?\s*(\d{4})$/);
  if (m && MON.includes(m[1])) return `${m[2]}-${String(MON.indexOf(m[1]) + 1).padStart(2, "0")}`;
  return "";
}
// A column of returns: % figures (2.1) or decimals (0.021). Decimals when the
// column has no "%" and every value is within ±0.3.
function asPct(values) {
  const v = values.filter((x) => x.n != null);
  const decimal = v.length > 0 && !v.some((x) => x.pct) && v.every((x) => Math.abs(x.n) <= 0.3);
  return values.map((x) => (x.n == null ? null : decimal ? x.n * 100 : x.n));
}
const cell = (c) => ({ n: num(c), pct: /%/.test(String(c ?? "")) });

function headerRow(grid, test) {
  for (let i = 0; i < Math.min(grid.length, 15); i++) if ((grid[i] ?? []).filter((c) => test(norm(c))).length >= 1) return i;
  return 0;
}
const find = (heads, res) => heads.findIndex((h) => res.some((re) => re.test(h)));

// Index (quarterly) upload: Quarter/Period/Date, Total, Income, Appreciation.
export function detectIndexColumns(grid) {
  const hr = headerRow(grid, (h) => /quarter|period|date/.test(h));
  const heads = (grid[hr] ?? []).map(norm);
  const map = {
    quarter: find(heads, [/^quarter$/, /quarter|period|date/]),
    total: find(heads, [/^total/, /total return/, /^return/]),
    income: find(heads, [/income/]),
    appreciation: find(heads, [/apprec|capital/]),
  };
  return { headerRow: hr, headers: grid[hr] ?? [], map, ok: map.quarter >= 0 && (map.total >= 0 || (map.income >= 0 && map.appreciation >= 0)) };
}
export function parseIndex(grid, det) {
  const body = grid.slice(det.headerRow + 1).filter((r) => r?.some((c) => String(c ?? "").trim()));
  const col = (k) => (det.map[k] >= 0 ? asPct(body.map((r) => cell(r[det.map[k]]))) : body.map(() => null));
  const tot = col("total"), inc = col("income"), app = col("appreciation");
  const rows = [];
  body.forEach((r, i) => {
    const q = quarterKey(r[det.map.quarter]);
    const total = tot[i] ?? (inc[i] != null && app[i] != null ? inc[i] + app[i] : null);
    if (q && total != null) rows.push({ q, total, income: inc[i], appreciation: app[i] });
  });
  return dedupe(rows, "q");
}
// Vintage upload: Vintage, Strategy, and for each metric (IRR, TVPI, DPI) its
// top / upper quartile, median and bottom / lower quartile; or long form
// with a Metric column.
export function detectVintageColumns(grid) {
  const hr = headerRow(grid, (h) => /vintage/.test(h));
  const heads = (grid[hr] ?? []).map(norm);
  const vintage = find(heads, [/vintage/]), strategy = find(heads, [/strategy|category|type/]), metric = find(heads, [/^metric|measure/]);
  const q = (m, which) => find(heads, which === "uq" ? [new RegExp(`${m}.*(upper|top|1st|first|q1)`), new RegExp(`(upper|top).*${m}`)] : which === "lq" ? [new RegExp(`${m}.*(lower|bottom|3rd|third|q3)`), new RegExp(`(lower|bottom).*${m}`)] : [new RegExp(`${m}.*median`), new RegExp(`median.*${m}`)]);
  const wide = {};
  for (const m of ["irr", "tvpi", "dpi"]) wide[m] = { uq: q(m, "uq"), median: q(m, "median"), lq: q(m, "lq") };
  const long = { uq: find(heads, [/upper|top|1st|first|q1/]), median: find(heads, [/median/]), lq: find(heads, [/lower|bottom|3rd|third|q3/]) };
  const isWide = Object.values(wide).some((x) => x.median >= 0);
  return { headerRow: hr, headers: grid[hr] ?? [], vintage, strategy, metric, wide, long, isWide, ok: vintage >= 0 && (isWide || (metric >= 0 && long.median >= 0)) };
}
export function parseVintage(grid, det) {
  const body = grid.slice(det.headerRow + 1).filter((r) => r?.some((c) => String(c ?? "").trim()));
  const rows = [];
  const metricKey = (s) => { const n = norm(s); return /irr/.test(n) ? "irr" : /tvpi|total value/.test(n) ? "tvpi" : /dpi|distribut/.test(n) ? "dpi" : ""; };
  for (const r of body) {
    const vintage = Math.round(num(r[det.vintage]) ?? NaN);
    if (!Number.isFinite(vintage)) continue;
    const strategy = det.strategy >= 0 ? String(r[det.strategy] ?? "").trim() : "";
    const add = (metric, c) => {
      const [uq, median, lq] = [c.uq, c.median, c.lq].map((i) => (i >= 0 ? num(r[i]) : null));
      if (median == null && uq == null) return;
      const fix = (v) => (v != null && metric === "irr" && Math.abs(v) <= 1 && !/%/.test(String(r[c.median] ?? "")) ? v * 100 : v);
      rows.push({ vintage, strategy, metric, uq: fix(uq), median: fix(median), lq: fix(lq) });
    };
    if (det.isWide) for (const m of ["irr", "tvpi", "dpi"]) { if (det.wide[m].median >= 0 || det.wide[m].uq >= 0) add(m, det.wide[m]); }
    else { const m = metricKey(r[det.metric]); if (m) add(m, det.long); }
  }
  return rows;
}
// Monthly upload, wide: Date + one column per series (headers matched to the
// series: "Industrial", "EGP", "REXR", "All Equity", "S&P 500"...).
const SERIES_RE = [
  ["nareitInd", [/industrial/]],
  ["nareitAll", [/all equity/, /equity reit/]],
  ["sp500", [/s ?p ?500|sp500|s p 500/]],
  ["EGP", [/^egp$|eastgroup/]],
  ["REXR", [/^rexr$|rexford/]],
  ["TRNO", [/^trno$|terreno/]],
  ["STAG", [/^stag\b|stag industrial/]],
];
export function detectMonthlyColumns(grid) {
  const hr = headerRow(grid, (h) => /date|month|period/.test(h));
  const heads = (grid[hr] ?? []).map(norm);
  const date = find(heads, [/^date$|^month$/, /date|month|period/]);
  const series = {};
  heads.forEach((h, i) => {
    if (i === date) return;
    const hit = SERIES_RE.find(([, res]) => res.some((re) => re.test(h)));
    if (hit && series[hit[0]] == null) series[hit[0]] = i;
  });
  return { headerRow: hr, headers: grid[hr] ?? [], date, series, ok: date >= 0 && Object.keys(series).length > 0 };
}
export function parseMonthly(grid, det) {
  const body = grid.slice(det.headerRow + 1).filter((r) => r?.some((c) => String(c ?? "").trim()));
  const out = {};
  for (const [k, i] of Object.entries(det.series)) {
    const vals = asPct(body.map((r) => cell(r[i])));
    const rows = [];
    body.forEach((r, j) => { const m = monthKey(r[det.date]); if (m && vals[j] != null) rows.push({ m, ret: vals[j] }); });
    out[k] = dedupe(rows, "m");
  }
  return out;
}
function dedupe(rows, key) {
  const by = new Map();
  for (const r of rows) by.set(r[key], r);
  return [...by.values()].sort((a, b) => (a[key] < b[key] ? -1 : 1));
}

// Store an upload: { kind: "index" | "vintage" | "monthly", key, rows | series, meta }.
export function importBenchmark(b, { kind, key, rows, series, meta = {} }) {
  const at = { source: meta.source ?? "", fileName: meta.fileName ?? "", by: meta.by ?? "", at: meta.at ?? new Date().toISOString() };
  const next = { index: { ...b.index }, vintage: { ...b.vintage }, monthly: { ...b.monthly } };
  if (kind === "index") next.index[key] = { ...at, rows };
  else if (kind === "vintage") next.vintage[key] = { ...at, rows };
  else for (const [k, r] of Object.entries(series ?? {})) next.monthly[k] = { ...at, rows: r };
  return next;
}

// ── Returns math ──
export function chain(rets) {
  return rets.reduce((g, r) => g * (1 + r / 100), 1);
}
// Annualized over quarters (cumulative under a year).
export function annualize(rets, perYear = 4) {
  if (!rets.length) return null;
  const g = chain(rets);
  return rets.length < perYear ? (g - 1) * 100 : (Math.pow(g, perYear / rets.length) - 1) * 100;
}
const qEndOf = (q) => { const y = Number(q.slice(0, 4)), n = Number(q.slice(6)); return new Date(Date.UTC(y, n * 3, 0)).toISOString().slice(0, 10); };
const qOf = (iso) => quarterKey(iso.slice(0, 7));

// Quarterly TWR rows for one asset's valuation rows (lib/valuations).
function assetTwr(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const noi = (b.fwdNOI ?? 0) / 4;
    const capex = Math.max(0, (b.cost ?? 0) - (a.cost ?? 0));
    const den = a.value + 0.5 * capex - noi / 3;
    if (!(den > 0)) continue;
    out.push({ q: qOf(b.quarterEnd), qEnd: b.quarterEnd, vBeg: a.value, vEnd: b.value, noi, capex, income: (noi / den) * 100, appreciation: ((b.value - a.value - capex) / den) * 100 });
  }
  return out.map((r) => ({ ...r, total: r.income + r.appreciation }));
}
// Fund TWR: the held assets' figures summed each quarter.
function fundTwr(assetRows) {
  const by = new Map();
  for (const rows of assetRows) for (const r of rows) {
    const t = by.get(r.q) ?? { q: r.q, qEnd: r.qEnd, vBeg: 0, vEnd: 0, noi: 0, capex: 0 };
    t.vBeg += r.vBeg; t.vEnd += r.vEnd; t.noi += r.noi; t.capex += r.capex;
    by.set(r.q, t);
  }
  return [...by.values()].sort((a, b) => (a.q < b.q ? -1 : 1)).map((t) => {
    const den = t.vBeg + 0.5 * t.capex - t.noi / 3;
    const income = den > 0 ? (t.noi / den) * 100 : 0, appreciation = den > 0 ? ((t.vEnd - t.vBeg - t.capex) / den) * 100 : 0;
    return { ...t, income, appreciation, total: income + appreciation };
  });
}

// Periods ending at the last quarter: since inception and trailing 1/3/5 years.
export const PERIODS = [["si", "Since inception", null], ["1y", "1 year", 4], ["3y", "3 years", 12], ["5y", "5 years", 20]];
function periodQuarters(allQs, endQ, n) {
  const qs = allQs.filter((q) => q <= endQ);
  return n == null ? qs : qs.length >= n ? qs.slice(-n) : null;
}
export function periodReturn(series, qs) {
  if (!qs || !qs.length) return null;
  const by = new Map(series.map((r) => [r.q, r]));
  if (!qs.every((q) => by.has(q))) return null;
  const pick = (k) => annualize(qs.map((q) => by.get(q)[k] ?? 0));
  return { total: pick("total"), income: series.some((r) => r.income != null) ? pick("income") : null, appreciation: series.some((r) => r.appreciation != null) ? pick("appreciation") : null, quarters: qs.length };
}

// Quartile of a value against { uq, median, lq } (higher is better).
export function quartile(v, row) {
  if (v == null || !row) return null;
  if (row.uq != null && v >= row.uq) return 1;
  if (row.median != null && v >= row.median) return 2;
  if (row.lq != null && v >= row.lq) return 3;
  return row.lq != null ? 4 : row.median != null ? 3 : null;
}
export const QUARTILE_LABEL = { 1: "Top quartile", 2: "Second quartile", 3: "Third quartile", 4: "Bottom quartile" };

// Index levels by month from monthly returns; the peer basket is the equal
// weight of the peers present that month.
export function monthlyLevels(monthly, key) {
  let rows;
  if (key === "basket") {
    const months = new Map();
    for (const p of PEERS) for (const r of monthly[p]?.rows ?? []) { const a = months.get(r.m) ?? []; a.push(r.ret); months.set(r.m, a); }
    rows = [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([m, a]) => ({ m, ret: a.reduce((s, x) => s + x, 0) / a.length, n: a.length }));
  } else rows = monthly[key]?.rows ?? [];
  if (!rows.length) return null;
  const lv = new Map();
  let L = 100;
  const prevMonth = (m) => { const y = Number(m.slice(0, 4)), mo = Number(m.slice(5)); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
  lv.set(prevMonth(rows[0].m), L);
  for (const r of rows) { L *= 1 + r.ret / 100; lv.set(r.m, L); }
  return { levels: lv, first: prevMonth(rows[0].m), last: rows.at(-1).m, peers: key === "basket" ? Math.min(...rows.map((r) => r.n)) : null };
}
// PME of dated LP flows (contributions < 0, distributions > 0) with the NAV at endISO.
export function pme(flows, nav, endISO, lv) {
  if (!lv || !flows.length) return null;
  const at = (iso) => lv.levels.get(iso.slice(0, 7));
  const start = flows.map((f) => f.date).sort()[0];
  if (start.slice(0, 7) < lv.first || endISO.slice(0, 7) > lv.last) return { missing: true };
  const IT = at(endISO);
  let c = 0, d = 0;
  for (const f of flows) {
    const It = at(f.date) ?? lv.levels.get(lv.first);
    if (!It || !IT) return { missing: true };
    if (f.amount < 0) c += -f.amount * (IT / It);
    else d += f.amount * (IT / It);
  }
  const ks = c > 0 ? (d + nav) / c : null;
  const pmeNav = c - d;
  const fundIrr = xirr([...flows, { date: endISO, amount: nav }]) * 100;
  const indexIrr = xirr([...flows, { date: endISO, amount: Math.max(0, pmeNav) }]) * 100;
  return { ks, fundIrr: fin(fundIrr), indexIrr: fin(indexIrr), spread: fin(fundIrr) != null && fin(indexIrr) != null ? fundIrr - indexIrr : null, indexNav: pmeNav };
}

// ── The fund's side, built once ──
// deals: one fund's deals (snapshots); marks: valuations by deal id.
export function fundBenchmarkBase(fundName, deals, terms, marks, { todayISO, curve } = {}) {
  const val = fundValuation(deals, marks ?? {}, terms, { todayISO, curve });
  const assets = val.assets.map((a) => ({ id: a.id, name: a.name, twr: assetTwr(a.rows) }));
  const twr = fundTwr(assets.map((a) => a.twr));
  const endQ = val.lastQ ? qOf(val.lastQ) : null;
  const last = val.quarters.at(-1) ?? null;
  // Dated LP flows to the last quarter end (before the liquidation at NAV).
  const lpFlows = (last?.net.flows ?? []).filter((f) => Math.abs(f.amount) > 0.005);
  const firstAcq = val.assets.map((a) => a.acq).sort()[0] ?? null;
  return {
    fund: fundName,
    vintage: Number(terms.vintageYear) || (firstAcq ? Number(firstAcq.slice(0, 4)) : null),
    endQ,
    endISO: last?.quarterEnd ?? null,
    twr,
    assets,
    net: last ? { irr: fin(last.net.irr), tvpi: fin(last.net.tvpi), dpi: fin(last.net.dpi), nav: last.net.lpNav, nm: last.net.nm } : null,
    lpFlows,
    quarterNav: new Map(val.quarters.map((q) => [q.quarterEnd, q.net.lpNav])),
  };
}

// Everything the tab shows for one fund.
export function benchmarkReport(base, b, { strategy = "", periods = PERIODS } = {}) {
  const fundQs = base.twr.map((r) => r.q);
  const rows = [];
  for (const [pk, pl, n] of periods) {
    const qs = periodQuarters(fundQs, base.endQ, n);
    const fund = periodReturn(base.twr, qs);
    const idx = {};
    for (const [k] of INDEXES) idx[k] = b.index[k] ? periodReturn(b.index[k].rows, qs) : null;
    rows.push({ period: pk, label: pl, quarters: qs?.length ?? 0, fund, index: idx });
  }
  const assets = base.assets.map((a) => {
    const aq = a.twr.map((r) => r.q);
    const si = periodReturn(a.twr, aq);
    const npiInd = b.index.npiInd ? periodReturn(b.index.npiInd.rows, aq) : null;
    const npi = b.index.npi ? periodReturn(b.index.npi.rows, aq) : null;
    const bm = npiInd ?? npi;
    return { id: a.id, name: a.name, quarters: aq.length, since: aq[0] ?? null, si, bench: bm, benchKey: npiInd ? "npiInd" : npi ? "npi" : null, spread: si && bm ? si.total - bm.total : null };
  });
  // Vintage quartiles
  const vintage = {};
  const strategies = new Set();
  for (const [src] of VINTAGE_SOURCES) {
    const rs = (b.vintage[src]?.rows ?? []).filter((r) => r.vintage === base.vintage);
    rs.forEach((r) => r.strategy && strategies.add(r.strategy));
    // The chosen strategy; a source with one strategy for the vintage uses it.
    const only = new Set(rs.map((r) => r.strategy)).size === 1;
    const pick = (m) => rs.find((r) => r.metric === m && (!strategy || only || r.strategy === strategy)) ?? null;
    vintage[src] = b.vintage[src] ? Object.fromEntries(["irr", "tvpi", "dpi"].map((m) => { const row = pick(m); const v = base.net?.[m] ?? null; return [m, { row, value: v, quartile: base.net?.nm ? null : quartile(v, row) }]; })) : null;
  }
  // PME, since inception and trailing
  const pmeRows = [];
  for (const [k, l] of PME_SERIES) {
    const lv = monthlyLevels(b.monthly, k);
    if (!lv) { pmeRows.push({ key: k, label: l, loaded: false }); continue; }
    const out = { key: k, label: l, loaded: true, peers: lv.peers, by: {} };
    if (base.endISO && base.net && !base.net.nm) {
      out.by.si = pme(base.lpFlows, base.net.nav, base.endISO, lv);
      for (const [pk, , n] of periods.slice(1)) {
        const startQ = periodQuarters(fundQs, base.endQ, n)?.[0];
        if (!startQ) { out.by[pk] = null; continue; }
        // The window opens at the quarter end before its first quarter, with that NAV as the contribution.
        const prevQEnd = base.twr.find((r) => r.q === startQ) ? new Date(Date.UTC(Number(startQ.slice(0, 4)), (Number(startQ.slice(6)) - 1) * 3, 0)).toISOString().slice(0, 10) : null;
        const navStart = prevQEnd ? base.quarterNav.get(prevQEnd) : null;
        if (!(navStart > 0)) { out.by[pk] = null; continue; }
        const fl = [{ date: prevQEnd, amount: -navStart }, ...base.lpFlows.filter((f) => f.date > prevQEnd)];
        out.by[pk] = pme(fl, base.net.nav, base.endISO, lv);
      }
    }
    pmeRows.push(out);
  }
  // Cumulative growth of 100 since the fund's first quarter (for the chart).
  const growth = (series) => { if (!series) return null; const by = new Map(series.map((r) => [r.q, r.total])); let g = 100; const pts = []; for (const q of fundQs) { if (!by.has(q)) return pts.length ? pts : null; g *= 1 + by.get(q) / 100; pts.push({ q, v: g }); } return pts; };
  const chart = { fund: growth(base.twr), npi: growth(b.index.npi?.rows), npiInd: growth(b.index.npiInd?.rows), odce: growth(b.index.odce?.rows) };
  return { fund: base.fund, vintage: base.vintage, endQ: base.endQ, net: base.net, periods: rows, assets, vintageQ: vintage, strategies: [...strategies].sort(), pme: pmeRows, chart, twr: base.twr };
}

export function benchmarkXlsx(r, b) {
  const p = (v) => (v == null ? "" : Math.round(v * 100) / 100);
  const out = [[`${r.fund}: benchmarking (internal; licensed data)`], [`Through ${r.endQ ?? "-"} · vintage ${r.vintage ?? "-"}. Unlevered time-weighted returns, annualized over a year. Check each license before using benchmark figures in LP reports.`], []];
  out.push(["Time-weighted return (%, unlevered)", "Quarters", "Fund total", "Fund income", "Fund appreciation", ...INDEXES.map(([k, l]) => `${l} total`)]);
  for (const x of r.periods) out.push([x.label, x.quarters, p(x.fund?.total), p(x.fund?.income), p(x.fund?.appreciation), ...INDEXES.map(([k]) => p(x.index[k]?.total))]);
  out.push([], ["Asset (since its first quarter)", "From", "Quarters", "Asset total", "Income", "Appreciation", "Benchmark", "Benchmark total", "Spread (pts)"]);
  for (const a of r.assets) out.push([a.name, a.since ?? "", a.quarters, p(a.si?.total), p(a.si?.income), p(a.si?.appreciation), a.benchKey ? label(a.benchKey) : "", p(a.bench?.total), p(a.spread)]);
  out.push([], ["Vintage quartiles (net)", "Metric", "Fund", "Top quartile", "Median", "Bottom quartile", "Quartile", "Strategy"]);
  for (const [src, l] of VINTAGE_SOURCES) {
    const v = r.vintageQ[src];
    if (!v) { out.push([l, "not uploaded"]); continue; }
    for (const m of ["irr", "tvpi", "dpi"]) out.push([l, m.toUpperCase(), p(v[m].value), p(v[m].row?.uq), p(v[m].row?.median), p(v[m].row?.lq), v[m].quartile ? QUARTILE_LABEL[v[m].quartile] : "", v[m].row?.strategy ?? ""]);
  }
  out.push([], ["Public market equivalent", "Period", "KS-PME", "Fund IRR (%)", "Index-equivalent IRR (%)", "Spread (pts)"]);
  for (const x of r.pme) {
    if (!x.loaded) { out.push([x.label, "not uploaded"]); continue; }
    for (const [pk, pl] of PERIODS) { const v = x.by[pk]; out.push([x.label, pl, v?.missing ? "index doesn't cover the period" : p(v?.ks), p(v?.fundIrr), p(v?.indexIrr), p(v?.spread)]); }
  }
  out.push([], ["Sources"]);
  for (const [k, l] of INDEXES) if (b.index[k]) out.push([l, b.index[k].source || "", b.index[k].fileName, String(b.index[k].at).slice(0, 10)]);
  for (const [k, l] of VINTAGE_SOURCES) if (b.vintage[k]) out.push([l, b.vintage[k].source || "", b.vintage[k].fileName, String(b.vintage[k].at).slice(0, 10)]);
  for (const [k, l] of MONTHLY) if (b.monthly[k]) out.push([l, b.monthly[k].source || "", b.monthly[k].fileName, String(b.monthly[k].at).slice(0, 10)]);
  return out;
}

export { qEndOf };
