// Version 1.1 (user, 11/25): Claude reads disposition documents (BOV, LOI /
// offer letter, PSA and amendments, closing statement) and the user applies
// them field by field to the sale, its offers or its closing. Nothing
// changes until a field is ticked and applied. An LOI from a buyer who
// already has an offer updates that offer and keeps its earlier terms in the
// offer's history; a new buyer gets a new offer.
import { fieldValue, docField } from "@/lib/dealDocTypes";
import { changeContractPrice, closeSale, makeBov, makeOffer, netProceeds } from "@/lib/dispositions";

// Disposition document types Claude can read, and what each applies to.
export const DISP_REVIEW_TYPES = {
  bov: "The sale's BOV entry for that broker (a new one if none); the target price if you tick it",
  offer_letter: "That buyer's offer (earlier terms kept in its history); a new offer for a new buyer",
  psa: "The sale's contract: price, deposit, hard date, due diligence, closing (to the Dashboard)",
  closing_disp: "The closing: the realized sale (Track Record) and, for a whole sale, the asset's realized sale",
};
export const canReview = (type) => type in DISP_REVIEW_TYPES;

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ");
const quoteOf = (abs, key) => docField(abs, key)?.evidence?.[0]?.quote ?? "";
const same = (a, b) => (a == null || a === "" ? b == null || b === "" : typeof a === "number" || typeof b === "number" ? Math.abs(Number(a) - Number(b)) < 0.5 : norm(a) === norm(b));
// "No financing contingency", "all cash" → false; "subject to financing" → true.
export function financingOf(v) {
  const s = norm(v);
  if (!s) return null;
  if (/\b(no|none|not|without|all cash|waive)/.test(s)) return false;
  if (/financ|loan|contingen|subject to/.test(s)) return true;
  return null;
}

// The sale, and for an LOI the offer it updates (by offer id, else buyer name).
function targets(inputs, meta, abs) {
  const sale = (inputs.dispositions ?? []).find((s) => s.id === meta.saleId) ?? null;
  if (!sale) return { sale: null };
  if (meta.type === "offer_letter") {
    const buyer = fieldValue(abs, "offer_letter", "buyer");
    const offer = (sale.offers ?? []).find((o) => o.id === meta.offerId) ?? (buyer ? (sale.offers ?? []).find((o) => norm(o.buyer) && norm(o.buyer) === norm(buyer)) : null) ?? null;
    return { sale, offer };
  }
  if (meta.type === "bov") {
    const broker = fieldValue(abs, "bov", "broker");
    const bov = broker ? (sale.bovs ?? []).find((b) => norm(b.broker) === norm(broker)) ?? null : null;
    return { sale, bov };
  }
  return { sale };
}

const row = (abs, docKey, key, label, kind, appValue, docValue, { checked = true } = {}) =>
  docValue == null || docValue === "" ? null : { key, docKey, label, kind, appValue: appValue ?? null, docValue, differs: !same(appValue, docValue), checked: checked && !same(appValue, docValue), quote: quoteOf(abs, docKey) };

