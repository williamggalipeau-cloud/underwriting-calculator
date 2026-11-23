// Phase S: Fund Debt (lib/fundDebt.js) on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const D = j(R + "/lib/fundDebt.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const TODAY = "2026-11-23";
const data = FX.workspaceData();
const deals = data.deals.filter((d) => d.inputs.fundName === "Model Fund I");
const tweak = (id, patch) => deals.map((d) => (d.id === id ? { ...d, inputs: { ...d.inputs, ...patch } } : d));
let ds = tweak("sample-deal-2", { lenderName: "Example Bank", floatingRate: false, interestRatePct: 6.25 });
ds = ds.map((d) => (d.id === "sample-deal-3" ? { ...d, inputs: { ...d.inputs, lenderName: "Example Bank", hedgingType: "swap", swapFixedRatePct: 6.0 } } : d.id === "sample-deal-4" ? { ...d, inputs: { ...d.inputs, lenderName: "Fictional Life Co", hedgingType: "none" } } : d));
const marks = { "sample-deal-1": { "2026-09-30": { value: 9e6 } } };
const loans = D.fundLoans(ds, marks, TODAY);
const L = (id) => loans.find((l) => l.id === id);

// ── Loans ──
const a1 = L("sample-deal-1");
const r1 = underwrite({ ...ds.find((d) => d.id === "sample-deal-1").inputs, holdPeriodYears: 6 });
ok(loans.length === ds.filter((d) => d.inputs.acquisitionDate <= TODAY).length, "a loan for every owned asset with debt");
ok(close(a1.loan0, r1.debt.loanAmount) && a1.holdYear === 1 && close(a1.balance, a1.loan0) && close(a1.dscr, r1.annualCashFlows[0].noi / r1.annualCashFlows[0].debtService), "balance, NOI, DSCR from the model's current hold year");
ok(a1.value === 9e6 && a1.valueBasis === "mark 2026-09-30" && close(a1.ltvPct, a1.balance / 9e6 * 100), "LTV on the latest valuation mark");
ok(L("sample-deal-5").valueBasis === "cost", "no mark: cost");
ok(a1.initialMaturity === "2029-01-30" && a1.finalMaturity === "2031-01-30" && a1.extensionsLeft === 2, "maturity, fully extended date and extensions left");
ok(L("sample-deal-2").hedge === "fixed" && L("sample-deal-2").fixedRatePct === 6.25 && L("sample-deal-3").hedge === "swapped" && L("sample-deal-4").hedge === "floating" && a1.hedge === "capped", "rate type: fixed, swapped, floating, capped");
ok(a1.capEnd && a1.capEnd > TODAY, "cap expiry");
const later = D.loanAt(ds.find((d) => d.id === "sample-deal-1"), marks, "2029-06-30");
ok(later.extensionsUsed === 1 && later.currentMaturity === "2030-01-30" && later.extensionsLeft === 1, "past the initial maturity: one extension used");
ok(D.loanAt({ id: "x", inputs: { ...ds[0].inputs, acquisitionDate: "2027-06-01" } }, {}, TODAY) === null && D.loanAt({ id: "s", inputs: { ...ds[0].inputs, realizedSaleDate: "2026-10-01" } }, {}, TODAY) === null, "pipeline and sold assets have no loan here");

// ── Tests and extension tests ──
const t = D.loanTests(ds[0].inputs);
ok(t.minDscr === 1.25 && t.minDebtYieldPct === 8, "tests: the sizing constraints by default");
ok(D.loanTests({ ...ds[0].inputs, covenants: { minDscr: 1.4, minDebtYieldPct: 9, maxLtvPct: 70 } }).minDscr === 1.4, "entered covenants override");
const e1 = D.extensionTest(a1);
ok(e1.date === a1.currentMaturity && e1.checks.length === 3 && e1.status === (e1.checks.every((c) => c.pass) ? "pass" : "fail") && close(D.extensionTest({ ...a1, extensionFeePct: 0.25 }).fee, a1.balance * 0.0025, 1e4), "extension test at the next maturity: DSCR, debt yield, LTV, and the fee");
const tough = D.extensionTest({ ...a1, tests: { minDscr: 9, minDebtYieldPct: null, maxLtvPct: null } });
ok(tough.status === "fail" && tough.checks.length === 1 && !tough.checks[0].pass, "a failing test is reported");
ok(D.extensionTest({ ...a1, extensionsLeft: 0 }).status === "no extensions left", "no extensions left");

// ── Ladder, exposure, lenders ──
const lad = D.maturityLadder(loans);
const total = loans.reduce((s, l) => s + l.balance, 0);
ok(close(lad.reduce((s, y) => s + y.current, 0), total, 1) && close(lad.reduce((s, y) => s + y.extended, 0), total, 1), "ladder: all debt by current and fully extended maturity");
const ex = D.rateExposure(loans, TODAY);
ok(close(ex.rows.reduce((s, r) => s + r.pct, 0), 100) && ex.rows.find((r) => r.key === "fixed").loans === 1 && ex.rows.find((r) => r.key === "swapped").loans === 1 && ex.rows.find((r) => r.key === "floating").loans === 1, "rate exposure: floating, capped, swapped, fixed");
ok(ex.caps.length === loans.filter((l) => l.hedge === "capped").length && ex.caps.every((c, i) => i === 0 || c.expires >= ex.caps[i - 1].expires), "cap expiries, soonest first");
const lc = D.lenderConcentration(loans);
const eb = lc.rows.find((r) => r.lender === "Example Bank");
ok(eb.loans.length === 2 && close(eb.balance, L("sample-deal-2").balance + L("sample-deal-3").balance) && close(lc.rows.reduce((s, r) => s + r.pct, 0), 100) && lc.hhi > 0 && D.lenderConcentration([{ ...a1, lender: "" }]).rows[0].lender === "(no lender entered)", "lenders: balance, share, HHI");

// ── Refinance ──
const rf = D.refinance(a1, { ratePct: 6, maxLtvPct: 65, minDscr: 1.25, amortYears: 30 });
ok(close(rf.byLtv, 9e6 * 0.65) && rf.proceeds === Math.min(rf.byLtv, rf.byDscr) && close(rf.net, rf.proceeds - a1.balance) && close(rf.dscr, a1.noi / rf.debtService), "refinance: proceeds the lower of LTV and DSCR sizing; cash out or pay-down");
const rf2 = D.refinance(a1, { ratePct: 6, maxLtvPct: 90, minDscr: 1.0, amortYears: 30, minDebtYieldPct: 20 });
ok(rf2.binding === "Debt yield" && close(rf2.proceeds, a1.noi / 0.2), "a debt yield test can bind");

// ── Excel ──
const xl = D.fundDebtXlsx("Model Fund I", loans, TODAY);
ok(xl.some((r) => r[0] === "Maturity ladder") && xl.some((r) => r[0] === "Fixed rate") && xl.some((r) => r[0] === "Example Bank") && xl.some((r) => r[0] === "HHI"), "Excel: loans, ladder, rates, caps, lenders");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
