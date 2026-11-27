// 1.1.16 (user, 11/27): price per SF, break-even occupancy and the comps of
// a sale. Pure functions; every screen and export that shows one of these
// figures calls these, so the same figure agrees everywhere.
import { underwrite } from "@/lib/calculations";
import { compStats, filterComps } from "@/lib/comps";
import { netProceeds, saleSubject } from "@/lib/dispositions";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── Price per SF ──
export const perSF = (amount, sf) => (n(sf) > 0 && amount != null && Number.isFinite(Number(amount)) ? Number(amount) / n(sf) : null);
export const assetSF = (inputs) => n(inputs?.squareFootage) || (inputs?.units ?? []).reduce((s, u) => s + n(u.squareFeet), 0);
// All-in basis = purchase price + closing costs + the capital plan (the
// model's total cost of the acquisition without the rate cap premium, so the
// screens and the sample documents state the same figure).
export function allInBasis(inputs, model = null) {
  let u = model;
  if (!u) { try { u = underwrite(inputs); } catch { u = null; } }
  const d = u?.debt;
  if (d && Number.isFinite(d.equityRequired) && Number.isFinite(d.loanAmount)) return d.equityRequired + d.loanAmount - n(d.capPremium);
  return n(inputs?.purchasePrice) + n(inputs?.capexBudget);
}

