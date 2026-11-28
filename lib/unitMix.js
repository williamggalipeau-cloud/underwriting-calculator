// ─── Office and industrial mix (1.1.30; user, 11/28) ─────────────────────────
// Each unit carries its use (unit.use: industrial, flex, office, retail,
// other) and the finished office area inside it (unit.officeSF), whatever its
// use. Both are tracked ("both, in 1.1.30"): the use answers what the unit is
// leased as; the office SF answers how the building is finished.
//   - The mix by use: units, SF and in-place rent (vacant units count in SF,
//     not in rent).
//   - Office build-out: the units' office SF ÷ the building's SF. The units'
//     office SF must add up to the building's Office SF (inputs.building
//     .officeSF, 1.1.17), and a difference is flagged.
//   - Targets (inputs.mixTargets: { sf: { use: % }, rent: { use: % },
//     officeBuildoutPct }) are set at underwriting.
//   - At purchase: the closing model's units (inputs.uwBaseline) where the
//     asset has one, else the rent roll on the acquisition date. Today: the
//     rent roll as of today.
// Recorded and shown; not an input to the model, so no return figure moves.
import { unitsToday } from "@/lib/leaseHistory";
import { isSold } from "@/lib/assetStatus";

export const UNIT_USES = [["industrial", "Industrial"], ["flex", "Flex"], ["office", "Office"], ["retail", "Retail"], ["other", "Other"]];
export const USE_KEYS = UNIT_USES.map(([k]) => k);
export const useLabel = (k) => UNIT_USES.find(([x]) => x === k)?.[1] ?? "Industrial";
// A unit with no use entered counts as industrial, marked "not confirmed".
export const unitUse = (u) => (USE_KEYS.includes(u?.use) ? u.use : "industrial");
export const unitUseSet = (u) => USE_KEYS.includes(u?.use);
const n = (v) => Number(v) || 0;
const r1 = (v) => Math.round(v * 10) / 10;
// Office SF inside a unit: entered, else the whole unit when its use is office.
export const officeSFOf = (u) => (u?.officeSF != null && u.officeSF !== "" ? Math.min(n(u.officeSF), n(u.squareFeet) || Infinity) : unitUse(u) === "office" && unitUseSet(u) ? n(u.squareFeet) : 0);
const rentOf = (u) => (u?.leaseStatus === "occupied" ? n(u.currentRentPSF) * n(u.squareFeet) : 0);

export function mixOf(units) {
  const by = Object.fromEntries(USE_KEYS.map((k) => [k, { use: k, label: useLabel(k), units: 0, sf: 0, rent: 0, officeSF: 0 }]));
  let unconfirmed = 0;
  for (const u of units ?? []) {
    const g = by[unitUse(u)];
    g.units++; g.sf += n(u.squareFeet); g.rent += rentOf(u); g.officeSF += officeSFOf(u);
    if (!unitUseSet(u)) unconfirmed++;
  }
  const rows = USE_KEYS.map((k) => by[k]);
  const totalSF = rows.reduce((s, r) => s + r.sf, 0), totalRent = rows.reduce((s, r) => s + r.rent, 0), officeSF = rows.reduce((s, r) => s + r.officeSF, 0);
  for (const r of rows) { r.pctSF = totalSF ? (r.sf / totalSF) * 100 : 0; r.pctRent = totalRent ? (r.rent / totalRent) * 100 : 0; }
  return { rows, units: (units ?? []).length, totalSF, totalRent, officeSF, officeBuildoutPct: totalSF ? (officeSF / totalSF) * 100 : 0, unconfirmed };
}
export const pctOf = (mix, use, basis = "sf") => { const r = mix.rows.find((x) => x.use === use); return r ? (basis === "rent" ? r.pctRent : r.pctSF) : 0; };

export function mixToday(inputs, asOf = new Date().toISOString().slice(0, 10)) { return mixOf(unitsToday(inputs, asOf)); }
export function mixAtPurchase(inputs) {
  const base = inputs?.uwBaseline?.inputs;
  if (base?.units?.length) return mixOf(base.units);
  return inputs?.acquisitionDate ? mixOf(unitsToday(inputs, inputs.acquisitionDate)) : mixOf(inputs?.units ?? []);
}

