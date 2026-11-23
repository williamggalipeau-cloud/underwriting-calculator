// ─── Phase L: TI funding coverage (risk report heat map) ────────────────────
// Whether each asset can fund its coming TI and leasing commissions, quarter
// by quarter for the next 8 quarters, and from what, in order:
//   1. the loan's TI/LC facility: what's left of it, if the asset passes the
//      draw test that quarter (DSCR at or above the minimum, a debt yield
//      minimum where set) and the facility is still available;
//   2. the asset's own cash flow (that quarter's cash after debt service);
//   3. the fund's subscription line, while it's active (to the end of the
//      investment period) and has room (size less the model's balance),
//      shared across the fund's assets that quarter;
//   4. a capital call for what's left.
// Need: leases expiring in the quarter (renewal share × renewal TI + new-lease
// share × new TI, plus leasing commissions on market rent over the new term,
// as the cash flow model charges them) and vacant units leased in the first
// quarter, plus planned TI / LC entered for the asset (inputs.tiPlanned:
// [{ date, amount, note }], e.g. a re-tenanting in the business plan).
// The facility: inputs.tiFacility { psf, minDscr, minDebtYieldPct,
// availableUntil } (the made-up test data, until phase F reads the loan's
// draw conditions), else the model's TI reserve (inputs.tiReserve).
// Cells: green (facility, test passed), lightgreen (asset cash flow),
// amber (needs the sub line), red (a capital call, or the draw test fails),
// grey (no TI due).

import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears } from "@/lib/fundTimeline";
import { fundLpEvents, subLineTerms } from "@/lib/fundFlows";
import { distPolicy } from "@/lib/fundPlan";
import { assetQuarterlyEvents, fundDates } from "@/lib/fundTimeline";

export const QUARTERS = 8;
export const COLORS = {
  green: { fill: "#16a34a", label: "TI facility (draw test passed)" },
  lightgreen: { fill: "#86efac", label: "Asset cash flow" },
  amber: { fill: "#f59e0b", label: "Needs the sub line" },
  red: { fill: "#dc2626", label: "Capital call, or the draw test fails" },
  blue: { fill: "#2563eb", label: "Planned capital call (scenario)" },
  grey: { fill: "#e5e7eb", label: "No TI due" },
};

