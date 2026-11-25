// 1.1.2: Sample data → Add sample business plans (lib/samplePlans.js) on the
// fictional Model Fund I fixture: every sample asset gets a plan; Route 9 is
// At Risk and Harbor Light Off Plan on the Asset Watch List; the rest run
// ahead of plan; plans a user made are kept.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const S = j(R + "/lib/samplePlans.js");
const H = j(R + "/lib/home.js");
const B = j(R + "/lib/businessPlan.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const T = "2026-11-25";
const data = FX.workspaceData();
const base = data.deals.filter((d) => d.inputs.fundName === "Model Fund I").map((d) => ({ ...snapshotDeal(d.inputs, d.id), live: true }));
const sample = base.filter((d) => d.id.startsWith("sample-deal-"));

const { updates, skipped } = S.addSamplePlans(base, { todayISO: T });
ok(Object.keys(updates).length === sample.length && skipped.length === 0, `a plan for each of the ${sample.length} sample assets, only those (${Object.keys(updates).length})`);
ok(!updates["test-active"] && !updates["deal-1"], "non-sample deals are not touched");
const bp = updates["sample-deal-2"];
ok(bp.revisions.length === 1 && bp.revisions[0].reason === "Closing" && bp.revisions[0].by === S.SAMPLE_PLAN_BY && bp.revisions[0].budget?.years?.length > 0, "revision 1 is the closing plan with its locked budget, by Sample data (fictional)");
const months = Object.keys(bp.actuals).sort();
ok(months[0] === "2026-04" && months.at(-1) === "2026-10", `actuals from the first full month after closing to last month (${months[0]}–${months.at(-1)})`);
ok(months.every((m) => Math.abs(bp.actuals[m].noi - (bp.actuals[m].egr + bp.actuals[m].opex)) < 0.02), "each month's NOI = revenue + expenses");

const deals = base.map((d) => (updates[d.id] ? { ...d, inputs: { ...d.inputs, businessPlan: updates[d.id] } } : d));
const w = H.planWatchList(deals, data.funds, {}, { todayISO: T });
const by = Object.fromEntries(w.assets.map((a) => [a.name, a]));
ok(w.assets.length === 2, `two assets on the Watch List (${w.assets.map((a) => a.name).join(", ")})`);
ok(by["Route 9 Small Bay"]?.status === "At Risk" && by["Route 9 Small Bay"].noi.pct < -10, `Route 9: At Risk, NOI ${by["Route 9 Small Bay"]?.noi?.pct?.toFixed(1)}% vs plan`);
ok(by["Route 9 Small Bay"]?.goals.some((g) => /milestone late/.test(g)), "Route 9: a late milestone among the other goals missed");
ok(by["Harbor Light Industrial"]?.status === "Off Plan" && by["Harbor Light Industrial"].noi.pct < -3 && by["Harbor Light Industrial"].noi.pct > -10, `Harbor Light: Off Plan, NOI ${by["Harbor Light Industrial"]?.noi?.pct?.toFixed(1)}% vs plan`);
ok(by["Harbor Light Industrial"]?.goals.some((g) => /^Capital .* budget$/.test(g)), "Harbor Light: capital over budget among the other goals missed");
// Others: ahead of plan, no late milestones
for (const d of deals.filter((x) => updates[x.id] && !S.SAMPLE_PLAN_STORIES[x.inputs.propertyName])) {
  const v = B.varianceReport(d.inputs.businessPlan, { kind: "ytd", end: "2026-10" });
  const n = v.rows.find((r) => r.key === "noi");
  const late = d.inputs.businessPlan.revisions[0].plan.milestones.filter((m) => B.milestoneStatus(m, T) === "late");
  ok((n.actual == null || n.actual >= n.plan) && late.length === 0, `${d.inputs.propertyName}: on or ahead of plan, no late milestones (${n.actual == null ? "no actuals yet" : `${(((n.actual - n.plan) / Math.abs(n.plan)) * 100).toFixed(1)}%`})`);
}
// Reruns: the same figures; a user's own plan is kept
const again = S.addSamplePlans(deals, { todayISO: T });
ok(JSON.stringify(again.updates["sample-deal-3"].actuals) === JSON.stringify(updates["sample-deal-3"].actuals), "a rerun replaces the sample plan with the same figures");
const mine = deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, businessPlan: { ...d.inputs.businessPlan, revisions: [{ ...d.inputs.businessPlan.revisions[0], by: "pm@example.com" }] } } } : d));
const kept = S.addSamplePlans(mine, { todayISO: T });
ok(!kept.updates["sample-deal-1"] && kept.skipped.includes("Airport Flex Park"), "an asset with a plan a user made is skipped");
ok(Object.keys(S.addSamplePlans(mine, { todayISO: T, replace: true }).updates).includes("sample-deal-1"), "replace: true overrides that");
ok(Object.keys(S.addSamplePlans(base.filter((d) => !d.id.startsWith("sample-deal-")), { todayISO: T }).updates).length === 0, "no sample assets: nothing added");
process.exit(fail ? 1 : 0);
