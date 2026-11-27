// 1.1.17 (user, 11/27): SNDAs (subordination, non-disturbance and attornment
// agreements). A lender usually wants one from each tenant, or from the
// larger ones; the lease says how fast the tenant must sign.
//
//   unit.snda                 { status, requestedOn, signedOn, lender, docId, note }
//     status: "" (follow the loan's rule) | "not_required" | "required" |
//             "requested" | "signed"
//     tenant (1.1.25): the tenant the status was recorded for. A status
//     recorded for a former tenant no longer counts once a new tenant's lease
//     is in effect (the loan's rule applies to the new lease afresh).
//   inputs.loanTerms.sndaRule   "none" | "all" | "min_sf"   which leases the loan requires one from
//   inputs.loanTerms.sndaMinSF  the size for "min_sf"
// With no rule set, none is assumed (user, 11/27: "none until you set it").
//
// The signed SNDA is a document on the asset, filed as "other" with the unit
// in its title ("[snda:<unit name>] file.pdf"), so no new database type is
// needed; Claude's abstract of it has doc_type "snda".
import { inputsToday } from "@/lib/leaseHistory";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const norm = (s) => String(s ?? "").trim().toLowerCase();

export const SNDA_STATUSES = [["", "Follow the loan"], ["not_required", "Not required"], ["required", "Required, not requested"], ["requested", "Requested"], ["signed", "Signed"]];
export const SNDA_RULES = [["none", "None"], ["all", "All leases"], ["min_sf", "Leases at or over a size"]];
export const sndaStatusLabel = (k) => SNDA_STATUSES.find(([v]) => v === k)?.[1] ?? k;
export const sndaRuleOf = (inputs) => {
  const t = inputs?.loanTerms ?? {};
  const rule = ["all", "min_sf"].includes(t.sndaRule) ? t.sndaRule : "none";
  return { rule, minSF: rule === "min_sf" ? n(t.sndaMinSF) : 0 };
};
export function sndaRuleText(inputs) {
  const r = sndaRuleOf(inputs);
  return r.rule === "all" ? "all leases" : r.rule === "min_sf" ? `leases of ${Math.round(r.minSF).toLocaleString("en-US")} SF or more` : "none set";
}
const occupied = (u) => u.leaseStatus === "occupied" && String(u.tenantName ?? "").trim() !== "";
// Does the loan's rule ask for an SNDA from this unit's lease?
export function sndaRequiredByLoan(inputs, unit) {
  const r = sndaRuleOf(inputs);
  if (!occupied(unit)) return false;
  return r.rule === "all" || (r.rule === "min_sf" && n(unit.squareFeet) >= r.minSF);
}
// The status shown for a unit: what was entered, else what the loan's rule gives.
export function sndaOf(inputs, unit) {
  const raw = unit?.snda ?? {};
  // 1.1.25: once a new tenant's lease is in effect, a status recorded for the
  // former tenant (or with no tenant recorded, before 1.1.25) no longer counts.
  const former = unit?.leaseTodayKind === "new" && norm(raw.tenant) !== norm(unit?.tenantName);
  const s = former ? {} : raw;
  const entered = SNDA_STATUSES.some(([k]) => k && k === s.status) ? s.status : "";
  const byLoan = sndaRequiredByLoan(inputs, unit);
  const status = entered || (byLoan ? "required" : "not_required");
  return { status, entered: !!entered, label: sndaStatusLabel(status), required: status !== "not_required", signed: status === "signed", requestedOn: s.requestedOn ?? "", signedOn: s.signedOn ?? "", lender: s.lender ?? "", docId: s.docId ?? null, note: s.note ?? "", formerTenant: former && !!(raw.status || raw.signedOn) };
}
export function setSnda(inputs, unitId, patch) {
  return { ...inputs, units: (inputs.units ?? []).map((u) => (u.id === unitId ? { ...u, snda: { ...(u.snda ?? {}), ...patch } } : u)) };
}

// One row per occupied unit, for the Leases tab.
// todayISO (1.1.25): each unit is read on its lease in effect on that date.
const asOfToday = (inputs, todayISO) => (todayISO ? inputsToday(inputs, todayISO) : inputs);
export function sndaRows(inputs0, { todayISO = null } = {}) {
  const inputs = asOfToday(inputs0, todayISO);
  return (inputs?.units ?? []).filter(occupied).map((u) => ({ unitId: u.id, unit: u.name ?? "", tenant: u.tenantName, sf: n(u.squareFeet), rent: n(u.squareFeet) * n(u.currentRentPSF), leaseEnd: u.leaseEnd ?? "", newTenant: u.leaseTodayKind === "new", ...sndaOf(inputs, u) }));
}
// Coverage of one asset's loan: the share of occupied rent and SF under a
// signed SNDA, and how the leases the loan requires one from stand.
export function sndaCoverage(inputs, opts = {}) {
  const rows = sndaRows(inputs, opts);
  const sum = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
  const signed = rows.filter((r) => r.signed), required = rows.filter((r) => r.required);
  const outstanding = required.filter((r) => !r.signed);
  const rent = sum(rows, "rent"), sf = sum(rows, "sf");
  const rule = sndaRuleOf(inputs);
  const status = !required.length ? (rule.rule === "none" ? "none" : "complete") : outstanding.length ? "outstanding" : "complete";
  return {
    rule: rule.rule, ruleText: sndaRuleText(inputs), leases: rows.length, required: required.length, signed: signed.length,
    outstanding: outstanding.length, requested: outstanding.filter((r) => r.status === "requested").length, notRequested: outstanding.filter((r) => r.status === "required").length,
    rentCoveredPct: rent > 0 ? (sum(signed, "rent") / rent) * 100 : null, sfCoveredPct: sf > 0 ? (sum(signed, "sf") / sf) * 100 : null,
    requiredRentCoveredPct: sum(required, "rent") > 0 ? (sum(required.filter((r) => r.signed), "rent") / sum(required, "rent")) * 100 : null,
    status, label: status === "none" ? "No requirement set" : status === "complete" ? "Complete" : `${outstanding.length} outstanding`,
    outstandingTenants: outstanding.map((r) => r.tenant),
  };
}
// Portfolio Debt: one row per loan (asset with a loan), [{ dealId, asset, lender, loan, ...coverage }].
export function sndaByLoan(loans, opts = {}) {
  return (loans ?? []).map((l) => ({ dealId: l.id, asset: l.name, lender: l.lender || "", loan: l.balance, ...sndaCoverage(l.inputs, opts) }));
}

