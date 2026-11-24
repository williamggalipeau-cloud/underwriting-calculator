// Portfolio type (user, 11/23; own terms 11/24): Fund, Joint Venture or
// Separate Account. Every type runs the same portfolio model; a JV or separate
// account reads its terms from its JVA / SMA, and a separate account can use
// an incentive fee in place of the promote tiers (incentiveWaterfall).
// Stored as funds[name].type; missing means "Fund".
export const FUND_TYPES = ["Fund", "Separate Account", "Joint Venture"];
export const DEFAULT_FUND_TYPE = "Fund";

export function fundType(t) {
  return FUND_TYPES.includes(t) ? t : DEFAULT_FUND_TYPE;
}

// names: fund names; funds: { name: terms }; filter: "" / "All" for every type.
export function filterFundsByType(names, funds = {}, filter = "") {
  if (!filter || filter === "All") return names;
  return names.filter((n) => fundType(funds[n]?.type) === filter);
}

// Picker label: "Fund I · Separate Account" (plain fund names stay as they are).
export function fundOptionLabel(name, funds = {}) {
  const t = fundType(funds[name]?.type);
  return t === DEFAULT_FUND_TYPE ? name : `${name} · ${t}`;
}

// A separate account with an incentive fee (user, 11/24): the client gets
// everything up to the hurdle IRR, then the sponsor takes the incentive fee
// share of the profit above it (no catch-up), in place of the promote tiers.
export function incentiveWaterfall(terms) {
  const fee = Number(terms.incentiveFeePct);
  if (fundType(terms.type) !== "Separate Account" || !(fee > 0)) return null;
  const hurdle = Number(terms.incentiveHurdlePct ?? terms.prefPct ?? 0) || 0;
  return { preferredReturnPct: hurdle, catchUpGpPct: 0, tiers: [{ irrThreshold: null, lpSplit: 100 - fee, gpSplit: fee }] };
}
