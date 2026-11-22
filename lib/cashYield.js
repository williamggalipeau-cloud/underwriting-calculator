// ─── Projected cash-on-cash yield ────────────────────────────────────────────
// Asset: each hold year's pre-tax cash flow (after debt service, caps and
// asset-level fees) ÷ the asset's equity invested at closing.
// Fund, by calendar year:
//   Equity invested = time-weighted equity in assets held during the year
//                     (each purchase's equity × days held in the year ÷ days
//                     in the year).
//   Gross yield     = the assets' operating cash flow in the year ÷ equity
//                     invested (before fund expenses and the cash reserve).
//   Net yield       = operating income distributed to investors in the year
//                     (after fund expenses, sub line costs and the fund's
//                     cash reserve) ÷ equity invested.
// Life averages weight each year by its equity: Σ cash ÷ Σ equity-years.

import { parseDate } from "@/lib/fundTimeline";

const DAY = 86_400_000;

export function assetCashYield(cashFlows, equity) {
  const rows = (cashFlows ?? []).map((cf) => ({
    year: cf.year,
    cash: cf.pretaxCashFlow ?? 0,
    yield: equity > 0 ? ((cf.pretaxCashFlow ?? 0) / equity) * 100 : NaN,
  }));
  const ys = rows.map((r) => r.yield).filter(isFinite);
  return {
    rows,
    average: ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : NaN,
    min: ys.length ? Math.min(...ys) : NaN,
    max: ys.length ? Math.max(...ys) : NaN,
  };
}

// assetFlows: assetQuarterlyEvents results (gross: [purchase, income…, sale]);
// purchases: purchase call events ({ date, amount < 0, dealId });
// sales: capital events ({ date, dealId }); distributions: fund income
// events to investors ({ date, amount, kind: "income" }).
export function fundCashYield({ assetFlows, purchases, sales, distributions }) {
  const exitOf = new Map(sales.map((e) => [e.dealId, e.date]));
  const years = new Map();
  const row = (y) => {
    if (!years.has(y)) years.set(y, { year: y, equity: 0, gross: 0, net: 0 });
    return years.get(y);
  };
  // Time-weighted equity held, by calendar year.
  for (const p of purchases) {
    const eq = -p.amount;
    const from = parseDate(p.date).getTime();
    const to = exitOf.get(p.dealId) ? parseDate(exitOf.get(p.dealId)).getTime() : from;
    for (let y = new Date(from).getUTCFullYear(); y <= new Date(to).getUTCFullYear(); y++) {
      const ys = Date.UTC(y, 0, 1);
      const ye = Date.UTC(y + 1, 0, 1);
      const days = Math.max(0, Math.min(to, ye) - Math.max(from, ys)) / DAY;
      if (days > 0) row(y).equity += (eq * days) / ((ye - ys) / DAY);
    }
  }
  // Gross: assets' operating cash (everything between purchase and sale).
  for (const a of assetFlows) {
    for (const f of a.gross.slice(1, -1)) row(Number(f.date.slice(0, 4))).gross += f.amount;
  }
  // Net: operating income distributed to investors.
  for (const d of distributions) row(Number(d.date.slice(0, 4))).net += d.amount;

  const rows = [...years.values()]
    .filter((r) => r.equity > 0.5)
    .sort((a, b) => a.year - b.year)
    .map((r) => ({ ...r, grossYield: (r.gross / r.equity) * 100, netYield: (r.net / r.equity) * 100 }));
  const eqYears = rows.reduce((s, r) => s + r.equity, 0);
  return {
    rows,
    grossAverage: eqYears > 0 ? (rows.reduce((s, r) => s + r.gross, 0) / eqYears) * 100 : NaN,
    netAverage: eqYears > 0 ? (rows.reduce((s, r) => s + r.net, 0) / eqYears) * 100 : NaN,
  };
}
