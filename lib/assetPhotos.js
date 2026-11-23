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

// Sample images shipped with the app (phase L mock photos and floor plans):
// path "sample:<file>" → <basePath>/sample-media/<file>. Never in storage.
export const SAMPLE_PREFIX = "sample:";
export const isSamplePath = (p) => typeof p === "string" && p.startsWith(SAMPLE_PREFIX);
export const BASE_PATH = "/underwriting-calculator"; // next.config.mjs basePath
export const sampleUrl = (p) => `${BASE_PATH}/sample-media/${p.slice(SAMPLE_PREFIX.length)}`;

export async function removeAssetFiles(paths) {
  paths = (paths ?? []).filter((p) => !isSamplePath(p));
  if (!paths.length) return;
  const { error } = await supabase().storage.from(BUCKET).remove(paths);
  fail(error, "delete files");
}

// { path: signedUrl } for many files at once (links last an hour).
export async function assetFileLinks(paths, seconds = 3600) {
  const out = Object.fromEntries(paths.filter(isSamplePath).map((p) => [p, sampleUrl(p)]));
  const stored = paths.filter((p) => !isSamplePath(p));
  if (!stored.length) return out;
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrls(stored, seconds);
  fail(error, "open files");
  return { ...out, ...Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl])) };
}

// An image as a JPEG data URL (for the PDF), whatever its format (SVG, WebP…):
// fetched, drawn on a canvas on a white background. maxW limits the size.
export async function imageDataUrl(url, { maxW = 1400, quality = 0.85 } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load an image (${res.status}).`);
  const blob = await res.blob();
  const obj = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read an image."));
      i.src = obj;
    });
    const w0 = img.naturalWidth || 1200, h0 = img.naturalHeight || 900;
    const k = Math.min(1, maxW / w0);
    const c = document.createElement("canvas");
    c.width = Math.round(w0 * k);
    c.height = Math.round(h0 * k);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL("image/jpeg", quality), w: c.width, h: c.height };
  } finally {
    URL.revokeObjectURL(obj);
  }
}
