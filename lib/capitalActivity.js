// ─── Actual capital activity: calls and subscription line draws/repayments ───
// A fund's ledger of what actually happened, entered or imported by the user:
//   { id, date, type: "call" | "draw" | "repay", amount (positive $),
//     purpose: "acq:<dealId>" | "fees" | "line-repay" | "line-interest" | "other",
//     notes }
// When a fund has entries, capital called and the sub line balance up to
// today come from the ledger instead of the model (which assumes every
// purchase is drawn on the line and repaid by a call after the max days).
// Only needs dated after today come from the model: the equity for purchases
// not yet made (unless the ledger already funds that asset) and later
// shortfall and fee calls. A purchase the model dates on or before today with
// no entry tagged to it is assumed paid on its model date (and flagged).

import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";
import { parseCSV } from "@/lib/fundTerms";

export const ACTIVITY_TYPES = [
  { value: "call", label: "Capital call" },
  { value: "draw", label: "Sub line draw" },
  { value: "repay", label: "Sub line repayment" },
];
export const PURPOSES = [
  { value: "fees", label: "Fees & expenses" },
  { value: "line-repay", label: "Sub line repayment" },
  { value: "line-interest", label: "Sub line interest & fees" },
  { value: "other", label: "Other" },
];

let seq = 0;
export const newActivityId = () => `ca-${Date.now().toString(36)}-${++seq}`;

const sum = (xs) => xs.reduce((s, x) => s + (Number(x.amount) || 0), 0);

// activity: ledger entries. modelCalls: [{ date, amount (>0), dealId?, purchase? }]
// LP + GP capital needs from the model before the sub line (purchase equity,
// shortfalls, fund fees).
export function actualCapital(activity, { todayISO, ipEndISO, commitments, modelCalls }) {
  const rows = (activity ?? []).filter((a) => a.date && Number(a.amount) > 0);
  const upTo = (iso) => rows.filter((a) => a.date <= iso);
  const calledBy = (iso) => sum(upTo(iso).filter((a) => a.type === "call"));
  const lineBy = (iso) => {
    const r = upTo(iso);
    return Math.max(0, sum(r.filter((a) => a.type === "draw")) - sum(r.filter((a) => a.type === "repay")));
  };
  // Assets the ledger has already funded (by a call or a line draw).
  const funded = new Set(rows.filter((a) => a.purpose?.startsWith("acq:")).map((a) => a.purpose.slice(4)));
  const future = (modelCalls ?? []).filter(
    (c) => c.date > todayISO && !(c.purchase && c.dealId && funded.has(c.dealId))
  );
  const needsAfter = sum(future);
  // Purchases the model dates on or before today that no entry is tagged to.
  const untaggedPast = (modelCalls ?? []).filter((c) => c.purchase && c.dealId && c.date <= todayISO && !funded.has(c.dealId));
  const needsThroughIP = sum(future.filter((c) => c.date <= ipEndISO));

  const calledToDate = calledBy(todayISO);
  const lineToday = lineBy(todayISO);
  // Past purchases with no tagged entry are assumed paid on the model's date.
  const untaggedAmount = sum(untaggedPast);
  const dryPowderToday = commitments - calledToDate - lineToday - untaggedAmount;
  const ipPassed = ipEndISO < todayISO;
  return {
    hasActuals: rows.length > 0,
    lastDate: rows.reduce((m, a) => (a.date > m ? a.date : m), ""),
    calledToDate,
    lineToday,
    dryPowderToday,
    futureNeeds: needsAfter,
    projectedCalls: calledToDate + lineToday + untaggedAmount + needsAfter,
    untaggedAmount,
    uncommitted: dryPowderToday - needsAfter,
    dryPowderAtIPEnd: ipPassed
      ? commitments - calledBy(ipEndISO) - lineBy(ipEndISO) - untaggedAmount
      : dryPowderToday - needsThroughIP,
    pctCalledToDate: commitments > 0 ? (calledToDate / commitments) * 100 : NaN,
    fundedAssets: funded,
    untaggedPast,
    totals: {
      calls: sum(rows.filter((a) => a.type === "call")),
      draws: sum(rows.filter((a) => a.type === "draw")),
      repays: sum(rows.filter((a) => a.type === "repay")),
    },
  };
}

