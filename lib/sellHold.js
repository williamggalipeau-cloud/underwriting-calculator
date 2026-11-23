// ─── Sell / hold analysis ────────────────────────────────────────────────────
// For each asset, on a decision date D, compares:
//   Sell now        — value = year-ahead NOI ÷ cap rate (the asset's exit cap
//                     unless overridden); net proceeds = value − sale costs
//                     (the asset's sale cost %) − loan balance at D.
//   Hold to year n  — the asset's cash flows after D, then a sale at the end of
//                     hold year n (n counted from purchase), also valued on the
//                     year-ahead NOI (year n + 1) ÷ the cap rate, so selling
//                     now and later are valued the same way.
// IRRs over less than a year are not meaningful (NaN, shown as n/m).
//   Refinance, hold — on D a new interest-only loan sized at the lower of LTV
//                     × value and year-ahead NOI ÷ (min DSCR × rate) repays the
//                     old loan; cash-out (after financing costs) is paid out;
//                     debt service after D is the new loan's (forward SOFR +
//                     spread); the sale repays the new loan.
// Forward IRR = IRR of holding, treating today's net sale proceeds as the
// amount re-invested (−proceeds at D, + the cash flows after D). NPV at the
// fund's hurdle rate shows the value of holding over selling. Breakeven exit
// cap = the exit cap at which holding to year n has zero NPV versus selling.
//
// Cash flows come from one long run of the engine (lib/calculations) over the
// longest hold; years are hold years from the acquisition date, and the year
// containing D is split pro rata.

import { underwrite } from "@/lib/calculations";
import { acquisitionDate, addYears, assetQuarterlyEvents, computeDatedWaterfall, fundDates, hurdleStats, parseDate, toISO, xirr, xnpv } from "@/lib/fundTimeline";
import { fundLpEvents } from "@/lib/fundFlows";
import { snapshotDeal } from "@/lib/samplePortfolio";

const YEAR = 365.25 * 86_400_000;
const yearsBetween = (a, b) => (parseDate(b).getTime() - parseDate(a).getTime()) / YEAR;

export const DEFAULT_REFI = { ltvPct: 65, minDscr: 1.25, spreadPct: 2.0, feePct: 1.0, termYears: 5 };
export const DECISIONS = [
  ["base", "Base plan"],
  ["sell", "Sell now"],
  ["hold", "Hold"],
  ["refi", "Refinance & hold"],
];

