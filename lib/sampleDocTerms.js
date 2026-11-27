// What the sample documents add to Model Fund I in the app (1.1.13, user
// 11/27: "All data in the app needs to match the sample documents").
//
// lib/sampleDocTerms.json is written by scripts/sample-deal-docs/make_terms.cjs,
// which reads every Model Fund I document's abstract into the fund with the
// app's own apply functions and records what changed: contract dates and
// deposits, the lender's terms, the executed caps, the IC approval, the
// closing-statement actuals, the LPA's investment limits, and the appraisals
// behind two marks. Nothing here changes a loan, equity or return figure
// (make_terms refuses to write if it would), and the tie-out test
// (tests/node/sampleTieOut.test.cjs) fails if the file is stale.
import TERMS from "@/lib/sampleDocTerms.json";

const setPath = (obj, path, value) => {
  const [k, ...rest] = path.split(".");
  return { ...(obj ?? {}), [k]: rest.length ? setPath(obj?.[k], rest.join("."), value) : value };
};
const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const blank = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

// A sample asset's inputs with the documents' terms. keepExisting: only fill
// what is empty (the automatic load on a firm's saved data never overwrites
// something the user entered).
export function applySampleDocTerms(inputs, dealId, { keepExisting = false } = {}) {
  let out = inputs;
  for (const [path, value] of TERMS.deals[dealId] ?? []) {
    if (keepExisting && !blank(getPath(out, path))) continue;
    out = setPath(out, path, value);
  }
  return out;
}
// The sample marks with the appraisals' source and appraiser (the values are the app's own).
export function applySampleDocMarks(valuations = {}) {
  const out = { ...valuations };
  for (const [dealId, quarters] of Object.entries(TERMS.marks ?? {})) {
    for (const [q, patch] of Object.entries(quarters)) if (out[dealId]?.[q]) out[dealId] = { ...out[dealId], [q]: { ...out[dealId][q], ...patch } };
  }
  return out;
}
// What the fund's documents add to Model Fund I's terms (the LPA / PPM limits).
export function sampleFundTermsPatch(terms = {}, { keepExisting = false } = {}) {
  let patch = {};
  for (const [path, value] of TERMS.fund ?? []) {
    if (path === "limits") {
      // The documents' limits by key; limits the user added (internal limits) are kept.
      const mine = (terms.limits ?? []).filter((l) => !value.some((v) => v.key === l.key) || (keepExisting && l.docId));
      patch = { ...patch, limits: [...mine, ...value.filter((v) => !mine.some((l) => l.key === v.key))] };
      continue;
    }
    if (keepExisting && !blank(getPath(terms, path))) continue;
    patch = setPath(patch, path, value);
  }
  return patch;
}
export const sampleDocTermPaths = (dealId) => (TERMS.deals[dealId] ?? []).map(([p]) => p);
