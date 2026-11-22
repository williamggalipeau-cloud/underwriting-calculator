"use client";

import { useMemo, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { assetSummary, assetSummaryXlsx } from "@/lib/assetSummary";
import { quarterLabel } from "@/lib/valuations";

const fmt = (v, d = 0) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtM = (v) => {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${fmt(a)}`;
  return v < 0 ? `(${s})` : s;
};
const fmtPct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const fmtX = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}x`);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

const STATUS = {
  Owned: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Pipeline: "bg-blue-50 text-blue-700 border-blue-200",
  Sold: "bg-gray-100 text-gray-600 border-gray-200",
};
const FUNDING = {
  "Capital call": "text-gray-700",
  "Sub line": "text-gray-700",
  "Call + line": "text-gray-700",
  "Not tagged": "text-amber-700",
  "—": "text-gray-400",
};

// [key, header, render(row), sortValue(row), group]
const COLUMNS = [
  ["status", "Status", (r) => <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS[r.status]}`}>{r.status}</span>, (r) => r.status, "Asset"],
  ["acq", "Acquired", (r) => fmtDate(r.acq), (r) => r.acq, "Asset"],
  ["exit", "Exit", (r) => fmtDate(r.exit), (r) => r.exit, "Asset"],
  ["sf", "SF", (r) => fmt(r.sf), (r) => r.sf, "Asset"],
  ["price", "Price", (r) => fmtM(r.price), (r) => r.price, "Capital"],
  ["pricePSF", "$/SF", (r) => `$${fmt(r.pricePSF)}`, (r) => r.pricePSF, "Capital"],
  ["loan", "Loan", (r) => fmtM(r.loan), (r) => r.loan, "Capital"],
  ["ltv", "Loan / price", (r) => fmtPct(r.ltv, 0), (r) => r.ltv, "Capital"],
  ["equity", "Equity", (r) => fmtM(r.equity), (r) => r.equity, "Capital"],
  ["funding", "Funding", (r) => <span className={FUNDING[r.funding.label] ?? ""}>{r.funding.label}</span>, (r) => r.funding.label, "Capital"],
  ["noi1", "Yr-1 NOI", (r) => fmtM(r.noi1), (r) => r.noi1, "Underwriting"],
  ["goingInCap", "Going-in cap", (r) => fmtPct(r.goingInCap, 2), (r) => r.goingInCap, "Underwriting"],
  ["exitCap", "Exit cap", (r) => fmtPct(r.exitCap, 2), (r) => r.exitCap, "Underwriting"],
  ["exitValue", "Exit value", (r) => fmtM(r.exitValue), (r) => r.exitValue, "Underwriting"],
  ["irr", "IRR", (r) => fmtPct(r.irr), (r) => r.irr, "Underwriting"],
  ["em", "Multiple", (r) => fmtX(r.em), (r) => r.em, "Underwriting"],
  ["coc1", "Yr-1 CoC", (r) => fmtPct(r.coc1), (r) => r.coc1, "Underwriting"],
  ["dscr1", "Yr-1 DSCR", (r) => (isFinite(r.dscr1) ? `${r.dscr1.toFixed(2)}x` : "—"), (r) => r.dscr1, "Underwriting"],
  ["fv", "Fair value", (r) => (r.valuation ? fmtM(r.valuation.value) : "—"), (r) => r.valuation?.value ?? -Infinity, "Valuation"],
  ["nav", "NAV", (r) => (r.valuation ? fmtM(r.valuation.nav) : "—"), (r) => r.valuation?.nav ?? -Infinity, "Valuation"],
  [
    "unrealized",
    "Unrealized",
    (r) =>
      r.valuation ? (
        <span className={r.valuation.unrealized > 0 ? "text-emerald-700" : r.valuation.unrealized < 0 ? "text-red-600" : ""}>{fmtM(r.valuation.unrealized)}</span>
      ) : (
        "—"
      ),
    (r) => r.valuation?.unrealized ?? -Infinity,
    "Valuation",
  ],
  ["tvpi", "TVPI", (r) => (r.valuation ? fmtX(r.valuation.tvpi) : "—"), (r) => r.valuation?.tvpi ?? -Infinity, "Valuation"],
];

const GROUPS = [
  ["Asset", "bg-gray-50"],
  ["Capital", "bg-slate-50"],
  ["Underwriting", "bg-gray-50"],
  ["Valuation", "bg-slate-50"],
];

const BASIS_LABEL = { appraisal: "Appraisal", internal: "Internal", rollforward: "Roll-forward", cost: "Cost" };
const TYPE_LABEL = { call: "Capital call", draw: "Sub line draw", repay: "Sub line repayment" };

function Fact({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-1">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900 tabular-nums">
        {value}
        {sub && <span className="ml-1 font-normal text-gray-400">{sub}</span>}
      </span>
    </div>
  );
}

// Everything about one asset: terms, year-by-year cash flow, returns,
// valuation history and tagged capital activity.
function AssetDetail({ row, onOpenDeal, onClose }) {
  const { inputs: inp, cashFlows: cfs, debt, returns, closingCosts, sellingCosts, irrFlows, valuationRows, activity } = row.detail;
  const hold = cfs.length;
  const direct = !!inp.noiOverrideEnabled;
  const capex = inp.capexBudget ?? 0;
  const capPremium = debt.capPremium ?? 0;
  const totalCost = row.price + closingCosts + capex + capPremium;
  const spread = inp.spreadPct ?? 0;
  const sofrStrike = inp.capStrikeRatePct > 0 ? inp.capStrikeRatePct - spread : null;
  const am = (inp.amFeeItems ?? []).find((x) => x.basis === "pctEquity");
  const finalBalance = cfs[hold - 1]?.loanBalance ?? 0;
  const cumulative = irrFlows.reduce((acc, f) => [...acc, (acc.at(-1) ?? 0) + f], []);
  const peakEquity = -Math.min(...cumulative);
  const profit = irrFlows.reduce((s, f) => s + f, 0);
  const any = (k) => cfs.some((c) => Math.abs(c[k] ?? 0) > 0.5);

  const neg = (v) => (v ? -v : 0);
  const lines = [
    direct && ["NOI before property mgmt", cfs.map((c) => c.noi + (c.managementFee ?? 0))],
    direct && ["Property management", cfs.map((c) => neg(c.managementFee))],
    !direct && ["Effective gross revenue", cfs.map((c) => c.effectiveGrossRevenue)],
    !direct && ["Operating expenses", cfs.map((c) => neg(c.operatingExpenses))],
    ["NOI", cfs.map((c) => c.noi), "bold"],
    any("tiAndLeasing") && ["TI & leasing", cfs.map((c) => neg((c.tiAndLeasing ?? 0) - (c.tiDrawApproved ?? 0)))],
    ["Debt service", cfs.map((c) => neg(c.debtService))],
    any("belowLineAMFees") && ["Asset management fee", cfs.map((c) => neg(c.belowLineAMFees))],
    any("constructionMgmtFee") && ["Construction management", cfs.map((c) => neg(c.constructionMgmtFee))],
    any("capReplacement") && ["Replacement rate caps", cfs.map((c) => neg(c.capReplacement))],
    any("extensionFee") && ["Extension fees", cfs.map((c) => neg(c.extensionFee))],
    ["Cash flow from operations", cfs.map((c) => c.pretaxCashFlow), "bold"],
    ["Sale price", cfs.map((_, i) => (i === hold - 1 ? returns.exitValue : 0))],
    ["Sale costs", cfs.map((_, i) => (i === hold - 1 ? -returns.sellingCosts : 0))],
    ["Loan payoff", cfs.map((_, i) => (i === hold - 1 ? -finalBalance : 0))],
  ].filter(Boolean);
  const netCF = irrFlows; // year 0 … hold
  const ratios = [
    ["Interest rate", cfs.map((c) => fmtPct(c.interestRate, 2))],
    ["DSCR", cfs.map((c) => (c.debtService > 0 ? `${(c.noi / c.debtService).toFixed(2)}x` : "—"))],
    ["Debt yield", cfs.map((c) => (c.loanBalance > 0 ? fmtPct((c.noi / c.loanBalance) * 100) : "—"))],
    ["Cash-on-cash", cfs.map((c) => fmtPct((c.pretaxCashFlow / debt.equityRequired) * 100))],
    ["Loan balance (end of year)", cfs.map((c) => fmtM(c.loanBalance))],
  ];
  const cell = (v) => (Math.abs(v) < 0.5 ? <span className="text-gray-300">—</span> : <span className={v < 0 ? "text-red-600" : ""}>{fmtM(v)}</span>);

  return (
    <div id="asset-detail" className="rounded-xl border border-blue-200 bg-white p-4 space-y-4 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-gray-900">{row.name}</h3>
          <p className="text-xs text-gray-500">
            {row.status} · acquired {fmtDate(row.acq)} · {hold}-year hold to {fmtDate(row.exit)} · {fmt(row.sf)} SF
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {row.live && onOpenDeal && (
            <button type="button" onClick={() => onOpenDeal(row.id)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100">
              Open in Quick Underwrite
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>

      {/* Terms */}
      <div className="grid gap-x-6 gap-y-3 text-xs md:grid-cols-2 xl:grid-cols-4">
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Acquisition</h4>
          <Fact label="Purchase price" value={fmtM(row.price)} sub={`$${fmt(row.pricePSF)}/SF`} />
          <Fact label="Closing costs" value={fmtM(closingCosts)} />
          <Fact label="Capex budget" value={fmtM(capex)} sub={capex ? (inp.capexLenderFunded ? "lender-funded" : "equity-funded") : ""} />
          <Fact label="Rate cap premium" value={fmtM(capPremium)} />
          <Fact label="Total cost" value={fmtM(totalCost)} />
          <Fact label="Year-1 NOI" value={fmtM(row.noi1)} sub={`${fmtPct(row.goingInCap, 2)} cap`} />
          {direct && <Fact label="NOI growth" value={fmtPct(inp.noiGrowthPct)} sub="per year" />}
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Debt</h4>
          <Fact label="Loan" value={fmtM(debt.loanAmount)} sub={`${fmtPct(row.ltv, 0)} of price`} />
          <Fact label="Rate" value={inp.floatingRate ? `SOFR + ${fmtPct(spread, 2)}` : fmtPct(inp.interestRatePct, 2)} sub={`yr 1 ${fmtPct(debt.effectiveRate, 2)}`} />
          <Fact label="Payments" value={(inp.ioPeriodYears ?? 0) >= hold ? "Interest-only" : `${inp.ioPeriodYears ?? 0} yrs IO, ${inp.amortizationYears}-yr amort.`} />
          <Fact label="Term" value={`${inp.loanTermYears ?? "—"} yrs`} sub={inp.extensionCount ? `+ ${inp.extensionCount} × ${inp.extensionTermYears ?? 1} yr ext.` : ""} />
          <Fact label="Extension fee" value={inp.extensionFeeAmount ? fmtM(inp.extensionFeeAmount) : inp.extensionFeePct ? fmtPct(inp.extensionFeePct, 2) : "—"} />
          <Fact label="Rate cap strike" value={sofrStrike != null ? `${fmtPct(sofrStrike, 2)} SOFR` : "—"} sub={inp.capTermYears ? `${inp.capTermYears}-yr caps` : ""} />
          <Fact label="Year-1 DSCR" value={isFinite(row.dscr1) ? `${row.dscr1.toFixed(2)}x` : "—"} sub={`debt yield ${fmtPct(debt.debtYield)}`} />
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Fees & exit</h4>
          <Fact label="Asset management" value={am ? `${fmtPct(am.value)} of equity` : "—"} />
          <Fact label="Property management" value={inp.pmFeePct ? `${fmtPct(inp.pmFeePct)} of ${inp.pmFeeBasis === "value" ? "value" : "NOI"}` : `${fmtPct(inp.managementFeePct)} of EGR`} />
          <Fact label="Construction management" value={inp.cmFeePct ? `${fmtPct(inp.cmFeePct)} of price / yr` : "—"} />
          <Fact label="Exit cap" value={fmtPct(row.exitCap, 2)} sub={`on yr-${hold} NOI ${fmtM(row.exitNOI)}`} />
          <Fact label="Exit value" value={fmtM(returns.exitValue)} sub={`$${fmt(row.exitPSF)}/SF`} />
          <Fact label="Sale costs" value={fmtM(sellingCosts)} sub={fmtPct(returns.sellingCostsPct)} />
          <Fact label="Net sale proceeds" value={fmtM(returns.equityReversion)} sub="after loan payoff" />
        </div>
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Returns (underwritten)</h4>
          <Fact label="Equity" value={fmtM(debt.equityRequired)} />
          <Fact label="Peak equity" value={fmtM(peakEquity)} />
          <Fact label="Profit" value={fmtM(profit)} />
          <Fact label="IRR" value={fmtPct(row.irr)} />
          <Fact label="Equity multiple" value={fmtX(row.em)} />
          <Fact label="Cash-on-cash" value={fmtPct(row.coc1)} sub={`yr 1 · avg ${fmtPct(returns.averageCashOnCash)}`} />
          <Fact label="Funding" value={row.funding.label} sub={row.funding.call || row.funding.draw ? `${fmtM(row.funding.call + row.funding.draw)} tagged` : ""} />
        </div>
      </div>

      {/* Cash flow by year */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-2.5 py-1.5 text-left font-medium">Cash flow</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Year 0</th>
              {cfs.map((c) => (
                <th key={c.year} className="px-2.5 py-1.5 text-right font-medium">Year {c.year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, vals, style]) => (
              <tr key={label} className={`border-t border-gray-100 ${style === "bold" ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                <td className="px-2.5 py-1 text-left whitespace-nowrap">{label}</td>
                <td className="px-2.5 py-1 text-right"></td>
                {vals.map((v, i) => <td key={i} className="px-2.5 py-1 text-right">{cell(v)}</td>)}
              </tr>
            ))}
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
              <td className="px-2.5 py-1.5 text-left whitespace-nowrap">Net cash flow to equity</td>
              {netCF.map((v, i) => <td key={i} className="px-2.5 py-1.5 text-right">{cell(v)}</td>)}
            </tr>
            {ratios.map(([label, vals]) => (
              <tr key={label} className="border-t border-gray-100 text-gray-500">
                <td className="px-2.5 py-1 text-left whitespace-nowrap">{label}</td>
                <td className="px-2.5 py-1 text-right"></td>
                {vals.map((v, i) => <td key={i} className="px-2.5 py-1 text-right">{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Valuation history */}
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Valuation history</h4>
          {valuationRows.length ? (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-gray-500">
                <tr className="border-b border-gray-200">
                  {["Quarter", "Fair value", "Basis", "Unrealized", "NAV", "TVPI"].map((h, i) => (
                    <th key={h} className={`px-2 py-1 font-medium ${i === 0 || i === 2 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...valuationRows].reverse().map((v) => (
                  <tr key={v.quarterEnd} className="border-b border-gray-100">
                    <td className="px-2 py-1 text-left">{quarterLabel(v.quarterEnd)}</td>
                    <td className="px-2 py-1 text-right font-medium">{fmtM(v.value)}</td>
                    <td className={`px-2 py-1 text-left ${v.overdue ? "text-red-600" : "text-gray-500"}`}>{v.overdue ? "Appraisal overdue" : BASIS_LABEL[v.basis]}</td>
                    <td className={`px-2 py-1 text-right ${v.unrealized > 0 ? "text-emerald-700" : v.unrealized < 0 ? "text-red-600" : ""}`}>{fmtM(v.unrealized)}</td>
                    <td className="px-2 py-1 text-right">{fmtM(v.nav)}</td>
                    <td className="px-2 py-1 text-right">{fmtX(v.tvpi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400">No completed quarter since acquisition yet. Marks are entered on the Valuations tab.</p>
          )}
        </div>
        {/* Capital activity */}
        <div>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Capital activity tagged to this asset</h4>
          {activity.length ? (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-gray-500">
                <tr className="border-b border-gray-200">
                  {["Date", "Type", "Amount", "Notes"].map((h, i) => (
                    <th key={h} className={`px-2 py-1 font-medium ${i === 2 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activity.map((x) => (
                  <tr key={x.id} className="border-b border-gray-100">
                    <td className="px-2 py-1">{fmtDate(x.date)}</td>
                    <td className="px-2 py-1">{TYPE_LABEL[x.type] ?? x.type}</td>
                    <td className="px-2 py-1 text-right">{fmtM(Number(x.amount))}</td>
                    <td className="px-2 py-1 text-gray-500">{x.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400">None. Tag the call or line draw that funded this asset under Portfolio Return → Capital activity.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AssetSummary({ deals, funds = {}, marks = {}, curve, onOpenDeal }) {
  const fundNames = useMemo(() => [...new Set(deals.map((d) => d.inputs.fundName?.trim()).filter(Boolean))], [deals]);
  const [fundPick, setFundPick] = useState(null);
  const fundName = fundNames.includes(fundPick) ? fundPick : fundNames[0];
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fundName), [deals, fundName]);
  const terms = useMemo(() => ({ ...DEFAULT_FUND_TERMS, ...(funds[fundName] ?? {}), name: fundName }), [funds, fundName]);
  const todayISO = new Date().toISOString().slice(0, 10);
  const summary = useMemo(
    () => (fundName ? assetSummary(fundDeals, terms, { todayISO, marks, curve }) : null),
    [fundName, fundDeals, terms, todayISO, marks, curve]
  );
  const [sort, setSort] = useState({ key: "acq", dir: 1 });
  const [detailId, setDetailId] = useState(null);
  const showDetail = (id) => {
    setDetailId((cur) => (cur === id ? null : id));
    setTimeout(() => document.getElementById("asset-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  if (!summary) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-600">No fund assets yet.</p>
        <p className="mt-1 text-xs text-gray-400">Put deals in a fund (Fund field, or Load Model Fund I) to see them here.</p>
      </div>
    );
  }

  const col = COLUMNS.find((c) => c[0] === sort.key);
  const rows = [...summary.rows].sort((a, b) => {
    if (sort.key === "name") return a.name.localeCompare(b.name) * sort.dir;
    const va = col[3](a), vb = col[3](b);
    if (va == null || (typeof va === "number" && !isFinite(va))) return 1;
    if (vb == null || (typeof vb === "number" && !isFinite(vb))) return -1;
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
  });
  const t = summary.totals;
  const clickSort = (key) => setSort((p) => ({ key, dir: p.key === key ? -p.dir : key === "name" || key === "acq" || key === "exit" ? 1 : -1 }));
  const arrow = (key) => (sort.key === key ? (sort.dir > 0 ? " ↑" : " ↓") : "");
  const groupSpans = GROUPS.map(([g, bg]) => [g, bg, COLUMNS.filter((c) => c[4] === g).length]);

  const totalCells = {
    status: <span className="text-[10px] text-gray-500">{t.owned} owned · {t.pipeline} pipeline{t.sold ? ` · ${t.sold} sold` : ""}</span>,
    acq: "", exit: "",
    sf: fmt(t.sf), price: fmtM(t.price), pricePSF: `$${fmt(t.pricePSF)}`, loan: fmtM(t.loan), ltv: fmtPct(t.ltv, 0), equity: fmtM(t.equity), funding: "",
    noi1: fmtM(t.noi1), goingInCap: fmtPct(t.goingInCap, 2), exitCap: fmtPct(t.exitCap, 2), exitValue: fmtM(t.exitValue),
    irr: fmtPct(t.irr), em: fmtX(t.em), coc1: "", dscr1: "",
    fv: t.valuation ? fmtM(t.valuation.value) : "—", nav: t.valuation ? fmtM(t.valuation.nav) : "—",
    unrealized: t.valuation ? fmtM(t.valuation.unrealized) : "—", tvpi: t.valuation ? fmtX(t.valuation.tvpi) : "—",
  };

  return (
    <div className="space-y-4 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Asset Summary</h2>
          <p className="text-xs text-gray-500">
            Every asset in {fundName}: status, capital, underwriting and latest valuation
            {summary.lastQ ? ` (${quarterLabel(summary.lastQ)})` : ""}. Click a column to sort, Details for an asset&apos;s full breakdown, or a name to open the deal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fundNames.length > 1 && (
            <select value={fundName} onChange={(e) => setFundPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">
              {fundNames.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
            </select>
          )}
          <button
            type="button"
            onClick={async () => downloadBlob(await assetSummaryXlsx(summary, fundName), `${safeFileName(fundName)}-asset-summary.xlsx`)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
          >
            Export to Excel
          </button>
        </div>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Assets", `${t.count}`, `${t.owned} owned · ${t.pipeline} pipeline${t.sold ? ` · ${t.sold} sold` : ""}`],
          ["Square feet", fmt(t.sf), `${fmtM(t.price)} at $${fmt(t.pricePSF)}/SF`],
          ["Equity", fmtM(t.equity), `${fmtM(t.loan)} debt · ${fmtPct(t.ltv, 0)} of price`],
          ["Going-in cap", fmtPct(t.goingInCap, 2), `${fmtM(t.noi1)} year-1 NOI`],
          ["Underwritten", `${fmtPct(t.irr)} · ${fmtX(t.em)}`, "Pooled IRR · multiple (gross)"],
          ["Latest NAV", t.valuation ? fmtM(t.valuation.nav) : "—", t.valuation ? `${fmtM(t.valuation.value)} fair value · TVPI ${fmtX(t.valuation.tvpi)}` : "No completed quarter yet"],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] text-gray-500">{label}</p>
            <p className="text-base font-bold tabular-nums text-gray-900">{value}</p>
            <p className="text-[10px] text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs tabular-nums text-gray-900">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-400">
              <th className="sticky left-0 z-10 bg-white px-2.5 pt-2 text-left font-medium"></th>
              {groupSpans.map(([g, bg, span]) => (
                <th key={g} colSpan={span} className={`${bg} border-l border-gray-200 px-2.5 pt-2 text-center font-medium`}>{g}</th>
              ))}
            </tr>
            <tr className="text-gray-500">
              <th onClick={() => clickSort("name")} className="sticky left-0 z-10 cursor-pointer bg-white px-2.5 py-2 text-left font-medium whitespace-nowrap hover:text-gray-800">
                Asset{arrow("name")}
              </th>
              {COLUMNS.map(([key, label, , , g], i) => (
                <th
                  key={key}
                  onClick={() => clickSort(key)}
                  className={`${GROUPS.find((x) => x[0] === g)[1]} cursor-pointer px-2.5 py-2 text-right font-medium whitespace-nowrap hover:text-gray-800 ${i > 0 && COLUMNS[i - 1][4] !== g ? "border-l border-gray-200" : ""}`}
                >
                  {label}{arrow(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-2.5 py-2 text-left whitespace-nowrap">
                  {r.live && onOpenDeal ? (
                    <button type="button" onClick={() => onOpenDeal(r.id)} className="font-medium text-blue-700 hover:underline" title="Open this deal">
                      {r.name}
                    </button>
                  ) : (
                    <span className="font-medium text-gray-800" title="Saved snapshot">{r.name}</span>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                    <button
                      type="button"
                      onClick={() => showDetail(r.id)}
                      className={`rounded border px-1.5 py-px font-medium ${detailId === r.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-700"}`}
                    >
                      {detailId === r.id ? "Hide details" : "Details"}
                    </button>
                    {r.holdYears}-yr hold{r.valuation?.overdue ? " · appraisal overdue" : ""}
                  </div>
                </td>
                {COLUMNS.map(([key, , render, , g], i) => (
                  <td key={key} className={`px-2.5 py-2 text-right whitespace-nowrap ${i > 0 && COLUMNS[i - 1][4] !== g ? "border-l border-gray-100" : ""}`}>
                    {render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-gray-900">
              <td className="sticky left-0 z-10 bg-gray-50 px-2.5 py-2 text-left whitespace-nowrap">Fund total</td>
              {COLUMNS.map(([key, , , , g], i) => (
                <td key={key} className={`px-2.5 py-2 text-right whitespace-nowrap ${i > 0 && COLUMNS[i - 1][4] !== g ? "border-l border-gray-200" : ""}`}>
                  {totalCells[key]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {detailId && summary.rows.some((r) => r.id === detailId) && (
        <AssetDetail row={summary.rows.find((r) => r.id === detailId)} onOpenDeal={onOpenDeal} onClose={() => setDetailId(null)} />
      )}

      <p className="text-[11px] leading-relaxed text-gray-400">
        <span className="font-medium text-gray-500">How totals work:</span>{" "}dollar figures and SF are summed. $/SF, loan / price (the loan includes lender-funded capex) and the going-in and
        exit caps are weighted (total ÷ total). IRR is pooled across every asset&apos;s dated equity cash flows; the multiple is total
        distributions ÷ total equity. Underwriting figures are each asset&apos;s current model (gross, before fund fees and promote). Fair
        value, NAV and TVPI are from the Valuations tab as of the last completed quarter. Funding comes from the fund&apos;s capital activity
        tags (Portfolio Return).
      </p>
    </div>
  );
}
