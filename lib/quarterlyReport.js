// ─── Phase L: quarterly performance report ───────────────────────────────────
// One set of figures, two versions:
//   shareable  for the investor portal (Juniper) or investors: fund summary,
//              net and gross returns since inception, the quarter's NAV
//              movement, capital called and distributed, the portfolio, a page
//              per asset, plan vs. actual (phase K), debt, and the letter.
//   internal   the same plus underwritten vs. actual by asset (phase J),
//              budget variances with comments (phase I) and internal notes.
// A report is built from the app's figures, then issued: the figures are
// frozen with who and when (terms.reports.issued) and never change. The app
// never sends anything; the user uploads it.

import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears, quarterKey } from "@/lib/fundTimeline";
import { fundValuation, quarterLabel } from "@/lib/valuations";
import { kpiActuals, milestoneStatus, varianceReport } from "@/lib/businessPlan";
import { fundRows, rentRollOccupancy } from "@/lib/uwActual";
import { fundProjection, planCompare } from "@/lib/fundPlan";
import { fundType } from "@/lib/fundTypes";
import { checkLimits, limitInputs } from "@/lib/fundLimits";

export const REPORT_KINDS = [
  ["shareable", "Shareable (investors and the portal)"],
  ["internal", "Internal"],
];

const fin = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const sum = (xs) => xs.reduce((s, x) => s + (fin(x) ?? 0), 0);

