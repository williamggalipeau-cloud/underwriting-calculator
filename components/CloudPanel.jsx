"use client";

import { useEffect, useState } from "react";
import { addMember, listMembers, listWorkspaces, removeMember, sendSignInLink } from "@/lib/cloud";

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" }) : "—");

// Database panel: sign in, save the workspace to the database, open a saved
// workspace, and (owners) manage who can open it.
export default function CloudPanel({ session, link, onClose, onCreate, onOpen, onSaveNow, onUnlink, onSignOut, onDelete }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [list, setList] = useState(null);
  const [name, setName] = useState("Model Fund I");
  const [members, setMembers] = useState(null);
  const [newMember, setNewMember] = useState({ email: "", role: "editor" });
  const signedIn = !!session;
  const isOwner = link?.role === "owner";

  async function run(fn, okText) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (okText) setMsg({ ok: true, text: typeof okText === "function" ? okText(r) : okText });
      return r;
    } catch (e) {
      setMsg({ ok: false, text: e.message || String(e) });
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => run(async () => setList(await listWorkspaces()));
  const refreshMembers = () => link && run(async () => setMembers(await listMembers(link.id)));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!signedIn) return;
    let stop = false;
    listWorkspaces()
      .then((l) => !stop && setList(l))
      .catch((e) => !stop && setMsg({ ok: false, text: e.message }));
    return () => {
      stop = true;
    };
  }, [signedIn, link?.id, link?.version]);
  useEffect(() => {
    if (!signedIn || !link?.id) return;
    let stop = false;
    listMembers(link.id)
      .then((m) => !stop && setMembers(m))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [signedIn, link?.id]);

  const btn = "rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={onClose}>
      <div className="mt-16 w-full max-w-2xl rounded-2xl bg-white p-5 text-gray-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Database</h2>
            <p className="text-xs text-gray-500">
              Save workspaces to your Supabase database to share them, keep every version, and get a verified change log.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

        {!signedIn ? (
          <div className="space-y-2 text-xs">
            <p className="text-gray-600">Sign in with your email. We&apos;ll send a link; open it on this computer and you&apos;re in. No password needed.</p>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() => sendSignInLink(email).then(() => true));
                if (ok) setSent(true);
              }}
            >
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="w-64 rounded-md border border-gray-300 px-2 py-1.5" />
              <button type="submit" disabled={busy || !email} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Email me a sign-in link</button>
            </form>
            {sent && <p className="text-emerald-700">Check your inbox for a sign-in link from Supabase, then come back to this tab.</p>}
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span>Signed in as <span className="font-semibold">{session.user.email}</span></span>
              <button type="button" onClick={onSignOut} className="text-gray-500 hover:text-red-600">Sign out</button>
            </div>

            {link ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    This browser saves to <span className="font-semibold">{link.name}</span> (version {link.version}, you&apos;re {link.role})
                  </span>
                  <span className="flex gap-2">
                    {link.role !== "viewer" && (
                      <button type="button" disabled={busy} onClick={() => run(onSaveNow, "Saved.")} className={`${btn} border border-emerald-300 bg-white text-emerald-800`}>Save now</button>
                    )}
                    <button type="button" onClick={onUnlink} className={`${btn} text-gray-500 hover:text-red-600`}>Unlink</button>
                  </span>
                </div>
              </div>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2 rounded-lg border border-blue-200 bg-blue-50/40 px-3 py-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await run(() => onCreate(name.trim()), "Saved to the database. Changes now save there too.");
                  refresh();
                }}
              >
                <label className="flex flex-col gap-0.5">
                  <span className="text-gray-600">Save this workspace to the database as</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} required className="w-60 rounded-md border border-gray-300 px-2 py-1.5" />
                </label>
                <button type="submit" disabled={busy || !name.trim()} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>Save to database</button>
              </form>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">Your workspaces</h3>
                <button type="button" onClick={refresh} className="text-blue-700 hover:underline">Refresh</button>
              </div>
              {!list ? (
                <p className="text-gray-400">Loading…</p>
              ) : list.length === 0 ? (
                <p className="text-gray-400">None yet. Save this workspace above, or ask an owner to add you to theirs.</p>
              ) : (
                <table className="w-full">
                  <thead className="text-gray-500">
                    <tr className="border-b border-gray-200">
                      {["Workspace", "Your role", "Version", "Last saved", ""].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((w) => (
                      <tr key={w.id} className={`border-b border-gray-100 ${link?.id === w.id ? "bg-emerald-50/50" : ""}`}>
                        <td className="px-2 py-1.5 font-medium">{w.name}</td>
                        <td className="px-2 py-1.5">{w.role}</td>
                        <td className="px-2 py-1.5">{w.version}</td>
                        <td className="px-2 py-1.5 text-gray-500">{fmtTime(w.updated_at)} {w.updated_by_email ? `· ${w.updated_by_email}` : ""}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {link?.id === w.id ? (
                            <span className="text-emerald-700">Open</span>
                          ) : (
                            <button type="button" disabled={busy} onClick={() => run(() => onOpen(w), `Opened ${w.name}.`)} className="text-blue-700 hover:underline">Open</button>
                          )}
                          {w.role === "owner" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => window.confirm(`Delete "${w.name}" and all its versions and audit history from the database? This can't be undone.`) && run(() => onDelete(w).then(refresh), "Deleted.")}
                              className="ml-3 text-gray-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {link && members && (
              <div>
                <h3 className="mb-1 font-semibold text-gray-700">People with access to {link.name}</h3>
                <ul className="space-y-1">
                  {members.members.map((m) => (
                    <li key={m.email} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1">
                      <span>{m.email} <span className="text-gray-500">· {m.role}</span></span>
                      {isOwner && m.email !== session.user.email?.toLowerCase() && (
                        <button type="button" onClick={() => run(() => removeMember(link.id, m.email).then(refreshMembers), "Removed.")} className="text-gray-400 hover:text-red-600">Remove</button>
                      )}
                    </li>
                  ))}
                  {members.invites.map((m) => (
                    <li key={m.email} className="flex items-center justify-between rounded bg-amber-50 px-2 py-1">
                      <span>{m.email} <span className="text-amber-700">· invited as {m.role} (hasn&apos;t signed in yet)</span></span>
                      {isOwner && <button type="button" onClick={() => run(() => removeMember(link.id, m.email).then(refreshMembers), "Invite cancelled.")} className="text-gray-400 hover:text-red-600">Cancel</button>}
                    </li>
                  ))}
                </ul>
                {isOwner && (
                  <form
                    className="mt-2 flex flex-wrap gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await run(() => addMember(link.id, newMember.email, newMember.role), (r) => (r === "invited" ? `Invited ${newMember.email}. They get access when they first sign in with that email.` : `Added ${newMember.email}.`));
                      setNewMember({ email: "", role: "editor" });
                      refreshMembers();
                    }}
                  >
                    <input type="email" required value={newMember.email} onChange={(e) => setNewMember((m) => ({ ...m, email: e.target.value }))} placeholder="colleague@company.com" className="w-56 rounded-md border border-gray-300 px-2 py-1.5" />
                    <select value={newMember.role} onChange={(e) => setNewMember((m) => ({ ...m, role: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5">
                      <option value="editor">Editor (can change)</option>
                      <option value="viewer">Viewer (read only)</option>
                      <option value="owner">Owner (manage access)</option>
                    </select>
                    <button type="submit" disabled={busy} className={`${btn} bg-gray-800 text-white`}>Add person</button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