// The units' office SF against the building's Office SF.
export function officeTie(inputs, units = inputs?.units ?? []) {
  const unitsOffice = units.reduce((s, u) => s + officeSFOf(u), 0);
  const b = inputs?.building?.officeSF;
  const has = b != null && b !== "" && isFinite(Number(b));
  const building = has ? Number(b) : null;
  const diff = has ? unitsOffice - building : 0;
  const ties = !has || Math.abs(diff) < 0.5;
  const sf = (v) => Math.round(Math.abs(v)).toLocaleString("en-US");
  const text = !has ? `Units' office SF is ${sf(unitsOffice)}. The building's Office SF is not entered (asset setup → Building).`
    : ties ? `Units' office SF (${sf(unitsOffice)}) ties to the building's Office SF (${sf(building)}).`
    : `Units' office SF is ${sf(diff)} ${diff < 0 ? "below" : "above"} the building's Office SF of ${sf(building)}.`;
  return { unitsOffice, building, diff, ties, hasBuilding: has, text };
}

// ── Targets ──
export const targetsOf = (inputs) => inputs?.mixTargets ?? null;
const numOrNull = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));
export function setTarget(inputs, basis, use, value) {
  const t = inputs?.mixTargets ?? {};
  if (basis === "officeBuildoutPct") return { ...inputs, mixTargets: { ...t, officeBuildoutPct: numOrNull(value) } };
  return { ...inputs, mixTargets: { ...t, [basis]: { ...(t[basis] ?? {}), [use]: numOrNull(value) } } };
}
export function targetTotal(targets, basis) {
  const t = targets?.[basis];
  if (!t || !USE_KEYS.some((k) => t[k] != null)) return null;
  return USE_KEYS.reduce((s, k) => s + n(t[k]), 0);
}
// Purchase, today and target side by side: one line per use (by SF and by
// rent) and one for the office build-out; "to go" is target − today in points.
export function mixCompare(inputs, asOf) {
  const at = mixAtPurchase(inputs), now = mixToday(inputs, asOf), t = targetsOf(inputs) ?? {};
  const line = (key, label, a, b, target) => ({ key, label, atPurchase: a, today: b, target: target ?? null, toGo: target == null ? null : r1(target - b) });
  const rows = [];
  for (const basis of ["sf", "rent"]) for (const [k, l] of UNIT_USES) {
    const a = pctOf(at, k, basis), b = pctOf(now, k, basis), target = t[basis]?.[k] ?? null;
    if (a || b || target != null) rows.push({ ...line(`${basis}:${k}`, `${l}, % of ${basis === "sf" ? "SF" : "rent"}`, a, b, target), basis, use: k });
  }
  rows.push({ ...line("buildout", "Office build-out, % of building", at.officeBuildoutPct, now.officeBuildoutPct, t.officeBuildoutPct ?? null), basis: "buildout" });
  return { atPurchase: at, today: now, targets: t, rows };
}
export function mixLine(mix) {
  const parts = mix.rows.filter((r) => r.sf > 0).map((r) => `${r1(r.pctSF)}% ${r.label.toLowerCase()}`);
  return parts.length ? `${parts.join(" · ")} (by SF); office build-out ${r1(mix.officeBuildoutPct)}%` : "";
}

// ── Portfolio ──
// One row per asset held and the portfolio weighted by SF (the sum of the
// units, so a large asset counts for more).
export function portfolioMix(deals, asOf = new Date().toISOString().slice(0, 10)) {
  const held = deals.filter((d) => !isSold(d.inputs, asOf));
  const assets = held.map((d) => ({ dealId: d.id, asset: d.inputs?.propertyName ?? d.id, mix: mixToday(d.inputs, asOf) })).filter((a) => a.mix.units > 0);
  const total = mixOf(held.flatMap((d) => unitsToday(d.inputs, asOf)));
  return { assets, total };
}
// Excel rows.
export function mixSheet(deals, asOf) {
  const out = [["Asset", "Use", "Units", "SF", "% of SF", "Annual rent", "% of rent", "Office SF", "Office build-out %", "Target % of SF", "Target % of rent"]];
  for (const d of deals) {
    const m = mixToday(d.inputs, asOf), t = targetsOf(d.inputs) ?? {};
    for (const r of m.rows) if (r.units || t.sf?.[r.use] != null || t.rent?.[r.use] != null) out.push([d.inputs.propertyName ?? d.id, r.label, r.units, r.sf, r1(r.pctSF), Math.round(r.rent), r1(r.pctRent), r.officeSF, "", t.sf?.[r.use] ?? "", t.rent?.[r.use] ?? ""]);
    if (m.units) out.push([d.inputs.propertyName ?? d.id, "Total", m.units, m.totalSF, 100, Math.round(m.totalRent), m.totalRent ? 100 : 0, m.officeSF, r1(m.officeBuildoutPct), "", ""]);
  }
  return out;
}
