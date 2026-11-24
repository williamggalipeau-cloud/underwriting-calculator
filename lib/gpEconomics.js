// ─── Phase W: GP Economics (Portfolio Management, after Fund Return) ─────────
// What the firm makes, in one place, projected (with actual capital activity
// where it has been entered, as on Fund Return):
//   fees       the asset management fee, which is the fund's management fee
//              (one fund-level fee from lib/fundExpenses; no per-asset AM
//              fee), plus property management and construction management
//              fees from each asset's cash flow (lib/assetFees).
//   promote    GP distributions − the GP's share of equity × all
//              distributions (phase L's definition), from the fund
//              waterfall. Never part of fee revenue. By asset it is the
//              fund's promote allocated by each asset's share of gross
//              profit (the waterfall runs on the whole fund, not per asset).
//   co-invest  the GP's return on its own capital at its pro-rata share:
//              GP profit − promote. With promote, it adds up to GP profit.
// Total GP income = fees + promote + co-invest profit; each shown with its
// share of the total. Realized = dated on or before today (for an asset:
// sold, or its exit date has passed).

import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears, assetQuarterlyEvents, computeDatedWaterfall, fundDates } from "@/lib/fundTimeline";
import { fundLpEvents } from "@/lib/fundFlows";
import { distPolicy, waterfallConfig } from "@/lib/fundPlan";
import { gpEconomics } from "@/lib/assetFees";
import { fundType } from "@/lib/fundTypes";

const fin = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const yearOf = (iso) => String(iso).slice(0, 4);
const blankYear = (year) => ({ year, mgmtFee: 0, pm: 0, cm: 0, fees: 0, promote: 0, coinvest: 0, total: 0 });

// An asset's PM and CM fees by calendar year (each hold year in the year it starts).
function assetFees(d, terms) {
  const n = Math.max(1, (d.irrFlows?.length ?? 2) - 1);
  const acq = acquisitionDate(d, terms);
  const out = {};
  try {
    const r = underwrite({ ...d.inputs, holdPeriodYears: n });
    r.annualCashFlows.slice(0, n).forEach((cf, i) => {
      const y = yearOf(addYears(acq, i));
      const row = (out[y] ??= { pm: 0, cm: 0 });
      row.pm += Math.max(0, cf.managementFee ?? 0);
      row.cm += Math.max(0, cf.constructionMgmtFee ?? 0);
    });
  } catch {
    /* a deal the engine can't run adds no fees */
  }
  return { byYear: out, acq, exit: addYears(acq, n) };
}

// deals: one fund's deals (snapshots with irrFlows); terms: its fund terms.
export function fundGpEconomics(fundName, deals, terms, { todayISO, curve } = {}) {
  const held = deals.filter((d) => Array.isArray(d.irrFlows) && d.irrFlows.length >= 2);
  const fd = fundDates(terms);
  const policy = distPolicy(terms);
  const q = held.map((d) => ({ d, q: assetQuarterlyEvents(d, terms, policy) }));
  const events = q.flatMap((x) => x.q.events);
  const flows = fundLpEvents(events, terms, { todayISO, curve, investmentPeriodEnd: fd.investmentPeriodEnd });
  const wf = computeDatedWaterfall(flows.events, { ...waterfallConfig(terms), feeAfterISO: flows.feeAfterISO });

  const years = {};
  const Y = (y) => (years[y] ??= blankYear(y));
  // Management fee (the asset management fee), by the quarter it is charged.
  let mgmtRealized = 0;
  for (const p of flows.expenses?.periods ?? []) {
    if (!(p.fee > 0)) continue;
    Y(yearOf(p.quarter)).mgmtFee += p.fee;
    if (p.quarter <= todayISO) mgmtRealized += p.fee;
  }
  // Promote and co-invest by year, from the waterfall's distribution rows.
  const eq = wf.lpEquity + wf.gpEquity;
  const share = eq > 0 ? wf.gpEquity / eq : 0;
  let promoteRealized = 0;
  for (const r of wf.ledger ?? []) {
    if (r.kind === "fee" || r.kind === "call") continue;
    const dist = (r.lp ?? 0) + (r.gp ?? 0);
    if (!(dist > 0)) continue;
    const promote = (r.gp ?? 0) - share * dist;
    Y(yearOf(r.date)).promote += promote;
    if (r.date <= todayISO) promoteRealized += promote;
  }
  // The GP's pro-rata return on its own capital: distributions at its share
  // less its contributions (calls), by year.
  for (const r of wf.ledger ?? []) {
    if (r.kind === "fee") continue;
    const dist = (r.lp ?? 0) + (r.gp ?? 0);
    if (r.kind === "call") Y(yearOf(r.date)).coinvest += r.gp ?? 0; // negative
    else if (dist > 0) Y(yearOf(r.date)).coinvest += share * dist;
  }

  const gp = gpEconomics(wf);
  const grossProfit = (d) => (d.irrFlows ?? []).reduce((s, x) => s + x, 0);
  const posProfit = held.reduce((s, d) => s + Math.max(0, grossProfit(d)), 0);
  const assets = held.map((d) => {
    const f = assetFees(d, terms);
    for (const [y, v] of Object.entries(f.byYear)) { Y(y).pm += v.pm; Y(y).cm += v.cm; }
    const pm = Object.values(f.byYear).reduce((s, v) => s + v.pm, 0);
    const cm = Object.values(f.byYear).reduce((s, v) => s + v.cm, 0);
    const sold = d.inputs?.realizedSalePrice != null || f.exit <= todayISO;
    const weight = posProfit > 0 ? Math.max(0, grossProfit(d)) / posProfit : 0;
    return {
      id: d.id, name: d.inputs?.propertyName || d.id, fund: fundName,
      acq: f.acq, exit: f.exit, sold,
      pm, cm, fees: pm + cm,
      promote: gp.gpPromote * weight,
      promoteWeight: weight * 100,
    };
  });

  const yearList = Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1)).map((y) => {
    const fees = y.mgmtFee + y.pm + y.cm;
    return { ...y, fees, total: fees + y.promote + y.coinvest };
  });
  const sumK = (k) => yearList.reduce((s, y) => s + y[k], 0);
  const coinvestProfit = gp.gpProfit - gp.gpPromote;
  return {
    fund: fundName,
    type: fundType(terms.type),
    years: yearList,
    assets,
    fees: { mgmt: sumK("mgmtFee"), pm: sumK("pm"), cm: sumK("cm"), total: sumK("fees"), mgmtRealized },
    promote: { total: gp.gpPromote, realized: promoteRealized, projected: gp.gpPromote - promoteRealized },
    coinvest: {
      equity: wf.gpEquity,
      distributions: wf.gpTotalDistributions,
      gpProfit: gp.gpProfit,
      profit: coinvestProfit,
      roe: gp.gpRoe,
      irr: fin(wf.gpIRR),
      multiple: wf.gpEquity > 0 ? wf.gpTotalDistributions / wf.gpEquity : null,
    },
    mode: flows.mode,
  };
}

