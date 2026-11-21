// ─── Import a Pensford forward curve export ──────────────────────────────────
// Reads the file Pensford's forward curve page gives you (Table view →
// Download & Share → Excel, vertical or horizontal), a CSV of it, or the
// table copied and pasted as text. Returns a curve:
//   { source, asOf, points: [[isoDate, termSofr1M %, avgSofr30D %], ...] }
// Everything runs in the browser; nothing is sent anywhere.

import { readXlsxGrid } from "@/lib/xlsx";

export const PENSFORD_URL = "https://pensford.com/forward-curve?tab=floating";

const COLS = {
  term: /1\s*m(onth)?\s*term\s*sofr/i,
  avg: /30\s*d(ay)?\s*(average|avg)\s*sofr/i,
  date: /reset\s*date|^date$/i,
};

function toISO(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    // Excel serial date (1900 system)
    const n = Number(v);
    if (n > 20000 && n < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// "4.02239%" → 4.02239; 0.0402239 → 4.02239; "4.02239" → 4.02239
function toPct(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const n = parseFloat(s.replace(/[%,\s]/g, ""));
  if (!isFinite(n)) return null;
  if (s.includes("%")) return n;
  return Math.abs(n) < 1 ? n * 100 : n;
}

// grid: array of rows (arrays of cell values). Accepts vertical (dates down
// column A) or horizontal (dates across row 1) layouts.
export function curveFromGrid(grid, asOf) {
  const rows = grid.filter((r) => r && r.some((c) => c !== "" && c != null));
  if (!rows.length) throw new Error("The file is empty.");
  let headerIdx = rows.findIndex((r) => r.some((c) => COLS.date.test(String(c ?? ""))));
  let data = rows;
  // Horizontal layout: first column holds the labels → transpose.
  if (headerIdx >= 0 && COLS.date.test(String(rows[headerIdx][0] ?? "")) && rows[headerIdx].filter(toISO).length > 3) {
    const width = Math.max(...rows.map((r) => r.length));
    data = Array.from({ length: width }, (_, c) => rows.map((r) => r[c]));
    headerIdx = 0;
  }
  if (headerIdx < 0) throw new Error("Couldn't find a “Reset Date” column. Use Pensford's Table view export.");
  const header = data[headerIdx].map((c) => String(c ?? ""));
  const di = header.findIndex((h) => COLS.date.test(h));
  const ti = header.findIndex((h) => COLS.term.test(h));
  const ai = header.findIndex((h) => COLS.avg.test(h));
  if (ti < 0 && ai < 0) {
    throw new Error("Couldn't find 1M Term SOFR or 30D Average SOFR columns. Tick both under Floating before exporting.");
  }
  const points = [];
  for (const r of data.slice(headerIdx + 1)) {
    const d = toISO(r[di]);
    if (!d) continue;
    const t = ti >= 0 ? toPct(r[ti]) : null;
    const a = ai >= 0 ? toPct(r[ai]) : null;
    if (t == null && a == null) continue;
    points.push([d, t ?? a, a ?? t]);
  }
  points.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  if (points.length < 2) throw new Error("No rate rows found in the file.");
  return {
    source: "Pensford",
    asOf: asOf ?? points[0][0],
    points,
    columns: { term: ti >= 0, avg: ai >= 0 },
  };
}

// Pasted text or CSV (tab, comma or multi-space separated).
export function curveFromText(text, asOf) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const grid = lines.map((l) => {
    if (l.includes("\t")) return l.split("\t");
    if (/,/.test(l) && !/\d,\d{3}/.test(l)) return l.split(",").map((c) => c.replace(/^"|"$/g, ""));
    return l.split(/\s{2,}|\s(?=\d)/);
  });
  return curveFromGrid(grid, asOf);
}

export async function curveFromXlsx(buf, asOf) {
  return curveFromGrid(await readXlsxGrid(buf), asOf);
}

// Picks the reader by file type. asOf defaults to a date in the file name
// (Pensford names exports ForwardCurve_floating_monthly_YYYY-MM-DD.xlsx).
export async function curveFromFile(file) {
  const asOf = file.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (/\.xlsx$/i.test(file.name)) return curveFromXlsx(await file.arrayBuffer(), asOf);
  return curveFromText(await file.text(), asOf);
}
