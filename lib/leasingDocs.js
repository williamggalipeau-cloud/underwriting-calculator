// Phase R: documents on leasing prospects and the rent comps section. Same
// store as Library → Documents (deal_documents, the asset as deal_id),
// filed as "other" with the prospect and the type in the title, e.g.
// "[leasing:lp-abc] Proposal: Fictional Logistics.pdf". No new database
// type is needed.
import { createDealDoc } from "@/lib/dealDocs";

export const LEASING_DOC_TYPES = [
  ["proposal", "Proposal"],
  ["loi", "LOI"],
  ["lease_draft", "Lease draft"],
  ["approval_memo", "Lease approval memo"],
  ["broker_report", "Broker report"],
  ["comps", "Rent comp report"],
  ["credit_screening", "Credit screening report"],
  ["credit_report", "Credit report"], // 1.1.9: a credit bureau's report on a tenant
  ["credit_memo", "Credit assessment memo"], // 1.1.9: our own assessment
];
// 1.1.9: a tenant's credit documents (Tenant Credit) use the same title
// convention, with the tenant as the target: "[leasing:tenant:<slug>] …".
export const tenantDocTarget = (tenant) => `tenant:${String(tenant ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
export const PROSPECT_DOC_TYPES = ["proposal", "loi", "lease_draft", "approval_memo", "broker_report", "credit_screening"];
export const COMPS_DOC_TYPES = ["comps", "broker_report"];
export const leasingTypeLabel = (k) => LEASING_DOC_TYPES.find(([v]) => v === k)?.[1] ?? k;

// target: a prospect id, or "comps" for the rent comps section.
export function leasingTitle({ target, type, name }) {
  return `[leasing:${target}] ${leasingTypeLabel(type)}: ${name}`;
}
const RE = /^\[leasing:([^\]]+)\] ([^:]+): (.*)$/;
export function parseLeasingTitle(title) {
  const m = RE.exec(title ?? "");
  if (!m) return null;
  return { target: m[1], type: LEASING_DOC_TYPES.find(([, l]) => l === m[2])?.[0] ?? "other", typeLabel: m[2], name: m[3] };
}
export function leasingDocs(docs, dealId = null) {
  return (docs ?? []).filter((d) => !dealId || d.deal_id === dealId).map((d) => ({ doc: d, meta: parseLeasingTitle(d.title) })).filter((x) => x.meta).map(({ doc, meta }) => ({ ...meta, id: doc.id, dealId: doc.deal_id, by: doc.files?.[0]?.uploaded_by_email ?? null, doc }));
}
export function uploadLeasingDoc(workspaceId, { dealId, target, type, file }, email, create = createDealDoc) {
  return create(workspaceId, { dealId, docType: "other", title: leasingTitle({ target, type, name: file.name }), files: [file] }, email);
}
