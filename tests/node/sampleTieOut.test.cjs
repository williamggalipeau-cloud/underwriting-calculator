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
const man = JSON.parse(fs.readFileSync(R + "/public/sample-docs/manifest.json", "utf8"));
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
  const other = rows.filter((r) => r.differs && r.key !== "rentSteps");
  ok(key.length === 0 && other.length === 0, `${l.files[0].replace(/\.pdf$/, "")}: ${l.tenant}, unit ${u.name}: ${rows.length - 1} lease terms, all as on the rent roll (tenant, SF, type, start, end, rent, escalation, deposit, options…)${other.length ? " — " + other.map((r) => `${r.label}: unit ${JSON.stringify(r.unitValue)} / lease ${JSON.stringify(r.abstractValue)}`).join("; ") : ""}`);
  // The lease's rent schedule is not copied to the unit (the model escalates the unit's rent itself); it must agree with the unit instead.
  const steps = LA.abstractUnitValues(abs, d.inputs).values.rentSteps ?? [], now = LA.stepOn(steps, d.inputs.acquisitionDate);
  const growth = steps.slice(1).every((x, i) => Math.abs((x.rentPSF / steps[i].rentPSF - 1) * 100 - u.annualEscalationPct) <= 0.06);
  ok(!u.rentSteps && now && near(now.rentPSF, u.currentRentPSF, 0.005) && growth && steps.at(-1).end === u.leaseEnd, `${l.tenant}: the lease's rent schedule gives the unit's rent on the acquisition date ($${u.currentRentPSF}/SF), grows at the unit's ${u.annualEscalationPct}% and ends on the unit's lease end`);
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

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
