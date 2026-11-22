"use client";

import { useState } from "react";
import { capSchedule, capStrikeByYear } from "@/lib/quickUnderwrite";

const usd = (n) => (n == null || !isFinite(n) ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const pct = (n) => (n == null || !isFinite(n) || n <= 0 ? "—" : `${n.toFixed(2)}%`);
const fmtISO = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};
function addYearsISO(iso, n) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const out = new Date(Date.UTC(y + n, m - 1, d));
  if (out.getUTCMonth() !== m - 1) out.setUTCDate(0);
  return out.toISOString().slice(0, 10);
}

function Num({ label, value, onChange, step = 1, prefix, suffix, readOnly }) {
  const [draft, setDraft] = useState(null);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-blue-500">
        {prefix && <span className="pl-2 text-xs text-gray-400">{prefix}</span>}
        <input
          type="number"
          step={step}
          disabled={readOnly}
          value={draft ?? value ?? ""}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseFloat(e.target.value);
            if (isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
          className="w-full rounded-lg px-2 py-1.5 text-sm tabular-nums outline-none disabled:bg-gray-50"
        />
        {suffix && <span className="pr-2 text-xs text-gray-400 whitespace-nowrap">{suffix}</span>}
      </div>
    </label>
  );
}

// Free-text cell saved on blur (or Enter) so each keystroke isn't an edit.
function TextCell({ value, onCommit, placeholder, readOnly }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft != null && draft.trim() !== (value ?? "")) onCommit(draft.trim());
    setDraft(null);
  };
  return (
    <input
      type="text"
      disabled={readOnly}
      value={draft ?? value ?? ""}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-full min-w-[9rem] rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-blue-400 disabled:bg-gray-50"
    />
  );
}

