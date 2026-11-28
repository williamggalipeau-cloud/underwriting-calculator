// 1.1.29: New Portfolio Setup (lib/portfolioSetup.js) and what the agreements
// now read in (lib/dealDocTypes.js, lib/dealDocApply.js).
//   - Each type has its own steps, words and starting terms.
//   - The target return is the portfolio plan's targets (one set).
//   - Restrictions are the portfolio's limits: measured ones against actual,
//     the rest for reference; several of the same kind can be listed.
//   - Nothing here changes a return.
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const PS = j(R + "/lib/portfolioSetup.js"), DT = j(R + "/lib/dealDocTypes.js"), DA = j(R + "/lib/dealDocApply.js"), FP = j(R + "/lib/fundPlan.js");
const { DEFAULT_FUND_TERMS, normalizeTerms } = j(R + "/lib/fundTerms.js");
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };

// Steps and words
check(PS.setupSteps("Fund").map((s) => s.label).join("|") === "Document|Parties|Capital & fees|Returns|Restrictions & dates|Review", "fund steps (Parties, no investor list)");
check(PS.setupSteps("Joint Venture")[1].label === "Investor" && PS.setupSteps("Separate Account")[1].label === "Investor" && PS.setupSteps("Fund").at(-1).n === null, "JV and SMA have an Investor step; Review is unnumbered");
check(PS.setupWords("Joint Venture").equity === "Total equity" && PS.setupWords("Separate Account").equity === "Allocation" && PS.setupWords("Fund").equity === "Total commitments", "the capital word by type");
check(PS.setupWords("Joint Venture").investorKey === "partnerName" && PS.setupWords("Separate Account").investorKey === "clientName", "the investor is the JV partner / the client");

// Starting terms by type
const jv0 = normalizeTerms({ ...DEFAULT_FUND_TERMS, ...PS.typeDefaults("Joint Venture") }), sma0 = normalizeTerms({ ...DEFAULT_FUND_TERMS, ...PS.typeDefaults("Separate Account") }), f0 = normalizeTerms({ ...DEFAULT_FUND_TERMS, ...PS.typeDefaults("Fund") });
check(jv0.subLineEnabled === false && jv0.mgmtFeeBasis === "invested" && jv0.gpCommitPct === 10, "a new JV: no sub line, fee on invested capital");
check(sma0.gpCommitPct === 0 && sma0.catchUpGpPct === 0 && sma0.authority === "approval" && sma0.subLineEnabled === false, "a new SMA: no co-investment or catch-up; the client approves each deal");
check(f0.subLineEnabled === true && f0.gpCommitPct === DEFAULT_FUND_TERMS.gpCommitPct && JSON.stringify({ ...f0, type: undefined }) === JSON.stringify({ ...normalizeTerms(DEFAULT_FUND_TERMS), type: undefined }), "a new fund starts exactly as before");

// Target return = the portfolio plan's targets
let t = PS.withTarget(PS.withTarget(PS.withTarget(jv0, "netIrrPct", 14), "netMultiple", "1.8"), "cashYieldPct", 6);
check(t.fundPlanTargets.netIrrPct === 14 && t.fundPlanTargets.netMultiple === 1.8 && PS.targetReturnLabel(t) === "14% IRR · 1.8x equity multiple · 6% cash yield", "target return: IRR, equity multiple and cash yield");
check(PS.targetReturn(PS.withTarget(t, "netIrrPct", "")).irrPct === null && PS.targetReturnLabel(jv0) === "Not set", "a cleared target is not set");
const cmp = FP.planCompare({ returns: { avgCashYield: 5 } }, { returns: { avgCashYield: 6.5 } }, null, "2026-11-27", { cashYield: 6 });
const cy = cmp.projected.find((r) => r.key === "avgCashYield");
check(cy && cy.target === 6 && cy.plan === 5 && cy.current === 6.5 && cy.variance === 1.5, "the plan compares the cash yield target with the plan and the current projection");

// Restrictions
t = PS.addRestriction(t, { kind: "asset_ltv_pct", limit: "60", clause: "6.2" }, "a");
t = PS.addRestriction(t, { kind: "other", label: "Sale needs the partner's consent", clause: "7.4" }, "b");
t = PS.addRestriction(t, { kind: "other", label: "Sponsor exclusivity" }, "c");
const rs = PS.restrictionsOf(t);
check(rs.length === 3 && rs[0].measured && rs[0].limit === 60 && rs[0].unit === "%" && !rs[1].measured && !rs[2].measured && rs[1].key !== rs[2].key, "one measured restriction and two listed for reference, each kept");
check(PS.addRestriction(t, { kind: "asset_ltv_pct", limit: "55" }, "d").limits.filter((l) => l.key === "asset_ltv_pct").length === 1, "a measured kind replaces the same kind");
check(PS.restrictionsOf(PS.removeRestriction(t, rs[1].key)).length === 2, "a restriction can be removed");
check(PS.addRestriction(jv0, { kind: "hold_years", limit: "7" }, "e").limits[0].unit === "years" && PS.addRestriction(jv0, { kind: "asset_ltv_pct", limit: "" , label: "As the lender allows" }, "f").limits[0].unit === "text", "hold in years; a measured kind with no number is listed as text");

