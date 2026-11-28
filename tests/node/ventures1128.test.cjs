// 1.1.28: the remaining tab data of the sample joint venture and separate
// account (lib/sampleVentureData.js): business plans with actuals, leasing
// prospects, tenant credit stories and aged receivables, Property Management
// rows and last quarter's distribution proposal.
//   - Each figure is the asset's or portfolio's own (AGENTS.md: everything
//     ties out): the plan is the closing model, the actuals are the model
//     today, the Property Management amounts are the asset's expense
//     assumptions, the proposal is what Distribution Analysis computes.
//   - The load adds each piece only where there is none, and changes only
//     its own fields.
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const V = j(R + "/lib/sampleVentures.js"), VD = j(R + "/lib/sampleVentureData.js"), BP = j(R + "/lib/businessPlan.js"), CR = j(R + "/lib/creditReview.js");
const LH = j(R + "/lib/leaseHistory.js"), D = j(R + "/lib/distributions.js"), SP = j(R + "/lib/samplePortfolio.js"), PM = j(R + "/lib/propertyMgmt.js");
const { underwrite } = j(R + "/lib/calculations.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");
const { lastCompletedQuarterEnd } = j(R + "/lib/valuations.js");
const { assetSF } = j(R + "/lib/assetMetrics.js");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const T = V.SAMPLE_VENTURE_AS_OF;
const v = V.buildSampleVentures({ baseInputs: DEFAULT_INPUTS, todayISO: T });
const deals = v.deals.map((d) => ({ ...d, inputs: VD.withSampleVentureData(d.inputs, d.id, { todayISO: T }) }));
const by = (id) => deals.find((d) => d.id === id).inputs, raw = (id) => v.deals.find((d) => d.id === id).inputs;
const held = deals.filter((d) => d.id !== "sample-jv-1"), sold = by("sample-jv-1");

// ── Business plans ──
for (const d of deals) {
  const i = d.inputs, bp = i.businessPlan, rev = bp?.revisions?.[0], closing = raw(d.id).uwBaseline.inputs, months = Object.keys(bp?.actuals ?? {}).sort();
  const uw = underwrite(closing), now = underwrite(raw(d.id));
  check(bp.revisions.length === 1 && rev.by === VD.SAMPLE_VENTURE_DATA_BY && rev.budget.years.every((y, k) => near(y.lines.noi, uw.annualCashFlows[k].noi, 0.01)), `${i.propertyName}: the plan's budget is the closing model's NOI, year by year`);
  const yearOf = (m) => Math.floor(BP.addMonths ? (Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - (Number(rev.budget.start.slice(0, 4)) * 12 + Number(rev.budget.start.slice(5, 7)))) / 12 : 0);
  check(months.length > 30 && months.every((m) => near(bp.actuals[m].noi, now.annualCashFlows[yearOf(m)].noi / 12, 0.01) && near(bp.actuals[m].egr + bp.actuals[m].opex, bp.actuals[m].rent + bp.actuals[m].recoveries + bp.actuals[m].vacancy + ["taxes", "insurance", "utilities", "repairs", "management", "otherOpex"].reduce((s, k) => s + bp.actuals[m][k], 0), 0.05)), `${i.propertyName}: each month's actual NOI is the asset's model today (${months.length} months, ${months[0]} to ${months.at(-1)})`);
  check(months[0] > i.acquisitionDate.slice(0, 7) && months.at(-1) === (d.id === "sample-jv-1" ? "2026-05" : "2026-10") || (d.id === "sample-jv-1" && months.at(-1) <= "2026-06"), `${i.propertyName}: actuals run from the first full month to ${d.id === "sample-jv-1" ? "the sale" : "last month"}`);
}
{
  const itd = (id) => { const bp = by(id).businessPlan, m = Object.keys(bp.actuals).sort(); return BP.varianceReport(bp, { kind: "itd", end: m.at(-1), sf: by(id).squareFootage }).rows.find((r) => r.key === "noi"); };
  check(itd("sample-jv-3").variancePct < -30 && ["sample-jv-1", "sample-jv-2", "sample-sma-1"].every((id) => itd(id).variancePct > 0 && itd(id).variancePct < 6), `since closing, the asset behind plan is far under its budget (${itd("sample-jv-3").variancePct.toFixed(0)}%) and the other three are a little ahead`);
  const plan = (id) => by(id).businessPlan.revisions[0].plan, open = (id) => plan(id).milestones.filter((m) => m.status !== "done" && m.due && m.due < T).length;
  check(open("sample-jv-3") > 10 && open("sample-jv-2") === 0 && open("sample-sma-1") === 0 && open("sample-jv-1") === 0 && plan("sample-jv-3").risks.length === 1, `only the asset behind plan has late milestones (${open("sample-jv-3")}) and a risk noted`);
  check(deals.every((d) => plan(d.id).capital.every((c) => c.spent === Math.round(c.budget))), "each capital plan is spent on budget");
}

