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
const blankYear = (year) => ({ year, mgmtFee: 0, pm: 0, cm: 0, acqFee: 0, dispFee: 0, fees: 0, promote: 0, coinvest: 0, income: 0, capitalGains: 0, total: 0 });

// An asset's PM and CM fees by calendar year (each hold year in the year it starts).
function assetFees(d, terms, todayISO = "") {
  const n = Math.max(1, (d.irrFlows?.length ?? 2) - 1);
  const acq = acquisitionDate(d, terms);
  const out = {};
  const exit = addYears(acq, n);
  let acqFee = 0, dispFee = 0, toDate = 0;
  const td = { pm: 0, cm: 0, acq: 0, disp: 0 };
  // Share of a hold year [start, end) that has passed by today.
  const elapsed = (start, end) => (!todayISO ? 0 : todayISO >= end ? 1 : todayISO <= start ? 0 : (Date.parse(todayISO) - Date.parse(start)) / (Date.parse(end) - Date.parse(start)));
  try {
    const r = underwrite({ ...d.inputs, holdPeriodYears: n });
    r.annualCashFlows.slice(0, n).forEach((cf, i) => {
      const y = yearOf(addYears(acq, i));
      const row = (out[y] ??= { pm: 0, cm: 0, acqFee: 0, dispFee: 0 });
      row.pm += Math.max(0, cf.managementFee ?? 0);
      row.cm += Math.max(0, cf.constructionMgmtFee ?? 0);
      const e = elapsed(addYears(acq, i), addYears(acq, i + 1));
      td.pm += Math.max(0, cf.managementFee ?? 0) * e;
      td.cm += Math.max(0, cf.constructionMgmtFee ?? 0) * e;
      toDate += (Math.max(0, cf.managementFee ?? 0) + Math.max(0, cf.constructionMgmtFee ?? 0)) * e;
    });
    // Acquisition and disposition fees (the portfolio's terms, 11/24): % of
    // the purchase price when bought, % of the sale price when sold.
    acqFee = ((Number(terms.acqFeePct) || 0) / 100) * (Number(d.inputs?.purchasePrice) || 0);
    dispFee = ((Number(terms.dispFeePct) || 0) / 100) * (Number(r.returns?.exitValue ?? r.exitValue) || 0);
    if (acqFee) (out[yearOf(acq)] ??= { pm: 0, cm: 0, acqFee: 0, dispFee: 0 }).acqFee += acqFee;
    if (dispFee) (out[yearOf(exit)] ??= { pm: 0, cm: 0, acqFee: 0, dispFee: 0 }).dispFee += dispFee;
    if (todayISO && acq <= todayISO) { toDate += acqFee; td.acq += acqFee; }
    if (todayISO && exit <= todayISO) { toDate += dispFee; td.disp += dispFee; }
  } catch {
    /* a deal the engine can't run adds no fees */
  }
  return { byYear: out, acq, exit, acqFee, dispFee, toDate, td };
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
    // By year, promote is a capital gain in the year each asset sells (below);
    // what the waterfall has paid so far is the realized figure.
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
      pm, cm, acqFee: f.acqFee ?? 0, dispFee: f.dispFee ?? 0, fees: pm + cm + txFees, feesToDate: f.toDate ?? 0, td: f.td ?? { pm: 0, cm: 0, acq: 0, disp: 0 },
      promote: gp.gpPromote * weight,
      promoteWeight: weight * 100,
    };
  });

  const coinvestProfit = gp.gpProfit - gp.gpPromote;
  for (const a of assets) {
    a.coinvest = coinvestProfit * (a.promoteWeight / 100);
    if (a.coinvest) Y(yearOf(a.exit)).coinvest += a.coinvest;
    if (a.promote) Y(yearOf(a.exit)).promote += a.promote;
  }
  // Fee income vs. capital gains (user, 11/24): each year's fee income is
  // its fees only; promote (when the waterfall pays it, mostly on sale) and
  // co-invest profit (on sale) are capital gains, shown beside it.
  const yearList = Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1)).map((y) => {
    const fees = y.mgmtFee + y.pm + y.cm + y.acqFee + y.dispFee;
    const capitalGains = y.promote + y.coinvest;
    return { ...y, fees, income: fees, capitalGains, total: fees + capitalGains };
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
    feesToDateByType: { mgmt: mgmtRealized, ...["pm", "cm", "acq", "disp"].reduce((o, k) => ({ ...o, [k]: assets.reduce((a0, a) => a0 + (a.td?.[k] ?? 0), 0) }), {}) },
    equity: { lp: wf.lpEquity, gp: wf.gpEquity, lpMultiple: wf.lpEquity > 0 ? (wf.lpTotalDistributions ?? 0) / wf.lpEquity : null },
    parties: partyEconomics({ fund: fundName, years: yearList, assets, fees: { mgmt: sumK("mgmtFee"), pm: sumK("pm"), cm: sumK("cm"), acq: sumK("acqFee"), disp: sumK("dispFee") }, promoteTotal: gp.gpPromote, promoteRealized, coinvest: { equity: wf.gpEquity, profit: coinvestProfit, irr: fin(wf.gpIRR) }, feesToDateByType: { mgmt: mgmtRealized, ...["pm", "cm", "acq", "disp"].reduce((o, k) => ({ ...o, [k]: assets.reduce((a0, a) => a0 + (a.td?.[k] ?? 0), 0) }), {}) }, equity: { lp: wf.lpEquity, gp: wf.gpEquity, lpMultiple: wf.lpEquity > 0 ? (wf.lpTotalDistributions ?? 0) / wf.lpEquity : null } }, terms),
  };
}

