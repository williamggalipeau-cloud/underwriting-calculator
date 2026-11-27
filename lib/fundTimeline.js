// ─── Fund timeline: dated cash flows, XIRR and a dated waterfall ─────────────
//
// Each deal's annual equity cash flows (irrFlows[t]) are placed on its
// acquisition date + t years. The fund then works on real dates:
//   - XIRR for gross fund, LP and GP returns (Actual/365).
//   - A waterfall run event by event in date order: negative flows are
//     capital calls (split LP/GP by commitment), positive flows are
//     distributions; the LP preferred return compounds annually on
//     outstanding LP capital from each call date.

export const DEFAULT_FUND = {
  finalClose: "2025-12-31",
  investmentPeriodYears: 2,
  termYears: 5,
  extensionCount: 2,
  extensionYears: 1,
};

const DAY = 86_400_000;

export function parseDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addYears(iso, n) {
  const d = parseDate(iso);
  const out = new Date(Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate()));
  // Feb 29 + n years → Feb 28 when the target year isn't a leap year
  if (out.getUTCMonth() !== d.getUTCMonth()) out.setUTCDate(0);
  return toISO(out);
}

export function fundDates(fund = DEFAULT_FUND) {
  return {
    finalClose: fund.finalClose,
    investmentPeriodEnd: addYears(fund.finalClose, fund.investmentPeriodYears),
    fundEnd: addYears(fund.finalClose, fund.termYears),
    extendedEnd: addYears(
      fund.finalClose,
      fund.termYears + (fund.extensionCount ?? 0) * (fund.extensionYears ?? 1)
    ),
  };
}

// Deal's acquisition date; deals without one are assumed bought at final close.
export function acquisitionDate(deal, fund = DEFAULT_FUND) {
  return deal.inputs?.acquisitionDate || fund.finalClose;
}

export function datedFlows(deal, flows = deal.irrFlows, fund = DEFAULT_FUND) {
  const acq = acquisitionDate(deal, fund);
  return flows.map((amount, t) => ({ date: addYears(acq, t), amount, dealId: deal.id }));
}

export function exitDate(deal, fund = DEFAULT_FUND) {
  return addYears(acquisitionDate(deal, fund), deal.irrFlows.length - 1);
}

// XIRR (Actual/365) by bisection; flows: [{ date, amount }]. Returns a decimal.
export function xirr(flows) {
  const f = flows.filter((x) => Math.abs(x.amount) > 1e-9);
  if (!f.some((x) => x.amount > 0) || !f.some((x) => x.amount < 0)) return NaN;
  const t0 = Math.min(...f.map((x) => parseDate(x.date).getTime()));
  const pts = f.map((x) => ({ t: (parseDate(x.date).getTime() - t0) / DAY / 365, a: x.amount }));
  const npv = (r) => pts.reduce((s, p) => s + p.a / Math.pow(1 + r, p.t), 0);
  let lo = -0.9999, hi = 10;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

// NPV of dated flows at an annual rate, discounted to asOfISO (Actual/365).
export function xnpv(flows, rate, asOfISO) {
  const t0 = parseDate(asOfISO).getTime();
  return flows.reduce((s, x) => s + x.amount / Math.pow(1 + rate, (parseDate(x.date).getTime() - t0) / DAY / 365), 0);
}

// Value of a cash flow stream against a hurdle rate (cost of capital):
// NPV at the hurdle, IRR − hurdle, and profitability index (PV of money
// returned ÷ PV of money invested).
export function hurdleStats(flows, ratePct, asOfISO) {
  const r = (Number(ratePct) || 0) / 100;
  const pvIn = -xnpv(flows.filter((f) => f.amount < 0), r, asOfISO);
  const pvOut = xnpv(flows.filter((f) => f.amount > 0), r, asOfISO);
  const irr = xirr(flows) * 100;
  return { npv: pvOut - pvIn, pvIn, pvOut, pi: pvIn > 0 ? pvOut / pvIn : NaN, irr, spread: irr - (Number(ratePct) || 0) };
}

// Merge flows on the same date and sort.
export function mergeByDate(flows) {
  const m = new Map();
  for (const x of flows) m.set(x.date, (m.get(x.date) ?? 0) + x.amount);
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, amount]) => ({ date, amount }));
}

// Sum dated flows into calendar years.
export function byCalendarYear(flows) {
  const m = new Map();
  for (const x of flows) {
    const y = parseDate(x.date).getUTCFullYear();
    m.set(y, (m.get(y) ?? 0) + x.amount);
  }
  return m;
}

