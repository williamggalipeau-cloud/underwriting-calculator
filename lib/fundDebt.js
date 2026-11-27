// Phase S: Portfolio Debt tab (Portfolio Management, after Portfolio Return). Every
// loan in the fund from each asset's own debt inputs and model: maturity
// ladder, extension tests, a refinance planner, rate exposure and cap
// expiries, lender concentration, and quarterly covenant compliance
// certificates. Read-only: nothing here changes an asset.
import { sndaByLoan } from "@/lib/snda";
import { breakEvenOccupancy } from "@/lib/assetMetrics";
import { underwrite } from "@/lib/calculations";
import { addYears } from "@/lib/fundTimeline";
import { notSold } from "@/lib/assetStatus";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const holdYearAt = (acq, iso) => { let t = 1; while (addYears(acq, t) <= iso && t < 60) t++; return t; };
const monthsBetween = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000 / 30.4375;
const sum = (xs) => xs.reduce((s, x) => s + x, 0);

// The asset's tests: lender covenants entered on the loan, else its sizing constraints.
export function loanTests(inp) {
  const c = inp.loanSizingConstraints ?? {};
  const cov = inp.covenants ?? {};
  return {
    minDscr: cov.minDscr ?? (c.minDSCREnabled === false ? null : n(inp.minDscr) || n(c.minDSCR) || 1.25),
    minDebtYieldPct: cov.minDebtYieldPct ?? (c.minDebtYieldEnabled === false ? null : n(c.minDebtYieldPct) || null),
    maxLtvPct: cov.maxLtvPct ?? (n(inp.ltvPct) ? Math.min(80, n(inp.ltvPct) + 10) : null),
  };
}

// Value at a date: the latest valuation mark on or before it, else the purchase price.
export function valueAt(dealId, inp, marks = {}, iso) {
  const qs = Object.entries(marks[dealId] ?? {}).filter(([q, m]) => q <= iso && n(m?.value) > 0).sort(([a], [b]) => (a < b ? -1 : 1));
  return qs.length ? { value: n(qs.at(-1)[1].value), basis: `mark ${qs.at(-1)[0]}` } : { value: n(inp.purchasePrice), basis: "cost" };
}

