// Sample data → Add sample documents (user, 11/25): the Model Fund I sample
// documents bundled with the site, and what an upload would add or skip.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const P = j(R + "/lib/sampleDocs.js");
const fs = require("fs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const m = JSON.parse(fs.readFileSync(R + "/public/sample-docs/manifest.json", "utf8"));
const all = [...m.deals, ...m.dispositions].flatMap((x) => [x.file, x.abstract]).concat(m.leases.flatMap((l) => [...l.files, l.abstract].filter(Boolean)));
ok(m.deals.length === 19 && m.dispositions.length === 7 && m.leases.length === 9, "19 fund / asset documents, 7 sale documents (three sales in progress), 9 leases");
ok(all.every((f) => fs.existsSync(`${R}/public/sample-docs/${f}`)), "every file and abstract is bundled with the site");
ok(m.deals.every((d) => fs.readFileSync(`${R}/public/sample-docs/${d.file}`).equals(fs.readFileSync(`${R}/docs/sample-deal-docs/deals/${d.name}.pdf`))), "the bundled copies match docs/ (run copy_public.cjs after changing them)");
ok(!m.deals.some((d) => /riverside/.test(d.name)) && m.leases.every((l) => !/Eastside|Northgate|Riverside/.test(l.asset)), "Model Fund I only");
ok(m.deals.filter((d) => d.fund === "Model Fund I").map((d) => d.docType).sort().join() === "lpa,ppm", "the LPA and PPM go on the fund");
ok(m.deals.find((d) => d.name === "airport-flex-insurance-blue-mesa-fulfillment").leaseTenant === "Blue Mesa Fulfillment" && m.leases.some((l) => l.asset === "Airport Flex Park" && l.tenant === "Blue Mesa Fulfillment"), "the tenant's certificate names its lease");

const deals = ["Airport Flex Park", "Route 9 Small Bay", "Harbor Light Industrial", "Mill Creek Business Park", "Lakeshore Service Center", "Ridgeway Trade Center", "Canal Street Workshops", "Southpoint Flex", "Granite Ave Industrial"].map((n, i) => ({ id: `sample-deal-${i + 1}`, inputs: { propertyName: n, fundName: "Model Fund I" } }));
const empty = P.sampleDocPlan(m, { deals });
const docsOnly = (xs) => xs.filter((x) => x.kind !== "credit" && x.kind !== "fact" && x.kind !== "pm"); // 1.1.21's Property Management documents: tests/node/pmdata1121.test.cjs; // 1.1.17's asset documents and SNDAs: tests/node/facts1117.test.cjs; // 1.1.9's credit reports: tests/node/sampleCreditReports.test.cjs
ok(docsOnly(empty.add).length === 35 && docsOnly(empty.skip).length === 0, "an empty store: all 35 are added");
const leases = [{ deal_id: "sample-deal-1", tenant: "Blue Mesa Fulfillment", files: [{ name: "02-airport-flex-park-blue-mesa-fulfillment.pdf" }] }];
const docs = [{ deal_id: "sample-deal-1", files: [{ name: "airport-flex-om.pdf" }] }, { deal_id: null, fund_name: "Model Fund I", files: [{ name: "model-fund-i-lpa.pdf" }] }];
const some = P.sampleDocPlan(m, { deals, docs, leases });
ok(docsOnly(some.add).length === 32 && some.skip.filter((x) => x.reason === "already uploaded").length === 3, "already uploaded (a lease, the OM, the LPA): skipped, not doubled");
const fewer = P.sampleDocPlan(m, { deals: deals.slice(0, 1) });
ok(fewer.skip.some((x) => /isn't in the firm/.test(x.reason)) && fewer.add.every((x) => !x.dealId || x.dealId === "sample-deal-1"), "assets not in the firm are skipped");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
