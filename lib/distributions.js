// ─── Phase X: Distribution Analysis ──────────────────────────────────────────
// A model for each quarter's fund distribution (designed with the user 11/23).
//
// Distributable cash for a fund and quarter Q (quarter end qEnd):
//   each asset:  cash balance (Yardi upload or entered by hand; when an asset
//                has no balance for Q, the model's projected operating cash for
//                Q, labelled "projected, no balance entered")
//                − lender-required reserves and committed TI / capex not yet
//                  paid (entered per asset)
//                − working-capital minimum: 3 months of the asset's projected
//                  operating expenses (the model, hold year containing Q)
//                → asset distributable (never below 0)
//   fund:        fund cash (entered, else the model's projected fund cash)
//                − 6 months of projected fund expenses (management fee and
//                  sub line costs, the next two quarters of the model)
//                → fund excess (never below 0)
//   sub line:    repayment the term sheet requires before a distribution:
//                "none", "clean-down" (repay the balance outstanding at qEnd)
//                or "fixed" (an amount)
//   distributable = Σ asset distributable + fund excess − sub line repayment
//
// The distribution chosen (amount or % of distributable) splits LP / GP by the
// LPA: the fund's waterfall and income treatment, run on the fund's events
// before Q with the distribution added as income at qEnd.
// Yield: annualized LP distribution ÷ LP contributed capital, and ÷ LP NAV.
// History: the last 4 quarters of recorded distributions (capital activity
// type "distribution"), each quarter's yield and the trailing-12-month yield.

import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears, assetQuarterlyEvents, computeDatedWaterfall, fundDates, parseDate, quarterKey, toISO } from "@/lib/fundTimeline";
import { fundLpEvents } from "@/lib/fundFlows";
import { distPolicy, waterfallConfig } from "@/lib/fundPlan";
import { readXlsxGrid } from "@/lib/xlsx";

export const WC_MONTHS = 3;
export const FUND_MONTHS = 6;
export const SUB_LINE_RULES = [
  ["none", "No repayment required before a distribution"],
  ["clean-down", "Repay the balance outstanding first (clean-down)"],
  ["fixed", "Repay a fixed amount first"],
];

const num = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

export function quarterEndOf(iso) {
  const d = parseDate(iso);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 0)));
}
export function quarterStartOf(qEnd) {
  const d = parseDate(qEnd);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1)));
}
export function prevQuarterEnd(qEnd) {
  const d = parseDate(qEnd);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 0)));
}

// Hold year (1-based) containing a date.
function holdYear(acq, iso) {
  let t = 1;
  while (addYears(acq, t) < iso) t++;
  return t;
}

// One asset for quarter Q. entry: { balance, reserves, committed, source, asOf }
export function assetDistributable(deal, fund, qEnd, entry = {}, policy = distPolicy(fund)) {
  const acq = acquisitionDate(deal, fund);
  const n = (deal.irrFlows?.length ?? 1) - 1;
  const exit = addYears(acq, n);
  const name = deal.inputs?.propertyName || deal.id;
  if (acq > qEnd) return { id: deal.id, name, status: "not yet acquired" };
  if (exit < quarterStartOf(qEnd)) return { id: deal.id, name, status: "sold" };
  const q = assetQuarterlyEvents(deal, fund, policy);
  const projected = sum(q.gross.filter((g, i) => i > 0 && i < q.gross.length - 1 && g.date === qEnd).map((g) => g.amount));
  let wc = 0;
  try {
    const r = underwrite({ ...deal.inputs, holdPeriodYears: Math.max(1, n) });
    const t = Math.min(holdYear(acq, qEnd), r.annualCashFlows.length);
    wc = ((r.annualCashFlows[t - 1]?.operatingExpenses ?? 0) * WC_MONTHS) / 12;
  } catch {
    wc = 0;
  }
  const actual = num(entry.balance);
  const balance = actual ?? projected;
  const reserves = num(entry.reserves) ?? 0;
  const committed = num(entry.committed) ?? 0;
  const distributable = Math.max(0, balance - reserves - committed - wc);
  return {
    id: deal.id,
    name,
    status: "held",
    source: actual != null ? entry.source ?? "manual" : "projected",
    balance,
    projected,
    reserves,
    committed,
    wc,
    distributable,
  };
}

// The fund's flows (model, or capital activity when entered) for fund cash,
// fund expenses and the sub line balance.
function fundFlows(deals, terms, { todayISO, curve }) {
  const fd = fundDates(terms);
  const policy = distPolicy(terms);
  const events = deals.filter((d) => Array.isArray(d.irrFlows) && d.irrFlows.length > 1).flatMap((d) => assetQuarterlyEvents(d, terms, policy).events);
  const flows = fundLpEvents(events, terms, { todayISO, curve, investmentPeriodEnd: fd.investmentPeriodEnd });
  return { flows, events };
}

