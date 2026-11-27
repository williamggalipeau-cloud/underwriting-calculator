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
import { copyAcquisitionComps, saleCompsOf } from "@/lib/assetMetrics";

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
  // What each sample lease adds to its tenant's unit (start date, deposit,
  // recoveries, "no options"…): only on the unit that still has that tenant.
  const leaseUnits = TERMS.units?.[dealId];
  if (leaseUnits && Array.isArray(out.units)) {
    out = { ...out, units: out.units.map((u) => {
      const p = leaseUnits[u.name];
      if (!p || String(u.tenantName ?? "").trim().toLowerCase() !== p.tenant.toLowerCase()) return u;
      const set = Object.fromEntries(Object.entries(p.set).filter(([k]) => !keepExisting || blank(u[k])));
      return Object.keys(set).length ? { ...u, ...set } : u;
    }) };
  }
  return out;
}
// The sample sale in progress on a sample asset, as the sale documents state it (null when there is none).
export const sampleSale = (dealId) => (TERMS.deals[dealId] ?? []).find(([p]) => p === "dispositions")?.[1]?.[0] ?? null;
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

// The automatic load on a firm's saved data: put the documented BOV, offers
// and contract on the asset's sample sale. A sample asset with no sale gets
// the sample sale; an existing "Sample sale (fictional)" that is still empty
// (no BOV, offer, contract date or closing) takes its contents and keeps its
// own id, so the documents filed on it stay attached. Any sale the user has
// worked on is left exactly as it is.
export function withSampleSale(inputs, dealId) {
  const sale = sampleSale(dealId);
  if (!sale) return inputs;
  const list = inputs.dispositions ?? [];
  if (!list.length) return { ...inputs, dispositions: [sale] };
  const untouched = (s) => s.startedFrom === "Sample sale (fictional)" && !["closed", "withdrawn"].includes(s.stage) && !(s.bovs ?? []).length && !(s.offers ?? []).length && !s.contract?.psaDate && !s.closing;
  const i = list.findIndex(untouched);
  if (i < 0) return inputs;
  return { ...inputs, dispositions: list.map((s, k) => (k === i ? { ...sale, id: s.id, createdAt: s.createdAt ?? sale.createdAt } : s)) };
}

// 1.1.16: a sample sale's comps (its disposition set) start as a copy of the
// asset's own acquisition comps, so they are the fund's figures. Only a
// sample sale with no comps yet is filled; a sale the user started is left.
export function withSampleSaleComps(inputs) {
  const list = inputs?.dispositions ?? [];
  if (!list.some((s) => s.startedFrom === "Sample sale (fictional)" && !saleCompsOf(s)) || !(inputs?.salesComps?.comps ?? []).length) return inputs;
  return { ...inputs, dispositions: list.map((s) => (s.startedFrom === "Sample sale (fictional)" && !saleCompsOf(s) ? { ...s, comps: copyAcquisitionComps(inputs, s, { todayISO: String(s.createdAt ?? "").slice(0, 10) }).state } : s)) };
}
