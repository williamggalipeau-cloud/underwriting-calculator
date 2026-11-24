// Phase U: Market Data. Submarket statistics by quarter (CoStar / broker
// uploads or by hand, each figure with its source and date), trends, each
// asset tagged to a submarket, and the asset's assumptions next to the
// market's. Kept with the firm's comps settings (comps.market), so it saves
// with the firm record and is logged; an asset's tag is inputs.submarketId.

let seq = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
const num = (v) => { if (v == null || v === "") return null; const x = Number(String(v).replace(/[$,%\s]/g, "")); return Number.isFinite(x) ? x : null; };
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export const EMPTY_MARKET = Object.freeze({ submarkets: [], stats: [], mapping: null });
export const marketOf = (comps) => ({ ...EMPTY_MARKET, ...(comps?.market ?? {}) });

export const STAT_FIELDS = [
  ["inventorySF", "Inventory (SF)", "sf"],
  ["vacancyPct", "Vacancy (%)", "pct"],
  ["availabilityPct", "Availability (%)", "pct"],
  ["netAbsorptionSF", "Net absorption (SF)", "sf"],
  ["askingRentPSF", "Asking rent ($/SF/yr)", "psf"],
  ["askingRentSmallBayPSF", "Small-bay asking rent ($/SF/yr)", "psf"],
  ["deliveriesSF", "Deliveries (SF)", "sf"],
  ["underConstructionSF", "Under construction (SF)", "sf"],
  ["salesVolume", "Sales volume ($)", "money"],
  ["capRatePct", "Market cap rate (%)", "pct"],
];
export function makeSubmarket(o = {}) { return { id: newId("sm"), name: "", metro: "", propertyType: "Industrial", ...o }; }
export function makeStat(o = {}) { return { id: newId("ms"), submarketId: "", quarter: "", ...Object.fromEntries(STAT_FIELDS.map(([k]) => [k, null])), source: "Manual", sourceDate: "", ...o }; }

