// ─── Phase L: Asset Return additions (user, 11/23) ───────────────────────────
// GP economics from a waterfall result (lib/calculations or lib/fundTimeline):
//   GP profit  = GP distributions − GP equity invested ("GP upside above
//                capital returned"; this was labelled "GP Promote" before)
//   GP promote = GP distributions − GP share of equity × total distributions
//                ("GP upside above its pro-rata share")
//   GP ROE     = GP profit ÷ GP equity (total, not annualized; the GP IRR is
//                the annual rate)
// Example: GP 10% of equity ($1.0M), the deal distributes $20M, the GP gets
// $2.6M → GP profit $1.6M, GP promote $0.6M, GP ROE 160%.
//
// Projected fee revenue: the firm's fees from the asset by hold year:
// property management (the PM fee in the cash flow) and construction
// management (the CM fee). The asset management fee is the fund's management
// fee (one fund-level fee), so it isn't counted per asset; promote is never
// part of fee revenue.

export function gpEconomics(wf) {
  const lpEq = wf?.lpEquity ?? 0;
  const gpEq = wf?.gpEquity ?? 0;
  const lpD = wf?.lpTotalDistributions ?? 0;
  const gpD = wf?.gpTotalDistributions ?? 0;
  const eq = lpEq + gpEq;
  const profit = gpD - gpEq;
  return {
    gpProfit: profit,
    gpPromote: eq > 0 ? gpD - (gpEq / eq) * (lpD + gpD) : 0,
    gpRoe: gpEq > 0 ? (profit / gpEq) * 100 : null,
  };
}

// cashFlows: underwrite(...).annualCashFlows (managementFee, constructionMgmtFee)
export function feeRevenue(cashFlows = [], discountPct = 8) {
  const r = (Number(discountPct) || 0) / 100;
  const rows = cashFlows.map((cf, i) => {
    const pm = Math.max(0, cf.managementFee ?? 0);
    const cm = Math.max(0, cf.constructionMgmtFee ?? 0);
    return { year: cf.year ?? i + 1, pm, cm, total: pm + cm };
  });
  const sum = (k) => rows.reduce((s, x) => s + x[k], 0);
  const pv = rows.reduce((s, x, i) => s + x.total / Math.pow(1 + r, i + 1), 0);
  return { rows, pm: sum("pm"), cm: sum("cm"), total: sum("total"), pv, discountPct: Number(discountPct) || 0 };
}

export function feeRevenueXlsx(name, fr, gp) {
  return [
    [`${name}: projected fee revenue`],
    [`Present value at ${fr.discountPct}% a year. The asset management fee is the fund's management fee (on Portfolio Return), not counted per asset; promote is not fee revenue.`],
    [],
    ["Year", "Property management", "Construction management", "Total"],
    ...fr.rows.map((x) => [`Year ${x.year}`, x.pm, x.cm, x.total]),
    ["Total", fr.pm, fr.cm, fr.total],
    ["Present value", "", "", fr.pv],
    [],
    ["GP profit (upside above capital returned)", gp.gpProfit],
    ["GP promote (upside above its pro-rata share)", gp.gpPromote],
    ["GP ROE (%)", gp.gpRoe],
  ];
}
