// Phase K: fund plan vs. actual (lib/fundPlan.js) and the Sell/Hold fund
// impact helpers (lib/sellHold.js), on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const P = j(R + "/lib/fundPlan.js");
const SH = j(R + "/lib/sellHold.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const TODAY = "2026-11-23";

const data = FX.workspaceData();
const fn = "Model Fund I";
const terms = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], name: fn, capitalActivity: [] };
const raw = data.deals.filter((d) => d.inputs.fundName === fn && !d.id.startsWith("test-"));
const deals = raw.map((d) => snapshotDeal(d.inputs, d.id));
ok(deals.length >= 5, `fixture fund: ${deals.length} assets`);

// ── Projection ──
const p0 = P.fundProjection(deals, terms, { todayISO: TODAY });
const r = p0.returns;
ok(p0.assets.length === deals.length && p0.assets.every((a) => a.equity > 0 && isFinite(a.profit)), "one summary per asset with equity and profit");
ok(isFinite(r.netLpIrr) && isFinite(r.grossIrr) && r.grossIrr > r.netLpIrr, `gross IRR ${r.grossIrr.toFixed(1)}% above net LP IRR ${r.netLpIrr.toFixed(1)}%`);
const called = p0.quarters.reduce((s, q) => s + q.called, 0), dist = p0.quarters.reduce((s, q) => s + q.distributed, 0);
ok(close(called, r.lpCalled, 1) && close(dist, r.lpDistributions, 1), "quarters add up to LP called and distributed");
ok(close(r.netLpTvpi, r.lpDistributions / r.lpCalled), `net LP multiple ${r.netLpTvpi.toFixed(2)}x = distributions ÷ called`);
ok(p0.quarters.reduce((s, q) => s + q.acquired, 0) === deals.length && close(p0.quarters.reduce((s, q) => s + q.deployed, 0), p0.assets.reduce((s, a) => s + a.equity, 0), 1), "deployment by quarter covers every asset's equity");
ok(isFinite(r.gpPromote) && r.gpPromote > 0 && r.gpPromote < r.gpDistributions, `GP promote ${(r.gpPromote / 1e6).toFixed(1)}M is part of GP distributions ${(r.gpDistributions / 1e6).toFixed(1)}M`);
ok(close(P.gpPromote({ lpTotalDistributions: 95, gpTotalDistributions: 15, lpEquity: 95, gpEquity: 5 }), 15 - 0.05 * 110), "GP promote = GP distributions − GP share × total distributions");
ok(p0.years.some((y) => y.noi > 0) && p0.years.every((y) => y.cashYield == null || y.cashYield >= 0), "fund NOI and LP cash yield by year");
ok(p0.years.every((y) => y.cashYield == null || y.cashYield < 30) && p0.years.some((y) => y.distributed > y.incomeDistributed + 1), `cash yield counts operating distributions only, not sale proceeds (max ${Math.max(...p0.years.map((y) => y.cashYield ?? 0)).toFixed(1)}%)`);
ok(p0.dates.fundEnd > p0.dates.finalClose && p0.dates.extendedEnd >= p0.dates.fundEnd, "fund dates carried");

// ── Freeze and versions ──
const plan1 = P.freezePlan(p0, { by: "cfo@example.com", at: "2026-01-15T12:00:00Z", note: "Final close model" });
let fp = P.addPlanVersion(undefined, plan1);
ok(fp.versions.length === 1 && fp.versions[0].v === 1 && fp.versions[0].label === "Original plan" && fp.versions[0].by === "cfo@example.com", "v1 is the original plan, with who and when");
const keepIrr = p0.returns.netLpIrr; p0.returns.netLpIrr = 999; ok(fp.versions[0].returns.netLpIrr === keepIrr, "frozen plan is a copy (later changes don't touch it)"); p0.returns.netLpIrr = keepIrr;
fp = P.addPlanVersion(fp, P.freezePlan(p0));
ok(fp.versions.length === 2 && fp.versions[1].label === "Re-forecast 1" && fp.versions[0].label === "Original plan", "re-forecast saved as v2; the original stays");
ok(JSON.parse(JSON.stringify(fp)).versions[1].quarters.length === p0.quarters.length, "a plan survives saving as JSON");