// ── Leasing ──
{
  for (const d of held) {
    const i = d.inputs, ps = i.leasing.prospects, today = LH.inputsToday(i, T), vacant = new Set(today.units.filter((u) => u.leaseStatus !== "occupied").map((u) => u.id));
    const news = ps.filter((p) => p.kind === "new"), ren = ps.filter((p) => p.kind === "renewal");
    check(news.length > 0 && news.every((p) => vacant.has(p.unitId)) && ren.length === 1 && !vacant.has(ren[0].unitId) && ps.every((p) => String(p.id).startsWith("sample-lp-")) && !!i.leasingManager, `${i.propertyName}: ${news.length} prospects, all on units vacant today, and one renewal`);
    check(ps.filter((p) => ["loi", "leaseout"].includes(p.stage)).every((p) => p.screening?.result === "approved") && ps.filter((p) => !["loi", "leaseout"].includes(p.stage)).every((p) => !p.screening), `${i.propertyName}: a prospect at LOI or lease out has its screening`);
    check(i.units.filter((u) => u.leaseStatus !== "occupied" && !(u.laterLeases ?? []).length).every((u) => u.vacantSince === i.acquisitionDate), `${i.propertyName}: a unit vacant since purchase says so`);
  }
  check(!sold.leasing?.prospects?.length && by("sample-jv-3").leasing.prospects.length > by("sample-jv-2").leasing.prospects.length, "no prospects on the sold asset; the most on the asset behind plan");
  const mo = by("sample-jv-3").units.find((u) => u.moveOut);
  check(by("sample-jv-3").leasing.prospects.some((p) => p.unitId === mo.id) || LH.unitToday(mo, by("sample-jv-3"), T).leaseStatus === "vacant", "the unit the tenant moved out of is among the vacant units being leased");
}

// ── Tenant credit stories and aged receivables ──
{
  const rows = CR.creditRows(deals, { todayISO: T }), c = {};
  for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
  check(c.weak === 2 && c.missing === 1 && c.ok === rows.length - 3 && !rows.some((r) => r.dealId === "sample-jv-1"), `Tenant Credit: two tenants to watch and one with no record, the rest fine; none on the sold asset (${JSON.stringify(c)})`);
  const story = (id) => by(id).units.find((u) => u.sampleCreditStory);
  check(held.every((d) => d.inputs.units.filter((u) => u.sampleCreditStory).length === 1) && !sold.units.some((u) => u.sampleCreditStory), "one story per held asset");
  check(story("sample-jv-2").credit.flags.filter((f) => f.status === "open").length === 1 && story("sample-jv-3").credit.records.some((r) => r.result === "conditional" && r.tenant === LH.unitToday(story("sample-jv-3"), by("sample-jv-3"), T).tenantName) && story("sample-sma-1").credit.records.every((r) => r.tenant !== LH.unitToday(story("sample-sma-1"), by("sample-sma-1"), T).tenantName), "an open flag, a conditional screening in today's tenant's name, and a tenant with no record");
  for (const [name, terms] of Object.entries(v.funds)) {
    const p = VD.sampleVentureFundData(name, deals, terms, { todayISO: T }), months = Object.keys(p.delinquency?.months ?? {}).sort();
    const last = p.delinquency.months[months.at(-1)].rows;
    const ok = last.length > 0 && last.every((r) => { const d = deals.find((x) => x.id === p.delinquency.mapping.properties[r.property]), u = d.inputs.units.find((x) => x.id === p.delinquency.mapping.tenants[r.tenantCode]), t = LH.unitToday(u, d.inputs, T); const m = (t.currentRentPSF * u.squareFeet) / 12; return u.sampleCreditStory && r.tenant === t.tenantName && d.inputs.fundName === name && near(r.total, r.d30 + r.d60 + r.d90 + r.d180 + r.over180, 0.01) && r.total > 0 && r.total <= 2 * m + 1 && u.securityDeposit > 0; });
    check(months.join() === "2026-09-30,2026-10-31" && ok, `${name}: the aged receivables are the story tenants' rent, mapped to their units (${last.map((r) => Math.round(r.total)).join(", ")})`);
  }
}

