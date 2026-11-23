// ─── Deal documents: PDFs in Supabase Storage + one row per document ───────
// Set up by supabase/deal_documents.sql. Files live in the private
// "deal-docs" bucket at <workspace>/<deal id or "fund">/<document id>/<file>.
// Asset documents have a deal_id; fund-level documents (LPA, PPM) have none
// and name their fund. Members read; owners and editors change.

import { supabase } from "@/lib/cloud";
import { MAX_FILE_MB, safeName } from "@/lib/leaseDocs";

const BUCKET = "deal-docs";
const fail = (error, what) => {
  if (!error) return;
  const msg = error.message || String(error);
  if (/relation .*deal_documents.* does not exist|schema cache|bucket not found/i.test(msg)) {
    throw new Error("Document storage isn't set up yet. Run supabase/deal_documents.sql in the Supabase SQL Editor.");
  }
  if (/row-level security|not allowed|permission denied|unauthorized|403/i.test(msg)) throw new Error(`You don't have permission to ${what}.`);
  if (/exceeded the maximum allowed size|payload too large|413/i.test(msg)) throw new Error(`That file is larger than ${MAX_FILE_MB} MB.`);
  if (/mime type/i.test(msg)) throw new Error("Only PDF files can be uploaded.");
  throw new Error(msg);
};

export async function listDealDocs(workspaceId) {
  const { data, error } = await supabase()
    .from("deal_documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error && /relation .*deal_documents.* does not exist|schema cache/i.test(error.message || "")) return [];
  fail(error, "read documents");
  return data ?? [];
}

async function uploadFiles(workspaceId, folder, docId, files, email) {
  const sb = supabase();
  const out = [];
  for (const file of files) {
    if (file.type && file.type !== "application/pdf") throw new Error(`${file.name} isn't a PDF.`);
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
    const path = `${workspaceId}/${folder}/${docId}/${Date.now()}-${safeName(file.name)}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
    if (error) {
      if (out.length) await sb.storage.from(BUCKET).remove(out.map((f) => f.path));
      fail(error, "upload documents");
    }
    out.push({ path, name: file.name, size: file.size, uploaded_at: new Date().toISOString(), uploaded_by_email: email ?? null });
  }
  return out;
}

// { dealId (null for fund documents), fundName, docType, title, leaseId, files: File[] }
export async function createDealDoc(workspaceId, { dealId = null, fundName = "", docType, title = "", leaseId = null, files }, email) {
  const id = crypto.randomUUID();
  const stored = await uploadFiles(workspaceId, dealId || "fund", id, files, email);
  const { data, error } = await supabase()
    .from("deal_documents")
    .insert({ id, workspace_id: workspaceId, deal_id: dealId, fund_name: fundName ?? "", doc_type: docType, title, lease_id: leaseId, files: stored })
    .select()
    .single();
  if (error) {
    await supabase().storage.from(BUCKET).remove(stored.map((f) => f.path));
    fail(error, "add documents");
  }
  return data;
}

export async function updateDealDoc(id, patch) {
  const { data, error } = await supabase().from("deal_documents").update(patch).eq("id", id).select().single();
  fail(error, "change documents");
  return data;
}

export async function deleteDealDoc(doc) {
  const paths = (doc.files ?? []).map((f) => f.path);
  if (paths.length) {
    const { error } = await supabase().storage.from(BUCKET).remove(paths);
    fail(error, "delete documents");
  }
  const { error } = await supabase().from("deal_documents").delete().eq("id", doc.id);
  fail(error, "delete documents");
}

export async function dealFileLink(path, seconds = 3600) {
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, seconds);
  fail(error, "open documents");
  return data.signedUrl;
}

export async function dealFileLinks(doc, seconds = 3600) {
  const out = [];
  for (const f of doc.files ?? []) out.push({ name: f.name, path: f.path, url: await dealFileLink(f.path, seconds) });
  return out;
}

export async function saveDealAbstract(docId, abstract) {
  const { data, error } = await supabase().rpc("save_deal_abstract", { doc: docId, abstract });
  if (error && /owners and editors/i.test(error.message || "")) throw new Error("Only owners and editors can save an abstract.");
  fail(error, "save abstracts");
  return data;
}
