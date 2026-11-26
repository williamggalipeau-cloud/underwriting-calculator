// 1.1.8 (user, 11/26): Tenant Credit (lib/creditReview.js), Aged Rent
// (lib/agedRent.js), sample data (lib/sampleCredit.js) and the risk report's
// risks-first lists (lib/riskReport.js).
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const C = j(R + "/lib/creditReview.js");
const A = j(R + "/lib/agedRent.js");
const SC = j(R + "/lib/sampleCredit.js");
const SP = j(R + "/lib/samplePortfolio.js");
const SL = j(R + "/lib/sampleLeasing.js");
const RR = j(R + "/lib/riskReport.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const T = "2026-11-26";

// Screening rules
ok(C.screeningMissing(null).length === 1 && C.screeningMissing({ source: "own" }).join() === "our rating (Strong / Acceptable / Weak),the basis for it", "a screening can't be left blank; our own assessment needs a rating and its basis");
ok(C.screeningComplete({ source: "app", provider: "TurboTenant", reportDate: "2026-10-02", result: "approved" }) && !C.screeningComplete({ source: "agency", provider: "D&B", result: "approved" }), "app / agency: provider, report date and result");
ok(C.scoreBelow({ scoreType: "consumer", score: 612 }) && !C.scoreBelow({ scoreType: "paydex", score: 74 }) && C.scoreBelow({ scoreType: "intelliscore", score: 39 }) && !C.scoreBelow({ scoreType: "consumer", score: 612 }, { consumer: 600 }), "thresholds: consumer 650, Paydex 70, Intelliscore 40; per-portfolio override");
ok(C.reviewDue({ leaseEnd: "2028-03-31", renewalNoticeMonths: 3 }) === "2027-12-31" && C.reviewDue({ leaseEnd: "2028-03-31" }) === "2028-03-31", "review due at renewal: the notice deadline, else the lease end");

// Signing requires the screening, then copies it to the unit
const inputs = { units: [{ id: "u1", name: "001" }], leasing: { prospects: [{ id: "p1", unitId: "u1", tenant: "Fictional Co", stage: "leaseout" }] } };
ok(/Record the credit screening/.test(C.signProspect(inputs, "p1").error ?? ""), "Signed refused without a screening");
const withS = { ...inputs, leasing: { prospects: [{ ...inputs.leasing.prospects[0], screening: { source: "own", rating: "acceptable", basis: "statements" } }] } };
const signed = C.signProspect(withS, "p1", { by: "t@example.com" }).inputs;
ok(signed.leasing.prospects[0].stage === "signed" && signed.units[0].credit.records.length === 1 && signed.units[0].credit.records[0].kind === "assessment" && signed.units[0].credit.records[0].tenant === "Fictional Co", "signed: the screening is copied to the unit as its first credit record");

// Sample fund: credit statuses and aged rent
let deals = SP.buildSampleDeals({});
const L = SL.addSampleLeasing(deals, { todayISO: T });
deals = deals.map((d) => (L.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...L.updates[d.id] } } : d));
const S = SC.addSampleCredit(deals, { todayISO: T });
deals = deals.map((d) => (S.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...S.updates[d.id] } } : d));
ok(Object.keys(S.delinquency.months).join() === "2026-09-30,2026-10-31" && S.counts.flags === 1 && S.counts.screenings >= 1, `sample: two month-ends of aged receivables, a flag, ${S.counts.screenings} prospect screenings`);
const again = SC.addSampleCredit(deals, { todayISO: T });
const recs = (ds) => ds.reduce((n, d) => n + (d.inputs.units ?? []).reduce((m, u) => m + (u.credit?.records?.length ?? 0), 0), 0);
ok(recs(deals.map((d) => (again.updates[d.id] ? { ...d, inputs: { ...d.inputs, ...again.updates[d.id] } } : d))) === recs(deals), "adding the sample again replaces earlier sample records (no duplicates)");
ok(SC.addSampleCredit(deals, { todayISO: T, funds: { "Model Fund I": { delinquency: { months: { "2026-10-31": { rows: [], file: "yardi.xlsx" } } } } } }).delinquency === null, "a fund with its own aged receivables upload keeps it");
const aged = A.agedRent(S.delinquency, deals);
ok(aged.asOf === "2026-10-31" && aged.prevAsOf === "2026-09-30" && aged.late60.tenants === 2 && aged.tenants.every((t) => Math.abs(t.pastDue - (t.buckets.d30 + t.buckets.d60 + t.buckets.d90 + t.buckets.d180 + t.buckets.over180)) < 0.02), `aged rent: latest month, 2 tenants 60+ days late, buckets add up`);
ok(A.late60({ d30: 1, d60: 10, d90: 100, d180: 1000, over180: 10000 }) === 11100, "60+ days = 61–90 + 91–180 + over 180 (not 31–60)");
const rows = C.creditRows(deals, { aged, asOf: T });
const st = rows.reduce((o, r) => ({ ...o, [r.status]: (o[r.status] ?? 0) + 1 }), {});
ok(st.weak === 4 && st.missing === 1 && !st.watch, `statuses: ${JSON.stringify(st)}`);
const hl = rows.find((r) => r.asset === "Harbor Light Industrial" && r.status === "weak");
ok(hl && hl.reasons.some((x) => x.code === "flag") && hl.reasons.some((x) => x.code === "late") && !hl.reasons.some((x) => x.code === "score"), "Harbor Light: flag and late rent, the Paydex 74 passes");
ok(C.creditFilter(rows, "attention", T).length === 5 && C.creditFilter(rows, "review", T).every((r) => r.reviewDue >= T && r.reviewDue <= "2027-11-26"), "filters: needs attention, review due within 12 months");

