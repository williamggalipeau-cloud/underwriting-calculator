"use client";

// Finance → GP Economics and Sponsor Economics (user, 11/24). The GP is the
// capital partner: its return on invested capital (co-invest profit) and its
// share of the promote, plus any fee the setup pays to it. The sponsor /
// operator earns the fees (unless outsourced to a third party, which is
// nobody's revenue) and its share of the promote; Revenue Yield is its
// measure. Each portfolio names its parties (this firm or outside companies);
// totals count only the portfolios where this firm has the role. Internal.
import { useMemo, useState } from "react";
import FundTypeBadge from "@/components/FundTypeBadge";
import { FUND_TYPES, filterFundsByType } from "@/lib/fundTypes";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import { firmPartyEconomics, firmRoleLabel, fundGpEconomics, partyXlsx, ryBasisLabel } from "@/lib/gpEconomics";
import { writeXlsx } from "@/lib/xlsx";

const fmtM = (v) => (v == null || !isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toFixed(2)}M`);
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const mult = (v) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2)}x`);
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
// Committed capital, with * when no commitments are entered (total equity used).
const fmtC = (ry) => (ry ? `${fmtM(ry.committed)}${ry.fromCommitments === false || ry.anyFallback ? "*" : ""}` : "—");
const payee = { sponsor: "Sponsor", gp: "GP", third: "Third party" };

