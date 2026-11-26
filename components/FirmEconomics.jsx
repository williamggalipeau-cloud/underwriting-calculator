"use client";

// Finance → Firm Economics (user, 11/26, 1.1.9): everything the firm earns in
// the portfolios where it is both GP and sponsor, counted once (fees, both
// sides of the promote, profit on its own capital). lib/firmEconomics.js holds
// the rules. Shown only when the firm is both GP and sponsor somewhere.
import InfoNote from "@/components/InfoNote";
import { useMemo, useState } from "react";
import FundTypeBadge from "@/components/FundTypeBadge";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import { fundGpEconomics, ryBasisLabel } from "@/lib/gpEconomics";
import { firmEconomics, firmXlsx } from "@/lib/firmEconomics";
import { writeXlsx } from "@/lib/xlsx";

const fmtM = (v) => (v == null || !isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toFixed(2)}M`);
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const mult = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}x`);
const btn = "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700";
const PAID = { sponsor: "Sponsor (this firm)", third: "Third party (not counted)" };

function Card({ label, value, sub, testId, tone = "" }) {
  const c = tone === "total" ? "border-blue-300 bg-blue-50/60" : "border-gray-200 bg-white";
  return (
    <div className={`rounded-xl border px-4 py-3 ${c}`} data-testid={testId}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone === "total" ? "text-blue-700" : "text-gray-900"}`}>{value}</p>
      {sub && <div className="mt-0.5 text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}
function T({ head, rows, right = [], testId, foot }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid={testId}>
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-gray-50 text-gray-500"><tr>{head.map((h, i) => <th key={i} className={`px-2.5 py-2 font-medium ${right.includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, k) => <tr key={k} className="border-t border-gray-100">{r.map((c, i) => <td key={i} className={`px-2.5 py-1.5 ${right.includes(i) ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
        {foot && <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold"><tr>{foot.map((c, i) => <td key={i} className={`px-2.5 py-1.5 ${right.includes(i) ? "text-right" : ""}`}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

export default function FirmEconomics({ deals = [], funds = {}, curve, scopeName = "" }) {
  const [view, setView] = useState("portfolio");
  const todayISO = new Date().toISOString().slice(0, 10);
  const names = useMemo(() => [...new Set(deals.map((d) => d.inputs?.fundName?.trim()).filter(Boolean))].sort(), [deals]);
  const perFund = useMemo(() => names.map((n) => {
    try {
      return fundGpEconomics(n, deals.filter((d) => d.inputs?.fundName?.trim() === n), { ...DEFAULT_FUND_TERMS, ...(funds[n] ?? {}), name: n }, { todayISO, curve });
    } catch {
      return null;
    }
  }).filter(Boolean), [names.join("|"), deals, funds, todayISO, curve]); // eslint-disable-line react-hooks/exhaustive-deps
  const fe = useMemo(() => firmEconomics(perFund), [perFund]);
  const t = fe.totals, ry = t.revenueYield ?? {};
  const title = scopeName || "All portfolios";

  if (!fe.shown) return <p className="text-sm text-gray-500" data-testid="firm-economics-none">Put deals in a portfolio to see the firm&apos;s economics here.</p>;
  const tab = (k, l) => <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1 text-xs font-medium ${view === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{l}</button>;
  const exportPdf = async () => { const { firmPdf } = await import("@/lib/gpEconomicsPdf"); downloadBlob(await firmPdf(fe, { title, todayISO }), `firm-economics-${todayISO}.pdf`); };
  const exportXlsx = async () => downloadBlob(await writeXlsx(firmXlsx(fe, { title }), { sheetName: "Firm Economics", title: `Baywise · ${title} Firm Economics (internal)` }), `firm-economics-${todayISO}.xlsx`);
  const bar = [[t.feesShare, "bg-blue-400"], [t.promoteShare, "bg-blue-700"], [t.coinvestShare, "bg-blue-300"]];

  return (
    <section className="space-y-4" data-testid="firm-economics">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Firm Economics <span className="text-sm font-normal text-gray-500">· {title}</span></h2>
          <InfoNote short="Everything the firm earns as the sponsor and a GP, counted once." testId="fe-info" className="max-w-4xl">Fees, both sides of the promote and the profit on its own capital. An outside GP partner&apos;s share is never counted: the firm&apos;s equity and co-invest profit follow its share of the GP capital commitment; its promote follows the agreements (the GP side vs. the sponsor, and its promote % with the partner). Projected over each portfolio&apos;s life, with to-date figures from actual dates. ROE, IRR and multiple are on capital only: fees need almost no capital, so with fees the IRR can&apos;t be measured and ROE loses its meaning. Fees are measured by Revenue Yield.</InfoNote>
        </div>
        <div className="flex gap-2"><button type="button" onClick={exportXlsx} className={btn}>Excel</button><button type="button" onClick={exportPdf} className={btn}>PDF</button></div>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Internal: not for distribution.</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="firm-cards">
        <Card testId="fe-equity" label="Firm equity" value={fmtM(t.equity)} sub="its share of the GP capital commitment" />
        <Card testId="fe-fees" label="Fees (counted once)" value={fmtM(t.fees)} sub={`${fmtM(t.feesToDate)} earned to date · outsourced fees not counted`} />
        <Card testId="fe-promote" label="Promote, both sides" value={fmtM(t.promote)} sub={`GP side ${fmtM(t.gpPromote)} + sponsor side ${fmtM(t.sponsorPromote)} · ${fmtM(t.promoteRealized)} realized`} />
        <Card testId="fe-coinvest" label="Co-invest profit" value={fmtM(t.coinvest)} sub="on its GP capital · on sale" />
        <Card testId="fe-total" tone="total" label="Total to the firm" value={fmtM(t.total)}
          sub={<><span>fees {pct(t.feesShare, 0)} · promote {pct(t.promoteShare, 0)} · co-invest {pct(t.coinvestShare, 0)}</span><span className="mt-1.5 flex h-2 overflow-hidden rounded bg-gray-200">{bar.map(([w, c], i) => <span key={i} className={c} style={{ width: `${Math.max(0, w ?? 0)}%` }} />)}</span></>} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="firm-returns">
        <Card testId="fe-roe" label="Return on equity (capital only)" value={pct(t.roe, 0)} sub={`(promote + co-invest profit) ÷ firm equity · with fees: ${pct(t.roeWithFees, 0)}`} />
        <Card testId="fe-irr" label="IRR (capital only)" value={pct(t.irr, 1)} sub="firm equity in at each acquisition, back with its promote and co-invest profit at each sale" />
        <Card testId="fe-multiple" label="Equity multiple (capital only)" value={mult(t.multiple)} sub={`with fees: ${mult(t.multipleWithFees)}`} />
        <Card testId="fe-ry" label="Revenue Yield" value={`${pct(ry.perYearPct, 2)} / yr`} sub={`${pct(ry.pct, 2)} over ${ry.lifeYears ? ry.lifeYears.toFixed(1) : "—"} years · ${pct(ry.toDatePct, 2)} to date · firm fees ÷ ${fmtM(ry.committed)} committed${ry.anyFallback ? "*" : ""}`} />
      </div>
      <p className="text-[11px] text-gray-500">ROE, IRR and multiple are on capital only: fees need almost no capital, so with fees the IRR can&apos;t be measured and ROE loses its meaning. Fees are measured by Revenue Yield.{ry.anyFallback ? " * total equity where no commitments are entered." : ""}</p>

      <div role="tablist" aria-label="Firm Economics view" className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">{tab("portfolio", "By portfolio")}{tab("year", "By year")}{tab("fees", "Fees by type")}{tab("promote", "Promote split")}{tab("asset", "By asset")}</div>

      {view === "portfolio" && (<>
        <T testId="fe-by-portfolio" right={[3, 4, 5, 6, 7, 8, 9, 10]} head={["Portfolio", "Type", "Outside GP partner", "Firm equity", "Fees", "Promote", "Co-invest profit", "Total", "ROE*", "IRR*", "Multiple*"]}
          rows={fe.rows.map((r) => [<span key="n" className="font-medium">{r.fund} <span className="font-normal text-gray-500">· {r.assetsCount} assets</span></span>, <FundTypeBadge key="b" type={r.type} />, r.outsideGp.length ? `${r.outsideGp.join(", ")} (firm ${pct(r.capShare, 0)} of GP capital)` : "None", fmtM(r.equity), fmtM(r.fees), fmtM(r.promote), fmtM(r.coinvest), fmtM(r.total), pct(r.roe, 0), pct(r.irr, 1), mult(r.multiple)])}
          foot={[`Total (${fe.rows.length} portfolio${fe.rows.length === 1 ? "" : "s"})`, "", "", fmtM(t.equity), fmtM(t.fees), fmtM(t.promote), fmtM(t.coinvest), fmtM(t.total), pct(t.roe, 0), pct(t.irr, 1), mult(t.multiple)]} />
        <p className="text-[11px] text-gray-500">*capital only. Revenue Yield basis: {fe.rows.map((r) => `${r.fund} ${ryBasisLabel(r.revenueYield, r.type)}`).join("; ")}.</p>
      </>)}
      {view === "year" && (<>
        <T testId="fe-by-year" right={[1, 2, 3, 4, 5]} head={["Year", "Fees", "Promote (both sides)", "Co-invest profit", "Total", "Cumulative"]}
          rows={fe.years.map((y) => [y.year, fmtM(y.fees), y.promote ? fmtM(y.promote) : "—", y.coinvest ? fmtM(y.coinvest) : "—", fmtM(y.total), fmtM(y.cumulative)])}
          foot={["Total", fmtM(t.fees), fmtM(t.promote), fmtM(t.coinvest), fmtM(t.total), ""]} />
        <p className="text-[11px] text-gray-500">Fees by the year they are earned; promote and co-invest profit in the year of each sale (projected from each asset&apos;s plan and exit).</p>
      </>)}
      {view === "fees" && (<>
        <T testId="fe-fees-by-type" right={[2, 3]} head={["Fee", "Paid to", "Life", "To date"]}
          rows={fe.feesByType.map((x) => [x.label, x.paidTo.map((p) => PAID[p] ?? p).join(", "), fmtM(x.life), fmtM(x.toDate)])}
          foot={["Total", "", fmtM(t.fees), fmtM(t.feesToDate)]} />
        <p className="text-[11px] text-gray-500">Each fee counts once: every fee is the sponsor&apos;s (this firm&apos;s), except one outsourced to a third party, which is nobody&apos;s revenue. The GP earns no fees.</p>
      </>)}
      {view === "promote" && (<>
        <T testId="fe-promote-split" right={[1, 2, 3, 4, 5, 6]} head={["Portfolio", "GP side of the promote", "Firm's share of the GP side", "GP side to the firm", "Sponsor side", "Promote to the firm", "Realized"]}
          rows={fe.rows.map((r) => [r.fund, pct(r.promoteGpPct, 0), pct(r.gpPromoteShare, 0), fmtM(r.gpPromote), fmtM(r.sponsorPromote), fmtM(r.promote), fmtM(r.promoteRealized)])}
          foot={["Total", "", "", fmtM(t.gpPromote), fmtM(t.sponsorPromote), fmtM(t.promote), fmtM(t.promoteRealized)]} />
        <p className="text-[11px] text-gray-500">From the agreements, set on each portfolio&apos;s terms (Parties and economics): the GP side&apos;s share of the promote vs. the sponsor, and the firm&apos;s promote % with any outside GP partner (not its capital share).</p>
      </>)}
      {view === "asset" && (
        <T testId="fe-by-asset" right={[3, 4, 5]} head={["Asset", "Portfolio", "Status", "Fees", "Promote to the firm", "Co-invest profit (on sale)"]}
          rows={fe.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", fmtM(a.fees), fmtM(a.promote), fmtM(a.coinvest)])} />
      )}
    </section>
  );
}
