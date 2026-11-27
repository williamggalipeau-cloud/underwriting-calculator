// Sample data → Add sample documents (user, 11/25): uploads the fictional
// Model Fund I documents (public/sample-docs, copied from docs/ by
// scripts/sample-deal-docs/copy_public.cjs) into the firm's document store
// with their abstracts already saved, so they show in the Document Library
// ready to apply. Runs only when an owner clicks it; nothing already there is
// uploaded twice (same asset or fund, same file name; a lease for the same
// tenant). The disposition documents are filed on a sale on their asset (an
// active sale, or a new "Sample sale (fictional)" when there's none).
import { factDocTag } from "@/lib/assetFacts";
import { SNDA_TAG } from "@/lib/snda";
import { BASE_PATH } from "@/lib/assetPhotos";
import { createDealDocWithFallback, deleteDealDoc, listDealDocs, saveDealAbstract } from "@/lib/dealDocs";
import { createLease, deleteLease, listLeases, saveAbstract as saveLeaseAbstract } from "@/lib/leaseDocs";
import { uploadDispDoc } from "@/lib/dispositionDocs";
import { leasingTitle, tenantDocTarget, uploadLeasingDoc } from "@/lib/leasingDocs";
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
  // 1.1.9: the sample credit reports. A tenant's report goes on its asset,
  // tagged to the tenant (when the tenant is there); a prospect's screening on
  // the prospect of that name that has a screening (sample prospects' names
  // change with the date, so the reports for names not in the pipeline now
  // aren't needed and aren't listed).
  for (const c of manifest.credit ?? []) {
    // 1.1.13: one filing per target. A tenant's report goes on its asset; a
    // prospect's screening on EVERY prospect of that name that has it (two
    // assets can have a prospect of the same name; before 1.1.13 only the
    // first got its report).
    const targets = [];
    if (c.kind === "tenant") {
      const deal = dealOf(c.asset);
      if (!deal) { out.skip.push({ ...c, kind: "credit", reason: `${c.asset} isn't in the firm` }); continue; }
      if (!(deal.inputs?.units ?? []).some((u) => norm(u.tenantName) === norm(c.tenant))) { out.skip.push({ ...c, kind: "credit", reason: `${c.tenant} isn't a tenant at ${c.asset}` }); continue; }
      targets.push({ deal, target: tenantDocTarget(c.tenant) });
    } else {
      for (const d of deals) {
        for (const p of d.inputs?.leasing?.prospects ?? []) if (norm(p.tenant) === norm(c.tenant) && p.screening?.file === fileName(c.file)) targets.push({ deal: d, target: p.id });
      }
    }
    for (const { deal, target } of targets) {
      const title = leasingTitle({ target, type: c.type, name: fileName(c.file) });
      if (docs.some((d) => d.deal_id === deal.id && norm(d.title) === norm(title))) { out.skip.push({ ...c, kind: "credit", reason: "already uploaded" }); continue; }
      out.add.push({ ...c, kind: "credit", creditKind: c.kind, dealId: deal.id, target, title: `${c.tenant}: ${fileName(c.file)}` });
    }
  }
  // 1.1.17: the documents the building and site facts are read from (three
  // assets) and the signed SNDAs, filed on their asset as "other" with a tag
  // in the title ("[fact:pcr] …", "[snda:001] …").
  for (const m of manifest.assetFacts ?? []) {
    const deal = dealOf(m.asset);
    const name = fileName(m.file);
    if (!deal) { out.skip.push({ ...m, kind: "fact", factKind: m.kind, reason: `${m.asset} isn't in the firm` }); continue; }
    if (m.kind === "snda" && !(deal.inputs?.units ?? []).some((u) => norm(u.tenantName) === norm(m.tenant))) { out.skip.push({ ...m, kind: "fact", factKind: m.kind, reason: `${m.tenant} isn't a tenant at ${m.asset}` }); continue; }
    if (hasDoc(deal.id, null, name)) { out.skip.push({ ...m, kind: "fact", factKind: m.kind, reason: "already uploaded" }); continue; }
    out.add.push({ ...m, kind: "fact", factKind: m.kind, dealId: deal.id, docTitle: `${m.kind === "snda" ? SNDA_TAG(m.unit) : factDocTag(m.kind)} ${name}` });
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
  // 1.1.9: the sample credit reports (Tenant Credit and the prospects).
  for (const c of plan.add.filter((x) => x.kind === "credit")) {
    onProgress(`Credit report: ${c.tenant}`);
    try {
      await uploadLeasingDoc(workspaceId, { dealId: c.dealId, target: c.target, type: c.type, file: await fetchFile(c.file) }, email, createDealDocWithFallback);
      done.push(c);
    } catch (e) { failed.push({ ...c, error: e.message || String(e) }); }
  }
  // 1.1.17: property condition reports, Phase I reports, surveys, roof warranties and SNDAs.
  for (const m of plan.add.filter((x) => x.kind === "fact")) {
    onProgress(`${m.factKind === "snda" ? "SNDA" : "Asset document"}: ${m.title}`);
    try {
      const row = await createDealDocWithFallback(workspaceId, { dealId: m.dealId, fundName: deals.find((d) => d.id === m.dealId)?.inputs?.fundName ?? "", docType: "other", title: m.docTitle, files: [await fetchFile(m.file)] }, email);
      const abs = await fetchJson(m.abstract);
      if (abs && row?.id) await saveDealAbstract(row.id, abs);
      done.push(m);
    } catch (e) { failed.push({ ...m, error: e.message || String(e) }); }
  }
  for (const m of plan.add.filter((x) => x.kind !== "lease" && x.kind !== "credit" && x.kind !== "fact")) {
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

// Load Model Fund I (user, 11/25, 1.1.6): the lease records on the sample
// assets that have no tenant name (early test uploads) are replaced by the
// tenant-named sample leases. Only sample assets' leases with a blank tenant
// are removed; every other lease is kept.
export const blankSampleLeases = (leases = []) => leases.filter((l) => String(l.deal_id ?? "").startsWith("sample-deal-") && !String(l.tenant ?? "").trim());
export async function removeBlankSampleLeases(workspaceId) {
  const gone = blankSampleLeases(await listLeases(workspaceId));
  for (const l of gone) await deleteLease(l);
  return gone.length;
}

// 1.1.13: sample documents rewritten in a release are replaced, not doubled.
// lib/sampleDocChanges.json lists, by sample data version, the file names of
// the fund and asset documents that were rewritten or retired. Rows are
// removed only when they are plainly the earlier sample copy: on a sample
// asset or on Model Fund I, not a sale / leasing / GP agreement filing, with
// that file name, and carrying the sample abstract (or none). A document the
// user uploaded is never touched. Returns the rows to remove (pure).
export function supersededSampleDocs(docs = [], changes = {}, { fromVersion = 0, fundName = "Model Fund I" } = {}) {
  const names = new Set(Object.entries(changes).filter(([v]) => /^\d+$/.test(v) && Number(v) > fromVersion).flatMap(([, list]) => list).map(norm));
  if (!names.size) return [];
  return docs.filter((d) => {
    const onSample = String(d.deal_id ?? "").startsWith("sample-deal-") || (!d.deal_id && norm(d.fund_name) === norm(fundName));
    const filing = /^\[(sale|leasing|gp-agreement)[:\]]/.test(d.title ?? "");
    const sampleAbstract = !d.abstract || d.abstract?.app?.made_with === "Sample (fictional)";
    return onSample && !filing && sampleAbstract && (d.files ?? []).length > 0 && (d.files ?? []).every((f) => names.has(norm(f.name)));
  });
}
const namesSince = (lists = {}, fromVersion = 0) => new Set(Object.entries(lists).filter(([v]) => /^\d+$/.test(v) && Number(v) > fromVersion).flatMap(([, list]) => list).map(norm));
// A sale's documents on a sample asset that were rewritten or retired (the
// earlier BOVs, offer letters, contracts and closing statements): filed on a
// sale, every file an earlier sample file name, and carrying the sample
// abstract (or none).
export function supersededSampleSaleDocs(docs = [], changes = {}, { fromVersion = 0 } = {}) {
  const names = namesSince(changes.sales, fromVersion);
  if (!names.size) return [];
  return docs.filter((d) => String(d.deal_id ?? "").startsWith("sample-deal-") && /^\[sale:/.test(d.title ?? "") && (!d.abstract || d.abstract?.app?.made_with === "Sample (fictional)")
    && (d.files ?? []).length > 0 && (d.files ?? []).every((f) => names.has(norm(f.name))));
}
// The earlier sample leases (tenants that were not on the rent rolls): on a
// sample asset, with every file an earlier sample lease file name. A lease
// with tenant credit documents filed on it is kept (those are the user's).
export function supersededSampleLeases(leases = [], changes = {}, { fromVersion = 0, withCreditDocs = new Set() } = {}) {
  const names = namesSince(changes.leases, fromVersion);
  if (!names.size) return [];
  return leases.filter((l) => String(l.deal_id ?? "").startsWith("sample-deal-") && !withCreditDocs.has(l.id) && (l.files ?? []).length > 0 && (l.files ?? []).every((f) => names.has(norm(f.name))));
}
// Removes them all. Returns { docs, saleDocs, leases } (counts).
export async function removeSupersededSampleDocs(workspaceId, { fromVersion = 0, fundName = "Model Fund I" } = {}) {
  const changes = (await import("@/lib/sampleDocChanges.json")).default;
  const all = await listDealDocs(workspaceId);
  const gone = supersededSampleDocs(all, changes, { fromVersion, fundName });
  const saleDocs = supersededSampleSaleDocs(all, changes, { fromVersion });
  for (const d of [...gone, ...saleDocs]) await deleteDealDoc(d);
  const leases = await listLeases(workspaceId);
  const candidates = supersededSampleLeases(leases, changes, { fromVersion });
  let withCreditDocs = new Set();
  if (candidates.length) {
    const { listCreditDocs } = await import("@/lib/creditDocs");
    // If the tenant credit documents can't be read, no lease is removed.
    try { withCreditDocs = new Set((await listCreditDocs(workspaceId)).map((d) => d.lease_id)); } catch { withCreditDocs = new Set(candidates.map((l) => l.id)); }
  }
  const oldLeases = candidates.filter((l) => !withCreditDocs.has(l.id));
  for (const l of oldLeases) await deleteLease(l);
  return { docs: gone.length, saleDocs: saleDocs.length, leases: oldLeases.length, total: gone.length + saleDocs.length + oldLeases.length };
}

// Sample data → Add sample GP partners (1.1.10, user 11/26): the two fictional
// outside GP partners of Model Fund I and their agreements, uploaded to the
// fund's documents with the abstract Claude would read from each, so Finance
// → GP Partners shows them "read by Claude, to check". The partners are added
// to the list (once); nothing is applied to the fund until the user checks
// and saves each agreement's terms. Not part of Load Model Fund I (the test
// fund keeps all of the GP capital and promote).
export async function addSampleGpPartners({ workspaceId, email, gp, onProgress = () => {} }) {
  const { addPartner, gpPartnersOf } = await import("@/lib/gpPartners");
  const manifest = await (await fetch(`${BASE_PATH}/sample-docs/manifest.json`)).json();
  let next = gpPartnersOf(gp);
  const docs = await listDealDocs(workspaceId);
  const done = [], skipped = [], failed = [];
  for (const a of manifest.gpAgreements ?? []) {
    let partner = next.partners.find((p) => norm(p.name) === norm(a.partner));
    if (!partner) { const r = addPartner(next, a.partner, { by: email ?? "" }); next = r.gp; partner = r.partner; }
    const name = fileName(a.file);
    if (docs.some((d) => /^\[gp-agreement:/.test(d.title ?? "") && (d.files ?? []).some((f) => norm(f.name) === norm(name)))) { skipped.push(a); continue; }
    onProgress(`GP agreement: ${a.partner}`);
    try {
      const row = await createDealDocWithFallback(workspaceId, { dealId: null, fundName: a.portfolio, docType: "other", title: `[gp-agreement:${partner.id}] ${name}`, files: [await fetchFile(a.file)] }, email);
      const abs = await fetchJson(a.abstract);
      if (abs && row?.id) await saveDealAbstract(row.id, abs);
      done.push(a);
    } catch (e) { failed.push({ ...a, error: e.message || String(e) }); }
  }
  return { gp: next, done, skipped, failed };
}
