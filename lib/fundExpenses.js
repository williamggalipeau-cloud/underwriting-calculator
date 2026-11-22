// ─── Fund-level expenses and fund cash ───────────────────────────────────────
// Fund-level expenses:
//   • Management fee: mgmtFeePct per year, charged quarterly in advance (on
//     the first day of each quarter, from the day after final close until the
//     last asset is sold). Basis "commitments-then-invested" (default): LP
//     commitments through the investment period, then LP capital invested in
//     assets still held (cost basis). Basis "invested": LP invested capital
//     throughout. LPs only: the GP's commitment pays no fee.
//   • Sub line costs: interest and unused fees for each month (from
//     lib/subLine), due at month end.
// How they are paid, in order:
//   1. Fund cash: the fund keeps a minimum balance of cashReserveQuarters
//      (default 2) quarters of projected fund expenses, plus the operating
//      income it receives before distributing it.
//   2. The sub line: any shortfall is drawn on the line on the due date and
//      bears interest at the line rate until repaid.
//   3. A capital call at quarter end: income first repays those draws; any
//      remainder, plus whatever is needed to restore the minimum cash balance,
//      is called. The part that paid the management fee is called from LPs
//      only; the rest from LPs and GP by commitment.
// Operating income (asset income events, incl. reserve releases at exit) goes
// into fund cash at quarter end; cash above the minimum is distributed then.
// After the last sale, remaining cash is distributed with it.

import { addYears, parseDate, toISO } from "@/lib/fundTimeline";
import { lineRateAt, monthEndISO } from "@/lib/subLine";

const DAY = 86_400_000;
const addDays = (iso, n) => toISO(new Date(parseDate(iso).getTime() + n * DAY));
const quarterStartOf = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  return toISO(new Date(Date.UTC(y, Math.floor((m - 1) / 3) * 3, 1)));
};
const nextQuarterStart = (iso) => {
  const [y, m] = quarterStartOf(iso).split("-").map(Number);
  return toISO(new Date(Date.UTC(y, m - 1 + 3, 1)));
};
const daysBetween = (a, b) => (parseDate(b).getTime() - parseDate(a).getTime()) / DAY;

export const FEE_BASES = [
  ["commitments-then-invested", "LP commitments during the investment period, then LP invested capital"],
  ["invested", "LP invested capital throughout"],
];