// ─── GP vs. sponsor (user, 11/24) ───────────────────────────────────────────
// The GP is the capital partner (returns on invested capital and its promote
// share); the sponsor / operator manages the assets and earns fees (and its
// promote share). Either can be this firm or an outside company. Each fee is
// paid to the sponsor, the GP, or a third party (outsourced: still an expense
// of the asset, but nobody's revenue). Existing portfolios default to this
// firm as both, every fee to the sponsor and 100% of the promote to the GP,
// so the firm's figures don't change until the parties are set.
export const FEE_KEYS = [["mgmt", "Asset management", "feeToMgmt"], ["pm", "Property management", "feeToPm"], ["cm", "Construction management", "feeToCm"], ["acq", "Acquisition fee", "feeToAcq"], ["disp", "Disposition fee", "feeToDisp"]];
export const FEE_PAYEES = [["sponsor", "Sponsor"], ["gp", "GP"], ["third", "Third party (outsourced)"]];
const pctOr = (v, d) => (v === "" || v == null || !isFinite(Number(v)) ? d : Math.min(100, Math.max(0, Number(v))));
// GP parties (user, 11/24): one or more, each this firm or an outside
// company, with its share of the GP capital and its share of the total
// promote; the sponsor has the rest of the promote. Entered at setup (the
// split is often in a side agreement, not the LPA / JVA / SMA). Older terms
// with one GP (gpWho / gpName / promoteGpPct) read as a single party.
export function gpPartiesOf(terms = {}) {
  const raw = Array.isArray(terms.gpParties) && terms.gpParties.length
    ? terms.gpParties
    : [{ id: "gp1", who: terms.gpWho, name: terms.gpName, capitalPct: 100, promotePct: pctOr(terms.promoteGpPct, 100) }];
  return raw.map((g, i) => ({ id: g.id || `gp${i + 1}`, who: g.who === "external" ? "external" : "firm", name: String(g.name ?? "").trim(), capitalPct: pctOr(g.capitalPct, 0), promotePct: pctOr(g.promotePct, 0) }));
}
export const gpPartyName = (g) => (g.who === "firm" ? "This firm" : g.name || "External GP");
export function partiesOf(terms = {}) {
  const sponsor = { who: terms.sponsorWho === "external" ? "external" : "firm", name: (terms.sponsorName ?? "").trim() };
  const gpParties = gpPartiesOf(terms);
  const firmGp = gpParties.some((g) => g.who === "firm");
  const gp = { who: firmGp ? "firm" : "external", name: gpParties.length === 1 ? gpParties[0].name : gpParties.map(gpPartyName).join(", ") };
  const feeTo = Object.fromEntries(FEE_KEYS.map(([k, , t]) => [k, ["sponsor", "gp", "third"].includes(terms[t]) ? terms[t] : "sponsor"]));
  const firmRole = sponsor.who === "firm" && firmGp ? "both" : sponsor.who === "firm" ? "sponsor" : firmGp ? "gp" : "none";
  const gpSide = Math.min(100, gpParties.reduce((a, g) => a + g.promotePct, 0));
  const capSum = gpParties.reduce((a, g) => a + g.capitalPct, 0);
  return {
    sponsor, gp, gpParties, firmRole, feeTo,
    capitalPctTotal: capSum,
    thirdParty: { pm: (terms.pmThirdParty ?? "").trim(), cm: (terms.cmThirdParty ?? "").trim() },
    promoteGpPct: gpSide, sponsorPromotePct: 100 - gpSide,
    promoteGpPctByAsset: terms.promoteGpPctByAsset && typeof terms.promoteGpPctByAsset === "object" ? terms.promoteGpPctByAsset : {},
    sponsorCommitPct: pctOr(terms.sponsorCommitPct, 0),
  };
}
export const firmRoleLabel = (role) => ({ both: "GP + sponsor", gp: "GP", sponsor: "Sponsor", none: "Neither" }[role] ?? "");

