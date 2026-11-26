// ─── Finance → GP Partners (user, 11/26, 1.1.10) ────────────────────────────
// One list of the outside GP capital partners, their agreements, and the
// portfolios and deals they are in. Not a CRM: just the legal entity.
//
// Stored with the firm's settings (settings.gpPartners):
//   partners    [{ id, name, addedBy, addedAt }]
//   agreements  [{ id, partnerId, portfolio, dealId | null, capitalPct,
//                  gpSideSharePct, effective, docId | null, fileName,
//                  source: "claude" | "user", status: "checked" | "to-check",
//                  checkedBy, checkedAt, quotes: { field: text }, note }]
// An agreement's capitalPct is the partner's share of the GP capital
// commitment (of the portfolio, or of one deal's GP equity); gpSideSharePct
// its share of the promote paid to the GP side (not of the total promote).
//
// Decided with the user (11/26):
//   - the firm IS the sponsor; its capital is its share of the GP commitment;
//   - the GP earns no fees, only its share of the promote;
//   - a deal-level agreement gives the partner its shares on that deal only;
//     the rest of the portfolio is the firm's;
//   - an amendment applies from its effective date; earlier periods keep the
//     old terms (lib/gpEconomics.js partnerTermsAt);
//   - the committed-capital table includes the firm's own row, so it adds up
//     to all GP capital.
// A checked agreement fills its portfolio's Fund terms → Parties (the partner
// as a GP party with its dated terms); the firm's GP party has the rest.
import { gpPartiesOf, partiesOf } from "@/lib/gpEconomics";

export const EMPTY_GP_PARTNERS = { partners: [], agreements: [] };
const n0 = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const norm = (s) => String(s ?? "").trim().toLowerCase();
const pct = (v) => { const x = Number(v); return isFinite(x) ? Math.min(100, Math.max(0, x)) : 0; };
const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const gpPartnersOf = (x) => ({ partners: Array.isArray(x?.partners) ? x.partners : [], agreements: Array.isArray(x?.agreements) ? x.agreements : [] });

// A new partner (its legal name); an error when the name is blank or taken.
export function addPartner(gp, name, { by = "", at = new Date().toISOString() } = {}) {
  const g = gpPartnersOf(gp);
  const n = String(name ?? "").trim();
  if (!n) return { error: "Enter the partner's legal name." };
  if (g.partners.some((p) => norm(p.name) === norm(n))) return { error: `${n} is already in the list.` };
  const partner = { id: newId("gpp"), name: n, addedBy: by, addedAt: at };
  return { gp: { ...g, partners: [...g.partners, partner] }, partner };
}

// What an agreement still needs before its terms can be saved.
export function agreementMissing(a) {
  const out = [];
  if (!a?.partnerId) out.push("the partner");
  if (!a?.portfolio) out.push("the portfolio");
  if (a?.capitalPct === "" || a?.capitalPct == null || !isFinite(Number(a.capitalPct))) out.push("its share of the GP capital");
  if (a?.gpSideSharePct === "" || a?.gpSideSharePct == null || !isFinite(Number(a.gpSideSharePct))) out.push("its share of the GP's promote");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a?.effective ?? ""))) out.push("the effective date");
  return out;
}

// Claude's abstract of an agreement PDF (saved on the document, like the
// other deal documents) → a draft agreement, "to check". Matches the partner
// by name, the portfolio by name and a deal by its asset name.
// abstract: { doc_type: "gp_agreement", partner_name, portfolio, deal,
//   capital_pct, promote_pct_of_gp_side, fees, effective_date, quotes }
export function agreementFromAbstract(abs, { gp, funds = {}, deals = [], docId = null, fileName = "" } = {}) {
  if (!abs || abs.doc_type !== "gp_agreement") return null;
  const g = gpPartnersOf(gp);
  const partner = g.partners.find((p) => norm(p.name) === norm(abs.partner_name)) ?? null;
  const portfolio = Object.keys(funds).find((f) => norm(f) === norm(abs.portfolio)) ?? "";
  const deal = abs.deal ? deals.find((d) => norm(d.inputs?.propertyName) === norm(abs.deal) && (!portfolio || norm(d.inputs?.fundName) === norm(portfolio))) ?? null : null;
  return {
    id: newId("gpa"), partnerId: partner?.id ?? "", partnerName: abs.partner_name ?? "", portfolio, dealId: deal?.id ?? null, dealName: abs.deal ?? "",
    capitalPct: abs.capital_pct ?? "", gpSideSharePct: abs.promote_pct_of_gp_side ?? "", effective: abs.effective_date ?? "",
    fees: abs.fees ?? "", docId, fileName, source: "claude", status: "to-check", quotes: abs.quotes ?? {},
  };
}

