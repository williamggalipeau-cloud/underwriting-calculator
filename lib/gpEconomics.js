// ─── Phase W: GP Economics (Portfolio Management, after Portfolio Return) ─────────
// What the firm makes, in one place, projected (with actual capital activity
// where it has been entered, as on Portfolio Return):
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
const blankYear = (year) => ({ year, mgmtFee: 0, pm: 0, cm: 0, acqFee: 0, dispFee: 0, fees: 0, promote: 0, coinvest: 0, income: 0, total: 0 });

// An asset's PM and CM fees by calendar year (each hold year in the year it starts).
function assetFees(d, terms, todayISO = "") {
  const n = Math.max(1, (d.irrFlows?.length ?? 2) - 1);
  const acq = acquisitionDate(d, terms);
  const out = {};
  const exit = addYears(acq, n);
  let acqFee = 0, dispFee = 0, toDate = 0;
  // Share of a hold year [start, end) that has passed by today.
  const elapsed = (start, end) => (!todayISO ? 0 : todayISO >= end ? 1 : todayISO <= start ? 0 : (Date.parse(todayISO) - Date.parse(start)) / (Date.parse(end) - Date.parse(start)));
  try {
    const r = underwrite({ ...d.inputs, holdPeriodYears: n });
    r.annualCashFlows.slice(0, n).forEach((cf, i) => {
      const y = yearOf(addYears(acq, i));
      const row = (out[y] ??= { pm: 0, cm: 0, acqFee: 0, dispFee: 0 });
      row.pm += Math.max(0, cf.managementFee ?? 0);
      row.cm += Math.max(0, cf.constructionMgmtFee ?? 0);
      toDate += (Math.max(0, cf.managementFee ?? 0) + Math.max(0, cf.constructionMgmtFee ?? 0)) * elapsed(addYears(acq, i), addYears(acq, i + 1));
    });
    // Acquisition and disposition fees (the portfolio's terms, 11/24): % of
    // the purchase price when bought, % of the sale price when sold.
    acqFee = ((Number(terms.acqFeePct) || 0) / 100) * (Number(d.inputs?.purchasePrice) || 0);
    dispFee = ((Number(terms.dispFeePct) || 0) / 100) * (Number(r.returns?.exitValue ?? r.exitValue) || 0);
    if (acqFee) (out[yearOf(acq)] ??= { pm: 0, cm: 0, acqFee: 0, dispFee: 0 }).acqFee += acqFee;
    if (dispFee) (out[yearOf(exit)] ??= { pm: 0, cm: 0, acqFee: 0, dispFee: 0 }).dispFee += dispFee;
    if (todayISO && acq <= todayISO) toDate += acqFee;
    if (todayISO && exit <= todayISO) toDate += dispFee;
  } catch {
    /* a deal the engine can't run adds no fees */
  }
  return { byYear: out, acq, exit, acqFee, dispFee, toDate };
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
  // Co-invest profit is capital appreciation, not income (user, 11/24): it
  // is recognized only when an asset is sold, in the year of its sale (the
  // fund's co-invest profit allocated by each asset's share of gross profit),
  // and kept out of each year's GP income. See below, after the assets.

  const gp = gpEconomics(wf);
  const grossProfit = (d) => (d.irrFlows ?? []).reduce((s, x) => s + x, 0);
  const posProfit = held.reduce((s, d) => s + Math.max(0, grossProfit(d)), 0);
  const assets = held.map((d) => {
    const f = assetFees(d, terms, todayISO);
    for (const [y, v] of Object.entries(f.byYear)) { Y(y).pm += v.pm; Y(y).cm += v.cm; Y(y).acqFee += v.acqFee ?? 0; Y(y).dispFee += v.dispFee ?? 0; }
    const pm = Object.values(f.byYear).reduce((s, v) => s + v.pm, 0);
    const cm = Object.values(f.byYear).reduce((s, v) => s + v.cm, 0);
    const txFees = (f.acqFee ?? 0) + (f.dispFee ?? 0);
    const sold = d.inputs?.realizedSalePrice != null || f.exit <= todayISO;
    const weight = posProfit > 0 ? Math.max(0, grossProfit(d)) / posProfit : 0;
    return {
      id: d.id, name: d.inputs?.propertyName || d.id, fund: fundName,
      acq: f.acq, exit: f.exit, sold,
      pm, cm, acqFee: f.acqFee ?? 0, dispFee: f.dispFee ?? 0, fees: pm + cm + txFees, feesToDate: f.toDate ?? 0,
      promote: gp.gpPromote * weight,
      promoteWeight: weight * 100,
    };
  });

  const coinvestProfit = gp.gpProfit - gp.gpPromote;
  for (const a of assets) {
    a.coinvest = coinvestProfit * (a.promoteWeight / 100);
    if (a.coinvest) Y(yearOf(a.exit)).coinvest += a.coinvest;
  }
  // Each year: income = fees + promote; co-invest profit on sale is shown
  // beside it, never in the year's income.
  const yearList = Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1)).map((y) => {
    const fees = y.mgmtFee + y.pm + y.cm + y.acqFee + y.dispFee;
    return { ...y, fees, income: fees + y.promote, total: fees + y.promote };
  });
  const sumK = (k) => yearList.reduce((s, y) => s + y[k], 0);
  const feesTotal = sumK("fees");
  const feesToDate = mgmtRealized + assets.reduce((s, a) => s + a.feesToDate, 0);
  return {
    fund: fundName,
    type: fundType(terms.type),
    years: yearList,
    assets,
    fees: { mgmt: sumK("mgmtFee"), pm: sumK("pm"), cm: sumK("cm"), acq: sumK("acqFee"), disp: sumK("dispFee"), total: sumK("fees"), mgmtRealized },
    counterparty: fundType(terms.type) === "Joint Venture" ? terms.partnerName || "" : fundType(terms.type) === "Separate Account" ? terms.clientName || "" : "",
    promoteKind: fundType(terms.type) === "Separate Account" && Number(terms.incentiveFeePct) > 0 ? "Incentive fee" : "Promote",
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
    revenueYield: revenueYield({ fees: feesTotal, feesToDate, terms, lpEquity: wf.lpEquity, gpEquity: wf.gpEquity, assets }),
  };
}

