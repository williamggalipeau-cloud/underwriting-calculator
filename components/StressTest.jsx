"use client";

import { useMemo, useState } from "react";
import { underwrite } from "@/lib/calculations";

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt(n, d = 0) {
  if (!isFinite(n) || n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n, d = 1) { return isFinite(n) && n != null ? `${fmt(n, d)}%` : "—"; }
function fmtX(n, d = 2) { return isFinite(n) && n != null ? `${fmt(n, d)}x` : "—"; }
function fmtM(n) {
  if (!isFinite(n) || n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${fmt(n / 1_000_000, 2)}M`;
  if (Math.abs(n) >= 1_000) return `$${fmt(n / 1_000, 1)}k`;
  return `$${fmt(n)}`;
}

// Bisection IRR
function calcIRR(cashFlows) {
  const hasPos = cashFlows.some((v) => v > 0);
  const hasNeg = cashFlows.some((v) => v < 0);
  if (!hasPos || !hasNeg) return NaN;
  function npv(r) { return cashFlows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0); }
  let lo = -0.9999, hi = 10;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(hi - lo) < 1e-10) return mid * 100;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

// Apply stress factors to a copy of inputs
function applyStress(inputs, factors) {
  const stressed = { ...inputs };

  // ── Vacancy increase ──────────────────────────────────────────────────────
  // Asset-level (no-unit path) + unit fallbacks (renewal prob / downtime)
  stressed.vacancyPct = (inputs.vacancyPct ?? 0) + factors.vacancyDelta;
  // Reduce renewal probability (unit fallback) proportionally
  stressed.renewalProbabilityPct = Math.max(
    0,
    (inputs.renewalProbabilityPct ?? 60) - factors.vacancyDelta * 2
  );
  // Increase downtime between leases
  stressed.downtimeBetweenLeases =
    (inputs.downtimeBetweenLeases ?? 2) + factors.vacancyDelta * 0.15;

  // ── Rent escalation reduction ─────────────────────────────────────────────
  stressed.annualRentEscalationPct = Math.max(
    0,
    (inputs.annualRentEscalationPct ?? 3) - factors.rentEscDelta
  );

  // ── Interest rate rise (bps → %) ─────────────────────────────────────────
  const rateDeltaPct = factors.rateDelta / 100;
  if (inputs.floatingRate) {
    stressed.spreadPct = (inputs.spreadPct ?? 0) + rateDeltaPct;
  } else {
    stressed.interestRatePct = (inputs.interestRatePct ?? 0) + rateDeltaPct;
  }

  // ── Operating expense overrun ─────────────────────────────────────────────
  const opexMult = 1 + factors.opexDelta / 100;
  stressed.realEstateTaxPSF = (inputs.realEstateTaxPSF ?? 0) * opexMult;
  stressed.insurancePSF = (inputs.insurancePSF ?? 0) * opexMult;
  stressed.utilitiesPSF = (inputs.utilitiesPSF ?? 0) * opexMult;
  stressed.maintenancePSF = (inputs.maintenancePSF ?? 0) * opexMult;
  stressed.janitorialPSF = (inputs.janitorialPSF ?? 0) * opexMult;
  stressed.managementFeePct = (inputs.managementFeePct ?? 0) * opexMult;
  stressed.capitalReservesPSF = (inputs.capitalReservesPSF ?? 0) * opexMult;
  stressed.leasingFeesPSF = (inputs.leasingFeesPSF ?? 0) * opexMult;

  // ── Direct-NOI deals: rent-roll levers don't drive NOI, so apply the
  // vacancy shock as a % cut to NOI and the escalation cut to NOI growth.
  // (Opex overrun has no rent-roll expenses to act on in this mode.)
  if (inputs.noiOverrideEnabled) {
    stressed.noiYear1 = (inputs.noiYear1 ?? 0) * (1 - factors.vacancyDelta / 100);
    stressed.noiGrowthPct = (inputs.noiGrowthPct ?? 0) - factors.rentEscDelta;
  }
  stressed.capexBudget = (inputs.capexBudget ?? 0) * (1 + factors.constructionDelta / 100);

  // ── Exit cap rate expansion ───────────────────────────────────────────────
  stressed.exitCapRatePct = (inputs.exitCapRatePct ?? 0) + factors.exitCapDelta;

  // ── Construction / TI overrun ─────────────────────────────────────────────
  const conMult = 1 + factors.constructionDelta / 100;
  if (inputs.constructionCosts) {
    const cc = { ...inputs.constructionCosts };
    const psf_keys = [
      "demolition", "partitionWalls", "electrical", "plumbing", "hvac",
      "flooring", "painting", "lighting", "doorsHardware", "overheadDoors",
      "landscaping", "roofing", "signage", "miscConstruction",
    ];
    psf_keys.forEach((k) => { if (cc[k] != null) cc[k] *= conMult; });
    stressed.constructionCosts = cc;
  }
  stressed.tiPerSFNew = (inputs.tiPerSFNew ?? 0) * conMult;
  stressed.tiPerSFRenewal = (inputs.tiPerSFRenewal ?? 0) * conMult;

  return stressed;
}

// Sum irrFlows year-by-year
function aggregateFlows(deals) {
  if (!deals.length) return [];
  const maxLen = Math.max(...deals.map((d) => d.irrFlows.length));
  const combined = Array(maxLen).fill(0);
  for (const deal of deals) deal.irrFlows.forEach((v, i) => { combined[i] += v; });
  return combined;
}

// ── Factor slider input ───────────────────────────────────────────────────────
function FactorRow({ label, sublabel, value, onChange, min, max, step = 1, suffix }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-48 shrink-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-3 flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full accent-blue-600 cursor-pointer"
        />
        <div className="flex items-center gap-1 w-28">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= min && v <= max) onChange(v);
            }}
            className="w-16 text-right text-sm font-mono border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <span className="text-xs text-gray-400 w-8">{suffix}</span>
        </div>
      </div>
      <div className="w-20 text-right">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
          value === 0 ? "bg-gray-100 text-gray-400" :
          value > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
        }`}>
          {value === 0 ? "Base" : value > 0 ? `+${value}${suffix}` : `${value}${suffix}`}
        </span>
      </div>
    </div>
  );
}

