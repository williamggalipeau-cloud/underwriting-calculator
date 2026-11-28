// 1.1.17 (user, 11/27): the industrial characteristics of an asset, set in
// asset setup in two sections: Building and Location and site. They are
// typed in, imported from a file, or read from a document (a property
// condition report, a Phase I report, a survey, a roof warranty).
//   inputs.building   the raw facts about the building
//   inputs.site       the raw facts about its location and site
// Ratios and remaining lives are never stored: they are calculated here, so
// every screen, report and export shows the same figure.
//
// Hints are typical ranges shown in grey next to a field. They never flag or
// block an entry (user, 11/27).
import { assetSF } from "@/lib/assetMetrics";

const YES_NO = [["", "—"], ["yes", "Yes"], ["no", "No"]];
export const SPRINKLER_TYPES = ["ESFR", "Wet pipe", "Dry pipe", "None", "Other"];
export const ROOF_TYPES = ["TPO", "EPDM", "PVC", "Built-up", "Metal", "Other"];
export const PAVING_SURFACES = ["Asphalt", "Concrete", "Asphalt and concrete"];
export const ESA_RESULTS = ["Clean", "Recognized environmental condition", "Remediation under way", "Not needed"];
export const DEFAULT_ROOF_LIFE = 20; // years (user, 11/27), editable per asset
export const DEFAULT_PAVING_LIFE = 15; // asphalt (user, 11/27), editable per asset

// [key, label, type, { unit, hint, options, group }]
// type: number | int | text | select | yesno | date | year
export const BUILDING_FIELDS = [
  ["clearHeightFt", "Clear height (ft)", "number", { hint: "Class A 32–40+ · older 18–24", group: "Clear height" }],
  ["dockDoors", "Dock-high doors", "int", { group: "Loading" }],
  ["driveInDoors", "Drive-in doors", "int", { group: "Loading" }],
  ["truckCourtFt", "Truck court depth (ft)", "number", { hint: "typical 130–180", group: "Truck court" }],
  ["trailerStalls", "Trailer stalls", "int", { group: "Truck court" }],
  ["landAcres", "Land (acres)", "number", { group: "Site coverage" }],
  ["footprintSF", "Building footprint (SF)", "number", { group: "Site coverage" }],
  ["powerAmps", "Power (amps)", "number", { group: "Power" }],
  ["powerVolts", "Power (volts)", "number", { group: "Power" }],
  ["powerPhase", "Power phase", "select", { options: ["", "1", "3"], group: "Power" }],
  ["slabIn", "Slab thickness (in)", "number", { hint: "6 standard · 7–8+ heavy", group: "Floor" }],
  ["slabReinforcement", "Slab reinforcement", "text", { group: "Floor" }],
  ["floorFF", "Floor flatness (FF)", "number", { group: "Floor" }],
  ["floorFL", "Floor levelness (FL)", "number", { group: "Floor" }],
  ["columnSpacingW", "Column spacing, width (ft)", "number", { group: "Columns" }],
  ["columnSpacingD", "Column spacing, depth (ft)", "number", { group: "Columns" }],
  ["speedBayFt", "Speed bay depth (ft)", "number", { group: "Columns" }],
  ["sprinklerType", "Sprinklers", "select", { options: ["", ...SPRINKLER_TYPES], group: "Sprinklers" }],
  ["officeSF", "Office SF", "number", { group: "Office" }],
  ["roofType", "Roof type", "select", { options: ["", ...ROOF_TYPES], group: "Roof" }],
  ["roofYear", "Roof installed (year)", "year", { group: "Roof" }],
  ["roofWarrantyTo", "Roof warranty to (year)", "year", { group: "Roof" }],
  ["roofLifeYears", "Roof expected life (years)", "number", { hint: `${DEFAULT_ROOF_LIFE} unless entered`, group: "Roof" }],
  ["pavingSurface", "Paving surface", "select", { options: ["", ...PAVING_SURFACES], group: "Paving" }],
  ["pavingYear", "Paving resurfaced (year)", "year", { group: "Paving" }],
  ["pavingLifeYears", "Paving expected life (years)", "number", { hint: `${DEFAULT_PAVING_LIFE} unless entered`, group: "Paving" }],
  ["dollyPads", "Concrete dolly pads", "yesno", { group: "Paving" }],
];
export const SITE_FIELDS = [
  ["portName", "Nearest port", "text", { group: "Drayage and last mile" }],
  ["portMiles", "Port distance (miles)", "number", { group: "Drayage and last mile" }],
  ["portMinutes", "Port drive time (minutes)", "number", { group: "Drayage and last mile" }],
  ["drayageTripsPerShift", "Drayage round trips per shift", "number", { group: "Drayage and last mile" }],
  ["railName", "Nearest intermodal rail", "text", { group: "Drayage and last mile" }],
  ["railMiles", "Rail distance (miles)", "number", { group: "Drayage and last mile" }],
  ["airportName", "Nearest airport", "text", { group: "Drayage and last mile" }],
  ["airportMiles", "Airport distance (miles)", "number", { group: "Drayage and last mile" }],
  ["freewayName", "Freeway access", "text", { group: "Drayage and last mile" }],
  ["freewayMiles", "Freeway distance (miles)", "number", { group: "Drayage and last mile" }],
  ["pop30", "Population within 30 minutes", "number", { group: "Drayage and last mile" }],
  ["pop60", "Population within 60 minutes", "number", { group: "Drayage and last mile" }],
  ["phase1Date", "Phase I date", "date", { group: "Environmental" }],
  ["phase1Result", "Phase I result", "select", { options: ["", ...ESA_RESULTS.slice(0, 3)], group: "Environmental" }],
  ["phase2Date", "Phase II date", "date", { group: "Environmental" }],
  ["phase2Result", "Phase II result", "select", { options: ["", ...ESA_RESULTS], group: "Environmental" }],
  ["envOpenItems", "Open environmental items", "text", { group: "Environmental" }],
  ["zoning", "Zoning", "text", { group: "Zoning and buffer" }],
  ["industrialByRight", "Industrial use by right", "yesno", { group: "Zoning and buffer" }],
  ["residentialAdjacency", "Residential next door", "text", { group: "Zoning and buffer" }],
  ["truckRestrictions", "Truck route limits", "text", { group: "Zoning and buffer" }],
  ["freewayNoResidential", "Freeway reachable without a residential street", "yesno", { group: "Zoning and buffer" }],
];
export const YES_NO_OPTIONS = YES_NO;
const NUMERIC = new Set(["number", "int", "year"]);
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
export const buildingOf = (inputs) => (inputs?.building && typeof inputs.building === "object" ? inputs.building : {});
export const siteOf = (inputs) => (inputs?.site && typeof inputs.site === "object" ? inputs.site : {});

