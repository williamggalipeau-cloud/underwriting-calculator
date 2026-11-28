// ─── Capital projects (1.1.30; user, 11/28) ──────────────────────────────────
// "Capital projects should all be defined during underwriting and included in
// the asset business plan." The underwriting holds a list of projects
// (inputs.capitalProjects: [{ id, project, type, scope, budget, startMonth,
// months, expectedReturn }]); the Capex Budget the model uses
// (inputs.capexBudget) is the list's total, so no return figure moves. An
// asset with no list keeps its single figure.
//
// The Asset Business Plan's Capital plan carries the list project by project
// (source "underwriting"). A project added after underwriting is "unbudgeted"
// and counted in the tie-out against the underwritten budget. Spent is the
// construction invoices booked to the project's jobs (a job is the project's
// when it is linked to it, when a Property Condition finding in the project
// names the job, or when the two carry the same name); a project with no job
// keeps the figure entered by hand.
//
// Capital projects are the asset manager's and the construction manager's;
// tenant improvements for new leases stay per unit in the leasing assumptions.
import { isTI } from "@/lib/construction";

export const PROJECT_TYPES = ["Roof", "Parking lot / paving", "HVAC", "Electrical", "Plumbing", "Structure", "Fire / life safety", "Interior", "Demise / Combine", "Painting", "Landscaping", "Signage", "Site", "Contingency", "Other"];

const n = (v) => Number(v) || 0;
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function addMonthsISO(iso, k) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// ── Underwriting ──
export const projectsOf = (inputs) => (Array.isArray(inputs?.capitalProjects) ? inputs.capitalProjects : []);
export const hasProjects = (inputs) => projectsOf(inputs).length > 0;
export const projectsTotal = (list) => (list ?? []).reduce((s, p) => s + n(p.budget), 0);
export const blankProject = (id = `cp${Date.now().toString(36)}`) => ({ id, project: "", type: "Other", scope: "", budget: 0, startMonth: 1, months: 1, expectedReturn: "" });
// The list as shown: the projects, or the single Capex Budget as one line.
export function projectsShown(inputs) {
  if (hasProjects(inputs)) return projectsOf(inputs);
  return n(inputs?.capexBudget) > 0 ? [{ ...blankProject("cp-budget"), project: "Capital plan", budget: n(inputs.capexBudget), single: true }] : [];
}
// Saves the list; the Capex Budget becomes its total. An emptied list leaves
// the budget as the single figure it was.
export function setProjects(inputs, list) {
  const clean = (list ?? []).map(({ single, ...p }) => ({ ...p, budget: n(p.budget), startMonth: Math.max(1, Math.round(n(p.startMonth)) || 1), months: Math.max(0, Math.round(n(p.months))) }));
  return clean.length ? { ...inputs, capitalProjects: clean, capexBudget: projectsTotal(clean) } : { ...inputs, capitalProjects: [] };
}
// Does the budget the model uses agree with the list?
export function budgetTies(inputs) {
  return !hasProjects(inputs) || Math.abs(projectsTotal(projectsOf(inputs)) - n(inputs.capexBudget)) < 0.5;
}
export const startLabel = (p) => (p.type === "Contingency" && !n(p.months) ? "" : `Month ${p.startMonth ?? 1}`);