// Rows to show: each field the document gives, what the sale / offer has now.
// meta: { type, saleId, offerId } (from the document's title); abs: its abstract.
export function dispositionRows(inputs, meta, abs) {
  if (!abs || !canReview(meta.type)) return { rows: [], target: null };
  const t = meta.type;
  const v = (k) => fieldValue(abs, t, k);
  const { sale, offer, bov } = targets(inputs, meta, abs);
  if (!sale) return { rows: [], target: null, error: "The sale this document belongs to no longer exists." };
  let rows = [];
  let target = "";
  if (t === "bov") {
    target = bov ? `BOV from ${bov.broker}` : `a new BOV${v("broker") ? ` from ${v("broker")}` : ""}`;
    const range = [v("value_low"), v("value_high")].every((x) => x != null) ? `Value range $${Math.round(v("value_low")).toLocaleString("en-US")}–$${Math.round(v("value_high")).toLocaleString("en-US")}` : "";
    const notes = [range, v("list_price") != null ? `list $${Math.round(v("list_price")).toLocaleString("en-US")}` : "", v("price_psf") != null ? `$${Number(v("price_psf")).toFixed(0)}/SF` : "", v("marketing_timeline") || "", v("bov_date") ? `BOV dated ${v("bov_date")}` : ""].filter(Boolean).join("; ");
    rows = [
      row(abs, "broker", "broker", "Broker", "text", bov?.broker, v("broker")),
      row(abs, "value_mid", "price", "Value (BOV price)", "money", bov?.price, v("value_mid")),
      row(abs, "cap_rate", "capPct", "Cap rate (%)", "pct", bov?.capPct, v("cap_rate")),
      row(abs, "listing_fee_pct", "feePct", "Proposed listing fee (%)", "pct", bov?.feePct, v("listing_fee_pct")),
      notes ? { key: "notes", docKey: "value_low", label: "Notes (range, list price, $/SF, timeline)", kind: "text", appValue: bov?.notes ?? null, docValue: notes, differs: !same(bov?.notes, notes), checked: !same(bov?.notes, notes), quote: quoteOf(abs, "value_low") || quoteOf(abs, "list_price") } : null,
      row(abs, "list_price", "targetPrice", "Sale target price (recommended list price)", "money", sale.targetPrice, v("list_price"), { checked: false }),
    ];
  } else if (t === "offer_letter") {
    target = offer ? `the offer from ${offer.buyer || "this buyer"}` : `a new offer${v("buyer") ? ` from ${v("buyer")}` : ""}`;
    const fin = financingOf(v("financing_contingency"));
    rows = [
      row(abs, "buyer", "buyer", "Buyer", "text", offer?.buyer, v("buyer")),
      row(abs, "loi_date", "date", "Offer date", "date", offer?.date, v("loi_date")),
      row(abs, "purchase_price", "price", "Price", "money", offer?.price, v("purchase_price")),
      row(abs, "deposit", "deposit", "Deposit", "money", offer?.deposit, v("deposit")),
      row(abs, "dd_days", "ddDays", "Due diligence (days)", "number", offer?.ddDays, v("dd_days")),
      row(abs, "closing_days", "closingDays", "Closing (days after due diligence)", "number", offer?.closingDays, v("closing_days")),
      fin == null ? null : { key: "financingContingency", docKey: "financing_contingency", label: "Financing contingency", kind: "bool", appValue: offer ? !!offer.financingContingency : null, docValue: fin, differs: !offer || !!offer.financingContingency !== fin, checked: !offer || !!offer.financingContingency !== fin, quote: quoteOf(abs, "financing_contingency") },
    ];
  } else if (t === "psa") {
    target = "the sale's contract";
    const c = sale.contract ?? {};
    const sel = (sale.offers ?? []).find((o) => o.selected);
    const dep = [v("initial_deposit"), v("additional_deposit")].filter((x) => x != null);
    rows = [
      row(abs, "psa_date", "psaDate", "P&S signed", "date", c.psaDate, v("psa_date")),
      row(abs, "purchase_price", "price", "Contract price", "money", c.price ?? sel?.price, v("purchase_price")),
      dep.length ? { key: "deposit", docKey: "initial_deposit", label: dep.length > 1 ? "Deposit (initial + additional)" : "Deposit", kind: "money", appValue: c.deposit ?? null, docValue: dep.reduce((a, b) => a + b, 0), differs: !same(c.deposit, dep.reduce((a, b) => a + b, 0)), checked: !same(c.deposit, dep.reduce((a, b) => a + b, 0)), quote: quoteOf(abs, "initial_deposit") } : null,
      row(abs, "deposit_hard_date", "hardDate", "Hard money due", "date", c.hardDate, v("deposit_hard_date")),
      row(abs, "dd_expiry", "ddDeadline", "Due diligence ends", "date", c.ddDeadline, v("dd_expiry")),
      row(abs, "closing_date", "closingDate", "Deal closing", "date", c.closingDate, v("closing_date")),
      !["contract", "closed"].includes(sale.stage) ? { key: "stage", docKey: "psa_date", label: "Stage", kind: "text", appValue: sale.stage, docValue: "contract", differs: true, checked: true, quote: quoteOf(abs, "psa_date") } : null,
    ];
  } else if (t === "closing_disp") {
    target = "the closing";
    const cl = sale.closing ?? {};
    const costs = [v("selling_costs"), v("credits")].filter((x) => x != null);
    rows = [
      row(abs, "closing_date", "date", "Closing date", "date", cl.date, v("closing_date")),
      row(abs, "sale_price", "price", "Sale price", "money", cl.price, v("sale_price")),
      costs.length ? { key: "costs", docKey: "selling_costs", label: costs.length > 1 ? "Selling costs and credits to buyer" : "Selling costs", kind: "money", appValue: cl.costs ?? null, docValue: costs.reduce((a, b) => a + b, 0), differs: !same(cl.costs, costs.reduce((a, b) => a + b, 0)), checked: true, quote: quoteOf(abs, "selling_costs") || quoteOf(abs, "credits") } : null,
      row(abs, "loan_payoff", "loanPayoff", "Loan payoff", "money", cl.loanPayoff, v("loan_payoff")),
      v("net_proceeds") != null ? { key: "netCheck", docKey: "net_proceeds", label: "Net proceeds (statement; for checking)", kind: "money", appValue: cl.net ?? null, docValue: v("net_proceeds"), differs: false, checked: false, info: true, quote: quoteOf(abs, "net_proceeds") } : null,
    ];
  }
  return { rows: rows.filter(Boolean), target, sale, offer: offer ?? null, bov: bov ?? null };
}

