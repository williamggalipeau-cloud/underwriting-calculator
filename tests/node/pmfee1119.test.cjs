// 1.1.19 (user, 11/27): the property management fee is paid asset by asset,
// to this firm or to a third-party servicer, by the asset's setup.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const G = j(R + "/lib/gpEconomics.js");
const FE = j(R + "/lib/firmEconomics.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 0.5) => Math.abs(a - b) < e;
const T = "2026-11-27", fn = "Model Fund I";
const f0 = buildSampleFund({ todayISO: T });
const terms = { ...DEFAULT_FUND_TERMS, ...SP.SAMPLE_FUND_FEE_TERMS, ...f0.termsPatch, name: fn, targetEquity: SP.SAMPLE_FUND_COMMITMENTS };
const run = (edit = (d) => d, t = terms) => G.fundGpEconomics(fn, f0.deals.map(edit).map((d) => SP.snapshotDeal(d.inputs, d.id)), t, { todayISO: T });
const third = (ids, name = "Fictional Property Services LLC") => (d) => (ids.includes(d.id) ? { ...d, inputs: { ...d.inputs, propertyManagementFirm: { type: "third", name } } } : d);
const noFirm = (d) => { const { propertyManagementFirm, ...inp } = d.inputs; return { ...d, inputs: inp }; };

// Who is paid: the asset when its firm is set, else the portfolio's terms.
ok(G.pmPayeeOf({ propertyManagementFirm: { type: "third", name: "X" } }, { feeToPm: "sponsor" }) === "third" && G.pmPayeeOf({ propertyManagementFirm: { type: "sponsor" } }, { feeToPm: "third" }) === "sponsor", "the asset's firm decides, whatever the portfolio's terms say");
ok(G.pmPayeeOf({}, { feeToPm: "third" }) === "third" && G.pmPayeeOf({}, {}) === "sponsor" && G.pmPayeeOf({ propertyManager: "Pat Lee" }, { feeToPm: "third" }) === "third", "an asset with no firm set follows the portfolio's terms (as before 1.1.19)");
ok(G.pmServicerOf({ propertyManagementFirm: { type: "third", name: " Servicer A " } }, {}) === "Servicer A" && G.pmServicerOf({}, { feeToPm: "third", pmThirdParty: "Terms Co" }) === "Terms Co" && G.pmServicerOf({ propertyManagementFirm: { type: "sponsor" } }, { pmThirdParty: "Terms Co" }) === "", "the servicer's name: the asset's, else the terms'; none when this firm manages");

// Model Fund I: all nine managers are at this firm, so nothing moves.
const base = run();
ok(base.assets.length === 9 && base.assets.every((a) => a.pmPayee === "sponsor" && a.pmThird === 0) && base.fees.pmThird === 0 && base.feesToDateByType.pmThird === 0, "Model Fund I: every asset pays this firm; nothing goes to a servicer");
ok(close(base.parties.sponsor.feesByType.pm, base.fees.pm) && base.parties.third.fees === 0 && close(base.fees.pm, base.assets.reduce((s, a) => s + a.pm, 0)) && close(FE.firmEconomics([base]).totals.fees, base.fees.total), "Model Fund I: the firm's property management fee is the whole fee, and its fee income is all the fees");
ok(base.parties.pmPayees.sponsor === 9 && base.parties.pmPayees.third === 0 && G.pmPayeeText(base.parties.pmPayees) === "Sponsor", "nine assets paid to this firm");
// The same figures as with no firm set on any asset (the 1.1.18 behaviour).
const legacy = run(noFirm);
ok(close(legacy.parties.sponsor.fees, base.parties.sponsor.fees) && close(legacy.parties.sponsor.feesToDate, base.parties.sponsor.feesToDate) && legacy.parties.third.fees === 0, "assets with no firm set give the same figures as before");

// One asset moved to a third-party servicer.
const one = run(third(["sample-deal-4"]));
const a4 = one.assets.find((a) => a.id === "sample-deal-4");
ok(a4.pmPayee === "third" && a4.pmServicer === "Fictional Property Services LLC" && close(a4.pmThird, a4.pm) && a4.pm > 0 && one.assets.filter((a) => a.pmThird > 0).length === 1, "the asset's whole fee goes to its servicer; the other eight are untouched");
ok(close(one.fees.pm, base.fees.pm) && close(one.fees.total, base.fees.total) && close(one.fees.pmThird, a4.pm), "the fee itself does not change: the asset still pays it");
ok(close(base.parties.sponsor.fees - one.parties.sponsor.fees, a4.pm) && close(one.parties.third.fees, a4.pm) && close(one.parties.third.byType.pm, a4.pm) && one.parties.third.names.pm === "Fictional Property Services LLC", "this firm's fees fall by exactly that asset's fee, and the third party's rise by the same");
ok(close(one.parties.sponsor.fees + one.parties.third.fees + one.parties.gp.fees, base.parties.sponsor.fees + base.parties.third.fees + base.parties.gp.fees), "sponsor + GP + third party still add up to all the fees");
ok(close(base.parties.sponsor.feesToDate - one.parties.sponsor.feesToDate, a4.td.pm) && close(one.feesToDateByType.pmThird, a4.td.pm) && a4.td.pm > 0 && a4.td.pm < a4.pm, "the same for fees earned to date");
ok(one.years.every((y, i) => close(y.pm, base.years[i].pm) && close(y.fees, base.years[i].fees)) && close(one.years.reduce((s, y) => s + y.pmThird, 0), a4.pm) && one.parties.years.every((y, i) => close(base.parties.years[i].sponsor.pm - y.sponsor.pm, one.years[i].pmThird) && close(y.third, one.years[i].pmThird)), "year by year: the fee is unchanged, and each year's part paid to the servicer leaves the sponsor's column");
ok(close(one.promote.total, base.promote.total) && close(one.parties.sponsor.promote, base.parties.sponsor.promote) && close(one.parties.gp.promote, base.parties.gp.promote) && one.equity.lpMultiple === base.equity.lpMultiple, "promote, co-invest and the LPs' returns do not move");
const fb = FE.firmEconomics([base]), fo = FE.firmEconomics([one]);
ok(close(fb.totals.fees - fo.totals.fees, a4.pm) && close(fb.totals.feesToDate - fo.totals.feesToDate, a4.td.pm) && close(fb.totals.promote, fo.totals.promote) && close(fb.totals.total - fo.totals.total, a4.pm), "Firm Economics: fee income and the total fall by that asset's fee; promote is unchanged");
const rb = fb.rows[0], ro = fo.rows[0];
ok(close(rb.assets.find((a) => a.id === "sample-deal-4").fees - ro.assets.find((a) => a.id === "sample-deal-4").fees, a4.pm) && rb.assets.filter((a) => a.id !== "sample-deal-4").every((a) => close(a.fees, ro.assets.find((x) => x.id === a.id).fees)) && ro.years.every((y, i) => close(rb.years[i].pm - y.pm, one.years.find((z) => String(z.year) === String(y.year))?.pmThird ?? 0)), "Firm Economics by asset and by year: only that asset's fee leaves");
ok(fo.feesByType.find((x) => x.key === "pm").paidTo.sort().join() === "sponsor,third" && fb.feesByType.find((x) => x.key === "pm").paidTo.join() === "sponsor", "Fees by type: property management is paid to both once one asset has a servicer");
ok(one.parties.pmPayees.sponsor === 8 && one.parties.pmPayees.third === 1 && G.pmPayeeText(one.parties.pmPayees) === "Sponsor: 8 assets · third party: 1 (Fictional Property Services LLC)", "who is paid, in words: 8 assets this firm, 1 the servicer");
// All nine with a servicer: nothing left for this firm.
const all = run(third(f0.deals.map((d) => d.id), "Servicer B"));
ok(close(all.parties.sponsor.feesByType.pm, 0) && close(all.parties.third.fees, base.fees.pm) && G.pmPayeeText(all.parties.pmPayees) === "Third party (Servicer B)", "every asset with a servicer: none of the fee is this firm's");
// The portfolio's terms are the default only: the asset's own setting wins.
const termsThird = run((d) => d, { ...terms, feeToPm: "third", pmThirdParty: "Terms Co" });
ok(close(termsThird.parties.sponsor.feesByType.pm, base.fees.pm) && termsThird.parties.third.fees === 0, "terms that pay a third party do not override assets set to this firm");
const mixed = run((d) => (["sample-deal-1", "sample-deal-2"].includes(d.id) ? noFirm(d) : d), { ...terms, feeToPm: "third", pmThirdParty: "Terms Co" });
const m12 = mixed.assets.filter((a) => ["sample-deal-1", "sample-deal-2"].includes(a.id));
ok(m12.every((a) => a.pmPayee === "third" && a.pmServicer === "Terms Co") && close(mixed.parties.third.fees, m12.reduce((s, a) => s + a.pm, 0)) && mixed.parties.pmPayees.third === 2, "two assets with no firm set follow those terms; the other seven stay with this firm");
// A source without the split (older callers) follows the terms, as before.
const P = G.partiesOf({ feeToPm: "third" });
ok(G.feePaidTo(P, "third", "pm", { pm: 100 }) === 100 && G.feePaidTo(P, "sponsor", "pm", { pm: 100 }) === 0 && G.feePaidTo(P, "sponsor", "pm", { pm: 100, pmThird: 30 }) === 70 && G.feePaidTo(P, "third", "pm", { pm: 100, pmThird: 30 }) === 30 && G.feePaidTo(P, "sponsor", "mgmt", { mgmt: 50 }) === 50 && G.feePaidTo(P, "third", "pm", { pm: 100, pmThird: 500 }) === 100, "feePaidTo: split by the asset-level figure when there is one, else by the terms; never more than the fee");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
