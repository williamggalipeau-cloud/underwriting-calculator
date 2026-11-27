// 1.1.23: the sample documents for the document types that had none
// (scripts/sample-deal-docs/more_docs.cjs), the fixed sample prospect and the
// extra research items. Every figure a document shares with the app must be
// the app's (AGENTS.md: everything ties out), and the load must file each
// document where its tab looks for it.
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { underwrite } = j(R + "/lib/calculations.js");
const SD = j(R + "/lib/sampleDocs.js");
const AD = j(R + "/lib/acquisitionDocs.js");
const DD = j(R + "/lib/dispositionDocs.js");
const LD = j(R + "/lib/leasingDocs.js");
const PD = j(R + "/lib/pmDocs.js");
const RS = j(R + "/lib/research.js");
const SR = j(R + "/lib/sampleResearch.js");
const SL = j(R + "/lib/sampleLeasing.js");
const LS = j(R + "/lib/leasing.js");
const { billingCheck } = j(R + "/lib/dealDocApply.js");
const manifest = require(R + "/public/sample-docs/manifest.json");
const leases = require(R + "/docs/sample-leases/index.json");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const T = "2026-11-27";
const f = buildSampleFund({ todayISO: T });
const A = f.deals[0].inputs, H = f.deals[2].inputs, M = f.deals[5].inputs;
const dir = R + "/docs/sample-deal-docs/more";
const index = require(dir + "/index.json");
const abs = (name) => JSON.parse(fs.readFileSync(`${dir}/abstracts/${name}.json`, "utf8"));
const val = (name, key) => abs(name).fields.find((x) => x.key === key)?.value;

// ── The generated set is current, complete and marked fictional ──
try { execFileSync("node", [R + "/scripts/sample-deal-docs/more_docs.cjs", "--check"], { stdio: "pipe" }); check(true, ""); } catch (e) { check(false, `the documents are stale: ${String(e.stderr || e.message).trim()}`); }
check(index.length === 23, `23 documents (${index.length})`);
for (const d of index) {
  const html = fs.readFileSync(`${dir}/html/${d.name}.html`, "utf8"), a = abs(d.name);
  const missing = a.fields.filter((x) => !x.evidence.every((e) => html.includes(e.quote))).map((x) => x.key);
  check(fs.existsSync(`${dir}/${d.file}`) && /SAMPLE – FICTIONAL/.test(html) && missing.length === 0 && a.app.made_with === "Sample (fictional)", `${d.name}: a PDF, marked fictional, every abstract value quoted from it${missing.length ? ` (${missing})` : ""}`);
  const pub = [...manifest.deals, ...manifest.dispositions, ...manifest.propertyMgmt, ...manifest.acquisition, ...manifest.leasing].find((m) => m.name === d.name);
  check(pub && fs.readFileSync(`${R}/public/sample-docs/${pub.file}`).equals(fs.readFileSync(`${dir}/${d.file}`)) && fs.readFileSync(`${R}/public/sample-docs/${pub.abstract}`).equals(fs.readFileSync(`${dir}/abstracts/${d.name}.json`)), `${d.name}: the copy the app uploads is this document (copy_public.cjs)`);
}

// ── The fixed prospect ──
const p = SL.sampleDocProspect(A, "sample-deal-1"), unit = A.units.find((u) => u.id === p.unitId);
check(p.id === SL.SAMPLE_DOC_PROSPECT_ID && unit && unit.leaseStatus !== "occupied" && p.sf === unit.squareFeet && p.askingRentPSF === unit.currentRentPSF, "the fixed prospect is on Airport Flex's vacant unit, at its size and asking rent");
const p2 = SL.sampleDocProspect(buildSampleFund({ todayISO: "2027-03-15" }).deals[0].inputs, "sample-deal-1");
check(JSON.stringify({ ...p, unitId: 0 }) === JSON.stringify({ ...p2, unitId: 0 }), "it is the same whatever day the fund is built");
check(A.leasing.prospects.filter((x) => x.id === p.id).length === 1 && SL.withSampleDocProspect(A, "sample-deal-1") === A && SL.withSampleDocProspect(H, "sample-deal-3") === H, "the fund has it once; nothing is added twice or to another asset");
const noP = { ...A, leasing: { ...A.leasing, prospects: A.leasing.prospects.filter((x) => x.id !== p.id) } }, withP = SL.withSampleDocProspect(noP, "sample-deal-1");
check(withP.leasing.prospects.length === noP.leasing.prospects.length + 1 && JSON.stringify({ ...withP, leasing: 0 }) === JSON.stringify({ ...noP, leasing: 0 }) && withP.leasing.comps === noP.leasing.comps, "the load step adds only the prospect");

