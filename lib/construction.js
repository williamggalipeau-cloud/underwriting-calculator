// Phase T: construction jobs and invoices (Yardi Construction Manager style
// exports, by CSV / Excel upload for now), matched to assets and units, and
// TI spend by unit against the business plan's leasing plan. Kept on each
// asset as inputs.construction = { jobs: [{ ...job, invoices: [] }], asOf }.
// Jobs link to Property Condition findings (yardiJob) and Service Contracts
// (yardiContract) by job code.

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const num = (v) => { if (v == null || v === "") return null; const x = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(x) ? x : null; };
const iso = (v) => { const s = String(v ?? "").trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); return m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : ""; };

const JOB_COLS = {
  code: ["job code", "job", "job id", "job number"], property: ["property", "property code", "property id"], propertyName: ["property name"], unit: ["unit", "unit code", "suite"],
  name: ["job name", "description", "name"], category: ["category", "job category", "type"], tenant: ["tenant", "tenant name"],
  originalBudget: ["original budget", "budget"], revisions: ["revisions", "budget revisions", "change orders"], revisedBudget: ["revised budget", "current budget"],
  committed: ["committed", "committed cost"], invoiced: ["invoiced to date", "invoiced", "billed to date"], paid: ["paid to date", "paid"], retainage: ["retainage held", "retainage"],
  remaining: ["remaining budget", "remaining"], status: ["status", "job status"], start: ["start date", "start"], completion: ["completion date", "complete date", "completed"], scheduledCompletion: ["scheduled completion", "estimated completion", "target completion", "est completion", "projected completion"],
};
const INV_COLS = {
  code: ["job code", "job"], property: ["property", "property code"], unit: ["unit"], vendor: ["vendor", "payee"], number: ["invoice number", "invoice", "invoice no"],
  date: ["invoice date", "date"], costCode: ["cost code"], description: ["description"], amount: ["amount", "invoice amount"], status: ["status"],
};
function mapHeader(grid, cols, must) {
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const h = (grid[r] ?? []).map(norm);
    const m = {};
    for (const [k, syn] of Object.entries(cols)) { const i = h.findIndex((x) => syn.includes(x)); if (i >= 0 && !Object.values(m).includes(i)) m[k] = i; }
    if (must.every((k) => m[k] != null)) return { row: r, m };
  }
  return null;
}
// Grids → jobs (with their invoices). kind: "jobs" or "invoices" is detected from the header.
export function detectConstructionFile(grid) {
  if (mapHeader(grid, JOB_COLS, ["code", "originalBudget"])) return "jobs";
  if (mapHeader(grid, INV_COLS, ["code", "amount", "number"])) return "invoices";
  return null;
}
export function parseJobs(grid) {
  const hm = mapHeader(grid, JOB_COLS, ["code", "originalBudget"]);
  if (!hm) return [];
  const g = (r, k) => (hm.m[k] != null ? r[hm.m[k]] : null);
  return grid.slice(hm.row + 1).filter((r) => r && String(g(r, "code") ?? "").trim()).map((r) => {
    const original = num(g(r, "originalBudget")) ?? 0;
    const revisions = num(g(r, "revisions")) ?? 0;
    return {
      code: String(g(r, "code")).trim(), property: String(g(r, "property") ?? "").trim(), propertyName: String(g(r, "propertyName") ?? "").trim(), unit: String(g(r, "unit") ?? "").trim(),
      name: String(g(r, "name") ?? "").trim(), category: String(g(r, "category") ?? "").trim(), tenant: String(g(r, "tenant") ?? "").trim(),
      originalBudget: original, revisions, revisedBudget: num(g(r, "revisedBudget")) ?? original + revisions, committed: num(g(r, "committed")) ?? 0, invoiced: num(g(r, "invoiced")) ?? 0,
      paid: num(g(r, "paid")) ?? 0, retainage: num(g(r, "retainage")) ?? 0, status: String(g(r, "status") ?? "").trim() || "Not started", start: iso(g(r, "start")), completion: iso(g(r, "completion")), scheduledCompletion: iso(g(r, "scheduledCompletion")),
    };
  });
}
export function parseInvoices(grid) {
  const hm = mapHeader(grid, INV_COLS, ["code", "amount", "number"]);
  if (!hm) return [];
  const g = (r, k) => (hm.m[k] != null ? r[hm.m[k]] : null);
  return grid.slice(hm.row + 1).filter((r) => r && String(g(r, "code") ?? "").trim() && num(g(r, "amount")) != null).map((r) => ({
    code: String(g(r, "code")).trim(), property: String(g(r, "property") ?? "").trim(), unit: String(g(r, "unit") ?? "").trim(), vendor: String(g(r, "vendor") ?? "").trim(),
    number: String(g(r, "number") ?? "").trim(), date: iso(g(r, "date")), costCode: String(g(r, "costCode") ?? "").trim(), description: String(g(r, "description") ?? "").trim(), amount: num(g(r, "amount")), status: String(g(r, "status") ?? "").trim(),
  }));
}

