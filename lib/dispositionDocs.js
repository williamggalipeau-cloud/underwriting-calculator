// Phase P: documents on sales, offers and closed sales. Kept in the same
// store as Library → Documents (deal_documents, one row per document, the
// asset as deal_id). The sale / offer and the type are in the title, e.g.
// "[sale:sale-abc] BOV: Example Brokerage.pdf", so it works before
// supabase/dispositions_doc_types.sql is applied (the row is then filed as
// "other"); once applied, the row also carries the real type.
import { createDealDoc } from "@/lib/dealDocs";

export const DISP_DOC_TYPES = [
  ["bov", "BOV"],
  ["listing_agreement", "Listing agreement"],
  ["marketing", "Offering memo / marketing"],
  ["psa", "PSA / amendment"],
  ["estoppel", "Estoppel"],
  ["closing_disp", "Closing statement"],
  ["offer_letter", "Offer letter / LOI"],
  ["post_closing", "Post-closing true-up"],
  ["distribution_notice", "Distribution notice"],
];
export const SALE_DOC_TYPES = ["bov", "listing_agreement", "marketing", "psa", "estoppel", "closing_disp"];
export const OFFER_DOC_TYPES = ["offer_letter"];
export const CLOSED_DOC_TYPES = ["closing_disp", "post_closing", "distribution_notice"];
export const dispTypeLabel = (k) => DISP_DOC_TYPES.find(([v]) => v === k)?.[1] ?? k;
// Types the database accepted before the phase P SQL.
const BUILT_IN = new Set(["psa", "estoppel", "closing_disp"]);

export function dispTitle({ saleId, offerId = null, type, name }) {
  return `[sale:${saleId}${offerId ? `/offer:${offerId}` : ""}] ${dispTypeLabel(type)}: ${name}`;
}
const RE = /^\[sale:([^\]/]+)(?:\/offer:([^\]]+))?\] ([^:]+): (.*)$/;
export function parseDispTitle(title) {
  const m = RE.exec(title ?? "");
  if (!m) return null;
  const type = DISP_DOC_TYPES.find(([, l]) => l === m[3])?.[0] ?? "other";
  return { saleId: m[1], offerId: m[2] ?? null, type, typeLabel: m[3], name: m[4] };
}

// Disposition documents among all deal documents, with their sale / offer.
export function dispositionDocs(docs, deals = []) {
  const name = (id) => deals.find((d) => d.id === id)?.inputs?.propertyName || id || "";
  return (docs ?? []).map((d) => ({ doc: d, meta: parseDispTitle(d.title) })).filter((x) => x.meta).map(({ doc, meta }) => ({ ...meta, id: doc.id, dealId: doc.deal_id, asset: name(doc.deal_id), uploadedAt: doc.created_at ?? doc.files?.[0]?.uploaded_at ?? null, by: doc.uploaded_by_email ?? doc.files?.[0]?.uploaded_by_email ?? null, doc }));
}

// Upload: the real type when the database has it, else "other".
export async function uploadDispDoc(workspaceId, { dealId, saleId, offerId = null, type, file }, email, create = createDealDoc) {
  const title = dispTitle({ saleId, offerId, type, name: file.name });
  try {
    return await create(workspaceId, { dealId, docType: type, title, files: [file] }, email);
  } catch (e) {
    if (BUILT_IN.has(type) || !/check|constraint|doc_type|violates/i.test(e?.message ?? "")) throw e;
    return create(workspaceId, { dealId, docType: "other", title, files: [file] }, email);
  }
}
