// ─── Portfolio setup (1.1.29; user, 11/28) ───────────────────────────────────
// New Portfolio Setup / Edit Portfolio: a fund, a joint venture or a separate
// account is set up in its own steps, with its own wording and only the terms
// that apply. The type is chosen first and then fixed.
//
// Every type still runs the same portfolio model, so nothing here changes a
// return. The terms added in 1.1.29 are recorded and shown, not calculated on:
//   investorType, investorEntity, sponsorEntity, investorContactName,
//   investorContactEmail, investorNotes      who the capital partner / client is
//   authority ("discretionary" | "approval")  separate account: does the client
//                                              approve each deal (recorded only;
//                                              the approval step is v1.2)
//   fundPlanTargets { netIrrPct, netMultiple, cashYieldPct }   the target return,
//                                              net to the investors: the same
//                                              targets the portfolio plan on
//                                              Portfolio Summary tracks (one
//                                              set, so they cannot disagree)
//   outsideSaleDate, buySellDate              joint venture key dates
//   terminationNoticeDays                     separate account
//   termSources { [termKey]: "doc" }          terms taken from the agreement
// Restrictions are the portfolio's limits (terms.limits, as a fund's LPA limits
// are): the ones the app can measure show actual against limit, the rest are
// listed for reference.

import { fundType } from "@/lib/fundTypes";
import { fundDates } from "@/lib/fundTimeline";
import { MEASURED } from "@/lib/fundLimits";
import { LIMIT_KEYS } from "@/lib/dealDocTypes";

export const SETUP_STEPS = [
  ["doc", "Document"],
  ["investor", "Investor"],
  ["capital", "Capital & fees"],
  ["returns", "Returns"],
  ["restrictions", "Restrictions & dates"],
  ["review", "Review"],
];

// A fund has no investor list here (its investors are kept in the CRM): its
// second step is the sponsor and the GP parties.
export function setupSteps(type) {
  const fund = fundType(type) === "Fund";
  return SETUP_STEPS.map(([id, label], i) => ({ id, n: id === "review" ? null : i + 1, label: id === "investor" && fund ? "Parties" : label }));
}

export const INVESTOR_TYPES = ["Pension fund", "Insurance company", "Endowment or foundation", "Family office", "Sovereign wealth fund", "Fund of funds", "Other"];
export const AUTHORITIES = [["discretionary", "Discretionary (the sponsor decides)"], ["approval", "The client approves each deal"]];
export const authorityLabel = (v) => AUTHORITIES.find(([k]) => k === v)?.[1] ?? "Not set";

// Wording by type.
export function setupWords(type) {
  const t = fundType(type);
  if (t === "Joint Venture") return { unit: "JV", unitLc: "JV", long: "joint venture", doc: "JVA", docLong: "joint venture agreement", investor: "Capital partner", investorKey: "partnerName", equity: "Total equity", sponsorShare: "Sponsor's ownership", fee: "Asset management fee", start: "Agreement date", net: "net to the partner" };
  if (t === "Separate Account") return { unit: "SMA", unitLc: "SMA", long: "separate account", doc: "SMA", docLong: "separate account agreement", investor: "Client", investorKey: "clientName", equity: "Allocation", sponsorShare: "Sponsor co-investment", fee: "Asset management fee", start: "Agreement date", net: "net to the client" };
  return { unit: "Fund", unitLc: "fund", long: "fund", doc: "LPA", docLong: "LPA / PPM", investor: "", investorKey: null, equity: "Total commitments", sponsorShare: "GP commitment", fee: "Mgmt fee", start: "Final close", net: "net to the LPs" };
}

// What a new portfolio of each type starts with, over the fund defaults. A
// joint venture or separate account has no subscription line or commitment
// period fee unless its agreement says so; a separate account has no sponsor
// co-investment or catch-up unless switched on.
export function typeDefaults(type) {
  const t = fundType(type);
  if (t === "Joint Venture") return { type: t, subLineEnabled: false, mgmtFeeBasis: "invested", gpCommitPct: 10 };
  if (t === "Separate Account") return { type: t, subLineEnabled: false, mgmtFeeBasis: "invested", gpCommitPct: 0, catchUpGpPct: 0, authority: "approval" };
  return { type: t };
}

