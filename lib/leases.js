import { sicTitle } from "@/lib/sicCodes";
// ─── Units and leases: counts, occupancy and lease analytics ─────────────────
// Reference figures from each deal's rent roll (inputs.units). Nothing here
// feeds the cash flow: the engine still uses each unit's months remaining,
// rent and escalation. Entering a lease end date sets months remaining (from
// the analysis start) so the two stay consistent.

const DAY = 86_400_000;
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Adds whole months to an ISO date (day clamped to the month's last day).
export function addMonthsISO(iso, months) {
  const d = toDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(months));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

// Whole months from a to b (rounded; negative when b is before a).
export function monthsBetween(aISO, bISO) {
  const a = toDate(aISO);
  const b = toDate(bISO);
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return m + (b.getUTCDate() - a.getUTCDate()) / 30;
}

// Where the cash flow starts: the acquisition date, else today.
export const analysisStart = (inputs) => (isISO(inputs?.acquisitionDate) ? inputs.acquisitionDate : todayISO());

// Months remaining (from the analysis start) implied by a lease end date.
export const monthsRemainingFor = (inputs, leaseEndISO) =>
  isISO(leaseEndISO) ? Math.max(0, Math.round(monthsBetween(analysisStart(inputs), leaseEndISO))) : null;

// A unit's lease end: the entered date, else analysis start + months remaining.
export function leaseEndOf(unit, inputs) {
  if (unit.leaseStatus !== "occupied") return null;
  if (isISO(unit.leaseEnd)) return unit.leaseEnd;
  return addMonthsISO(analysisStart(inputs), Number(unit.monthsRemaining) || 0);
}

// Lease fields added to each rent roll unit (all optional).
export const LEASE_FIELDS = [
  { key: "leaseStart", label: "Lease start", type: "date" },
  { key: "leaseEnd", label: "Lease end", type: "date", help: "Sets months remaining" },
  { key: "securityDeposit", label: "Security deposit", type: "money" },
  { key: "guarantor", label: "Guarantor", type: "text" },
  { key: "recoveries", label: "Expense recoveries", type: "text", help: "e.g. NNN, tenant pays all; base year 2026" },
  { key: "renewalOptions", label: "Renewal options (count)", type: "number" },
  { key: "renewalOptionYears", label: "Years per option", type: "number" },
  { key: "renewalNoticeMonths", label: "Renewal notice (months before end)", type: "number" },
  { key: "renewalRentBasis", label: "Renewal rent", type: "text", help: "e.g. 95% of market; fixed $15.00" },
  { key: "terminationDate", label: "Early termination date", type: "date" },
  { key: "terminationNoticeMonths", label: "Termination notice (months)", type: "number" },
  { key: "terminationFee", label: "Termination fee", type: "money" },
  { key: "otherRights", label: "Expansion / ROFR / other rights", type: "text" },
  { key: "leaseNotes", label: "Notes", type: "text" },
];

// Units, leased units and occupancy for one deal. With a rent roll, these
// come from it; otherwise the entered unit count (occupancy unknown).
export function unitStats(inputs = {}) {
  const units = inputs.units ?? [];
  if (units.length) {
    const sf = units.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0);
    const leased = units.filter((u) => u.leaseStatus === "occupied");
    const leasedSF = leased.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0);
    return {
      units: units.length,
      leased: leased.length,
      vacant: units.length - leased.length,
      occupancyPct: sf > 0 ? (leasedSF / sf) * 100 : NaN,
      leasedSF,
      sf,
      fromRentRoll: true,
    };
  }
  const n = Math.max(0, Math.round(Number(inputs.unitCount) || 0));
  return { units: n, leased: null, vacant: null, occupancyPct: NaN, leasedSF: NaN, sf: Number(inputs.squareFootage) || 0, fromRentRoll: false };
}

// Lease analytics for one deal as of a date: rent-weighted remaining term,
// in-place vs market rent, expirations by year and upcoming critical dates.
// Leased SF and rent by SIC code, largest first.
function industryMix(leases, leasedSF) {
  const by = new Map();
  for (const l of leases) {
    const code = String(l.unit.sicCode ?? "").trim() || "—";
    const e = by.get(code) ?? { sicCode: code, title: code === "—" ? "No SIC code" : sicTitle(code), leases: 0, sf: 0, annualRent: 0 };
    e.leases += 1; e.sf += l.sf; e.annualRent += l.annualRent;
    by.set(code, e);
  }
  return [...by.values()].map((e) => ({ ...e, pctSF: leasedSF ? (e.sf / leasedSF) * 100 : 0 })).sort((a, b) => b.sf - a.sf);
}

