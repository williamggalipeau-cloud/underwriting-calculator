// Phase Z: the Home page (the app opens on it). Everything here is computed
// from data already loaded, for the portfolio chosen in the "Working on"
// picker (callers pass the scoped deals and funds). Nothing is saved.
import { DEFAULT_FUND_TERMS } from "@/lib/fundTerms";
import { fundType } from "@/lib/fundTypes";
import { fundValuation } from "@/lib/valuations";
import { capitalSummary, keyDates } from "@/lib/fundSummary";
import { fundVariance, kpiActuals, milestoneStatus, planDates, varianceReport } from "@/lib/businessPlan";
import { assetValuation, distributionPolicy } from "@/lib/valuations";
import { underwrite } from "@/lib/calculations";
import { aggregate as aggregateDelinquency } from "@/lib/delinquency";
import { STAGES, totalsByStage } from "@/lib/pipeline";
import { activeSales, allSales } from "@/lib/dispositions";
import { ACTIVE_PROSPECT_STAGES, allProspects } from "@/lib/leasing";
import { debtAlerts, fundLoans } from "@/lib/fundDebt";
import { criticalDates } from "@/lib/leaseViews";
import { ACTIVE_STAGES as PIPELINE_ACTIVE } from "@/lib/pipeline";
import { CONTRACT_DATES } from "@/lib/contractDates";
export { CONTRACT_DATES };
import { conditionSummary, insuranceSummary, pmDates } from "@/lib/propertyMgmt";
import { submarketSummary } from "@/lib/market";

const DAY = 86400000;
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const addYears = (iso, y) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  const whole = Math.floor(y);
  d.setUTCFullYear(d.getUTCFullYear() + whole);
  d.setUTCMonth(d.getUTCMonth() + Math.round((y - whole) * 12));
  return d.toISOString().slice(0, 10);
};
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const termsOf = (funds, name) => ({ ...DEFAULT_FUND_TERMS, ...(funds[name] ?? {}), name });
const held = (d, today) => d.inputs?.fundName && d.inputs.acquisitionDate && d.inputs.acquisitionDate <= today;
// Last completed calendar quarter end on or before today.
export function lastQuarterEnd(today) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const q = Math.floor((m - 1) / 3); // 0..3 = the current quarter
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  return q === 0 ? `${y - 1}-12-31` : `${y}-${ends[q - 1]}`;
}

