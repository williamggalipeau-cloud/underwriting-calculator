// Fund type tag (user, 11/23): a naming convention only. Every type uses the
// same fund logic. Stored as funds[name].type; missing means "Fund".
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