// ── Same model → no variance ──
const plan = fp.versions[0];
const same = P.planCompare(plan, p0, null, TODAY);
ok(same.projected.every((x) => x.variance == null || close(x.variance, 0)), "plan vs. an unchanged forecast: no change in projected returns");
const a0 = P.planAttribution(plan, p0);
ok(a0.byAsset.every((x) => close(x.delta, 0)) && a0.causes.every((c) => close(c.delta, 0, 1e-3)) && close(a0.total, 0, 1e-3), "attribution: all zero when nothing changed");

// ── Plan to date ──
const ptd = P.planToDate(plan, "2026-06-30");
const qs = plan.quarters.filter((q) => q.quarter <= "2026-Q2");
ok(close(ptd.deployed, qs.reduce((s, q) => s + q.deployed, 0)) && ptd.acquired === qs.reduce((s, q) => s + q.acquired, 0), `plan to 6/30/26: ${ptd.acquired} assets, $${(ptd.deployed / 1e6).toFixed(1)}M deployed`);
const act = { called: ptd.called + 1_000_000, distributed: ptd.distributed, nav: 50_000_000, deployed: ptd.deployed, acquired: ptd.acquired };
const c1 = P.planCompare(plan, p0, act, "2026-06-30", { netIrr: 12, tvpi: 1.8, grossIrr: 16 });
const row = (k) => c1.toDate.find((x) => x.key === k);
ok(close(row("called").variance, 1_000_000) && close(row("acquired").variance, 0), "variance = actual − plan (called +$1.0M, assets 0)");
ok(row("nav").plan == null && row("nav").actual === 50_000_000 && isFinite(row("tvpi").actual), "NAV and interim TVPI: actual only");
ok(c1.projected.find((x) => x.key === "netLpIrr").target === 12 && c1.projected.find((x) => x.key === "netLpTvpi").target === 1.8, "targets carried to the projected table");

// ── A changed forecast: price up on one asset, one asset dropped ──
const changed = raw.map((d) => ({ ...d, inputs: { ...d.inputs } }));
changed[0].inputs.purchasePrice += 500_000;
const dropped = changed.pop();
const p1 = P.fundProjection(changed.map((d) => snapshotDeal(d.inputs, d.id)), terms, { todayISO: TODAY });
const a1 = P.planAttribution(plan, p1);
const sumCauses = a1.causes.reduce((s, c) => s + c.delta, 0);
ok(close(sumCauses, a1.total, 1), `causes add up to the total change ($${(a1.total / 1e6).toFixed(2)}M)`);
const dr = a1.byAsset.find((x) => x.id === dropped.id);
ok(dr && dr.status === "dropped" && close(dr.delta, -dr.planProfit) && close(a1.causes.find((c) => c.key === "deployment").delta, dr.delta), "dropped asset: its plan profit is lost, booked to deployment");
ok(close(a1.causes.find((c) => c.key === "pricing").delta, -500_000), "pricing: −$500k for the higher purchase price");
ok(a1.byAsset[0].delta <= a1.byAsset.at(-1).delta, "assets sorted from most costly to most helpful");
const c2 = P.planCompare(plan, p1, null, TODAY);
ok(c2.projected.find((x) => x.key === "netProfit").variance < 0, "projected net profit falls");

