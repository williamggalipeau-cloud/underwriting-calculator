// ─── Applying a lease abstract to the rent roll (phase C) ────────────────────
// Reads a validated abstract (lib/leaseAbstract) into rent roll unit fields,
// compares them with the unit(s) the lease covers, and builds the unit the
// user applies. Nothing changes until the user ticks fields and applies.
//
//   abstractUnitValues(abs, inputs) → { values, notes }   unit fields from the abstract
//   compareWithUnit(abs, unit, inputs) → rows             one row per field
//   applyAbstract(units, abs, { target, fields, inputs, newUnit }) → { units, unit, entries }
//   leaseMismatches(abs, unit, inputs) → rows that differ (the mismatch flags)

import { abstractIndustry, fieldOf } from "@/lib/leaseAbstract";
import { analysisStart, monthsBetween, monthsRemainingFor, optionRentPSF, parseRenewalBasis } from "@/lib/leases";

export { optionRentPSF, parseRenewalBasis };

const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const r2 = (n) => Math.round(n * 100) / 100;

// "March 1, 2023" (or an ISO date) in a value → "2023-03-01".
export function parseLongDate(text) {
  const s = String(text ?? "");
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const m = s.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!m) return "";
  return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// First dollar amount in a value ("$2,612.50; restore…" → 2612.5).
