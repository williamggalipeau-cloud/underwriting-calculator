// Version 1.1 (user, 11/25): an asset's valuation and business plan
// assumptions next to its submarket's figures in Market Data, flagged amber
// past a level and red past a multiple of it. The levels are set per
// portfolio (terms.marketFlags); the sample data uses 50 bp on cap rate, 10%
// on rent, 2 points on vacancy and 1 point on rent growth, red at 1.5×.
import { marketOf, submarketSummary } from "@/lib/market";

export const DEFAULT_MARKET_FLAGS = Object.freeze({ capBp: 50, rentPct: 10, vacancyPts: 2, growthPts: 1, redMultiple: 1.5 });
export const MARKET_FLAG_FIELDS = [
  ["capBp", "Cap rate", "bp"],
  ["rentPct", "Rent", "%"],
  ["vacancyPts", "Vacancy", "pts"],
  ["growthPts", "Rent growth", "pts"],
  ["redMultiple", "Red beyond", "× the level"],
];
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
export function flagsOf(terms) {
  const f = terms?.marketFlags ?? {};
  return Object.fromEntries(Object.entries(DEFAULT_MARKET_FLAGS).map(([k, d]) => [k, num(f[k]) != null && num(f[k]) >= 0 ? num(f[k]) : d]));
}

// One comparison: size of the gap in the level's unit, and its status.
function compare(kind, asset, market, flags) {
  if (asset == null || market == null) return { diff: null, gap: null, status: "none" };
  const diff = asset - market;
  const gap = kind === "cap" ? diff * 100 : kind === "rent" ? (market ? (asset / market - 1) * 100 : null) : diff;
  const level = { cap: flags.capBp, rent: flags.rentPct, vacancy: flags.vacancyPts, growth: flags.growthPts }[kind];
  if (gap == null) return { diff, gap, status: "none" };
  const a = Math.abs(gap);
  const status = a > level * flags.redMultiple ? "red" : a > level ? "amber" : "ok";
  return { diff, gap, level, status };
}
const UNIT = { cap: "bp", rent: "%", vacancy: "pts", growth: "pts" };
export const gapLabel = (r) => (r.gap == null ? "—" : `${r.gap > 0 ? "+" : r.gap < 0 ? "−" : ""}${Math.abs(r.gap).toFixed(r.kind === "cap" ? 0 : 1)}${r.kind === "cap" ? " bp" : r.kind === "rent" ? "%" : " pts"}`);
export const levelLabel = (r) => (r.level == null ? "" : `±${r.level}${r.kind === "cap" ? " bp" : r.kind === "rent" ? "%" : " pts"}`);
// Above or below the market, in words.
export const statusText = (r) => (r.status === "none" ? (r.market == null ? "No market figure" : "—") : r.status === "ok" ? "In line" : r.gap > 0 ? "Above market" : "Below market");

// The latest business plan revision's lease-up rents (average target $/SF).
function planRent(inputs) {
  const revs = inputs?.businessPlan?.revisions ?? [];
  const plan = revs.at(-1)?.plan;
  const xs = (plan?.leasing ?? []).map((l) => num(l.targetRentPSF)).filter((x) => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// mode "valuation": the latest mark (cap rate) and the model's rent, vacancy
// and growth; mode "plan": the business plan's exit cap and lease-up rents.
export function marketCheck(inputs, marketState, { mark = null, flags = DEFAULT_MARKET_FLAGS, mode = "valuation" } = {}) {
  const market = marketOf(marketState ? { market: marketState } : null);
  const sm = market.submarkets.find((s) => s.id === inputs?.submarketId);
  if (!sm) return { submarket: null, rows: [] };
  const sum = submarketSummary(market, sm.id);
  const latest = sum.latest ?? {};
  const mRent = sum.smallBay.latest ?? sum.rent.latest;
  const mGrowth = sum.smallBay.annualPct ?? sum.rent.annualPct;
  const defs = mode === "plan"
    ? [
      ["cap", "Exit cap rate (%)", num(inputs.exitCapRatePct), sum.cap.latest],
      ["rent", "Target lease-up rent ($/SF/yr)", planRent(inputs), mRent],
      ["vacancy", "Vacancy (%)", num(inputs.vacancyPct), sum.vacancy.latest],
      ["growth", "Rent growth (%/yr)", num(inputs.annualRentEscalationPct), mGrowth],
    ]
    : [
      ["cap", `Cap rate (${mark?.capRate != null ? "mark" : "exit, no mark cap rate"}) (%)`, num(mark?.capRate) ?? num(inputs.exitCapRatePct), sum.cap.latest],
      ["rent", "Market rent ($/SF/yr)", num(inputs.rentPerSF), mRent],
      ["vacancy", "Vacancy (%)", num(inputs.vacancyPct), sum.vacancy.latest],
      ["growth", "Rent growth (%/yr)", num(inputs.annualRentEscalationPct), mGrowth],
    ];
  const rows = defs.map(([kind, label, asset, mkt]) => ({ kind, label, asset, market: mkt ?? null, ...compare(kind, asset, mkt ?? null, flags) }));
  return {
    submarket: sm, quarter: latest.quarter ?? "", source: latest.source ?? "", sourceDate: latest.sourceDate ?? "",
    rows, worst: rows.some((r) => r.status === "red") ? "red" : rows.some((r) => r.status === "amber") ? "amber" : rows.some((r) => r.status === "ok") ? "ok" : "none",
    units: UNIT, redMultiple: flags.redMultiple,
  };
}

// The latest mark of an asset ({ [quarterEnd]: mark }).
export function latestMark(marks = {}) {
  const q = Object.keys(marks ?? {}).filter((k) => marks[k] && (marks[k].value != null || marks[k].capRate != null)).sort().at(-1);
  return q ? { quarter: q, ...marks[q] } : null;
}