// ── Quarterly asset cash flows ───────────────────────────────────────────────
// An asset's annual operating cash flow (after debt service, caps and fees) is
// earned evenly through its hold year and distributed at each calendar quarter
// end (or at exit for the final stub). Distribution policy (`policy`):
//   { mode: "reserve", reserveYears }  (default) the asset keeps a cash reserve
//     of reserveYears × that hold year's debt service + TI/leasing + AM fees
//     (deal.reserveBasis); operating income first tops the reserve up to that
//     target, and everything above it is distributed.
//   { mode: "payout", payoutPct }  payoutPct of each positive quarter is
//     distributed; the rest is reserved.
// Either way the reserve covers negative quarters first (any remainder is a
// capital call) and is released at exit as a return of capital (income
// treatment), ahead of the sale proceeds. A number for `policy` is read as a
// payout %. Returns:
//   events: [{ date, amount, kind: "call" | "income" | "capital", dealId }]
//   gross:  [{ date, amount }] before the payout/reserve policy (for gross IRR)

function lastDayOfQuarter(t) {
  const d = new Date(t);
  const qEndMonth = Math.floor(d.getUTCMonth() / 3) * 3 + 2;
  return Date.UTC(d.getUTCFullYear(), qEndMonth + 1, 0);
}

export function assetQuarterlyEvents(deal, fund = DEFAULT_FUND, policy = { mode: "reserve", reserveYears: 1 }) {
  const pol = typeof policy === "number" ? { mode: "payout", payoutPct: policy } : policy ?? {};
  const useReserve = pol.mode !== "payout" && Array.isArray(deal.reserveBasis);
  const acq = acquisitionDate(deal, fund);
  const n = deal.irrFlows.length - 1;
  const exit = addYears(acq, n);
  const exitT = parseDate(exit).getTime();
  // Operating cash by hold year; the final year's sale proceeds are separate.
  const hasSplit = Array.isArray(deal.opFlows) && deal.opFlows.length === n && isFinite(deal.reversion);
  const op = hasSplit ? deal.opFlows : deal.irrFlows.slice(1).map((v, i) => (i === n - 1 ? 0 : v));
  const reversion = hasSplit ? deal.reversion : deal.irrFlows[n];

  const income = new Map(); // pay date → amount
  const yearOf = new Map(); // pay date → hold year it falls in (latest)
  for (let t = 1; t <= n; t++) {
    const ys = parseDate(addYears(acq, t - 1)).getTime();
    const ye = parseDate(addYears(acq, t)).getTime();
    const perDay = op[t - 1] / ((ye - ys) / DAY);
    let cur = ys;
    while (cur < ye) {
      const qEnd = lastDayOfQuarter(cur);
      const segEnd = Math.min(qEnd + DAY, ye);
      const pay = toISO(new Date(Math.min(qEnd, exitT)));
      income.set(pay, (income.get(pay) ?? 0) + perDay * ((segEnd - cur) / DAY));
      yearOf.set(pay, t);
      cur = segEnd;
    }
  }

  const payout = Math.max(0, Math.min(100, pol.payoutPct ?? 100)) / 100;
  const reserveYears = Math.max(0, pol.reserveYears ?? 1);
  // The portfolio's acquisition and disposition fees (11/24): paid to the
  // sponsor out of the portfolio, so investors fund the acquisition fee with
  // the purchase and the disposition fee comes out of the sale proceeds.
  const acqFee = ((Number(fund.acqFeePct) || 0) / 100) * (Number(deal.inputs?.purchasePrice) || 0);
  const dispFee = ((Number(fund.dispFeePct) || 0) / 100) * (Number(deal.exitValue) || 0);
  const events = [{ date: acq, amount: deal.irrFlows[0] - acqFee, kind: "call", dealId: deal.id, purchase: true, ...(acqFee ? { acqFee } : {}) }];
  const gross = [{ date: acq, amount: deal.irrFlows[0] - acqFee }];
  let reserve = 0;
  const reserveHistory = []; // [{ date, reserve }] after each quarter's income
  for (const [date, inc] of [...income.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    gross.push({ date, amount: inc });
    if (inc > 0) {
      let dist;
      if (useReserve) {
        const target = reserveYears * (deal.reserveBasis[(yearOf.get(date) ?? 1) - 1] ?? 0);
        const topUp = Math.min(inc, Math.max(0, target - reserve));
        dist = inc - topUp;
      } else {
        dist = inc * payout;
      }
      reserve += inc - dist;
      if (dist > 0) events.push({ date, amount: dist, kind: "income", dealId: deal.id });
    } else if (inc < 0) {
      const draw = Math.min(reserve, -inc);
      reserve -= draw;
      if (inc + draw < 0) events.push({ date, amount: inc + draw, kind: "call", dealId: deal.id });
    }
    reserveHistory.push({ date, reserve });
  }
  gross.push({ date: exit, amount: reversion - dispFee });
  // The reserve is released at exit as income (pref, then return of capital);
  // only the sale proceeds are a capital event eligible for promote.
  if (reserve > 0) events.push({ date: exit, amount: reserve, kind: "income", dealId: deal.id, reserveRelease: true });
  events.push({ date: exit, amount: reversion - dispFee, kind: "capital", dealId: deal.id, ...(dispFee ? { dispFee } : {}) });
  return { events, gross, reserveReleased: reserve, reserveHistory, acqFee, dispFee };
}

export function quarterKey(iso) {
  const d = parseDate(iso);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

// ── Dated LP/GP waterfall ────────────────────────────────────────────────────
// events: [{ date, amount, kind? }]. kind "call" (negative) is a capital call
// split by commitment; "income" is an operating distribution; "capital" is a
// sale / reserve release. Without a kind, negative = call, positive = capital.
// cfg: { lpEquityPct, preferredReturnPct, catchUpGpPct, tiers, mgmtFeePct?,
//        feeStartISO?, incomeTreatment? }
//   incomeTreatment "prefThenROC" (default): income pays accrued LP pref, then
//     returns capital (LP, then GP); anything left is held and paid out with
//     the next capital event. Promote is paid only from capital events.
//   incomeTreatment "full": income runs the full waterfall like a sale.
// Capital events: pref → return of capital → GP catch-up → tier splits
// (marginal by default; see tierMethod below). GP capital is paid pro rata.
// The LP pref compounds annually on outstanding LP capital, accruing between
// events by date. A management fee (mgmtFeePct/yr on LP invested capital) is
// charged at each anniversary of feeStartISO, called as capital.
export function computeDatedWaterfall(flows, cfg) {
  const order = { call: 0, income: 1, capital: 2, fee: 3 };
  const merged = new Map();
  for (const f of flows) {
    const kind = f.kind ?? (f.amount < 0 ? "call" : "capital");
    const key = `${f.date}|${kind}`;
    const cur = merged.get(key) ?? { date: f.date, amount: 0, kind };
    cur.amount += f.amount;
    merged.set(key, cur);
  }
  const events = [...merged.values()].filter((e) => Math.abs(e.amount) > 1e-9);
  const feeRate = (cfg.mgmtFeePct ?? 0) / 100;
  if (feeRate > 0 && cfg.feeStartISO && events.length) {
    const lastDate = events.reduce((m, e) => (e.date > m ? e.date : m), events[0].date);
    for (let k = 1; ; k++) {
      const d = addYears(cfg.feeStartISO, k);
      if (d > lastDate) break;
      // With actual capital activity, fees up to feeAfterISO are in the actual calls.
      if (cfg.feeAfterISO && d <= cfg.feeAfterISO) continue;
      events.push({ date: d, amount: 0, kind: "fee" });
    }
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order[a.kind] - order[b.kind]));

  const lpPct = (cfg.lpEquityPct ?? 90) / 100;
  const gpPct = 1 - lpPct;
  const prefRate = (cfg.preferredReturnPct ?? 8) / 100;
  const catchUpGP = (cfg.catchUpGpPct ?? 100) / 100;
  const incomeFull = cfg.incomeTreatment === "full";
  const tiers = (cfg.tiers ?? [{ irrThreshold: null, lpSplit: 80, gpSplit: 20 }])
    .slice()
    .sort((a, b) => (a.irrThreshold ?? Infinity) - (b.irrThreshold ?? Infinity));

  // Tier method (1.1.12, user 11/27): "marginal" (the default, and the usual
  // LPA waterfall) applies each tier's split only to the distributions that
  // take the LPs' IRR from one hurdle to the next; "cliff" applies the one
  // tier the whole portfolio's IRR lands in to every dollar after the pref.
  const marginal = cfg.tierMethod !== "cliff";
  const projectIRR = xirr(events.filter((e) => e.kind !== "fee")) * 100;
  let activeTier = tiers[tiers.length - 1];
  for (const t of tiers) {
    if (t.irrThreshold === null || projectIRR <= t.irrThreshold) {
      activeTier = t;
      break;
    }
  }
  const splitOf = (t) => { const l = Number(t.lpSplit ?? 80), g = Number(t.gpSplit ?? 20); const sum = l + g; return sum > 0 ? [l / sum, g / sum] : [1, 0]; };
  // The catch-up brings the GP's carry to the first tier's share (marginal)
  // or the active tier's (cliff) of the profit paid so far.
  const catchUpGs = splitOf(marginal ? tiers[0] : activeTier)[1];

  // GP capital invests alongside the LPs: its share of every distribution is
  // paid pro rata, with no pref or carry on it (1.1.12). The waterfall (pref
  // → return of capital → GP catch-up → tier splits) runs on the LPs' share;
  // what it pays the GP is the carry (the promote).
  let lpCapOut = 0, gpCapOut = 0, lpPrefAccrued = 0, heldLp = 0, heldGp = 0;
  let lpProfitTotal = 0, carryTotal = 0;
  let lpContrib = 0, gpContrib = 0, lpDist = 0, gpDist = 0, mgmtFees = 0;
  let lastTime = null, tierReached = tiers[0];
  // What the LPs must still receive to reach each hurdle IRR (marginal tiers).
  const hurdle = tiers.map(() => 0);
  const lpFlows = [], gpFlows = [], ledger = [];

  for (const { date, amount, kind } of events) {
    const t = parseDate(date).getTime();
    if (lastTime != null) {
      const yrs = (t - lastTime) / DAY / 365;
      if (lpCapOut > 0) lpPrefAccrued += (lpCapOut + lpPrefAccrued) * (Math.pow(1 + prefRate, yrs) - 1);
      tiers.forEach((tr, k) => { if (tr.irrThreshold != null) hurdle[k] *= Math.pow(1 + tr.irrThreshold / 100, yrs); });
    }
    lastTime = t;

    const row = { date, kind, amount, lp: 0, gp: 0, pref: 0, rocLp: 0, rocGp: 0, catchUp: 0, splitLp: 0, splitGp: 0, held: 0, fee: 0, gpCapital: 0, carry: 0 };
    if (kind === "fee") {
      // A fee event with an amount (lib/fundExpenses) is called from LPs as
      // is; one without is the legacy annual fee on LP invested capital.
      const charge = amount < 0 ? -amount : lpCapOut * feeRate;
      if (charge > 0) {
        row.lp = -charge; row.fee = charge;
        lpCapOut += charge; lpContrib += charge; mgmtFees += charge;
      }
    } else if (kind === "call" || amount < 0) {
      // A capital call (or a negative cash flow): funded pro rata.
      row.lp = amount * lpPct;
      row.gp = amount * gpPct;
      lpCapOut -= row.lp; gpCapOut -= row.gp;
      lpContrib -= row.lp; gpContrib -= row.gp;
    } else {
      const isCapital = kind === "capital" || incomeFull;
      const gpSide = amount * gpPct + (isCapital ? heldGp : 0);
      let avail = amount * lpPct + (isCapital ? heldLp : 0);
      const lpSide = avail;
      if (isCapital) { heldLp = 0; heldGp = 0; }
      // 1. LP preferred return
      row.pref = Math.min(avail, lpPrefAccrued);
      lpPrefAccrued -= row.pref; avail -= row.pref; lpProfitTotal += row.pref;
      // 2. Return of LP capital
      row.rocLp = Math.min(avail, lpCapOut); lpCapOut -= row.rocLp; avail -= row.rocLp;
      let gpPaid = gpSide;
      if (!isCapital) {
        // Income beyond pref and capital waits for the next capital event;
        // the GP capital's share waits with it.
        const paidShare = lpSide > 0 ? (lpSide - avail) / lpSide : 1;
        gpPaid = gpSide * paidShare;
        heldGp += gpSide - gpPaid;
        row.held = avail + (gpSide - gpPaid); heldLp += avail; avail = 0;
      } else {
        // 3. GP catch-up: the GP takes catchUpGP of each dollar (the LPs the
        //    rest) until its carry is its tier share of the profit paid.
        if (catchUpGP > 0 && avail > 0 && catchUpGs > 0) {
          const short = catchUpGs * (lpProfitTotal + carryTotal) - carryTotal;
          const x = short <= 0 ? 0 : catchUpGP > catchUpGs ? Math.min(avail, short / (catchUpGP - catchUpGs)) : avail;
          row.catchUp = x * catchUpGP;
          const toLp = x - row.catchUp;
          row.splitLp += toLp; lpProfitTotal += toLp; carryTotal += row.catchUp; avail -= x;
        }
        // 4. Tier splits
        if (avail > 0 && !marginal) {
          const [ls, gs] = splitOf(activeTier);
          row.splitLp += avail * ls; row.splitGp += avail * gs;
          lpProfitTotal += avail * ls; carryTotal += avail * gs; avail = 0;
        }
        for (let k = 0; marginal && k < tiers.length && avail > 1e-9; k++) {
          const [ls, gs] = splitOf(tiers[k]);
          const last = tiers[k].irrThreshold == null || k === tiers.length - 1;
          // What the LPs still need to reach this tier's hurdle, after what this event has paid them.
          const need = last ? Infinity : hurdle[k] - (row.pref + row.rocLp + row.splitLp);
          if (need <= 1e-9) continue;
          const x = ls > 0 ? Math.min(avail, need / ls) : avail;
          row.splitLp += x * ls; row.splitGp += x * gs;
          lpProfitTotal += x * ls; carryTotal += x * gs; avail -= x;
          tierReached = tiers[k];
        }
      }
      row.rocGp = Math.min(gpPaid, gpCapOut); gpCapOut -= row.rocGp;
      row.gpCapital = gpPaid;
      row.carry = row.catchUp + row.splitGp;
      row.lp = row.pref + row.rocLp + row.splitLp;
      row.gp = gpPaid + row.carry;
      lpDist += row.lp; gpDist += row.gp;
    }
    // Every LP cash flow moves the hurdle balances (calls and fees up, distributions down).
    for (let k = 0; k < hurdle.length; k++) hurdle[k] -= row.lp;
    row.lpCapOut = lpCapOut;
    lpFlows.push({ date, amount: row.lp });
    gpFlows.push({ date, amount: row.gp });
    ledger.push(row);
  }

  const lpByYear = byCalendarYear(lpFlows);
  const gpByYear = byCalendarYear(gpFlows);
  const yearlyDist = [...new Set([...lpByYear.keys(), ...gpByYear.keys()])]
    .sort((a, b) => a - b)
    .map((year) => ({ year, lp: lpByYear.get(year) ?? 0, gp: gpByYear.get(year) ?? 0 }));

  // Quarterly schedule.
  const q = new Map();
  for (const r of ledger) {
    const k = quarterKey(r.date);
    const a = q.get(k) ?? { quarter: k, calls: 0, income: 0, capital: 0, pref: 0, roc: 0, catchUp: 0, promoteGp: 0, splitLp: 0, held: 0, fees: 0, lp: 0, gp: 0 };
    if (r.kind === "call") a.calls += r.amount;
    else if (r.kind === "income") a.income += r.amount;
    else if (r.kind === "capital") a.capital += r.amount;
    a.pref += r.pref; a.roc += r.rocLp + r.rocGp; a.catchUp += r.catchUp;
    a.promoteGp += r.splitGp; a.splitLp += r.splitLp; a.held += r.held; a.fees += r.fee;
    a.lp += r.lp; a.gp += r.gp;
    if (r.kind === "income") a.lpIncome = (a.lpIncome ?? 0) + r.lp;
    a.lpCapOut = r.lpCapOut;
    q.set(k, a);
  }
  const quarterly = [...q.values()].sort((x, y) => (x.quarter < y.quarter ? -1 : 1));

  return {
    lpEquity: lpContrib,
    gpEquity: gpContrib,
    lpIRR: xirr(lpFlows) * 100,
    gpIRR: xirr(gpFlows) * 100,
    lpEquityMultiple: lpContrib > 0 ? lpDist / lpContrib : 0,
    gpEquityMultiple: gpContrib > 0 ? gpDist / gpContrib : 0,
    lpTotalDistributions: lpDist,
    gpTotalDistributions: gpDist,
    gpPromote: gpDist - gpContrib,
    gpCarry: carryTotal, // the promote: what the waterfall paid the GP beyond its capital's pro-rata share
    tierMethod: marginal ? "marginal" : "cliff",
    mgmtFees,
    activeTier: marginal ? tierReached : activeTier,
    projectIRR,
    yearlyDist,
    quarterly,
    ledger,
    lpFlows,
    gpFlows,
    dated: true,
  };
}