export const parseMoney = (text) => {
  const m = String(text ?? "").match(/\$\s?([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, "")) : NaN;
};

// A count written "one (1)", "(2)" or "2".
function countBefore(text, noun) {
  const s = String(text ?? "");
  const paren = s.match(new RegExp(`\\((\\d+)\\)\\s*(?:${noun})`, "i"));
  if (paren) return Number(paren[1]);
  const word = s.match(new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)[\\s-]+(?:${noun})`, "i"));
  if (word) return WORDS[word[1].toLowerCase()] ?? Number(word[1]);
  return NaN;
}

const isNone = (f) => !f || f.status === "not_in_lease" || /^(none|no\b|not addressed)/i.test(String(f.value ?? "").trim());

// Rent roll wording for the abstract's renewal option.
function renewalBasisText(value) {
  const b = parseRenewalBasis(value);
  if (!b) return "";
  if (b.fixedPSF != null) return `fixed $${b.fixedPSF.toFixed(2)}`;
  return `${b.greaterOfCurrent ? "greater of current rent and " : ""}${b.pct}% of market`;
}

function leaseTypeOf(value) {
  const s = String(value ?? "").toLowerCase();
  if (/modified gross|\bmg\b/.test(s)) return "MG";
  if (/gross/.test(s) && !/net/.test(s)) return "Gross";
  if (/net|nnn/.test(s)) return "NNN";
  return "";
}

const tenantNameOf = (value) => String(value ?? "").split(/,\s+(?:an?\s|the\s)/i)[0].trim();
const sfOf = (value) => {
  const m = String(value ?? "").match(/([\d,]+(?:\.\d+)?)\s*(?:rentable\s*)?(?:square feet|sf|rsf)/i);
  return m ? Number(m[1].replace(/,/g, "")) : NaN;
};

// Rent steps from the abstract's rent schedule: [{ start, end, rentPSF }],
// one per date the total rent changes, $/SF/yr on the whole leased area.
// Abated months count at $0; spaces with their own schedules are added up.
export function rentStepsFromSchedule(abs, totalSF) {
  const rows = (abs?.rent_schedule ?? []).filter((r) => isISO(r.start));
  if (!rows.length || !(totalSF > 0)) return [];
  const spaces = [...new Set(rows.map((r) => r.space ?? ""))];
  const monthly = (r) => {
    if (r.monthly_rent != null && isFinite(r.monthly_rent)) return Number(r.monthly_rent);
    if (r.annual_rent != null && isFinite(r.annual_rent)) return Number(r.annual_rent) / 12;
    return spaces.length === 1 && isFinite(r.rate) ? (Number(r.rate) * totalSF) / 12 : NaN;
  };
  // A row's end: its own, else the day before the next row of its space starts.
  const bySpace = new Map(spaces.map((s) => [s, rows.filter((r) => (r.space ?? "") === s).sort((a, b) => (a.start < b.start ? -1 : 1))]));
  const ends = new Map();
  for (const list of bySpace.values()) {
    list.forEach((r, i) => ends.set(r, isISO(r.end) ? r.end : list[i + 1] ? dayBefore(list[i + 1].start) : "9999-12-31"));
  }
  const dates = [...new Set(rows.map((r) => r.start))].sort();
  const steps = [];
  for (const d of dates) {
    let total = 0;
    let ok = false;
    for (const list of bySpace.values()) {
      const r = list.find((x) => x.start <= d && d <= ends.get(x));
      if (r) {
        const m = monthly(r);
        if (isFinite(m)) { total += m; ok = true; }
      }
    }
    if (ok) steps.push({ start: d, rentPSF: r2((total * 12) / totalSF) });
  }
  // Each step ends the day before the next; the last at the latest row end.
  const lastEnd = [...ends.values()].filter((e) => e !== "9999-12-31").sort().at(-1) ?? "";
  return steps
    .filter((s, i) => i === 0 || s.rentPSF !== steps[i - 1].rentPSF)
    .map((s, i, a) => ({ ...s, end: a[i + 1] ? dayBefore(a[i + 1].start) : lastEnd }));
}

function dayBefore(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// The step in force on a date (null before the first or after the last).
export const stepOn = (steps, iso) => (steps ?? []).find((s) => s.start <= iso && (!s.end || iso <= s.end)) ?? null;

// ─── Abstract → unit fields ──────────────────────────────────────────────────
// Fields the comparison shows, in order: [key, label, kind].
export const APPLY_FIELDS = [
  ["tenantName", "Tenant", "text"],
  ["squareFeet", "SF", "number"],
  ["leaseStatus", "Status", "text"],
  ["leaseType", "Lease type", "text"],
  ["leaseStart", "Lease start", "date"],
  ["leaseEnd", "Lease end", "date"],
  ["monthsRemaining", "Months remaining", "number"],
  ["currentRentPSF", "Rent $/SF (at analysis start)", "money"],
  ["annualEscalationPct", "Escalation %", "pct"],
  ["rentSteps", "Rent steps", "steps"],
  ["securityDeposit", "Security deposit", "money"],
  ["guarantor", "Guarantor", "text"],
  ["recoveries", "Expense recoveries", "text"],
  ["renewalOptions", "Renewal options", "number"],
  ["renewalOptionYears", "Years per option", "number"],
  ["renewalNoticeMonths", "Renewal notice (months)", "number"],
  ["renewalRentBasis", "Renewal rent", "text"],
  ["terminationDate", "Early termination date", "date"],
  ["terminationNoticeMonths", "Termination notice (months)", "number"],
  ["terminationFee", "Termination fee", "money"],
  ["otherRights", "Expansion / ROFR / other rights", "text"],
  ["businessDescription", "Business", "text"],
  ["sicCode", "SIC", "text"],
];
export const APPLY_LABEL = Object.fromEntries(APPLY_FIELDS.map(([k, l]) => [k, l]));
// Fields whose difference is a mismatch flag (the economic terms).
export const KEY_FIELDS = ["tenantName", "squareFeet", "leaseStart", "leaseEnd", "currentRentPSF", "annualEscalationPct", "leaseType", "securityDeposit", "renewalOptions"];

export function abstractUnitValues(abs, inputs = {}) {
  const v = {};
  const notes = {};
  const f = (k) => fieldOf(abs, k);
  const asOf = analysisStart(inputs);

  const tenant = tenantNameOf(f("tenant")?.value);
  if (tenant) v.tenantName = tenant;
  const sf = sfOf(f("rentable_area")?.value);
  if (sf > 0) v.squareFeet = sf;
  const lt = leaseTypeOf(f("lease_type")?.value);
  if (lt) v.leaseType = lt;
  const start = parseLongDate(f("commencement_date")?.value);
  if (start) v.leaseStart = start;
  const end = parseLongDate(f("expiration_date")?.value);
  if (end) {
    v.leaseEnd = end;
    v.leaseStatus = end >= asOf ? "occupied" : "vacant";
    v.monthsRemaining = v.leaseStatus === "occupied" ? Math.max(1, monthsRemainingFor(inputs, end)) : 0;
    if (v.leaseStatus === "vacant") notes.leaseStatus = `The lease expired before the analysis start (${asOf}).`;
  }

  const steps = rentStepsFromSchedule(abs, v.squareFeet);
  if (steps.length) {
    v.rentSteps = steps;
    const now = stepOn(steps, asOf) ?? (asOf < steps[0].start ? steps[0] : steps.at(-1));
    v.currentRentPSF = now.rentPSF;
    if (!stepOn(steps, asOf)) notes.currentRentPSF = asOf < steps[0].start ? `The lease starts after the analysis start (${asOf}): first step's rent.` : "Last step's rent (the schedule ends before the analysis start).";
    else if (now.rentPSF === 0) notes.currentRentPSF = "Rent is abated at the analysis start.";
  }

  const esc = String(f("rent_escalations")?.value ?? "");
  const pct = esc.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) v.annualEscalationPct = Number(pct[1]);
  else if (steps.length >= 2) {
    const paying = steps.filter((s) => s.rentPSF > 0);
    if (paying.length >= 2) {
      v.annualEscalationPct = r2((paying[1].rentPSF / paying[0].rentPSF - 1) * 100);
      notes.annualEscalationPct = `Fixed increases (${esc.slice(0, 60)}); % from the first two paying steps. The rent steps drive the cash flow.`;
    }
  }

  const dep = parseMoney(f("security_deposit")?.value);
  if (isFinite(dep)) v.securityDeposit = dep;
  const g = f("guarantor") ?? f("guaranty");
  if (g) v.guarantor = isNone(g) ? "" : String(g.value).split(/,\s+(?:an?\s)/i)[0].trim();

  const share = String(f("pro_rata_share")?.value ?? "").match(/(\d+(?:\.\d+)?)\s*%/);
  const ltText = String(f("lease_type")?.value ?? "");
  const cap = f("expense_cap");
  if (ltText) v.recoveries = [ltText, share ? `tenant's share ${share[1]}%` : "", cap && !isNone(cap) ? `expense cap: ${cap.value}` : cap ? "no expense cap" : ""].filter(Boolean).join("; ").slice(0, 200);

  const ren = f("renewal_option");
  if (ren) {
    if (isNone(ren)) {
      v.renewalOptions = 0; v.renewalOptionYears = 0; v.renewalNoticeMonths = 0; v.renewalRentBasis = "";
    } else {
      const n = countBefore(ren.value, "options?|renewal options?");
      const yrs = countBefore(ren.value, "years?");
      const notice = countBefore(ren.value, "months?");
      v.renewalOptions = isFinite(n) ? n : 1;
      if (isFinite(yrs)) v.renewalOptionYears = yrs;
      if (isFinite(notice)) v.renewalNoticeMonths = notice;
      v.renewalRentBasis = renewalBasisText(ren.value);
      if (!v.renewalRentBasis) notes.renewalRentBasis = "Couldn't read the option rent; enter it (e.g. 95% of market).";
    }
  }

  const term = f("termination_option");
  if (term) {
    if (isNone(term)) {
      v.terminationDate = ""; v.terminationNoticeMonths = 0; v.terminationFee = 0;
    } else {
      const eff = (abs.critical_dates ?? []).find((d) => d.kind === "termination_effective")?.date || parseLongDate(term.value);
      const notice = (abs.critical_dates ?? []).find((d) => d.kind === "termination_notice")?.date;
      if (eff) v.terminationDate = eff;
      if (eff && notice) v.terminationNoticeMonths = Math.max(0, Math.round(monthsBetween(notice, eff)));
      const fee = parseMoney(`${term.value} ${term.detail ?? ""}`);
      if (isFinite(fee)) v.terminationFee = fee;
    }
  }

  const rights = ["expansion_rights", "purchase_option", "relocation_right"]
    .map((k) => f(k))
    .filter((x) => x && !isNone(x))
    .map((x) => `${x.key === "relocation_right" ? "Landlord relocation right: " : x.key === "purchase_option" ? "Purchase option: " : ""}${x.value}`);
  if (rights.length || f("expansion_rights")) v.otherRights = rights.join(" · ").slice(0, 300);

  const ind = abstractIndustry(abs);
  if (ind.business) v.businessDescription = ind.business;
  if (ind.sic) v.sicCode = ind.sic;
  return { values: v, notes };
}

