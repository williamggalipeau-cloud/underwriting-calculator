// Revert from the change log (11/23): put one field back to the value it had
// before a logged change. Only when the field still holds the value that
// change wrote (so a later edit is never overwritten), and only for the
// firm's live data: open deals, fund terms and capital activity, valuation
// marks and pipeline deals. Saved copies are fixed snapshots, and whole
// records added or removed are not single fields, so neither is revertable.

const ROOTS = new Set(["deals", "funds", "valuations", "pipeline"]);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// State root the paths index into: { deals: [...], funds: {...}, valuations: {...}, pipeline: [...] }
export function revertRoot({ deals, funds, valuations, pipeline }) {
  return { deals, funds, valuations, pipeline: pipeline?.deals ?? [] };
}

// Arrays of records are indexed by each record's id.
function child(node, key) {
  if (Array.isArray(node)) return node.find((x) => x && x.id === key);
  return isObj(node) ? node[key] : undefined;
}

export function getAt(root, path) {
  let n = root;
  for (const k of path) {
    n = child(n, k);
    if (n === undefined) return undefined;
  }
  return n;
}

// Immutable set; value undefined removes the key. Missing parents → null (can't set).
export function setAt(node, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  if (Array.isArray(node)) {
    const i = node.findIndex((x) => x && x.id === k);
    if (i < 0) return null;
    const v = setAt(node[i], rest, value);
    if (v === null) return null;
    const out = [...node];
    out[i] = v;
    return out;
  }
  if (!isObj(node)) return null;
  if (!rest.length) {
    const out = { ...node };
    if (value === undefined) delete out[k];
    else out[k] = value;
    return out;
  }
  if (node[k] === undefined) return null;
  const v = setAt(node[k], rest, value);
  return v === null ? null : { ...node, [k]: v };
}

// { ok, reason } for one log entry against the current state.
export function revertCheck(entry, root) {
  const path = entry?.path;
  if (!Array.isArray(path) || path.length < 3 || !ROOTS.has(path[0])) return { ok: false, reason: "Not a single field of a deal, fund, mark or pipeline deal" };
  if (entry.note && entry.from === undefined && entry.to === undefined) return { ok: false, reason: "A note, not a field change" };
  if (entry.to === "added" || entry.to === "removed") return { ok: false, reason: "A whole record added or removed" };
  if (getAt(root, path.slice(0, 2)) === undefined) return { ok: false, reason: "That deal or fund no longer exists" };
  if (!same(getAt(root, path), entry.to)) return { ok: false, reason: "Changed again since; revert the later change first" };
  if (same(entry.from, entry.to)) return { ok: false, reason: "Nothing to change" };
  if (setAt(root, path, entry.from) === null) return { ok: false, reason: "That field no longer exists" };
  return { ok: true, reason: "" };
}

// The new root with the field put back, and the log entry for the revert.
export function applyRevert(entry, root) {
  const c = revertCheck(entry, root);
  if (!c.ok) return { ok: false, reason: c.reason };
  return {
    ok: true,
    root: setAt(root, entry.path, entry.from),
    log: { area: entry.area, item: entry.item, field: entry.field, path: entry.path, from: entry.to, to: entry.from, revertOf: entry.id },
  };
}

// Restore one deal / fund / pipeline deal as of a date: undo its logged field
// changes made after that date, newest first. Returns the preview (one row per
// field: now → restored) and the new root; nothing else is touched. Changes
// that can't be undone (a record added / removed, a note) are listed as skipped.
export function restoreAsOf(root, log, recordPath, dateISO) {
  const key = JSON.stringify(recordPath);
  const after = (log ?? [])
    .filter((e) => Array.isArray(e.path) && e.path.length > recordPath.length && JSON.stringify(e.path.slice(0, recordPath.length)) === key && e.at.slice(0, 10) > dateISO)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  let cur = root;
  const fields = new Map(); // path → { field, now, restored }
  const skipped = [];
  for (const e of after) {
    const r = applyRevert(e, cur);
    if (!r.ok) { skipped.push({ at: e.at, field: e.field, reason: r.reason }); continue; }
    const k = JSON.stringify(e.path);
    const prev = fields.get(k);
    fields.set(k, { field: e.field, path: e.path, now: prev ? prev.now : e.to, restored: e.from });
    cur = r.root;
  }
  const changes = [...fields.values()].filter((f) => !same(f.now, f.restored));
  return { root: cur, changes, skipped, undone: after.length - skipped.length };
}

// "Recently deleted": deals, saved copies and funds kept in the database
// marked deleted (rows from firm_records), newest first, that aren't back on
// screen already. Each can be brought back as it was when deleted.
const DELETED_KINDS = { deal: "Asset", saved_deal: "Saved copy", fund: "Fund" };
export function recentlyDeleted(rows, { deals = [], savedDeals = [], funds = {} } = {}, limit = 50) {
  const present = (r) => (r.kind === "deal" ? deals.some((d) => d.id === r.key) : r.kind === "saved_deal" ? savedDeals.some((d) => d.id === r.key) : r.key in funds);
  return (rows ?? [])
    .filter((r) => r.deleted && DELETED_KINDS[r.kind] && r.data && !present(r))
    .map((r) => ({ kind: r.kind, key: r.key, data: r.data, type: DELETED_KINDS[r.kind], name: r.kind === "fund" ? r.key : r.data?.inputs?.propertyName || r.key, at: r.updated_at ?? null, by: r.updated_by_email ?? null }))
    .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")))
    .slice(0, limit);
}
