// Phase Z: the Home page (the app opens on it). Everything here is computed
// from data already loaded, for the portfolio chosen in the "Working on"
// picker (callers pass the scoped deals and funds). Nothing is saved.
import { DEFAULT_FUND_TERMS } from "@/lib/fundTerms";
import { fundType } from "@/lib/fundTypes";
import { fundValuation } from "@/lib/valuations";
import { capitalSummary, keyDates } from "@/lib/fundSummary";
import { fundVariance } from "@/lib/businessPlan";
import { aggregate as aggregateDelinquency } from "@/lib/delinquency";
import { STAGES, totalsByStage } from "@/lib/pipeline";
import { activeSales, allSales } from "@/lib/dispositions";

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
export function attentionList(deals, funds, valuations = {}, { todayISO, leaseDays = 90 } = {}) {
  const items = [];
  const push = (x) => items.push({ days: x.date ? days(todayISO, x.date) : null, ...x });
  const own = deals.filter((d) => held(d, todayISO));
  for (const d of own) {
    const inp = d.inputs;
    const asset = inp.propertyName || d.id;
    for (const u of inp.units ?? []) {
      if (u.leaseStatus !== "occupied" || !u.leaseEnd) continue;
      const n = days(todayISO, u.leaseEnd);
      if (n >= 0 && n <= leaseDays) push({ kind: "lease", tab: "leases", dealId: d.id, asset, date: u.leaseEnd, text: `${u.tenantName || u.name || "Lease"} expires (${asset})` });
    }
    if (Number(inp.loanTermYears) > 0) {
      const m = addYears(inp.acquisitionDate, Number(inp.loanTermYears));
      const n = days(todayISO, m);
      if (n >= 0 && n <= 548) push({ kind: "loan", tab: "debt", dealId: d.id, asset, date: m, text: `Loan matures (${asset})` });
    }
    const capped = (Number(inp.capStrikeRatePct) || 0) > 0 || (inp.capStrikeRatesByYear ?? []).some((x) => x > 0);
    if (capped) {
      const term = Number(inp.capTermYears) || 1;
      const yearsIn = Math.max(0, days(inp.acquisitionDate, todayISO) / 365.25);
      const end = addYears(inp.acquisitionDate, (Math.floor(yearsIn / term) + 1) * term);
      const n = days(todayISO, end);
      if (n >= 0 && n <= 366) push({ kind: "cap", tab: "debt", dealId: d.id, asset, date: end, text: `Rate cap expires (${asset})` });
    }
  }
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
  const ORDER = { rent: 0, lease: 1, loan: 2, cap: 3, appraisal: 4, budget: 5 };
  return items.sort((a, b) => (a.date && b.date ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : a.date ? -1 : b.date ? 1 : ORDER[a.kind] - ORDER[b.kind]));
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
export function lanes({ deals, funds, pipeline, attention, cards, firm, todayISO }) {
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
    { label: "Dispositions", tabs: ["forsale", "offers", "trackrecord", "dispdocs"], stats: [
      { label: "Assets for sale", value: String(activeSales(deals).length) },
      { label: "Offers received", value: String(activeSales(deals).reduce((t, x) => t + (x.sale.offers ?? []).length, 0)) },
      { label: `Closed in ${year}`, value: String(allSales(deals).filter((x) => x.sale.stage === "closed" && x.sale.closing?.date?.slice(0, 4) === year).length) },
    ] },
    { label: "Asset Management", tabs: ["plan", "assets", "leases", "valuations"], stats: [
      { label: "Occupancy", value: isFinite(firm?.occupancy) ? `${firm.occupancy.toFixed(1)}%` : "—" },
      { label: `Leases expiring in ${year}`, value: String(expiringThisYear) },
      { label: "NOI vs. budget (YTD)", value: v.total.variancePct != null ? `${v.total.variancePct >= 0 ? "+" : ""}${v.total.variancePct.toFixed(1)}%` : "no actuals yet" },
      { label: "Appraisals due", value: String(attention.find((a) => a.kind === "appraisal")?.assets?.length ?? 0) },
    ] },
    { label: "Portfolio Management", tabs: ["fundsummary", "fund", "distributions", "stress"], stats: [
      { label: "NAV", value: money(sum("nav")) },
      { label: "Loans maturing in 18 months", value: String(count("loan")) },
      { label: "Sub line drawn", value: cards.some((c) => c.lineDrawn != null) ? money(sum("lineDrawn")) : "—" },
      { label: "Rate caps expiring in 12 months", value: String(count("cap")) },
    ] },
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