// ── Leasing documents tie to the prospect and the rent comps ──
for (const n of ["airport-flex-leasing-proposal", "airport-flex-leasing-loi", "airport-flex-lease-draft", "airport-flex-lease-approval-memo"]) {
  check(val(n, "tenant") === p.tenant && val(n, "rent_psf") === p.proposedRentPSF && val(n, "term_months") === p.termMonths && val(n, "free_months") === p.freeMonths && val(n, "ti_psf") === p.tiPSF && val(n, "escalation_pct") === p.escalationPct, `${n}: tenant, rent, term, free rent, allowance and increase are the prospect's`);
}
check(val("airport-flex-leasing-proposal", "asking_rent_psf") === p.askingRentPSF && val("airport-flex-leasing-loi", "broker") === p.broker && val("airport-flex-leasing-broker-report", "next_step") === p.nextStep, "the asking rent, broker and next step are the prospect's");
check(Math.abs(val("airport-flex-lease-approval-memo", "net_effective_psf") - LS.netEffective(p)) < 0.005 && val("airport-flex-lease-approval-memo", "requested_by") === A.leasingManager, "the approval memo's net effective rent is the app's, requested by the asset's leasing manager");
const rs = LS.rentCompStats(A.leasing.comps), cr = index.find((d) => d.name === "airport-flex-rent-comp-report");
check(val(cr.name, "count") === rs.count && val(cr.name, "average_psf") === rs.avg && JSON.stringify(cr.link.compIds) === JSON.stringify(A.leasing.comps.map((c) => c.id)) && JSON.stringify(cr.link.compRents) === JSON.stringify(A.leasing.comps.map((c) => c.rentPSF)), "the rent comp report's count, average and comps are the asset's rent comps");
const later = buildSampleFund({ todayISO: "2027-03-15" }).deals[0].inputs.leasing.comps;
check(JSON.stringify(later.map((c) => [c.id, c.rentPSF, c.address, c.tenant, c.sf])) === JSON.stringify(A.leasing.comps.map((c) => [c.id, c.rentPSF, c.address, c.tenant, c.sf])), "the comps the report lists do not change with the day (only their signing dates do, which the report leaves out)");

// ── Acquisition documents ──
const rA = underwrite(A), loan = Math.round(rA.debt.loanAmount), noi = Math.round(rA.annualCashFlows[0].noi);
check(val("airport-flex-loan-term-sheet", "lender") === A.lenderName && val("airport-flex-loan-term-sheet", "amount") === loan && val("airport-flex-loan-term-sheet", "term_years") === A.loanTermYears && val("airport-flex-loan-term-sheet", "dscr_min") === A.loanCovenants.dscrMin, "the loan term sheet is the asset's loan");
check(val("airport-flex-ic-presentation", "price") === A.purchasePrice && val("airport-flex-ic-presentation", "loan") === loan && val("airport-flex-ic-presentation", "noi1") === noi && val("airport-flex-ic-presentation", "irr") === `${rA.returns.irr.toFixed(1)}%`, "the IC presentation is the model's price, loan, NOI and return");
check(val("airport-flex-ic-presentation", "noi1") === A.icApproved.noi1, "and its NOI is the IC memo's");
check(val("airport-flex-broker-model", "in_place_noi") === A.noiYear1 && val("airport-flex-broker-model", "buyer_noi") === noi && val("airport-flex-lender-appraisal", "as_is_value") === A.purchasePrice && val("airport-flex-deed-title", "policy_amount") === A.purchasePrice && val("airport-flex-deed-title", "policy_date") === A.acquisitionDate, "the broker's NOI, the lender's value and the title policy are the asset's");
check(val("airport-flex-zoning-report", "zoning") === A.site.zoning && val("airport-flex-site-plan", "footprint_sf") === A.building.footprintSF && val("airport-flex-site-plan", "clear_height") === A.building.clearHeightFt && val("airport-flex-current-leases", "leases") === A.units.filter((u) => u.leaseStatus === "occupied").length, "the zoning, site plan and lease schedule are the asset's facts and rent roll");

