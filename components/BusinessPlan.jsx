"use client";
// Business Plan tab (phase I): the asset's business plan by revision, its
// budget locked at closing, actuals and budget vs. plan.
import { useRef, useState } from "react";
import { TiByUnitTable } from "@/components/TiSpend";
import {
  LINES, PERIODS, addRevision, budgetFromModel, budgetRows, diffPlans, fundVariance, kpiActuals, matchProperties,
  milestoneStatus, modelChanges, modelFingerprint, parseIncomeStatement, periodKey, seedPlan, varianceReport, varianceRows,
} from "@/lib/businessPlan";
import { downloadBlob, parseCSV, safeFileName } from "@/lib/fundTerms";
import { readXlsxGrid, writeXlsx } from "@/lib/xlsx";

const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const inp = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
const money = (v) => (v == null || !isFinite(v) ? "—" : `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`);
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const FLAG = { red: "bg-red-50 text-red-800", amber: "bg-amber-50 text-amber-800" };
const ACTIONS = ["Hold", "Renew", "Re-tenant", "Lease up", "Demise", "Combine"];
const STATUS = ["open", "in progress", "done"];
const today = () => new Date().toISOString().slice(0, 10);

function Section({ title, children, right }) {
  return (
    <section className="space-y-2 rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3>{right}</div>
      {children}
    </section>
  );
}
function Table({ head, rows, testid }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" data-testid={testid}>
        <thead className="text-gray-500"><tr>{head.map((h, i) => <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

// Fund roll-up card (Portfolio Return).
export function BudgetVsActualSummary({ deals, onOpen }) {
  const months = [...new Set(deals.flatMap((d) => Object.keys(d.inputs.businessPlan?.actuals ?? {})))].sort();
  if (!months.length) return null;
  const end = months[months.length - 1];
  const f = fundVariance(deals, { kind: "ytd", end });
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs" data-testid="budget-summary">
      <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">NOI vs budget · year to date {end}</h3><p className="text-[11px] text-gray-500">Fund variance compares the {f.total.comparedAssets} asset{f.total.comparedAssets === 1 ? "" : "s"} with both a budget and actuals.</p></div>{onOpen && <button type="button" onClick={onOpen} className={`${btn} border-gray-200 text-blue-700`}>Asset business plan</button>}</div>
      <Table head={["Asset", "Plan (rev. 1)", "Current budget", "Actual", "Variance", "%"]} rows={[...f.rows.map((r) => (
        <tr key={r.dealId} className={`border-t border-gray-100 ${FLAG[r.flag] ?? ""}`}><td className="px-2 py-1">{r.asset}{r.noPlan ? <span className="ml-1 text-[10px] text-gray-400">(no plan yet)</span> : ""}</td><td className="px-2 py-1">{money(r.plan)}</td><td className="px-2 py-1">{money(r.current)}</td><td className="px-2 py-1">{money(r.actual)}</td><td className="px-2 py-1">{money(r.variance)}</td><td className="px-2 py-1">{pct(r.variancePct)}</td></tr>
      )), <tr key="t" className="border-t border-gray-300 font-semibold"><td className="px-2 py-1">Fund</td><td className="px-2 py-1">{money(f.total.plan)}</td><td className="px-2 py-1">{money(f.total.current)}</td><td className="px-2 py-1">{money(f.total.actual)}</td><td className="px-2 py-1">{money(f.total.variance)}</td><td className="px-2 py-1">{pct(f.total.variancePct)}</td></tr>]} />
    </div>
  );
}

export default function BusinessPlan({ dealId, inputs, fundName, fundType = "", fundDeals = [], canEdit, email, onApplyDeal }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const bp = inputs.businessPlan ?? null;
  const revs = bp?.revisions ?? [];
  const cur = revs[revs.length - 1] ?? null;
  const [viewN, setViewN] = useState(0); // 0 = current
  const [cmpN, setCmpN] = useState(0);
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState("");
  const [reforecast, setReforecast] = useState(false);
  const [budgetLabel, setBudgetLabel] = useState("");
  const [msg, setMsg] = useState(null);
  const [period, setPeriod] = useState({ kind: "ytd", end: "" });
  const fileRef = useRef(null);
  const name = inputs.propertyName || "This asset";
  const save = (next, entries, label) => onApplyDeal(dealId, (inp) => ({ ...inp, businessPlan: typeof next === "function" ? next(inp.businessPlan) : next }), entries, label);

  if (!cur) {
    return (
      <div className="space-y-3 text-gray-900" data-testid="business-plan">
        <h2 className="text-lg font-bold">Asset business plan · {name}</h2>
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-600">
          <p>No business plan yet. Revision 1 is the plan at closing: seeded from the IC memo and the closing underwriting, with the budget locked from the model. It is never overwritten; later changes are new revisions.</p>
          {canEdit && <button type="button" className={`${btn} mt-3 border-blue-600 bg-blue-600 text-white`} onClick={() => {
            const plan = seedPlan(inputs);
            const budget = budgetFromModel(inputs, { label: "Closing budget" });
            save(addRevision(bp, { plan, budget, inputs, by: email ?? "", note: inputs.icApproved ? "Seeded from the IC memo and closing underwriting" : "Seeded from the closing underwriting" }), [{ key: "businessPlan", field: "Business plan", from: "", to: "Revision 1 (closing)" }], "Business plan created");
          }}>Create business plan (revision 1)</button>}
        </div>
      </div>
    );
  }

  const shown = revs[(viewN || revs.length) - 1];
  const p = draft ?? shown.plan;
  const editing = !!draft;
  const modelDiff = modelChanges(cur.model, modelFingerprint(inputs));
  const months = Object.keys(bp.actuals ?? {}).sort();
  const end = period.end && months.includes(period.end) ? period.end : months[months.length - 1] ?? "";
  const rep = end ? varianceReport(bp, { kind: period.kind, end, sf: inputs.squareFootage }) : null;
  const k = kpiActuals(inputs);
  const units = inputs.units ?? [];
  const set = (path, v) => setDraft((d) => { const n = structuredClone(d); let o = n; for (const s of path.slice(0, -1)) o = o[s]; o[path[path.length - 1]] = v; return n; });
  const field = (path, type = "text", w = "w-full") => {
    let v = p; for (const s of path) v = v?.[s];
    return editing ? <input type={type} value={v ?? ""} onChange={(e) => set(path, type === "number" ? Number(e.target.value) : e.target.value)} className={`${inp} ${w}`} aria-label={path.join(" ")} /> : <span>{type === "number" && path.some((s) => /budget|spent|loan/.test(s)) ? money(v) : String(v ?? "") || "—"}</span>;
  };
  const area = (path, label) => {
    let v = p; for (const s of path) v = v?.[s];
    return (
      <label className="block text-xs"><span className="font-medium text-gray-600">{label}</span>
        {editing ? <textarea value={v ?? ""} onChange={(e) => set(path, e.target.value)} rows={2} className={`${inp} mt-0.5 w-full`} aria-label={label} /> : <p className="whitespace-pre-wrap text-gray-800">{v || "—"}</p>}
      </label>
    );
  };
  const addRow = (key, row) => setDraft((d) => ({ ...d, [key]: [...(d[key] ?? []), row] }));
  const delRow = (key, i) => setDraft((d) => ({ ...d, [key]: d[key].filter((_, j) => j !== i) }));

  function saveRevision(reason) {
    const plan = draft ?? cur.plan;
    const budget = reforecast ? budgetFromModel(inputs, { label: budgetLabel.trim() || `Re-forecast ${today()}` }) : cur.budget;
    const next = addRevision(bp, { plan, budget, inputs, by: email ?? "", note: note.trim(), reason });
    const rv = next.revisions[next.revisions.length - 1];
    if (!draft && !reforecast && !modelDiff.length) { setMsg("Nothing changed."); return; }
    if (save(next, [{ key: "businessPlan", field: `Business plan › Revision ${rv.n}`, from: `Revision ${cur.n}`, to: `${reason}${rv.changes.length ? ` (${rv.changes.length} change${rv.changes.length === 1 ? "" : "s"})` : ""}${reforecast ? `; budget ${rv.budget.label}` : ""}` }], `Business plan revision ${rv.n}${note.trim() ? `: ${note.trim()}` : ""}`)) {
      setDraft(null); setNote(""); setReforecast(false); setBudgetLabel(""); setViewN(0); setMsg(`Saved as revision ${rv.n}.`);
    }
  }

  async function importActuals(file) {
    try {
      const grid = /\.xlsx?$/i.test(file.name) ? await readXlsxGrid(await file.arrayBuffer()) : parseCSV(await file.text());
      const parsed = parseIncomeStatement(grid);
      const map = matchProperties(parsed, fundDeals.length ? fundDeals : [{ id: dealId, inputs }]);
      const hits = Object.entries(map).filter(([, id]) => id);
      if (!hits.length) { setMsg("No property in the statement matches an asset in this fund."); return; }
      const src = { file: file.name, importedAt: new Date().toISOString(), by: email ?? "" };
      let n = 0;
      for (const [key, id] of hits) {
        const ms = parsed.properties[key].months;
        const ok = onApplyDeal(id, (inp) => ({ ...inp, businessPlan: { thresholdPct: 5, comments: {}, revisions: [], ...(inp.businessPlan ?? {}), actuals: { ...(inp.businessPlan?.actuals ?? {}), ...ms }, actualsSource: src } }),
          [{ key: "businessPlan.actuals", field: "Actuals", from: "", to: `${Object.keys(ms).length} months from ${file.name}` }], `Actuals imported from ${file.name}`);
        if (ok) n++;
      }
      setMsg(`Imported ${file.name}: ${n} asset${n === 1 ? "" : "s"} matched${parsed.warnings.length ? `; ${parsed.warnings.length} warning(s): ${parsed.warnings.slice(0, 2).join("; ")}` : ""}.`);
    } catch (e) { setMsg(`Couldn't read ${file.name}: ${e.message || e}`); }
  }

  const cmp = cmpN && cmpN !== shown.n ? diffPlans(revs[Math.min(cmpN, shown.n) - 1], revs[Math.max(cmpN, shown.n) - 1]) : null;
  const stCls = { late: "text-red-700 font-medium", due: "text-amber-700", done: "text-emerald-700", open: "text-gray-600" };

  return (
    <div className="space-y-3 text-gray-900" data-testid="business-plan">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Asset business plan · {name}</h2>
          <p className="text-xs text-gray-500">Revision {shown.n} of {revs.length}{shown.n === revs.length ? " (current)" : ""} · {shown.at.slice(0, 10)}{shown.by ? ` · ${shown.by}` : ""} · {shown.reason}{shown.note ? `: ${shown.note}` : ""} · budget: {shown.budget?.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">Revision
            <select value={viewN || revs.length} onChange={(e) => { setViewN(Number(e.target.value) === revs.length ? 0 : Number(e.target.value)); setDraft(null); }} className={inp} aria-label="Revision" disabled={editing}>
              {revs.map((r) => <option key={r.n} value={r.n}>{r.n}{r.n === 1 ? " (closing)" : ""}{r.n === revs.length ? " (current)" : ""}</option>)}
            </select>
          </label>
          {revs.length > 1 && <label className="flex items-center gap-1">Compare with
            <select value={cmpN} onChange={(e) => setCmpN(Number(e.target.value))} className={inp} aria-label="Compare with">
              <option value={0}>—</option>
              {revs.filter((r) => r.n !== shown.n).map((r) => <option key={r.n} value={r.n}>Revision {r.n}</option>)}
            </select>
          </label>}
          <button type="button" className={`${btn} border-gray-300`} onClick={async () => {
            setPdfBusy(true);
            try {
              const asOfPdf = new Date().toISOString().slice(0, 10);
              const extras = await (await import("@/lib/businessPlanExtras")).planExtras(inputs, { asOf: asOfPdf, signedIn: !!email });
              downloadBlob(await (await import("@/lib/businessPlanPdf")).businessPlanPdf(inputs, { rev: shown.n, fundName, fundType, variance: end ? { kind: period.kind, end } : null, asOf: asOfPdf, extras }), `${safeFileName(name)}-business-plan-rev${shown.n}.pdf`);
            } finally {
              setPdfBusy(false);
            }
          }} disabled={pdfBusy} title="The whole plan in one PDF: plan, KPIs, budget, budget vs. actual, photos, floor plan, location, actual NOI and underwritten vs. actual">{pdfBusy ? "Making PDF…" : "PDF"}</button>
          <button type="button" className={`${btn} border-gray-300`} onClick={async () => downloadBlob(await writeXlsx([...budgetRows(bp), [], ...(rep ? varianceRows(rep) : [])], { sheetName: "Budget", colWidths: [34, 14, 14, 14, 14, 14, 14, 10, 30] }), `${safeFileName(name)}-budget.xlsx`)}>Excel</button>
          {canEdit && !editing && shown.n === revs.length && <button type="button" className={`${btn} border-blue-600 bg-blue-600 text-white`} onClick={() => { setDraft(structuredClone(cur.plan)); setMsg(null); }}>Edit plan</button>}
        </div>
      </div>
      {msg && <p className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" data-testid="plan-msg"><span className="flex-1">{msg}</span><button type="button" onClick={() => setMsg(null)} aria-label="Dismiss">✕</button></p>}
      {canEdit && !editing && modelDiff.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="plan-model-changed">
          <span className="flex-1">The model changed since revision {cur.n}: {modelDiff.join(", ")}. Save a new revision to record it.</span>
          <label className="flex items-center gap-1"><input type="checkbox" checked={reforecast} onChange={(e) => setReforecast(e.target.checked)} /> Re-forecast the budget</label>
          <button type="button" className={`${btn} border-amber-400 bg-white`} onClick={() => saveRevision(`Model change: ${modelDiff.join(", ")}`)}>Save revision {cur.n + 1}</button>
        </div>
      )}
      {cmp && (
        <Section title={`Revision ${Math.min(cmpN, shown.n)} → ${Math.max(cmpN, shown.n)}: ${cmp.length} change${cmp.length === 1 ? "" : "s"}`}>
          <Table testid="plan-compare" head={["Field", "Was", "Now"]} rows={cmp.length ? cmp.map((c) => <tr key={c.field} className="border-t border-gray-100"><td className="px-2 py-1 font-mono text-[11px]">{c.field}</td><td className="px-2 py-1">{String(c.from)}</td><td className="px-2 py-1">{String(c.to)}</td></tr>) : [<tr key="n"><td className="px-2 py-1 text-gray-500" colSpan={3}>No plan changes (budget or model only)</td></tr>]} />
        </Section>
      )}

      <Section title="Thesis and strategy">{area(["thesis"], "Why we bought it")}{area(["strategy"], "Strategy (core-plus, value-add, lease-up, repositioning) and what must happen")}
        <label className="text-xs"><span className="font-medium text-gray-600">Recommendation </span>{editing ? <select value={p.recommendation} onChange={(e) => set(["recommendation"], e.target.value)} className={inp} aria-label="Recommendation">{["Hold", "Sell", "Refinance"].map((x) => <option key={x}>{x}</option>)}</select> : p.recommendation}</label>
      </Section>

      <Section title="KPIs vs target">
        <Table testid="plan-kpis" head={["KPI", "Target", "Actual"]} rows={(p.kpis ?? []).map((x, i) => {
          const a = k[x.key];
          const show = x.key === "noi" ? (isFinite(a) ? `${money(a)} (annualized from ${k.noiMonths} mo)` : "—") : x.unit === "$" ? money(a) : isFinite(a) ? `${a.toFixed(x.key === "walt" ? 1 : 2)} ${x.unit}` : "—";
          return <tr key={x.key} className="border-t border-gray-100"><td className="px-2 py-1">{x.label}</td><td className="px-2 py-1">{editing ? <input type="number" value={x.target} onChange={(e) => set(["kpis", i, "target"], Number(e.target.value))} className={`${inp} w-28`} aria-label={`${x.label} target`} /> : x.unit === "$" ? money(x.target) : `${x.target} ${x.unit}`}</td><td className="px-2 py-1">{show}</td></tr>;
        })} />
      </Section>

      <Section title="Leasing plan (unit by unit)">
        <Table testid="plan-leasing" head={["Unit", "Tenant", "SF", "Lease end", "Action", "Target rent/SF", "In place/SF", "Downtime (mo)", "TI/SF", "Note"]} rows={(p.leasing ?? []).map((l, i) => {
          const u = units.find((x) => x.id === l.unitId);
          return (
            <tr key={l.unitId ?? i} className="border-t border-gray-100">
              <td className="px-2 py-1">{l.unit}</td><td className="px-2 py-1">{l.tenant || "vacant"}</td><td className="px-2 py-1">{l.sf.toLocaleString()}</td><td className="px-2 py-1">{l.leaseEnd || "—"}</td>
              <td className="px-2 py-1">{editing ? <select value={l.action} onChange={(e) => set(["leasing", i, "action"], e.target.value)} className={inp} aria-label={`Unit ${l.unit} action`}>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select> : l.action}</td>
              <td className="px-2 py-1">{editing ? <input type="number" step="0.01" value={l.targetRentPSF} onChange={(e) => set(["leasing", i, "targetRentPSF"], Number(e.target.value))} className={`${inp} w-20`} aria-label={`Unit ${l.unit} target rent`} /> : `$${Number(l.targetRentPSF).toFixed(2)}`}</td>
              <td className={`px-2 py-1 ${u && u.leaseStatus === "occupied" && u.currentRentPSF < l.targetRentPSF ? "text-amber-700" : ""}`}>{u?.leaseStatus === "occupied" ? `$${Number(u.currentRentPSF).toFixed(2)}` : "vacant"}</td>
              <td className="px-2 py-1">{editing ? <input type="number" value={l.downtimeMonths} onChange={(e) => set(["leasing", i, "downtimeMonths"], Number(e.target.value))} className={`${inp} w-14`} aria-label={`Unit ${l.unit} downtime`} /> : l.downtimeMonths}</td>
              <td className="px-2 py-1">{editing ? <input type="number" value={l.tiPSF} onChange={(e) => set(["leasing", i, "tiPSF"], Number(e.target.value))} className={`${inp} w-14`} aria-label={`Unit ${l.unit} TI`} /> : l.tiPSF}</td>
              <td className="px-2 py-1">{editing ? <input value={l.note} onChange={(e) => set(["leasing", i, "note"], e.target.value)} className={`${inp} w-40`} aria-label={`Unit ${l.unit} note`} /> : l.note}</td>
            </tr>
          );
        })} />
        {(inputs?.construction?.jobs ?? []).length > 0 && <div className="mt-2"><p className="mb-1 text-xs font-semibold text-gray-600">TI spend by unit (construction jobs; upload on Property Condition)</p><TiByUnitTable inputs={inputs} compact /></div>}
      </Section>

      <Section title="Capital plan" right={editing && <button type="button" className={`${btn} border-gray-300`} onClick={() => addRow("capital", { id: `c${Date.now()}`, project: "", scope: "", budget: 0, start: "", end: "", spent: 0, expectedReturn: "" })}>Add project</button>}>
        <Table testid="plan-capital" head={["Project", "Scope", "Budget", "Spent", "Start", "End", "Expected return", ""]} rows={(p.capital ?? []).length ? p.capital.map((c, i) => (
          <tr key={c.id} className="border-t border-gray-100">
            {[["project", "text", "w-40"], ["scope", "text", "w-40"], ["budget", "number", "w-24"], ["spent", "number", "w-24"], ["start", "date", "w-32"], ["end", "date", "w-32"], ["expectedReturn", "text", "w-28"]].map(([f, ty, w]) => <td key={f} className="px-2 py-1">{field(["capital", i, f], ty, w)}</td>)}
            <td className="px-2 py-1">{editing && <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => delRow("capital", i)} aria-label="Remove project">✕</button>}</td>
          </tr>
        )) : [<tr key="n"><td colSpan={8} className="px-2 py-1 text-gray-500">No capital projects</td></tr>]} />
        {(p.capital ?? []).length > 0 && <p className="text-[11px] text-gray-500">Spent {money(p.capital.reduce((s, c) => s + (Number(c.spent) || 0), 0))} of {money(p.capital.reduce((s, c) => s + (Number(c.budget) || 0), 0))} budgeted.</p>}
      </Section>

      <Section title="Operating, financing and exit">
        <div className="grid gap-2 md:grid-cols-2">
          {area(["operating", "expenseTargets"], "Expense targets")}{area(["operating", "recoveries"], "Recovery improvements")}
          {area(["operating", "management"], "Property management")}{area(["operating", "taxAppeal"], "Tax appeals")}
          {area(["operating", "insurance"], "Insurance")}
          <div className="text-xs"><span className="font-medium text-gray-600">Loan</span><p>{money(p.financing?.loan)} · {p.financing?.rate} · {p.financing?.maturityYears ?? "—"} yrs{p.financing?.lender ? ` · ${p.financing.lender}` : ""}</p></div>
          {area(["financing", "plan"], "Financing plan (refinance, recap)")}
          <div className="text-xs"><span className="font-medium text-gray-600">Exit</span><p className="flex flex-wrap items-center gap-1">Hold {field(["exit", "holdYears"], "number", "w-14")} yrs · exit cap {field(["exit", "exitCapRatePct"], "number", "w-16")}% · target {field(["exit", "targetExit"], "text", "w-20")}</p></div>
          {area(["exit", "triggers"], "Sale or refinance triggers")}
        </div>
      </Section>

      <Section title="Milestones" right={editing && <button type="button" className={`${btn} border-gray-300`} onClick={() => addRow("milestones", { id: `m${Date.now()}`, label: "", due: "", owner: "", status: "open" })}>Add milestone</button>}>
        <Table testid="plan-milestones" head={["Milestone", "Due", "Owner", "Status", ""]} rows={(p.milestones ?? []).map((m, i) => {
          const st = milestoneStatus(m);
          return (
            <tr key={m.id} className="border-t border-gray-100" data-testid="milestone-row">
              <td className="px-2 py-1">{field(["milestones", i, "label"], "text", "w-72")}</td><td className="px-2 py-1">{field(["milestones", i, "due"], "date", "w-32")}</td><td className="px-2 py-1">{field(["milestones", i, "owner"], "text", "w-28")}</td>
              <td className={`px-2 py-1 ${stCls[st]}`}>{editing ? <select value={m.status} onChange={(e) => set(["milestones", i, "status"], e.target.value)} className={inp} aria-label="Milestone status">{STATUS.map((s) => <option key={s}>{s}</option>)}</select> : st === "late" ? "⚠ late" : st}</td>
              <td className="px-2 py-1">{editing && <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => delRow("milestones", i)} aria-label="Remove milestone">✕</button>}</td>
            </tr>
          );
        })} />
        <p className="text-[11px] text-gray-500">Open milestones also appear on Leases → Critical dates.</p>
      </Section>

      <Section title="Risks and mitigants" right={editing && <button type="button" className={`${btn} border-gray-300`} onClick={() => addRow("risks", { risk: "", mitigant: "" })}>Add risk</button>}>
        <Table head={["Risk", "Mitigant", ""]} rows={(p.risks ?? []).length ? p.risks.map((r, i) => <tr key={i} className="border-t border-gray-100"><td className="px-2 py-1">{field(["risks", i, "risk"], "text", "w-72")}</td><td className="px-2 py-1">{field(["risks", i, "mitigant"], "text", "w-72")}</td><td>{editing && <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => delRow("risks", i)} aria-label="Remove risk">✕</button>}</td></tr>) : [<tr key="n"><td colSpan={3} className="px-2 py-1 text-gray-500">None recorded</td></tr>]} />
      </Section>

      {editing && (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 p-3 text-xs shadow" data-testid="plan-save-bar">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why (optional)" className={`${inp} w-72`} aria-label="Revision note" />
          <label className="flex items-center gap-1"><input type="checkbox" checked={reforecast} onChange={(e) => setReforecast(e.target.checked)} /> Re-forecast the budget from the model</label>
          {reforecast && <input value={budgetLabel} onChange={(e) => setBudgetLabel(e.target.value)} placeholder="e.g. 2027 budget" className={`${inp} w-32`} aria-label="Budget name" />}
          <button type="button" className={`${btn} border-blue-600 bg-blue-600 text-white`} onClick={() => saveRevision(modelDiff.length ? `Plan edit; model change: ${modelDiff.join(", ")}` : "Plan edit")}>Save as revision {cur.n + 1}</button>
          <button type="button" className={`${btn} border-gray-300 bg-white`} onClick={() => setDraft(null)}>Cancel</button>
          <span className="text-gray-500">Revision {cur.n} stays as it is.</span>
        </div>
      )}

      <Section title="Budget vs. plan vs. actual" right={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {months.length > 0 && <>
            <select value={period.kind} onChange={(e) => setPeriod((x) => ({ ...x, kind: e.target.value }))} className={inp} aria-label="Period">{PERIODS.map(([kk, l]) => <option key={kk} value={kk}>{l}</option>)}</select>
            <select value={end} onChange={(e) => setPeriod((x) => ({ ...x, end: e.target.value }))} className={inp} aria-label="Through month">{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            <label className="flex items-center gap-1">Flag over<input type="number" value={bp.thresholdPct ?? 5} disabled={!canEdit} onChange={(e) => save((b) => ({ ...b, thresholdPct: Number(e.target.value) }), [{ key: "businessPlan.thresholdPct", field: "Variance threshold %", from: bp.thresholdPct ?? 5, to: Number(e.target.value) }], "Variance threshold")} className={`${inp} w-12`} aria-label="Variance threshold" />%</label>
          </>}
          {canEdit && <>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="sr-only" aria-label="Import actuals" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importActuals(f); }} />
            <button type="button" className={`${btn} border-blue-600 bg-blue-600 text-white`} onClick={() => fileRef.current?.click()}>Import actuals</button>
          </>}
        </div>
      }>
        {!rep ? <p className="text-xs text-gray-500">No actuals yet. Import a monthly income statement (CSV or Excel: a Month column and one column per line, by property for the whole fund) or a T-12. Plan = revision 1&apos;s budget; current budget = revision {cur.n}&apos;s ({cur.budget?.label}).</p> : (
          <>
            <p className="text-[11px] text-gray-500">{rep.months.length} month{rep.months.length === 1 ? "" : "s"} of actuals ({rep.from} to {rep.to}){bp.actualsSource ? ` · from ${bp.actualsSource.file}` : ""}. Plan: {rep.planLabel} (revision 1); current: {rep.currentLabel} (revision {rep.currentRevision}). Variance = actual − current budget (positive is favorable); flagged amber over {bp.thresholdPct ?? 5}%, red over {2 * (bp.thresholdPct ?? 5)}%.</p>
            <Table testid="plan-variance" head={["Line", "Plan (rev. 1)", "Current budget", "Actual", "Variance", "%", "Actual $/SF", "Comment"]} rows={rep.rows.map((r) => (
              <tr key={r.key} className={`border-t border-gray-100 tabular-nums ${r.kind === "total" ? "font-semibold" : ""} ${FLAG[r.flag] ?? ""}`} data-testid="variance-row" data-line={r.key} data-flag={r.flag}>
                <td className="px-2 py-1">{r.label}</td><td className="px-2 py-1">{money(r.plan)}</td><td className="px-2 py-1">{money(r.current)}</td><td className="px-2 py-1">{money(r.actual)}</td>
                <td className="px-2 py-1">{money(r.variance)}</td><td className="px-2 py-1">{r.flag ? "⚠ " : ""}{pct(r.variancePct)}</td><td className="px-2 py-1">{r.actualPSF != null ? `$${r.actualPSF.toFixed(2)}` : "—"}</td>
                <td className="px-2 py-1">{r.actual != null && (canEdit ? <input key={`${period.kind}${end}${r.key}${r.comment}`} defaultValue={r.comment} placeholder={r.flag ? "Explain the variance" : ""} onBlur={(e) => { const v = e.target.value.trim(); if (v === r.comment) return; const ck = `${periodKey(period.kind, end)}|${r.key}`; save((b) => ({ ...b, comments: { ...(b.comments ?? {}), [ck]: v } }), [{ key: `businessPlan.comments.${ck}`, field: `Variance comment › ${r.label} (${period.kind} ${end})`, from: r.comment, to: v }], "Variance comment"); }} className={`${inp} w-48`} aria-label={`Comment ${r.label}`} /> : r.comment)}</td>
              </tr>
            ))} />
          </>
        )}
      </Section>

      {revs.length > 1 && (
        <Section title="Revision history">
          <Table testid="plan-revisions" head={["Rev.", "Date", "By", "Reason", "Note", "Changes", "Budget"]} rows={[...revs].reverse().map((r) => <tr key={r.n} className="border-t border-gray-100"><td className="px-2 py-1">{r.n}</td><td className="px-2 py-1">{r.at.slice(0, 10)}</td><td className="px-2 py-1">{r.by}</td><td className="px-2 py-1">{r.reason}</td><td className="px-2 py-1">{r.note}</td><td className="px-2 py-1">{r.changes?.length ?? 0}</td><td className="px-2 py-1">{r.budget?.label}</td></tr>)} />
        </Section>
      )}
      <p className="text-[11px] text-gray-500">Budget lines follow the model by hold year (÷ 12 a month); on NNN deals recoverable expenses are grossed up as both an expense and a recovery so they compare with an income statement. {LINES.length} lines.</p>
    </div>
  );
}
