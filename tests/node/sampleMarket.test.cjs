// 1.1.5: Sample data → Add sample marks and market data (lib/sampleMarket.js)
// on the fictional Model Fund I fixture: a submarket per sample asset, set so
// the market check is mostly in line (Route 9's rent amber, Harbor Light's cap
// red), and marks after each asset's first six months; user entries kept.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const SM = j(R + "/lib/sampleMarket.js");
const MC = j(R + "/lib/marketCheck.js");
const V = j(R + "/lib/valuations.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const T = "2026-11-25";
const data = FX.workspaceData();
const deals = data.deals.filter((d) => d.inputs.fundName === "Model Fund I").map((d) => snapshotDeal(d.inputs, d.id));
const sample = deals.filter((d) => d.id.startsWith("sample-deal-"));

const r = SM.addSampleMarketAndMarks({ market: null, valuations: {}, deals, todayISO: T });
ok(r.counts.submarkets === sample.length && r.counts.stats === sample.length * 8 && r.counts.tagged === sample.length, `a submarket with 8 quarters for each of the ${sample.length} sample assets, each tagged (${JSON.stringify(r.counts)})`);
ok(r.market.submarkets.every((s) => s.id.startsWith(SM.SAMPLE_SM_PREFIX) && /\(fictional\)$/.test(s.name)), "submarkets are fictional and marked as samples");
ok(r.market.stats.every((s) => /^\d{4}-Q[1-4]$/.test(s.quarter) && s.quarter <= "2026-Q3" && s.askingRentSmallBayPSF > 0 && s.capRatePct > 0), "quarterly stats up to the last completed quarter (2026-Q3)");
ok(!Object.keys(r.tags).some((id) => !id.startsWith("sample-deal-")), "only sample assets are tagged");
// Market check
const status = {};
for (const d of sample) {
  const c = MC.marketCheck({ ...d.inputs, submarketId: r.tags[d.id] }, r.market, { mark: MC.latestMark(r.valuations[d.id]) });
  status[d.inputs.propertyName] = Object.fromEntries(c.rows.map((x) => [x.kind, x.status]));
}
ok(status["Route 9 Small Bay"].rent === "amber", `Route 9: rent amber vs its submarket (${JSON.stringify(status["Route 9 Small Bay"])})`);
ok(status["Harbor Light Industrial"].cap === "red", `Harbor Light: cap rate red vs its submarket (${JSON.stringify(status["Harbor Light Industrial"])})`);
const others = Object.entries(status).filter(([n]) => !["Route 9 Small Bay", "Harbor Light Industrial"].includes(n));
ok(others.every(([, s]) => Object.values(s).every((x) => x === "ok")), "every other asset in line on all four measures");
// Marks
const lastQ = V.lastCompletedQuarterEnd(T);
for (const d of sample) {
  const ms = r.valuations[d.id] ?? {};
  const costUntil = new Date(`${d.inputs.acquisitionDate}T00:00:00Z`); costUntil.setUTCMonth(costUntil.getUTCMonth() + 6);
  ok(Object.keys(ms).every((q) => q > costUntil.toISOString().slice(0, 10) && q <= lastQ), `${d.inputs.propertyName}: marks only after the first six months, up to ${lastQ} (${Object.keys(ms).join(", ") || "none yet"})`);
}
ok(r.counts.marks >= 2 && r.valuations["sample-deal-2"]?.["2026-09-30"]?.source === "internal", "Route 9 has a 9/30/2026 internal mark");
const r9 = r.valuations["sample-deal-2"]["2026-09-30"], r9cost = sample[1].inputs.purchasePrice + (sample[1].inputs.capexBudget || 0);
ok(r9.value < r9cost && r9.value > r9cost * 0.95, `Route 9 marked a little below cost (${r9.value} vs ${r9cost})`);
const av = V.assetValuation(sample[1], r.valuations["sample-deal-2"], { todayISO: T });
ok(av.byQuarter.get("2026-09-30")?.basis === "internal", "the Valuation tab reads it as an internal mark");
// Reruns and user entries
const mine = { submarkets: [{ id: "sm-mine", name: "My Submarket" }], stats: [{ id: "ms-mine", submarketId: "sm-mine", quarter: "2026-Q3" }] };
const myMarks = { "sample-deal-2": { "2026-09-30": { value: 1, source: "appraisal", notes: "Mine" } } };
const r2 = SM.addSampleMarketAndMarks({ market: { ...r.market, ...{ submarkets: [...r.market.submarkets, ...mine.submarkets], stats: [...r.market.stats, ...mine.stats] } }, valuations: myMarks, deals: deals.map((d) => (d.id === "sample-deal-3" ? { ...d, inputs: { ...d.inputs, submarketId: "sm-mine" } } : d)), todayISO: T });
ok(r2.market.submarkets.length === sample.length + 1 && r2.market.stats.length === sample.length * 8 + 1, "a rerun replaces the sample submarkets and stats and keeps the user's");
ok(r2.valuations["sample-deal-2"]["2026-09-30"].notes === "Mine", "a user's mark is kept");
ok(!r2.tags["sample-deal-3"], "an asset tagged to the user's own submarket keeps its tag");
ok(SM.addSampleMarketAndMarks({ deals: deals.filter((d) => !d.id.startsWith("sample-deal-")), todayISO: T }).counts.submarkets === 0, "no sample assets: nothing added");
process.exit(fail ? 1 : 0);
