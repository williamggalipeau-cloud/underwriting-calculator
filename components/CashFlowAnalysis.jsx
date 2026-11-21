"use client";

import { useMemo, useState } from "react";
import { calcIRR } from "@/lib/calculations";

// Chart colors (validated pair: inflow blue / outflow red on the light surface).
const C = {
  inflow: "#2a78d6",
  outflow: "#e34948",
  cumulative: "#52514e",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  muted: "#898781",
  surface: "#fcfcfb",
};

function usd(n) {
  if (!isFinite(n)) return "—";
  const s = Math.round(Math.abs(n)).toLocaleString("en-US");
  return n < 0 ? `(${s})` : s;
}
function usdM(n) {
  if (!isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`;
  return n < 0 ? `−${s}` : s;
}
const pct = (n, d = 1) => (isFinite(n) ? `${n.toFixed(d)}%` : "—");
const mult = (n) => (isFinite(n) ? `${n.toFixed(2)}x` : "—");

// Builds the deal's cash flow statement from the underwriting result.
export function buildCashFlowStatement(inputs, results) {
  const { annualCashFlows: cfs, debt, returns, closingCosts, irrFlows } = results;
  const hold = cfs.length;
  const capex = inputs.capexBudget ?? 0;
  const financingClosing = (closingCosts.loanOrigination ?? 0) + (closingCosts.titleInsuranceLender ?? 0);

  const uses = [
    { label: "Purchase price", value: inputs.purchasePrice },
    { label: "Closing costs", value: closingCosts.total },
    { label: "Rate cap premium", value: debt.capPremium ?? 0 },
    { label: "Capex budget", value: capex },
  ].filter((u) => u.value > 0);
  const sources = [
    { label: inputs.capexLenderFunded && capex > 0 ? "Loan (incl. capex)" : "Loan", value: debt.loanAmount },
    { label: "Equity", value: debt.equityRequired },
  ];

  const finalBalance = cfs[hold - 1].loanBalance;
  const rows = cfs.map((cf, i) => {
    const last = i === hold - 1;
    const tiNet = (cf.tiAndLeasing ?? 0) - (cf.tiDrawApproved ?? 0);
    const sale = last ? returns.exitValue : 0;
    const saleCosts = last ? returns.sellingCosts : 0;
    const payoff = last ? finalBalance : 0;
    return {
      year: cf.year,
      noi: cf.noi,
      tiLC: cf.tiAndLeasing ?? 0,
      tiNet,
      unleveredOp: cf.noi - (cf.tiAndLeasing ?? 0) - (cf.constructionMgmtFee ?? 0),
      debtService: cf.debtService,
      extensionFee: cf.extensionFee ?? 0,
      capReplacement: cf.capReplacement ?? 0,
      amFees: cf.belowLineAMFees ?? 0,
      cmFee: cf.constructionMgmtFee ?? 0,
      pmFee: cf.managementFee ?? 0,
      operatingCF: cf.pretaxCashFlow,
      sale,
      saleCosts,
      payoff,
      netCF: cf.pretaxCashFlow + (last ? returns.equityReversion : 0),
      dscr: cf.debtService > 0 ? cf.noi / cf.debtService : Infinity,
      debtYield: cf.loanBalance > 0 ? (cf.noi / cf.loanBalance) * 100 : Infinity,
      rate: cf.interestRate,
      coc: (cf.pretaxCashFlow / debt.equityRequired) * 100,
    };
  });

  // Unlevered: all-cash purchase, excluding loan-only costs (cap, origination, lender title).
  const unleveredInvest = inputs.purchasePrice + closingCosts.total - financingClosing + capex;
  const unleveredFlows = [
    -unleveredInvest,
    ...rows.map((r, i) => r.unleveredOp + (i === hold - 1 ? returns.exitValue - returns.sellingCosts : 0)),
  ];
  const leveredFlows = irrFlows;

  let cum = 0;
  const cumulative = leveredFlows.map((f) => (cum += f));
  const peakEquity = -Math.min(...cumulative);
  const paybackIdx = cumulative.findIndex((c, i) => i > 0 && c >= 0);

  const sum = (a) => a.reduce((s, v) => s + v, 0);
  return {
    hold,
    sources,
    uses,
    rows,
    leveredFlows,
    unleveredFlows,
    cumulative,
    unlevered: {
      invested: unleveredInvest,
      profit: sum(unleveredFlows),
      irr: calcIRR(unleveredFlows) * 100,
      multiple: sum(unleveredFlows.slice(1)) / unleveredInvest,
    },
    levered: {
      invested: debt.equityRequired,
      profit: sum(leveredFlows),
      irr: returns.irr,
      multiple: returns.equityMultiple,
    },
    peakEquity,
    paybackYear: paybackIdx > 0 ? paybackIdx : null,
    avgCoC: (sum(rows.map((r) => r.operatingCF)) / hold / debt.equityRequired) * 100,
  };
}

// ── Chart: annual equity cash flow (bars) + cumulative (line), one $ axis ──
function CashFlowChart({ flows, cumulative }) {
  const [hover, setHover] = useState(null);
  const W = 760, H = 260, padL = 64, padR = 16, padT = 16, padB = 32;
  const vals = [...flows, ...cumulative, 0];
  const max = Math.max(...vals), min = Math.min(...vals);
  const span = max - min || 1;
  const y = (v) => padT + ((max - v) / span) * (H - padT - padB);
  const n = flows.length;
  const band = (W - padL - padR) / n;
  const barW = Math.min(24, band * 0.5);
  const cx = (i) => padL + band * i + band / 2;

  // ~5 nice gridlines
  const step = (() => {
    const raw = span / 5;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
  })();
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-6; t += step) ticks.push(t);

  const barPath = (i, v) => {
    const x = cx(i) - barW / 2, y0 = y(0), y1 = y(v), r = Math.min(4, Math.abs(y1 - y0));
    if (v >= 0) {
      return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z`;
    }
    return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 - r} V${y0} Z`;
  };
  const line = cumulative.map((v, i) => `${i ? "L" : "M"}${cx(i)},${y(v)}`).join(" ");

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-4 mb-2 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.inflow }} />Inflow to equity</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.outflow }} />Outflow (equity in)</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5" style={{ background: C.cumulative }} />Cumulative</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Annual equity cash flow and cumulative cash flow by year">
        <rect x="0" y="0" width={W} height={H} fill={C.surface} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.baseline : C.grid} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={C.muted}>{usdM(t)}</text>
          </g>
        ))}
        {flows.map((v, i) => (
          <g key={i}>
            <path d={barPath(i, v)} fill={v >= 0 ? C.inflow : C.outflow} opacity={hover == null || hover === i ? 1 : 0.45} />
            <text x={cx(i)} y={H - 10} textAnchor="middle" fontSize="11" fill={C.muted}>Y{i}</text>
          </g>
        ))}
        <path d={line} fill="none" stroke={C.cumulative} strokeWidth={2} strokeLinejoin="round" />
        {cumulative.map((v, i) => (
          <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill={C.cumulative} stroke={C.surface} strokeWidth={2} />
        ))}
        {/* hit targets: full-height band per year */}
        {flows.map((_, i) => (
          <rect
            key={i}
            x={padL + band * i}
            y={padT}
            width={band}
            height={H - padT - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-8 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm"
          style={{ left: `calc(${(cx(hover) / W) * 100}% + 8px)`, transform: cx(hover) > W * 0.7 ? "translateX(-110%)" : undefined }}
        >
          <p className="font-semibold text-gray-900">Year {hover}</p>
          <p className="text-gray-600 tabular-nums">Equity cash flow: <span className="text-gray-900 font-medium">{usdM(flows[hover])}</span></p>
          <p className="text-gray-600 tabular-nums">Cumulative: <span className="text-gray-900 font-medium">{usdM(cumulative[hover])}</span></p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function CashFlowAnalysis({ inputs, results }) {
  const s = useMemo(() => buildCashFlowStatement(inputs, results), [inputs, results]);
  const last = s.hold - 1;
  const cols = ["Year 0", ...s.rows.map((r) => `Year ${r.year}`), "Total"];

  // Statement lines: [label, values for Y0..YN, style]
  const line = (label, y0, perYear, opts = {}) => ({ label, y0, perYear, ...opts });
  const L = [
    line("Property management (in NOI)", null, s.rows.map((r) => -r.pmFee), { hideIfZero: true, note: true }),
    line("Net operating income", null, s.rows.map((r) => r.noi), { bold: true }),
    line("TI / leasing commissions", null, s.rows.map((r) => -r.tiLC), { hideIfZero: true }),
    line("Construction management fees", null, s.rows.map((r) => -r.cmFee), { hideIfZero: true }),
    line("Cash flow before debt (unlevered)", null, s.rows.map((r) => r.unleveredOp), { subtotal: true }),
    line("TI funded from lender reserve", null, s.rows.map((r) => r.tiLC - r.tiNet), { hideIfZero: true }),
    line("Debt service", null, s.rows.map((r) => -r.debtService)),
    line("Extension fees", null, s.rows.map((r) => -r.extensionFee), { hideIfZero: true }),
    line("Replacement rate caps", null, s.rows.map((r) => -r.capReplacement), { hideIfZero: true }),
    line("Asset-management fees", null, s.rows.map((r) => -r.amFees), { hideIfZero: true }),
    line("Cash flow after debt service", null, s.rows.map((r) => r.operatingCF), { subtotal: true }),
    line("Sale price", null, s.rows.map((r) => r.sale)),
    line("Sale costs", null, s.rows.map((r) => -r.saleCosts)),
    line("Loan payoff", null, s.rows.map((r) => -r.payoff)),
    line("Equity invested", -s.levered.invested, s.rows.map(() => 0)),
    line("Net cash flow to equity", s.leveredFlows[0], s.rows.map((r) => r.netCF), { total: true }),
    line("Cumulative", null, null, { cumulative: true }),
  ].filter((l) => !(l.hideIfZero && l.perYear.every((v) => Math.abs(v) < 0.5)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Cash Flow Analysis</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {inputs.propertyName || "This deal"} · {s.hold}-year hold · annual cash flows from closing (Year 0) to sale (Year {s.hold}).
        </p>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Levered IRR" value={pct(s.levered.irr)} sub={`${mult(s.levered.multiple)} on ${usdM(s.levered.invested)} equity`} />
        <Stat label="Unlevered IRR" value={pct(s.unlevered.irr)} sub={`${mult(s.unlevered.multiple)} on ${usdM(s.unlevered.invested)} all-cash`} />
        <Stat label="Peak equity" value={usdM(s.peakEquity)} sub="Most cash out at any point" />
        <Stat
          label="Payback"
          value={s.paybackYear ? `Year ${s.paybackYear}` : "—"}
          sub={s.paybackYear === s.hold ? "Equity returned at sale" : "Cumulative cash turns positive"}
        />
      </div>

      {/* Sources & uses */}
      <div className="grid md:grid-cols-2 gap-4">
        {[
          ["Uses at closing", s.uses],
          ["Sources at closing", s.sources],
        ].map(([title, items]) => {
          const total = items.reduce((a, b) => a + b.value, 0);
          return (
            <div key={title} className="rounded-xl border border-gray-200 overflow-hidden">
              <p className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</p>
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {items.map((it) => (
                    <tr key={it.label} className="border-b border-gray-100">
                      <td className="px-4 py-1.5 text-gray-600">{it.label}</td>
                      <td className="px-4 py-1.5 text-right text-gray-900">${usd(it.value)}</td>
                      <td className="px-4 py-1.5 text-right text-gray-400 w-16">{pct((it.value / total) * 100)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="px-4 py-2 text-gray-900">Total</td>
                    <td className="px-4 py-2 text-right text-gray-900">${usd(total)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Equity cash flow by year</h3>
        <CashFlowChart flows={s.leveredFlows} cumulative={s.cumulative} />
      </div>

      {/* Statement */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Cash flow statement</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">$</th>
                {cols.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {L.map((l) => {
                if (l.cumulative) {
                  return (
                    <tr key={l.label} className="text-gray-500">
                      <td className="px-3 py-1.5 italic">{l.label}</td>
                      {s.cumulative.map((v, i) => (
                        <td key={i} className={`px-3 py-1.5 text-right ${v < 0 ? "text-red-600" : ""}`}>{usd(v)}</td>
                      ))}
                      <td />
                    </tr>
                  );
                }
                const vals = [l.y0, ...l.perYear];
                const total = vals.reduce((a, v) => a + (v ?? 0), 0);
                const cls = l.total
                  ? "font-bold text-gray-900 bg-blue-50/50 border-t-2 border-gray-300"
                  : l.subtotal
                  ? "font-semibold text-gray-900 border-t border-gray-300"
                  : l.bold
                  ? "font-semibold text-gray-900"
                  : "text-gray-700";
                return (
                  <tr key={l.label} className={`border-b border-gray-100 ${cls}`}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{l.label}</td>
                    {vals.map((v, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right ${v != null && v < 0 ? "text-red-600" : ""}`}>
                        {v == null || Math.abs(v) < 0.5 ? <span className="text-gray-300">–</span> : usd(v)}
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right ${total < 0 ? "text-red-600" : ""}`}>{usd(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Negative values in red and parentheses. Sale in Year {last + 1} at {pct(inputs.exitCapRatePct, 2)} exit cap on Year {last + 1} NOI.
        </p>
      </div>

      {/* Ratios */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Coverage and yield by year</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Year", "Interest rate", "DSCR", "Debt yield", "Cash-on-cash"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.year} className="border-b border-gray-100">
                  <td className="px-3 py-1.5 font-medium text-gray-700">Y{r.year}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{pct(r.rate, 2)}</td>
                  <td className={`px-3 py-1.5 text-right ${r.dscr < 1.25 ? "text-red-600 font-semibold" : "text-gray-700"}`}>{mult(r.dscr)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{pct(r.debtYield)}</td>
                  <td className={`px-3 py-1.5 text-right ${r.coc < 0 ? "text-red-600" : "text-gray-700"}`}>{pct(r.coc)}</td>
                </tr>
              ))}
              <tr className="font-semibold text-gray-900">
                <td className="px-3 py-2">Average</td>
                <td colSpan={3} />
                <td className={`px-3 py-2 text-right ${s.avgCoC < 0 ? "text-red-600" : ""}`}>{pct(s.avgCoC)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