// A typed-in value, cleaned for its field type ("" clears the field).
export function cleanFact(type, raw) {
  if (raw == null || raw === "") return undefined;
  if (NUMERIC.has(type)) { const n = num(String(raw).replace(/[$,\s]/g, "")); return n == null ? undefined : type === "number" ? n : Math.round(n); }
  if (type === "yesno") { const s = String(raw).trim().toLowerCase(); return ["yes", "y", "true", "1"].includes(s) ? "yes" : ["no", "n", "false", "0"].includes(s) ? "no" : undefined; }
  return String(raw).trim() || undefined;
}
// Set one fact on inputs.building or inputs.site (an empty value removes it).
export function setFact(inputs, section, key, raw) {
  const fields = section === "site" ? SITE_FIELDS : BUILDING_FIELDS;
  const f = fields.find(([k]) => k === key);
  if (!f) return inputs;
  const cur = { ...(section === "site" ? siteOf(inputs) : buildingOf(inputs)) };
  const v = cleanFact(f[2], raw);
  if (v === undefined) delete cur[key]; else cur[key] = v;
  return { ...inputs, [section]: cur };
}

// ── Calculated figures ──
const yearOf = (iso) => (iso ? Number(String(iso).slice(0, 4)) : null);
// The year the hold ends (acquisition + hold years), for "inside the hold".
export function holdEndYear(inputs) {
  const y = yearOf(inputs?.acquisitionDate), h = num(inputs?.holdPeriodYears);
  return y != null && h != null ? y + Math.ceil(h) : null;
}
export function assetFacts(inputs, { todayISO = new Date().toISOString().slice(0, 10) } = {}) {
  const b = buildingOf(inputs), s = siteOf(inputs);
  const sf = assetSF(inputs);
  const thisYear = yearOf(todayISO);
  const life = (year, lifeYears, dflt) => {
    const y = num(year);
    if (y == null) return null;
    const L = num(lifeYears) > 0 ? num(lifeYears) : dflt;
    const endYear = y + L, remaining = endYear - thisYear;
    const holdEnd = holdEndYear(inputs);
    return { life: L, endYear, remaining, insideHold: holdEnd != null && endYear <= holdEnd };
  };
  return {
    sf,
    sfPerDockDoor: num(b.dockDoors) > 0 && sf > 0 ? sf / num(b.dockDoors) : null,
    siteCoveragePct: num(b.landAcres) > 0 && num(b.footprintSF) != null ? (num(b.footprintSF) / (num(b.landAcres) * 43560)) * 100 : null,
    officePct: num(b.officeSF) != null && sf > 0 ? (num(b.officeSF) / sf) * 100 : null,
    esfr: b.sprinklerType ? b.sprinklerType === "ESFR" : null,
    roof: life(b.roofYear, b.roofLifeYears, DEFAULT_ROOF_LIFE),
    paving: life(b.pavingYear, b.pavingLifeYears, DEFAULT_PAVING_LIFE),
    // 1.1.27: a Phase II that came back clean closes the condition its Phase I recognized.
    environmentalOpen: /recognized|remediation/i.test(s.phase2Result ?? "") || (/recognized|remediation/i.test(s.phase1Result ?? "") && !/^clean$/i.test(String(s.phase2Result ?? "").trim())) || !!String(s.envOpenItems ?? "").trim(),
    entered: Object.keys(b).length + Object.keys(s).length,
  };
}
// Things worth a look, as sentences ("" list when none). Never blocks anything.
export function factFlags(inputs, opts = {}) {
  const f = assetFacts(inputs, opts);
  const out = [];
  const lifeFlag = (name, x) => { if (x?.insideHold) out.push(`${name} reaches the end of its expected life in ${x.endYear}, inside the hold. Check that the capital plan covers it.`); };
  lifeFlag("The roof", f.roof);
  lifeFlag("The paving", f.paving);
  if (f.environmentalOpen) out.push("Environmental items are open. See the property condition findings.");
  if (siteOf(inputs).industrialByRight === "no") out.push("Industrial use is not allowed by right under the zoning.");
  return out;
}