// One loan at a date (asOf), from the model's annual cash flows.
export function loanAt(deal, marks, asOf) {
  const inp = deal.inputs ?? {};
  const acq = inp.acquisitionDate;
  if (!acq || acq > asOf || (inp.realizedSaleDate && inp.realizedSaleDate <= asOf)) return null;
  let r;
  const term = n(inp.loanTermYears);
  const extN = n(inp.extensionCount), extY = n(inp.extensionTermYears) || 1;
  try { r = underwrite({ ...inp, holdPeriodYears: Math.max(n(inp.holdPeriodYears), Math.ceil(term + extN * extY) + 1) }); } catch { return null; }
  const loan0 = r.debt.loanAmount;
  if (!(loan0 > 0)) return null;
  const cfs = r.annualCashFlows;
  const t = holdYearAt(acq, asOf);
  const at = (k, key) => n(cfs[k - 1]?.[key]);
  const balance = t <= 1 ? loan0 : at(t - 1, "loanBalance") || loan0;
  const noi = at(t, "noi");
  const ds = at(t, "debtService");
  const initialMaturity = term ? addYears(acq, term) : "";
  const finalMaturity = term ? addYears(acq, term + extN * extY) : "";
  // Extensions already used: whole extension periods past the initial maturity.
  const used = initialMaturity && asOf > initialMaturity ? Math.min(extN, Math.ceil(monthsBetween(initialMaturity, asOf) / (12 * extY))) : 0;
  const currentMaturity = term ? addYears(acq, term + used * extY) : "";
  const floating = !!inp.floatingRate;
  const hedge = floating ? (inp.hedgingType === "cap" && n(inp.capStrikeRatePct) > 0 ? "capped" : inp.hedgingType === "swap" && n(inp.swapFixedRatePct) > 0 ? "swapped" : "floating") : "fixed";
  const capTerm = n(inp.capTermYears) || term || 1;
  const capEnd = hedge === "capped" ? addYears(acq, Math.ceil(Math.max(1e-9, (Date.parse(asOf) - Date.parse(acq)) / 86400000 / 365.25) / capTerm) * capTerm) : "";
  const swapEnd = hedge === "swapped" ? addYears(acq, n(inp.swapTermYears) || term) : "";
  const v = valueAt(deal.id, inp, marks, asOf);
  const tests = loanTests(inp);
  return {
    id: deal.id, name: inp.propertyName || deal.id, fund: inp.fundName || "", lender: inp.lenderName || "", acq, loan0, balance, noi, debtService: ds,
    dscr: ds > 0 ? noi / ds : null, debtYieldPct: balance > 0 ? (noi / balance) * 100 : null, ltvPct: v.value > 0 ? (balance / v.value) * 100 : null, value: v.value, valueBasis: v.basis,
    spreadPct: n(inp.spreadPct), floating, hedge, strikePct: hedge === "capped" ? n(inp.capStrikeRatePct) : null, capEnd, swapEnd, fixedRatePct: hedge === "fixed" ? n(inp.interestRatePct) : hedge === "swapped" ? n(inp.swapFixedRatePct) : null,
    initialMaturity, currentMaturity, finalMaturity, extensions: extN, extensionYears: extY, extensionsUsed: used, extensionsLeft: Math.max(0, extN - used), extensionFeePct: n(inp.extensionFeePct),
    amortYears: n(inp.amortizationYears), tests, cfs, holdYear: t, inputs: inp,
    breakEven: breakEvenOccupancy(inp, { year: t, model: r }), // 1.1.16: next to DSCR
  };
}
export function fundLoans(deals, marks, asOf) {
  return notSold(deals, asOf).map((d) => loanAt(d, marks, asOf)).filter(Boolean) // 1.1.26: a sold asset's loan was paid off at its sale
   .sort((a, b) => (a.currentMaturity || "9") < (b.currentMaturity || "9") ? -1 : 1);
}

// ── Maturity ladder: balance maturing by year (current and fully extended) ──
export function maturityLadder(loans) {
  const years = [...new Set(loans.flatMap((l) => [l.currentMaturity, l.finalMaturity]).filter(Boolean).map((d) => d.slice(0, 4)))].sort();
  const total = sum(loans.map((l) => l.balance));
  return years.map((y) => {
    const cur = loans.filter((l) => l.currentMaturity?.startsWith(y));
    const fin = loans.filter((l) => l.finalMaturity?.startsWith(y));
    return { year: y, current: sum(cur.map((l) => l.balance)), currentPct: total ? (sum(cur.map((l) => l.balance)) / total) * 100 : 0, currentLoans: cur.map((l) => l.name), extended: sum(fin.map((l) => l.balance)), extendedLoans: fin.map((l) => l.name) };
  });
}

// ── Extension test at the next maturity (projected from the model) ──
export function extensionTest(l) {
  if (!l.currentMaturity) return { status: "no term", checks: [] };
  if (!l.extensionsLeft) return { status: "no extensions left", date: l.currentMaturity, checks: [] };
  const t = holdYearAt(l.acq, l.currentMaturity);
  const at = (k, key) => n(l.cfs[k - 1]?.[key]);
  const noi = at(t, "noi"), ds = at(t, "debtService");
  const bal = at(t - 1, "loanBalance") || l.balance;
  const dscr = ds > 0 ? noi / ds : null;
  const dy = bal > 0 ? (noi / bal) * 100 : null;
  const ltv = l.value > 0 ? (bal / l.value) * 100 : null;
  const checks = [
    l.tests.minDscr != null && { test: "DSCR", value: dscr, required: l.tests.minDscr, pass: dscr != null && dscr >= l.tests.minDscr, unit: "x" },
    l.tests.minDebtYieldPct != null && { test: "Debt yield", value: dy, required: l.tests.minDebtYieldPct, pass: dy != null && dy >= l.tests.minDebtYieldPct, unit: "%" },
    l.tests.maxLtvPct != null && { test: "LTV", value: ltv, required: l.tests.maxLtvPct, pass: ltv != null && ltv <= l.tests.maxLtvPct, unit: "%", max: true },
  ].filter(Boolean);
  return { status: checks.every((c) => c.pass) ? "pass" : "fail", date: l.currentMaturity, fee: bal * (l.extensionFeePct / 100), checks };
}