// Risk report: risks first, with Tenant Credit and Aged Rent
const r = RR.riskReport(deals, { ...DEFAULT_FUND_TERMS, name: "Model Fund I", delinquency: S.delinquency }, { asOf: "2026-09-30" });
const lv = (xs) => xs.every((x, i) => i === 0 || !(x.level === "red" && xs[i - 1].level === "amber"));
ok(r.leasingRisks.length > 0 && lv(r.leasingRisks) && lv(r.debtRisks) && r.leasingRisks.every((x) => x.risk && x.threshold && x.level), "Leasing and Debt Risks: red before amber, each with its measure and threshold");
ok(r.limitChecks[0].status === "breached" && r.limitChecks.some((x) => x.key === "lender" && x.status === "breached") && r.limitChecks.every((x, i) => i === 0 || ["breached", "near", "ok"].indexOf(x.status) >= ["breached", "near", "ok"].indexOf(r.limitChecks[i - 1].status)), "Limit Checks: worst first");
const near = RR.riskReport(deals, { ...DEFAULT_FUND_TERMS, name: "F", riskLimits: { lenderPct: 58 } }, { asOf: "2026-09-30" }).limitChecks.find((x) => x.key === "lender");
ok(near.status === "near" && near.now >= 0.9 * 58 && near.now <= 58, `"near limit" at 90% of a limit (${near.now.toFixed(1)}% vs 58%)`);
ok(r.valuationRisks.every((x) => parseFloat(x.measure) <= -5), "Valuation Risks: only marks 5%+ below cost");
ok(r.credit.length >= 3 && r.credit.every((c) => c.status === "weak" || c.status === "watch") && r.aged.late60.tenants >= 1, `risk report: ${r.credit.length} flagged tenants, aged rent included`);
ok(RR.riskXlsx("F", r).some((x) => x[0] === "Leasing Risks") && RR.riskXlsx("F", r).some((x) => /^Aged Rent/.test(String(x[0]))) && RR.riskXlsx("F", r).some((x) => x[0] === "Limit Checks"), "Excel (and PDF) carry the new sections");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
