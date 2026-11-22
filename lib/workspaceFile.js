// ─── Linked workspace file (File System Access API) ──────────────────────────
// Lets the workspace live in a .json file the user picks (e.g. in iCloud
// Drive or Documents). Every change is written to that file. The file handle
// is remembered in IndexedDB so the next visit can reopen it; browsers ask
// for permission again after a reload, which needs one click.
// Supported in Chrome and Edge (desktop). Safari and Firefox don't let pages
// write to files, so the app falls back to Export / Import workspace there.

const DB = "uw-workspace-file";
const STORE = "handles";
const KEY = "workspace";
const PICKER_TYPES = [{ description: "Underwriting workspace", accept: { "application/json": [".json"] } }];

export function fileAccessSupported() {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function" && typeof window.showOpenFilePicker === "function";
}

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
export const rememberHandle = (h) => idbDo("readwrite", (s) => s.put(h, KEY)).catch(() => {});
export const forgetHandle = () => idbDo("readwrite", (s) => s.delete(KEY)).catch(() => {});
export const recallHandle = () => idbDo("readonly", (s) => s.get(KEY)).catch(() => null);

// "granted" | "prompt" | "denied"
export async function permission(handle, request = false) {
  const opts = { mode: "readwrite" };
  try {
    if ((await handle.queryPermission(opts)) === "granted") return "granted";
    return request ? await handle.requestPermission(opts) : "prompt";
  } catch {
    return "denied";
  }
}

export async function createWorkspaceFile(suggestedName = "underwriting-workspace.json") {
  return window.showSaveFilePicker({ suggestedName, types: PICKER_TYPES });
}

export async function openWorkspaceFile() {
  const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
  return handle;
}

export async function readWorkspace(handle) {
  const text = await (await handle.getFile()).text();
  if (!text.trim()) return null; // new, empty file
  return JSON.parse(text);
}

export async function writeWorkspace(handle, data) {
  const w = await handle.createWritable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

// True if `saved` looks like a workspace (export or linked file).
export function isWorkspace(saved) {
  return Array.isArray(saved?.deals) && saved.deals.length > 0 && saved.deals.every((d) => d && d.id && d.inputs);
}