function Card({ label, value, sub, testId, tone = "" }) {
  const c = tone === "accent" ? "border-blue-300 bg-blue-50/60" : tone === "gain" ? "border-violet-200 bg-violet-50/50" : "border-gray-200 bg-white";
  return (
    <div className={`rounded-xl border px-4 py-3 ${c}`} data-testid={testId}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}
function T({ head, rows, right = [], testId, foot, dim = [] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid={testId}>
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-gray-50 text-gray-500"><tr>{head.map((h, i) => <th key={i} className={`px-2.5 py-2 font-medium ${right.includes(i) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, k) => <tr key={k} className={`border-t border-gray-100 ${dim[k] ? "text-gray-500" : ""}`}>{r.map((c, i) => <td key={i} className={`px-2.5 py-1.5 ${right.includes(i) ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
        {foot && <tfoot className="border-t-2 border-gray-200 font-semibold"><tr>{foot.map((c, i) => <td key={i} className={`px-2.5 py-1.5 ${right.includes(i) ? "text-right" : ""}`}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
const Who = ({ party, role }) => (party.who === "firm"
  ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">This firm</span>
  : <span className="rounded-full border border-orange-200 bg-orange-50 px-1.5 py-px text-[10px] font-semibold text-orange-700">{party.name || (role === "gp" ? "External GP" : "External operator")}</span>);

export default function GpEconomics({ deals = [], funds = {}, curve, scopeName = "", role = "gp" }) {
  const isGp = role === "gp";
  const [view, setView] = useState("consolidated");
  const [typeFilter, setTypeFilter] = useState("");
  const [external, setExternal] = useState(false);
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
  const firm = useMemo(() => firmPartyEconomics(perFund, role, { includeExternal: external }), [perFund, role, external]);
  const other = useMemo(() => firmPartyEconomics(perFund, isGp ? "sponsor" : "gp"), [perFund, isGp]);
  const t = firm.totals;
  const title = scopeName || (typeFilter ? `${typeFilter} portfolios` : "All portfolios");
  const name = isGp ? "GP Economics" : "Sponsor Economics";
  const slug = isGp ? "gp-economics" : "sponsor-economics";
  const both = perFund.some((f) => f.parties?.parties.firmRole === "both");
  const feeToOf = (fund) => perFund.find((f) => f.fund === fund)?.parties?.parties.feeTo ?? {};

  async function exportPdf() {
    const { partyPdf } = await import("@/lib/gpEconomicsPdf");
    downloadBlob(await partyPdf(role, firm, { title, todayISO }), `${slug}-${todayISO}.pdf`);
  }

  if (!names.length) return <p className="text-sm text-gray-500">Put deals in a portfolio to see the {isGp ? "GP's" : "sponsor's"} economics here.</p>;
  const tab = (k, l) => <button type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-md px-3 py-1 text-xs font-medium ${view === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>{l}</button>;

  return (
    <section className="space-y-4" data-testid={slug}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{name} <span className="text-sm font-normal text-gray-500">· {title}</span></h2>
          <p className="text-xs text-gray-500">{isGp
            ? "The GP side (capital partners): its return on invested capital and its share of the promote, plus any fee the portfolio's setup pays to the GP. Shown in total, then split by GP party. Capital gains, counted in the year each asset is sold."
            : "The sponsor / operator: the fees it earns for managing the assets (outsourced property or construction management is nobody's revenue) and its share of the promote."} Each portfolio&apos;s parties, fees and promote split are set on its terms (Edit fund / JV / SMA → Parties and economics). Internal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Fund type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5"><option value="">All portfolio types</option>{FUND_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(partyXlsx(role, firm, { title }), { sheetName: name, title: `Baywise · ${title} ${name} (internal)` }), `${slug}-${todayISO}.xlsx`)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>
          <button type="button" onClick={exportPdf} className={`${btn} border-gray-300 bg-white text-gray-700`}>PDF</button>
        </div>
      </div>
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Internal: not for distribution. {isGp ? "No fee income here unless a fee is paid to the GP; the sponsor's fees are on Sponsor Economics." : "Fee income is kept apart from capital gains (the promote share)."}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900" data-testid="gp-totals-label">Consolidated <span className="font-normal text-gray-500">· portfolios where this firm is {isGp ? "a GP" : "the sponsor"} ({firm.count}{firm.count !== perFund.length ? ` of ${perFund.length}` : ""})</span></h3>
        {/* 1.1.10: the firm is always the sponsor, so only GP Economics can have an outside party. */}
        {isGp && <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} data-testid="include-external" /> Show portfolios with an outside GP (greyed, not in totals)</label>}
      </div>
      {isGp ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="gp-totals">
          <Card testId="gp-equity" label="GP equity invested" value={fmtM(t.equity)} sub={`co-invest across ${firm.count} portfolio${firm.count === 1 ? "" : "s"}`} />
          <Card testId="gp-coinvest" tone="gain" label="Co-invest profit · capital gain" value={fmtM(t.coinvest)} sub="on sale" />
          <Card testId="gp-promote" tone="gain" label="Promote share · capital gain" value={fmtM(t.promote)} sub={`of ${fmtM(t.promoteTotal)} total promote`} />
          <Card testId="gp-total" label="Total GP economics" value={fmtM(t.total)} sub={`co-invest profit + promote share${firm.byParty.length > 1 ? ` · this firm ${fmtM(t.firmShare)}` : ""}`} />
          <Card testId="gp-roic" tone="accent" label="Return on invested capital" value={pct(t.roe, 0)} sub={`${mult(t.multiple)} multiple`} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="gp-totals">
          <Card testId="gp-fees" label="Fee income (life of portfolios)" value={fmtM(t.fees)} sub={t.thirdFees ? `${fmtM(t.thirdFees)} outsourced, not counted` : "asset, property and construction management, acq. / disp."} />
          <Card testId="sp-promote" tone="gain" label="Promote share · capital gain" value={fmtM(t.promote)} sub={`of ${fmtM(t.promoteTotal)} total promote`} />
          <Card testId="sp-outsourced" label="Outsourced fees" value={fmtM(t.thirdFees)} sub="paid to third parties: an asset expense, nobody's revenue" />
          <Card testId="sp-total" label="Total sponsor economics" value={fmtM(t.total)} sub="fee income + promote share (the sponsor's capital is its GP share: GP Economics)" />
          <Card testId="gp-revenue-yield" tone="accent" label="Revenue Yield" value={pct(t.revenueYield?.pct, 2)}
            sub={<>{pct(t.revenueYield?.perYearPct, 2)} a year{t.revenueYield?.lifeYears ? ` over ${t.revenueYield.lifeYears.toFixed(1)} years` : ""} · {fmtM(t.fees)} fees ÷ {fmtC(t.revenueYield)} committed<br /><b>To date:</b> {pct(t.revenueYield?.toDatePct, 2)} ({fmtM(t.revenueYield?.feesToDate)} earned)</>} />
        </div>
      )}
      {isGp && firm.byParty.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-700">Total GP economics, split by GP party{firm.byParty.length === 1 ? " (one GP)" : ""}</p>
          <T testId="gp-by-party" right={[1, 2, 3, 4, 5, 6]} head={["GP party", "Portfolios", "GP equity (capital share)", "Co-invest profit", "Promote share", "Total", "Return on invested capital"]}
            rows={firm.byParty.map((g) => [g.who === "firm" ? <b key="n">This firm</b> : g.label, g.portfolios, fmtM(g.equity), fmtM(g.coinvest), fmtM(g.promote), fmtM(g.total), pct(g.roe, 0)])}
            foot={["Total GP economics", firm.count, fmtM(t.equity), fmtM(t.coinvest), fmtM(t.promote), fmtM(t.total), pct(t.roe, 0)]} />
          <p className="text-[11px] text-gray-500">Each GP party&apos;s co-invest follows its share of the GP capital; its promote follows its share of the promote (the GP earns no fees), as set on each portfolio&apos;s terms. This firm&apos;s share: {fmtM(t.firmShare)}.</p>
        </div>
      )}
      {both && <p className="text-[11px] text-gray-500" data-testid="firm-both-total">Where this firm is both GP and sponsor, the two tabs add up to its total: {fmtM(t.total + other.totals.total)} ({isGp ? `GP ${fmtM(t.total)} + sponsor ${fmtM(other.totals.total)}` : `sponsor ${fmtM(t.total)} + GP ${fmtM(other.totals.total)}`}).</p>}

      <div role="tablist" aria-label={`${name} view`} className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">{tab("consolidated", "Consolidated")}{tab("firm", "By year")}{tab("fund", "By portfolio")}{tab("asset", "By asset")}</div>

      {view === "consolidated" && (
        isGp ? (
          <T testId="gp-by-type" right={[1, 2, 3, 4, 5]} head={["Portfolio type", "Portfolios", "GP equity", "Co-invest profit", "Promote share", "Total GP economics"]}
            rows={firm.byType.map((b) => [<FundTypeBadge key="b" type={b.type} />, b.portfolios, fmtM(b.equity), fmtM(b.coinvest), fmtM(b.promote), fmtM(b.total)])}
            foot={["All portfolios", firm.count, fmtM(t.equity), fmtM(t.coinvest), fmtM(t.promote), fmtM(t.total)]} />
        ) : (
          <div className="space-y-2">
            <T testId="gp-by-type" right={[1, 2, 3, 4, 5, 6, 7, 8]} head={["Portfolio type", "Portfolios", "Fee income", "Promote share", "Total sponsor economics", "Committed capital", "Revenue Yield", "Per year", "To date"]}
              rows={firm.byType.map((b) => [<FundTypeBadge key="b" type={b.type} />, b.portfolios, fmtM(b.fees), fmtM(b.promote), fmtM(b.total), fmtC(b.revenueYield), pct(b.revenueYield?.pct, 2), pct(b.revenueYield?.perYearPct, 2), pct(b.revenueYield?.toDatePct, 2)])}
              foot={["All portfolios", firm.count, fmtM(t.fees), fmtM(t.promote), fmtM(t.total), fmtC(t.revenueYield), pct(t.revenueYield?.pct, 2), pct(t.revenueYield?.perYearPct, 2), pct(t.revenueYield?.toDatePct, 2)]} />
            <p className="text-[11px] text-gray-500" data-testid="gp-ry-note">Revenue Yield = the sponsor&apos;s fees (never promote, co-invest profit or outsourced fees) over the portfolio&apos;s life ÷ committed capital. <b>Per year</b> divides by the life in years (first acquisition to last projected sale). <b>To date</b> uses fees earned through today. Each portfolio measures against LP + GP or LP-only commitments as its LPA, JVA or SMA says (or as set on its terms; LP + GP by default).{t.revenueYield?.anyFallback ? " *No commitments entered: total equity is used instead." : ""}</p>
          </div>
        )
      )}
      {view === "firm" && (
        <>
          {isGp ? (
            <T testId="gp-years" right={[1, 2, 3]} head={["Year", "Promote share (on sale)", "Co-invest profit (on sale)", "Total GP economics"]}
              rows={firm.years.map((y) => [y.year, y.promote ? fmtM(y.promote) : "—", y.coinvest ? fmtM(y.coinvest) : "—", fmtM(y.total)])}
              foot={["Life of portfolios", fmtM(t.promote), fmtM(t.coinvest), fmtM(t.total)]} />
          ) : (
            <T testId="gp-years" right={[1, 2, 3, 4, 5, 6, 7]} head={["Year", "Asset management", "Property management", "Construction management", "Acq. / disp. fees", "Fee income", "Promote share (on sale)", "Total"]}
              rows={firm.years.map((y) => [y.year, fmtM(y.mgmt), fmtM(y.pm), fmtM(y.cm), fmtM(y.acq + y.disp), fmtM(y.fees), y.promote ? fmtM(y.promote) : "—", fmtM(y.total)])}
              foot={["Life of portfolios", fmtM(firm.years.reduce((s, y) => s + y.mgmt, 0)), fmtM(firm.years.reduce((s, y) => s + y.pm, 0)), fmtM(firm.years.reduce((s, y) => s + y.cm, 0)), fmtM(firm.years.reduce((s, y) => s + y.acq + y.disp, 0)), fmtM(t.fees), fmtM(t.promote), fmtM(firm.years.reduce((s, y) => s + y.total, 0))]} />
          )}
          <p className="text-[11px] text-gray-500" data-testid="gp-years-note">{isGp ? "All GP parties together. Capital gains are not income: the GP's promote share and co-invest profit count in the year each asset is sold (the portfolio's totals allocated by each asset's share of gross profit, as in By asset)." : "Fee income is earned for services each year; the promote share is a capital gain, counted in the year each asset is sold. Outsourced fees aren't shown: they're nobody's revenue."}</p>
        </>
      )}
      {view === "fund" && (
        <>
          {isGp ? (
            <T testId="gp-funds" dim={firm.rows.map((r) => !r.ours)} right={[3, 4, 5, 6, 7, 8, 9]} head={["Portfolio", "This firm is", "GP", "GP equity", "Co-invest profit", "Promote (total)", "GP side", "GP promote", "Total GP economics", "ROE · IRR / multiple"]}
              rows={firm.rows.map((r) => [<span key="n" className="flex items-center gap-1.5">{r.fund}<FundTypeBadge type={r.type} /></span>, firmRoleLabel(r.firmRole), <Who key="w" party={r.party} role="gp" />, fmtM(r.x.equity), fmtM(r.x.coinvest), fmtM(r.x.promoteTotal), `${r.f.parties.parties.promoteGpPct}%${Object.keys(r.f.parties.parties.promoteGpPctByAsset).length ? "*" : ""}`, fmtM(r.x.promote), fmtM(r.x.total), `${pct(r.x.roe, 0)} · ${pct(r.x.irr)} / ${mult(r.x.multiple)}`])} />
          ) : (
            <T testId="gp-funds" dim={firm.rows.map((r) => !r.ours)} right={[2, 3, 4, 5, 6, 7, 8, 9, 11, 12]} head={["Portfolio", "Sponsor", "Asset mgmt", "Property mgmt", "Constr. mgmt", "Acq. / disp.", "Fee income", "Outsourced (not revenue)", "Promote share", "Committed", "Basis", "Revenue Yield", "Per year · to date"]}
              rows={firm.rows.map((r) => { const b = r.x.feesByType; return [<span key="n" className="flex items-center gap-1.5">{r.fund}<FundTypeBadge type={r.type} /></span>, <Who key="w" party={r.party} role="sponsor" />, fmtM(b.mgmt), fmtM(b.pm), fmtM(b.cm), fmtM(b.acq + b.disp), fmtM(r.x.fees), r.third.fees ? fmtM(r.third.fees) : "—", fmtM(r.x.promote), fmtC(r.x.revenueYield), <span key="b" className="whitespace-nowrap text-[11px]" data-testid="gp-ry-basis">{ryBasisLabel(r.x.revenueYield, r.type).replace(" · total equity, no commitments entered", "")}</span>, pct(r.x.revenueYield?.pct, 2), `${pct(r.x.revenueYield?.perYearPct, 2)} · ${pct(r.x.revenueYield?.toDatePct, 2)}`]; })} />
          )}
          <p className="text-[11px] text-gray-500">{isGp ? "IRR shows only when the GP has all of the promote (otherwise the waterfall's GP IRR would overstate or understate it). *Some assets have their own promote split." : "A fee outsourced to a third party isn't the sponsor's revenue."} {external ? "Greyed rows have an outside party in this role and aren't in the totals." : ""}</p>
        </>
      )}
      {view === "asset" && (
        <>
          {isGp ? (
            <T testId="gp-assets" right={[3, 4, 5, 6]} head={["Asset", "Portfolio", "Status", "Promote (allocated)", "GP share", "GP promote", "Co-invest profit (on sale)"]}
              rows={firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", fmtM(a.promote), `${a.gpPct}%`, fmtM((a.promote ?? 0) * a.gpPct / 100), fmtM(a.coinvest)])} />
          ) : (
            <T testId="gp-assets" right={[3, 4, 5, 6]} head={["Asset", "Portfolio", "Status", "Property mgmt", "Construction mgmt", "Acq. / disp.", "Promote share"]}
              rows={firm.assets.map((a) => { const to = feeToOf(a.fund); const v = (k, x) => (to[k] === "sponsor" ? fmtM(x) : <span key={k} className="text-gray-500">{payee[to[k]]}</span>); return [a.name, a.fund, a.sold ? "Realized" : "Held", v("pm", a.pm), v("cm", a.cm), fmtM((to.acq === "sponsor" ? a.acqFee : 0) + (to.disp === "sponsor" ? a.dispFee : 0)), fmtM((a.promote ?? 0) * (100 - a.gpPct) / 100)]; })} />
          )}
          <p className="text-[11px] text-gray-500">The waterfall runs on the whole portfolio, so an asset&apos;s promote is the portfolio&apos;s promote allocated by its share of gross profit, then split between GP and sponsor (the portfolio&apos;s split or the asset&apos;s own).{isGp ? "" : " The asset management fee is charged at the portfolio level, so it isn't shown per asset."}</p>
        </>
      )}
    </section>
  );
}
