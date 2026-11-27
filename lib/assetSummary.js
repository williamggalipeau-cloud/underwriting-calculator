// ─── Asset summary: one row per asset in a fund, plus fund totals ────────────
// Underwriting figures come from the full engine (underwrite) for each
// asset's current inputs; the latest valuation (last completed quarter) comes
// from lib/valuations; funding comes from the fund's capital activity tags.

import { assetFacts, buildingOf } from "@/lib/assetFacts";
import { pmFeeMismatch, propertyManagerLabel } from "@/lib/propertyManager";
import { underwrite } from "@/lib/calculations";
import { acquisitionDate, datedFlows, exitDate, fundDates, xirr } from "@/lib/fundTimeline";
import { fundValuation } from "@/lib/valuations";
import { writeXlsx } from "@/lib/xlsx";
import { leaseAnalytics, unitStats } from "@/lib/leases";

const safeDiv = (a, b) => (b ? a / b : NaN);

// Loan sizing: the loan each test allows, which one sets the loan, and the
// cushion = next-tightest limit ÷ the binding limit − 1 (how much the loan
// could grow before another test binds).
export function loanSizing(inputs, debt) {
  const c = inputs.loanSizingConstraints ?? {};
  const a = debt.constraintAmounts ?? {};
  const tests = [
    { name: "LTV", target: `${inputs.ltvPct ?? 0}%`, amount: a.ltv, on: true },
    { name: "DSCR", target: `${(c.minDSCR ?? 1.25).toFixed(2)}x`, amount: a.dscr, on: !!c.minDSCREnabled },
    { name: "LTC", target: `${c.maxLTCPct ?? 75}%`, amount: a.ltc, on: !!c.maxLTCEnabled },
    { name: "Debt Yield", target: `${c.minDebtYieldPct ?? 8}%`, amount: a.debtYield, on: !!c.minDebtYieldEnabled },
  ];
  const live = tests.filter((t) => t.on && t.amount > 0).sort((x, y) => x.amount - y.amount);
  const binding = debt.bindingConstraint ?? live[0]?.name ?? "LTV";
  const bindAmt = tests.find((t) => t.name === binding)?.amount ?? 0;
  const next = live.find((t) => t.name !== binding);
  return {
    tests,
    binding,
    tested: live.length,
    next: next?.name ?? null,
    cushionPct: next && bindAmt > 0 ? (next.amount / bindAmt - 1) * 100 : NaN,
  };
}

