// ─── Sample capital projects and unit mix (1.1.30) ───────────────────────────
// Fictional sample data for the 13 sample assets, written from each asset as
// it is (AGENTS.md "Everything ties out"):
//   - Capital projects: the asset's own Capex Budget split into named
//     projects, to the dollar, so no figure of the model moves. The plan's
//     single "Capital plan (underwriting)" line becomes the same projects.
//   - Spent: Model Fund I's projects carry no figure of their own; the sample
//     construction jobs (docs/sample-yardi, generated from sampleCapitalJobs
//     below) are named after the projects, and the Capital plan reads their
//     invoices. The joint venture's and separate account's assets have no
//     construction file, so their plans keep the figure entered (complete, on
//     budget), split across the projects.
//   - Unit mix: a use and an office SF on every unit; the units' office SF
//     adds up to the building's Office SF exactly. Targets a few points from
//     today's mix.
// Each piece is added only where the asset has none.
import { PROJECT_TYPES, hasProjects, planCapitalFromInputs, projectsTotal } from "@/lib/capitalProjects";
import { USE_KEYS, mixOf, unitUseSet } from "@/lib/unitMix";
import { SAMPLE_PLAN_STORIES } from "@/lib/samplePlans";

export const SAMPLE_CAPITAL_AS_OF = "2026-10-31"; // the sample construction file's date
const VENTURE_IDS = ["sample-jv-1", "sample-jv-2", "sample-jv-3", "sample-sma-1"];
export function sampleSeed(dealId) {
  const m = /^sample-deal-(\d+)$/.exec(dealId ?? "");
  if (m) return Number(m[1]) - 1;
  const i = VENTURE_IDS.indexOf(dealId);
  return i >= 0 ? 9 + i : -1;
}
const isFundDeal = (id) => /^sample-deal-\d+$/.test(id ?? "");

// [project, type, scope, weight, start month, months, expected return]
const TEMPLATES = [
  ["Roof replacement", "Roof", "TPO overlay and new flashing", 34, 3, 4, "Avoids repairs; insurable"],
  ["Parking lot and truck court", "Parking lot / paving", "Mill, overlay and restripe", 20, 6, 2, "Leasing"],
  ["LED lighting", "Electrical", "Exterior and warehouse fixtures", 10, 2, 3, "Lower common-area cost"],
  ["Spec suites in the vacant units", "Interior", "Office refresh and new flooring", 22, 1, 6, "Rent on the vacant units"],
  ["HVAC replacement", "HVAC", "Rooftop units at the end of their life", 14, 4, 3, "Avoids repairs"],
  ["Exterior painting", "Painting", "All elevations and trim", 8, 5, 2, "Leasing"],
  ["Monument and tenant signage", "Signage", "New monument sign and suite signs", 5, 2, 2, "Leasing"],
  ["Landscaping and irrigation", "Landscaping", "Entry landscaping and a new controller", 6, 4, 2, "Leasing"],
  ["Demise the corner unit", "Demise / Combine", "Split into two small bays with a demising wall", 16, 1, 4, "Faster lease-up at small-bay rent"],
  ["Fire sprinkler upgrades", "Fire / life safety", "Heads and a new riser to current code", 12, 3, 3, "Insurable"],
  ["Domestic water line replacement", "Plumbing", "Main line and backflow preventer", 9, 5, 2, "Avoids repairs"],
  ["Dock and slab repairs", "Structure", "Two dock pits and slab joints", 15, 2, 3, "Avoids repairs"],
  ["Drainage and fencing", "Site", "Regrade the rear lot and new perimeter fence", 11, 6, 3, "Outdoor storage income"],
];
// Assets whose sample construction jobs existed before 1.1.30 keep them by name.
const FIXED = {
  "sample-deal-1": [["Roof replacement, Building B", "Roof", "TPO overlay and new flashing on Building B", 180000, 8, 5, "Avoids repairs; insurable"], ["LED lighting", "Electrical", "Exterior and warehouse fixtures", 50000, 9, 3, "Lower common-area cost"], ["Exterior painting", "Painting", "Both buildings", 40000, 12, 2, "Leasing"]],
  "sample-deal-3": [["Parking lot resurfacing", "Parking lot / paving", "Mill, overlay and restripe", 95000, 3, 2, "Leasing"], ["Roof and dock repairs", "Roof", "Roof patching, two dock levelers", 265000, 4, 6, "Avoids repairs"]],
};
const r5k = (v) => Math.round(v / 5000) * 5000;

