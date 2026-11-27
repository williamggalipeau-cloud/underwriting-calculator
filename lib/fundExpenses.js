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
//   1. Fund cash, down to zero: the fund rebuilds a minimum balance of
//      cashReserveQuarters (default 2) quarters of projected fund expenses
//      from operating income before distributing it.
//   2. The sub line, up to its capacity: the shortfall is drawn on the due
//      date and stays on the line (bearing interest at the line rate) until
//      operating income or sale proceeds repay it.
//   3. Capital only when fund cash and the line are both exhausted: the
//      uncovered amount is assumed called once, at quarter end. Calls are
//      entered by the user (never generated as activity); the model uses
//      this assumption until they are. The fee part is LP-only.
// At quarter end, operating income (asset income events, incl. reserve
// releases at exit) first repays expense draws, then rebuilds the minimum
// cash balance; the rest is distributed. Sale proceeds repay expense draws
// before they are distributed. After the last sale nothing is kept.

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
// lineHeadroom(iso): undrawn line capacity that day before expense draws
// (facility size − other draws); 0 without a line.
export function applyFundExpenses(events, terms, { investmentPeriodEnd, lineCost = () => null, lineHeadroom = () => 0, curve, todayISO = null, purchases: purchaseCalls = null }) {
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
  // 1.1.12 (code review): the empty case has the same shape as the full one.
  if (!events.length) return { events, periods: [], ledger: [], allLedger: [], cashAt: () => 0, expenseDrawsAt: () => 0, totals: { fees: 0, lineCosts: 0, called: 0, distributed: 0 } };

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
  let bridge = 0; // expenses drawn on the line (principal + capitalised interest)
  let bridgeT = null;
  const out = [];
  const periods = [];
  const ledger = [];
  const cashHistory = []; // [{ date, cash }]
  const saleCut = new Map(); // sale event → proceeds used to repay expense draws

  let bridgeAccrued = 0; // interest on expense draws not yet paid
  const accrueBridge = (iso) => {
    if (bridge > 0 && bridgeT && iso > bridgeT) {
      bridgeAccrued += bridge * lineRateAt(curve, bridgeT, spread) * (daysBetween(bridgeT, iso) / 360);
    }
    if (!bridgeT || iso > bridgeT) bridgeT = iso;
  };
  // Repays expense draws (and their accrued interest) from a source.
  const repayBridge = (date, available, from) => {
    accrueBridge(date);
    bridge += bridgeAccrued;
    const interest = bridgeAccrued;
    bridgeAccrued = 0;
    const r = Math.min(available, bridge);
    if (r > 0.005) {
      bridge -= r;
      ledger.push({ date, type: "repay", purpose: "line-repay", amount: r, notes: `Expense draws repaid from ${from}${interest > 0.005 ? ` (incl. ${fmt(interest)} interest)` : ""}` });
    }
    return { repaid: Math.max(0, r), interest };
  };

  quarters.forEach((q, qi) => {
    const p = { quarter: q.start, fee: 0, feeBasis: feeBasis(q.start), lineInterest: 0, lineUnused: 0, bridgeInterest: 0, fromCash: 0, drawn: 0, income: 0, repaidFromIncome: 0, repaidFromSales: 0, called: 0, calledFee: 0, distributed: 0, cashStart: cash, cashEnd: 0, bridgeEnd: 0, target: 0 };
    let unfunded = 0;
    let unfundedFee = 0;
    // Pays an expense: fund cash first, then the line up to its capacity;
    // anything left needs capital, called at quarter end.
    const pay = (date, amount, purpose, notes) => {
      if (!(amount > 0.005)) return;
      const fromCash = Math.min(cash, amount);
      cash -= fromCash;
      p.fromCash += fromCash;
      let rest = amount - fromCash;
      let draw = 0;
      if (rest > 0.005) {
        accrueBridge(date);
        draw = Math.min(rest, Math.max(0, lineHeadroom(date) - bridge));
        if (draw > 0.005) {
          bridge += draw;
          p.drawn += draw;
          ledger.push({ date, type: "draw", purpose, amount: draw, notes: `Drawn on the line to pay ${notes.charAt(0).toLowerCase()}${notes.slice(1)} (fund cash used up)` });
        } else draw = 0;
        rest -= draw;
      }
      if (rest > 0.005) {
        unfunded += rest;
        if (purpose === "fees") unfundedFee += rest;
      }
      const parts = [fromCash > 0.005 && `${fmt(fromCash)} from fund cash`, draw > 0.005 && `${fmt(draw)} drawn on the line`, rest > 0.005 && `${fmt(rest)} needs a capital call (cash and line exhausted)`].filter(Boolean);
      ledger.push({ date, type: "expense", purpose, amount, notes: `${notes} — ${parts.join(", ")}` });
    };

    // The quarter's dated items: fee (in advance), month-end line costs, sales.
    const items = [];
    items.push({ date: q.start, k: "fee" });
    for (let m = monthEndISO(q.start); m <= q.fullEnd; m = monthEndISO(addDays(m, 1))) {
      if (m > end && m > q.end) break;
      items.push({ date: m <= end ? m : end, k: "month", month: m });
    }
    for (const e of sales) if (e.date >= q.start && e.date <= q.end) items.push({ date: e.date, k: "sale", e });
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.k === "sale") - (b.k === "sale")));

    for (const it of items) {
      if (it.k === "fee") {
        const fee = feeFor(q);
        p.fee = fee;
        pay(q.start, fee, "fees", `Management fee ${(feeRate * 100).toFixed(2)}%/yr on ${fmt(p.feeBasis)} ${basisMode === "commitments-then-invested" && q.start <= investmentPeriodEnd ? "LP commitments" : "LP invested capital"}${q.end < q.fullEnd || q.start !== quarterStartOf(q.start) ? " (prorated)" : ""}`);
      } else if (it.k === "month") {
        const c = lineCost(it.month) ?? { interest: 0, unused: 0 };
        accrueBridge(it.date);
        const bi = bridgeAccrued;
        bridgeAccrued = 0;
        p.lineInterest += c.interest ?? 0;
        p.lineUnused += c.unused ?? 0;
        p.bridgeInterest += bi;
        const total = (c.interest ?? 0) + (c.unused ?? 0) + bi;
        pay(it.date, total, "line-interest", `Sub line interest ${fmt((c.interest ?? 0) + bi)} and unused fee ${fmt(c.unused ?? 0)} for ${it.month.slice(0, 7)}`);
      } else {
        // Sale: proceeds repay expense draws before they are distributed.
        const { repaid, interest } = repayBridge(it.date, it.e.amount, `${it.e.dealId ? "sale proceeds" : "proceeds"}`);
        p.bridgeInterest += interest;
        if (repaid > 0.005) {
          saleCut.set(it.e, (saleCut.get(it.e) ?? 0) + repaid);
          p.repaidFromSales += repaid;
        }
      }
    }

    // Quarter end: income repays expense draws, then rebuilds the minimum
    // cash balance; any expense the cash and line couldn't cover is called;
    // the rest is distributed.
    const qEnd = q.end;
    let inc = 0;
    for (const [d, v] of incomeByDate) if (d >= q.start && d <= qEnd) inc += v;
    p.income = inc;
    cash += inc;
    const { repaid, interest } = repayBridge(qEnd, cash, "operating income");
    cash -= repaid;
    p.repaidFromIncome = repaid;
    p.bridgeInterest += interest;
    const isLast = qi === quarters.length - 1;
    const target = isLast ? 0 : reserveQ > 0 ? projected.slice(qi + 1, qi + 1 + Math.ceil(reserveQ)).reduce((s, v) => s + v, 0) * (reserveQ / Math.ceil(reserveQ)) : 0;
    p.target = target;
    if (unfunded > 0.005) {
      // Capital is needed only once fund cash and the line are exhausted:
      // one call at quarter end, entered by the user (model assumption here).
      const feePart = Math.min(unfunded, unfundedFee);
      p.called = unfunded;
      p.calledFee = feePart;
      if (feePart > 0.005) out.push({ date: qEnd, amount: -feePart, kind: "fee", fundExpense: true });
      if (unfunded - feePart > 0.005) out.push({ date: qEnd, amount: -(unfunded - feePart), kind: "call", fundExpense: true });
    }
    // At the end of the fund, remaining draws come out of the last cash.
    if (isLast && bridge > 0.005) {
      const r = repayBridge(qEnd, cash, "remaining fund cash");
      cash -= r.repaid;
    }
    const dist = Math.max(0, cash - target);
    if (dist > 0.005) {
      out.push({ date: qEnd, amount: dist, kind: "income", fundCash: true });
      cash -= dist;
      p.distributed = dist;
    }
    p.cashEnd = cash;
    p.bridgeEnd = bridge;
    cashHistory.push({ date: qEnd, cash, bridge });
    periods.push(p);
  });
  // Income after the last quarter (shouldn't happen) passes through. So does
  // income dated on or before final close (an asset bought earlier): fund
  // expenses start the day after, and that income was being dropped (1.1.12).
  for (const [d, v] of incomeByDate) if (d > end || d < start) out.push({ date: d, amount: v, kind: "income" });

  const totals = {
    fees: periods.reduce((s, p) => s + p.fee, 0),
    lineCosts: periods.reduce((s, p) => s + p.lineInterest + p.lineUnused + p.bridgeInterest, 0),
    called: periods.reduce((s, p) => s + p.called, 0),
    distributed: periods.reduce((s, p) => s + p.distributed, 0),
  };
  const at = (iso, key) => {
    let c = 0;
    for (const h of cashHistory) {
      if (h.date > iso) break;
      c = h[key];
    }
    return c;
  };
  return {
    events: [...passThrough.map((e) => (saleCut.has(e) ? { ...e, amount: e.amount - saleCut.get(e) } : e)), ...out],
    periods,
    ledger: todayISO ? ledger.filter((l) => l.date <= todayISO) : ledger,
    allLedger: ledger,
    cashAt: (iso) => at(iso, "cash"),
    expenseDrawsAt: (iso) => at(iso, "bridge"),
    totals,
  };
}

function fmt(n) {
  const a = Math.abs(n);
  return a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}k` : `$${a.toFixed(0)}`;
}

export { addYears };
