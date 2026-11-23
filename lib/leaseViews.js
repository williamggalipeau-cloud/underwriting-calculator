// ─── Fund lease views (lease abstraction phase D) ────────────────────────────
// Every critical date and risk flag from the abstracts, for one asset or the
// whole fund, plus per-asset lease figures for the Asset Summary.
//
//   criticalDates(leases, { assetName, asOf, credit }) → rows, oldest first
//   riskFlags(leases, { assetName }) → rows, most severe first
//   leaseSummaryByDeal(leases, { asOf, credit }) → Map(dealId → summary)
//   criticalDateRows / riskFlagRows → Excel rows (header first)

import { fieldOf } from "@/lib/leaseAbstract";
import { creditFlags } from "@/lib/tenantCredit";
import { TYPE as DOC_TYPE, dateOf } from "@/lib/dealDocTypes";

const DAY = 86_400_000;
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY);

export const DATE_KINDS = {
  lease_date: "Lease signed",
  commencement: "Commencement",
  rent_commencement: "Rent commencement",
  rent_increase: "Rent increase",
  abatement_end: "Free rent ends",
  renewal_notice: "Renewal notice",
  termination_notice: "Termination notice",
  termination_effective: "Termination date",
  option_exercise: "Option deadline",
  expiration: "Expiration",
  statements_due: "Financial statements due",
  document: "Document deadline",
  insurance_expiry: "Insurance expires",
  other: "Other deadline",
  response: "Response period (on request)",
};

// Status of a date: past, within 90 days ("soon"), later; response periods have none.
export function dateStatus(date, asOf, soonDays = 90) {
  if (!date) return "standing";
  const d = daysBetween(asOf, date);
  return d < 0 ? "past" : d <= soonDays ? "soon" : "later";
}

// Deadlines from deal documents (phase E): each abstract's critical dates and
// every insurance policy's expiry (amber 60 days before, red when lapsed).
export function documentDates(docs, { assetName = (id) => id, asOf = new Date().toISOString().slice(0, 10), fundLabel = (d) => d.fund_name || "Fund" } = {}) {
  const rows = [];
  for (const doc of docs ?? []) {
    const abs = doc.abstract;
    if (!abs) continue;
    const ref = { leaseId: null, docId: doc.id, dealId: doc.deal_id, asset: doc.deal_id ? assetName(doc.deal_id) : fundLabel(doc), tenant: `${DOC_TYPE[doc.doc_type]?.label ?? doc.doc_type}${doc.title ? ` · ${doc.title}` : ""}` };
    for (const c of abs.critical_dates ?? []) {
      if (!c?.date) continue;
      rows.push({ ...ref, date: c.date, kind: "document", kindLabel: DATE_KINDS.document, label: c.label, notice: c.notice ?? "", action: c.action ?? "", clause: c.clause ?? "", calculation: c.calculation ?? "", quote: c.evidence?.[0]?.quote ?? "", page: c.evidence?.[0]?.page ?? null, source: "document", status: dateStatus(c.date, asOf), days: daysBetween(asOf, c.date) });
    }
    if (doc.doc_type === "insurance_cert") {
      for (const p of abs.policies ?? []) {
        const exp = dateOf(p.expiry) || p.expiry;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(exp ?? "")) continue;
        rows.push({ ...ref, date: exp, kind: "insurance_expiry", kindLabel: DATE_KINDS.insurance_expiry, label: `${p.coverage} policy ${p.policy_no ?? ""} expires`.replace(/\s+/g, " "), notice: "", action: "Get the renewal certificate", clause: "", calculation: "", quote: p.evidence?.[0]?.quote ?? "", page: null, source: "document", status: dateStatus(exp, asOf, 60), days: daysBetween(asOf, exp) });
      }
    }
  }
  return rows;
}

// Classifies a lease into an item of the views.
const leaseRef = (l, assetName) => ({ leaseId: l.id, dealId: l.deal_id, asset: assetName(l.deal_id), tenant: l.tenant || l.abstract?.title || "Lease" });

