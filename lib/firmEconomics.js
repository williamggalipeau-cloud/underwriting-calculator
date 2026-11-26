// ─── Finance → Firm Economics (user, 11/26, 1.1.9) ──────────────────────────
// Everything the firm earns in the portfolios where it is BOTH a GP and the
// sponsor, counted once: fees, both sides of the promote and the profit on its
// own capital. Built on each portfolio's GP / sponsor split (partyEconomics in
// lib/gpEconomics.js), so it always agrees with GP Economics and Sponsor
// Economics.
//
// Decided with the user (11/26):
//   firm equity    the GP capital when there is no outside GP partner; with
//                  one, only the firm's share of the GP capital (its capital %
//                  in Fund terms → Parties). 1.1.10: the firm is the sponsor,
//                  and the sponsor's co-invest IS its share of the GP capital
//                  (no separate amount).
//   promote        the firm's share follows the agreements: the GP side's
//                  share of the promote (vs. the sponsor) and, within the GP
//                  side, the firm's promote % with any outside GP partner,
//                  not its capital share. The sponsor side is the firm's.
//   co-invest      the firm's share of the GP capital's profit.
//   fees           every fee (paid to the sponsor, this firm), except fees
//                  outsourced to a third party (nobody's revenue). The GP
//                  earns no fees (1.1.10). Each fee counts once.
//   ROE / IRR / multiple   on capital only (promote + co-invest profit on firm
//                  equity), with "with fees" beside ROE and multiple. Fees
//                  need almost no capital; Revenue Yield measures them.
// The outside partner's share is never counted here.
import { xirr } from "@/lib/fundTimeline";
import { FEE_KEYS, combineRevenueYield } from "@/lib/gpEconomics";

const n0 = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const yearOf = (iso) => String(iso ?? "").slice(0, 4);

