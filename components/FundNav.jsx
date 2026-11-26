"use client";

// Fund NAV, gross and net LP interim returns, and the fund's quarter-by-quarter
// totals. Moved from Valuation to Portfolio Return (11/23); the marks that drive
// them are still entered on Valuation, which keeps the valuation PDF.
import { fundOptionLabel } from "@/lib/fundTypes";
import { useMemo, useState } from "react";
import { DEFAULT_FUND_TERMS } from "@/lib/fundTerms";
import { MIN_IRR_YEARS, fundValuation, quarterLabel } from "@/lib/valuations";
import FundTypeBadge from "@/components/FundTypeBadge";

const fmtM = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  // 1.1.11 (UI review): one unit on a portfolio page: $M (so reserves of $132k
  // read $0.13M beside a $91.23M asset value, not a different unit).
  const s = a >= 5e3 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`;
  return n < 0 ? `(${s})` : s;
};
const fmtPct = (n, d = 1) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(d)}%`);
const fmtX = (n) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};
const irrText = (irr, years) => (years < MIN_IRR_YEARS ? "n/m" : fmtPct(irr));

function Stat({ label, value, sub, tone }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : "text-gray-900"}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </div>
  );
}

export default function FundNav({ deals, funds = {}, marks = {}, curve, onOpenValuation }) {
  const fundNames = useMemo(() => [...new Set(deals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))], [deals]);
  const [fundPick, setFundPick] = useState(null);
  const fundName = fundNames.includes(fundPick) ? fundPick : fundNames[0];
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fundName), [deals, fundName]);
  const terms = useMemo(() => ({ ...DEFAULT_FUND_TERMS, ...(funds[fundName] ?? {}), name: fundName }), [funds, fundName]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const val = useMemo(
    () => (fundName ? fundValuation(fundDeals, marks, terms, { todayISO, curve }) : null),
    [fundName, fundDeals, marks, terms, todayISO, curve]
  );
  const [asOfPick, setAsOfPick] = useState(null);
  if (!fundName || !val?.quarters.length) return null;

  const quarters = val.quarters;
  const asOf = quarters.some((q) => q.quarterEnd === asOfPick) ? asOfPick : quarters.at(-1).quarterEnd;
  const fq = quarters.find((q) => q.quarterEnd === asOf);

  return (
    <section className="mb-4 space-y-3" data-testid="fund-nav">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
          Fund NAV and interim returns <span className="font-normal text-gray-500">· {fundName}</span>
          <FundTypeBadge type={funds[fundName]?.type} />
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fundNames.length > 1 && (
            <select value={fundName} onChange={(e) => setFundPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" aria-label="Fund">
              {fundNames.map((n) => <option key={n} value={n}>{fundOptionLabel(n, funds)}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5">
            <span className="text-gray-500">As of</span>
            <select value={asOf} onChange={(e) => setAsOfPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {[...quarters].reverse().map((q) => <option key={q.quarterEnd} value={q.quarterEnd}>{quarterLabel(q.quarterEnd)} ({fmtDate(q.quarterEnd)})</option>)}
            </select>
          </label>
          {onOpenValuation && (
            <button type="button" onClick={onOpenValuation} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-blue-600 hover:bg-gray-50" title="Marks by asset and the valuation PDF are on the Valuation tab">
              Valuation PDF and marks →
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold text-gray-700">Fund NAV · {quarterLabel(asOf)}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Gross asset value" value={fmtM(fq.gav)} sub={`${fq.assets} asset${fq.assets === 1 ? "" : "s"}`} />
            <Stat label="Debt" value={fmtM(fq.debt)} />
            <Stat label="Asset cash reserves" value={fmtM(fq.reserves)} />
            <Stat label="Fund NAV" value={fmtM(fq.nav)} sub="Value − debt + reserves" />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold text-gray-700">Gross (asset level, before fund costs & promote)</h4>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Interim IRR" value={irrText(fq.gross.irr, fq.yearsSinceFirstCall)} sub={fq.yearsSinceFirstCall < MIN_IRR_YEARS ? "Under 1 year since first investment" : "Since inception, NAV as ending value"} />
            <Stat label="TVPI" value={fmtX(fq.gross.tvpi)} tone={fq.gross.tvpi < 1 ? "bad" : undefined} sub={`${fmtM(fq.gross.contrib)} invested`} />
            <Stat label="DPI" value={fmtX(fq.gross.dpi)} sub={`${fmtM(fq.gross.dist)} distributed`} />
            <Stat label="RVPI" value={fmtX(fq.gross.rvpi)} />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold text-gray-700">
            Net LP (hypothetical liquidation at NAV)
            {val.flowsMode === "actual" && <span className="ml-1.5 rounded bg-blue-50 px-1 text-[9px] font-semibold text-blue-700">actual calls</span>}
          </h4>
          {fq.net.nm ? (
            <p className="text-xs text-gray-500">n/m — {fq.net.nm}. Sub line balance {fmtM(fq.lineBalance)}.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Interim IRR" value={irrText(fq.net.irr, fq.yearsSinceFirstCall)} />
              <Stat label="TVPI" value={fmtX(fq.net.tvpi)} tone={fq.net.tvpi < 1 ? "bad" : undefined} sub={`${fmtM(fq.net.contrib)} called`} />
              <Stat label="DPI" value={fmtX(fq.net.dpi)} sub={`${fmtM(fq.net.dist)} distributed`} />
              <Stat label="LP NAV" value={fmtM(fq.net.lpNav)} sub={`RVPI ${fmtX(fq.net.rvpi)} · after ${fmtM(fq.lineBalance)} sub line`} />
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {["Quarter", "Assets", "Gross asset value", "Debt", "Reserves", "Fund NAV", "Sub line", "Gross IRR", "Gross TVPI", "Gross DPI", "LP NAV", "Net LP IRR", "Net LP TVPI", "Net LP DPI"].map((h, i) => (
                <th key={h} className={`px-2.5 py-2 font-medium whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...quarters].reverse().map((q) => (
              <tr key={q.quarterEnd} className={`border-t border-gray-100 ${q.quarterEnd === asOf ? "bg-blue-50/40" : ""}`}>
                <td className="px-2.5 py-1.5 text-left font-medium text-gray-700 whitespace-nowrap">{quarterLabel(q.quarterEnd)}</td>
                <td className="px-2.5 py-1.5 text-right">{q.assets}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(q.gav)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(q.debt)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(q.reserves)}</td>
                <td className="px-2.5 py-1.5 text-right font-semibold">{fmtM(q.nav)}</td>
                <td className="px-2.5 py-1.5 text-right text-gray-500">{fmtM(q.lineBalance)}</td>
                <td className="px-2.5 py-1.5 text-right">{irrText(q.gross.irr, q.yearsSinceFirstCall)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtX(q.gross.tvpi)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtX(q.gross.dpi)}</td>
                <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : fmtM(q.net.lpNav)}</td>
                <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : irrText(q.net.irr, q.yearsSinceFirstCall)}</td>
                <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : fmtX(q.net.tvpi)}</td>
                <td className="px-2.5 py-1.5 text-right">{q.net.nm ? "n/m" : fmtX(q.net.dpi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Interim returns use actual cash flows to date plus NAV as the ending value; IRRs under one year show n/m. Net LP assumes the fund sells
        everything at NAV on the quarter end, repays the sub line, and runs the proceeds through the fund waterfall. Asset marks come from the
        Valuation tab.
      </p>
    </section>
  );
}
