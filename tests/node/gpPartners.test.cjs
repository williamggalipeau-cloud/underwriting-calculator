// 1.1.10 (user, 11/26): Finance → GP Partners (lib/gpPartners.js) and the
// agreement-driven GP parties (lib/gpEconomics.js), on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const G = j(R + "/lib/gpEconomics.js");
const GP = j(R + "/lib/gpPartners.js");
const FE = j(R + "/lib/firmEconomics.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1) => Math.abs(a - b) < e;
const T = "2026-11-26";
const fn = "Model Fund I";
const data = FX.workspaceData();
const deals = data.deals.filter((d) => d.inputs.fundName === fn && !d.id.startsWith("test-")).map((d) => SP.snapshotDeal(d.inputs, d.id));
const granite = deals.find((d) => d.inputs.propertyName === "Granite Ave Industrial");
const base = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], ...SP.SAMPLE_FUND_FEE_TERMS, targetEquity: 100e6, gpCommitPct: 5, name: fn, capitalActivity: [], gpParties: [{ id: "gp1", who: "firm", capitalPct: 100, promotePct: 70 }] };
const run = (terms) => G.fundGpEconomics(fn, deals, terms, { todayISO: T });

// Partners: one list, by legal name, no duplicates.
let gp = GP.EMPTY_GP_PARTNERS;
let r = GP.addPartner(gp, "Fictional Capital Partners LP"); gp = r.gp; const p1 = r.partner;
ok(GP.addPartner(gp, " fictional capital partners lp ").error && GP.addPartner(gp, "  ").error, "a partner's name is required and can't be added twice");
r = GP.addPartner(gp, "Sample Family Office LLC"); gp = r.gp; const p2 = r.partner;

// Claude's abstracts of the sample agreements → drafts to check.
const abs1 = require(R + "/docs/sample-deal-docs/gp-agreements/abstracts/gp-co-investment-agreement-fictional-capital-partners.json");
const abs2 = require(R + "/docs/sample-deal-docs/gp-agreements/abstracts/gp-participation-agreement-sample-family-office-granite-ave.json");
const d1 = GP.agreementFromAbstract(abs1, { gp, funds: { [fn]: base }, deals, docId: "doc1", fileName: "a.pdf" });
const d2 = GP.agreementFromAbstract(abs2, { gp, funds: { [fn]: base }, deals, docId: "doc2" });
ok(d1.partnerId === p1.id && d1.portfolio === fn && !d1.dealId && d1.capitalPct === 40 && d1.gpSideSharePct === 50 && d1.effective === "2026-01-15" && d1.status === "to-check" && d1.source === "claude" && /fifty percent/.test(d1.quotes.promote_pct_of_gp_side), "fund-wide agreement read: 40% of GP capital, 50% of the GP's promote, from 1/15/2026, with quotes, to check");
ok(d2.partnerId === p2.id && d2.dealId === granite.id && d2.capitalPct === 50 && d2.gpSideSharePct === 40, "deal-level agreement read: Granite Ave only, 50% / 40%");
ok(GP.saveAgreement(gp, { ...d1, effective: "" }).error && GP.agreementMissing({}).length === 5, "can't be saved incomplete");

// Saving fills the portfolio's parties; the firm (the sponsor) has the rest.
gp = GP.saveAgreement(gp, d1, { by: "t@example.com" }).gp;
gp = GP.saveAgreement(gp, d2, { by: "t@example.com" }).gp;
ok(gp.agreements.every((a) => a.status === "checked" && a.checkedBy === "t@example.com"), "saved agreements are checked, by whom");
const terms = GP.applyAgreements(base, fn, gp, { todayISO: T });
const [firm, fcp, sfo] = terms.gpParties;
ok(firm.who === "firm" && firm.capitalPct === 60 && close(firm.promotePct, 35, 1e-9) && fcp.partnerId === p1.id && fcp.capitalPct === 40 && close(fcp.promotePct, 35, 1e-9) && sfo.capitalPct === 0 && sfo.terms[0].dealId === granite.id, "parties: this firm 60% / 35% of total promote; the fund-wide partner 40% / 35% (half of the GP side's 70%); the deal-level partner only on Granite Ave");
ok(G.partiesOf(terms).promoteGpPct === 70 && G.partiesOf(terms).sponsorPromotePct === 30, "the GP side's share of the promote (vs. the sponsor) is unchanged");

