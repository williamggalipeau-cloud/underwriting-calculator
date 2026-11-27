"use client";

// Asset selector shown above the single-deal tabs (Quick Underwrite, Unit
// Roll, Debt, Cash Flow, Asset Return, Sensitivity, Comps). Lists every open
// deal; saved fund snapshots are listed too and open for editing when picked.
import { useState } from "react";

export default function AssetPicker({ deals, snapshots = [], activeId, onPick, onOpenSnapshot, label, onEdit = null, pickLabel = "Asset", placeholder = "" }) {
  const known = deals.some((d) => d.id === activeId);
  const name = (d) => d.inputs?.propertyName || "Unnamed deal";
  const byName = (a, b) => name(a).localeCompare(name(b));
  const funds = [...new Set(deals.map((d) => d.inputs?.fundName?.trim() || ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const [q, setQ] = useState("");
  // 1.1.11 (UI review): with many assets, type to find one (a match opens it).
  const findAsset = (text) => {
    setQ(text);
    const t = text.trim().toLowerCase();
    if (!t) return;
    const hit = deals.find((d) => name(d).toLowerCase() === t) ?? (deals.filter((d) => name(d).toLowerCase().includes(t)).length === 1 ? deals.find((d) => name(d).toLowerCase().includes(t)) : null);
    if (hit && hit.id !== activeId) { onPick(hit.id); setQ(""); }
  };
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4">
      <label htmlFor="asset-picker" className="text-xs font-medium text-gray-600">{pickLabel}</label>
      <select
        id="asset-picker"
        value={known || !placeholder ? activeId : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v.startsWith("snap:")) onOpenSnapshot(v.slice(5));
          else onPick(v);
        }}
        className="min-w-[16rem] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
      >
        {placeholder && !known && <option value="" disabled>{placeholder}</option>}
        {funds.map((f) => (
          <optgroup key={f || "none"} label={f || "Not in a portfolio (Underwriter)"}>
            {deals.filter((d) => (d.inputs?.fundName?.trim() || "") === f).sort(byName).map((d) => (
              <option key={d.id} value={d.id}>{name(d)}</option>
            ))}
          </optgroup>
        ))}
        {snapshots.length > 0 && (
          <optgroup label="Saved snapshots (opens for editing)">
            {[...snapshots].sort(byName).map((d) => (
              <option key={d.id} value={`snap:${d.id}`}>{name(d)}{d.inputs?.fundName ? ` · ${d.inputs.fundName}` : ""}</option>
            ))}
          </optgroup>
        )}
      </select>
      {deals.length > 8 && (
        <>
          <input type="search" list="asset-picker-names" aria-label="Find an asset" placeholder="Find…" value={q} onChange={(e) => findAsset(e.target.value)} className="w-36 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500" data-testid="asset-find" />
          <datalist id="asset-picker-names">{[...deals].sort(byName).map((d) => <option key={d.id} value={name(d)} />)}</datalist>
        </>
      )}
      {onEdit && <button type="button" onClick={onEdit} title="Open this asset's inputs (price, loan, rent roll and the rest)" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">Edit inputs</button>}
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </div>
  );
}
