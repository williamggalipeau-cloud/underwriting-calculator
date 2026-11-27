// 1.1.24: leases signed after purchase (user, 11/27).
//
// A unit's rent roll fields (tenantName, currentRentPSF, leaseEnd,
// monthsRemaining, rentSteps…) are the lease in place on the day the asset
// was bought: the model counts it down from the purchase date and then
// applies the rollover assumptions. Before 1.1.24 there was nowhere to record
// the lease actually signed afterwards, so an asset owned for a few years
// showed its purchase-day leases, mostly expired.
//
// unit.laterLeases: the leases signed since, in any order:
//   { id, kind: "renewal" | "new", tenantName, start, end (ISO dates),
//     rentPSF ($/SF/yr at the start), escalationPct (% a year),
//     rentSteps?: [{ start, end, rentPSF }], freeMonths, tiPSF, lcPct,
//     source, addedBy, addedAt }
//   - The Rent Roll shows the lease in effect today (leaseToday).
//   - The model uses a later lease for the months it covers (its rent, the
//     actual gap before it, its free rent, TI and commission) and goes back
//     to the rollover assumptions only after the last one ends
//     (lib/calculations.js).
// A unit with no later leases is treated exactly as before.
import { addMonthsISO, analysisStart, leaseEndOf, monthsBetween } from "@/lib/leases";

const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));
export const LATER_LEASE_KINDS = [["renewal", "Renewal"], ["new", "New tenant"]];
export const laterLeaseKindLabel = (k) => LATER_LEASE_KINDS.find(([v]) => v === k)?.[1] ?? k;

let seq = 0;
export const newLaterLeaseId = () => `ll-${Date.now().toString(36)}-${++seq}`;