const f = run(terms);
const px = f.parties;
const party = (pid) => px.gp.parties.find((x) => x.partnerId === pid);
const F = px.gp.parties.find((x) => x.who === "firm");
ok(close(party(p1.id).equity, 0.4 * px.gp.equity) && close(party(p1.id).promote, 0.5 * px.gp.promote), "fund-wide partner: 40% of the GP equity, 50% of the GP side's promote");
const ga = f.assets.find((a) => a.id === granite.id);
const gEq = party(p2.id).assets.find((x) => x.id === granite.id);
ok(party(p2.id).assets.filter((x) => x.equity > 0).length === 1 && gEq.equity > 0 && close(party(p2.id).promote, ga.promote * 0.7 * 0.4), "deal-level partner: its shares on Granite Ave only");
ok(close(F.equity + party(p1.id).equity + party(p2.id).equity, px.gp.equity) && close(F.promote + party(p1.id).promote + party(p2.id).promote, px.gp.promote), "the GP parties add up to the GP side (equity and promote)");
const fe = FE.firmEconomics([f]).totals;
ok(close(fe.equity, F.equity) && close(fe.promote, F.promote + px.sponsor.promote) && close(fe.promote + party(p1.id).promote + party(p2.id).promote, f.promote.total), "Firm Economics: the firm's GP share + the sponsor side; with the partners, all of the promote");

// An amendment applies from its effective date; earlier periods keep the old terms.
const amended = GP.saveAgreement(gp, { partnerId: p1.id, portfolio: fn, capitalPct: 40, gpSideSharePct: 25, effective: "2030-03-01" }).gp;
const fa = run(GP.applyAgreements(base, fn, amended, { todayISO: T }));
const before = fa.assets.filter((a) => a.exit < "2030-03-01"), after = fa.assets.filter((a) => a.exit >= "2030-03-01");
const pa = fa.parties.gp.parties.find((x) => x.partnerId === p1.id);
const promOf = (ids) => pa.assets.filter((x) => ids.some((a) => a.id === x.id)).reduce((s, x) => s + x.promote, 0);
ok(before.length > 0 && after.length > 0 && close(promOf(before), before.reduce((s, a) => s + a.promote * 0.7 * 0.5, 0)) && close(promOf(after), after.filter((a) => a.id !== granite.id).reduce((s, a) => s + a.promote * 0.7 * 0.25, 0) + (after.some((a) => a.id === granite.id) ? ga.promote * 0.7 * 0.25 : 0)), `amendment from 3/1/2030: sales before it at 50% of the GP's promote, after it at 25% (${before.length} / ${after.length} assets)`);
ok(G.partnerTermsAt({ terms: [{ effective: "2026-06-01", dealId: null, capitalPct: 30, gpSideSharePct: 10 }] }, "x", "2026-01-01") === null, "before its first agreement takes effect, a partner has no share");

// Committed capital by partner, with this firm's row (adds up to all GP capital).
const S = GP.partnerSummary([f], { [fn]: terms }, gp, { todayISO: T });
const row = (n) => S.rows.find((x) => x.name === n);
ok(S.rows[0].firm && S.rows[0].name === "This firm (sponsor)" && close(S.totals.committed, 5e6) && close(S.totals.committed, S.rows.reduce((s, x) => s + x.committed, 0)), "committed capital adds up to the $5.00M GP commitment, this firm's row first");
ok(close(row("Fictional Capital Partners LP").committed, 2e6) && close(row("Sample Family Office LLC").committed, 0.5 * (F.assets.find((x) => x.id === granite.id).equity + gEq.equity + party(p1.id).assets.find((x) => x.id === granite.id).equity)), "fund-wide: 40% of the GP commitment; one deal: 50% of that deal's GP equity");
ok(S.rows.every((x) => close(x.unfunded, Math.max(0, x.committed - x.invested)) || x.portfolios.length > 1) && close(S.totals.promote, f.promote.total) && row("Fictional Capital Partners LP").agreements.checked === 1, "invested, unfunded, promote (all of it, with the sponsor side on the firm's row), agreements");
ok(S.rows.every((x) => x.share == null || x.share <= 100) && close(S.rows.reduce((s, x) => s + (x.share ?? 0), 0), 100, 1e-6), "shares of all GP capital add to 100%");
ok(GP.gpPartnersXlsx(S, { title: "T" }).some((x) => x[0] === "Fictional Capital Partners LP"), "Excel rows");

// Removing an agreement rebuilds the parties without it; nothing else changes without agreements.
const gp2 = GP.removeAgreement(gp, gp.agreements.find((a) => a.partnerId === p2.id).id);
ok(GP.applyAgreements(base, fn, gp2).gpParties.length === 2, "removed: the partner leaves the portfolio's parties");
const plain = run(base);
ok(close(plain.parties.gp.parties[0].promote, plain.parties.gp.promote) && plain.parties.gp.parties[0].assets.length === plain.assets.length, "no partners: this firm has all of the GP side, asset by asset");
ok(GP.partnerSummary([plain], { [fn]: base }, GP.EMPTY_GP_PARTNERS).rows.length === 1, "no partners: just this firm's row");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
