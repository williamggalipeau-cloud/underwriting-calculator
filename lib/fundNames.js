// ─── Fund names: one spelling per fund ───────────────────────────────────────
// Deals join a fund by the text in their Fund field. Grouping by that exact
// text split a fund whenever spellings differed ("Model Fund I" vs
// "Model fund I", extra spaces), or when the sample fund was renamed from
// "Light Industrial Fund I" to "Model Fund I". These helpers give every
// spelling of a fund one canonical name.

import { OLD_SAMPLE_FUND_NAME, SAMPLE_FUND_NAME } from "@/lib/samplePortfolio";

// Comparison key: trimmed, single spaces, case-insensitive.
export const fundKey = (name) => String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Older names that now mean another fund.
const ALIASES = { [fundKey(OLD_SAMPLE_FUND_NAME)]: SAMPLE_FUND_NAME };

// Builds name → canonical name for a workspace. Names in the funds map win
// (they carry the terms); otherwise the first spelling seen is used.
export function fundNameResolver(funds = {}, ...dealLists) {
  const canon = new Map();
  const add = (name) => {
    const k = fundKey(name);
    if (k && !canon.has(k)) canon.set(k, String(name).trim().replace(/\s+/g, " "));
  };
  Object.keys(funds).forEach(add);
  dealLists.flat().forEach((d) => add(d?.inputs?.fundName));
  return (name) => {
    let k = fundKey(name);
    if (!k) return "";
    if (ALIASES[k]) k = fundKey(ALIASES[k]);
    return canon.get(k) ?? ALIASES[fundKey(name)] ?? String(name).trim().replace(/\s+/g, " ");
  };
}

// Gives a deal the canonical spelling of its fund name.
export function withCanonicalFund(deal, resolve) {
  if (!deal?.inputs) return deal;
  const name = resolve(deal.inputs.fundName);
  return name === (deal.inputs.fundName ?? "") ? deal : { ...deal, inputs: { ...deal.inputs, fundName: name } };
}

// Merges fund terms saved under different spellings (or the old sample fund
// name) into one entry per canonical name. Terms already under the canonical
// name take precedence; capital activity from every spelling is kept.
export function mergeFundTerms(funds = {}, resolve) {
  const out = {};
  for (const [name, terms] of Object.entries(funds)) {
    const c = resolve(name) || name;
    const prev = out[c];
    if (!prev) {
      out[c] = { ...terms, name: c };
      continue;
    }
    const preferThis = name === c; // the canonical spelling's own terms win
    const base = preferThis ? { ...prev, ...terms } : { ...terms, ...prev };
    const ids = new Set();
    const activity = [...(prev.capitalActivity ?? []), ...(terms.capitalActivity ?? [])].filter((a) => {
      if (!a?.id || ids.has(a.id)) return false;
      ids.add(a.id);
      return true;
    });
    out[c] = { ...base, name: c, ...(activity.length ? { capitalActivity: activity } : {}) };
  }
  return out;
}
