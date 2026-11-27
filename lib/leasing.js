// Phase R: Leasing tab. A Leasing Pipeline (prospects and renewals by unit)
// and Rent Comps, kept on each asset (inputs.leasing = { prospects, comps,
// compMapping }), so they save with the asset and every edit is logged.
import { readXlsxGrid } from "@/lib/xlsx";
import { unitsToday } from "@/lib/leaseHistory";

export const PROSPECT_STAGES = [
  ["inquiry", "Inquiry"],
  ["tour", "Tour"],
  ["proposal", "Proposal"],
  ["loi", "LOI"],
  ["leaseout", "Lease out"],
  ["signed", "Signed"],
  ["lost", "Lost"],
];
export const ACTIVE_PROSPECT_STAGES = ["inquiry", "tour", "proposal", "loi", "leaseout"];
export const PROSPECT_SOURCES = ["Broker", "Direct", "Sign call", "Website", "Existing tenant", "Other"];
export const stageLabel = (k) => PROSPECT_STAGES.find(([v]) => v === k)?.[1] ?? k;

const n = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
let seq = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
export const EMPTY_LEASING = Object.freeze({ prospects: [], comps: [], compMapping: null });
export const leasingOf = (inputs) => ({ ...EMPTY_LEASING, ...(inputs?.leasing ?? {}) });

// kind: "new" (a prospect for a vacant / rolling unit) or "renewal".
export function makeProspect(o = {}) {
  return {
    id: newId("lp"), unitId: "", kind: "new", tenant: "", source: "Broker", broker: "", stage: "inquiry", lostReason: "",
    sf: null, askingRentPSF: null, proposedRentPSF: null, termMonths: null, freeMonths: null, tiPSF: null, escalationPct: null,
    expectedStart: "", nextStep: "", nextDate: "", notes: "", createdAt: new Date().toISOString(), ...o,
  };
}

// Net effective rent ($/SF/yr): rent over the term less free rent and TI,
// spread over the term (no discounting). Escalations raise the average rent.
export function netEffective(p) {
  const rent = n(p.proposedRentPSF) ?? n(p.askingRentPSF);
  const term = n(p.termMonths);
  if (rent == null || !term) return null;
  const esc = (n(p.escalationPct) ?? 0) / 100;
  const years = term / 12;
  let total = 0;
  for (let m = 0; m < term; m++) total += (rent / 12) * Math.pow(1 + esc, Math.floor(m / 12));
  const free = (n(p.freeMonths) ?? 0) * (rent / 12);
  const ti = n(p.tiPSF) ?? 0;
  return (total - free - ti) / years;
}

// Calendar months between two dates (Nov 23 → May 23 = 6), days as a fraction of 30.
function calendarMonths(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + (d2 - d1) / 30;
}

// The business plan's leasing target for the unit (latest revision).
export function planTarget(inputs, unitId) {
  const rev = inputs?.businessPlan?.revisions?.at(-1);
  return (rev?.plan?.leasing ?? []).find((l) => l.unitId === unitId) ?? null;
}

// One prospect against the plan: rent and downtime.
export function vsPlan(inputs, p, todayISO) {
  const t = planTarget(inputs, p.unitId);
  if (!t) return null;
  const rent = n(p.proposedRentPSF) ?? n(p.askingRentPSF);
  const unit = (todayISO ? unitsToday(inputs, todayISO) : inputs.units ?? []).find((u) => u.id === p.unitId); // 1.1.25: the lease in effect today
  // Downtime: months from the unit's lease end (or today when vacant) to the expected start.
  const from = unit?.leaseStatus === "occupied" && unit.leaseEnd ? unit.leaseEnd : todayISO;
  const downtime = p.expectedStart && from ? Math.max(0, Math.round(calendarMonths(from, p.expectedStart) * 10) / 10) : null;
  return {
    targetRentPSF: t.targetRentPSF ?? null, rentPSF: rent, rentVsPct: rent != null && t.targetRentPSF ? ((rent - t.targetRentPSF) / t.targetRentPSF) * 100 : null,
    targetDowntime: t.downtimeMonths ?? null, downtime, downtimeVs: downtime != null && t.downtimeMonths != null ? downtime - t.downtimeMonths : null,
    targetTiPSF: t.tiPSF ?? null, tiPSF: n(p.tiPSF), action: t.action,
  };
}

// All prospects across assets (fund view): [{ dealId, asset, fund, inputs, p }].
export function allProspects(deals) {
  return deals.flatMap((d) => leasingOf(d.inputs).prospects.map((p) => ({ dealId: d.id, asset: d.inputs.propertyName || d.id, fund: d.inputs.fundName || "", inputs: d.inputs, p })));
}
export function pipelineTotals(rows) {
  const by = Object.fromEntries(PROSPECT_STAGES.map(([k]) => [k, { count: 0, sf: 0 }]));
  for (const { p } of rows) { const b = by[p.stage] ?? (by[p.stage] = { count: 0, sf: 0 }); b.count += 1; b.sf += n(p.sf) ?? 0; }
  return by;
}

