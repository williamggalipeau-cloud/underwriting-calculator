// Underwriter → the Pipeline Deal dropdown (user, 11/25, 1.1.6).
//
// The dropdown reads the Pipeline directly, so every pipeline deal is listed
// whether or not it has been screened:
//   Active:  under contract (PSA), LOI, screening, watching, in that order.
//   History: closed and passed / lost, newest first (the date the stage was
//            set, else the expected close, else the date added).
// Deals not in any portfolio that have no Pipeline row (made some other way)
// are listed last, so none goes missing.
//
// What picking a row shows (screenerState):
//   "screened"  active, with a model: the Screener, as before.
//   "new"       active, no model yet: an editor's pick builds the model from
//               the Pipeline figures (page.jsx); a viewer sees the figures.
//   "passed"    passed / lost: decided, so the screening (if any) is shown
//               read-only; moving the row back to an active stage on the
//               Pipeline makes it editable again.
//   "closed"    closed: points to the asset it became (or, if it hasn't been
//               converted yet, to the Pipeline to convert it).
import { ACTIVE_STAGES, stageLabel } from "@/lib/pipeline";

export const ACTIVE_ORDER = ["psa", "loi", "screening", "watching"];

export const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");

// The date shown for a History row and used to sort it.
export function historyDate(row) {
  return row.stageDate || (row.stage === "closed" ? row.expectedClose : "") || row.dateAdded || "";
}

const modelOf = (row, deals) => (row?.dealId ? deals.find((d) => d.id === row.dealId) ?? null : null);

export function screenerState(row, deals) {
  if (!row) return null;
  const model = modelOf(row, deals);
  if (row.stage === "closed") {
    const asset = model && model.inputs?.fundName?.trim() ? model : null;
    return { kind: "closed", model, asset };
  }
  if (row.stage === "passed") return { kind: "passed", model };
  return { kind: model ? "screened" : "new", model };
}

// The dropdown's groups. rows: pipeline.deals; deals: open deal records;
// scope: the Select Portfolio choice ("" for the firm); isPipelineDeal:
// whether a deal record is a pipeline deal (not owned).
export function screenerOptions(rows = [], deals = [], { scope = "", isPipelineDeal = () => false } = {}) {
  const inScope = (r) => !scope || !r.targetFund || r.targetFund === scope;
  const listed = rows.filter(inScope);
  const opt = (r) => {
    const st = screenerState(r, deals);
    const meta = st.kind === "closed" ? `Closed${historyDate(r) ? ` ${usDate(historyDate(r))}` : ""} → ${st.asset ? "asset" : "not converted yet"}`
      : st.kind === "passed" ? `Passed / lost${historyDate(r) ? ` ${usDate(historyDate(r))}` : ""} · read-only`
      : `${stageLabel(r.stage)} · ${st.kind === "screened" ? "screened" : "not screened yet"}`;
    return { value: `row:${r.id}`, rowId: r.id, name: r.name || "Unnamed deal", meta, kind: st.kind };
  };
  const active = listed.filter((r) => ACTIVE_STAGES.includes(r.stage))
    .sort((a, b) => ACTIVE_ORDER.indexOf(a.stage) - ACTIVE_ORDER.indexOf(b.stage) || (a.name || "").localeCompare(b.name || ""))
    .map(opt);
  const history = listed.filter((r) => r.stage === "closed" || r.stage === "passed")
    .sort((a, b) => (historyDate(b) || "").localeCompare(historyDate(a) || "") || (a.name || "").localeCompare(b.name || ""))
    .map(opt);
  const linked = new Set(rows.map((r) => r.dealId).filter(Boolean));
  const other = deals.filter((d) => !linked.has(d.id) && isPipelineDeal(d))
    .sort((a, b) => (a.inputs?.propertyName || "").localeCompare(b.inputs?.propertyName || ""))
    .map((d) => ({ value: `deal:${d.id}`, dealId: d.id, name: d.inputs?.propertyName || "Unnamed deal", meta: "not on the Pipeline", kind: "screened" }));
  return { active, history, other };
}

// The Pipeline row the Screener shows: a picked row that has no model (a
// viewer's pick of an unscreened deal, or a passed / closed deal with no
// screening; the page clears the pick when the deal on screen changes), else
// the row linked to the deal on screen.
export function selectedRow(rows = [], deals = [], { activeDealId = null, pickedRowId = null } = {}) {
  const picked = pickedRowId ? rows.find((r) => r.id === pickedRowId) : null;
  if (picked && !modelOf(picked, deals)) return picked;
  return activeDealId ? rows.find((r) => r.dealId === activeDealId) ?? null : null;
}