// One portfolio (a fundGpEconomics result) → the firm's figures, or null when
// the firm isn't both GP and sponsor there.
export function portfolioFirmEconomics(f) {
  const px = f?.parties;
  const P = px?.parties;
  // 1.1.10: the firm is always the sponsor, so every portfolio counts (with
  // no GP capital of its own, its equity and co-invest are 0).
  if (!P) return null;
  const firmGp = px.gp.parties.filter((g) => g.who === "firm");
  const gpEquityAll = n0(px.gp.equity);
  const gpEquity = firmGp.reduce((s, g) => s + n0(g.equity), 0);
  const capShare = gpEquityAll > 0 ? gpEquity / gpEquityAll : firmGp.length ? firmGp.reduce((s, g) => s + n0(g.capitalShare), 0) / 100 : 0;
  const gpPromoteAll = n0(px.gp.promote);
  const gpPromote = firmGp.reduce((s, g) => s + n0(g.promote), 0);
  const gpPromoteShare = gpPromoteAll !== 0 ? gpPromote / gpPromoteAll : P.promoteGpPct > 0 ? firmGp.reduce((s, g) => s + g.promotePct, 0) / P.promoteGpPct : 0;
  const sponsorPromote = n0(px.sponsor.promote);
  const promote = gpPromote + sponsorPromote;
  const promoteTotal = n0(f.promote?.total);
  const promoteRealized = promoteTotal !== 0 ? n0(f.promote?.realized) * (promote / promoteTotal) : 0;
  const gpCoinvest = firmGp.reduce((s, g) => s + n0(g.coinvest), 0);
  const spCoinvest = 0, spEquity = 0; // 1.1.10: the sponsor's capital is its GP share
  const equity = gpEquity;

  // Fees by type: every fee is the sponsor's (this firm's) unless outsourced.
  const feeShare = (k) => (P.feeTo[k] === "sponsor" ? 1 : 0);
  const life = Object.fromEntries(FEE_KEYS.map(([k]) => [k, n0(f.fees?.[k]) * feeShare(k)]));
  const toDate = Object.fromEntries(FEE_KEYS.map(([k]) => [k, n0(f.feesToDateByType?.[k]) * feeShare(k)]));
  const fees = Object.values(life).reduce((a, b) => a + b, 0);
  const feesToDate = Object.values(toDate).reduce((a, b) => a + b, 0);
  const coinvest = gpCoinvest + spCoinvest;
  const total = fees + promote + coinvest;

  // By asset (1.1.10: from each GP party's asset-by-asset shares, so a
  // deal-level partner or an amendment lands on the right asset and date):
  // the firm's promote (the sponsor side in full + its GP parties' share),
  // co-invest profit and equity, in the year of each sale.
  const gpPctOf = (a) => {
    const v = P.promoteGpPctByAsset?.[a.id];
    return (v === "" || v == null || !isFinite(Number(v)) ? P.promoteGpPct : Math.min(100, Math.max(0, Number(v)))) / 100;
  };
  const firmAsset = (a, k) => firmGp.reduce((s, g) => s + n0(g.assets?.find((x) => x.id === a.id)?.[k]), 0);
  const assets = (f.assets ?? []).map((a) => {
    const pr = n0(a.promote) * (1 - gpPctOf(a)) + firmAsset(a, "promote");
    return { id: a.id, name: a.name, fund: f.fund, acq: a.acq, exit: a.exit, sold: a.sold, equityAll: n0(a.equity), equity: firmAsset(a, "equity"), promote: pr, coinvest: firmAsset(a, "coinvest"), fees: n0(a.pm) * feeShare("pm") + n0(a.cm) * feeShare("cm") + n0(a.acqFee) * feeShare("acq") + n0(a.dispFee) * feeShare("disp") };
  });
  // The asset-level promote may not add up to the portfolio's (no asset
  // allocation): scale it so the by-year view matches the total.
  const prSum = assets.reduce((s, a) => s + a.promote, 0);
  if (Math.abs(prSum) > 0.5 && Math.abs(prSum - promote) > 0.5) for (const a of assets) a.promote *= promote / prSum;

  // By year.
  const years = {};
  const Y = (y) => (years[y] ??= { year: y, mgmt: 0, pm: 0, cm: 0, acq: 0, disp: 0, fees: 0, promote: 0, coinvest: 0, total: 0 });
  for (const y of f.years ?? []) {
    const t = Y(String(y.year));
    const byType = { mgmt: n0(y.mgmtFee), pm: n0(y.pm), cm: n0(y.cm), acq: n0(y.acqFee), disp: n0(y.dispFee) };
    for (const [k] of FEE_KEYS) t[k] += byType[k] * feeShare(k);
  }
  const unplaced = Math.abs(prSum) <= 0.5 ? promote : 0; // no asset allocation: in the year of the last sale
  for (const a of assets) { Y(yearOf(a.exit)).promote += a.promote; Y(yearOf(a.exit)).coinvest += a.coinvest; }
  const lastExit = assets.map((a) => a.exit).filter(Boolean).sort().at(-1);
  if (unplaced && lastExit) Y(yearOf(lastExit)).promote += unplaced;
  const yearList = Object.values(years).map((y) => { const fe = y.mgmt + y.pm + y.cm + y.acq + y.disp; return { ...y, fees: fe, total: fe + y.promote + y.coinvest }; }).sort((a, b) => (a.year < b.year ? -1 : 1));

  // Capital IRR: the firm's equity in each asset goes in at its acquisition
  // and comes back at its sale with its promote and co-invest profit.
  const eqFirm = assets.reduce((s, a) => s + a.equity, 0);
  const capitalFlows = [];
  for (const a of assets) {
    const put = eqFirm > 0 ? equity * (a.equity / eqFirm) : 0;
    if (put > 0 && a.acq) capitalFlows.push({ date: a.acq, amount: -put });
    if (a.exit) capitalFlows.push({ date: a.exit, amount: put + a.promote + a.coinvest });
  }
  if (unplaced && lastExit) capitalFlows.push({ date: lastExit, amount: unplaced });

  // Revenue Yield on the firm's fees: the sponsor's basis (committed capital).
  const ry0 = px.sponsor.revenueYield ?? {};
  const committed = n0(ry0.committed);
  const pct = (x) => (committed > 0 ? (x / committed) * 100 : null);
  const revenueYield = { ...ry0, fees, feesToDate, pct: pct(fees), perYearPct: pct(fees) != null && ry0.lifeYears > 0 ? pct(fees) / ry0.lifeYears : null, toDatePct: pct(feesToDate) };

  return {
    fund: f.fund, type: f.type, assetsCount: assets.length,
    outsideGp: px.gp.parties.filter((g) => g.who !== "firm").map((g) => g.label),
    equity, gpEquity, gpEquityAll, spEquity, capShare: capShare * 100,
    fees, feesToDate, feesLife: life, feesToDateByType: toDate, feeTo: P.feeTo,
    promote, gpPromote, sponsorPromote, promoteTotal, promoteRealized, gpPromoteShare: gpPromoteShare * 100, promoteGpPct: P.promoteGpPct,
    coinvest, gpCoinvest, spCoinvest, total,
    ...returns({ equity, promote, coinvest, fees, capitalFlows }),
    revenueYield, years: yearList, assets, capitalFlows,
  };
}