// One portfolio's split between GP and sponsor.
export function partyEconomics(f, terms = {}) {
  const P = partiesOf(terms);
  const yearOfIso = (iso) => String(iso ?? "").slice(0, 4);
  const gpPctOf = (a) => pctOr(P.promoteGpPctByAsset[a.id], P.promoteGpPct) / 100;
  const allocated = (f.assets ?? []).reduce((s, a) => s + (a.promote ?? 0), 0);
  const whole = Math.abs(allocated) < 1 && Math.abs(f.promoteTotal ?? 0) >= 1; // no asset allocation: split the total
  const gpPromote = whole ? (f.promoteTotal ?? 0) * (P.promoteGpPct / 100) : (f.assets ?? []).reduce((s, a) => s + (a.promote ?? 0) * gpPctOf(a), 0);
  const sponsorPromote = (f.promoteTotal ?? 0) - gpPromote;
  const sumTo = (party, src) => FEE_KEYS.reduce((s, [k]) => s + (P.feeTo[k] === party ? src?.[k] ?? 0 : 0), 0);
  const fees = f.fees ?? {};
  const sponsorFees = sumTo("sponsor", fees), gpFees = sumTo("gp", fees), thirdFees = sumTo("third", fees);
  const sponsorToDate = sumTo("sponsor", f.feesToDateByType), gpToDate = sumTo("gp", f.feesToDateByType);
  const totalEquity = (f.equity?.lp ?? 0) + (f.equity?.gp ?? 0);
  const sponsorEquity = totalEquity * (P.sponsorCommitPct / 100);
  // The sponsor's co-invest, if any, invests alongside the LPs at their net multiple.
  const sponsorCoinvest = sponsorEquity * ((f.equity?.lpMultiple ?? 1) - 1);
  const gpEquity = f.coinvest?.equity ?? 0;
  const gpReturn = (f.coinvest?.profit ?? 0) + gpPromote + gpFees;
  const gpRoe = gpEquity > 0 ? (gpReturn / gpEquity) * 100 : null;
  const simpleGp = P.promoteGpPct === 100 && !Object.keys(P.promoteGpPctByAsset).length && gpFees === 0;
  const years = (f.years ?? []).map((y) => {
    const pr = whole ? { gp: 0, sp: 0 } : (f.assets ?? []).filter((a) => yearOfIso(a.exit) === String(y.year)).reduce((o, a) => ({ gp: o.gp + (a.promote ?? 0) * gpPctOf(a), sp: o.sp + (a.promote ?? 0) * (1 - gpPctOf(a)) }), { gp: 0, sp: 0 });
    const byType = { mgmt: y.mgmtFee ?? 0, pm: y.pm ?? 0, cm: y.cm ?? 0, acq: y.acqFee ?? 0, disp: y.dispFee ?? 0 };
    const sp = Object.fromEntries(FEE_KEYS.map(([k]) => [k, P.feeTo[k] === "sponsor" ? byType[k] : 0]));
    const sFees = Object.values(sp).reduce((a, b) => a + b, 0);
    const gFees = sumTo("gp", byType);
    return {
      year: y.year,
      sponsor: { ...sp, fees: sFees, promote: pr.sp, total: sFees + pr.sp },
      gp: { fees: gFees, promote: pr.gp, coinvest: y.coinvest ?? 0, total: gFees + pr.gp + (y.coinvest ?? 0) },
      third: sumTo("third", byType),
    };
  });
  const sponsorRy = revenueYield({ fees: sponsorFees, feesToDate: sponsorToDate, terms, lpEquity: f.equity?.lp ?? 0, gpEquity: f.equity?.gp ?? 0, assets: f.assets ?? [] });
  return {
    parties: P,
    sponsor: { promoteTotal: f.promoteTotal ?? 0, fees: sponsorFees, feesByType: Object.fromEntries(FEE_KEYS.map(([k]) => [k, P.feeTo[k] === "sponsor" ? fees[k] ?? 0 : 0])), feesToDate: sponsorToDate, promote: sponsorPromote, coinvest: sponsorCoinvest, equity: sponsorEquity, total: sponsorFees + sponsorPromote + sponsorCoinvest, revenueYield: sponsorRy },
    gp: { parties: (() => {
      // Each GP party: its share of the GP capital (co-invest and any fees paid
      // to the GP follow it) and its share of the GP side's promote.
      const capSum = P.capitalPctTotal > 0 ? P.capitalPctTotal : 100;
      return P.gpParties.map((g) => {
        const cap = P.capitalPctTotal > 0 ? g.capitalPct / capSum : 1 / P.gpParties.length;
        const pro = P.promoteGpPct > 0 ? g.promotePct / P.promoteGpPct : 0;
        const equity = gpEquity * cap, coinvest = (f.coinvest?.profit ?? 0) * cap, promote = gpPromote * pro, gfees = gpFees * cap;
        const total = coinvest + promote + gfees;
        return { ...g, label: gpPartyName(g), capitalShare: cap * 100, equity, coinvest, promote, fees: gfees, total, roe: equity > 0 ? (total / equity) * 100 : null, multiple: equity > 0 ? 1 + total / equity : null };
      });
    })(), equity: gpEquity, coinvest: f.coinvest?.profit ?? 0, promote: gpPromote, promoteTotal: f.promoteTotal ?? 0, promoteRealized: f.promoteRealized ?? 0, fees: gpFees, feesToDate: gpToDate, total: gpReturn, roe: gpRoe, multiple: gpRoe != null ? 1 + gpRoe / 100 : null, irr: simpleGp ? f.coinvest?.irr ?? null : null },
    third: { fees: thirdFees, byType: Object.fromEntries(FEE_KEYS.map(([k]) => [k, P.feeTo[k] === "third" ? fees[k] ?? 0 : 0])), names: P.thirdParty },
    years,
  };
}

