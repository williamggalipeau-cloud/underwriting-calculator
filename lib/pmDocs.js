// Phase T: documents in each Property Management section (tax bills and
// appeals, policies and certificates, PCA / Phase I / zoning reports, service
// contracts). Same store as Library → Documents, filed as "other" with the
// section in the title, e.g. "[pm:policies] Example Mutual policy.pdf".
import { createDealDoc } from "@/lib/dealDocs";

export const pmTitle = ({ section, name }) => `[pm:${section}] ${name}`;
const RE = /^\[pm:([a-z]+)\] (.*)$/;
export function parsePmTitle(title) {
  const m = RE.exec(title ?? "");
  return m ? { section: m[1], name: m[2] } : null;
}
export function pmDocs(docs, dealIds = null) {
  return (docs ?? []).filter((d) => !dealIds || dealIds.includes(d.deal_id)).map((d) => ({ doc: d, meta: parsePmTitle(d.title) })).filter((x) => x.meta).map(({ doc, meta }) => ({ ...meta, id: doc.id, dealId: doc.deal_id, by: doc.files?.[0]?.uploaded_by_email ?? null, doc }));
}
export function uploadPmDoc(workspaceId, { dealId, section, file }, email, create = createDealDoc) {
  return create(workspaceId, { dealId, docType: "other", title: pmTitle({ section, name: file.name }), files: [file] }, email);
}
