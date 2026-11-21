// ─── Sales comps: import, mapping, adjustments, statistics ───────────────────
// Imports comps from a CoStar / Crexi / LoopNet / broker export (Excel or
// CSV). Columns are matched by common header names; the mapping can be
// reviewed and changed before import. Everything runs in the browser.

import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";
import { parseCSV } from "@/lib/fundTerms";

// Fields a comp can have, with header names seen in common exports.
export const COMP_FIELDS = [
  { key: "name", label: "Property / address", synonyms: ["property address", "address", "property name", "building name", "property", "street address", "name"] },
  { key: "city", label: "City", synonyms: ["city", "property city", "city name"] },
  { key: "state", label: "State", synonyms: ["state", "property state", "st"] },
  { key: "submarket", label: "Submarket", synonyms: ["submarket", "submarket name", "market", "market name", "submarket cluster", "costar submarket", "submarket name costar"] },
  { key: "propertyType", label: "Property type", synonyms: ["property type", "secondary type", "type", "subtype", "property subtype", "building type", "propertytype", "costar property type"] },
  { key: "saleDate", label: "Sale date", synonyms: ["sale date", "sold date", "close date", "closing date", "date sold", "transaction date", "sale date mm/dd/yyyy", "date"] },
  { key: "price", label: "Sale price ($)", synonyms: ["sale price", "sold price", "price", "total price", "transaction price", "purchase price", "sale price $", "price $"] },
  { key: "sf", label: "Building SF", synonyms: ["rba", "building sf", "bldg sf", "rentable building area", "building size", "square feet", "sf", "size", "total sf", "gross sf", "bldg size", "building area", "bldg sf rba", "rba sf", "sf rba"] },
  { key: "pricePSF", label: "Price / SF", synonyms: ["price/sf", "price per sf", "$/sf", "sale price/sf", "price psf", "price / sf", "price per square foot", "sale price per sf", "price/sf rba", "$/sf rba", "price per sf rba"] },
  { key: "capRate", label: "Cap rate (%)", synonyms: ["cap rate", "actual cap rate", "sale cap rate", "cap", "capitalization rate", "cap rate %", "actual cap rate %"] },
  { key: "yearBuilt", label: "Year built", synonyms: ["year built", "yr built", "built"] },
  { key: "clearHeight", label: "Clear height (ft)", synonyms: ["ceiling height", "ceiling height range", "clear height", "ceiling ht", "clear ht", "max clear height"] },
  { key: "occupancy", label: "Occupancy (%)", synonyms: ["percent leased", "% leased", "occupancy", "leased %", "occupancy %", "percent leased at sale", "% leased at sale"] },
  { key: "buyer", label: "Buyer", synonyms: ["buyer", "buyer name", "true buyer", "true buyer company", "recorded buyer", "buyer company"] },
  { key: "seller", label: "Seller", synonyms: ["seller", "seller name", "true seller", "true seller company", "recorded seller", "seller company"] },
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s_]+/g, " ").replace(/[()]/g, "").trim();

// Find the header row (the first row matching 3+ known fields) and propose
// a mapping field → column index.
export function detectMapping(grid) {
  let best = { row: -1, score: 0, mapping: {} };
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const headers = (grid[r] ?? []).map(norm);
    const mapping = {};
    for (const f of COMP_FIELDS) {
      // exact synonym match first, then "starts with"
      let idx = headers.findIndex((h) => f.synonyms.includes(h));
      if (idx < 0) idx = headers.findIndex((h) => h && f.synonyms.some((s) => s.length > 3 && h.startsWith(s)));
      if (idx >= 0 && !Object.values(mapping).includes(idx)) mapping[f.key] = idx;
    }
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { row: r, score, mapping };
  }
  if (best.score < 2) throw new Error("Couldn't find comp columns (e.g. Sale Price, Building SF, Sale Date). Check the file or use the template.");
  return { headerRow: best.row, headers: grid[best.row].map((h) => String(h ?? "")), mapping: best.mapping };
}

const num = (v) => {
  const s = String(v ?? "").trim();
  if (!s || /^(n\/a|na|-|—)$/i.test(s)) return null;
  const n = parseFloat(s.replace(/[$,%\s]/g, ""));
  return isFinite(n) ? n : null;
};

function toISODate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  const n = Number(s);
  if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  const d = Date.parse(s);
  return isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
}

let seq = 0;
export function newCompId() {
  seq += 1;
  return `comp-${Date.now().toString(36)}-${seq}`;
}

