// Document Library (user, 11/24): Library → Documents lists every portfolio-
// and asset-level document across the firm. Rows come from deal_documents
// (every tab files there, some as "other" with a "[prefix] " title) and
// lease_documents. Photos aren't stored as documents, so they aren't listed.
// Each row says what it's attached to (a portfolio or an asset) and the
// workflow tab it belongs to, so the library can link there.
import { TYPE } from "@/lib/dealDocTypes";
import { acqType, parseAcqTitle } from "@/lib/acquisitionDocs";
import { dispTypeLabel } from "@/lib/dispositionDocs";
import { parseLeasingTitle } from "@/lib/leasingDocs";
import { parsePmTitle } from "@/lib/pmDocs";
import { parseResearchTitle } from "@/lib/research";
import { DOC_CATEGORIES } from "@/lib/fundSummary";
import { fundType } from "@/lib/fundTypes";

// Workflow tabs a document can belong to: [tab id, "Area → Tab"].
export const WORKFLOWS = {
  acqdocs: "Acquisitions → Acquisition Documents",
  research: "Acquisitions → Comps",
  dispdocs: "Dispositions → Disposition Documents",
  assets: "Asset Management → Asset Summary",
  leases: "Asset Management → Leases",
  leasing: "Asset Management → Active Leasing",
  valuations: "Asset Management → Valuation",
  debt: "Asset Management → Debt",
  taxes: "Property Management → Property Taxes",
  insurance: "Property Management → Insurance",
  condition: "Property Management → Property Condition",
  contracts: "Property Management → Service Contracts",
  fundsummary: "Portfolio Management → Portfolio Summary",
};
const PM_SECTION_TAB = { parcels: "taxes", bills: "taxes", appeals: "taxes", policies: "insurance", claims: "insurance", items: "condition", contracts: "contracts" };
const PM_SECTION_LABEL = { parcels: "Parcel record", bills: "Tax bill", appeals: "Tax appeal", policies: "Insurance policy", claims: "Insurance claim", items: "Condition report", contracts: "Service contract" };
const TYPE_TAB = {
  insurance_cert: "insurance", loan: "debt", rate_cap: "debt", loan_term_sheet: "debt", appraisal: "valuations",
  estoppel: "leases", cam: "leases", billing: "leases", closing_disp: "dispdocs",
  lpa: "fundsummary", ppm: "fundsummary", jva: "fundsummary", sma: "fundsummary",
};
// Types that attach to a portfolio; every other type attaches to an asset.
export const PORTFOLIO_TYPES = new Set(["lpa", "ppm", "jva", "sma"]);
export const attachesTo = (typeId) => (PORTFOLIO_TYPES.has(typeId) || TYPE[typeId]?.scope === "fund" ? "portfolio" : "asset");
// Where a type uploaded from the library will also appear.
export const workflowOfType = (typeId) => (TYPE_TAB[typeId] ? TYPE_TAB[typeId] : acqType(typeId) ? "acqdocs" : PORTFOLIO_TYPES.has(typeId) ? "fundsummary" : "assets");

// One deal_documents row → its type, label, name and workflow tab.
export function classifyDoc(d) {
  const title = d?.title ?? "";
  const file = d?.files?.[0]?.name ?? "";
  let m;
  if ((m = /^\[sale:[^\]]+\] ([^:]+): (.*)$/.exec(title))) return { typeId: d.doc_type === "other" ? "sale_doc" : d.doc_type, typeLabel: m[1], name: m[2], tab: "dispdocs" };
  if ((m = parseLeasingTitle(title))) return { typeId: `leasing_${m.type}`, typeLabel: m.typeLabel, name: m.name, tab: "leasing" };
  if ((m = parseResearchTitle(title))) return { typeId: "research", typeLabel: "Third-party research", name: m.name, tab: "research" };
  if ((m = parsePmTitle(title))) return { typeId: `pm_${m.section}`, typeLabel: PM_SECTION_LABEL[m.section] ?? "Property document", name: m.name, tab: PM_SECTION_TAB[m.section] ?? "assets" };
  if ((m = parseAcqTitle(title))) {
    const type = d.doc_type === "other" ? m.type : d.doc_type;
    return { typeId: type, typeLabel: acqType(type)?.label ?? TYPE[type]?.label ?? "Document", name: m.name, tab: TYPE_TAB[type] ?? "acqdocs" };
  }
  if (!d?.deal_id && d?.doc_type === "other") {
    const cat = DOC_CATEGORIES.find((c) => title.startsWith(`${c}: `));
    if (cat) return { typeId: "legal", typeLabel: cat, name: title.slice(cat.length + 2), tab: "fundsummary" };
  }
  const type = d?.doc_type ?? "other";
  const tab = TYPE_TAB[type] ?? (acqType(type) ? "acqdocs" : d?.deal_id ? "assets" : "fundsummary");
  return { typeId: type, typeLabel: TYPE[type]?.label ?? acqType(type)?.label ?? dispTypeLabel(type), name: title || file, tab };
}