function returns({ equity, promote, coinvest, fees, capitalFlows }) {
  const capital = promote + coinvest;
  const irr = xirr(capitalFlows);
  return {
    roe: equity > 0 ? (capital / equity) * 100 : null,
    roeWithFees: equity > 0 ? ((capital + fees) / equity) * 100 : null,
    multiple: equity > 0 ? 1 + capital / equity : null,
    multipleWithFees: equity > 0 ? 1 + (capital + fees) / equity : null,
    irr: isFinite(irr) ? irr * 100 : null,
  };
}

// The firm across portfolios (fundGpEconomics results). shown: true when at
// least one portfolio has the firm as both GP and sponsor (the tab's rule).
export function firmEconomics(fundResults = []) {
  const rows = fundResults.map(portfolioFirmEconomics).filter(Boolean);
  const S = (k) => rows.reduce((s, r) => s + n0(r[k]), 0);
  const equity = S("equity"), fees = S("fees"), promote = S("promote"), coinvest = S("coinvest");
  const total = fees + promote + coinvest;
  const years = {};
  for (const r of rows) for (const y of r.years) {
    const t = (years[y.year] ??= { year: y.year, mgmt: 0, pm: 0, cm: 0, acq: 0, disp: 0, fees: 0, promote: 0, coinvest: 0, total: 0 });
    for (const k of Object.keys(t)) if (k !== "year") t[k] += y[k];
  }
  let cum = 0;
  const yearList = Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1)).map((y) => ({ ...y, cumulative: (cum += y.total) }));
  const feesByType = FEE_KEYS.map(([k, label]) => ({ key: k, label, life: rows.reduce((s, r) => s + r.feesLife[k], 0), toDate: rows.reduce((s, r) => s + r.feesToDateByType[k], 0), paidTo: [...new Set(rows.map((r) => r.feeTo[k]))] }));
  const share = (v) => (total > 0 ? (v / total) * 100 : null);
  return {
    shown: rows.length > 0,
    rows,
    years: yearList,
    feesByType,
    totals: {
      equity, gpEquity: S("gpEquity"), spEquity: S("spEquity"),
      fees, feesToDate: S("feesToDate"),
      promote, gpPromote: S("gpPromote"), sponsorPromote: S("sponsorPromote"), promoteRealized: S("promoteRealized"),
      coinvest, gpCoinvest: S("gpCoinvest"), spCoinvest: S("spCoinvest"),
      total, feesShare: share(fees), promoteShare: share(promote), coinvestShare: share(coinvest),
      ...returns({ equity, promote, coinvest, fees, capitalFlows: rows.flatMap((r) => r.capitalFlows) }),
      revenueYield: combineRevenueYield(rows.map((r) => r.revenueYield)),
    },
    assets: rows.flatMap((r) => r.assets),
  };
}