function Toggle({ label, value, options, onChange, readOnly }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
        {options.map(([k, l]) => (
          <button
            key={k}
            type="button"
            disabled={readOnly}
            onClick={() => onChange(k)}
            className={`flex-1 py-1.5 font-medium ${value === k ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"} disabled:cursor-not-allowed`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

// Rate cap settings and the full cap schedule for the active deal.
// cap: the cap settings (SOFR strike, term, renewal strike, pricing) with the
// deal's hold, acquisition date and spread. inputs: the full-model inputs,
// whose cap fields (all-in strike by year, premium, replacement costs) are
// what the cash flows use. loanAmount: notional for market pricing.
export default function RateCapSchedule({ cap, inputs, loanAmount, onChange, readOnly }) {
  if (!cap || !onChange) return null;
  const set = (k) => (v) => onChange({ [k]: v });
  const market = (cap.capPricing ?? "market") === "market";
  const hasCap = inputs.hedgingType === "cap" && (cap.capStrikePct ?? 0) > 0;
  const sched = capSchedule(cap, loanAmount);
  const sofrStrikes = capStrikeByYear(cap);
  const hold = Math.max(1, Math.round(inputs.holdPeriodYears ?? cap.holdYears ?? 1));
  const allIn = inputs.capStrikeRatesByYear ?? [];
  const repl = inputs.capReplacementCosts ?? [];
  const acq = inputs.acquisitionDate || cap.acquisitionDate;
  const buys = new Set([0, ...sched.replacements.map((r) => r.year)]);
  const rows = Array.from({ length: hold }, (_, i) => {
    const bought = buys.has(i);
    // capReplacementCosts[y − 1] is the cap bought at the end of hold year y,
    // i.e. at the start of year y + 1.
    const cost = !hasCap ? 0 : i === 0 ? inputs.capPremiumAmount ?? sched.initial : repl[i - 1] ?? 0;
    return {
      year: i + 1,
      from: addYearsISO(acq, i),
      bought,
      sofrStrike: hasCap ? sofrStrikes[i] : 0,
      allInStrike: hasCap ? allIn[i] ?? inputs.capStrikeRatePct : 0,
      cost: bought ? cost : 0,
    };
  });
  const total = rows.reduce((s, r) => s + (r.cost || 0), 0);
  // Who wrote each cap, by the hold year it was bought in ("1" = initial cap).
  const providers = cap.capProviders ?? {};
  const setProvider = (year, name) => {
    const next = { ...providers };
    if (name) next[year] = name;
    else delete next[year];
    onChange({ capProviders: next });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white" data-testid="rate-cap">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-700">Rate cap</h3>
        <span className="text-[11px] text-gray-400">
          {hasCap ? `${usd(sched.notional ?? loanAmount)} notional (loan) · ${cap.capTermYears}-yr caps held every year of the hold` : "No cap (strike 0)"}
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Num label="Initial strike (SOFR, 0 = none)" suffix="%" step={0.05} value={cap.capStrikePct} onChange={set("capStrikePct")} readOnly={readOnly} />
        <Num label="Cap term" suffix="yrs" step={1} value={cap.capTermYears} onChange={set("capTermYears")} readOnly={readOnly} />
        <Toggle label="Renewal strike" value={cap.capRenewalStrike ?? "reset"} options={[["reset", "Reset to market"], ["same", "Same as initial"]]} onChange={set("capRenewalStrike")} readOnly={readOnly} />
        <Toggle label="Cap pricing" value={cap.capPricing ?? "market"} options={[["market", "Market"], ["manual", "Manual quotes"]]} onChange={set("capPricing")} readOnly={readOnly} />
        {market ? (
          <Num label="Vol shift" suffix="bp" step={5} value={cap.capVolShiftBp ?? 0} onChange={set("capVolShiftBp")} readOnly={readOnly} />
        ) : (
          <>
            <Num label="Initial cap cost" prefix="$" step={10000} value={cap.initialCapCost} onChange={set("initialCapCost")} readOnly={readOnly} />
            <Num label="Replacement cap cost" prefix="$" step={10000} value={cap.replacementCapCost} onChange={set("replacementCapCost")} readOnly={readOnly} />
          </>
        )}
      </div>

      <div className="overflow-x-auto px-4 pb-3">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-gray-500">
            <tr className="border-b border-gray-200">
              <th className="py-1.5 pr-2 text-left font-medium">Hold year</th>
              <th className="py-1.5 pr-2 text-left font-medium">From</th>
              <th className="py-1.5 pr-2 text-left font-medium">Cap bought</th>
              <th className="py-1.5 pr-2 text-right font-medium">Strike (SOFR)</th>
              <th className="py-1.5 pr-2 text-right font-medium">All-in strike</th>
              <th className="py-1.5 pr-2 text-right font-medium">Cost</th>
              <th className="py-1.5 pl-2 text-left font-medium" title="The bank or institution that wrote (sold) the cap">Provider</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-b border-gray-100">
                <td className="py-1.5 pr-2 text-gray-700">Year {r.year}</td>
                <td className="py-1.5 pr-2 text-gray-500">{fmtISO(r.from)}</td>
                <td className="py-1.5 pr-2 text-gray-600">{!hasCap ? "—" : r.bought ? (r.year === 1 ? "Initial cap" : "Renewal") : "Held"}</td>
                <td className="py-1.5 pr-2 text-right">{pct(r.sofrStrike)}</td>
                <td className="py-1.5 pr-2 text-right">{pct(r.allInStrike)}</td>
                <td className="py-1.5 pr-2 text-right font-medium text-gray-800">{r.bought && hasCap ? usd(r.cost) : ""}</td>
                <td className="py-1.5 pl-2">
                  {r.bought && hasCap ? (
                    <TextCell value={providers[r.year]} onCommit={(v) => setProvider(r.year, v)} placeholder="e.g. bank name" readOnly={readOnly} />
                  ) : r.year > 1 && hasCap ? (
                    <span className="text-gray-400">{providers[[...rows].reverse().find((x) => x.bought && x.year < r.year)?.year] ?? ""}</span>
                  ) : null}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="py-1.5 pr-2 font-semibold text-gray-700">Total cap cost</td>
              <td className="py-1.5 pr-2 text-right font-semibold text-gray-900">{usd(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] text-gray-400 leading-relaxed">
          Each year&apos;s interest is capped at the all-in strike in force (SOFR strike + spread). The initial cap is paid at closing; renewals
          are paid when bought.{" "}
          {market
            ? `Priced off the forward curve with vol implied from Pensford's cap pricer${sched.valuationDate ? ` (as of ${fmtISO(sched.valuationDate)})` : ""}, on the loan amount.`
            : "Manual quotes: the costs entered above."}{" "}
          Changes here update the cash flows and returns on every tab.
        </p>
      </div>
    </div>
  );
}
