// Risk report → Aged Rent (user, 11/26, 1.1.8): rent payments by age from the
// fund's latest Yardi aged receivables upload (lib/delinquency.js, stored on
// the fund as terms.delinquency). Every tenant with rent past due, by bucket
// (1–30, 31–60, 61–90, 91–180, over 180 days), net of the tenant's security
// deposit, with the change vs. the prior month's upload. 60+ days late (61
// days and older: the 61–90, 91–180 and over-180 buckets) is highlighted and
// also flags the tenant in Tenant Credit.
import { aggregate, PAST_DUE } from "@/lib/delinquency";

export const LATE_60 = ["d90", "d180", "over180"]; // 61+ days
export const late60 = (buckets = {}) => LATE_60.reduce((s, k) => s + (Number(buckets[k]) || 0), 0);
const r2 = (x) => Math.round(x * 100) / 100;

// { asOf, prevAsOf, tenants: [...], fund, late60: { amount, tenants } } or null
// when the fund has no upload. deals: the fund's deals.
export function agedRent(delinq, deals) {
  const months = Object.keys(delinq?.months ?? {}).sort();
  if (!months.length) return null;
  const m = months.at(-1), p = months.length > 1 ? months.at(-2) : null;
  const cur = aggregate(delinq.months[m], delinq.mapping, deals);
  const prev = p ? aggregate(delinq.months[p], delinq.mapping, deals) : null;
  const tenants = cur.tenants
    .filter((t) => t.delinquent > 0.005)
    .map((t) => {
      const before = prev?.tenants.find((x) => x.tenantCode === t.tenantCode);
      return {
        tenantCode: t.tenantCode, tenant: t.tenant, dealId: t.dealId, asset: t.asset, unitId: t.unitId,
        buckets: Object.fromEntries(PAST_DUE.map((k) => [k, r2(t.buckets[k])])),
        pastDue: t.delinquent, deposit: t.deposit, net: t.netOfDeposit, late60: r2(late60(t.buckets)),
        change: prev ? r2(t.delinquent - (before?.delinquent ?? 0)) : null,
      };
    })
    .sort((a, b) => b.late60 - a.late60 || b.pastDue - a.pastDue || a.asset.localeCompare(b.asset));
  const sum = (k) => r2(tenants.reduce((s, t) => s + (t[k] ?? 0), 0));
  const fund = {
    buckets: Object.fromEntries(PAST_DUE.map((k) => [k, r2(tenants.reduce((s, t) => s + t.buckets[k], 0))])),
    pastDue: sum("pastDue"), deposit: sum("deposit"), net: sum("net"), late60: sum("late60"),
    change: prev ? r2(cur.fund.delinquent - prev.fund.delinquent) : null,
  };
  return { asOf: m, prevAsOf: p, tenants, fund, late60: { amount: fund.late60, tenants: tenants.filter((t) => t.late60 > 0.005).length }, unmapped: cur.unmapped.length };
}