// Save (check) an agreement: it becomes "checked" and its portfolio's
// parties are rebuilt from every checked agreement there.
export function saveAgreement(gp, a, { by = "", at = new Date().toISOString() } = {}) {
  const miss = agreementMissing(a);
  if (miss.length) return { error: `Still needed: ${miss.join(", ")}.` };
  const g = gpPartnersOf(gp);
  const rec = { id: a.id || newId("gpa"), partnerId: a.partnerId, portfolio: a.portfolio, dealId: a.dealId || null, capitalPct: pct(a.capitalPct), gpSideSharePct: pct(a.gpSideSharePct), effective: a.effective, docId: a.docId ?? null, fileName: a.fileName ?? "", source: a.source ?? "user", status: "checked", checkedBy: by, checkedAt: at, quotes: a.quotes ?? {}, note: a.note ?? "" };
  const agreements = g.agreements.some((x) => x.id === rec.id) ? g.agreements.map((x) => (x.id === rec.id ? rec : x)) : [...g.agreements, rec];
  return { gp: { ...g, agreements }, agreement: rec };
}
export function removeAgreement(gp, id) {
  const g = gpPartnersOf(gp);
  return { ...g, agreements: g.agreements.filter((x) => x.id !== id) };
}

// A portfolio's Fund terms with its GP parties rebuilt from the checked
// agreements: this firm's GP party has whatever capital and GP-side promote
// the partners don't (fund-wide, today); each partner is a GP party with its
// dated terms. Parties typed in by hand without a partner (older terms) are
// kept. The GP side's share of the promote (vs. the sponsor) is unchanged.
export function applyAgreements(terms, portfolio, gp, { todayISO = new Date().toISOString().slice(0, 10) } = {}) {
  const g = gpPartnersOf(gp);
  const P = partiesOf(terms);
  const side = P.promoteGpPct; // % of the total promote paid to the GP side
  const mine = g.agreements.filter((a) => a.status === "checked" && norm(a.portfolio) === norm(portfolio));
  const ids = [...new Set(mine.map((a) => a.partnerId))];
  const current = gpPartiesOf(terms);
  const kept = current.filter((x) => x.who === "external" && !x.partnerId);
  const partnerParties = ids.map((pid) => {
    const name = g.partners.find((p) => p.id === pid)?.name ?? "Outside GP";
    const list = mine.filter((a) => a.partnerId === pid).map((a) => ({ effective: a.effective, dealId: a.dealId || null, capitalPct: a.capitalPct, gpSideSharePct: a.gpSideSharePct })).sort((x, y) => (x.effective < y.effective ? -1 : 1));
    const fw = list.filter((x) => !x.dealId);
    const now = fw.filter((x) => x.effective <= todayISO).at(-1) ?? fw[0] ?? null; // fund-wide terms today (or the first, if not yet in force)
    return { id: `partner-${pid}`, who: "external", partnerId: pid, name, capitalPct: now ? now.capitalPct : 0, promotePct: now ? (side * now.gpSideSharePct) / 100 : 0, terms: list };
  });
  const ext = [...kept, ...partnerParties];
  const firm = current.find((x) => x.who === "firm") ?? { id: "gp1", who: "firm", name: "" };
  const firmParty = { ...firm, capitalPct: Math.max(0, 100 - ext.reduce((s, x) => s + x.capitalPct, 0)), promotePct: Math.max(0, side - ext.reduce((s, x) => s + x.promotePct, 0)) };
  return { ...terms, gpParties: [firmParty, ...ext] };
}

// The GP commitment of a portfolio: its terms' commitments × the GP
// commitment % (with no commitments entered, the GP equity in the model).
export function gpCommitment(terms, f) {
  const total = Number(terms?.targetEquity) || 0;
  const gpPct = Number(terms?.gpCommitPct) || 0;
  return total > 0 ? (total * gpPct) / 100 : n0(f?.equity?.gp);
}

