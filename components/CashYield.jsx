"use client";

// Projected cash-on-cash yield: a small bar chart and table (lib/cashYield).
const pct = (v) => (isFinite(v) ? `${v.toFixed(1)}%` : "—");
const money = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a / 1e3)}k`;
  return v < 0 ? `(${s})` : s;
};

function Bars({ items }) {
  const max = Math.max(1, ...items.flatMap((i) => i.values.map((v) => Math.abs(v.value)).filter(isFinite)));
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height: 120 }}>
      {items.map((i) => (
        <div key={i.label} className="flex min-w-[2.5rem] flex-1 flex-col items-center justify-end gap-1">
          <div className="flex h-[84px] items-end gap-0.5">
            {i.values.map((v) => (
              <div key={v.key} title={`${i.label} ${v.key}: ${pct(v.value)}`} className="flex flex-col items-center justify-end">
                <span className="text-[9px] tabular-nums text-gray-500">{isFinite(v.value) ? v.value.toFixed(1) : ""}</span>
                <div className={`w-4 rounded-t ${v.value < 0 ? "bg-red-400" : v.color}`} style={{ height: `${Math.max(2, (Math.abs(v.value) / max) * 64)}px` }} />
              </div>
            ))}
          </div>
          <span className="text-[10px] text-gray-500">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AssetCashYield({ data, equity }) {
  if (!data?.rows.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Projected cash-on-cash yield</h3>
        <span className="text-xs text-gray-500">
          Average <span className="font-semibold text-gray-900">{pct(data.average)}</span> · low {pct(data.min)} · high {pct(data.max)} · on {money(equity)} equity
        </span>
      </div>
      <Bars items={data.rows.map((r) => ({ label: `Y${r.year}`, values: [{ key: "yield", value: r.yield, color: "bg-blue-500" }] }))} />
      <p className="mt-1 text-[11px] text-gray-400">Each hold year&apos;s pre-tax cash flow (after debt service, caps and asset fees) ÷ equity invested at closing.</p>
    </div>
  );
}

export function FundCashYield({ data }) {
  if (!data?.rows.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-xs">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold text-gray-700">Projected cash-on-cash yield</h4>
        <span className="text-gray-500">
          Life average: gross <span className="font-semibold text-gray-900">{pct(data.grossAverage)}</span> · net to investors{" "}
          <span className="font-semibold text-gray-900">{pct(data.netAverage)}</span>
        </span>
      </div>
      <Bars
        items={data.rows.map((r) => ({
          label: String(r.year),
          values: [
            { key: "gross", value: r.grossYield, color: "bg-blue-500" },
            { key: "net", value: r.netYield, color: "bg-emerald-500" },
          ],
        }))}
      />
      <div className="mt-1 flex gap-3 text-[11px] text-gray-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-500" />Gross (assets)</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />Net to investors</span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full tabular-nums">
          <thead className="text-gray-500">
            <tr className="border-b border-gray-200">
              {["Year", "Equity invested (avg)", "Asset operating cash", "Gross yield", "Distributed to investors", "Net yield"].map((h) => (
                <th key={h} className={`px-2 py-1 font-medium ${h === "Year" ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.year} className="border-b border-gray-100 text-gray-800">
                <td className="px-2 py-1">{r.year}</td>
                <td className="px-2 py-1 text-right">{money(r.equity)}</td>
                <td className="px-2 py-1 text-right">{money(r.gross)}</td>
                <td className="px-2 py-1 text-right font-medium">{pct(r.grossYield)}</td>
                <td className="px-2 py-1 text-right">{money(r.net)}</td>
                <td className="px-2 py-1 text-right font-medium">{pct(r.netYield)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        Equity invested = equity in assets held, weighted by days held in the year. Gross = the assets&apos; operating cash flow (after debt
        service and asset fees). Net = operating income distributed to investors after fund expenses, sub line costs and the fund cash
        reserve. Sale proceeds are excluded. Life average = total cash ÷ total equity-years.
      </p>
    </div>
  );
}
