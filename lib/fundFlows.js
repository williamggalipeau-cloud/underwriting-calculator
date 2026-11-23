// ─── Fund LP cash flows: model, or actuals to date + model after ─────────────
// Builds the event stream the fund waterfall runs on (LP + GP calls, asset
// income and sale proceeds), used by Portfolio Return and Valuations.
//
// Without capital activity: the model. Every asset capital need draws on the
// subscription line and is repaid by an LP call after maxDays (lib/subLine).
//
// With capital activity (lib/capitalActivity), up to today:
//   - LP calls are the actual capital calls (incl. any fee, line repayment
//     and line interest calls entered).
//   - Model capital needs dated on or before today are dropped (the actual
//     calls and line draws funded them), except purchases no entry is tagged
//     to: those stay as LP calls on the model's date, so an asset is never
//     counted as owned without its equity having been paid.
// After today:
//   - Sub line draws still outstanding today (actual draws less actual
//     repayments, first in first out) are repaid by LP calls maxDays after
//     each draw (or tomorrow if that has passed), with interest accrued from
//     tomorrow at the forward 30-day average SOFR + spread.
//   - The model's capital needs dated after today (purchase equity, unless an
//     entry is tagged to that asset, and shortfalls) draw on the line's
//     remaining capacity as in the model.
//   - Fund management fees (if any) are charged only after today; earlier
//     ones are in the actual calls.
// Asset income and sale proceeds are always the model's.
// Fund-level expenses (management fee, sub line interest and unused fees)
// are then paid from fund cash, the line or quarterly calls, and asset
// income passes through fund cash before it is distributed (lib/fundExpenses).
// Their activity up to today is listed as automatic capital activity
// (autoActivity), unless entries were entered by hand for that quarter.

import { applySubLine, lineRateAt, monthEndISO } from "@/lib/subLine";
import { parseDate, toISO } from "@/lib/fundTimeline";
import { applyFundExpenses } from "@/lib/fundExpenses";

const DAY = 86_400_000;
const sum = (xs) => xs.reduce((s, x) => s + (Number(x.amount) || 0), 0);

export function subLineTerms(terms) {
  return {
    enabled: terms.subLineEnabled !== false,
    sizePct: terms.subLineSizePct,
    spreadPct: terms.subLineSpreadPct,
    unusedFeePct: terms.subLineUnusedFeePct,
    maxDays: terms.subLineMaxDays,
  };
}

export function hasCapitalActivity(terms) {
  // Recorded distributions (phase X) don't switch the fund to actual calls.
  return (terms.capitalActivity ?? []).some((a) => a.date && Number(a.amount) > 0 && a.type !== "expense" && a.type !== "distribution");
}

const quarterOf = (iso) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;

const isExpensePurpose = (a) => a.purpose === "fees" || a.purpose === "line-interest";
// Quarters with user-entered capital calls for fund expenses: the model's
// assumed expense call for that quarter is replaced by them.
const expenseCallQuarters = (activity) =>
  new Set((activity ?? []).filter((a) => !a.auto && a.type === "call" && isExpensePurpose(a) && a.date).map((a) => quarterOf(a.date)));
// Quarters whose expense entries are stored (kept or entered): no automatic
// entries are listed for them.
const storedExpenseQuarters = (activity) =>
  new Set((activity ?? []).filter((a) => !a.auto && a.type === "expense" && a.date).map((a) => quarterOf(a.date)));

// Runs fund expenses on an event stream and returns the events, stats and the
// automatic capital activity up to today (expenses paid, line draws and
// repayments; never capital calls, which the user enters).
function withExpenses(events, terms, { investmentPeriodEnd, curve, todayISO, lineCost, lineHeadroom, activity, purchases }) {
  const fx = applyFundExpenses(events, terms, { investmentPeriodEnd, curve, lineCost, lineHeadroom, purchases });
  const callQ = expenseCallQuarters(activity);
  const storedQ = storedExpenseQuarters(activity);
  const keep = (e) => !(e.fundExpense && e.date <= todayISO && callQ.has(quarterOf(e.date)));
  const autoActivity = fx.allLedger
    .filter((l) => l.date <= todayISO && l.type !== "call" && !storedQ.has(quarterOf(l.date)))
    .map((l, i) => ({ id: `auto-${l.date}-${l.type}-${l.purpose}-${i}`, auto: true, ...l }));
  // Capital the model assumes is called for expenses up to today, by quarter
  // (cash and line exhausted) where no call has been entered.
  const callsNeeded = fx.periods
    .filter((p) => p.called > 0.005 && p.quarter <= todayISO && !callQ.has(quarterOf(p.quarter)))
    .map((p) => ({ quarter: quarterOf(p.quarter), amount: p.called }));
  return { events: fx.events.filter(keep), fx, autoActivity, callsNeeded };
}

