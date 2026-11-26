// Tenant Credit (user, 11/26, 1.1.8): the credit review of every tenant, on
// the Asset Management → Tenant Credit tab and in the risk report.
//
// Where the data lives (no database change):
//   - a prospect's credit screening on the prospect (inputs.leasing
//     .prospects[].screening): from a tenant-screening app (e.g. TurboTenant),
//     a credit agency report, or, when neither exists, our own assessment. It
//     is required before the prospect can move to Signed, and on signing it is
//     copied to the unit the lease is for;
//   - each tenant's credit records and credit-change flags on its rent roll
//     unit (inputs.units[].credit = { records, flags });
//   - credit reports and statements already filed on a lease
//     (lease_credit_documents, lib/creditDocs.js), with their automatic flags
//     (lib/tenantCredit.js creditFlags);
//   - rent 60+ days late from Aged Rent (lib/agedRent.js).
//
// Status: Weak (an open credit-change flag, a score below its threshold, our
// own assessment "Weak", a declined screening, or rent 60+ days late), Watch
// (issues noted or approved with conditions, a falling score, rising leverage,
// overdue statements), Missing (no credit record at all), else OK. A tenant
// is reviewed at renewal: the review is due at the lease's renewal notice
// deadline (its end less the renewal notice months), else at its end.
import { creditFlags, docDate } from "@/lib/tenantCredit";
import { addYears } from "@/lib/fundTimeline";

export const SCREEN_SOURCES = [["app", "Screening app report"], ["agency", "Credit agency report"], ["own", "Our own assessment"]];
export const SCORE_TYPES = [["consumer", "Consumer (FICO-type, 300–850)"], ["paydex", "D&B Paydex (0–100)"], ["intelliscore", "Experian Intelliscore (1–100)"]];
export const SCORE_TYPE_SHORT = { consumer: "Consumer", paydex: "Paydex", intelliscore: "Intelliscore" };
export const RESULTS = [["approved", "Approved"], ["conditions", "Approved with conditions"], ["declined", "Declined"]];
export const OWN_RATINGS = [["strong", "Strong"], ["acceptable", "Acceptable"], ["weak", "Weak"]];
// Weak-credit thresholds (user, 11/26: defaults; editable per portfolio as terms.creditThresholds).
export const DEFAULT_CREDIT_THRESHOLDS = { consumer: 650, paydex: 70, intelliscore: 40 };
export const STATUS_LABEL = { weak: "Weak", watch: "Watch", missing: "Missing", ok: "OK" };
const STATUS_ORDER = ["weak", "watch", "missing", "ok"];
const label = (list, k) => list.find(([v]) => v === k)?.[1] ?? k ?? "";

let seq = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export function makeScreening(o = {}) {
  return { source: "", provider: "", reportDate: "", scoreType: "", score: null, rating: "", result: "", issues: "", conditions: "", basis: "", by: "", at: "", ...o };
}

// What's still missing before a screening counts as done (it can't be left blank).
export function screeningMissing(s) {
  if (!s?.source) return ["where the screening comes from"];
  const miss = [];
  if (s.source === "own") {
    if (!s.rating) miss.push("our rating (Strong / Acceptable / Weak)");
    if (!String(s.basis ?? "").trim()) miss.push("the basis for it");
  } else {
    if (!String(s.provider ?? "").trim()) miss.push(s.source === "app" ? "the screening app" : "the credit agency");
    if (!s.reportDate) miss.push("the report date");
    if (!s.result) miss.push("the result");
  }
  return miss;
}
export const screeningComplete = (s) => screeningMissing(s).length === 0;

export const creditOf = (u) => ({ records: [], flags: [], ...(u?.credit ?? {}) });

// A screening or assessment as a credit record on the unit.
export function recordFrom(s, { kind = "screening", by = "", at = new Date().toISOString(), tenant = "" } = {}) {
  return { id: newId("cr"), kind: s.source === "own" ? "assessment" : kind, tenant, ...makeScreening(s), by: s.by || by, at: s.at || at, date: s.source === "own" ? (s.at || at).slice(0, 10) : s.reportDate };
}
export function makeFlag({ date, reason, by = "" }) {
  return { id: newId("cf"), date, reason: String(reason ?? "").trim(), by, at: new Date().toISOString(), status: "open", clearedAt: "", clearedBy: "", clearNote: "" };
}

