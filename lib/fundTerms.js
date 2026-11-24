// ─── Fund terms: defaults, template, import / export ─────────────────────────
// A fund's terms drive its timeline, waterfall and management fee on the
// Portfolio Return tab. The template is a two-column sheet (Field | Value)
// with a Notes column; it round-trips through Excel (.xlsx) and CSV.

import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";

export const DEFAULT_FUND_TERMS = {
  name: "",
  finalClose: "2025-12-31",
  investmentPeriodYears: 2,
  termYears: 5,
  extensionCount: 2,
  extensionYears: 1,
  targetEquity: 0, // total commitments ($, LP + GP); 0 = not set. Drives dry powder.
  gpCommitPct: 5,
  prefPct: 9,
  hurdleRatePct: null, // cost of capital (% / yr); null = same as the preferred return
  catchUpGpPct: 100,
  mgmtFeePct: 0, // % per year, charged quarterly in advance as a fund expense (lib/fundExpenses)
  mgmtFeeBasis: "commitments-then-invested", // LP commitments during the investment period, then LP invested capital | "invested"
  cashReserveQuarters: 2, // fund cash kept: quarters of projected fund expenses (fee + sub line costs)
  distributionPolicy: "reserve", // "reserve": distribute income above the reserve | "payout": distribute incomePayoutPct
  reserveYears: 1, // reserve = years × each asset's debt service + TI/leasing + AM fees
  incomePayoutPct: 100, // payout policy only: % of each quarter's operating cash distributed
  incomeTreatment: "prefThenROC", // "prefThenROC": income pays pref, then returns capital | "full": full waterfall
  // Subscription line of credit (lib/subLine.js)
  subLineEnabled: true,
  subLineSizePct: 80, // % of total commitments (of planned calls if commitments are not set)
  subLineSpreadPct: 1.75, // over 30-day average SOFR
  subLineUnusedFeePct: 0.25, // per year on the undrawn amount
  subLineMaxDays: 365, // days a draw may stay outstanding before an LP call repays it
  // Fees and parties for every portfolio type (user, 11/24); JV and separate
  // account terms come from the JVA / SMA like a fund's from its LPA.
  acqFeePct: 0, // % of purchase price, paid to the sponsor at acquisition
  dispFeePct: 0, // % of sale price, paid to the sponsor at sale
  // Revenue Yield on GP Economics (user, 11/24): GP fees ÷ committed capital,
  // measured against LP + GP commitments ("lp+gp", the default) or LP only
  // ("lp"). Read in from the LPA / JVA / SMA ("doc") or set by the user ("user").
  revenueYieldBasis: "lp+gp",
  revenueYieldBasisSource: "",
  partnerName: "", // joint venture: the JV partner
  clientName: "", // separate account: the client
  incentiveFeePct: null, // separate account: % of profit above the hurdle (replaces the promote tiers)
  incentiveHurdlePct: null, // separate account: IRR hurdle for the incentive fee
  tiers: [
    { irrThreshold: 12, lpSplit: 80, gpSplit: 20 },
    { irrThreshold: 18, lpSplit: 70, gpSplit: 30 },
    { irrThreshold: null, lpSplit: 60, gpSplit: 40 },
  ],
};

export const MAX_TIERS = 5;