// The asset's Capex Budget as projects (their total is the budget, to the dollar).
export function sampleCapitalProjects(inputs, dealId) {
  const B = Math.round(Number(inputs?.capexBudget) || 0), seed = sampleSeed(dealId);
  if (seed < 0 || B <= 0) return [];
  let rows;
  if (FIXED[dealId] && FIXED[dealId].reduce((s, r) => s + r[3], 0) < B) rows = FIXED[dealId].map((r) => [...r]);
  else {
    const picks = [0, 3, 5, 8].map((o) => TEMPLATES[(seed * 2 + o) % TEMPLATES.length]);
    const w = picks.reduce((s, p) => s + p[3], 0);
    rows = picks.map((p) => [p[0], p[1], p[2], Math.max(0, Math.min(B, r5k((B * 0.9 * p[3]) / w))), p[4], p[5], p[6]]);
    while (rows.reduce((s, r) => s + r[3], 0) > B) rows[0][3] -= 5000;
  }
  const rest = B - rows.reduce((s, r) => s + r[3], 0);
  const out = rows.filter((r) => r[3] > 0).map(([project, type, scope, budget, startMonth, months, expectedReturn], i) => ({ id: `scp-${dealId}-${i + 1}`, project, type, scope, budget, startMonth, months, expectedReturn }));
  if (rest > 0) out.push({ id: `scp-${dealId}-c`, project: "Contingency", type: "Contingency", scope: "Held against the projects above", budget: rest, startMonth: 1, months: 0, expectedReturn: "" });
  return out;
}

function addMonthsISO(iso, k) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
// Jobs that existed before 1.1.30: [invoiced share of budget].
const KEPT_JOBS = { "sample-deal-1": { "Roof replacement, Building B": 0.55 }, "sample-deal-3": { "Parking lot resurfacing": 1 } };
// Model Fund I's capital jobs as of the sample construction file: what has
// been invoiced on each project. The total is what the sample plans showed as
// spent before 1.1.30 (about a third of the budget; Harbor Light over its
// budget), on the projects in the order they start. An asset bought after
// 8/31/2026 has no job yet.
export function sampleCapitalJobs(inputs, dealId) {
  if (!isFundDeal(dealId) || !inputs?.acquisitionDate || inputs.acquisitionDate > "2026-08-31") return [];
  const projects = (hasProjects(inputs) ? inputs.capitalProjects : sampleCapitalProjects(inputs, dealId)).filter((p) => p.type !== "Contingency");
  const B = Number(inputs.capexBudget) || 0;
  const over = SAMPLE_PLAN_STORIES[inputs.propertyName]?.capexOver;
  let left = Math.round(B * (over ? 1 + over : 0.35));
  const kept = KEPT_JOBS[dealId] ?? {};
  const spend = new Map();
  for (const p of projects) if (kept[p.project] != null) { const v = Math.round(p.budget * kept[p.project]); spend.set(p.id, v); left -= v; }
  const rest = projects.filter((p) => kept[p.project] == null).sort((a, b) => a.startMonth - b.startMonth);
  rest.forEach((p, i) => {
    const v = Math.max(0, over && i === 0 ? left : Math.min(p.budget, left));
    if (v > 0) { spend.set(p.id, v); left -= v; }
  });
  return projects.filter((p) => spend.get(p.id) > 0).map((p) => {
    const invoiced = spend.get(p.id), complete = invoiced >= p.budget && !(over && invoiced > p.budget);
    let start = addMonthsISO(inputs.acquisitionDate, p.startMonth - 1);
    if (start > "2026-09-15") start = inputs.acquisitionDate > "2026-09-01" ? inputs.acquisitionDate : "2026-09-01";
    const planned = addMonthsISO(start, Math.max(1, p.months));
    const completion = complete ? (planned > SAMPLE_CAPITAL_AS_OF ? SAMPLE_CAPITAL_AS_OF : planned) : "";
    const scheduled = complete ? completion : planned;
    return { projectId: p.id, name: p.project, budget: p.budget, invoiced, committed: Math.max(invoiced, complete ? invoiced : Math.round(p.budget * 0.95)), status: complete ? "Complete" : "In progress", start, completion, scheduled, kept: kept[p.project] != null };
  });
}

// ── Onto an asset ──
const LEGACY = (c) => c.length === 1 && c[0].id === "c1" && !c[0].source;
function withProjects(inp, dealId) {
  return hasProjects(inp) || !(Number(inp?.capexBudget) > 0) ? inp : { ...inp, capitalProjects: sampleCapitalProjects(inp, dealId) };
}
// The plan's single legacy line → the projects (each revision that still holds it).
function planWithProjects(inp, dealId) {
  const bp = inp.businessPlan;
  if (!bp?.revisions?.length || !hasProjects(inp)) return inp;
  if (!bp.revisions.some((r) => LEGACY(r.plan?.capital ?? []))) return inp;
  const revisions = bp.revisions.map((r) => {
    const cap = r.plan?.capital ?? [];
    if (!LEGACY(cap) || Math.abs(Number(cap[0].budget) - projectsTotal(inp.capitalProjects)) > 0.5) return r;
    let rows = planCapitalFromInputs(inp, cap[0].start || inp.acquisitionDate || String(r.at ?? "").slice(0, 10)); // dated from the line it replaces
    if (!isFundDeal(dealId)) { // no construction file: the figure entered, split by budget
      const spent = Number(cap[0].spent) || 0, total = projectsTotal(rows) || 1;
      let used = 0;
      rows = rows.map((c, i) => { const v = i === rows.length - 1 ? spent - used : Math.round((spent * c.budget) / total); used += v; return { ...c, spent: v }; });
    }
    return { ...r, plan: { ...r.plan, capital: rows } };
  });
  return { ...inp, businessPlan: { ...bp, revisions } };
}
export function withSampleCapital(inputs, dealId) {
  if (sampleSeed(dealId) < 0 || !inputs) return inputs;
  let inp = withProjects(inputs, dealId);
  const base = inp.uwBaseline?.inputs;
  if (base) { const b = withProjects(base, dealId); if (b !== base) inp = { ...inp, uwBaseline: { ...inp.uwBaseline, inputs: b } }; }
  return planWithProjects(inp, dealId);
}

