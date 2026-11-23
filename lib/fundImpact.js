// ─── Phase M: fund impact of acquiring a deal (modeling only) ───────────────
// The fund with vs. without one or more candidate deals, never changing the
// fund. base: "owned" (assets already bought) or "all" (owned plus the
// fund's other pipeline assets; the default). A candidate is always left out
// of the "without" side.
//
// Returns per side: gross IRR and multiple, net LP IRR and multiple (through
// the fund's sub line, expenses and waterfall: lib/fundPlan fundProjection),
// GP promote, equity, dry powder, the largest tenant / industry / state
// shares, and every fund limit (lib/fundLimits) with the breaches the
// candidates would cause. With several candidates, each one's share of the
// change in net LP IRR (added one at a time to the base, scaled to the total).

import { snapshotDeal } from "@/lib/samplePortfolio";
import { fundProjection } from "@/lib/fundPlan";
import { actualFor, checkLimits, limitInputs } from "@/lib/fundLimits";
import { acquisitionDate } from "@/lib/fundTimeline";

// A deal counts as pipeline when it has no fund or is bought after today.
export const isPipeline = (deal, todayISO, fallbackClose = "") => !deal.inputs?.fundName?.trim() || (deal.inputs?.acquisitionDate || fallbackClose) > todayISO;

function side(deals, terms, { todayISO, curve }) {
  const snaps = deals.map((d) => (Array.isArray(d.irrFlows) ? d : snapshotDeal(d.inputs, d.id)));
  const p = fundProjection(snaps, terms, { todayISO, curve });
  const li = limitInputs(deals);
  const commitments = Number(terms.targetEquity) || 0;
  const equity = p.assets.reduce((s, a) => s + a.equity, 0);
  return {
    returns: p.returns,
    equity,
    dryPowder: commitments > 0 ? commitments - equity : null,
    assets: p.assets.length,
    conc: {
      tenant: actualFor("single_tenant_pct", li, commitments),
      state: actualFor("state_pct", li, commitments),
      asset: actualFor("single_asset_pct", li, commitments),
      ltv: actualFor("fund_ltv_pct", li, commitments),
    },
    limits: checkLimits(terms, li),
  };
}

// fundDeals: the fund's deals (owned and pipeline); candidates: deals to add
// (their fund is set to this fund for the run).
export function fundImpact(fundDeals, terms, candidates, { todayISO, curve, base = "all" } = {}) {
  const ids = new Set(candidates.map((c) => c.id));
  const others = fundDeals.filter((d) => !ids.has(d.id) && (base === "all" || !isPipeline(d, todayISO, terms.finalClose)));
  const cands = candidates.map((c) => ({ ...c, inputs: { ...c.inputs, fundName: terms.name, acquisitionDate: c.inputs.acquisitionDate || todayISO } }));
  const without = side(others, terms, { todayISO, curve });
  const withC = side([...others, ...cands], terms, { todayISO, curve });
  const delta = (k) => {
    const a = withC.returns[k], b = without.returns[k];
    return a != null && b != null ? a - b : null;
  };
  const limits = withC.limits.map((l, i) => ({ ...l, before: without.limits[i], newBreach: l.status === "breached" && without.limits[i]?.status !== "breached" }));
  // Each candidate's share of the net LP IRR change (alone on the base).
  let shares = null;
  if (cands.length > 1) {
    const alone = cands.map((c) => {
      const r = side([...others, c], terms, { todayISO, curve }).returns.netLpIrr;
      return { id: c.id, name: c.inputs.propertyName || c.id, change: r != null && without.returns.netLpIrr != null ? r - without.returns.netLpIrr : null };
    });
    const sum = alone.reduce((s, x) => s + (x.change ?? 0), 0);
    const total = delta("netLpIrr");
    shares = alone.map((x) => ({ ...x, share: sum && total != null && x.change != null ? (x.change / sum) * total : null }));
  }
  const candEquity = withC.equity - without.equity;
  return {
    base,
    without,
    with: withC,
    change: {
      grossIrr: delta("grossIrr"),
      grossMultiple: delta("grossMultiple"),
      netLpIrr: delta("netLpIrr"),
      netLpTvpi: delta("netLpTvpi"),
      gpPromote: delta("gpPromote"),
      equity: candEquity,
    },
    dryPowderUsedPct: without.dryPowder > 0 ? (candEquity / without.dryPowder) * 100 : null,
    overCommitted: withC.dryPowder != null && withC.dryPowder < 0,
    limits,
    newBreaches: limits.filter((l) => l.newBreach),
    shares,
    candidates: cands.map((c) => ({ id: c.id, name: c.inputs.propertyName || c.id, close: acquisitionDate(c, terms) })),
  };
}

export const IMPACT_ROWS = [
  ["grossIrr", "Gross IRR", "%"],
  ["grossMultiple", "Gross multiple", "x"],
  ["netLpIrr", "Net LP IRR", "%"],
  ["netLpTvpi", "Net LP multiple", "x"],
  ["gpPromote", "GP promote", "$"],
];

export function impactXlsx(fundName, r, { scenario = "" } = {}) {
  return [
    [`${fundName}: fund impact${scenario ? ` · ${scenario}` : ""} (Scenario - not actual)`],
    [`Candidates: ${r.candidates.map((c) => c.name).join(", ")} · base: ${r.base === "all" ? "owned plus other pipeline assets" : "owned assets only"}`],
    [],
    ["", "Without", "With", "Change"],
    ...IMPACT_ROWS.map(([k, l]) => [l, r.without.returns[k], r.with.returns[k], r.change[k]]),
    ["Equity", r.without.equity, r.with.equity, r.change.equity],
    ["Dry powder", r.without.dryPowder, r.with.dryPowder, r.with.dryPowder != null && r.without.dryPowder != null ? r.with.dryPowder - r.without.dryPowder : null],
    ["Largest tenant, % of rent", r.without.conc.tenant.value, r.with.conc.tenant.value],
    ["Largest state, % of value", r.without.conc.state.value, r.with.conc.state.value],
    ["Fund LTV %", r.without.conc.ltv.value, r.with.conc.ltv.value],
    [],
    ["Limit", "Limit value", "Before", "After", "Status after"],
    ...r.limits.map((l) => [l.label, l.limit, l.before?.actual, l.actual, `${l.status}${l.newBreach ? " (new breach)" : ""}`]),
    ...(r.shares ? [[], ["Candidate", "Net LP IRR change alone", "Share of the combined change"], ...r.shares.map((x) => [x.name, x.change, x.share])] : []),
  ];
}
