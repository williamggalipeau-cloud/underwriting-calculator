// Phase T: Property Management (lib/propertyMgmt.js) on fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const P = j(R + "/lib/propertyMgmt.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const TODAY = "2026-11-23";

ok(P.PM_TAB_IDS.join() === "taxes,insurance,condition,contracts", "four tabs");
const blank = P.blankRow("insurance", "policies");
ok(blank.id && blank.type === "Property" && blank.premium === null && blank.renewalDate === "", "a new row has its defaults");
let inp = { propertyName: "Fictional Dock", businessPlan: { revisions: [{ budget: { start: "2026-01", years: [{ lines: { taxes: -120000 } }] } }] } };
inp = P.setSection(inp, "bills", [
  { id: "b1", parcel: "001", year: 2026, installment: "1st half", amount: 62000, dueDate: "2026-04-10", paidDate: "2026-04-01" },
  { id: "b2", parcel: "001", year: 2026, installment: "2nd half", amount: 62000, dueDate: "2026-12-10", paidDate: "" },
]);
inp = P.setSection(inp, "appeals", [{ id: "a1", parcel: "001", year: 2025, outcome: "Won", savings: 8000 }, { id: "a2", parcel: "001", year: 2026, outcome: "Pending", hearingDate: "2027-03-05" }]);
inp = P.setSection(inp, "parcels", [{ id: "p1", apn: "001", assessedValue: 9.1e6 }]);
ok(inp.propertyMgmt.bills.length === 2 && inp.propertyMgmt.appeals.length === 2 && inp.propertyName === "Fictional Dock", "sections kept on the asset");
const tx = P.taxSummary(inp, "2026");
ok(tx.billed === 124000 && tx.paid === 62000 && tx.unpaid === 62000 && close(tx.budget, 120000) && tx.vsBudget === 4000 && close(tx.vsBudgetPct, 4000 / 120000 * 100), "taxes: billed, paid, unpaid and vs. the business plan budget");
ok(tx.appealSavings === 8000 && tx.openAppeals === 1 && tx.assessed === 9.1e6, "appeal savings, pending appeals, assessed value");
ok(P.taxSummary({}, "2026").budget === null, "no plan: no budget");

inp = P.setSection(inp, "policies", [{ id: "x1", type: "Property", carrier: "Example Mutual", limit: 2e7, premium: 48000, renewalDate: "2027-01-01" }, { id: "x2", type: "General liability", premium: 9000, renewalDate: "2027-06-01" }]);
inp = P.setSection(inp, "claims", [{ id: "c1", status: "Open", amount: 25000, recovery: 0 }, { id: "c2", status: "Closed", amount: 10000, recovery: 9000 }]);
const ins = P.insuranceSummary(inp);
ok(ins.policies === 2 && ins.premium === 57000 && ins.propertyLimit === 2e7 && ins.openClaims === 1 && ins.claimed === 35000 && ins.recovered === 9000, "insurance: premium, property limit, claims");

inp = P.setSection(inp, "items", [{ id: "i1", source: "PCA", system: "Roof", finding: "Membrane at end of life", cost: 180000, urgency: "Within 1 year", status: "Open" }, { id: "i2", source: "PCA", system: "Fire / life safety", finding: "Sprinkler heads", cost: 12000, urgency: "Immediate", status: "Open" }, { id: "i3", system: "Paving / parking", cost: 40000, urgency: "1–5 years", status: "Done" }]);
const cs = P.conditionSummary(inp);
ok(cs.open === 2 && cs.openCost === 192000 && cs.byUrgency[0].cost === 12000 && cs.done === 40000, "condition: open cost by urgency, completed");

inp = P.setSection(inp, "contracts", [{ id: "k1", vendor: "Example Landscaping", service: "Landscaping", end: "2027-01-31", annualCost: 18000, autoRenew: true, noticeDays: 30 }, { id: "k2", vendor: "Fictional HVAC", service: "HVAC", end: "2026-12-31", annualCost: 24000 }]);
const ks = P.contractsSummary(inp);
ok(ks.contracts === 2 && ks.annualCost === 42000 && ks.autoRenew === 1, "contracts: count, annual cost, auto-renew");

