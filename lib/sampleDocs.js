// Sample data → Add sample documents (user, 11/25): uploads the fictional
// Model Fund I documents (public/sample-docs, copied from docs/ by
// scripts/sample-deal-docs/copy_public.cjs) into the firm's document store
// with their abstracts already saved, so they show in the Document Library
// ready to apply. Runs only when an owner clicks it; nothing already there is
// uploaded twice (same asset or fund, same file name; a lease for the same
// tenant). The disposition documents are filed on a sale on their asset (an
// active sale, or a new "Sample sale (fictional)" when there's none).
import { BASE_PATH } from "@/lib/assetPhotos";
import { createDealDocWithFallback, listDealDocs, saveDealAbstract } from "@/lib/dealDocs";
import { createLease, listLeases, saveAbstract as saveLeaseAbstract } from "@/lib/leaseDocs";
import { uploadDispDoc } from "@/lib/dispositionDocs";
import { makeSale } from "@/lib/dispositions";

const norm = (s) => String(s ?? "").trim().toLowerCase();
const fileName = (p) => String(p).split("/").pop();
const ACTIVE = ["preparing", "marketing", "offers", "contract"];

// What would be added, and what is skipped (pure; for the confirmation and tests).
// manifest: public/sample-docs/manifest.json; deals: the firm's deals;
// docs / leases: what the store holds now.
export function sampleDocPlan(manifest, { deals = [], docs = [], leases = [] } = {}) {
  const dealOf = (asset) => deals.find((d) => norm(d.inputs?.propertyName) === norm(asset)) ?? null;
  const hasDoc = (dealId, fund, name) => docs.some((d) => (dealId ? d.deal_id === dealId : !d.deal_id && norm(d.fund_name) === norm(fund)) && (d.files ?? []).some((f) => norm(f.name) === norm(name)));
  const out = { add: [], skip: [] };
  for (const [set, kind] of [["deals", "deal"], ["dispositions", "disposition"]]) {
    for (const m of manifest[set] ?? []) {
      const deal = m.asset ? dealOf(m.asset) : null;
      const name = fileName(m.file);
      if (m.asset && !deal) { out.skip.push({ ...m, kind, reason: `${m.asset} isn't in the firm` }); continue; }
      if (hasDoc(deal?.id, m.fund, name)) { out.skip.push({ ...m, kind, reason: "already uploaded" }); continue; }
      out.add.push({ ...m, kind, dealId: deal?.id ?? null });
    }
  }
  for (const l of manifest.leases ?? []) {
    const deal = dealOf(l.asset);
    if (!deal) { out.skip.push({ ...l, kind: "lease", reason: `${l.asset} isn't in the firm` }); continue; }
    const names = l.files.map(fileName).map(norm);
    if (leases.some((x) => x.deal_id === deal.id && (norm(x.tenant) === norm(l.tenant) || (x.files ?? []).some((f) => names.includes(norm(f.name)))))) { out.skip.push({ ...l, kind: "lease", reason: "already uploaded" }); continue; }
    out.add.push({ ...l, kind: "lease", dealId: deal.id });
  }
  return out;
}

const fetchFile = async (rel) => {
  const r = await fetch(`${BASE_PATH}/sample-docs/${rel}`);
  if (!r.ok) throw new Error(`Couldn't load ${rel} (${r.status}).`);
  const blob = await r.blob();
  return new File([blob], fileName(rel), { type: "application/pdf" });
};
const fetchJson = async (rel) => (rel ? (await fetch(`${BASE_PATH}/sample-docs/${rel}`)).json() : null);

// Uploads everything in the plan. onSale(dealId, sale) adds a sale to an
// asset (the page's onUpdate); onProgress(text) reports each step.
export async function addSampleDocuments({ workspaceId, email, deals, onSale, onProgress = () => {} }) {
  const manifest = await (await fetch(`${BASE_PATH}/sample-docs/manifest.json`)).json();
  const [docs, leases] = await Promise.all([listDealDocs(workspaceId), listLeases(workspaceId)]);
  const plan = sampleDocPlan(manifest, { deals, docs, leases });
  const done = [], failed = [];
  const leaseIds = new Map(leases.map((l) => [`${l.deal_id}|${norm(l.tenant)}`, l.id]));
  // Leases first, so insurance certificates and estoppels can name theirs.
  for (const l of plan.add.filter((x) => x.kind === "lease")) {
    onProgress(`Lease: ${l.tenant} (${l.asset})`);
    try {
      const files = [];
      // The base lease first, then its amendments (file names end "-amendment").
      for (const f of l.files) files.push({ file: await fetchFile(f), kind: /amendment/i.test(f) ? "amendment" : "lease" });
      const row = await createLease(workspaceId, { dealId: l.dealId, tenant: l.tenant, title: `${l.tenant} lease (sample)`, files }, email);
      const abs = await fetchJson(l.abstract);
      if (abs && row?.id) await saveLeaseAbstract(row.id, abs);
      if (row?.id) leaseIds.set(`${l.dealId}|${norm(l.tenant)}`, row.id);
      done.push(l);
    } catch (e) { failed.push({ ...l, error: e.message || String(e) }); }
  }
  // A sale on each asset that has disposition documents.
  const saleFor = new Map();
  for (const dealId of [...new Set(plan.add.filter((x) => x.kind === "disposition").map((x) => x.dealId))]) {
    const inp = deals.find((d) => d.id === dealId)?.inputs ?? {};
    const active = (inp.dispositions ?? []).find((s) => ACTIVE.includes(s.stage));
    if (active) { saleFor.set(dealId, active.id); continue; }
    const sale = { ...makeSale({ reason: "plan_complete" }), stage: "marketing", startedFrom: "Sample sale (fictional)" };
    onSale(dealId, sale);
    saleFor.set(dealId, sale.id);
  }
  for (const m of plan.add.filter((x) => x.kind !== "lease")) {
    onProgress(`${m.kind === "disposition" ? "Sale document" : "Document"}: ${m.title}`);
    try {
      const file = await fetchFile(m.file);
      const leaseId = m.leaseTenant ? leaseIds.get(`${m.dealId}|${norm(m.leaseTenant)}`) ?? null : null;
      const row = m.kind === "disposition"
        ? await uploadDispDoc(workspaceId, { dealId: m.dealId, saleId: saleFor.get(m.dealId), type: m.docType, file }, email)
        : await createDealDocWithFallback(workspaceId, { dealId: m.dealId, fundName: m.fund ?? deals.find((d) => d.id === m.dealId)?.inputs?.fundName ?? "", docType: m.docType, title: m.title, leaseId, files: [file] }, email);
      const abs = await fetchJson(m.abstract);
      if (abs && row?.id) await saveDealAbstract(row.id, abs);
      done.push(m);
    } catch (e) { failed.push({ ...m, error: e.message || String(e) }); }
  }
  return { done, failed, skipped: plan.skip };
}
