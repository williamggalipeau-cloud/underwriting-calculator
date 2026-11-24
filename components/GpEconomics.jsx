"use client";

// Phase W: GP Economics (Portfolio Management, after Fund Return). What the
// firm makes: fee revenue (the fund management fee as the asset management
// fee, plus property and construction management fees), promote (never in
// fee revenue) and GP co-invest, firm-wide, by fund and by asset. Internal.
import { useMemo, useState } from "react";
import FundTypeBadge from "@/components/FundTypeBadge";
import { FUND_TYPES, filterFundsByType } from "@/lib/fundTypes";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import { firmGpEconomics, fundGpEconomics, gpEconomicsXlsx } from "@/lib/gpEconomics";
import { writeXlsx } from "@/lib/xlsx";

const fmtM = (v) => (v == null || !isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toFixed(2)}M`);
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";

function Card({ label, value, sub, testId }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3" data-testid={testId}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}
function T({ head, rows, right = [], testId, foot }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid={testId}>
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-gray-50 text-gray-500"><tr>{head.map((h, i) => <th key={h} className={`px-2.5 py-2 font-medium ${right.includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, k) => <tr key={k} className="border-t border-gray-100">{r.map((c, i) => <td key={i} className={`px-2.5 py-1.5 ${right.includes(i) ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
        {foot && <tfoot className="border-t-2 border-gray-200 font-semibold"><tr>{foot.map((c, i) => <td key={i} className={`px-2.5 py-1.5 ${right.includes(i) ? "text-right" : ""}`}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

export default function GpEconomics({ deals = [], funds = {}, curve, scopeName = "" }) {
  const [view, setView] = useState("firm");
  const [typeFilter, setTypeFilter] = useState("");
  const [rate, setRate] = useState(8);
  const todayISO = new Date().toISOString().slice(0, 10);
  const names = useMemo(() => [...new Set(deals.map((d) => d.inputs?.fundName?.trim()).filter(Boolean))].sort(), [deals]);
  const shown = filterFundsByType(names, funds, typeFilter);
  const perFund = useMemo(() => shown.map((n) => {
    try {
      return fundGpEconomics(n, deals.filter((d) => d.inputs?.fundName?.trim() === n), { ...DEFAULT_FUND_TERMS, ...(funds[n] ?? {}), name: n }, { todayISO, curve });
    } catch {
      return null;
    }
  }).filter(Boolean), [shown.join("|"), deals, funds, todayISO, curve]); // eslint-disable-line react-hooks/exhaustive-deps
  const firm = useMemo(() => firmGpEconomics(perFund, { todayISO, discountPct: rate }), [perFund, todayISO, rate]);
  const t = firm.totals;
  const title = scopeName || (typeFilter ? `${typeFilter} funds` : "All funds");

  async function exportPdf() {
    const { gpEconomicsPdf } = await import("@/lib/gpEconomicsPdf");
    downloadBlob(await gpEconomicsPdf(title, firm, { todayISO }), `gp-economics-${todayISO}.pdf`);
  }

  if (!names.length) return <p className="text-sm text-gray-500">Put deals in a fund to see the GP&apos;s economics here.</p>;
  const tab = (k, l) => <button type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1 text-xs font-medium ${view === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{l}</button>;

  return (
    <section className="space-y-4" data-testid="gp-economics">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">GP Economics <span className="text-sm font-normal text-gray-500">· {title}</span></h2>
          <p className="text-xs text-gray-500">What the firm makes: fee revenue, promote and GP co-invest, projected over each fund&apos;s life (actual capital activity where entered). Internal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Fund type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5"><option value="">All fund types</option>{FUND_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <label className="flex items-center gap-1">Discount rate<input aria-label="Discount rate" type="number" value={rate} onChange={(e) => setRate(e.target.value === "" ? 0 : Number(e.target.value))} className="w-14 rounded border border-gray-300 px-1.5 py-1" />%</label>
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(gpEconomicsXlsx(title, firm), { sheetName: "GP economics", title: `Baywise · ${title} GP economics (internal)` }), `gp-economics-${todayISO}.xlsx`)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>
          <button type="button" onClick={exportPdf} className={`${btn} border-gray-300 bg-white text-gray-700`}>PDF</button>
        </div>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Internal: GP income is not for distribution. Promote is kept apart from fee revenue and never counted in it.</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="gp-totals">
        <Card testId="gp-fees" label="Fee revenue (life of fund)" value={fmtM(t.fees)} sub={`${pct(t.feesShare, 0)} of GP income · PV ${fmtM(t.feesPv)} at ${t.discountPct}%`} />
        <Card testId="gp-promote" label="Promote" value={fmtM(t.promote)} sub={`${pct(t.promoteShare, 0)} of GP income · ${fmtM(t.promoteRealized)} realized`} />
        <Card testId="gp-coinvest" label="Co-invest profit" value={fmtM(t.coinvest)} sub={`${pct(t.coinvestShare, 0)} of GP income · on ${fmtM(t.gpEquity)} GP equity`} />
        <Card testId="gp-total" label="Total GP income" value={fmtM(t.total)} sub={`${perFund.length} fund${perFund.length === 1 ? "" : "s"} · ${firm.assets.length} assets`} />
      </div>
      {t.total > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" aria-label="Share of GP income" data-testid="gp-share-bar">
          <div className="bg-blue-500" style={{ width: `${Math.max(0, t.feesShare ?? 0)}%` }} title={`Fees ${pct(t.feesShare)}`} />
          <div className="bg-violet-500" style={{ width: `${Math.max(0, t.promoteShare ?? 0)}%` }} title={`Promote ${pct(t.promoteShare)}`} />
          <div className="bg-emerald-500" style={{ width: `${Math.max(0, t.coinvestShare ?? 0)}%` }} title={`Co-invest ${pct(t.coinvestShare)}`} />
        </div>
      )}
      <p className="text-[11px] text-gray-500"><span className="text-blue-600">■</span> Fee revenue <span className="text-violet-600">■</span> Promote <span className="text-emerald-600">■</span> Co-invest profit</p>

      <div role="tablist" aria-label="GP economics view" className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">{tab("firm", "By year")}{tab("fund", "By fund")}{tab("asset", "By asset")}</div>

      {view === "firm" && (
        <T testId="gp-years" right={[1, 2, 3, 4, 5, 6, 7]} head={["Year", "Asset management", "Property management", "Construction management", "Fee revenue", "Promote", "Co-invest profit", "Total GP income"]}
          rows={firm.years.map((y) => [y.year, fmtM(y.mgmtFee), fmtM(y.pm), fmtM(y.cm), fmtM(y.fees), fmtM(y.promote), fmtM(y.coinvest), fmtM(y.total)])}
          foot={["Life of fund", fmtM(t.mgmtFee), fmtM(t.pm), fmtM(t.cm), fmtM(t.fees), fmtM(t.promote), fmtM(t.coinvest), fmtM(t.total)]} />
      )}
      {view === "fund" && (
        <T testId="gp-funds" right={[1, 2, 3, 4, 5, 6, 7, 8]} head={["Fund", "Fee revenue", "Promote", "Promote realized", "GP equity", "GP distributions", "Co-invest profit", "GP ROE", "GP IRR / multiple"]}
          rows={perFund.map((f) => [<span key="n" className="flex items-center gap-1.5">{f.fund}<FundTypeBadge type={f.type} /></span>, fmtM(f.fees.total), fmtM(f.promote.total), fmtM(f.promote.realized), fmtM(f.coinvest.equity), fmtM(f.coinvest.distributions), fmtM(f.coinvest.profit), pct(f.coinvest.roe, 0), `${pct(f.coinvest.irr)} / ${f.coinvest.multiple != null ? `${f.coinvest.multiple.toFixed(2)}x` : "—"}`])} />
      )}
      {view === "asset" && (
        <>
          <T testId="gp-assets" right={[3, 4, 5, 6, 7]} head={["Asset", "Fund", "Status", "Property management", "Construction management", "Fee revenue", "Promote (allocated)", "Share of gross profit"]}
            rows={firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", fmtM(a.pm), fmtM(a.cm), fmtM(a.fees), fmtM(a.promote), pct(a.promoteWeight)])} />
          <p className="text-[11px] text-gray-500">The waterfall runs on the whole fund, so an asset&apos;s promote is the fund&apos;s promote allocated by its share of gross profit. The asset management fee is the fund&apos;s management fee, not charged per asset.</p>
        </>
      )}
    </section>
  );
}
