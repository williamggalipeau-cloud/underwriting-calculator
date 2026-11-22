// ─── Subscription line of credit ─────────────────────────────────────────────
// Rewrites a fund's capital calls as if they were first funded by a
// subscription line secured by LP commitments:
//   - Each capital need ("call" event: purchase, shortfall) draws on the line
//     up to its remaining capacity; anything above capacity is called from
//     LPs on the day.
//   - Each draw is repaid by an LP capital call maxDays after it was drawn.
//   - Interest accrues daily (Actual/360) on the balance at the forward
//     30-day average SOFR on that day + spread; an unused fee accrues on the
//     undrawn facility from final close until the later of the investment
//     period end and the last repayment. Accrued interest and fees are paid
//     with each repayment call (and any remainder with a final call), so
//     they are LP costs with no matching distribution.
// Fund-fee calls are left as they are. Returns the new event list plus stats.

import { DEFAULT_CURVE } from "@/lib/forwardCurve";
import { forwardAt } from "@/lib/capPricer";

const DAY = 86_400_000;
const parse = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toISO = (t) => new Date(t).toISOString().slice(0, 10);

export const DEFAULT_SUB_LINE = {
  enabled: true,
  sizePct: 80, // % of total commitments
  spreadPct: 1.75, // over 30-day average SOFR
  unusedFeePct: 0.25, // per year on the undrawn facility
  maxDays: 365, // days a draw may stay outstanding before an LP call repays it
};

// events: [{ date, amount, kind }] (calls negative). commitments: fund size
// (if 0, the facility is sized off total planned calls). curve: forward curve.
// startISO / openingDraws: start the simulation on startISO with draws that
// are already outstanding ([{ date, amount }], e.g. actual draws); each is
// repaid maxDays after its draw date (or on startISO if that has passed).
export function applySubLine(events, { line, commitments, finalClose, investmentPeriodEnd, curve = DEFAULT_CURVE, startISO, openingDraws = [] }) {
  const calls = events.filter((e) => e.kind === "call" && e.amount < 0);
  const others = events.filter((e) => !(e.kind === "call" && e.amount < 0));
  const plannedCalls = -calls.reduce((s, e) => s + e.amount, 0);
  const basis = commitments > 0 ? commitments : plannedCalls;
  const size = Math.max(0, basis * ((line.sizePct ?? 0) / 100));
  if (!line.enabled || size <= 0 || (!calls.length && !openingDraws.length)) {
    return { events, stats: null };
  }

  const spread = (line.spreadPct ?? 0) / 100;
  const unusedRate = (line.unusedFeePct ?? 0) / 100;
  const maxDays = Math.max(1, Math.round(line.maxDays ?? 365));

  // Draw schedule.
  const sortedCalls = [...calls].sort((a, b) => (a.date < b.date ? -1 : 1));
  const draws = []; // { date, amount, repayDate, repaid }
  const directCalls = [];
  const repayEvents = [];
  let balance = 0;
  let accrued = 0;
  let interest = 0;
  let unusedFees = 0;
  let peak = 0;
  const balanceByDay = new Map();

  const start = startISO
    ? parse(startISO)
    : Math.min(parse(finalClose), sortedCalls.length ? parse(sortedCalls[0].date) : parse(finalClose));
  for (const d of openingDraws) {
    if (!(d.amount > 0)) continue;
    draws.push({ date: d.date, amount: d.amount, repayT: Math.max(parse(d.date) + maxDays * DAY, start), repaid: false, opening: true });
    balance += d.amount;
  }
  let callIdx = 0;
  let lastRepay = start;
  const ipEnd = parse(investmentPeriodEnd);

  for (let t = start; ; t += DAY) {
    const iso = toISO(t);
    // 1. Repay draws due today (LP call = principal + accrued costs).
    const due = draws.filter((d) => !d.repaid && d.repayT <= t);
    if (due.length) {
      const principal = due.reduce((s, d) => s + d.amount, 0);
      due.forEach((d) => (d.repaid = true));
      balance -= principal;
      repayEvents.push({ date: iso, amount: -(principal + accrued), kind: "call", subLine: true, principal, cost: accrued });
      accrued = 0;
      lastRepay = t;
    }
    // 2. Today's capital needs draw on the line, up to capacity.
    while (callIdx < sortedCalls.length && parse(sortedCalls[callIdx].date) <= t) {
      const need = -sortedCalls[callIdx].amount;
      const draw = Math.min(need, Math.max(0, size - balance));
      if (draw > 0) {
        draws.push({ date: iso, amount: draw, repayT: t + maxDays * DAY, repaid: false });
        balance += draw;
      }
      if (need - draw > 0.005) {
        directCalls.push({ ...sortedCalls[callIdx], amount: -(need - draw) });
      }
      callIdx++;
    }
    peak = Math.max(peak, balance);
    balanceByDay.set(iso, balance);
    // 3. Accrue today's interest and unused fee.
    const rate = forwardAt(curve, iso, "avgSofr30D") / 100 + spread;
    const dayInterest = (balance * rate) / 360;
    const dayUnused = (Math.max(0, size - balance) * unusedRate) / 360;
    interest += dayInterest;
    unusedFees += dayUnused;
    accrued += dayInterest + dayUnused;

    const allDrawn = callIdx >= sortedCalls.length;
    const allRepaid = draws.every((d) => d.repaid);
    if (allDrawn && allRepaid && t >= ipEnd) {
      if (accrued > 0.005) {
        repayEvents.push({ date: iso, amount: -accrued, kind: "call", subLine: true, principal: 0, cost: accrued });
        accrued = 0;
      }
      lastRepay = Math.max(lastRepay, t);
      break;
    }
    if (t - start > 40 * 365 * DAY) break; // safety
  }

  const drawn = draws.reduce((s, d) => s + d.amount, 0);
  const avgDays =
    drawn > 0
      ? draws.reduce((s, d) => s + d.amount * Math.min(maxDays, (d.repayT - parse(d.date)) / DAY), 0) / drawn
      : 0;

  return {
    events: [...others, ...directCalls, ...repayEvents],
    stats: {
      size,
      sizedOn: commitments > 0 ? "commitments" : "planned calls",
      drawn,
      peak,
      interest,
      unusedFees,
      totalCost: interest + unusedFees,
      avgDays,
      endDate: toISO(lastRepay),
      balanceAt: (iso) => {
        // Balance at the end of a given day (0 outside the facility period).
        if (balanceByDay.has(iso)) return balanceByDay.get(iso);
        let last = 0;
        for (const [d, b] of balanceByDay) {
          if (d > iso) break;
          last = b;
        }
        return last;
      },
    },
  };
}