// ── Today: what needs attention ──
// kinds: lease (expiring ≤ 90 days), loan (maturing ≤ 18 months), cap
// (expiring ≤ 12 months), appraisal (no mark for the last quarter), rent
// (60+ days late), budget (NOI behind plan). Each item opens its tab.
export function attentionList(deals, funds, valuations = {}, { todayISO, leaseDays = 90, loanDays = 548, capDays = 366, leasingDays = 7, pmWithin = 60, lookbackDays = 0 } = {}) {
  const items = [];
  const push = (x) => items.push({ days: x.date ? days(todayISO, x.date) : null, ...x });
  const own = deals.filter((d) => held(d, todayISO));
  for (const d of own) {
    const inp = d.inputs;
    const asset = inp.propertyName || d.id;
    for (const u of inp.units ?? []) {
      if (u.leaseStatus !== "occupied" || !u.leaseEnd) continue;
      const n = days(todayISO, u.leaseEnd);
      if (n >= -lookbackDays && n <= leaseDays) push({ kind: "lease", tab: "leases", dealId: d.id, asset, date: u.leaseEnd, text: `${u.tenantName || u.name || "Lease"} expires (${asset})` });
    }
    if (Number(inp.loanTermYears) > 0) {
      const m = addYears(inp.acquisitionDate, Number(inp.loanTermYears));
      const n = days(todayISO, m);
      if (n >= -lookbackDays && n <= loanDays) push({ kind: "loan", tab: "debt", dealId: d.id, asset, date: m, text: `Loan matures (${asset})` });
    }
    const capped = (Number(inp.capStrikeRatePct) || 0) > 0 || (inp.capStrikeRatesByYear ?? []).some((x) => x > 0);
    if (capped) {
      const term = Number(inp.capTermYears) || 1;
      const yearsIn = Math.max(0, days(inp.acquisitionDate, todayISO) / 365.25);
      const end = addYears(inp.acquisitionDate, (Math.floor(yearsIn / term) + 1) * term);
      const n = days(todayISO, end);
      if (n >= 0 && n <= capDays) push({ kind: "cap", tab: "debt", dealId: d.id, asset, date: end, text: `Rate cap expires (${asset})` });
    }
  }
  // Leasing: an active prospect's next step due within 7 days (or overdue).
  for (const x of allProspects(own)) {
    const p = x.p;
    if (!ACTIVE_PROSPECT_STAGES.includes(p.stage) || !p.nextDate) continue;
    if (days(todayISO, p.nextDate) <= leasingDays) push({ kind: "leasing", tab: "leasing", dealId: x.dealId, asset: x.asset, date: p.nextDate, text: `${p.nextStep || "Next step"}: ${p.tenant || "prospect"} (${x.asset})` });
  }
  // Property management: tax bills, renewals and contract notices within 60 days; immediate repairs.
  for (const x of pmDates(own, todayISO, { within: pmWithin })) push(x);
  // Debt: covenant breaches now, and extension tests failing within 18 months.
  try { for (const a of debtAlerts(own, valuations, todayISO)) push({ ...a, tab: "funddebt" }); } catch { /* keep the rest */ }
  // Appraisals: held since before the last quarter end with no mark for it.
  const lq = lastQuarterEnd(todayISO);
  const unmarked = own.filter((d) => d.inputs.acquisitionDate <= lq && !(valuations[d.id] ?? {})[lq]);
  if (unmarked.length) push({ kind: "appraisal", tab: "valuations", date: addDays(lq, 45), text: `${unmarked.length} asset${unmarked.length === 1 ? "" : "s"} without a ${lq} mark`, assets: unmarked.map((d) => d.inputs.propertyName) });
  // Rent 60+ days late, from each fund's latest delinquency report.
  for (const [name, f] of Object.entries(funds)) {
    const dq = f?.delinquency;
    const ms = Object.keys(dq?.months ?? {}).sort();
    if (!ms.length) continue;
    const agg = aggregateDelinquency(dq.months[ms.at(-1)], dq.mapping, own.filter((d) => d.inputs.fundName === name));
    for (const t of agg.tenants) {
      const late = ["d60", "d90", "d180", "over180"].reduce((s, k) => s + (t.buckets[k] || 0), 0);
      if (late > 0) push({ kind: "rent", tab: "units", dealId: t.dealId, asset: t.asset, date: null, amount: late, text: `${t.tenant}: $${Math.round(late).toLocaleString("en-US")} 60+ days late (${t.asset})` });
    }
  }
  // Budget: NOI behind plan year to date (red flag).
  const v = fundVariance(own, { kind: "ytd", end: todayISO.slice(0, 7) });
  for (const r of v.rows) if (r.flag === "red") push({ kind: "budget", tab: "plan", dealId: r.dealId, asset: r.asset, date: null, text: `NOI ${r.variancePct != null ? `${r.variancePct.toFixed(1)}% vs. budget` : "behind budget"}, year to date (${r.asset})` });
  const ORDER = { covenant: 0, condition: 1, rent: 2, lease: 3, leasing: 4, tax: 5, insurance: 6, contract: 7, extension: 8, loan: 9, cap: 10, appraisal: 11, budget: 12 };
  // Urgent undated items (a covenant breach, an immediate repair) first, then dated ones soonest first, then the rest.
  const URGENT = new Set(["covenant", "condition"]);
  const group = (x) => (!x.date && URGENT.has(x.kind) ? 0 : x.date ? 1 : 2);
  return items.sort((a, b) => group(a) - group(b) || (a.date && b.date ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : ORDER[a.kind] - ORDER[b.kind]));
}

const nextQuarterEndAfter = (iso) => {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  const ends = [`${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`, `${y + 1}-03-31`];
  return ends.find((e) => e > iso);
};