// events: fund events before expenses — asset purchase calls ({ kind: "call",
// purchase: true, dealId }), other calls, income and capital (sales).
// lineCost(monthEnd) → { interest, unused } for that month (or null).
// Returns { events, periods, ledger, cashAt(iso), totals }.
// purchases: the assets' purchase calls (before the sub line moved them), for
// the invested-capital fee basis; defaults to the purchase calls in events.
export function applyFundExpenses(events, terms, { investmentPeriodEnd, lineCost = () => null, curve, todayISO = null, purchases: purchaseCalls = null }) {
  const feeRate = Math.max(0, Number(terms.mgmtFeePct) || 0) / 100;
  const basisMode = terms.mgmtFeeBasis ?? "commitments-then-invested";
  const lpPct = 1 - (Number(terms.gpCommitPct) || 0) / 100;
  const lpCommitments = (Number(terms.targetEquity) || 0) * lpPct;
  const reserveQ = Math.max(0, Number(terms.cashReserveQuarters ?? 2));
  const spread = terms.subLineSpreadPct ?? 1.75;

  const purchases = purchaseCalls ?? events.filter((e) => e.kind === "call" && e.purchase);
  const sales = events.filter((e) => e.kind === "capital" && e.dealId);
  const exitOf = new Map(sales.map((e) => [e.dealId, e.date]));
  const incomeEvents = events.filter((e) => e.kind === "income");
  const passThrough = events.filter((e) => e.kind !== "income");
  if (!events.length) return { events, periods: [], ledger: [], cashAt: () => 0, totals: { fees: 0, lineCosts: 0, called: 0, distributed: 0 } };

  const start = addDays(terms.finalClose, 1);
  const lastSale = sales.reduce((m, e) => (e.date > m ? e.date : m), "");
  const lastEvent = events.reduce((m, e) => (e.date > m ? e.date : m), "");
  const end = lastSale || lastEvent;

  // LP invested capital (cost) in assets held on a date.
  const lpInvested = (iso) =>
    purchases
      .filter((p) => p.date <= iso && (!exitOf.get(p.dealId) || exitOf.get(p.dealId) > iso))
      .reduce((s, p) => s + -p.amount * lpPct, 0);
  const feeBasis = (iso) =>
    basisMode === "commitments-then-invested" && iso <= investmentPeriodEnd ? lpCommitments : lpInvested(iso);

  // Quarters from the first fee date to the end of the fund.
  const quarters = [];
  for (let qs = start; qs <= end; ) {
    const nq = nextQuarterStart(qs);
    const qe = addDays(nq, -1);
    quarters.push({ start: qs, end: qe < end ? qe : end, fullEnd: qe });
    qs = nq;
  }
  const feeFor = (q) => {
    if (!feeRate) return 0;
    const qDays = daysBetween(quarterStartOf(q.start), nextQuarterStart(q.start));
    const days = daysBetween(q.start, addDays(q.fullEnd, 1));
    return (feeRate / 4) * feeBasis(q.start) * (days / qDays);
  };
  const lineCostForQuarter = (q) => {
    let t = 0;
    for (let m = monthEndISO(q.start); m <= q.fullEnd; m = monthEndISO(addDays(m, 1))) {
      const c = lineCost(m);
      if (c) t += (c.interest ?? 0) + (c.unused ?? 0);
    }
    return t;
  };
  const projected = quarters.map((q) => feeFor(q) + lineCostForQuarter(q));
  const incomeByDate = new Map();
  for (const e of incomeEvents) incomeByDate.set(e.date, (incomeByDate.get(e.date) ?? 0) + e.amount);

  let cash = 0;
  let bridge = 0; // expenses drawn on the line, repaid at quarter end
  let bridgeT = null;
  const out = [];
  const periods = [];
  const ledger = [];
  const cashHistory = []; // [{ date, cash }]

  let bridgeAccrued = 0; // interest on expense draws not yet paid
  const accrueBridge = (iso) => {
    if (bridge > 0 && bridgeT && iso > bridgeT) {
      bridgeAccrued += bridge * lineRateAt(curve, bridgeT, spread) * (daysBetween(bridgeT, iso) / 360);
    }
    if (!bridgeT || iso > bridgeT) bridgeT = iso;
  };

  quarters.forEach((q, qi) => {
    const p = { quarter: q.start, fee: 0, feeBasis: feeBasis(q.start), lineInterest: 0, lineUnused: 0, bridgeInterest: 0, fromCash: 0, drawn: 0, income: 0, repaidFromIncome: 0, called: 0, calledFee: 0, distributed: 0, cashStart: cash, cashEnd: 0, target: 0 };
    let feeDrawn = 0;
    const pay = (date, amount, purpose, notes) => {
      if (!(amount > 0.005)) return;
      const fromCash = Math.min(cash, amount);
      cash -= fromCash;
      const draw = amount - fromCash;
      p.fromCash += fromCash;
      if (draw > 0.005) {
        accrueBridge(date);
        bridge += draw;
        p.drawn += draw;
        if (purpose === "fees") feeDrawn += draw;
        ledger.push({ date, type: "draw", purpose, amount: draw, notes: `Drawn on the line to pay ${notes.toLowerCase()} (fund cash short)` });
      }
      ledger.push({ date, type: "expense", purpose, amount, notes: `${notes}${draw > 0.005 ? ` — ${fmt(fromCash)} from fund cash, ${fmt(draw)} drawn on the line` : " — paid from fund cash"}` });
    };

    // Management fee, in advance.
    const fee = feeFor(q);
    p.fee = fee;
    pay(q.start, fee, "fees", `Management fee ${(feeRate * 100).toFixed(2)}%/yr on ${fmt(p.feeBasis)} ${basisMode === "commitments-then-invested" && q.start <= investmentPeriodEnd ? "LP commitments" : "LP invested capital"}${q.end < q.fullEnd || q.start !== quarterStartOf(q.start) ? " (prorated)" : ""}`);

    // Monthly line costs, plus interest on expense draws.
    for (let m = monthEndISO(q.start); m <= q.fullEnd; m = monthEndISO(addDays(m, 1))) {
      if (m > end && m > q.end) break;
      const c = lineCost(m) ?? { interest: 0, unused: 0 };
      accrueBridge(m);
      const bi = bridgeAccrued;
      bridgeAccrued = 0;
      p.lineInterest += c.interest ?? 0;
      p.lineUnused += c.unused ?? 0;
      p.bridgeInterest += bi;
      const total = (c.interest ?? 0) + (c.unused ?? 0) + bi;
      pay(m <= end ? m : end, total, "line-interest", `Sub line interest ${fmt((c.interest ?? 0) + bi)} and unused fee ${fmt(c.unused ?? 0)} for ${m.slice(0, 7)}`);
    }

    // Quarter end: income in, repay draws, restore the minimum, distribute.
    const qEnd = q.end;
    let inc = 0;
    for (const [d, v] of incomeByDate) if (d >= q.start && d <= qEnd) inc += v;
    p.income = inc;
    cash += inc;
    accrueBridge(qEnd);
    // Interest on draws since the last month end is repaid with them.
    bridge += bridgeAccrued;
    p.bridgeInterest += bridgeAccrued;
    bridgeAccrued = 0;
    const repayFromCash = Math.min(cash, bridge);
    cash -= repayFromCash;
    p.repaidFromIncome = repayFromCash;
    const bridgeLeft = bridge - repayFromCash;
    const isLast = qi === quarters.length - 1;
    const target = isLast ? 0 : reserveQ >= 1 ? projected.slice(qi + 1, qi + 1 + Math.ceil(reserveQ)).reduce((s, v) => s + v, 0) * (reserveQ / Math.ceil(reserveQ)) : 0;
    p.target = target;
    const topUp = Math.max(0, target - cash);
    const call = bridgeLeft + topUp;
    if (bridge > 0.005) {
      ledger.push({ date: qEnd, type: "repay", purpose: "line-repay", amount: bridge, notes: `Expense draws repaid: ${fmt(repayFromCash)} from fund cash${bridgeLeft > 0.005 ? `, ${fmt(bridgeLeft)} from the capital call` : ""}` });
    }
    if (call > 0.005) {
      const feePart = Math.min(call, feeDrawn);
      p.called = call;
      p.calledFee = feePart;
      if (feePart > 0.005) out.push({ date: qEnd, amount: -feePart, kind: "fee", fundExpense: true });
      if (call - feePart > 0.005) out.push({ date: qEnd, amount: -(call - feePart), kind: "call", fundExpense: true });
      ledger.push({ date: qEnd, type: "call", purpose: "fees", amount: call, notes: `Fund expenses call: repays expense draws ${fmt(bridgeLeft)}${topUp > 0.005 ? `, restores fund cash to ${fmt(target)}` : ""}${feePart > 0.005 ? ` (${fmt(feePart)} management fee, LPs only)` : ""}` });
    }
    cash += topUp;
    bridge = 0;
    bridgeT = null;
    const dist = Math.max(0, cash - target);
    if (dist > 0.005) {
      out.push({ date: qEnd, amount: dist, kind: "income", fundCash: true });
      cash -= dist;
      p.distributed = dist;
    }
    p.cashEnd = cash;
    cashHistory.push({ date: qEnd, cash });
    periods.push(p);
  });
  // Income after the last quarter (shouldn't happen) passes through.
  for (const [d, v] of incomeByDate) if (d > end) out.push({ date: d, amount: v, kind: "income" });

  const totals = {
    fees: periods.reduce((s, p) => s + p.fee, 0),
    lineCosts: periods.reduce((s, p) => s + p.lineInterest + p.lineUnused + p.bridgeInterest, 0),
    called: periods.reduce((s, p) => s + p.called, 0),
    distributed: periods.reduce((s, p) => s + p.distributed, 0),
  };
  const cashAt = (iso) => {
    let c = 0;
    for (const h of cashHistory) {
      if (h.date > iso) break;
      c = h.cash;
    }
    return c;
  };
  return {
    events: [...passThrough, ...out],
    periods,
    ledger: todayISO ? ledger.filter((l) => l.date <= todayISO) : ledger,
    allLedger: ledger,
    cashAt,
    totals,
  };
}

function fmt(n) {
  const a = Math.abs(n);
  return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}k` : `$${a.toFixed(0)}`;
}

export { addYears };