// ── Property management ──
{
  for (const d of held) {
    const i = d.inputs, pm = i.propertyMgmt, sf = assetSF(i);
    const tax = Math.round(i.realEstateTaxPSF * sf), prem = Math.round(i.insurancePSF * sf), rep = Math.round(Math.round((i.maintenancePSF + i.janitorialPSF) * sf) * 0.75);
    check(pm.parcels.length === 1 && pm.parcels[0].assessedValue === i.purchasePrice && pm.bills.filter((b) => b.year === 2026).reduce((s, b) => s + b.amount, 0) === tax && pm.bills.filter((b) => b.year === 2026).every((b) => b.paidDate) && pm.bills.some((b) => b.year === 2027 && !b.paidDate), `${i.propertyName}: this year's two tax bills are the asset's tax expense (${tax}), paid; next year's first is open`);
    check(pm.policies.length === 3 && pm.policies.reduce((s, p) => s + p.premium, 0) === prem && pm.policies.every((p) => p.effective <= T && p.renewalDate > T) && pm.contracts.length === 4 && pm.contracts.reduce((s, c) => s + c.annualCost, 0) === rep && pm.contracts.every((c) => c.start <= T && c.end >= T), `${i.propertyName}: three policies in force for the asset's insurance expense (${prem}) and four service contracts in force`);
    check(pm.items.length === 4 && pm.items.find((x) => x.system === "Roof").finding.includes(String(i.building.roofYear)) && pm.items.find((x) => x.system === "Environmental").reportDate === i.site.phase1Date, `${i.propertyName}: the property condition items come from its building and site facts`);
    check(PM.PM_TAB_IDS.flatMap((tab) => PM.PM_TABS[tab].sections.map((s) => s.key)).filter((k) => !["appeals", "claims"].includes(k)).every((k) => PM.rowsOf(i, k).length > 0), `${i.propertyName}: every Property Management section has rows`);
  }
  check(by("sample-jv-3").propertyMgmt.appeals.length === 1 && by("sample-jv-2").propertyMgmt.claims.length === 1 && by("sample-jv-2").propertyMgmt.claims[0].recovery === by("sample-jv-2").propertyMgmt.claims[0].amount - 25000 && !sold.propertyMgmt, "one tax appeal and one closed claim (paid net of the deductible); none on the sold asset");
  check(by("sample-jv-3").propertyMgmt.items.find((x) => x.system === "Environmental").finding === "Recognized environmental condition; Phase II clean", "the asset with a Phase II says so");
}

// ── Distribution Analysis ──
for (const [name, terms] of Object.entries(v.funds)) {
  const mine = deals.filter((d) => d.inputs.fundName === name), p = VD.sampleVentureFundData(name, deals, terms, { todayISO: T }).distributions.proposals.filter((x) => x.status === "proposed");
  const qEnd = lastCompletedQuarterEnd(T), calc = D.distributable(mine.map((d) => SP.snapshotDeal(d.inputs, d.id)), terms, qEnd, { todayISO: T }), pick = D.chooseDistribution(calc, terms, { mode: "pct", value: 100 });
  check(p.length === 1 && p[0].quarter === "2026-Q3" && p[0].status === "proposed" && near(p[0].amount, calc.total, 0.01) && near(p[0].amount, pick.amount, 0.01) && near(p[0].lp + p[0].gp, p[0].amount, 0.01) && near(p[0].gp / p[0].amount, terms.gpCommitPct / 100, 0.001) && p[0].amount > 100000, `${name}: last quarter's proposal is all of what Distribution Analysis finds distributable, split by capital ($${Math.round(p[0].amount).toLocaleString("en-US")})`);
}