// Firm view for one role: totals over the portfolios where this firm plays
// it; others (an outside GP or sponsor) are listed only when asked, never in
// the totals.
export function firmPartyEconomics(fundResults, role, { includeExternal = false } = {}) {
  const ours = (f) => (role === "gp" ? f.parties.parties.gp.who === "firm" : f.parties.parties.sponsor.who === "firm");
  const rows = fundResults.filter((f) => f.parties).map((f) => ({ fund: f.fund, type: f.type, ours: ours(f), firmRole: f.parties.parties.firmRole, party: role === "gp" ? f.parties.parties.gp : f.parties.parties.sponsor, x: f.parties[role], third: f.parties.third, f }));
  const inTotal = rows.filter((r0) => r0.ours);
  const shown = includeExternal ? rows : inTotal;
  const S = (fn) => inTotal.reduce((s, r0) => s + (fn(r0) ?? 0), 0);
  const years = {};
  for (const r0 of inTotal) for (const y of r0.f.parties.years) {
    const t = (years[y.year] ??= { year: y.year, mgmt: 0, pm: 0, cm: 0, acq: 0, disp: 0, fees: 0, promote: 0, coinvest: 0, total: 0 });
    const v = y[role];
    for (const k of Object.keys(t)) if (k !== "year" && v[k] != null) t[k] += v[k];
  }
  const byType = ["Fund", "Joint Venture", "Separate Account"].map((type) => {
    const rs = inTotal.filter((r0) => r0.type === type);
    const s = (fn) => rs.reduce((a, r0) => a + (fn(r0) ?? 0), 0);
    return { type, portfolios: rs.length, fees: s((r0) => r0.x.fees), promote: s((r0) => r0.x.promote), coinvest: s((r0) => r0.x.coinvest), equity: s((r0) => r0.x.equity), total: s((r0) => r0.x.total), revenueYield: role === "sponsor" ? combineRevenueYield(rs.map((r0) => r0.x.revenueYield)) : null };
  }).filter((b) => b.portfolios > 0);
  const equity = S((r0) => r0.x.equity), total = S((r0) => r0.x.total);
  return {
    role, rows: shown, count: inTotal.length, byType,
    years: Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1)),
    totals: {
      fees: S((r0) => r0.x.fees), promote: S((r0) => r0.x.promote), coinvest: S((r0) => r0.x.coinvest), equity, total,
      promoteTotal: S((r0) => r0.x.promoteTotal), promoteRealized: S((r0) => r0.x.promoteRealized),
      roe: role === "gp" && equity > 0 ? (total / equity) * 100 : null,
      multiple: role === "gp" && equity > 0 ? 1 + total / equity : null,
      thirdFees: S((r0) => r0.third.fees),
      firmShare: role === "gp" ? S((r0) => r0.x.parties.filter((g) => g.who === "firm").reduce((a, g) => a + g.total, 0)) : null,
      revenueYield: role === "sponsor" ? combineRevenueYield(inTotal.map((r0) => r0.x.revenueYield)) : null,
    },
    byParty: role === "gp" ? (() => {
      // GP parties across portfolios: this firm is one row; outside GPs by name.
      const m = new Map();
      for (const r0 of inTotal) for (const g of r0.x.parties) {
        const k = g.who === "firm" ? "firm" : `ext:${g.label}`;
        const t = m.get(k) ?? { key: k, label: g.label, who: g.who, portfolios: 0, equity: 0, coinvest: 0, promote: 0, fees: 0, total: 0 };
        t.portfolios += 1; t.equity += g.equity; t.coinvest += g.coinvest; t.promote += g.promote; t.fees += g.fees; t.total += g.total;
        m.set(k, t);
      }
      return [...m.values()].map((t) => ({ ...t, roe: t.equity > 0 ? (t.total / t.equity) * 100 : null })).sort((a, b) => (a.who === "firm" ? -1 : b.who === "firm" ? 1 : b.total - a.total));
    })() : [],
    assets: inTotal.flatMap((r0) => (r0.f.assets ?? []).map((a) => ({ ...a, gpPct: pctOr(r0.f.parties.parties.promoteGpPctByAsset[a.id], r0.f.parties.parties.promoteGpPct) }))),
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
    for (const k of ["mgmtFee", "pm", "cm", "acqFee", "dispFee", "fees", "promote", "coinvest", "income", "capitalGains", "total"]) t[k] += y[k] ?? 0;
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
    return { type, capitalGains: pro + co, revenueYield: combineRevenueYield(fs.map((f) => f.revenueYield)), portfolios: fs.length, assets: s((f) => f.assets.length), fees: fee, mgmtFee: s((f) => f.fees.mgmt), txFees: s((f) => (f.fees.acq ?? 0) + (f.fees.disp ?? 0)), promote: pro, promoteRealized: s((f) => f.promote.realized), coinvest: co, total: fee + pro + co, share: null };
  }).filter((x) => x.portfolios > 0);
  const tAll = byType.reduce((a, x) => a + x.total, 0);
  byType.forEach((x) => { x.share = tAll > 0 ? (x.total / tAll) * 100 : null; });
  const yearsByType = yearList.map((y) => ({ year: y.year, ...Object.fromEntries(byType.map((b) => [b.type, fundResults.filter((f) => f.type === b.type).reduce((a, f) => a + (f.years.find((z) => z.year === y.year)?.income ?? 0), 0)])) }));
  return {
    byType,
    yearsByType,
    years: yearList,
    totals: {
      mgmtFee: tot("mgmtFee"), pm: tot("pm"), cm: tot("cm"), acqFee: tot("acqFee"), dispFee: tot("dispFee"), fees, promote, coinvest, total,
      feesShare: shareOf(fees), promoteShare: shareOf(promote), coinvestShare: shareOf(coinvest),
      capitalGains: promote + coinvest, capitalGainsShare: shareOf(promote + coinvest),
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
    ["Fee income (fees for services) is kept apart from capital gains (promote and co-invest profit), which count when realized, mostly on sale. The asset management fee is the fund management fee. Asset promote is the fund's promote allocated by share of gross profit."],
    [],
    ["Life of portfolios", "Amount", "Share of total GP economics (%)"],
    ["Fee income", t.fees, t.feesShare], ["  Asset management (fund management fee)", t.mgmtFee, ""], ["  Property management", t.pm, ""], ["  Construction management", t.cm, ""], ["  Acquisition fees", t.acqFee ?? 0, ""], ["  Disposition fees", t.dispFee ?? 0, ""],
    ["Capital gains", t.capitalGains, t.capitalGainsShare], ["  Promote / incentive fee", t.promote, t.promoteShare], ["  Co-invest profit", t.coinvest, t.coinvestShare], ["Total GP economics (fee income + capital gains)", t.total, 100],
    [],
    ["Revenue Yield (GP fees, not promote or co-invest, ÷ committed capital)", "Value", ""],
    ["Committed capital ($)", t.revenueYield?.committed ?? null, t.revenueYield?.anyFallback ? "Total equity used where no commitments are entered" : ""],
    ["Revenue Yield, life of portfolios (%)", t.revenueYield?.pct ?? null, ""],
    ["Revenue Yield per year (%)", t.revenueYield?.perYearPct ?? null, t.revenueYield?.lifeYears ? `over ${t.revenueYield.lifeYears.toFixed(1)} years` : ""],
    ["Revenue Yield to date (%)", t.revenueYield?.toDatePct ?? null, `on fees earned to date: ${Math.round(t.revenueYield?.feesToDate ?? 0)}`],
    [],
    ["Year", "Asset management", "Property management", "Construction management", "Acquisition / disposition fees", "Fee income", "Promote (capital gain)", "Co-invest profit (capital gain, on sale)", "Capital gains", "Total GP economics"],
    ...firm.years.map((y) => [y.year, y.mgmtFee, y.pm, y.cm, (y.acqFee ?? 0) + (y.dispFee ?? 0), y.fees, y.promote, y.coinvest, y.capitalGains, y.total]),
    [],
    ["Consolidated by portfolio type", "Portfolios", "Assets", "Fee income", "Promote / incentive fee", "Co-invest profit", "Total GP economics", "Share (%)", "Committed capital", "Revenue Yield (%)", "Per year (%)", "To date (%)"],
    ...(firm.byType ?? []).map((b) => [b.type, b.portfolios, b.assets, b.fees, b.promote, b.coinvest, b.total, b.share, b.revenueYield?.committed, b.revenueYield?.pct, b.revenueYield?.perYearPct, b.revenueYield?.toDatePct]),
    [],
    ["Fund", "Type", "Fee income", "Promote (total)", "Promote realized", "GP equity", "GP distributions", "Co-invest profit", "GP ROE (%)", "GP IRR (%)", "GP multiple", "Committed capital", "Basis", "Revenue Yield (%)", "Per year (%)", "To date (%)"],
    ...firm.funds.map((f) => [f.fund, f.type, f.fees.total, f.promote.total, f.promote.realized, f.coinvest.equity, f.coinvest.distributions, f.coinvest.profit, f.coinvest.roe, f.coinvest.irr, f.coinvest.multiple, f.revenueYield?.committed, ryBasisLabel(f.revenueYield), f.revenueYield?.pct, f.revenueYield?.perYearPct, f.revenueYield?.toDatePct]),
    [],
    ["Asset", "Fund", "Status", "Property management", "Construction management", "Fee income", "Promote (allocated)", "Co-invest profit (on sale)", "Share of gross profit (%)"],
    ...firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", a.pm, a.cm, a.fees, a.promote, a.coinvest ?? 0, a.promoteWeight]),
  ];
  return rows;
}

