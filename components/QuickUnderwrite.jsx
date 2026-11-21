"use client";

import { useMemo, useState } from "react";
import { quickUnderwrite, quickSensitivity, sofrForYear } from "@/lib/quickUnderwrite";
import { fetchSofrCurve } from "@/lib/sofr";
import { CURVE_INDICES, FORWARD_CURVE_AS_OF, FORWARD_CURVE_SOURCE } from "@/lib/forwardCurve";

function fmtISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

const GROWTH_STEPS = [0, 5, 10, 15, 20, 25, 30, 35];
const EXIT_CAP_STEPS = [4.0, 5.0, 6.0, 6.5, 7.0, 7.5];

function usd(n) {
  if (!isFinite(n)) return "—";
  const s = Math.round(Math.abs(n)).toLocaleString();
  return n < 0 ? `−$${s}` : `$${s}`;
}
function pct(n, d = 1) {
  return isFinite(n) ? `${n.toFixed(d)}%` : "—";
}
function mult(n) {
  return isFinite(n) ? `${n.toFixed(2)}x` : "—";
}

function NumField({ label, value, onChange, prefix, suffix, step = 1 }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
        {prefix && (
          <span className="px-2.5 py-1.5 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm">{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm text-gray-900 bg-transparent outline-none tabular-nums"
        />
        {suffix && (
          <span className="px-2.5 py-1.5 bg-gray-50 border-l border-gray-200 text-gray-500 text-sm">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-gray-900";
  return (
    <div className="border border-gray-200 rounded-xl px-4 py-3 bg-gray-50">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function irrCellClass(v) {
  if (!isFinite(v)) return "bg-gray-100 text-gray-400";
  if (v < 0) return "bg-red-500 text-white";
  if (v < 10) return "bg-orange-200 text-orange-900";
  if (v < 15) return "bg-yellow-100 text-yellow-900";
  if (v < 25) return "bg-emerald-100 text-emerald-900";
  return "bg-emerald-500 text-white";
}

function ForwardCurve({ inputs, onChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const hold = Math.max(1, Math.round(inputs.holdYears));
  const pensford = inputs.sofrCurveSource === "pensford";
  const curve = inputs.sofrCurve ?? [];
  const hasCurve = pensford || curve.length > 0;
  const acq = inputs.acquisitionDate || FORWARD_CURVE_AS_OF;
  const acqYear = Number(acq.slice(0, 4));

  // Editing a year switches to a manual curve seeded with the current values.
  function setYear(idx, val) {
    onChange((prev) => {
      const next = Array.from({ length: hold }, (_, i) => sofrForYear(prev, i + 1));
      next[idx] = val;
      return { ...prev, sofrCurveSource: "manual", sofrCurve: next };
    });
  }

  async function handleFetch() {
    setLoading(true);
    setError(null);
    const rates = await fetchSofrCurve(hold);
    if (rates.every((r) => r == null)) {
      setError("Could not fetch the CME curve. Enter rates manually.");
      setLoading(false);
      return;
    }
    // Forward-fill gaps (far-dated contracts) from the last known rate.
    onChange((prev) => {
      let last = prev.sofrPct;
      const filled = rates.map((r) => (r != null ? (last = r) : last));
      return { ...prev, sofrCurveSource: "manual", sofrCurve: filled };
    });
    setLoading(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">SOFR forward curve</h3>
          <p className="text-xs text-gray-500">
            {pensford
              ? `${FORWARD_CURVE_SOURCE} ${CURVE_INDICES[inputs.sofrIndex ?? "avgSofr30D"].label} forward curve (${fmtISO(FORWARD_CURVE_AS_OF)}), averaged over each hold year from the ${fmtISO(acq)} acquisition. All-in = min(SOFR, cap strike) + spread.`
              : hasCurve
              ? "Manual per-year SOFR. All-in rate = min(SOFR, cap strike) + spread."
              : `Flat at ${inputs.sofrPct.toFixed(2)}%. Edit a year, use the Pensford curve, or fetch CME futures.`}
          </p>
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>
        <div className="flex gap-2">
          <select
            aria-label="SOFR index"
            value={inputs.sofrIndex ?? "avgSofr30D"}
            onChange={(e) => onChange((prev) => ({ ...prev, sofrIndex: e.target.value, sofrCurveSource: "pensford" }))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700"
          >
            {Object.entries(CURVE_INDICES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {!pensford && (
            <button
              type="button"
              onClick={() => onChange((prev) => ({ ...prev, sofrCurveSource: "pensford" }))}
              className="text-xs font-medium text-blue-600 border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 bg-white"
            >
              Use {FORWARD_CURVE_SOURCE} curve ({fmtISO(FORWARD_CURVE_AS_OF)})
            </button>
          )}
          <button
            type="button"
            onClick={handleFetch}
            disabled={loading}
            className="text-xs font-medium text-blue-600 border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 bg-white disabled:opacity-50"
          >
            {loading ? "Fetching…" : "Fetch CME SOFR futures"}
          </button>
          {hasCurve && (
            <button
              type="button"
              onClick={() => onChange((prev) => ({ ...prev, sofrCurveSource: "manual", sofrCurve: [] }))}
              className="text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              Reset to flat
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {Array.from({ length: hold }, (_, i) => {
          const sofr = sofrForYear(inputs, i + 1);
          const capped = inputs.capStrikePct > 0 && sofr > inputs.capStrikePct;
          const allIn = (capped ? inputs.capStrikePct : sofr) + inputs.spreadPct;
          return (
            <div key={i} className="flex flex-col gap-1">
              <NumField
                label={`Yr ${i + 1} (${acqYear + i}–${String(acqYear + i + 1).slice(2)})`}
                suffix="%"
                step={0.05}
                value={+sofr.toFixed(4)}
                onChange={(v) => setYear(i, v)}
              />
              <span className={`text-xs tabular-nums ${capped ? "text-blue-700 font-medium" : "text-gray-500"}`}>
                All-in {allIn.toFixed(2)}%{capped ? " (capped)" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QuickUnderwrite({ inputs, onChange, linked = false, onLinkChange }) {
  const set = (field) => (v) => onChange((prev) => ({ ...prev, [field]: v }));
  const r = useMemo(() => quickUnderwrite(inputs), [inputs]);
  const grid = useMemo(() => quickSensitivity(inputs, GROWTH_STEPS, EXIT_CAP_STEPS), [inputs]);

  const rows = [
    { label: "NOI", key: "noi" },
    { label: "Debt service", key: "debtService", neg: true },
    { label: "Asset mgmt fee", key: "amFee", neg: true },
    { label: "Rate cap", key: "capCost", neg: true },
    { label: "Extension fee", key: "extFee", neg: true },
    { label: "Sale price", key: "salePrice" },
    { label: "Sale costs", key: "saleCosts", neg: true },
    { label: "Loan payoff", key: "loanPayoff", neg: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Quick Underwrite</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          NOI-driven model: forward 12-month NOI, annual growth, floating-rate loan with rate caps, sale at
          final-year NOI ÷ exit cap. Independent of the rent-roll inputs on the left.
        </p>
      </div>

      {onLinkChange && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
            linked ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-gray-50 border-gray-200 text-gray-600"
          }`}
        >
          <span>
            {linked
              ? "Linked: Debt, Stress Testing, Sensitivity, Asset Return and Portfolio Return all use this deal (direct NOI)."
              : "Not linked: the other tabs use this deal's rent-roll inputs from the left panel."}
          </span>
          <button
            type="button"
            onClick={() => onLinkChange(!linked)}
            className="font-medium text-blue-700 border border-blue-200 bg-white hover:border-blue-300 rounded-md px-2.5 py-1"
          >
            {linked ? "Unlink" : "Use this deal on all tabs"}
          </button>
        </div>
      )}

      {/* Inputs */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Group title="Acquisition">
          <NumField label="Purchase price" prefix="$" step={100000} value={inputs.purchasePrice} onChange={set("purchasePrice")} />
          <NumField label="Closing costs" prefix="$" step={10000} value={inputs.closingCosts} onChange={set("closingCosts")} />
          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Acquisition date</label>
            <input
              type="date"
              value={inputs.acquisitionDate ?? ""}
              onChange={(e) => e.target.value && set("acquisitionDate")(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 bg-white"
            />
          </div>
          <NumField label="Capex" prefix="$" step={10000} value={inputs.capex} onChange={set("capex")} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Capex funded by</label>
            <select
              value={inputs.capexLenderFunded ? "lender" : "equity"}
              onChange={(e) => set("capexLenderFunded")(e.target.value === "lender")}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="lender">Lender</option>
              <option value="equity">Equity</option>
            </select>
          </div>
        </Group>

        <Group title="Operations & exit">
          <NumField label="Yr 1 NOI (fwd 12m)" prefix="$" step={10000} value={inputs.noiYear1} onChange={set("noiYear1")} />
          <NumField label="NOI growth yr 2+" suffix="%" step={1} value={inputs.noiGrowthPct} onChange={set("noiGrowthPct")} />
          <NumField label="Hold" suffix="yrs" step={1} value={inputs.holdYears} onChange={set("holdYears")} />
          <NumField label="Exit cap" suffix="%" step={0.25} value={inputs.exitCapPct} onChange={set("exitCapPct")} />
          <NumField label="Sale costs" suffix="%" step={0.5} value={inputs.saleCostPct} onChange={set("saleCostPct")} />
          <NumField label="AM fee (on equity)" suffix="%" step={0.25} value={inputs.amFeePct} onChange={set("amFeePct")} />
        </Group>

        <Group title="Loan">
          <NumField label="LTV (of price)" suffix="%" step={1} value={inputs.ltvPct} onChange={set("ltvPct")} />
          <NumField label="Amortization" suffix="yrs" step={5} value={inputs.amortYears} onChange={set("amortYears")} />
          <NumField label="SOFR (flat / spot)" suffix="%" step={0.05} value={inputs.sofrPct} onChange={set("sofrPct")} />
          <NumField label="Spread" suffix="%" step={0.05} value={inputs.spreadPct} onChange={set("spreadPct")} />
          <NumField label="Initial term" suffix="yrs" step={1} value={inputs.initialTermYears} onChange={set("initialTermYears")} />
          <NumField label="Extensions (count)" step={1} value={inputs.extensionCount} onChange={set("extensionCount")} />
          <NumField label="Extension term" suffix="yrs" step={1} value={inputs.extensionTermYears} onChange={set("extensionTermYears")} />
          <NumField label="Extension fee" prefix="$" step={10000} value={inputs.extensionFee} onChange={set("extensionFee")} />
        </Group>

        <Group title="Rate cap">
          <NumField label="Cap strike (0 = none)" suffix="%" step={0.05} value={inputs.capStrikePct} onChange={set("capStrikePct")} />
          <NumField label="Initial cap cost" prefix="$" step={10000} value={inputs.initialCapCost} onChange={set("initialCapCost")} />
          <NumField label="Cap term" suffix="yrs" step={1} value={inputs.capTermYears} onChange={set("capTermYears")} />
          <NumField label="Replacement cap" prefix="$" step={10000} value={inputs.replacementCapCost} onChange={set("replacementCapCost")} />
        </Group>
      </div>
      <p className="text-xs text-gray-400 -mt-3">
        Amortization 0 = interest-only. Caps are held every year of the hold, so SOFR above the strike is capped.
      </p>

      <ForwardCurve inputs={inputs} onChange={onChange} />

      {/* Headline */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat label="IRR" value={pct(r.irr)} tone={r.irr < 0 ? "bad" : "default"} />
        <Stat label="Equity multiple" value={mult(r.equityMultiple)} tone={r.equityMultiple < 1 ? "bad" : "default"} />
        <Stat label="Profit" value={usd(r.profit)} tone={r.profit < 0 ? "bad" : "default"} />
        <Stat label="Equity" value={usd(r.equity)} />
        <Stat label="Loan" value={usd(r.loan)} />
        <Stat
          label="All-in rate"
          value={r.rateMin === r.rateMax ? pct(r.rate * 100, 2) : `${(r.rateMin * 100).toFixed(2)}–${pct(r.rateMax * 100, 2)}`}
        />
        <Stat label="Going-in cap" value={pct(r.goingInCap, 2)} />
        <Stat label="Yr 1 DSCR" value={mult(r.years[0].dscr)} tone={r.years[0].dscr < 1.25 ? "bad" : "default"} />
      </div>

      {r.warnings.length > 0 && (
        <ul className="space-y-1.5">
          {r.warnings.map((w) => (
            <li key={w} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {w}
            </li>
          ))}
        </ul>
      )}

      {/* Cash flows */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200">
              <th className="text-left font-medium py-2 pr-4">Equity cash flows</th>
              <th className="text-right font-medium py-2 px-3">Year 0</th>
              {r.years.map((y) => (
                <th key={y.year} className="text-right font-medium py-2 px-3">Year {y.year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-gray-100">
                <td className="py-1.5 pr-4 text-gray-600">{row.label}</td>
                <td className="py-1.5 px-3 text-right text-gray-300">—</td>
                {r.years.map((y) => (
                  <td key={y.year} className="py-1.5 px-3 text-right text-gray-800">
                    {y[row.key] ? usd(row.neg ? -y[row.key] : y[row.key]) : <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-b border-gray-100">
              <td className="py-1.5 pr-4 text-gray-600">Equity invested</td>
              <td className="py-1.5 px-3 text-right text-gray-800">{usd(-r.equity)}</td>
              {r.years.map((y) => (
                <td key={y.year} className="py-1.5 px-3 text-right text-gray-300">—</td>
              ))}
            </tr>
            <tr className="font-semibold">
              <td className="py-2 pr-4 text-gray-900">Net cash flow</td>
              {r.flows.map((f, i) => (
                <td key={i} className={`py-2 px-3 text-right ${f < 0 ? "text-red-600" : "text-gray-900"}`}>{usd(f)}</td>
              ))}
            </tr>
            <tr className="text-xs text-gray-500">
              <td className="py-1 pr-4">SOFR / all-in rate</td>
              <td />
              {r.years.map((y) => (
                <td key={y.year} className="py-1 px-3 text-right">
                  {pct(y.sofr, 2)} / {pct(y.rate * 100, 2)}
                </td>
              ))}
            </tr>
            <tr className="text-xs text-gray-500">
              <td className="py-1 pr-4">DSCR / debt yield</td>
              <td />
              {r.years.map((y) => (
                <td key={y.year} className="py-1 px-3 text-right">
                  {mult(y.dscr)} / {pct(y.debtYield)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sensitivity */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">IRR / equity multiple: NOI growth × exit cap</h3>
        <p className="text-xs text-gray-500 mb-2">All other inputs as above. Outlined cell is the current case when it falls on the grid.</p>
        <div className="overflow-x-auto">
          <table className="text-xs tabular-nums border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-gray-500 font-medium pr-2">Growth ↓ / Exit cap →</th>
                {EXIT_CAP_STEPS.map((c) => (
                  <th key={c} className="text-center text-gray-500 font-medium px-2">{c.toFixed(2)}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROWTH_STEPS.map((g, i) => (
                <tr key={g}>
                  <td className="text-gray-600 font-medium pr-2">{g}%</td>
                  {grid[i].map((cell, j) => {
                    const current = g === inputs.noiGrowthPct && EXIT_CAP_STEPS[j] === inputs.exitCapPct;
                    return (
                      <td
                        key={j}
                        className={`text-center rounded-md px-2 py-1.5 ${irrCellClass(cell.irr)} ${current ? "ring-2 ring-blue-600" : ""}`}
                      >
                        <div className="font-semibold">{pct(cell.irr)}</div>
                        <div className="opacity-80">{mult(cell.em)}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
