"use client";

import { useMemo, useRef, useState } from "react";
import { BUCKETS, CHARGE_TYPES, PAST_DUE, aggregate, collections, parseAgedReport, suggestMapping, trend } from "@/lib/delinquency";
import { parseCSV } from "@/lib/fundTerms";
import { readXlsxGrid } from "@/lib/xlsx";
import { fieldOf } from "@/lib/leaseAbstract";

const usd = (n) => (n == null || !isFinite(n) ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const pct = (n, d = 1) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(d)}%`);
const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const monthLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

async function readGrid(file) {
  if (/\.xlsx$/i.test(file.name)) return readXlsxGrid(await file.arrayBuffer());
  return parseCSV(await file.text());
}

// Fund total card (also on Portfolio Return).
export function DelinquencySummary({ delinq, deals, title = "Rent delinquency", onOpen }) {
  const t = useMemo(() => trend(delinq, deals), [delinq, deals]);
  if (!t.length) return null;
  const last = t.at(-1);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid="delinquency-summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{title} · {monthLabel(last.month)} (Yardi)</p>
        {onOpen && <button type="button" onClick={onOpen} className="text-blue-600 hover:underline">Details</button>}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["Past due", usd(last.delinquent), `${pct(last.pctRent)} of monthly rent`],
          ...PAST_DUE.map((k) => [BUCKETS.find((b) => b[0] === k)[1], usd(last.buckets[k]), pct(last.bucketPct[k])]),
          ["Tenants late", String(last.tenantsDelinquent), `net of deposits ${usd(last.netOfDeposits)}`],
        ].map(([l, v, sub]) => (
          <div key={l}><p className="text-[10px] uppercase tracking-wide text-gray-500">{l}</p><p className="font-semibold tabular-nums">{v}</p><p className="text-[10px] text-gray-500">{sub}</p></div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Change vs last month: <span className={last.change > 0 ? "font-medium text-red-700" : last.change < 0 ? "font-medium text-emerald-700" : ""}>{isFinite(last.change) ? `${last.change > 0 ? "+" : ""}${usd(last.change)}` : "—"}</span>
        {" · "}Current (not yet late) {usd(last.buckets.current)} · prepaid {usd(last.prepaid)} · total balance {usd(last.total)}
      </p>
    </div>
  );
}

// Upload, map and review the aged receivables report.
export default function Delinquency({ fundName, deals, dealId, delinq, leases = [], canEdit, onChange }) {
  const [scope, setScope] = useState(dealId ? "asset" : "fund");
  const [assetPick, setAssetPick] = useState(null);
  const [draft, setDraft] = useState(null); // { parsed, mapping, file }
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const ledgerRef = useRef(null);
  const months = Object.keys(delinq?.months ?? {}).sort();
  const [monthPick, setMonthPick] = useState(null);
  const month = monthPick && months.includes(monthPick) ? monthPick : months.at(-1);
  const agg = month ? aggregate(delinq.months[month], delinq.mapping, deals) : null;
  const tr = trend(delinq, deals);
  const coll = delinq?.ledger?.grid ? collections(delinq.ledger.grid, delinq.mapping, deals) : [];
  const focus = scope === "asset" ? assetPick ?? dealId : null;
  const tenants = (agg?.tenants ?? []).filter((t) => !focus || t.dealId === focus);
  const leaseFor = (unitId) => leases.find((l) => (l.unit_ids ?? []).includes(unitId));

  const upload = async (file) => {
    setErr("");
    try {
      const parsed = parseAgedReport(await readGrid(file), { columnMap: delinq?.mapping?.columns ?? {} });
      setDraft({ parsed, mapping: suggestMapping(parsed.rows, deals, delinq?.mapping ?? {}), file: file.name });
    } catch (e) {
      setErr(e.message || String(e));
    }
  };
  const save = () => {
    const { parsed, mapping, file } = draft;
    if (!parsed.asOf) return setErr("Choose the report's month-end date.");
    onChange((cur) => ({ ...(cur ?? {}), mapping: { ...mapping, columns: (cur ?? {}).mapping?.columns ?? {} }, months: { ...((cur ?? {}).months ?? {}), [parsed.asOf]: { rows: parsed.rows, file, uploadedAt: new Date().toISOString() } }, notes: (cur ?? {}).notes ?? {} }),
      `Imported Yardi aged receivables for ${parsed.asOf} (${parsed.rows.length} rows, ${file})`);
    setDraft(null);
    setMonthPick(parsed.asOf);
  };
  const uploadLedger = async (file) => {
    try {
      const grid = await readGrid(file);
      onChange((cur) => ({ ...(cur ?? {}), ledger: { grid, file: file.name, uploadedAt: new Date().toISOString() } }), `Imported Yardi tenant ledger (${file.name})`);
    } catch (e) { setErr(e.message || String(e)); }
  };
  const setNote = (code, text) => onChange((cur) => ({ ...(cur ?? {}), notes: { ...((cur ?? {}).notes ?? {}), [code]: text } }), null);

  const unmappedProps = draft ? [...new Set(draft.parsed.rows.filter((r) => !draft.mapping.properties[r.property]).map((r) => r.property))] : [];
  const unmappedTenants = draft ? draft.parsed.rows.filter((r) => draft.mapping.properties[r.property] && !draft.mapping.tenants[r.tenantCode]) : [];

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-900" data-testid="delinquency">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Rent delinquency (Yardi aged receivables)</h3>
          <p className="text-[11px] text-gray-500">Upload Yardi&apos;s aged receivables report each month (CSV or Excel). Past due = 1–30 through over 180 days; current charges aren&apos;t late yet.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {[["asset", "This asset"], ["fund", `Whole fund (${fundName})`]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-2.5 py-1 font-medium ${scope === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>{l}</button>
            ))}
          </div>
          {months.length > 1 && (
            <select value={month} onChange={(e) => setMonthPick(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1" aria-label="Month">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
          {canEdit && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Upload aged receivables" onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Upload aged report</button>
              <input ref={ledgerRef} type="file" accept=".csv,.xlsx" className="sr-only" aria-label="Upload tenant ledger" onChange={(e) => { if (e.target.files?.[0]) uploadLedger(e.target.files[0]); e.target.value = ""; }} />
              <button type="button" onClick={() => ledgerRef.current?.click()} className={`${btn} border-gray-300 bg-white text-gray-700`}>Upload tenant ledger</button>
            </>
          )}
        </div>
      </div>
      {err && <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-800">{err}</p>}

      {draft && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid="delinquency-draft">
          <p className="font-medium">{draft.file}: {draft.parsed.rows.length} rows{draft.parsed.asOf ? ` as of ${draft.parsed.asOf}` : ""}</p>
          {!draft.parsed.asOf && <label className="flex items-center gap-1">Month-end <input type="date" onChange={(e) => setDraft({ ...draft, parsed: { ...draft.parsed, asOf: e.target.value } })} className="rounded border border-gray-300 px-1" aria-label="Report date" /></label>}
          {draft.parsed.warnings.map((w, i) => <p key={i} className="text-amber-800">⚠ {w}</p>)}
          {unmappedProps.map((code) => (
            <label key={code} className="flex items-center gap-2">Yardi property <span className="font-mono">{code}</span> →
              <select value="" onChange={(e) => setDraft({ ...draft, mapping: suggestMapping(draft.parsed.rows, deals, { ...draft.mapping, properties: { ...draft.mapping.properties, [code]: e.target.value } }) })} className="rounded border border-gray-300 px-1" aria-label={`Asset for ${code}`}>
                <option value="">Choose asset…</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.inputs.propertyName}</option>)}
              </select>
            </label>
          ))}
          {unmappedTenants.map((r) => {
            const d = deals.find((x) => x.id === draft.mapping.properties[r.property]);
            return (
              <label key={r.tenantCode} className="flex items-center gap-2">Tenant <span className="font-mono">{r.tenantCode}</span> {r.tenant} →
                <select value="" onChange={(e) => setDraft({ ...draft, mapping: { ...draft.mapping, tenants: { ...draft.mapping.tenants, [r.tenantCode]: e.target.value } } })} className="rounded border border-gray-300 px-1" aria-label={`Unit for ${r.tenantCode}`}>
                  <option value="">Choose unit…</option>
                  {(d?.inputs?.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}{u.tenantName ? ` · ${u.tenantName}` : ""}</option>)}
                </select>
              </label>
            );
          })}
          <p className="text-gray-600">{Object.keys(draft.mapping.properties).length} property codes and {Object.keys(draft.mapping.tenants).length} tenant codes mapped (kept for next month).</p>
          <div className="flex gap-2">
            <button type="button" onClick={save} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Save {draft.parsed.asOf ? monthLabel(draft.parsed.asOf) : "month"}</button>
            <button type="button" onClick={() => setDraft(null)} className={`${btn} border-gray-200 bg-white text-gray-600`}>Cancel</button>
          </div>
        </div>
      )}

      {!agg ? (
        <p className="text-gray-500">No delinquency report yet. Sample Yardi exports are in the repository under docs/sample-yardi.</p>
      ) : (
        <>
          {scope === "fund" ? (
            <>
              <DelinquencySummary delinq={{ ...delinq, months: Object.fromEntries(months.filter((m) => m <= month).map((m) => [m, delinq.months[m]])) }} deals={deals} title={`${fundName} rent delinquency`} />
              <div className="overflow-x-auto rounded-lg border border-gray-100" data-testid="delinquency-assets">
                <table className="w-full tabular-nums">
                  <thead className="bg-gray-50 text-gray-500"><tr>{["Asset", ...PAST_DUE.map((k) => BUCKETS.find((b) => b[0] === k)[1]), "Past due", "% of rent", "Tenants"].map((h) => <th key={h} className="px-2 py-1.5 text-right font-medium first:text-left">{h}</th>)}</tr></thead>
                  <tbody>
                    {agg.assets.filter((a) => a.tenants > 0).map((a) => (
                      <tr key={a.dealId} className="border-t border-gray-100">
                        <td className="px-2 py-1"><button type="button" onClick={() => { setScope("asset"); setAssetPick(a.dealId); }} className="text-blue-700 hover:underline">{a.asset}</button></td>
                        {PAST_DUE.map((k) => <td key={k} className="px-2 py-1 text-right">{a.buckets[k] ? usd(a.buckets[k]) : ""}</td>)}
                        <td className="px-2 py-1 text-right font-medium">{usd(a.delinquent)}</td>
                        <td className={`px-2 py-1 text-right ${a.pctRent > 5 ? "font-medium text-red-700" : ""}`}>{pct(a.pctRent)}</td>
                        <td className="px-2 py-1 text-right">{a.tenantsDelinquent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tr.length > 1 && (
                <p className="text-[11px] text-gray-600" data-testid="delinquency-trend">Trend: {tr.map((t) => `${monthLabel(t.month)} ${usd(t.delinquent)} (${pct(t.pctRent)})`).join(" → ")}</p>
              )}
            </>
          ) : (
            <p className="font-medium">{deals.find((d) => d.id === focus)?.inputs?.propertyName}: {usd(agg.assets.find((a) => a.dealId === focus)?.delinquent)} past due ({pct(agg.assets.find((a) => a.dealId === focus)?.pctRent)} of monthly rent) · {monthLabel(month)}</p>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-100" data-testid="delinquency-tenants">
            <table className="w-full tabular-nums">
              <thead className="bg-gray-50 text-gray-500"><tr>{["Tenant", "Asset · unit", ...BUCKETS.map((b) => b[1]), "Prepaid", "Past due", "% rent", "Deposit covers", "Default and cure (lease)", "Notes"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {tenants.map((t) => {
                  const lease = t.unitId ? leaseFor(t.unitId) : null;
                  const cure = lease?.abstract ? fieldOf(lease.abstract, "default_cure")?.value : "";
                  return (
                    <tr key={t.tenantCode} className={`border-t border-gray-100 align-top ${t.buckets.d180 + t.buckets.over180 > 0 ? "bg-red-50/50" : t.delinquent > 0 ? "" : "text-gray-500"}`}>
                      <td className="px-2 py-1"><span className="font-medium">{t.tenant}</span><p className="font-mono text-[10px] text-gray-500">{t.tenantCode}{Object.keys(t.byCharge).filter((k) => t.byCharge[k] > 0).map((k) => ` · ${CHARGE_TYPES[k]}`).join("")}</p></td>
                      <td className="px-2 py-1">{t.asset} · {t.unitName}</td>
                      {BUCKETS.map(([k]) => <td key={k} className="px-2 py-1 text-right">{t.buckets[k] ? usd(t.buckets[k]) : ""}</td>)}
                      <td className="px-2 py-1 text-right text-emerald-700">{t.buckets.prepay ? usd(t.buckets.prepay) : ""}</td>
                      <td className="px-2 py-1 text-right font-medium">{usd(t.delinquent)}</td>
                      <td className="px-2 py-1 text-right">{pct(t.pctRent, 0)}</td>
                      <td className="px-2 py-1 text-right">{t.deposit ? `${usd(t.depositCovers)} of ${usd(t.deposit)}` : "—"}{t.guarantor ? <p className="text-[10px] text-gray-500">Guarantor: {t.guarantor}</p> : null}</td>
                      <td className="max-w-[16rem] px-2 py-1 text-[11px] text-gray-600">{cure || "—"}</td>
                      <td className="px-2 py-1">
                        <input defaultValue={delinq.notes?.[t.tenantCode] ?? ""} disabled={!canEdit} onBlur={(e) => e.target.value !== (delinq.notes?.[t.tenantCode] ?? "") && setNote(t.tenantCode, e.target.value)} placeholder="Collection actions" aria-label={`Notes for ${t.tenantCode}`} className="w-44 rounded border border-gray-200 px-1.5 py-0.5" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {agg.unmapped.length > 0 && <p className="text-amber-800">⚠ {agg.unmapped.length} rows have a property code not mapped to an asset: upload the report again to map them.</p>}
          {coll.length > 0 && (
            <div className="rounded-lg border border-gray-100 p-2" data-testid="collections">
              <p className="font-medium">Collections vs credit-loss assumption (tenant ledger {delinq.ledger.file})</p>
              {coll.filter((c) => !focus || c.dealId === focus).map((c) => (
                <p key={c.dealId} className={c.belowAssumption ? "text-red-700" : ""}>{c.asset}: collected {pct(c.collectedPct)} of {usd(c.charged)} charged (underwriting assumes {pct(c.expectedPct)}){c.belowAssumption ? " ⚠ below the assumption" : ""}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
