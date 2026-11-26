// ─── Change log: what changed, when, and by whom ─────────────────────────────
// After each edit the app compares the saved workspace data with the
// previous version and records one entry per changed field:
//   { id, at (ISO time), user, area, item, field, path, from, to, note? }
// "user" is the name entered in this browser (there are no logins, so it is
// self-reported). Repeated edits to the same field by the same user within
// COALESCE_MS merge into one entry; an edit that returns a field to its
// starting value removes the entry. Bulk actions (import, reset, loading the
// sample fund) are recorded as one entry with a note instead of field by
// field. The log is stored in the workspace (auditLog), so it travels with
// linked files and exports. It is a record, not a tamper-proof audit trail.

import { QUICK_DEFAULTS, toMainInputs } from "@/lib/quickUnderwrite";

export const COALESCE_MS = 60_000;
export const MAX_LOG = 10_000;
export const BULK_LIMIT = 60; // more field changes than this in one save = bulk

const QUICK_LABELS = {
  propertyType: "Property type", purchasePrice: "Purchase price ($)", closingCosts: "Closing costs ($)",
  noiYear1: "Year-1 NOI ($)", noiGrowthPct: "NOI growth (%/yr)", holdYears: "Hold (years)", exitCapPct: "Exit cap (%)",
  saleCostPct: "Sale costs (%)", acquisitionDate: "Acquisition date", ltvPct: "LTV (%)", capex: "Capex ($)",
  capexLenderFunded: "Capex lender-funded", sofrPct: "SOFR (%)", sofrCurveSource: "SOFR source", sofrIndex: "SOFR index",
  sofrCurve: "Manual SOFR curve", spreadPct: "Spread (%)", amortYears: "Amortization (years)", initialTermYears: "Initial term (years)",
  extensionCount: "Extensions", extensionTermYears: "Extension length (years)", extensionFee: "Extension fee ($)",
  capStrikePct: "Cap strike (%)", capRenewalStrike: "Cap renewal strike", capTermYears: "Cap term (years)",
  capPricing: "Cap pricing", capProviders: "Cap providers", capVolShiftBp: "Cap vol shift (bp)", initialCapCost: "Initial cap cost ($)",
  replacementCapCost: "Replacement cap cost ($)", amFeePct: "AM fee (% of equity)", pmFeePct: "PM fee (%)",
  pmFeeBasis: "PM fee basis", cmFeePct: "CM fee (% of price)",
};
const INPUT_LABELS = {
  propertyName: "Property name", fundName: "Fund", squareFootage: "Square footage", purchasePrice: "Purchase price ($)",
  rentPerSF: "Market rent ($/SF)", vacancyPct: "Vacancy (%)", exitCapRatePct: "Exit cap (%)", holdPeriodYears: "Hold (years)",
  ltvPct: "LTV (%)", spreadPct: "Spread (%)", managementFeePct: "Management fee (%)", noiOverrideEnabled: "Direct NOI",
};
const FUND_LABELS = {
  finalClose: "Final close", investmentPeriodYears: "Investment period (years)", termYears: "Fund term (years)",
  extensionCount: "Extension options", extensionYears: "Extension length (years)", targetEquity: "Total commitments ($)",
  gpCommitPct: "GP commitment (%)", prefPct: "Preferred return (%)", catchUpGpPct: "GP catch-up (%)",
  mgmtFeePct: "Management fee (%)", distributionPolicy: "Distribution policy", reserveYears: "Reserve (years)",
  incomePayoutPct: "Income payout (%)", incomeTreatment: "Income distributions", subLineEnabled: "Subscription line",
  subLineSizePct: "Sub line size (%)", subLineSpreadPct: "Sub line spread (%)", subLineUnusedFeePct: "Sub line unused fee (%)",
  subLineMaxDays: "Sub line max days", tiers: "Promote tiers",
};
const ACTIVITY_LABELS = { date: "Date", type: "Type", amount: "Amount ($)", purpose: "Purpose", notes: "Notes" };
const COMPS_LABELS = { marketGrowthPct: "Market growth (%/yr)", spreadBp: "Exit cap spread (bp)", filters: "Filters", sinceISO: "Sold on or after", minSF: "Min SF", maxSF: "Max SF", type: "Type contains", include: "Included", adjPct: "Adjustment (%)" };
const BENCH_LABELS = { npi: "NCREIF NPI", npiInd: "NCREIF NPI Industrial", odce: "NCREIF ODCE", preqin: "Preqin", cambridge: "Cambridge Associates", nareitInd: "FTSE Nareit Industrial", nareitAll: "FTSE Nareit All Equity REITs", sp500: "S&P 500", EGP: "EastGroup (EGP)", REXR: "Rexford (REXR)", TRNO: "Terreno (TRNO)", STAG: "STAG (STAG)" };
const MARK_LABELS = { value: "Fair value ($)", source: "Source", appraiser: "Appraiser", capRate: "Cap rate (%)", capex: "Capex since last mark ($)", notes: "Notes" };