// ── Rent comps ──
export const RENT_COMP_FIELDS = [
  { key: "address", label: "Property / address", synonyms: ["property address", "address", "building address", "property name", "building name", "property", "street address"] },
  { key: "city", label: "City", synonyms: ["city", "property city"] },
  { key: "submarket", label: "Submarket", synonyms: ["submarket", "submarket name", "market"] },
  { key: "tenant", label: "Tenant", synonyms: ["tenant", "tenant name", "lessee", "company"] },
  { key: "sf", label: "SF leased", synonyms: ["sf leased", "square feet", "sf", "size", "leased sf", "rba", "area", "sq ft"] },
  { key: "rentPSF", label: "Rent ($/SF/yr)", synonyms: ["rent", "starting rent", "rent/sf/yr", "rent per sf", "asking rent", "achieved rent", "base rent", "rent $/sf/yr", "effective rent"] },
  { key: "signDate", label: "Sign date", synonyms: ["sign date", "signed", "lease sign date", "date", "execution date", "commencement date", "start date"] },
  { key: "termMonths", label: "Term (months)", synonyms: ["term", "term (months)", "lease term", "term months"] },
  { key: "freeMonths", label: "Free rent (months)", synonyms: ["free rent", "free rent months", "free months", "concessions"] },
  { key: "tiPSF", label: "TI ($/SF)", synonyms: ["ti", "ti/sf", "ti allowance", "tenant improvements", "ti $/sf"] },
  { key: "leaseType", label: "Lease type", synonyms: ["lease type", "type", "service type", "rent type"] },
  { key: "source", label: "Source", synonyms: ["source", "broker", "data source"] },
];
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[_]/g, " ");

export function detectRentCompMapping(grid, remembered = null) {
  let best = { row: -1, score: 0, mapping: {} };
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const headers = (grid[r] ?? []).map(norm);
    const mapping = {};
    for (const f of RENT_COMP_FIELDS) {
      const saved = remembered?.[f.key];
      let idx = saved ? headers.indexOf(norm(saved)) : -1;
      if (idx < 0) idx = headers.findIndex((h) => f.synonyms.includes(h));
      if (idx < 0) idx = headers.findIndex((h) => h && f.synonyms.some((s) => s.length > 3 && h.startsWith(s)));
      if (idx >= 0 && !Object.values(mapping).includes(idx)) mapping[f.key] = idx;
    }
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { row: r, score, mapping };
  }
  const headers = best.row >= 0 ? grid[best.row] : [];
  return { headerRow: best.row, mapping: best.mapping, names: Object.fromEntries(Object.entries(best.mapping).map(([k, i]) => [k, String(headers[i] ?? "")])), ok: best.mapping.rentPSF != null && (best.mapping.address != null || best.mapping.tenant != null) };
}

const numCell = (v) => { if (v == null || v === "") return null; const x = Number(String(v).replace(/[$,%\s]/g, "")); return Number.isFinite(x) ? x : null; };
function dateCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}
export function makeRentComp(o = {}) {
  return { id: newId("rc"), address: "", city: "", submarket: "", tenant: "", sf: null, rentPSF: null, signDate: "", termMonths: null, freeMonths: null, tiPSF: null, leaseType: "", source: "Manual", include: true, ...o };
}
// Grid → comps; a comp with the same address, tenant and sign date updates in place.
export function importRentComps(existing, grid, det, { source = "Upload" } = {}) {
  const rows = grid.slice(det.headerRow + 1).filter((r) => r && r.some((c) => c !== "" && c != null));
  const out = [...(existing ?? [])];
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const get = (k) => (det.mapping[k] != null ? r[det.mapping[k]] : null);
    const c = {
      address: String(get("address") ?? "").trim(), city: String(get("city") ?? "").trim(), submarket: String(get("submarket") ?? "").trim(), tenant: String(get("tenant") ?? "").trim(),
      sf: numCell(get("sf")), rentPSF: numCell(get("rentPSF")), signDate: dateCell(get("signDate")), termMonths: numCell(get("termMonths")), freeMonths: numCell(get("freeMonths")), tiPSF: numCell(get("tiPSF")),
      leaseType: String(get("leaseType") ?? "").trim(), source: String(get("source") ?? "").trim() || source,
    };
    if (c.rentPSF == null || (!c.address && !c.tenant)) { skipped++; continue; }
    const key = (x) => `${norm(x.address)}|${norm(x.tenant)}|${x.signDate}`;
    const i = out.findIndex((x) => key(x) === key(c));
    if (i >= 0) { out[i] = { ...out[i], ...c }; updated++; } else { out.push(makeRentComp(c)); added++; }
  }
  return { comps: out, added, updated, skipped };
}
export async function rentCompsFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return text.split(/\r?\n/).map((line) => { const cells = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = ""; } else cur += ch; } cells.push(cur); return cells; });
  }
  return readXlsxGrid(await file.arrayBuffer());
}

