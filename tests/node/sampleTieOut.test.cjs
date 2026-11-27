// Everything ties out (AGENTS.md; user, 11/27: critical). The sample
// documents are written from Model Fund I, and this test fails on any
// difference between a document and the fund the app loads.
//
// The fund is built exactly as the app builds it (lib/sampleFund.js, the
// function "Load Model Fund I" calls). Each document's abstract is compared
// with the app's own compare functions (lib/dealDocApply.js), so "ties out"
// here means what the Documents tab would show: nothing to apply, no flag.
//
// Families still written the old way are listed at the bottom under NOT YET
// TIED with their current differences. That list is exact: a family leaving
// it must tie, and nothing may be added to it.
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
const { SAMPLE_CONSTRUCTION_JOBS_CSV, SAMPLE_CONSTRUCTION_INVOICES_CSV, SAMPLE_CONSTRUCTION_AS_OF } = j(R + "/lib/sampleConstruction.js");
const CON = j(R + "/lib/construction.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
let untiedJobs = 0;
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
const PENDING = new Set(["airport-flex-estoppel-desert-aero", "airport-flex-insurance-desert-aero", "lakeshore-cam-2025"]); // wait for the leases (below)
for (const n of names.filter((x) => !PENDING.has(x))) {
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

// 6. Other sample sets name assets and units that exist.
{
  const namesInFund = new Set(fund.deals.map((d) => d.inputs.propertyName));
  const jobs = CON.parseJobs(parseCSV(SAMPLE_CONSTRUCTION_JOBS_CSV));
  const imp = CON.importConstruction(fund.deals, { jobs, invoices: CON.parseInvoices(parseCSV(SAMPLE_CONSTRUCTION_INVOICES_CSV)), asOf: SAMPLE_CONSTRUCTION_AS_OF, source: "sample" });
  const noUnit = jobs.filter((x) => x.unit && !dealOf(x.propertyName)?.inputs.units.some((u) => u.name === x.unit));
  ok(jobs.length > 0 && imp.unmatched.length === 0 && jobs.every((x) => namesInFund.has(x.propertyName)) && noUnit.length === 0, `construction jobs: every job is on a Model Fund I asset and a unit of it (${jobs.length} jobs${noUnit.length ? "; no such unit: " + noUnit.map((x) => x.code).join(", ") : ""})`);
  const known = (d) => new Set([...d.inputs.units.map((u) => u.tenantName), ...(d.inputs.leasing?.prospects ?? []).map((q) => q.tenant)].filter(Boolean));
  const strangers = jobs.filter((x) => x.tenant && !known(dealOf(x.propertyName)).has(x.tenant));
  untiedJobs = strangers.length;
  if (strangers.length) console.log(`NOT YET TIED construction job tenants: ${strangers.length} jobs name a tenant that is neither on the rent roll nor a leasing prospect: ${strangers.map((x) => `${x.code} ${x.tenant}`).join("; ")}`);
  const pr = fund.deals.flatMap((d) => (d.inputs.leasing?.prospects ?? []).map((p) => ({ p, d })));
  ok(pr.length > 0 && pr.every(({ p, d }) => !p.unitId || d.inputs.units.some((u) => u.id === p.unitId)), `leasing prospects: each is for a unit of its asset (${pr.length} prospects)`);
  ok(fund.deals.every((d) => d.inputs.businessPlan), "every asset has its business plan");
  const pl = samplePipelineDeals(AS_OF, { targetFund: SP.SAMPLE_FUND_NAME });
  ok(pl.length > 0 && pl.every((r) => !namesInFund.has(r.name ?? r.propertyName)), `pipeline deals are not assets already in the fund (${pl.length} deals)`);
}

// 7. NOT YET TIED (1.1.13 in progress): written before the documents were
// tied to the fund. Printed with their differences; they do not fail the run
// yet, and the counts below are exact so nothing can join this list unseen.
{
  const leaseAbs = (f) => JSON.parse(fs.readFileSync(`${R}/public/sample-docs/${f}`, "utf8"));
  const untiedLeases = man.leases.filter((l) => { const d = dealOf(l.asset), u = d?.inputs.units.find((x) => x.tenantName === l.tenant); return !u || LA.leaseMismatches(leaseAbs(l.abstract), u, d.inputs).length > 0; });
  console.log(`NOT YET TIED leases: ${untiedLeases.length} of ${man.leases.length} (the tenant is not on the asset's rent roll): ${untiedLeases.map((l) => `${l.tenant} at ${l.asset}`).join("; ")}`);
  console.log(`NOT YET TIED lease-dependent documents: ${[...PENDING].join(", ")} (they name those tenants)`);
  const dispNoSale = man.dispositions.filter((x) => !(dealOf(x.asset)?.inputs.dispositions ?? []).length);
  console.log(`NOT YET TIED sale documents: ${dispNoSale.length} of ${man.dispositions.length} (the fund the app builds holds no sale; a sale is added only when the documents are uploaded)`);
  ok(untiedLeases.length === 9 && PENDING.size === 3 && dispNoSale.length === 12 && untiedJobs === 6, "the not-yet-tied list is exactly: 9 leases, 3 lease-dependent documents, 12 sale documents, 6 construction job tenants");
  void DISP;
}

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
