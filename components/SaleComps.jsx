"use client";

// 1.1.16 (user, 11/27): the comps of one sale (the asset's disposition set),
// inside its card in Dispositions → Assets for Sale. Kept on the sale
// (sale.comps), separate from the acquisition set in Research → Comps.
import { makeComp } from "@/lib/comps";
import { copyAcquisitionComps, saleCompsView, saveSaleComps } from "@/lib/assetMetrics";

const money = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : `$${Math.round(Number(v)).toLocaleString("en-US")}`);
const pct = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const signed = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const inp = "rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:bg-transparent disabled:border-transparent";
const num = (v) => (v === "" || v == null ? null : Number(v));
const COLS = [["name", "Comp", "text", "w-44"], ["city", "City", "text", "w-24"], ["saleDate", "Sale date", "date", ""], ["sf", "SF", "number", "w-20"], ["price", "Price", "number", "w-28"], ["capRate", "Cap (%)", "number", "w-16"], ["occupancy", "Occ. (%)", "number", "w-16"]];

export default function SaleComps({ inputs, sale, canEdit = false, onUpdateSale, todayISO }) {
  const v = saleCompsView(inputs, sale, { todayISO });
  const comps = v.state.comps ?? [];
  const save = (nextComps) => onUpdateSale((cur) => ({ ...cur, comps: saveSaleComps({ ...(cur.comps ?? v.state), comps: nextComps }, { todayISO }) }), "Disposition comps");
  const setField = (id, key, value) => save(comps.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, [key]: value };
    if (key === "price" || key === "sf") next.pricePSF = next.price && next.sf ? next.price / next.sf : null;
    return next;
  }));
  const acqCount = (inputs?.salesComps?.comps ?? []).length;
  const copy = () => onUpdateSale((cur) => ({ ...cur, comps: copyAcquisitionComps(inputs, cur, { todayISO }).state }), "Disposition comps");
  return (
    <div data-testid="sale-comps">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Comps <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">Disposition set</span> <span className="font-normal text-gray-500">{comps.length ? `${comps.length} comp${comps.length === 1 ? "" : "s"}${v.startedAt ? ` · started ${usDate(v.startedAt)}` : ""}` : "None yet. Separate from the acquisition comps in Research."}</span></p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button type="button" disabled={!acqCount} onClick={copy} title={acqCount ? "Adds the asset's acquisition comps that aren't here yet" : "This asset has no acquisition comps"} className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] disabled:opacity-40" data-testid="sale-comps-copy">Copy from the acquisition set</button>
            <button type="button" onClick={() => save([...comps, makeComp({ saleDate: null })])} className="rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white" data-testid="sale-comps-add">+ Comp</button>
          </div>
        )}
      </div>
      {comps.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full tabular-nums" data-testid="sale-comps-table">
            <thead className="text-gray-500"><tr>{COLS.map(([k, l, t]) => <th key={k} className={`font-medium ${t === "number" ? "text-right" : "text-left"}`}>{l}</th>)}<th className="text-right font-medium">$ / SF</th><th className="font-medium">Use</th><th /></tr></thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id} className={c.include ? "" : "text-gray-400"} data-testid="sale-comp-row">
                  {COLS.map(([k, l, t, w]) => (
                    <td key={k} className={t === "number" ? "text-right" : ""}>
                      <input aria-label={`Comp ${l}`} type={t} step={k === "capRate" ? "0.01" : undefined} value={c[k] ?? ""} disabled={!canEdit} onChange={(e) => setField(c.id, k, t === "number" ? num(e.target.value) : e.target.value || (t === "date" ? null : ""))} className={`${inp} ${w} ${t === "number" ? "text-right" : ""}`} />
                    </td>
                  ))}
                  <td className="text-right">{c.pricePSF != null ? `$${c.pricePSF.toFixed(0)}` : "—"}</td>
                  <td className="text-center"><input aria-label="Use comp" type="checkbox" checked={!!c.include} disabled={!canEdit} onChange={(e) => setField(c.id, "include", e.target.checked)} /></td>
                  <td>{canEdit && <button type="button" aria-label="Remove comp" onClick={() => save(comps.filter((z) => z.id !== c.id))} className="text-[11px] text-red-700 hover:underline">Remove</button>}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-semibold" data-testid="sale-comps-avg"><td colSpan={5}>Average of the {v.used} comp{v.used === 1 ? "" : "s"} in use</td><td className="text-right">{pct(v.avgCapPct)}</td><td /><td className="text-right">{v.avgPsf != null ? `$${v.avgPsf.toFixed(0)}` : "—"}</td><td colSpan={2} /></tr>
            </tbody>
          </table>
        </div>
      )}
      {v.used > 0 && (
        <div className="mt-2 overflow-x-auto rounded border border-gray-200 bg-white p-2">
          <p className="mb-1 text-[11px] font-semibold text-gray-600">What the comps imply for what&apos;s being sold ({Math.round(v.sf).toLocaleString("en-US")} SF, forward NOI {money(v.noi)})</p>
          <table className="w-full tabular-nums" data-testid="sale-comps-implied">
            <thead className="text-gray-500"><tr><th className="text-left font-medium">Measure</th><th className="text-right font-medium">Price</th><th className="text-right font-medium">$ / SF</th><th className="text-right font-medium">Cap rate</th><th className="text-right font-medium">vs. comps by $ / SF</th></tr></thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.key} className={r.key.startsWith("comps_") ? "bg-amber-50/50" : ""} data-testid="sale-comps-implied-row">
                  <td>{r.label}</td><td className="text-right">{money(r.price)}</td><td className="text-right">{r.psf != null ? `$${r.psf.toFixed(0)}` : "—"}</td><td className="text-right">{pct(r.capPct)}</td><td className="text-right">{signed(r.vsCompsPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
