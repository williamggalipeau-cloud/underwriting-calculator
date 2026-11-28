"use client";
// 1.1.30: the capital projects of the underwriting, where the Capex Budget
// field was. The list's total is the Capex Budget the model uses; an asset
// with no list keeps its single figure, shown as one line that can be split.
import { PROJECT_TYPES, blankProject, budgetTies, hasProjects, projectsShown, projectsTotal, setProjects } from "@/lib/capitalProjects";

const inp = "w-full rounded border border-gray-200 bg-white px-1.5 py-1 text-xs";
const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString("en-US")}`;

export default function CapitalProjectsEditor({ inputs, onChange }) {
  const listed = hasProjects(inputs);
  const rows = projectsShown(inputs);
  const save = (list) => onChange(setProjects(inputs, list));
  const start = () => save(rows.length ? rows.map((r) => ({ ...r, id: r.single ? blankProject().id : r.id })) : [blankProject()]);
  const upd = (i, k, v) => save(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const total = projectsTotal(rows);
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-gray-200 p-3" data-testid="capital-projects">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Capital projects</h4>
        {listed
          ? <button type="button" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium" onClick={() => save([...rows, blankProject()])} data-testid="cp-add">+ Add project</button>
          : <button type="button" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium" onClick={start} data-testid="cp-itemize">{rows.length ? "Split into projects" : "List the projects"}</button>}
      </div>
      {listed ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs" data-testid="cp-table">
            <thead className="text-left text-[10.5px] uppercase tracking-wide text-gray-500"><tr><th className="px-1 py-1">Project</th><th className="px-1 py-1">Type</th><th className="px-1 py-1">Scope</th><th className="px-1 py-1">Budget</th><th className="px-1 py-1">Start month</th><th className="px-1 py-1">Months</th><th className="px-1 py-1">Expected return</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-gray-100" data-testid="cp-row">
                  <td className="px-1 py-1"><input className={inp} value={r.project ?? ""} onChange={(e) => upd(i, "project", e.target.value)} aria-label={`Project ${i + 1} name`} /></td>
                  <td className="px-1 py-1"><select className={inp} value={r.type ?? "Other"} onChange={(e) => upd(i, "type", e.target.value)} aria-label={`Project ${i + 1} type`}>{PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                  <td className="px-1 py-1"><input className={inp} value={r.scope ?? ""} onChange={(e) => upd(i, "scope", e.target.value)} aria-label={`Project ${i + 1} scope`} /></td>
                  <td className="px-1 py-1"><input type="number" min={0} step={5000} className={`${inp} w-28`} value={r.budget ?? 0} onChange={(e) => upd(i, "budget", Number(e.target.value))} aria-label={`Project ${i + 1} budget`} /></td>
                  <td className="px-1 py-1"><input type="number" min={1} className={`${inp} w-16`} value={r.startMonth ?? 1} onChange={(e) => upd(i, "startMonth", Number(e.target.value))} aria-label={`Project ${i + 1} start month`} /></td>
                  <td className="px-1 py-1"><input type="number" min={0} className={`${inp} w-16`} value={r.months ?? 0} onChange={(e) => upd(i, "months", Number(e.target.value))} aria-label={`Project ${i + 1} months`} /></td>
                  <td className="px-1 py-1"><input className={inp} value={r.expectedReturn ?? ""} onChange={(e) => upd(i, "expectedReturn", e.target.value)} aria-label={`Project ${i + 1} expected return`} /></td>
                  <td className="px-1 py-1"><button type="button" className="text-gray-500 hover:text-red-600" onClick={() => save(rows.filter((_, j) => j !== i))} aria-label={`Remove project ${i + 1}`}>✕</button></td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-800 font-semibold"><td className="px-1 py-1" colSpan={3}>Capex Budget (the total the model uses)</td><td className="px-1 py-1" data-testid="cp-total">{money(total)}</td><td colSpan={4} /></tr>
            </tbody>
          </table>
        </div>
      ) : rows.length ? (
        <p className="text-xs text-gray-600" data-testid="cp-single">One figure of {money(total)}, not split into projects yet.</p>
      ) : <p className="text-xs text-gray-500">No capital budget.</p>}
      {listed && !budgetTies(inputs) && <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" data-testid="cp-untied">The Capex Budget in the model ({money(inputs.capexBudget)}) is not the total of the projects ({money(total)}). Change any project to bring them back together.</p>}
      <p className="text-[11px] text-gray-500">{listed ? "The Capex Budget is this total. " : ""}The model funds the whole budget at purchase, so the start month and months do not move a return; they date the projects in the Asset Business Plan. Tenant improvements for new leases stay per unit in the leasing assumptions.</p>
    </div>
  );
}