const qEndAfter = (iso, k) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = Math.floor(d.getUTCMonth() / 3) * 3 + 3 * (k + 1);
  return new Date(Date.UTC(d.getUTCFullYear(), m, 0)).toISOString().slice(0, 10);
};
const qStart = (qEnd) => { const d = new Date(`${qEnd}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1)).toISOString().slice(0, 10); };
const qLabel = (qEnd) => `${qEnd.slice(0, 4)} Q${Math.floor((Number(qEnd.slice(5, 7)) - 1) / 3) + 1}`;
const holdYearAt = (acq, iso) => { let t = 1; while (addYears(acq, t) <= iso && t < 50) t++; return t; };

// TI + LC due on one unit when its lease ends (as the model charges it).
export function rolloverCost(u, inputs) {
  const sf = Number(u.squareFeet) || 0;
  const renewP = (Number(u.renewalProbabilityPct ?? inputs.renewalProbabilityPct ?? 60) || 0) / 100;
  const tiNew = Number(u.tiNewPSF ?? inputs.tiPerSFNew ?? 0) || 0;
  const tiRen = Number(u.tiRenewalPSF ?? inputs.tiPerSFRenewal ?? 0) || 0;
  const term = (Number(u.newLeaseTerm ?? 60) || 60) / 12;
  const mkt = Number(u.marketRentPSF ?? u.currentRentPSF ?? 0) || 0;
  const lcN = (Number(u.leasingCommissionNewPct ?? inputs.leasingCommissionNewPct ?? 0) || 0) / 100;
  const lcR = (Number(u.leasingCommissionRenewalPct ?? inputs.leasingCommissionRenewalPct ?? 0) || 0) / 100;
  return sf * (renewP * (tiRen + mkt * term * lcR) + (1 - renewP) * (tiNew + mkt * term * lcN));
}

export function facilityOf(inputs, sf) {
  const f = inputs.tiFacility;
  if (f && Number(f.psf) > 0) return { total: Number(f.psf) * sf, minDscr: Number(f.minDscr) || 1.1, minDebtYieldPct: Number(f.minDebtYieldPct) || null, availableUntil: f.availableUntil || "", source: "loan" };
  const r = inputs.tiReserve;
  if (r?.enabled && Number(r.reservePSF) > 0) return { total: Number(r.reservePSF) * sf, minDscr: Number(r.minDrawDSCR) || 1.1, minDebtYieldPct: null, availableUntil: "", source: "model" };
  return null;
}

// deals: the fund's held deals (snapshots); terms: fund terms; asOf: date.
// actions (modeling only, never actual data; terms.tiScenario.actions):
//   { dealId, quarter, kind: "postpone", to }   move that quarter's need
//   { dealId, quarter, kind: "cut", pct }       cut that quarter's need by pct
//   { dealId, quarter, kind: "call", amount }   plan a capital call for it
export function tiCoverage(deals, terms, { asOf, curve, actions = [] } = {}) {
  const quarters = Array.from({ length: QUARTERS }, (_, k) => qEndAfter(asOf, k));
  const fd = fundDates(terms);
  // Sub line room by quarter (the model's balance; active to the end of the
  // investment period).
  const line = subLineTerms(terms);
  const size = line.enabled ? (Number(terms.targetEquity) || 0) * ((line.sizePct ?? 0) / 100) : 0;
  let lineAt = () => 0;
  try {
    const events = deals.filter((d) => Array.isArray(d.irrFlows) && d.irrFlows.length > 1).flatMap((d) => assetQuarterlyEvents(d, terms, distPolicy(terms)).events);
    const fl = fundLpEvents(events, { ...terms, capitalActivity: [] }, { todayISO: asOf, curve, investmentPeriodEnd: fd.investmentPeriodEnd });
    lineAt = fl.lineAt ?? lineAt;
  } catch { /* no line */ }
  const lineRoom = quarters.map((q) => (size > 0 && q <= fd.investmentPeriodEnd ? Math.max(0, size - Math.max(0, lineAt(q))) : 0));

  const assets = deals.map((d) => {
    const inp = d.inputs ?? {};
    let r = null;
    try { r = underwrite(inp); } catch { r = null; }
    const acq = acquisitionDate(d, terms);
    const units = (inp.units ?? []).filter((u) => (Number(u.squareFeet) || 0) > 0);
    const sf = units.reduce((s, u) => s + Number(u.squareFeet), 0) || Number(inp.squareFootage) || 0;
    const fac = facilityOf(inp, sf);
    const loan = r?.debt?.loanAmount ?? 0;
    let left = fac?.total ?? 0;
    const cells = quarters.map((q, k) => {
      const qs = qStart(q);
      let need = 0;
      for (const x of inp.tiPlanned ?? []) if (x.date >= qs && x.date <= q) need += Number(x.amount) || 0;
      for (const u of units) {
        if (u.leaseStatus === "occupied" && u.leaseEnd && u.leaseEnd >= qs && u.leaseEnd <= q) need += rolloverCost(u, inp);
        if (k === 0 && u.leaseStatus !== "occupied") need += (Number(u.tiNewPSF ?? inp.tiPerSFNew ?? 0) || 0) * Number(u.squareFeet);
      }
      const t = holdYearAt(acq, q);
      const cf = r?.annualCashFlows?.[Math.min(t, r.annualCashFlows.length) - 1];
      const dscr = cf && cf.debtService ? cf.noi / cf.debtService : null;
      const dy = cf && loan ? (cf.noi / loan) * 100 : null;
      const available = !!fac && left > 0 && (!fac.availableUntil || q <= fac.availableUntil);
      const testPass = !!fac && dscr != null && dscr >= fac.minDscr && (fac.minDebtYieldPct == null || (dy != null && dy >= fac.minDebtYieldPct));
      const headroomPct = fac && dscr ? (1 - (fac.minDscr * cf.debtService) / cf.noi) * 100 : null;
      const cash = Math.max(0, (cf?.pretaxCashFlow ?? 0) / 4);
      return { quarter: q, label: qLabel(q), need, dscr, dy, available, testPass, headroomPct, cash, facilityLeft: left, fromFacility: 0, fromCash: 0, fromLine: 0, fromPlanned: 0, call: 0, color: "grey", testFailed: false };
    });
    // Scenario actions: cuts, then postponements (onto a later quarter).
    for (const x of actions.filter((y) => y.dealId === d.id)) {
      const c = cells.find((y) => y.quarter === x.quarter);
      if (!c) continue;
      if (x.kind === "cut") { const cut = c.need * Math.min(1, Math.max(0, (Number(x.pct) || 0) / 100)); c.need -= cut; c.cut = (c.cut ?? 0) + cut; }
    }
    for (const x of actions.filter((y) => y.dealId === d.id && y.kind === "postpone")) {
      const c = cells.find((y) => y.quarter === x.quarter), to = cells.find((y) => y.quarter === x.to);
      if (!c || !to || to.quarter <= c.quarter) continue;
      to.need += c.need; to.postponedIn = (to.postponedIn ?? 0) + c.need; c.postponedOut = (c.postponedOut ?? 0) + c.need; c.need = 0;
    }
    for (const x of actions.filter((y) => y.dealId === d.id && y.kind === "call")) {
      const c = cells.find((y) => y.quarter === x.quarter);
      if (c) c.plannedCall = (c.plannedCall ?? 0) + Math.max(0, Number(x.amount) || 0);
    }
    return { id: d.id, name: inp.propertyName || d.id, facility: fac, cells, leftRef: () => left, use: (amt) => { left -= amt; } };
  });

  // Fill each quarter across assets (the sub line is shared).
  const fundCall = quarters.map(() => 0);
  quarters.forEach((q, k) => {
    let room = lineRoom[k];
    for (const a of assets) {
      const c = a.cells[k];
      c.facilityLeft = a.leftRef();
      if (!(c.need > 0)) continue;
      let rest = c.need;
      if (a.facility && c.available && c.testPass) {
        const take = Math.min(rest, a.leftRef());
        a.use(take); c.fromFacility = take; rest -= take;
      }
      c.testFailed = !!a.facility && c.available && !c.testPass;
      const fromCash = Math.min(rest, c.cash); c.fromCash = fromCash; rest -= fromCash;
      const fromLine = Math.min(rest, room); c.fromLine = fromLine; room -= fromLine; rest -= fromLine;
      const planned = Math.min(rest, c.plannedCall ?? 0); c.fromPlanned = planned; rest -= planned;
      c.call = rest; fundCall[k] += rest;
      c.color = c.call > 1 || c.testFailed ? "red" : planned > 1 ? "blue" : c.fromLine > 1 ? "amber" : c.fromCash > 1 ? "lightgreen" : "green";
    }
  });
  return {
    quarters: quarters.map((q) => ({ quarter: q, label: qLabel(q) })),
    lineRoom,
    lineExpires: fd.investmentPeriodEnd,
    assets: assets.map(({ leftRef, use, ...a }) => a),
    fundCall,
  };
}