export function leaseAnalytics(inputs = {}, asOf = todayISO(), { horizonMonths = 12 } = {}) {
  const units = inputs.units ?? [];
  const market = Number(inputs.rentPerSF) || 0;
  const leases = units
    .filter((u) => u.leaseStatus === "occupied")
    .map((u) => {
      const sf = Number(u.squareFeet) || 0;
      const rentPSF = Number(u.currentRentPSF) || 0;
      const end = leaseEndOf(u, inputs);
      return { unit: u, sf, rentPSF, annualRent: rentPSF * sf, end, yearsLeft: Math.max(0, monthsBetween(asOf, end) / 12) };
    });
  const totalRent = leases.reduce((s, l) => s + l.annualRent, 0);
  const leasedSF = leases.reduce((s, l) => s + l.sf, 0);
  const walt = totalRent > 0 ? leases.reduce((s, l) => s + l.yearsLeft * l.annualRent, 0) / totalRent : NaN;
  const waltSF = leasedSF > 0 ? leases.reduce((s, l) => s + l.yearsLeft * l.sf, 0) / leasedSF : NaN;
  const inPlace = leasedSF > 0 ? totalRent / leasedSF : NaN;

  // Expirations by calendar year (expired leases still in occupancy count as
  // the current year: month-to-month or holdover).
  const thisYear = Number(asOf.slice(0, 4));
  const byYear = new Map();
  for (const l of leases) {
    const y = Math.max(thisYear, Number(l.end.slice(0, 4)));
    const e = byYear.get(y) ?? { year: y, leases: 0, sf: 0, annualRent: 0 };
    e.leases += 1;
    e.sf += l.sf;
    e.annualRent += l.annualRent;
    byYear.set(y, e);
  }
  let cumRent = 0;
  const expirations = [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .map((e) => {
      cumRent += e.annualRent;
      return { ...e, pctRent: totalRent ? (e.annualRent / totalRent) * 100 : 0, cumPctRent: totalRent ? (cumRent / totalRent) * 100 : 0 };
    });

  // Critical dates: lease expirations, renewal notice deadlines and early
  // termination notice dates, from 30 days ago to the horizon.
  const until = addMonthsISO(asOf, horizonMonths);
  const from = new Date(toDate(asOf) - 30 * DAY).toISOString().slice(0, 10);
  const dates = [];
  const push = (date, kind, l, detail) => {
    if (isISO(date) && date >= from && date <= until) {
      dates.push({ date, kind, unit: l.unit.name, tenant: l.unit.tenantName || "", detail, days: Math.round((toDate(date) - toDate(asOf)) / DAY) });
    }
  };
  for (const l of leases) {
    const u = l.unit;
    push(l.end, "Lease expires", l, `${l.sf.toLocaleString()} SF · $${Math.round(l.annualRent).toLocaleString()}/yr`);
    if (Number(u.renewalOptions) > 0 && Number(u.renewalNoticeMonths) > 0) {
      push(addMonthsISO(l.end, -Number(u.renewalNoticeMonths)), "Renewal notice due", l,
        `${u.renewalOptions} × ${u.renewalOptionYears || "?"}-yr option${u.renewalRentBasis ? ` at ${u.renewalRentBasis}` : ""}`);
    }
    if (isISO(u.terminationDate)) {
      const notice = Number(u.terminationNoticeMonths) || 0;
      push(addMonthsISO(u.terminationDate, -notice), "Termination notice date", l,
        `Tenant may end the lease ${u.terminationDate}${u.terminationFee ? ` (fee $${Number(u.terminationFee).toLocaleString()})` : ""}`);
    }
  }
  dates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    leases: leases.length,
    leasedSF,
    totalRent,
    walt,
    waltSF,
    inPlaceRentPSF: inPlace,
    marketRentPSF: market,
    markToMarketPct: market > 0 && isFinite(inPlace) ? (market / inPlace - 1) * 100 : NaN,
    expirations,
    criticalDates: dates,
    industryMix: industryMix(leases, leasedSF),
    // Share of rent expiring within the horizon.
    rolloverPct: totalRent ? (leases.filter((l) => l.end <= until).reduce((s, l) => s + l.annualRent, 0) / totalRent) * 100 : 0,
  };
}

