// Phase P: Dispositions. Sales in progress, offers and the track record.
// Each asset's sales are stored on the asset itself (inputs.dispositions), so
// they save with the asset record and every edit is in the change log. A sale
// covers the whole asset or chosen units; a partial sale's figures cover the
// part sold (its share of SF for cost, loan and equity).
import { underwrite } from "@/lib/calculations";
import { assetQuarterlyEvents, computeDatedWaterfall, xirr } from "@/lib/fundTimeline";
import { distPolicy, waterfallConfig } from "@/lib/fundPlan";

export const SALE_STAGES = [
  ["preparing", "Preparing"],
  ["marketing", "Marketing"],
  ["offers", "Offers"],
  ["contract", "Under contract"],
  ["closed", "Closed"],
  ["withdrawn", "Withdrawn"],
];
export const ACTIVE_SALE_STAGES = ["preparing", "marketing", "offers", "contract"];
export const SALE_REASONS = [
  ["plan_complete", "Business plan complete"],
  ["hold_reached", "Hold period reached"],
  ["fund_term", "Fund term"],
  ["opportunistic", "Opportunistic"],
];
export const BUYER_TYPES = ["Private investor", "REIT", "Institutional fund", "User / owner-occupier", "1031 exchange", "Developer", "Other"];
export const ROUNDS = [["initial", "Initial"], ["best_final", "Best and final"], ["other", "Other"]];
export const stageLabel = (k) => SALE_STAGES.find(([v]) => v === k)?.[1] ?? k;
export const reasonLabel = (k) => SALE_REASONS.find(([v]) => v === k)?.[1] ?? k;

const DAY = 86400000;
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const yearsBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY / 365.25;
let seq = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export function makeSale({ scope = "whole", unitIds = [], reason = "plan_complete", targetPrice = null, targetCapPct = null, targetClose = "", startedFrom = "" } = {}) {
  return {
    id: newId("sale"), scope, unitIds: scope === "partial" ? [...unitIds] : [], reason, targetPrice, targetCapPct, targetClose, stage: "preparing", withdrawnReason: "",
    bovs: [], brokerChosen: "", listing: { feePct: null, termMonths: null, exclusions: "" },
    marketing: { casSigned: 0, tours: 0, callForOffers: "" },
    contract: { psaDate: "", deposit: null, depositDue: "", hardDate: "", ddStart: "", ddDeadline: "", loanClosing: "", closingDate: "", priceLog: [] },
    closing: null, offers: [], startedFrom, createdAt: new Date().toISOString(),
  };
}
export function makeOffer(o = {}) {
  return { id: newId("offer"), buyer: "", buyerType: "Private investor", broker: "", date: "", round: "initial", price: null, deposit: null, ddDays: null, closingDays: null, financingContingency: false, notes: "", selected: false, ...o };
}
export function makeBov(o = {}) {
  return { id: newId("bov"), broker: "", price: null, capPct: null, feePct: null, notes: "", ...o };
}

// What's sold: the whole asset or the chosen units, with SF, rent and share.
export function saleSubject(inputs, sale) {
  const units = (inputs.units ?? []).filter((u) => n(u.squareFeet) > 0);
  const totalSF = n(inputs.squareFootage) || units.reduce((s, u) => s + n(u.squareFeet), 0);
  const rentOf = (u) => n(u.squareFeet) * n(u.currentRentPSF);
  if (sale?.scope !== "partial") {
    return { whole: true, units, sf: totalSF, rent: units.reduce((s, u) => s + (u.leaseStatus === "occupied" ? rentOf(u) : 0), 0), share: 1 };
  }
  const chosen = units.filter((u) => (sale.unitIds ?? []).includes(u.id));
  const sf = chosen.reduce((s, u) => s + n(u.squareFeet), 0);
  return { whole: false, units: chosen, sf, rent: chosen.reduce((s, u) => s + (u.leaseStatus === "occupied" ? rentOf(u) : 0), 0), share: totalSF > 0 ? sf / totalSF : 0 };
}

// The rest of the asset after a partial sale: re-modeled without the units sold.
export function remainingInputs(inputs, sale) {
  if (sale?.scope !== "partial") return null;
  const sub = saleSubject(inputs, sale);
  const keep = (inputs.units ?? []).filter((u) => !(sale.unitIds ?? []).includes(u.id));
  return { ...inputs, units: keep, squareFootage: Math.max(0, n(inputs.squareFootage) - sub.sf), purchasePrice: n(inputs.purchasePrice) * (1 - sub.share) };
}