// ── The signed document ──
export const SNDA_TAG = (unitName) => `[snda:${String(unitName ?? "").trim()}]`;
const RE = /^\[snda:([^\]]*)\] (.*)$/;
export const parseSndaTitle = (title) => { const m = RE.exec(title ?? ""); return m ? { unit: m[1], name: m[2] } : null; };
export const sndaDocs = (docs, dealId = null) => (docs ?? []).filter((d) => (!dealId || d.deal_id === dealId) && parseSndaTitle(d.title)).map((d) => ({ ...parseSndaTitle(d.title), id: d.id, dealId: d.deal_id, doc: d }));
// What Claude reads from a signed SNDA:
// { doc_type: "snda", tenant, unit, lender, landlord, loan_amount, date,
//   non_disturbance, attornment, lender_cure_days, lender_liability, quotes }
// rows: each term with what the asset holds, and whether it agrees.
export function sndaDocRows(abstract, inputs0, { todayISO = null } = {}) {
  const inputs = asOfToday(inputs0, todayISO);
  if (!abstract || abstract.doc_type !== "snda") return [];
  const unit = sndaUnit(abstract, inputs);
  const lender = inputs?.loanTerms?.lender || inputs?.lenderName || "";
  const row = (key, label, value, now, ok = null) => ({ key, label, value: value ?? "", now: now ?? "", ok, quote: abstract.quotes?.[key] ?? "" });
  return [
    row("tenant", "Tenant", abstract.tenant, unit?.tenantName ?? "", unit ? norm(unit.tenantName) === norm(abstract.tenant) : false),
    row("unit", "Unit", abstract.unit, unit?.name ?? "", !!unit),
    row("lender", "Lender", abstract.lender, lender, lender ? norm(lender) === norm(abstract.lender) : null),
    row("landlord", "Landlord", abstract.landlord, ""),
    row("date", "Signed", abstract.date, unit?.snda?.signedOn ?? ""),
    row("non_disturbance", "Non-disturbance", abstract.non_disturbance, ""),
    row("attornment", "Attornment", abstract.attornment, ""),
    row("lender_cure_days", "Lender's cure period (days)", abstract.lender_cure_days, ""),
    row("lender_liability", "Limits on the lender's liability", abstract.lender_liability, ""),
  ].filter((r) => r.value !== "" && r.value != null);
}
export function sndaUnit(abstract, inputs0, { todayISO = null } = {}) {
  const inputs = asOfToday(inputs0, todayISO);
  const units = inputs?.units ?? [];
  return units.find((u) => abstract?.unit && norm(u.name) === norm(abstract.unit) && norm(u.tenantName) === norm(abstract.tenant))
    ?? units.find((u) => norm(u.tenantName) === norm(abstract?.tenant) && occupied(u)) ?? null;
}
// Applying a signed SNDA marks its unit's lease signed, with the date, lender and document.
export function applySndaDoc(inputs, abstract, docId = null, opts = {}) {
  const unit = sndaUnit(abstract, inputs, opts);
  if (!unit || abstract?.doc_type !== "snda") return { inputs, applied: false, reason: unit ? "Not an SNDA." : `${abstract?.tenant || "The tenant"} isn't a tenant on this asset's rent roll.` };
  return { inputs: setSnda(inputs, unit.id, { ...(unit.leaseTodayKind === "new" ? { tenant: unit.tenantName ?? "" } : {}), status: "signed", signedOn: abstract.date ?? "", lender: abstract.lender ?? "", docId: docId ?? (sndaOf(inputs, unit).formerTenant ? null : unit.snda?.docId) ?? null }), applied: true, unitId: unit.id };
}

// Excel: status by lease and coverage by loan.
const r1 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v * 10) / 10);
export function sndaXlsx(deals, opts = {}) {
  const out = [["SNDA status by lease"], ["Asset", "Unit", "Tenant", "SF", "Lease end", "SNDA", "Lender", "Requested", "Signed"]];
  for (const d of deals) for (const r of sndaRows(d.inputs, opts)) out.push([d.inputs.propertyName ?? d.id, r.unit, r.tenant, Math.round(r.sf), r.leaseEnd, r.label, r.lender, r.requestedOn, r.signedOn]);
  out.push([], ["SNDA coverage by loan"], ["Asset", "Loan requires", "Leases", "Required", "Signed", "Outstanding", "Rent covered (%)", "SF covered (%)", "Status"]);
  for (const d of deals) { const c = sndaCoverage(d.inputs, opts); out.push([d.inputs.propertyName ?? d.id, c.ruleText, c.leases, c.required, c.signed, c.outstanding, r1(c.rentCoveredPct), r1(c.sfCoveredPct), c.label]); }
  return out;
}