// ── The business plan's Capital plan ──
// Rows for a new plan (revision 1), from the underwriting.
export function planCapitalFromInputs(inputs, asOf) {
  if (hasProjects(inputs)) {
    return projectsOf(inputs).map((p) => {
      const dated = !(p.type === "Contingency" && !n(p.months));
      const start = dated ? addMonthsISO(asOf, (p.startMonth ?? 1) - 1) : "";
      return { id: p.id, project: p.project, type: p.type ?? "Other", scope: p.scope ?? "", budget: n(p.budget), start, end: dated ? addMonthsISO(start, n(p.months)) : "", spent: 0, expectedReturn: p.expectedReturn ?? "", source: "underwriting" };
    });
  }
  return n(inputs?.capexBudget) ? [{ id: "c1", project: "Capital plan (underwriting)", scope: "", budget: inputs.capexBudget, start: asOf, end: addMonthsISO(asOf, 18), spent: 0, expectedReturn: "" }] : [];
}
// Where a row came from: marked on the row, else by whether the closing plan
// (revision 1) held it.
export function rowSource(row, bp) {
  if (row?.source === "underwriting" || row?.source === "unbudgeted") return row.source;
  const first = bp?.revisions?.[0]?.plan?.capital ?? null;
  return !first || first.some((c) => c.id === row?.id) ? "underwriting" : "unbudgeted";
}
// The capital (non-TI) jobs of a project.
export function jobsOfProject(inputs, row) {
  const items = (inputs?.propertyMgmt?.items ?? []).filter((i) => i.planProjectId === row.id && i.yardiJob).map((i) => i.yardiJob);
  return (inputs?.construction?.jobs ?? []).filter((j) => !isTI(j) && (j.planProjectId === row.id || items.includes(j.code) || (norm(j.name) && norm(j.name) === norm(row.project))));
}
const invoicedOf = (j) => ((j.invoices ?? []).length ? j.invoices.reduce((s, i) => s + n(i.amount), 0) : n(j.invoiced));
export const PROJECT_STATUS = { complete: "Complete", underway: "Under way", notStarted: "Not started" };
// The Capital plan as shown: each row with its source, jobs, spent and status.
export function capitalRows(inputs, plan, bp = inputs?.businessPlan) {
  return (plan?.capital ?? []).map((c) => {
    const jobs = jobsOfProject(inputs, c);
    const fromJobs = jobs.length > 0;
    const spent = fromJobs ? Math.round(jobs.reduce((s, j) => s + invoicedOf(j), 0) * 100) / 100 : n(c.spent);
    const done = fromJobs && jobs.every((j) => /complete/i.test(j.status ?? ""));
    const status = done ? "complete" : spent > 0 || jobs.some((j) => /progress/i.test(j.status ?? "")) ? "underway" : "notStarted";
    return { ...c, source: rowSource(c, bp), jobs: jobs.map((j) => j.code), spent, spentFrom: fromJobs ? "invoices" : "entered", remaining: n(c.budget) - spent, status };
  });
}
export const capitalSpent = (inputs, plan, bp) => capitalRows(inputs, plan, bp).reduce((s, r) => s + r.spent, 0);
// The plan against the underwritten budget.
export function capitalTieOut(inputs, plan, bp = inputs?.businessPlan) {
  const rows = capitalRows(inputs, plan, bp);
  const underwritten = n(inputs?.capexBudget);
  const budget = rows.reduce((s, r) => s + n(r.budget), 0);
  const unb = rows.filter((r) => r.source === "unbudgeted");
  const unbudgeted = unb.reduce((s, r) => s + n(r.budget), 0);
  const diff = budget - underwritten;
  const ties = Math.abs(diff) < 0.5 && !unb.length;
  const money = (v) => `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
  let text;
  if (!rows.length && !underwritten) text = "No capital plan";
  else if (ties) text = `Ties to the underwritten budget of ${money(underwritten)}`;
  else {
    const parts = [`${money(diff)} ${diff >= 0 ? "above" : "below"} the underwritten budget of ${money(underwritten)}.`];
    if (unb.length) parts.push(`${unb.length} project${unb.length === 1 ? " was" : "s were"} added after underwriting (${money(unbudgeted)}) and ${unb.length === 1 ? "is" : "are"} not approved.`);
    text = Math.abs(diff) < 0.5 ? `The total equals the underwritten budget of ${money(underwritten)}, but ${unb.length} project${unb.length === 1 ? " was" : "s were"} added after underwriting (${money(unbudgeted)}).` : parts.join(" ");
  }
  return { rows, underwritten, budget, spent: rows.reduce((s, r) => s + r.spent, 0), unbudgeted, unbudgetedCount: unb.length, diff, ties, text };
}
// For the Dashboard: an asset whose plan is above its underwritten budget.
export function capitalOverBudget(inputs) {
  const bp = inputs?.businessPlan;
  const plan = bp?.revisions?.at(-1)?.plan;
  if (!plan) return null;
  const t = capitalTieOut(inputs, plan, bp);
  return t.diff > 0.5 || t.unbudgetedCount ? t : null;
}
// Excel rows: one per project.
export function capitalSheet(deals) {
  const out = [["Asset", "Project", "Type", "Source", "Budget", "Spent", "Spent from", "Remaining", "Start", "End", "Status", "Jobs"]];
  for (const d of deals) {
    const bp = d.inputs?.businessPlan, plan = bp?.revisions?.at(-1)?.plan;
    for (const r of capitalRows(d.inputs, plan, bp)) out.push([d.inputs.propertyName ?? d.id, r.project, r.type ?? "", r.source === "unbudgeted" ? "Unbudgeted" : "Underwriting", n(r.budget), r.spent, r.spentFrom === "invoices" ? "Construction invoices" : "Entered", r.remaining, r.start ?? "", r.end ?? "", PROJECT_STATUS[r.status], r.jobs.join(", ")]);
  }
  return out;
}
