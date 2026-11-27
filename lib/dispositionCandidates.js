// Dispositions → Disposition Candidates (user, 11/25, 1.1.5): a screener of
// the owned assets whose business plan exit falls within the next 12 months,
// or has passed while the asset is still owned. The exit comes from the
// latest business plan revision only: its target exit when that is a full
// date, else the acquisition date + the plan's hold years. Assets with no
// business plan are not listed. Each row carries the asset's saved Sell/Hold
// decision (fund terms → sellHold.decisions), so an asset held past its plan
// shows whether that was a decision ("Held past plan") or not.
// (Later, in the 1.2 workflow, every candidate will need a fresh sell/hold
// analysis.)
import { ACTIVE_SALE_STAGES, stageLabel as saleStageLabel } from "@/lib/dispositions";
import { allInBasis, assetSF, breakEvenOccupancy, perSF } from "@/lib/assetMetrics";
import { underwrite } from "@/lib/calculations";

export const WINDOW_MONTHS = 12;
const addMonths = (iso, k) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10); };
const addYearsFrac = (iso, y) => {
  const whole = Math.floor(y), months = Math.round((y - whole) * 12);
  return addMonths(addMonths(iso, whole * 12), months);
};
const monthsBetween = (a, b) => { const A = new Date(`${a}T00:00:00Z`), B = new Date(`${b}T00:00:00Z`); return (B.getUTCFullYear() - A.getUTCFullYear()) * 12 + (B.getUTCMonth() - A.getUTCMonth()) + (B.getUTCDate() - A.getUTCDate()) / 30; };

// The plan's exit date: { date, rev, basis } or null.
export function planExit(inputs) {
  const revs = inputs?.businessPlan?.revisions ?? [];
  const cur = revs.at(-1);
  if (!cur?.plan) return null;
  const ex = cur.plan.exit ?? {};
  const t = String(ex.targetExit ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { date: t, rev: cur.n ?? revs.length, basis: "target" };
  const hold = Number(ex.holdYears);
  if (!inputs.acquisitionDate || !(hold > 0)) return null;
  return { date: addYearsFrac(inputs.acquisitionDate, hold), rev: cur.n ?? revs.length, basis: "hold", holdYears: hold };
}

const DECISION_LABEL = { base: "Base plan", sell: "Sell now", hold: "Hold", refi: "Refinance and hold" };
export function decisionText(d) {
  if (!d?.decision) return "";
  return d.decision === "hold" || d.decision === "refi" ? `${DECISION_LABEL[d.decision]}${d.years ? ` to year ${d.years}` : ""}` : DECISION_LABEL[d.decision] ?? d.decision;
}

// { rows, next } — rows sorted by planned exit; next: the soonest exit beyond
// the window (for the empty state).
// 1.1.16: the latest mark on or before today ({ date, value }) or null.
export function latestMark(marks, todayISO) {
  const dates = Object.keys(marks ?? {}).filter((d) => d <= todayISO && Number(marks[d]?.value) > 0).sort();
  return dates.length ? { date: dates.at(-1), value: Number(marks[dates.at(-1)].value) } : null;
}
// 1.1.16: current value and basis per SF, and break-even occupancy.
export function candidateMetrics(inputs, marks, todayISO) {
  let model = null;
  try { model = underwrite(inputs); } catch { model = null; }
  const sf = assetSF(inputs);
  const mark = latestMark(marks, todayISO);
  const basis = allInBasis(inputs, model);
  return { sf, value: mark?.value ?? null, valueDate: mark?.date ?? null, valuePSF: perSF(mark?.value ?? null, sf), basis, basisPSF: perSF(basis, sf), breakEven: breakEvenOccupancy(inputs, { todayISO, model }) };
}

export function dispositionCandidates(deals, funds = {}, { todayISO, valuations = {} }) {
  const until = addMonths(todayISO, WINDOW_MONTHS);
  const rows = [], later = [];
  for (const d of deals) {
    const inp = d.inputs ?? {};
    if (!inp.fundName || !inp.acquisitionDate || inp.acquisitionDate > todayISO) continue;
    const sales = inp.dispositions ?? [];
    if (sales.some((s) => s.stage === "closed" && (s.scope ?? "whole") === "whole")) continue; // sold
    const ex = planExit(inp);
    if (!ex) continue;
    if (ex.date > until) { later.push({ dealId: d.id, asset: inp.propertyName || d.id, exit: ex.date }); continue; }
    const active = sales.find((s) => ACTIVE_SALE_STAGES.includes(s.stage)) ?? null;
    const dec = funds?.[inp.fundName]?.sellHold?.decisions?.[d.id] ?? null;
    const past = ex.date < todayISO;
    const yearsHeldAtExit = ex.holdYears ?? null;
    const heldLonger = past && dec && (dec.decision === "hold" || dec.decision === "refi") && (!yearsHeldAtExit || !dec.years || dec.years > yearsHeldAtExit);
    rows.push({
      dealId: d.id, asset: inp.propertyName || d.id, fund: inp.fundName, acquired: inp.acquisitionDate,
      exit: ex.date, exitBasis: ex.basis, planRev: ex.rev, monthsLeft: Math.round(monthsBetween(todayISO, ex.date)),
      past, recommendation: inp.businessPlan?.revisions?.at(-1)?.plan?.recommendation ?? "",
      sale: active ? { id: active.id, stage: active.stage, label: saleStageLabel(active.stage) } : null,
      decision: dec ? { ...dec, text: decisionText(dec) } : null, heldLonger: !!heldLonger,
      ...candidateMetrics(inp, valuations?.[d.id], todayISO),
    });
  }
  rows.sort((a, b) => (a.exit < b.exit ? -1 : a.exit > b.exit ? 1 : a.asset.localeCompare(b.asset)));
  later.sort((a, b) => (a.exit < b.exit ? -1 : 1));
  return { rows, next: later[0] ?? null, until };
}