// ── Sale documents (Harbor Light) ──
const sale = H.dispositions.find((x) => x.startedFrom === "Sample sale (fictional)");
check(val("harbor-light-listing-agreement", "list_price") === sale.targetPrice && val("harbor-light-listing-agreement", "broker") === sale.bovs[0].broker && val("harbor-light-listing-agreement", "fee_pct") === sale.bovs[0].feePct && val("harbor-light-offering-memo", "list_price") === sale.targetPrice && val("harbor-light-offering-memo", "noi") === Math.round(underwrite(H).annualCashFlows[0].noi), "the listing agreement and offering memo are the sale's list price, broker and fee, and the model's NOI");
const lh = leases.find((l) => l.asset === H.propertyName), row = lh.fund.schedule.find((r) => r.start <= "2026-11-16" && "2026-11-16" <= r.end);
check(val("harbor-light-sale-estoppel", "tenant") === lh.tenant && val("harbor-light-sale-estoppel", "monthly_rent") === `$${row.monthly.toLocaleString("en-US", { minimumFractionDigits: 2 })}` && abs("harbor-light-sale-estoppel").doc_type === "estoppel" && abs("harbor-light-sale-estoppel").app.lease_tenant === lh.tenant, "the sale estoppel states the sample lease's tenant and current rent");

// ── Billing: the lease's rent, so the app's check finds no difference ──
{
  const la = leases.find((l) => l.asset === A.propertyName), a = abs("airport-flex-billing-2026-12");
  const leaseAbs = JSON.parse(fs.readFileSync(`${R}/docs/sample-leases/abstracts/${la.files[0].replace(/\.pdf$/, "")}.json`, "utf8"));
  const rows = billingCheck({ deal_id: "sample-deal-1", abstract: a }, [{ id: "l1", deal_id: "sample-deal-1", tenant: la.tenant, abstract: leaseAbs }]);
  check(a.doc_type === "billing" && rows.length === 2 && rows.every((r) => !r.noLease && Math.abs(r.diff) < 0.01), `the billing's base rent is the lease's scheduled rent for each month (${rows.map((r) => r.diff)})`);
}

// ── Property Management documents ──
const pmA = A.propertyMgmt;
check(val("airport-flex-assessment-notice", "assessed_value") === pmA.parcels[0].assessedValue && val("airport-flex-assessment-notice", "parcel") === pmA.parcels[0].apn && val("airport-flex-roof-repair-proposal", "cost") === pmA.items.find((x) => x.system === "Roof").cost, "the assessment notice and the roof proposal are the asset's parcel and finding");
check(val("mill-creek-tax-appeal", "hearing_date") === M.propertyMgmt.appeals[0].hearingDate && val("mill-creek-tax-appeal", "consultant") === M.propertyMgmt.appeals[0].consultant && val("harbor-light-claim-closing", "amount") === H.propertyMgmt.claims[0].amount && val("harbor-light-claim-closing", "recovery") === H.propertyMgmt.claims[0].recovery, "the tax appeal and the claim letter are the fund's one appeal and one claim");

// ── Research items of the remaining types ──
const ex1 = SR.sampleResearchExtra(A, "sample-deal-1", { valuations: f.valuations }), ex3 = SR.sampleResearchExtra(H, "sample-deal-3", { valuations: f.valuations });
check(ex1.map((r) => r.type).join() === "appraisal,environmental,pca,credit,zoning" && ex3.map((r) => r.type).join() === "bov", `Airport Flex gets five items and Harbor Light the broker opinion (${ex1.map((r) => r.type)}; ${ex3.map((r) => r.type)})`);
const mark = f.valuations["sample-deal-1"]["2026-09-30"];
check(ex1[0].keyFigures.includes(`$${mark.value.toLocaleString("en-US")}`) && ex1[4].keyFigures.includes(A.site.zoning) && ex3[0].keyFigures.includes(`$${sale.bovs[0].price.toLocaleString("en-US")}`), "the appraisal item states the mark, the zoning item the site fact, the broker opinion the sale's");
check(f.deals.every((d) => SR.withSampleResearchExtra(d.inputs, d.id, { valuations: f.valuations }) === d.inputs) && [3, 4, 5, 6, 7, 8].every((i) => SR.sampleResearchExtra(f.deals[i].inputs, f.deals[i].id, { valuations: f.valuations }).length === 0), "nothing is added twice, and nothing on the other assets");
const types = new Set(f.deals.flatMap((d) => d.inputs.research.map((r) => r.type)));
check(RS.RESEARCH_TYPES.map(([k]) => k).filter((k) => k !== "other").every((k) => types.has(k)), `every research type has an item in the fund (${[...types]})`);

