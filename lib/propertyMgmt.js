// Phase T: Property Management group (after Asset Management). Four tabs,
// each one asset with a whole-fund view: Property Taxes, Insurance, Property
// Condition, Service Contracts. Kept on each asset (inputs.propertyMgmt), so
// edits save and log like any other; the sections are tables described here.
import { budgetMonth } from "@/lib/businessPlan";

let seq = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
const n = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const sum = (xs) => xs.reduce((s, x) => s + (n(x) ?? 0), 0);

// Column types: text, number (money / plain), date, select, check.
export const PM_TABS = {
  taxes: {
    label: "Property Taxes",
    sections: [
      { key: "parcels", label: "Parcels", cols: [["apn", "Parcel (APN)", "text"], ["address", "Address", "text"], ["assessedValue", "Assessed value ($)", "money"], ["taxRatePct", "Tax rate (%)", "number"], ["assessmentYear", "Assessment year", "number"], ["notes", "Notes", "text"]] },
      { key: "bills", label: "Tax bills", cols: [["parcel", "Parcel", "text"], ["year", "Tax year", "number"], ["installment", "Installment", "text"], ["amount", "Amount ($)", "money"], ["dueDate", "Due", "date"], ["paidDate", "Paid", "date"]] },
      { key: "appeals", label: "Appeals", cols: [["parcel", "Parcel", "text"], ["year", "Tax year", "number"], ["filedDate", "Filed", "date"], ["hearingDate", "Hearing", "date"], ["outcome", "Outcome", "select", ["Pending", "Won", "Settled", "Lost", "Withdrawn"]], ["savings", "Savings ($)", "money"], ["consultant", "Consultant", "text"]] },
    ],
  },
  insurance: {
    label: "Insurance",
    sections: [
      { key: "policies", label: "Policies", cols: [["type", "Coverage", "select", ["Property", "General liability", "Umbrella", "Flood", "Earthquake", "Builder's risk", "Environmental", "Other"]], ["carrier", "Carrier", "text"], ["policyNo", "Policy no.", "text"], ["limit", "Limit ($)", "money"], ["deductible", "Deductible ($)", "money"], ["premium", "Annual premium ($)", "money"], ["effective", "Effective", "date"], ["renewalDate", "Renews", "date"], ["broker", "Broker", "text"]] },
      { key: "claims", label: "Claims log", cols: [["date", "Date of loss", "date"], ["cause", "Cause", "text"], ["policy", "Policy", "text"], ["amount", "Claimed ($)", "money"], ["status", "Status", "select", ["Open", "Closed", "Denied", "Subrogation"]], ["recovery", "Recovered ($)", "money"], ["notes", "Notes", "text"]] },
    ],
  },
  condition: {
    label: "Property Condition",
    sections: [
      { key: "items", label: "Findings", cols: [["source", "Source", "select", ["PCA", "Phase I", "Phase II", "Zoning", "Inspection", "Other"]], ["reportDate", "Report date", "date"], ["system", "System", "select", ["Roof", "HVAC", "Paving / parking", "Structure", "Electrical", "Plumbing", "Fire / life safety", "Environmental", "ADA", "Zoning", "Other"]], ["finding", "Finding", "text"], ["cost", "Cost ($)", "money"], ["urgency", "Urgency", "select", ["Immediate", "Within 1 year", "1–5 years", "5+ years"]], ["status", "Status", "select", ["Open", "In progress", "Done", "Deferred"]], ["yardiJob", "Yardi job", "text"]] },
    ],
  },
  contracts: {
    label: "Service Contracts",
    sections: [
      { key: "contracts", label: "Contracts", cols: [["vendor", "Vendor", "text"], ["service", "Service", "select", ["Landscaping", "HVAC", "Roofing", "Janitorial", "Snow removal", "Fire / life safety", "Security", "Pest control", "Elevator", "Waste", "Other"]], ["start", "Start", "date"], ["end", "End", "date"], ["annualCost", "Annual cost ($)", "money"], ["autoRenew", "Auto-renews", "check"], ["noticeDays", "Notice (days)", "number"], ["yardiContract", "Yardi contract", "text"]] },
    ],
  },
};
export const PM_TAB_IDS = Object.keys(PM_TABS);