// ─── Comparison ──────────────────────────────────────────────────────────────
const same = (key, a, b) => {
  if (key === "rentSteps") return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  const blank = (x) => x == null || x === "" || (typeof x === "number" && !isFinite(x));
  if (blank(a) && blank(b)) return true;
  if (typeof b === "number" || typeof a === "number") {
    const x = Number(a), y = Number(b);
    if (!isFinite(x) || !isFinite(y)) return false;
    if (key === "currentRentPSF" || key === "annualEscalationPct") return Math.abs(x - y) < 0.005;
    if (key === "squareFeet" || key === "securityDeposit" || key === "terminationFee") return Math.abs(x - y) < 0.5;
    return Math.abs(x - y) < 0.5; // months, counts
  }
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
};

// One row per field the abstract gives: { key, label, kind, unitValue,
// abstractValue, differs, note }. unit may be null (a new unit).
export function compareWithUnit(abs, unit, inputs) {
  const { values, notes } = abstractUnitValues(abs, inputs);
  return APPLY_FIELDS.filter(([k]) => k in values).map(([key, label, kind]) => ({
    key,
    label,
    kind,
    unitValue: unit ? unit[key] : undefined,
    abstractValue: values[key],
    differs: !unit || !same(key, unit[key], values[key]),
    note: notes[key] ?? "",
  }));
}

