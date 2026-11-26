// Quarterly performance report for one asset (user, 11/24): investors get a
// report for the portfolio (the fund, lib/quarterlyReport.js) or for any one
// asset in it. Same two versions (shareable / internal), same freeze on issue.
//   shareable: the asset at quarter end (value, cost, basis, implied cap),
//     the value change over the quarter, returns to date at the mark (equity
//     IRR and multiple), occupancy and leasing, NOI actual vs. plan, the
//     business plan's KPIs and milestones, capital projects, debt and the
//     letter; benchmarks are attached by the Reports tab.
//   internal: adds underwritten vs. actual and the asset's budget variances.
import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears, quarterKey } from "@/lib/fundTimeline";
import { fundValuation, quarterLabel } from "@/lib/valuations";
import { kpiActuals, milestoneStatus, varianceReport } from "@/lib/businessPlan";
import { fundRows, rentRollOccupancy } from "@/lib/uwActual";
import { fundType } from "@/lib/fundTypes";

const fin = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const priorQuarterEnd = (qEnd) => { const d = new Date(`${qEnd}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 0)).toISOString().slice(0, 10); };
const addMonths = (iso, k) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10); };

// deals: the fund's deals (snapshots); assetId: the asset to report on.
export function buildAssetReport(deals, terms, marks, { assetId, qEnd, todayISO, curve, kind = "internal" } = {}) {
  const deal = deals.find((d) => d.id === assetId);
  if (!deal) return null;
  const val = fundValuation(deals, marks ?? {}, terms, { todayISO, curve });
  const a = val.assets.find((x) => x.id === assetId);
  if (!a) return null;
  const qe = a.byQuarter.has(qEnd) ? qEnd : [...a.byQuarter.keys()].filter((q) => q <= (qEnd ?? "9999")).at(-1) ?? qEnd;
  const row = a.byQuarter.get(qe);
  if (!row) return null;
  const prev = a.byQuarter.get(priorQuarterEnd(qe)) ?? null;
  const inp = deal.inputs;
  const r = underwrite(inp);
  const acq = acquisitionDate(deal, terms);
  const k = kpiActuals(inp, qe);
  const bp = inp.businessPlan;
  const rev = bp?.revisions?.at(-1) ?? null;
  const plan = rev?.plan ?? null;
  const target = (key) => fin(Number((plan?.kpis ?? []).find((x) => x.key === key)?.target));
  const units = inp.units ?? [];
  const sfOf = (u) => u.squareFeet || 0;
  const horizon = addMonths(qe, 12);
  const expiring = units.filter((u) => u.leaseStatus === "occupied" && u.leaseEnd && u.leaseEnd > qe && u.leaseEnd <= horizon)
    .map((u) => ({ unit: u.name, tenant: u.tenantName || "", sf: sfOf(u), leaseEnd: u.leaseEnd })).sort((x, y) => (x.leaseEnd < y.leaseEnd ? -1 : 1));
  const vacant = units.filter((u) => u.leaseStatus !== "occupied");
  const prospects = (inp.leasing?.prospects ?? []).filter((p) => !["lost", "signed"].includes(String(p.stage ?? "").toLowerCase()));
  let noiYtd = null;
  try {
    const v = bp?.revisions?.length ? varianceReport(bp, { kind: "ytd", end: qe.slice(0, 7), sf: inp.squareFootage }) : null;
    const n = v?.rows.find((x) => x.key === "noi");
    if (n?.actual != null) noiYtd = { actual: n.actual, plan: n.plan, budget: n.current, months: v.months.length, vsPlanPct: n.plan ? ((n.actual - n.plan) / Math.abs(n.plan)) * 100 : null };
  } catch { /* no plan */ }
  const report = {
    kind,
    scope: "asset",
    assetId,
    quarter: quarterKey(qe),
    quarterLabel: quarterLabel(qe),
    qEnd: qe,
    fund: { name: terms.name, type: fundType(terms.type) },
    asset: {
      id: assetId, name: inp.propertyName || assetId, address: inp.address || "", city: [inp.city, inp.state].filter(Boolean).join(", "),
      sf: a.sf, units: units.length || inp.unitCount || null, acq, purchasePrice: inp.purchasePrice ?? null,
      cover: (inp.assetMedia?.photos ?? []).find((x) => x.cover)?.path ?? (inp.assetMedia?.photos ?? [])[0]?.path ?? null,
    },
    value: {
      end: row.value, start: prev?.value ?? null, change: prev ? row.value - prev.value : null, changePct: prev?.value ? ((row.value - prev.value) / prev.value) * 100 : null,
      cost: a.costBasis, unrealized: row.value - a.costBasis, basis: row.basis, impliedCap: fin(row.impliedCap), psf: fin(row.psf),
      lastAppraisal: row.lastAppraisal ? { quarterEnd: row.lastAppraisal.quarterEnd, value: row.lastAppraisal.value } : null,
    },
    returns: { irr: row.heldAtCost ? null : fin(row.irr), tvpi: fin(row.tvpi), dpi: fin(row.dpi), contributed: fin(row.contrib), distributed: fin(row.dist), equityNav: fin(row.nav), note: row.heldAtCost ? "held at cost in its first months; returns at the mark start after the cost hold" : "" },
    operations: {
      occupancy: fin(rentRollOccupancy(inp)), occupancyTarget: target("occupancy"),
      rentPSF: fin(k.rentPSF), rentTarget: target("rentPSF"), walt: fin(k.walt), waltTarget: target("walt"),
      noiAnnualized: fin(k.noi), noiMonths: k.noiMonths, noiPlan: fin(r.annualCashFlows[0]?.noi), noiYtd,
      vacantSF: vacant.reduce((s, u) => s + sfOf(u), 0), vacantUnits: vacant.length,
      expiring, expiringSF: expiring.reduce((s, x) => s + x.sf, 0), prospects: prospects.length,
    },
    plan: plan ? {
      revision: rev.n, recommendation: plan.recommendation || "", thesis: plan.thesis || "",
      milestones: (plan.milestones ?? []).map((m) => ({ label: m.label, due: m.due, owner: m.owner || "", status: milestoneStatus(m, qe) })),
      capital: (plan.capital ?? []).map((c) => ({ project: c.project, budget: fin(Number(c.budget)), spent: fin(Number(c.spent)), end: c.end || "" })),
    } : null,
    debt: { loan: r.debt?.loanAmount ?? 0, lender: inp.lenderName || "", spreadPct: fin(inp.spreadPct), floating: !!inp.floatingRate, rate: fin(inp.interestRatePct), maturity: inp.loanTermYears ? addYears(acq, Number(inp.loanTermYears)) : "", ltv: row.value > 0 ? ((r.debt?.loanAmount ?? 0) / row.value) * 100 : null },
  };
  if (kind === "internal") {
    const uw = fundRows([{ id: deal.id, inputs: inp }], qe)[0] ?? null;
    let budget = [];
    try {
      if (bp?.revisions?.length && Object.keys(bp.actuals ?? {}).length) {
        const rep = varianceReport(bp, { kind: "ytd", end: qe.slice(0, 7), sf: inp.squareFootage });
        budget = rep.rows.filter((x) => x.flag).map((x) => ({ line: x.label, current: x.current, actual: x.actual, variance: x.variance, variancePct: x.variancePct, flag: x.flag, comment: x.comment ?? "" }));
      }
    } catch { /* no plan */ }
    report.internal = { uw, budget };
  }
  return report;
}

const money = (v) => { if (v == null || !isFinite(v)) return "n/a"; const x = Math.abs(v); return `${v < 0 ? "-" : ""}$${x >= 1e6 ? `${(x / 1e6).toFixed(1)} million` : Math.round(x).toLocaleString("en-US")}`; };
const pct = (v) => (v == null || !isFinite(v) ? "n/a" : `${v.toFixed(1)}%`);
export function draftAssetLetter(r) {
  const o = r.operations, v = r.value;
  return [
    "Dear Investors,",
    `We are pleased to share the ${r.quarterLabel} report for ${r.asset.name}${r.asset.city ? `, ${r.asset.city}` : ""}, a ${Math.round(r.asset.sf).toLocaleString("en-US")} square foot ${r.fund.name} asset acquired ${r.asset.acq}.`,
    `At quarter end the asset was valued at ${money(v.end)} (${v.basis}${v.impliedCap != null ? `, a ${pct(v.impliedCap)} implied cap rate` : ""})${v.change != null ? `, ${v.change >= 0 ? "up" : "down"} ${money(Math.abs(v.change))} over the quarter` : ""}, against a cost basis of ${money(v.cost)}.`,
    `The asset was ${pct(o.occupancy)} leased${o.occupancyTarget != null ? ` against a plan target of ${pct(o.occupancyTarget)}` : ""}${o.expiring.length ? `, with ${o.expiring.length} lease${o.expiring.length === 1 ? "" : "s"} (${Math.round(o.expiringSF).toLocaleString("en-US")} SF) expiring in the next 12 months` : ""}.`,
    o.noiYtd ? `Net operating income was ${money(o.noiYtd.actual)} year to date, ${pct(o.noiYtd.vsPlanPct)} against plan.` : `[Add NOI against plan once monthly actuals are in.]`,
    r.returns.irr != null ? `Since acquisition the asset has produced an equity IRR of ${pct(r.returns.irr)} at the current mark, with an equity multiple of ${r.returns.tvpi?.toFixed(2) ?? "n/a"}x.` : `Returns at the mark begin after the initial cost hold.`,
    "[Add the quarter's highlights: leasing, capital projects and the outlook.]",
    "Thank you for your continued support.",
  ].join("\n\n");
}

export function assetReportXlsx(r, { letter = "", notes = "" } = {}) {
  const o = r.operations, v = r.value;
  const rows = [
    [`${r.asset.name} (${r.fund.name}): quarterly report, ${r.quarterLabel}${r.kind === "internal" ? " (internal)" : ""}`], [],
    ["Value", "Amount"], ["Value at quarter end", v.end], ["Value at start of quarter", v.start], ["Change", v.change], ["Cost basis", v.cost], ["Unrealized gain", v.unrealized], ["Basis", v.basis], ["Implied cap rate (%)", v.impliedCap], [],
    ["Returns to date (at the mark)", "Value"], ["Equity IRR (%)", r.returns.irr], ["Equity multiple (x)", r.returns.tvpi], ["Distributions / equity (x)", r.returns.dpi], [],
    ["Operations", "Actual", "Plan target"], ["Occupancy (%)", o.occupancy, o.occupancyTarget], ["Average rent ($/SF)", o.rentPSF, o.rentTarget], ["WALT (years)", o.walt, o.waltTarget], ["NOI year to date", o.noiYtd?.actual ?? null, o.noiYtd?.plan ?? null], ["NOI (annualized actual / year-1 plan)", o.noiAnnualized, o.noiPlan], [],
    ["Leases expiring in 12 months", "Tenant", "SF", "Expires"], ...o.expiring.map((x) => [x.unit, x.tenant, x.sf, x.leaseEnd]), [],
    ["Debt", "Value"], ["Loan", r.debt.loan], ["Lender", r.debt.lender], ["Maturity", r.debt.maturity], ["LTV (%)", r.debt.ltv],
  ];
  if (r.plan) rows.push([], ["Milestone", "Due", "Owner", "Status"], ...r.plan.milestones.map((m) => [m.label, m.due, m.owner, m.status]), [], ["Capital project", "Budget", "Spent", "End"], ...r.plan.capital.map((c) => [c.project, c.budget, c.spent, c.end]));
  if (r.internal) {
    if (r.internal.uw) rows.push([], ["Underwritten vs. actual", "IRR underwritten", "IRR now", "Gap (pts)"], [r.asset.name, r.internal.uw.uwIrr, r.internal.uw.irr, r.internal.uw.gap]);
    rows.push([], ["Budget variances", "Budget", "Actual", "Variance", "Comment"], ...r.internal.budget.map((x) => [x.line, x.current, x.actual, x.variance, x.comment]));
    if (notes) rows.push([], ["Internal notes"], [notes]);
  }
  if (letter) rows.push([], ["Letter"], ...letter.split(/\n\n/).map((p) => [p]));
  return rows;
}