// ── Key dates ──
const dates = P.pmDates([{ id: "a", inputs: inp }], TODAY, { within: 60 });
const has = (re) => dates.some((d) => re.test(d.text));
ok(has(/^Property tax 2nd half due \$62,000 \(Fictional Dock\)$/) && !has(/1st half/), "an unpaid tax bill due within 60 days (paid ones left out)");
ok(has(/Property policy renews \(Example Mutual\)/) && !has(/General liability/), "a policy renewing within 60 days");
ok(has(/Landscaping contract: notice deadline \(auto-renews\), Example Landscaping/) && dates.find((d) => /Landscaping/.test(d.text)).date === "2027-01-01", "an auto-renewing contract's notice deadline (end − notice days)");
ok(has(/HVAC contract ends/), "a contract ending");
ok(has(/Immediate repair open: Fire \/ life safety/) && !has(/Roof/), "an open immediate repair");
ok(dates.filter((d) => d.date).every((d, i, a) => i === 0 || d.date >= a[i - 1].date) && !dates.at(-1).date, "dated items first, by date");
ok(!P.pmDates([{ id: "a", inputs: inp }], TODAY, { within: 60 }).some((d) => /hearing/.test(d.text)), "a hearing beyond 60 days isn't listed");

// ── Excel ──
const x = P.pmXlsx("taxes", [{ id: "a", inputs: inp }], { year: "2026" });
ok(x[0][0] === "Property Taxes · 2026" && x.some((r) => r[0] === "Tax bills") && x.filter((r) => r[0] === "Fictional Dock").length === 5, "Excel: every section with rows by asset");

// ── Part 2: capital plan and documents ──
const BP = j(R + "/lib/businessPlan.js");
const withPlan = { ...inp, businessPlan: { revisions: [{ n: 1, at: "2026-01-01T00:00:00Z", plan: { capital: [{ id: "c1", project: "Existing", budget: 100000 }] }, budget: inp.businessPlan.revisions[0].budget }] } };
const added = P.addToCapitalPlan(withPlan, "i1", { by: "t@example.com", at: "2026-11-23T12:00:00Z", addRevision: BP.addRevision });
const rev2 = added.businessPlan.revisions.at(-1);
ok(added.businessPlan.revisions.length === 2 && rev2.reason === "Capital project from Property Condition" && rev2.by === "t@example.com", "adding a finding makes a new plan revision (history kept)");
const proj = rev2.plan.capital.at(-1);
ok(rev2.plan.capital.length === 2 && proj.budget === 180000 && /Roof: Membrane/.test(proj.project) && proj.start === "2026-11-23" && proj.end === "2027-11-23", "the project: budget from the cost, timing from the urgency");
ok(P.rowsOf(added, "items").find((i) => i.id === "i1").planProjectId === proj.id, "the finding remembers its project");
ok(P.addToCapitalPlan(added, "i1", { addRevision: BP.addRevision }) === null, "never added twice");
ok(P.addToCapitalPlan(inp, "i1", { addRevision: BP.addRevision }) === null || !inp.businessPlan.revisions[0].plan, "no plan revision with a plan: nothing added");
const D = j(R + "/lib/pmDocs.js");
ok(D.pmTitle({ section: "policies", name: "Policy: 2027.pdf" }) === "[pm:policies] Policy: 2027.pdf" && D.parsePmTitle("[pm:policies] Policy: 2027.pdf").name === "Policy: 2027.pdf", "document titles carry the section");
const docs = D.pmDocs([{ id: "1", deal_id: "a", title: "[pm:bills] bill.pdf" }, { id: "2", deal_id: "b", title: "[pm:bills] other.pdf" }, { id: "3", deal_id: "a", title: "[leasing:comps] x.pdf" }], ["a"]);
ok(docs.length === 1 && docs[0].section === "bills" && docs[0].name === "bill.pdf", "documents for one asset and section");
(async () => {
  let got = null;
  await D.uploadPmDoc("w1", { dealId: "a", section: "items", file: { name: "PCA.pdf" } }, null, async (w, a) => { got = a; return a; });
  ok(got.docType === "other" && got.title === "[pm:items] PCA.pdf", "uploads filed as Other (no SQL)");
  console.log(fail ? `${fail} FAILED` : "ALL PASS");
  process.exitCode = fail ? 1 : 0;
})();
if (false) console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
