// Joint ventures and separate accounts with their own terms (11/24): JVA / SMA
// document types read in like an LPA, acquisition and disposition fees, the
// separate account incentive fee, and GP Economics consolidated by type.
// Fictional fixture; one portfolio has a single asset.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const T = j(R + "/lib/dealDocTypes.js");
const D = j(R + "/lib/dealDocApply.js");
const FT = j(R + "/lib/fundTypes.js");
const G = j(R + "/lib/gpEconomics.js");
const DD = j(R + "/lib/dealDocs.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
const fs = require("fs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const f = (k, v) => ({ key: k, value: v, status: "found" });

ok(T.TYPE.jva?.scope === "fund" && T.TYPE.jva.fundType === "Joint Venture" && T.TYPE.sma?.fundType === "Separate Account", "JVA and SMA: fund-level types, one per portfolio type");
ok(["partner_name", "acq_fee_pct", "disp_fee_pct", "pref_pct", "promote"].every((k) => T.fieldsOf("jva").some(([x]) => x === k)) && ["client_name", "incentive_fee_pct", "incentive_hurdle_pct", "mgmt_fee_pct"].every((k) => T.fieldsOf("sma").some(([x]) => x === k)), "JVA and SMA fields");
const sql = fs.readFileSync(R + "/supabase/portfolio_doc_types.sql", "utf8");
ok(["'jva'", "'sma'", "'deed_title'", "'bov'", "'lpa'"].every((x) => sql.includes(x)), "SQL adds jva and sma and keeps the earlier types");

// Reading a JVA / SMA in → terms
const jva = { id: "j1", doc_type: "jva", fund_name: "Example JV", abstract: { fields: [f("partner_name", "Example Pension Fund"), f("gp_commit_pct", "10%"), f("pref_pct", "8%"), f("acq_fee_pct", "1.0%"), f("disp_fee_pct", "0.5%"), f("mgmt_fee_pct", "1.0%")] } };
const rj = D.compareDoc(jva, { terms: { ...DEFAULT_FUND_TERMS, type: "Joint Venture" } });
const by = (rows, t) => rows.find((r) => r.target === t);
ok(by(rj, "partnerName")?.docValue === "Example Pension Fund" && by(rj, "acqFeePct")?.docValue === 1 && by(rj, "dispFeePct")?.docValue === 0.5 && by(rj, "gpCommitPct")?.docValue === 10 && by(rj, "prefPct")?.docValue === 8, "a JVA's terms: partner, sponsor co-invest, pref, acquisition and disposition fees");
const sma = { id: "s1", doc_type: "sma", fund_name: "Example SMA", abstract: { fields: [f("client_name", "Example Insurance Co"), f("incentive_fee_pct", "15%"), f("incentive_hurdle_pct", "7%"), f("mgmt_fee_pct", "0.75%")] } };
const rs = D.compareDoc(sma, { terms: { ...DEFAULT_FUND_TERMS, type: "Separate Account" } });
ok(by(rs, "clientName")?.docValue === "Example Insurance Co" && by(rs, "incentiveFeePct")?.docValue === 15 && by(rs, "incentiveHurdlePct")?.docValue === 7 && by(rs, "mgmtFeePct")?.docValue === 0.75 && !by(rs, "partnerName"), "an SMA's terms: client, incentive fee and hurdle, fee");
const stored = DD.withStoredType({ doc_type: "other", title: "[sma] Example IMA" });
ok(stored.doc_type === "sma" && stored.title === "Example IMA" && DD.withStoredType({ doc_type: "other", title: "Other.pdf" }).doc_type === "other", "before the SQL, an SMA filed as Other reads as an SMA");

// Incentive fee waterfall
ok(FT.incentiveWaterfall({ type: "Fund", incentiveFeePct: 15 }) === null && FT.incentiveWaterfall({ type: "Separate Account" }) === null, "only a separate account with an incentive fee");
const iw = FT.incentiveWaterfall({ type: "Separate Account", incentiveFeePct: 15, incentiveHurdlePct: 7 });
ok(iw.preferredReturnPct === 7 && iw.catchUpGpPct === 0 && iw.tiers.length === 1 && iw.tiers[0].gpSplit === 15 && iw.tiers[0].lpSplit === 85, "incentive fee: 15% of profit above a 7% hurdle, no catch-up");

// GP economics: a fund, a JV and a one-asset separate account
const shift = (iso) => (iso ? `${Number(iso.slice(0, 4)) - 2}${iso.slice(4)}` : iso);
const data = FX.workspaceData();
const base = data.deals.filter((d) => d.id.startsWith("sample-deal-")).map((d) => ({ ...d, inputs: { ...d.inputs, acquisitionDate: shift(d.inputs.acquisitionDate) } }));
const grp = (ids, name) => base.filter((d) => ids.includes(d.id)).map((d) => snapshotDeal({ ...d.inputs, fundName: name }, d.id));
const t0 = { ...DEFAULT_FUND_TERMS, finalClose: "2024-06-30", targetEquity: 60e6, mgmtFeePct: 1.5 };
const fund = G.fundGpEconomics("Example Fund", grp(["sample-deal-1", "sample-deal-2", "sample-deal-3"], "Example Fund"), { ...t0, name: "Example Fund", type: "Fund" }, { todayISO: "2026-11-24" });
const jv = G.fundGpEconomics("Example JV", grp(["sample-deal-4", "sample-deal-5"], "Example JV"), { ...t0, name: "Example JV", type: "Joint Venture", partnerName: "Example Pension Fund", acqFeePct: 1, dispFeePct: 0.5, gpCommitPct: 10 }, { todayISO: "2026-11-24" });
const smaT = { ...t0, name: "Example SMA", type: "Separate Account", clientName: "Example Insurance Co", incentiveFeePct: 15, incentiveHurdlePct: 7, gpCommitPct: 0, acqFeePct: 0.5 };
const one = G.fundGpEconomics("Example SMA", grp(["sample-deal-6"], "Example SMA"), smaT, { todayISO: "2026-11-24" });
const price = (id) => base.find((d) => d.id === id).inputs.purchasePrice;
ok(Math.abs(jv.fees.acq - 0.01 * (price("sample-deal-4") + price("sample-deal-5"))) < 1 && jv.fees.disp > 0 && jv.counterparty === "Example Pension Fund", `JV: acquisition fees $${Math.round(jv.fees.acq).toLocaleString()} (1% of price) and disposition fees; partner named`);
ok(one.assets.length === 1 && one.promoteKind === "Incentive fee" && one.counterparty === "Example Insurance Co" && Math.abs(one.fees.acq - 0.005 * price("sample-deal-6")) < 1 && one.coinvest.equity === 0, "a one-asset separate account: incentive fee in place of promote, no sponsor co-invest");
const firm = G.firmGpEconomics([fund, jv, one], { todayISO: "2026-11-24" });
ok(firm.byType.map((b) => b.type).join() === "Fund,Joint Venture,Separate Account" && firm.byType.find((b) => b.type === "Separate Account").assets === 1, "consolidated by portfolio type");
ok(Math.abs(firm.byType.reduce((s, b) => s + b.total, 0) - firm.totals.total) < 1 && Math.abs(firm.byType.reduce((s, b) => s + (b.share ?? 0), 0) - 100) < 0.01, "type subtotals add up to the firm total; shares to 100%");
ok(firm.yearsByType.length === firm.years.length && firm.yearsByType.every((y) => Math.abs(["Fund", "Joint Venture", "Separate Account"].reduce((s, k) => s + (y[k] ?? 0), 0) - firm.years.find((z) => z.year === y.year).total) < 1), "income by year and type adds up to each year");
ok(G.gpEconomicsXlsx("All portfolios", firm).some((r) => r[0] === "Consolidated by portfolio type") && G.gpEconomicsXlsx("All portfolios", firm).some((r) => r[0] === "  Acquisition fees"), "Excel: the consolidated block and acquisition fees");
// Acquisition and disposition fees come out of investor returns (11/24)
{
  const FTL = j(R + "/lib/fundTimeline.js");
  const d = grp(["sample-deal-4"], "Example JV")[0];
  const plain = FTL.assetQuarterlyEvents(d, { ...t0, name: "x" });
  const fee = FTL.assetQuarterlyEvents(d, { ...t0, name: "x", acqFeePct: 1, dispFeePct: 0.5 });
  const call = (r) => r.events.find((e) => e.purchase).amount, cap = (r) => r.events.find((e) => e.kind === "capital").amount;
  ok(Math.abs(call(plain) - call(fee) - 0.01 * d.inputs.purchasePrice) < 1 && fee.acqFee > 0, "the acquisition fee is funded with the purchase (a larger capital call)");
  ok(d.exitValue > 0 && Math.abs(cap(plain) - cap(fee) - 0.005 * d.exitValue) < 1, "the disposition fee comes out of the sale proceeds");
  const V = j(R + "/lib/valuations.js");
  const ds = grp(["sample-deal-4", "sample-deal-5"], "Example JV");
  const a = V.fundValuation(ds, {}, { ...t0, name: "Example JV" }, { todayISO: "2026-11-24" }).quarters.at(-1);
  const b = V.fundValuation(ds, {}, { ...t0, name: "Example JV", acqFeePct: 1, dispFeePct: 0.5 }, { todayISO: "2026-11-24" }).quarters.at(-1);
  ok(b.net.contrib > a.net.contrib, `investors contribute more with the acquisition fee (${Math.round(a.net.contrib).toLocaleString()} → ${Math.round(b.net.contrib).toLocaleString()})`);
}

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
