// ─── Asset photos and floor plans in Supabase Storage (phase I part 2) ─────
// Private "asset-photos" bucket (supabase/asset_photos.sql) at
// <workspace>/<deal id>/<photos|floorplan>/<time>-<file>. Members read;
// owners and editors upload and delete. Details live in inputs.assetMedia.

import { supabase } from "@/lib/cloud";
import { safeName } from "@/lib/leaseDocs";

const BUCKET = "asset-photos";
export const MAX_PHOTO_MB = 25;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const fail = (error, what) => {
  if (!error) return;
  const msg = error.message || String(error);
  if (/bucket not found/i.test(msg)) throw new Error("Photo storage isn't set up yet. Run supabase/asset_photos.sql in the Supabase SQL Editor.");
  if (/row-level security|not allowed|permission denied|unauthorized|403/i.test(msg)) throw new Error(`You don't have permission to ${what}.`);
  if (/exceeded the maximum allowed size|payload too large|413/i.test(msg)) throw new Error(`That file is larger than ${MAX_PHOTO_MB} MB.`);
  if (/mime type/i.test(msg)) throw new Error("Only JPEG, PNG, WebP, GIF or PDF files can be uploaded.");
  throw new Error(msg);
};

export function checkAssetFile(file, { allowPdf = false } = {}) {
  const ok = IMAGE_TYPES.includes(file.type) || (allowPdf && file.type === "application/pdf");
  if (!ok) return `${file.name} isn't ${allowPdf ? "an image or PDF" : "an image (JPEG, PNG, WebP or GIF)"}.`;
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) return `${file.name} is larger than ${MAX_PHOTO_MB} MB.`;
  return null;
}

export async function uploadAssetFile(workspaceId, dealId, folder, file) {
  const path = `${workspaceId}/${dealId}/${folder}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase().storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  fail(error, "upload files");
  return { path, name: file.name, size: file.size };
}

export async function removeAssetFiles(paths) {
  if (!paths.length) return;
  const { error } = await supabase().storage.from(BUCKET).remove(paths);
  fail(error, "delete files");
}

// { path: signedUrl } for many files at once (links last an hour).
export async function assetFileLinks(paths, seconds = 3600) {
  if (!paths.length) return {};
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrls(paths, seconds);
  fail(error, "open files");
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
