// "Working on" fund picker (11/23): a filter over data that is already all
// loaded (one firm, saved record by record). "" means All funds.
import { fundType, DEFAULT_FUND_TYPE } from "@/lib/fundTypes";

export const ALL_FUNDS = "";

// Picker options: All funds, then each fund / separate account / JV with its type.
export function workingOnOptions(funds = {}, fundNames = []) {
  const names = [...new Set([...Object.keys(funds), ...fundNames].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return [
    { value: ALL_FUNDS, label: "All funds", type: "" },
    ...names.map((n) => {
      const t = fundType(funds[n]?.type);
      return { value: n, label: t === DEFAULT_FUND_TYPE ? n : `${n} · ${t}`, type: t };
    }),
  ];
}

// A remembered choice that no longer exists falls back to All funds.
export function validWorkingOn(value, options) {
  return options.some((o) => o.value === value) ? value : ALL_FUNDS;
}

// Owned assets (fundDeals) in the chosen fund. resolve: fund-name spelling resolver.
export function scopeDeals(fundDeals, workingOn, resolve = (n) => n) {
  if (!workingOn) return fundDeals;
  return fundDeals.filter((d) => resolve(d.inputs?.fundName ?? "") === workingOn);
}

// Fund terms of the chosen fund only (a new object; never written back).
export function scopeFunds(funds, workingOn) {
  if (!workingOn) return funds;
  return funds[workingOn] ? { [workingOn]: funds[workingOn] } : {};
}

// The asset list (open deals): the chosen fund's assets, plus deals with no
// fund that are being screened for it (pipeline target fund) or that aren't on
// the pipeline at all (working drafts). A pipeline deal aimed at another fund,
// or at no fund, shows under All funds only.
export function scopeOpenDeals(deals, workingOn, resolve = (n) => n, pipeline = { deals: [] }) {
  if (!workingOn) return deals;
  const target = new Map((pipeline?.deals ?? []).filter((r) => r.dealId).map((r) => [r.dealId, r.targetFund || ""]));
  return deals.filter((d) => {
    const f = d.inputs?.fundName?.trim();
    if (f) return resolve(f) === workingOn;
    return !target.has(d.id) || target.get(d.id) === workingOn;
  });
}

// Header strip label: whose figures these are.
export function scopeLabel(workingOn, funds = {}) {
  if (!workingOn) return "Firm";
  const t = fundType(funds[workingOn]?.type);
  return t === DEFAULT_FUND_TYPE ? workingOn : `${workingOn} (${t})`;
}
