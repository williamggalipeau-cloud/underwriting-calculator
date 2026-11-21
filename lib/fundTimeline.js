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

// Dated LP/GP waterfall. cfg: { lpEquityPct, preferredReturnPct, catchUpGpPct,
// tiers, mgmtFeePct?, feeStartISO? }. A management fee (mgmtFeePct per year on
// LP invested capital) is charged on each anniversary of feeStartISO (final
// close) through the last cash flow; it is called from LPs as capital, so it
// accrues pref and is returned before profits are split.
export function computeDatedWaterfall(flows, cfg) {
  const events = mergeByDate(flows).map((e) => ({ ...e, fee: false }));
  const feeRate = (cfg.mgmtFeePct ?? 0) / 100;
  if (feeRate > 0 && cfg.feeStartISO && events.length) {
    const lastDate = events[events.length - 1].date;
    for (let k = 1; ; k++) {
      const d = addYears(cfg.feeStartISO, k);
      if (d > lastDate) break;
      events.push({ date: d, amount: 0, fee: true });
    }
    // Fees after flows on the same date (capital outstanding at year end).
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fee - b.fee));
  }
  const lpPct = (cfg.lpEquityPct ?? 90) / 100;
  const gpPct = 1 - lpPct;
  const prefRate = (cfg.preferredReturnPct ?? 8) / 100;
  const catchUpGP = (cfg.catchUpGpPct ?? 100) / 100;
  const tiers = (cfg.tiers ?? [{ irrThreshold: null, lpSplit: 80, gpSplit: 20 }])
    .slice()
    .sort((a, b) => (a.irrThreshold ?? Infinity) - (b.irrThreshold ?? Infinity));

  const projectIRR = xirr(events) * 100;
  let activeTier = tiers[tiers.length - 1];
  for (const t of tiers) {
    if (t.irrThreshold === null || projectIRR <= t.irrThreshold) {
      activeTier = t;
      break;
    }
  }
  const lpSplit = (activeTier.lpSplit ?? 80) / 100;
  const gpSplit = (activeTier.gpSplit ?? 20) / 100;

  let lpCapOut = 0, gpCapOut = 0, lpPrefAccrued = 0;
  let lpProfitTotal = 0, gpProfitTotal = 0;
  let lpContrib = 0, gpContrib = 0, lpDist = 0, gpDist = 0, mgmtFees = 0;
  let lastTime = null;
  const lpFlows = [], gpFlows = [];

  for (const { date, amount, fee } of events) {
    const t = parseDate(date).getTime();
    // Accrue pref (annual compounding) on LP capital outstanding since the last event.
    if (lastTime != null && lpCapOut > 0) {
      const yrs = (t - lastTime) / DAY / 365;
      lpPrefAccrued += (lpCapOut + lpPrefAccrued) * (Math.pow(1 + prefRate, yrs) - 1);
    }
    lastTime = t;

    let lp = 0, gp = 0;
    if (fee) {
      const charge = lpCapOut * feeRate;
      if (charge > 0) {
        lp = -charge;
        lpCapOut += charge;
        lpContrib += charge;
        mgmtFees += charge;
      }
    } else if (amount < 0) {
      // Capital call, split by commitment.
      lp = amount * lpPct;
      gp = amount * gpPct;
      lpCapOut -= lp;
      gpCapOut -= gp;
      lpContrib -= lp;
      gpContrib -= gp;
    } else {
      let avail = amount;
      // 1. LP preferred return
      const pref = Math.min(avail, lpPrefAccrued);
      lp += pref; lpPrefAccrued -= pref; avail -= pref; lpProfitTotal += pref;
      // 2. Return of capital: LP, then GP
      const rocLp = Math.min(avail, lpCapOut);
      lp += rocLp; lpCapOut -= rocLp; avail -= rocLp;
      const rocGp = Math.min(avail, gpCapOut);
      gp += rocGp; gpCapOut -= rocGp; avail -= rocGp;
      // 3. GP catch-up to its tier share of profit
      if (catchUpGP > 0 && avail > 0) {
        const gpNeeded = Math.max(0, (lpProfitTotal + gpProfitTotal + avail) * gpSplit - gpProfitTotal);
        const catchUp = Math.min(avail * catchUpGP, gpNeeded, avail);
        gp += catchUp; gpProfitTotal += catchUp; avail -= catchUp;
      }
      // 4. Split the rest by the active tier
      if (avail > 0) {
        lp += avail * lpSplit; gp += avail * gpSplit;
        lpProfitTotal += avail * lpSplit; gpProfitTotal += avail * gpSplit;
      }
      lpDist += lp;
      gpDist += gp;
    }
    lpFlows.push({ date, amount: lp });
    gpFlows.push({ date, amount: gp });
  }

  const lpByYear = byCalendarYear(lpFlows);
  const gpByYear = byCalendarYear(gpFlows);
  const yearlyDist = [...new Set([...lpByYear.keys(), ...gpByYear.keys()])]
    .sort((a, b) => a - b)
    .map((year) => ({ year, lp: lpByYear.get(year) ?? 0, gp: gpByYear.get(year) ?? 0 }));

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
    mgmtFees,
    activeTier,
    projectIRR,
    yearlyDist,
    lpFlows,
    gpFlows,
    dated: true,
  };
}
