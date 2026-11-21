"use client";

import { useMemo, useState } from "react";
import { buildSensitivityTable, sensitivityRange } from "@/lib/calculations";

const VAR_LABELS = {
  exitCapRatePct: "Exit Cap Rate",
  rentPerSF: "Rent / SF / yr",
  purchasePrice: "Purchase Price",
  noiGrowthPct: "NOI Growth",
  noiYear1: "Year 1 NOI",
};

const METRIC_LABELS = {
  irr: "IRR",
  equityMultiple: "Equity Multiple",
  cashOnCash: "Yr 1 Cash-on-Cash",
};

function cellColor(val, metric, base) {
  if (!isFinite(val)) return "bg-gray-100 text-gray-400";
  const delta = val - base;

  if (metric === "irr") {
    if (delta > 3)    return "bg-emerald-600 text-white";
    if (delta > 1.5)  return "bg-emerald-400 text-white";
    if (delta > 0)    return "bg-emerald-100 text-emerald-800";
    if (delta > -1.5) return "bg-yellow-100 text-yellow-800";
    if (delta > -3)   return "bg-orange-200 text-orange-800";
    return "bg-red-500 text-white";
  }
  if (metric === "equityMultiple") {
    if (delta > 0.3)   return "bg-emerald-600 text-white";
    if (delta > 0.15)  return "bg-emerald-400 text-white";
    if (delta > 0)     return "bg-emerald-100 text-emerald-800";
    if (delta > -0.15) return "bg-yellow-100 text-yellow-800";
    if (delta > -0.3)  return "bg-orange-200 text-orange-800";
    return "bg-red-500 text-white";
  }
  if (delta > 2)  return "bg-emerald-600 text-white";
  if (delta > 1)  return "bg-emerald-400 text-white";
  if (delta > 0)  return "bg-emerald-100 text-emerald-800";
  if (delta > -1) return "bg-yellow-100 text-yellow-800";
  if (delta > -2) return "bg-orange-200 text-orange-800";
  return "bg-red-500 text-white";
}

function fmtCell(val, metric) {
  if (!isFinite(val)) return "—";
  if (metric === "irr") return `${val.toFixed(1)}%`;
  if (metric === "equityMultiple") return `${val.toFixed(2)}x`;
  return `${val.toFixed(1)}%`;
}

function fmtHeader(val, varKey) {
  if (varKey === "exitCapRatePct") return `${val.toFixed(2)}%`;
  if (varKey === "rentPerSF") return `$${val.toFixed(2)}`;
  if (varKey === "purchasePrice") return `$${(val / 1_000_000).toFixed(1)}M`;
  if (varKey === "noiGrowthPct") return `${val.toFixed(1)}%`;
  if (varKey === "noiYear1") return `$${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

function stepFor(varKey, base) {
  if (varKey === "exitCapRatePct") return 0.25;
  if (varKey === "rentPerSF") return 0.5;
  if (varKey === "purchasePrice") return base * 0.05;
  if (varKey === "noiGrowthPct") return 5;
  if (varKey === "noiYear1") return Math.max(1000, Math.round(base * 0.05));
  return 1;
}

export default function SensitivityTables({ inputs, baseIRR, baseEM }) {
  const [metric, setMetric] = useState("irr");
  const [rowVarRaw, setRowVar] = useState("exitCapRatePct");
  const [colVarRaw, setColVar] = useState("rentPerSF");

  // Direct-NOI deals ignore rent/SF, so offer NOI levers instead.
  const direct = !!inputs.noiOverrideEnabled;
  const varOptions = direct
    ? ["exitCapRatePct", "noiGrowthPct", "noiYear1", "purchasePrice"]
    : ["exitCapRatePct", "rentPerSF", "purchasePrice"];
  const fallbackVar = (v, other) =>
    varOptions.includes(v) ? v : varOptions.find((x) => x !== other && x !== "exitCapRatePct") ?? varOptions[1];
  const rowVar = fallbackVar(rowVarRaw, colVarRaw);
  const colVar = fallbackVar(colVarRaw, rowVar);

  const rowValues = useMemo(
    () => sensitivityRange(inputs[rowVar], 5, stepFor(rowVar, inputs[rowVar])),
    [inputs, rowVar]
  );
  const colValues = useMemo(
    () => sensitivityRange(inputs[colVar], 5, stepFor(colVar, inputs[colVar])),
    [inputs, colVar]
  );

  const table = useMemo(
    () => buildSensitivityTable(inputs, rowVar, colVar, rowValues, colValues),
    [inputs, rowVar, colVar, rowValues, colValues]
  );

  const base = metric === "irr" ? baseIRR : metric === "equityMultiple" ? baseEM : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-gray-900 mr-2">Sensitivity</h2>

        {/* Metric selector */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {Object.keys(METRIC_LABELS).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                metric === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Axis selectors */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rows</span>
          <select
            value={rowVar}
            onChange={(e) => {
              const v = e.target.value;
              setRowVar(v);
              if (v === colVar) setColVar(varOptions.find((x) => x !== v));
            }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {varOptions.map((v) => (
              <option key={v} value={v}>{VAR_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Columns</span>
          <select
            value={colVar}
            onChange={(e) => {
              const v = e.target.value;
              setColVar(v);
              if (v === rowVar) setRowVar(varOptions.find((x) => x !== v));
            }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {varOptions.map((v) => (
              <option key={v} value={v}>{VAR_LABELS[v]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                <span className="text-gray-400">{VAR_LABELS[rowVar]}</span>
                <span className="mx-1 text-gray-300">↕</span>
                <span className="text-gray-400">{VAR_LABELS[colVar]}</span>
                <span className="text-gray-300"> →</span>
              </th>
              {colValues.map((cv) => (
                <th
                  key={cv}
                  className="bg-gray-50 border-b border-gray-200 px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap"
                >
                  {fmtHeader(cv, colVar)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowValues.map((rv, ri) => (
              <tr key={rv} className="border-b border-gray-100 last:border-0">
                <td className="bg-gray-50 border-r border-gray-200 px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">
                  {fmtHeader(rv, rowVar)}
                </td>
                {colValues.map((cv, ci) => {
                  const cell = table[ri][ci];
                  const val = cell[metric];
                  const isBase =
                    Math.abs(rv - inputs[rowVar]) < 0.001 &&
                    Math.abs(cv - inputs[colVar]) < 0.001;
                  return (
                    <td
                      key={ci}
                      className={`px-3 py-2 text-center tabular-nums font-medium transition-colors ${cellColor(val, metric, base)} ${isBase ? "ring-2 ring-inset ring-blue-400" : ""}`}
                    >
                      {fmtCell(val, metric)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
        <span className="font-medium">Relative to base case:</span>
        {[
          { color: "bg-emerald-600", label: "Well above" },
          { color: "bg-emerald-100", label: "Above" },
          { color: "bg-yellow-100", label: "Slightly below" },
          { color: "bg-orange-200", label: "Below" },
          { color: "bg-red-500", label: "Well below" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${color}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded border-2 border-blue-400" />
          Base case
        </span>
      </div>
    </div>
  );
}
