// ─── Phase N: Portfolio Summary ───────────────────────────────────────────────────
// One page of key facts about a fund: key dates, all key terms from the LPA /
// PPM already in the app, capital raised / deployed / available, legal
// entities with an ownership chart, and links to the tabs that hold the rest
// (performance, portfolio, critical dates). Not repeated here: performance,
// the portfolio snapshot and upcoming dates.
// Stored on the fund's terms: launchDate, keyPerson, removal, entities:
//   [{ id, name, role: "fund" | "gp" | "manager" | "asset" | "other", state,
//      formed, einLast4, agent, annualReportDue, dealId, parentId }]

import { underwrite } from "@/lib/calculations";
import { addYears, fundDates, parseDate } from "@/lib/fundTimeline";
import { actualCapital } from "@/lib/capitalActivity";
import { fundType } from "@/lib/fundTypes";

export const ENTITY_ROLES = [
  ["fund", "Fund"],
  ["gp", "General partner"],
  ["manager", "Manager"],
  ["asset", "Property company"],
  ["other", "Other"],
];
export const roleLabel = (k) => ENTITY_ROLES.find(([v]) => v === k)?.[1] ?? k;
export const DOC_CATEGORIES = ["Org chart", "Formation documents", "Operating agreement", "Good standing", "Other legal"];