function priorQuarterEnd(qEnd) {
  const d = new Date(`${qEnd}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 0)).toISOString().slice(0, 10);
}

// deals: the fund's deals (snapshots with irrFlows and inputs).
export function buildQuarterlyReport(deals, terms, marks, { qEnd, todayISO, curve, kind = "shareable" } = {}) {
  const val = fundValuation(deals, marks ?? {}, terms, { todayISO, curve });
  const q = val.quarters.find((x) => x.quarterEnd === qEnd) ?? val.quarters.at(-1) ?? null;
  const qe = q?.quarterEnd ?? qEnd;
  const p = val.quarters.find((x) => x.quarterEnd === priorQuarterEnd(qe)) ?? null;
  const net = q?.net ?? {};
  const lpContrib = fin(net.contrib) ?? 0, lpDist = fin(net.dist) ?? 0;
  const pContrib = fin(p?.net?.contrib) ?? 0, pDist = fin(p?.net?.dist) ?? 0;
  const navStart = fin(p?.net?.lpNav) ?? 0, navEnd = fin(net.lpNav) ?? 0;
  const contributions = lpContrib - pContrib, distributions = lpDist - pDist;
  const valueChange = navEnd - navStart - contributions + distributions;
  const commitments = terms.targetEquity ?? 0;

  const portfolio = [];
  for (const a of val.assets) {
    const deal = deals.find((d) => d.id === a.id);
    const row = a.byQuarter.get(qe);
    if (!deal || !row) continue;
    const inp = deal.inputs;
    const k = kpiActuals(inp, qe);
    const r = underwrite(inp);
    const acq = acquisitionDate(deal, terms);
    const rev = inp.businessPlan?.revisions?.at(-1) ?? null;
    const late = (rev?.plan?.milestones ?? []).filter((m) => milestoneStatus(m, qe) === "late").length;
    portfolio.push({
      id: a.id,
      name: a.name,
      city: [inp.city, inp.state].filter(Boolean).join(", "),
      sf: a.sf,
      acq,
      cost: a.costBasis,
      value: row.value,
      basis: row.basis,
      unrealized: row.value - a.costBasis,
      occupancy: fin(rentRollOccupancy(inp)),
      noiActual: fin(k.noi),
      noiMonths: k.noiMonths,
      noiPlan: fin(r.annualCashFlows[0]?.noi),
      impliedCap: fin(row.impliedCap),
      planRev: rev ? rev.n : null,
      recommendation: rev?.plan?.recommendation ?? "",
      lateMilestones: late,
      loan: r.debt?.loanAmount ?? 0,
      lender: inp.lenderName || "",
      spreadPct: fin(inp.spreadPct),
      maturity: inp.loanTermYears ? addYears(acq, Number(inp.loanTermYears)) : "",
      cover: (inp.assetMedia?.photos ?? []).find((x) => x.cover)?.path ?? (inp.assetMedia?.photos ?? [])[0]?.path ?? null,
    });
  }

  const totalValue = sum(portfolio.map((x) => x.value));
  const totalLoan = sum(portfolio.map((x) => x.loan));
  let plan = null;
  const v1 = terms.fundPlan?.versions?.[0];
  if (v1) {
    const current = fundProjection(deals, terms, { todayISO, curve });
    const cmp = planCompare(v1, current, { called: lpContrib, distributed: lpDist, nav: navEnd, deployed: sum(current.assets.filter((x) => x.acq <= qe).map((x) => x.equity)), acquired: current.assets.filter((x) => x.acq <= qe).length }, qe, { netIrr: terms.fundPlanTargets?.netIrrPct ?? null, tvpi: terms.fundPlanTargets?.netMultiple ?? null, grossIrr: terms.fundPlanTargets?.grossIrrPct ?? null });
    plan = { label: v1.label, at: v1.at, toDate: cmp.toDate, projected: cmp.projected };
  }

  const report = {
    kind,
    quarter: quarterKey(qe),
    quarterLabel: quarterLabel(qe),
    qEnd: qe,
    fund: {
      name: terms.name,
      type: fundType(terms.type),
      finalClose: terms.finalClose,
      termYears: terms.termYears,
      commitments,
      assets: portfolio.length,
      sf: sum(portfolio.map((x) => x.sf)),
    },
    returns: {
      netIrr: net.nm ? null : fin(net.irr),
      tvpi: net.nm ? null : fin(net.tvpi),
      dpi: net.nm ? null : fin(net.dpi),
      rvpi: net.nm ? null : fin(net.rvpi),
      grossIrr: fin(q?.gross?.irr),
      grossTvpi: fin(q?.gross?.tvpi),
      note: net.nm ?? "",
    },
    nav: { start: navStart, contributions, distributions, valueChange, end: navEnd, gav: fin(q?.gav) ?? 0, debt: fin(q?.debt) ?? 0, lineBalance: fin(q?.lineBalance) ?? 0 },
    capital: { commitments, called: lpContrib, distributed: lpDist, pctCalled: commitments > 0 ? (lpContrib / commitments) * 100 : null },
    portfolio,
    plan,
    debt: { total: totalLoan, ltv: totalValue > 0 ? (totalLoan / totalValue) * 100 : null },
  };
  if (kind === "internal") {
    const values = Object.fromEntries(portfolio.map((x) => [x.id, x.value]));
    report.internal = {
      limits: checkLimits(terms, limitInputs(deals.filter((d) => values[d.id] != null), { values, lineBalance: report.nav.lineBalance })),
      uw: fundRows(deals.map((d) => ({ id: d.id, inputs: d.inputs })), qe),
      budget: deals.flatMap((d) => {
        const bp = d.inputs.businessPlan;
        if (!bp?.revisions?.length || !Object.keys(bp.actuals ?? {}).length) return [];
        try {
          const rep = varianceReport(bp, { kind: "ytd", end: qe.slice(0, 7), sf: d.inputs.squareFootage });
          return rep.rows.filter((r) => r.flag).map((r) => ({ asset: d.inputs.propertyName, line: r.label, current: r.current, actual: r.actual, variance: r.variance, variancePct: r.variancePct, flag: r.flag, comment: r.comment ?? "" }));
        } catch {
          return [];
        }
      }),
    };
  }
  return report;
}

const m = (v) => {
  if (v == null || !isFinite(v)) return "n/a";
  const a = Math.abs(v);
  return `${v < 0 ? "-" : ""}$${a >= 1e6 ? `${(a / 1e6).toFixed(1)} million` : Math.round(a).toLocaleString("en-US")}`;
};
const pct = (v) => (v == null || !isFinite(v) ? "n/a" : `${v.toFixed(1)}%`);

// A first draft of the quarterly letter, for the user to edit.
export function draftLetter(r) {
  const leased = r.portfolio.filter((x) => x.occupancy != null);
  const occ = leased.length ? sum(leased.map((x) => (x.occupancy * x.sf) / 100)) / sum(leased.map((x) => x.sf)) * 100 : null;
  const paras = [
    `Dear Investors,`,
    `We are pleased to share ${r.fund.name}'s report for ${r.quarterLabel}. At quarter end the fund owned ${r.fund.assets} asset${r.fund.assets === 1 ? "" : "s"} totalling ${Math.round(r.fund.sf).toLocaleString("en-US")} square feet${occ != null ? `, ${pct(occ)} leased` : ""}.`,
    r.returns.note
      ? `Gross asset value was ${m(r.nav.gav)} at quarter end, with ${m(r.nav.debt)} of property debt.`
      : `LP NAV was ${m(r.nav.end)} at quarter end, from ${m(r.nav.start)} at the start of the quarter: ${m(r.nav.contributions)} of contributions, ${m(r.nav.distributions)} of distributions and a ${r.nav.valueChange >= 0 ? "gain" : "loss"} in value of ${m(Math.abs(r.nav.valueChange))}.`,
    r.returns.note
      ? `Net returns are not yet meaningful: ${r.returns.note}.`
      : `Since inception the fund has returned a net LP IRR of ${pct(r.returns.netIrr)}, with TVPI of ${r.returns.tvpi?.toFixed(2) ?? "n/a"}x and DPI of ${r.returns.dpi?.toFixed(2) ?? "n/a"}x.`,
    `LPs have funded ${m(r.capital.called)}${r.capital.pctCalled != null ? ` (${pct(r.capital.pctCalled)} of commitments)` : ""} and received ${m(r.capital.distributed)} in distributions to date.`,
    `[Add the quarter's highlights: leasing, capital projects, acquisitions or sales, and the outlook.]`,
    `Thank you for your continued support.`,
  ];
  return paras.join("\n\n");
}