export function criticalDates(leases, { assetName = (id) => id, asOf = new Date().toISOString().slice(0, 10), credit = null, includeHistory = true, docs = null } = {}) {
  const rows = docs ? documentDates(docs, { assetName, asOf }) : [];
  for (const l of leases) {
    const abs = l.abstract;
    if (!abs) continue;
    const ref = leaseRef(l, assetName);
    for (const c of abs.critical_dates ?? []) {
      if (!includeHistory && ["lease_date", "commencement", "rent_commencement"].includes(c.kind)) continue;
      rows.push({
        ...ref,
        date: c.date,
        kind: c.kind ?? "other",
        kindLabel: DATE_KINDS[c.kind] ?? c.kind ?? "Other",
        label: c.label,
        notice: c.notice ?? "",
        action: c.action ?? "",
        clause: c.clause ?? "",
        calculation: c.calculation ?? "",
        quote: c.evidence?.[0]?.quote ?? "",
        page: c.evidence?.[0]?.page ?? null,
        source: "abstract",
        status: dateStatus(c.date, asOf),
        days: daysBetween(asOf, c.date),
      });
    }
    // Response periods on request (SNDA, estoppel): no date, shown last.
    for (const [key, label] of [["subordination", "SNDA"], ["estoppel", "Estoppel certificate"]]) {
      const f = fieldOf(abs, key);
      if (!f || f.status === "not_in_lease") continue;
      const m = String(f.value).match(/within\s+([a-z]+\s*\(\d+\)|\d+)\s*(business\s+)?days/i);
      if (!m) continue;
      rows.push({
        ...ref, date: "", kind: "response", kindLabel: DATE_KINDS.response, label: `${label}: respond ${m[0]} after request`,
        notice: "", action: `Tenant must deliver the ${label} ${m[0]} after Landlord's request`, clause: f.clause ?? "", calculation: "",
        quote: f.evidence?.[0]?.quote ?? "", page: f.evidence?.[0]?.page ?? null, source: "abstract", status: "standing", days: Infinity,
      });
    }
    // Financial statements due (owners and editors: credit documents loaded).
    if (credit) {
      const due = creditFlags(credit.filter((d) => d.lease_id === l.id), { abs, asOf }).find((f) => f.kind === "due" && f.due);
      if (due) {
        rows.push({
          ...ref, date: due.due, kind: "statements_due", kindLabel: DATE_KINDS.statements_due, label: "Tenant financial statements due",
          notice: `${due.req.frequency}, within ${due.req.days} days of period end`, action: "Request the statements and add them under Tenant credit",
          clause: due.req.clause, calculation: "", quote: due.req.quote, page: null, source: "credit", status: dateStatus(due.due, asOf), days: daysBetween(asOf, due.due),
        });
      }
    }
  }
  return rows.sort((a, b) => (a.date === b.date ? 0 : !a.date ? 1 : !b.date ? -1 : a.date < b.date ? -1 : 1));
}

// Risk types for filtering, matched on the flag's title and detail.
export const RISK_TYPES = [
  ["termination", "Termination rights", /terminat|kick.?out|early (exit|out)/i],
  ["relocation", "Relocation", /relocat/i],
  ["expenses", "Expenses and caps", /expense|cap\b|uncapped|operating cost|cam\b|base year/i],
  ["environmental", "Environmental", /environment|hazard|battery|pollut|contamina/i],
  ["guaranty", "Guaranty and credit", /guarant|credit|deposit|security/i],
  ["options", "Options and rights", /option|rofr|rofo|right of first|expansion|exclusive|renewal/i],
  ["rent", "Rent and concessions", /rent|abate|free|allowance|ti\b|holdover/i],
  ["other", "Other", /.*/],
];
export const riskType = (r) => RISK_TYPES.find(([, , re]) => re.test(`${r.title} ${r.detail ?? ""}`))[0];
const SEV = { high: 0, medium: 1, low: 2 };

export function riskFlags(leases, { assetName = (id) => id } = {}) {
  const rows = [];
  for (const l of leases) {
    const abs = l.abstract;
    if (!abs) continue;
    const ref = leaseRef(l, assetName);
    for (const r of abs.risks ?? []) {
      const type = riskType(r);
      rows.push({
        ...ref, severity: r.severity ?? "low", title: r.title, detail: r.detail ?? "", clause: r.clause ?? "",
        quote: r.evidence?.[0]?.quote ?? "", page: r.evidence?.[0]?.page ?? null, type, typeLabel: RISK_TYPES.find((t) => t[0] === type)[1],
      });
    }
  }
  return rows.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.asset.localeCompare(b.asset) || a.tenant.localeCompare(b.tenant));
}

// Per asset: leases, abstracted, applied, next critical date, risk flags.
export function leaseSummaryByDeal(leases, { asOf = new Date().toISOString().slice(0, 10), credit = null } = {}) {
  const m = new Map();
  for (const l of leases) {
    const e = m.get(l.deal_id) ?? { leases: 0, abstracted: 0, applied: 0, risks: 0, highRisks: 0, next: null, pastDue: 0 };
    e.leases += 1;
    if (l.abstract) e.abstracted += 1;
    if (l.status === "applied") e.applied += 1;
    for (const r of l.abstract?.risks ?? []) {
      e.risks += 1;
      if (r.severity === "high") e.highRisks += 1;
    }
    m.set(l.deal_id, e);
  }
  for (const d of criticalDates(leases, { asOf, credit, includeHistory: false })) {
    const e = m.get(d.dealId);
    if (!d.date) continue;
    if (d.date >= asOf && (!e.next || d.date < e.next.date)) e.next = d;
  }
  return m;
}

const usDate = (iso) => {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-");
  return `${Number(mo)}/${Number(d)}/${y}`;
};
const STATUS_TEXT = { past: "Past", soon: "Within 90 days", later: "Later", standing: "On request" };

export function criticalDateRows(rows) {
  return [
    ["Date", "Status", "Days", "Asset", "Tenant", "Type", "Event", "Notice", "Action", "Clause", "Calculation", "Quote", "Page"],
    ...rows.map((r) => [usDate(r.date), STATUS_TEXT[r.status], isFinite(r.days) ? r.days : "", r.asset, r.tenant, r.kindLabel, r.label, r.notice, r.action, r.clause, r.calculation, r.quote, r.page ?? ""]),
  ];
}

export function riskFlagRows(rows) {
  return [
    ["Severity", "Type", "Asset", "Tenant", "Risk", "Detail", "Clause", "Quote", "Page"],
    ...rows.map((r) => [r.severity, r.typeLabel, r.asset, r.tenant, r.title, r.detail, r.clause, r.quote, r.page ?? ""]),
  ];
}
