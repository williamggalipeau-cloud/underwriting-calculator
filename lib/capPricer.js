// ─── Interest rate cap pricer (market levels) ────────────────────────────────
//
// Prices a SOFR cap as a strip of monthly caplets with the normal (Bachelier)
// model, the market convention for SOFR caps:
//   caplet = N · τ · DF(pay) · [ (F−K)·Φ(d) + σ√T·φ(d) ],  d = (F−K)/(σ√T)
//   F  forward SOFR for the period (from the forward curve)
//   τ  period length, Actual/360
//   DF discount factor to the period's payment date, compounded off the
//      same forward curve from the valuation date
//   T  years from valuation to the period's start
//   σ  normal volatility from VOL_SURFACE (term structure + smile)
//
// VOL_SURFACE was implied from Pensford's cap pricer (pensford.com/
// calculators/cap-pricer) quotes on 11/21/2026: $7.3M notional, 30D Average
// SOFR, 12/24/36/48 months at a 3.91% strike plus 4.50% and 5.50% strikes.
// With the 11/20/2026 forward curve this reproduces all six quotes within 3%.

import { CURVE_INDICES, DEFAULT_CURVE } from "@/lib/forwardCurve";

export const VOL_SURFACE = {
  source: "Implied from Pensford cap pricer quotes",
  asOf: "2026-11-21",
  // [years to caplet start, normal vol in bp]
  termStructure: [
    [0.0, 133.2], [0.25, 135.7], [0.5, 137.8], [0.75, 139.7], [1.0, 147.7],
    [1.25, 147.8], [1.5, 146.8], [1.75, 144.5], [2.0, 134.8], [2.25, 132.5],
    [2.5, 132.4], [2.75, 131.9], [3.0, 128.1], [3.25, 127.0], [3.5, 126.9],
    [3.75, 126.1], [4.0, 122.3],
  ],
  // Vol rises 4.5% per percentage point the strike sits above the forward.
  smilePerPctOTM: 0.045,
};

const DAY = 86_400_000;
const parse = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toISO = (t) => new Date(t).toISOString().slice(0, 10);

function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1 + n, d));
  if (out.getUTCDate() !== d) out.setUTCDate(0); // clamp to month end
  return toISO(out.getTime());
}

const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
function erf(x) {
  // Abramowitz-Stegun 7.1.26 (|error| < 1.5e-7)
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

export function bachelier(F, K, sigma, T) {
  if (T <= 0 || sigma <= 0) return Math.max(F - K, 0);
  const v = sigma * Math.sqrt(T);
  const d = (F - K) / v;
  return (F - K) * Phi(d) + v * phi(d);
}

export function volAt(T, surface = VOL_SURFACE) {
  const ts = surface.termStructure;
  if (T <= ts[0][0]) return ts[0][1];
  for (let i = 1; i < ts.length; i++) {
    if (T <= ts[i][0]) {
      const [a, va] = ts[i - 1];
      const [b, vb] = ts[i];
      return va + ((vb - va) * (T - a)) / (b - a);
    }
  }
  return ts[ts.length - 1][1];
}

// Forward rate (%) for a date: the latest curve reset on or before it.
export function forwardAt(curve, iso, index = "avgSofr30D") {
  const col = CURVE_INDICES[index].col;
  const pts = curve.points;
  if (iso <= pts[0][0]) return pts[0][col];
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid][0] <= iso) lo = mid;
    else hi = mid - 1;
  }
  return pts[lo][col];
}

// Discount factor from valuationISO to iso, compounding monthly forwards.
function discountFactor(curve, valuationISO, iso, index) {
  let df = 1;
  let t = valuationISO;
  while (t < iso) {
    const next = addMonths(t, 1) < iso ? addMonths(t, 1) : iso;
    const tau = (parse(next) - parse(t)) / DAY / 360;
    df /= 1 + (forwardAt(curve, t, index) / 100) * tau;
    t = next;
  }
  return df;
}

// Price a cap. Returns { pv (as of valuation), costAtStart (forward value,
// i.e. what it costs when bought on the start date), caplets[] }.
export function priceCap({
  notional,
  strikePct,
  startISO,
  months = 12,
  curve = DEFAULT_CURVE,
  index = "avgSofr30D",
  valuationISO,
  volShiftBp = 0,
  surface = VOL_SURFACE,
}) {
  const val = valuationISO ?? curve.asOf;
  const K = strikePct / 100;
  const caplets = [];
  let pv = 0;
  for (let i = 0; i < months; i++) {
    const s = addMonths(startISO, i);
    const e = addMonths(startISO, i + 1);
    if (e <= val) continue; // already expired
    const tau = (parse(e) - parse(s)) / DAY / 360;
    const F = forwardAt(curve, s, index) / 100;
    const T = Math.max(0, (parse(s) - parse(val)) / DAY / 365);
    const otm = Math.max(0, (K - F) * 100);
    const sigma = ((volAt(T, surface) + volShiftBp) * (1 + surface.smilePerPctOTM * otm)) / 1e4;
    const df = discountFactor(curve, val, e, index);
    const value = notional * tau * df * bachelier(F, K, sigma, T);
    pv += value;
    caplets.push({ start: s, end: e, forwardPct: F * 100, volBp: sigma * 1e4, years: T, value });
  }
  const dfStart = startISO > val ? discountFactor(curve, val, startISO, index) : 1;
  return { pv, costAtStart: pv / dfStart, caplets };
}

// Market cost of the cap bought on dateISO for `months`. A purchase dated in
// the past is priced as a cap starting on the valuation date (today's market
// is the only one available); a future purchase at its forward value.
export function marketCapCost({ notional, strikePct, dateISO, months = 12, curve, index, valuationISO, volShiftBp }) {
  const val = valuationISO ?? (curve ?? DEFAULT_CURVE).asOf;
  const start = dateISO > val ? dateISO : val;
  return priceCap({ notional, strikePct, startISO: start, months, curve, index, valuationISO: val, volShiftBp }).costAtStart;
}