export function scoreBelow(rec, thresholds = DEFAULT_CREDIT_THRESHOLDS) {
  const t = Number({ ...DEFAULT_CREDIT_THRESHOLDS, ...(thresholds ?? {}) }[rec?.scoreType]);
  const s = Number(rec?.score);
  return rec?.scoreType && rec?.score !== null && rec?.score !== "" && isFinite(s) && isFinite(t) ? s < t : false;
}

// The renewal review date: the lease end less its renewal notice months, else the lease end.
export function reviewDue(u) {
  const end = u?.leaseEnd;
  if (!end) return "";
  const m = Number(u.renewalNoticeMonths);
  if (!(m > 0)) return end;
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - m);
  return d.toISOString().slice(0, 10);
}

const rentOf = (u) => (u.leaseStatus === "occupied" ? (Number(u.currentRentPSF) || 0) * (Number(u.squareFeet) || 0) : 0);
const low = (s) => String(s ?? "").trim().toLowerCase();

// The latest credit record (unit records and lease credit reports), as one shape.
function latestOf(records, docs) {
  const fromDocs = docs.filter((d) => d.kind === "credit_report").map((d) => ({ date: docDate(d), source: "report", sourceLabel: `Credit report${d.source ? ` (${d.source})` : ""}`, score: d.figures?.score ?? null, scoreType: d.figures?.scoreType ?? "", rating: d.figures?.rating ?? "" }));
  const fromRecs = records.map((r) => ({ date: r.date || String(r.at ?? "").slice(0, 10), source: r.source, sourceLabel: r.source === "own" ? "Own assessment" : `${r.provider || label(SCREEN_SOURCES, r.source)}${r.kind === "screening" ? " (screening)" : ""}`, score: r.score, scoreType: r.scoreType, rating: r.source === "own" ? label(OWN_RATINGS, r.rating) : r.rating, result: r.result, rec: r }));
  return [...fromRecs, ...fromDocs].filter((x) => x.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).at(-1) ?? [...fromRecs, ...fromDocs].at(-1) ?? null;
}

