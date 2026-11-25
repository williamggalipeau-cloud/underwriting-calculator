// Sample data → Add sample business plans (user, 11/25, patch 1.1.2): a
// fictional business plan (revision 1 at closing: the plan seeded from the
// model, and its locked budget) and monthly actuals from closing to last month
// for each Model Fund I asset. Most assets run a little ahead of plan; two
// miss it on purpose so the Dashboard's Asset Watch List, the Asset Business
// Plan variance and the quarterly report have something to show:
//   Route 9 Small Bay: At Risk, a tenant left early and lease-up is slow
//     (rent about 12% under, more vacancy), a lease-up milestone is late.
//   Harbor Light Industrial: Off Plan, roof and dock repairs over budget, and
//     its capital plan is over budget.
// Nothing outside each asset's business plan changes (the rent roll stays).
import { addMonths, addRevision, assetKpis, budgetFromModel, budgetMonth, seedPlan } from "@/lib/businessPlan";

export const SAMPLE_PLAN_BY = "Sample data (fictional)";
// How each asset's actuals differ from its budget (fractions of the budget).
//   rent / recoveries: × (1 + x); vacancy: extra loss as a share of rent;
//   repairs / otherOpex: × (1 + x); repairsNoi: extra repairs as a share of
//   the month's budgeted NOI; unrecovered: the share of the extra expense
//   tenants don't pay back (the rest comes back as recoveries).
export const SAMPLE_PLAN_STORIES = {
  "Route 9 Small Bay": { status: "At Risk", rent: -0.12, vacancy: 0.03, repairs: 0.05, lateMilestone: true, note: "A tenant left early; lease-up of the vacant suites is slower than planned." },
  "Harbor Light Industrial": { status: "Off Plan", repairsNoi: 0.13, unrecovered: 0.5, capexOver: 0.22, note: "Roof and dock repairs over budget; the capital plan is running over." },
};
// Everyone else: slightly ahead of plan (a fixed amount per asset, so reruns match).
const AHEAD = [0.012, 0.021, 0.008, 0.017, 0.026, 0.011, 0.019, 0.014, 0.023];
const OPEX = ["taxes", "insurance", "utilities", "repairs", "management", "otherOpex"];
const r2 = (n) => Math.round(n * 100) / 100;
const ym = (iso) => String(iso).slice(0, 7);

