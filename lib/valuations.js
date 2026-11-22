// ─── Fair value: quarterly marks, NAV and interim returns ────────────────────
// Each asset is marked at every calendar quarter end it is held (from its
// acquisition quarter to the quarter before it is sold):
//   - Acquisition quarter: at cost (purchase price + capex budget).
//   - Q2 and Q4: independent appraisal, entered or imported by the user. A
//     past Q2/Q4 with no appraisal is "overdue" and carried at the roll-forward
//     value until one is entered.
//   - Q1 and Q3: internal mark = the last mark rolled forward, plus any capex
//     added since. Any quarter can be overridden with an entered value.
// Asset NAV (equity value) = fair value − loan balance + the asset's cash
// reserve. Interim returns treat NAV as the ending value: IRR on the asset's
// actual dated cash flows to date plus NAV; TVPI = (distributions + NAV) ÷
// contributions; DPI = distributions ÷ contributions; RVPI = NAV ÷
// contributions. Only completed quarters (ending on or before today) are
// valued; later quarters appear only on the appraisal schedule.
// Fund net LP returns assume a hypothetical liquidation at NAV (less the
// subscription line balance) run through the fund waterfall.

import { underwrite } from "@/lib/calculations";
import {
  DEFAULT_FUND,
  acquisitionDate,
  addYears,
  assetQuarterlyEvents,
  computeDatedWaterfall,
  exitDate,
  fundDates,
  parseDate,
  quarterKey,
  toISO,
  xirr,
} from "@/lib/fundTimeline";
import { applySubLine } from "@/lib/subLine";
import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";
import { parseCSV } from "@/lib/fundTerms";

const DAY = 86_400_000;

// ── Quarter helpers (ISO dates) ──
export function quarterEnd(iso) {
  const d = parseDate(iso);
  const qEndMonth = Math.floor(d.getUTCMonth() / 3) * 3 + 2;
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), qEndMonth + 1, 0)));
}
const nextQuarterEnd = (qEnd) => quarterEnd(toISO(new Date(parseDate(qEnd).getTime() + DAY)));
export const isAppraisalQuarter = (qEnd) => [6, 12].includes(parseDate(qEnd).getUTCMonth() + 1);
// Latest quarter end on or before today.
export function lastCompletedQuarterEnd(todayISO) {
  const qe = quarterEnd(todayISO);
  if (qe === todayISO) return qe;
  const d = parseDate(todayISO);
  const qStart = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
  return toISO(new Date(qStart - DAY));
}
export const quarterLabel = (qEnd) => quarterKey(qEnd).replace("-", " ");

// Appraisals are expected within this many days after quarter end; after
// that a missing one is "overdue".
export const DUE_DAYS = 60;
const addDaysISO = (iso, n) => toISO(new Date(parseDate(iso).getTime() + n * DAY));
// Interim IRRs over less than a year annualize noise; flag them.
export const MIN_IRR_YEARS = 1;

const lastOnOrBefore = (hist, iso, key) => {
  let v = 0;
  for (const h of hist) {
    if (h.date > iso) break;
    v = h[key];
  }
  return v;
};

function sumFlows(events) {
  let contrib = 0, dist = 0;
  for (const e of events) {
    if (e.amount < 0) contrib -= e.amount;
    else dist += e.amount;
  }
  return { contrib, dist };
}

function interim(events, navDate, nav) {
  const { contrib, dist } = sumFlows(events);
  const flows = [...events.map((e) => ({ date: e.date, amount: e.amount })), { date: navDate, amount: nav }];
  return {
    contrib,
    dist,
    irr: xirr(flows) * 100,
    tvpi: contrib > 0 ? (dist + nav) / contrib : NaN,
    dpi: contrib > 0 ? dist / contrib : NaN,
    rvpi: contrib > 0 ? nav / contrib : NaN,
  };
}

export function distributionPolicy(terms) {
  return (terms.distributionPolicy ?? "reserve") === "payout"
    ? { mode: "payout", payoutPct: terms.incomePayoutPct ?? 100 }
    : { mode: "reserve", reserveYears: terms.reserveYears ?? 1 };
}