// ── Refinance planner: new loan proceeds at a rate / LTV / DSCR / amortization ──
export function refinance(l, { ratePct = 6.5, maxLtvPct = 65, minDscr = 1.25, amortYears = 30, ioYears = 0, minDebtYieldPct = null, value = null } = {}) {
  const v = n(value) || l.value;
  const r = ratePct / 100 / 12, nper = amortYears * 12;
  const constant = ioYears > 0 || amortYears <= 0 ? ratePct / 100 : (r === 0 ? 1 / amortYears : (r / (1 - Math.pow(1 + r, -nper))) * 12);
  const byLtv = v * (maxLtvPct / 100);
  const byDscr = l.noi > 0 && constant > 0 ? l.noi / minDscr / constant : 0;
  const byDy = minDebtYieldPct ? l.noi / (minDebtYieldPct / 100) : Infinity;
  const proceeds = Math.max(0, Math.min(byLtv, byDscr, byDy));
  const binding = proceeds === byLtv ? "LTV" : proceeds === byDscr ? "DSCR" : "Debt yield";
  return { value: v, byLtv, byDscr, byDy: Number.isFinite(byDy) ? byDy : null, proceeds, binding, payoff: l.balance, net: proceeds - l.balance, debtService: proceeds * constant, dscr: proceeds > 0 ? l.noi / (proceeds * constant) : null };
}

// ── Rate exposure and caps ──
export function rateExposure(loans, asOf) {
  const total = sum(loans.map((l) => l.balance));
  const by = (h) => sum(loans.filter((l) => l.hedge === h).map((l) => l.balance));
  const rows = [["floating", "Floating, unhedged"], ["capped", "Floating, capped"], ["swapped", "Swapped to fixed"], ["fixed", "Fixed rate"]].map(([k, label]) => ({ key: k, label, balance: by(k), pct: total ? (by(k) / total) * 100 : 0, loans: loans.filter((l) => l.hedge === k).length }));
  const caps = loans.filter((l) => l.hedge === "capped").map((l) => ({ name: l.name, notional: l.balance, strikePct: l.strikePct, expires: l.capEnd, months: Math.round(monthsBetween(asOf, l.capEnd)), beforeMaturity: l.capEnd < l.currentMaturity })).sort((a, b) => (a.expires < b.expires ? -1 : 1));
  return { total, rows, caps, floatingPct: total ? ((by("floating") + by("capped")) / total) * 100 : 0 };
}

// ── Lender concentration ──
export function lenderConcentration(loans) {
  const total = sum(loans.map((l) => l.balance));
  const m = new Map();
  for (const l of loans) { const k = l.lender || "(no lender entered)"; const g = m.get(k) ?? { lender: k, balance: 0, loans: [], maturities: [] }; g.balance += l.balance; g.loans.push(l.name); if (l.currentMaturity) g.maturities.push(l.currentMaturity); m.set(k, g); }
  const rows = [...m.values()].map((g) => ({ ...g, pct: total ? (g.balance / total) * 100 : 0, maturities: g.maturities.sort() })).sort((a, b) => b.balance - a.balance);
  return { rows, hhi: Math.round(sum(rows.map((r) => r.pct * r.pct))) };
}

