// ─── Supabase: sign-in, shared workspaces and the verified audit log ─────────
// The database is set up by supabase/setup.sql (run once in the Supabase SQL
// Editor). The URL and publishable key below are meant to be public: access
// is controlled by sign-in and the row-level security rules in that script.
// Writes go through database functions (create_workspace, save_workspace,
// add_member, …) so every audit row is stamped by the server with the
// signed-in user and time, and no one can edit or delete audit rows.

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://nydqmigxorahfkfpkjnq.supabase.co";
export const SUPABASE_KEY = "sb_publishable_9e5_0P9b4hECnrqi8uYsDw_-FVsQi-4";
const LINK_KEY = "uw-db-link";
// When true, the app is view-only until someone signs in: data can be viewed
// but not entered or changed. Viewers of a database workspace stay view-only.
export const REQUIRE_SIGN_IN = true;

let client = null;
export function supabase() {
  if (typeof window === "undefined") return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

const fail = (error, what) => {
  if (!error) return;
  const msg = error.message || String(error);
  if (/conflict/i.test(msg)) {
    const e = new Error("Someone else saved this workspace since you opened it.");
    e.conflict = true;
    e.currentVersion = Number((msg.match(/version (\d+)/) ?? [])[1]) || null;
    throw e;
  }
  if (/not allowed|permission denied|42501/i.test(msg)) throw new Error(`You don't have permission to ${what}.`);
  if (/relation .* does not exist|function .* does not exist|schema cache/i.test(msg)) {
    throw new Error("The database isn't set up yet. Run supabase/setup.sql in the Supabase SQL Editor.");
  }
  throw new Error(msg);
};

// ── Auth ──
export async function getSession() {
  const { data } = await supabase().auth.getSession();
  return data.session ?? null;
}
export function onAuthChange(cb) {
  const { data } = supabase().auth.onAuthStateChange((_event, session) => cb(session ?? null));
  return () => data.subscription.unsubscribe();
}
export async function sendSignInLink(email) {
  const redirect = window.location.origin + window.location.pathname;
  const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
  fail(error, "sign in");
}
export async function signOut() {
  await supabase().auth.signOut();
}
export async function claimInvites() {
  const { data, error } = await supabase().rpc("claim_invites");
  fail(error, "claim invites");
  return data ?? 0;
}

// ── Workspaces ──
export async function listWorkspaces() {
  const sb = supabase();
  const { data: ws, error } = await sb.from("workspaces").select("id, name, version, updated_at, updated_by_email").order("updated_at", { ascending: false });
  fail(error, "list workspaces");
  const { data: mine, error: e2 } = await sb.from("workspace_members").select("workspace_id, role").eq("user_id", (await getSession())?.user?.id ?? "");
  fail(e2, "list workspaces");
  const role = new Map((mine ?? []).map((m) => [m.workspace_id, m.role]));
  return (ws ?? []).map((w) => ({ ...w, role: role.get(w.id) ?? "viewer" }));
}
export async function createWorkspace(name, data) {
  const { data: id, error } = await supabase().rpc("create_workspace", { ws_name: name, ws_data: data });
  fail(error, "create a workspace");
  return id;
}
export async function loadWorkspace(id) {
  const { data, error } = await supabase().from("workspaces").select("id, name, version, data, updated_at, updated_by_email").eq("id", id).single();
  fail(error, "open this workspace");
  return data;
}
// changes: [{ area, item, field, path, from, to, note }]. Returns the new version.
export async function saveWorkspace(id, expectedVersion, data, changes) {
  const clean = changes.map((c) => ({
    area: c.area ?? null, item: c.item ?? null, field: c.field ?? null, path: c.path ?? null,
    from: c.from === undefined ? null : c.from, to: c.to === undefined ? null : c.to, note: c.note ?? null,
  }));
  const { data: version, error } = await supabase().rpc("save_workspace", { ws: id, expected_version: expectedVersion, new_data: data, changes: clean });
  fail(error, "save to this workspace");
  return version;
}
export async function deleteWorkspace(id) {
  const { error } = await supabase().from("workspaces").delete().eq("id", id);
  fail(error, "delete this workspace");
}
export async function fetchAudit(id, limit = 1000) {
  const { data, error } = await supabase()
    .from("audit_log")
    .select("id, at, user_email, area, item, field, path, from_value, to_value, note, version")
    .eq("workspace_id", id)
    .order("at", { ascending: false })
    .limit(limit);
  fail(error, "read the audit log");
  // Oldest first, in the same shape as the browser change log.
  return (data ?? []).reverse().map((r) => ({
    id: `db-${r.id}`, at: r.at, user: r.user_email || "unknown", area: r.area, item: r.item, field: r.field || "",
    path: r.path, from: r.from_value ?? undefined, to: r.to_value ?? undefined, note: r.note || undefined, version: r.version, verified: true,
  }));
}

// ── Members ──
export async function listMembers(id) {
  const sb = supabase();
  const { data, error } = await sb.from("workspace_members").select("email, role, added_at").eq("workspace_id", id).order("added_at");
  fail(error, "list members");
  const { data: inv } = await sb.from("workspace_invites").select("email, role, invited_at").eq("workspace_id", id);
  return { members: data ?? [], invites: inv ?? [] };
}
export async function addMember(id, email, role) {
  const { data, error } = await supabase().rpc("add_member", { ws: id, member_email: email.trim(), member_role: role });
  fail(error, "add members");
  return data; // "added" | "invited"
}
export async function removeMember(id, email) {
  const { error } = await supabase().rpc("remove_member", { ws: id, member_email: email });
  fail(error, "remove members");
}

// ── Remembered link (which database workspace this browser saves to) ──
export function rememberLink(link) {
  try {
    if (link) window.localStorage.setItem(LINK_KEY, JSON.stringify(link));
    else window.localStorage.removeItem(LINK_KEY);
  } catch {
    // storage blocked
  }
}
export function recallLink() {
  try {
    return JSON.parse(window.localStorage.getItem(LINK_KEY) ?? "null");
  } catch {
    return null;
  }
}