// ── One asset ──
// deal: a fund deal snapshot ({ id, inputs, irrFlows, opFlows, reversion,
// reserveBasis }); marks: { [quarterEndISO]: { value, source, appraiser,
// capRate, capex, notes } }.
export function assetValuation(deal, marks = {}, { todayISO, fund = DEFAULT_FUND, policy } = {}) {
  const r = underwrite(deal.inputs);
  const cfs = r.annualCashFlows;
  const acq = acquisitionDate(deal, fund);
  const exit = exitDate(deal, fund);
  const lastQ = lastCompletedQuarterEnd(todayISO);
  const aq = assetQuarterlyEvents(deal, fund, policy);
  const sf = deal.inputs.squareFootage ?? 0;
  const costBasis = (deal.inputs.purchasePrice ?? 0) + (deal.inputs.capexBudget ?? 0);
  const acqQ = quarterEnd(acq);

  const rows = [];
  const schedule = [];
  let rollBase = costBasis;
  let cost = costBasis;
  let lastAppraisal = null;
  for (let q = acqQ; q < exit; q = nextQuarterEnd(q)) {
    const isAcqQ = q === acqQ;
    const appraisalQ = isAppraisalQuarter(q) && !isAcqQ;
    const mark = marks[q] ?? {};
    const hasValue = mark.value > 0;
    const isAppraisal = hasValue && (mark.source ?? (appraisalQ ? "appraisal" : "internal")) === "appraisal";

    if (appraisalQ || isAppraisal) {
      schedule.push({
        quarterEnd: q,
        status: isAppraisal ? "done" : q > todayISO ? "upcoming" : todayISO <= addDaysISO(q, DUE_DAYS) ? "due" : "overdue",
        dueBy: addDaysISO(q, DUE_DAYS),
        appraiser: isAppraisal ? mark.appraiser ?? "" : "",
        value: isAppraisal ? mark.value : null,
      });
    }
    if (q > lastQ) continue; // future: schedule only

    const capex = Number(mark.capex) || 0;
    cost += capex;
    let value, basis;
    if (hasValue) {
      value = mark.value;
      basis = isAppraisal ? "appraisal" : "internal";
    } else {
      value = rollBase + capex;
      basis = lastAppraisal || rows.length ? "rollforward" : "cost";
      if (isAcqQ) basis = "cost";
    }
    rollBase = value;
    if (isAppraisal) lastAppraisal = { quarterEnd: q, value, capRate: mark.capRate, appraiser: mark.appraiser };

    // Hold year containing the quarter end (1-based) and the balance then.
    let y = 1;
    while (y < cfs.length && addYears(acq, y) <= q) y++;
    const debt = y === 1 ? r.debt.loanAmount : cfs[y - 2]?.loanBalance ?? r.debt.loanAmount;
    const reserve = lastOnOrBefore(aq.reserveHistory ?? [], q, "reserve");
    const nav = value - debt + reserve;
    const fwdNOI = cfs[y - 1]?.noi ?? 0;
    const events = aq.events.filter((e) => e.date <= q);
    const ret = interim(events, q, nav);

    rows.push({
      quarterEnd: q,
      appraisalQuarter: appraisalQ,
      overdue: appraisalQ && !isAppraisal && todayISO > addDaysISO(q, DUE_DAYS),
      appraisalPending: appraisalQ && !isAppraisal,
      basis, // "appraisal" | "internal" | "rollforward" | "cost"
      mark,
      value,
      cost,
      unrealized: value - cost,
      psf: sf > 0 ? value / sf : NaN,
      impliedCap: value > 0 ? (fwdNOI / value) * 100 : NaN,
      fwdNOI,
      debt,
      reserve,
      nav,
      lastAppraisal,
      yearsHeld: (parseDate(q).getTime() - parseDate(acq).getTime()) / DAY / 365,
      ...ret,
    });
  }

  return {
    id: deal.id,
    name: deal.inputs.propertyName || "Unnamed deal",
    acq,
    exit,
    sf,
    costBasis,
    equity: r.debt.equityRequired,
    rows,
    byQuarter: new Map(rows.map((row) => [row.quarterEnd, row])),
    schedule,
    events: aq.events,
  };
}