// Property → asset (by name, then yardiCode), and unit → the asset's unit.
export function matchAsset(job, deals) {
  return deals.find((d) => job.propertyName && norm(d.inputs?.propertyName) === norm(job.propertyName)) ?? deals.find((d) => job.property && norm(d.inputs?.yardiCode) === norm(job.property)) ?? null;
}
export function matchUnit(inputs, unit) {
  if (!unit) return null;
  const u = norm(unit);
  return (inputs?.units ?? []).find((x) => norm(x.name) === u || norm(x.id) === u || norm(x.name).replace(/^0+/, "") === u.replace(/^0+/, "")) ?? null;
}
// Import jobs and invoices into the assets: { updates: { dealId: construction }, matched, unmatched }.
// A job already there (same code) is replaced, keeping its manual notes; the source is "file".
export function importConstruction(deals, { jobs = [], invoices = [], asOf = "", source = "file" }) {
  const byCode = new Map();
  for (const inv of invoices) { const l = byCode.get(inv.code) ?? []; l.push(inv); byCode.set(inv.code, l); }
  // Invoices whose job wasn't in this upload still attach to an existing job.
  const updates = {};
  const unmatched = [];
  let matched = 0;
  const jobsBy = new Map();
  for (const j of jobs) {
    const d = matchAsset(j, deals);
    if (!d) { unmatched.push(j.propertyName || j.property || j.code); continue; }
    matched++;
    const list = jobsBy.get(d.id) ?? [];
    list.push(j);
    jobsBy.set(d.id, list);
  }
  for (const d of deals) {
    const cur = d.inputs?.construction?.jobs ?? [];
    const incoming = jobsBy.get(d.id) ?? [];
    const curInv = invoices.filter((i) => cur.some((c) => c.code === i.code));
    if (!incoming.length && !curInv.length) continue;
    const merged = [...cur];
    for (const j of incoming) {
      const unit = matchUnit(d.inputs, j.unit);
      const row = { ...j, unitId: unit?.id ?? null, source, invoices: byCode.get(j.code) ?? [] };
      const i = merged.findIndex((x) => x.code === j.code);
      if (i >= 0) merged[i] = { ...merged[i], ...row, notes: merged[i].notes ?? "" }; else merged.push({ ...row, notes: "" });
    }
    for (const c of merged) if (!incoming.some((j) => j.code === c.code) && byCode.has(c.code)) c.invoices = byCode.get(c.code);
    updates[d.id] = { jobs: merged, asOf: asOf || d.inputs?.construction?.asOf || "" };
  }
  return { updates, matched, unmatched: [...new Set(unmatched)] };
}