export const STATUS_LABEL = { uploaded: "Uploaded", abstracted: "Abstracted – review", applied: "Applied" };
const NO_PORTFOLIO = "";

// docs: deal_documents rows; leases: lease_documents rows; deals: every
// deal ({ id, inputs }); funds: fund terms by name; resolve: a deal's fund
// name → the portfolio name used in the app.
export function libraryRows({ docs = [], leases = [], deals = [], funds = {}, resolve = (n) => (n ?? "").trim() }) {
  const byId = new Map(deals.map((d) => [d.id, d]));
  const portfolioOf = (dealId) => {
    const d = byId.get(dealId);
    return d ? resolve(d.inputs?.fundName) || NO_PORTFOLIO : NO_PORTFOLIO;
  };
  const assetName = (dealId) => byId.get(dealId)?.inputs?.propertyName || "Asset not found";
  const rows = [];
  for (const d of docs ?? []) {
    const c = classifyDoc(d);
    const asset = !!d.deal_id;
    rows.push({
      key: `doc:${d.id}`, kind: "doc", doc: d, id: d.id,
      typeId: c.typeId, typeLabel: c.typeLabel, name: c.name || "Untitled",
      level: asset ? "asset" : "portfolio",
      dealId: d.deal_id ?? null, assetName: asset ? assetName(d.deal_id) : "",
      portfolio: asset ? portfolioOf(d.deal_id) : (d.fund_name ?? "").trim(),
      tab: c.tab, workflow: WORKFLOWS[c.tab] ?? "",
      uploadedAt: d.created_at ?? d.files?.[0]?.uploaded_at ?? null,
      by: d.created_by_email ?? d.files?.[0]?.uploaded_by_email ?? null,
      status: d.status ?? "uploaded", files: d.files ?? [],
    });
  }
  for (const l of leases ?? []) {
    rows.push({
      key: `lease:${l.id}`, kind: "lease", lease: l, id: l.id,
      typeId: "lease", typeLabel: "Lease", name: l.tenant ? `Lease – ${l.tenant}` : l.title || "Lease",
      level: "asset", dealId: l.deal_id ?? null, assetName: assetName(l.deal_id), portfolio: portfolioOf(l.deal_id),
      tab: "leases", workflow: WORKFLOWS.leases,
      uploadedAt: l.created_at ?? null, by: l.created_by_email ?? null,
      status: l.status ?? "uploaded", files: l.files ?? [],
    });
  }
  const typeOf = (p) => (p ? fundType(funds?.[p]?.type) : "");
  for (const r of rows) r.portfolioType = typeOf(r.portfolio);
  return rows.sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
}

// f: { portfolio ("" all), asset (deal id, "" all), level ("" | "portfolio" | "asset"), tab, type (label), status, q }
export function filterRows(rows, f = {}) {
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter((r) =>
    (!f.portfolio || r.portfolio === f.portfolio)
    && (!f.asset || r.dealId === f.asset)
    && (!f.level || r.level === f.level)
    && (!f.tab || r.tab === f.tab)
    && (!f.type || r.typeLabel === f.type)
    && (!f.status || r.status === f.status)
    && (!q || [r.name, r.typeLabel, r.assetName, r.portfolio, ...(r.files ?? []).map((x) => x.name)].join(" ").toLowerCase().includes(q)));
}

export function libraryCounts(rows) {
  return {
    all: rows.length,
    portfolio: rows.filter((r) => r.level === "portfolio").length,
    asset: rows.filter((r) => r.level === "asset").length,
    leases: rows.filter((r) => r.kind === "lease").length,
    review: rows.filter((r) => r.status === "abstracted").length,
  };
}

// by: "portfolio" (the default) | "asset" | "workflow" | "none".
// Portfolio groups: named portfolios A–Z, then documents not yet in one.
export function groupRows(rows, by = "portfolio") {
  if (by === "none") return [{ key: "all", label: "", rows }];
  const keyOf = (r) => (by === "asset" ? (r.dealId ? r.assetName : `${r.portfolio || "No portfolio"} (portfolio)`) : by === "workflow" ? r.workflow || "Other" : r.portfolio);
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const groups = [...map.entries()].map(([k, rs]) => {
    if (by !== "portfolio") return { key: k, label: k, rows: rs };
    if (!k) return { key: "", label: `Not yet in a portfolio · ${rs.length} document${rs.length === 1 ? "" : "s"}`, rows: rs };
    const assets = new Set(rs.filter((r) => r.dealId).map((r) => r.dealId)).size;
    return { key: k, label: `${k} · ${rs[0].portfolioType || "Fund"} · ${assets} asset${assets === 1 ? "" : "s"} with documents · ${rs.length} document${rs.length === 1 ? "" : "s"}`, rows: rs };
  });
  return groups.sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : a.key.localeCompare(b.key)));
}
