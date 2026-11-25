"use client";
// Dispositions → Disposition Candidates (user, 11/25, 1.1.5): the screener of
// assets whose business plan exit falls in the next 12 months, or has passed
// while still owned (lib/dispositionCandidates.js).
import { useMemo } from "react";
import { dispositionCandidates, WINDOW_MONTHS } from "@/lib/dispositionCandidates";

const TH = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500";
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");

export default function DispositionCandidates({ deals = [], funds = {}, scopeName = "", todayISO = new Date().toISOString().slice(0, 10), onOpenSellHold = null, onOpenSale = null }) {
  const { rows, next } = useMemo(() => dispositionCandidates(deals, funds, { todayISO }), [deals, funds, todayISO]);
  return (
    <div className="space-y-3 text-gray-900" data-testid="disposition-candidates">
      <div>
        <h2 className="text-lg font-bold">Disposition Candidates {rows.length > 0 && <span className="ml-1 rounded-full bg-blue-50 px-1.5 text-xs font-normal text-blue-700" data-testid="candidate-count">{rows.length}</span>}</h2>
        <p className="text-xs text-gray-500">Assets whose business plan exit falls in the next {WINDOW_MONTHS} months, or has passed while the asset is still owned (from the latest plan revision).{scopeName ? ` ${scopeName}` : ""} · as of {usDate(todayISO)}.</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-600" data-testid="no-candidates">
          <p>No disposition candidates: no asset&apos;s business plan exit falls in the next {WINDOW_MONTHS} months.</p>
          {next && <p className="mt-1 text-[11px] text-gray-500">Next planned exit: {next.asset}, {usDate(next.exit)} (business plan).</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className={TH}>Asset</th><th className={TH}>Portfolio</th><th className={TH}>Acquired</th><th className={TH}>Planned exit</th>
                <th className={`${TH} text-right`}>Months left</th><th className={TH}>Plan recommendation</th><th className={TH}>Sell/Hold decision</th><th className={TH}>Sale</th><th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.dealId} data-testid="candidate-row" className="align-top">
                  <td className="px-2 py-1.5 font-medium">{r.asset}</td>
                  <td className="px-2 py-1.5">{r.fund}</td>
                  <td className="px-2 py-1.5 tabular-nums">{usDate(r.acquired)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{usDate(r.exit)}<span className="ml-1 text-[10px] text-gray-400">plan rev {r.planRev}</span></td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.past ? "font-medium text-red-700" : ""}`} data-testid="cell-months-left">{r.past ? `${Math.abs(r.monthsLeft)} past plan` : r.monthsLeft}</td>
                  <td className="px-2 py-1.5">{r.recommendation || <span className="text-gray-400">—</span>}</td>
                  <td className="px-2 py-1.5" data-testid="cell-decision">
                    {r.heldLonger ? <span className="font-medium text-blue-800">Held past plan: {r.decision.text}</span>
                      : r.past ? <span className="font-medium text-red-700">Past plan exit, no Sell/Hold decision</span>
                      : r.decision ? r.decision.text : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-2 py-1.5">{r.sale ? (onOpenSale ? <button type="button" onClick={() => onOpenSale(r.dealId)} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-100">{r.sale.label}</button> : <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">{r.sale.label}</span>) : <span className="text-amber-700">No sale started</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">{onOpenSellHold && <button type="button" aria-label={`Sell/Hold analysis for ${r.asset}`} onClick={() => onOpenSellHold(r.dealId)} className="rounded border border-blue-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">Sell/Hold →</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">Planned exit: the latest business plan revision&apos;s target exit date, or the acquisition date plus its hold years. Assets with no business plan aren&apos;t listed. The Sell/Hold decision is the one saved on the Sell/Hold Analysis tab.</p>
    </div>
  );
}