// ── TI by unit vs. the business plan ──
export const isTI = (j) => /tenant improvement|^ti\b|\bti\b/i.test(j.category || j.name || "");
export function overrunFlag(pct) {
  if (pct == null || !Number.isFinite(pct) || pct <= 5) return "";
  return pct > 20 ? "red" : "amber";
}
export function tiByUnit(inputs) {
  const jobs = inputs?.construction?.jobs ?? [];
  const plan = inputs?.businessPlan?.revisions?.at(-1)?.plan?.leasing ?? [];
  const units = inputs?.units ?? [];
  const rows = [];
  const ids = new Set([...plan.filter((l) => Number(l.tiPSF) > 0).map((l) => l.unitId), ...jobs.filter((j) => isTI(j) && j.unitId).map((j) => j.unitId)]);
  for (const id of ids) {
    const u = units.find((x) => x.id === id);
    const p = plan.find((l) => l.unitId === id);
    const js = jobs.filter((j) => isTI(j) && j.unitId === id);
    const planned = p && Number(p.tiPSF) > 0 ? Number(p.tiPSF) * (Number(p.sf) || Number(u?.squareFeet) || 0) : null;
    const budget = js.reduce((s, j) => s + (j.originalBudget || 0), 0);
    const spent = js.reduce((s, j) => s + (j.invoiced || 0), 0);
    const base = planned ?? (budget || null);
    const overrunPct = base ? ((spent - base) / base) * 100 : null;
    rows.push({ unitId: id, unit: u?.name ?? p?.unit ?? id, tenant: js[0]?.tenant || u?.tenantName || p?.tenant || "", action: p?.action ?? "", planned, budget, revised: js.reduce((s, j) => s + (j.revisedBudget || 0), 0), committed: js.reduce((s, j) => s + (j.committed || 0), 0), spent, paid: js.reduce((s, j) => s + (j.paid || 0), 0), remaining: base != null ? base - spent : null, overrunPct, flag: js.some((j) => j.status !== "Not started") ? overrunFlag(overrunPct) : "", status: js.map((j) => j.status).join(", ") || "No job", jobs: js.map((j) => j.code) });
  }
  const unitless = jobs.filter((j) => isTI(j) && !j.unitId);
  return { rows: rows.sort((a, b) => String(a.unit).localeCompare(String(b.unit))), unitless, totals: { planned: rows.reduce((s, r) => s + (r.planned ?? 0), 0), spent: rows.reduce((s, r) => s + r.spent, 0), committed: rows.reduce((s, r) => s + r.committed, 0) } };
}
// Capital (non-TI) jobs with their link to a condition finding or contract.
export function capitalJobs(inputs) {
  const pm = inputs?.propertyMgmt ?? {};
  return (inputs?.construction?.jobs ?? []).filter((j) => !isTI(j)).map((j) => ({ ...j, finding: (pm.items ?? []).find((i) => i.yardiJob && i.yardiJob === j.code) ?? null, contract: (pm.contracts ?? []).find((c) => c.yardiContract && c.yardiContract === j.code) ?? null, overrunPct: j.originalBudget ? ((j.invoiced - j.originalBudget) / j.originalBudget) * 100 : null }));
}
export function constructionXlsx(deals) {
  const out = [["TI by unit"], ["Asset", "Unit", "Tenant", "Plan action", "Planned TI", "Job budget", "Revised", "Committed", "Spent (invoiced)", "Paid", "Remaining", "Over / (under) %", "Flag", "Status", "Jobs"]];
  for (const d of deals) for (const r of tiByUnit(d.inputs).rows) out.push([d.inputs.propertyName, r.unit, r.tenant, r.action, r.planned ?? "", r.budget, r.revised, r.committed, r.spent, r.paid, r.remaining ?? "", r.overrunPct != null ? Math.round(r.overrunPct * 10) / 10 : "", r.flag, r.status, r.jobs.join(", ")]);
  out.push([], ["Jobs and invoices"], ["Asset", "Job", "Unit", "Name", "Category", "Budget", "Revised", "Committed", "Invoiced", "Paid", "Retainage", "Status", "Invoice", "Vendor", "Date", "Amount", "Invoice status"]);
  for (const d of deals) for (const j of d.inputs?.construction?.jobs ?? []) {
    out.push([d.inputs.propertyName, j.code, j.unit, j.name, j.category, j.originalBudget, j.revisedBudget, j.committed, j.invoiced, j.paid, j.retainage, j.status]);
    for (const i of j.invoices ?? []) out.push(["", "", "", "", "", "", "", "", "", "", "", "", i.number, i.vendor, i.date, i.amount, i.status]);
  }
  return out;
}