// ─── GP / Sponsor Economics exports (11/24): one list of sections for the
// Excel and the PDF. Each column has a kind: text, money, pct, x.
const payeeLabel = (v) => ({ sponsor: "Sponsor", gp: "GP", third: "Third party" }[v] ?? v);
export function partySections(role, firm, { title = "" } = {}) {
  const t = firm.totals;
  const name = role === "gp" ? "GP Economics" : "Sponsor Economics";
  const partyName = (r0) => (r0.party.who === "firm" ? "This firm" : r0.party.name || (role === "gp" ? "External GP" : "External operator"));
  const out = [{ title: `${title}: ${name} (internal)`, note: role === "gp" ? "The GP (capital partner): return on invested capital (co-invest profit) and its share of the promote, plus any fee the setup pays to the GP. Capital gains count in the year each asset is sold. Totals: portfolios where this firm is the GP." : "The sponsor / operator: the fees it earns (outsourced fees are nobody's revenue) and its share of the promote. Totals: portfolios where this firm is the sponsor.", head: [], kinds: [], rows: [] }];
  if (role === "gp") {
    out.push({ title: "Consolidated", head: ["", "Amount"], kinds: ["text", "money"], rows: [
      ["GP equity invested", t.equity], ["Co-invest profit (capital gain)", t.coinvest], ["Promote share (capital gain)", t.promote], ["  of total promote", t.promoteTotal], ["Fees paid to the GP", t.fees], ["Total GP economics", t.total], ["  this firm's share", t.firmShare],
    ] });
    out.push({ title: "Split by GP party", head: ["GP party", "Portfolios", "GP equity", "Co-invest profit", "Promote share", "Fees paid to the GP", "Total", "ROE (%)"], kinds: ["text", "text", "money", "money", "money", "money", "money", "pct"], rows: (firm.byParty ?? []).map((g) => [g.label, g.portfolios, g.equity, g.coinvest, g.promote, g.fees, g.total, g.roe]) });
    out.push({ title: "Return on invested capital", head: ["", "Value"], kinds: ["text", "pct"], rows: [["Return on invested capital (%)", t.roe], ["Multiple (x)", t.multiple]] });
    out.push({ title: "By year (all GP parties)", head: ["Year", "Fees paid to the GP", "Promote share", "Co-invest profit", "Total GP economics"], kinds: ["text", "money", "money", "money", "money"], rows: firm.years.map((y) => [y.year, y.fees, y.promote, y.coinvest, y.total]) });
    out.push({ title: "By portfolio", head: ["Portfolio", "Type", "This firm is", "GP", "GP equity", "Co-invest profit", "Promote (total)", "GP side of promote", "GP promote", "Fees paid to the GP", "Total GP economics", "ROE (%)", "IRR (%)", "Multiple (x)", "In totals"], kinds: ["text", "text", "text", "text", "money", "money", "money", "text", "money", "money", "money", "pct", "pct", "x", "text"],
      rows: firm.rows.map((r0) => [r0.fund, r0.type, firmRoleLabel(r0.firmRole), partyName(r0), r0.x.equity, r0.x.coinvest, r0.x.promoteTotal, `${r0.f.parties.parties.promoteGpPct}%${Object.keys(r0.f.parties.parties.promoteGpPctByAsset).length ? " (asset overrides)" : ""}${r0.x.parties.length > 1 ? ` · ${r0.x.parties.map((g) => `${g.label} ${g.promotePct}%`).join(", ")}` : ""}`, r0.x.promote, r0.x.fees, r0.x.total, r0.x.roe, r0.x.irr, r0.x.multiple, r0.ours ? "Yes" : "No (outside GP)"]) });
    out.push({ title: "By asset", head: ["Asset", "Portfolio", "Status", "Promote (allocated)", "GP share (%)", "GP promote", "Co-invest profit (on sale)"], kinds: ["text", "text", "text", "money", "pct", "money", "money"], rows: firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", a.promote, a.gpPct, (a.promote ?? 0) * a.gpPct / 100, a.coinvest]) });
  } else {
    const ry = t.revenueYield ?? {};
    out.push({ title: "Consolidated", head: ["", "Amount"], kinds: ["text", "money"], rows: [
      ["Fee income", t.fees], ["Promote share (capital gain)", t.promote], ["Sponsor co-invest profit", t.coinvest], ["Total sponsor economics", t.total], ["Outsourced fees (third party; not revenue)", t.thirdFees], ["Committed capital", ry.committed],
    ] });
    out.push({ title: "Revenue Yield (sponsor fees ÷ committed capital)", head: ["", "Value (%)"], kinds: ["text", "pct"], rows: [["Life of portfolios", ry.pct], ["Per year", ry.perYearPct], ["To date", ry.toDatePct]] });
    out.push({ title: "By year", head: ["Year", "Asset management", "Property management", "Construction management", "Acq. / disp. fees", "Fee income", "Promote share", "Total"], kinds: ["text", "money", "money", "money", "money", "money", "money", "money"], rows: firm.years.map((y) => [y.year, y.mgmt, y.pm, y.cm, y.acq + y.disp, y.fees, y.promote, y.total]) });
    out.push({ title: "By portfolio", head: ["Portfolio", "Type", "Sponsor", "Asset management", "Property management", "Construction management", "Acq. / disp.", "Fee income", "Outsourced (not revenue)", "Promote share", "Committed", "Revenue Yield (%)", "Per year (%)", "To date (%)", "In totals"], kinds: ["text", "text", "text", "money", "money", "money", "money", "money", "money", "money", "money", "pct", "pct", "pct", "text"],
      rows: firm.rows.map((r0) => { const b = r0.x.feesByType; return [r0.fund, r0.type, partyName(r0), b.mgmt, b.pm, b.cm, b.acq + b.disp, r0.x.fees, r0.third.fees, r0.x.promote, r0.x.revenueYield?.committed, r0.x.revenueYield?.pct, r0.x.revenueYield?.perYearPct, r0.x.revenueYield?.toDatePct, r0.ours ? "Yes" : "No (outside sponsor)"]; }) });
    out.push({ title: "Who is paid each fee", head: ["Portfolio", ...FEE_KEYS.map(([, l]) => l)], kinds: ["text", ...FEE_KEYS.map(() => "text")], rows: firm.rows.map((r0) => [r0.fund, ...FEE_KEYS.map(([k]) => payeeLabel(r0.f.parties.parties.feeTo[k]) + (r0.f.parties.parties.feeTo[k] === "third" && r0.f.parties.parties.thirdParty[k] ? ` (${r0.f.parties.parties.thirdParty[k]})` : ""))]) });
  }
  return out;
}
export function partyXlsx(role, firm, opts) {
  const rows = [];
  for (const s of partySections(role, firm, opts)) {
    rows.push([s.title]);
    if (s.note) rows.push([s.note]);
    if (s.head.length) rows.push(s.head);
    rows.push(...s.rows, []);
  }
  return rows;
}