// ── Delta badge ───────────────────────────────────────────────────────────────
function Delta({ base, stressed, format = "pct", higherIsBetter = true }) {
  const delta = isFinite(stressed) && isFinite(base) ? stressed - base : NaN;
  const isGood = higherIsBetter ? delta >= 0 : delta <= 0;
  const sign = delta >= 0 ? "+" : "";
  const display = format === "pct"
    ? `${sign}${isFinite(delta) ? delta.toFixed(1) : "—"}%`
    : format === "x"
    ? `${sign}${isFinite(delta) ? delta.toFixed(2) : "—"}x`
    : `${sign}${isFinite(delta) ? fmtM(delta) : "—"}`;

  if (!isFinite(delta)) return <span className="text-gray-300">—</span>;
  return (
    <span className={`text-xs font-medium ${delta === 0 ? "text-gray-400" : isGood ? "text-emerald-600" : "text-red-600"}`}>
      {display}
    </span>
  );
}

// ── Metric cell ───────────────────────────────────────────────────────────────
function MetricPair({ base, stressed, format = "pct", threshold, higherIsBetter = true }) {
  const formatVal = (v) => {
    if (!isFinite(v)) return "—";
    if (format === "pct") return `${v.toFixed(1)}%`;
    if (format === "x") return `${v.toFixed(2)}x`;
    if (format === "$") return fmtM(v);
    return v;
  };
  const good = isFinite(stressed) && (higherIsBetter ? stressed >= threshold : stressed <= threshold);
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs text-gray-400">{formatVal(base)}</span>
        <span className={`text-sm font-semibold ${isFinite(stressed) ? (good ? "text-emerald-700" : "text-red-600") : "text-gray-400"}`}>
          {formatVal(stressed)}
        </span>
        <Delta base={base} stressed={stressed} format={format} higherIsBetter={higherIsBetter} />
      </div>
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FACTORS = {
  vacancyDelta: 0, rentEscDelta: 0, rateDelta: 0,
  exitCapDelta: 0, opexDelta: 0, constructionDelta: 0,
};

export default function StressTest({ inputs, results, savedDeals, onStressedDealsChange }) {
  const [selectedId, setSelectedId] = useState("active");
  const [factorsById, setFactorsById] = useState({});

  const currentFactors = factorsById[selectedId] ?? DEFAULT_FACTORS;
  const setFactor = (key) => (val) => setFactorsById((prev) => ({
    ...prev,
    [selectedId]: { ...(prev[selectedId] ?? DEFAULT_FACTORS), [key]: val },
  }));
  const resetCurrentFactors = () => setFactorsById((prev) => ({ ...prev, [selectedId]: DEFAULT_FACTORS }));

  const isBaseCase = Object.values(currentFactors).every((v) => v === 0);

  // ── Selected asset base inputs & results ─────────────────────────────────
  const selectedInputs = useMemo(() => {
    if (selectedId === "active") return inputs;
    return savedDeals.find((d) => d.id === selectedId)?.inputs ?? inputs;
  }, [selectedId, savedDeals, inputs]);

  const selectedBaseResults = useMemo(() => {
    if (selectedId === "active") return results;
    return underwrite(selectedInputs);
  }, [selectedId, selectedInputs, results]);

  const baseExitCap = selectedInputs.exitCapRatePct ?? 0;

  // ── Stress selected asset ─────────────────────────────────────────────────
  const stressedSelectedInputs = useMemo(
    () => applyStress(selectedInputs, currentFactors),
    [selectedInputs, currentFactors]
  );
  const stressedSelectedResults = useMemo(
    () => underwrite(stressedSelectedInputs),
    [stressedSelectedInputs]
  );

  // ── Stress each saved deal (per-deal factors) ─────────────────────────────
  const stressedSavedDeals = useMemo(() => {
    return savedDeals.map((deal) => {
      const dealFactors = factorsById[deal.id] ?? DEFAULT_FACTORS;
      const si = applyStress(deal.inputs, dealFactors);
      const sr = underwrite(si);
      return {
        ...deal,
        stressedInputs: si,
        stressedIrrFlows: sr.irrFlows ?? [],
        stressedMetrics: {
          irr: sr.returns.irr,
          equityMultiple: sr.returns.equityMultiple,
          yearOneCashOnCash: sr.returns.yearOneCashOnCash,
          equityRequired: sr.debt.equityRequired,
          dscr: sr.debt.dscr,
        },
      };
    });
  }, [savedDeals, factorsById]);

  // Portfolio-level aggregate flows
  const basePortfolioFlows = useMemo(
    () => aggregateFlows(savedDeals.map((d) => ({ irrFlows: d.irrFlows }))),
    [savedDeals]
  );
  const stressedPortfolioFlows = useMemo(
    () => aggregateFlows(stressedSavedDeals.map((d) => ({ irrFlows: d.stressedIrrFlows }))),
    [stressedSavedDeals]
  );
  const basePortfolioIRR   = useMemo(() => calcIRR(basePortfolioFlows), [basePortfolioFlows]);
  const stressedPortfolioIRR = useMemo(() => calcIRR(stressedPortfolioFlows), [stressedPortfolioFlows]);

  const hasPortfolio = savedDeals.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Return Stress Testing</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Adjust risk factors below to see how returns shift under adverse scenarios.
            Base case values shown in grey; stressed values in colour.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isBaseCase && (
            <button
              type="button"
              onClick={resetCurrentFactors}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              Reset
            </button>
          )}
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">{inputs.propertyName || "Active Deal"}</option>
            {savedDeals.map((d) => (
              <option key={d.id} value={d.id}>{d.inputs?.propertyName || "Unnamed"}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Risk Factor Controls ─────────────────────────────────────────────── */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Risk Factor Adjustments</h3>

        <FactorRow
          label="Higher Unit Vacancy"
          sublabel="Added to base vacancy rate"
          value={currentFactors.vacancyDelta}
          onChange={setFactor("vacancyDelta")}
          min={0} max={30} step={1} suffix="%"
        />
        <div className="border-t border-gray-200" />
        <FactorRow
          label="Lower Rent Increases"
          sublabel="Subtracted from annual escalation"
          value={currentFactors.rentEscDelta}
          onChange={setFactor("rentEscDelta")}
          min={0} max={5} step={0.25} suffix="%"
        />
        <div className="border-t border-gray-200" />
        <FactorRow
          label="Interest Rate Rise"
          sublabel="Added to rate (floating spread or fixed rate)"
          value={currentFactors.rateDelta}
          onChange={setFactor("rateDelta")}
          min={0} max={300} step={25} suffix=" bps"
        />
        <div className="border-t border-gray-200" />
        <FactorRow
          label="Exit Cap Rate Expansion"
          sublabel={`Base: ${baseExitCap.toFixed(2)}% → stressed: ${(baseExitCap + currentFactors.exitCapDelta).toFixed(2)}%`}
          value={currentFactors.exitCapDelta}
          onChange={setFactor("exitCapDelta")}
          min={0} max={3} step={0.25} suffix="%"
        />
        <div className="border-t border-gray-200" />
        <FactorRow
          label="Operating Expense Overrun"
          sublabel="Applied to all opex line items"
          value={currentFactors.opexDelta}
          onChange={setFactor("opexDelta")}
          min={0} max={50} step={5} suffix="%"
        />
        <div className="border-t border-gray-200" />
        <FactorRow
          label="Construction / TI Overrun"
          sublabel="Applied to construction and TI costs"
          value={currentFactors.constructionDelta}
          onChange={setFactor("constructionDelta")}
          min={0} max={50} step={5} suffix="%"
        />
      </div>

      {/* ── Selected Asset: Base vs. Stressed ──────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {selectedInputs.propertyName || "Unnamed"}
          {isBaseCase && <span className="ml-2 text-xs font-normal text-gray-400">(no stress applied)</span>}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "IRR",
              base: selectedBaseResults.returns.irr,
              stressed: stressedSelectedResults.returns.irr,
              format: "pct",
              threshold: 14,
            },
            {
              label: "Eq. Multiple",
              base: selectedBaseResults.returns.equityMultiple,
              stressed: stressedSelectedResults.returns.equityMultiple,
              format: "x",
              threshold: 2,
            },
            {
              label: "CoC Year 1",
              base: selectedBaseResults.returns.yearOneCashOnCash,
              stressed: stressedSelectedResults.returns.yearOneCashOnCash,
              format: "pct",
              threshold: 7,
            },
            {
              label: "DSCR",
              base: selectedBaseResults.debt.dscr,
              stressed: stressedSelectedResults.debt.dscr,
              format: "x",
              threshold: 1.25,
            },
          ].map(({ label, base, stressed, format, threshold }) => {
            const fmt_ = (v) => format === "pct" ? fmtPct(v) : format === "x" ? fmtX(v) : fmtM(v);
            const delta = isFinite(stressed) && isFinite(base) ? stressed - base : NaN;
            const sign = delta >= 0 ? "+" : "";
            const deltaStr = format === "pct"
              ? `${sign}${isFinite(delta) ? delta.toFixed(1) : "—"}%`
              : `${sign}${isFinite(delta) ? delta.toFixed(2) : "—"}x`;
            const good = isFinite(stressed) && stressed >= threshold;
            const worsened = isFinite(delta) && delta < 0;
            return (
              <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-gray-300 tabular-nums">{fmt_(base)}</p>
                    <p className={`text-xl font-bold tabular-nums ${good ? "text-emerald-700" : "text-red-600"}`}>
                      {fmt_(stressed)}
                    </p>
                  </div>
                  {!isBaseCase && isFinite(delta) && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      worsened ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                    }`}>
                      {deltaStr}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Portfolio: Base vs Stressed ──────────────────────────────────────── */}
      {hasPortfolio && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Portfolio Impact
              <span className="ml-2 text-xs font-normal text-gray-400">({savedDeals.length} saved asset{savedDeals.length !== 1 ? "s" : ""})</span>
            </h3>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-400">Base Portfolio IRR</p>
                <p className={`text-base font-bold tabular-nums ${isFinite(basePortfolioIRR) && basePortfolioIRR >= 14 ? "text-emerald-700" : "text-red-600"}`}>
                  {fmtPct(basePortfolioIRR)}
                </p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-right">
                <p className="text-xs text-gray-400">Stressed Portfolio IRR</p>
                <p className={`text-base font-bold tabular-nums ${isFinite(stressedPortfolioIRR) && stressedPortfolioIRR >= 14 ? "text-emerald-700" : "text-red-600"}`}>
                  {isBaseCase ? <span className="text-gray-300">—</span> : fmtPct(stressedPortfolioIRR)}
                </p>
              </div>
              {!isBaseCase && isFinite(stressedPortfolioIRR) && isFinite(basePortfolioIRR) && (
                <>
                  <div className="w-px h-8 bg-gray-200" />
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Portfolio IRR Impact</p>
                    <p className={`text-base font-bold tabular-nums ${stressedPortfolioIRR >= basePortfolioIRR ? "text-emerald-700" : "text-red-600"}`}>
                      {(() => {
                        const d = stressedPortfolioIRR - basePortfolioIRR;
                        return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
                      })()}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Per-asset comparison table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Asset</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">IRR</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Eq. Multiple</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">CoC Y1</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">DSCR</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Equity Req.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stressedSavedDeals.map((deal) => {
                  const b = deal.metrics;
                  const s = deal.stressedMetrics;
                  return (
                    <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-gray-800">{deal.inputs.propertyName || "Unnamed"}</p>
                        {deal.inputs.fundName && (
                          <p className="text-xs text-gray-400">{deal.inputs.fundName}</p>
                        )}
                      </td>
                      <MetricPair base={b.irr} stressed={s.irr} format="pct" threshold={14} />
                      <MetricPair base={b.equityMultiple} stressed={s.equityMultiple} format="x" threshold={2} />
                      <MetricPair base={b.yearOneCashOnCash} stressed={s.yearOneCashOnCash} format="pct" threshold={7} />
                      <MetricPair base={b.dscr ?? NaN} stressed={s.dscr} format="x" threshold={1.25} />
                      <MetricPair base={b.equityRequired} stressed={s.equityRequired} format="$" threshold={0} higherIsBetter={false} />
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-3 py-2 font-semibold text-gray-700">Portfolio</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs text-gray-400">{fmtPct(basePortfolioIRR)}</span>
                      <span className={`text-sm font-bold ${isFinite(stressedPortfolioIRR) && stressedPortfolioIRR >= 14 ? "text-emerald-700" : "text-red-600"}`}>
                        {isBaseCase ? fmtPct(basePortfolioIRR) : fmtPct(stressedPortfolioIRR)}
                      </span>
                      {!isBaseCase && <Delta base={basePortfolioIRR} stressed={stressedPortfolioIRR} format="pct" />}
                    </div>
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-gray-400">
            Grey = base case · Colour = stressed · Stressed IRR computed by re-running the full underwriting model with adjusted inputs.
            Portfolio IRR derived from year-by-year aggregation of all asset cash flows.
          </p>
        </div>
      )}

      {!hasPortfolio && (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm font-medium text-gray-500">No portfolio assets saved</p>
          <p className="text-xs text-gray-400 mt-1">
            Save deals in the Portfolio Return tab to see portfolio-level stress impact here.
          </p>
        </div>
      )}
    </div>
  );
}