const pct = (v) => (v == null || !isFinite(v) ? "—" : `${Number(v).toFixed(2).replace(/\.00$/, "")}%`);
const money = (v) => (v == null || !isFinite(v) || !v ? "—" : `$${Math.round(v).toLocaleString("en-US")}`);
const months = (a, b) => {
  const x = parseDate(a), y = parseDate(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
};
export const einLast4 = (v) => String(v ?? "").replace(/\D/g, "").slice(-4);

export function keyDates(terms, todayISO) {
  const fd = fundDates(terms);
  return {
    launch: terms.launchDate || "",
    finalClose: fd.finalClose,
    investmentPeriodEnd: fd.investmentPeriodEnd,
    fundEnd: fd.fundEnd,
    outsideDate: fd.extendedEnd,
    ipMonthsLeft: Math.max(0, months(todayISO, fd.investmentPeriodEnd)),
    termMonthsLeft: Math.max(0, months(todayISO, fd.fundEnd)),
  };
}

export function keyTerms(terms) {
  const tiers = (terms.tiers ?? []).map((t, i) => `${t.irrThreshold != null ? `to ${t.irrThreshold}% IRR` : i ? "above" : "all"}: ${t.lpSplit}/${t.gpSplit}`).join("; ");
  const lpPct = 100 - (Number(terms.gpCommitPct) || 0);
  const commit = Number(terms.targetEquity) || 0;
  return [
    ["Fund type", fundType(terms.type)],
    ["Commitments", `${money(commit)} (LP ${money(commit * (lpPct / 100))}, GP ${money(commit * ((Number(terms.gpCommitPct) || 0) / 100))}, ${pct(terms.gpCommitPct)})`],
    ["Preferred return", pct(terms.prefPct)],
    ["Hurdle (cost of capital)", terms.hurdleRatePct != null ? pct(terms.hurdleRatePct) : `same as the pref (${pct(terms.prefPct)})`],
    ["GP catch-up", pct(terms.catchUpGpPct)],
    ["Promote tiers (LP/GP)", tiers || "—"],
    ["Income treatment", terms.incomeTreatment === "full" ? "Full waterfall" : "Pays pref, then returns capital"],
    ["Management fee", `${pct(terms.mgmtFeePct)} a year on ${terms.mgmtFeeBasis === "invested" ? "invested capital" : "LP commitments in the investment period, then invested capital"}`],
    ["Investment period", `${terms.investmentPeriodYears ?? "—"} years`],
    ["Term", `${terms.termYears ?? "—"} years + ${terms.extensionCount ?? 0} × ${terms.extensionYears ?? 1}-year extension${(terms.extensionCount ?? 0) === 1 ? "" : "s"}`],
    ["Distribution policy", terms.distributionPolicy === "payout" ? `Pay out ${pct(terms.incomePayoutPct)} of operating cash` : `Keep ${terms.reserveYears ?? 1} year(s) of reserves, distribute the rest`],
    ["Fund cash reserve", `${terms.cashReserveQuarters ?? 2} quarters of fund expenses`],
    ["Subscription line", terms.subLineEnabled === false ? "None" : `${pct(terms.subLineSizePct)} of commitments, SOFR + ${pct(terms.subLineSpreadPct)}, ${pct(terms.subLineUnusedFeePct)} unused fee, draws up to ${terms.subLineMaxDays ?? 365} days`],
    ["Investment limits", (terms.limits ?? []).length ? terms.limits.map((l) => `${l.label}: ${l.limit}${l.unit === "%" ? "%" : l.unit === "years" ? " yrs" : ""}`).join("; ") : "None applied (Documents tab → LPA / PPM)"],
    ["Key person", terms.keyPerson || "—"],
    ["GP removal", terms.removal || "—"],
  ];
}

// deals: the fund's deals (inputs). Capital called from capital activity when
// entered, else the model's purchase equity to date.
export function capitalSummary(terms, deals, todayISO) {
  const commitments = Number(terms.targetEquity) || 0;
  const held = deals.filter((d) => (d.inputs.acquisitionDate || terms.finalClose) <= todayISO);
  const eq = (d) => { try { return underwrite(d.inputs).debt?.equityRequired ?? 0; } catch { return 0; } };
  const deployed = held.reduce((s, d) => s + eq(d), 0);
  const fd = fundDates(terms);
  const act = (terms.capitalActivity ?? []).length ? actualCapital(terms.capitalActivity, { todayISO, ipEndISO: fd.investmentPeriodEnd, commitments, modelCalls: [] }) : null;
  const called = act?.hasActuals ? act.calledToDate : deployed;
  const lineSize = terms.subLineEnabled === false ? 0 : commitments * ((Number(terms.subLineSizePct) || 0) / 100);
  const lineDrawn = act?.hasActuals ? act.lineToday : null;
  const reserve = (Number(terms.cashReserveQuarters ?? 2) * commitments * ((Number(terms.mgmtFeePct) || 0) / 100)) / 4;
  return {
    commitments,
    called,
    calledSource: act?.hasActuals ? "capital activity" : "model (purchase equity to date)",
    pctCalled: commitments > 0 ? (called / commitments) * 100 : null,
    deployed,
    assets: held.length,
    dryPowder: commitments > 0 ? commitments - called - (lineDrawn ?? 0) : null,
    dryPowderAfterReserves: commitments > 0 ? commitments - called - (lineDrawn ?? 0) - reserve : null,
    reserve,
    lineSize,
    lineDrawn,
  };
}

// Ownership chart: fund at the top, its property companies beneath; GP and
// manager beside it. parentId links override the defaults.
export function ownershipTree(entities = []) {
  const byId = new Map(entities.map((e) => [e.id, { ...e, children: [] }]));
  const fund = entities.find((e) => e.role === "fund");
  const roots = [];
  for (const e of byId.values()) {
    const parent = e.parentId ? byId.get(e.parentId) : e.role === "asset" && fund && e.id !== fund.id ? byId.get(fund.id) : null;
    if (parent && parent !== e) parent.children.push(e);
    else roots.push(e);
  }
  const order = { gp: 0, fund: 1, manager: 2, other: 3, asset: 4 };
  return roots.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
}

// Entities' annual-report dates for the critical-dates list (Leases tab).
export function entityDates(entities = [], fundName = "") {
  return entities.filter((e) => e.annualReportDue).map((e) => ({ date: e.annualReportDue, kind: "milestone", label: `Annual report: ${e.name}${e.state ? ` (${e.state})` : ""}`, asset: fundName, dealId: e.dealId ?? null, status: "", owner: e.agent ?? "" }));
}

// One entity per fund asset that doesn't have one yet ("<Asset> LLC").
export function suggestAssetEntities(entities = [], deals = [], fundEntityId = null) {
  const have = new Set(entities.filter((e) => e.dealId).map((e) => e.dealId));
  return deals.filter((d) => !have.has(d.id)).map((d, i) => ({ id: `ent-${Date.now().toString(36)}-${i}`, name: `${d.inputs.propertyName} LLC`, role: "asset", state: d.inputs.state || "", formed: "", einLast4: "", agent: "", annualReportDue: "", dealId: d.id, parentId: fundEntityId }));
}

export function summaryXlsx(fundName, terms, dates, capital, entities) {
  return [
    [`${fundName}: fund summary`],
    [],
    ["Key dates"],
    ["Launch", dates.launch], ["Final close", dates.finalClose], ["Investment period ends", dates.investmentPeriodEnd], ["End of term", dates.fundEnd], ["Outside date (all extensions)", dates.outsideDate], ["Months left in the investment period", dates.ipMonthsLeft],
    [],
    ["Key terms"],
    ...keyTerms(terms),
    [],
    ["Capital"],
    ["Commitments (raised)", capital.commitments], ["Called", capital.called], ["% called", capital.pctCalled], ["Deployed in assets", capital.deployed], ["Dry powder", capital.dryPowder], ["Dry powder after reserves", capital.dryPowderAfterReserves], ["Sub line size", capital.lineSize], ["Sub line drawn", capital.lineDrawn],
    [],
    ["Legal entity", "Role", "State", "Formed", "EIN (last 4)", "Registered agent", "Annual report due", "Owned by"],
    ...entities.map((e) => [e.name, roleLabel(e.role), e.state, e.formed, e.einLast4 ? `••••${e.einLast4}` : "", e.agent, e.annualReportDue, entities.find((x) => x.id === e.parentId)?.name ?? ""]),
  ];
}

export { addYears };
