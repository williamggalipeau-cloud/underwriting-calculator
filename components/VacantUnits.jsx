"use client";
// Vacant Units (user, 11/25; on Active Leasing from 1.1.3): every vacant unit
// on the rent rolls with its days vacant, leasing manager, asking rent, plan
// target, the asset's rent comps and the leasing activity on it: what's
// leasable now. One asset (no Asset column; + Prospect starts a prospect on
// the unit) or all assets (with the Asset column; Open asset → switches to
// that asset's view).
import { useMemo, useState } from "react";
import { vacantUnits } from "@/lib/home";
import { stageLabel } from "@/lib/leasing";

const TH = "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500";
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");

export default function VacantUnits({ deals = [], todayISO = new Date().toISOString().slice(0, 10), showAsset = false, onAddProspect = null, onOpenAsset = null }) {
  const rows = useMemo(() => vacantUnits(deals, { todayISO }), [deals, todayISO]);
  const [all, setAll] = useState(false);
  const sf = rows.reduce((s, v) => s + v.sf, 0);
  const lead = showAsset ? 2 : 1;
  return (
    <section className="space-y-2" data-testid="vacant-units">
      <div>
        <h3 className="text-sm font-semibold">Vacant Units {rows.length > 0 && <span className="ml-1 rounded-full bg-blue-50 px-1.5 text-[11px] font-normal text-blue-700" data-testid="vacant-count">{rows.length} unit{rows.length === 1 ? "" : "s"} · {sf.toLocaleString("en-US")} SF</span>}</h3>
        <p className="text-[11px] text-gray-500">What&apos;s leasable now, from the rent roll, with the leasing activity on each unit. Asking rent is the asset&apos;s market rent; plan target is the business plan&apos;s lease-up rent; rent comps are the average of the asset&apos;s rent comps (below).</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No vacant units on the rent roll.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs" data-testid="vacant-table">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {showAsset && <th className={TH}>Asset</th>}
                  <th className={TH}>Unit</th>
                  <th className={`${TH} text-right`}>Days vacant</th>
                  <th className={TH}>Leasing manager</th>
                  <th className={`${TH} text-right`}>SF</th>
                  <th className={`${TH} text-right`}>Asking rent</th>
                  <th className={`${TH} text-right`}>Plan target</th>
                  <th className={`${TH} text-right`}>Rent comps</th>
                  <th className={TH}>Best prospect</th>
                  <th className={TH}>Next step</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(all ? rows : rows.slice(0, 10)).map((v) => (
                  <tr key={`${v.dealId}-${v.unitId}`} data-testid="vacant-unit" className="align-top">
                    {showAsset && <td className="px-2 py-1.5 font-medium" data-testid="cell-asset">{v.asset}</td>}
                    <td className="px-2 py-1.5">{v.unit || "—"}</td>
                    <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${v.daysVacant > 180 ? "font-medium text-red-700" : ""}`} data-testid="cell-days-vacant">{v.daysVacant.toLocaleString("en-US")} d<span className="block text-[10px] font-normal text-gray-400">{v.vacantBasis === "acquisition" ? "since acquisition" : `since ${usDate(v.vacantSince)}`}</span></td>
                    <td className="whitespace-nowrap px-2 py-1.5" data-testid="cell-leasing-manager">{v.leasingManager || <span className="text-amber-700">Unassigned</span>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{v.sf.toLocaleString("en-US")}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{v.askingRentPSF != null ? `$${v.askingRentPSF.toFixed(2)}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{v.planTargetPSF != null ? `$${v.planTargetPSF.toFixed(2)}` : <span className="text-gray-400">—</span>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums" data-testid="vacant-comps">{v.compAvgPSF != null ? <>${v.compAvgPSF.toFixed(2)}<span className="block text-[10px] text-gray-400">avg of {v.comps}</span></> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-2 py-1.5">{v.best ? <><span className="mr-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">{stageLabel(v.best.stage)}</span>{v.best.tenant || "Prospect"}<span className="block text-[10px] text-gray-400">{v.prospects} prospect{v.prospects === 1 ? "" : "s"}</span></> : <span className="text-amber-700" data-testid="no-prospects">No prospects</span>}</td>
                    <td className="px-2 py-1.5">{v.next ? <>{v.next.text}<span className={`block text-[10px] ${v.next.days < 0 ? "text-red-700" : "text-gray-500"}`}>{usDate(v.next.date)} · {v.next.days < 0 ? `${-v.next.days} d overdue` : `${v.next.days} d`}</span></> : <span className="text-gray-400">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {showAsset
                        ? onOpenAsset && <button type="button" aria-label={`Open ${v.asset}`} onClick={() => onOpenAsset(v.dealId)} className="rounded border border-blue-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">Open asset →</button>
                        : onAddProspect && <button type="button" aria-label={`Add a prospect for unit ${v.unit}`} onClick={() => onAddProspect(v.dealId, v.unitId, v.sf)} className="rounded border border-blue-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">+ Prospect</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200">
                <tr className="font-semibold">
                  <td className="px-2 py-1.5" colSpan={lead}>Total{showAsset ? ` · ${rows.length} units` : ""}</td>
                  <td className="px-2 py-1.5 text-right font-normal text-gray-600 tabular-nums" title="Average days vacant, weighted by SF">{sf ? `${Math.round(rows.reduce((s, v) => s + v.daysVacant * v.sf, 0) / sf)} d avg` : ""}</td>
                  <td />
                  <td className="px-2 py-1.5 text-right tabular-nums">{sf.toLocaleString("en-US")}</td>
                  <td colSpan={6} className="px-2 py-1.5 font-normal text-gray-600" data-testid="vacant-summary">{rows.filter((v) => v.prospects > 0).length} with active prospects · {rows.filter((v) => !v.prospects).length} with none</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {rows.length > 10 && <button type="button" onClick={() => setAll(!all)} className="text-[11px] text-blue-700 hover:underline">{all ? "Show fewer" : `Show all ${rows.length}`}</button>}
        </>
      )}
    </section>
  );
}
