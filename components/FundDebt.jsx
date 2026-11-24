"use client";

// Phase S: Portfolio Debt tab (Portfolio Management, after Portfolio Return). Every
// loan in the fund: maturity ladder, extension tests, refinance planner,
// rate exposure and caps, lender concentration. Read-only.
import { useMemo, useState } from "react";
import { certificates, certificatesXlsx, extensionTest, fundDebtXlsx, fundLoans, lenderConcentration, maturityLadder, quarterEnds, rateExposure, refinance } from "@/lib/fundDebt";
import { downloadBlob } from "@/lib/fundTerms";
import { writeXlsx } from "@/lib/xlsx";

const money = (v) => (v == null || !Number.isFinite(v) ? "—" : `$${(v / 1e6).toFixed(2)}M`);
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const x2 = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}x`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const HEDGE = { floating: ["Floating", "bg-red-50 text-red-700"], capped: ["Capped", "bg-sky-50 text-sky-800"], swapped: ["Swapped", "bg-violet-50 text-violet-800"], fixed: ["Fixed", "bg-emerald-50 text-emerald-800"] };
const inp = "rounded border border-gray-200 px-1.5 py-0.5 text-xs";
const Card = ({ title, children, testid }) => <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid={testid}><h3 className="mb-2 text-sm font-semibold">{title}</h3>{children}</section>;

export default function FundDebt({ deals = [], funds = {}, marks = {}, todayISO = new Date().toISOString().slice(0, 10), children = null }) {
  const names = useMemo(() => [...new Set(deals.map((d) => d.inputs?.fundName).filter(Boolean))].sort(), [deals]);
  const [fund, setFund] = useState(names[0] ?? "");
  const [refiId, setRefiId] = useState("");
  const [refiIn, setRefiIn] = useState({ ratePct: 6.5, maxLtvPct: 65, minDscr: 1.25, amortYears: 30, minDebtYieldPct: "" });
  const qs = quarterEnds(todayISO, 8);
  const [certQ, setCertQ] = useState(qs[0]);
  const [certLoan, setCertLoan] = useState("");
  const fd = deals.filter((d) => d.inputs?.fundName === fund);
  const loans = useMemo(() => fundLoans(fd, marks, todayISO), [fd, marks, todayISO]);
  if (!names.length) return <p className="text-xs text-gray-500">No fund assets yet.</p>;
  const ladder = maturityLadder(loans);
  const ex = rateExposure(loans, todayISO);
  const lc = lenderConcentration(loans);
  const total = ex.total;
  const wDscr = total ? loans.reduce((s, l) => s + (l.dscr ?? 0) * l.balance, 0) / total : null;
  const wLtv = total ? loans.reduce((s, l) => s + (l.ltvPct ?? 0) * l.balance, 0) / total : null;
  const next18 = loans.filter((l) => l.currentMaturity && (Date.parse(l.currentMaturity) - Date.parse(todayISO)) / 86400000 <= 548);
  const refiLoan = loans.find((l) => l.id === refiId) ?? loans[0];
  const refi = refiLoan ? refinance(refiLoan, { ...refiIn, minDebtYieldPct: refiIn.minDebtYieldPct === "" ? null : Number(refiIn.minDebtYieldPct) }) : null;
  const maxBar = Math.max(1, ...ladder.map((y) => Math.max(y.current, y.extended)));

  return (
    <div className="space-y-4 text-gray-900" data-testid="fund-debt">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-bold">Portfolio Debt</h2><p className="text-xs text-gray-500">Every loan in the fund from each asset&apos;s debt inputs and model (the Debt tab stays for one asset&apos;s loan). As of {usDate(todayISO)}.</p></div>
        <div className="flex items-center gap-2 text-xs">
          {names.length > 1 && <select aria-label="Fund" value={fund} onChange={(e) => setFund(e.target.value)} className={inp}>{names.map((n) => <option key={n}>{n}</option>)}</select>}
          <button type="button" disabled={!loans.length} onClick={async () => { const { fundDebtPdf } = await import("@/lib/fundDebtPdf"); downloadBlob(await fundDebtPdf(fund, loans, todayISO), `${fund.replace(/[^\w-]+/g, "-")}-fund-debt-${todayISO}.pdf`); }} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium disabled:opacity-40">PDF</button>
          <button type="button" disabled={!loans.length} onClick={async () => downloadBlob(await writeXlsx(fundDebtXlsx(fund, loans, todayISO), { sheetName: "Fund debt" }), `${fund.replace(/[^\w-]+/g, "-")}-fund-debt-${todayISO}.xlsx`)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium disabled:opacity-40">Excel</button>
        </div>
      </div>
      {!loans.length ? <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">No loans on {fund}&apos;s owned assets.</p> : (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="debt-summary">
            {[["Debt", money(total)], ["Loans", String(loans.length)], ["Weighted DSCR", x2(wDscr)], ["Weighted LTV", pct(wLtv)], ["Floating (incl. capped)", pct(ex.floatingPct)], ["Maturing in 18 months", `${next18.length} · ${money(next18.reduce((s, l) => s + l.balance, 0))}`]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"><p className="text-[11px] text-gray-500">{k}</p><p className="text-sm font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>

          <Card title="Loans" testid="debt-loans">
            <div className="overflow-x-auto"><table className="w-full text-xs tabular-nums">
              <thead className="text-gray-500"><tr>{["Asset", "Lender", "Balance", "Rate", "Maturity", "Fully extended", "Ext. left", "DSCR", "Debt yield", "LTV", "Next extension test"].map((h) => <th key={h} className="px-1.5 py-1 text-left font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{loans.map((l) => {
                const e = extensionTest(l);
                return (
                  <tr key={l.id} className="border-t border-gray-100" data-testid="debt-loan-row">
                    <td className="px-1.5 py-1 font-medium">{l.name}</td><td className="px-1.5 py-1">{l.lender || <span className="text-gray-400">not entered</span>}</td><td className="px-1.5 py-1">{money(l.balance)}</td>
                    <td className="px-1.5 py-1"><span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${HEDGE[l.hedge][1]}`}>{HEDGE[l.hedge][0]}</span> {l.floating ? `S+${l.spreadPct.toFixed(2)}%` : pct(l.fixedRatePct, 2)}</td>
                    <td className="px-1.5 py-1">{usDate(l.currentMaturity)}</td><td className="px-1.5 py-1 text-gray-500">{usDate(l.finalMaturity)}</td><td className="px-1.5 py-1">{l.extensionsLeft}</td>
                    <td className={`px-1.5 py-1 ${l.tests.minDscr && l.dscr < l.tests.minDscr ? "text-red-700 font-semibold" : ""}`}>{x2(l.dscr)}</td><td className="px-1.5 py-1">{pct(l.debtYieldPct)}</td><td className="px-1.5 py-1">{pct(l.ltvPct)}<span className="block text-[10px] text-gray-400">{l.valueBasis}</span></td>
                    <td className="px-1.5 py-1" data-testid="ext-test">{e.status === "pass" ? <span className="text-emerald-700">Passes ({usDate(e.date)})</span> : e.status === "fail" ? <span className="font-semibold text-red-700" title={e.checks.filter((c) => !c.pass).map((c) => `${c.test} ${c.unit === "x" ? x2(c.value) : pct(c.value)} vs ${c.max ? "max" : "min"} ${c.unit === "x" ? x2(c.required) : pct(c.required)}`).join("; ")}>Fails: {e.checks.filter((c) => !c.pass).map((c) => c.test).join(", ")}</span> : <span className="text-gray-500">{e.status}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <p className="mt-1 text-[11px] text-gray-400">DSCR, debt yield and LTV in the current hold year from the model; value from the latest valuation mark (else cost). Extension tests project the asset&apos;s DSCR, debt yield and LTV at its next maturity against the loan&apos;s tests (the sizing constraints unless covenants are entered).</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Maturity ladder" testid="debt-ladder">
              <div className="space-y-1.5 text-xs">
                {ladder.map((y) => (
                  <div key={y.year} className="grid grid-cols-[3rem_1fr] items-center gap-2" data-testid="ladder-year">
                    <span className="font-semibold">{y.year}</span>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5"><div className="h-3 rounded bg-blue-600" style={{ width: `${(y.current / maxBar) * 100}%` }} title={y.currentLoans.join(", ")} /><span className="tabular-nums text-gray-700">{y.current ? `${money(y.current)} (${pct(y.currentPct, 0)})` : ""}</span></div>
                      <div className="flex items-center gap-1.5"><div className="h-2 rounded bg-blue-200" style={{ width: `${(y.extended / maxBar) * 100}%` }} title={y.extendedLoans.join(", ")} /><span className="tabular-nums text-gray-400">{y.extended ? `${money(y.extended)} if fully extended` : ""}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Rate exposure and caps" testid="debt-rates">
              <table className="w-full text-xs tabular-nums"><tbody>{ex.rows.map((r) => <tr key={r.key}><td className="py-0.5"><span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${HEDGE[r.key][1]}`}>{r.label}</span></td><td className="py-0.5 text-right">{money(r.balance)}</td><td className="py-0.5 text-right">{pct(r.pct)}</td><td className="py-0.5 text-right text-gray-500">{r.loans} loan{r.loans === 1 ? "" : "s"}</td></tr>)}</tbody></table>
              {ex.caps.length > 0 && <table className="mt-2 w-full text-xs tabular-nums"><thead className="text-gray-500"><tr><th className="text-left font-medium">Cap</th><th className="text-right font-medium">Notional</th><th className="text-right font-medium">Strike</th><th className="text-right font-medium">Expires</th></tr></thead><tbody>{ex.caps.map((c) => <tr key={c.name} className={c.months <= 6 ? "text-red-700" : ""}><td>{c.name}</td><td className="text-right">{money(c.notional)}</td><td className="text-right">{pct(c.strikePct, 2)}</td><td className="text-right">{usDate(c.expires)} ({c.months} mo){c.beforeMaturity ? " · before maturity" : ""}</td></tr>)}</tbody></table>}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Lender concentration" testid="debt-lenders">
              <table className="w-full text-xs tabular-nums"><thead className="text-gray-500"><tr><th className="text-left font-medium">Lender</th><th className="text-right font-medium">Balance</th><th className="text-right font-medium">% of debt</th><th className="text-left pl-2 font-medium">Loans</th></tr></thead>
                <tbody>{lc.rows.map((r) => <tr key={r.lender} className="border-t border-gray-100"><td className="py-0.5">{r.lender}</td><td className="py-0.5 text-right">{money(r.balance)}</td><td className="py-0.5 text-right">{pct(r.pct)}</td><td className="py-0.5 pl-2 text-gray-500">{r.loans.join(", ")}</td></tr>)}</tbody></table>
              <p className="mt-1 text-[11px] text-gray-400">HHI {lc.hhi.toLocaleString("en-US")} (10,000 = one lender). Lender names come from each asset&apos;s Debt inputs.</p>
            </Card>
            <Card title="Refinance planner" testid="debt-refi">
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <label className="flex flex-col"><span className="text-[10px] text-gray-500">Loan</span><select aria-label="Refinance loan" value={refiLoan?.id ?? ""} onChange={(e) => setRefiId(e.target.value)} className={inp}>{loans.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                {[["ratePct", "Rate (%)"], ["maxLtvPct", "Max LTV (%)"], ["minDscr", "Min DSCR"], ["amortYears", "Amortization (yrs)"], ["minDebtYieldPct", "Min debt yield (%)"]].map(([k, l]) => <label key={k} className="flex flex-col"><span className="text-[10px] text-gray-500">{l}</span><input aria-label={l} type="number" step="any" value={refiIn[k]} onChange={(e) => setRefiIn({ ...refiIn, [k]: e.target.value === "" ? "" : Number(e.target.value) })} className={`${inp} w-20`} /></label>)}
              </div>
              {refi && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums" data-testid="refi-result">
                  <dt className="text-gray-500">Value ({refiLoan.valueBasis})</dt><dd className="text-right">{money(refi.value)}</dd>
                  <dt className="text-gray-500">Proceeds by LTV / DSCR{refi.byDy != null ? " / debt yield" : ""}</dt><dd className="text-right">{money(refi.byLtv)} / {money(refi.byDscr)}{refi.byDy != null ? ` / ${money(refi.byDy)}` : ""}</dd>
                  <dt className="font-semibold">New loan ({refi.binding} binds)</dt><dd className="text-right font-semibold">{money(refi.proceeds)}</dd>
                  <dt className="text-gray-500">Payoff of the current loan</dt><dd className="text-right">{money(refi.payoff)}</dd>
                  <dt className="font-semibold">{refi.net >= 0 ? "Cash out" : "Equity needed (pay-down)"}</dt><dd className={`text-right font-semibold ${refi.net < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(Math.abs(refi.net))}</dd>
                  <dt className="text-gray-500">New debt service / DSCR</dt><dd className="text-right">{money(refi.debtService)} / {x2(refi.dscr)}</dd>
                </dl>
              )}
            </Card>
          </div>
          <Card title="Covenant compliance certificates" testid="debt-certs">
            {(() => {
              const certs = certificates(fd.filter((d) => !certLoan || d.id === certLoan), marks, certQ);
              const fname = `covenant-certificates-${certLoan ? (certs[0]?.asset ?? "loan").replace(/[^\w-]+/g, "-") : fund.replace(/[^\w-]+/g, "-")}-${certQ}`;
              return (
                <>
                  <div className="flex flex-wrap items-end gap-2 text-xs">
                    <label className="flex flex-col"><span className="text-[10px] text-gray-500">Quarter ended</span><select aria-label="Certificate quarter" value={certQ} onChange={(e) => setCertQ(e.target.value)} className={inp}>{qs.map((q) => <option key={q} value={q}>{usDate(q)}</option>)}</select></label>
                    <label className="flex flex-col"><span className="text-[10px] text-gray-500">Loan</span><select aria-label="Certificate loan" value={certLoan} onChange={(e) => setCertLoan(e.target.value)} className={inp}><option value="">All loans</option>{loans.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                    <button type="button" disabled={!certs.length} onClick={async () => { const { certificatesPdf } = await import("@/lib/fundDebtPdf"); downloadBlob(await certificatesPdf(certs), `${fname}.pdf`); }} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium disabled:opacity-40">Certificates PDF</button>
                    <button type="button" disabled={!certs.length} onClick={async () => downloadBlob(await writeXlsx(certificatesXlsx(certs), { sheetName: "Certificates" }), `${fname}.xlsx`)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium disabled:opacity-40">Certificates Excel</button>
                  </div>
                  {certs.length === 0 ? <p className="mt-2 text-xs text-gray-500">No loans in place at {usDate(certQ)}.</p> : (
                    <table className="mt-2 w-full text-xs tabular-nums"><thead className="text-gray-500"><tr><th className="text-left font-medium">Asset</th><th className="text-left font-medium">Lender</th>{certs[0].rows.map((r) => <th key={r.test} className="text-right font-medium">{r.test.replace(/ \(.*\)/, "")}</th>)}<th className="text-right font-medium">Status</th></tr></thead>
                      <tbody>{certs.map((c) => (
                        <tr key={c.dealId} className="border-t border-gray-100" data-testid="cert-row">
                          <td className="py-0.5">{c.asset}</td><td className="py-0.5 text-gray-500">{c.lender || "—"}</td>
                          {c.rows.map((r) => <td key={r.test} className={`py-0.5 text-right ${r.pass ? "" : "font-semibold text-red-700"}`}>{r.unit === "x" ? x2(r.actual) : pct(r.actual)} <span className="text-[10px] text-gray-400">{r.kind === "min" ? "≥" : "≤"} {r.unit === "x" ? x2(r.required) : pct(r.required)}</span></td>)}
                          <td className={`py-0.5 text-right font-semibold ${c.compliant ? "text-emerald-700" : "text-red-700"}`}>{c.compliant ? "In compliance" : "Breach"}</td>
                        </tr>
                      ))}</tbody></table>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">Each certificate tests the quarter&apos;s DSCR, debt yield and LTV (model NOI for that hold year; the latest valuation mark at the quarter end) against the loan&apos;s covenants, with the calculation and a signature block. Review against the loan agreement&apos;s definitions before signing.</p>
                </>
              );
            })()}
          </Card>
          {children}
        </>
      )}
    </div>
  );
}
