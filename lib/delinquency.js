// ─── Rent delinquency from Yardi (phase H) ──────────────────────────────────
// Monthly upload of Yardi Voyager's aged receivables (aged delinquency)
// report as CSV or Excel. A one-time map links Yardi property codes to the
// app's assets and tenant codes to rent roll units; columns are matched by
// name (editable). Stored per fund in funds[name].delinquency:
//   { mapping: { properties: { code: dealId }, tenants: { code: unitId }, columns: { field: header } },
//     months: { "YYYY-MM-DD": { rows, file, uploadedAt, by } }, notes: { tenantCode: text } }
// No direct Yardi connection (it needs Yardi's licensed interface).

export const BUCKETS = [
  ["current", "Current"], ["d30", "1–30"], ["d60", "31–60"], ["d90", "61–90"], ["d180", "91–180"], ["over180", "Over 180"],
];
export const PAST_DUE = ["d30", "d60", "d90", "d180", "over180"];
export const CHARGE_TYPES = { rent: "Rent", cam: "CAM", tax: "Taxes", ins: "Insurance", other: "Other" };

// Report field → header names it may have (normalized: lower case, no spaces or symbols).
const SYN = {
  property: ["property", "propertycode", "prop", "propcode", "propertyid"],
  propertyName: ["propertyname", "propname"],
  tenantCode: ["tenantcode", "tenant id", "tenantid", "resident", "residentcode", "leasecode", "tcode", "code"],
  tenant: ["tenant", "tenantname", "name", "resident name", "residentname"],
  unit: ["unit", "units", "suite", "unitcode"],
  charge: ["chargecode", "charge", "chargetype", "type"],
  current: ["current", "currentowed", "0days"],
  d30: ["030", "130", "030days", "130days", "lessthan30", "30days", "0to30"],
  d60: ["3160", "3160days", "31to60", "60days"],
  d90: ["6190", "6190days", "61to90", "90days"],
  d180: ["91180", "91180days", "90180", "91to180", "180days"],
  over180: ["over180", "180", "180days", "over180days", "morethan180", "180plus"],
  over90: ["over90", "90", "90plus", "over90days"],
  prepay: ["prepayments", "prepaid", "prepayment", "credits", "unappliedcredits"],
  total: ["total", "totalowed", "balance", "totalbalance"],
};
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9+]/g, "").replace(/\+/g, "plus");
const num = (v) => {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/[$,\s]/g, "");
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[()]/g, ""));
  return isFinite(n) ? (neg ? -n : n) : 0;
};
const r2 = (n) => Math.round(n * 100) / 100;

// The charge type of a Yardi charge code.
export function chargeType(code) {
  const c = String(code ?? "").toLowerCase();
  if (/cam|opex|common|recover|esc/.test(c)) return "cam";
  if (/tax|rtx|ret/.test(c)) return "tax";
  if (/ins/.test(c)) return "ins";
  if (/rent|rnt|base|^br$/.test(c)) return "rent";
  return c ? "other" : "rent";
}

// Finds the header row and maps columns. columnMap: { field: header } overrides.
export function detectColumns(header, columnMap = {}) {
  const map = {};
  const used = new Set();
  const H = header.map(norm);
  for (const [field, h] of Object.entries(columnMap)) {
    const i = H.indexOf(norm(h));
    if (i >= 0) { map[field] = i; used.add(i); }
  }
  for (const [field, names] of Object.entries(SYN)) {
    if (map[field] != null) continue;
    const i = H.findIndex((x, k) => !used.has(k) && names.map(norm).includes(x));
    if (i >= 0) { map[field] = i; used.add(i); }
  }
  return map;
}