// ── Actions Needed and Calendar (user, 11/24) ──
// Calendar: every critical action and milestone date from a year back to a
// year ahead (rolling): leases (rent roll and abstracts), leasing next steps,
// debt (maturities, extension notices, covenant tests, rate caps, the sub
// line), appraisals, property taxes, insurance, contracts, construction,
// business plan milestones, purchase and sale contract dates, fund dates.
// Actions Needed: what needs doing now: issues with no date (a covenant
// breach, an immediate repair, late rent, NOI behind budget), deadlines due
// within urgentDays (30), and deadlines already past (overdue) until they're
// marked done or the data clears them (a mark entered, a milestone done, a
// sale closed…). Past events that aren't deadlines (a P&S signed, a fund
// date, a completed job) are history on the Calendar only.
// done: { [actionKey]: { by, at, text } }, the firm's record of actions done.
// Status column (user, 11/24): Past Due, Due now (within urgentDays, or an
// issue to fix now), Completed (marked done, cleared by the data, or a past
// event); Upcoming beyond urgentDays (Upcoming Events only).
export const STATUS = { overdue: "Past Due", soon: "Due now", done: "Completed", past: "Completed", upcoming: "Upcoming" };
export const actionKey = (x) => [x.kind, x.dealId ?? "", x.date ?? "", x.text].join("|");
const EVENT_LABELS = new Set(["P&S signed", "Due diligence starts", "Loan closing", "Deal closing", "Target sale close"]);
export function actionsAndCalendar(deals, funds, valuations = {}, { todayISO, urgentDays = 30, horizonDays = 365, lookbackDays = 365, pipeline = [], leases = null, done = {} } = {}) {
  const all = attentionList(deals, funds, valuations, { todayISO, leaseDays: horizonDays, loanDays: horizonDays, capDays: horizonDays, leasingDays: horizonDays, pmWithin: horizonDays, lookbackDays });
  const own = deals.filter((d) => held(d, todayISO));
  const add = (x) => all.push({ days: x.date ? days(todayISO, x.date) : null, ...x });
  // Asset and Owner columns (user, 11/24): the item's own owner (a plan
  // milestone's, a pipeline deal's), else the asset's asset manager, else the
  // fund's portfolio manager.
  const dealOf = (id) => (id ? deals.find((d) => d.id === id) : null);
  const fundOfAll = (ls) => { const f = [...new Set(ls.map((l) => dealOf(l.id)?.inputs?.fundName).filter(Boolean))]; return f.length === 1 ? f[0] : null; };
  const assetOf = (x) => x.asset || (x.assets?.length ? `${x.assets.length} asset${x.assets.length === 1 ? "" : "s"}` : "") || x.fund || "";
  const ownerOf = (x) => {
    if (x.owner) return x.owner;
    const d = dealOf(x.dealId);
    if (d?.inputs?.assetManager) return d.inputs.assetManager;
    const fund = d?.inputs?.fundName || x.fund;
    return (fund && funds?.[fund]?.portfolioManager) || "";
  };
  const inWindow = (d) => d && days(todayISO, d) >= -lookbackDays && days(todayISO, d) <= horizonDays;
  // Business plan milestones still open (late ones are overdue).
  for (const m of planDates(own, todayISO)) if (inWindow(m.date)) add({ kind: "milestone", tab: "plan", dealId: m.dealId, asset: m.asset, owner: m.owner || "", date: m.date, text: `${m.label} (${m.asset})` });
  // Dispositions: contract dates (user, 11/24), else the target close.
  for (const x of allSales(own)) {
    const s = x.sale;
    if (s.stage === "withdrawn") continue;
    const c = s.contract ?? {};
    const dates = CONTRACT_DATES.map(([k, l]) => [c[k], l]).filter(([d]) => d);
    if (!dates.length && s.targetClose && s.stage !== "closed") dates.push([s.targetClose, "Target sale close"]);
    for (const [d, l] of dates) if (inWindow(d)) add({ kind: "sale", tab: "forsale", dealId: x.dealId, asset: x.asset, date: d, event: EVENT_LABELS.has(l) || s.stage === "closed", text: `Sale: ${l} (${x.asset})` });
  }
  // Acquisitions: pipeline deals' contract dates (user, 11/24).
  for (const pl of pipeline ?? []) {
    if (["passed", "lost"].includes(pl.stage)) continue;
    const name = pl.name || "Pipeline deal";
    const closed = !PIPELINE_ACTIVE.includes(pl.stage);
    for (const [k, l] of [...CONTRACT_DATES.filter(([k]) => k !== "closingDate"), ["expectedClose", "Deal closing"]]) {
      if (inWindow(pl[k])) add({ kind: "acquisition", tab: "pipeline", asset: name, owner: pl.owner || "", date: pl[k], event: EVENT_LABELS.has(l) || closed, text: `Purchase: ${l} (${name})` });
    }
  }
  // Leases: critical dates from the abstracts, when signed in (user, 11/24).
  if (leases?.length) {
    const ids = new Set(own.map((d) => d.id));
    const nameOf = (id) => own.find((d) => d.id === id)?.inputs.propertyName ?? id;
    for (const r of criticalDates(leases.filter((l) => ids.has(l.deal_id)), { assetName: nameOf, asOf: todayISO, includeHistory: false })) {
      if (!r.date || !inWindow(r.date) || r.kind === "expiration") continue; // expirations come from the rent roll
      add({ kind: "leasedate", tab: "leases", dealId: r.dealId, asset: r.asset, date: r.date, event: ["rent_increase", "abatement_end"].includes(r.kind), text: `${r.kindLabel}: ${r.label || r.tenant} (${r.tenant}, ${r.asset})${r.notice ? ` · ${r.notice}` : ""}` });
    }
  }
  // Debt (user, 11/24): extension notices, quarterly covenant tests,
  // replacement rate caps; each fund's sub line maturity is with the fund dates.
  let loans = [];
  try { loans = fundLoans(own, valuations, todayISO); } catch { /* keep the rest */ }
  for (const l of loans) {
    if (l.extensionsLeft > 0 && l.currentMaturity) {
      const set = Number(l.inputs?.extensionNoticeDays) > 0;
      const nd = set ? Number(l.inputs.extensionNoticeDays) : 60;
      const d = addDays(l.currentMaturity, -nd);
      if (inWindow(d)) add({ kind: "extension", tab: "debt", dealId: l.id, asset: l.name, date: d, text: `Extension notice due, ${nd} days before the ${l.currentMaturity} maturity${set ? "" : " (60 days assumed; set it on the loan)"} (${l.name})` });
    }
    // One line per cap (user, 11/24): when the loan runs past the cap, the
    // expiry line says a replacement is needed.
    if (l.capEnd && l.currentMaturity && l.capEnd < (l.finalMaturity || l.currentMaturity)) {
      for (const x of all) if (x.kind === "cap" && x.dealId === l.id && /^Rate cap expires/.test(x.text)) x.text = `Rate cap expires: buy a replacement (the loan runs to ${l.finalMaturity || l.currentMaturity}) (${l.name})`;
    }
  }
  const tested = loans.filter((l) => Object.values(l.tests ?? {}).some((v) => v != null));
  if (tested.length) {
    for (let q = nextQuarterEndAfter(addDays(todayISO, -lookbackDays)); days(todayISO, q) <= horizonDays; q = nextQuarterEndAfter(q)) {
      add({ kind: "covenanttest", tab: "funddebt", asset: tested.length === 1 ? tested[0].name : `${tested.length} loans`, fund: fundOfAll(tested), date: q, event: true, text: `Quarterly covenant tests: ${tested.length} loan${tested.length === 1 ? "" : "s"} (${tested.slice(0, 3).map((l) => l.name).join(", ")}${tested.length > 3 ? "…" : ""})` });
    }
  }
  // Appraisals from the schedule (due 60 days after quarter end); done ones are history.
  for (const name of Object.keys(funds)) {
    try {
      const v = fundValuation(own.filter((d) => d.inputs.fundName === name), valuations, termsOf(funds, name), { todayISO });
      for (const sc of v.schedule) if (inWindow(sc.dueBy)) add({ kind: "appraisal", tab: "valuations", dealId: sc.assetId, asset: sc.asset, date: sc.dueBy, event: sc.status === "done", resolved: sc.status === "done", text: `Appraisal due for ${sc.quarterEnd} (${sc.asset})` });
    } catch { /* keep the rest */ }
  }
  // Construction: open jobs' scheduled completion; completed jobs as history.
  for (const d of own) {
    for (const j of d.inputs?.construction?.jobs ?? []) {
      const complete = j.status === "Complete";
      const when = complete ? j.completion : j.scheduledCompletion || j.completion;
      if (inWindow(when)) add({ kind: "construction", tab: "condition", dealId: d.id, asset: d.inputs.propertyName, date: when, event: complete, resolved: complete, text: `Job completion: ${j.name || j.code}${j.unit ? `, unit ${j.unit}` : ""} (${d.inputs.propertyName})` });
    }
  }
  // Fund key dates and the sub line maturity.
  for (const name of Object.keys(funds)) {
    const kd = keyDates(termsOf(funds, name), todayISO);
    for (const [d, l] of [[kd.investmentPeriodEnd, "Investment period ends"], [kd.fundEnd, "End of fund term"], [kd.outsideDate, "Fund outside date"], [funds[name]?.subLineMaturity, "Sub line matures"]]) {
      if (inWindow(d)) add({ kind: "fund", tab: "fundsummary", asset: name, fund: name, date: d, event: l !== "Sub line matures", text: `${l} (${name})` });
    }
  }
  const seen = new Set();
  const items = all
    .filter((x) => x.date == null || inWindow(x.date))
    .map((x) => ({ ...x, key: actionKey(x) }))
    .filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)))
    .map((x) => ({ ...x, done: done?.[x.key] ?? null }))
    .map((x) => ({ ...x, asset: assetOf(x), owner: ownerOf(x) }));
  // An action: not done, not resolved by the data, not a past event; undated,
  // overdue or due within urgentDays.
  const isAction = (x) => !x.done && !x.resolved && !(x.event && x.days != null && x.days < 0) && (x.date == null || x.days <= urgentDays);
  const actions = items.filter(isAction).map((x) => ({ ...x, status: x.date && x.days < 0 ? STATUS.overdue : STATUS.soon }));
  const URG = new Set(["covenant", "condition"]);
  const g = (x) => (!x.date && URG.has(x.kind) ? 0 : x.date && x.days < 0 ? 1 : x.date ? 2 : 3);
  actions.sort((a, b) => g(a) - g(b) || (a.date && b.date ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : 0));
  // Calendar: every dated item in the window, with its state.
  const calendar = items.filter((x) => x.date).map((x) => {
    const state = x.done ? "done" : x.resolved ? "done" : x.days < 0 ? (x.event ? "past" : "overdue") : x.days <= urgentDays ? "soon" : "upcoming";
    return { ...x, state, status: STATUS[state] };
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { actions, calendar, urgentDays, horizonDays, lookbackDays };
}
// Mark an action done (or undo): the firm's record, kept with its settings.
export function markDone(doneMap, item, { by = "", at = new Date().toISOString(), undo = false } = {}) {
  const next = { ...(doneMap ?? {}) };
  if (undo) delete next[item.key];
  else next[item.key] = { by, at, text: item.text };
  // Keep the record to about two years.
  const cutoff = new Date(Date.parse(at) - 730 * DAY).toISOString();
  for (const [k, v] of Object.entries(next)) if (v.at < cutoff) delete next[k];
  return next;
}

// ── Fund cards ──
export function fundCards(deals, funds, valuations = {}, { todayISO, curve } = {}) {
  return Object.keys(funds).sort().map((name) => {
    const terms = termsOf(funds, name);
    const fd = deals.filter((d) => d.inputs?.fundName === name);
    let nav = null, netIrr = null;
    try {
      const val = fundValuation(fd, valuations, terms, { todayISO, curve });
      const q = [...(val.quarters ?? [])].reverse().find((x) => x.quarterEnd <= todayISO);
      if (q) { nav = q.nav; netIrr = isFinite(q.net?.irr) ? q.net.irr : null; }
    } catch { /* keep blanks */ }
    const cap = capitalSummary(terms, fd, todayISO);
    const kd = keyDates(terms, todayISO);
    const next = [["Investment period ends", kd.investmentPeriodEnd], ["End of term", kd.fundEnd], ["Outside date", kd.outsideDate]].find(([, dt]) => dt && dt >= todayISO) ?? null;
    return {
      name, type: fundType(terms.type), assets: cap.assets, nav, netIrr, targetNetIrr: terms.fundPlanTargets?.netIrrPct ?? null,
      pctCalled: cap.pctCalled, dryPowder: cap.dryPowder, lineDrawn: cap.lineDrawn, lineSize: cap.lineSize, nextDate: next ? { label: next[0], date: next[1] } : null,
    };
  });
}

// ── Workflow lanes (one per tab header that has tabs) ──
export function lanes({ deals, funds, pipeline, attention, cards, firm, todayISO, market = null }) {
  const pl = pipeline?.deals ?? [];
  const byStage = Object.fromEntries(totalsByStage(pl).map((t) => [t.stage, t]));
  const active = pl.filter((d) => !["closed", "passed"].includes(d.stage));
  const year = todayISO.slice(0, 4);
  const own = deals.filter((d) => held(d, todayISO));
  const expiringThisYear = own.reduce((s, d) => s + (d.inputs.units ?? []).filter((u) => u.leaseStatus === "occupied" && u.leaseEnd?.slice(0, 4) === year && u.leaseEnd >= todayISO).length, 0);
  const v = fundVariance(own, { kind: "ytd", end: todayISO.slice(0, 7) });
  const sum = (k) => cards.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  const count = (k) => attention.filter((a) => a.kind === k).length;
  const stageLabel = Object.fromEntries(STAGES);
  return [
    { label: "Acquisitions", tabs: ["pipeline", "quick", "impact"], stats: [
      { label: "Active pipeline", value: `${active.length} deal${active.length === 1 ? "" : "s"}` },
      { label: "By stage", value: STAGES.filter(([k]) => !["closed", "passed"].includes(k)).map(([k]) => `${stageLabel[k]} ${byStage[k]?.count ?? 0}`).join(" · ") },
      { label: "Dry powder", value: money(sum("dryPowder")) },
    ] },
    { label: "Dispositions", tabs: ["sellhold", "forsale", "offers", "trackrecord", "dispdocs"], stats: [
      { label: "Assets for sale", value: String(activeSales(deals).length) },
      { label: "Offers received", value: String(activeSales(deals).reduce((t, x) => t + (x.sale.offers ?? []).length, 0)) },
      { label: `Closed in ${year}`, value: String(allSales(deals).filter((x) => x.sale.stage === "closed" && x.sale.closing?.date?.slice(0, 4) === year).length) },
    ] },
    { label: "Asset Management", tabs: ["assets", "plan", "units", "leases", "leasing", "valuations"], stats: [
      { label: "Leasing prospects (active)", value: String(allProspects(own).filter((x) => ACTIVE_PROSPECT_STAGES.includes(x.p.stage)).length) },
      { label: "Occupancy", value: isFinite(firm?.occupancy) ? `${firm.occupancy.toFixed(1)}%` : "—" },
      { label: `Leases expiring in ${year}`, value: String(expiringThisYear) },
      { label: "NOI vs. budget (YTD)", value: v.total.variancePct != null ? `${v.total.variancePct >= 0 ? "+" : ""}${v.total.variancePct.toFixed(1)}%` : "no actuals yet" },
      { label: "Appraisals due", value: String(attention.find((a) => a.kind === "appraisal")?.assets?.length ?? 0) },
    ] },
    { label: "Property Management", tabs: ["taxes", "insurance", "condition", "contracts"], stats: [
      { label: "Insurance premium (annual)", value: money(own.reduce((t, d) => t + insuranceSummary(d.inputs).premium, 0)) },
      { label: "Open condition items", value: (() => { const c = own.map((d) => conditionSummary(d.inputs)); return `${c.reduce((t, x) => t + x.open, 0)} · ${money(c.reduce((t, x) => t + x.openCost, 0))}`; })() },
      { label: "Dates in 60 days", value: String(pmDates(own, todayISO, { within: 60 }).filter((x) => x.date).length) },
    ] },
    { label: "Portfolio Management", tabs: ["fundsummary", "fund", "funddebt", "distributions", "stress"], stats: [
      { label: "NAV", value: money(sum("nav")) },
      { label: "Loans maturing in 18 months", value: String(count("loan")) },
      { label: "Sub line drawn", value: cards.some((c) => c.lineDrawn != null) ? money(sum("lineDrawn")) : "—" },
      { label: "Rate caps expiring in 12 months", value: String(count("cap")) },
    ] },
    { label: "Market", tabs: ["market"], stats: (() => {
      const subs = market?.submarkets ?? [];
      const tagged = own.filter((d) => d.inputs.submarketId && subs.some((x) => x.id === d.inputs.submarketId)).length;
      const vac = subs.map((x) => submarketSummary(market, x.id).vacancy.latest).filter((v) => v != null);
      return [
        { label: "Submarkets tracked", value: String(subs.length) },
        { label: "Assets tagged to a submarket", value: `${tagged} of ${own.length}` },
        { label: "Average submarket vacancy", value: vac.length ? `${(vac.reduce((a, b) => a + b, 0) / vac.length).toFixed(1)}%` : "—" },
      ];
    })() },
    { label: "Library", tabs: ["documents", "reports"], stats: [
      { label: "Quarterly and risk reports", value: "Reports tab" },
      { label: "Leases, loans, appraisals, OMs", value: "Documents tab" },
    ] },
  ];
}

export function money(v) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  return `${v < 0 ? "-" : ""}$${a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : Math.round(a)}`;
}

