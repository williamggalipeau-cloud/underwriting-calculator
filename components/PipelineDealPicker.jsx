"use client";

// Underwriter's Pipeline Deal dropdown (user, 11/25, 1.1.6): every Pipeline
// deal, grouped Active / History (lib/screenerPicker.js).
export default function PipelineDealPicker({ groups, value = "", onPick, onEdit = null, label = "" }) {
  const { active = [], history = [], other = [] } = groups ?? {};
  const all = [...active, ...history, ...other];
  const known = all.some((o) => o.value === value);
  const opt = (o) => <option key={o.value} value={o.value}>{o.name} · {o.meta}</option>;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4">
      <label htmlFor="pipeline-deal-picker" className="text-xs font-medium uppercase tracking-wide text-gray-500">Pipeline Deal</label>
      <select
        id="pipeline-deal-picker"
        data-testid="pipeline-deal-picker"
        value={known ? value : ""}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="min-w-[22rem] rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
      >
        {!known && <option value="" disabled>{all.length ? "Choose a Pipeline Deal…" : "No Pipeline deals yet"}</option>}
        {active.length > 0 && <optgroup label="Active">{active.map(opt)}</optgroup>}
        {history.length > 0 && <optgroup label="History">{history.map(opt)}</optgroup>}
        {other.length > 0 && <optgroup label="Not on the Pipeline">{other.map(opt)}</optgroup>}
      </select>
      {onEdit && <button type="button" onClick={onEdit} title="Open this deal's inputs (price, loan, rent roll and the rest)" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">Edit inputs</button>}
      {label && <span className="text-xs text-gray-500">{label}</span>}
    </div>
  );
}