const numOrNull = (v) => (v === "" || v == null || !isFinite(Number(v)) ? null : Number(v));

export function targetReturn(terms = {}) {
  const g = terms.fundPlanTargets ?? {};
  const irrPct = numOrNull(g.netIrrPct), multiple = numOrNull(g.netMultiple), cashYieldPct = numOrNull(g.cashYieldPct);
  return { irrPct, multiple, cashYieldPct, set: irrPct != null || multiple != null || cashYieldPct != null };
}

// Sets one target (key: netIrrPct | netMultiple | cashYieldPct); "" or null clears it.
export function withTarget(terms = {}, key, v) {
  return { ...terms, fundPlanTargets: { ...(terms.fundPlanTargets ?? {}), [key]: numOrNull(v) } };
}

export function targetReturnLabel(terms = {}) {
  const t = targetReturn(terms);
  if (!t.set) return "Not set";
  return [t.irrPct != null ? `${t.irrPct}% IRR` : null, t.multiple != null ? `${t.multiple}x equity multiple` : null, t.cashYieldPct != null ? `${t.cashYieldPct}% cash yield` : null].filter(Boolean).join(" · ");
}

// The term of the agreement: start, years, end, extensions and the type's own dates.
export function agreementTerm(terms = {}) {
  const fd = terms.finalClose ? fundDates(terms) : null;
  return {
    start: terms.finalClose || null,
    years: Number(terms.termYears) || 0,
    end: fd?.fundEnd ?? null,
    extensionCount: Number(terms.extensionCount) || 0,
    extensionYears: Number(terms.extensionYears) || 0,
    extendedEnd: fd?.extendedEnd ?? null,
    outsideSaleDate: fundType(terms.type) === "Joint Venture" ? terms.outsideSaleDate || null : null,
    buySellDate: fundType(terms.type) === "Joint Venture" ? terms.buySellDate || null : null,
    terminationNoticeDays: fundType(terms.type) === "Separate Account" ? numOrNull(terms.terminationNoticeDays) : null,
  };
}

// Dated events a joint venture or separate account adds to Upcoming Events,
// beside the term dates every portfolio has: [date, label].
export function agreementEvents(terms = {}) {
  const a = agreementTerm(terms);
  return [[a.outsideSaleDate, "Outside sale date"], [a.buySellDate, "Buy-sell available"]].filter(([d]) => d);
}

// Restrictions: the portfolio's limits from its agreement, each marked measured
// (actual against limit on the limits screen) or listed for reference.
export function restrictionsOf(terms = {}) {
  return (terms.limits ?? []).map((l) => {
    const measured = MEASURED.includes(l.key) && l.unit !== "text";
    return { key: l.key, label: l.label || LIMIT_KEYS.find(([k]) => k === l.key)?.[1] || l.key, limit: l.limit, unit: l.unit ?? "%", clause: l.clause ?? "", quote: l.quote ?? "", measured, source: l.docId ? "doc" : "typed" };
  });
}

export const RESTRICTION_KINDS = [...LIMIT_KEYS.filter(([k]) => k !== "other"), ["other", "Other restriction (listed for reference)"]];

// A restriction typed in at setup. A measured kind replaces the same kind; any
// other gets a key of its own, so several can be listed.
export function addRestriction(terms = {}, { kind = "other", label = "", limit = "", clause = "" } = {}, id = Date.now().toString(36)) {
  const measured = MEASURED.includes(kind);
  const n = Number(String(limit).replace(/[^\d.-]/g, ""));
  const row = measured && isFinite(n) && String(limit).trim() !== ""
    ? { key: kind, label: label.trim() || LIMIT_KEYS.find(([k]) => k === kind)?.[1] || kind, limit: n, unit: kind === "hold_years" ? "years" : "%", clause: clause.trim() }
    : { key: measured ? kind : `${kind}_${id}`, label: label.trim() || LIMIT_KEYS.find(([k]) => k === kind)?.[1] || "Restriction", limit: String(limit).trim(), unit: "text", clause: clause.trim() };
  return { ...terms, limits: [...(terms.limits ?? []).filter((x) => x.key !== row.key), row] };
}

