// ─── Lease documents: PDFs in Supabase Storage + one row per lease ──────────
// Set up by supabase/leases.sql. Files live in the private "leases" bucket at
// <workspace id>/<deal id>/<lease id>/<file name>; each lease row lists its
// files in document order (base lease first, then amendments). Members can
// read and open; owners and editors can add, change and delete. The database
// logs every change in audit_log.

import { SUPABASE_URL, supabase } from "@/lib/cloud";

const BUCKET = "leases";
export const MAX_FILE_MB = 50;
export const FILE_KINDS = [
  ["lease", "Lease"],
  ["amendment", "Amendment"],
  ["other", "Other (exhibit, estoppel, SNDA…)"],
];
export const STATUS_LABEL = {
  uploaded: "Uploaded – not abstracted",
  abstracted: "Abstracted – review",
  applied: "Applied to rent roll",
};

const fail = (error, what) => {
  if (!error) return;
  const msg = error.message || String(error);
  if (/relation .*lease_documents.* does not exist|schema cache|bucket not found/i.test(msg)) {
    throw new Error("Lease storage isn't set up yet. Run supabase/leases.sql in the Supabase SQL Editor.");
  }
  if (/row-level security|not allowed|permission denied|unauthorized|403/i.test(msg)) throw new Error(`You don't have permission to ${what}.`);
  if (/exceeded the maximum allowed size|payload too large|413/i.test(msg)) throw new Error(`That file is larger than ${MAX_FILE_MB} MB.`);
  if (/mime type/i.test(msg)) throw new Error("Only PDF files can be uploaded.");
  throw new Error(msg);
};

// Storage keys allow letters, digits and a few symbols only.
export const safeName = (name) =>
  String(name).normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "document.pdf";

export async function listLeases(workspaceId) {
  const { data, error } = await supabase()
    .from("lease_documents")
    .select("id, deal_id, unit_ids, tenant, title, files, status, abstract, created_at, created_by_email, updated_at, abstracted_at, abstracted_by_email, applied_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  fail(error, "read leases");
  return data ?? [];
}

async function uploadFiles(workspaceId, dealId, leaseId, files, email) {
  const sb = supabase();
  const out = [];
  for (const { file, kind } of files) {
    if (file.type && file.type !== "application/pdf") throw new Error(`${file.name} isn't a PDF.`);
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
    const path = `${workspaceId}/${dealId}/${leaseId}/${Date.now()}-${safeName(file.name)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
    if (error) {
      // Leave nothing half-uploaded.
      if (out.length) await sb.storage.from(BUCKET).remove(out.map((f) => f.path));
      fail(error, "upload lease documents");
    }
    out.push({ path, name: file.name, size: file.size, kind, uploaded_at: new Date().toISOString(), uploaded_by_email: email ?? null });
  }
  return out;
}

// files: [{ file: File, kind }], in document order.
export async function createLease(workspaceId, { dealId, tenant, title, unitIds = [], files }, email) {
  const id = crypto.randomUUID();
  const stored = await uploadFiles(workspaceId, dealId, id, files, email);
  const { data, error } = await supabase()
    .from("lease_documents")
    .insert({ id, workspace_id: workspaceId, deal_id: dealId, tenant: tenant ?? "", title: title ?? "", unit_ids: unitIds, files: stored })
    .select()
    .single();
  if (error) {
    await supabase().storage.from(BUCKET).remove(stored.map((f) => f.path));
    fail(error, "add leases");
  }
  return data;
}

export async function addLeaseFiles(lease, workspaceId, files, email) {
  const stored = await uploadFiles(workspaceId, lease.deal_id, lease.id, files, email);
  return updateLease(lease.id, { files: [...(lease.files ?? []), ...stored] });
}

export async function updateLease(id, patch) {
  const { data, error } = await supabase().from("lease_documents").update(patch).eq("id", id).select().single();
  fail(error, "change leases");
  return data;
}

// Removes one file from a lease (storage first, then the list).
export async function removeLeaseFile(lease, path) {
  const { error } = await supabase().storage.from(BUCKET).remove([path]);
  fail(error, "delete lease documents");
  return updateLease(lease.id, { files: (lease.files ?? []).filter((f) => f.path !== path) });
}

export async function deleteLease(lease) {
  const paths = (lease.files ?? []).map((f) => f.path);
  if (paths.length) {
    const { error } = await supabase().storage.from(BUCKET).remove(paths);
    fail(error, "delete lease documents");
  }
  const { error } = await supabase().from("lease_documents").delete().eq("id", lease.id);
  fail(error, "delete leases");
}

// A link to open a stored PDF, valid for `seconds` (default 1 hour).
export async function fileLink(path, seconds = 3600) {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, seconds);
  fail(error, "open lease documents");
  return data.signedUrl;
}

// Saves an abstract (or removes it with null) through save_lease_abstract:
// owners and editors only. Returns the new status.
export async function saveAbstract(leaseId, abstract) {
  const { data, error } = await supabase().rpc("save_lease_abstract", { lease: leaseId, abstract });
  if (error && /function .*save_lease_abstract.* does not exist|schema cache/i.test(error.message || "")) {
    throw new Error("Saving abstracts isn't set up yet. Run the phase B part of supabase/leases.sql in the Supabase SQL Editor.");
  }
  if (error && /owners and editors/i.test(error.message || "")) throw new Error("Only owners and editors can save an abstract.");
  fail(error, "save abstracts");
  return data;
}

// Signed links (1 hour) for each of a lease's files, in document order.
export async function fileLinks(lease, seconds = 3600) {
  const out = [];
  for (const f of lease.files ?? []) out.push({ name: f.name, kind: f.kind, path: f.path, url: await fileLink(f.path, seconds) });
  return out;
}

// The Supabase project ref (for the prompt's save step).
export const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

export const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
