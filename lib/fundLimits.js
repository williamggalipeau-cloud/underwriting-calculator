// ─── Phase L: fund limits, actual vs. limit ──────────────────────────────────
// The investment limits applied from the fund's LPA / PPM (terms.limits, from
// phase E: { key, label, limit, unit, basis, clause, docId, quote }) and any
// internal limits the user adds (terms.internalLimits, same shape, source
// "internal"). Each limit gets the fund's actual figure, the headroom and a
// status: within, near (at 90% of the limit or more), breached, or review
// (a text limit, or one the app can't measure yet).
//
// Actual figures (assets: the fund's deals held; value = the latest mark from
// the Valuation tab, else cost):
//   single_asset_pct   largest asset's equity ÷ commitments
//   single_tenant_pct  largest tenant's annual rent ÷ fund rent (rent rolls)
//   state_pct          largest state's share of value
//   metro_pct          largest metro's share of value (by city until ZIPs are
//                      mapped to MSAs)
//   fund_ltv_pct       property loans ÷ value
//   asset_ltv_pct      highest single-asset loan ÷ value
//   borrowing_pct      sub line balance ÷ commitments
//   hold_years         longest planned hold
//   property_type, non_core_pct, other: review (shown with the document's text)
//
// preAcquisition(): the same with a pipeline deal added, so a breach shows
// before the deal is bought.

import { underwrite } from "@/lib/calculations";
import { LIMIT_KEYS } from "@/lib/dealDocTypes";
import { unitsToday } from "@/lib/leaseHistory";

export const NEAR = 0.9;
export const MEASURED = ["single_asset_pct", "single_tenant_pct", "state_pct", "metro_pct", "fund_ltv_pct", "asset_ltv_pct", "borrowing_pct", "hold_years"];
export const limitLabel = (key) => LIMIT_KEYS.find(([k]) => k === key)?.[1] ?? key;

const num = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")));
const unitRent = (u) => (u?.leaseStatus === "occupied" ? (Number(u.currentRentPSF) || 0) * (Number(u.squareFeet) || 0) : 0);

// One row per asset with what the limits need. values: { [dealId]: latest value }.
// todayISO (1.1.25): tenants are read from the lease in effect on that date.
export function limitInputs(deals, { values = {}, lineBalance = 0, todayISO = null } = {}) {
  const assets = deals.map((d) => {
    const inp = d.inputs ?? {};
    let r = null;
    try { r = underwrite(inp); } catch { r = null; }
    const cost = (Number(inp.purchasePrice) || 0) + (Number(inp.capexBudget) || 0);
    const value = Number(values[d.id]) > 0 ? Number(values[d.id]) : cost;
    const tenants = {};
    for (const u of todayISO ? unitsToday(inp, todayISO) : inp.units ?? []) {
      const name = (u.tenantName ?? "").trim();
      if (name && u.leaseStatus === "occupied") tenants[name] = (tenants[name] ?? 0) + unitRent(u);
    }
    return {
      id: d.id,
      name: inp.propertyName || d.id,
      state: inp.state || "",
      metro: inp.city ? `${inp.city}${inp.state ? `, ${inp.state}` : ""}` : "",
      equity: r?.debt?.equityRequired ?? 0,
      loan: r?.debt?.loanAmount ?? 0,
      value,
      rent: Object.values(tenants).reduce((s, x) => s + x, 0),
      tenants,
      hold: Number(inp.holdPeriodYears) || 0,
      propertyType: inp.propertyType || "Industrial",
    };
  });
  return { assets, lineBalance };
}

function maxShare(assets, by, weight) {
  const g = {};
  for (const a of assets) { const k = by(a); if (k) g[k] = (g[k] ?? 0) + weight(a); }
  const total = Object.values(g).reduce((s, x) => s + x, 0);
  const [k, v] = Object.entries(g).sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
  return { name: k, pct: total > 0 ? (v / total) * 100 : null };
}