export function removeRestriction(terms = {}, key) {
  return { ...terms, limits: (terms.limits ?? []).filter((x) => x.key !== key) };
}

const pct = (v) => (v == null || v === "" || !isFinite(Number(v)) ? "" : `${Number(v)}%`);
const money = (v) => (Number(v) > 0 ? `$${Math.round(Number(v)).toLocaleString("en-US")}` : "");
const dateUS = (iso) => { const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : ""; };

// The review page: every term by step, with where it came from ("doc" = taken
// from the agreement, "typed" = entered, "unset" = not set).
export function reviewSections(terms = {}) {
  const t = fundType(terms.type), w = setupWords(t), src = terms.termSources ?? {};
  const row = (label, value, key) => ({ label, value: value === "" || value == null ? "Not set" : String(value), source: value === "" || value == null ? "unset" : key && src[key] === "doc" ? "doc" : "typed" });
  const lp = 100 - (Number(terms.gpCommitPct) || 0);
  const a = agreementTerm(terms);
  const tiers = (terms.tiers ?? []).map((x, i) => `${x.irrThreshold != null ? `to ${x.irrThreshold}% IRR` : i ? "above" : "all"}: ${x.lpSplit}/${x.gpSplit}`).join("; ");
  const incentive = t === "Separate Account" && Number(terms.incentiveFeePct) > 0;
  const sections = [
    { id: "doc", title: "Document", rows: [row(`${w.unit} name`, terms.name), row("Type", t), row("Portfolio manager", terms.portfolioManager)] },
    {
      id: "investor", title: t === "Fund" ? "Parties" : "Investor",
      rows: t === "Fund"
        ? [row("Sponsor", "This firm"), row("Investors", "Kept in your CRM")]
        : [row(w.investor, terms[w.investorKey], w.investorKey), row("Investor type", terms.investorType, "investorType"), ...(t === "Separate Account" ? [row("Authority", terms.authority ? authorityLabel(terms.authority) : "", "authority")] : [row("Partner's entity", terms.investorEntity), row("Sponsor's entity", terms.sponsorEntity)]), row("Contact", [terms.investorContactName, terms.investorContactEmail].filter(Boolean).join(", "))],
    },
    {
      id: "capital", title: "Capital and fees",
      rows: [
        row(w.equity, money(terms.targetEquity), "targetEquity"),
        t === "Fund" ? row("GP commitment", pct(terms.gpCommitPct), "gpCommitPct") : t === "Joint Venture" ? row("Ownership: partner / sponsor", `${lp}% / ${Number(terms.gpCommitPct) || 0}%`, "gpCommitPct") : row("Sponsor co-investment", Number(terms.gpCommitPct) > 0 ? pct(terms.gpCommitPct) : "None", "gpCommitPct"),
        row(w.fee, `${pct(terms.mgmtFeePct) || "0%"} a year on ${terms.mgmtFeeBasis === "invested" ? "invested capital" : "commitments, then invested capital"}`, "mgmtFeePct"),
        row("Acquisition fee", `${pct(terms.acqFeePct) || "0%"} of price`, "acqFeePct"),
        row("Disposition fee", `${pct(terms.dispFeePct) || "0%"} of sale`, "dispFeePct"),
        row("Subscription line", terms.subLineEnabled === false ? "None" : `${pct(terms.subLineSizePct)} of commitments`, "subLineSizePct"),
      ],
    },
    {
      id: "returns", title: "Returns",
      rows: [
        row(`Target return (${w.net})`, targetReturn(terms).set ? targetReturnLabel(terms) : "", "fundPlanTargets.netIrrPct"),
        ...(incentive
          ? [row("Incentive fee", `${terms.incentiveFeePct}% of profit above a ${terms.incentiveHurdlePct ?? terms.prefPct}% IRR hurdle`, "incentiveFeePct")]
          : [row("Preferred return", pct(terms.prefPct), "prefPct"), ...(t === "Separate Account" ? [] : [row(t === "Fund" ? "GP catch-up" : "Sponsor catch-up", pct(terms.catchUpGpPct), "catchUpGpPct")]), row("Promote tiers (investors / sponsor)", tiers, "tiers")]),
      ],
    },
    {
      id: "restrictions", title: "Restrictions and dates",
      rows: [
        row("Restrictions", restrictionsOf(terms).length ? restrictionsOf(terms).map((r) => `${r.label}${r.limit !== "" && r.limit != null ? `: ${r.limit}${r.unit === "%" ? "%" : r.unit === "years" ? " years" : ""}` : ""}${r.measured ? "" : " (reference)"}`).join("; ") : ""),
        row(w.start, dateUS(a.start), "finalClose"),
        row(t === "Fund" ? "Fund term" : "Term of the agreement", a.years ? `${a.years} years, ends ${dateUS(a.end)}` : "", "termYears"),
        row("Extensions", a.extensionCount ? `${a.extensionCount} × ${a.extensionYears} year${a.extensionYears === 1 ? "" : "s"}, to ${dateUS(a.extendedEnd)}` : "None", "extensionCount"),
        ...(t === "Fund" ? [row("Investment period", `${terms.investmentPeriodYears ?? 0} years`, "investmentPeriodYears")] : []),
        ...(t === "Joint Venture" ? [row("Outside sale date", dateUS(a.outsideSaleDate), "outsideSaleDate"), row("Buy-sell available from", dateUS(a.buySellDate), "buySellDate")] : []),
        ...(t === "Separate Account" ? [row("Termination notice", a.terminationNoticeDays != null ? `${a.terminationNoticeDays} days` : "", "terminationNoticeDays")] : []),
      ],
    },
  ];
  return sections;
}