// ── Excel ──
const r0 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v));
const r2 = (v) => (v == null || !Number.isFinite(v) ? "" : Math.round(v * 100) / 100);
export function fundDebtXlsx(fundName, loans, asOf) {
  const out = [[`${fundName} · fund debt as of ${asOf}`], [], ["Asset", "Lender", "Balance", "Original loan", "Rate", "Spread (%)", "Cap strike (%)", "Cap expires", "Initial maturity", "Current maturity", "Fully extended", "Extensions left", "NOI (hold year)", "Debt service", "DSCR", "Debt yield (%)", "Value", "Value basis", "LTV (%)", "Next extension test"]];
  for (const l of loans) { const e = extensionTest(l); out.push([l.name, l.lender, r0(l.balance), r0(l.loan0), l.hedge, r2(l.spreadPct), r2(l.strikePct), l.capEnd, l.initialMaturity, l.currentMaturity, l.finalMaturity, l.extensionsLeft, r0(l.noi), r0(l.debtService), r2(l.dscr), r2(l.debtYieldPct), r0(l.value), l.valueBasis, r2(l.ltvPct), e.status]); }
  out.push([], ["Maturity ladder", "Maturing (current terms)", "% of debt", "Loans", "Maturing if fully extended", "Loans"]);
  for (const y of maturityLadder(loans)) out.push([y.year, r0(y.current), r2(y.currentPct), y.currentLoans.join(", "), r0(y.extended), y.extendedLoans.join(", ")]);
  const ex = rateExposure(loans, asOf);
  out.push([], ["Rate exposure", "Balance", "% of debt", "Loans"], ...ex.rows.map((r) => [r.label, r0(r.balance), r2(r.pct), r.loans]));
  out.push([], ["Cap", "Notional", "Strike (%)", "Expires", "Months", "Expires before maturity"], ...ex.caps.map((c) => [c.name, r0(c.notional), r2(c.strikePct), c.expires, c.months, c.beforeMaturity ? "Yes" : ""]));
  const lc = lenderConcentration(loans);
  out.push([], ["Lender", "Balance", "% of debt", "Loans", "Maturities"], ...lc.rows.map((r) => [r.lender, r0(r.balance), r2(r.pct), r.loans.join(", "), r.maturities.join(", ")]), ["HHI", lc.hhi]);
  // 1.1.17: SNDA coverage by loan.
  out.push([], ["SNDA coverage", "Lender", "Loan requires", "Leases", "Required", "Signed", "Outstanding", "Rent covered (%)", "SF covered (%)", "Status"], ...sndaByLoan(loans, { todayISO: asOf }).map((c) => [c.asset, c.lender, c.ruleText, c.leases, c.required, c.signed, c.outstanding, r2(c.rentCoveredPct), r2(c.sfCoveredPct), c.label]));
  return out;
}