// ── Fund ──
export function fundValuation(deals, marksById, terms, { todayISO, curve } = {}) {
  const fund = terms;
  const fd = fundDates(fund);
  const policy = distributionPolicy(terms);
  const assets = deals.map((d) => assetValuation(d, marksById[d.id] ?? {}, { todayISO, fund, policy }));
  const lastQ = lastCompletedQuarterEnd(todayISO);

  const allEvents = assets.flatMap((a) => a.events);
  const subLine = applySubLine(allEvents, {
    line: {
      enabled: terms.subLineEnabled !== false,
      sizePct: terms.subLineSizePct,
      spreadPct: terms.subLineSpreadPct,
      unusedFeePct: terms.subLineUnusedFeePct,
      maxDays: terms.subLineMaxDays,
    },
    commitments: terms.targetEquity ?? 0,
    finalClose: terms.finalClose,
    investmentPeriodEnd: fd.investmentPeriodEnd,
    curve,
  });
  const lineAt = (iso) => (subLine.stats ? subLine.stats.balanceAt(iso) : 0);
  const wfConfig = {
    lpEquityPct: 100 - (terms.gpCommitPct ?? 5),
    preferredReturnPct: terms.prefPct,
    catchUpGpPct: terms.catchUpGpPct,
    tiers: terms.tiers,
    mgmtFeePct: terms.mgmtFeePct,
    incomeTreatment: terms.incomeTreatment ?? "prefThenROC",
    feeStartISO: terms.finalClose,
  };

  const firstQ = assets.length ? assets.map((a) => quarterEnd(a.acq)).sort()[0] : null;
  const firstCall = assets.length ? assets.map((a) => a.acq).sort()[0] : null;
  const quarters = [];
  for (let q = firstQ; q && q <= lastQ; q = nextQuarterEnd(q)) {
    const held = assets.map((a) => a.byQuarter.get(q)).filter(Boolean);
    const gav = held.reduce((s, x) => s + x.value, 0);
    const debt = held.reduce((s, x) => s + x.debt, 0);
    const reserves = held.reduce((s, x) => s + x.reserve, 0);
    const nav = gav - debt + reserves;
    const gross = interim(allEvents.filter((e) => e.date <= q), q, nav);

    // Net LP: hypothetical liquidation at NAV less the sub line balance.
    const line = lineAt(q);
    const liq = nav - line;
    const lineEvents = subLine.events.filter((e) => e.date <= q);
    const wf = computeDatedWaterfall(
      [...lineEvents, { date: q, amount: liq, kind: liq >= 0 ? "capital" : "call" }],
      wfConfig
    );
    const liqRow = wf.ledger.filter((row) => row.date === q && row.kind === (liq >= 0 ? "capital" : "call"));
    const liqLp = liqRow.reduce((s, row) => s + row.lp, 0);
    // If NAV wouldn't repay the line, the shortfall is an LP call, not NAV.
    const lpNav = Math.max(0, liqLp);
    const lpContrib = wf.lpEquity - (liqLp < 0 ? -liqLp : 0);
    const lpDist = wf.lpTotalDistributions - lpNav;
    // Net LP figures mean little until LPs have funded capital (purchases
    // drawn on the sub line are not yet called).
    const netNm = !(lpContrib > 1) ? "LPs haven't funded capital yet (purchases are on the sub line)" : null;

    quarters.push({
      quarterEnd: q,
      assets: held.length,
      gav,
      debt,
      reserves,
      nav,
      lineBalance: line,
      gross,
      net: {
        nm: netNm,
        lpNav,
        contrib: lpContrib,
        dist: lpDist,
        irr: netNm ? NaN : wf.lpIRR,
        tvpi: lpContrib > 0 ? (lpDist + lpNav) / lpContrib : NaN,
        dpi: lpContrib > 0 ? lpDist / lpContrib : NaN,
        rvpi: lpContrib > 0 ? lpNav / lpContrib : NaN,
      },
      yearsSinceFirstCall: (parseDate(q).getTime() - parseDate(firstCall).getTime()) / DAY / 365,
    });
  }

  const schedule = assets
    .flatMap((a) => a.schedule.map((s) => ({ ...s, assetId: a.id, asset: a.name })))
    .sort((x, y) => (x.quarterEnd < y.quarterEnd ? -1 : x.quarterEnd > y.quarterEnd ? 1 : x.asset.localeCompare(y.asset)));

  return { assets, quarters, schedule, lastQ };
}

