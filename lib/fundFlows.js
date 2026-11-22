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

import { applySubLine } from "@/lib/subLine";
import { parseDate, toISO } from "@/lib/fundTimeline";

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
  return (terms.capitalActivity ?? []).some((a) => a.date && Number(a.amount) > 0);
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

  if (!hasCapitalActivity(terms)) {
    const sl = applySubLine(waterfallEvents, common);
    return {
      mode: "model",
      events: sl.events,
      lineStats: sl.stats,
      lineAt: (iso) => (sl.stats ? sl.stats.balanceAt(iso) : 0),
      feeAfterISO: null,
    };
  }

  const activity = (terms.capitalActivity ?? []).filter((a) => a.date && Number(a.amount) > 0);
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
  const sl = applySubLine(future, { ...common, startISO: tomorrow, openingDraws: opening });
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
  return {
    mode: "actual",
    events: [...calls, ...untaggedPast, ...income, ...lineEvents],
    lineStats: sl.stats,
    lineAt: (iso) => (iso <= todayISO ? actualLineAt(iso) : sl.stats ? sl.stats.balanceAt(iso) : 0),
    feeAfterISO: todayISO,
    actualThrough: past.reduce((m, a) => (a.date > m ? a.date : m), ""),
    untaggedPast,
  };
}