// Fund expenses projected for the quarters after qEnd (fee + sub line costs).
export function fundExpenseNext(periods = [], qEnd, months = FUND_MONTHS) {
  const after = periods.filter((p) => p.quarter > qEnd).slice(0, Math.round(months / 3));
  return sum(after.map((p) => (p.fee ?? 0) + (p.lineInterest ?? 0) + (p.lineUnused ?? 0) + (p.bridgeInterest ?? 0)));
}

// The whole calculation for a fund and quarter.
// dist: terms.distributions = { cash: { [qKey]: { [dealId]: entry } },
//   fundCash: { [qKey]: amount }, subLine: { rule, amount } }
export function distributable(deals, terms, qEnd, { todayISO, curve } = {}) {
  const store = terms.distributions ?? {};
  const qk = quarterKey(qEnd);
  const cash = store.cash?.[qk] ?? {};
  const assets = deals.map((d) => assetDistributable(d, terms, qEnd, cash[d.id] ?? {}));
  const held = assets.filter((a) => a.status === "held");
  const { flows, events } = fundFlows(deals, terms, { todayISO, curve });
  const periods = flows.expenses?.periods ?? [];
  const projectedFundCash = flows.expenses?.cashAt ? flows.expenses.cashAt(qEnd) : 0;
  const fundCashIn = num(store.fundCash?.[qk]);
  const fundCash = fundCashIn ?? projectedFundCash;
  const fundMin = fundExpenseNext(periods, qEnd);
  const fundExcess = Math.max(0, fundCash - fundMin);
  const lineBalance = flows.lineAt ? Math.max(0, flows.lineAt(qEnd)) : 0;
  const rule = store.subLine?.rule ?? "none";
  const subLineRepay = rule === "clean-down" ? lineBalance : rule === "fixed" ? Math.min(lineBalance, num(store.subLine?.amount) ?? 0) : 0;
  const assetsTotal = sum(held.map((a) => a.distributable));
  const total = Math.max(0, assetsTotal + fundExcess - subLineRepay);
  const actualBal = sum(held.filter((a) => a.source !== "projected").map((a) => a.balance));
  const projBal = sum(held.filter((a) => a.source === "projected").map((a) => a.balance));
  return {
    quarter: qk,
    qEnd,
    assets,
    held,
    assetsTotal,
    fund: { cash: fundCash, cashSource: fundCashIn != null ? "entered" : "projected", min: fundMin, excess: fundExcess },
    subLine: { rule, balance: lineBalance, repay: subLineRepay },
    total,
    split: { actualBalance: actualBal, projectedBalance: projBal, projectedCount: held.filter((a) => a.source === "projected").length },
    events: flows.events,
    flowsMode: flows.mode,
  };
}

// LP / GP split of a distribution at qEnd per the LPA (waterfall terms and
// income treatment), after the fund's events before the quarter.
export function splitDistribution(fundEvents, terms, qEnd, amount) {
  if (!(amount > 0)) return { lp: 0, gp: 0 };
  const start = quarterStartOf(qEnd);
  const before = (fundEvents ?? []).filter((e) => e.date < start);
  const wf = computeDatedWaterfall([...before, { date: qEnd, amount, kind: "income" }], waterfallConfig(terms));
  const rows = wf.ledger.filter((r) => r.date === qEnd && r.kind === "income");
  const lp = sum(rows.map((r) => r.lp));
  const gp = sum(rows.map((r) => r.gp));
  const held = sum(rows.map((r) => r.held ?? 0));
  return { lp, gp, held };
}

// Distribution chosen: { mode: "amount" | "pct", value }.
export function chooseDistribution(calc, terms, choice = {}) {
  const v = num(choice.value) ?? 100;
  const amount = Math.max(0, Math.min(calc.total, choice.mode === "amount" ? v : (calc.total * v) / 100));
  const s = splitDistribution(calc.events, terms, calc.qEnd, amount);
  return { amount, lp: s.lp, gp: s.gp, heldBack: s.held ?? 0, retained: calc.total - amount };
}

// Annualized yield on LP contributed capital and on LP NAV.
export function yields(lpAmount, { lpContributed, lpNav } = {}) {
  return {
    onContributed: lpContributed > 0 ? ((lpAmount * 4) / lpContributed) * 100 : null,
    onNav: lpNav > 0 ? ((lpAmount * 4) / lpNav) * 100 : null,
  };
}