// Template rows: [label, key, notes]. Tier rows are generated.
const FIELDS = [
  ["Fund name", "name", "Must match the Fund field on the deals in this fund"],
  ["Final close date", "finalClose", "YYYY-MM-DD or M/D/YYYY"],
  ["Investment period (years)", "investmentPeriodYears", "From final close"],
  ["Fund term (years)", "termYears", "From final close"],
  ["Extension options (count)", "extensionCount", ""],
  ["Extension length (years each)", "extensionYears", ""],
  ["Total commitments ($)", "targetEquity", "Fund size (LP + GP commitments); used for dry powder. 0 = not set"],
  ["GP commitment (% of equity)", "gpCommitPct", ""],
  ["Preferred return (% / yr)", "prefPct", "Compounds annually from each capital call"],
  ["Hurdle rate / cost of capital (% / yr)", "hurdleRatePct", "Return investors require; leave blank to use the preferred return"],
  ["GP catch-up (%)", "catchUpGpPct", "Share of distributions to GP until it reaches its promote share"],
  ["Management fee (% / yr)", "mgmtFeePct", "Fund-level fee, charged quarterly in advance from LPs only"],
  ["Management fee basis", "mgmtFeeBasis", "\"Commitments then invested\" (LP commitments during the investment period, then LP invested capital) or \"Invested\""],
  ["Fund cash reserve (quarters of expenses)", "cashReserveQuarters", "Minimum fund cash: this many quarters of projected management fee + sub line costs"],
  ["Distribution policy", "distributionPolicy", "\"Reserve\" (distribute income above the reserve) or \"Payout %\""],
  ["Reserve (years of debt service + TI + mgmt fees)", "reserveYears", "Reserve policy: each asset holds this many years of debt service, TI/leasing and AM fees"],
  ["Quarterly income payout (%)", "incomePayoutPct", "Payout policy: share of each quarter's operating cash distributed"],
  ["Subscription line", "subLineEnabled", "Yes / No"],
  ["Sub line size (% of commitments)", "subLineSizePct", "Facility size as % of total commitments"],
  ["Sub line spread over SOFR (%)", "subLineSpreadPct", "Interest = 30-day average SOFR + spread"],
  ["Sub line unused fee (% / yr)", "subLineUnusedFeePct", "On the undrawn facility"],
  ["Sub line max days outstanding", "subLineMaxDays", "Each draw is repaid by an LP capital call after this many days"],
  ["Income distributions", "incomeTreatment", "\"Pref then return of capital\" (promote only from sales) or \"Full waterfall\""],
];

const TREATMENTS = { prefThenROC: "Pref then return of capital", full: "Full waterfall" };

function tierRows(tiers) {
  const rows = [];
  for (let i = 0; i < MAX_TIERS; i++) {
    const t = tiers[i];
    rows.push(
      [`Tier ${i + 1} IRR hurdle (%)`, t ? (t.irrThreshold ?? "") : "", i === 0 ? "Blank on the last tier = above all hurdles" : ""],
      [`Tier ${i + 1} LP split (%)`, t ? t.lpSplit : "", ""],
      [`Tier ${i + 1} GP split (%)`, t ? t.gpSplit : "", ""],
    );
  }
  return rows;
}

export function termsToRows(terms) {
  return [
    ["Field", "Value", "Notes"],
    ...FIELDS.map(([label, key, note]) => [
      label,
      key === "incomeTreatment"
        ? TREATMENTS[terms[key]] ?? TREATMENTS.prefThenROC
        : key === "distributionPolicy"
        ? (terms[key] === "payout" ? "Payout %" : "Reserve")
        : key === "mgmtFeeBasis"
        ? (terms[key] === "invested" ? "Invested" : "Commitments then invested")
        : key === "subLineEnabled"
        ? (terms[key] === false ? "No" : "Yes")
        : terms[key] ?? "",
      note,
    ]),
    ...tierRows(terms.tiers ?? []),
  ];
}

export function termsToXlsx(terms) {
  return writeXlsx(termsToRows(terms), { sheetName: "Fund terms", colWidths: [34, 18, 70] });
}

export function termsToCSV(terms) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return termsToRows(terms).map((r) => r.map(q).join(",")).join("\n") + "\n";
}

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === "," || ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function toISODate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const n = Number(s);
  if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  return null;
}

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return isFinite(n) ? n : null;
};