// ── Unit mix ──
// A use and an office SF for each unit; the office SF adds up to officeSF.
export function sampleUnitMix(units, officeSF, seed) {
  const list = units ?? [];
  const O = Math.max(0, Math.round(Number(officeSF) || 0));
  const use = list.map((u, i) => ((i + seed) % 4 === 1 ? "flex" : "industrial"));
  if (seed % 4 === 3 && list.length > 2) use[0] = "retail";
  // One office unit where the smallest unit fits inside the building's office SF.
  let officeIdx = -1;
  if (seed % 2 === 0 && list.length > 3) {
    const i = list.reduce((b, u, k) => (Number(u.squareFeet) < Number(list[b].squareFeet) ? k : b), list.length - 1);
    if (Number(list[i].squareFeet) <= O * 0.75) { officeIdx = i; use[i] = "office"; }
  }
  const out = list.map((u, i) => ({ use: use[i], officeSF: i === officeIdx ? Number(u.squareFeet) || 0 : 0 }));
  let left = O - out.reduce((s, x) => s + x.officeSF, 0);
  const others = list.map((u, i) => i).filter((i) => i !== officeIdx && Number(list[i].squareFeet) > 0);
  const weight = (i) => (use[i] === "flex" ? 3 : 1) * Number(list[i].squareFeet);
  const W = others.reduce((s, i) => s + weight(i), 0);
  const pool = left;
  others.forEach((i, k) => {
    const cap = Number(list[i].squareFeet);
    const v = k === others.length - 1 ? left : Math.min(cap, Math.round((pool * weight(i)) / W / 10) * 10);
    out[i].officeSF = Math.max(0, Math.min(cap, v));
    left -= out[i].officeSF;
  });
  return out;
}
function mixedUnits(units, officeSF, seed) {
  if (!units?.length || units.some((u) => unitUseSet(u) || u.officeSF != null)) return units;
  const m = sampleUnitMix(units, officeSF, seed);
  return units.map((u, i) => ({ ...u, use: m[i].use, officeSF: m[i].officeSF }));
}
// Whole-point targets: today's mix by SF and by rent with five points moved
// from flex (else office) to industrial, and two points less office build-out.
export function sampleMixTargets(units) {
  const m = mixOf(units);
  const whole = (basis) => {
    const raw = m.rows.map((r) => (basis === "rent" ? r.pctRent : r.pctSF));
    const fl = raw.map(Math.floor);
    let rem = 100 - fl.reduce((s, x) => s + x, 0);
    raw.map((x, i) => [x - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0) { fl[i]++; rem--; } });
    const t = Object.fromEntries(USE_KEYS.map((k, i) => [k, fl[i]]));
    const from = t.flex >= 5 ? "flex" : t.office >= 5 ? "office" : null;
    if (from && (basis === "rent" ? m.totalRent : m.totalSF)) { t[from] -= 5; t.industrial += 5; }
    return t;
  };
  return { sf: whole("sf"), rent: whole("rent"), officeBuildoutPct: Math.max(0, Math.round(m.officeBuildoutPct) - 2) };
}
export function withSampleMix(inputs, dealId) {
  const seed = sampleSeed(dealId);
  if (seed < 0 || !inputs?.units?.length) return inputs;
  const office = inputs.building?.officeSF;
  let inp = inputs;
  const units = mixedUnits(inp.units, office, seed);
  if (units !== inp.units) inp = { ...inp, units };
  const base = inp.uwBaseline?.inputs;
  if (base?.units?.length) {
    // The closing model's units take the same use and office SF as the unit today.
    const byId = new Map(inp.units.map((u) => [u.id, u]));
    if (!base.units.some((u) => unitUseSet(u) || u.officeSF != null)) {
      const bu = base.units.map((u) => { const t = byId.get(u.id); return t && unitUseSet(t) ? { ...u, use: t.use, officeSF: t.officeSF } : u; });
      inp = { ...inp, uwBaseline: { ...inp.uwBaseline, inputs: { ...base, units: bu } } };
    }
  }
  if (!inp.mixTargets && inp.units.some(unitUseSet)) inp = { ...inp, mixTargets: sampleMixTargets(inp.units) };
  return inp;
}
export const withSample1130 = (inputs, dealId) => withSampleMix(withSampleCapital(inputs, dealId), dealId);
export { PROJECT_TYPES };