// The last 4 quarters of recorded distributions before qEnd (capital
// activity type "distribution"; LP share by the GP commitment %).
export function history(activity = [], qEnd, { lpContributed, gpCommitPct = 5 } = {}) {
  const out = [];
  let q = prevQuarterEnd(qEnd);
  for (let i = 0; i < 4; i++) {
    const start = quarterStartOf(q);
    const amt = sum((activity ?? []).filter((a) => a.type === "distribution" && a.date >= start && a.date <= q).map((a) => Number(a.amount) || 0));
    const lpAmt = amt * (1 - gpCommitPct / 100);
    out.unshift({ quarter: quarterKey(q), qEnd: q, amount: amt, yield: lpContributed > 0 ? ((lpAmt * 4) / lpContributed) * 100 : null });
    q = prevQuarterEnd(q);
  }
  const ttm = sum(out.map((h) => h.amount));
  return { quarters: out, ttm, ttmYield: lpContributed > 0 ? ((ttm * (1 - gpCommitPct / 100)) / lpContributed) * 100 : null };
}

// ── Yardi cash balances ─────────────────────────────────────────────────────
// A cash / bank balance report: one row per property with its code or name and
// the balance. Columns found by name; properties matched to deals by Yardi
// code or name (case-insensitive), and remembered in the mapping.
export function parseCashReport(grid, deals, mapping = {}) {
  const low = (s) => String(s ?? "").toLowerCase().trim();
  const hi = grid.findIndex((r) => r.some((c) => /balance|cash/i.test(String(c))) && r.some((c) => /property|code|entity/i.test(String(c))));
  if (hi < 0) return { rows: [], unmatched: [], error: "No header row with a property column and a balance column." };
  const h = grid[hi].map(low);
  const ci = (re) => h.findIndex((c) => re.test(c));
  const cCode = ci(/^(property|prop)\s*(code|id)?$|^code$|entity/);
  const cName = ci(/property name|^name$|description/);
  const cBal = ci(/ending balance|balance|cash/);
  const cDate = ci(/as of|date|period/);
  const rows = [];
  const unmatched = [];
  const map = { ...(mapping ?? {}) };
  for (const r of grid.slice(hi + 1)) {
    const code = String(r[cCode] ?? "").trim();
    const name = cName >= 0 ? String(r[cName] ?? "").trim() : "";
    const bal = Number(String(r[cBal] ?? "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
    if (!code && !name) continue;
    if (/total/i.test(code) || /total/i.test(name)) continue;
    if (!isFinite(bal)) continue;
    const key = code || name;
    let id = map[key];
    if (!id) {
      const d = deals.find((x) => low(x.inputs?.yardiCode) && low(x.inputs.yardiCode) === low(code)) ?? deals.find((x) => low(x.inputs?.propertyName) === low(name || code));
      if (d) id = map[key] = d.id;
    }
    if (id) rows.push({ key, dealId: id, balance: bal, asOf: cDate >= 0 ? String(r[cDate] ?? "") : "" });
    else unmatched.push({ key, balance: bal });
  }
  return { rows, unmatched, mapping: map };
}

// "09/30/2026", "2026-09-30" or an Excel serial → ISO date; else null.
export function isoFromReportDate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (/^\d{5}$/.test(s)) return toISO(new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000));
  return null;
}

export async function cashReportFromFile(file, deals, mapping) {
  const buf = await file.arrayBuffer();
  let grid;
  if (/\.csv$/i.test(file.name)) {
    grid = new TextDecoder().decode(buf).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')));
  } else {
    grid = await readXlsxGrid(buf);
  }
  return parseCashReport(grid, deals, mapping);
}

// Excel rows.
export function distributionXlsx(fundName, calc, choice, y, hist) {
  return [
    [`${fundName}: distribution analysis, ${calc.quarter.replace("-", " ")}`],
    [],
    ["Asset", "Cash", "Source", "Reserves", "Committed TI / capex", `Working capital (${WC_MONTHS} months)`, "Distributable"],
    ...calc.held.map((a) => [a.name, a.balance, a.source === "projected" ? "projected, no balance entered" : a.source, a.reserves, a.committed, a.wc, a.distributable]),
    ["Assets total", "", "", "", "", "", calc.assetsTotal],
    [],
    ["Fund cash", calc.fund.cash, calc.fund.cashSource],
    [`Fund minimum (${FUND_MONTHS} months of fund expenses)`, calc.fund.min],
    ["Fund excess", calc.fund.excess],
    ["Sub line repayment", calc.subLine.repay, calc.subLine.rule],
    ["Distributable cash", calc.total],
    ["Of which cash balances: actual", calc.split.actualBalance],
    ["Of which cash balances: projected", calc.split.projectedBalance],
    [],
    ["Distribution", choice.amount],
    ["LP", choice.lp],
    ["GP", choice.gp],
    ["Retained", choice.retained],
    ["Annualized yield on LP contributed capital (%)", y.onContributed],
    ["Annualized yield on LP NAV (%)", y.onNav],
    [],
    ["Quarter", "Distributed", "Annualized yield (%)"],
    ...hist.quarters.map((h) => [h.quarter.replace("-", " "), h.amount, h.yield]),
    ["Trailing 12 months", hist.ttm, hist.ttmYield],
  ];
}