export const pmOf = (inputs) => inputs?.propertyMgmt ?? {};
export const rowsOf = (inputs, section) => pmOf(inputs)[section] ?? [];
export function blankRow(tab, section) {
  const s = PM_TABS[tab].sections.find((x) => x.key === section);
  return Object.fromEntries([["id", newId(section)], ...s.cols.map(([k, , type, opts]) => [k, type === "select" ? opts[0] : type === "check" ? false : type === "money" || type === "number" ? null : ""])]);
}
// Immutable edits on an asset's inputs.
export const setSection = (inputs, section, rows) => ({ ...inputs, propertyMgmt: { ...pmOf(inputs), [section]: rows } });

// ── Summaries ──
const yearOf = (iso) => (iso ? iso.slice(0, 4) : "");
export function taxSummary(inputs, year) {
  const bills = rowsOf(inputs, "bills").filter((b) => String(b.year ?? yearOf(b.dueDate)) === String(year));
  const billed = sum(bills.map((b) => b.amount));
  const paid = sum(bills.filter((b) => b.paidDate).map((b) => b.amount));
  const rev = inputs?.businessPlan?.revisions?.at(-1);
  let budget = null;
  if (rev?.budget) {
    let b = 0, any = false;
    for (let m = 1; m <= 12; m++) { const l = budgetMonth(rev.budget, `${year}-${String(m).padStart(2, "0")}`); if (l?.taxes != null) { b += -l.taxes; any = true; } }
    budget = any ? b : null;
  }
  const savings = sum(rowsOf(inputs, "appeals").filter((a) => ["Won", "Settled"].includes(a.outcome)).map((a) => a.savings));
  const assessed = sum(rowsOf(inputs, "parcels").map((p) => p.assessedValue));
  return { year, billed, paid, unpaid: billed - paid, budget, vsBudget: budget != null && billed ? billed - budget : null, vsBudgetPct: budget ? ((billed - budget) / budget) * 100 : null, appealSavings: savings, assessed, openAppeals: rowsOf(inputs, "appeals").filter((a) => a.outcome === "Pending").length };
}
export function insuranceSummary(inputs) {
  const pol = rowsOf(inputs, "policies");
  const claims = rowsOf(inputs, "claims");
  return { policies: pol.length, premium: sum(pol.map((p) => p.premium)), propertyLimit: sum(pol.filter((p) => p.type === "Property").map((p) => p.limit)), openClaims: claims.filter((c) => c.status === "Open" || c.status === "Subrogation").length, claimed: sum(claims.map((c) => c.amount)), recovered: sum(claims.map((c) => c.recovery)) };
}
export const URGENCY = ["Immediate", "Within 1 year", "1–5 years", "5+ years"];
export function conditionSummary(inputs) {
  const items = rowsOf(inputs, "items");
  const open = items.filter((i) => i.status !== "Done");
  return { items: items.length, open: open.length, openCost: sum(open.map((i) => i.cost)), byUrgency: URGENCY.map((u) => ({ urgency: u, count: open.filter((i) => i.urgency === u).length, cost: sum(open.filter((i) => i.urgency === u).map((i) => i.cost)) })), done: sum(items.filter((i) => i.status === "Done").map((i) => i.cost)) };
}
export function contractsSummary(inputs) {
  const cs = rowsOf(inputs, "contracts");
  return { contracts: cs.length, annualCost: sum(cs.map((c) => c.annualCost)), autoRenew: cs.filter((c) => c.autoRenew).length };
}
export const SUMMARY = { taxes: (i, y) => taxSummary(i, y), insurance: insuranceSummary, condition: conditionSummary, contracts: contractsSummary };