// ── Quarterly covenant compliance certificates ──
// Completed quarter ends, newest first, on or before asOf.
export function quarterEnds(asOf, count = 8) {
  const out = [];
  let y = Number(asOf.slice(0, 4)), q = Math.floor((Number(asOf.slice(5, 7)) - 1) / 3) + 1; // the current quarter is tried first (ended only on its last day)
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  for (let i = 0; out.length < count && i < count + 5; i++) {
    q -= 1;
    if (q < 0) { q = 3; y -= 1; }
    const iso = `${y}-${ends[q]}`;
    if (iso <= asOf) out.push(iso);
  }
  return out;
}
// One loan's certificate for a quarter end: each covenant tested, overall compliance.
export function covenantCertificate(deal, marks, qEnd) {
  const l = loanAt(deal, marks, qEnd);
  if (!l) return null;
  const rows = [
    l.tests.minDscr != null && { test: "Debt service coverage ratio (DSCR)", actual: l.dscr, required: l.tests.minDscr, unit: "x", kind: "min", pass: l.dscr != null && l.dscr >= l.tests.minDscr, calc: `NOI ${Math.round(l.noi).toLocaleString("en-US")} ÷ debt service ${Math.round(l.debtService).toLocaleString("en-US")}` },
    l.tests.minDebtYieldPct != null && { test: "Debt yield", actual: l.debtYieldPct, required: l.tests.minDebtYieldPct, unit: "%", kind: "min", pass: l.debtYieldPct != null && l.debtYieldPct >= l.tests.minDebtYieldPct, calc: `NOI ${Math.round(l.noi).toLocaleString("en-US")} ÷ balance ${Math.round(l.balance).toLocaleString("en-US")}` },
    l.tests.maxLtvPct != null && { test: "Loan to value (LTV)", actual: l.ltvPct, required: l.tests.maxLtvPct, unit: "%", kind: "max", pass: l.ltvPct != null && l.ltvPct <= l.tests.maxLtvPct, calc: `balance ${Math.round(l.balance).toLocaleString("en-US")} ÷ value ${Math.round(l.value).toLocaleString("en-US")} (${l.valueBasis})` },
  ].filter(Boolean);
  return { dealId: l.id, asset: l.name, fund: l.fund, lender: l.lender, quarterEnd: qEnd, balance: l.balance, noi: l.noi, debtService: l.debtService, value: l.value, valueBasis: l.valueBasis, rows, compliant: rows.every((r) => r.pass), breaches: rows.filter((r) => !r.pass).map((r) => r.test) };
}
export function certificates(deals, marks, qEnd) {
  return deals.map((d) => covenantCertificate(d, marks, qEnd)).filter(Boolean);
}
export function certificatesXlsx(certs) {
  const out = [];
  for (const c of certs) {
    out.push([`Covenant compliance certificate · ${c.asset}`], ["Borrower asset", c.asset], ["Fund", c.fund], ["Lender", c.lender || ""], ["Quarter ended", c.quarterEnd], ["Loan balance", r0(c.balance)], ["NOI (model, hold year)", r0(c.noi)], ["Debt service", r0(c.debtService)], ["Value", r0(c.value)], ["Value basis", c.valueBasis], [], ["Covenant", "Actual", "Required", "Test", "In compliance", "Calculation"]);
    for (const r of c.rows) out.push([r.test, r2(r.actual), r2(r.required), r.kind === "min" ? "minimum" : "maximum", r.pass ? "Yes" : "NO", r.calc]);
    out.push(["Overall", c.compliant ? "In compliance" : `Not in compliance: ${c.breaches.join(", ")}`], [], ["Certified by", "", "Title", "", "Date", ""], [], []);
  }
  return out;
}
// Home: current covenant breaches and failing extension tests within 18 months.
export function debtAlerts(deals, marks, asOf) {
  const out = [];
  for (const l of fundLoans(deals, marks, asOf)) {
    const t = l.tests;
    const breach = [t.minDscr != null && l.dscr != null && l.dscr < t.minDscr && `DSCR ${l.dscr.toFixed(2)}x < ${t.minDscr.toFixed(2)}x`, t.minDebtYieldPct != null && l.debtYieldPct != null && l.debtYieldPct < t.minDebtYieldPct && `debt yield ${l.debtYieldPct.toFixed(1)}% < ${t.minDebtYieldPct}%`, t.maxLtvPct != null && l.ltvPct != null && l.ltvPct > t.maxLtvPct && `LTV ${l.ltvPct.toFixed(1)}% > ${t.maxLtvPct}%`].filter(Boolean);
    if (breach.length) out.push({ kind: "covenant", dealId: l.id, asset: l.name, date: null, text: `Covenant breach: ${breach.join(", ")} (${l.name})` });
    const e = extensionTest(l);
    if (e.status === "fail" && monthsBetween(asOf, e.date) <= 18) out.push({ kind: "extension", dealId: l.id, asset: l.name, date: e.date, text: `Extension test fails at maturity: ${e.checks.filter((c) => !c.pass).map((c) => c.test).join(", ")} (${l.name})` });
  }
  return out;
}
