// ─── Tenant insurance (1.1.29; user, 11/28) ──────────────────────────────────
// The Insurance tab has two kinds of insurance. Property insurance is the
// sponsor's (the policies and claims on the asset). Tenant insurance is each
// tenant's own liability cover, which the lease requires and the tenant must
// prove with a certificate.
//
// One row per tenant in place today (the rent roll as of today):
//   - what the lease requires (from the lease read in on the Leases tab), or
//     "no lease on file" for a tenant who is only on the rent roll;
//   - the proof on file (the tenant's certificate, linked to the lease), when
//     it expires, and any shortfall against the lease (lib/dealDocApply.js
//     insuranceGaps, the same check the Risk Report runs);
//   - when proof was requested and received (inputs.tenantInsurance, keyed by
//     tenant: { requested, received, notes }).
// The checks are not new; this brings them onto the tab tenant by tenant and
// turns them into actions and dated events.

import { insuranceGaps, leaseInsuranceRequirements } from "@/lib/dealDocApply";
import { unitsToday } from "@/lib/leaseHistory";
import { isSold } from "@/lib/assetStatus";

export const EXPIRING_DAYS = 60;
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const tenantKey = (name) => norm(name).replace(/ /g, "-");
const iso = (v) => { const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null; };
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const money = (v) => `$${Math.round(v).toLocaleString("en-US")}`;

// The lease's requirements in a line: "CGL $1,000,000 / $2,000,000; umbrella $5,000,000; additional insured".
export function requirementsLabel(req) {
  if (!req) return "";
  const parts = [];
  if (isFinite(req.cglOccurrence) || isFinite(req.cglAggregate)) parts.push(`General liability ${[req.cglOccurrence, req.cglAggregate].filter((x) => isFinite(x)).map(money).join(" / ")}`);
  if (isFinite(req.umbrella)) parts.push(`umbrella ${money(req.umbrella)}`);
  if (isFinite(req.auto)) parts.push(`auto ${money(req.auto)}`);
  if (isFinite(req.pollution)) parts.push(`pollution ${money(req.pollution)}`);
  if (req.workersComp) parts.push("workers' compensation");
  if (req.additionalInsured) parts.push("landlord as additional insured");
  if (req.waiver) parts.push("waiver of subrogation");
  return parts.join("; ");
}

export const TI_STATUS = {
  noLease: { label: "No lease on file", cls: "bg-amber-50 text-amber-800" },
  noProof: { label: "No proof on file", cls: "bg-red-50 text-red-700" },
  expired: { label: "Proof expired", cls: "bg-red-50 text-red-700" },
  shortfall: { label: "Below the lease", cls: "bg-red-50 text-red-700" },
  expiring: { label: "Expires soon", cls: "bg-amber-50 text-amber-800" },
  ok: { label: "In place", cls: "bg-emerald-50 text-emerald-800" },
};

// Rows for one asset. leases: its lease records (Leases tab); certs: its
// insurance certificates (deal documents of type insurance_cert).
export function tenantInsuranceRows(inputs, { dealId = null, leases = [], certs = [], asOf = new Date().toISOString().slice(0, 10) } = {}) {
  if (isSold(inputs, asOf)) return []; // sold: the tenants are the buyer's
  const mine = (x) => dealId == null || x.deal_id === dealId;
  const ls = leases.filter(mine), cs = certs.filter((c) => mine(c) && c.doc_type === "insurance_cert" && c.lease_id);
  const groups = new Map();
  for (const u of unitsToday(inputs, asOf)) {
    if (u.leaseStatus !== "occupied" || !String(u.tenantName ?? "").trim()) continue;
    const k = tenantKey(u.tenantName);
    const g = groups.get(k) ?? { key: k, tenant: String(u.tenantName).trim(), unitIds: [], units: [], sf: 0 };
    g.unitIds.push(u.id); g.units.push(u.name ?? u.id); g.sf += Number(u.squareFeet) || 0;
    groups.set(k, g);
  }
  const track = inputs?.tenantInsurance ?? {};
  const soon = addDays(asOf, EXPIRING_DAYS);
  return [...groups.values()].map((g) => {
    const lease = ls.filter((l) => (l.unit_ids ?? []).some((id) => g.unitIds.includes(id)) || norm(l.tenant) === norm(g.tenant)).at(-1) ?? null;
    const req = lease?.abstract ? leaseInsuranceRequirements(lease.abstract) : null;
    const cert = lease ? cs.filter((c) => c.lease_id === lease.id).at(-1) ?? null : null;
    const pols = cert?.abstract?.policies ?? [];
    const expiries = pols.map((p) => iso(p.expiry)).filter(Boolean).sort();
    const expiry = expiries[0] ?? null;
    const gaps = cert?.abstract ? insuranceGaps(cert.abstract, { leaseAbs: lease?.abstract ?? null, asOf }) : [];
    const shortfalls = gaps.filter((x) => !/expire[sd]/.test(x.text));
    const t = track[g.key] ?? {};
    const status = !lease ? "noLease" : !cert ? "noProof" : expiry && expiry < asOf ? "expired" : shortfalls.some((x) => x.severity !== "low") ? "shortfall" : expiry && expiry <= soon ? "expiring" : "ok";
    return {
      ...g,
      leaseId: lease?.id ?? null,
      leaseRead: !!lease?.abstract,
      requirements: req,
      requirementsLabel: !lease ? "No lease requirements on file" : !lease.abstract ? "Lease on file, not read in yet" : requirementsLabel(req) || "The lease states no insurance requirement",
      certId: cert?.id ?? null,
      certTitle: cert?.title ?? "",
      certRead: !!cert?.abstract,
      expiry,
      shortfalls,
      requested: t.requested || "",
      received: t.received || (cert ? iso(cert.created_at) ?? "" : ""),
      notes: t.notes || "",
      status,
    };
  }).sort((a, b) => (a.tenant < b.tenant ? -1 : a.tenant > b.tenant ? 1 : 0));
}

