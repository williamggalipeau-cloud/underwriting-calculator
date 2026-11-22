// ─── Tenant credit documents: rows + files (owners and editors only) ────────
// Set up by supabase/tenant_credit.sql. Files go in the private "leases"
// bucket at <workspace>/<deal>/<lease>/credit/<file>; the storage policy keeps
// that folder from viewers, and the table's policies keep the rows from them.

import { supabase } from "@/lib/cloud";
import { MAX_FILE_MB, safeName } from "@/lib/leaseDocs";

const BUCKET = "leases";
const fail = (error, what) => {
  if (!error) return;
  const msg = error.message || String(error);
  if (/relation .*lease_credit_documents.* does not exist|schema cache/i.test(msg)) {
    throw new Error("Tenant credit isn't set up yet. Run supabase/tenant_credit.sql in the Supabase SQL Editor.");
  }
  if (/row-level security|not allowed|permission denied|unauthorized|403/i.test(msg)) throw new Error(`Only owners and editors can ${what}.`);
  throw new Error(msg);
};

// Every credit document in the workspace (empty for viewers).
export async function listCreditDocs(workspaceId) {
  const { data, error } = await supabase()
    .from("lease_credit_documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error && /relation .* does not exist|schema cache/i.test(error.message || "")) return [];
  fail(error, "read tenant credit documents");
  return data ?? [];
}

// meta: { kind, subject, subject_name, source, audited, period_end, report_date, figures, figures_source, notes }
export async function addCreditDoc(workspaceId, lease, file, meta) {
  const sb = supabase();
  let stored = null;
  if (file) {
    if (file.type && file.type !== "application/pdf") throw new Error(`${file.name} isn't a PDF.`);
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
    const path = `${workspaceId}/${lease.deal_id}/${lease.id}/credit/${Date.now()}-${safeName(file.name)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
    fail(error, "upload tenant credit documents");
    stored = { path, name: file.name, size: file.size };
  }
  const { data, error } = await sb
    .from("lease_credit_documents")
    .insert({ workspace_id: workspaceId, lease_id: lease.id, deal_id: lease.deal_id, file: stored, ...meta })
    .select()
    .single();
  if (error && stored) await sb.storage.from(BUCKET).remove([stored.path]);
  fail(error, "add tenant credit documents");
  return data;
}

export async function updateCreditDoc(id, patch) {
  const { data, error } = await supabase().from("lease_credit_documents").update(patch).eq("id", id).select().single();
  fail(error, "change tenant credit documents");
  return data;
}

export async function deleteCreditDoc(doc) {
  if (doc.file?.path) {
    const { error } = await supabase().storage.from(BUCKET).remove([doc.file.path]);
    fail(error, "delete tenant credit documents");
  }
  const { error } = await supabase().from("lease_credit_documents").delete().eq("id", doc.id);
  fail(error, "delete tenant credit documents");
}