// grid: rows of cells (CSV or Excel). Returns { asOf, rows, columns, warnings }.
export function parseAgedReport(grid, { columnMap = {}, asOf = "" } = {}) {
  const warnings = [];
  let date = asOf;
  for (const r of grid.slice(0, 8)) {
    const m = (r ?? []).join(" ").match(/as of\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
    if (m && !date) date = `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const hi = grid.findIndex((r) => {
    const c = detectColumns(r ?? [], columnMap);
    return c.tenantCode != null && (c.d30 != null || c.total != null);
  });
  if (hi < 0) throw new Error("Couldn't find the header row: it needs a tenant code column and aging columns (e.g. 0-30, 31-60).");
  const cols = detectColumns(grid[hi], columnMap);
  if (cols.property == null) warnings.push("No property code column: every row will need an asset.");
  if (cols.d180 == null && cols.over180 == null && cols.over90 != null) warnings.push("The report has an Over 90 column only: it is shown as 91–180.");
  const rows = [];
  for (const r of grid.slice(hi + 1)) {
    if (!r || !r.some((x) => String(x ?? "").trim())) continue;
    const g = (f) => (cols[f] == null ? "" : r[cols[f]]);
    const code = String(g("tenantCode") ?? "").trim();
    if (!code || /^total/i.test(code) || /^total/i.test(String(g("property") ?? ""))) continue;
    const row = {
      property: String(g("property") ?? "").trim(), propertyName: String(g("propertyName") ?? "").trim(), tenantCode: code,
      tenant: String(g("tenant") ?? "").trim(), unit: String(g("unit") ?? "").trim(), charge: chargeType(g("charge")),
      current: num(g("current")), d30: num(g("d30")), d60: num(g("d60")), d90: num(g("d90")),
      d180: num(g("d180")) + (cols.d180 == null && cols.over180 == null ? num(g("over90")) : 0), over180: num(g("over180")), prepay: num(g("prepay")),
    };
    row.prepay = row.prepay > 0 ? -row.prepay : row.prepay; // credits are negative
    const sum = r2(BUCKETS.reduce((s, [k]) => s + row[k], 0) + row.prepay);
    row.total = cols.total != null ? num(g("total")) : sum;
    if (cols.total != null && Math.abs(row.total - sum) > 0.05) warnings.push(`${code}: buckets add to ${sum}, the report's total is ${row.total}`);
    rows.push(row);
  }
  if (!date) warnings.push("No report date found: choose the month-end.");
  return { asOf: date, rows, columns: cols, warnings };
}

// Suggested map: properties by code or name, tenants by tenant name (then unit) within the asset.
export function suggestMapping(rows, deals, mapping = {}) {
  const props = { ...(mapping.properties ?? {}) };
  const tenants = { ...(mapping.tenants ?? {}) };
  const low = (s) => String(s ?? "").toLowerCase().trim();
  for (const r of rows) {
    if (r.property && !props[r.property]) {
      const d = deals.find((x) => low(x.inputs.propertyName) === low(r.propertyName)) ?? deals.find((x) => low(x.inputs.yardiCode) === low(r.property));
      if (d) props[r.property] = d.id;
    }
    if (!tenants[r.tenantCode]) {
      const d = deals.find((x) => x.id === props[r.property]);
      const u = (d?.inputs?.units ?? []).find((x) => low(x.tenantName) && low(x.tenantName) === low(r.tenant)) ?? (d?.inputs?.units ?? []).find((x) => low(x.name) === low(r.unit));
      if (u) tenants[r.tenantCode] = u.id;
    }
  }
  return { ...mapping, properties: props, tenants };
}

const monthlyRent = (u) => (u?.leaseStatus === "occupied" ? ((Number(u.currentRentPSF) || 0) * (Number(u.squareFeet) || 0)) / 12 : 0);
const zero = () => Object.fromEntries([...BUCKETS.map(([k]) => [k, 0]), ["prepay", 0]]);

// One month: by tenant, asset and fund. deals: the fund's deals (inputs.units).
export function aggregate(month, mapping, deals) {
  const tenants = new Map();
  const unmapped = [];
  for (const r of month?.rows ?? []) {
    const dealId = mapping?.properties?.[r.property];
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) { unmapped.push(r); continue; }
    const unitId = mapping?.tenants?.[r.tenantCode];
    const unit = (deal.inputs.units ?? []).find((u) => u.id === unitId) ?? null;
    const t = tenants.get(r.tenantCode) ?? {
      tenantCode: r.tenantCode, tenant: r.tenant || unit?.tenantName || r.tenantCode, dealId, asset: deal.inputs.propertyName, unitId: unit?.id ?? null,
      unitName: unit?.name ?? r.unit, monthlyRent: monthlyRent(unit), deposit: Number(unit?.securityDeposit) || 0, guarantor: unit?.guarantor ?? "",
      buckets: zero(), byCharge: {},
    };
    for (const [k] of BUCKETS) t.buckets[k] += r[k];
    t.buckets.prepay += r.prepay;
    const pd = PAST_DUE.reduce((s, k) => s + r[k], 0);
    t.byCharge[r.charge] = (t.byCharge[r.charge] ?? 0) + pd;
    tenants.set(r.tenantCode, t);
  }
  const list = [...tenants.values()].map((t) => {
    const delinquent = r2(PAST_DUE.reduce((s, k) => s + t.buckets[k], 0));
    const total = r2(BUCKETS.reduce((s, [k]) => s + t.buckets[k], 0) + t.buckets.prepay);
    const covered = Math.min(Math.max(0, t.deposit), Math.max(0, delinquent));
    return { ...t, delinquent, total, pctRent: t.monthlyRent ? (delinquent / t.monthlyRent) * 100 : NaN, depositCovers: covered, netOfDeposit: r2(delinquent - covered), monthsOwed: t.monthlyRent ? delinquent / t.monthlyRent : NaN };
  }).sort((a, b) => b.delinquent - a.delinquent || a.asset.localeCompare(b.asset));
  const sumUp = (xs, rent) => {
    const b = zero();
    for (const t of xs) { for (const k of Object.keys(b)) b[k] += t.buckets[k]; }
    for (const k of Object.keys(b)) b[k] = r2(b[k]);
    const delinquent = r2(PAST_DUE.reduce((s, k) => s + b[k], 0));
    return {
      buckets: b, delinquent, total: r2(BUCKETS.reduce((s, [k]) => s + b[k], 0) + b.prepay), monthlyRent: r2(rent),
      pctRent: rent ? (delinquent / rent) * 100 : NaN, bucketPct: Object.fromEntries(PAST_DUE.map((k) => [k, rent ? (b[k] / rent) * 100 : NaN])),
      tenantsDelinquent: xs.filter((t) => t.delinquent > 0.005).length, netOfDeposits: r2(xs.reduce((s, t) => s + t.netOfDeposit, 0)), prepaid: b.prepay,
    };
  };
  const assets = deals.map((d) => {
    const xs = list.filter((t) => t.dealId === d.id);
    const rent = (d.inputs.units ?? []).reduce((s, u) => s + monthlyRent(u), 0);
    return { dealId: d.id, asset: d.inputs.propertyName, ...sumUp(xs, rent), tenants: xs.length };
  });
  const fundRent = assets.reduce((s, a) => s + a.monthlyRent, 0);
  return { tenants: list, assets, fund: sumUp(list, fundRent), unmapped };
}

