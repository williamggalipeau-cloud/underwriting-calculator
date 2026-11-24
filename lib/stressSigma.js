// Phase U: stress tests in standard deviations, and a simulation. Each
// Stress Testing factor is a one-year move; its volatility (one standard
// deviation of a year's move) comes from Market Data history where there is
// enough (vacancy, rent growth, cap rates), else an editable default. The
// simulation draws thousands of correlated one-year shocks, runs the asset
// model for each, and shows how often the outcome is as bad as the stressed
// case.
import { applyStress } from "@/lib/stress";
import { underwrite } from "@/lib/calculations";
import { seriesFor } from "@/lib/market";

export const FACTORS = ["vacancyDelta", "rentEscDelta", "rateDelta", "exitCapDelta", "opexDelta", "constructionDelta"];
export const FACTOR_LABELS = { vacancyDelta: "Vacancy", rentEscDelta: "Rent growth cut", rateDelta: "Interest rate", exitCapDelta: "Exit cap", opexDelta: "Opex overrun", constructionDelta: "Construction overrun" };
// One standard deviation of a one-year move, in the factor's own units.
export const DEFAULT_VOL = { vacancyDelta: 1.5, rentEscDelta: 2.0, rateDelta: 120, exitCapDelta: 0.5, opexDelta: 5, constructionDelta: 8 };
export const VOL_SOURCE_DEFAULT = { vacancyDelta: "default", rentEscDelta: "default", rateDelta: "default (SOFR history not loaded)", exitCapDelta: "default", opexDelta: "default", constructionDelta: "default" };
// How the factors have tended to move together (adverse direction).
export const DEFAULT_CORR = [
  // vac  rent  rate  cap   opex  cons
  [1.0, 0.6, 0.2, 0.4, 0.1, 0.0],
  [0.6, 1.0, 0.2, 0.4, 0.0, 0.0],
  [0.2, 0.2, 1.0, 0.5, 0.1, 0.1],
  [0.4, 0.4, 0.5, 1.0, 0.0, 0.0],
  [0.1, 0.0, 0.1, 0.0, 1.0, 0.3],
  [0.0, 0.0, 0.1, 0.0, 0.3, 1.0],
];

// ── Volatility from Market Data history ──
const sd = (xs) => { if (xs.length < 2) return null; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };
// Year-over-year changes (4 quarters apart); at least 3 needed.
function yoyChanges(series, key, fn = (a, b) => b - a) {
  const xs = series.filter((s) => s[key] != null);
  const out = [];
  for (let i = 4; i < xs.length; i++) out.push(fn(xs[i - 4][key], xs[i][key]));
  return out;
}
export function volatility(market, submarketId) {
  const vol = { ...DEFAULT_VOL }, source = { ...VOL_SOURCE_DEFAULT };
  if (!market || !submarketId) return { vol, source };
  const s = seriesFor(market, submarketId);
  const set = (k, changes, label) => { const v = sd(changes); if (changes.length >= 3 && v > 0) { vol[k] = v; source[k] = `${label} (${changes.length} yearly changes)`; } };
  set("vacancyDelta", yoyChanges(s, "vacancyPct"), "Market Data vacancy");
  // Rent growth: the std. deviation of year-over-year asking-rent growth, in % points.
  const key = s.filter((x) => x.askingRentSmallBayPSF != null).length >= s.filter((x) => x.askingRentPSF != null).length ? "askingRentSmallBayPSF" : "askingRentPSF";
  set("rentEscDelta", yoyChanges(s, key, (a, b) => (a ? (b / a - 1) * 100 : 0)), "Market Data asking-rent growth");
  set("exitCapDelta", yoyChanges(s, "capRatePct"), "Market Data cap rates");
  return { vol, source };
}

export const sigmas = (factors, vol) => Object.fromEntries(FACTORS.map((k) => [k, vol[k] ? (factors[k] ?? 0) / vol[k] : null]));
// One number for the whole stressed case: the length of its shock vector,
// measured with the correlations (a Mahalanobis distance).
export function combinedSigma(factors, vol, corr = DEFAULT_CORR) {
  const z = FACTORS.map((k) => (vol[k] ? (factors[k] ?? 0) / vol[k] : 0));
  const inv = invert(corr);
  if (!inv) return null;
  let s = 0;
  for (let i = 0; i < z.length; i++) for (let j = 0; j < z.length; j++) s += z[i] * inv[i][j] * z[j];
  return Math.sqrt(Math.max(0, s));
}

// ── Linear algebra (6×6) ──
export function cholesky(a) {
  const n = a.length, L = a.map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = a[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}
function invert(a) {
  const n = a.length, m = a.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    if (Math.abs(m[p][i]) < 1e-12) return null;
    [m[i], m[p]] = [m[p], m[i]];
    const d = m[i][i];
    for (let c = 0; c < 2 * n; c++) m[i][c] /= d;
    for (let r = 0; r < n; r++) if (r !== i) { const f = m[r][i]; for (let c = 0; c < 2 * n; c++) m[r][c] -= f * m[i][c]; }
  }
  return m.map((r) => r.slice(n));
}
// Seeded random numbers, so a run can be repeated.
export function rng(seed = 1) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => { const u1 = Math.max(u(), 1e-12), u2 = u(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); };
}

// ── Simulation ──
// paths: number of draws; returns the IRR distribution and where the stressed case falls.
export function simulate(inputs, stressedFactors, { vol = DEFAULT_VOL, corr = DEFAULT_CORR, paths = 2000, seed = 7 } = {}) {
  const L = cholesky(corr);
  if (!L) throw new Error("The correlations aren't consistent (not positive definite).");
  const norm = rng(seed);
  const irr = (f) => { try { const r = underwrite(applyStress(inputs, f)); return r.returns.irr; } catch { return NaN; } };
  const base = irr(Object.fromEntries(FACTORS.map((k) => [k, 0])));
  const stressed = irr(stressedFactors);
  const out = [];
  for (let p = 0; p < paths; p++) {
    const e = FACTORS.map(() => norm());
    const z = FACTORS.map((_, i) => L[i].reduce((s, l, k) => s + l * e[k], 0));
    const f = Object.fromEntries(FACTORS.map((k, i) => [k, z[i] * vol[k]]));
    const v = irr(f);
    if (Number.isFinite(v)) out.push(v);
  }
  out.sort((a, b) => a - b);
  const pct = (q) => out[Math.min(out.length - 1, Math.max(0, Math.floor(q * (out.length - 1))))];
  const worse = out.filter((v) => v <= stressed).length;
  const p = out.length ? worse / out.length : null;
  return {
    paths: out.length, base, stressed, probWorse: p, oneIn: p ? 1 / p : null,
    p5: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95), mean: out.reduce((a, b) => a + b, 0) / (out.length || 1),
    histogram: histogram(out, 24),
  };
}
function histogram(xs, bins) {
  if (!xs.length) return [];
  const lo = xs[0], hi = xs.at(-1), w = (hi - lo) / bins || 1;
  const h = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count: 0 }));
  for (const x of xs) h[Math.min(bins - 1, Math.floor((x - lo) / w))].count++;
  return h;
}
export function oneInText(sim) {
  if (!sim || sim.probWorse == null) return "";
  if (sim.probWorse === 0) return `worse than every one of ${sim.paths.toLocaleString("en-US")} simulated years`;
  if (sim.probWorse >= 0.5) return `about as likely as not (${Math.round(sim.probWorse * 100)}% of simulated years are as bad or worse)`;
  return `this outcome or worse ≈ 1 year in ${Math.round(sim.oneIn)}`;
}