// Revenue Yield (user, 11/24): GP fees over the portfolio's life (asset
// management, property and construction management, acquisition and
// disposition fees; never promote or co-invest profit) ÷ committed capital.
// Committed capital is the terms' total commitments, LP + GP (the default)
// or LP only (terms.revenueYieldBasis, from the LPA / JVA / SMA or the user);
// with no commitments entered, the portfolio's total equity instead. Per year
// divides by the life in years (first acquisition to last projected sale);
// to date uses the fees earned through today.
export function revenueYield({ fees, feesToDate, terms = {}, lpEquity = 0, gpEquity = 0, assets = [] }) {
  const basis = terms.revenueYieldBasis === "lp" ? "lp" : "lp+gp";
  const total = Number(terms.targetEquity) || 0;
  const gpPct = Math.min(100, Math.max(0, Number(terms.gpCommitPct) || 0)) / 100;
  const fromCommitments = total > 0;
  const committed = fromCommitments ? (basis === "lp" ? total * (1 - gpPct) : total) : (basis === "lp" ? lpEquity : lpEquity + gpEquity);
  const start = assets.map((a) => a.acq).filter(Boolean).sort()[0];
  const end = assets.map((a) => a.exit).filter(Boolean).sort().at(-1);
  const lifeYears = start && end ? Math.max(0, (Date.parse(end) - Date.parse(start)) / (365.25 * 86400000)) : 0;
  const pct = (x) => (committed > 0 ? (x / committed) * 100 : null);
  const y = pct(fees);
  return {
    basis, source: terms.revenueYieldBasisSource || "default", committed, fromCommitments,
    fees, feesToDate, lifeYears, start: start ?? null, end: end ?? null,
    pct: y, perYearPct: y != null && lifeYears > 0 ? y / lifeYears : null, toDatePct: pct(feesToDate),
  };
}
// Several portfolios combined: total fees ÷ total committed; the life runs
// from the earliest acquisition to the latest sale among them.
export function combineRevenueYield(items) {
  const xs = items.filter(Boolean);
  const committed = xs.reduce((s, x) => s + x.committed, 0);
  const fees = xs.reduce((s, x) => s + x.fees, 0), feesToDate = xs.reduce((s, x) => s + x.feesToDate, 0);
  const start = xs.map((x) => x.start).filter(Boolean).sort()[0];
  const end = xs.map((x) => x.end).filter(Boolean).sort().at(-1);
  const lifeYears = start && end ? Math.max(0, (Date.parse(end) - Date.parse(start)) / (365.25 * 86400000)) : 0;
  const pct = (x) => (committed > 0 ? (x / committed) * 100 : null);
  const y = pct(fees);
  return { committed, fees, feesToDate, lifeYears, start: start ?? null, end: end ?? null, pct: y, perYearPct: y != null && lifeYears > 0 ? y / lifeYears : null, toDatePct: pct(feesToDate), anyFallback: xs.some((x) => x.fromCommitments === false || x.anyFallback) };
}