// Month-by-month fund totals with the change vs the prior month.
export function trend(delinq, deals) {
  const months = Object.keys(delinq?.months ?? {}).sort();
  let prev = null;
  return months.map((m) => {
    const a = aggregate(delinq.months[m], delinq.mapping, deals);
    const row = { month: m, ...a.fund, change: prev == null ? NaN : r2(a.fund.delinquent - prev), byAsset: Object.fromEntries(a.assets.map((x) => [x.dealId, x.delinquent])) };
    prev = a.fund.delinquent;
    return row;
  });
}

// Collections from a tenant ledger (charges vs payments) against each
// asset's credit-loss assumption. grid: the ledger export.
export function collections(grid, mapping, deals) {
  const hi = grid.findIndex((r) => (r ?? []).map(norm).includes("amount") && (r ?? []).map(norm).some((x) => x === "type"));
  if (hi < 0) return [];
  const H = grid[hi].map(norm);
  const at = (n) => H.indexOf(n);
  const by = new Map();
  for (const r of grid.slice(hi + 1)) {
    if (!r || !r[at("amount")]) continue;
    const dealId = mapping?.properties?.[String(r[at("property")] ?? "").trim()];
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) continue;
    const e = by.get(dealId) ?? { dealId, asset: deal.inputs.propertyName, charged: 0, paid: 0, creditLossPct: Number(deal.inputs.creditLossPct ?? 1) };
    const amt = num(r[at("amount")]);
    if (/charge/i.test(r[at("type")])) e.charged += amt;
    else if (/payment|credit/i.test(r[at("type")])) e.paid += -amt;
    by.set(dealId, e);
  }
  return [...by.values()].map((e) => {
    const rate = e.charged ? (e.paid / e.charged) * 100 : NaN;
    return { ...e, collectedPct: rate, expectedPct: 100 - e.creditLossPct, belowAssumption: isFinite(rate) && rate < 100 - e.creditLossPct };
  });
}