// Term of the agreement and its events
t = { ...t, finalClose: "2024-03-31", termYears: 5, extensionCount: 2, extensionYears: 1, outsideSaleDate: "2031-03-31", buySellDate: "2027-03-31" };
const a = PS.agreementTerm(t);
check(a.end === "2029-03-31" && a.extendedEnd === "2031-03-31" && a.outsideSaleDate === "2031-03-31" && a.terminationNoticeDays === null, "the JV's term: end, extended end, outside sale date");
check(PS.agreementTerm({ ...sma0, terminationNoticeDays: 90, outsideSaleDate: "2030-01-01" }).terminationNoticeDays === 90 && PS.agreementTerm({ ...sma0, outsideSaleDate: "2030-01-01" }).outsideSaleDate === null, "an SMA has a termination notice, not a JV's dates");
check(PS.agreementEvents(t).map(([d, l]) => `${d} ${l}`).join("|") === "2031-03-31 Outside sale date|2027-03-31 Buy-sell available" && PS.agreementEvents(f0).length === 0, "the JV's dates for Upcoming Events; none for a fund");

// Review page and Portfolio Summary
const rev = PS.reviewSections({ ...t, name: "Harbor Venture", partnerName: "Example Pension Fund", termSources: { partnerName: "doc" } });
const flat = rev.flatMap((s) => s.rows);
check(rev.map((s) => s.id).join("|") === "doc|investor|capital|returns|restrictions" && flat.find((r) => r.label === "Capital partner").source === "doc" && flat.find((r) => r.label === "Investor type").source === "unset" && flat.find((r) => r.label === "Ownership: partner / sponsor").value === "90% / 10%", "review: by step, with what came from the agreement and what is not set");
check(PS.reviewSections({ ...sma0, incentiveFeePct: 15 }).find((s) => s.id === "returns").rows.some((r) => r.label === "Incentive fee") && !PS.reviewSections({ ...sma0, incentiveFeePct: 15 }).find((s) => s.id === "returns").rows.some((r) => /Promote/.test(r.label)), "review: an SMA's incentive fee in place of the promote");
check(PS.investorSummary(f0).length === 0 && PS.investorSummary({ ...t, partnerName: "Example Pension Fund" }).some(([k, v]) => k === "Restrictions" && v === "3 (1 measured, 2 for reference)"), "Portfolio Summary: investor rows for a JV, none for a fund");

// What the agreements read in
const keys = (ty) => DT.FIELDS[ty].map(([k]) => k);
check(["target_irr_pct", "target_multiple", "target_cash_yield_pct"].every((k) => keys("lpa").includes(k) && keys("jva").includes(k) && keys("sma").includes(k)), "every agreement reads the target return");
check(keys("jva").includes("outside_sale_date") && keys("jva").includes("buy_sell_date") && keys("jva").includes("investor_type") && !keys("jva").includes("authority"), "the JVA reads the investor type and its dates");
check(keys("sma").includes("authority") && keys("sma").includes("termination_notice_days") && !keys("sma").includes("buy_sell_date"), "the SMA reads the authority and the termination notice");
check(DA.authorityOf("The Client shall approve each Investment") === "approval" && DA.authorityOf("full discretion") === "discretionary" && DA.authorityOf("") === null, "authority from the agreement's words");
check(DA.investorTypeOf("a public pension plan") === "Pension fund" && DA.investorTypeOf("life insurance company") === "Insurance company", "investor type from the agreement's words");
const F = (key, v) => ({ key, value: v, status: "found", evidence: [{ quote: "x" }] });
const doc = { id: "d1", doc_type: "sma", abstract: { doc_type: "sma", fields: [F("target_irr_pct", 11), F("target_multiple", 1.6), F("authority", "Client approval of each investment"), F("termination_notice_days", 90), F("investor_type", "insurance company")],
  limits: [{ key: "asset_ltv_pct", label: "Leverage", limit: 55, unit: "%", clause: "4.1" }, { key: "other", label: "No development", limit: "Prohibited", unit: "text", clause: "4.2" }, { key: "other", label: "Western states only", limit: "AZ, NV, UT, CO", unit: "text", clause: "4.3" }] } };
const rows = DA.compareDoc(doc, { terms: sma0 });
check(rows.some((r) => r.target === "fundPlanTargets.netIrrPct" && r.setValue === 11 && r.differs) && rows.some((r) => r.target === "terminationNoticeDays" && r.setValue === 90) && rows.filter((r) => r.target.startsWith("limits.")).map((r) => r.docKey).join("|") === "asset_ltv_pct|other|other_2", "the SMA's terms and its three restrictions, the two 'other' ones kept apart");
const at = DA.applyDoc(doc, rows.map((r) => r.key), { terms: sma0 }).terms;
check(at.fundPlanTargets?.netIrrPct === 11 && at.fundPlanTargets.netMultiple === 1.6 && at.investorType === "Insurance company" && at.limits.length === 3 && at.termSources["fundPlanTargets.netIrrPct"] === "doc" && at.termSources.terminationNoticeDays === "doc", "applied: targets, investor type, restrictions, each marked as from the agreement");
check(DA.compareDoc(doc, { terms: at }).filter((r) => r.differs).length === 0, "nothing differs once applied");

console.log(`${pass} passed${fail ? `, ${fail} FAILED` : ""}`);
process.exitCode = fail ? 1 : 0;
