"use client";

import { useEffect, useState } from "react";
import { addMember, listMembers, removeMember, sendPasswordReset, signInWithPassword, signUpWithPassword, updatePassword } from "@/lib/cloud";

const MIN_PASSWORD = 8;

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" }) : "—");

// Email + password sign-in: sign in, create an account, or reset a password.
// start="reset" shows the "new password" form: after a reset link is opened
// (recovery) or from "Change password" while signed in.
function PasswordForm({ busy, run, clearMsg, onPasswordSet, recovery = false, start = "signin" }) {
  const [mode, setMode] = useState(start);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState(null);
  const input = "w-64 rounded-md border border-gray-300 px-2 py-1.5";
  const primary = "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40";
  const linkBtn = "text-blue-700 hover:underline";
  const go = (m) => {
    setMode(m);
    setNote(null);
    clearMsg?.();
    setPassword("");
    setConfirm("");
  };
  const checkNew = () => {
    if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) throw new Error("The two passwords don't match.");
  };

  if (mode === "reset") {
    return (
      <form
        className="space-y-2 text-xs"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(async () => {
            checkNew();
            await updatePassword(password);
            return true;
          }, "Password saved. Use it to sign in from now on.");
          if (ok) onPasswordSet?.();
        }}
      >
        <p className="font-semibold text-gray-700">{recovery ? "Choose a new password" : "Change your password"}</p>
        <div className="flex flex-col gap-2">
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`New password (${MIN_PASSWORD}+ characters)`} className={input} />
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" className={input} />
        </div>
        <button type="submit" disabled={busy || !password || !confirm} className={primary}>Save password</button>
      </form>
    );
  }

  return (
    <form
      className="space-y-2 text-xs"
      onSubmit={async (e) => {
        e.preventDefault();
        if (mode === "signin") {
          await run(() => signInWithPassword(email, password));
        } else if (mode === "signup") {
          const needsConfirm = await run(async () => {
            checkNew();
            return signUpWithPassword(email, password);
          });
          if (needsConfirm) setNote("Account created. Open the confirmation email we sent you (one time only), then sign in here with your password.");
        } else {
          const ok = await run(() => sendPasswordReset(email).then(() => true));
          if (ok) setNote("If there's an account for that email, a reset link is on its way. Open it in this browser to choose a new password.");
        }
      }}
    >
      <p className="text-gray-600">
        {mode === "signin" && "Sign in with your email and password."}
        {mode === "signup" && "Create an account. You'll confirm your email once; after that you just sign in with your password."}
        {mode === "forgot" && "Enter your email and we'll send a link to choose a new password."}
      </p>
      <div className="flex flex-col gap-2">
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={input} />
        {mode !== "forgot" && (
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? `Password (${MIN_PASSWORD}+ characters)` : "Password"}
            className={input}
          />
        )}
        {mode === "signup" && (
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type the password again" className={input} />
        )}
      </div>
      <button type="submit" disabled={busy || !email || (mode !== "forgot" && !password)} className={primary}>
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Email me a reset link"}
      </button>
      {note && <p className="text-emerald-700">{note}</p>}
      <p className="flex flex-wrap gap-3 pt-1 text-gray-500">
        {mode !== "signin" && <button type="button" onClick={() => go("signin")} className={linkBtn}>Back to sign in</button>}
        {mode === "signin" && (
          <>
            <button type="button" onClick={() => go("forgot")} className={linkBtn}>Forgot password?</button>
            <span>
              New here? <button type="button" onClick={() => go("signup")} className={linkBtn}>Create an account</button>
            </span>
          </>
        )}
      </p>
    </form>
  );
}

// Database panel: sign in, save the workspace to the database, open a saved
// workspace, and (owners) manage who can open it.
export default function CloudPanel({ session, link, recovery, onRecoveryDone, onClose, onSaveNow, onSignOut }) {
  const [changingPassword, setChangingPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
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
  const refreshMembers = () => link && run(async () => setMembers(await listMembers(link.id)));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
              The firm&apos;s data is saved here, in the database, and nowhere else: every change within about a second, with a verified change log. Everyone sees the same data.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

        {!signedIn ? (
          <PasswordForm busy={busy} run={run} clearMsg={() => setMsg(null)} />
        ) : recovery ? (
          <PasswordForm busy={busy} run={run} clearMsg={() => setMsg(null)} start="reset" recovery onPasswordSet={onRecoveryDone} />
        ) : (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span>Signed in as <span className="font-semibold">{session.user.email}</span></span>
              <span className="flex gap-3">
                <button type="button" onClick={() => setChangingPassword((v) => !v)} className="text-gray-500 hover:text-blue-700">
                  {changingPassword ? "Cancel" : "Change password"}
                </button>
                <button type="button" onClick={onSignOut} className="text-gray-500 hover:text-red-600">Sign out</button>
              </span>
            </div>
            {changingPassword && (
              <div className="rounded-lg border border-gray-200 px-3 py-2">
                <PasswordForm busy={busy} run={run} clearMsg={() => setMsg(null)} start="reset" onPasswordSet={() => setChangingPassword(false)} />
              </div>
            )}

            {link ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2" data-testid="firm-status">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Saving to <span className="font-semibold">{link.name}</span> (you&apos;re {link.role}){link.savedAt ? ` · last saved ${fmtTime(link.savedAt)}` : ""}
                  </span>
                  <span className="flex gap-2">
                    {link.role !== "viewer" && (
                      <button type="button" disabled={busy} onClick={() => run(onSaveNow, "Saved.")} className={`${btn} border border-emerald-300 bg-white text-emerald-800`}>Save now</button>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">You don&apos;t have access to the firm&apos;s data yet. Ask an owner to add you with the email you signed in with.</p>
            )}

            {link && members && (
              <div>
                <h3 className="mb-1 font-semibold text-gray-700">People with access</h3>
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
