// 1.1.15 (correctness and access): each fix pinned by a case.
const fs = require("fs");
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const C = j(R + "/lib/calculations.js");
const G = j(R + "/lib/gpEconomics.js");
const GP = j(R + "/lib/gpPartners.js");
const LD = j(R + "/lib/leasingDocs.js");
const Q = j(R + "/lib/records.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1) => Math.abs(a - b) < e;
const data = FX.workspaceData();

// ── Replacement rate caps: a year with no cost entered uses the flat cost ──
const d0 = data.deals.find((x) => x.id === "sample-deal-1");
const cap = { ...d0.inputs, hedgingType: "cap", capStrikeRatePct: 9.5, capTermYears: 1, holdPeriodYears: 5, capReplacementCost: 40000 };
const cf = (inp) => C.underwrite(inp).annualCashFlows.map((y) => y.pretaxCashFlow);
const flat = cf({ ...cap, capReplacementCosts: undefined });
const empty = cf({ ...cap, capReplacementCosts: [] });
ok(flat.every((v) => Number.isFinite(v)) && flat.every((v, i) => close(v, empty[i], 0.01)), "an empty list of per-year cap costs behaves like no list: the flat cost is charged (it used to be free)");
ok(C.capReplacementCostAt({ ...cap, capReplacementCosts: [] }, 1) === 40000 && C.capReplacementCostAt({ ...cap, capReplacementCosts: [31000] }, 1) === 31000 && C.capReplacementCostAt({ ...cap, capReplacementCosts: [31000] }, 2) === 40000, "a year with a cost uses it; a year without one uses the flat cost");
ok(C.capReplacementCostAt({ ...cap, capReplacementCosts: [0, null, ""] }, 1) === 0 && C.capReplacementCostAt({ ...cap, capReplacementCosts: [0, null, ""] }, 2) === 40000 && C.capReplacementCostAt({ ...cap, capReplacementCosts: [0, null, ""] }, 3) === 40000, "a cost of 0 entered for a year is kept; a blank is not a 0");
ok(C.capReplacementCostAt({ ...cap, capTermYears: 2, capReplacementCosts: [] }, 1) === 0 && C.capReplacementCostAt({ ...cap, capTermYears: 2, capReplacementCosts: [] }, 2) === 40000, "the flat cost falls at the end of each cap term");
const one = cf({ ...cap, capReplacementCosts: [31000] });
ok(close(flat[0] - one[0], -9000, 1) && close(flat[1], one[1], 0.01), "the model: year 1 uses the entered 31,000, year 2 the flat 40,000");

// ── GP partners: outside partners can't hold more than 100% between them ──
const fn = "Model Fund I";
const deals = data.deals.filter((d) => d.inputs.fundName === fn && !d.id.startsWith("test-")).map((d) => SP.snapshotDeal(d.inputs, d.id));
const base = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], ...SP.SAMPLE_FUND_FEE_TERMS, targetEquity: 100e6, gpCommitPct: 5, name: fn, capitalActivity: [], gpParties: [{ id: "gp1", who: "firm", capitalPct: 100, promotePct: 70 }] };
let gp = GP.EMPTY_GP_PARTNERS;
let r = GP.addPartner(gp, "Fictional Capital Partners LP"); gp = r.gp; const p1 = r.partner;
r = GP.addPartner(gp, "Sample Family Office LLC"); gp = r.gp; const p2 = r.partner;
gp = GP.saveAgreement(gp, { partnerId: p1.id, portfolio: fn, capitalPct: 40, gpSideSharePct: 60, effective: "2026-01-15" }).gp;
const tooMuch = GP.saveAgreement(gp, { partnerId: p2.id, portfolio: fn, capitalPct: 30, gpSideSharePct: 50, effective: "2026-02-01" });
ok(/promote paid to the GP/.test(tooMuch.error ?? "") && /110%/.test(tooMuch.error) && !tooMuch.gp, "a second agreement taking the promote shares to 110% is refused, with the reason");
ok(/GP capital commitment/.test(GP.saveAgreement(gp, { partnerId: p2.id, portfolio: fn, capitalPct: 70, gpSideSharePct: 10, effective: "2026-02-01" }).error ?? ""), "the same for the GP capital");
const fits = GP.saveAgreement(gp, { partnerId: p2.id, portfolio: fn, capitalPct: 60, gpSideSharePct: 40, effective: "2026-02-01" });
ok(!fits.error && fits.gp.agreements.length === 2, "exactly 100% between them is accepted");
const granite = deals.find((d) => d.inputs.propertyName === "Granite Ave Industrial");
ok(/on one deal/.test(GP.saveAgreement(gp, { partnerId: p2.id, portfolio: fn, dealId: granite.id, capitalPct: 10, gpSideSharePct: 45, effective: "2026-02-01" }).error ?? ""), "a deal-level agreement is checked with the fund-wide terms in force on that deal");
const later = GP.saveAgreement(fits.gp, { partnerId: p1.id, portfolio: fn, capitalPct: 40, gpSideSharePct: 70, effective: "2028-01-01" });
ok(/from 2028-01-01/.test(later.error ?? ""), "an amendment is checked from its own date");
ok(!GP.saveAgreement(gp, { partnerId: p2.id, portfolio: "Another Portfolio", capitalPct: 90, gpSideSharePct: 90, effective: "2026-02-01" }).error, "other portfolios are counted separately");
// Older data already over 100%: the split is scaled back, so nobody is paid more than the GP has.
const overGp = { ...gp, agreements: [...gp.agreements, { id: "x", partnerId: p2.id, portfolio: fn, dealId: null, capitalPct: 80, gpSideSharePct: 80, effective: "2026-02-01", status: "checked" }] };
const f = G.fundGpEconomics(fn, deals, GP.applyAgreements(base, fn, overGp, { todayISO: "2026-11-27" }), { todayISO: "2026-11-27" });
const parts = f.parties.gp.parties;
const sum = (k) => parts.reduce((s, x) => s + x[k], 0);
ok(close(sum("promote"), f.parties.gp.promote) && close(sum("equity"), f.parties.gp.equity) && parts.every((x) => x.promote >= -1e-6 && x.equity >= -1e-6), "data already over 100%: the parties still add up to the GP side (scaled back), none negative");
const a1 = parts.find((x) => x.partnerId === p1.id), a2 = parts.find((x) => x.partnerId === p2.id);
ok(close(a1.promote / a2.promote, 60 / 80, 1e-6) && close(parts.find((x) => x.who === "firm").promote, 0), "scaled in proportion to the agreed shares; this firm has nothing left on the GP side");