// Build a comp from raw values; fills price/SF or price when one is missing.
export function makeComp(raw) {
  const c = {
    id: raw.id ?? newCompId(),
    name: String(raw.name ?? "").trim(),
    city: String(raw.city ?? "").trim(),
    state: String(raw.state ?? "").trim(),
    submarket: String(raw.submarket ?? "").trim(),
    propertyType: String(raw.propertyType ?? "").trim(),
    saleDate: raw.saleDate ? toISODate(raw.saleDate) : null,
    price: num(raw.price),
    sf: num(raw.sf),
    pricePSF: num(raw.pricePSF),
    capRate: num(raw.capRate),
    yearBuilt: num(raw.yearBuilt),
    clearHeight: num(raw.clearHeight),
    occupancy: num(raw.occupancy),
    buyer: String(raw.buyer ?? "").trim(),
    seller: String(raw.seller ?? "").trim(),
    adjPct: num(raw.adjPct) ?? 0,
    include: raw.include !== false,
    example: !!raw.example,
  };
  // Cap rates given as decimals (0.065) → percent.
  if (c.capRate != null && c.capRate > 0 && c.capRate < 1) c.capRate *= 100;
  if (c.pricePSF == null && c.price && c.sf) c.pricePSF = c.price / c.sf;
  if (c.price == null && c.pricePSF && c.sf) c.price = c.pricePSF * c.sf;
  return c;
}

export function compsFromGrid(grid, mappingInfo) {
  const { headerRow, mapping } = mappingInfo;
  const out = [];
  for (const row of grid.slice(headerRow + 1)) {
    if (!row || !row.some((v) => String(v ?? "").trim())) continue;
    const raw = {};
    for (const [key, idx] of Object.entries(mapping)) if (idx != null && idx >= 0) raw[key] = row[idx];
    const c = makeComp(raw);
    if (c.price == null && c.pricePSF == null && c.capRate == null) continue; // not a sale row
    out.push(c);
  }
  if (!out.length) throw new Error("No sale rows with a price, price/SF or cap rate were found.");
  return out;
}

export async function gridFromFile(file) {
  if (/\.xlsx$/i.test(file.name)) return readXlsxGrid(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files aren't supported. Save as .xlsx or CSV and try again.");
  return parseCSV(await file.text());
}

// ── Adjustments & statistics ──
const DAY = 86_400_000;

// Adjusted price/SF: time-adjusted to asOfISO at marketGrowthPct per year
// (grown forward for earlier sales, discounted back for later ones), then
// the comp's own adjustment %.
export function adjustedPSF(c, { asOfISO, marketGrowthPct = 0 }) {
  if (c.pricePSF == null) return null;
  const years = c.saleDate ? (Date.parse(asOfISO) - Date.parse(c.saleDate)) / DAY / 365 : 0;
  return c.pricePSF * Math.pow(1 + marketGrowthPct / 100, years) * (1 + (c.adjPct ?? 0) / 100);
}

function summary(values) {
  const v = values.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return {
    n: v.length,
    min: v[0],
    max: v[v.length - 1],
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    median: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2,
  };
}

export function filterComps(comps, f) {
  return comps.filter((c) => {
    if (f.sinceISO && c.saleDate && c.saleDate < f.sinceISO) return false;
    if (f.minSF && c.sf != null && c.sf < f.minSF) return false;
    if (f.maxSF && c.sf != null && c.sf > f.maxSF) return false;
    if (f.type && !`${c.propertyType} ${c.submarket} ${c.city}`.toLowerCase().includes(f.type.toLowerCase())) return false;
    return true;
  });
}

export function compStats(comps, opts) {
  const used = comps.filter((c) => c.include);
  return {
    used: used.length,
    psf: summary(used.map((c) => c.pricePSF)),
    adjPSF: summary(used.map((c) => adjustedPSF(c, opts))),
    cap: summary(used.map((c) => c.capRate)),
    size: summary(used.map((c) => c.sf)),
  };
}

// ── Template / export ──
export function compsTemplateXlsx(comps = []) {
  const header = COMP_FIELDS.map((f) => f.label).concat(["Adjustment (%)"]);
  const rows = comps.map((c) =>
    COMP_FIELDS.map((f) => (c[f.key] == null ? "" : c[f.key])).concat([c.adjPct ?? 0])
  );
  return writeXlsx([header, ...rows], { sheetName: "Sales comps", colWidths: header.map((h) => Math.max(12, h.length + 2)) });
}

// Illustrative rows so the tab can be tried before importing real data.
// Clearly marked as examples — not real transactions.
export function exampleComps() {
  const rows = [
    ["Example comp A", "2026-09-15", 9_600_000, 32_000, 6.4, 2004, 24],
    ["Example comp B", "2026-06-30", 7_150_000, 25_000, 6.7, 1999, 22],
    ["Example comp C", "2026-03-20", 13_200_000, 45_000, 6.2, 2008, 28],
    ["Example comp D", "2025-12-10", 5_900_000, 21_000, 6.9, 1995, 20],
    ["Example comp E", "2025-08-05", 11_000_000, 38_000, 6.5, 2002, 24],
    ["Example comp F", "2025-04-22", 8_100_000, 30_000, 6.8, 1998, 22],
  ];
  return rows.map(([name, saleDate, price, sf, capRate, yearBuilt, clearHeight]) =>
    makeComp({ name, saleDate, price, sf, capRate, yearBuilt, clearHeight, propertyType: "Light industrial", example: true })
  );
}