// Grid (rows of [label, value, ...]) → terms. Unknown rows are ignored;
// missing values fall back to the defaults. Returns { terms, warnings }.
export function rowsToTerms(grid) {
  const byLabel = new Map();
  for (const r of grid) {
    const label = String(r?.[0] ?? "").trim().toLowerCase();
    if (label) byLabel.set(label, r[1]);
  }
  // Older templates called total commitments "Target equity ($)".
  if (!byLabel.has("total commitments ($)") && byLabel.has("target equity ($)")) {
    byLabel.set("total commitments ($)", byLabel.get("target equity ($)"));
  }
  const get = (label) => byLabel.get(label.toLowerCase());
  const warnings = [];
  const terms = { ...DEFAULT_FUND_TERMS, tiers: [] };

  for (const [label, key] of FIELDS) {
    const raw = get(label);
    if (raw == null || String(raw).trim() === "") continue;
    if (key === "name") terms.name = String(raw).trim();
    else if (key === "incomeTreatment") terms.incomeTreatment = /full/i.test(String(raw)) ? "full" : "prefThenROC";
    else if (key === "distributionPolicy") terms.distributionPolicy = /payout|%/i.test(String(raw)) ? "payout" : "reserve";
    else if (key === "mgmtFeeBasis") terms.mgmtFeeBasis = /commit/i.test(String(raw)) ? "commitments-then-invested" : "invested";
    else if (key === "subLineEnabled") terms.subLineEnabled = !/^(no|n|false|0|none)$/i.test(String(raw).trim());
    else if (key === "finalClose") {
      const d = toISODate(raw);
      if (d) terms.finalClose = d;
      else warnings.push(`Couldn't read the final close date “${raw}”.`);
    } else {
      const n = num(raw);
      if (n == null) warnings.push(`Couldn't read “${label}”: “${raw}”.`);
      else terms[key] = n;
    }
  }
  for (let i = 1; i <= MAX_TIERS; i++) {
    const lp = num(get(`Tier ${i} LP split (%)`));
    const gp = num(get(`Tier ${i} GP split (%)`));
    if (lp == null && gp == null) continue;
    const hurdleRaw = get(`Tier ${i} IRR hurdle (%)`);
    terms.tiers.push({
      irrThreshold: hurdleRaw == null || String(hurdleRaw).trim() === "" ? null : num(hurdleRaw),
      lpSplit: lp ?? 100 - (gp ?? 0),
      gpSplit: gp ?? 100 - (lp ?? 0),
    });
  }
  if (!terms.tiers.length) terms.tiers = DEFAULT_FUND_TERMS.tiers.map((t) => ({ ...t }));
  if (!byLabel.size || ![...byLabel.keys()].some((k) => FIELDS.some(([l]) => l.toLowerCase() === k))) {
    throw new Error("This doesn't look like a fund terms file. Download the template and fill in the Value column.");
  }
  return { terms: normalizeTerms(terms), warnings: [...warnings, ...validateTerms(terms)] };
}

export async function termsFromFile(file) {
  const grid = /\.xlsx$/i.test(file.name)
    ? await readXlsxGrid(await file.arrayBuffer())
    : parseCSV(await file.text());
  return rowsToTerms(grid);
}

export function normalizeTerms(t) {
  const tiers = (t.tiers ?? [])
    .filter((x) => x && isFinite(x.lpSplit) && isFinite(x.gpSplit))
    .map((x) => ({ irrThreshold: x.irrThreshold == null || x.irrThreshold === "" ? null : Number(x.irrThreshold), lpSplit: Number(x.lpSplit), gpSplit: Number(x.gpSplit) }))
    .sort((a, b) => (a.irrThreshold ?? Infinity) - (b.irrThreshold ?? Infinity));
  return { ...DEFAULT_FUND_TERMS, ...t, tiers: tiers.length ? tiers : DEFAULT_FUND_TERMS.tiers.map((x) => ({ ...x })) };
}

export function validateTerms(t) {
  const w = [];
  if (!String(t.name ?? "").trim()) w.push("Fund name is required.");
  if (!(t.termYears > 0)) w.push("Fund term must be more than 0 years.");
  if (t.investmentPeriodYears > t.termYears) w.push("Investment period is longer than the fund term.");
  if (t.gpCommitPct < 0 || t.gpCommitPct > 100) w.push("GP commitment must be between 0% and 100%.");
  for (const [i, x] of (t.tiers ?? []).entries()) {
    if (Math.abs(x.lpSplit + x.gpSplit - 100) > 0.01) w.push(`Tier ${i + 1} splits add to ${x.lpSplit + x.gpSplit}%, not 100%.`);
  }
  const open = (t.tiers ?? []).filter((x) => x.irrThreshold == null).length;
  if (open !== 1) w.push("Exactly one tier should have a blank IRR hurdle (the top tier).");
  return w;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name) {
  return String(name || "fund").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || "fund";
}