// ── Display ──
const fmtNum = (v, d = 0) => (v == null ? "" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));
export function factText(type, v) {
  if (v == null || v === "") return "";
  if (type === "yesno") return v === "yes" ? "Yes" : "No";
  if (type === "number") return fmtNum(v, 2);
  if (type === "int") return fmtNum(v);
  if (type === "date") return `${Number(String(v).slice(5, 7))}/${Number(String(v).slice(8, 10))}/${String(v).slice(0, 4)}`;
  return String(v);
}
// [[section, label, text]] for reports and exports: entered facts, then the calculated ones.
export function factRows(inputs, opts = {}) {
  const b = buildingOf(inputs), s = siteOf(inputs), f = assetFacts(inputs, opts);
  const rows = [];
  for (const [k, label, type] of BUILDING_FIELDS) if (b[k] != null && b[k] !== "") rows.push(["Building", label, factText(type, b[k])]);
  if (f.sfPerDockDoor != null) rows.push(["Building", "SF per dock door", fmtNum(f.sfPerDockDoor)]);
  if (f.siteCoveragePct != null) rows.push(["Building", "Site coverage", `${f.siteCoveragePct.toFixed(1)}%`]);
  if (f.officePct != null) rows.push(["Building", "Office share", `${f.officePct.toFixed(1)}%`]);
  if (f.roof) rows.push(["Building", "Roof remaining useful life", `${f.roof.remaining} years (to ${f.roof.endYear})`]);
  if (f.paving) rows.push(["Building", "Paving remaining useful life", `${f.paving.remaining} years (to ${f.paving.endYear})`]);
  for (const [k, label, type] of SITE_FIELDS) if (s[k] != null && s[k] !== "") rows.push(["Location and site", label, factText(type, s[k])]);
  return rows;
}