// Model figures at a date: forward NOI, loan balance, selling costs %.
export function modelAt(inputs, dateISO) {
  const acq = inputs.acquisitionDate || dateISO;
  const e = Math.max(0, yearsBetween(acq, dateISO));
  const k = Math.floor(e), f = e - k;
  let long;
  try { long = underwrite({ ...inputs, realizedSalePrice: 0, realizedSaleDate: "", holdPeriodYears: Math.max(n(inputs.holdPeriodYears), k + 3) }); } catch { return { noiFwd: 0, loanBalance: 0, sellingCostsPct: 0, loan0: 0, equity: 0 }; }
  const cfs = long.annualCashFlows;
  const at = (t, key) => cfs[t - 1]?.[key] ?? 0;
  const loan0 = long.debt.loanAmount;
  const bal = (t) => (t <= 0 ? loan0 : at(t, "loanBalance"));
  return {
    noiFwd: (1 - f) * at(k + 1, "noi") + f * at(k + 2, "noi"),
    loanBalance: bal(k) + (bal(k + 1) - bal(k)) * f,
    sellingCostsPct: n(long.returns.sellingCostsPct),
    loan0,
    equity: n(long.debt.equityRequired),
  };
}

// Net proceeds of a price for a sale: price − selling costs − loan payoff
// (the sold part's share of the balance for a partial sale).
export function netProceeds(inputs, sale, price, dateISO) {
  const sub = saleSubject(inputs, sale);
  const m = modelAt(inputs, dateISO);
  const costs = n(price) * (m.sellingCostsPct / 100);
  const payoff = m.loanBalance * sub.share;
  const noi = m.noiFwd * sub.share;
  return { price: n(price), costs, payoff, net: n(price) - costs - payoff, psf: sub.sf ? n(price) / sub.sf : null, capPct: n(price) > 0 ? (noi / n(price)) * 100 : null, noi };
}

// Offers on one sale, each with its net proceeds; best net first. A buyer's
// earlier offers on other sales are listed with them.
export function offersCompared(inputs, sale, { allSales = [], todayISO, sort = true } = {}) {
  const at = sale.contract?.closingDate || sale.targetClose || todayISO;
  const rows = (sale.offers ?? []).map((o) => {
    const np = netProceeds(inputs, sale, o.price, at);
    const earlier = allSales.flatMap((s) => (s.sale.id === sale.id ? [] : (s.sale.offers ?? []).filter((x) => x.buyer && x.buyer.trim().toLowerCase() === (o.buyer || "").trim().toLowerCase()).map((x) => ({ asset: s.asset, date: x.date, price: x.price, round: x.round }))));
    return { ...o, ...np, earlier };
  });
  return sort ? rows.sort((a, b) => b.net - a.net) : rows;
}

// Every sale across the deals: [{ dealId, asset, fund, sale }].
export function allSales(deals) {
  return deals.flatMap((d) => (d.inputs?.dispositions ?? []).map((sale) => ({ dealId: d.id, asset: d.inputs.propertyName || d.id, fund: d.inputs.fundName || "", inputs: d.inputs, sale })));
}
export const activeSales = (deals) => allSales(deals).filter((x) => ACTIVE_SALE_STAGES.includes(x.sale.stage));

// Selecting an offer unselects the others on that sale.
export function selectOffer(sale, offerId) {
  return { ...sale, offers: (sale.offers ?? []).map((o) => ({ ...o, selected: o.id === offerId ? !o.selected : false })) };
}

// A price change under contract is logged on the sale.
export function changeContractPrice(sale, price, { reason = "", by = "", at = new Date().toISOString() } = {}) {
  const sel = (sale.offers ?? []).find((o) => o.selected);
  const from = sale.contract?.price ?? sel?.price ?? null;
  return { ...sale, contract: { ...sale.contract, price, priceLog: [...(sale.contract?.priceLog ?? []), { at, by, from, to: price, reason }] } };
}

// Closing: record the statement; a whole sale also sets the asset's realized
// sale (the model then uses it: Portfolio Return, valuations, header figures).
export function closeSale(inputs, saleId, { date, price, costs = null, loanPayoff = null } = {}) {
  const sale = (inputs.dispositions ?? []).find((s) => s.id === saleId);
  if (!sale) return inputs;
  const np = netProceeds(inputs, sale, price, date);
  const c = costs ?? np.costs;
  const p = loanPayoff ?? np.payoff;
  const closing = { date, price: n(price), costs: c, loanPayoff: p, net: n(price) - c - p };
  const next = { ...inputs, dispositions: inputs.dispositions.map((s) => (s.id === saleId ? { ...s, stage: "closed", closing } : s)) };
  if (sale.scope !== "partial") Object.assign(next, { realizedSalePrice: n(price), realizedSellingCosts: c, realizedSaleDate: date });
  return next;
}