// ── Import / export ──
export const MARK_COLUMNS = [
  { key: "asset", label: "Asset", synonyms: ["asset", "property", "property name", "asset name", "name"] },
  { key: "date", label: "Quarter end", synonyms: ["quarter end", "valuation date", "date", "as of", "as of date", "quarter"] },
  { key: "value", label: "Fair value ($)", synonyms: ["fair value", "value", "appraised value", "market value", "fair value $"] },
  { key: "source", label: "Source (Appraisal / Internal)", synonyms: ["source", "type", "valuation type", "source appraisal / internal"] },
  { key: "appraiser", label: "Appraiser", synonyms: ["appraiser", "appraisal firm", "valuer"] },
  { key: "capRate", label: "Cap rate (%)", synonyms: ["cap rate", "cap rate %", "direct cap rate", "going-in cap"] },
  { key: "capex", label: "Capex since last mark ($)", synonyms: ["capex since last mark", "capex", "capex since last mark $", "capital expenditures"] },
  { key: "notes", label: "Notes", synonyms: ["notes", "comments", "comment"] },
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s_]+/g, " ").replace(/[()]/g, "").trim();
const num = (v) => {
  const s = String(v ?? "").trim();
  if (!s || /^(n\/a|na|-|—)$/i.test(s)) return null;
  const n = parseFloat(s.replace(/[$,%\s]/g, ""));
  return isFinite(n) ? n : null;
};
function toDate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{4})\s*-?\s*q([1-4])$/i) || s.match(/^q([1-4])\s*-?\s*(\d{4})$/i);
  if (m) {
    const [y, qn] = /^\d{4}/.test(m[1]) ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
    return toISO(new Date(Date.UTC(y, qn * 3, 0)));
  }
  const n = Number(s);
  if (n > 20000 && n < 80000) return toISO(new Date(Date.UTC(1899, 11, 30) + n * DAY));
  return null;
}

export async function gridFromMarksFile(file) {
  if (/\.xlsx$/i.test(file.name)) return readXlsxGrid(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files aren't supported. Save as .xlsx or CSV and try again.");
  return parseCSV(await file.text());
}

// Returns { updates: { [dealId]: { [qEnd]: mark } }, count, unmatched: [names], skipped }
export function marksFromGrid(grid, deals) {
  let headerRow = -1, idx = {};
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const h = (grid[r] ?? []).map(norm);
    const found = {};
    for (const c of MARK_COLUMNS) {
      const i = h.findIndex((x) => c.synonyms.includes(x));
      if (i >= 0) found[c.key] = i;
    }
    if (found.asset != null && found.value != null && found.date != null) {
      headerRow = r;
      idx = found;
      break;
    }
  }
  if (headerRow < 0) throw new Error("Couldn't find the Asset, Quarter end and Fair value columns. Use the template.");
  const byName = new Map(deals.map((d) => [norm(d.inputs.propertyName), d.id]));
  const updates = {};
  const unmatched = new Set();
  let count = 0, skipped = 0;
  for (const row of grid.slice(headerRow + 1)) {
    if (!row?.some((v) => String(v ?? "").trim())) continue;
    const get = (k) => (idx[k] != null ? row[idx[k]] : "");
    const name = String(get("asset")).trim();
    const id = byName.get(norm(name));
    const date = toDate(get("date"));
    const value = num(get("value"));
    if (!id) { if (name) unmatched.add(name); continue; }
    if (!date || !(value > 0)) { skipped++; continue; }
    const q = quarterEnd(date);
    const src = norm(get("source"));
    updates[id] = updates[id] ?? {};
    updates[id][q] = {
      value,
      source: src.startsWith("int") ? "internal" : src.startsWith("app") || src.startsWith("ind") ? "appraisal" : isAppraisalQuarter(q) ? "appraisal" : "internal",
      appraiser: String(get("appraiser") ?? "").trim(),
      capRate: num(get("capRate")),
      capex: num(get("capex")) ?? 0,
      notes: String(get("notes") ?? "").trim(),
    };
    count++;
  }
  return { updates, count, unmatched: [...unmatched], skipped };
}