// A unit's later leases that can be used (dated, with a rent), oldest first.
export function laterLeasesOf(unit) {
  return (Array.isArray(unit?.laterLeases) ? unit.laterLeases : [])
    .filter((l) => l && isISO(l.start) && isISO(l.end) && l.end >= l.start && num(l.rentPSF) > 0)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

// Rent ($/SF/yr) of a later lease on a date: the step in force, else the
// starting rent grown by its annual increase (compounded monthly, as the
// model grows an in-place lease's rent).
export function laterLeaseRentOn(lease, iso) {
  const steps = (lease.rentSteps ?? []).filter((s) => s && isISO(s.start) && isFinite(s.rentPSF));
  const step = steps.find((s) => s.start <= iso && iso <= (s.end || "9999-12-31"));
  if (step) return Number(step.rentPSF);
  const months = Math.max(0, Math.floor(monthsBetween(lease.start, iso) + 1e-9));
  return Number(lease.rentPSF) * Math.pow(1 + (num(lease.escalationPct) ?? 0) / 100, months / 12);
}

// What a new lease is checked against before it is added. Returns an error
// text, or "" when it can be added.
export function laterLeaseError(unit, inputs, lease) {
  if (!isISO(lease?.start) || !isISO(lease?.end)) return "Enter the lease's start and end dates.";
  if (lease.end <= lease.start) return "The lease ends on or before its start.";
  if (!(num(lease.rentPSF) > 0)) return "Enter the rent per SF.";
  if (isISO(inputs?.acquisitionDate) && lease.start <= inputs.acquisitionDate) return "A lease that started on or before the purchase date belongs on the rent roll itself (the lease at purchase), not in the leases signed since.";
  const clash = laterLeasesOf(unit).find((l) => l.id !== lease.id && l.start <= lease.end && lease.start <= l.end);
  if (clash) return `It overlaps the lease recorded from ${clash.start} to ${clash.end}.`;
  return "";
}

// Adds (or replaces, by id) a later lease on one unit of an asset's inputs.
// Returns { inputs } or { error }.
export function addLaterLease(inputs, unitId, lease, { by = "", at = new Date().toISOString(), source = "Entered" } = {}) {
  const unit = (inputs?.units ?? []).find((u) => u.id === unitId);
  if (!unit) return { error: "Unit not found." };
  const l = {
    id: lease.id || newLaterLeaseId(), kind: lease.kind === "renewal" ? "renewal" : "new", tenantName: String(lease.tenantName ?? "").trim(),
    start: lease.start, end: lease.end, rentPSF: num(lease.rentPSF), escalationPct: num(lease.escalationPct) ?? 0,
    ...(Array.isArray(lease.rentSteps) && lease.rentSteps.length ? { rentSteps: lease.rentSteps } : {}),
    freeMonths: num(lease.freeMonths) ?? 0, tiPSF: num(lease.tiPSF) ?? 0, lcPct: num(lease.lcPct),
    source: lease.source || source, addedBy: lease.addedBy ?? by, addedAt: lease.addedAt ?? at,
    ...(lease.prospectId ? { prospectId: lease.prospectId } : {}),
  };
  const error = laterLeaseError(unit, inputs, l);
  if (error) return { error };
  const rest = (unit.laterLeases ?? []).filter((x) => x.id !== l.id);
  return { inputs: { ...inputs, units: inputs.units.map((u) => (u.id === unitId ? { ...u, laterLeases: [...rest, l] } : u)) }, lease: l };
}
export function removeLaterLease(inputs, unitId, leaseId) {
  return { ...inputs, units: (inputs.units ?? []).map((u) => (u.id === unitId ? { ...u, laterLeases: (u.laterLeases ?? []).filter((l) => l.id !== leaseId) } : u)) };
}

// The lease at purchase, as a history row: { tenantName, start: null, end, rentPSF } or null (vacant at purchase).
export function purchaseLease(unit, inputs) {
  if (unit?.leaseStatus !== "occupied") return null;
  return { kind: "purchase", tenantName: unit.tenantName ?? "", start: null, end: leaseEndOf(unit, inputs), rentPSF: Number(unit.currentRentPSF) || 0 };
}

// The lease in effect on a date:
//   { status, kind, tenantName, start, end, rentPSF, lease }
//   status: "later"     a lease signed since purchase is running;
//           "purchase"  the lease at purchase is still running;
//           "ended"     the last recorded lease has ended and nothing newer
//                       is recorded (the model is on its rollover assumptions);
//           "gap"       between two recorded leases, or before the first one
//                       on a unit that was vacant at purchase (vacant);
//           "vacant"    vacant at purchase, nothing recorded since.
export function leaseToday(unit, inputs, todayISO) {
  const later = laterLeasesOf(unit), p = purchaseLease(unit, inputs);
  const cur = later.find((l) => l.start <= todayISO && todayISO <= l.end);
  if (cur) return { status: "later", kind: cur.kind, tenantName: cur.tenantName, start: cur.start, end: cur.end, rentPSF: laterLeaseRentOn(cur, todayISO), lease: cur };
  const past = later.filter((l) => l.end < todayISO), next = later.find((l) => l.start > todayISO);
  if (past.length) {
    const last = past.at(-1);
    if (next) return { status: "gap", kind: null, tenantName: "", start: addDaysISO(last.end, 1), end: addDaysISO(next.start, -1), rentPSF: 0, lease: null, next };
    return { status: "ended", kind: last.kind, tenantName: last.tenantName, start: last.start, end: last.end, rentPSF: laterLeaseRentOn(last, last.end), lease: last };
  }
  // No later lease has started yet.
  if (p && p.end && p.end >= todayISO) return { status: "purchase", kind: "purchase", tenantName: p.tenantName, start: null, end: p.end, rentPSF: p.rentPSF, lease: null };
  if (next) return { status: "gap", kind: null, tenantName: "", start: p?.end ? addDaysISO(p.end, 1) : null, end: addDaysISO(next.start, -1), rentPSF: 0, lease: null, next };
  if (p) return { status: "ended", kind: "purchase", tenantName: p.tenantName, start: null, end: p.end, rentPSF: p.rentPSF, lease: null };
  return { status: "vacant", kind: null, tenantName: "", start: null, end: null, rentPSF: 0, lease: null };
}
const addDaysISO = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// A unit as the Rent Roll, the lease expirations and the Dashboard should
// read it on a date: with later leases, the tenant, rent, lease end and
// occupancy of the lease in effect; otherwise the unit itself (unchanged, the
// same object).
export function unitToday(unit, inputs, todayISO) {
  if (!laterLeasesOf(unit).length) return unit;
  const t = leaseToday(unit, inputs, todayISO);
  if (t.status === "purchase") return unit;
  const occupied = t.status === "later" || t.status === "ended";
  return {
    ...unit, leaseStatus: occupied ? "occupied" : "vacant", tenantName: occupied ? t.tenantName : "", currentRentPSF: occupied ? Math.round(t.rentPSF * 100) / 100 : unit.currentRentPSF,
    leaseEnd: occupied ? t.end : "", monthsRemaining: occupied ? Math.max(0, Math.round(monthsBetween(analysisStart(inputs), t.end))) : 0,
    annualEscalationPct: t.lease ? t.lease.escalationPct ?? unit.annualEscalationPct : unit.annualEscalationPct, rentSteps: t.lease?.rentSteps ?? [], leaseTodayStatus: t.status,
  };
}
export const unitsToday = (inputs, todayISO) => (inputs?.units ?? []).map((u) => unitToday(u, inputs, todayISO));
// The asset's inputs with every unit as of a date (for screens that list leases).
export const inputsToday = (inputs, todayISO) => ((inputs?.units ?? []).some((u) => laterLeasesOf(u).length) ? { ...inputs, units: unitsToday(inputs, todayISO) } : inputs);

// Units whose last recorded lease has ended with nothing newer recorded
// (Rent Roll flag and the Dashboard's attention list):
//   [{ unitId, unit, tenantName, ended }]
export function endedLeases(inputs, todayISO) {
  if (!isISO(inputs?.acquisitionDate) || inputs.acquisitionDate > todayISO) return []; // not owned yet: the rent roll is the seller's
  return (inputs?.units ?? []).map((u) => ({ u, t: leaseToday(u, inputs, todayISO) })).filter(({ t }) => t.status === "ended" && t.end)
    .map(({ u, t }) => ({ unitId: u.id, unit: u.name ?? u.id, tenantName: t.tenantName, ended: t.end }));
}

// A unit's history rows for the Rent Roll, newest first: the later leases,
// the gaps between them (downtime) and the lease at purchase.
export function leaseHistory(unit, inputs) {
  const later = laterLeasesOf(unit), p = purchaseLease(unit, inputs), rows = [];
  let prevEnd = p?.end ?? null;
  const out = [];
  if (p) out.push({ type: "purchase", ...p });
  for (const l of later) {
    if (prevEnd && addDaysISO(prevEnd, 1) < l.start) out.push({ type: "gap", start: addDaysISO(prevEnd, 1), end: addDaysISO(l.start, -1), months: Math.max(1, Math.round(monthsBetween(addDaysISO(prevEnd, 1), l.start))) });
    else if (!prevEnd && isISO(inputs?.acquisitionDate) && inputs.acquisitionDate < l.start) out.push({ type: "gap", start: inputs.acquisitionDate, end: addDaysISO(l.start, -1), months: Math.max(1, Math.round(monthsBetween(inputs.acquisitionDate, l.start))) });
    out.push({ type: "later", ...l });
    prevEnd = l.end;
  }
  void rows;
  return out.reverse();
}

// For the model: each later lease with the hold months it covers
// [ms, me) counted from the analysis start, oldest first; leases that end
// before the analysis start are left out.
export function laterLeaseMonths(unit, inputs) {
  const start = analysisStart(inputs);
  return laterLeasesOf(unit).map((l) => ({ lease: l, ms: Math.max(0, Math.round(monthsBetween(start, l.start))), me: Math.round(monthsBetween(start, addDaysISO(l.end, 1))), dateAt: (m) => addMonthsISO(start, m) })).filter((x) => x.me > x.ms);
}