// "2026 Q3", "Q3 2026", "3Q26", "2026-09-30" → "2026-Q3".
export function quarterKey(v) {
  const s = String(v ?? "").trim().toUpperCase();
  let m = s.match(/^(\d{4})\s*[-\s]?Q([1-4])$/) || s.match(/^Q([1-4])\s*[-\s]?(\d{4})$/);
  if (m) return m[1].length === 4 ? `${m[1]}-Q${m[2]}` : `${m[2]}-Q${m[1]}`;
  m = s.match(/^([1-4])Q\s*(\d{2,4})$/);
  if (m) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-Q${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-\d{2}$/) || s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-Q${Math.floor((Number(m[2]) - 1) / 3) + 1}`;
  m = s.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
  if (m) return `${m[2]}-Q${Math.floor((Number(m[1]) - 1) / 3) + 1}`;
  return "";
}
export const quarterLabel = (q) => (q ? `${q.slice(5)} ${q.slice(0, 4)}` : "");

// ── Upload: columns matched by name, remembered ──
const SYN = {
  submarket: ["submarket", "submarket name", "market", "submarket cluster"], quarter: ["period", "quarter", "date", "as of", "quarter end"],
  inventorySF: ["inventory sf", "inventory", "rba", "inventory (sf)", "existing buildings rba"], vacancyPct: ["vacancy rate", "vacancy %", "vacancy", "total vacancy rate"],
  availabilityPct: ["availability rate", "availability %", "availability"], netAbsorptionSF: ["net absorption sf", "net absorption", "net absorption (sf)"],
  askingRentPSF: ["market asking rent/sf", "asking rent", "average asking rent", "asking rent/sf", "market rent/sf", "asking rent (all)"], askingRentSmallBayPSF: ["small bay asking rent", "small-bay asking rent", "asking rent small bay", "flex asking rent"],
  deliveriesSF: ["deliveries sf", "deliveries", "delivered sf"], underConstructionSF: ["under construction sf", "under construction", "under constr sf"],
  salesVolume: ["sales volume", "total sales volume", "sales volume ($)"], capRatePct: ["market cap rate", "cap rate", "average cap rate", "sold cap rate"],
};
export function detectMarketMapping(grid, remembered = null) {
  let best = { row: -1, m: {}, score: 0 };
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const h = (grid[r] ?? []).map(norm);
    const m = {};
    for (const [k, syn] of Object.entries(SYN)) {
      let i = remembered?.[k] ? h.indexOf(norm(remembered[k])) : -1;
      if (i < 0) i = h.findIndex((x) => syn.includes(x));
      if (i < 0) i = h.findIndex((x) => x && syn.some((s) => s.length > 5 && x.startsWith(s)));
      if (i >= 0 && !Object.values(m).includes(i)) m[k] = i;
    }
    const score = Object.keys(m).length;
    if (score > best.score) best = { row: r, m, score };
  }
  const head = best.row >= 0 ? grid[best.row] : [];
  return { headerRow: best.row, mapping: best.m, names: Object.fromEntries(Object.entries(best.m).map(([k, i]) => [k, String(head[i] ?? "")])), ok: best.m.quarter != null && Object.keys(best.m).length >= 3 };
}
// Grid → stats; submarkets created by name when new; the same submarket + quarter updates in place.
export function importMarket(market, grid, det, { source = "Upload", sourceDate = "", defaultSubmarket = "" } = {}) {
  const subs = [...market.submarkets];
  const stats = [...market.stats];
  let added = 0, updated = 0, skipped = 0;
  const subId = (name) => {
    const n = String(name ?? "").trim() || defaultSubmarket;
    if (!n) return null;
    let s = subs.find((x) => norm(x.name) === norm(n));
    if (!s) { s = makeSubmarket({ name: n }); subs.push(s); }
    return s.id;
  };
  for (const r of grid.slice(det.headerRow + 1)) {
    if (!r || !r.some((c) => c !== "" && c != null)) continue;
    const g = (k) => (det.mapping[k] != null ? r[det.mapping[k]] : null);
    const q = quarterKey(g("quarter"));
    const sid = subId(g("submarket"));
    if (!q || !sid) { skipped++; continue; }
    const vals = Object.fromEntries(STAT_FIELDS.map(([k]) => [k, num(g(k))]).filter(([, v]) => v != null));
    const i = stats.findIndex((x) => x.submarketId === sid && x.quarter === q);
    if (i >= 0) { stats[i] = { ...stats[i], ...vals, source, sourceDate }; updated++; } else { stats.push(makeStat({ submarketId: sid, quarter: q, ...vals, source, sourceDate })); added++; }
  }
  return { market: { ...market, submarkets: subs, stats, mapping: det.names }, added, updated, skipped };
}

// ── Series and trends ──
export function seriesFor(market, submarketId) {
  return market.stats.filter((s) => s.submarketId === submarketId && s.quarter).sort((a, b) => (a.quarter < b.quarter ? -1 : 1));
}
// Change over the last 4 quarters (or the span available, annualized).
export function trend(series, key) {
  const xs = series.filter((s) => s[key] != null);
  if (xs.length < 2) return { latest: xs.at(-1)?.[key] ?? null, change: null, annualPct: null, quarter: xs.at(-1)?.quarter ?? "" };
  const last = xs.at(-1), back = xs[Math.max(0, xs.length - 5)];
  const qn = (q) => Number(q.slice(0, 4)) * 4 + Number(q.slice(6)) - 1;
  const quarters = qn(last.quarter) - qn(back.quarter);
  const ratio = back[key] ? last[key] / back[key] : null;
  return { latest: last[key], quarter: last.quarter, change: last[key] - back[key], annualPct: ratio && quarters > 0 ? (Math.pow(ratio, 4 / quarters) - 1) * 100 : null, quarters };
}
export function submarketSummary(market, submarketId) {
  const s = seriesFor(market, submarketId);
  return { quarters: s.length, latest: s.at(-1) ?? null, vacancy: trend(s, "vacancyPct"), rent: trend(s, "askingRentPSF"), smallBay: trend(s, "askingRentSmallBayPSF"), cap: trend(s, "capRatePct"), absorption: s.slice(-4).reduce((t, x) => t + (x.netAbsorptionSF ?? 0), 0) };
}

// ── The asset's assumptions next to the market's ──
export function assetVsMarket(inputs, market) {
  const sm = market.submarkets.find((s) => s.id === inputs?.submarketId);
  if (!sm) return null;
  const sum = submarketSummary(market, sm.id);
  const rentTrend = sum.smallBay.annualPct ?? sum.rent.annualPct;
  const rows = [
    { key: "rent", label: "Market rent ($/SF)", asset: num(inputs.rentPerSF), market: sum.smallBay.latest ?? sum.rent.latest, unit: "psf" },
    { key: "growth", label: "Rent growth (%/yr)", asset: num(inputs.annualRentEscalationPct), market: rentTrend, unit: "pct" },
    { key: "vacancy", label: "Vacancy (%)", asset: num(inputs.vacancyPct), market: sum.vacancy.latest, unit: "pct" },
    { key: "exitCap", label: "Exit cap vs. market cap (%)", asset: num(inputs.exitCapRatePct), market: sum.cap.latest, unit: "pct" },
  ].map((r) => ({ ...r, diff: r.asset != null && r.market != null ? r.asset - r.market : null }));
  return { submarket: sm, quarter: sum.latest?.quarter ?? "", rows };
}

// ── Excel ──
export function marketXlsx(market) {
  const out = [["Market data"], [], ["Submarket", "Quarter", ...STAT_FIELDS.map(([, l]) => l), "Source", "Source date"]];
  for (const sm of market.submarkets) for (const s of seriesFor(market, sm.id)) out.push([sm.name, quarterLabel(s.quarter), ...STAT_FIELDS.map(([k]) => s[k] ?? ""), s.source ?? "", s.sourceDate ?? ""]);
  out.push([], ["Submarket", "Latest quarter", "Vacancy (%)", "Vacancy change (pts, 4Q)", "Asking rent ($/SF)", "Rent growth (%/yr)", "Cap rate (%)", "Net absorption, last 4Q (SF)"]);
  for (const sm of market.submarkets) {
    const x = submarketSummary(market, sm.id);
    out.push([sm.name, quarterLabel(x.latest?.quarter), x.vacancy.latest ?? "", x.vacancy.change != null ? Math.round(x.vacancy.change * 100) / 100 : "", x.rent.latest ?? "", x.rent.annualPct != null ? Math.round(x.rent.annualPct * 100) / 100 : "", x.cap.latest ?? "", x.absorption]);
  }
  return out;
}