const humanize = (k) => String(k).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// Inputs a linked deal gets from Quick Underwrite: logged on the Quick side only.
let DERIVED_KEYS = null;
function derivedKeys() {
  if (!DERIVED_KEYS) DERIVED_KEYS = new Set(Object.keys(toMainInputs(QUICK_DEFAULTS, {})));
  return DERIVED_KEYS;
}

export function formatValue(v) {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-US") : String(Math.round(v * 10000) / 10000);
  if (Array.isArray(v)) {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${v.length} items` : s;
  }
  if (isObj(v)) {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  }
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

// Compares two values; pushes { field, path, from, to } for each change.
function diffValue(out, a, b, path, field, labels = {}) {
  if (a === b) return;
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffValue(out, a[k], b[k], [...path, k], field ? `${field} › ${labels[k] ?? humanize(k)}` : labels[k] ?? humanize(k), labels);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every((x) => isObj(x) && x.id)) {
    const am = new Map(a.map((x) => [x.id, x]));
    const bm = new Map(b.map((x) => [x.id, x]));
    for (const [id, x] of bm) {
      const label = x.name || x.label || x.tenantName || id;
      if (!am.has(id)) out.push({ field: `${field} › ${label}`, path: [...path, id], from: undefined, to: "added" });
      else diffValue(out, am.get(id), x, [...path, id], `${field} › ${label}`, labels);
    }
    for (const [id, x] of am) {
      if (!bm.has(id)) out.push({ field: `${field} › ${x.name || x.label || x.tenantName || id}`, path: [...path, id], from: "present", to: "removed" });
    }
    return;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  out.push({ field, path, from: a, to: b });
}

// Snapshot of the data the log tracks (UI state and curve points excluded).
export function auditSnapshot({ deals, savedDeals, funds, comps, valuations, baseCurve, pipeline = null, gpPartners = null }) {
  return {
    deals,
    savedDeals,
    funds,
    comps,
    pipeline,
    gpPartners,
    valuations,
    curve: baseCurve ? { source: baseCurve.source ?? "", asOf: baseCurve.asOf ?? "", points: baseCurve.points?.length ?? 0 } : null,
  };
}

// All field changes between two snapshots, as log entries (without id/at/user).
export function diffWorkspace(prev, next) {
  const out = [];
  const name = (d) => d?.inputs?.propertyName || d?.id || "Deal";
  const dealName = (id) => name([...(next.deals ?? []), ...(next.savedDeals ?? []), ...(prev.deals ?? [])].find((d) => d.id === id)) || id;

  // Deals (open) and saved copies
  for (const [key, area] of [["deals", "Deal"], ["savedDeals", "Saved deal"]]) {
    const pm = new Map((prev[key] ?? []).map((d) => [d.id, d]));
    const nm = new Map((next[key] ?? []).map((d) => [d.id, d]));
    for (const [id, d] of nm) {
      const p = pm.get(id);
      if (!p) {
        out.push({ area, item: name(d), field: area === "Deal" ? "Deal" : "Saved copy", path: [key, id], from: undefined, to: "added" });
        continue;
      }
      const f = [];
      if (key === "deals") {
        diffValue(f, p.quick ?? {}, d.quick ?? {}, [key, id, "quick"], "Deal Screener", QUICK_LABELS);
        f.forEach((e) => { if (e.path.includes("forwardCurve")) e.skip = true; });
        if (p.linked !== d.linked) f.push({ field: "Linked to Deal Screener", path: [key, id, "linked"], from: p.linked, to: d.linked });
        const skip = d.linked ? derivedKeys() : new Set();
        const pi = Object.fromEntries(Object.entries(p.inputs ?? {}).filter(([k]) => !skip.has(k)));
        const ni = Object.fromEntries(Object.entries(d.inputs ?? {}).filter(([k]) => !skip.has(k)));
        diffValue(f, pi, ni, [key, id, "inputs"], "", INPUT_LABELS);
      } else {
        diffValue(f, p.inputs ?? {}, d.inputs ?? {}, [key, id, "inputs"], "", INPUT_LABELS);
      }
      f.filter((e) => !e.skip).forEach((e) => out.push({ area, item: name(d), ...e, field: e.field.replace(/^ › /, "") }));
    }
    for (const [id, p] of pm) if (!nm.has(id)) out.push({ area, item: name(p), field: area === "Deal" ? "Deal" : "Saved copy", path: [key, id], from: "present", to: "removed" });
  }

  // Funds, capital activity
  const pf = prev.funds ?? {};
  const nf = next.funds ?? {};
  for (const fund of new Set([...Object.keys(pf), ...Object.keys(nf)])) {
    const a = pf[fund];
    const b = nf[fund];
    if (!a) { out.push({ area: "Fund", item: fund, field: "Fund", path: ["funds", fund], from: undefined, to: "added" }); continue; }
    if (!b) { out.push({ area: "Fund", item: fund, field: "Fund", path: ["funds", fund], from: "present", to: "removed" }); continue; }
    const { capitalActivity: ca, ...at } = a;
    const { capitalActivity: cb, ...bt } = b;
    const f = [];
    diffValue(f, at, bt, ["funds", fund], "", FUND_LABELS);
    f.forEach((e) => out.push({ area: "Fund terms", item: fund, ...e, field: e.field.replace(/^ › /, "") }));
    const am = new Map((ca ?? []).map((x) => [x.id, x]));
    const bm = new Map((cb ?? []).map((x) => [x.id, x]));
    const label = (x) => `${x.date ?? ""} ${x.type ?? ""}`.trim();
    const purpose = (v) => (String(v ?? "").startsWith("acq:") ? `acquisition – ${dealName(String(v).slice(4))}` : v ?? "other");
    for (const [id, x] of bm) {
      const p = am.get(id);
      if (!p) out.push({ area: "Capital activity", item: fund, field: `Entry ${label(x)}`, path: ["funds", fund, "capitalActivity", id], from: undefined, to: `${formatValue(Number(x.amount) || 0)} (${purpose(x.purpose)})` });
      else for (const k of new Set([...Object.keys(p), ...Object.keys(x)])) {
        if (k !== "id" && JSON.stringify(p[k]) !== JSON.stringify(x[k])) {
          out.push({ area: "Capital activity", item: fund, field: `Entry ${label(x)} › ${ACTIVITY_LABELS[k] ?? humanize(k)}`, path: ["funds", fund, "capitalActivity", id, k], from: k === "purpose" ? purpose(p[k]) : p[k], to: k === "purpose" ? purpose(x[k]) : x[k] });
        }
      }
    }
    for (const [id, x] of am) if (!bm.has(id)) out.push({ area: "Capital activity", item: fund, field: `Entry ${label(x)}`, path: ["funds", fund, "capitalActivity", id], from: `${formatValue(Number(x.amount) || 0)}`, to: "removed" });
  }

  // Valuation marks
  const pv = prev.valuations ?? {};
  const nv = next.valuations ?? {};
  for (const id of new Set([...Object.keys(pv), ...Object.keys(nv)])) {
    const qa = pv[id] ?? {};
    const qb = nv[id] ?? {};
    for (const q of new Set([...Object.keys(qa), ...Object.keys(qb)])) {
      const a = qa[q] ?? {};
      const b = qb[q] ?? {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
          out.push({ area: "Valuation", item: dealName(id), field: `${q} › ${MARK_LABELS[k] ?? humanize(k)}`, path: ["valuations", id, q, k], from: a[k], to: b[k] });
        }
      }
    }
  }

  // Sales comps
  const f = [];
  const { benchmarks: prevBench, actionsDone: prevDone, ...pc } = prev.comps ?? {};
  const { benchmarks: nextBench, actionsDone: nextDone, ...nc } = next.comps ?? {};
  // Actions marked done on the Dashboard (11/24): one entry each.
  for (const k of new Set([...Object.keys(prevDone ?? {}), ...Object.keys(nextDone ?? {})])) {
    const a = prevDone?.[k], b = nextDone?.[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push({ area: "Actions Needed", item: "Action", field: (b ?? a).text ?? k, path: ["comps", "actionsDone", k], from: a ? "done" : "open", to: b ? "done" : "open" });
  }
  diffValue(f, pc, nc, ["comps"], "", COMPS_LABELS);
  f.forEach((e) => out.push({ area: "Sales comps", item: "Comps", ...e, field: e.field.replace(/^ › /, "") }));
  // Benchmarks (phase Y): one entry per benchmark uploaded or replaced, as a
  // summary (the rows themselves would swamp the log).
  const sumB = (x) => (x ? `${x.rows?.length ?? 0} rows${x.fileName ? ` from ${x.fileName}` : ""}${x.source ? ` (${x.source})` : ""}` : undefined);
  for (const kind of ["index", "vintage", "monthly"]) {
    const a = prevBench?.[kind] ?? {}, b = nextBench?.[kind] ?? {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      out.push({ area: "Benchmarks", item: "Benchmarks", field: BENCH_LABELS[k] ?? k, path: ["comps", "benchmarks", kind, k], from: sumB(a[k]), to: sumB(b[k]) ?? "removed" });
    }
  }

  // Pipeline (phase M): one entry per deal field changed, by deal name
  const pa = new Map((prev.pipeline?.deals ?? []).map((d) => [d.id, d]));
  const pb = new Map((next.pipeline?.deals ?? []).map((d) => [d.id, d]));
  for (const id of new Set([...pa.keys(), ...pb.keys()])) {
    const a = pa.get(id), b = pb.get(id);
    const item = (b ?? a)?.name || "Pipeline deal";
    if (!a) out.push({ area: "Pipeline", item, field: "Added", path: ["pipeline", id], from: null, to: b.stage ?? "" });
    else if (!b) out.push({ area: "Pipeline", item, field: "Removed", path: ["pipeline", id], from: a.stage ?? "", to: null });
    else {
      const g = [];
      diffValue(g, a, b, ["pipeline", id], "");
      g.forEach((e) => out.push({ area: "Pipeline", item, ...e, field: e.field.replace(/^ › /, "") }));
    }
  }

  // GP Partners (1.1.10): partners added or removed, agreements saved or removed.
  const nameOf = (gp, id) => gp?.partners?.find((x) => x.id === id)?.name ?? "GP partner";
  const ga = new Map((prev.gpPartners?.partners ?? []).map((x) => [x.id, x])), gb = new Map((next.gpPartners?.partners ?? []).map((x) => [x.id, x]));
  for (const id of new Set([...ga.keys(), ...gb.keys()])) {
    if (!ga.has(id)) out.push({ area: "GP Partners", item: gb.get(id).name, field: "Added", path: ["gpPartners", id], from: null, to: gb.get(id).name });
    else if (!gb.has(id)) out.push({ area: "GP Partners", item: ga.get(id).name, field: "Removed", path: ["gpPartners", id], from: ga.get(id).name, to: null });
  }
  const aa = new Map((prev.gpPartners?.agreements ?? []).map((x) => [x.id, x])), ab = new Map((next.gpPartners?.agreements ?? []).map((x) => [x.id, x]));
  const agText = (x) => `${x.portfolio}${x.dealId ? " (one deal)" : ""}: ${x.capitalPct}% of GP capital, ${x.gpSideSharePct}% of the GP's promote, from ${x.effective}`;
  for (const id of new Set([...aa.keys(), ...ab.keys()])) {
    const a = aa.get(id), b = ab.get(id);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push({ area: "GP Partners", item: nameOf(next.gpPartners ?? prev.gpPartners, (b ?? a).partnerId), field: !a ? "Agreement saved" : !b ? "Agreement removed" : "Agreement changed", path: ["gpPartners", "agreements", id], from: a ? agText(a) : null, to: b ? agText(b) : null });
  }

  // Forward curve (summary only)
  if (JSON.stringify(prev.curve) !== JSON.stringify(next.curve)) {
    out.push({
      area: "Forward curve",
      item: next.curve?.source || "Curve",
      field: "Imported curve",
      path: ["baseCurve"],
      from: prev.curve ? `${prev.curve.source} ${prev.curve.asOf}` : undefined,
      to: next.curve ? `${next.curve.source} ${next.curve.asOf} (${next.curve.points} points)` : undefined,
    });
  }
  return out;
}

let seq = 0;
const newId = () => `chg-${Date.now().toString(36)}-${++seq}`;

// Adds new changes to the log: merges quick repeat edits of the same field by
// the same user, drops edits that end where they started, and keeps the log
// to MAX_LOG entries. Returns a new log array.
export function appendChanges(log, changes, { user, at = new Date().toISOString(), note } = {}) {
  const who = user?.trim() || "Unknown user";
  let next = [...(log ?? [])];
  if (changes.length > BULK_LIMIT || note) {
    const areas = [...new Set(changes.map((c) => c.area))].join(", ");
    next.push({
      id: newId(), at, user: who, area: "Workspace", item: note || "Bulk change",
      field: changes.length ? `${changes.length} field${changes.length === 1 ? "" : "s"} changed${areas ? ` (${areas})` : ""}` : "",
      path: [], from: undefined, to: undefined, note: note || "Bulk change",
    });
    return next.slice(-MAX_LOG);
  }
  const t = Date.parse(at);
  for (const c of changes) {
    const key = JSON.stringify(c.path);
    let i = next.length - 1;
    while (i >= 0 && t - Date.parse(next[i].at) <= COALESCE_MS && !(next[i].user === who && JSON.stringify(next[i].path) === key)) i--;
    const prev = i >= 0 && t - Date.parse(next[i].at) <= COALESCE_MS && next[i].user === who && JSON.stringify(next[i].path) === key ? next[i] : null;
    if (prev && !prev.note && !c.revertOf && !prev.revertOf) { // a revert is always its own entry
      const merged = { ...prev, at, to: c.to, field: c.field, item: c.item };
      next = next.filter((e) => e !== prev);
      if (JSON.stringify(merged.from) !== JSON.stringify(merged.to)) next.push(merged);
    } else {
      next.push({ id: newId(), at, user: who, ...c });
    }
  }
  return next.slice(-MAX_LOG);
}