// ── The load files each document where its tab looks for it ──
const plan = SD.sampleDocPlan(manifest, { deals: f.deals, docs: [], leases: [] });
const acq = plan.add.filter((x) => x.kind === "acq"), lsg = plan.add.filter((x) => x.kind === "leasingdoc"), res = plan.add.filter((x) => x.kind === "research" && !x.file.startsWith("research/"));
check(acq.length === 9 && acq.every((x) => AD.parseAcqTitle(x.docTitle)?.type === x.type), "nine acquisition documents, each titled so Acquisition Documents shows its type");
check(lsg.length === 6 && lsg.filter((x) => LD.parseLeasingTitle(x.docTitle)?.target === p.id).length === 5 && lsg.some((x) => LD.parseLeasingTitle(x.docTitle)?.target === "comps" && x.type === "comps") && lsg.every((x) => LD.parseLeasingTitle(x.docTitle)?.type === x.type), "six leasing documents: five on the prospect, the rent comp report on the comps");
check(res.length === 7 && res.every((x) => { const t = RS.parseResearchTitle(x.docTitle), d = f.deals.find((q) => q.id === x.dealId); return t && d.inputs.research.some((r) => r.id === t.researchId); }), `seven research files (two new reports and five copies), each on its research item (${res.length})`);
const pm = plan.add.filter((x) => x.kind === "pm" && x.file.startsWith("more/")), disp = plan.add.filter((x) => x.kind === "disposition" && x.file.startsWith("more/")), bill = plan.add.filter((x) => x.kind === "deal" && x.docType === "billing");
check(pm.length === 4 && pm.every((x) => PD.parsePmTitle(x.docTitle)?.section === x.section) && disp.length === 3 && disp.every((x) => x.dealId === "sample-deal-3" && DD.DISP_DOC_TYPES.some(([k]) => k === x.docType)) && bill.length === 1 && bill[0].dealId === "sample-deal-1" && bill[0].leaseTenant, "four Property Management documents, three sale documents on Harbor Light and the billing on Airport Flex with its lease's tenant");
// Stored as the load stores them, the lists show them and a second run adds nothing.
const stored = [...acq, ...lsg, ...res, ...pm].map((x, i) => ({ id: `d${i}`, deal_id: x.dealId, doc_type: "other", title: x.docTitle, files: [{ name: x.file.split("/").pop() }] }));
const again = SD.sampleDocPlan(manifest, { deals: f.deals, docs: stored, leases: [] });
check(again.add.filter((x) => ["acq", "leasingdoc"].includes(x.kind)).length === 0 && again.add.filter((x) => x.kind === "research" && !x.file.startsWith("research/")).length === 0 && again.add.filter((x) => x.kind === "pm" && x.file.startsWith("more/")).length === 0, "run again, nothing is uploaded twice");
check(AD.acquisitionDocs(stored, f.deals).length === 9 && LD.leasingDocs(stored).length === 6, "Acquisition Documents lists the nine and Active Leasing the six");
// Without the prospect, or with other comps, the documents written for them are not filed.
const other = f.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, leasing: { ...d.inputs.leasing, prospects: [], comps: d.inputs.leasing.comps.map((c, i) => (i ? c : { ...c, rentPSF: c.rentPSF + 1 })) } } } : d));
const op = SD.sampleDocPlan(manifest, { deals: other, docs: [], leases: [] });
check(op.add.filter((x) => x.kind === "leasingdoc").length === 0 && op.skip.filter((x) => x.kind === "leasingdoc").length === 6 && !op.add.some((x) => x.kind === "research" && x.researchId === "srs-1-rent"), "an asset without the prospect, or with other rent comps, gets none of the documents written for them");

// ── The acquisition checklist counts documents filed on other tabs ──
{
  const docs = [["[fact:pcr] a.pdf", "pca"], ["[fact:phase1] b.pdf", "phase1_esa"], ["[fact:survey] c.pdf", "title_survey"], ["[snda:001] d.pdf", "snda"], ["[fact:roof_warranty] e.pdf", null], ["[research:srs-1-pca] f.pdf", null]].map(([title], i) => ({ id: `x${i}`, deal_id: "sample-deal-1", doc_type: "other", title, files: [{ name: "x.pdf" }] }));
  const rows = AD.acquisitionDocs(docs, f.deals);
  check(rows.map((r) => r.type).sort().join() === "pca,phase1_esa,snda,title_survey" && rows.every((r) => r.readOnly), `a property condition report, Phase I, survey and SNDA filed elsewhere show on the checklist, read-only; a roof warranty and a research copy do not (${rows.map((r) => r.type)})`);
  const up = AD.acquisitionDocs([{ id: "u", deal_id: "sample-deal-1", doc_type: "other", title: AD.acqTitle("pca", "g.pdf"), files: [{ name: "g.pdf" }] }], f.deals);
  check(up.length === 1 && up[0].type === "pca" && !up[0].readOnly, "one uploaded on Acquisition Documents is still its own row");
}

console.log(`docs1123: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