// ── Saving: a record this browser has no earlier copy of is merged, not replaced ──
const m = Q.mergeData({}, { inputs: { propertyName: "Mine", city: "" } }, { inputs: { propertyName: "Mine", city: "Theirs City", state: "CA" } });
ok(m.data.inputs.city === "" || m.data.inputs.city === "Theirs City", "merge with no earlier copy runs");
ok(m.data.inputs.state === "CA" && m.data.inputs.propertyName === "Mine", "what only the other person has is kept");
ok(Q.recordItems(new Map(), [{ kind: "deal", key: "d1", sort: 0, data: {} }])[0].expected_version === null, "a record new to this browser is sent with no version (the database refuses it if one exists)");

// ── The database script ──
const sql = fs.readFileSync(R + "/supabase/release_1_1_15.sql", "utf8");
const fr = fs.readFileSync(R + "/supabase/firm_records.sql", "utf8");
const fnText = (s) => s.slice(s.indexOf("create or replace function public.save_records"), s.indexOf("grant execute on function public.save_records"));
ok(fnText(sql).length > 500 && fnText(sql) === fnText(fr), "save_records is the same in the release script and in firm_records.sql");
ok(/not cur\.deleted then\s+raise exception 'conflict:/.test(fnText(sql)), "save_records refuses a save with no version for a live record");
// The restricted titles in the script are the titles the app writes.
const res = [...sql.matchAll(/title ~ '([^']+)'/g)].map((x) => new RegExp(x[1]));
const restricted = (t) => res.some((re) => re.test(t));
ok(res.length === 2, "two restricted title patterns in the script");
const GPT = fs.readFileSync(R + "/components/GpPartners.jsx", "utf8").match(/GP_AGREEMENT_TAG = \(partnerId\) => `([^`]+)`/)[1].replace("${partnerId}", "gp-abc");
ok(restricted(`${GPT} Agreement.pdf`), "a GP agreement's title is restricted");
for (const t of ["credit_screening", "credit_report", "credit_memo"]) ok(restricted(LD.leasingTitle({ target: LD.tenantDocTarget("Fictional Tenant Co"), type: t, name: "x.pdf" })) && restricted(LD.leasingTitle({ target: "lp-1", type: t, name: "x.pdf" })), `${LD.leasingTypeLabel(t)}: restricted for a tenant and for a prospect`);
for (const t of LD.LEASING_DOC_TYPES.map(([k]) => k).filter((k) => !/^credit_/.test(k))) ok(!restricted(LD.leasingTitle({ target: "lp-1", type: t, name: "Credit report: x.pdf" })), `${LD.leasingTypeLabel(t)}: not restricted`);
ok(!restricted("Offering memorandum") && !restricted("Credit report: x.pdf") && !restricted(null ?? ""), "ordinary documents are not restricted");
ok(/deal_doc_select[\s\S]+'owner', 'editor'\]\)\s+or \(public\.ws_can\(workspace_id, array\['viewer'\]\) and not public\.deal_doc_restricted\(title\)\)/.test(sql) && /deal_docs_read[\s\S]+not public\.deal_doc_path_restricted\(name\)/.test(sql) && /deal_doc_path_restricted[\s\S]+security definer/.test(sql), "viewers: rows and files of restricted documents are excluded; the file check runs with the definer's rights");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