// ── Track record: closed sales ──
export function trackRecord(deals, valuations = {}) {
  return allSales(deals).filter((x) => x.sale.stage === "closed" && x.sale.closing).map(({ dealId, asset, fund, inputs, sale }) => {
    const sub = saleSubject(inputs, sale);
    const cl = sale.closing;
    const acq = inputs.acquisitionDate;
    const hold = acq ? yearsBetween(acq, cl.date) : null;
    const m = modelAt(inputs, acq || cl.date);
    const equity = m.equity * sub.share;
    let irr = null, multiple = null, profit = null;
    if (sale.scope !== "partial") {
      try {
        const r = underwrite({ ...inputs, realizedSalePrice: cl.price, realizedSellingCosts: cl.costs, realizedSaleDate: cl.date, holdPeriodYears: Math.max(1, Math.round(hold ?? 1)) });
        irr = r.returns.irr; multiple = r.returns.equityMultiple; profit = (r.irrFlows ?? []).reduce((s, v) => s + v, 0);
      } catch { /* blanks */ }
    } else if (acq && equity > 0) {
      // Part sold: its share of equity in, its net proceeds out (interim cash flow not split).
      const flows = [{ date: acq, amount: -equity }, { date: cl.date, amount: cl.net }];
      irr = xirrPct(flows); multiple = cl.net / equity; profit = cl.net - equity;
    }
    let uw = null;
    try {
      const base = inputs.uwBaseline?.inputs ?? inputs;
      const r = underwrite({ ...base, realizedSalePrice: 0, realizedSaleDate: "" });
      uw = { irr: r.returns.irr, multiple: r.returns.equityMultiple, exitValue: r.returns.exitValue ?? null, holdYears: n(base.holdPeriodYears) };
    } catch { uw = null; }
    const marks = Object.entries(valuations[dealId] ?? {}).filter(([q, mk]) => q <= cl.date && n(mk?.value) > 0).sort(([a], [b]) => (a < b ? -1 : 1));
    const lastMark = marks.length ? { quarter: marks.at(-1)[0], value: n(marks.at(-1)[1].value) * sub.share } : null;
    return {
      dealId, saleId: sale.id, asset, fund, partial: sale.scope === "partial", sf: sub.sf, purchaseDate: acq, purchasePrice: n(inputs.purchasePrice) * sub.share, saleDate: cl.date, salePrice: cl.price,
      netProceeds: cl.net, holdYears: hold, irr, multiple, profit, uw, lastMark, vsMarkPct: lastMark?.value ? ((cl.price - lastMark.value) / lastMark.value) * 100 : null,
    };
  }).sort((a, b) => (a.saleDate < b.saleDate ? 1 : -1));
}

function xirrPct(flows) {
  try { const r = xirr(flows); return Number.isFinite(r) ? r * 100 : null; } catch { return null; }
}

export function trackTotals(rows) {
  const by = new Map();
  for (const r of rows) {
    for (const key of [r.fund || "No fund", "Firm"]) {
      const t = by.get(key) ?? { key, sales: 0, purchase: 0, sale: 0, net: 0, profit: 0 };
      t.sales += 1; t.purchase += r.purchasePrice; t.sale += r.salePrice; t.net += r.netProceeds; t.profit += r.profit ?? 0;
      by.set(key, t);
    }
  }
  return [...by.values()].sort((a, b) => (a.key === "Firm" ? 1 : b.key === "Firm" ? -1 : a.key.localeCompare(b.key)));
}

