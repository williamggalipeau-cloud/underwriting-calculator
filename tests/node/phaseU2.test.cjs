// Phase U part 2: stress tests in standard deviations and the simulation (lib/stressSigma.js).
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const Z = j(R + "/lib/stressSigma.js");
const M = j(R + "/lib/market.js");
const { underwrite } = j(R + "/lib/calculations.js");
const { applyStress } = j(R + "/lib/stress.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ── Volatility ──
const none = Z.volatility(null, null);
ok(JSON.stringify(none.vol) === JSON.stringify(Z.DEFAULT_VOL) && /SOFR history not loaded/.test(none.source.rateDelta), "no market history: editable defaults (SOFR noted)");
let mk = M.EMPTY_MARKET;
const sm = M.makeSubmarket({ name: "Example Submarket" });
const vac = [4, 4.2, 4.5, 4.4, 5.0, 5.6, 5.9, 6.2, 5.8, 6.4];
const rent = [10, 10.2, 10.4, 10.5, 10.9, 11.1, 11.2, 11.4, 11.5, 11.6];
const cap = [5.5, 5.6, 5.6, 5.7, 5.9, 6.1, 6.2, 6.3, 6.3, 6.4];
const qs = ["2024-Q1", "2024-Q2", "2024-Q3", "2024-Q4", "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"];
mk = { ...mk, submarkets: [sm], stats: qs.map((q, i) => M.makeStat({ submarketId: sm.id, quarter: q, vacancyPct: vac[i], askingRentPSF: rent[i], capRatePct: cap[i] })) };
const v = Z.volatility(mk, sm.id);
const yoy = (a) => a.slice(4).map((x, i) => x - a[i]);
const sd = (xs) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };
ok(close(v.vol.vacancyDelta, sd(yoy(vac))) && /Market Data vacancy \(6 yearly changes\)/.test(v.source.vacancyDelta), "vacancy volatility from the submarket's yearly changes");
ok(close(v.vol.exitCapDelta, sd(yoy(cap))) && close(v.vol.rentEscDelta, sd(rent.slice(4).map((x, i) => (x / rent[i] - 1) * 100))), "cap rate and rent-growth volatility from Market Data");
ok(v.vol.rateDelta === Z.DEFAULT_VOL.rateDelta, "rates keep the default");
const short = Z.volatility({ ...mk, stats: mk.stats.slice(0, 6) }, sm.id);
ok(short.vol.vacancyDelta === Z.DEFAULT_VOL.vacancyDelta, "fewer than three yearly changes: the default");

// ── Sigmas ──
const f = { vacancyDelta: 3, rentEscDelta: 0, rateDelta: 120, exitCapDelta: 0.75, opexDelta: 0, constructionDelta: 0 };
const s1 = Z.sigmas(f, Z.DEFAULT_VOL);
ok(s1.vacancyDelta === 2 && s1.rateDelta === 1 && close(s1.exitCapDelta, 1.5) && s1.opexDelta === 0, "each shock in standard deviations (e.g. +150 bp... here +0.75 pt cap = 1.5σ)");
const one = Z.combinedSigma({ ...Object.fromEntries(Z.FACTORS.map((k) => [k, 0])), rateDelta: 120 }, Z.DEFAULT_VOL);
ok(one >= 1 && one < 1.6, "one factor alone (others unchanged): at least its own sigma, since correlated factors would usually move too");
const both = Z.combinedSigma({ ...Object.fromEntries(Z.FACTORS.map((k) => [k, 0])), rateDelta: 120, exitCapDelta: 0.5 }, Z.DEFAULT_VOL);
ok(both > 1 && both < Math.SQRT2, "two correlated 1σ moves together: less unusual than if independent");

// ── Linear algebra and RNG ──
const L = Z.cholesky(Z.DEFAULT_CORR);
ok(L && Z.DEFAULT_CORR.every((row, i) => row.every((x, k) => close(L[i].reduce((s, l, m) => s + l * (L[k][m] ?? 0), 0), x, 1e-9))), "the correlations are consistent (Cholesky reproduces them)");
ok(Z.cholesky([[1, 2], [2, 1]]) === null, "inconsistent correlations are refused");
const g = Z.rng(3), xs = Array.from({ length: 20000 }, () => g());
const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
ok(Math.abs(mean) < 0.03 && Math.abs(sd(xs) - 1) < 0.03, "random draws are standard normal");
ok(Z.rng(5)() === Z.rng(5)(), "seeded: a run repeats exactly");

// ── Simulation ──
const d = FX.workspaceData().deals.find((x) => x.id === "sample-deal-1");
const sim = Z.simulate(d.inputs, f, { paths: 800, seed: 11 });
const base = underwrite(d.inputs).returns.irr;
const stressed = underwrite(applyStress(d.inputs, f)).returns.irr;
ok(sim.paths > 750 && close(sim.base, base, 1e-6) && close(sim.stressed, stressed, 1e-6), "base and stressed IRR from the model");
ok(sim.p5 < sim.p50 && sim.p50 < sim.p95 && Math.abs(sim.p50 - base) < Math.abs(sim.p5 - base) + 5, "the distribution spreads around the base case");
ok(sim.probWorse > 0 && sim.probWorse < 0.5 && close(sim.oneIn, 1 / sim.probWorse), `the stressed case: 1 year in ${Math.round(sim.oneIn)}`);
ok(/^this outcome or worse ≈ 1 year in \d+$/.test(Z.oneInText(sim)), "worded as 1 year in N");
ok(JSON.stringify(Z.simulate(d.inputs, f, { paths: 200, seed: 4 }).p50) === JSON.stringify(Z.simulate(d.inputs, f, { paths: 200, seed: 4 }).p50), "same seed, same result");
ok(sim.histogram.reduce((s, h) => s + h.count, 0) === sim.paths, "the histogram covers every path");
const harsher = Z.simulate(d.inputs, { ...f, vacancyDelta: 8, exitCapDelta: 1.5 }, { paths: 800, seed: 11 });
ok(harsher.probWorse < sim.probWorse, "a harsher stress is rarer");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