// ─── Rent roll import / export (CSV or Excel) ────────────────────────────────

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s_/().$%-]+/g, "");
const num = (v) => {
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return isFinite(n) ? n : NaN;
};
// Excel dates may arrive as serial numbers.
const date = (v) => {
  if (v == null || v === "") return "";
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * DAY).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (isISO(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
};
const status = (v) => (/^(occupied|occ|leased|yes|true|1|y)$/i.test(String(v).trim()) ? "occupied" : "vacant");
const leaseType = (v) => {
  const t = String(v).trim().toUpperCase();
  return t === "MG" ? "MG" : t === "GROSS" ? "Gross" : "NNN";
};

// Column → unit field. The first label is the template's header.
export const RENT_ROLL_COLUMNS = [
  { label: "Unit", keys: ["unit", "unitname", "name", "suite"], field: "name", parse: String },
  { label: "SF", keys: ["sf", "squarefeet", "squarefoot", "sqft", "size", "rsf"], field: "squareFeet", parse: num },
  { label: "Tenant", keys: ["tenant", "tenantname", "lessee"], field: "tenantName", parse: String },
  { label: "Business", keys: ["business", "description", "businessdesc", "use"], field: "businessDescription", parse: String },
  { label: "Credit", keys: ["credit", "creditrating", "rating"], field: "creditRating", parse: String },
  { label: "SIC", keys: ["sic", "siccode", "sicno"], field: "sicCode", parse: (v) => String(v).trim().replace(/\.0+$/, "").padStart(4, "0") },
  { label: "NAICS", keys: ["naics", "naicscode", "industry"], field: "naicsCode", parse: String },
  { label: "Status", keys: ["status", "leasestatus", "occupied"], field: "leaseStatus", parse: status },
  { label: "Lease type", keys: ["leasetype", "type"], field: "leaseType", parse: leaseType },
  { label: "Rent $/SF", keys: ["rent", "rentpsf", "rentsf", "currentrent", "contractedrent", "baserent"], field: "currentRentPSF", parse: num },
  { label: "Escalation %", keys: ["escalation", "escpct", "annualescalation", "esc"], field: "annualEscalationPct", parse: num },
  { label: "Other income $/SF", keys: ["otherincome", "otherinc", "otherincomepsf", "otherincomesf"], field: "otherIncomePSF", parse: num },
  { label: "Lease start", keys: ["leasestart", "start", "commencement", "commencementdate", "startdate"], field: "leaseStart", parse: date },
  { label: "Lease end", keys: ["leaseend", "end", "expiration", "expirationdate", "expires", "enddate"], field: "leaseEnd", parse: date },
  { label: "Months remaining", keys: ["monthsremaining", "moleft", "moremaining", "months"], field: "monthsRemaining", parse: num },
  { label: "Security deposit", keys: ["securitydeposit", "deposit"], field: "securityDeposit", parse: num },
  { label: "Guarantor", keys: ["guarantor", "guaranty", "guarantee"], field: "guarantor", parse: String },
  { label: "Recoveries", keys: ["recoveries", "expenserecoveries", "recovery"], field: "recoveries", parse: String },
  { label: "Renewal options", keys: ["renewaloptions", "options"], field: "renewalOptions", parse: num },
  { label: "Years per option", keys: ["yearsperoption", "optionyears", "renewalyears"], field: "renewalOptionYears", parse: num },
  { label: "Renewal notice (months)", keys: ["renewalnoticemonths", "renewalnotice", "noticemonths"], field: "renewalNoticeMonths", parse: num },
  { label: "Renewal rent", keys: ["renewalrent", "renewalrentbasis", "optionrent"], field: "renewalRentBasis", parse: String },
  { label: "Termination date", keys: ["terminationdate", "earlytermination", "termination"], field: "terminationDate", parse: date },
  { label: "Termination notice (months)", keys: ["terminationnoticemonths", "terminationnotice"], field: "terminationNoticeMonths", parse: num },
  { label: "Termination fee", keys: ["terminationfee"], field: "terminationFee", parse: num },
  { label: "Other rights", keys: ["otherrights", "rights", "expansion", "rofr"], field: "otherRights", parse: String },
  { label: "Notes", keys: ["notes", "leasenotes", "comments"], field: "leaseNotes", parse: String },
  { label: "New term (months)", keys: ["newterm", "newleaseterm", "newtermmonths", "leasetermmonths"], field: "newLeaseTerm", parse: num },
  { label: "Renewal %", keys: ["renewalpct", "renew", "renewalprob", "renewalprobability"], field: "renewalProbabilityPct", parse: num },
  { label: "TI new $/SF", keys: ["tinew", "tipersfnew", "tinewsf"], field: "tiNewPSF", parse: num },
  { label: "TI renewal $/SF", keys: ["tirenewal", "tiren", "tipersfrenewal", "tirenewalsf"], field: "tiRenewalPSF", parse: num },
  { label: "LC new %", keys: ["lcnew", "leasingcommissionnew", "lcnewpct"], field: "leasingCommissionNewPct", parse: num },
  { label: "LC renewal %", keys: ["lcrenewal", "lcren", "leasingcommissionrenewal"], field: "leasingCommissionRenewalPct", parse: num },
  { label: "RE tax $/SF", keys: ["retax", "realestatetax", "retaxpsf", "taxpsf", "retaxsf"], field: "realEstateTaxPSF", parse: num },
  { label: "Insurance $/SF", keys: ["insurance", "insurancepsf", "ins", "insurancesf"], field: "insurancePSF", parse: num },
  { label: "Utilities $/SF", keys: ["utilities", "utilpsf", "utils", "utilitiessf"], field: "utilitiesPSF", parse: num },
  { label: "Maintenance $/SF", keys: ["maintenance", "maintpsf", "maint", "maintenancesf"], field: "maintenancePSF", parse: num },
  { label: "Janitorial $/SF", keys: ["janitorial", "janitpsf", "janit", "janitorialsf"], field: "janitorialPSF", parse: num },
];
const NUMERIC = new Set(RENT_ROLL_COLUMNS.filter((c) => c.parse === num).map((c) => c.field));

// rows: array of arrays, header first. defaults(i) gives a new unit's
// starting values. Returns units; throws with a readable message.
export function parseRentRollRows(rows, defaults, inputs) {
  const clean = rows.filter((r) => r && r.some((c) => String(c ?? "").trim() !== ""));
  if (clean.length < 2) throw new Error("The file needs a header row and at least one unit.");
  const header = clean[0].map(norm);
  const idx = [];
  header.forEach((h, col) => {
    const c = RENT_ROLL_COLUMNS.find((x) => norm(x.label) === h || x.keys.includes(h));
    if (c && !idx.some((x) => x.c.field === c.field)) idx.push({ c, col });
  });
  if (!idx.some((x) => x.c.field === "squareFeet")) throw new Error('Required column not found: "SF". Check the header row.');
  const units = [];
  clean.slice(1).forEach((r, i) => {
    const u = defaults(i);
    for (const { c, col } of idx) {
      const raw = r[col];
      if (raw == null || String(raw).trim() === "") continue;
      const v = c.parse(raw);
      if (NUMERIC.has(c.field)) {
        if (isFinite(v)) u[c.field] = Math.max(0, v);
      } else if (v !== "") u[c.field] = v;
    }
    if (!(u.squareFeet > 0)) return;
    if (u.leaseStatus !== "occupied") u.monthsRemaining = 0;
    else if (isISO(u.leaseEnd)) u.monthsRemaining = Math.max(1, monthsRemainingFor(inputs, u.leaseEnd));
    units.push(u);
  });
  if (!units.length) throw new Error("No units found. Make sure the SF column has values above 0.");
  return units;
}

// Header + one row per unit, in template column order.
export function rentRollRows(units) {
  const header = RENT_ROLL_COLUMNS.map((c) => c.label);
  const rows = units.map((u) =>
    RENT_ROLL_COLUMNS.map((c) => {
      const v = u[c.field];
      if (c.field === "leaseStatus") return v === "occupied" ? "Occupied" : "Vacant";
      return v == null ? "" : v;
    })
  );
  return [header, ...rows];
}