// Committed capital by partner (the user's request), with this firm's row:
// per portfolio and in total, committed, invested to date (equity in assets
// acquired by today), unfunded, share of all GP capital, promote (projected
// and realized: assets sold by today) and co-invest profit.
// fundResults: fundGpEconomics results; funds: { name: terms }.
export function partnerSummary(fundResults = [], funds = {}, gp, { todayISO = new Date().toISOString().slice(0, 10) } = {}) {
  const g = gpPartnersOf(gp);
  const rows = new Map(); // key → { key, partnerId, name, firm, portfolios: [] }
  const rowOf = (key, init) => rows.get(key) ?? rows.set(key, { key, portfolios: [], ...init }).get(key);
  let totalCommitted = 0;
  for (const f of fundResults) {
    const px = f.parties;
    if (!px) continue;
    const terms = funds[f.fund] ?? {};
    const C = gpCommitment(terms, f);
    totalCommitted += C;
    const gpEqAll = n0(px.gp.equity);
    const sideOf = (a) => n0(px.gp.parties.reduce((s, x) => s + n0(x.assets?.find((y) => y.id === a.id)?.equity), 0));
    let partnersCommitted = 0;
    for (const party of px.gp.parties.filter((x) => x.who === "external")) {
      const per = party.assets ?? [];
      const invested = per.filter((x) => (f.assets.find((a) => a.id === x.id)?.acq ?? "9999") <= todayISO).reduce((s, x) => s + x.equity, 0);
      const realized = per.filter((x) => (f.assets.find((a) => a.id === x.id)?.exit ?? "9999") <= todayISO).reduce((s, x) => s + x.promote, 0);
      // Committed: fund-wide share × the GP commitment, plus each deal-level
      // share × that deal's GP equity (today's terms).
      const fw = party.terms?.length ? party.terms.filter((x) => !x.dealId && x.effective <= todayISO).at(-1) : { capitalPct: party.capitalPct };
      const dealRows = (party.terms ?? []).filter((x) => x.dealId).reduce((m, x) => (x.effective <= todayISO || !m.has(x.dealId) ? m.set(x.dealId, x) : m), new Map());
      let committed = (C * n0(fw?.capitalPct)) / 100;
      const scope = [];
      if (fw && n0(fw.capitalPct) > 0) scope.push("fund-wide");
      for (const [dealId, x] of dealRows) {
        const a = f.assets.find((y) => y.id === dealId);
        if (!a) continue;
        committed += (sideOf(a) * x.capitalPct) / 100;
        scope.push(a.name);
      }
      if (!party.partnerId && !scope.length) scope.push("fund-wide");
      partnersCommitted += committed;
      const key = party.partnerId ? `p:${party.partnerId}` : `n:${norm(party.label)}`;
      const r = rowOf(key, { partnerId: party.partnerId ?? null, name: g.partners.find((p) => p.id === party.partnerId)?.name ?? party.label, firm: false });
      // The shares as the agreement states them (today's fund-wide terms, else
      // the deal-level one), not diluted across the whole portfolio.
      const stated = fw && n0(fw.capitalPct) > 0 ? fw : [...dealRows.values()][0] ?? null;
      r.portfolios.push({ fund: f.fund, type: f.type, scope: scope.join(" · "), gpCommitment: C, committed, invested, unfunded: Math.max(0, committed - invested), capitalShare: stated ? n0(stated.capitalPct) : party.capitalShare, gpSideShare: stated && stated.gpSideSharePct != null ? n0(stated.gpSideSharePct) : n0(px.gp.promote) ? (party.promote / px.gp.promote) * 100 : null, promote: party.promote, realized, coinvest: party.coinvest, equity: party.equity });
    }
    // This firm (the sponsor): what the partners don't have, plus the sponsor's promote.
    const firmParties = px.gp.parties.filter((x) => x.who === "firm");
    const fEq = firmParties.flatMap((x) => x.assets ?? []);
    const invested = fEq.filter((x) => (f.assets.find((a) => a.id === x.id)?.acq ?? "9999") <= todayISO).reduce((s, x) => s + x.equity, 0);
    const promote = firmParties.reduce((s, x) => s + n0(x.promote), 0) + n0(px.sponsor.promote);
    const realized = n0(f.promote?.total) ? n0(f.promote?.realized) * (promote / n0(f.promote.total)) : 0;
    const committed = Math.max(0, C - partnersCommitted);
    const r = rowOf("firm", { partnerId: null, name: "This firm (sponsor)", firm: true });
    r.portfolios.push({ fund: f.fund, type: f.type, scope: "fund-wide", gpCommitment: C, committed, invested, unfunded: Math.max(0, committed - invested), capitalShare: gpEqAll > 0 ? (firmParties.reduce((s, x) => s + n0(x.equity), 0) / gpEqAll) * 100 : null, gpSideShare: null, promote, realized, coinvest: firmParties.reduce((s, x) => s + n0(x.coinvest), 0), equity: firmParties.reduce((s, x) => s + n0(x.equity), 0) });
  }
  // Partners with no portfolio yet still show (nothing committed).
  for (const p of g.partners) rowOf(`p:${p.id}`, { partnerId: p.id, name: p.name, firm: false });
  const sum = (xs, k) => xs.reduce((s, x) => s + n0(x[k]), 0);
  const list = [...rows.values()].map((r) => {
    const committed = sum(r.portfolios, "committed");
    const ag = g.agreements.filter((a) => a.partnerId && a.partnerId === r.partnerId);
    return { ...r, committed, invested: sum(r.portfolios, "invested"), unfunded: sum(r.portfolios, "unfunded"), promote: sum(r.portfolios, "promote"), realized: sum(r.portfolios, "realized"), coinvest: sum(r.portfolios, "coinvest"), share: totalCommitted > 0 ? (committed / totalCommitted) * 100 : null, agreements: { checked: ag.filter((a) => a.status === "checked").length, toCheck: ag.filter((a) => a.status !== "checked").length } };
  }).sort((a, b) => (a.firm ? -1 : b.firm ? 1 : b.committed - a.committed || a.name.localeCompare(b.name)));
  const partners = list.filter((r) => !r.firm);
  const firm = list.find((r) => r.firm) ?? null;
  return {
    rows: list,
    totals: {
      committed: sum(list, "committed"), invested: sum(list, "invested"), unfunded: sum(list, "unfunded"), promote: sum(list, "promote"), realized: sum(list, "realized"),
      partnersCommitted: sum(partners, "committed"), partnersUnfunded: sum(partners, "unfunded"), partnersPromote: sum(partners, "promote"),
      firmCommitted: firm?.committed ?? 0, firmUnfunded: firm?.unfunded ?? 0, firmPromote: firm?.promote ?? 0,
      portfolios: fundResults.filter((f) => f.parties).length,
    },
  };
}