// Apply the ticked rows; returns { inputs, entries } (entries for the change log).
export function applyDisposition(inputs, meta, abs, keys, { docId = null, by = "", todayISO = new Date().toISOString().slice(0, 10) } = {}) {
  const { rows, sale, offer, bov } = dispositionRows(inputs, meta, abs);
  const pick = rows.filter((r) => keys.includes(r.key) && !r.info);
  if (!sale || !pick.length) return { inputs, entries: [] };
  const val = (k) => pick.find((r) => r.key === k)?.docValue;
  const has = (k) => pick.some((r) => r.key === k);
  const entries = pick.map((r) => ({ field: r.label, from: r.appValue, to: r.docValue }));
  const updateSale = (fn) => ({ ...inputs, dispositions: (inputs.dispositions ?? []).map((s) => (s.id === sale.id ? fn(s) : s)) });
  const t = meta.type;
  if (t === "bov") {
    return { entries, inputs: updateSale((s) => {
      const patch = Object.fromEntries(["broker", "price", "capPct", "feePct", "notes"].filter(has).map((k) => [k, val(k)]));
      const bovs = bov ? (s.bovs ?? []).map((b) => (b.id === bov.id ? { ...b, ...patch, docId } : b)) : [...(s.bovs ?? []), makeBov({ ...patch, docId })];
      return { ...s, bovs, ...(has("targetPrice") ? { targetPrice: val("targetPrice") } : {}) };
    }) };
  }
  if (t === "offer_letter") {
    return { entries, inputs: updateSale((s) => {
      const patch = Object.fromEntries(["buyer", "date", "price", "deposit", "ddDays", "closingDays", "financingContingency"].filter(has).map((k) => [k, val(k)]));
      if (!offer) return { ...s, offers: [...(s.offers ?? []), makeOffer({ ...patch, docId, history: [] })], stage: ["preparing", "marketing"].includes(s.stage) ? "offers" : s.stage };
      // The offer's earlier terms go into its history (user, 11/25).
      const earlier = { at: todayISO, by, docId: offer.docId ?? null, terms: { buyer: offer.buyer, date: offer.date, round: offer.round, price: offer.price, deposit: offer.deposit, ddDays: offer.ddDays, closingDays: offer.closingDays, financingContingency: !!offer.financingContingency } };
      return { ...s, offers: (s.offers ?? []).map((o) => (o.id === offer.id ? { ...o, ...patch, docId, history: [...(o.history ?? []), earlier] } : o)) };
    }) };
  }
  if (t === "psa") {
    return { entries, inputs: updateSale((s) => {
      let next = s;
      if (has("price")) next = changeContractPrice(next, val("price"), { reason: "From the PSA", by });
      const c = { ...next.contract };
      for (const k of ["psaDate", "deposit", "hardDate", "ddDeadline", "closingDate"]) if (has(k)) c[k] = val(k);
      return { ...next, contract: { ...c, docId }, ...(has("stage") ? { stage: "contract" } : {}) };
    }) };
  }
  if (t === "closing_disp") {
    const cl = sale.closing ?? {};
    const date = has("date") ? val("date") : cl.date;
    const price = has("price") ? val("price") : cl.price;
    if (!date || price == null) return { inputs, entries: [] };
    const np = netProceeds(inputs, sale, price, date);
    let next = closeSale(inputs, sale.id, { date, price, costs: has("costs") ? val("costs") : cl.costs ?? np.costs, loanPayoff: has("loanPayoff") ? val("loanPayoff") : cl.loanPayoff ?? np.payoff });
    next = { ...next, dispositions: next.dispositions.map((s) => (s.id === sale.id ? { ...s, closing: { ...s.closing, docId } } : s)) };
    return { entries, inputs: next };
  }
  return { inputs, entries: [] };
}