// The actual figure for a limit key: { value, unit, what }.
export function actualFor(key, { assets, lineBalance }, commitments) {
  const tot = (f) => assets.reduce((s, a) => s + f(a), 0);
  switch (key) {
    case "single_asset_pct": {
      const a = [...assets].sort((x, y) => y.equity - x.equity)[0];
      return { value: a && commitments > 0 ? (a.equity / commitments) * 100 : null, unit: "%", what: a ? a.name : "" };
    }
    case "single_tenant_pct": {
      const all = {};
      for (const a of assets) for (const [t, rent] of Object.entries(a.tenants)) all[t] = (all[t] ?? 0) + rent;
      const total = Object.values(all).reduce((s, x) => s + x, 0);
      const [t, rent] = Object.entries(all).sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
      return { value: total > 0 ? (rent / total) * 100 : null, unit: "%", what: t };
    }
    case "state_pct": { const s = maxShare(assets, (a) => a.state, (a) => a.value); return { value: s.pct, unit: "%", what: s.name }; }
    case "metro_pct": { const s = maxShare(assets, (a) => a.metro, (a) => a.value); return { value: s.pct, unit: "%", what: `${s.name} (by city)` }; }
    case "fund_ltv_pct": { const v = tot((a) => a.value); return { value: v > 0 ? (tot((a) => a.loan) / v) * 100 : null, unit: "%", what: "property loans ÷ value" }; }
    case "asset_ltv_pct": {
      const a = [...assets].filter((x) => x.value > 0).sort((x, y) => y.loan / y.value - x.loan / x.value)[0];
      return { value: a ? (a.loan / a.value) * 100 : null, unit: "%", what: a ? a.name : "" };
    }
    case "borrowing_pct": return { value: commitments > 0 ? (lineBalance / commitments) * 100 : null, unit: "%", what: "sub line balance ÷ commitments" };
    case "hold_years": { const a = [...assets].sort((x, y) => y.hold - x.hold)[0]; return { value: a ? a.hold : null, unit: "years", what: a ? a.name : "" }; }
    case "property_type": return { value: null, unit: "text", what: [...new Set(assets.map((a) => a.propertyType))].join(", ") };
    default: return { value: null, unit: "text", what: "" };
  }
}

export function statusOf(actual, limit) {
  if (actual == null || !isFinite(actual) || !isFinite(limit) || limit <= 0) return "review";
  if (actual > limit + 1e-9) return "breached";
  if (actual >= limit * NEAR) return "near";
  return "within";
}

// All limits (document + internal) with actual, headroom and status.
export function checkLimits(terms, inputs) {
  const commitments = Number(terms.targetEquity) || 0;
  const rows = [
    ...(terms.limits ?? []).map((l) => ({ ...l, source: "document" })),
    ...(terms.internalLimits ?? []).map((l) => ({ ...l, source: "internal" })),
  ];
  return rows.map((l) => {
    const measured = MEASURED.includes(l.key) && l.unit !== "text";
    const a = measured ? actualFor(l.key, inputs, commitments) : actualFor(l.key, inputs, commitments);
    const limit = num(l.limit);
    const status = measured ? statusOf(a.value, limit) : "review";
    return {
      key: l.key,
      label: l.label || limitLabel(l.key),
      source: l.source,
      clause: l.clause ?? "",
      quote: l.quote ?? "",
      basis: l.basis ?? "",
      unit: l.unit ?? "%",
      limit: measured ? limit : l.limit,
      actual: a.value,
      what: a.what,
      headroom: measured && a.value != null && isFinite(limit) ? limit - a.value : null,
      status,
    };
  });
}

// The same with a pipeline deal added (its value = its price + capex).
export function preAcquisition(terms, deals, candidate, opts = {}) {
  const before = checkLimits(terms, limitInputs(deals, opts));
  const after = checkLimits(terms, limitInputs([...deals, candidate], opts));
  return after.map((r, i) => ({ ...r, before: before[i], newBreach: r.status === "breached" && before[i]?.status !== "breached" }));
}

export const STATUS_STYLE = {
  within: { label: "Within", cls: "bg-emerald-50 text-emerald-800" },
  near: { label: "Near (90%+)", cls: "bg-amber-50 text-amber-800" },
  breached: { label: "Breached", cls: "bg-red-50 text-red-700" },
  review: { label: "Review", cls: "bg-gray-100 text-gray-600" },
};

export function limitsXlsx(fundName, rows) {
  return [
    [`${fundName}: fund limits, actual vs. limit`],
    [],
    ["Limit", "Source", "Clause", "Limit value", "Unit", "Actual", "Largest", "Headroom", "Status", "Quote"],
    ...rows.map((r) => [r.label, r.source, r.clause, r.limit, r.unit, r.actual, r.what, r.headroom, STATUS_STYLE[r.status].label, r.quote]),
  ];
}
