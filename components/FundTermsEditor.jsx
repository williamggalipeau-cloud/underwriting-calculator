"use client";

import { useState } from "react";
import {
  DEFAULT_FUND_TERMS,
  MAX_TIERS,
  downloadBlob,
  normalizeTerms,
  safeFileName,
  termsFromFile,
  termsToCSV,
  termsToXlsx,
  validateTerms,
} from "@/lib/fundTerms";
import { fundDates } from "@/lib/fundTimeline";

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function Num({ label, value, onChange, suffix, prefix, step = 1, min = 0, hint }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
        {prefix && <span className="px-2.5 py-1.5 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm">{prefix}</span>}
        <input
          type="number"
          value={value ?? ""}
          min={min}
          step={step}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm text-gray-900 outline-none tabular-nums"
        />
        {suffix && <span className="px-2.5 py-1.5 bg-gray-50 border-l border-gray-200 text-gray-500 text-sm">{suffix}</span>}
      </span>
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

// Modal to create a fund or edit all of its terms, with template download
// and Excel / CSV upload.
export default function FundTermsEditor({ mode = "new", initial, existingNames = [], currentDealName, onSave, onClose }) {
  const [t, setT] = useState(() => normalizeTerms({ ...DEFAULT_FUND_TERMS, ...(initial ?? {}) }));
  const [addCurrent, setAddCurrent] = useState(mode === "new" && !!currentDealName);
  const [upload, setUpload] = useState(null); // { ok } | { error } | { warnings }
  const set = (k) => (v) => setT((p) => ({ ...p, [k]: v }));
  const setTier = (i, k, v) =>
    setT((p) => {
      const tiers = p.tiers.map((x, j) => (j === i ? { ...x, [k]: v } : x));
      if (k === "lpSplit" && v !== "") tiers[i].gpSplit = +(100 - v).toFixed(2);
      if (k === "gpSplit" && v !== "") tiers[i].lpSplit = +(100 - v).toFixed(2);
      return { ...p, tiers };
    });

  const name = String(t.name ?? "").trim();
  const duplicate = mode === "new" && existingNames.some((n) => n.toLowerCase() === name.toLowerCase());
  const issues = [...validateTerms(t), ...(duplicate ? [`A fund named “${name}” already exists.`] : [])];
  const blocking = !name || duplicate || !(t.termYears > 0);
  const fd = t.finalClose ? fundDates(t) : null;

  async function handleUpload(file) {
    try {
      const { terms, warnings } = await termsFromFile(file);
      // Keep the name already typed when editing an existing fund.
      setT(mode === "edit" ? { ...terms, name: t.name } : terms);
      setUpload(warnings.length ? { warnings } : { ok: `Loaded terms from ${file.name}. Review, then ${mode === "new" ? "create" : "save"}.` });
    } catch (e) {
      setUpload({ error: e.message || "Couldn't read that file." });
    }
  }

  const template = (kind) => {
    const blank = { ...DEFAULT_FUND_TERMS, name: "" };
    if (kind === "xlsx") downloadBlob(termsToXlsx(blank), "fund_terms_template.xlsx");
    else downloadBlob(new Blob([termsToCSV(blank)], { type: "text/csv" }), "fund_terms_template.csv");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={mode === "new" ? "New fund" : "Edit fund terms"}>
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-200 my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{mode === "new" ? "New fund" : `Edit terms · ${initial?.name}`}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Upload / template */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 text-xs text-gray-700 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 cursor-pointer">
                Upload terms (Excel or CSV)
                <input
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-gray-500">Need the format?</span>
              <button type="button" onClick={() => template("xlsx")} className="font-medium text-blue-700 hover:underline">Download template (Excel)</button>
              <span className="text-gray-300">/</span>
              <button type="button" onClick={() => template("csv")} className="font-medium text-blue-700 hover:underline">CSV</button>
            </div>
            {upload?.ok && <p className="text-emerald-700">{upload.ok}</p>}
            {upload?.error && <p className="text-red-600">{upload.error}</p>}
            {upload?.warnings && (
              <ul className="text-amber-800 list-disc ml-4">
                {upload.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>

          {/* Fund */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Fund</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fund name</span>
                <input
                  type="text"
                  value={t.name}
                  disabled={mode === "edit"}
                  onChange={(e) => set("name")(e.target.value)}
                  placeholder="e.g. Light Industrial Fund II"
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </label>
              <Num label="Target equity" prefix="$" step={1_000_000} value={t.targetEquity} onChange={set("targetEquity")} hint="Optional" />
              <Num label="Mgmt fee" suffix="%/yr" step={0.25} value={t.mgmtFeePct} onChange={set("mgmtFeePct")} hint="On LP invested capital" />
            </div>
          </section>

          {/* Timeline */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Timeline</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Final close</span>
                <input type="date" value={t.finalClose} onChange={(e) => e.target.value && set("finalClose")(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
              </label>
              <Num label="Investment period" suffix="yrs" step={0.5} value={t.investmentPeriodYears} onChange={set("investmentPeriodYears")} />
              <Num label="Term" suffix="yrs" value={t.termYears} onChange={set("termYears")} min={1} />
              <Num label="Extensions" suffix="#" value={t.extensionCount} onChange={set("extensionCount")} />
              <Num label="Each extension" suffix="yrs" value={t.extensionYears} onChange={set("extensionYears")} />
            </div>
            {fd && (
              <p className="text-xs text-gray-500">
                Investment period ends {fmtDate(fd.investmentPeriodEnd)} · term ends {fmtDate(fd.fundEnd)} · fully extended {fmtDate(fd.extendedEnd)}
              </p>
            )}
          </section>

          {/* Waterfall */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Waterfall</h3>
            <div className="grid grid-cols-3 gap-3">
              <Num label="GP commitment" suffix="% of equity" step={0.5} value={t.gpCommitPct} onChange={set("gpCommitPct")} />
              <Num label="Preferred return" suffix="%/yr" step={0.25} value={t.prefPct} onChange={set("prefPct")} />
              <Num label="GP catch-up" suffix="%" step={5} value={t.catchUpGpPct} onChange={set("catchUpGpPct")} />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Distribution policy</span>
                <select
                  value={t.distributionPolicy ?? "reserve"}
                  onChange={(e) => set("distributionPolicy")(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                >
                  <option value="reserve">Income above reserve</option>
                  <option value="payout">Payout % of income</option>
                </select>
              </label>
              {(t.distributionPolicy ?? "reserve") === "reserve" ? (
                <Num label="Reserve" suffix="yrs" step={0.25} value={t.reserveYears} onChange={set("reserveYears")} hint="× debt service + TI + mgmt fees" />
              ) : (
                <Num label="Quarterly income payout" suffix="%" step={5} value={t.incomePayoutPct} onChange={set("incomePayoutPct")} hint="Rest is reserved, returned at exit" />
              )}
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Income distributions</span>
                <select
                  value={t.incomeTreatment ?? "prefThenROC"}
                  onChange={(e) => set("incomeTreatment")(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                >
                  <option value="prefThenROC">Pref, then return of capital (promote only from sales)</option>
                  <option value="full">Full waterfall each quarter</option>
                </select>
              </label>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Promote tier</th>
                    <th className="px-3 py-2 text-left font-semibold">Fund IRR up to (%)</th>
                    <th className="px-3 py-2 text-left font-semibold">LP %</th>
                    <th className="px-3 py-2 text-left font-semibold">GP %</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {t.tiers.map((x, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-600">Tier {i + 1}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step={0.5}
                          value={x.irrThreshold ?? ""}
                          placeholder="above all"
                          onChange={(e) => setTier(i, "irrThreshold", e.target.value === "" ? null : Number(e.target.value))}
                          className="w-28 border border-gray-200 rounded-md px-2 py-1 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step={5} value={x.lpSplit} onChange={(e) => setTier(i, "lpSplit", e.target.value === "" ? "" : Number(e.target.value))} className="w-20 border border-gray-200 rounded-md px-2 py-1 tabular-nums" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step={5} value={x.gpSplit} onChange={(e) => setTier(i, "gpSplit", e.target.value === "" ? "" : Number(e.target.value))} className="w-20 border border-gray-200 rounded-md px-2 py-1 tabular-nums" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {t.tiers.length > 1 && (
                          <button type="button" onClick={() => setT((p) => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i) }))} className="text-xs text-gray-400 hover:text-red-500">
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {t.tiers.length < MAX_TIERS && (
                <button
                  type="button"
                  onClick={() => setT((p) => ({ ...p, tiers: [...p.tiers, { irrThreshold: null, lpSplit: 50, gpSplit: 50 }] }))}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-blue-600 hover:bg-gray-50 border-t border-gray-100"
                >
                  + Add tier
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              Distributions: pref → return of capital → GP catch-up → split by the tier the fund&apos;s IRR falls in. Leave the top tier&apos;s hurdle blank.
            </p>
          </section>

          {issues.length > 0 && (
            <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 list-disc ml-0 pl-6">
              {issues.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          {mode === "new" && currentDealName ? (
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={addCurrent} onChange={(e) => setAddCurrent(e.target.checked)} />
              Add the current deal ({currentDealName}) to this fund
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {mode === "edit" && (
              <button type="button" onClick={() => downloadBlob(termsToXlsx(t), `${safeFileName(t.name)}_fund_terms.xlsx`)} className="text-sm text-blue-600 border border-blue-200 bg-white rounded-lg px-4 py-2">
                Export (Excel)
              </button>
            )}
            <button type="button" onClick={onClose} className="text-sm text-gray-600 border border-gray-200 bg-white rounded-lg px-4 py-2">
              Cancel
            </button>
            <button
              type="button"
              disabled={blocking}
              onClick={() => onSave(normalizeTerms({ ...t, name }), { addCurrentDeal: addCurrent })}
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 disabled:opacity-40"
            >
              {mode === "new" ? "Create fund" : "Save terms"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