// ── Quarters ──
const q = P.planQuarters(plan, p1, [{ quarter: "2026-Q1", called: 100, distributed: 0 }, { quarter: "2026-Q2", called: 50, distributed: 10 }]);
ok(q.length >= plan.quarters.length && q[0].quarter <= q.at(-1).quarter, "quarters cover the plan, in order");
const q2 = q.find((x) => x.quarter === "2026-Q2");
ok(q2.cumActualCalled === 150 && q2.cumActualDistributed === 10 && q.find((x) => x.quarter > "2026-Q2").actualCalled === null, "actual columns cumulate and stop after the last actual quarter");
const aq = P.actualQuartersFromValuation([
  { quarterEnd: "2026-03-31", net: { contrib: 100, dist: 0, lpNav: 90 } },
  { quarterEnd: "2026-06-30", net: { contrib: 150, dist: 10, lpNav: 150 } },
  { quarterEnd: "2026-09-30", net: { nm: "no capital", contrib: 0, dist: 0 } },
]);
ok(aq.length === 2 && aq[1].called === 50 && aq[1].distributed === 10, "Valuation tab's cumulative LP figures → per quarter");

// ── Excel rows ──
const rows = P.fundPlanXlsx(fn, plan, c1, q, a1);
ok(rows[0][0].includes(fn) && rows.some((x) => x[0] === "By cause") && rows.some((x) => x[0] === "Total"), "Excel: title, cause and total rows");

// ── Sell/Hold: all-asset hold change, term flags, new fund figures ──
const D = "2026-11-23";
const an = Object.fromEntries(deals.map((d) => [d.id, SH.assetSellHold(d, { decisionDate: D, hurdlePct: 9, fund: terms })]));
const okIds = deals.filter((d) => an[d.id].status === "ok").map((d) => d.id);
ok(okIds.length > 0, `${okIds.length} assets held on the decision date`);
const s1 = SH.allHoldDecisions(deals, an, { mode: "shift", years: 1 });
ok(okIds.every((id) => { const dd = s1.decisions[id]; const want = an[id].baseHold + 1; const max = an[id].maxHold; return want > max ? dd.years === max || dd.decision === "base" : dd.decision === "hold" && dd.years === want; }), "+1 year: each held asset holds one more year (capped at the extended term)");
const s0 = SH.allHoldDecisions(deals, an, { mode: "shift", years: 0 });
ok(Object.values(s0.decisions).every((dd) => dd.decision === "base"), "+0 years = base plan");
const s9 = SH.allHoldDecisions(deals, an, { mode: "set", years: 99 });
ok(s9.capped.length === okIds.length && s9.capped.every((c) => c.reason === "past the final extended term" && c.used === an[c.id].maxHold), "year 99: every asset capped at the final extended term, and flagged");
const f9 = SH.termFlags(deals, an, s9.decisions);
ok(f9.length > 0 && f9.every((f) => f.lastAllowed && f.exitDate > terms.finalClose), `past-term flags: ${f9.length} assets, at the last year allowed`);
ok(SH.termFlags(deals, an, {}).every((f) => an[f.id].baseHold === f.years), "base plan: flags only base holds past the term");
const base = SH.fundScenario(deals, terms, {}, { decisionDate: D, todayISO: TODAY, analyses: an });
const longer = SH.fundScenario(deals, terms, s1.decisions, { decisionDate: D, todayISO: TODAY, analyses: an });
ok(isFinite(base.netLpTvpi) && isFinite(base.lpDpiAtTerm) && isFinite(base.gpPromote) && base.fundEnd && base.extendedEnd, `fund figures: TVPI ${base.netLpTvpi.toFixed(2)}x, DPI by term end ${base.lpDpiAtTerm.toFixed(2)}x, GP promote $${(base.gpPromote / 1e6).toFixed(1)}M`);
ok(base.lpDpiAtTerm <= base.netLpTvpi + 1e-9, "DPI by the end of the term ≤ TVPI at the end");
ok(longer.netLpIrr !== base.netLpIrr && longer.lpDpiAtTerm <= base.lpDpiAtTerm + 1e-9, `holding one more year changes net LP IRR (${base.netLpIrr.toFixed(1)}% → ${longer.netLpIrr.toFixed(1)}%) and doesn't raise DPI by term end`);

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
