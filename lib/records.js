// Phase Q: the firm's data saved record by record (public.firm_records,
// supabase/firm_records.sql) instead of one workspace JSON.
//
// A record is { kind, key, sort, data, version? }:
//   deal        key = deal id      (open deals; sort = tab order)
//   saved_deal  key = deal id      (saved fund snapshots)
//   fund        key = fund name    (fund terms)
//   valuation   key = deal id      ({ "YYYY-MM-DD": mark })
//   settings    key = "main"       (comps, forward curve and other settings)
//   local_log   key = "main"       ({ entries: the app's working change log };
//                                   read for history, never re-saved)
// The pure helpers (recordsFromData, dataFromRecords, recordItems) have no
// database dependency, so Node tests run them directly.
import { supabase } from "@/lib/cloud";

const SETTINGS_SKIP = ["deals", "savedDeals", "funds", "valuations", "auditLog"];
// Per-person view state, not firm data: kept in this browser only.
const PERSONAL = ["activeDealId", "savedAt", "exportedAt"];

export const recId = (kind, key) => `${kind}\u0000${key}`;

// Workspace-shaped data → records (the same split as the SQL migration).
export function recordsFromData(data) {
  const out = [];
  (data.deals ?? []).forEach((d, i) => out.push({ kind: "deal", key: d.id, sort: i + 1, data: d }));
  (data.savedDeals ?? []).forEach((d, i) => out.push({ kind: "saved_deal", key: d.id, sort: i + 1, data: d }));
  for (const [k, v] of Object.entries(data.funds ?? {})) out.push({ kind: "fund", key: k, sort: 0, data: v });
  for (const [k, v] of Object.entries(data.valuations ?? {})) out.push({ kind: "valuation", key: k, sort: 0, data: v });
  const settings = {};
  for (const [k, v] of Object.entries(data)) if (!SETTINGS_SKIP.includes(k)) settings[k] = v;
  out.push({ kind: "settings", key: "main", sort: 0, data: settings });
  out.push({ kind: "local_log", key: "main", sort: 0, data: { entries: data.auditLog ?? [] } });
  return out;
}

// Records (rows from firm_records, deleted ones skipped) → workspace data.
export function dataFromRecords(rows) {
  const live = rows.filter((r) => !r.deleted);
  const by = (kind) => live.filter((r) => r.kind === kind).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.key).localeCompare(String(b.key)));
  const settings = live.find((r) => r.kind === "settings")?.data ?? {};
  return {
    ...settings,
    deals: by("deal").map((r) => r.data),
    savedDeals: by("saved_deal").map((r) => r.data),
    funds: Object.fromEntries(by("fund").map((r) => [r.key, r.data])),
    valuations: Object.fromEntries(by("valuation").map((r) => [r.key, r.data])),
    auditLog: live.find((r) => r.kind === "local_log")?.data?.entries ?? [],
  };
}

// The records worth saving from app data: everything except the working log
// and per-person view state.
export function savableRecords(data) {
  return recordsFromData(data)
    .filter((r) => r.kind !== "local_log")
    .map((r) => (r.kind === "settings" ? { ...r, data: Object.fromEntries(Object.entries(r.data).filter(([k]) => !PERSONAL.includes(k))) } : r));
}

// 1.1.12 (code review): compare with the keys in a fixed order. The database
// (jsonb) returns an object's keys in its own order, so a plain
// JSON.stringify saw a record as "changed" after every open and re-saved it.
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map((x) => canon(x === undefined ? null : x)).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export const sameData = (a, b) => canon(a) === canon(b);
const same = sameData;

// 1.1.12 (code review): two people changed the same record. Merge instead of
// replacing one person's version with the other's: field by field against the
// version both started from (base). A field only one side changed takes that
// side's value; lists of items with ids (units, prospects, pipeline deals…)
// merge item by item; where both changed the same field, this browser's edit
// (mine: the later save) is kept and the field is reported in `conflicts`.
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const idList = (x) => Array.isArray(x) && x.every((e) => isObj(e) && e.id != null) && new Set(x.map((e) => e.id)).size === x.length;
export function mergeData(base, mine, theirs, path = "", conflicts = []) {
  if (sameData(mine, theirs) || sameData(theirs, base)) return { data: mine, conflicts };
  if (sameData(mine, base)) return { data: theirs, conflicts };
  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const inM = k in mine, inT = k in theirs, inB = k in b;
      if (inM && inT) out[k] = mergeData(b[k], mine[k], theirs[k], path ? `${path}.${k}` : k, conflicts).data;
      else if (inM) { if (!inB || !sameData(mine[k], b[k])) out[k] = mine[k]; } // theirs removed it; kept only if mine changed it
      else if (!inB || !sameData(theirs[k], b[k])) out[k] = theirs[k]; // mine removed it; kept only if theirs changed it
    }
    return { data: out, conflicts };
  }
  if (idList(mine) && idList(theirs) && (base == null || idList(base))) {
    const B = new Map((base ?? []).map((e) => [e.id, e])), T = new Map(theirs.map((e) => [e.id, e])), M = new Set(mine.map((e) => e.id));
    const out = [];
    for (const e of mine) {
      if (T.has(e.id)) out.push(mergeData(B.get(e.id), e, T.get(e.id), `${path}[${e.id}]`, conflicts).data);
      else if (!B.has(e.id) || !sameData(e, B.get(e.id))) out.push(e); // theirs removed it; kept if new here or changed here
    }
    for (const e of theirs) if (!M.has(e.id) && (!B.has(e.id) || !sameData(e, B.get(e.id)))) out.push(e); // added there, or changed there after being removed here
    return { data: out, conflicts };
  }
  conflicts.push(path || "(record)");
  return { data: mine, conflicts };
}

