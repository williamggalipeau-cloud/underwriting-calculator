// Acquisition documents (user, 11/24): Acquisitions → Acquisition Documents.
// The same store as Library → Documents (deal_documents, one row per
// document, the deal as deal_id). Types by deal stage, agreed with the user;
// loan, rate cap and insurance documents are shown read-only (they're filed
// on Debt and Property Management). New types need
// supabase/acquisition_doc_types.sql; until it runs, an upload is filed as
// "other" with "[acq] <type label>: <file>" as its title.
import { TYPE } from "@/lib/dealDocTypes";
import { createDealDoc } from "@/lib/dealDocs";

export const ACQ_STAGES = [
  ["screening", "Screening", [
    ["om", "Offering memo", "existing"], ["rent_roll", "Rent roll", "existing"], ["t12", "T-12 operating statement", "existing"],
    ["current_leases", "Current leases", "new"], ["listing_agreement", "Broker listing agreement", "existing"],
    ["broker_model", "Broker underwriting / model", "new"], ["site_plan", "Site and floor plans", "new"],
  ]],
  ["contract", "Under LOI or contract", [
    ["loi", "Letter of intent", "existing"], ["psa", "PSA and amendments", "existing"],
    ["title_survey", "Title commitment and survey", "new"], ["phase1_esa", "Phase I environmental report", "new"],
    ["pca", "Property condition report", "new"], ["zoning", "Zoning report", "new"], ["lender_appraisal", "Lender appraisal", "new"],
    ["estoppel", "Tenant estoppel", "existing"], ["snda", "SNDA", "new"],
  ]],
  ["approval", "Approval", [["ic_memo", "Final IC memo", "existing"], ["ic_presentation", "IC presentation", "new"]]],
  ["financing", "Financing", [["loan_term_sheet", "Loan term sheet / commitment", "new"], ["loan", "Loan agreement", "readonly"], ["rate_cap", "Rate cap confirmation", "readonly"]]],
  ["closing", "Closing", [["closing_acq", "Closing statement (acquisition)", "existing"], ["deed_title", "Deed and title policy", "new"], ["insurance_cert", "Insurance certificate", "readonly"]]],
];
const ALL = ACQ_STAGES.flatMap(([s, sl, ts]) => ts.map(([k, l, how]) => ({ key: k, label: l, how, stage: s, stageLabel: sl })));
export const ACQ_TYPES = ALL;
export const ACQ_UPLOAD_TYPES = ALL.filter((t) => t.how !== "readonly");
export const acqType = (k) => ALL.find((t) => t.key === k) ?? null;
export const acqTypeLabel = (k) => acqType(k)?.label ?? TYPE[k]?.label ?? k;
// Types the database accepted before supabase/acquisition_doc_types.sql.
const BUILT_IN = new Set(["om", "rent_roll", "t12", "loi", "psa", "ic_memo", "closing_acq", "estoppel", "loan", "rate_cap", "insurance_cert"]);

// Documents filed on another tab that are also an acquisition checklist item.
const FILED_ELSEWHERE = [[/^\[fact:pcr\] /, "pca"], [/^\[fact:phase1\] /, "phase1_esa"], [/^\[fact:survey\] /, "title_survey"], [/^\[snda:[^\]]+\] /, "snda"]];
export const FILED_ELSEWHERE_TYPES = FILED_ELSEWHERE.map(([, k]) => k);

export const acqTitle = (type, name) => `[acq] ${acqTypeLabel(type)}: ${name}`;
const RE = /^\[acq\] ([^:]+): (.*)$/;
export function parseAcqTitle(title) {
  const m = RE.exec(title ?? "");
  if (!m) return null;
  return { type: ALL.find((t) => t.label === m[1])?.key ?? "other", name: m[2] };
}

// docs: deal_documents rows; deals: { id, inputs } (assets and Deal Screener
// deals); pipeline: pipeline board deals ({ name, omDocId, targetFund }).
export function acquisitionDocs(docs, deals = [], pipeline = [], todayISO = new Date().toISOString().slice(0, 10)) {
  const byId = new Map(deals.map((d) => [d.id, d]));
  const omOf = new Map((pipeline ?? []).filter((p) => p.omDocId).map((p) => [p.omDocId, p]));
  const out = [];
  for (const d of docs ?? []) {
    if (/^\[(sale|leasing|research)[:\]]/.test(d.title ?? "")) continue; // disposition, leasing, research documents
    const parsed = parseAcqTitle(d.title);
    // 1.1.23: a property condition report, Phase I report or survey filed on
    // Asset Summary ("[fact:…]") and an SNDA filed on Debt ("[snda:…]") are
    // the same documents the checklist asks for, so they count here too.
    const filed = FILED_ELSEWHERE.find(([re]) => re.test(d.title ?? ""));
    const type = filed ? filed[1] : parsed ? (d.doc_type === "other" ? parsed.type : d.doc_type) : d.doc_type;
    const t = acqType(type);
    const pl = omOf.get(d.id);
    if (!t && !pl) continue;
    if (!byId.has(d.deal_id) && !pl) continue;
    const deal = byId.get(d.deal_id);
    const inp = deal?.inputs ?? {};
    const stage = !deal ? "Pipeline" : !inp.fundName ? "Deal Screener" : inp.acquisitionDate && inp.acquisitionDate <= todayISO ? "Owned" : "Under contract";
    out.push({
      id: d.id, doc: d, dealId: d.deal_id ?? null,
      deal: inp.propertyName || pl?.name || d.deal_id || "",
      fund: inp.fundName || pl?.targetFund || "",
      status: stage, type: t?.key ?? "om", typeLabel: t?.label ?? "Offering memo", group: t?.stage ?? "screening", groupLabel: t?.stageLabel ?? "Screening",
      readOnly: t?.how === "readonly" || !!filed,
      name: parsed?.name || d.files?.[0]?.name || d.title || "",
      files: (d.files ?? []).length,
      uploadedAt: d.created_at ?? d.files?.[0]?.uploaded_at ?? null,
      by: d.uploaded_by_email ?? d.files?.[0]?.uploaded_by_email ?? null,
      abstracted: !!d.abstract,
    });
  }
  const order = (k) => ALL.findIndex((t) => t.key === k);
  return out.sort((a, b) => a.deal.localeCompare(b.deal) || order(a.type) - order(b.type));
}

// Upload: the real type when the database has it, else "other" with the type in the title.
export async function uploadAcqDoc(workspaceId, { dealId, type, file }, email, create = createDealDoc) {
  const title = acqTitle(type, file.name);
  try {
    return await create(workspaceId, { dealId, docType: type, title, files: [file] }, email);
  } catch (e) {
    if (BUILT_IN.has(type) || !/check|constraint|doc_type|violates/i.test(e?.message ?? "")) throw e;
    return create(workspaceId, { dealId, docType: "other", title, files: [file] }, email);
  }
}