// Last n changes, newest first.
export function recentActivity(log, n = 10) {
  return [...(log ?? [])].filter((e) => e && e.at).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, n);
}

// Asset Watch List (user, 11/24): plan performance only. An asset is listed
// when its NOI or IRR is under plan. More than 10% under (relative) on either
// is At Risk; up to 10% under is Off Plan. Other plan goals missed (occupancy,
// rent, WALT, late milestones, capital over budget) are shown as reasons.
//   NOI: actual vs the plan (revision 1's budget), year to date, when actuals exist.
//   IRR: the interim IRR at the last quarter's mark (an appraisal or internal
//   mark, held a year or more) vs the plan's underwritten IRR.
export const WATCH_AT_RISK_PCT = 10;
export function planWatchList(deals, funds, marks = {}, { todayISO, calendar = [], atRiskPct = WATCH_AT_RISK_PCT } = {}) {
  const own = deals.filter((d) => held(d, todayISO));
  const lq = lastQuarterEnd(todayISO);
  const out = [];
  for (const d of own) {
    const inp = d.inputs, bp = inp.businessPlan;
    const plan = bp?.revisions?.[0]?.plan, cur = bp?.revisions?.[bp.revisions.length - 1]?.plan;
    const kpi = (k) => (cur?.kpis ?? plan?.kpis ?? []).find((x) => x.key === k)?.target;
    // NOI vs plan, year to date
    let noi = null;
    try {
      const v = varianceReport(bp, { kind: "ytd", end: todayISO.slice(0, 7), sf: inp.squareFootage });
      const r = v.rows.find((x) => x.key === "noi");
      if (r?.actual != null && r.plan) noi = { actual: r.actual, plan: r.plan, pct: ((r.actual - r.plan) / Math.abs(r.plan)) * 100, months: v.months.length };
    } catch { /* no plan */ }
    // IRR vs plan
    let irr = null;
    try {
      const terms = termsOf(funds, inp.fundName);
      const av = assetValuation(d, marks[d.id] ?? {}, { todayISO, fund: terms, policy: distributionPolicy(terms) });
      const row = av.byQuarter.get(lq);
      const target = Number(kpi("irr")) || underwrite(inp).returns?.irr;
      if (row && ["appraisal", "internal"].includes(row.basis) && row.yearsHeld >= 1 && isFinite(row.irr) && target) irr = { actual: row.irr, plan: target, pct: ((row.irr - target) / Math.abs(target)) * 100, basis: row.basis };
    } catch { /* keep the rest */ }
    const shortfall = Math.max(noi && noi.pct < 0 ? -noi.pct : 0, irr && irr.pct < 0 ? -irr.pct : 0);
    if (!(shortfall > 0)) continue;
    // Other goals missed
    const goals = [];
    const k = kpiActuals(inp, todayISO);
    const under = (key, label, fmt) => { const t = Number(kpi(key)); if (t && isFinite(k[key]) && k[key] < t) goals.push(`${label} ${fmt(k[key])} vs ${fmt(t)}`); };
    under("occupancy", "Occupancy", (x) => `${x.toFixed(1)}%`);
    under("rentPSF", "Rent", (x) => `$${x.toFixed(2)}/SF`);
    under("walt", "WALT", (x) => `${x.toFixed(1)} yrs`);
    const capT = Number(kpi("capex"));
    if (capT && k.capex > capT) goals.push(`Capital $${Math.round(k.capex).toLocaleString("en-US")} vs $${Math.round(capT).toLocaleString("en-US")} budget`);
    const late = (cur?.milestones ?? []).filter((m) => milestoneStatus(m, todayISO) === "late");
    if (late.length) goals.push(`${late.length} milestone${late.length === 1 ? "" : "s"} late (${late.slice(0, 2).map((m) => m.label).join("; ")}${late.length > 2 ? "…" : ""})`);
    const next = calendar.filter((x) => x.dealId === d.id && x.days >= 0 && !x.done && !x.resolved).sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;
    out.push({
      id: d.id, dealId: d.id, name: inp.propertyName || d.id, fund: inp.fundName,
      owner: inp.assetManager || funds?.[inp.fundName]?.portfolioManager || "",
      status: shortfall > atRiskPct ? "At Risk" : "Off Plan", shortfall, noi, irr, goals, next,
    });
  }
  out.sort((a, b) => b.shortfall - a.shortfall || a.name.localeCompare(b.name));
  return { assets: out, asOf: todayISO, irrAsOf: lq, atRiskPct };
}