// Several funds → the firm: years summed, life-of-fund totals and shares.
export function firmGpEconomics(fundResults, { todayISO, discountPct = 8 } = {}) {
  const years = {};
  for (const f of fundResults) for (const y of f.years) {
    const t = (years[y.year] ??= blankYear(y.year));
    for (const k of ["mgmtFee", "pm", "cm", "fees", "promote", "coinvest", "total"]) t[k] += y[k];
  }
  const yearList = Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1));
  const tot = (k) => yearList.reduce((s, y) => s + y[k], 0);
  const fees = tot("fees"), promote = tot("promote"), coinvest = tot("coinvest");
  const total = fees + promote + coinvest;
  const shareOf = (v) => (total > 0 ? (v / total) * 100 : null);
  // Present value of fees from this year on, at discountPct a year.
  const y0 = Number(yearOf(todayISO));
  const r = (Number(discountPct) || 0) / 100;
  const feesPv = yearList.filter((y) => Number(y.year) >= y0).reduce((s, y) => s + y.fees / Math.pow(1 + r, Number(y.year) - y0 + 1), 0);
  return {
    years: yearList,
    totals: {
      mgmtFee: tot("mgmtFee"), pm: tot("pm"), cm: tot("cm"), fees, promote, coinvest, total,
      feesShare: shareOf(fees), promoteShare: shareOf(promote), coinvestShare: shareOf(coinvest),
      feesPv, discountPct: Number(discountPct) || 0,
      promoteRealized: fundResults.reduce((s, f) => s + f.promote.realized, 0),
      gpEquity: fundResults.reduce((s, f) => s + f.coinvest.equity, 0),
    },
    funds: fundResults,
    assets: fundResults.flatMap((f) => f.assets),
  };
}

export function gpEconomicsXlsx(title, firm) {
  const t = firm.totals;
  const rows = [
    [`${title}: GP economics (internal)`],
    ["Promote is never fee revenue. The asset management fee is the fund management fee. Asset promote is the fund's promote allocated by share of gross profit."],
    [],
    ["Life of fund", "Amount", "Share of GP income (%)"],
    ["Fee revenue", t.fees, t.feesShare], ["  Asset management (fund management fee)", t.mgmtFee, ""], ["  Property management", t.pm, ""], ["  Construction management", t.cm, ""],
    ["Promote", t.promote, t.promoteShare], ["Co-invest profit", t.coinvest, t.coinvestShare], ["Total GP income", t.total, 100],
    [`Fee revenue, present value at ${t.discountPct}% (from this year)`, t.feesPv, ""],
    [],
    ["Year", "Asset management", "Property management", "Construction management", "Fee revenue", "Promote", "Co-invest profit", "Total GP income"],
    ...firm.years.map((y) => [y.year, y.mgmtFee, y.pm, y.cm, y.fees, y.promote, y.coinvest, y.total]),
    [],
    ["Fund", "Type", "Fee revenue", "Promote (total)", "Promote realized", "GP equity", "GP distributions", "Co-invest profit", "GP ROE (%)", "GP IRR (%)", "GP multiple"],
    ...firm.funds.map((f) => [f.fund, f.type, f.fees.total, f.promote.total, f.promote.realized, f.coinvest.equity, f.coinvest.distributions, f.coinvest.profit, f.coinvest.roe, f.coinvest.irr, f.coinvest.multiple]),
    [],
    ["Asset", "Fund", "Status", "Property management", "Construction management", "Fee revenue", "Promote (allocated)", "Share of gross profit (%)"],
    ...firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", a.pm, a.cm, a.fees, a.promote, a.promoteWeight]),
  ];
  return rows;
}