// ── The sale's proceeds, distributed per the waterfall (user, 11/28) ──
{
  const name = V.SAMPLE_JV_NAME, terms = v.funds[name], patch = VD.sampleVentureFundData(name, deals, terms, { todayISO: T });
  const c = sold.dispositions.find((x) => x.stage === "closed").closing, sd = VD.sampleSaleDistribution(name, deals, terms, { todayISO: T });
  const mine = deals.filter((d) => d.inputs.fundName === name).map((d) => SP.snapshotDeal(d.inputs, d.id)), calc = D.distributable(mine, terms, "2026-06-30", { todayISO: T }), split = D.splitSaleProceeds(calc.events, terms, c.date, c.net);
  check(near(sd.amount, c.net, 0.01) && near(sd.lp + sd.gp, sd.amount, 0.02) && near(sd.lp, split.lp, 0.01) && near(sd.gp, split.gp, 0.01) && sd.closed === "2026-06-30" && sd.paidDate === "2026-07-15" && sd.quarter === "2026-Q2", `the sale's distribution is its net proceeds ($${Math.round(sd.amount).toLocaleString("en-US")}), split by the waterfall on the portfolio's events before the sale`);
  check(near(sd.gp / sd.amount, terms.gpCommitPct / 100, 1e-6) && sd.lp < [...mine].reduce((s2, d) => s2 + d.metrics.equityRequired, 0), "no promote on it: the proceeds are less than the capital still to be returned, so they go to the capital partners by their shares (90 / 10)");
  const paid = patch.distributions.proposals.find((x) => x.status === "paid"), act = patch.capitalActivity ?? [];
  check(paid && paid.id === "dp-sample-sale-sample-jv-1" && paid.amount === sd.amount && paid.lp === sd.lp && paid.gp === sd.gp && paid.paidDate === sd.paidDate && paid.quarter === "2026-Q2" && act.length === 1 && act[0].id === paid.activityId && act[0].type === "distribution" && act[0].amount === sd.amount && act[0].date === sd.paidDate, "it is recorded as Distribution Analysis records a paid distribution: a paid proposal and a Distribution paid entry in capital activity");
  check(patch.distributions.proposals.length === 2 && !VD.sampleSaleDistribution(V.SAMPLE_SMA_NAME, deals, v.funds[V.SAMPLE_SMA_NAME], { todayISO: T }) && !VD.sampleVentureFundData(V.SAMPLE_SMA_NAME, deals, v.funds[V.SAMPLE_SMA_NAME], { todayISO: T }).capitalActivity, "the separate account has sold nothing, so it has only last quarter's proposal");
  // The distribution notice states the same split.
  const fs = require("fs"), dn = JSON.parse(fs.readFileSync(R + "/public/sample-docs/ventures/example-gateway-industrial-park-distribution-notice.json", "utf8")), usd = (x) => `$${Math.round(x).toLocaleString("en-US")}`, f = (k) => dn.fields.find((x) => x.key === k)?.value;
  check(f("amount") === usd(sd.amount) && f("to_partner") === usd(sd.lp) && f("to_sponsor") === usd(sd.gp) && f("promote") === "$0" && f("distribution_date") === "July 15, 2026", `the distribution notice states the same amounts (${f("to_partner")} to the partner, ${f("to_sponsor")} to the sponsor side)`);
  const SDOC = j(R + "/lib/sampleDocs.js"), CH = require(R + "/lib/sampleDocChanges.json");
  const stored = [{ id: "n", deal_id: "sample-jv-1", title: "[sale:sample-jv-1-sale-1] Distribution notice: example-gateway-industrial-park-distribution-notice.pdf", abstract: { app: { made_with: "Sample (fictional)" } }, files: [{ name: "example-gateway-industrial-park-distribution-notice.pdf" }] }, { id: "c", deal_id: "sample-jv-1", title: "[sale:sample-jv-1-sale-1] Closing statement: example-gateway-industrial-park-closing-disp.pdf", abstract: { app: { made_with: "Sample (fictional)" } }, files: [{ name: "example-gateway-industrial-park-closing-disp.pdf" }] }];
  check(SDOC.supersededSampleSaleDocs(stored, CH, { fromVersion: 12 }).map((x) => x.id).join() === "n" && SDOC.supersededSampleSaleDocs(stored, CH, { fromVersion: 13 }).length === 0, "a firm that already has the earlier notice gets it replaced; the closing statement is left");
}