// Summary on top of the quarterly report (user, 11/24, like the risk
// report): change vs. last quarter, the reports issued for the quarter and,
// in the internal version only, the risk watch list (never shareable).
// prev: the previous quarter's report (or null); issued: this quarter's
// issued versions; watch: riskReport().watch (or null).
export function occupancyOf(r) {
  const leased = (r?.portfolio ?? []).filter((x) => x.occupancy != null && x.sf > 0);
  const sf = sum(leased.map((x) => x.sf));
  return sf > 0 ? (sum(leased.map((x) => (x.occupancy * x.sf) / 100)) / sf) * 100 : null;
}
const SUMMARY_METRICS = [
  ["LP NAV", "$", (r) => r.nav?.end],
  ["Net LP IRR", "%", (r) => (r.returns?.note ? null : r.returns?.netIrr)],
  ["TVPI", "x", (r) => r.returns?.tvpi],
  ["DPI", "x", (r) => r.returns?.dpi],
  ["LP capital called", "%", (r) => r.capital?.pctCalled],
  ["Occupancy", "%", (r) => occupancyOf(r)],
  ["Loan to value", "%", (r) => r.debt?.ltv],
  ["Assets", "n", (r) => r.fund?.assets],
];
export function quarterSummary(r, prev = null, { issued = [], watch = null } = {}) {
  const change = prev ? SUMMARY_METRICS.map(([label, unit, get]) => {
    const now = fin(get(r)), was = fin(get(prev));
    return { label, unit, now, prev: was, change: now != null && was != null ? now - was : null };
  }) : null;
  const moved = change ? change.filter((c) => c.change != null && Math.abs(c.change) > 1e-9) : [];
  const latest = issued.length ? issued.at(-1) : null;
  return {
    change,
    moved,
    prevLabel: prev?.quarterLabel ?? null,
    issued: { count: issued.length, latest: latest ? { v: latest.v, kind: latest.kind, at: latest.at, by: latest.by } : null },
    watch: r.kind === "internal" && watch ? watch.map((w) => ({ name: w.name, score: w.score, reasons: w.reasons })) : null,
  };
}
export function summaryValue(v, unit) {
  if (v == null) return "n/a";
  if (unit === "$") return m(v);
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  return String(Math.round(v));
}
export function summaryChange(c) {
  if (c.change == null) return "n/a";
  const s = c.change > 0 ? "+" : c.change < 0 ? "-" : "";
  const a = Math.abs(c.change);
  if (c.unit === "$") return `${s}${m(a)}`;
  if (c.unit === "%") return `${s}${a.toFixed(1)} pts`;
  if (c.unit === "x") return `${s}${a.toFixed(2)}x`;
  return `${s}${Math.round(a)}`;
}