// Blank template listing each asset's appraisal quarters to date.
export function marksTemplateXlsx(valuation) {
  const header = MARK_COLUMNS.map((c) => c.label);
  const rows = valuation
    ? valuation.assets.flatMap((a) =>
        a.rows.map((r) => [a.name, r.quarterEnd, "", r.appraisalQuarter ? "Appraisal" : "Internal", "", "", "", ""])
      )
    : [];
  return writeXlsx([header, ...rows], { sheetName: "Valuation marks", colWidths: header.map((h) => Math.max(14, h.length + 2)) });
}

// Full history: entered marks (re-importable columns first) plus computed fields.
export function valuationHistoryXlsx(valuation) {
  const header = [
    ...MARK_COLUMNS.map((c) => c.label),
    "Basis used", "Cost basis ($)", "Unrealized gain ($)", "Value / SF ($)", "Implied cap (%)",
    "Loan balance ($)", "Cash reserve ($)", "Equity NAV ($)", "Contributions ($)", "Distributions ($)",
    "Interim IRR (%)", "TVPI", "DPI", "RVPI",
  ];
  const rnd = (n, d = 0) => (isFinite(n) ? Number(n.toFixed(d)) : "");
  const rows = valuation.assets.flatMap((a) =>
    a.rows.map((r) => [
      a.name,
      r.quarterEnd,
      rnd(r.value),
      r.basis === "appraisal" ? "Appraisal" : "Internal",
      r.mark.appraiser ?? "",
      r.mark.capRate ?? "",
      r.mark.capex ?? "",
      r.mark.notes ?? "",
      { appraisal: "Appraisal", internal: "Internal (entered)", rollforward: r.overdue ? "Roll-forward (appraisal overdue)" : "Roll-forward", cost: "Cost" }[r.basis],
      rnd(r.cost), rnd(r.unrealized), rnd(r.psf, 2), rnd(r.impliedCap, 2),
      rnd(r.debt), rnd(r.reserve), rnd(r.nav), rnd(r.contrib), rnd(r.dist),
      rnd(r.irr, 2), rnd(r.tvpi, 3), rnd(r.dpi, 3), rnd(r.rvpi, 3),
    ])
  );
  const fundHeader = ["Quarter end", "Assets", "Gross asset value", "Debt", "Cash reserves", "Fund NAV", "Sub line balance",
    "Gross IRR (%)", "Gross TVPI", "Gross DPI", "LP NAV", "Net LP IRR (%)", "Net LP TVPI", "Net LP DPI"];
  const fundRows = valuation.quarters.map((q) => [
    q.quarterEnd, q.assets, rnd(q.gav), rnd(q.debt), rnd(q.reserves), rnd(q.nav), rnd(q.lineBalance),
    rnd(q.gross.irr, 2), rnd(q.gross.tvpi, 3), rnd(q.gross.dpi, 3), rnd(q.net.lpNav), rnd(q.net.irr, 2), rnd(q.net.tvpi, 3), rnd(q.net.dpi, 3),
  ]);
  return writeXlsx(
    [header, ...rows, [], ["Fund by quarter"], fundHeader, ...fundRows],
    { sheetName: "Valuation history", colWidths: header.map((h) => Math.max(12, Math.min(28, h.length + 2))) }
  );
}