export function assetSummary(deals, terms, { todayISO, marks = {}, curve } = {}) {
  const fund = terms;
  const val = fundValuation(deals, marks, terms, { todayISO, curve });
  const activity = terms.capitalActivity ?? [];
  const fundingFor = (id) => {
    const tagged = activity.filter((a) => a.purpose === `acq:${id}` && Number(a.amount) > 0);
    const call = tagged.filter((a) => a.type === "call").reduce((s, a) => s + Number(a.amount), 0);
    const draw = tagged.filter((a) => a.type === "draw").reduce((s, a) => s + Number(a.amount), 0);
    if (!tagged.length) return { label: activity.length ? "Not tagged" : "—", call, draw };
    return { label: call && draw ? "Call + line" : call ? "Capital call" : "Sub line", call, draw };
  };

  const fd = fundDates(fund);
  const rows = deals.map((d) => {
    const r = underwrite(d.inputs);
    const cfs = r.annualCashFlows;
    const hold = cfs.length;
    const acq = acquisitionDate(d, fund);
    const exit = exitDate(d, fund);
    const a = val.assets.find((x) => x.id === d.id);
    const latest = a?.rows.at(-1) ?? null;
    const sf = d.inputs.squareFootage ?? 0;
    const price = d.inputs.purchasePrice ?? 0;
    const exitNOI = cfs[hold - 1]?.noi ?? 0;
    const us = unitStats(d.inputs);
    const la = leaseAnalytics(d.inputs, todayISO);
    return {
      id: d.id,
      live: !!d.live,
      name: d.inputs.propertyName || "Unnamed deal",
      location: [d.inputs.city, d.inputs.state].filter(Boolean).join(", "),
      propertyManager: propertyManagerLabel(d.inputs), // 1.1.13: set in asset setup
      pmFeeMismatch: pmFeeMismatch(d.inputs, terms),
      // 1.1.17: industrial characteristics (asset setup → Building)
      clearHeightFt: buildingOf(d.inputs).clearHeightFt ?? null, dockDoors: buildingOf(d.inputs).dockDoors ?? null, facts: assetFacts(d.inputs, { todayISO }),
      status: acq > todayISO ? "Pipeline" : exit <= todayISO ? "Sold" : "Owned",
      acq,
      acqAssumed: !d.inputs?.acquisitionDate,
      // Against the fund's terms: bought after the investment period, or
      // sold after the fund term (before extensions).
      termIssues: [
        acq > fd.investmentPeriodEnd ? `bought after the investment period ends (${fd.investmentPeriodEnd})` : null,
        exit > fd.fundEnd ? `exits after the fund term ends (${fd.fundEnd}${exit <= fd.extendedEnd ? ", within extensions" : ""})` : null,
      ].filter(Boolean),
      exit,
      holdYears: hold,
      sf,
      units: us.units,
      leased: us.leased,
      occupancyPct: us.occupancyPct,
      vacancyPct: us.fromRentRoll ? 100 - us.occupancyPct : NaN,
      leasedSF: us.leasedSF,
      rentRoll: us.fromRentRoll,
      walt: la.walt,
      annualRent: la.totalRent,
      leases: la,
      price,
      pricePSF: safeDiv(price, sf),
      loan: r.debt.loanAmount,
      ltv: safeDiv(r.debt.loanAmount, price) * 100,
      sizing: loanSizing(d.inputs, r.debt),
      equity: r.debt.equityRequired,
      noi1: cfs[0]?.noi ?? 0,
      noiGrowth: d.inputs.noiOverrideEnabled ? d.inputs.noiGrowthPct : NaN,
      goingInCap: r.returns.goingInCapRate,
      exitNOI,
      exitCap: r.returns.exitCapRate,
      exitValue: r.returns.exitValue,
      exitPSF: safeDiv(r.returns.exitValue, sf),
      irr: r.returns.irr,
      em: r.returns.equityMultiple,
      coc1: r.returns.yearOneCashOnCash,
      dscr1: r.debt.dscr,
      distributions: r.annualCashFlows.reduce((s, c) => s + c.pretaxCashFlow, 0) + r.returns.equityReversion,
      flows: datedFlows({ ...d, irrFlows: r.irrFlows }, r.irrFlows, fund),
      funding: fundingFor(d.id),
      // Full detail for the asset's detail panel.
      detail: {
        inputs: d.inputs,
        cashFlows: cfs,
        debt: r.debt,
        returns: r.returns,
        closingCosts: r.closingCosts.total,
        sellingCosts: r.sellingCosts.total,
        irrFlows: r.irrFlows,
        valuationRows: a?.rows ?? [],
        activity: activity
          .filter((x) => x.purpose === `acq:${d.id}` && Number(x.amount) > 0)
          .sort((x, y) => (x.date < y.date ? -1 : 1)),
      },
      valuation: latest
        ? {
            quarterEnd: latest.quarterEnd,
            value: latest.value,
            basis: latest.basis,
            overdue: latest.overdue,
            nav: latest.nav,
            unrealized: latest.unrealized,
            tvpi: latest.tvpi,
            contrib: latest.contrib,
            dist: latest.dist,
          }
        : null,
    };
  });

  const sum = (k) => rows.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const valued = rows.filter((x) => x.valuation);
  const withRoll = rows.filter((x) => x.rentRoll);
  const withWalt = rows.filter((x) => isFinite(x.walt));
  const vsum = (k) => valued.reduce((s, x) => s + (x.valuation[k] || 0), 0);
  const totals = {
    count: rows.length,
    owned: rows.filter((x) => x.status === "Owned").length,
    pipeline: rows.filter((x) => x.status === "Pipeline").length,
    sold: rows.filter((x) => x.status === "Sold").length,
    sf: sum("sf"),
    units: sum("units"),
    // Occupancy and WALT cover only assets with a rent roll.
    rentRolls: withRoll.length,
    leased: withRoll.reduce((s, x) => s + x.leased, 0),
    occupancyPct: safeDiv(withRoll.reduce((s, x) => s + x.leasedSF, 0), withRoll.reduce((s, x) => s + x.sf, 0)) * 100,
    vacancyPct: withRoll.length ? 100 - safeDiv(withRoll.reduce((s, x) => s + x.leasedSF, 0), withRoll.reduce((s, x) => s + x.sf, 0)) * 100 : NaN,
    walt: safeDiv(withWalt.reduce((s, x) => s + x.walt * x.annualRent, 0), withWalt.reduce((s, x) => s + x.annualRent, 0)),
    price: sum("price"),
    pricePSF: safeDiv(sum("price"), sum("sf")),
    loan: sum("loan"),
    ltv: safeDiv(sum("loan"), sum("price")) * 100,
    equity: sum("equity"),
    noi1: sum("noi1"),
    goingInCap: safeDiv(sum("noi1"), sum("price")) * 100,
    exitNOI: sum("exitNOI"),
    exitValue: sum("exitValue"),
    exitCap: safeDiv(sum("exitNOI"), sum("exitValue")) * 100,
    exitPSF: safeDiv(sum("exitValue"), sum("sf")),
    irr: xirr(rows.flatMap((x) => x.flows)) * 100, // pooled, on dated flows
    em: safeDiv(sum("distributions"), sum("equity")),
    coc1: NaN,
    dscr1: NaN,
    valuation: valued.length
      ? {
          quarterEnd: val.lastQ,
          value: vsum("value"),
          nav: vsum("nav"),
          unrealized: vsum("unrealized"),
          tvpi: safeDiv(vsum("dist") + vsum("nav"), vsum("contrib")),
          count: valued.length,
        }
      : null,
  };
  return { rows, totals, lastQ: val.lastQ };
}

