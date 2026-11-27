"use client";
// 1.1.24: leases signed after purchase, on the Rent Roll (lib/leaseHistory.js).
//   LeasesToday: every unit with the lease in effect today (read-only).
//   UnitLeaseHistory: one unit's history and the form to add a lease.
import { useState } from "react";
import { LATER_LEASE_KINDS, addLaterLease, endedLeases, laterLeaseKindLabel, laterLeasesOf, leaseHistory, leaseToday, removeLaterLease } from "@/lib/leaseHistory";
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");

const psf = (v) => (v > 0 ? `$${Number(v).toFixed(2)}` : "—");
const PILL = {
  later: "bg-emerald-50 text-emerald-800", purchase: "bg-blue-50 text-blue-800", ended: "bg-amber-100 text-amber-900", gap: "bg-gray-100 text-gray-700", vacant: "bg-gray-100 text-gray-700",
};
export function leaseTodayLabel(t) {
  if (t.status === "later") return `${laterLeaseKindLabel(t.kind)}, signed`;
  if (t.status === "purchase") return "At purchase";
  if (t.status === "ended") return "Ended, no lease recorded";
  if (t.status === "gap") return "Vacant, next lease recorded";
  return "Vacant";
}

// Shown on an owned asset once a lease has been recorded since purchase, or
// a lease has ended with nothing newer recorded.
export function LeasesToday({ inputs, units, todayISO, onOpen }) {
  const inp = { ...inputs, units };
  const owned = /^\d{4}-\d{2}-\d{2}$/.test(inputs.acquisitionDate ?? "") && inputs.acquisitionDate <= todayISO;
  const anyLater = units.some((u) => laterLeasesOf(u).length), ended = owned ? endedLeases(inp, todayISO) : [];
  if (!owned || (!anyLater && !ended.length)) return null;
  const rows = units.map((u) => ({ u, t: leaseToday(u, inp, todayISO) }));
  const onLater = rows.filter((r) => r.t.status === "later").length;
  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3" data-testid="leases-today">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Leases in effect today</h3>
        <p className="text-xs text-gray-600" data-testid="leases-today-summary">
          {onLater} unit{onLater === 1 ? "" : "s"} on a lease signed since purchase
          {ended.length > 0 && <> · <span className="font-medium text-amber-800">{ended.length} lease{ended.length === 1 ? " has" : "s have"} ended with no newer lease recorded</span></>}
        </p>
      </div>
      <p className="mb-2 text-xs text-gray-500">The table below this one is the rent roll at purchase, which the model starts from. Open a unit there (▸) to add a lease signed since. Where a signed lease exists the model uses it; your rollover assumptions apply after the last one ends.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="text-gray-500"><tr>{["Unit", "Tenant", "SF", "Rent / SF", "Lease start", "Lease end", "Lease"].map((h) => <th key={h} className={`px-2 py-1 font-medium ${["SF", "Rent / SF"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ u, t }) => (
              <tr key={u.id} data-testid="lease-today-row">
                <td className="px-2 py-1"><button type="button" onClick={() => onOpen?.(u.id)} className="text-blue-700 hover:underline">{u.name || u.id}</button></td>
                <td className="px-2 py-1">{t.tenantName || "—"}</td>
                <td className="px-2 py-1 text-right">{(Number(u.squareFeet) || 0).toLocaleString("en-US")}</td>
                <td className="px-2 py-1 text-right">{t.status === "gap" || t.status === "vacant" ? "—" : psf(t.rentPSF)}</td>
                <td className="px-2 py-1">{t.start ? usDate(t.start) : "—"}</td>
                <td className="px-2 py-1">{t.end ? usDate(t.end) : "—"}</td>
                <td className="px-2 py-1"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[t.status]}`} data-testid="lease-today-status">{leaseTodayLabel(t)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BLANK = { kind: "renewal", tenantName: "", start: "", end: "", rentPSF: "", escalationPct: "", freeMonths: "", tiPSF: "", lcPct: "" };

// One unit's lease history with the form to add a lease signed since purchase.
// onInputs(nextInputs): saves the asset's inputs.
export function UnitLeaseHistory({ unit, inputs, units, canEdit = true, onUnits, email = "" }) {
  const inp = { ...inputs, units };
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const hist = leaseHistory(unit, inp);
  const field = "w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-400 focus:outline-none";
  const save = () => {
    const res = addLaterLease(inp, unit.id, form, { by: email });
    if (res.error) { setErr(res.error); return; }
    onUnits(res.inputs.units);
    setForm(null); setErr("");
  };
  const start = () => { setErr(""); setForm({ ...BLANK, kind: unit.leaseStatus === "occupied" ? "renewal" : "new", tenantName: unit.leaseStatus === "occupied" ? unit.tenantName ?? "" : "" }); };
  return (
    <div className="border-t border-blue-100 px-3 py-3" data-testid="unit-lease-history">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-gray-800">Leases signed since purchase</h4>
        {canEdit && !form && <button type="button" onClick={start} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50" data-testid="add-later-lease">+ Add lease</button>}
      </div>
      {hist.filter((h) => h.type !== "purchase").length === 0 && !form && <p className="text-xs text-gray-500">None recorded. The model uses your rollover assumptions when the lease at purchase ends.</p>}
      {hist.some((h) => h.type !== "purchase") && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-xs">
            <thead className="text-gray-500"><tr>{["Lease", "Tenant", "Start", "End", "Rent / SF", "Increase", "Free", "TI / SF", "Commission", ""].map((h, i) => <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {hist.map((h, i) => h.type === "gap" ? (
                <tr key={i} className="text-gray-500" data-testid="lease-history-row"><td className="px-2 py-1">Vacant</td><td className="px-2 py-1">{h.months} month{h.months === 1 ? "" : "s"}</td><td className="px-2 py-1">{usDate(h.start)}</td><td className="px-2 py-1">{usDate(h.end)}</td><td colSpan={6} className="px-2 py-1">Downtime</td></tr>
              ) : h.type === "purchase" ? (
                <tr key={i} className="text-gray-600" data-testid="lease-history-row"><td className="px-2 py-1">At purchase</td><td className="px-2 py-1">{h.tenantName || "—"}</td><td className="px-2 py-1">—</td><td className="px-2 py-1">{h.end ? usDate(h.end) : "—"}</td><td className="px-2 py-1">{psf(h.rentPSF)}</td><td colSpan={5} className="px-2 py-1">The rent roll row above</td></tr>
              ) : (
                <tr key={h.id} data-testid="lease-history-row">
                  <td className="px-2 py-1">{laterLeaseKindLabel(h.kind)}</td><td className="px-2 py-1">{h.tenantName || "—"}</td><td className="px-2 py-1">{usDate(h.start)}</td><td className="px-2 py-1">{usDate(h.end)}</td>
                  <td className="px-2 py-1">{psf(h.rentPSF)}</td><td className="px-2 py-1">{h.rentSteps?.length ? "Rent steps" : `${h.escalationPct || 0}%`}</td><td className="px-2 py-1">{h.freeMonths || 0} mo</td><td className="px-2 py-1">{psf(h.tiPSF)}</td><td className="px-2 py-1">{h.lcPct != null ? `${h.lcPct}%` : "Unit's rate"}</td>
                  <td className="px-2 py-1 text-right">{canEdit && <><button type="button" onClick={() => { setErr(""); setForm({ ...BLANK, ...h, lcPct: h.lcPct ?? "" }); }} className="mr-2 text-blue-700 hover:underline">Edit</button><button type="button" onClick={() => window.confirm(`Remove the lease from ${usDate(h.start)} to ${usDate(h.end)}? The model goes back to your rollover assumptions for those months.`) && onUnits(removeLaterLease(inp, unit.id, h.id).units)} className="text-red-700 hover:underline" aria-label={`Remove the lease starting ${h.start}`}>Remove</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <div className="mt-2 rounded-lg border border-blue-200 bg-white p-2" data-testid="later-lease-form">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <label className="text-[11px] text-gray-600">Renewal or new tenant<select aria-label="Renewal or new tenant" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={field}>{LATER_LEASE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="text-[11px] text-gray-600">Tenant<input aria-label="Tenant" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} className={field} /></label>
            <label className="text-[11px] text-gray-600">Start<input aria-label="Lease start" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={field} /></label>
            <label className="text-[11px] text-gray-600">End<input aria-label="Lease end" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={field} /></label>
            <label className="text-[11px] text-gray-600">Rent / SF / yr at the start<input aria-label="Rent per SF" type="number" step="any" value={form.rentPSF} onChange={(e) => setForm({ ...form, rentPSF: e.target.value })} className={field} /></label>
            <label className="text-[11px] text-gray-600">Increase, % a year<input aria-label="Annual increase" type="number" step="any" value={form.escalationPct} onChange={(e) => setForm({ ...form, escalationPct: e.target.value })} className={field} /></label>
            <label className="text-[11px] text-gray-600">Free rent, months<input aria-label="Free rent months" type="number" step="any" value={form.freeMonths} onChange={(e) => setForm({ ...form, freeMonths: e.target.value })} className={field} /></label>
            <label className="text-[11px] text-gray-600">TI / SF<input aria-label="TI per SF" type="number" step="any" value={form.tiPSF} onChange={(e) => setForm({ ...form, tiPSF: e.target.value })} className={field} /></label>
            <label className="text-[11px] text-gray-600">Commission, % of the rent over the term<input aria-label="Commission percent" type="number" step="any" placeholder="Unit's rate" value={form.lcPct} onChange={(e) => setForm({ ...form, lcPct: e.target.value })} className={field} /></label>
          </div>
          {err && <p role="alert" className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="later-lease-error">{err}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={save} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700" data-testid="save-later-lease">Save lease</button>
            <button type="button" onClick={() => { setForm(null); setErr(""); }} className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">The model earns this rent for the lease&apos;s months, treats the time before it as vacant, and charges the free rent, TI and commission in the month it starts.</p>
        </div>
      )}
    </div>
  );
}