// Mismatch flags: the key economic terms where the unit differs from the
// abstract. Months remaining follows the lease end, so it isn't flagged.
export function leaseMismatches(abs, unit, inputs) {
  if (!abs || !unit) return [];
  return compareWithUnit(abs, unit, inputs).filter((r) => r.differs && KEY_FIELDS.includes(r.key));
}

// ─── Apply ───────────────────────────────────────────────────────────────────
// target: a unit id to update, or "new" to add a unit made by newUnit(name,
// sf) and prefilled from the abstract. fields: keys to take from the
// abstract (a new unit takes all of them). Returns the new units, the unit,
// and change-log entries ({ field, from, to }) for each field set.
export function applyAbstract(units, abs, { target, fields, inputs, newUnit, unitName }) {
  const { values } = abstractUnitValues(abs, inputs);
  const isNew = target === "new";
  const base = isNew ? newUnit(unitName || values.tenantName || "New unit", values.squareFeet || 0) : units.find((u) => u.id === target);
  if (!base) throw new Error("That unit is no longer on the rent roll.");
  const take = isNew ? Object.keys(values) : (fields ?? []).filter((k) => k in values);
  const next = { ...base };
  const entries = [];
  for (const k of take) {
    if (!isNew && same(k, base[k], values[k])) continue;
    entries.push({ key: k, field: APPLY_LABEL[k] ?? k, from: isNew ? undefined : base[k], to: values[k] });
    next[k] = values[k];
  }
  // Months remaining always follows an applied lease end.
  if (take.includes("leaseEnd") && "monthsRemaining" in values && !take.includes("monthsRemaining")) next.monthsRemaining = values.monthsRemaining;
  if (next.leaseStatus !== "occupied") next.monthsRemaining = 0;
  const out = isNew ? [...units, next] : units.map((u) => (u.id === target ? next : u));
  return { units: out, unit: next, entries };
}

// Value as the comparison shows it.
export function showValue(kind, v) {
  if (v == null || v === "") return "—";
  if (kind === "money") return isFinite(Number(v)) ? `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : String(v);
  if (kind === "pct") return isFinite(Number(v)) ? `${Number(v)}%` : String(v);
  if (kind === "number") return isFinite(Number(v)) ? Number(v).toLocaleString("en-US") : String(v);
  if (kind === "steps") return Array.isArray(v) && v.length ? `${v.length} steps: ${v.map((s) => `$${s.rentPSF.toFixed(2)} from ${s.start}`).join(", ")}` : "—";
  return String(v);
}