// What to send to save_records: records added, changed (data or order) or
// removed since `base` (Map recId → { kind, key, sort, data, version }).
// Removed records are saved as deleted, never hard-deleted.
export function recordItems(base, next) {
  const items = [];
  const seen = new Set();
  for (const r of next) {
    const id = recId(r.kind, r.key);
    seen.add(id);
    const b = base.get(id);
    if (!b || b.deleted) items.push({ kind: r.kind, key: r.key, sort: r.sort, data: r.data, deleted: false, expected_version: b ? b.version : null });
    else if (!same(b.data, r.data) || (b.sort ?? 0) !== (r.sort ?? 0)) items.push({ kind: r.kind, key: r.key, sort: r.sort, data: r.data, expected_version: b.version });
  }
  for (const [id, b] of base) {
    if (seen.has(id) || b.deleted || b.kind === "local_log" || b.kind === "settings") continue;
    items.push({ kind: b.kind, key: b.key, deleted: true, expected_version: b.version });
  }
  return items;
}

// "conflict: deal/sample-deal-1 is at version 4" → { kind, key }
export function conflictOf(message) {
  const m = String(message ?? "").match(/conflict: ([a-z_]+)\/(.+?) (is at version|no longer exists)/);
  return m ? { kind: m[1], key: m[2] } : null;
}

// Puts one record's data back into app data (for a remote change or a
// conflict reload). deleted = remove it.
export function applyRecord(data, rec) {
  const d = { ...data };
  const del = !!rec.deleted;
  if (rec.kind === "deal" || rec.kind === "saved_deal") {
    const list = rec.kind === "deal" ? "deals" : "savedDeals";
    const cur = d[list] ?? [];
    const i = cur.findIndex((x) => x.id === rec.key);
    if (del) d[list] = cur.filter((x) => x.id !== rec.key);
    else if (i >= 0) d[list] = cur.map((x, j) => (j === i ? rec.data : x));
    else d[list] = [...cur, rec.data];
  } else if (rec.kind === "fund" || rec.kind === "valuation") {
    const map = rec.kind === "fund" ? "funds" : "valuations";
    const next = { ...(d[map] ?? {}) };
    if (del) delete next[rec.key];
    else next[rec.key] = rec.data;
    d[map] = next;
  } else if (rec.kind === "settings" && !del) {
    const keep = Object.fromEntries(PERSONAL.map((k) => [k, d[k]]));
    Object.assign(d, rec.data, keep);
  }
  return d;
}

// ── Database ──
const fail = (error, what) => {
  if (!error) return;
  const e = new Error(`Couldn't ${what}: ${error.message}`);
  if (error.code === "40001" || /conflict:/.test(error.message)) {
    e.conflict = conflictOf(error.message) ?? true;
  }
  throw e;
};

// The firm: the non-archived workspace the user belongs to, record storage first.
export async function loadFirm(userId) {
  const sb = supabase();
  const { data: mine, error: e1 } = await sb.from("workspace_members").select("workspace_id, role").eq("user_id", userId);
  fail(e1, "find your firm");
  if (!mine?.length) return null;
  const ids = mine.map((m) => m.workspace_id);
  const { data: ws, error: e2 } = await sb.from("workspaces").select("id, name, version, storage, archived, records_from_version, updated_at").in("id", ids);
  fail(e2, "find your firm");
  const role = new Map(mine.map((m) => [m.workspace_id, m.role]));
  const open = (ws ?? []).filter((w) => !w.archived).sort((a, b) => (b.storage === "records") - (a.storage === "records") || String(b.updated_at).localeCompare(String(a.updated_at)));
  return open.length ? { ...open[0], role: role.get(open[0].id) ?? "viewer" } : null;
}

export async function loadRecords(wsId) {
  const { data, error } = await supabase().from("firm_records").select("kind, key, sort, data, deleted, version, updated_at, updated_by_email").eq("workspace_id", wsId);
  fail(error, "load the firm's data");
  return data ?? [];
}

export async function loadRecord(wsId, kind, key) {
  const { data, error } = await supabase().from("firm_records").select("kind, key, sort, data, deleted, version, updated_at, updated_by_email").eq("workspace_id", wsId).eq("kind", kind).eq("key", key).maybeSingle();
  fail(error, "reload a record");
  return data;
}

// items from recordItems; changes as for save_workspace. Returns [{kind,key,version}].
export async function saveRecords(wsId, items, changes = []) {
  const clean = changes.map((c) => ({
    area: c.area ?? null, item: c.item ?? null, field: c.field ?? null, path: c.path ?? null,
    from: c.from === undefined ? null : c.from, to: c.to === undefined ? null : c.to, note: c.note ?? null,
  }));
  const { data, error } = await supabase().rpc("save_records", { ws: wsId, items, changes: clean });
  fail(error, "save");
  return data ?? [];
}

// The workspace JSON the old app saves (for the one-time re-import).
export async function loadLegacyJson(wsId) {
  const { data, error } = await supabase().from("workspaces").select("data, version").eq("id", wsId).single();
  fail(error, "read the old saved data");
  return data;
}

// Live updates: cb(row) for every insert or update of the firm's records.
export function subscribeRecords(wsId, cb) {
  const sb = supabase();
  if (!sb?.channel) return () => {};
  const ch = sb
    .channel(`firm-${wsId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "firm_records", filter: `workspace_id=eq.${wsId}` }, (p) => p.new && cb(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}