// ── Break-even occupancy ──
// The occupancy at which income just covers operating expenses and the
// payment on the current loan:
//   (operating expenses + debt service) ÷ potential gross income
// taken from one year of the asset's model (the hold year in progress, or
// year 1 for a deal not yet bought). Cushion = occupancy − break-even, in
// points: amber under 10, red under 5 (user, 11/27).
export const BREAK_EVEN_FLAGS = Object.freeze({ amberPts: 10, redPts: 5 });
export function holdYearAt(inputs, todayISO) {
  const acq = inputs?.acquisitionDate;
  const hold = Math.max(1, Math.round(n(inputs?.holdPeriodYears) || 1));
  if (!acq || !todayISO || todayISO <= acq) return 1;
  const years = (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${acq}T00:00:00Z`)) / 86_400_000 / 365.25;
  return Math.min(hold, Math.max(1, Math.floor(years) + 1));
}
export function breakEvenOccupancy(inputs, { year = null, todayISO = null, model = null } = {}) {
  let u = model;
  if (!u) { try { u = underwrite(inputs); } catch { u = null; } }
  const rows = u?.annualCashFlows ?? [];
  const yr = Math.min(Math.max(1, year ?? holdYearAt(inputs, todayISO)), Math.max(1, rows.length));
  const y = rows[yr - 1];
  const pgi = n(y?.grossRevenue);
  if (!y || !(pgi > 0)) return null;
  const opex = n(y.operatingExpenses), debtService = n(y.debtService);
  const breakEvenPct = ((opex + debtService) / pgi) * 100;
  const occupancyPct = (1 - n(y.physicalVacancy) / pgi) * 100;
  const cushionPts = occupancyPct - breakEvenPct;
  const status = cushionPts < BREAK_EVEN_FLAGS.redPts ? "red" : cushionPts < BREAK_EVEN_FLAGS.amberPts ? "amber" : "ok";
  return { year: yr, pgi, opex, debtService, breakEvenPct, occupancyPct, cushionPts, status, label: status === "red" ? "Thin" : status === "amber" ? "Watch" : "Comfortable" };
}

// ── Comps of a sale (the disposition set) ──
// An asset has two sets of sales comps: the acquisition set (inputs.salesComps,
// Research → Comps) and, once a sale is started, that sale's disposition set
// (sale.comps, the same shape). Valuation uses neither; lease comps belong to
// Active Leasing only.
const EMPTY_SET = () => ({ comps: [], marketGrowthPct: 3, spreadBp: 25, filters: { sinceISO: "", minSF: "", maxSF: "", type: "" } });
export const saleCompsOf = (sale) => (sale?.comps && Array.isArray(sale.comps.comps) ? sale.comps : null);
export const saleCompsState = (sale) => saleCompsOf(sale) ?? EMPTY_SET();
// The state saved on the sale from a comps edit (only the comps fields).
export function saveSaleComps(next, { todayISO = "" } = {}) {
  const e = EMPTY_SET();
  return { comps: next?.comps ?? [], marketGrowthPct: next?.marketGrowthPct ?? e.marketGrowthPct, spreadBp: next?.spreadBp ?? e.spreadBp, filters: { ...e.filters, ...(next?.filters ?? {}) }, startedAt: next?.startedAt || todayISO || "" };
}
// A starting point: the acquisition set's comps, as copies with new ids, added
// to what the sale already has (a comp already there by name and date is skipped).
export function copyAcquisitionComps(inputs, sale, { todayISO = "" } = {}) {
  const cur = saleCompsState(sale);
  const key = (c) => `${String(c.name ?? "").trim().toLowerCase()}|${c.saleDate ?? ""}`;
  const have = new Set(cur.comps.map(key));
  const add = (inputs?.salesComps?.comps ?? []).filter((c) => !have.has(key(c))).map((c, i) => ({ ...c, id: `dc-${sale?.id ?? "sale"}-${cur.comps.length + i + 1}`, copiedFrom: c.id ?? null }));
  return { state: saveSaleComps({ ...cur, comps: [...cur.comps, ...add] }, { todayISO: cur.startedAt || todayISO }), added: add.length };
}
// What the comps in use imply for what is being sold, next to the broker
// opinions, the asking price and the selected offer. Each row: price, $/SF,
// cap rate on the forward NOI, and the gap to the comps' $/SF value.
export function saleCompsView(inputs, sale, { todayISO } = {}) {
  const state = saleCompsState(sale);
  const used = filterComps(state.comps ?? [], state.filters ?? {});
  const stats = compStats(used, { asOfISO: todayISO, marketGrowthPct: 0 });
  const sub = saleSubject(inputs, sale);
  const at = sale?.contract?.closingDate || sale?.targetClose || todayISO;
  const noi = netProceeds(inputs, sale, 0, at).noi;
  const row = (key, label, price) => {
    const p = price != null && Number.isFinite(Number(price)) && Number(price) > 0 ? Number(price) : null;
    return { key, label, price: p, psf: p != null ? perSF(p, sub.sf) : null, capPct: p != null && noi > 0 ? (noi / p) * 100 : null };
  };
  const psf = stats.psf?.mean ?? null, cap = stats.cap?.mean ?? null;
  const byPsf = row("comps_psf", "Comps, by $ / SF", psf != null && sub.sf ? psf * sub.sf : null);
  const byCap = row("comps_cap", "Comps, by cap rate", cap > 0 && noi > 0 ? noi / (cap / 100) : null);
  const sel = (sale?.offers ?? []).find((o) => o.selected) ?? null;
  const rows = [
    byPsf, byCap,
    ...(sale?.bovs ?? []).filter((b) => n(b.price) > 0).map((b) => row(`bov:${b.id}`, `Broker opinion${b.broker ? ` (${b.broker})` : ""}`, b.price)),
    ...(n(sale?.targetPrice) > 0 ? [row("asking", "Asking price", sale.targetPrice)] : []),
    ...(sel && n(sel.price) > 0 ? [row(`offer:${sel.id}`, `${sale.stage === "contract" ? "Offer under contract" : "Selected offer"}${sel.buyer ? ` (${sel.buyer})` : ""}`, sel.price)] : []),
  ].map((r) => ({ ...r, vsCompsPct: r.key === "comps_psf" || r.price == null || byPsf.price == null ? null : (r.price / byPsf.price - 1) * 100 }));
  return { state, used: stats.used, count: (state.comps ?? []).length, avgPsf: psf, avgCapPct: cap, sf: sub.sf, noi, rows, startedAt: state.startedAt ?? "" };
}
const r0 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v));
const r2 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v * 100) / 100);
// Rows for the sales Excel: each sale's comps and what they imply.
export function saleCompsXlsx(rows, { todayISO } = {}) {
  const out = [["Disposition comps"], ["Asset", "Comp", "City", "Sale date", "SF", "Price", "$/SF", "Cap (%)", "Occupancy (%)", "In use"]];
  for (const x of rows) for (const c of saleCompsState(x.sale).comps) out.push([x.asset, c.name ?? "", [c.city, c.state].filter(Boolean).join(", "), c.saleDate ?? "", r0(c.sf), r0(c.price), r2(c.pricePSF), r2(c.capRate), r2(c.occupancy), c.include ? "Yes" : "No"]);
  out.push([], ["What the comps imply"], ["Asset", "Measure", "Price", "$/SF", "Cap (%)", "vs. comps by $/SF (%)"]);
  for (const x of rows) { const v = saleCompsView(x.inputs, x.sale, { todayISO }); if (!v.count) continue; for (const r of v.rows) out.push([x.asset, r.label, r0(r.price), r2(r.psf), r2(r.capPct), r2(r.vsCompsPct)]); }
  return out;
}
