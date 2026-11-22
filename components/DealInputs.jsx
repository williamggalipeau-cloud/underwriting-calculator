"use client";

import { useState } from "react";
import { computeConstructionCostPSF, computeSellingCosts } from "@/lib/calculations";
import { fetchSofrCurve } from "@/lib/sofr";


function Field({ label, value, field, prefix, suffix, step = 1, min = 0, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
        {prefix && (
          <span className="px-3 py-2 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm font-medium">
            {prefix}
          </span>
        )}
        <input
          type={typeof value === "string" ? "text" : "number"}
          value={value}
          step={step}
          min={min}
          onChange={(e) =>
            onChange(
              field,
              typeof value === "string" ? e.target.value : parseFloat(e.target.value) || 0
            )
          }
          className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
        />
        {suffix && (
          <span className="px-3 py-2 bg-gray-50 border-l border-gray-200 text-gray-500 text-sm font-medium">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function ClosingCostsSection({ cc, purchasePrice, onChange }) {
  const rows = [
    { label: "Title Insurance (Owner)",  field: "titleInsuranceOwner",  step: 500  },
    { label: "Title Insurance (Lender)", field: "titleInsuranceLender", step: 500  },
    { label: "Transfer / Recording Tax", field: "transferTax",          step: 500  },
    { label: "Loan Origination",         field: "loanOrigination",      step: 500  },
    { label: "Acquisition Fee",          field: "acquisitionFee",       step: 500  },
    { label: "Legal Fees",               field: "legalFees",            step: 500  },
    { label: "Phase I ESA",              field: "environmentalReport",  step: 250  },
    { label: "Appraisal",                field: "appraisal",            step: 500  },
    { label: "Survey / PCA",             field: "surveyAndPCA",         step: 250  },
    { label: "Misc / Other",             field: "miscClosingCosts",     step: 500  },
  ];

  const total = rows.reduce((s, r) => s + (cc[r.field] ?? 0), 0);
  const totalPct = purchasePrice > 0 ? (total / purchasePrice) * 100 : 0;

  return (
    <div>
      <SectionHeader
        title="Closing Costs"
        subtitle={`Total: ${fmtK(total)} (${totalPct.toFixed(2)}% of purchase price)`}
      />
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide w-32">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.field} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">{row.label}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                    <span className="px-2 py-1.5 bg-gray-50 border-r border-gray-200 text-gray-400 text-xs">$</span>
                    <input
                      type="number"
                      aria-label={row.label}
                      value={cc[row.field] ?? 0}
                      step={row.step}
                      min={0}
                      onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                      className="flex-1 px-2 py-1.5 text-xs text-gray-900 bg-white outline-none min-w-0 w-24 text-right"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300">
              <td className="px-3 py-2 font-semibold text-gray-900 text-xs">Total Closing Costs</td>
              <td className="px-3 py-2 text-right font-bold text-gray-900 tabular-nums text-xs">{fmtK(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ConstructionCostsSection({ cc, avgUnitSF, onChange }) {
  if (!cc) return null;

  const lineItems = [
    { label: "Demolition & cleanup",     field: "demolition",      step: 0.05 },
    { label: "Partition walls",          field: "partitionWalls",  step: 0.05 },
    { label: "Electrical",               field: "electrical",      step: 0.10 },
    { label: "Plumbing",                 field: "plumbing",        step: 0.05 },
    { label: "HVAC / mechanical",        field: "hvac",            step: 0.10 },
    { label: "Flooring",                 field: "flooring",        step: 0.05 },
    { label: "Painting",                 field: "painting",        step: 0.05 },
    { label: "Lighting",                 field: "lighting",        step: 0.05 },
    { label: "Doors & hardware",         field: "doorsHardware",   step: 0.05 },
    { label: "Overhead / dock doors",    field: "overheadDoors",   step: 0.05 },
    { label: "Landscaping",              field: "landscaping",      step: 0.05 },
    { label: "Roofing",                  field: "roofing",          step: 0.05 },
    { label: "Signage",                  field: "signage",          step: 0.05 },
    { label: "Misc / allowance",         field: "miscConstruction", step: 0.05 },
  ];

  const markups = [
    { label: "General conditions",  field: "generalConditionsPct", step: 1 },
    { label: "Overhead & profit",   field: "overheadProfitPct",    step: 1 },
    { label: "Contingency",         field: "contingencyPct",       step: 1 },
  ];

  const base    = lineItems.reduce((s, r) => s + (cc[r.field] ?? 0), 0);
  const totalPSF = computeConstructionCostPSF(cc);
  const totalPerUnit = totalPSF * avgUnitSF;

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-2">
        Construction Costs — New Lease TI
        <span className="ml-2 font-bold text-blue-700">${totalPSF.toFixed(2)}/SF · {fmtK(totalPerUnit)}/unit</span>
      </p>
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="px-3 py-1.5 text-center font-semibold text-gray-500 uppercase tracking-wide w-24">$/SF</th>
              <th className="px-3 py-1.5 text-right font-semibold text-gray-500 uppercase tracking-wide w-20">$/Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineItems.map((row) => {
              const val = cc[row.field] ?? 0;
              return (
                <tr key={row.field} className="hover:bg-gray-50">
                  <td className="px-3 py-1 text-gray-700 font-medium">{row.label}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      <span className="px-2 py-1 bg-gray-50 border-r border-gray-200 text-gray-400 text-xs">$</span>
                      <input
                        type="number"
                        aria-label={row.label}
                        value={val}
                        step={row.step}
                        min={0}
                        onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-14"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums text-gray-500">{fmtK(val * avgUnitSF)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-3 py-1.5 text-xs font-semibold text-gray-700" colSpan={2}>Base subtotal</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs font-semibold text-gray-700">{fmtK(base * avgUnitSF)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Markup inputs */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-gray-100">
            {markups.map((row) => {
              const val = cc[row.field] ?? 0;
              return (
                <tr key={row.field} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-700 font-medium">{row.label}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      <input
                        type="number"
                        aria-label={row.label}
                        value={val}
                        step={row.step}
                        min={0}
                        onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-14"
                      />
                      <span className="px-2 py-1 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 text-xs">applied on total</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-blue-50 border-t-2 border-blue-200">
              <td className="px-3 py-1.5 text-xs font-bold text-blue-800" colSpan={2}>Total TI (new lease)</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-xs font-bold text-blue-800">{fmtK(totalPerUnit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ExitCostsSection({ sc, onChange }) {
  if (!sc) return null;

  const rows = [
    { label: "Broker Commission",   field: "brokerCommissionPct",  basis: "pct", step: 0.25 },
    { label: "Transfer / Recording Tax", field: "transferTaxPct",  basis: "pct", step: 0.05 },
    { label: "Title Insurance",     field: "titleInsurancePct",    basis: "pct", step: 0.05 },
    { label: "Legal Fees",          field: "legalFees",            basis: "fixed", step: 1000 },
    { label: "Misc / Other",        field: "miscDispositionCosts", basis: "fixed", step: 1000 },
  ];

  // Estimate exit value for display using a placeholder note
  // (actual exit value is computed in calculations; we show $/unit for reference)
  const totalPct = rows.filter(r => r.basis === "pct").reduce((s, r) => s + (sc[r.field] ?? 0), 0);
  const totalFixed = rows.filter(r => r.basis === "fixed").reduce((s, r) => s + (sc[r.field] ?? 0), 0);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-2">
        Disposition Costs
        <span className="ml-2 text-gray-400 font-normal">
          {totalPct.toFixed(2)}% of exit value + {fmtK(totalFixed)} fixed
        </span>
      </p>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="px-3 py-1.5 text-center font-semibold text-gray-500 uppercase tracking-wide w-32">Input</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const val = sc[row.field] ?? 0;
              return (
                <tr key={row.field} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-700 font-medium whitespace-nowrap">{row.label}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                      {row.basis === "fixed" && (
                        <span className="px-2 py-1 bg-gray-50 border-r border-gray-200 text-gray-400 text-xs">$</span>
                      )}
                      <input
                        type="number"
                        aria-label={row.label}
                        value={val}
                        step={row.step}
                        min={0}
                        onChange={(e) => onChange(row.field, parseFloat(e.target.value) || 0)}
                        className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-20"
                      />
                      {row.basis === "pct" && (
                        <span className="px-2 py-1 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs">% of sale</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WaterfallSection({ inputs, onChange }) {
  const wf = inputs.waterfall ?? {};
  const enabled = !!inputs.waterfallEnabled;

  const setWF = (field, value) =>
    onChange({ ...inputs, waterfall: { ...wf, [field]: value } });

  const setTier = (idx, field, value) => {
    const tiers = (wf.tiers ?? []).map((t, i) =>
      i === idx ? { ...t, [field]: value } : t
    );
    onChange({ ...inputs, waterfall: { ...wf, tiers } });
  };

  const addTier = () => {
    const existing = wf.tiers ?? [];
    // Insert before the last (catch-all) tier
    const last = existing[existing.length - 1];
    const prevThreshold = existing.length >= 2
      ? existing[existing.length - 2]?.irrThreshold ?? 0
      : 0;
    const newTier = { irrThreshold: prevThreshold + 5, lpSplit: 75, gpSplit: 25 };
    const newTiers = last?.irrThreshold === null
      ? [...existing.slice(0, -1), newTier, last]
      : [...existing, newTier];
    onChange({ ...inputs, waterfall: { ...wf, tiers: newTiers } });
  };

  const removeTier = (idx) => {
    const tiers = (wf.tiers ?? []).filter((_, i) => i !== idx);
    onChange({ ...inputs, waterfall: { ...wf, tiers } });
  };

  const gpPct = 100 - (wf.lpEquityPct ?? 90);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="LP / GP Waterfall" />
        <button
          type="button"
          onClick={() => onChange({ ...inputs, waterfallEnabled: !enabled })}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            enabled ? "bg-blue-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-4">
          {/* Equity split */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="LP Equity %"
              value={wf.lpEquityPct ?? 90}
              field="lpEquityPct"
              suffix="%"
              step={5}
              onChange={setWF}
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">GP Equity %</label>
              <div className="flex items-center border border-gray-100 rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-500 tabular-nums">{gpPct.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Pref & catch-up */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Pref. Return"
              value={wf.preferredReturnPct ?? 8}
              field="preferredReturnPct"
              suffix="% / yr"
              step={0.5}
              onChange={setWF}
            />
            <Field
              label="GP Catch-Up"
              value={wf.catchUpGpPct ?? 100}
              field="catchUpGpPct"
              suffix="% of dist"
              step={10}
              onChange={setWF}
            />
          </div>

          {/* Tier table */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Profit Tiers (based on project IRR)</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">IRR Up To</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide w-20">LP %</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide w-20">GP %</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(wf.tiers ?? []).map((tier, idx) => {
                    const isLast = tier.irrThreshold === null;
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5">
                          {isLast ? (
                            <span className="px-2 py-1 text-xs text-gray-400 italic">Above all thresholds</span>
                          ) : (
                            <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                              <input
                                type="number"
                                aria-label="IRR threshold"
                                value={tier.irrThreshold ?? ""}
                                step={1}
                                min={0}
                                onChange={(e) => setTier(idx, "irrThreshold", parseFloat(e.target.value) || 0)}
                                className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-14"
                              />
                              <span className="px-2 py-1 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs">%</span>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                            <input
                              type="number"
                              aria-label="LP split %"
                              value={tier.lpSplit ?? 80}
                              step={5}
                              min={0}
                              max={100}
                              onChange={(e) => {
                                const lp = parseFloat(e.target.value) || 0;
                                setTier(idx, "lpSplit", lp);
                                setTier(idx, "gpSplit", Math.max(0, 100 - lp));
                              }}
                              className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-12"
                            />
                            <span className="px-2 py-1 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                            <input
                              type="number"
                              aria-label="GP split %"
                              value={tier.gpSplit ?? 20}
                              step={5}
                              min={0}
                              max={100}
                              onChange={(e) => {
                                const gp = parseFloat(e.target.value) || 0;
                                setTier(idx, "gpSplit", gp);
                                setTier(idx, "lpSplit", Math.max(0, 100 - gp));
                              }}
                              className="flex-1 px-2 py-1 text-xs text-gray-900 bg-white outline-none min-w-0 w-12"
                            />
                            <span className="px-2 py-1 bg-gray-50 border-l border-gray-200 text-gray-400 text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {!isLast && (
                            <button
                              type="button"
                              aria-label="Remove tier"
                              onClick={() => removeTier(idx)}
                              className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addTier}
              className="mt-2 w-full px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              + Add tier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AM fee allocations ───────────────────────────────────────────────────────

function newAMFeeItem() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "", basis: "psf", value: 0 };
}

function AMFeeItems({ items = [], onChange }) {
  const set    = (id, field, value) => onChange(items.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  const remove = (id)               => onChange(items.filter((it) => it.id !== id));
  const add    = ()                 => onChange([...items, newAMFeeItem()]);

  const basisLabel = { psf: "$/SF/yr", fixed: "$/yr", pctEGR: "% EGR", pctEquity: "% Equity" };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="e.g. Asset mgmt. fee"
            value={item.label}
            onChange={(e) => set(item.id, "label", e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden w-40 shrink-0">
            {item.basis !== "pctEGR" && item.basis !== "pctEquity" && (
              <span className="px-2 py-2 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm">$</span>
            )}
            <input
              type="number"
              aria-label={`${item.label || "fee"} value`}
              value={item.value}
              step={item.basis === "psf" ? 0.05 : item.basis === "pctEGR" || item.basis === "pctEquity" ? 0.25 : 500}
              min={0}
              onChange={(e) => set(item.id, "value", parseFloat(e.target.value) || 0)}
              className="flex-1 px-2 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
            />
            <select
              aria-label="Basis"
              value={item.basis}
              onChange={(e) => set(item.id, "basis", e.target.value)}
              className="px-1 py-2 bg-gray-50 border-l border-gray-200 text-gray-500 text-xs outline-none cursor-pointer"
            >
              <option value="psf">$/SF/yr</option>
              <option value="fixed">$/yr</option>
              <option value="pctEGR">% EGR</option>
              <option value="pctEquity">% Equity</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => remove(item.id)}
            className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0"
            aria-label="Remove fee"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
      >
        + Add allocation
      </button>
    </div>
  );
}

// ─── Custom line items ────────────────────────────────────────────────────────
// PSF-based items (income + expense)

function newPSFItem(label = "") {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, psf: 0 };
}

function CustomPSFItems({ items = [], suffix = "/SF/yr", placeholder, addLabel, onChange }) {
  const set = (id, field, value) =>
    onChange(items.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  const remove = (id) => onChange(items.filter((it) => it.id !== id));
  const add    = ()    => onChange([...items, newPSFItem()]);

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="text"
            placeholder={placeholder}
            value={item.label}
            onChange={(e) => set(item.id, "label", e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden w-32 shrink-0">
            <span className="px-2 py-2 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm">$</span>
            <input
              type="number"
              aria-label={`${item.label || "item"} value`}
              value={item.psf}
              step={0.05}
              min={0}
              onChange={(e) => set(item.id, "psf", parseFloat(e.target.value) || 0)}
              className="flex-1 px-2 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
            />
            <span className="px-2 py-2 bg-gray-50 border-l border-gray-200 text-gray-500 text-xs whitespace-nowrap">{suffix}</span>
          </div>
          <button
            type="button"
            onClick={() => remove(item.id)}
            className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0"
            aria-label="Remove item"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
      >
        + {addLabel}
      </button>
    </div>
  );
}

// Disposition items — each can be % of exit value or a fixed dollar amount
function newDispositionItem() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "", basis: "pct", value: 0 };
}

function CustomDispositionItems({ items = [], onChange }) {
  const set = (id, field, value) =>
    onChange(items.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  const remove = (id) => onChange(items.filter((it) => it.id !== id));
  const add    = ()    => onChange([...items, newDispositionItem()]);

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Item name"
            value={item.label}
            onChange={(e) => set(item.id, "label", e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden w-36 shrink-0">
            {item.basis === "fixed" && (
              <span className="px-2 py-2 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm">$</span>
            )}
            <input
              type="number"
              aria-label={`${item.label || "item"} value`}
              value={item.value}
              step={item.basis === "pct" ? 0.05 : 500}
              min={0}
              onChange={(e) => set(item.id, "value", parseFloat(e.target.value) || 0)}
              className="flex-1 px-2 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
            />
            <select
              aria-label="Basis"
              value={item.basis}
              onChange={(e) => set(item.id, "basis", e.target.value)}
              className="px-1 py-2 bg-gray-50 border-l border-gray-200 text-gray-500 text-xs outline-none cursor-pointer"
            >
              <option value="pct">% of sale</option>
              <option value="fixed">$ fixed</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => remove(item.id)}
            className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0"
            aria-label="Remove item"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
      >
        + Add disposition item
      </button>
    </div>
  );
}

const LEASE_TYPES = [
  { id: "NNN",   label: "NNN",          description: "Tenant pays taxes, insurance, maintenance" },
  { id: "MG",    label: "Modified Gross", description: "Landlord pays taxes & insurance" },
  { id: "Gross", label: "Full Gross",    description: "Landlord pays all operating expenses" },
];

function fmtK(n) {
  if (n === 0) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function DealInputsPanel({ inputs, onChange, fundNames = [], linked = false }) {
  const set = (field, value) => onChange({ ...inputs, [field]: value });
  const [curveLoading, setCurveLoading] = useState(false);
  const [curveError, setCurveError] = useState(null);

  async function handleFetchCurve() {
    setCurveLoading(true);
    setCurveError(null);
    const holdYears = inputs.holdPeriodYears ?? 4;
    const rates = await fetchSofrCurve(holdYears);
    // Fill any nulls (far-dated contracts) by forward-filling last known rate
    let last = inputs.indexRatePct ?? 0;
    const filled = rates.map((r) => { if (r != null) last = r; return last; });
    if (filled.every((r) => r === (inputs.indexRatePct ?? 0))) {
      setCurveError("Could not fetch — check connection");
    }
    // Sync index rate with Y1 from the curve
    onChange({ ...inputs, sofrForwardCurve: filled, indexRatePct: filled[0] ?? inputs.indexRatePct });
    setCurveLoading(false);
  }

  const setCC = (field, value) =>
    onChange({ ...inputs, closingCosts: { ...inputs.closingCosts, [field]: value } });

  const avgUnitSize =
    inputs.unitCount > 0 ? Math.round(inputs.squareFootage / inputs.unitCount) : 0;

  const isMG    = inputs.leaseType === "MG";
  const isGross = inputs.leaseType === "Gross";

  return (
    <div className="space-y-7">
      {linked && (
        <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          Linked to <span className="font-semibold">Quick Underwrite</span>. Edit price, NOI, loan, caps, fees and
          exit there; changing those fields here is overwritten by the next Quick Underwrite edit.
        </p>
      )}
      {/* Property */}
      <div>
        <SectionHeader title="Property" />
        <div className="grid grid-cols-1 gap-3">
          <Field label="Property Name" value={inputs.propertyName} field="propertyName" onChange={set} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fund</label>
            <div className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
              <input
                type="text"
                list="fund-names-list"
                value={inputs.fundName ?? ""}
                onChange={(e) => set("fundName", e.target.value)}
                placeholder={fundNames.length > 0 ? "Type or select a fund…" : "e.g. Fund I"}
                className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
              />
            </div>
            {fundNames.length > 0 && (
              <datalist id="fund-names-list">
                {fundNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Square Footage" value={inputs.squareFootage} field="squareFootage" suffix="SF" step={1000} onChange={set} />
            <Field label="Purchase Price" value={inputs.purchasePrice} field="purchasePrice" prefix="$" step={100000} onChange={set} />
          </div>
          {(inputs.units ?? []).length > 0 ? (
            <p className="text-xs text-gray-500">
              <span className="font-medium uppercase tracking-wide">Units:</span>{" "}
              <span className="font-semibold text-gray-900">{inputs.units.length}</span> from the rent roll (Unit Roll tab) ·{" "}
              {inputs.units.filter((u) => u.leaseStatus === "occupied").length} leased
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Units" value={inputs.unitCount ?? 0} field="unitCount" step={1} onChange={set} />
              <p className="self-end pb-2 text-xs text-gray-400">
                {avgUnitSize > 0 ? `≈ ${avgUnitSize.toLocaleString()} SF per unit. ` : ""}Add a rent roll on the Unit Roll tab for leases.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* NOI source + capex */}
      <div>
        <SectionHeader title="NOI Source" subtitle="Build NOI from the rent roll, or enter it directly" />
        <div className="flex gap-2 mb-3">
          {[
            { id: false, label: "Rent roll" },
            { id: true, label: "Direct NOI" },
          ].map((o) => (
            <button
              key={String(o.id)}
              type="button"
              onClick={() => set("noiOverrideEnabled", o.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                !!inputs.noiOverrideEnabled === o.id
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {inputs.noiOverrideEnabled && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Year 1 NOI" value={inputs.noiYear1 ?? 0} field="noiYear1" prefix="$" step={10000} onChange={set} />
              <Field label="NOI Growth" value={inputs.noiGrowthPct ?? 0} field="noiGrowthPct" suffix="%/yr" step={1} onChange={set} />
              <Field label="Property Mgmt" value={inputs.pmFeePct ?? 0} field="pmFeePct" suffix={inputs.pmFeeBasis === "value" ? "% value" : "% NOI"} step={0.25} onChange={set} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">PM Basis</label>
                <select
                  value={inputs.pmFeeBasis ?? "noi"}
                  onChange={(e) => set("pmFeeBasis", e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="value">Asset value</option>
                  <option value="noi">NOI</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Rent, vacancy, expense and rollover inputs below are ignored while Direct NOI is on.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Capex Budget" value={inputs.capexBudget ?? 0} field="capexBudget" prefix="$" step={10000} onChange={set} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Capex Funded By</label>
            <select
              value={inputs.capexLenderFunded ? "lender" : "equity"}
              onChange={(e) => set("capexLenderFunded", e.target.value === "lender")}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="equity">Equity</option>
              <option value="lender">Lender (added to loan)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Closing Costs */}
      <ClosingCostsSection
        cc={inputs.closingCosts}
        purchasePrice={inputs.purchasePrice}
        onChange={setCC}
      />

      {/* Lease Structure */}
      <div>
        <SectionHeader title="Lease Structure" />
        <div className="flex flex-col gap-2">
          {LEASE_TYPES.map((lt) => (
            <button
              key={lt.id}
              type="button"
              onClick={() => onChange({ ...inputs, leaseType: lt.id })}
              className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                inputs.leaseType === lt.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${inputs.leaseType === lt.id ? "text-blue-700" : "text-gray-700"}`}>
                  {lt.label}
                </span>
                {inputs.leaseType === lt.id && (
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Selected</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{lt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Income */}
      <div>
        <SectionHeader title="Income" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base Rent" value={inputs.rentPerSF} field="rentPerSF" prefix="$" suffix="/SF/yr" step={0.25} onChange={set} />
          <Field label="Escalation" value={inputs.annualRentEscalationPct} field="annualRentEscalationPct" suffix="%" step={0.5} onChange={set} />
          <Field label="Physical Vacancy" value={inputs.vacancyPct} field="vacancyPct" suffix="%" step={0.5} onChange={set} />
          <Field label="Credit Loss" value={inputs.creditLossPct} field="creditLossPct" suffix="% of EGR" step={0.25} onChange={set} />
          <div className="col-span-2">
            <Field label="Other Income" value={inputs.otherIncomePSF} field="otherIncomePSF" prefix="$" suffix="/SF/yr" step={0.05} onChange={set} />
          </div>
        </div>
        {/* Concessions / free rent */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">Concessions &amp; Free Rent</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Free Rent — New" value={inputs.freeRentMonthsNew ?? 0} field="freeRentMonthsNew" suffix="mo" step={1} onChange={set} />
            <Field label="Free Rent — Renewal" value={inputs.freeRentMonthsRenewal ?? 0} field="freeRentMonthsRenewal" suffix="mo" step={1} onChange={set} />
            <Field label="TI Concession — New" value={inputs.tiConcessionPSFNew ?? 0} field="tiConcessionPSFNew" prefix="$" suffix="/SF" step={0.5} onChange={set} />
            <Field label="TI Concession — Renewal" value={inputs.tiConcessionPSFRenewal ?? 0} field="tiConcessionPSFRenewal" prefix="$" suffix="/SF" step={0.5} onChange={set} />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Free rent and TI concessions reduce income at each lease rollover event. TI concession is an income-side deduction (separate from capital TI in rollover costs).</p>
        </div>
        {/* Custom income line items */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">Additional Income Items</p>
          <CustomPSFItems
            items={inputs.customIncomeItems ?? []}
            suffix="/SF/yr"
            placeholder="e.g. Parking revenue"
            addLabel="Add income item"
            onChange={(items) => onChange({ ...inputs, customIncomeItems: items })}
          />
        </div>
      </div>

      {/* Operating Expenses */}
      <div>
        <SectionHeader
          title="Operating Expenses"
          subtitle={
            inputs.leaseType === "NNN"
              ? "NNN — all pass through to tenant; enter for reference only"
              : inputs.leaseType === "MG"
              ? "MG — taxes & insurance are landlord-paid (highlighted)"
              : "Gross — all are landlord-paid"
          }
        />
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Real Estate Tax", field: "realEstateTaxPSF", landlordPaid: isMG || isGross },
            { label: "Insurance",       field: "insurancePSF",     landlordPaid: isMG || isGross },
            { label: "Utilities",       field: "utilitiesPSF",     landlordPaid: isGross },
            { label: "Maintenance",     field: "maintenancePSF",   landlordPaid: isGross },
            { label: "Janitorial",      field: "janitorialPSF",    landlordPaid: isGross },
          ].map(({ label, field, landlordPaid }) => (
            <div key={field} className={`rounded-lg ${landlordPaid ? "ring-1 ring-amber-300" : ""}`}>
              <div className="flex flex-col gap-1">
                <label htmlFor={`expense-${field}`} className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  {label}
                  {landlordPaid && (
                    <span className="text-amber-600 text-xs font-semibold">★ landlord</span>
                  )}
                </label>
                <div className={`flex items-center border rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden ${landlordPaid ? "border-amber-300" : "border-gray-200"}`}>
                  <span className="px-3 py-2 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm font-medium">$</span>
                  <input
                    id={`expense-${field}`}
                    type="number"
                    value={inputs[field]}
                    step={0.05}
                    min={0}
                    onChange={(e) => set(field, parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white outline-none min-w-0"
                  />
                  <span className="px-3 py-2 bg-gray-50 border-l border-gray-200 text-gray-500 text-sm font-medium">/SF</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
          <Field label="Mgmt. Fee" value={inputs.managementFeePct} field="managementFeePct" suffix="% EGR" step={0.5} onChange={set} />
          <Field label="Constr. Mgmt" value={inputs.cmFeePct ?? 0} field="cmFeePct" suffix="% value/yr" step={0.25} onChange={set} />
          <Field label="Leasing Fees" value={inputs.leasingFeesPSF} field="leasingFeesPSF" prefix="$" suffix="/SF/yr" step={0.05} onChange={set} />
          <Field label="Capital Reserves" value={inputs.capitalReservesPSF} field="capitalReservesPSF" prefix="$" suffix="/SF/yr" step={0.05} onChange={set} />
        </div>
        {/* Asset management fee allocations */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-1">Asset Mgmt. Allocations</p>
          <p className="text-xs text-gray-400 mb-2">Fees charged by the asset manager to the property (oversight, accounting, reporting, etc.).</p>
          <AMFeeItems
            items={inputs.amFeeItems ?? []}
            onChange={(items) => onChange({ ...inputs, amFeeItems: items })}
          />
        </div>
        {/* Custom expense line items */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">Additional Expense Items</p>
          <CustomPSFItems
            items={inputs.customExpenseItems ?? []}
            suffix="/SF/yr"
            placeholder="e.g. Landscaping"
            addLabel="Add expense item"
            onChange={(items) => onChange({ ...inputs, customExpenseItems: items })}
          />
        </div>
      </div>

      {/* Rollover Costs */}
      <div>
        <SectionHeader title="Rollover Costs" subtitle="Normalized annually over avg lease term" />
        <ConstructionCostsSection
          cc={inputs.constructionCosts}
          avgUnitSF={inputs.unitCount > 0 ? Math.round(inputs.squareFootage / inputs.unitCount) : inputs.squareFootage}
          onChange={(field, value) =>
            onChange({ ...inputs, constructionCosts: { ...inputs.constructionCosts, [field]: value } })
          }
        />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="TI — Renewal" value={inputs.tiPerSFRenewal} field="tiPerSFRenewal" prefix="$" suffix="/SF" step={0.5} onChange={set} />
          <div />
          <Field label="LC — New Lease" value={inputs.leasingCommissionNewPct} field="leasingCommissionNewPct" suffix="% lease val" step={0.5} onChange={set} />
          <Field label="LC — Renewal" value={inputs.leasingCommissionRenewalPct} field="leasingCommissionRenewalPct" suffix="% lease val" step={0.5} onChange={set} />
        </div>
        {/* Custom rollover cost items */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-1">Additional Rollover Costs</p>
          <p className="text-xs text-gray-400 mb-2">Charged per SF at each lease rollover (e.g. signage, permits, move-in allowance).</p>
          <CustomPSFItems
            items={inputs.customRolloverItems ?? []}
            suffix="/SF"
            placeholder="e.g. Signage allowance"
            addLabel="Add rollover item"
            onChange={(items) => onChange({ ...inputs, customRolloverItems: items })}
          />
        </div>
      </div>

      {/* Financing */}
      <div>
        <SectionHeader title="Financing" />
        <div className="mb-3">
          <Field label="Lender" value={inputs.lenderName ?? ""} field="lenderName" onChange={set} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="LTV" value={inputs.ltvPct} field="ltvPct" suffix="%" step={5} onChange={set} />
          <Field label="Amortization" value={inputs.amortizationYears} field="amortizationYears" suffix="yrs" step={5} onChange={set} />
          <Field label="I/O Period" value={inputs.ioPeriodYears} field="ioPeriodYears" suffix="yrs" step={1} onChange={set} />
        </div>

        {/* Loan sizing constraints */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-1">Loan Sizing Constraints</p>
          <p className="text-xs text-gray-400 mb-2">Loan amount = lesser of LTV and any enabled constraints below.</p>
          {[
            { label: "Min DSCR",       enabledField: "minDSCREnabled",      valueField: "minDSCR",            suffix: "x",   step: 0.05, defaultVal: 1.25 },
            { label: "Max LTC",        enabledField: "maxLTCEnabled",       valueField: "maxLTCPct",          suffix: "%",   step: 1,    defaultVal: 75 },
            { label: "Min Debt Yield", enabledField: "minDebtYieldEnabled", valueField: "minDebtYieldPct",    suffix: "%",   step: 0.25, defaultVal: 8.0 },
          ].map(({ label, enabledField, valueField, suffix, step, defaultVal }) => {
            const lsc = inputs.loanSizingConstraints ?? {};
            const enabled = !!lsc[enabledField];
            const val = lsc[valueField] ?? defaultVal;
            const setLSC = (f, v) => onChange({
              ...inputs,
              loanSizingConstraints: { ...(inputs.loanSizingConstraints ?? {}), [f]: v },
            });
            return (
              <div key={enabledField} className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setLSC(enabledField, !enabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${enabled ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className={`text-xs font-medium w-24 shrink-0 ${enabled ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
                <div className={`flex items-center border rounded-lg overflow-hidden flex-1 ${enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"}`}>
                  <input
                    type="number"
                    aria-label={label}
                    value={val}
                    step={step}
                    min={0}
                    disabled={!enabled}
                    onChange={(e) => setLSC(valueField, parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-transparent outline-none min-w-0 disabled:text-gray-400"
                  />
                  <span className={`px-3 py-2 bg-gray-50 border-l border-gray-200 text-xs ${enabled ? "text-gray-500" : "text-gray-300"}`}>{suffix}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* TI Reserve */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold text-gray-600">TI Reserve (Holdback)</p>
              <p className="text-xs text-gray-400 mt-0.5">Lender-funded reserve for tenant improvements, drawn down as needed.</p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...inputs, tiReserve: { ...(inputs.tiReserve ?? {}), enabled: !(inputs.tiReserve?.enabled) } })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${inputs.tiReserve?.enabled ? "bg-blue-600" : "bg-gray-200"}`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${inputs.tiReserve?.enabled ? "translate-x-4" : "translate-x-0"}`} />
            </button>
          </div>
          {inputs.tiReserve?.enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Reserve"
                value={inputs.tiReserve?.reservePSF ?? 8.0}
                field="reservePSF"
                prefix="$"
                suffix="/SF"
                step={0.5}
                onChange={(f, v) => onChange({ ...inputs, tiReserve: { ...(inputs.tiReserve ?? {}), [f]: v } })}
              />
              <Field
                label="Min Draw DSCR"
                value={inputs.tiReserve?.minDrawDSCR ?? 1.10}
                field="minDrawDSCR"
                suffix="x"
                step={0.05}
                onChange={(f, v) => onChange({ ...inputs, tiReserve: { ...(inputs.tiReserve ?? {}), [f]: v } })}
              />
            </div>
          )}
        </div>

        {/* Loan covenants */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-1">Loan Covenants</p>
          <p className="text-xs text-gray-400 mb-2">Year-by-year compliance is shown in the Capital tab.</p>
          {[
            { label: "Min DSCR",       enabledField: "dscrEnabled",      valueField: "dscrMin",        suffix: "x",   step: 0.05, defaultVal: 1.25 },
            { label: "Min Debt Yield", enabledField: "debtYieldEnabled", valueField: "debtYieldMin",   suffix: "%",   step: 0.25, defaultVal: 8.0 },
            { label: "Max LTV",        enabledField: "ltvEnabled",       valueField: "ltvMax",         suffix: "%",   step: 1,    defaultVal: 75 },
            { label: "Min Occupancy",  enabledField: "occupancyEnabled", valueField: "occupancyMin",   suffix: "%",   step: 1,    defaultVal: 85 },
          ].map(({ label, enabledField, valueField, suffix, step, defaultVal }) => {
            const cv = inputs.loanCovenants ?? {};
            const enabled = !!cv[enabledField];
            const val = cv[valueField] ?? defaultVal;
            const setCV = (f, v) => onChange({
              ...inputs,
              loanCovenants: { ...(inputs.loanCovenants ?? {}), [f]: v },
            });
            return (
              <div key={enabledField} className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setCV(enabledField, !enabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${enabled ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${enabled ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className={`text-xs font-medium w-24 shrink-0 ${enabled ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
                <div className={`flex items-center border rounded-lg overflow-hidden flex-1 ${enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"}`}>
                  <input
                    type="number"
                    aria-label={label}
                    value={val}
                    step={step}
                    min={0}
                    disabled={!enabled}
                    onChange={(e) => setCV(valueField, parseFloat(e.target.value) || 0)}
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-transparent outline-none min-w-0 disabled:text-gray-400"
                  />
                  <span className={`px-3 py-2 bg-gray-50 border-l border-gray-200 text-xs ${enabled ? "text-gray-500" : "text-gray-300"}`}>{suffix}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Loan term + extensions */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            Loan Term
            <span className="ml-2 font-bold text-blue-700">
              {inputs.loanTermYears}
              {inputs.extensionCount > 0
                ? " + " + Array(inputs.extensionCount).fill(`${inputs.extensionTermYears}`).join("+")
                : ""} yrs
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Initial Term" value={inputs.loanTermYears} field="loanTermYears" suffix="yrs" step={1} onChange={set} />
            <Field label="Extensions" value={inputs.extensionCount} field="extensionCount" suffix="options" step={1} onChange={set} />
            <Field label="Ext. Length" value={inputs.extensionTermYears} field="extensionTermYears" suffix="yrs" step={1} onChange={set} />
            {(inputs.extensionFeeAmount ?? 0) > 0 ? (
              <Field label="Ext. Fee ($, 0 = use %)" value={inputs.extensionFeeAmount} field="extensionFeeAmount" prefix="$" step={10000} onChange={set} />
            ) : (
              <Field label="Ext. Fee" value={inputs.extensionFeePct} field="extensionFeePct" suffix="% / ext" step={0.05} onChange={set} />
            )}
          </div>
        </div>

        {/* Rate type */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex gap-2 mb-3">
            {["fixed", "floating"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...inputs, floatingRate: t === "floating" })}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  (t === "floating") === !!inputs.floatingRate
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {t === "fixed" ? "Fixed Rate" : "Floating Rate"}
              </button>
            ))}
          </div>
          {inputs.floatingRate ? (
            (() => {
              const curve = inputs.sofrForwardCurve ?? [];
              const holdYears = inputs.holdPeriodYears ?? 4;
              const spread = inputs.spreadPct ?? 0;
              const capStrike = inputs.capStrikeRatePct ?? Infinity;
              const capTerm = inputs.capTermYears ?? inputs.loanTermYears ?? 999;
              const swapRate = inputs.swapFixedRatePct ?? 0;
              const swapTerm = inputs.swapTermYears ?? inputs.loanTermYears ?? 999;
              const hasCurve = curve.length > 0;

              // Compute all-in rates for display
              const allInRates = Array.from({ length: holdYears }, (_, i) => {
                const yr = i + 1;
                const s = hasCurve && curve[i] != null ? curve[i] : (inputs.indexRatePct ?? 0);
                const raw = s + spread;
                if (inputs.hedgingType === "cap" && yr <= capTerm && raw > capStrike) return capStrike;
                if (inputs.hedgingType === "swap" && yr <= swapTerm) return swapRate;
                return raw;
              });
              const rateMin = Math.min(...allInRates);
              const rateMax = Math.max(...allInRates);
              const y1Rate = allInRates[0];

              function updateCurveYear(idx, val) {
                const next = Array.from({ length: holdYears }, (_, i) =>
                  curve[i] != null ? curve[i] : (inputs.indexRatePct ?? 0)
                );
                next[idx] = val;
                // Keep index rate synced with Y1
                const updates = { ...inputs, sofrForwardCurve: next };
                if (idx === 0) updates.indexRatePct = val;
                onChange(updates);
              }

              function clearCurve() {
                set("sofrForwardCurve", []);
              }

              return (
                <div className="space-y-3">
                  {/* Index Rate + Spread */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={hasCurve ? "Index (Y1 SOFR)" : "Index Rate (SOFR)"} value={inputs.indexRatePct} field="indexRatePct" suffix="%" step={0.05}
                      onChange={(field, val) => {
                        const updates = { ...inputs, [field]: val };
                        // Sync Y1 of curve with index rate
                        if (hasCurve) {
                          const next = [...curve];
                          while (next.length < holdYears) next.push(inputs.indexRatePct ?? 0);
                          next[0] = val;
                          updates.sofrForwardCurve = next;
                        }
                        onChange(updates);
                      }}
                    />
                    <Field label="Spread" value={inputs.spreadPct} field="spreadPct" suffix="%" step={0.10} onChange={set} />
                  </div>

                  {/* Effective rate summary */}
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 font-medium">
                    {hasCurve ? (
                      rateMin === rateMax
                        ? `Effective rate: ${rateMin.toFixed(2)}% (flat curve)`
                        : `Effective rate: ${rateMin.toFixed(2)}% – ${rateMax.toFixed(2)}% (Y1: ${y1Rate.toFixed(2)}%)`
                    ) : (
                      `Effective rate: ${((inputs.indexRatePct ?? 0) + spread).toFixed(2)}%`
                    )}
                    {inputs.hedgingType === "cap" && inputs.capStrikeRatePct
                      ? ` (capped at ${inputs.capStrikeRatePct}%)`
                      : inputs.hedgingType === "swap" && inputs.swapFixedRatePct
                      ? ` → swapped to ${inputs.swapFixedRatePct}% fixed`
                      : ""}
                  </div>

                  {/* Forward Curve */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-600">Forward Curve</p>
                        {curveError && <p className="text-xs text-red-400 mt-0.5">{curveError}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {hasCurve && (
                          <button type="button" onClick={clearCurve}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            Use flat rate
                          </button>
                        )}
                        <button type="button" onClick={handleFetchCurve} disabled={curveLoading}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium border border-blue-200 bg-white rounded-md px-2 py-1 transition-colors disabled:opacity-50 flex items-center gap-1">
                          {curveLoading ? (
                            <>
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Fetching…
                            </>
                          ) : hasCurve ? "Refresh curve" : "Fetch from market"}
                        </button>
                      </div>
                    </div>

                    {hasCurve ? (
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              {["Yr", "SOFR", "+ Sprd", "All-in"].map((h) => (
                                <th key={h} className="px-2 py-1.5 text-right first:text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {Array.from({ length: holdYears }, (_, i) => {
                              const year = i + 1;
                              const sofrVal = curve[i] != null ? curve[i] : (inputs.indexRatePct ?? 0);
                              const raw = sofrVal + spread;
                              let allin = raw;
                              let note = "";
                              if (inputs.hedgingType === "cap" && year <= capTerm && raw > capStrike) {
                                allin = capStrike; note = "capped";
                              } else if (inputs.hedgingType === "swap" && year <= swapTerm) {
                                allin = swapRate; note = "swap";
                              }
                              return (
                                <tr key={year} className="hover:bg-gray-50">
                                  <td className="px-2 py-1.5 font-medium text-gray-600">Y{year}</td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input type="number" value={sofrVal} step={0.05} min={0} max={20}
                                      onChange={(e) => updateCurveYear(i, Number(e.target.value))}
                                      className="w-16 text-right text-xs font-mono border border-gray-200 rounded-md px-1.5 py-0.5 focus:ring-1 focus:ring-blue-500 focus:border-transparent outline-none"
                                    />
                                    <span className="ml-0.5 text-gray-400">%</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">+{spread.toFixed(2)}%</td>
                                  <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${note === "capped" ? "text-orange-600" : note === "swap" ? "text-purple-600" : "text-gray-800"}`}>
                                    {allin.toFixed(2)}%
                                    {note && <span className="ml-1 text-xs font-normal opacity-70">({note})</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Flat {((inputs.indexRatePct ?? 0) + spread).toFixed(2)}% all years.
                        <span className="font-medium ml-1">Fetch from market</span> pulls CME SOFR futures per year.
                      </p>
                    )}
                    <p className="text-xs text-gray-400">Source: CME 3-Month SOFR Futures (SR3) via Yahoo Finance</p>
                  </div>
                </div>
              );
            })()
          ) : (
            <Field label="Interest Rate" value={inputs.interestRatePct} field="interestRatePct" suffix="%" step={0.25} onChange={set} />
          )}
        </div>

        {/* Hedging */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">Hedging</p>
          <div className="flex gap-2 mb-3">
            {["none", "cap", "swap"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...inputs, hedgingType: t })}
                className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  inputs.hedgingType === t
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {t === "none" ? "None" : t === "cap" ? "Rate Cap" : "Swap"}
              </button>
            ))}
          </div>
          {inputs.hedgingType === "cap" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cap Strike" value={inputs.capStrikeRatePct} field="capStrikeRatePct" suffix="%" step={0.25} onChange={set} />
              <Field label="Cap Term" value={inputs.capTermYears ?? inputs.loanTermYears} field="capTermYears" suffix="yrs" step={1} onChange={set} />
              {(inputs.capPremiumAmount ?? 0) > 0 ? (
                <Field label="Cap Premium ($, 0 = use %)" value={inputs.capPremiumAmount} field="capPremiumAmount" prefix="$" step={10000} onChange={set} />
              ) : (
                <Field label="Cap Premium" value={inputs.capPremiumPct} field="capPremiumPct" suffix="% of loan" step={0.10} onChange={set} />
              )}
              <Field label="Replacement Cap" value={inputs.capReplacementCost ?? 0} field="capReplacementCost" prefix="$" suffix="/ term" step={10000} onChange={set} />
            </div>
          )}
          {inputs.hedgingType === "swap" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Swap Fixed Rate" value={inputs.swapFixedRatePct} field="swapFixedRatePct" suffix="%" step={0.25} onChange={set} />
              <Field label="Swap Term" value={inputs.swapTermYears ?? inputs.loanTermYears} field="swapTermYears" suffix="yrs" step={1} onChange={set} />
            </div>
          )}
        </div>
      </div>

      {/* Waterfall / Promote */}
      <WaterfallSection inputs={inputs} onChange={onChange} />

      {/* Exit */}
      <div>
        <SectionHeader title="Exit Assumptions" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Hold Period" value={inputs.holdPeriodYears} field="holdPeriodYears" suffix="yrs" step={1} min={1} onChange={set} />
          <Field label="Exit Cap Rate" value={inputs.exitCapRatePct} field="exitCapRatePct" suffix="%" step={0.25} onChange={set} />
        </div>
        <ExitCostsSection
          sc={inputs.sellingCosts}
          onChange={(field, value) =>
            onChange({ ...inputs, sellingCosts: { ...inputs.sellingCosts, [field]: value } })
          }
        />
        {/* Custom disposition items */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 mb-2">Additional Disposition Items</p>
          <CustomDispositionItems
            items={inputs.customDispositionItems ?? []}
            onChange={(items) => onChange({ ...inputs, customDispositionItems: items })}
          />
        </div>
      </div>
    </div>
  );
}