const n = (v, d = 0) => (v == null || !isFinite(v) ? "" : Number(v.toFixed(d)));

export function assetSummaryXlsx(summary, fundName) {
  const header = [
    "Asset", "Location", "Property manager", "Status", "Acquired", "Exit", "Hold (yrs)", "SF", "Units", "Leased units", "Occupancy %", "Vacancy %", "WALT (yrs)", "Purchase price", "Price / SF", "Loan", "Loan / price %", "Sized by", "Sizing cushion %", "Equity",
    "Funding", "Year-1 NOI", "NOI growth %", "Going-in cap %", "Exit cap %", "Exit value", "Exit $/SF",
    "Underwritten IRR %", "Equity multiple", "Year-1 CoC %", "Year-1 DSCR",
    "Valuation quarter", "Fair value", "Valuation basis", "Equity NAV", "Unrealized gain", "Interim TVPI",
  ];
  const row = (x, total = false) => [
    total ? `${fundName} — total (${x.count} assets)` : x.name,
    total ? "" : x.location,
    total ? "" : x.propertyManager ?? "",
    total ? `${x.owned} owned · ${x.pipeline} pipeline · ${x.sold} sold` : x.status,
    total ? "" : x.acq, total ? "" : x.exit, total ? "" : x.holdYears,
    n(x.sf), n(x.units), x.leased ?? "", n(x.occupancyPct, 1), n(x.vacancyPct, 1), n(x.walt, 1), n(x.price), n(x.pricePSF, 2), n(x.loan), n(x.ltv, 1), total ? "" : x.sizing.binding, total ? "" : n(x.sizing.cushionPct, 1), n(x.equity),
    total ? "" : x.funding.label, n(x.noi1), total ? "" : n(x.noiGrowth, 1), n(x.goingInCap, 2), n(x.exitCap, 2), n(x.exitValue), n(x.exitPSF, 2),
    n(x.irr, 2), n(x.em, 3), total ? "" : n(x.coc1, 2), total ? "" : n(x.dscr1, 2),
    x.valuation?.quarterEnd ?? "", n(x.valuation?.value), total ? "" : x.valuation?.basis ?? "", n(x.valuation?.nav), n(x.valuation?.unrealized), n(x.valuation?.tvpi, 3),
  ];
  return writeXlsx([header, ...summary.rows.map((x) => row(x)), row(summary.totals, true)], {
    sheetName: "Asset summary",
    colWidths: header.map((h, i) => (i === 0 ? 30 : Math.max(11, Math.min(20, h.length + 2)))),
  });
}