export function purposeLabel(purpose, deals) {
  if (purpose?.startsWith("acq:")) {
    const d = deals.find((x) => x.id === purpose.slice(4));
    return `Acquisition – ${d?.inputs?.propertyName || "removed asset"}`;
  }
  return PURPOSES.find((p) => p.value === purpose)?.label ?? "Other";
}

// ── Import / export ──
const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s_]+/g, " ").replace(/[()$]/g, "").trim();
const COLS = {
  date: ["date", "call date", "value date", "transaction date", "due date"],
  type: ["type", "transaction type", "activity", "transaction"],
  amount: ["amount", "amount $", "total", "call amount", "capital called"],
  purpose: ["purpose", "asset", "use", "use of proceeds", "description", "investment"],
  notes: ["notes", "note", "memo", "comments"],
};
function toDate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const n = Number(s);
  if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  return null;
}
const money = (v) => {
  const s = String(v ?? "").trim();
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = parseFloat(s.replace(/[$,()\s-]/g, ""));
  return isFinite(n) ? (neg ? -n : n) : null;
};
function typeOf(v) {
  const t = norm(v);
  if (/repay|paydown|pay down/.test(t)) return "repay";
  if (/draw|borrow|advance/.test(t)) return "draw";
  if (/call|contribution|capital/.test(t) || !t) return "call";
  return null;
}
function purposeOf(v, deals) {
  const t = norm(v);
  if (!t) return "other";
  const d = deals.find((x) => norm(x.inputs?.propertyName) && t.includes(norm(x.inputs.propertyName)));
  if (d) return `acq:${d.id}`;
  if (/interest|unused|commitment fee/.test(t)) return "line-interest";
  if (/line|facility|sub/.test(t) && /repay|paydown/.test(t)) return "line-repay";
  if (/fee|expense|organi[sz]ation|management/.test(t)) return "fees";
  return "other";
}

export async function activityFromFile(file, deals) {
  const grid = /\.xlsx$/i.test(file.name) ? await readXlsxGrid(await file.arrayBuffer()) : parseCSV(await file.text());
  let header = -1, idx = {};
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const h = (grid[r] ?? []).map(norm);
    const found = {};
    for (const [k, syn] of Object.entries(COLS)) {
      const i = h.findIndex((x) => syn.includes(x) || syn.some((w) => x.startsWith(`${w} `)));
      if (i >= 0) found[k] = i;
    }
    if (found.date != null && found.amount != null) {
      header = r;
      idx = found;
      break;
    }
  }
  if (header < 0) throw new Error("Couldn't find Date and Amount columns. Use the template.");
  const out = [];
  let skipped = 0;
  for (const row of grid.slice(header + 1)) {
    if (!row?.some((v) => String(v ?? "").trim())) continue;
    const g = (k) => (idx[k] != null ? row[idx[k]] : "");
    const date = toDate(g("date"));
    const amt = money(g("amount"));
    const type = typeOf(g("type"));
    if (!date || !amt || !type) { skipped++; continue; }
    out.push({ id: newActivityId(), date, type, amount: Math.abs(amt), purpose: purposeOf(g("purpose"), deals), notes: String(g("notes") ?? "").trim() });
  }
  return { rows: out, skipped };
}

export function activityXlsx(activity, deals) {
  const header = ["Date", "Type (Capital call / Sub line draw / Sub line repayment)", "Amount ($)", "Purpose (asset name, Fees, Sub line repayment, Sub line interest, Other)", "Notes"];
  const rows = [...(activity ?? [])]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((a) => [
      a.date,
      ACTIVITY_TYPES.find((t) => t.value === a.type)?.label ?? a.type,
      Number(a.amount) || 0,
      a.purpose?.startsWith("acq:") ? deals.find((d) => d.id === a.purpose.slice(4))?.inputs?.propertyName ?? "" : purposeLabel(a.purpose, deals),
      a.notes ?? "",
    ]);
  return writeXlsx([header, ...rows], { sheetName: "Capital activity", colWidths: [12, 34, 14, 40, 30] });
}