// ── Excel ──
const r0 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v));
const r2 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v * 100) / 100);
export function salesXlsx(rows, { todayISO } = {}) {
  const out = [["Asset", "Fund", "Sold", "SF", "Reason", "Stage", "Target price", "Target cap (%)", "Target $/SF", "Target close", "Broker", "Listing fee (%)", "CAs", "Tours", "Call for offers", "PSA date", "Hard date", "DD deadline", "Closing date", "Offers", "Best offer", "Best net proceeds"]];
  for (const x of rows) {
    const s = x.sale, sub = saleSubject(x.inputs, s);
    const offers = offersCompared(x.inputs, s, { todayISO });
    out.push([x.asset, x.fund, s.scope === "partial" ? `Part: ${sub.units.map((u) => u.name || u.id).join(", ")}` : "Whole asset", r0(sub.sf), reasonLabel(s.reason), stageLabel(s.stage), r0(s.targetPrice), r2(s.targetCapPct), sub.sf && s.targetPrice ? r2(s.targetPrice / sub.sf) : "", s.targetClose, s.brokerChosen, r2(s.listing?.feePct), s.marketing?.casSigned ?? "", s.marketing?.tours ?? "", s.marketing?.callForOffers ?? "", s.contract?.psaDate ?? "", s.contract?.hardDate ?? "", s.contract?.ddDeadline ?? "", s.contract?.closingDate ?? "", offers.length, r0(offers[0]?.price), r0(offers[0]?.net)]);
  }
  out.push([]);
  out.push(["Offers"], ["Asset", "Buyer", "Buyer type", "Broker", "Date", "Round", "Price", "$/SF", "Cap (%)", "Deposit", "DD days", "Closing days", "Financing contingency", "Selling costs", "Loan payoff", "Net proceeds", "Selected", "Notes"]);
  for (const x of rows) for (const o of offersCompared(x.inputs, x.sale, { todayISO })) out.push([x.asset, o.buyer, o.buyerType, o.broker, o.date, ROUNDS.find(([k]) => k === o.round)?.[1] ?? o.round, r0(o.price), r2(o.psf), r2(o.capPct), r0(o.deposit), o.ddDays ?? "", o.closingDays ?? "", o.financingContingency ? "Yes" : "No", r0(o.costs), r0(o.payoff), r0(o.net), o.selected ? "Yes" : "", o.notes]);
  return out;
}
export function trackXlsx(rows) {
  const out = [["Asset", "Fund", "Part sold", "SF", "Purchase date", "Purchase price", "Sale date", "Sale price", "Net proceeds", "Hold (years)", "IRR (%)", "Multiple (x)", "Profit", "Underwritten IRR (%)", "Underwritten multiple (x)", "Last mark", "Last mark quarter", "Sale vs. last mark (%)"]];
  for (const r of rows) out.push([r.asset, r.fund, r.partial ? "Yes" : "", r0(r.sf), r.purchaseDate, r0(r.purchasePrice), r.saleDate, r0(r.salePrice), r0(r.netProceeds), r2(r.holdYears), r2(r.irr), r2(r.multiple), r0(r.profit), r2(r.uw?.irr), r2(r.uw?.multiple), r0(r.lastMark?.value), r.lastMark?.quarter ?? "", r2(r.vsMarkPct)]);
  out.push([], ["Totals", "Sales", "Purchase", "Sale", "Net proceeds", "Profit"]);
  for (const t of trackTotals(rows)) out.push([t.key, t.sales, r0(t.purchase), r0(t.sale), r0(t.net), r0(t.profit)]);
  return out;
}

// ── Distribution of a closed sale's net proceeds through the fund waterfall ──
// fundDeals: the fund's deals as snapshots (with irrFlows). Every LP flow
// before the closing (the sold asset's model sale left out), then the net
// proceeds as a capital distribution on the closing date: the LP / GP split
// the waterfall gives (pref, catch-up and promote as set in the fund terms).
export function saleDistribution(fundDeals, terms, dealId, closing) {
  if (!closing?.date || !(closing.net > 0) || !terms) return null;
  const policy = distPolicy(terms);
  const before = fundDeals
    .filter((d) => Array.isArray(d.irrFlows) && d.irrFlows.length > 1)
    .flatMap((d) => assetQuarterlyEvents(d, terms, policy).events.filter((e) => e.date < closing.date && !(d.id === dealId && e.kind === "capital")));
  const wf = computeDatedWaterfall([...before, { date: closing.date, amount: closing.net, kind: "capital", dealId }], waterfallConfig(terms));
  const rows = wf.ledger.filter((r) => r.date === closing.date && r.kind === "capital");
  const lp = rows.reduce((s, r) => s + (r.lp ?? 0), 0);
  const gp = rows.reduce((s, r) => s + (r.gp ?? 0), 0);
  return { net: closing.net, lp, gp, held: Math.max(0, closing.net - lp - gp), gpPct: closing.net > 0 ? (gp / closing.net) * 100 : 0 };
}