// Excel rows: committed capital by partner, then each partner by portfolio.
export function gpPartnersXlsx(summary, { title = "" } = {}) {
  const t = summary.totals;
  return [
    [`${title}: GP Partners (internal)`],
    ["Committed capital by partner. Committed = the GP commitment × the partner's capital share (or a deal's GP equity × its share for a deal-level agreement); this firm (the sponsor) has the rest. Invested to date = equity in assets acquired by today. Promote from each portfolio's waterfall at the partner's share; this firm's includes the sponsor side."],
    [],
    ["Partner", "Portfolios / deals", "Committed", "Share of all GP capital (%)", "Invested to date", "Unfunded", "Promote (projected)", "Realized", "Co-invest profit (projected)"],
    ...summary.rows.map((r) => [r.name, r.portfolios.map((p) => `${p.fund}${p.scope && p.scope !== "fund-wide" ? `: ${p.scope}` : ""}`).join("; "), r.committed, r.share, r.invested, r.unfunded, r.promote, r.realized, r.coinvest]),
    ["Total", `${t.portfolios} portfolios`, t.committed, 100, t.invested, t.unfunded, t.promote, t.realized, ""],
    [],
    ["Partner", "Portfolio", "Scope", "GP commitment", "Committed", "Capital share (%)", "Share of the GP's promote (%)", "Invested", "Unfunded", "Promote (projected)", "Co-invest profit (projected)"],
    ...summary.rows.flatMap((r) => r.portfolios.map((p) => [r.name, p.fund, p.scope, p.gpCommitment, p.committed, p.capitalShare, p.gpSideShare, p.invested, p.unfunded, p.promote, p.coinvest])),
  ];
}
