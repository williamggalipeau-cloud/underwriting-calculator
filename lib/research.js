// Acquisitions → Research (11/24). Everything here belongs to one asset
// (deal.inputs), never to a fund:
//   inputs.salesComps  the asset's own sales comps (same shape as the firm
//                      comps state, without the firm-level market data)
//   inputs.research    third-party research used on the asset: a link or an
//                      uploaded PDF, with a short summary of what it supports.
// Uploaded PDFs go in the same store as Library → Documents (deal_documents,
// the asset as deal_id), filed as "other" with the title
// "[research:<id>] <file name>". No new database type is needed.
import { createDealDoc } from "@/lib/dealDocs";

export const RESEARCH_TYPES = [
  ["market", "Market report"],
  ["appraisal", "Appraisal"],
  ["bov", "Broker opinion of value"],
  ["rent_survey", "Rent survey"],
  ["environmental", "Environmental (Phase I / II)"],
  ["pca", "Property condition report"],
  ["credit", "Tenant credit report"],
  ["zoning", "Zoning / entitlement report"],
  ["other", "Other"],
];
export const researchTypeLabel = (k) => RESEARCH_TYPES.find(([v]) => v === k)?.[1] ?? k ?? "";

// The underwriting assumptions a report can support.
export const RESEARCH_ASSUMPTIONS = [
  ["marketRent", "Market rent"],
  ["rentGrowth", "Rent growth"],
  ["vacancy", "Vacancy / downtime"],
  ["exitCap", "Exit cap rate"],
  ["value", "Purchase price / value"],
  ["capex", "Capital / repairs"],
  ["credit", "Tenant credit"],
  ["other", "Other"],
];
export const assumptionLabel = (k) => RESEARCH_ASSUMPTIONS.find(([v]) => v === k)?.[1] ?? k;

// Only http(s) links are kept (no javascript:, data:, file: …).
export function safeLink(url) {
  const s = String(url ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function makeResearch(patch = {}, { by = "", now = new Date() } = {}) {
  return {
    id: `rs-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: "market",
    title: "",
    provider: "",
    date: "",
    url: "",
    docId: null,
    fileName: "",
    assumptions: [],
    keyFigures: "",
    summary: "",
    addedBy: by,
    addedAt: now.toISOString(),
    ...patch,
  };
}

export const researchOf = (inputs) => (Array.isArray(inputs?.research) ? inputs.research : []);

// The asset's comps, or the firm list as the starting point. own = false
// means the asset has none of its own yet: its first edit saves a copy.
export function compsFor(inputs, firmState) {
  if (inputs?.salesComps) return { state: inputs.salesComps, own: true };
  return { state: assetCompsCopy(firmState), own: false };
}
export function assetCompsCopy(firmState) {
  const { market, benchmarks, actionsDone, ...rest } = firmState ?? {}; // eslint-disable-line no-unused-vars
  return { comps: [], marketGrowthPct: 3, spreadBp: 25, filters: { sinceISO: "", minSF: "", maxSF: "", type: "" }, ...rest };
}
// The state saved on the asset from a comps edit (never the firm market data).
export const saveAssetComps = (next) => assetCompsCopy(next);

// Every research item across assets: [{ asset, dealId, r }], newest first.
export function allResearch(deals) {
  return (deals ?? [])
    .flatMap((d) => researchOf(d.inputs).map((r) => ({ asset: d.inputs.propertyName ?? "", dealId: d.id, r })))
    .sort((a, b) => String(b.r.date || "").localeCompare(String(a.r.date || "")));
}

// Counts by type and which assumptions have support.
export function researchSummary(items) {
  const rs = items.map((x) => x.r ?? x);
  const byType = {};
  for (const r of rs) byType[r.type] = (byType[r.type] ?? 0) + 1;
  const covered = RESEARCH_ASSUMPTIONS.filter(([k]) => k !== "other" && rs.some((r) => (r.assumptions ?? []).includes(k))).map(([k]) => k);
  const missing = RESEARCH_ASSUMPTIONS.filter(([k]) => k !== "other" && !covered.includes(k)).map(([k]) => k);
  return { count: rs.length, byType, covered, missing, links: rs.filter((r) => r.url).length, files: rs.filter((r) => r.docId || r.fileName).length };
}

export function researchXlsx(items) {
  const out = [["Third-party research"], ["Asset", "Type", "Title", "Provider", "Date", "Assumptions supported", "Key figures", "Summary", "Link", "File", "Added by"]];
  for (const { asset, r } of items) out.push([asset, researchTypeLabel(r.type), r.title, r.provider, r.date, (r.assumptions ?? []).map(assumptionLabel).join(", "), r.keyFigures, r.summary, r.url, r.fileName, r.addedBy]);
  return out;
}

export function researchTitle(id, name) {
  return `[research:${id}] ${name}`;
}
const RE = /^\[research:([^\]]+)\] (.*)$/;
export function parseResearchTitle(title) {
  const m = RE.exec(title ?? "");
  return m ? { researchId: m[1], name: m[2] } : null;
}
export function uploadResearchDoc(workspaceId, { dealId, researchId, file }, email, create = createDealDoc) {
  return create(workspaceId, { dealId, docType: "other", title: researchTitle(researchId, file.name), files: [file] }, email);
}
