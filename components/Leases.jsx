"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FILE_KINDS,
  MAX_FILE_MB,
  STATUS_LABEL,
  addLeaseFiles,
  createLease,
  deleteLease,
  fileLink,
  fmtBytes,
  listLeases,
  removeLeaseFile,
  updateLease,
} from "@/lib/leaseDocs";

const STATUS_STYLE = {
  uploaded: "border-gray-200 bg-gray-50 text-gray-700",
  abstracted: "border-amber-200 bg-amber-50 text-amber-800",
  applied: "border-emerald-200 bg-emerald-50 text-emerald-800",
};
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" }) : "—");
const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";

// Picks PDFs and lets the user set each one's kind and order.
function FilePicker({ files, onChange, disabled }) {
  const ref = useRef(null);
  const add = (list) => {
    const pdfs = [...list].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    const next = [...files, ...pdfs.map((file) => ({ file, kind: "amendment" }))];
    if (next.length && !files.length) next[0] = { ...next[0], kind: "lease" };
    onChange(next);
  };
  const move = (i, d) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <input ref={ref} type="file" accept="application/pdf,.pdf" multiple className="sr-only" aria-label="Choose lease PDFs" onChange={(e) => { add(e.target.files ?? []); e.target.value = ""; }} />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!disabled) add(e.dataTransfer.files ?? []); }}
        className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-500"
      >
        <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={`${btn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}>Choose PDFs…</button>
        <span>or drop them here. Put the base lease first, then amendments in date order. PDF only, up to {MAX_FILE_MB} MB each.</span>
      </div>
      {files.length > 0 && (
        <ol className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-2 py-1 text-xs">
              <span className="w-5 text-right text-gray-400">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-gray-900">{f.file.name}</span>
              <span className="text-gray-400">{fmtBytes(f.file.size)}</span>
              <select value={f.kind} onChange={(e) => onChange(files.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className="rounded border border-gray-200 bg-white px-1 py-0.5" aria-label={`Type of ${f.file.name}`}>
                {FILE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">↑</button>
              <button type="button" disabled={i === files.length - 1} onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">↓</button>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label={`Remove ${f.file.name}`}>✕</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LeaseCard({ lease, assetName, units, canEdit, workspaceId, email, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState([]);
  const [editing, setEditing] = useState(false);
  const [tenant, setTenant] = useState(lease.tenant);
  const [unitIds, setUnitIds] = useState(lease.unit_ids ?? []);
  const unitName = (id) => units.find((u) => u.id === id)?.name ?? "(removed unit)";
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (path) =>
    run(async () => {
      const url = await fileLink(path);
      window.open(url, "_blank", "noopener");
    });
  const files = lease.files ?? [];
  const move = (i, d) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    run(() => updateLease(lease.id, { files: next }));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {editing ? (
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} className="w-64 rounded border border-gray-300 px-2 py-1 text-sm font-semibold" aria-label="Tenant" />
          ) : (
            <h3 className="text-sm font-semibold">{lease.tenant || lease.title || "Untitled lease"}</h3>
          )}
          <p className="mt-0.5 text-gray-500">
            {assetName}
            {" · "}
            {(lease.unit_ids ?? []).length ? `Unit ${(lease.unit_ids ?? []).map(unitName).join(", ")}` : "Not linked to a rent roll unit"}
            {" · added "}{fmtWhen(lease.created_at)}{lease.created_by_email ? ` by ${lease.created_by_email}` : ""}
          </p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[lease.status] ?? STATUS_STYLE.uploaded}`}>{STATUS_LABEL[lease.status] ?? lease.status}</span>
      </div>

      {editing && (
        <div className="mt-2 rounded-lg bg-gray-50 p-2">
          <p className="mb-1 font-medium text-gray-600">Rent roll units this lease covers</p>
          {units.length === 0 ? (
            <p className="text-gray-400">This asset has no rent roll yet. Applying the abstract (phase C) will create the unit.</p>
          ) : (
            <div className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto">
              {units.map((u) => (
                <label key={u.id} className="flex items-center gap-1">
                  <input type="checkbox" checked={unitIds.includes(u.id)} onChange={(e) => setUnitIds((p) => (e.target.checked ? [...p, u.id] : p.filter((x) => x !== u.id)))} />
                  {u.name}{u.tenantName ? ` · ${u.tenantName}` : ""}
                </label>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(async () => { await updateLease(lease.id, { tenant: tenant.trim(), unit_ids: unitIds }); setEditing(false); })} className={`${btn} border-blue-600 bg-blue-600 text-white`}>Save</button>
            <button type="button" onClick={() => { setEditing(false); setTenant(lease.tenant); setUnitIds(lease.unit_ids ?? []); }} className={`${btn} border-gray-200 bg-white text-gray-600`}>Cancel</button>
          </div>
        </div>
      )}

      <ol className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
        {files.map((f, i) => (
          <li key={f.path} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
            <span className="w-5 text-right text-gray-400">{i + 1}.</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">{FILE_KINDS.find(([k]) => k === f.kind)?.[1].split(" ")[0] ?? f.kind}</span>
            <button type="button" disabled={busy} onClick={() => open(f.path)} className="min-w-0 flex-1 truncate text-left font-medium text-blue-700 hover:underline">{f.name}</button>
            <span className="text-gray-400">{f.size ? fmtBytes(f.size) : ""}</span>
            {canEdit && (
              <>
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">↑</button>
                <button type="button" disabled={busy || i === files.length - 1} onClick={() => move(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">↓</button>
                <button type="button" disabled={busy} onClick={() => window.confirm(`Delete ${f.name} from this lease? The file is removed from storage.`) && run(() => removeLeaseFile(lease, f.path))} className="text-gray-400 hover:text-red-600" aria-label={`Delete ${f.name}`}>✕</button>
              </>
            )}
          </li>
        ))}
        {files.length === 0 && <li className="px-2 py-1.5 text-gray-400">No documents.</li>}
      </ol>

      {canEdit && adding.length > 0 && (
        <div className="mt-2 space-y-2">
          <FilePicker files={adding} onChange={setAdding} disabled={busy} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run(async () => { await addLeaseFiles(lease, workspaceId, adding, email); setAdding([]); })} className={`${btn} border-blue-600 bg-blue-600 text-white`}>{busy ? "Uploading…" : `Upload ${adding.length}`}</button>
            <button type="button" onClick={() => setAdding([])} className={`${btn} border-gray-200 bg-white text-gray-600`}>Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {canEdit && adding.length === 0 && (
          <label className={`${btn} cursor-pointer border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>
            + Add documents
            <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => { setAdding([...(e.target.files ?? [])].map((file) => ({ file, kind: "amendment" }))); e.target.value = ""; }} />
          </label>
        )}
        {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className={`${btn} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}>Edit tenant / units</button>}
        <button type="button" disabled title="Coming in phase B" className={`${btn} border-gray-200 bg-white text-gray-400`}>Abstract with Claude (coming soon)</button>
        {canEdit && (
          <button type="button" disabled={busy} onClick={() => window.confirm(`Delete the lease for ${lease.tenant || "this tenant"} and all ${files.length} of its documents? This can't be undone.`) && run(() => deleteLease(lease))} className={`${btn} ml-auto border-transparent text-gray-400 hover:text-red-600`}>Delete lease</button>
        )}
      </div>
    </div>
  );
}

export default function Leases({ workspace, signedIn, email, canEdit, deal, fundDeals, fundName }) {
  const [scope, setScope] = useState("asset");
  const [leases, setLeases] = useState(null);
  const [error, setError] = useState(null);
  const [newFiles, setNewFiles] = useState([]);
  const [newTenant, setNewTenant] = useState("");
  const [newUnits, setNewUnits] = useState([]);
  const [busy, setBusy] = useState(false);
  const wsId = workspace?.id;

  const refresh = useCallback(async () => {
    if (!wsId) return;
    try {
      setLeases(await listLeases(wsId));
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [wsId]);
  useEffect(() => {
    // Loads this workspace's leases; nothing to load without one.
    refresh();
  }, [refresh]);

  const units = deal?.inputs?.units ?? [];
  const dealName = (id) => fundDeals.find((d) => d.id === id)?.inputs?.propertyName ?? (id === deal?.id ? deal.inputs.propertyName : "Asset not in this fund");
  const unitsOf = (id) => (id === deal?.id ? units : fundDeals.find((d) => d.id === id)?.inputs?.units ?? []);
  const shown = useMemo(() => {
    if (!leases) return [];
    if (scope === "asset") return leases.filter((l) => l.deal_id === deal?.id);
    const ids = new Set(fundDeals.map((d) => d.id));
    return leases.filter((l) => ids.has(l.deal_id));
  }, [leases, scope, deal?.id, fundDeals]);
  const byAsset = useMemo(() => {
    const m = new Map();
    for (const l of shown) m.set(l.deal_id, [...(m.get(l.deal_id) ?? []), l]);
    return [...m.entries()].sort((a, b) => dealName(a[0]).localeCompare(dealName(b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  async function addLease(e) {
    e.preventDefault();
    if (!newFiles.length) return;
    setBusy(true);
    try {
      const tenantGuess = newTenant.trim() || units.find((u) => newUnits.includes(u.id))?.tenantName || "";
      await createLease(wsId, { dealId: deal.id, tenant: tenantGuess, unitIds: newUnits, files: newFiles }, email);
      setNewFiles([]);
      setNewTenant("");
      setNewUnits([]);
      await refresh();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const tenants = [...new Set(units.map((u) => u.tenantName).filter(Boolean))];
  const fundCount = leases ? leases.filter((l) => fundDeals.some((d) => d.id === l.deal_id)).length : 0;

  return (
    <div className="space-y-4 text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Leases</h2>
          <p className="text-xs text-gray-500">
            Lease PDFs for each asset, stored privately in the database. Abstracts, review and apply, critical dates and risk flags come next.
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
          {[["asset", deal?.inputs?.propertyName || "This asset"], ["fund", `Whole fund${fundName ? ` (${fundName})` : ""}`]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-3 py-1 font-medium ${scope === k ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
      </div>

      {!signedIn || !wsId ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
          Leases are stored in the database. Sign in and open a workspace to see and upload them.
        </div>
      ) : (
        <>
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-700" aria-label="Dismiss">✕</button>
            </p>
          )}

          {scope === "asset" && canEdit && deal && (
            <form onSubmit={addLease} className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-xs">
              <h3 className="text-sm font-semibold">Add a lease to {deal.inputs.propertyName || "this asset"}</h3>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-0.5">
                  <span className="text-gray-600">Tenant</span>
                  <input list="lease-tenants" value={newTenant} onChange={(e) => setNewTenant(e.target.value)} placeholder="Tenant name" className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1.5" />
                  <datalist id="lease-tenants">{tenants.map((t) => <option key={t} value={t} />)}</datalist>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-gray-600">Rent roll unit(s)</span>
                  {units.length ? (
                    <select multiple value={newUnits} onChange={(e) => setNewUnits([...e.target.selectedOptions].map((o) => o.value))} className="h-20 w-64 rounded-md border border-gray-300 bg-white px-1 py-1">
                      {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.tenantName ? ` · ${u.tenantName}` : " · vacant"}</option>)}
                    </select>
                  ) : (
                    <span className="w-64 py-1.5 text-gray-400">No rent roll yet: the lease can create the unit later.</span>
                  )}
                </label>
              </div>
              <FilePicker files={newFiles} onChange={setNewFiles} disabled={busy} />
              <button type="submit" disabled={busy || !newFiles.length} className={`${btn} border-blue-600 bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700`}>
                {busy ? "Uploading…" : `Upload lease${newFiles.length ? ` (${newFiles.length} document${newFiles.length > 1 ? "s" : ""})` : ""}`}
              </button>
            </form>
          )}
          {!canEdit && <p className="text-xs text-gray-500">You can open these documents. Owners and editors can add and change them.</p>}

          {leases === null ? (
            <p className="text-xs text-gray-400">Loading leases…</p>
          ) : shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
              {scope === "asset" ? `No leases for ${deal?.inputs?.propertyName || "this asset"} yet.` : "No leases in this fund yet."}
              {" "}Sample leases for every Model Fund I asset are in the repository under docs/sample-leases.
            </div>
          ) : (
            <div className="space-y-4">
              {scope === "fund" && <p className="text-xs text-gray-500">{fundCount} lease{fundCount === 1 ? "" : "s"} across {byAsset.length} of {fundDeals.length} assets.</p>}
              {byAsset.map(([dealId, ls]) => (
                <div key={dealId} className="space-y-2">
                  {scope === "fund" && <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{dealName(dealId)}</h3>}
                  {ls.map((l) => (
                    <LeaseCard
                      key={l.id}
                      lease={l}
                      assetName={dealName(l.deal_id)}
                      units={unitsOf(l.deal_id)}
                      canEdit={canEdit}
                      workspaceId={wsId}
                      email={email}
                      onChanged={refresh}
                      onError={setError}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
