"use client";

function fmt(n, decimals = 0) {
  if (!isFinite(n) || n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n, d = 1) { return isFinite(n) && n != null ? `${fmt(n, d)}%` : "—"; }
function fmtX(n, d = 2) { return isFinite(n) && n != null ? `${fmt(n, d)}x` : "—"; }
function fmtM(n) {
  if (!isFinite(n) || n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${fmt(n / 1_000_000, 2)}M`;
  if (Math.abs(n) >= 1_000) return `$${fmt(n / 1_000, 1)}k`;
  return `$${fmt(n)}`;
}

// Bisection IRR matching calcIRR in calculations.js
function calcIRR(cashFlows) {
  const hasPos = cashFlows.some((v) => v > 0);
  const hasNeg = cashFlows.some((v) => v < 0);
  if (!hasPos || !hasNeg) return NaN;
  function npv(r) {
    return cashFlows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0);
  }
  let lo = -0.9999, hi = 10;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(hi - lo) < 1e-10) return mid * 100;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

// Sum irrFlows arrays year-by-year (arrays may differ in length)
function aggregateFlows(deals) {
  if (deals.length === 0) return [];
  const maxLen = Math.max(...deals.map((d) => d.irrFlows.length));
  const combined = Array(maxLen).fill(0);
  for (const deal of deals) {
    deal.irrFlows.forEach((v, i) => { combined[i] += v; });
  }
  return combined;
}

// Group deals by fund name (empty string → "(No Fund)")
function groupByFund(deals) {
  const groups = {};
  for (const deal of deals) {
    const key = deal.inputs.fundName?.trim() || "(No Fund)";
    if (!groups[key]) groups[key] = [];
    groups[key].push(deal);
  }
  return groups;
}

function DealRow({ deal, onRemove }) {
  const { inputs, metrics } = deal;
  const good = (v, threshold) => isFinite(v) && v >= threshold;
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2.5">
        <p className="text-sm font-medium text-gray-800">{inputs.propertyName || "Unnamed"}</p>
        {inputs.fundName && <p className="text-xs text-gray-400">{inputs.fundName}</p>}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-600 tabular-nums">
        {fmt(inputs.squareFootage)} SF
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        {fmtM(inputs.purchasePrice)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        {fmtM(metrics.equityRequired)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${good(metrics.irr, 14) ? "text-emerald-700" : "text-red-600"}`}>
        {fmtPct(metrics.irr)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${good(metrics.equityMultiple, 2) ? "text-emerald-700" : "text-red-600"}`}>
        {fmtX(metrics.equityMultiple)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${good(metrics.yearOneCashOnCash, 7) ? "text-emerald-700" : "text-red-600"}`}>
        {fmtPct(metrics.yearOneCashOnCash)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-500 tabular-nums">
        {inputs.holdPeriodYears}yr
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          onClick={() => onRemove(deal.id)}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function FundGroup({ fundName, deals, onRemove }) {
  const combinedFlows = aggregateFlows(deals);
  const fundIRR = calcIRR(combinedFlows);
  const totalEquity = deals.reduce((s, d) => s + (d.metrics.equityRequired ?? 0), 0);
  const totalPurchasePrice = deals.reduce((s, d) => s + (d.inputs.purchasePrice ?? 0), 0);
  const totalSF = deals.reduce((s, d) => s + (d.inputs.squareFootage ?? 0), 0);

  // Weighted average equity multiple: total proceeds / total equity
  // proceeds = irrFlows[0] (negative equity) + sum of positive flows
  const totalInvested = deals.reduce((s, d) => s + Math.abs(d.irrFlows[0] ?? 0), 0);
  const totalProceeds = deals.reduce((s, d) => s + d.irrFlows.slice(1).reduce((a, v) => a + Math.max(v, 0), 0), 0);
  const weightedEM = totalInvested > 0 ? (totalInvested + totalProceeds) / totalInvested : NaN;

  // Build year-by-year combined table (years 1..N, excluding year-0 equity outflow)
  const maxYears = Math.max(...deals.map((d) => d.irrFlows.length - 1));
  const yearRows = Array.from({ length: maxYears }, (_, i) => {
    const year = i + 1;
    const total = deals.reduce((s, d) => s + (d.irrFlows[year] ?? 0), 0);
    return { year, total, byDeal: deals.map((d) => d.irrFlows[year] ?? 0) };
  });

  return (
    <div className="space-y-5">
      {/* Fund header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{fundName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{deals.length} asset{deals.length !== 1 ? "s" : ""} · {fmt(totalSF)} SF · {fmtM(totalPurchasePrice)} total purchase price</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500">Fund IRR</p>
            <p className={`text-lg font-bold tabular-nums ${isFinite(fundIRR) && fundIRR >= 14 ? "text-emerald-700" : isFinite(fundIRR) ? "text-red-600" : "text-gray-400"}`}>
              {fmtPct(fundIRR)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Eq. Multiple</p>
            <p className={`text-lg font-bold tabular-nums ${isFinite(weightedEM) && weightedEM >= 2 ? "text-emerald-700" : isFinite(weightedEM) ? "text-red-600" : "text-gray-400"}`}>
              {fmtX(weightedEM)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total Equity</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">{fmtM(totalEquity)}</p>
          </div>
        </div>
      </div>

      {/* Deal roster */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {["Property", "SF", "Purchase Price", "Equity", "IRR", "EM", "CoC Y1", "Hold", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap last:w-16">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <DealRow key={deal.id} deal={deal} onRemove={onRemove} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-2.5 text-xs font-semibold text-gray-600">Fund Total</td>
              <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmt(totalSF)} SF</td>
              <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmtM(totalPurchasePrice)}</td>
              <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700 tabular-nums">{fmtM(totalEquity)}</td>
              <td className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${isFinite(fundIRR) && fundIRR >= 14 ? "text-emerald-700" : "text-red-600"}`}>{fmtPct(fundIRR)}</td>
              <td className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums ${isFinite(weightedEM) && weightedEM >= 2 ? "text-emerald-700" : "text-red-600"}`}>{fmtX(weightedEM)}</td>
              <td className="px-3 py-2.5" colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Combined cash flow table */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 mb-2">Combined Cash Flows</h4>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Year</th>
                {deals.map((d) => (
                  <th key={d.id} className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {d.inputs.propertyName || "Unnamed"}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Year 0: equity outflows */}
              <tr className="bg-red-50">
                <td className="px-3 py-2 font-medium text-gray-700">Y0</td>
                {deals.map((d) => (
                  <td key={d.id} className="px-3 py-2 text-right tabular-nums text-red-600">{fmtM(d.irrFlows[0] ?? 0)}</td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-700">
                  {fmtM(deals.reduce((s, d) => s + (d.irrFlows[0] ?? 0), 0))}
                </td>
              </tr>
              {yearRows.map(({ year, total, byDeal }) => (
                <tr key={year} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-gray-700">Y{year}</td>
                  {byDeal.map((v, i) => (
                    <td key={deals[i].id} className={`px-3 py-2 text-right tabular-nums ${v === 0 ? "text-gray-300" : v < 0 ? "text-red-600" : "text-gray-600"}`}>
                      {v !== 0 ? fmtM(v) : "—"}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${total < 0 ? "text-red-700" : "text-gray-900"}`}>
                    {fmtM(total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FundAnalysis({ savedDeals, currentDeal, onSave, onRemove }) {
  const groups = groupByFund(savedDeals);
  const fundNames = Object.keys(groups);
  const currentFund = currentDeal.inputs.fundName?.trim() || "(No Fund)";
  const alreadySaved = false; // deals are snapshots; user explicitly saves

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Fund Analysis</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Save the current deal to a fund to track cumulative returns across assets.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add to Fund
          {currentDeal.inputs.fundName?.trim() && (
            <span className="ml-1 text-blue-200">· {currentDeal.inputs.fundName}</span>
          )}
        </button>
      </div>

      {savedDeals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h12A2.25 2.25 0 0020.25 14.25V3M3.75 3h16.5M3.75 3l-.75 3h18l-.75-3" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">No deals saved yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Set a Fund name in Deal Inputs, then click <span className="font-medium">Add to Fund</span> to snapshot this deal.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {fundNames.map((name) => (
            <div key={name} className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-5">
              <FundGroup fundName={name} deals={groups[name]} onRemove={onRemove} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