// ── The load: only where missing, only its own fields ──
{
  for (const d of v.deals) {
    const a = VD.withSampleVentureData(d.inputs, d.id, { todayISO: T });
    const changed = Object.keys(a).filter((k) => a[k] !== d.inputs[k]).sort().join();
    check(changed === (d.id === "sample-jv-1" ? "businessPlan,capitalProjects,mixTargets,units,uwBaseline" : "businessPlan,capitalProjects,leasing,leasingManager,mixTargets,propertyMgmt,units,uwBaseline") /* 1.1.30: capital projects and the unit mix */ && VD.withSampleVentureData(a, d.id, { todayISO: T }) === a, `${d.inputs.propertyName}: the load adds only ${changed}, once`);
    const before = d.inputs.units, after = a.units;
    check(after.every((u, k) => Object.keys(u).filter((f) => u[f] !== before[k][f]).every((f) => ["credit", "sampleCreditStory", "securityDeposit", "vacantSince", "use", "officeSF"].includes(f))) && underwrite(a).returns.irr === underwrite(d.inputs).returns.irr, `${d.inputs.propertyName}: on a unit only credit, the deposit of a tenant in arrears and Vacant since change; the model does not move`);
  }
  const mine = { ...raw("sample-jv-2"), businessPlan: { revisions: [{ by: "me" }] }, propertyMgmt: { parcels: [{ id: "x" }] }, leasing: { prospects: [{ id: "sample-lp-kept" }], comps: [] } };
  const kept = VD.withSampleVentureData(mine, "sample-jv-2", { todayISO: T });
  check(kept.businessPlan === mine.businessPlan && kept.propertyMgmt.parcels[0].id === "x" && kept.propertyMgmt.bills.length === 3 && kept.leasing.prospects.length === 1, "a plan, a Property Management section or a sample pipeline the asset already has is left alone");
  check(VD.withSampleVentureData(raw("sample-jv-2"), "sample-deal-1", { todayISO: T }) === raw("sample-jv-2") && Object.keys(VD.sampleVentureFundData("Model Fund I", deals, {}, { todayISO: T })).length === 0, "nothing is added to another asset or portfolio");
  const have = { ...v.funds[V.SAMPLE_JV_NAME], delinquency: { months: { "2026-10-31": { rows: [], file: "mine" } } }, distributions: { proposals: [{ id: "mine" }] } };
  check(Object.keys(VD.sampleVentureFundData(V.SAMPLE_JV_NAME, deals, have, { todayISO: T })).length === 0, "a portfolio that has aged receivables and a proposal keeps its own");
  const full = VD.sampleVenturesFull({ deals: [], funds: {}, valuations: {}, gp: null, pipeline: [] }, { baseInputs: DEFAULT_INPUTS, todayISO: T }, V.sampleVenturesToAdd);
  check(full.deals.filter((d) => V.isSampleVentureDeal(d.id)).every((d) => d.inputs.businessPlan?.revisions?.length === 1) && Object.values(full.funds).every((t) => t.distributions?.proposals?.filter((x) => x.status === "proposed").length === 1 && Object.keys(t.delinquency?.months ?? {}).length === 2), "a firm that has neither portfolio gets them with all of this data");
  check(SP.SAMPLE_DATA_VERSION === 14, "the sample data version is 14 (1.1.29 raised it)");
}

console.log(`ventures1128: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