// Asset analysis. opts: { decisionDate, capRatePct?, refi?, hurdlePct, fund }
export function assetSellHold(deal, { decisionDate, capRatePct, refi = {}, hurdlePct, fund }) {
  const inputs = deal.inputs;
  const acq = acquisitionDate(deal, fund);
  const fd = fundDates(fund);
  const e = yearsBetween(acq, decisionDate);
  const baseHold = Math.max(1, Math.round(inputs.holdPeriodYears ?? deal.irrFlows?.length - 1 ?? 4));
  const maxHold = Math.max(baseHold, Math.floor(yearsBetween(acq, fd.extendedEnd) + 1e-6));
  if (e < 0) return { status: "pipeline", acq, baseHold };
  const k = Math.floor(e);
  const f = e - k;
  const firstHold = k + 1; // earliest hold year a "hold" can end
  if (firstHold > maxHold) return { status: "past-term", acq, baseHold, maxHold };

  // One long run: NOI, cash flow, debt service and loan balance by hold year.
  const long = underwrite({ ...inputs, holdPeriodYears: maxHold + 2 });
  const cfs = long.annualCashFlows;
  const at = (t, key) => cfs[t - 1]?.[key] ?? 0; // t = hold year (1-based)
  const loan0 = long.debt.loanAmount;
  const balAt = (t) => (t <= 0 ? loan0 : at(t, "loanBalance"));
  const exitCap = capRatePct ?? inputs.exitCapRatePct;
  const salePct = (underwrite({ ...inputs, holdPeriodYears: baseHold }).returns.sellingCostsPct ?? 0) / 100;
  const equity = long.debt.equityRequired;
  const r = (Number(hurdlePct) || 0) / 100;

  // Sell now.
  const noiFwd = (1 - f) * at(k + 1, "noi") + f * at(k + 2, "noi");
  const valueNow = exitCap > 0 ? noiFwd / (exitCap / 100) : 0;
  const balNow = balAt(k) + (balAt(k + 1) - balAt(k)) * f;
  const proceedsNow = valueNow * (1 - salePct) - balNow;
  const yearEnd = (t) => addYears(acq, t);

  // Cash flows before D (for total IRR since purchase).
  const pastFlows = [{ date: acq, amount: -equity }];
  for (let t = 1; t <= k; t++) pastFlows.push({ date: yearEnd(t), amount: at(t, "pretaxCashFlow") });
  if (f > 0) pastFlows.push({ date: decisionDate, amount: at(k + 1, "pretaxCashFlow") * f });

  const sellTotal = [...pastFlows, { date: decisionDate, amount: proceedsNow }];
  const sell = {
    key: "sell",
    label: "Sell now",
    exitDate: decisionDate,
    value: valueNow,
    noiFwd,
    proceeds: proceedsNow,
    totalIrr: e >= 1 ? xirr(sellTotal) * 100 : NaN,
    totalMultiple: sum(sellTotal.filter((x) => x.amount > 0)) / equity,
    forwardIrr: NaN,
    forwardMultiple: NaN,
    npv: 0,
  };

  // Hold to year n (optionally refinanced on D).
  const sofr = (t) => {
    const c = inputs.sofrForwardCurve ?? [];
    return (c[Math.min(c.length - 1, t - 1)] ?? inputs.indexRatePct ?? 4) / 100;
  };
  const rf = { ...DEFAULT_REFI, ...refi };
  const refiRate = (t) => sofr(t) + rf.spreadPct / 100;
  const newLoan = Math.max(0, Math.min((rf.ltvPct / 100) * valueNow, rf.minDscr > 0 && refiRate(k + 1) > 0 ? noiFwd / (rf.minDscr * refiRate(k + 1)) : Infinity));
  const refiCosts = newLoan * (rf.feePct / 100);
  const cashOut = newLoan - balNow - refiCosts;

  const option = (n, withRefi) => {
    const fwd = [{ date: decisionDate, amount: -proceedsNow + (withRefi ? cashOut : 0) }];
    const total = [...pastFlows];
    if (withRefi) total.push({ date: decisionDate, amount: cashOut });
    for (let t = k + 1; t <= n; t++) {
      const share = t === k + 1 ? 1 - f : 1;
      let cf = at(t, "pretaxCashFlow");
      if (withRefi) cf += at(t, "debtService") - newLoan * refiRate(t);
      cf *= share;
      const value = at(t + 1, "noi") / (exitCap / 100);
      const rev = t === n ? value * (1 - salePct) - (withRefi ? newLoan : balAt(t)) : 0;
      fwd.push({ date: yearEnd(t), amount: cf + rev });
      total.push({ date: yearEnd(t), amount: cf + rev });
    }
    const npv = xnpv(fwd, r, decisionDate);
    // Forward multiple: cash from D on ÷ equity left in (today's net sale
    // proceeds less any refinance cash-out).
    const kept = -fwd[0].amount;
    const forwardMultiple = kept > 0 ? sum(fwd.slice(1)) / kept : NaN;
    // Breakeven exit cap: NPV = 0 by changing the year-n sale value.
    const dfN = Math.pow(1 + r, yearsBetween(decisionDate, yearEnd(n)));
    const valueN = at(n + 1, "noi") / (exitCap / 100);
    const revN = valueN * (1 - salePct) - (withRefi ? newLoan : balAt(n));
    const revNeeded = revN - npv * dfN;
    const valueNeeded = (revNeeded + (withRefi ? newLoan : balAt(n))) / (1 - salePct);
    return {
      key: `${withRefi ? "refi" : "hold"}-${n}`,
      label: `${withRefi ? "Refinance, hold" : "Hold"} to year ${n}`,
      decision: withRefi ? "refi" : "hold",
      years: n,
      exitDate: yearEnd(n),
      exitNoi: at(n + 1, "noi"),
      value: valueN,
      proceeds: revN,
      cashOut: withRefi ? cashOut : 0,
      forwardIrr: yearsBetween(decisionDate, yearEnd(n)) >= 1 ? xirr(fwd) * 100 : NaN,
      forwardMultiple,
      npv,
      totalIrr: xirr(total) * 100,
      totalMultiple: sum(total.filter((x) => x.amount > 0)) / equity,
      breakevenCap: valueNeeded > 0 ? (at(n + 1, "noi") / valueNeeded) * 100 : NaN,
      beyondTerm: yearEnd(n) > fd.fundEnd,
    };
  };
  const holds = [];
  for (let n = firstHold; n <= maxHold; n++) holds.push(option(n, false));
  const refis = [];
  for (let n = firstHold; n <= maxHold; n++) refis.push(option(n, true));
  const all = [sell, ...holds, ...refis];
  // Suggested: the highest NPV versus selling, among options that sell within
  // the fund term (extension years only if nothing within the term is better).
  const inTerm = all.filter((o) => !o.beyondTerm);
  const best = (inTerm.length ? inTerm : all).reduce((b, o) => (o.npv > b.npv + 1 ? o : b), sell);
  return {
    status: "ok",
    acq,
    elapsed: e,
    baseHold,
    maxHold,
    exitCap,
    salePct,
    noiFwd,
    valueNow,
    balNow,
    proceedsNow,
    refi: { ...rf, newLoan, refiCosts, cashOut, rate: refiRate(k + 1) },
    sell,
    holds,
    refis,
    best,
    // Debt service saved (+) or added (−) by refinancing, D to the end of year n.
    refiDsDelta: (n) => {
      let t0 = 0;
      for (let t = k + 1; t <= n; t++) t0 += (t === k + 1 ? 1 - f : 1) * (at(t, "debtService") - newLoan * refiRate(t));
      return t0;
    },
    find: (decision, years) =>
      decision === "sell" ? sell : (decision === "refi" ? refis : holds).find((o) => o.years === years) ?? null,
  };
}