// Every occupied unit with a tenant, with its credit status and reasons.
// creditDocs / leases: rows from the database (empty when signed out or a
// viewer); aged: agedRent() for these deals (or null); funds: fund terms by
// name (each fund's credit thresholds).
export function creditRows(deals, { creditDocs = [], leases = [], aged = null, funds = {}, thresholds = null, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const rows = [];
  const fundRent = {};
  for (const d of deals) for (const u of d.inputs?.units ?? []) fundRent[d.inputs.fundName ?? ""] = (fundRent[d.inputs.fundName ?? ""] ?? 0) + rentOf(u);
  for (const d of deals) {
    const inp = d.inputs ?? {};
    const th = { ...DEFAULT_CREDIT_THRESHOLDS, ...(funds?.[inp.fundName]?.creditThresholds ?? {}), ...(thresholds ?? {}) };
    for (const u of inp.units ?? []) {
      const tenant = String(u.tenantName ?? "").trim();
      if (u.leaseStatus !== "occupied" || !tenant) continue;
      const c = creditOf(u);
      const myLeases = leases.filter((l) => l.deal_id === d.id && ((l.unit_ids ?? []).includes(u.id) || (low(l.tenant) && low(l.tenant) === low(tenant))));
      const docs = creditDocs.filter((x) => myLeases.some((l) => l.id === x.lease_id));
      const latest = latestOf(c.records, docs);
      const reasons = [];
      const add = (level, code, text) => reasons.push({ level, code, text });
      for (const f of c.flags.filter((x) => x.status === "open")) add("weak", "flag", `Credit change: ${f.reason || "flagged"} (${f.date})`);
      const lastRec = [...c.records].sort((a, b) => ((a.date || a.at) < (b.date || b.at) ? -1 : 1)).at(-1);
      if (lastRec) {
        if (lastRec.source === "own" && lastRec.rating === "weak") add("weak", "own", `Own assessment: Weak${lastRec.basis ? ` (${lastRec.basis})` : ""}`);
        if (scoreBelow(lastRec, th)) add("weak", "score", `${SCORE_TYPE_SHORT[lastRec.scoreType] ?? "Score"} ${lastRec.score} below ${th[lastRec.scoreType]}`);
        if (lastRec.result === "declined") add("weak", "declined", "Screening result: declined");
        else if (lastRec.result === "conditions") add("watch", "conditions", `Approved with conditions${lastRec.conditions ? `: ${lastRec.conditions}` : ""}`);
        if (String(lastRec.issues ?? "").trim()) add("watch", "issues", `Issues noted: ${lastRec.issues}`);
      }
      for (const l of myLeases) {
        for (const f of creditFlags(docs.filter((x) => x.lease_id === l.id), { abs: l.abstract, asOf }).filter((x) => x.kind !== "missing" && x.severity === "high")) add("watch", f.kind, f.text);
      }
      const late = aged?.tenants.find((t) => t.unitId === u.id && t.dealId === d.id);
      if (late && late.late60 > 0.005) add("weak", "late", `Rent 60+ days late: $${Math.round(late.late60).toLocaleString("en-US")}`);
      const hasRecord = c.records.length > 0 || docs.length > 0;
      const status = reasons.some((r) => r.level === "weak") ? "weak" : reasons.some((r) => r.level === "watch") ? "watch" : !hasRecord ? "missing" : "ok";
      const rent = rentOf(u);
      rows.push({
        dealId: d.id, asset: inp.propertyName || d.id, fund: inp.fundName ?? "", unitId: u.id, unit: u.name || "", tenant,
        rent, pctFundRent: fundRent[inp.fundName ?? ""] ? (rent / fundRent[inp.fundName ?? ""]) * 100 : 0,
        leaseEnd: u.leaseEnd || "", reviewDue: reviewDue(u), latest, thresholds: th, status, reasons,
        openFlags: c.flags.filter((x) => x.status === "open"), late60: late?.late60 ?? 0, records: c.records, flags: c.flags, leaseIds: myLeases.map((l) => l.id), docs,
      });
    }
  }
  return rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.rent - a.rent || a.asset.localeCompare(b.asset));
}

// The tab's filters: needs attention (weak, watch or missing), review due at
// renewal within 12 months of asOf, all.
export function creditFilter(rows, filter, asOf) {
  if (filter === "attention") return rows.filter((r) => r.status !== "ok");
  if (filter === "review") { const until = addYears(asOf, 1); return rows.filter((r) => r.reviewDue && r.reviewDue >= asOf && r.reviewDue <= until).sort((a, b) => (a.reviewDue < b.reviewDue ? -1 : 1)); }
  return rows;
}

// Signing a lease (1.1.8): the prospect's screening must be complete; it is
// then copied to the unit as a credit record. Returns the next inputs, or
// { error } when the screening isn't done.
export function signProspect(inputs, prospectId, { by = "", at = new Date().toISOString() } = {}) {
  const prospects = inputs?.leasing?.prospects ?? [];
  const p = prospects.find((x) => x.id === prospectId);
  if (!p) return { error: "Prospect not found." };
  const miss = screeningMissing(p.screening);
  if (miss.length) return { error: `Record the credit screening before marking ${p.tenant || "this prospect"} signed: ${miss.join(", ")}.` };
  const next = { ...inputs, leasing: { ...inputs.leasing, prospects: prospects.map((x) => (x.id === prospectId ? { ...x, stage: "signed" } : x)) } };
  if (p.unitId) {
    next.units = (inputs.units ?? []).map((u) => {
      if (u.id !== p.unitId) return u;
      const c = creditOf(u);
      return { ...u, credit: { ...c, records: [...c.records, recordFrom(p.screening, { by, at, tenant: p.tenant })] } };
    });
  }
  return { inputs: next };
}

export const latestText = (l) => (l ? `${l.sourceLabel}${l.date ? ` · ${l.date}` : ""}` : "None on file");