export function tenantInsuranceSummary(rows) {
  const n = (s) => rows.filter((r) => r.status === s).length;
  return { tenants: rows.length, noLease: n("noLease"), noProof: n("noProof"), expired: n("expired"), shortfall: n("shortfall"), expiring: n("expiring"), ok: n("ok") };
}

export function summaryLabel(s) {
  if (!s.tenants) return "No tenants in place";
  const parts = [`${s.tenants} tenant${s.tenants === 1 ? "" : "s"}`, `${s.ok} in place`];
  if (s.noLease) parts.push(`${s.noLease} with no lease on file`);
  if (s.noProof) parts.push(`${s.noProof} with no proof`);
  if (s.expired) parts.push(`${s.expired} expired`);
  if (s.shortfall) parts.push(`${s.shortfall} below the lease`);
  if (s.expiring) parts.push(`${s.expiring} expiring within ${EXPIRING_DAYS} days`);
  return parts.join(" · ");
}

// Records when proof was requested or received, or a note, for a tenant.
export function setTenantInsurance(inputs, key, patch) {
  const cur = inputs?.tenantInsurance ?? {};
  return { ...inputs, tenantInsurance: { ...cur, [key]: { ...(cur[key] ?? {}), ...patch } } };
}

// What the Dashboard shows for one asset. Undated items are actions grouped by
// asset (a rent roll can hold dozens of tenants with no lease on file, and one
// line each would bury everything else); a certificate's expiry is a dated
// event per tenant, so it is on Upcoming Events and becomes an action as it nears.
export function tenantInsuranceItems(inputs, { dealId, asset, leases = [], certs = [], asOf } = {}) {
  const rows = tenantInsuranceRows(inputs, { dealId, leases, certs, asOf });
  const s = tenantInsuranceSummary(rows);
  const many = (n, one, more) => `${n} ${n === 1 ? one : more}`;
  const names = (st) => { const ns = rows.filter((r) => r.status === st).map((r) => r.tenant); return ns.length <= 3 ? ns.join(", ") : `${ns.slice(0, 3).join(", ")} and ${ns.length - 3} more`; };
  const out = [];
  if (s.noLease) out.push({ kind: "tenantins", tab: "leases", dealId, asset, date: null, count: s.noLease, text: `Upload ${many(s.noLease, "lease", "leases")}: ${many(s.noLease, "tenant has", "tenants have")} no lease on file, so the insurance required is unknown (${asset})` });
  if (s.noProof) out.push({ kind: "tenantins", tab: "insurance", dealId, asset, date: null, count: s.noProof, text: `Get proof of insurance: ${names("noProof")} (${asset})` });
  if (s.shortfall) out.push({ kind: "tenantins", tab: "insurance", dealId, asset, date: null, count: s.shortfall, text: `Tenant insurance below the lease: ${names("shortfall")} (${asset})` });
  for (const r of rows) if (r.expiry) out.push({ kind: "tenantins", tab: "insurance", dealId, asset, date: r.expiry, text: `Tenant insurance expires: ${r.tenant} (${asset})` });
  return out;
}

// Excel rows for the tenant section: one per tenant.
export function tenantInsuranceSheet(deals, { leases = [], certs = [], asOf } = {}) {
  const rows = [["Asset", "Tenant", "Units", "SF", "Status", "Lease requires", "Proof on file", "Expires", "Shortfall", "Proof requested", "Proof received", "Notes"]];
  for (const d of deals) for (const r of tenantInsuranceRows(d.inputs, { dealId: d.id, leases, certs, asOf })) {
    rows.push([d.inputs.propertyName ?? d.id, r.tenant, r.units.join(", "), r.sf, TI_STATUS[r.status].label, r.requirementsLabel, r.certTitle, r.expiry ?? "", r.shortfalls.map((x) => x.text).join("; "), r.requested, r.received, r.notes]);
  }
  return rows;
}
