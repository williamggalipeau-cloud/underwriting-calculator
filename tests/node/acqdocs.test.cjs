// Acquisition Documents (lib/acquisitionDocs.js, 11/24): the agreed types by
// stage, which documents show, the "[acq]" title before the SQL, and the
// upload fallback. Fictional rows.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const A = j(R + "/lib/acquisitionDocs.js");
const fs = require("fs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

ok(A.ACQ_STAGES.map(([s]) => s).join() === "screening,contract,approval,financing,closing", "five stages");
const keys = A.ACQ_TYPES.map((t) => t.key);
ok(["om", "rent_roll", "t12", "current_leases", "listing_agreement", "broker_model", "site_plan"].every((k) => A.acqType(k)?.stage === "screening"), "screening: OM, rent roll, T-12, current leases, broker listing agreement, broker model, site plans");
ok(["loi", "psa", "title_survey", "phase1_esa", "pca", "zoning", "lender_appraisal", "estoppel", "snda"].every((k) => A.acqType(k)?.stage === "contract"), "under contract: LOI, PSA, title / survey, Phase I, PCA, zoning, lender appraisal, estoppel, SNDA");
ok(A.acqType("loan").how === "readonly" && A.acqType("rate_cap").how === "readonly" && A.acqType("insurance_cert").how === "readonly" && !A.ACQ_UPLOAD_TYPES.some((t) => ["loan", "rate_cap", "insurance_cert"].includes(t.key)), "loan, rate cap and insurance: read-only here");
const sql = fs.readFileSync(R + "/supabase/acquisition_doc_types.sql", "utf8");
ok(keys.every((k) => sql.includes(`'${k}'`)) && ["bov", "offer_letter", "distribution_notice", "cam", "billing", "lpa"].every((k) => sql.includes(`'${k}'`)), "the SQL allows every acquisition type and keeps the earlier ones");

ok(A.acqTitle("phase1_esa", "ESA.pdf") === "[acq] Phase I environmental report: ESA.pdf" && A.parseAcqTitle("[acq] Phase I environmental report: ESA.pdf").type === "phase1_esa", "title before the SQL, and read back");
const deals = [{ id: "d1", inputs: { propertyName: "Example Owned", fundName: "Fund A", acquisitionDate: "2025-01-01" } }, { id: "d2", inputs: { propertyName: "Example Screener" } }];
const docs = [
  { id: "1", deal_id: "d2", doc_type: "om", title: "OM.pdf", files: [{ name: "OM.pdf" }] },
  { id: "2", deal_id: "d2", doc_type: "other", title: "[acq] Phase I environmental report: ESA.pdf", files: [{ name: "ESA.pdf" }] },
  { id: "3", deal_id: "d1", doc_type: "loan", title: "Loan.pdf", files: [{ name: "Loan.pdf" }] },
  { id: "4", deal_id: "d1", doc_type: "psa", title: "[sale:s1] PSA / amendment: Sale PSA.pdf", files: [] },
  { id: "5", deal_id: "d1", doc_type: "cam", title: "CAM.pdf", files: [] },
  { id: "6", deal_id: "zz", doc_type: "om", title: "Other firm.pdf", files: [] },
  { id: "7", deal_id: "d1", doc_type: "listing_agreement", title: "[acq] Broker listing agreement: Listing.pdf", files: [{ name: "Listing.pdf" }] },
];
const rows = A.acquisitionDocs(docs, deals, [], "2026-11-24");
ok(rows.map((r) => r.id).sort().join() === "1,2,3,7", `shown: ${rows.map((r) => r.id).join(", ")} (not sale, CAM or unknown deals)`);
const esa = rows.find((r) => r.id === "2");
ok(esa.type === "phase1_esa" && esa.name === "ESA.pdf" && esa.groupLabel === "Under LOI or contract" && esa.status === "Underwriter", "an [acq] document filed as Other reads as its real type");
ok(rows.find((r) => r.id === "3").readOnly && rows.find((r) => r.id === "1").status === "Underwriter" && rows.find((r) => r.id === "3").status === "Owned", "read-only loan; deal status");
const pl = A.acquisitionDocs([{ id: "9", deal_id: null, doc_type: "om", title: "Pipeline OM.pdf", files: [] }], deals, [{ name: "Example Pipeline Deal", omDocId: "9", targetFund: "Fund A" }]);
ok(pl.length === 1 && pl[0].deal === "Example Pipeline Deal" && pl[0].status === "Pipeline", "a pipeline deal's OM");

(async () => {
  const calls = [];
  const reject = async (ws, o) => { calls.push(o.docType); if (o.docType !== "other") throw new Error('violates check constraint "deal_documents_doc_type_check"'); return { id: "x", ...o }; };
  const r1 = await A.uploadAcqDoc("w", { dealId: "d2", type: "pca", file: { name: "PCA.pdf" } }, "a@example.com", reject);
  ok(calls.join() === "pca,other" && r1.title === "[acq] Property condition report: PCA.pdf", "before the SQL: a new type falls back to Other with the type in the title");
  calls.length = 0;
  let threw = false;
  try { await A.uploadAcqDoc("w", { dealId: "d2", type: "om", file: { name: "OM.pdf" } }, "", reject); } catch { threw = true; }
  ok(threw && calls.join() === "om", "an existing type's error is not hidden");
  console.log(fail ? `${fail} FAILED` : "ALL PASS");
  process.exitCode = fail ? 1 : 0;
})();
