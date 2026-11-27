// 1.1.21: the sample Property Management rows on the nine Model Fund I
// assets, and that they tie to each asset's budget, capital plan and facts.
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const PM = j(R + "/lib/propertyMgmt.js");
const S = j(R + "/lib/samplePropertyMgmt.js");
const { budgetMonth } = j(R + "/lib/businessPlan.js");
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const T = "2026-11-27";
const f = buildSampleFund({ todayISO: T });
const yearLine = (inputs, line, year) => { const rev = inputs.businessPlan.revisions.at(-1); let t = 0; for (let m = 1; m <= 12; m++) { const l = budgetMonth(rev.budget, `${year}-${String(m).padStart(2, "0")}`); if (l?.[line] != null) t += -l[line]; } return t; };

check(f.deals.length === 9 && f.deals.every((d) => S.SAMPLE_PM_SECTIONS.filter((k) => !["appeals", "claims"].includes(k)).every((k) => PM.rowsOf(d.inputs, k).length > 0)), "every sample asset has parcels, bills, policies, findings and contracts");
check(f.deals.filter((d) => PM.rowsOf(d.inputs, "appeals").length).length === 1 && f.deals.filter((d) => PM.rowsOf(d.inputs, "claims").length).length === 1, "one tax appeal and one insurance claim in the fund");
for (const d of f.deals) {
  const a = d.inputs, name = a.propertyName;
  // Every row has the columns its tab shows, and an id.
  for (const tab of PM.PM_TAB_IDS) for (const sec of PM.PM_TABS[tab].sections) for (const r of PM.rowsOf(a, sec.key)) {
    const extra = Object.keys(r).filter((k) => k !== "id" && !sec.cols.some(([c]) => c === k));
    const sel = sec.cols.filter(([c, , t, o]) => t === "select" && !o.includes(r[c]));
    if (!r.id || extra.length || sel.length) check(false, `${name} ${sec.key}: a row has no id, an unknown column (${extra}) or a value its dropdown lacks (${sel.map(([c]) => `${c}=${r[c]}`)})`);
  }
  for (const y of [2026, 2027]) {
    const t = PM.taxSummary(a, y), budget = yearLine(a, "taxes", y);
    check(Math.abs(t.billed - budget) <= 1 && Math.abs((t.budget ?? 0) - budget) < 1e-6, `${name}: ${y} tax bills ($${t.billed}) are the budget's tax line ($${Math.round(budget)})`);
  }
  check(PM.taxSummary(a, 2026).unpaid === 0 && PM.taxSummary(a, 2027).paid === 0, `${name}: the 2026 bill is paid, the 2027 bills are not`);
  const parcel = PM.rowsOf(a, "parcels")[0];
  check(parcel.assessedValue === a.purchasePrice && Math.abs((parcel.assessedValue * parcel.taxRatePct) / 100 - a.realEstateTaxPSF * a.squareFootage) < 50, `${name}: the parcel is assessed at the purchase price, and its rate gives the year's tax`);
  const ins = PM.insuranceSummary(a), insBudget = yearLine(a, "insurance", 2027);
  check(ins.policies === 3 && ins.premium === Math.round(a.insurancePSF * a.squareFootage) && Math.abs(ins.premium - insBudget) <= 1, `${name}: three policies; premiums ($${ins.premium}) are a year of the budget's insurance line ($${Math.round(insBudget)})`);
  check(PM.rowsOf(a, "policies").every((p) => p.renewalDate > T && p.effective <= a.acquisitionDate), `${name}: the policies were in force at closing and renew after today`);
  const c = PM.contractsSummary(a), repairs = yearLine(a, "repairs", 2027);
  check(c.contracts === 4 && Math.abs(c.annualCost - Math.round(repairs * 0.75)) <= 1, `${name}: four service contracts costing three quarters of the budget's repairs line ($${c.annualCost} of $${Math.round(repairs)})`);
  const cond = PM.conditionSummary(a), capital = a.businessPlan.revisions.at(-1).plan.capital.reduce((s, p) => s + p.budget, 0);
  check(cond.items === 4 && cond.open === 2 && cond.openCost > 0 && cond.openCost <= capital, `${name}: four findings, two open, their cost ($${cond.openCost}) inside the capital plan ($${capital})`);
  const roof = PM.rowsOf(a, "items").find((i) => i.system === "Roof"), env = PM.rowsOf(a, "items").find((i) => i.system === "Environmental");
  check(roof.finding.includes(String(a.building.roofYear)) && roof.finding.includes(a.building.roofType) && env.reportDate === a.site.phase1Date, `${name}: the roof finding states the asset's roof type and year; the environmental finding is dated as its Phase I`);
}
// Airport Flex Park: the owner's policies are the ones its insurance certificate states.
{
  const cert = require(R + "/docs/sample-deal-docs/deals/abstracts/airport-flex-insurance-owner.json");
  const pol = PM.rowsOf(f.deals[0].inputs, "policies");
  const by = { property: pol[0], cgl: pol[1], umbrella: pol[2] };
  const insurer = cert.fields.find((x) => x.key === "insurer").value;
  check(cert.policies.every((c) => { const p = by[c.coverage]; return p && p.policyNo === c.policy_no && p.effective === c.effective && p.renewalDate === c.expiry && p.limit === (c.limit ?? c.per_occurrence) && (c.deductible == null || p.deductible === c.deductible) && p.carrier === insurer; }), "Airport Flex Park: policy numbers, limits, deductible, dates and insurer agree with the sample insurance certificate");
}
// The load step: only empty sections are filled, nothing else on the asset changes, and a second pass changes nothing.
{
  const d = f.deals[1], bare = { ...d.inputs, propertyMgmt: { contracts: [{ id: "mine", vendor: "My vendor", service: "Other", annualCost: 1 }] } };
  const once = S.withSamplePropertyMgmt(bare, d.id), twice = S.withSamplePropertyMgmt(once, d.id);
  check(once.propertyMgmt.contracts.length === 1 && once.propertyMgmt.contracts[0].id === "mine" && once.propertyMgmt.bills.length === 3, "a section the user started is left alone; the empty ones are filled");
  check(twice === once, "applying it a second time changes nothing");
  const { propertyMgmt: _a, ...restA } = once, { propertyMgmt: _b, ...restB } = bare;
  check(JSON.stringify(restA) === JSON.stringify(restB), "only propertyMgmt changes on the asset");
  check(S.withSamplePropertyMgmt({ propertyName: "Mine", acquisitionDate: "2026-01-01" }, "deal-1").propertyMgmt === undefined, "an asset that is not a sample asset gets nothing");
}
// Upcoming dates: unpaid tax, renewals and contract notices feed the attention list.
{
  const dates = PM.pmDates(f.deals, T, { within: 60 });
  check(dates.some((x) => x.kind === "tax" && /1st half/.test(x.text)) && dates.some((x) => x.kind === "contract") && dates.some((x) => /Tax appeal hearing/.test(x.text)), `tax installments, contract notices and the appeal hearing are in the next 60 days (${dates.length} dates)`);
}
// The three assets' Property Management documents: every quote is in the PDF, every figure is the row's, and the load files them once.
{
  const fs = require("fs"), { execFileSync } = require("child_process");
  const dir = R + "/docs/sample-deal-docs/property-mgmt";
  const index = JSON.parse(fs.readFileSync(dir + "/index.json", "utf8"));
  check(index.length === 9 && ["tax_bill", "insurance_policy", "service_contract"].every((k) => index.filter((x) => x.kind === k).length === 3), "nine documents: a tax bill, insurance declarations and a service contract on each of three assets");
  const flat = (t) => t.replace(/\s+/g, " ");
  for (const d of index) {
    const abs = JSON.parse(fs.readFileSync(`${dir}/abstracts/${d.name}.json`, "utf8"));
    const text = flat(execFileSync("pdftotext", ["-layout", `${dir}/${d.file}`, "-"]).toString());
    const missing = Object.entries(abs.quotes).filter(([, q]) => !text.includes(flat(q.replace(/ \((§[\d.]+|p\.\d+)\)$/, ""))));
    check(missing.length === 0 && /SAMPLE – FICTIONAL/.test(text), `${d.name}: every quote is in the PDF, which is marked fictional${missing.length ? ` (missing: ${missing.map(([k]) => k)})` : ""}`);
    const a = f.deals.find((x) => x.id === d.dealId).inputs, rows = (k) => PM.rowsOf(a, k);
    if (d.kind === "tax_bill") {
      const unpaid = rows("bills").filter((b) => !b.paidDate);
      check(abs.parcel === rows("parcels")[0].apn && abs.assessed_value === a.purchasePrice && abs.installments.length === unpaid.length && abs.installments.every((x, i) => x.amount === unpaid[i].amount && x.due_date === unpaid[i].dueDate) && abs.installments.reduce((s2, x) => s2 + x.amount, 0) === PM.taxSummary(a, abs.tax_year).billed, `${d.name}: the parcel, assessed value and installments are the Property Taxes tab's, and add up to the year's bills`);
    } else if (d.kind === "insurance_policy") {
      const pol = rows("policies");
      check(abs.total_premium === PM.insuranceSummary(a).premium && abs.policies.every((x, i) => x.policy_no === pol[i].policyNo && x.limit === pol[i].limit && x.premium === pol[i].premium && x.effective === pol[i].effective && x.expiry === pol[i].renewalDate) && abs.insurer === pol[0].carrier, `${d.name}: the policies and premiums are the Insurance tab's`);
    } else {
      const c = rows("contracts").find((x) => x.service === abs.service);
      check(c && abs.vendor === c.vendor && abs.annual_cost === c.annualCost && abs.start === c.start && abs.end === c.end && abs.auto_renew === !!c.autoRenew && abs.notice_days === c.noticeDays, `${d.name}: the vendor, cost, term and notice are the Service Contracts tab's`);
    }
  }
  const SD = j(R + "/lib/sampleDocs.js"), PD = j(R + "/lib/pmDocs.js");
  const manifest = require(R + "/public/sample-docs/manifest.json");
  const plan = SD.sampleDocPlan(manifest, { deals: f.deals, docs: [], leases: [] });
  const pm = plan.add.filter((x) => x.kind === "pm" && x.file.startsWith("property-mgmt/")); // the nine of 1.1.21 (1.1.23 added four more, tested in docs1123)
  check(pm.length === 9 && pm.every((x) => PD.parsePmTitle(x.docTitle)?.section === x.section && fs.existsSync(`${R}/public/sample-docs/${x.file}`) && fs.existsSync(`${R}/public/sample-docs/${x.abstract}`)), "the load files the nine documents under their Property Management section, and the published copies exist");
  const stored = pm.map((x, i) => ({ id: `d${i}`, deal_id: x.dealId, title: x.docTitle, files: [{ name: x.file.split("/").pop() }] }));
  check(SD.sampleDocPlan(manifest, { deals: f.deals, docs: stored, leases: [] }).add.filter((x) => x.kind === "pm" && x.file.startsWith("property-mgmt/")).length === 0 && PD.pmDocs(stored).length === 9, "run again, nothing is uploaded twice; the Property Management tabs list all nine");
}
console.log(`${pass} passed${fail ? `, ${fail} failed` : ""}`);
process.exit(fail ? 1 : 0);
