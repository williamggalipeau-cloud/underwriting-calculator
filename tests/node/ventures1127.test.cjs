// 1.1.27: the sample joint venture's and separate account's documents, the
// building and site facts they read, a tenant that moved out with no
// replacement, and Model Fund I's construction management fee on
// construction spending.
//   - Every document's abstract is read through the app's own compare
//     functions against the two portfolios as the app builds them: no
//     difference (AGENTS.md: everything ties out).
//   - The load steps change only their own fields, on the asset as it is.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const A = j(R + "/lib/dealDocApply.js"), DA = j(R + "/lib/dispositionApply.js"), V = j(R + "/lib/sampleVentures.js"), F = j(R + "/lib/assetFacts.js");
const LH = j(R + "/lib/leaseHistory.js"), GP = j(R + "/lib/gpPartners.js"), SD = j(R + "/lib/sampleDocs.js"), SP = j(R + "/lib/samplePortfolio.js");
const { underwrite } = j(R + "/lib/calculations.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { FIELDS } = j(R + "/lib/dealDocTypes.js");
const man = require(R + "/public/sample-docs/manifest.json");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const T = V.SAMPLE_VENTURE_AS_OF;
const v = V.buildSampleVentures({ baseInputs: DEFAULT_INPUTS, todayISO: T });
const dealOf = (name) => v.deals.find((d) => d.inputs.propertyName === name);
const abs = (m) => JSON.parse(fs.readFileSync(`${R}/public/sample-docs/${m.abstract}`, "utf8"));
const ven = (list) => list.filter((x) => x.file.startsWith("ventures/"));
const usd = (x) => `$${Math.round(Number(x)).toLocaleString("en-US")}`;
const fv = (a, k) => a.fields.find((f) => f.key === k)?.value;

// ── The documents are current and published ──
let current = true;
try { execFileSync("node", [R + "/scripts/sample-deal-docs/venture_docs.cjs", "--check"], { stdio: "pipe" }); } catch { current = false; }
check(current, "docs/sample-deal-docs/ventures is what the generator writes now (run node scripts/sample-deal-docs/venture_docs.cjs, then copy_public.cjs)");
const index = require(R + "/docs/sample-deal-docs/ventures/index.json");
check(index.length === 13 && index.every((d) => fs.existsSync(`${R}/public/sample-docs/ventures/${d.file}`) && fs.readFileSync(`${R}/public/sample-docs/ventures/${d.file}`).equals(fs.readFileSync(`${R}/docs/sample-deal-docs/ventures/${d.file}`)) && fs.readFileSync(`${R}/public/sample-docs/ventures/${d.name}.json`).equals(fs.readFileSync(`${R}/docs/sample-deal-docs/ventures/abstracts/${d.name}.json`))), `13 documents, each published with its abstract (${index.length})`);
// Every quote is a sentence of its document.
const html = (name) => fs.readFileSync(`${R}/docs/sample-deal-docs/ventures/html/${name}.html`, "utf8");
check(index.every((d) => { const a = JSON.parse(fs.readFileSync(`${R}/docs/sample-deal-docs/ventures/abstracts/${d.name}.json`, "utf8")), h = html(d.name); return (a.fields ?? []).every((f) => f.evidence.every((e) => h.includes(e.quote))) && Object.values(a.quotes ?? {}).every((q) => h.includes(String(q).replace(/ \((p\.\d+|§[\d.]+)\)$/, ""))) && /SAMPLE – FICTIONAL/.test(h); }), "every abstract value is quoted from a sentence of its document, and every document is marked fictional");

// ── The joint venture agreement and the separate account agreement ──
for (const [fund, type] of [[V.SAMPLE_JV_NAME, "jva"], [V.SAMPLE_SMA_NAME, "sma"]]) {
  const m = man.deals.find((d) => d.fund === fund && d.docType === type);
  const rows = m ? A.compareDoc({ doc_type: type, abstract: abs(m) }, { inputs: {}, terms: v.funds[fund] }) : [];
  const keys = rows.map((r) => r.docKey);
  check(m && !m.asset && rows.length >= 12 && rows.every((r) => !r.differs) && ["commitments", "gp_commit_pct", "mgmt_fee_pct", "pref_pct", "catch_up_pct", "promote", "tier_method", "investment_period_years", "term_years", "am_fee_paid_to", "pm_fee_paid_to", "cm_fee_paid_to", type === "jva" ? "partner_name" : "client_name"].every((k) => keys.includes(k)),
    `${fund}: the ${type.toUpperCase()} states the portfolio's own terms (${rows.length} terms; differing: ${rows.filter((r) => r.differs).map((r) => `${r.docKey} ${r.appValue}/${r.docValue}`).join(", ") || "none"})`);
}
check(["pref_pct", "catch_up_pct", "promote", "tier_method"].every((k) => FIELDS.sma.some(([f]) => f === k)), "a separate account agreement can carry a preferred return and promote");

// ── The outside GP partners' agreements ──
{
  const list = ven(man.gpAgreements);
  const good = list.length === 2 && list.every((m) => {
    const a = abs(m), draft = GP.agreementFromAbstract(a, { gp: v.gp, funds: v.funds, deals: v.deals, docId: "x" });
    const have = v.gp.agreements.find((x) => x.partnerId === draft.partnerId && x.portfolio === draft.portfolio);
    return have && draft.partnerId && draft.portfolio === m.portfolio && !draft.dealId && Number(draft.capitalPct) === have.capitalPct && Number(draft.gpSideSharePct) === have.gpSideSharePct && draft.effective === have.effective && a.fees === "None";
  });
  check(good, "each outside GP partner's agreement states the share of GP capital, share of promote and date the firm holds for it");
}

// ── The sold asset's closing documents ──
{
  const d = dealOf("Example Gateway Industrial Park"), sale = d.inputs.dispositions.find((s) => s.stage === "closed"), c = sale.closing;
  const docs = man.dispositions.filter((x) => x.saleId);
  check(docs.length === 3 && docs.every((m) => m.asset === d.inputs.propertyName && m.saleId === sale.id) && docs.map((m) => m.docType).sort().join() === "closing_disp,distribution_notice,post_closing", "three documents on the closed sale: closing statement, post-closing true-up, distribution notice");
  const cl = abs(docs.find((m) => m.docType === "closing_disp")), r = DA.dispositionRows(d.inputs, { saleId: sale.id, offerId: null, type: "closing_disp" }, cl);
  check(r.rows.length === 5 && r.rows.every((x) => !x.differs) && Math.abs(c.net - (c.price - c.costs - c.loanPayoff)) < 1 && fv(cl, "net_proceeds") === usd(c.net) && fv(cl, "sale_price") === usd(d.inputs.realizedSalePrice), `the closing statement is the closed sale: date, price, costs, loan payoff and net proceeds (${r.rows.filter((x) => x.differs).map((x) => x.key).join() || "no difference"})`);
  const lib = A.compareDoc({ doc_type: "closing_disp", abstract: cl }, { inputs: d.inputs, terms: v.funds[d.inputs.fundName] }).filter((x) => ["realizedSalePrice", "realizedSellingCosts", "realizedSaleDate"].includes(x.target));
  check(lib.length === 3 && lib.every((x) => !x.differs), "read from the Document Library it gives the asset's realized sale price, selling costs and date");
  const tu = abs(docs.find((m) => m.docType === "post_closing")), dn = abs(docs.find((m) => m.docType === "distribution_notice"));
  check(fv(tu, "sale_price") === usd(c.price) && fv(tu, "amount_due") === "$0" && fv(dn, "amount") === usd(c.net) && fv(dn, "recipient") === v.funds[d.inputs.fundName].partnerName, "the true-up names the sale price and nothing further due; the notice distributes the net proceeds to the joint venture's partner");
}

// ── Building and site facts, the Phase I and the Phase II ──
{
  check(v.deals.every((d) => { const f = V.sampleVentureFacts(d.inputs, d.id); return f && JSON.stringify(d.inputs.building) === JSON.stringify(f.building) && JSON.stringify(d.inputs.site) === JSON.stringify(f.site) && d.inputs.building.footprintSF === d.inputs.squareFootage; }), "each of the four assets carries its building and site facts");
  const d = v.deals.find((x) => x.id === V.SAMPLE_PHASE2_DEAL), docs = ven(man.assetFacts);
  const bad = docs.filter((m) => { const rs = F.factDocRows(abs(m), d.inputs); return m.asset !== d.inputs.propertyName || !rs.length || rs.some((r) => r.differs || r.now == null || !r.quote); }).map((m) => m.name);
  check(docs.map((m) => m.kind).sort().join() === "phase1,phase2" && !bad.length, `the Phase I and Phase II say what the asset holds (${bad.join() || "no difference"})`);
  const open = (site) => F.assetFacts({ ...d.inputs, site }).environmentalOpen;
  check(d.inputs.site.phase1Result === "Recognized environmental condition" && d.inputs.site.phase2Result === "Clean" && !open(d.inputs.site) && open({ ...d.inputs.site, phase2Result: "" }) && open({ ...d.inputs.site, phase2Result: "Remediation under way" }) && !open({ phase1Result: "Clean", phase2Result: "Not needed" }),
    "a clean Phase II closes the condition its Phase I recognized; with no Phase II, or remediation under way, it stays open");
  const mine = { ...d.inputs, building: { clearHeightFt: 31 }, site: {} };
  const kept = V.withSampleVentureFacts(mine, d.id);
  check(kept.building.clearHeightFt === 31 && Object.keys(kept.building).length === 1 && kept.site.zoning && V.withSampleVentureFacts(d.inputs, d.id) === d.inputs && V.withSampleVentureFacts(d.inputs, "other") === d.inputs, "the load fills a section only where the asset has none, and nothing on another asset");
}

// ── The appraisals behind the year-end marks ──
{
  const docs = ven(man.deals).filter((m) => m.docType === "appraisal");
  const bad = docs.filter((m) => { const d = dealOf(m.asset), r = A.appraisalMark({ id: "x", title: m.title, abstract: abs(m) }, d.inputs, v.valuations[d.id]); return !r || r.quarter !== "2025-12-31" || r.rows.some((x) => x.differs) || !(v.valuations[d.id]["2025-12-31"].value > 0); }).map((m) => m.name);
  check(docs.length === 4 && !bad.length, `four appraisals, each the asset's 12/31/2025 mark: value, source and appraiser (${bad.join() || "no difference"})`);
}

// ── The loader files them on the right portfolio, asset and sale ──
{
  const fundI = buildSampleFund({ todayISO: T }).deals, all = [...fundI, ...v.deals], funds = { "Model Fund I": {}, ...v.funds };
  const plan = SD.sampleDocPlan(man, { deals: all, funds });
  const added = plan.add.filter((x) => String(x.file).startsWith("ventures/"));
  check(added.length === 11 && added.filter((x) => x.kind === "disposition").every((x) => x.saleId === "sample-jv-1-sale-1" && x.dealId === "sample-jv-1") && added.filter((x) => !x.dealId).map((x) => x.fund).sort().join() === `${V.SAMPLE_JV_NAME},${V.SAMPLE_SMA_NAME}` && added.filter((x) => x.kind === "fact").every((x) => x.dealId === V.SAMPLE_PHASE2_DEAL),
    `the load adds the 11 fund, asset, sale and fact documents (the two GP agreements go with the GP partners): ${added.length}`);
  const noVen = SD.sampleDocPlan(man, { deals: fundI, funds: { "Model Fund I": {} } });
  check(!noVen.add.some((x) => String(x.file).startsWith("ventures/")) && noVen.skip.filter((x) => String(x.file).startsWith("ventures/")).length === 11, "a firm without the two portfolios gets none of their documents");
  const noSale = SD.sampleDocPlan(man, { deals: all.map((d) => (d.id === "sample-jv-1" ? { ...d, inputs: { ...d.inputs, dispositions: [] } } : d)), funds });
  check(noSale.skip.filter((x) => x.reason?.includes("no such sale")).length === 3 && !noSale.add.some((x) => x.saleId), "the closing documents are filed only on the closed sale, never on a new one");
  const stored = added.filter((x) => x.kind === "deal").map((x) => ({ deal_id: x.dealId, fund_name: x.fund ?? "", files: [{ name: x.file.split("/").pop() }] }));
  check(!SD.sampleDocPlan(man, { deals: all, funds, docs: stored }).add.some((x) => x.kind === "deal" && String(x.file).startsWith("ventures/")), "documents already uploaded are not added twice");
}

// ── A tenant that moved out with no replacement ──
{
  const d = dealOf("Example Summit Business Center").inputs;
  const u = d.units.find((x) => { const t = LH.leaseToday(x, d, T); return t.status === "later" && t.end > "2028-01-01" && LH.laterLeasesOf(x).length === 1; });
  const before = underwrite(d), t0 = LH.leaseToday(u, d, T);
  check(LH.recordMoveOut(d, u.id, { date: "" }).error && LH.recordMoveOut(d, u.id, { date: "2020-01-01" }).error && LH.recordMoveOut(d, "nope", { date: "2026-09-30" }).error, "a move-out needs a date on or after the purchase, on a unit of the asset");
  const vacant = d.units.find((x) => x.leaseStatus !== "occupied" && !LH.laterLeasesOf(x).length);
  check(!vacant || !!LH.recordMoveOut(d, vacant.id, { date: "2026-09-30" }).error, "a unit with no tenant on that date cannot have a move-out");
  const r = LH.recordMoveOut(d, u.id, { date: "2026-09-30", reason: "terminated", note: "test" }, { by: "t@example.com", at: "2026-10-01T00:00:00Z" });
  const u1 = r.inputs.units.find((x) => x.id === u.id), t1 = LH.leaseToday(u1, r.inputs, T), row = LH.unitToday(u1, r.inputs, T);
  check(!r.error && r.moveOut.tenantName === t0.tenantName && t1.status === "vacant" && t1.start === "2026-10-01" && t1.movedOut.tenantName === t0.tenantName && row.leaseStatus === "vacant" && row.tenantName === "" && row.vacantSince === "2026-10-01" && row.movedOutTenant === t0.tenantName, "the unit is vacant from the day after, and remembers who left");
  check(r.inputs.units.filter((x) => x.id !== u.id).every((x, i) => x === d.units.filter((y) => y.id !== u.id)[i]) && Object.keys(u1).filter((k) => u1[k] !== u[k]).join() === "moveOut", "only the unit's moveOut field changes");
  check(LH.leaseToday(u1, r.inputs, "2026-09-30").status === "later" && LH.leaseToday(u1, r.inputs, "2026-09-30").end === "2026-09-30", "on its last day the lease is still running, and ends that day");
  check(!LH.endedLeases(r.inputs, T).some((x) => x.unitId === u.id) && LH.leaseHistory(u1, r.inputs)[0].type === "moveout", "it is not flagged as a lease that ended with nothing recorded; the history shows the move-out first");
  const after = underwrite(r.inputs), rev = (x) => x.annualCashFlows.reduce((s, c) => s + c.noi, 0);
  check(rev(after) < rev(before) && after.returns.irr < before.returns.irr, `the model loses the rent from the move-out and re-lets after the downtime (IRR ${before.returns.irr.toFixed(2)}% to ${after.returns.irr.toFixed(2)}%)`);
  // A lease recorded afterwards takes over.
  const again = LH.addLaterLease(r.inputs, u.id, { kind: "new", tenantName: "Example Next Tenant LLC", start: "2027-01-01", end: "2031-12-31", rentPSF: 14, escalationPct: 3 });
  const u2 = again.inputs.units.find((x) => x.id === u.id);
  check(!again.error && LH.leaseToday(u2, again.inputs, T).status === "gap" && LH.leaseToday(u2, again.inputs, "2027-02-01").tenantName === "Example Next Tenant LLC" && isFinite(underwrite(again.inputs).returns.irr), "a lease signed afterwards takes over: vacant until it starts, then that tenant");
  const back = LH.removeMoveOut(r.inputs, u.id);
  check(!back.units.find((x) => x.id === u.id).moveOut && Math.abs(underwrite(back).returns.irr - before.returns.irr) < 1e-9, "removing the move-out restores the model exactly");
  // The lease at purchase: early, and holding over.
  const p = d.units.find((x) => x.leaseStatus === "occupied" && !LH.laterLeasesOf(x).length) ?? null;
  const base = { ...d, units: d.units.map((x) => ({ ...x, laterLeases: [] })) }, pu = base.units.find((x) => x.leaseStatus === "occupied" && x.monthsRemaining > 12);
  const early = LH.recordMoveOut(base, pu.id, { date: LH.leaseToday(pu, base, base.acquisitionDate).end > "2023-09-30" ? "2023-09-30" : base.acquisitionDate, reason: "default" });
  check(!early.error && LH.leaseToday(early.inputs.units.find((x) => x.id === pu.id), early.inputs, "2023-12-31").status === "vacant" && underwrite(early.inputs).annualCashFlows[0].noi < underwrite(base).annualCashFlows[0].noi, "the lease at purchase can end early with a move-out: the unit is vacant and that year's NOI is lower");
  void p;
  // No move-out: the model is unchanged.
  check(LH.moveOutMonth(u, d) === null && LH.moveOutOf(u, d) === null, "a unit with no move-out is read exactly as before");
}
// The sample move-out, on the asset behind plan.
{
  const d = v.deals.find((x) => x.id === V.SAMPLE_MOVE_OUT.dealId), moved = d.inputs.units.filter((u) => u.moveOut);
  const t = moved[0] ? LH.leaseToday(moved[0], d.inputs, T) : null;
  check(moved.length === 1 && moved[0].moveOut.date === V.SAMPLE_MOVE_OUT.date && moved[0].moveOut.tenantName && t.status === "vacant" && t.movedOut && v.deals.filter((x) => x.id !== d.id).every((x) => !x.inputs.units.some((u) => u.moveOut)), "one tenant moved out with no replacement, on the asset behind plan only");
  const bare = { ...d.inputs, units: d.inputs.units.map((u) => { const { moveOut, ...rest } = u; void moveOut; return rest; }) };
  const again = V.withSampleMoveOut(bare, d.id);
  check(again.units.find((u) => u.moveOut)?.id === moved[0].id && V.withSampleMoveOut(d.inputs, d.id) === d.inputs && V.withSampleMoveOut(bare, "sample-jv-2") === bare && Object.keys(again).filter((k) => again[k] !== bare[k]).join() === "units", "the load adds it once, to the same unit, and changes nothing else");
}

// ── Model Fund I: the construction management fee on construction spending ──
{
  const f = buildSampleFund({ todayISO: T }).deals;
  check(f.every((d) => d.inputs.cmFeeBasis === "spend" && d.quick.cmFeeBasis === "spend"), "every Model Fund I asset charges the fee on construction spending");
  const old = { ...f[0].inputs, cmFeeBasis: undefined }, next = SP.withSampleCmFeeBasis(old, "sample-deal-1");
  check(next.cmFeeBasis === "spend" && Object.keys(next).filter((k) => next[k] !== old[k]).join() === "cmFeeBasis" && SP.withSampleCmFeeBasis({ ...old, cmFeeBasis: "value" }, "sample-deal-1").cmFeeBasis === "spend", "the load switches an asset still on the earlier sample fee, and changes only that field");
  check(SP.withSampleCmFeeBasis({ ...old, cmFeePct: 2 }, "sample-deal-1").cmFeeBasis === undefined && SP.withSampleCmFeeBasis(next, "sample-deal-1") === next && SP.withSampleCmFeeBasis(old, "my-deal").cmFeeBasis === undefined && SP.withSampleCmFeeBasis(old, "sample-jv-1") === old, "a fee the user changed, an asset already switched and any other asset are left alone");
  const a = underwrite({ ...f[0].inputs, cmFeeBasis: "value" }), b = underwrite(f[0].inputs);
  check(b.returns.irr > a.returns.irr && Math.abs(b.annualCashFlows[0].noi - a.annualCashFlows[0].noi) < 1e-6, "the fee is below NOI: the return rises, NOI does not move");
  const DOCS = require(R + "/lib/sampleDocChanges.json"), TERMS = require(R + "/lib/sampleTermChanges.json");
  check(DOCS["12"].join() === "airport-flex-ic-memo.pdf,airport-flex-ic-presentation.pdf" && TERMS["12"].length === 2 && TERMS["12"].every(([id, field]) => id === "sample-deal-1" && field.startsWith("icApproved.")), "the two documents that state a return are replaced, and the IC approval's return follows");
  check(SP.SAMPLE_DATA_VERSION === 12, "the sample data version is 12");
}

console.log(`ventures1127: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