export function filterRentComps(comps, f = {}) {
  return (comps ?? []).filter((c) =>
    (!f.since || (c.signDate && c.signDate >= f.since)) &&
    (!f.minSF || (n(c.sf) ?? 0) >= Number(f.minSF)) &&
    (!f.maxSF || (n(c.sf) ?? Infinity) <= Number(f.maxSF)) &&
    (!f.submarket || norm(c.submarket).includes(norm(f.submarket))) &&
    (!f.leaseType || norm(c.leaseType).includes(norm(f.leaseType))));
}
// Rent statistics of the included comps: count, average (SF-weighted), median, low, high, and net effective average.
export function rentCompStats(comps) {
  const xs = (comps ?? []).filter((c) => c.include !== false && n(c.rentPSF) != null);
  if (!xs.length) return null;
  const rents = xs.map((c) => n(c.rentPSF)).sort((a, b) => a - b);
  const sf = xs.reduce((s, c) => s + (n(c.sf) ?? 0), 0);
  const avg = sf > 0 ? xs.reduce((s, c) => s + n(c.rentPSF) * (n(c.sf) ?? 0), 0) / sf : rents.reduce((s, r) => s + r, 0) / rents.length;
  const mid = rents.length % 2 ? rents[(rents.length - 1) / 2] : (rents[rents.length / 2 - 1] + rents[rents.length / 2]) / 2;
  const ner = xs.map((c) => netEffective({ askingRentPSF: c.rentPSF, termMonths: c.termMonths, freeMonths: c.freeMonths, tiPSF: c.tiPSF })).filter((v) => v != null);
  return { count: xs.length, avg, median: mid, low: rents[0], high: rents.at(-1), netEffectiveAvg: ner.length ? ner.reduce((s, v) => s + v, 0) / ner.length : null };
}
// Asking and achieved rent against the comps.
export function rentVsComps(inputs, stats) {
  if (!stats) return null;
  const units = (inputs.units ?? []).filter((u) => (n(u.squareFeet) ?? 0) > 0);
  const occ = units.filter((u) => u.leaseStatus === "occupied" && n(u.currentRentPSF) != null);
  const sf = occ.reduce((s, u) => s + n(u.squareFeet), 0);
  const inPlace = sf ? occ.reduce((s, u) => s + n(u.currentRentPSF) * n(u.squareFeet), 0) / sf : null;
  const market = n(inputs.rentPerSF);
  const pct = (v) => (v != null && stats.avg ? ((v - stats.avg) / stats.avg) * 100 : null);
  return { inPlace, inPlaceVsPct: pct(inPlace), market, marketVsPct: pct(market), compsAvg: stats.avg };
}

// ── Excel ──
const r2 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v * 100) / 100);
export function leasingXlsx(rows, comps = [], { todayISO } = {}) {
  const out = [["Leasing pipeline"], ["Asset", "Unit", "Prospect / tenant", "Kind", "Source", "Broker", "Stage", "Lost reason", "SF", "Asking ($/SF)", "Proposed ($/SF)", "Term (mo)", "Free (mo)", "TI ($/SF)", "Net effective ($/SF)", "Expected start", "Plan rent ($/SF)", "vs. plan (%)", "Downtime (mo)", "Plan downtime (mo)", "Next step", "Next date", "Notes"]];
  for (const x of rows) {
    const u = (x.inputs.units ?? []).find((z) => z.id === x.p.unitId);
    const v = vsPlan(x.inputs, x.p, todayISO);
    out.push([x.asset, u?.name ?? "", x.p.tenant, x.p.kind === "renewal" ? "Renewal" : "New", x.p.source, x.p.broker, stageLabel(x.p.stage), x.p.lostReason, x.p.sf ?? "", r2(n(x.p.askingRentPSF)), r2(n(x.p.proposedRentPSF)), x.p.termMonths ?? "", x.p.freeMonths ?? "", r2(n(x.p.tiPSF)), r2(netEffective(x.p)), x.p.expectedStart, r2(v?.targetRentPSF), r2(v?.rentVsPct), r2(v?.downtime), r2(v?.targetDowntime), x.p.nextStep, x.p.nextDate, x.p.notes]);
  }
  if (comps.length) {
    out.push([], ["Rent comps"], ["Asset", ...RENT_COMP_FIELDS.map((f) => f.label), "Net effective ($/SF)", "Included"]);
    for (const c of comps) out.push([c.asset ?? "", c.address, c.city, c.submarket, c.tenant, c.sf ?? "", r2(n(c.rentPSF)), c.signDate, c.termMonths ?? "", c.freeMonths ?? "", r2(n(c.tiPSF)), c.leaseType, c.source, r2(netEffective({ askingRentPSF: c.rentPSF, termMonths: c.termMonths, freeMonths: c.freeMonths, tiPSF: c.tiPSF })), c.include === false ? "No" : "Yes"]);
  }
  return out;
}
