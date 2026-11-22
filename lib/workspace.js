// ─── Workspace helpers ───────────────────────────────────────────────────────
// Workspaces are saved only in the database (lib/cloud.js). Nothing is kept in
// the browser. Earlier versions of the app saved a copy in the browser
// (localStorage) and remembered a linked file (IndexedDB); the helpers below
// read that old copy once, so it can be moved into the database on sign-in,
// and then delete everything the old versions left behind.

const LEGACY_WORKSPACE_KEY = "uw-workspace-v1";
const LEGACY_KEYS = [LEGACY_WORKSPACE_KEY, "uw-audit-user", "uw-db-link", "uw-db-dirty"];
const LEGACY_FILE_DB = "uw-workspace-file";

// True if `saved` looks like a workspace (export, database row or old browser copy).
export function isWorkspace(saved) {
  return Array.isArray(saved?.deals) && saved.deals.length > 0 && saved.deals.every((d) => d && d.id && d.inputs);
}

// The workspace an earlier version of the app saved in this browser, or null.
export function readLegacyWorkspace() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LEGACY_WORKSPACE_KEY) ?? "null");
    return isWorkspace(saved) ? saved : null;
  } catch {
    return null;
  }
}

// Deletes everything earlier versions saved in this browser. Call only after
// the old workspace (if any) is safely in the database.
export function clearLegacyBrowserData() {
  try {
    for (const k of LEGACY_KEYS) window.localStorage.removeItem(k);
  } catch {
    // storage blocked
  }
  try {
    window.indexedDB?.deleteDatabase(LEGACY_FILE_DB);
  } catch {
    // ignore
  }
}

// Old browser data other than the workspace itself (safe to delete any time).
export function clearLegacyExtras() {
  try {
    for (const k of LEGACY_KEYS) if (k !== LEGACY_WORKSPACE_KEY) window.localStorage.removeItem(k);
  } catch {
    // storage blocked
  }
  try {
    window.indexedDB?.deleteDatabase(LEGACY_FILE_DB);
  } catch {
    // ignore
  }
}