// ── Import and export (one row per asset; the first column is the asset's name) ──
const ALL = [...BUILDING_FIELDS.map((f) => ["building", ...f]), ...SITE_FIELDS.map((f) => ["site", ...f])];
export const FACT_COLUMNS = ["Asset", ...ALL.map(([, , label]) => label)];
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function factsGrid(deals) {
  return [FACT_COLUMNS, ...deals.map((d) => [d.inputs?.propertyName ?? d.id, ...ALL.map(([sec, k]) => (sec === "site" ? siteOf(d.inputs) : buildingOf(d.inputs))[k] ?? "")])];
}
// grid: rows of cells, the first row the headers. Returns
// { updates: { dealId: { building, site } }, matched, unknownAssets, unknownColumns, cells }.
// A blank cell leaves the asset's value as it is; only filled cells are applied.
export function importFacts(grid, deals) {
  const head = (grid?.[0] ?? []).map(norm);
  const assetCol = head.findIndex((h) => ["asset", "property", "property name", "asset name"].includes(h));
  const cols = head.map((h, i) => (i === assetCol ? null : ALL.find(([, , label]) => norm(label) === h) ?? null));
  const unknownColumns = (grid?.[0] ?? []).filter((_, i) => i !== assetCol && !cols[i] && head[i]);
  const updates = {}, unknownAssets = [];
  let cells = 0;
  for (const row of (grid ?? []).slice(1)) {
    const name = assetCol >= 0 ? row[assetCol] : null;
    if (name == null || String(name).trim() === "") continue;
    const d = deals.find((x) => norm(x.inputs?.propertyName) === norm(name));
    if (!d) { unknownAssets.push(String(name)); continue; }
    let inp = updates[d.id] ? { ...d.inputs, ...updates[d.id] } : d.inputs;
    cols.forEach((c, i) => {
      if (!c || row[i] == null || String(row[i]).trim() === "") return;
      const next = setFact(inp, c[0], c[1], row[i]);
      if ((next[c[0]] ?? {})[c[1]] !== undefined) { inp = next; cells++; }
    });
    if (inp !== d.inputs) updates[d.id] = { building: buildingOf(inp), site: siteOf(inp) };
  }
  return { updates, matched: Object.keys(updates).length, unknownAssets, unknownColumns, cells };
}

// ── From a document's abstract ──
// A property condition report, Phase I report, survey or roof warranty read
// by Claude carries the facts it states under `building` and / or `site`
// (the same keys as above), each with a quote. rows: what applying it would
// set, next to what the asset holds now.
export const FACT_DOC_TYPES = [["pcr", "Property condition report"], ["phase1", "Phase I environmental report"], ["phase2", "Phase II environmental report"], ["survey", "Survey"], ["roof_warranty", "Roof warranty"]];
// A fact document is filed on its asset as "other" with its kind in the title: "[fact:pcr] file.pdf".
export const factDocTag = (kind) => `[fact:${kind}]`;
export const parseFactTitle = (title) => { const m = /^\[fact:([a-z0-9_]+)\] (.*)$/.exec(title ?? ""); return m ? { kind: m[1], name: m[2] } : null; };
export const factDocs = (docs, dealId = null) => (docs ?? []).filter((d) => (!dealId || d.deal_id === dealId) && parseFactTitle(d.title)).map((d) => ({ ...parseFactTitle(d.title), id: d.id, dealId: d.deal_id, doc: d }));
export const factDocLabel = (k) => FACT_DOC_TYPES.find(([v]) => v === k)?.[1] ?? k;
export const isFactDoc = (abstract) => !!abstract && FACT_DOC_TYPES.some(([k]) => k === abstract.doc_type);
export function factDocRows(abstract, inputs) {
  if (!isFactDoc(abstract)) return [];
  const rows = [];
  for (const [section, k, label, type] of ALL) {
    const raw = abstract?.[section]?.[k];
    const v = cleanFact(type, raw);
    if (v === undefined) continue;
    const now = (section === "site" ? siteOf(inputs) : buildingOf(inputs))[k];
    rows.push({ key: `${section}.${k}`, section, field: k, label, value: v, text: factText(type, v), now: now ?? null, nowText: factText(type, now), differs: now != null && now !== "" && now !== v, quote: abstract.quotes?.[k] ?? "" });
  }
  return rows;
}
export function applyFactDoc(inputs, abstract, keys = null) {
  let inp = inputs;
  for (const r of factDocRows(abstract, inputs)) if (!keys || keys.includes(r.key)) inp = setFact(inp, r.section, r.field, r.value);
  return inp;
}
