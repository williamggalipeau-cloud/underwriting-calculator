// Everything ties out (AGENTS.md; user, 11/27: critical). The sample
// documents are written from Model Fund I, and this test fails on any
// difference between a document and the fund the app loads.
//
// The fund is built exactly as the app builds it (lib/sampleFund.js, the
// function "Load Model Fund I" calls). Each document's abstract is compared
// with the app's own compare functions (lib/dealDocApply.js), so "ties out"
// here means what the Documents tab would show: nothing to apply, no flag.
//
// There is no "not yet tied" allowance: every sample document, lease, sale
// document and sample file must tie, or this test fails.
const R = require("path").resolve(__dirname, "..", "..");
const fs = require("fs");
const { execFileSync } = require("child_process");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const DA = j(R + "/lib/dealDocApply.js");
const LA = j(R + "/lib/leaseApply.js");
const DISP = j(R + "/lib/dispositionApply.js");
const { underwrite } = j(R + "/lib/calculations.js");
const SP = j(R + "/lib/samplePortfolio.js");
const G = j(R + "/lib/gpEconomics.js");
const GP = j(R + "/lib/gpPartners.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const { sampleFundTermsPatch } = j(R + "/lib/sampleDocTerms.js");
const PMGR = j(R + "/lib/propertyManager.js");
const { SAMPLE_CONSTRUCTION_JOBS_CSV, SAMPLE_CONSTRUCTION_INVOICES_CSV, SAMPLE_CONSTRUCTION_AS_OF } = j(R + "/lib/sampleConstruction.js");
const CON = j(R + "/lib/construction.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const DS = j(R + "/lib/dispositions.js");
const { samplePipelineDeals } = j(R + "/lib/samplePipeline.js");
const { assetOf, AS_OF } = require(R + "/scripts/sample-deal-docs/make_terms.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const run = (script) => { try { execFileSync("node", [R + "/scripts/sample-deal-docs/" + script, "--check"], { stdio: "pipe" }); return ""; } catch (e) { return String(e.stderr || e.stdout || e.message).trim().split("\n").slice(0, 3).join(" / "); } };
const near = (a, b, e = 0.5) => Math.abs(Number(a) - Number(b)) <= e;
const addYears = (iso, n) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;
const addDays = (iso, n) => new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);

// 1. The generators' inputs are current.
let e = run("export_fund.cjs"); ok(!e, `fund.json (what the generators read) is the fund the app builds${e ? ": " + e : ""}`);
e = run("make_terms.cjs"); ok(!e, `lib/sampleDocTerms.json is what the documents say, no document disagrees with the app, and applying them moves no loan, equity or return${e ? ": " + e : ""}`);

// 2. The fund, as the app loads it, and without the documents' terms.
const fund = buildSampleFund({ todayISO: AS_OF });
const bare = buildSampleFund({ todayISO: AS_OF, docTerms: false });
const terms = { ...DEFAULT_FUND_TERMS, ...SP.SAMPLE_FUND_FEE_TERMS, name: SP.SAMPLE_FUND_NAME, targetEquity: SP.SAMPLE_FUND_COMMITMENTS };
const termsWithDocs = { ...terms, ...sampleFundTermsPatch(terms) };
const dealOf = (asset) => fund.deals.find((d) => d.inputs.propertyName === asset);
const fig = (inp) => { const r = underwrite(inp); return [r.returns.irr, r.returns.equityMultiple, r.debt.loanAmount, r.debt.equityRequired, ...r.annualCashFlows.map((c) => c.pretaxCashFlow), ...r.annualCashFlows.map((c) => c.noi)]; };
ok(fund.deals.every((d, i) => JSON.stringify(fig(d.inputs)) === JSON.stringify(fig(bare.deals[i].inputs))), "the documents' terms change no asset's loan, equity, NOI, cash flow or return");
const econ = (f, t) => { const x = G.fundGpEconomics(SP.SAMPLE_FUND_NAME, f.deals.map((d) => SP.snapshotDeal(d.inputs, d.id)), { ...t, capitalActivity: [] }, { todayISO: AS_OF }); return [x.promote.total, x.equity.lp, x.equity.gp, x.equity.lpMultiple, x.coinvest.profit]; };
const eA = econ(fund, termsWithDocs), eB = econ(bare, terms);
ok(JSON.stringify(eA) === JSON.stringify(eB), `the fund's promote, equity and LP multiple are the same with and without them (promote $${(eA[0] / 1e6).toFixed(2)}M, LP multiple ${eA[3].toFixed(3)}x)`);
ok(Object.keys(fund.valuations).every((id) => Object.keys(fund.valuations[id]).every((q) => fund.valuations[id][q].value === bare.valuations[id][q].value && fund.valuations[id][q].capRate === bare.valuations[id][q].capRate)), "no mark's value or cap rate changes");

// 3. Fund and asset documents: nothing to apply.
const dir = R + "/docs/sample-deal-docs/deals";
const names = fs.readdirSync(dir + "/abstracts").map((f) => f.replace(/\.json$/, "")).filter((n) => assetOf(n) !== null).sort();
const docOf = (n) => { const a = JSON.parse(fs.readFileSync(`${dir}/abstracts/${n}.json`, "utf8")); return { id: `sample:${n}`, name: n, doc_type: a.doc_type, title: a.title, abstract: a }; };
for (const n of names) {
  const doc = docOf(n), deal = assetOf(n) ? dealOf(assetOf(n)) : null;
  const rows = DA.compareDoc(doc, { inputs: deal?.inputs ?? {}, terms: termsWithDocs });
  const diff = rows.filter((r) => r.differs && r.target !== "executedCaps" && !/docId/.test(r.target)); // an executed cap's row carries the document's database id
  ok(diff.length === 0, `${n} (${doc.doc_type}): ${rows.length} terms, all as in the app${diff.length ? " — " + diff.map((r) => `${r.label}: app ${JSON.stringify(r.appValue)} / document ${JSON.stringify(r.docValue)}`).join("; ") : ""}`);
  const inp = deal?.inputs, a = doc.abstract, v = (k) => DA.docField(a, k)?.value;
  if (doc.doc_type === "rent_roll") {
    const d = DA.rentRollDiff(a, inp.units, inp, (name, sf) => ({ id: "new", name, squareFeet: sf }));
    ok(d.added.length === 0 && d.changed.length === 0 && d.removed.length === 0 && a.units.length === inp.units.length, `${n}: every unit is on the rent roll with the same tenant, SF, status, type, rent, lease end and escalation (${a.units.length} units${d.changed.length ? "; changed " + d.changed.map((c) => `${c.unit.name}: ${c.diffs.map((x) => x.label).join(",")}`).join("; ") : ""})`);
  }
  if (doc.doc_type === "loan") {
    const r = underwrite(inp), lt = inp.loanTerms, mat = addYears(inp.acquisitionDate, inp.loanTermYears);
    ok(lt.lender === inp.lenderName && near(inp.loanAmountActual, r.debt.loanAmount) && inp.loanCovenants.dscr === inp.loanCovenants.dscrMin && lt.maturityDate === mat, `${n}: lender ${lt.lender}, $${inp.loanAmountActual.toLocaleString("en-US")}, ${inp.loanCovenants.dscr}x DSCR and maturity ${mat} are the model's`);
    const notice = a.critical_dates.find((c) => /extension notice/i.test(c.label))?.date;
    ok(notice === addDays(mat, -inp.extensionNoticeDays), `${n}: extension notice ${notice} = maturity − ${inp.extensionNoticeDays} days (the asset's notice period)`);
  }
  if (doc.doc_type === "rate_cap") {
    const cap = (inp.executedCaps ?? [])[0], fromDoc = DA.capFromDoc(doc, inp), r = underwrite(inp);
    const same = cap && ["holdYear", "provider", "rating", "strikePct", "effective", "termination", "notional", "premium", "index", "tradeDate"].every((k) => JSON.stringify(cap[k]) === JSON.stringify(fromDoc[k]));
    ok(same && cap.provider === inp.capProviders?.[1] && near(cap.strikePct + inp.spreadPct, inp.capStrikeRatesByYear[0], 0.005) && near(cap.premium, inp.capPremiumAmount) && near(cap.notional, r.debt.loanAmount), `${n}: the executed cap in the app is the document's (${cap?.provider}, ${cap?.strikePct}% strike, $${cap?.premium?.toLocaleString("en-US")} premium, notional = the loan)`);
    const flags = DA.capChecks(fromDoc, inp).filter((k) => k.severity !== "low");
    ok(flags.length === 0, `${n}: meets the loan's cap requirement${flags.length ? " — " + flags.map((k) => k.text).join("; ") : ""}`);
  }
  if (doc.doc_type === "appraisal") {
    const m = DA.appraisalMark(doc, inp, fund.valuations[deal.id] ?? {}, underwrite(inp));
    const bad = m.rows.filter((r) => r.differs);
    ok(bad.length === 0, `${n}: the ${m.quarter} mark in the app is this appraisal (value, source, appraiser, cap rate)${bad.length ? " — " + bad.map((r) => `${r.label}: ${r.appValue} / ${r.docValue}`).join("; ") : ""}`);
  }
  if (doc.doc_type === "ic_memo") {
    const tol = { money: 0.5, pct: 0.051, years: 0, number: 0.0051 };
    const off = DA.icVariance(inp.icApproved, inp, underwrite(inp)).filter((r) => !(Math.abs(r.diff) <= (r.key === "multiple" ? 0.0051 : tol[r.kind] ?? 0.5)));
    ok(off.length === 0, `${n}: the approved figures are the model's${off.length ? " — " + off.map((r) => `${r.label}: approved ${r.approved} / model ${r.current}`).join("; ") : ""}`);
  }
  if (doc.doc_type === "closing_acq") {
    const ab = inp.actualBasis, cc = Object.values(inp.closingCosts).reduce((s, x) => s + (Number(x) || 0), 0);
    ok(near(ab.equityFunded, inp.purchasePrice + cc - ab.loanProceeds - ab.sellerCredits - ab.prorations - ab.depositsTransferred), `${n}: cash from the buyer = price + closing costs − loan − credits − prorations − deposits`);
  }
  if (n === "airport-flex-insurance-owner") ok(String(v("holder")).startsWith(inp.lenderName), `${n}: the mortgagee is the asset's lender (${inp.lenderName})`);
}
ok((termsWithDocs.limits ?? []).length === docOf("model-fund-i-lpa").abstract.limits.length, `Model Fund I holds the LPA's ${termsWithDocs.limits?.length} investment limits`);

// 4. The copies the app uploads are these documents.
const man0 = JSON.parse(fs.readFileSync(R + "/public/sample-docs/manifest.json", "utf8"));
// The documents of the deals/ and dispositions/ sets (1.1.23 added documents from docs/sample-deal-docs/more to the same lists; they are checked in docs1123).
const man = { ...man0, deals: man0.deals.filter((d) => d.file.startsWith("deals/")), dispositions: man0.dispositions.filter((d) => d.file.startsWith("dispositions/")) };
ok(man.deals.length === names.length && man.deals.every((d) => fs.readFileSync(`${R}/public/sample-docs/${d.file}`).equals(fs.readFileSync(`${dir}/${d.name}.pdf`)) && fs.readFileSync(`${R}/public/sample-docs/${d.abstract}`).equals(fs.readFileSync(`${dir}/abstracts/${d.name}.json`))), `the ${man.deals.length} bundled PDFs and abstracts are the generated ones (copy_public.cjs)`);

// 5. GP partner agreements: the fund's GP parties are the agreements' terms.
{
  let gp = GP.EMPTY_GP_PARTNERS;
  const funds = { [SP.SAMPLE_FUND_NAME]: termsWithDocs };
  for (const a of man.gpAgreements) {
    const abs = JSON.parse(fs.readFileSync(`${R}/public/sample-docs/${a.abstract}`, "utf8"));
    if (!gp.partners.some((p) => p.name === abs.partner_name)) gp = GP.addPartner(gp, abs.partner_name).gp;
    const r = GP.saveAgreement(gp, GP.agreementFromAbstract(abs, { gp, funds, deals: fund.deals, docId: "x" }));
    if (r.error) ok(false, `${a.file}: ${r.error}`); else gp = r.gp;
  }
  const applied = GP.applyAgreements(termsWithDocs, SP.SAMPLE_FUND_NAME, gp, { todayISO: AS_OF });
  const good = man.gpAgreements.every((a) => {
    const abs = JSON.parse(fs.readFileSync(`${R}/public/sample-docs/${a.abstract}`, "utf8"));
    const party = (applied.gpParties ?? []).find((p) => p.name === abs.partner_name);
    const t = party?.terms?.find((x) => x.effective === abs.effective_date);
    const deal = abs.deal ? dealOf(abs.deal) : null;
    return t && t.capitalPct === abs.capital_pct && t.gpSideSharePct === abs.promote_pct_of_gp_side && (abs.deal ? t.dealId === deal?.id : !t.dealId);
  });
  ok(good, `GP agreements: each partner's share of the GP capital and promote, its date and its asset are the agreement's (${man.gpAgreements.length} agreements)`);
}

// 5b. Legal entities: the documents name the entities the app holds.
{
  const ents = fund.termsPatch.entities ?? [];
  const company = (asset) => ents.find((x) => x.dealId === dealOf(asset)?.id)?.name;
  const fundEnt = ents.find((x) => x.role === "fund")?.name, gpEnt = ents.find((x) => x.role === "gp")?.name;
  ok(ents.length === 2 + fund.deals.length && fund.deals.every((d) => ents.filter((x) => x.dealId === d.id && x.role === "asset").length === 1), `Model Fund I holds its fund, GP and one property company per asset (${ents.length} entities)`);
  const fv = (n, k) => DA.docField(docOf(n).abstract, k)?.value;
  ok(fv("model-fund-i-lpa", "fund_name") === fundEnt && fv("model-fund-i-ppm", "fund_name") === fundEnt, `the LPA and PPM name the fund entity (${fundEnt})`);
  ok(fv("airport-flex-loi", "buyer") === company("Airport Flex Park") && fv("airport-flex-insurance-owner", "insured") === company("Airport Flex Park"), `the LOI's buyer and the owner's insurance certificate name the asset's property company (${company("Airport Flex Park")})`);
  const landlords = man.leases.map((l) => [l.asset, String(JSON.parse(fs.readFileSync(`${R}/public/sample-docs/${l.abstract}`, "utf8")).fields.find((f) => f.key === "landlord")?.value ?? "")]);
  const offL = landlords.filter(([asset, v]) => !v.startsWith(company(asset) ?? "\u0000"));
  ok(offL.length === 0, `each lease's landlord is its asset's property company${offL.length ? " — " + offL.map(([a, v]) => `${a}: ${v}`).join("; ") : ""}`);
  const gpText = man.gpAgreements.map((a) => JSON.stringify(JSON.parse(fs.readFileSync(`${R}/public/sample-docs/${a.abstract}`, "utf8")).quotes));
  ok(gpText.every((t) => t.includes(gpEnt)), `the GP partner agreements are made with the fund's GP (${gpEnt})`);
}

// 5c. Property managers: every asset has one, in line with who the fund pays the property management fee to.
ok(fund.deals.every((d) => String(d.inputs.propertyManager ?? "").trim() && PMGR.pmFeeMismatch(d.inputs, termsWithDocs) === ""), "every asset has a property manager, and the firm agrees with the fund's property management fee payee");

// 6. Other sample sets name assets and units that exist.
{
  const namesInFund = new Set(fund.deals.map((d) => d.inputs.propertyName));
  const jobs = CON.parseJobs(parseCSV(SAMPLE_CONSTRUCTION_JOBS_CSV));
  const imp = CON.importConstruction(fund.deals, { jobs, invoices: CON.parseInvoices(parseCSV(SAMPLE_CONSTRUCTION_INVOICES_CSV)), asOf: SAMPLE_CONSTRUCTION_AS_OF, source: "sample" });
  const noUnit = jobs.filter((x) => x.unit && !dealOf(x.propertyName)?.inputs.units.some((u) => u.name === x.unit));
  ok(jobs.length > 0 && imp.unmatched.length === 0 && jobs.every((x) => namesInFund.has(x.propertyName)) && noUnit.length === 0, `construction jobs: every job is on a Model Fund I asset and a unit of it (${jobs.length} jobs${noUnit.length ? "; no such unit: " + noUnit.map((x) => x.code).join(", ") : ""})`);
  const known = (d) => new Set([...d.inputs.units.map((u) => u.tenantName), ...(d.inputs.leasing?.prospects ?? []).map((q) => q.tenant)].filter(Boolean));
  const strangers = jobs.filter((x) => x.tenant && !known(dealOf(x.propertyName)).has(x.tenant));
  ok(strangers.length === 0, `construction jobs: every tenant named is on its asset's rent roll or a leasing prospect${strangers.length ? " — " + strangers.map((x) => `${x.code} ${x.tenant}`).join("; ") : ""}`);
  const pr = fund.deals.flatMap((d) => (d.inputs.leasing?.prospects ?? []).map((p) => ({ p, d })));
  ok(pr.length > 0 && pr.every(({ p, d }) => !p.unitId || d.inputs.units.some((u) => u.id === p.unitId)), `leasing prospects: each is for a unit of its asset (${pr.length} prospects)`);
  ok(fund.deals.every((d) => d.inputs.businessPlan), "every asset has its business plan");
  const pl = samplePipelineDeals(AS_OF, { targetFund: SP.SAMPLE_FUND_NAME });
  ok(pl.length > 0 && pl.every((r) => !namesInFund.has(r.name ?? r.propertyName)), `pipeline deals are not assets already in the fund (${pl.length} deals)`);
}

// 7. Leases: each is for a tenant on its asset's rent roll, and ties to that unit.
const leaseDir = R + "/docs/sample-leases";
const leaseIndex = JSON.parse(fs.readFileSync(leaseDir + "/index.json", "utf8")).filter((l) => l.fund);
const leaseAbsOf = (l) => JSON.parse(fs.readFileSync(`${leaseDir}/abstracts/${l.files[0].replace(/\.pdf$/, "")}.json`, "utf8"));
const leaseRows = []; // as the app holds them (lease_documents rows)
ok(leaseIndex.length === fund.deals.length && man.leases.length === leaseIndex.length, `one lease per Model Fund I asset (${leaseIndex.length})`);
for (const l of leaseIndex) {
  const d = dealOf(l.asset), abs = leaseAbsOf(l), u = d?.inputs.units.find((x) => x.tenantName === l.tenant);
  if (!u) { ok(false, `${l.tenant} is not on ${l.asset}'s rent roll`); continue; }
  leaseRows.push({ id: `L-${d.id}`, deal_id: d.id, tenant: l.tenant, abstract: abs });
  const rows = LA.compareWithUnit(abs, u, d.inputs), key = LA.leaseMismatches(abs, u, d.inputs);
  const other = rows.filter((r) => r.differs); // 1.1.21: rent steps included
  ok(key.length === 0 && other.length === 0, `${l.files[0].replace(/\.pdf$/, "")}: ${l.tenant}, unit ${u.name}: ${rows.length - 1} lease terms, all as on the rent roll (tenant, SF, type, start, end, rent, escalation, deposit, options…)${other.length ? " — " + other.map((r) => `${r.label}: unit ${JSON.stringify(r.unitValue)} / lease ${JSON.stringify(r.abstractValue)}`).join("; ") : ""}`);
  // 1.1.21: the lease's rent schedule is on the unit (the model pays the step in force); it must also agree with the unit's rent, escalation and end.
  const steps = LA.abstractUnitValues(abs, d.inputs).values.rentSteps ?? [], now = LA.stepOn(steps, d.inputs.acquisitionDate);
  const growth = steps.slice(1).every((x, i) => Math.abs((x.rentPSF / steps[i].rentPSF - 1) * 100 - u.annualEscalationPct) <= 0.06);
  ok(JSON.stringify(u.rentSteps) === JSON.stringify(steps) && now && near(now.rentPSF, u.currentRentPSF, 0.005) && growth && steps.at(-1).end === u.leaseEnd, `${l.tenant}: the unit holds the lease's rent schedule, which gives the unit's rent on the acquisition date ($${u.currentRentPSF}/SF), grows at the unit's ${u.annualEscalationPct}% and ends on the unit's lease end`);
  ok(fs.readFileSync(`${R}/public/sample-docs/leases/${l.files[0]}`).equals(fs.readFileSync(`${leaseDir}/${l.files[0]}`)) && abs.app.made_with === "Sample (fictional)" && abs.app.validated === false, `${l.tenant}: the bundled lease is the generated one, marked as a sample abstract`);
}

// 8. Documents about a tenant: the estoppel, the tenant's certificate and the CAM reconciliation.
{
  const est = names.map(docOf).find((x) => x.doc_type === "estoppel"), cert = names.map(docOf).find((x) => x.doc_type === "insurance_cert" && x.abstract.app.lease_tenant), cam = names.map(docOf).find((x) => x.doc_type === "cam");
  const lr = (doc, n) => leaseRows.find((x) => x.deal_id === dealOf(assetOf(n)).id && x.tenant === doc.abstract.app.lease_tenant);
  const el = lr(est, est.name), eu = dealOf(assetOf(est.name)).inputs.units.find((u) => u.tenantName === el?.tenant);
  const checks = el ? DA.estoppelChecks(est, el.abstract, eu) : [];
  const badE = checks.filter((r) => !r.ok);
  ok(el && checks.length >= 8 && badE.length === 0, `${est.name}: ${checks.length} statements, all as in the lease and on the rent roll${badE.length ? " — " + badE.map((r) => `${r.label}: ${r.estoppel} / ${r.lease}`).join("; ") : ""}`);
  const cl = lr(cert, cert.name);
  const gaps = cl ? DA.insuranceGaps(cert.abstract, { leaseAbs: cl.abstract, asOf: AS_OF }) : [{ text: "no lease" }];
  ok(gaps.length === 0 && DA.leaseInsuranceRequirements(cl.abstract), `${cert.name}: meets the lease's insurance requirements, nothing lapsed or expiring${gaps.length ? " — " + gaps.map((g) => g.text).join("; ") : ""}`);
  const camDeal = dealOf(assetOf(cam.name)), cc = DA.camCheck({ ...cam, deal_id: camDeal.id }, leaseRows);
  const onRoll = cam.abstract.tenants.every((t) => camDeal.inputs.units.some((u) => u.tenantName === t.tenant && near(t.share_pct, (u.squareFeet / camDeal.inputs.squareFootage) * 100, 0.006)));
  const withLease = cc.tenants.filter((t) => !t.noLease);
  ok(onRoll && withLease.length === 1 && withLease.every((t) => t.issues.length === 0 && near(t.diff, 0, 0.5)), `${cam.name}: every tenant billed is on the rent roll at its share of the building; the lease tenant is billed what its lease allows${withLease.some((t) => t.issues.length) ? " — " + withLease.flatMap((t) => t.issues).join("; ") : ""}`);
  const x = camDeal.inputs, opex = DA.docField(cam.abstract, "total_opex"), v = (k) => Number(String(DA.docField(cam.abstract, k).value).replace(/[$,]/g, ""));
  ok(opex && near(v("management_fee"), v("gross_revenue") * x.managementFeePct / 100, 0.5) && near(v("total_opex"), (x.realEstateTaxPSF + x.insurancePSF + x.utilitiesPSF + x.maintenancePSF + x.janitorialPSF) * x.squareFootage + v("management_fee"), 1), `${cam.name}: expenses are the model's $/SF lines and its ${x.managementFeePct}% management fee`);
}

// 9. Sales in progress: the fund holds each sale as its documents state it.
{
  const dispDir = R + "/docs/sample-deal-docs/dispositions";
  const TYPE = { bov: "bov", loi: "offer_letter", psa: "psa" };
  const files = fs.readdirSync(dispDir + "/abstracts").map((f) => f.replace(/\.json$/, "")).sort();
  ok(files.length === man.dispositions.length && man.dispositions.every((x) => fs.readFileSync(`${R}/public/sample-docs/${x.file}`).equals(fs.readFileSync(`${dispDir}/${x.name}.pdf`)) && fs.readFileSync(`${R}/public/sample-docs/${x.abstract}`).equals(fs.readFileSync(`${dispDir}/abstracts/${x.name}.json`))), `the ${files.length} bundled sale documents are the generated ones`);
  const sold = fund.deals.filter((d) => (d.inputs.dispositions ?? []).some((s) => s.closing || s.stage === "closed") || d.inputs.realizedSale);
  ok(sold.length === 0 && !man.dispositions.some((x) => /closing/.test(x.docType)), "Model Fund I holds no sold asset, and no sale document is a closing statement");
  for (const x of man.dispositions) {
    const d = dealOf(x.asset), sales = d?.inputs.dispositions ?? [], abs = JSON.parse(fs.readFileSync(`${dispDir}/abstracts/${x.name}.json`, "utf8"));
    const r = sales.length === 1 ? DISP.dispositionRows(d.inputs, { type: x.docType, saleId: sales[0].id }, abs) : { rows: [{ differs: true, label: `${sales.length} sales on the asset` }] };
    const diff = r.rows.filter((q) => q.differs && !q.info);
    ok(DISP.canReview(x.docType) && r.rows.length > 0 && diff.length === 0, `${x.name} (${x.docType}): ${r.rows.length} terms, all as on the sale in the app${diff.length ? " — " + diff.map((q) => `${q.label}: ${JSON.stringify(q.appValue)} / ${JSON.stringify(q.docValue)}`).join("; ") : ""}`);
    const seller = DA.docField(abs, "seller")?.value;
    if (seller) ok(seller === (fund.termsPatch.entities ?? []).find((e) => e.dealId === d.id)?.name, `${x.name}: the seller is the asset's property company (${seller})`);
  }
  const act = DS.activeSales(fund.deals);
  ok(act.length === 3 && act.filter((a) => a.sale.stage === "contract").length === 1 && act.filter((a) => a.sale.stage === "offers").length === 2, "three sales in progress: one under contract, two with offers");
  for (const d of fund.deals.filter((q) => (q.inputs.dispositions ?? []).length)) {
    const s = d.inputs.dispositions[0], bov = s.bovs[0], mk = fund.valuations[d.id] ?? {}, q = Object.keys(mk).sort().pop(), r = underwrite(d.inputs);
    const basis = q ? mk[q].value : null;
    ok(bov && (basis ? near(bov.price, basis) : bov.price > d.inputs.purchasePrice && near(bov.capPct, (r.annualCashFlows[0].noi / bov.price) * 100, 0.006)), `${d.inputs.propertyName}: the broker's value ($${bov?.price?.toLocaleString("en-US")}) is ${basis ? `the asset's ${q} mark` : "the model's year-1 NOI at the stated cap rate"}`);
  }
}

// 10. The sample property-accounting exports (docs/sample-yardi) are the fund's units and rents.
{
  const Y = R + "/docs/sample-yardi";
  e = ""; try { execFileSync("node", [R + "/scripts/sample-yardi/generate.cjs", "--check"], { stdio: "pipe" }); } catch (err) { e = String(err.stderr || err.message).trim().split("\n")[0]; }
  ok(!e, `the sample Yardi files are what the generator writes from the fund today${e ? ": " + e : ""}`);
  const exp = JSON.parse(fs.readFileSync(Y + "/expected.json", "utf8"));
  ok(exp.properties.length === fund.deals.length && exp.properties.every((p, i) => p.name === fund.deals[i].inputs.propertyName), "its properties are the fund's nine assets, in order");
  const codeOf = Object.fromEntries(exp.properties.map((p, i) => [p.code, fund.deals[i]]));
  const rowsOf = (file) => { const rows = parseCSV(fs.readFileSync(`${Y}/${file}`, "utf8")); const h = rows.findIndex((r) => r.some((c) => /^property/i.test(String(c)))); return { head: rows[h].map((c) => String(c).toLowerCase()), body: rows.slice(h + 1).filter((r) => r.length > 3) }; };
  let n = 0; const off = [];
  for (const file of ["aged-receivables-2026-08.csv", "aged-receivables-2026-09.csv", "aged-receivables-2026-10.csv", "tenant-ledger.csv"]) {
    const { head, body } = rowsOf(file);
    const col = (re) => head.findIndex((c) => re.test(c));
    const ip = col(/^property( code)?$/), iu = col(/^unit/), it = col(/tenant name|^tenant$|resident/);
    for (const r of body) {
      const d = codeOf[r[ip]]; if (!d) continue;
      n++;
      const ic = col(/tenant code/), code = ic >= 0 ? String(r[ic]) : "";
      // The unit: its own column, else the tenant code (t + property number + unit position).
      const u = iu >= 0 ? d.inputs.units.find((x) => x.name === r[iu]) : d.inputs.units[Number(code.slice(-3)) - 1];
      const monthly = u ? Math.round((u.currentRentPSF * u.squareFeet / 12) * 100) / 100 : NaN;
      const idesc = col(/^description$/), iamt = col(/^amount$/);
      const rentOff = idesc >= 0 && r[idesc] === "Base rent" && !near(Number(r[iamt]), monthly, 0.005);
      if (!u || (it >= 0 && r[it] && u.tenantName !== r[it]) || rentOff) off.push(`${file}: ${r[ip]} ${iu >= 0 ? r[iu] : code} ${it >= 0 ? r[it] : ""}${rentOff ? ` rent ${r[iamt]} vs ${monthly}` : ""}`);
    }
  }
  ok(n > 0 && off.length === 0, `aged receivables and tenant ledger: every row is a unit of the fund with its tenant, and each rent charge is that unit's monthly rent (${n} rows${off.length ? "; not in the fund: " + off.slice(0, 4).join("; ") : ""})`);
  const amts = exp.scenarios.every((sc) => { const d = dealOf(sc.asset), u = d?.inputs.units.find((x) => x.name === sc.unit); return u && u.leaseStatus === "occupied"; });
  ok(amts, "each delinquency scenario is an occupied unit of the fund");
  const cash = parseCSV(fs.readFileSync(Y + "/cash-balances-2026-09.csv", "utf8")).filter((r) => r[1] && r[0] !== "Property Code" && r[0] !== "Total");
  ok(cash.length > 0 && cash.every((r) => dealOf(r[1])), `cash balances: every property is an asset of the fund (${cash.length} rows)`);
}

// 11. The automatic load on a firm's saved data (app/page.jsx syncSampleData): the same result, and nothing of the user's is touched.
{
  const T = j(R + "/lib/sampleDocTerms.js"), SD = j(R + "/lib/sampleDocs.js"), CH = require(R + "/lib/sampleDocChanges.json");
  // A fund saved before 1.1.13 (no document terms) comes out as the fund the app builds.
  const RX = j(R + "/lib/sampleResearch.js");
  const upgraded = bare.deals.map((d) => ({ ...d, inputs: RX.withSampleResearchExtra(T.withSampleSaleComps(T.withSampleSale(T.applySampleDocTerms(d.inputs, d.id, { keepExisting: true }), d.id)), d.id, { valuations: fund.valuations }) }));
  const byId = (xs) => [...(xs ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)); // the order research items were added in does not matter
  const strip = (inp) => JSON.stringify({ ...inp, research: byId(inp.research), propertyManager: undefined, propertyManagementFirm: undefined }).replace(/mtm-[a-z0-9]+-/g, "mtm-"); // unit ids are made afresh on every build
  ok(upgraded.every((d, i) => strip(d.inputs) === strip(fund.deals[i].inputs)), "a fund saved before 1.1.13 gets exactly the document terms, lease terms and sales the app's own fund holds");
  // What the user entered is kept.
  const d3 = bare.deals.find((d) => d.inputs.propertyName === "Harbor Light Industrial");
  const mine = { ...d3.inputs, units: d3.inputs.units.map((u) => (u.tenantName === "Copper Canyon Tile & Stone" ? { ...u, leaseStart: "2021-01-01" } : u)), dispositions: [{ ...T.sampleSale(d3.id), id: "user-sale", startedFrom: "Sample sale (fictional)", bovs: [{ id: "b", broker: "My Broker", price: 1 }], offers: [] }] };
  const kept = T.withSampleSale(T.applySampleDocTerms(mine, d3.id, { keepExisting: true }), d3.id);
  ok(kept.units.find((u) => u.tenantName === "Copper Canyon Tile & Stone").leaseStart === "2021-01-01" && kept.dispositions.length === 1 && kept.dispositions[0].bovs[0].broker === "My Broker", "a lease start the user entered and a sale the user has worked on are left as they are");
  const empty = { ...d3.inputs, dispositions: [{ id: "live-id", startedFrom: "Sample sale (fictional)", stage: "marketing", bovs: [], offers: [], contract: { psaDate: "" }, closing: null, createdAt: "2026-11-25T00:00:00.000Z" }] };
  const filled = T.withSampleSale(empty, d3.id).dispositions;
  ok(filled.length === 1 && filled[0].id === "live-id" && filled[0].bovs.length === 1 && filled[0].offers.length === 1 && filled[0].stage === "offers", "an earlier, still-empty sample sale keeps its id (its documents stay attached) and takes the documented BOV and offer");
  // Earlier sample documents are found only by their old file names, on sample assets.
  const row = (id, deal, name, extra = {}) => ({ id, deal_id: deal, fund_name: "Model Fund I", title: name, files: [{ name }], abstract: { app: { made_with: "Sample (fictional)" } }, ...extra });
  const docs = [row("a", "sample-deal-2", "route9-closing-disp.pdf", { title: "[sale:s1] Closing statement: route9-closing-disp.pdf" }), row("b", "sample-deal-2", "route9-bov.pdf", { title: "[sale:s1] BOV: route9-bov.pdf" }),
    row("c", "sample-deal-2", "my-offer.pdf", { title: "[sale:s1] LOI / offer letter: my-offer.pdf" }), row("d", "deal-7", "route9-bov.pdf", { title: "[sale:s9] BOV: route9-bov.pdf" }),
    row("e", "sample-deal-2", "route9-psa.pdf", { title: "[sale:s1] P&S: route9-psa.pdf", abstract: { app: { made_with: "CREparser Deal Review" } } }), row("f", "sample-deal-1", "airport-flex-estoppel-desert-aero.pdf")];
  ok(SD.supersededSampleSaleDocs(docs, CH).map((d) => d.id).join() === "a,b" && SD.supersededSampleDocs(docs, CH).map((d) => d.id).join() === "f" && SD.supersededSampleSaleDocs(docs, CH, { fromVersion: 3 }).length === 0, "earlier sale documents and the earlier estoppel are replaced; a user's own file, another asset's file and a document with a non-sample abstract are not");
  const ls = [{ id: "1", deal_id: "sample-deal-1", files: [{ name: "02-airport-flex-park-desert-aero.pdf" }] }, { id: "2", deal_id: "sample-deal-3", files: [{ name: "04-harbor-light-portside-marine.pdf" }, { name: "04a-harbor-light-portside-marine-first-amendment.pdf" }] },
    { id: "3", deal_id: "sample-deal-1", files: [{ name: "my-lease.pdf" }] }, { id: "4", deal_id: "deal-7", files: [{ name: "05-ridgeway-lone-star-hvac.pdf" }] }, { id: "5", deal_id: "sample-deal-4", files: [{ name: "05-ridgeway-lone-star-hvac.pdf" }] },
    { id: "6", deal_id: "sample-deal-1", files: [{ name: "02-airport-flex-park-blue-mesa-fulfillment.pdf" }] }];
  ok(SD.supersededSampleLeases(ls, CH, { withCreditDocs: new Set(["5"]) }).map((l) => l.id).join() === "1,2", "earlier sample leases are replaced; a user's lease, a lease on another asset, a lease with tenant credit documents and the current sample lease are kept");
  const current = new Set([...man.deals, ...man.dispositions].map((x) => x.file.split("/").pop()).concat(man.leases.flatMap((l) => l.files.map((f) => f.split("/").pop()))));
  const listed = new Set([...CH["3"], ...CH.sales["3"], ...CH.leases["3"]]);
  // The previous release's manifest, frozen as a fixture (a test must not depend on git history: CI checks out one commit).
  const was = require(R + "/tests/fixtures/sample-manifest-1.1.12.json"); const wasNames = [...was.deals, ...was.dispositions].map((x) => x.file.split("/").pop()).concat(was.leases.flatMap((l) => l.files.map((f) => f.split("/").pop())));
  const unlisted = wasNames.filter((n) => !current.has(n) && !listed.has(n));
  ok(unlisted.length === 0, `every sample file of the previous release that is no longer loaded is on the replace list${unlisted.length ? " — missing: " + unlisted.join(", ") : ""}`);
}

// 12. 1.1.16: price per SF, break-even occupancy and the comps of a sale are the fund's own figures.
{
  const M = j(R + "/lib/assetMetrics.js"), DC = j(R + "/lib/dispositionCandidates.js"), DS = j(R + "/lib/dispositions.js"), C = j(R + "/lib/calculations.js");
  const fj = require(R + "/scripts/sample-deal-docs/fund.json");
  const offBasis = fund.deals.filter((d) => { const a = fj.assets.find((x) => x.id === d.id); return !a || Math.abs(M.allInBasis(d.inputs) - a.model.totalCost) > 0.5 || M.assetSF(d.inputs) !== a.sf; }).map((d) => d.id);
  ok(offBasis.length === 0, `all-in basis and SF: the app's figures are the ones the sample documents were written from (fund.json)${offBasis.length ? ": " + offBasis.join(", ") : ""}`);
  const offPsf = fund.deals.filter((d) => { const a = fj.assets.find((x) => x.id === d.id); const m = DC.candidateMetrics(d.inputs, fund.valuations[d.id], AS_OF); const mk = Object.entries(a.marks ?? {}).sort().at(-1); return Math.abs(m.basisPSF - a.model.totalCost / a.sf) > 1e-6 || (mk ? Math.abs(m.valuePSF - mk[1].value / a.sf) > 1e-6 : m.valuePSF != null); }).map((d) => d.id);
  ok(offPsf.length === 0, `value per SF and basis per SF (Disposition Candidates) = the latest mark and the total cost over the asset's SF${offPsf.length ? ": " + offPsf.join(", ") : ""}`);
  const offBe = fund.deals.filter((d) => { const u = C.underwrite(d.inputs), b = M.breakEvenOccupancy(d.inputs, { year: 1 }), y = u.annualCashFlows[0]; return !b || Math.abs(b.debtService - u.debt.annualDebtService) > 1 || Math.abs(b.breakEvenPct - ((y.operatingExpenses + y.debtService) / y.grossRevenue) * 100) > 1e-9 || Math.abs(b.cushionPts - (b.occupancyPct - b.breakEvenPct)) > 1e-9; }).map((d) => d.id);
  ok(offBe.length === 0, `break-even occupancy: built from the model's own year (operating expenses, the loan's debt service, potential gross income)${offBe.length ? ": " + offBe.join(", ") : ""}`);
  const sales = fund.deals.flatMap((d) => (d.inputs.dispositions ?? []).map((s) => ({ d, s })));
  const offComps = sales.filter(({ d, s }) => { const acq = d.inputs.salesComps?.comps ?? [], dc = M.saleCompsOf(s)?.comps ?? []; return !acq.length || dc.length !== acq.length || dc.some((c, i) => c.name !== acq[i].name || c.price !== acq[i].price || c.sf !== acq[i].sf || c.capRate !== acq[i].capRate || c.saleDate !== acq[i].saleDate || c.id === acq[i].id); }).map(({ d }) => d.id);
  ok(sales.length === 3 && offComps.length === 0, `each of the three sample sales has its own comps, copied from that asset's acquisition comps${offComps.length ? ": " + offComps.join(", ") : ""}`);
  const offView = sales.filter(({ d, s }) => { const v = M.saleCompsView(d.inputs, s, { todayISO: AS_OF }); const offers = DS.offersCompared(d.inputs, s, { todayISO: AS_OF }); const sel = offers.find((o) => o.selected); const row = v.rows.find((r) => r.key.startsWith("offer:")); const bov = v.rows.find((r) => r.key.startsWith("bov:")); return !bov || bov.price !== s.bovs[0].price || (sel ? !row || row.price !== sel.price || Math.abs(row.psf - sel.psf) > 1e-9 || Math.abs(row.capPct - sel.capPct) > 1e-9 : !!row) || Math.abs(v.rows[0].price - v.avgPsf * v.sf) > 1e-6; }).map(({ d }) => d.id);
  ok(offView.length === 0, `the comps section's broker opinion, asking price and selected offer are the sale's own, with the same $/SF and cap rate as the Offers view${offView.length ? ": " + offView.join(", ") : ""}`);
}

// 13. 1.1.17: the building and site facts, the SNDA statuses and their documents.
{
  const AF = j(R + "/lib/assetFacts.js"), SN = j(R + "/lib/snda.js");
  const fj = require(R + "/scripts/sample-deal-docs/fund.json");
  const off = fund.deals.filter((d) => { const a = fj.assets.find((x) => x.id === d.id); return !a || JSON.stringify(a.building) !== JSON.stringify(d.inputs.building) || JSON.stringify(a.site) !== JSON.stringify(d.inputs.site) || a.sndaRule !== (d.inputs.loanTerms?.sndaRule ?? "none") || a.units.some((u, k) => JSON.stringify(u.snda ?? null) !== JSON.stringify(d.inputs.units[k].snda ?? null)); }).map((d) => d.id);
  ok(off.length === 0, `building facts, site facts and SNDA statuses: the generators' file holds exactly what the fund holds${off.length ? ": " + off.join(", ") : ""}`);
  const dir = R + "/docs/sample-deal-docs/asset-facts";
  const index = JSON.parse(fs.readFileSync(dir + "/index.json", "utf8"));
  const bad = [];
  for (const x of index) {
    const a = JSON.parse(fs.readFileSync(`${dir}/abstracts/${x.name}.json`, "utf8")), d = fund.deals.find((z) => z.id === x.dealId);
    const pub = R + "/public/sample-docs/asset-facts/" + x.name + ".json";
    if (!fs.existsSync(`${dir}/${x.file}`) || !fs.existsSync(pub) || fs.readFileSync(pub, "utf8") !== fs.readFileSync(`${dir}/abstracts/${x.name}.json`, "utf8")) bad.push(x.name + " (files)");
    const html = fs.readFileSync(`${dir}/html/${x.name}.html`, "utf8");
    if (Object.values(a.quotes ?? {}).some((q) => !html.includes(String(q).replace(/ \((p\.1|§[\d.]+)\)$/, "")))) bad.push(x.name + " (a quote is not in the document)");
    if (x.kind === "snda") { if (SN.sndaDocRows(a, d.inputs).some((r) => r.ok === false) || !html.includes(`$${Number(a.loan_amount).toLocaleString("en-US")}`)) bad.push(x.name); }
    else if (AF.factDocRows(a, d.inputs).some((r) => r.differs || r.now == null)) bad.push(x.name);
  }
  ok(index.length === 16 && bad.length === 0, `the 16 asset documents and SNDAs: every stated fact is the fund's, every quote is in its document, and the copies the app uploads are current${bad.length ? ": " + bad.join(", ") : ""}`);
  const unitsWithDoc = index.filter((x) => x.kind === "snda").map((x) => `${x.dealId}|${x.unit}`).sort().join();
  const signedUnits = fund.deals.flatMap((d) => d.inputs.units.filter((u) => u.snda?.status === "signed").map((u) => `${d.id}|${u.name}`)).sort().join();
  ok(unitsWithDoc === signedUnits, "every lease marked signed has its SNDA document, and no SNDA document is for a lease not marked signed");
}

// 14. 1.1.19: who is paid each asset's property management fee agrees from the asset to the fund to the firm.
{
  const G = j(R + "/lib/gpEconomics.js"), FE = j(R + "/lib/firmEconomics.js"), C = j(R + "/lib/calculations.js"), PMG = j(R + "/lib/propertyManager.js");
  const SP2 = j(R + "/lib/samplePortfolio.js"), FT = j(R + "/lib/fundTerms.js");
  const t = { ...FT.DEFAULT_FUND_TERMS, ...SP2.SAMPLE_FUND_FEE_TERMS, ...fund.termsPatch, name: "Model Fund I", targetEquity: SP2.SAMPLE_FUND_COMMITMENTS };
  const g = G.fundGpEconomics("Model Fund I", fund.deals.map((d) => SP2.snapshotDeal(d.inputs, d.id)), t, { todayISO: AS_OF });
  const offAsset = fund.deals.filter((d) => { const a = g.assets.find((x) => x.id === d.id); const u = C.underwrite(d.inputs); const pm = u.annualCashFlows.reduce((s2, y) => s2 + Math.max(0, y.managementFee ?? 0), 0); return !a || Math.abs(a.pm - pm) > 1 || a.pmPayee !== (PMG.pmFirmOf(d.inputs).type === "third" ? "third" : "sponsor") || a.pmThird !== 0; }).map((d) => d.id);
  ok(offAsset.length === 0, `each asset's property management fee is its model's, and it is paid to the firm its asset setup names (all nine: this firm)${offAsset.length ? ": " + offAsset.join(", ") : ""}`);
  const sumPm = g.assets.reduce((s2, a) => s2 + a.pm, 0), fe = FE.firmEconomics([g]);
  ok(Math.abs(g.fees.pm - sumPm) < 1 && Math.abs(g.parties.sponsor.feesByType.pm - sumPm) < 1 && g.parties.third.fees === 0 && Math.abs(fe.feesByType.find((x) => x.key === "pm").life - sumPm) < 1 && Math.abs(fe.totals.fees - g.fees.total) < 1, "asset to fund to firm: the nine assets' fees are the fund's property management fee, the sponsor's, and the firm's in Firm Economics");
}

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
