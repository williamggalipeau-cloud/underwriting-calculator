"use client";

// Phase W: GP Economics (Portfolio Management, after Portfolio Return). What the
// firm makes: fee revenue (the fund management fee as the asset management
// fee, plus property and construction management fees), promote (never in
// fee revenue) and GP co-invest, firm-wide, by fund and by asset. Internal.
import { useMemo, useState } from "react";
import FundTypeBadge from "@/components/FundTypeBadge";
import { FUND_TYPES, filterFundsByType } from "@/lib/fundTypes";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import { firmGpEconomics, fundGpEconomics, gpEconomicsXlsx, ryBasisLabel } from "@/lib/gpEconomics";
import { writeXlsx } from "@/lib/xlsx";

const fmtM = (v) => (v == null || !isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toFixed(2)}M`);
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";

// Committed capital, with * when no commitments are entered (total equity used).
const fmtC = (ry) => (ry ? `${fmtM(ry.committed)}${ry.fromCommitments === false || ry.anyFallback ? "*" : ""}` : "—");
function Card({ label, value, sub, testId, accent = false }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ? "border-blue-300 bg-blue-50/60" : "border-gray-200 bg-white"}`} data-testid={testId}>
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
  const [view, setView] = useState("consolidated");
  const [typeFilter, setTypeFilter] = useState("");
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
  const firm = useMemo(() => firmGpEconomics(perFund), [perFund]);
  const t = firm.totals;
  const title = scopeName || (typeFilter ? `${typeFilter} portfolios` : "All portfolios");

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
          <p className="text-xs text-gray-500">What the firm makes: fee income, and capital gains (promote and GP co-invest profit), projected over each portfolio&apos;s life (funds, joint ventures and separate accounts) (actual capital activity where entered). Internal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Fund type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5"><option value="">All portfolio types</option>{FUND_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(gpEconomicsXlsx(title, firm), { sheetName: "GP economics", title: `Baywise · ${title} GP economics (internal)` }), `gp-economics-${todayISO}.xlsx`)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>
          <button type="button" onClick={exportPdf} className={`${btn} border-gray-300 bg-white text-gray-700`}>PDF</button>
        </div>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Internal: not for distribution. Fee income (fees for services) is kept apart from capital gains (promote and co-invest profit), which count only when realized, mostly on sale.</p>

      <h3 className="text-sm font-bold text-gray-900" data-testid="gp-totals-label">Consolidated <span className="font-normal text-gray-500">· {title}{perFund.length ? ` (${perFund.length} portfolio${perFund.length === 1 ? "" : "s"})` : ""}</span></h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="gp-totals">
        <Card testId="gp-fees" label="Fee income (life of portfolios)" value={fmtM(t.fees)} sub={`${pct(t.feesShare, 0)} of total GP economics`} />
        <Card testId="gp-promote" label="Promote · capital gain" value={fmtM(t.promote)} sub={`${pct(t.promoteShare, 0)} of total · ${fmtM(t.promoteRealized)} realized`} />
        <Card testId="gp-coinvest" label="Co-invest profit · capital gain" value={fmtM(t.coinvest)} sub={`${pct(t.coinvestShare, 0)} of total · on ${fmtM(t.gpEquity)} GP equity, on sale`} />
        <Card testId="gp-total" label="Total GP economics" value={fmtM(t.total)} sub={`Fee income ${fmtM(t.fees)} + capital gains ${fmtM(t.capitalGains)} · ${perFund.length} portfolio${perFund.length === 1 ? "" : "s"} · ${firm.assets.length} assets`} />
        <Card testId="gp-revenue-yield" accent label="Revenue Yield" value={pct(t.revenueYield?.pct, 2)}
          sub={<>{pct(t.revenueYield?.perYearPct, 2)} a year{t.revenueYield?.lifeYears ? ` over ${t.revenueYield.lifeYears.toFixed(1)} years` : ""} · {fmtM(t.fees)} fees ÷ {fmtC(t.revenueYield)} committed<br /><b>To date:</b> {pct(t.revenueYield?.toDatePct, 2)} ({fmtM(t.revenueYield?.feesToDate)} earned)</>} />
      </div>
      {t.total > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" aria-label="Share of total GP economics" data-testid="gp-share-bar">
          <div className="bg-blue-500" style={{ width: `${Math.max(0, t.feesShare ?? 0)}%` }} title={`Fees ${pct(t.feesShare)}`} />
          <div className="bg-violet-500" style={{ width: `${Math.max(0, t.promoteShare ?? 0)}%` }} title={`Promote ${pct(t.promoteShare)}`} />
          <div className="bg-emerald-500" style={{ width: `${Math.max(0, t.coinvestShare ?? 0)}%` }} title={`Co-invest ${pct(t.coinvestShare)}`} />
        </div>
      )}
      <p className="text-[11px] text-gray-500"><span className="text-blue-600">■</span> Fee income <span className="text-violet-600">■</span> Promote (capital gain) <span className="text-emerald-600">■</span> Co-invest profit (capital gain)</p>

      <div role="tablist" aria-label="GP economics view" className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">{tab("consolidated", "Consolidated")}{tab("firm", "By year")}{tab("fund", "By portfolio")}{tab("asset", "By asset")}</div>

      {view === "consolidated" && (
        <div className="space-y-3" data-testid="gp-consolidated">
          <T testId="gp-by-type" right={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]} head={["Portfolio type", "Portfolios", "Assets", "Fee income", "of which acq. / disp. fees", "Promote / incentive fee", "Co-invest profit", "Capital gains", "Total GP economics", "Share", "Committed capital", "Revenue Yield", "Per year", "To date"]}
            rows={firm.byType.map((b) => [<span key="n" className="flex items-center gap-1.5"><FundTypeBadge type={b.type} /></span>, b.portfolios, b.assets, fmtM(b.fees), fmtM(b.txFees), fmtM(b.promote), fmtM(b.coinvest), fmtM(b.capitalGains), fmtM(b.total), pct(b.share, 0), fmtC(b.revenueYield), pct(b.revenueYield?.pct, 2), pct(b.revenueYield?.perYearPct, 2), pct(b.revenueYield?.toDatePct, 2)])}
            foot={["All portfolios", perFund.length, firm.assets.length, fmtM(t.fees), fmtM((t.acqFee ?? 0) + (t.dispFee ?? 0)), fmtM(t.promote), fmtM(t.coinvest), fmtM(t.capitalGains), fmtM(t.total), "100%", fmtC(t.revenueYield), pct(t.revenueYield?.pct, 2), pct(t.revenueYield?.perYearPct, 2), pct(t.revenueYield?.toDatePct, 2)]} />
          <p className="text-[11px] text-gray-500" data-testid="gp-ry-note">Revenue Yield = GP fees (asset management, property management, construction management, acquisition and disposition fees; never promote or co-invest profit) over the portfolio&apos;s life ÷ committed capital. <b>Per year</b> divides by the life in years (first acquisition to last projected sale). <b>To date</b> uses fees earned through today. Combined rows: total fees ÷ total committed. Each portfolio measures against LP + GP or LP-only commitments as its LPA, JVA or SMA says (or as set on its terms; LP + GP by default).{t.revenueYield?.anyFallback ? " *No commitments entered: total equity is used instead." : ""}</p>
          {firm.yearsByType.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-3" data-testid="gp-type-years">
              <p className="mb-2 text-xs font-semibold text-gray-700">Fee income by year and portfolio type</p>
              <div className="flex h-36 items-end gap-1">
                {(() => { const max = Math.max(1, ...firm.yearsByType.map((y) => firm.byType.reduce((a, b) => a + Math.max(0, y[b.type] ?? 0), 0))); const col = { Fund: "bg-blue-500", "Joint Venture": "bg-violet-500", "Separate Account": "bg-amber-500" }; return firm.yearsByType.map((y) => (
                  <div key={y.year} className="flex flex-1 flex-col items-center gap-1" title={firm.byType.map((b) => `${b.type}: ${fmtM(y[b.type])}`).join(" · ")}>
                    <div className="flex w-full flex-col-reverse overflow-hidden rounded-sm" style={{ height: "7.5rem" }}>
                      {firm.byType.map((b) => <div key={b.type} className={col[b.type]} style={{ height: `${(Math.max(0, y[b.type] ?? 0) / max) * 100}%` }} />)}
                    </div>
                    <span className="text-[9px] text-gray-500">{String(y.year).slice(2)}</span>
                  </div>
                )); })()}
              </div>
              <p className="mt-1 text-[11px] text-gray-500"><span className="text-blue-600">■</span> Funds <span className="text-violet-600">■</span> Joint ventures <span className="text-amber-600">■</span> Separate accounts</p>
            </div>
          )}
          <p className="text-[11px] text-gray-500">Each portfolio uses its own terms (Edit fund, or read in from its LPA, JVA or SMA): asset management fee and basis, acquisition and disposition fees, and the promote, or for a separate account the incentive fee above its hurdle. A portfolio with one asset counts like any other.</p>
        </div>
      )}
      {view === "firm" && (
        <>
        <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="gp-years">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-gray-500"><th className="px-2 py-1" /><th colSpan={5} className="border-b border-blue-200 bg-blue-50 px-2 py-1 text-center text-blue-800">Fee income</th><th colSpan={3} className="border-b border-violet-200 bg-violet-50 px-2 py-1 text-center text-violet-800">Capital gains (on sale)</th><th className="px-2 py-1" /></tr>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">{["Year", "Asset management", "Property management", "Construction management", "Acq. / disp. fees", "Fee income", "Promote", "Co-invest profit", "Capital gains", "Total GP economics"].map((h, i) => <th key={h} className={`px-2 py-1.5 font-medium ${i ? "text-right" : ""} ${i === 5 ? "bg-blue-50 text-blue-800" : i === 8 ? "bg-violet-50 text-violet-800" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {firm.years.map((y) => (
                <tr key={y.year} className="border-b border-gray-100">
                  {[y.year, fmtM(y.mgmtFee), fmtM(y.pm), fmtM(y.cm), fmtM((y.acqFee ?? 0) + (y.dispFee ?? 0)), fmtM(y.fees), y.promote ? fmtM(y.promote) : "—", y.coinvest ? fmtM(y.coinvest) : "—", y.capitalGains ? fmtM(y.capitalGains) : "—", fmtM(y.total)].map((v, i) => <td key={i} className={`px-2 py-1 ${i ? "text-right" : ""} ${i === 5 ? "bg-blue-50/50 font-semibold" : i === 8 ? "bg-violet-50/50 font-semibold" : ""}`}>{v}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                {["Life of portfolios", fmtM(t.mgmtFee), fmtM(t.pm), fmtM(t.cm), fmtM((t.acqFee ?? 0) + (t.dispFee ?? 0)), fmtM(t.fees), fmtM(t.promote), fmtM(t.coinvest), fmtM(t.capitalGains), fmtM(t.total)].map((v, i) => <td key={i} className={`px-2 py-1.5 ${i ? "text-right" : ""}`}>{v}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-gray-500" data-testid="gp-years-note">Fee income is earned for services each year. Capital gains are not income: promote (or an SMA&apos;s incentive fee) and co-invest profit, the GP&apos;s return on its own investment, count in the year each asset is sold (the portfolio&apos;s totals allocated by each asset&apos;s share of gross profit, as in By asset).</p>
        </>
      )}
      {view === "fund" && (
        <>
        <T testId="gp-funds" right={[1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]} head={["Portfolio", "Fee income", "Promote / incentive", "Realized", "GP equity", "GP distributions", "Co-invest profit", "GP ROE", "GP IRR / multiple", "Committed capital", "Basis", "Revenue Yield", "Per year", "To date"]}
          rows={perFund.map((f) => [<span key="n" className="flex items-center gap-1.5">{f.fund}<FundTypeBadge type={f.type} />{f.counterparty ? <span className="text-[10px] text-gray-400">{f.counterparty}</span> : null}</span>, fmtM(f.fees.total), fmtM(f.promote.total), fmtM(f.promote.realized), fmtM(f.coinvest.equity), fmtM(f.coinvest.distributions), fmtM(f.coinvest.profit), pct(f.coinvest.roe, 0), `${pct(f.coinvest.irr)} / ${f.coinvest.multiple != null ? `${f.coinvest.multiple.toFixed(2)}x` : "—"}`, fmtC(f.revenueYield), <span key="b" className="whitespace-nowrap text-[11px]" data-testid="gp-ry-basis">{ryBasisLabel(f.revenueYield, f.type).replace(" · total equity, no commitments entered", "")}</span>, pct(f.revenueYield?.pct, 2), pct(f.revenueYield?.perYearPct, 2), pct(f.revenueYield?.toDatePct, 2)])} />
        {perFund.some((f) => f.revenueYield && !f.revenueYield.fromCommitments) && <p className="text-[11px] text-gray-500">*No commitments entered: total equity is used instead. Enter Total commitments on the portfolio&apos;s terms (Edit fund), or read them in from its LPA, JVA or SMA.</p>}
        </>
      )}
      {view === "asset" && (
        <>
          <T testId="gp-assets" right={[3, 4, 5, 6, 7, 8]} head={["Asset", "Fund", "Status", "Property management", "Construction management", "Fee income", "Promote (allocated)", "Co-invest profit (on sale)", "Share of gross profit"]}
            rows={firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", fmtM(a.pm), fmtM(a.cm), fmtM(a.fees), fmtM(a.promote), fmtM(a.coinvest), pct(a.promoteWeight)])} />
          <p className="text-[11px] text-gray-500">The waterfall runs on the whole fund, so an asset&apos;s promote is the fund&apos;s promote allocated by its share of gross profit. The asset management fee is the fund&apos;s management fee, not charged per asset.</p>
        </>
      )}
    </section>
  );
}