// ── Key dates (Home attention list and each tab) ──
const addDays = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) - d * 86400000).toISOString().slice(0, 10);
export function pmDates(deals, todayISO, { within = 60 } = {}) {
  const out = [];
  const days = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86400000);
  for (const d of deals) {
    const inp = d.inputs ?? {};
    const asset = inp.propertyName || d.id;
    const add = (date, kind, tab, text) => { if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && days(date) <= within) out.push({ kind, tab, dealId: d.id, asset, date, days: days(date), text: `${text} (${asset})` }); };
    for (const b of rowsOf(inp, "bills")) if (!b.paidDate) add(b.dueDate, "tax", "taxes", `Property tax ${b.installment ? `${b.installment} ` : ""}due ${b.amount ? `$${Math.round(b.amount).toLocaleString("en-US")}` : ""}`.trim());
    for (const a of rowsOf(inp, "appeals")) if (a.outcome === "Pending") add(a.hearingDate, "tax", "taxes", "Tax appeal hearing");
    for (const p of rowsOf(inp, "policies")) add(p.renewalDate, "insurance", "insurance", `${p.type} policy renews${p.carrier ? ` (${p.carrier})` : ""}`);
    for (const c of rowsOf(inp, "contracts")) {
      if (!c.end) continue;
      const notice = n(c.noticeDays);
      if (notice) add(addDays(c.end, notice), "contract", "contracts", `${c.service} contract: notice deadline${c.autoRenew ? " (auto-renews)" : ""}${c.vendor ? `, ${c.vendor}` : ""}`);
      else add(c.end, "contract", "contracts", `${c.service} contract ends${c.vendor ? ` (${c.vendor})` : ""}`);
    }
    for (const i of rowsOf(inp, "items")) if (i.urgency === "Immediate" && i.status === "Open") out.push({ kind: "condition", tab: "condition", dealId: d.id, asset, date: null, days: null, text: `Immediate repair open: ${i.system}${i.finding ? ` – ${i.finding}` : ""} (${asset})` });
  }
  return out.sort((a, b) => (a.date && b.date ? (a.date < b.date ? -1 : 1) : a.date ? -1 : 1));
}

// ── Excel ──
export function pmXlsx(tab, deals, { year } = {}) {
  const T = PM_TABS[tab];
  const out = [[`${T.label}${year ? ` · ${year}` : ""}`], []];
  for (const s of T.sections) {
    out.push([s.label], ["Asset", ...s.cols.map(([, l]) => l)]);
    for (const d of deals) for (const r of rowsOf(d.inputs, s.key)) out.push([d.inputs.propertyName || d.id, ...s.cols.map(([k, , type]) => (type === "check" ? (r[k] ? "Yes" : "") : r[k] ?? ""))]);
    out.push([]);
  }
  return out;
}

// ── Condition finding → the business plan's capital plan ──
// Adds a project to the latest plan as a new revision (the plan keeps its
// history); the finding remembers the project id. null when there is no plan.
export function addToCapitalPlan(inputs, itemId, { by = "", at = new Date().toISOString(), addRevision } = {}) {
  const bp = inputs?.businessPlan;
  const rev = bp?.revisions?.at(-1);
  const item = rowsOf(inputs, "items").find((i) => i.id === itemId);
  if (!rev || !item || item.planProjectId) return null;
  const start = at.slice(0, 10);
  const months = { Immediate: 3, "Within 1 year": 12, "1–5 years": 36, "5+ years": 60 }[item.urgency] ?? 12;
  const endD = new Date(`${start}T00:00:00Z`);
  endD.setUTCMonth(endD.getUTCMonth() + months);
  const project = { id: `pc-${item.id}`, project: `${item.system}${item.finding ? `: ${item.finding}` : ""}`, scope: `From ${item.source || "condition report"}${item.reportDate ? ` (${item.reportDate})` : ""}; urgency ${item.urgency}`, budget: n(item.cost) ?? 0, start, end: endD.toISOString().slice(0, 10), spent: 0, expectedReturn: "" };
  const plan = { ...rev.plan, capital: [...(rev.plan?.capital ?? []), project] };
  const nextBp = addRevision(bp, { plan, budget: rev.budget, inputs, by, at, reason: "Capital project from Property Condition", note: project.project });
  return { ...setSection(inputs, "items", rowsOf(inputs, "items").map((i) => (i.id === itemId ? { ...i, planProjectId: project.id } : i))), businessPlan: nextBp };
}