const sum = (xs) => xs.reduce((s, x) => s + x.amount, 0);

// ── Fund scenario ───────────────────────────────────────────────────────────
// decisions: { [dealId]: { decision: "base" | "sell" | "hold" | "refi", years } }
// Rebuilds each asset's fund events for its decision, then runs the fund's
// cash flows (sub line, fund expenses) and waterfall as Portfolio Return does.
export function fundScenario(deals, terms, decisions, { decisionDate, todayISO, curve, analyses = {} }) {
  const fund = terms;
  const fd = fundDates(fund);
  const policy =
    (terms.distributionPolicy ?? "reserve") === "payout"
      ? { mode: "payout", payoutPct: terms.incomePayoutPct ?? 100 }
      : { mode: "reserve", reserveYears: terms.reserveYears ?? 1 };
  const events = [];
  const gross = [];
  for (const d of deals) {
    const dec = decisions[d.id] ?? { decision: "base" };
    const a = analyses[d.id];
    if (dec.decision === "base" || !a || a.status !== "ok") {
      const q = assetQuarterlyEvents(d, fund, policy);
      events.push(...q.events);
      gross.push(...q.gross);
      continue;
    }
    if (dec.decision === "sell") {
      // Base events up to D, then the sale (and any reserve) on D.
      const q = assetQuarterlyEvents(d, fund, policy);
      const keep = q.events.filter((e) => e.date <= decisionDate && !(e.kind === "capital") && !e.reserveRelease);
      const reserve = [...q.reserveHistory].reverse().find((h) => h.date <= decisionDate)?.reserve ?? 0;
      events.push(...keep);
      if (reserve > 0) events.push({ date: decisionDate, amount: reserve, kind: "income", dealId: d.id, reserveRelease: true });
      events.push({ date: decisionDate, amount: a.proceedsNow, kind: "capital", dealId: d.id });
      gross.push(...q.gross.filter((g, i) => i < q.gross.length - 1 && g.date <= decisionDate), { date: decisionDate, amount: a.proceedsNow });
      continue;
    }
    const n = dec.years ?? a.baseHold;
    const snap = snapshotDeal({ ...d.inputs, holdPeriodYears: n }, d.id);
    const q = assetQuarterlyEvents(snap, fund, policy);
    events.push(...q.events);
    gross.push(...q.gross);
    // The sale is valued on year-ahead NOI here (the underwriting uses the
    // final year's): adjust the sale proceeds to match the analysis.
    const held = a.find("hold", n);
    if (held) {
      const adj = held.proceeds - snap.reversion;
      events.push({ date: held.exitDate, amount: adj, kind: "capital", dealId: d.id });
      gross.push({ date: held.exitDate, amount: adj });
    }
    if (dec.decision === "refi") {
      const o = a.find("refi", n);
      const h = a.find("hold", n);
      if (o && h) {
        // Cash-out on D; lower/higher debt service after D (by quarter); the
        // sale repays the new loan instead of the old balance.
        events.push({ date: decisionDate, amount: o.cashOut, kind: "capital", dealId: d.id });
        gross.push({ date: decisionDate, amount: o.cashOut });
        const exit = h.exitDate;
        const revDelta = o.proceeds - h.proceeds;
        events.push({ date: exit, amount: revDelta, kind: "capital", dealId: d.id });
        gross.push({ date: exit, amount: revDelta });
        // Debt service difference, spread over the quarters after D.
        const qs = [];
        for (let t = parseDate(decisionDate).getTime(); t < parseDate(exit).getTime(); ) {
          const dt = new Date(t);
          const qEnd = Date.UTC(dt.getUTCFullYear(), Math.floor(dt.getUTCMonth() / 3) * 3 + 3, 0);
          qs.push(toISO(new Date(Math.min(qEnd, parseDate(exit).getTime()))));
          t = qEnd + 86_400_000;
        }
        const dsDelta = a.refiDsDelta(n);
        if (qs.length && dsDelta) for (const qd of qs) {
          events.push({ date: qd, amount: dsDelta / qs.length, kind: "income", dealId: d.id });
          gross.push({ date: qd, amount: dsDelta / qs.length });
        }
      }
    }
  }
  const flows = fundLpEvents(events, terms, { todayISO, curve, investmentPeriodEnd: fd.investmentPeriodEnd });
  const wf = computeDatedWaterfall(flows.events, {
    lpEquityPct: 100 - (terms.gpCommitPct ?? 5),
    preferredReturnPct: terms.prefPct,
    catchUpGpPct: terms.catchUpGpPct,
    tiers: terms.tiers,
    mgmtFeePct: 0,
    incomeTreatment: terms.incomeTreatment ?? "prefThenROC",
    feeStartISO: terms.finalClose,
  });
  const hurdle = terms.hurdleRatePct ?? terms.prefPct ?? 0;
  const grossIn = -gross.filter((g) => g.amount < 0).reduce((s, g) => s + g.amount, 0);
  const grossOut = gross.filter((g) => g.amount > 0).reduce((s, g) => s + g.amount, 0);
  const netIn = wf.lpEquity + wf.gpEquity;
  const lastDist = [...wf.lpFlows, ...wf.gpFlows].filter((x) => x.amount > 0).reduce((m, x) => (x.date > m ? x.date : m), "");
  return {
    grossIrr: xirr(gross) * 100,
    grossMultiple: grossIn > 0 ? grossOut / grossIn : NaN,
    netFundIrr: xirr([...wf.lpFlows, ...wf.gpFlows]) * 100,
    netFundMultiple: netIn > 0 ? (wf.lpTotalDistributions + wf.gpTotalDistributions) / netIn : NaN,
    netLpIrr: wf.lpIRR,
    netLpMultiple: wf.lpEquityMultiple,
    lpDistributions: wf.lpTotalDistributions,
    gpDistributions: wf.gpTotalDistributions,
    lpNpv: hurdleStats(wf.lpFlows, hurdle, terms.finalClose).npv,
    lastDistribution: lastDist,
    // Phase K (11/23): TVPI = the LP multiple at the end; DPI by the end of
    // the fund's term (before extensions) shows cash pushed past the term;
    // GP promote = GP distributions above its pro-rata share.
    netLpTvpi: wf.lpEquity > 0 ? wf.lpTotalDistributions / wf.lpEquity : NaN,
    lpDpiAtTerm: wf.lpEquity > 0 ? wf.lpFlows.filter((f) => f.amount > 0 && f.date <= fd.fundEnd).reduce((s2, f) => s2 + f.amount, 0) / wf.lpEquity : NaN,
    gpPromote: (() => {
      const tot = wf.lpTotalDistributions + wf.gpTotalDistributions;
      const eq = wf.lpEquity + wf.gpEquity;
      return eq > 0 ? wf.gpTotalDistributions - (wf.gpEquity / eq) * tot : NaN;
    })(),
    fundEnd: fd.fundEnd,
    extendedEnd: fd.extendedEnd,
  };
}