// One list of sections for the Excel and the PDF (as GP / Sponsor Economics).
export function firmSections(fe, { title = "" } = {}) {
  const t = fe.totals, ry = t.revenueYield ?? {};
  return [
    { title: `${title}: Firm Economics (internal)`, note: "Everything the firm earns as the sponsor and a GP, counted once: fees (outsourced fees are nobody's revenue; the GP earns none), both sides of the promote (by the agreements: the GP side vs. the sponsor, and the firm's promote % with any outside GP partner) and the profit on its own capital (its share of the GP capital commitment). The outside partners' shares are not counted. ROE, IRR and multiple are on capital only (promote + co-invest profit on firm equity); fees are measured by Revenue Yield.", head: [], kinds: [], rows: [] },
    { title: "Summary", head: ["", "Amount"], kinds: ["text", "money"], rows: [
      ["Firm equity (its share of the GP capital)", t.equity],
      ["Fees (counted once)", t.fees], ["  earned to date", t.feesToDate],
      ["Promote, both sides", t.promote], ["  GP side (firm's share)", t.gpPromote], ["  Sponsor side", t.sponsorPromote], ["  realized", t.promoteRealized],
      ["Co-invest profit", t.coinvest],
      ["Total to the firm", t.total],
    ] },
    { title: "Returns", head: ["", "Capital only", "With fees"], kinds: ["text", "pct", "pct"], rows: [["Return on equity (%)", t.roe, t.roeWithFees], ["IRR (%)", t.irr, null]] },
    { title: "Multiple and Revenue Yield", head: ["", "Value"], kinds: ["text", "x"], rows: [["Equity multiple, capital only (x)", t.multiple], ["Equity multiple with fees (x)", t.multipleWithFees]] },
    { title: "Revenue Yield (firm fees ÷ committed capital)", head: ["", "Value (%)"], kinds: ["text", "pct"], rows: [["Life of portfolios", ry.pct], ["Per year", ry.perYearPct], ["To date", ry.toDatePct]] },
    { title: "By portfolio", head: ["Portfolio", "Type", "Outside GP partner", "Firm equity", "Fees", "Promote", "Co-invest profit", "Total", "ROE (%)", "IRR (%)", "Multiple (x)", "Revenue Yield / yr (%)"], kinds: ["text", "text", "text", "money", "money", "money", "money", "money", "pct", "pct", "x", "pct"],
      rows: fe.rows.map((r) => [r.fund, r.type, r.outsideGp.join(", ") || "None", r.equity, r.fees, r.promote, r.coinvest, r.total, r.roe, r.irr, r.multiple, r.revenueYield?.perYearPct]) },
    { title: "Fees by type", head: ["Fee", "Paid to", "Life", "To date"], kinds: ["text", "text", "money", "money"], rows: fe.feesByType.map((x) => [x.label, x.paidTo.map((p) => ({ sponsor: "Sponsor (this firm)", third: "Third party (not counted)" }[p] ?? p)).join(", "), x.life, x.toDate]) },
    { title: "By year", head: ["Year", "Fees", "Promote (both sides)", "Co-invest profit", "Total", "Cumulative"], kinds: ["text", "money", "money", "money", "money", "money"], rows: fe.years.map((y) => [y.year, y.fees, y.promote, y.coinvest, y.total, y.cumulative]) },
    { title: "Promote split", head: ["Portfolio", "GP side of the promote (%)", "Firm's share of the GP side (%)", "GP side to the firm", "Sponsor side to the firm", "Promote to the firm", "Realized"], kinds: ["text", "pct", "pct", "money", "money", "money", "money"],
      rows: fe.rows.map((r) => [r.fund, r.promoteGpPct, r.gpPromoteShare, r.gpPromote, r.sponsorPromote, r.promote, r.promoteRealized]) },
    { title: "By asset", head: ["Asset", "Portfolio", "Status", "Fees", "Promote to the firm", "Co-invest profit (on sale)"], kinds: ["text", "text", "text", "money", "money", "money"], rows: fe.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", a.fees, a.promote, a.coinvest]) },
  ];
}
export function firmXlsx(fe, opts) {
  const rows = [];
  for (const s of firmSections(fe, opts)) {
    rows.push([s.title]);
    if (s.note) rows.push([s.note]);
    if (s.head.length) rows.push(s.head);
    rows.push(...s.rows, []);
  }
  return rows;
}