// A small, repeatable month-to-month wiggle (±1.5%) so the actuals look real.
const wiggle = (seed, i) => 1 + (((Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1) * 0.03);

// Monthly actuals for one asset, from its first full month after closing to
// the month before today.
export function sampleActuals(budget, { name, acquisitionDate, todayISO, seed = 1 }) {
  const story = SAMPLE_PLAN_STORIES[name];
  const ahead = AHEAD[seed % AHEAD.length];
  const first = addMonths(ym(acquisitionDate), Number(String(acquisitionDate).slice(8, 10)) > 1 ? 1 : 0);
  const last = addMonths(ym(todayISO), -1);
  const out = {};
  for (let m = first, i = 0; m <= last; m = addMonths(m, 1), i++) {
    const b = budgetMonth(budget, m);
    if (!b) continue;
    const w = wiggle(seed, i);
    const L = {};
    if (story) {
      // The shortfall builds over the first months (the tenant leaves, repairs start).
      const ramp = Math.min(1, (i + 1) / 3);
      L.rent = b.rent * (1 + (story.rent ?? 0) * ramp);
      L.recoveries = b.recoveries * (1 + (story.rent ?? 0) * ramp * 0.5);
      L.vacancy = b.vacancy - (story.vacancy ?? 0) * ramp * b.rent;
      for (const k of OPEX) L[k] = b[k] * (1 + ((story[k] ?? 0) * ramp)) * (k === "repairs" || k === "utilities" ? w : 1);
      if (story.repairsNoi) L.repairs -= story.repairsNoi * ramp * Math.abs(b.noi) * w;
      // NNN: tenants pay back part of the extra expense.
      const extra = OPEX.reduce((s, k) => s + (L[k] - b[k]), 0);
      if (story.unrecovered != null && b.recoveries) L.recoveries -= extra * (1 - story.unrecovered);
    } else {
      L.rent = b.rent * (1 + ahead);
      L.recoveries = b.recoveries * (1 + ahead / 2);
      L.vacancy = b.vacancy * (1 - ahead);
      for (const k of OPEX) L[k] = b[k] * (k === "repairs" || k === "utilities" ? Math.min(w, 1 + ahead / 2) : 1);
    }
    L.egr = L.rent + L.recoveries + L.vacancy;
    L.opex = OPEX.reduce((s, k) => s + L[k], 0);
    L.noi = L.egr + L.opex;
    for (const k of Object.keys(L)) L[k] = r2(L[k]);
    out[m] = L;
  }
  return out;
}

// One asset's business plan: revision 1 at closing plus actuals.
export function samplePlanFor(inputs, { todayISO, seed = 1 }) {
  const at = `${inputs.acquisitionDate}T12:00:00.000Z`;
  const plan = seedPlan(inputs, { asOf: inputs.acquisitionDate });
  const budget = budgetFromModel(inputs, { label: "Closing budget", at });
  const story = SAMPLE_PLAN_STORIES[inputs.propertyName];
  plan.thesis ||= "Fictional sample plan: buy below replacement cost, lease the vacancy and mark rents to market.";
  plan.strategy ||= "Value-add: lease-up, rent growth on rollover, light capital.";
  // Lease-up targets at the asset's market rent (the vacant units' asking rent).
  if (Number(inputs.rentPerSF) > 0) plan.leasing = plan.leasing.map((l) => (l.action === "Lease up" ? { ...l, targetRentPSF: r2(Number(inputs.rentPerSF)) } : l));
  // KPI targets the asset is meeting today (rounded down), so only the
  // stories' misses show: Route 9 keeps the 95% occupancy target it's short of.
  const now = assetKpis(inputs, todayISO);
  const down = (x, d) => Math.floor(x * 10 ** d) / 10 ** d;
  plan.kpis = plan.kpis.map((k) => {
    if (k.key === "occupancy" && !story?.lateMilestone && isFinite(now.occupancy)) return { ...k, target: down(Math.min(k.target, now.occupancy), 1) };
    if (k.key === "rentPSF" && isFinite(now.rentPSF)) return { ...k, target: down(Math.min(k.target, now.rentPSF), 2) };
    if (k.key === "walt" && isFinite(now.walt)) return { ...k, target: down(Math.min(k.target, now.walt), 1) };
    return k;
  });
  // Milestones already due: done on plan; Route 9 keeps its lease-up late.
  let keptLate = false;
  plan.milestones = plan.milestones.map((m) => {
    if (!(m.due && m.due < todayISO)) return m;
    if (story?.lateMilestone && !keptLate) { keptLate = true; return m; }
    return { ...m, status: "done" };
  });
  if (story?.lateMilestone && !keptLate) plan.milestones.push({ id: `m${plan.milestones.length + 1}`, label: "Lease the vacant suites", due: addDays(todayISO, -30), owner: "", status: "open" });
  // Capital: what has been spent so far (Harbor Light over its budget).
  if (story?.capexOver) {
    const base = Number(inputs.capexBudget) || 250000;
    if (!plan.capital.length) plan.capital.push({ id: "c1", project: "Roof and dock repairs", scope: "Roof patching, two dock levelers", budget: base, start: inputs.acquisitionDate, end: "", spent: 0, expectedReturn: "" });
    plan.capital = plan.capital.map((c) => ({ ...c, spent: Math.round((Number(c.budget) || base) * (1 + story.capexOver)) }));
    plan.kpis = plan.kpis.map((k) => (k.key === "capex" ? { ...k, target: plan.capital.reduce((s, c) => s + (Number(c.budget) || 0), 0) } : k));
  } else {
    // Others: about a third of the capital plan spent, within budget.
    plan.capital = plan.capital.map((c) => ({ ...c, spent: Math.round((Number(c.budget) || 0) * 0.35) }));
  }
  if (story?.note) plan.risks = [{ id: "r1", risk: story.note, mitigation: "Asset manager to update the plan at the next review." }];
  let bp = addRevision({}, { plan, budget, inputs, by: SAMPLE_PLAN_BY, at, note: "Fictional sample plan", reason: "Closing" });
  bp = { ...bp, actuals: sampleActuals(budget, { name: inputs.propertyName, acquisitionDate: inputs.acquisitionDate, todayISO, seed }), actualsSource: { file: "Sample actuals (fictional)", importedAt: `${todayISO}T12:00:00.000Z`, by: SAMPLE_PLAN_BY } };
  return bp;
}
function addDays(iso, k) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
}

// Plans for the sample assets: { updates: { dealId: businessPlan }, skipped }.
// An asset that already has a plan revision is skipped unless replace is set
// (a sample plan added earlier is always replaced).
export function addSamplePlans(deals, { todayISO, replace = false } = {}) {
  const updates = {}, skipped = [];
  const sample = deals.filter((d) => d.id.startsWith("sample-deal-") && d.inputs?.acquisitionDate && d.inputs.acquisitionDate <= todayISO);
  sample.forEach((d) => {
    const revs = d.inputs.businessPlan?.revisions ?? [];
    const ours = revs.length && revs.every((r) => r.by === SAMPLE_PLAN_BY);
    if (revs.length && !ours && !replace) { skipped.push(d.inputs.propertyName); return; }
    const seed = Number(d.id.replace(/\D/g, "")) || 1;
    updates[d.id] = samplePlanFor(d.inputs, { todayISO, seed });
  });
  return { updates, skipped };
}