export const SOURCE_LABEL = { doc: "From the agreement", typed: "Entered", unset: "Not set" };

// Portfolio Summary: who the investor is and the agreement's own terms, for a
// joint venture or separate account ([label, value]; [] for a fund).
export function investorSummary(terms = {}) {
  const t = fundType(terms.type);
  if (t === "Fund") return [];
  const w = setupWords(t), a = agreementTerm(terms);
  const v = (x) => (x == null || x === "" ? "—" : String(x));
  return [
    [w.investor, v(terms[w.investorKey])],
    ["Investor type", v(terms.investorType)],
    ...(t === "Separate Account" ? [["Authority", terms.authority ? authorityLabel(terms.authority) : "—"]] : [["Partner's entity", v(terms.investorEntity)], ["Sponsor's entity", v(terms.sponsorEntity)]]),
    ["Contact", v([terms.investorContactName, terms.investorContactEmail].filter(Boolean).join(", "))],
    ["Target return", targetReturn(terms).set ? targetReturnLabel(terms) : "—"],
    ["Term of the agreement", a.years ? `${a.years} years from ${dateUS(a.start)}, ends ${dateUS(a.end)}${a.extensionCount ? ` (${dateUS(a.extendedEnd)} with every extension)` : ""}` : "—"],
    ...(t === "Joint Venture" ? [["Outside sale date", v(dateUS(a.outsideSaleDate))], ["Buy-sell available from", v(dateUS(a.buySellDate))]] : [["Termination notice", a.terminationNoticeDays != null ? `${a.terminationNoticeDays} days` : "—"]]),
    ["Restrictions", restrictionsOf(terms).length ? `${restrictionsOf(terms).length} (${restrictionsOf(terms).filter((r) => r.measured).length} measured, ${restrictionsOf(terms).filter((r) => !r.measured).length} for reference)` : "—"],
  ];
}