// Issued versions on the fund: terms.reports = { issued: [...], drafts: {...} }
export function issueReport(reports, report, { letter = "", notes = "", by = "", at = new Date().toISOString(), summary = null } = {}) {
  const issued = [...(reports?.issued ?? [])];
  const same = issued.filter((x) => x.quarter === report.quarter && x.kind === report.kind).length;
  issued.push(JSON.parse(JSON.stringify({ id: `rep-${report.quarter}-${report.kind}-${same + 1}`, v: same + 1, quarter: report.quarter, kind: report.kind, letter, notes: report.kind === "internal" ? notes : "", by, at, report, ...(summary ? { summary: { ...summary, issued: { count: issued.filter((x) => x.quarter === report.quarter).length + 1, latest: { v: same + 1, kind: report.kind, at, by } } } } : {}) })));
  return { ...(reports ?? {}), issued };
}

function summaryRows(sm) {
  if (!sm) return [];
  const out = [["Summary"]];
  if (sm.watch) out.push(["Watch list (internal)", sm.watch.length, sm.watch.slice(0, 3).map((w) => `${w.name} (${w.score})`).join(", ")]);
  out.push(["Issued reports", sm.issued.count, sm.issued.latest ? `latest v${sm.issued.latest.v} (${sm.issued.latest.kind}) ${String(sm.issued.latest.at).slice(0, 10)}${sm.issued.latest.by ? ` by ${sm.issued.latest.by}` : ""}` : "draft (not issued)"]);
  if (sm.change) out.push([], [`Change vs. last quarter (${sm.prevLabel})`, "Now", "Last quarter", "Change"], ...sm.change.map((c) => [c.label, c.now, c.prev, c.change]));
  else out.push(["Change vs. last quarter", "", "no prior quarter"]);
  if (sm.watch?.length) out.push([], ["Watch list", "Score", "Reasons"], ...sm.watch.map((w) => [w.name, w.score, w.reasons.join("; ")]));
  out.push([]);
  return out;
}

export function reportXlsx(r, { letter = "", notes = "", summary = null } = {}) {
  const rows = [
    [`${r.fund.name}: quarterly report, ${r.quarterLabel}${r.kind === "internal" ? " (internal)" : ""}`],
    [],
    ...summaryRows(summary),
    ["Returns since inception", "Value"],
    ["Net LP IRR (%)", r.returns.netIrr], ["TVPI (x)", r.returns.tvpi], ["DPI (x)", r.returns.dpi], ["RVPI (x)", r.returns.rvpi], ["Gross IRR (%)", r.returns.grossIrr],
    [],
    ["LP NAV movement", "Amount"],
    ["Start of quarter", r.nav.start], ["Contributions", r.nav.contributions], ["Distributions", -r.nav.distributions], ["Change in value", r.nav.valueChange], ["End of quarter", r.nav.end],
    [],
    ["Capital", "Amount"],
    ["Commitments", r.capital.commitments], ["LP capital called", r.capital.called], ["LP distributions", r.capital.distributed],
    [],
    ["Asset", "City", "SF", "Acquired", "Cost", "Value", "Basis", "Occupancy (%)", "NOI actual (annualized)", "NOI plan (year 1)", "Loan", "Lender", "Maturity"],
    ...r.portfolio.map((x) => [x.name, x.city, x.sf, x.acq, x.cost, x.value, x.basis, x.occupancy, x.noiActual, x.noiPlan, x.loan, x.lender, x.maturity]),
  ];
  if (r.plan) rows.push([], ["Plan vs. actual", "Plan", "Actual"], ...r.plan.toDate.map((x) => [x.label, x.plan, x.actual]));
  if (r.internal) {
    rows.push([], ["Underwritten vs. actual", "IRR underwritten", "IRR now", "Gap (pts)"], ...r.internal.uw.map((x) => [x.name, x.uwIrr, x.irr, x.gap]));
    rows.push([], ["Budget variances", "Line", "Budget", "Actual", "Variance", "Comment"], ...r.internal.budget.map((x) => [x.asset, x.line, x.current, x.actual, x.variance, x.comment]));
    if (notes) rows.push([], ["Internal notes"], [notes]);
  }
  if (letter) rows.push([], ["Letter"], ...letter.split(/\n\n/).map((pp) => [pp]));
  return rows;
}
