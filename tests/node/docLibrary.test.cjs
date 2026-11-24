// Document Library (lib/docLibrary.js, user 11/24): firm-wide rows from
// deal_documents and lease_documents, what each is attached to (portfolio or
// asset), its workflow tab, filters, counts and grouping by portfolio.
// Fictional rows.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const L = j(R + "/lib/docLibrary.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const deals = [
  { id: "d1", inputs: { propertyName: "Example Flex", fundName: "Fund A" } },
  { id: "d2", inputs: { propertyName: "Example Dock", fundName: "JV B" } },
  { id: "d3", inputs: { propertyName: "Example Pipeline" } },
];
const funds = { "Fund A": { type: "Fund" }, "JV B": { type: "Joint Venture" } };
const docs = [
  { id: "1", deal_id: null, fund_name: "Fund A", doc_type: "lpa", title: "LPA", status: "applied", created_at: "2026-01-01T00:00:00Z", files: [{ name: "lpa.pdf" }] },
  { id: "2", deal_id: null, fund_name: "JV B", doc_type: "other", title: "[jva] JVA", created_at: "2026-02-01T00:00:00Z", files: [{ name: "jva.pdf" }] },
  { id: "3", deal_id: "d1", doc_type: "loan", title: "Loan", status: "abstracted", created_at: "2026-03-01T00:00:00Z", files: [{ name: "loan.pdf" }] },
  { id: "4", deal_id: "d1", doc_type: "other", title: "[pm:policies] Example policy.pdf", created_at: "2026-03-02T00:00:00Z", files: [] },
  { id: "5", deal_id: "d1", doc_type: "other", title: "[sale:s1] BOV: Example BOV.pdf", created_at: "2026-03-03T00:00:00Z", files: [] },
  { id: "6", deal_id: "d1", doc_type: "other", title: "[leasing:lp-1] Proposal: Example.pdf", created_at: "2026-03-04T00:00:00Z", files: [] },
  { id: "7", deal_id: "d3", doc_type: "other", title: "[acq] Phase I environmental report: ESA.pdf", created_at: "2026-03-05T00:00:00Z", files: [] },
  { id: "8", deal_id: "d2", doc_type: "appraisal", title: "Q3 appraisal", status: "abstracted", created_at: "2026-03-06T00:00:00Z", files: [] },
  { id: "9", deal_id: null, fund_name: "Fund A", doc_type: "other", title: "Org chart: chart.pdf", created_at: "2026-03-07T00:00:00Z", files: [] },
  { id: "10", deal_id: "d1", doc_type: "other", title: "[research:r1] Market report.pdf", created_at: "2026-03-08T00:00:00Z", files: [] },
];
const leases = [{ id: "l1", deal_id: "d2", tenant: "Example Tenant", status: "applied", created_at: "2026-03-09T00:00:00Z", files: [{ name: "lease.pdf" }] }];
const { withStoredType } = j(R + "/lib/dealDocs.js");
const rows = L.libraryRows({ docs: docs.map(withStoredType), leases, deals, funds });
const by = (id) => rows.find((r) => r.id === id);

ok(rows.length === 11, "every document and lease is a row");
ok(rows[0].id === "l1" && rows.at(-1).id === "1", "newest first");
ok(by("1").level === "portfolio" && by("1").portfolio === "Fund A" && by("1").tab === "fundsummary", "an LPA attaches to its portfolio, used on Portfolio Summary");
ok(by("2").typeId === "jva" && by("2").level === "portfolio" && by("2").portfolioType === "Joint Venture", "a JVA stored as [jva] before the SQL reads as a JVA on the JV");
ok(by("3").level === "asset" && by("3").assetName === "Example Flex" && by("3").portfolio === "Fund A" && by("3").tab === "debt", "a loan agreement attaches to its asset, used on Debt");
ok(by("4").tab === "insurance" && by("4").typeLabel === "Insurance policy" && by("4").name === "Example policy.pdf", "a Property Management policy file goes to Insurance");
ok(by("5").tab === "dispdocs" && by("5").typeLabel === "BOV", "a sale document goes to Disposition Documents");
ok(by("6").tab === "leasing" && by("6").typeLabel === "Proposal", "a leasing proposal goes to Active Leasing");
ok(by("7").tab === "acqdocs" && by("7").typeId === "phase1_esa" && by("7").portfolio === "", "an acquisition document on a pipeline deal: Acquisition Documents, not yet in a portfolio");
ok(by("9").typeLabel === "Org chart" && by("9").tab === "fundsummary" && by("9").level === "portfolio", "Portfolio Summary legal documents are portfolio-level");
ok(by("10").tab === "research" && by("10").typeLabel === "Third-party research", "third-party research goes to Comps");
ok(by("l1").typeLabel === "Lease" && by("l1").tab === "leases" && by("l1").portfolio === "JV B" && by("l1").name === "Lease – Example Tenant", "a lease is an asset-level row on Leases");

ok(L.filterRows(rows, { portfolio: "Fund A" }).length === 7, "filter by portfolio");
ok(L.filterRows(rows, { asset: "d1" }).every((r) => r.dealId === "d1") && L.filterRows(rows, { asset: "d1" }).length === 5, "filter by asset");
ok(L.filterRows(rows, { level: "portfolio" }).length === 3, "portfolio-level only");
ok(L.filterRows(rows, { tab: "debt" }).length === 1 && L.filterRows(rows, { type: "Lease" }).length === 1, "filter by workflow and type");
ok(L.filterRows(rows, { q: "example tenant" }).length === 1 && L.filterRows(rows, { q: "loan.pdf" }).length === 1, "search names and files");
ok(L.filterRows(rows, { status: "abstracted" }).length === 2, "awaiting review");
const c = L.libraryCounts(rows);
ok(c.all === 11 && c.portfolio === 3 && c.asset === 8 && c.leases === 1 && c.review === 2, "counts");

const g = L.groupRows(rows);
ok(g.map((x) => x.key).join("|") === "Fund A|JV B|", "grouped by portfolio A–Z, then not yet in a portfolio");
ok(/^Fund A · Fund · 1 asset with documents · 7 documents$/.test(g[0].label) && /^JV B · Joint Venture · 1 asset/.test(g[1].label) && /^Not yet in a portfolio · 1 document$/.test(g[2].label), `group labels (${g.map((x) => x.label).join(" / ")})`);
ok(L.groupRows(rows, "none").length === 1 && L.groupRows(rows, "workflow").some((x) => x.key === "Asset Management → Debt"), "no grouping, or by workflow");

ok(L.attachesTo("lpa") === "portfolio" && L.attachesTo("sma") === "portfolio" && L.attachesTo("loan") === "asset" && L.attachesTo("om") === "asset", "the type decides portfolio or asset");
ok(L.workflowOfType("appraisal") === "valuations" && L.workflowOfType("om") === "acqdocs" && L.workflowOfType("insurance_cert") === "insurance" && L.workflowOfType("ppm") === "fundsummary", "where an upload also appears");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