// Phase K (11/23): change every asset's hold at once. mode "shift": each
// asset's base hold + years; mode "set": hold to year `years` for all. Holds
// past the fund's final extended term are capped at the last year allowed
// (flagged), and assets not yet held keep their base plan.
export function allHoldDecisions(deals, analyses, { mode = "shift", years = 0 } = {}) {
  const decisions = {};
  const capped = [];
  for (const d of deals) {
    const a = analyses[d.id];
    if (!a || a.status !== "ok") continue;
    const want = mode === "set" ? Number(years) : a.baseHold + Number(years);
    const allowed = a.holds.map((o) => o.years);
    if (!allowed.length) continue;
    const max = Math.max(...allowed), min = Math.min(...allowed);
    const n = Math.min(max, Math.max(min, want));
    if (n !== want) capped.push({ id: d.id, name: d.inputs?.propertyName ?? d.id, wanted: want, used: n, reason: want > max ? "past the final extended term" : "before the decision date" });
    decisions[d.id] = n === a.baseHold ? { decision: "base" } : { decision: "hold", years: n };
  }
  return { decisions, capped };
}

// Assets whose chosen sale falls past the fund's term (needs an extension) or
// is the last year the extensions allow.
export function termFlags(deals, analyses, decisions) {
  const out = [];
  for (const d of deals) {
    const a = analyses[d.id];
    if (!a || a.status !== "ok") continue;
    const dec = decisions[d.id] ?? { decision: "base" };
    if (dec.decision === "sell") continue;
    const n = dec.decision === "base" ? a.baseHold : dec.years;
    const o = (dec.decision === "refi" ? a.refis : a.holds).find((x) => x.years === n) ?? a.holds.find((x) => x.years === n);
    if (o?.beyondTerm) out.push({ id: d.id, name: d.inputs?.propertyName ?? d.id, years: n, exitDate: o.exitDate, lastAllowed: n >= Math.max(...a.holds.map((x) => x.years)) });
  }
  return out;
}