// waterfallEvents: asset events from assetQuarterlyEvents (calls negative,
// income, capital). Returns { mode, events, lineStats, lineAt(iso),
// feeAfterISO, actualThrough }.
export function fundLpEvents(waterfallEvents, terms, { todayISO, curve, investmentPeriodEnd }) {
  const line = subLineTerms(terms);
  const common = {
    line,
    commitments: terms.targetEquity ?? 0,
    finalClose: terms.finalClose,
    investmentPeriodEnd,
    curve,
  };

  const xCtx = { investmentPeriodEnd, curve, todayISO, activity: terms.capitalActivity ?? [], purchases: waterfallEvents.filter((e) => e.kind === "call" && e.purchase) };
  const facility = line.enabled ? (terms.targetEquity ?? 0) * ((line.sizePct ?? 0) / 100) : 0;

  if (!hasCapitalActivity(terms)) {
    const sl = applySubLine(waterfallEvents, { ...common, payCosts: false });
    const size = sl.stats?.size ?? facility;
    const x = withExpenses(sl.events, terms, {
      ...xCtx,
      lineCost: (m) => sl.stats?.monthlyCosts.get(m) ?? null,
      lineHeadroom: (iso) => Math.max(0, size - (sl.stats ? sl.stats.balanceAt(iso) : 0)),
    });
    return {
      mode: "model",
      events: x.events,
      lineStats: sl.stats,
      lineAt: (iso) => (sl.stats ? sl.stats.balanceAt(iso) : 0),
      feeAfterISO: null,
      expenses: x.fx,
      autoActivity: x.autoActivity,
      expenseCallsNeeded: x.callsNeeded,
    };
  }

  // Automatic expense entries are not actuals: the expense engine below
  // produces them again.
  // Kept automatic entries mirror the expense engine, which runs again below.
  const activity = (terms.capitalActivity ?? []).filter((a) => a.date && Number(a.amount) > 0 && !a.auto && a.type !== "expense" && a.source !== "kept");
  const past = activity.filter((a) => a.date <= todayISO);
  const funded = new Set(activity.filter((a) => a.purpose?.startsWith("acq:")).map((a) => a.purpose.slice(4)));

  const calls = past
    .filter((a) => a.type === "call")
    .map((a) => ({ date: a.date, amount: -Number(a.amount), kind: "call", actual: true }));

  // Draws still outstanding today, first in first out.
  const draws = past
    .filter((a) => a.type === "draw")
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((a) => ({ date: a.date, amount: Number(a.amount) }));
  let repaid = sum(past.filter((a) => a.type === "repay"));
  for (const d of draws) {
    const x = Math.min(d.amount, repaid);
    d.amount -= x;
    repaid -= x;
  }
  const opening = draws.filter((d) => d.amount > 0.005);

  const income = waterfallEvents.filter((e) => e.kind !== "call");
  const untaggedPast = waterfallEvents.filter(
    (e) => e.kind === "call" && e.purchase && e.date <= todayISO && !funded.has(e.dealId)
  );
  const future = waterfallEvents.filter(
    (e) => e.kind === "call" && e.amount < 0 && e.date > todayISO && !(e.purchase && funded.has(e.dealId))
  );
  const tomorrow = toISO(new Date(parseDate(todayISO).getTime() + DAY));
  const sl = applySubLine(future, { ...common, startISO: tomorrow, openingDraws: opening, payCosts: false });
  let lineEvents = sl.events;
  if (!sl.stats && opening.length) {
    // Line switched off in the terms, but draws are outstanding: repay them
    // with LP calls after maxDays (no interest modelled).
    const maxDays = Math.max(1, Math.round(line.maxDays ?? 365));
    lineEvents = [
      ...lineEvents,
      ...opening.map((d) => {
        const due = toISO(new Date(parseDate(d.date).getTime() + maxDays * DAY));
        return { date: due > todayISO ? due : tomorrow, amount: -d.amount, kind: "call", subLine: true };
      }),
    ];
  }

  const actualLineAt = (iso) => {
    const r = past.filter((a) => a.date <= iso);
    return Math.max(0, sum(r.filter((a) => a.type === "draw")) - sum(r.filter((a) => a.type === "repay")));
  };
  // Line costs: actual balances up to today, the projection after.
  const pastSize = facility;
  const unusedRate = (line.unusedFeePct ?? 0) / 100;
  const pastCost = new Map();
  if (pastSize > 0) {
    for (let t = parseDate(terms.finalClose).getTime(); t <= parseDate(todayISO).getTime(); t += DAY) {
      const iso = toISO(new Date(t));
      const bal = actualLineAt(iso);
      const m = monthEndISO(iso);
      const c = pastCost.get(m) ?? { interest: 0, unused: 0 };
      c.interest += (bal * lineRateAt(curve, iso, line.spreadPct)) / 360;
      c.unused += (Math.max(0, pastSize - bal) * unusedRate) / 360;
      pastCost.set(m, c);
    }
  }
  const lineCost = (m) => {
    const a = pastCost.get(m);
    const b = sl.stats?.monthlyCosts.get(m);
    if (!a && !b) return null;
    return { interest: (a?.interest ?? 0) + (b?.interest ?? 0), unused: (a?.unused ?? 0) + (b?.unused ?? 0) };
  };
  // Expenses run on the whole timeline (income passes through fund cash);
  // their calls up to today are kept unless expenses were entered by hand.
  const size = sl.stats?.size ?? facility;
  const lineHeadroom = (iso) => Math.max(0, size - (iso <= todayISO ? actualLineAt(iso) : sl.stats ? sl.stats.balanceAt(iso) : 0));
  const x = withExpenses([...calls, ...untaggedPast, ...income, ...lineEvents], terms, { ...xCtx, lineCost, lineHeadroom });
  return {
    mode: "actual",
    expenses: x.fx,
    autoActivity: x.autoActivity,
    expenseCallsNeeded: x.callsNeeded,
    events: x.events,
    lineStats: sl.stats,
    lineAt: (iso) => (iso <= todayISO ? actualLineAt(iso) : sl.stats ? sl.stats.balanceAt(iso) : 0),
    feeAfterISO: todayISO,
    actualThrough: past.reduce((m, a) => (a.date > m ? a.date : m), ""),
    untaggedPast,
  };
}