// Several funds → the firm: years summed, life-of-fund totals and shares.
// No discount rate or present value (removed at the user's request, 11/24).
export function firmGpEconomics(fundResults) {
  const years = {};
  for (const f of fundResults) for (const y of f.years) {
    const t = (years[y.year] ??= blankYear(y.year));
    for (const k of ["mgmtFee", "pm", "cm", "acqFee", "dispFee", "fees", "promote", "coinvest", "income", "total"]) t[k] += y[k] ?? 0;
  }
  const yearList = Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1));
  const tot = (k) => yearList.reduce((s, y) => s + y[k], 0);
  const fees = tot("fees"), promote = tot("promote"), coinvest = tot("coinvest");
  const total = fees + promote + coinvest;
  const shareOf = (v) => (total > 0 ? (v / total) * 100 : null);
  // Consolidated by portfolio type (user, 11/24): funds, joint ventures and
  // separate accounts, each a subtotal, and its share of GP income.
  const byType = ["Fund", "Joint Venture", "Separate Account"].map((type) => {
    const fs = fundResults.filter((f) => f.type === type);
    const s = (fn) => fs.reduce((a, f) => a + fn(f), 0);
    const fee = s((f) => f.fees.total), pro = s((f) => f.promote.total), co = s((f) => f.coinvest.profit);
    return { type, revenueYield: combineRevenueYield(fs.map((f) => f.revenueYield)), portfolios: fs.length, assets: s((f) => f.assets.length), fees: fee, mgmtFee: s((f) => f.fees.mgmt), txFees: s((f) => (f.fees.acq ?? 0) + (f.fees.disp ?? 0)), promote: pro, promoteRealized: s((f) => f.promote.realized), coinvest: co, total: fee + pro + co, share: null };
  }).filter((x) => x.portfolios > 0);
  const tAll = byType.reduce((a, x) => a + x.total, 0);
  byType.forEach((x) => { x.share = tAll > 0 ? (x.total / tAll) * 100 : null; });
  const yearsByType = yearList.map((y) => ({ year: y.year, ...Object.fromEntries(byType.map((b) => [b.type, fundResults.filter((f) => f.type === b.type).reduce((a, f) => a + (f.years.find((z) => z.year === y.year)?.total ?? 0), 0)])) }));
  return {
    byType,
    yearsByType,
    years: yearList,
    totals: {
      mgmtFee: tot("mgmtFee"), pm: tot("pm"), cm: tot("cm"), acqFee: tot("acqFee"), dispFee: tot("dispFee"), fees, promote, coinvest, total,
      feesShare: shareOf(fees), promoteShare: shareOf(promote), coinvestShare: shareOf(coinvest),
      promoteRealized: fundResults.reduce((s, f) => s + f.promote.realized, 0),
      revenueYield: combineRevenueYield(fundResults.map((f) => f.revenueYield)),
      gpEquity: fundResults.reduce((s, f) => s + f.coinvest.equity, 0),
    },
    funds: fundResults,
    assets: fundResults.flatMap((f) => f.assets),
  };
}

// "LP + GP (from the LPA)", "LP only (set by user)", "LP + GP (default)"; "total equity" when no commitments.
export function ryBasisLabel(ry, type = "") {
  if (!ry) return "";
  const doc = type === "Joint Venture" ? "JVA" : type === "Separate Account" ? "SMA" : "LPA";
  const src = ry.source === "doc" ? `from the ${doc}` : ry.source === "user" ? "set by user" : "default";
  return `${ry.basis === "lp" ? "LP only" : "LP + GP"} (${src})${ry.fromCommitments ? "" : " · total equity, no commitments entered"}`;
}

export function gpEconomicsXlsx(title, firm) {
  const t = firm.totals;
  const rows = [
    [`${title}: GP economics (internal)`],
    ["Promote is never fee revenue. The asset management fee is the fund management fee. Asset promote is the fund's promote allocated by share of gross profit."],
    [],
    ["Life of fund", "Amount", "Share of GP income (%)"],
    ["Fee revenue", t.fees, t.feesShare], ["  Asset management (fund management fee)", t.mgmtFee, ""], ["  Property management", t.pm, ""], ["  Construction management", t.cm, ""], ["  Acquisition fees", t.acqFee ?? 0, ""], ["  Disposition fees", t.dispFee ?? 0, ""],
    ["Promote", t.promote, t.promoteShare], ["Co-invest profit", t.coinvest, t.coinvestShare], ["Total GP income", t.total, 100],
    [],
    ["Revenue Yield (GP fees, not promote or co-invest, ÷ committed capital)", "Value", ""],
    ["Committed capital ($)", t.revenueYield?.committed ?? null, t.revenueYield?.anyFallback ? "Total equity used where no commitments are entered" : ""],
    ["Revenue Yield, life of portfolios (%)", t.revenueYield?.pct ?? null, ""],
    ["Revenue Yield per year (%)", t.revenueYield?.perYearPct ?? null, t.revenueYield?.lifeYears ? `over ${t.revenueYield.lifeYears.toFixed(1)} years` : ""],
    ["Revenue Yield to date (%)", t.revenueYield?.toDatePct ?? null, `on fees earned to date: ${Math.round(t.revenueYield?.feesToDate ?? 0)}`],
    [],
    ["Year", "Asset management", "Property management", "Construction management", "Acquisition / disposition fees", "Fee revenue", "Promote", "GP income (fees + promote; co-invest profit is capital, counted on sale)"],
    ...firm.years.map((y) => [y.year, y.mgmtFee, y.pm, y.cm, (y.acqFee ?? 0) + (y.dispFee ?? 0), y.fees, y.promote, y.income ?? y.total]),
    [],
    ["Consolidated by portfolio type", "Portfolios", "Assets", "Fee revenue", "Promote / incentive fee", "Co-invest profit", "Total GP income", "Share (%)", "Committed capital", "Revenue Yield (%)", "Per year (%)", "To date (%)"],
    ...(firm.byType ?? []).map((b) => [b.type, b.portfolios, b.assets, b.fees, b.promote, b.coinvest, b.total, b.share, b.revenueYield?.committed, b.revenueYield?.pct, b.revenueYield?.perYearPct, b.revenueYield?.toDatePct]),
    [],
    ["Fund", "Type", "Fee revenue", "Promote (total)", "Promote realized", "GP equity", "GP distributions", "Co-invest profit", "GP ROE (%)", "GP IRR (%)", "GP multiple", "Committed capital", "Basis", "Revenue Yield (%)", "Per year (%)", "To date (%)"],
    ...firm.funds.map((f) => [f.fund, f.type, f.fees.total, f.promote.total, f.promote.realized, f.coinvest.equity, f.coinvest.distributions, f.coinvest.profit, f.coinvest.roe, f.coinvest.irr, f.coinvest.multiple, f.revenueYield?.committed, ryBasisLabel(f.revenueYield), f.revenueYield?.pct, f.revenueYield?.perYearPct, f.revenueYield?.toDatePct]),
    [],
    ["Asset", "Fund", "Status", "Property management", "Construction management", "Fee revenue", "Promote (allocated)", "Share of gross profit (%)"],
    ...firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", a.pm, a.cm, a.fees, a.promote, a.promoteWeight]),
  ];
  return rows;
}
