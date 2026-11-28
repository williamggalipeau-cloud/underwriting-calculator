// 1.1.12 (user, 11/27: "doing this manually is NOT an option"): when an owner
// opens a firm whose Model Fund I sample material is behind, Baywise adds it
// by itself: tenant credit and aged rent, the sample documents and credit
// reports, and the GP partners. No clicks. A second open adds nothing.
// Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
const docs = [], leases = [], uploads = [], dealAbs = [], leaseAbs = [];
let saved = null, fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
// 1.1.13: documents from an earlier sample version are in the store. The two
// earlier sample copies (one rewritten, one retired) are replaced; the user's
// own documents on the same assets are never touched, even one that shares a
// sample file name.
const old = (id, deal, name, extra = {}) => ({ id, workspace_id: "w1", deal_id: deal, fund_name: "Model Fund I", doc_type: "other", title: name, files: [{ name, path: `w1/${deal}/${id}/${name}` }], status: "abstracted", abstract: { app: { made_with: "Sample (fictional)" } }, created_at: "2026-11-25T00:00:00Z", ...extra });
docs.push(old("old-om", "sample-deal-1", "airport-flex-om.pdf"), old("old-r9sale", "sample-deal-2", "route9-closing-disp.pdf"),
  old("mine-1", "sample-deal-1", "my-own-inspection.pdf"), old("mine-2", "sample-deal-1", "airport-flex-loi.pdf", { abstract: { app: { made_with: "CREparser Deal Review", validated: true } } }));
// An earlier sample lease (a tenant that was never on the rent roll), an
// earlier sale document filed on a still-empty sample sale, and the user's
// own lease: the first two are replaced, the third is kept.
leases.push({ id: "old-lease", workspace_id: "w1", deal_id: "sample-deal-1", tenant: "Desert Aero Parts LLC", title: "Desert Aero Parts LLC lease (sample)", files: [{ name: "02-airport-flex-park-desert-aero.pdf", path: "w1/sample-deal-1/old-lease/a.pdf" }], status: "abstracted", abstract: { app: { made_with: "CREparser Lease Abstraction" } }, created_at: "2026-11-25T00:00:00Z" },
  { id: "my-lease", workspace_id: "w1", deal_id: "sample-deal-1", tenant: "My Own Tenant LLC", title: "My Own Tenant lease", files: [{ name: "my-own-lease.pdf", path: "w1/sample-deal-1/my-lease/a.pdf" }], status: "uploaded", abstract: null, created_at: "2026-11-25T00:00:00Z" });
docs.push(old("old-sale-doc", "sample-deal-2", "route9-closing-disp.pdf", { doc_type: "closing_disp", title: "[sale:oldsale] Closing statement: route9-closing-disp.pdf" }));
const r9 = data.deals.find((d) => d.id === "sample-deal-2");
r9.inputs.dispositions = [{ id: "oldsale", scope: "whole", unitIds: [], reason: "plan_complete", targetPrice: null, targetCapPct: null, targetClose: "", stage: "marketing", withdrawnReason: "", bovs: [], brokerChosen: "", listing: { feePct: null, termMonths: null, exclusions: "" }, marketing: { casSigned: 0, tours: 0, callForOffers: "" }, contract: { psaDate: "", deposit: null, depositDue: "", hardDate: "", ddStart: "", ddDeadline: "", loanClosing: "", closingDate: "", priceLog: [] }, closing: null, offers: [], startedFrom: "Sample sale (fictional)", createdAt: "2026-11-25T00:00:00.000Z" }];
const removed = [], removedLeases = [];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => { localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); window.__baywiseSampleSync = true; }, JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    const one = (x) => (acc.includes("vnd.pgrst.object") ? JSON.stringify(x) : JSON.stringify([x]));
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); ws.data = saved.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/rpc/save_deal_abstract")) { const b = JSON.parse(req.postData()); dealAbs.push(b); const row = docs.find((d) => d.id === b.doc); if (row) { row.abstract = b.abstract; row.status = "abstracted"; } body = '"abstracted"'; }
    else if (u.includes("/rpc/save_lease_abstract")) { leaseAbs.push(JSON.parse(req.postData())); body = '"abstracted"'; }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/")) { if (req.method() === "POST" || req.method() === "PUT") uploads.push(u); body = JSON.stringify({ Key: "x" }); }
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; docs.push(row); body = one(row); }
      else if (req.method() === "DELETE") { const id = decodeURIComponent(u).match(/id=eq\.([^&]+)/)?.[1]; const i = docs.findIndex((d) => d.id === id); if (i >= 0) removed.push(...docs.splice(i, 1)); }
      else body = JSON.stringify(docs);
    } else if (u.includes("/lease_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; leases.push(row); body = one(row); }
      else if (req.method() === "DELETE") { const id = decodeURIComponent(u).match(/id=eq\.([^&]+)/)?.[1]; const i = leases.findIndex((d) => d.id === id); if (i >= 0) removedLeases.push(...leases.splice(i, 1)); }
      else body = JSON.stringify(leases);
    } else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  const alerts = [];
  p.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  // Nothing is clicked from here on.
  const notice = () => p.getByText(/Model Fund I sample data updated:/).first();
  for (let i = 0; i < 120 && !(await notice().isVisible().catch(() => false)); i++) await p.waitForTimeout(500);
  const msg = (await notice().innerText().catch(() => "")) || "";
  check(/tenant credit and aged rent, \d+ sample documents and \d+ GP agreements? added, 4 earlier sample documents and leases replaced/.test(msg), `the update ran by itself: ${msg.slice(0, 240)}`);
  check(leases.length === 10 && leaseAbs.length === 9 && leases.some((l) => l.id === "my-lease"), `the 9 sample leases with abstracts, and the user's own lease (${leases.length}, ${leaseAbs.length})`);
  check(removedLeases.map((l) => l.id).join() === "old-lease" && leases.some((l) => l.deal_id === "sample-deal-1" && l.tenant === "Blue Mesa Fulfillment") && !leases.some((l) => /Desert Aero/.test(l.tenant)), "the earlier sample lease (a tenant not on the rent roll) is replaced by the lease of a tenant that is; the user's lease is kept");
  const gpa = docs.filter((d) => /^\[gp-agreement:/.test(d.title ?? ""));
  const credit = docs.filter((d) => /^\[leasing:tenant:/.test(d.title ?? ""));
  const saleDocs = docs.filter((d) => /^\[sale:/.test(d.title ?? ""));
  const facts = docs.filter((d) => /^\[(fact:[a-z0-9_]+|snda:[^\]]*)\] /.test(d.title ?? ""));
  const pmDocs = docs.filter((d) => /^\[pm:[a-z]+\] /.test(d.title ?? "")), rsDocs = docs.filter((d) => /^\[research:[^\]]+\] /.test(d.title ?? ""));
  // 1.1.23: research files are filed only on a research item the asset holds (this firm has no market data or rent comps, so no market report or rent survey).
  const RS_IDS = ["srs-1-appraisal", "srs-1-environmental", "srs-1-pca", "srs-1-credit", "srs-1-zoning", "srs-3-bov"];
  const heldItems = (saved?.new_data ?? saved?.data)?.deals?.flatMap((d) => (d.inputs?.research ?? []).map((r) => r.id)) ?? [];
  const rsOn = rsDocs.map((d) => /^\[research:([^\]]+)\]/.exec(d.title)[1]).sort();
  check(pmDocs.length === 13 && pmDocs.every((d) => d.abstract), `1.1.21 and 1.1.23: 13 Property Management documents, each with its abstract (${pmDocs.length})`);
  check(rsOn.length > 0 && rsOn.every((id) => RS_IDS.includes(id)) && rsOn.join() === RS_IDS.filter((id) => heldItems.includes(id)).sort().join(), `1.1.23: a research file on each research item the load added, and no other (${rsOn.join(", ")}; items saved: ${RS_IDS.filter((id) => heldItems.includes(id)).join(", ")})`);
  const acqDocs = docs.filter((d) => /^\[acq\] /.test(d.title ?? "")), lsgDocs = docs.filter((d) => /^\[leasing:(sample-dlp-[^\]]+|comps)\] /.test(d.title ?? "")), billDocs = docs.filter((d) => d.doc_type === "billing");
  const dlp = (saved?.new_data ?? saved?.data)?.deals?.find((d) => d.id === "sample-deal-1")?.inputs?.leasing?.prospects?.filter((x) => x.id === "sample-dlp-airport-flex-park-1") ?? [];
  check(acqDocs.length === 9 && acqDocs.every((d) => d.abstract && d.deal_id === "sample-deal-1") && billDocs.length === 1 && billDocs[0].abstract?.charges?.length === 2, `1.1.23: 9 acquisition documents and the tenant billing on Airport Flex Park, each with its abstract (${acqDocs.length}, ${billDocs.length})`);
  check(dlp.length === 1 && dlp[0].stage === "leaseout" && lsgDocs.length === 5 && lsgDocs.every((d) => d.title.startsWith("[leasing:sample-dlp-airport-flex-park-1] ") && d.abstract), `1.1.23: the prospect with fixed terms is saved once, with its 5 documents; no rent comp report, because this firm has no rent comps (${dlp.length} prospect, ${lsgDocs.length} documents)`);
  check(credit.length === 8 && gpa.length >= 1 && facts.length === 16 && facts.every((d) => d.abstract) && docs.length === 18 + 10 + credit.length + gpa.length + facts.length + pmDocs.length + rsDocs.length + acqDocs.length + lsgDocs.length + billDocs.length + 2, `18 fund and asset documents, 10 sale documents, 8 credit reports, ${gpa.length} GP agreement(s), 16 asset documents and SNDAs (1.1.17, each with its abstract) and 1.1.23's, with the user's 2, among ${docs.length} documents (the sample LOI is skipped: the user already has a document of that name)`);
  const names = (d) => (d.files ?? []).map((f) => f.name);
  check(removed.map((d) => d.id).sort().join() === "old-om,old-r9sale,old-sale-doc" && docs.some((d) => d.id === "mine-1") && docs.some((d) => d.id === "mine-2"), `the earlier sample copies were removed; the user's own documents were kept (removed: ${removed.map((d) => d.id).join(", ")})`);
  check(docs.filter((d) => d.deal_id === "sample-deal-1" && names(d).includes("airport-flex-om.pdf")).length === 1 && !docs.some((d) => !/^\[sale:/.test(d.title ?? "") && names(d).includes("route9-closing-disp.pdf")), "the rewritten offering memo is there once; the retired Route 9 test sale statement is gone");
  for (let i = 0; i < 60 && !(saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"]?.sampleDataVersion; i++) await p.waitForTimeout(500);
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.funds?.["Model Fund I"]?.sampleDataVersion === 11, `the fund records the sample data version, saved without a click (${sd?.funds?.["Model Fund I"]?.sampleDataVersion})`);
  {
    // 1.1.26: the sample joint venture and separate account, as actually saved.
    const jv = sd?.funds?.["Sample Industrial Venture I"], sma = sd?.funds?.["Sample Separate Account A"];
    check(jv?.type === "Joint Venture" && jv.partnerName === "Example Pension Fund" && jv.targetEquity === 80_000_000 && jv.mgmtFeePct === 0.75 && jv.prefPct === 8 && jv.gpCommitPct === 10 && JSON.stringify(jv.tiers.map((t) => [t.irrThreshold, t.gpSplit])) === "[[14,20],[null,30]]", `saved: the joint venture with its terms (${jv?.type}, ${jv?.targetEquity}, fee ${jv?.mgmtFeePct})`);
    check(sma?.type === "Separate Account" && sma.clientName === "Fictional Insurance Company" && sma.targetEquity === 25_000_000 && sma.mgmtFeePct === 1.25 && sma.prefPct === 8, `saved: the separate account with its terms (${sma?.type}, fee ${sma?.mgmtFeePct})`);
    const party = (t) => (t?.gpParties ?? []).find((g) => g.who === "external");
    check(party(jv)?.name === "Placeholder Capital Partners LP" && party(jv).capitalPct === 50 && party(jv).promotePct === 25 && party(sma)?.name === "Demo Holdings Family Office" && party(sma).capitalPct === 50 && party(sma).promotePct === 25, "saved: each portfolio's outside GP partner funds half the GP capital and takes a quarter of the promote");
    const gpSaved = sd?.gpPartners ?? sd?.settings?.gpPartners;
    check((gpSaved?.agreements ?? []).filter((a) => ["gpa-sample-jv", "gpa-sample-sma"].includes(a.id) && a.status === "checked").length === 2, `saved: the two agreements are in the firm's GP partner list (${(gpSaved?.agreements ?? []).map((a) => a.id).join(", ")})`);
    const va = (sd?.deals ?? []).filter((d) => /^sample-(jv|sma)-\d+$/.test(d.id));
    const by = (id) => va.find((d) => d.id === id)?.inputs;
    check(va.length === 4 && va.filter((d) => d.inputs.fundName === "Sample Industrial Venture I").length === 3 && by("sample-sma-1")?.fundName === "Sample Separate Account A" && va.every((d) => d.inputs.units.length >= 60 && d.inputs.units.length <= 80 && d.inputs.purchasePrice >= 48_000_000 && d.inputs.purchasePrice <= 51_000_000), `saved: four assets of about $50,000,000 with 60 to 80 units (${va.map((d) => `${d.id}:${d.inputs.units.length}`).join(", ")})`);
    check(va.every((d) => d.inputs.units.some((u) => (u.laterLeases ?? []).length > 0) && d.inputs.uwBaseline?.inputs?.units?.length === d.inputs.units.length), "saved: each has leases signed since purchase and its closing model kept as the underwriting baseline");
    const sold = by("sample-jv-1");
    check(sold?.acquisitionDate === "2022-06-15" && sold.dispositions?.[0]?.stage === "closed" && sold.dispositions[0].closing?.date === "2026-06-30" && sold.realizedSaleDate === "2026-06-30" && sold.realizedSalePrice === sold.dispositions[0].closing.price, `saved: the asset bought 6/15/2022 was sold 6/30/2026 (${sold?.dispositions?.[0]?.closing?.price})`);
    const behind = by("sample-jv-3");
    const lastMark = Object.entries(sd?.valuations?.["sample-jv-3"] ?? {}).sort().at(-1)?.[1]?.value;
    check(behind && lastMark > 0 && lastMark < behind.purchasePrice + (behind.capexBudget ?? 0) && behind.units.filter((u) => u.leaseStatus !== "occupied" && !(u.laterLeases ?? []).length).length >= 15, `saved: the asset behind plan is marked below cost and still has vacant units (${lastMark})`);
    check(["sample-jv-1", "sample-jv-2", "sample-jv-3", "sample-sma-1"].every((id) => Object.keys(sd?.valuations?.[id] ?? {}).length >= 4), "saved: every one of the four has its marks");
    const rows = (sd?.pipeline?.deals ?? []).filter((r) => /^sample-pl-jv-/.test(r.id));
    check(rows.length === 2 && rows.every((r) => r.targetFund === "Sample Industrial Venture I" && r.dealId && (sd.deals ?? []).some((d) => d.id === r.dealId)) && rows.map((r) => r.stage).sort().join() === "loi,psa", `saved: two joint venture pipeline deals, one under contract and one at LOI, each screened (${rows.map((r) => r.stage).join(", ")})`);
  }
  {
    // 1.1.22: the fund-level sample records, as actually saved.
    const mf9 = sd?.funds?.["Model Fund I"] ?? {}, own = (sd?.deals ?? []).filter((d) => String(d.id).startsWith("sample-deal-") && d.inputs?.acquisitionDate <= new Date().toISOString().slice(0, 10));
    const ca = mf9.capitalActivity ?? [];
    check(ca.length === own.length && ca.every((a) => a.type === "draw" && a.amount > 0 && own.some((d) => a.purpose === `acq:${d.id}` && a.date === d.inputs.acquisitionDate)), `1.1.22: one sub line draw per purchase is saved (${ca.length} of ${own.length})`);
    const selling = (sd?.deals ?? []).filter((d) => (d.inputs?.dispositions ?? []).some((x) => ["preparing", "marketing", "offers", "contract"].includes(x.stage))).map((d) => d.id).sort();
    check(JSON.stringify(Object.keys(mf9.sellHold?.decisions ?? {}).sort()) === JSON.stringify(selling) && selling.length > 0, `1.1.22: Sell now is saved on the assets being sold (${Object.keys(mf9.sellHold?.decisions ?? {})})`);
    const pv = mf9.fundPlan?.versions ?? [];
    check(pv.length === 1 && pv[0].label === "Original plan" && Number.isFinite(pv[0].returns?.netLpIrr) && Math.abs((mf9.fundPlanTargets?.netIrrPct ?? NaN) - pv[0].returns.netLpIrr) < 0.006, `1.1.22: the original fund plan and its targets are saved (${pv.length} version, target ${mf9.fundPlanTargets?.netIrrPct})`);
    const iss = mf9.reports?.issued ?? [];
    check(iss.length === 1 && iss[0].kind === "internal" && (iss[0].report?.portfolio ?? []).length > 0 && !!iss[0].report?.benchmarks, `1.1.22: last quarter's internal report is saved as issued, with its benchmark section (${iss.length}, ${iss[0]?.quarter})`);
    const bm = sd?.comps?.benchmarks ?? {};
    check(Object.keys(bm.index ?? {}).length === 3 && Object.keys(bm.vintage ?? {}).length === 2 && Object.keys(bm.monthly ?? {}).length === 7, `1.1.22: the sample benchmark series are saved (${Object.keys(bm.index ?? {}).length} indexes, ${Object.keys(bm.vintage ?? {}).length} vintage sources, ${Object.keys(bm.monthly ?? {}).length} monthly)`);
    const screened = (sd?.deals ?? []).some((d) => d.pipelineId === "sample-pl-1" && !d.inputs?.fundName);
    check(((mf9.impactScenarios ?? []).length === 1) === screened, `1.1.22: a Portfolio Impact scenario is saved when the firm has the screened pipeline deal (${(mf9.impactScenarios ?? []).length} saved; screened: ${screened})`);
  }
  const withCredit = (sd?.deals ?? []).filter((d) => (d.inputs?.units ?? []).some((u) => u.credit)).length;
  check(withCredit >= 5 && sd?.gpPartners?.partners?.filter((x) => !/^gpp-sample-/.test(x.id)).length === 2 && gpa.length === 2 && (sd?.gpPartners?.agreements ?? []).filter((a) => a.status === "checked" && !/^gpa-sample-/.test(a.id)).length === 2 && sd.gpPartners.partners.length === 4, `tenant credit on ${withCredit} assets; Model Fund I's 2 GP partners with their 2 agreements switched on, and the 2 partners of the joint venture and separate account`);
  const parties = (sd?.funds?.["Model Fund I"]?.gpParties ?? []).filter((x) => x.partnerId);
  const fcp = parties.find((x) => /Fictional Capital/.test(x.name)), sfo = parties.find((x) => /Sample Family/.test(x.name));
  check(fcp?.capitalPct === 40 && sfo?.terms?.[0]?.dealId && sfo.terms[0].capitalPct === 50, `the fund's GP parties match the agreements: Fictional Capital Partners 40% of GP capital fund-wide; Sample Family Office 50% on Granite Ave only (${JSON.stringify(parties.map((x) => [x.name, x.capitalPct]))})`);
  const snda = ["sample-deal-1", "sample-deal-2"].map((k) => { const i = sd?.deals?.find((d) => d.id === k)?.inputs ?? {}; const st = (i.units ?? []).map((u) => u.snda?.status).filter(Boolean); return `${i.loanTerms?.sndaRule}:${st.filter((x) => x === "signed").length}/${st.filter((x) => x === "requested").length}`; }).join();
  check(snda === "all:2/2,all:2/2", `1.1.18: the SNDA rule and each lease's status are saved on the two assets with a sample loan agreement (${snda})`);
  {
    // 1.1.21: what the load saved, not what the builder makes (AGENTS.md: no manual loading).
    const sa = (sd?.deals ?? []).filter((d) => d.id.startsWith("sample-deal-"));
    const pmOk = sa.filter((d) => ["parcels", "bills", "policies", "items", "contracts"].every((k) => (d.inputs.propertyMgmt?.[k] ?? []).length > 0)).length;
    const rsOk = sa.filter((d) => (d.inputs.research ?? []).some((r) => r.type === "rent_survey" || r.type === "market")).length;
    const steps = sa.filter((d) => (d.inputs.units ?? []).filter((u) => (u.rentSteps ?? []).length > 0).length === 1).length;
    check(sa.length === 9 && pmOk === 9, `1.1.21: every sample asset is saved with its Property Management rows (${pmOk} of ${sa.length})`);
    const canHave = sa.filter((d) => (d.inputs.leasing?.comps ?? []).length > 0 || (sd?.comps?.market?.stats ?? []).some((x) => x.submarketId === d.inputs.submarketId)).length;
    check(rsOk === canHave, `1.1.21: third-party research is saved on every asset the firm holds rent comps or market data for (${rsOk} of ${canHave}; this firm has neither)`);
    check(steps === 9, `1.1.21: every sample asset is saved with its sample lease's rent steps on one unit (${steps} of ${sa.length})`);
    const rsFiles = sa.flatMap((d) => (d.inputs.research ?? []).filter((r) => r.fileName).map((r) => `[research:${r.id}] ${r.fileName}`));
    check(rsFiles.length === rsDocs.length && rsFiles.every((t) => rsDocs.some((d) => d.title === t)), "1.1.21: a market report is filed only under a research item that names it");
  }
  check((sd?.deals ?? []).filter((d) => d.id.startsWith("sample-deal-")).every((d) => Object.keys(d.inputs.building ?? {}).length >= 20 && Object.keys(d.inputs.site ?? {}).length >= 15), "1.1.17: every sample asset is saved with its building and site facts");
  const d1 = sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs, mf = sd?.funds?.["Model Fund I"];
  check(d1?.loanTerms?.lender === "Desert Mountain Bank" && d1?.dealTerms?.psaDate === "2025-11-14" && d1?.executedCaps?.[0]?.provider === "Atlas Derivatives Bank" && d1?.icApproved?.approval_date === "2025-12-18", "the terms the documents state are on the asset (lender, contract dates, executed cap, IC approval)");
  check((sd?.deals ?? []).filter((d) => d.id.startsWith("sample-deal-")).every((d) => d.inputs.propertyManager && d.inputs.propertyManagementFirm?.type === "sponsor"), "every sample asset has a property manager");
  check((mf?.entities ?? []).length === 11 && mf.entities.some((e) => e.name === "Model Fund I, L.P.") && (mf?.limits ?? []).length === 8, `Model Fund I has its legal entities and the LPA's limits (${mf?.entities?.length} entities, ${mf?.limits?.length} limits)`);
  // The sales in progress: the earlier, empty sample sale keeps its id and now holds what the documents state.
  const s9 = sd?.deals?.find((d) => d.id === "sample-deal-2")?.inputs?.dispositions ?? [], s3 = sd?.deals?.find((d) => d.id === "sample-deal-3")?.inputs?.dispositions ?? [];
  check(s9.length === 1 && s9[0].id === "oldsale" && s9[0].stage === "contract" && s9[0].bovs.length === 1 && s9[0].offers.length === 1 && s9[0].contract.closingDate === "2027-01-20" && !s9[0].closing, `Route 9's sample sale kept its id and is under contract as its documents state (BOV $${s9[0]?.bovs?.[0]?.price?.toLocaleString("en-US")}, offer $${s9[0]?.offers?.[0]?.price?.toLocaleString("en-US")}, closing ${s9[0]?.contract?.closingDate}); nothing is sold`);
  check(s3.length === 1 && s3[0].stage === "offers" && saleDocs.length === 10 && saleDocs.filter((d) => /Listing agreement|Offering memo|Estoppel/.test(d.title)).every((d) => d.deal_id === "sample-deal-3" && d.title.startsWith(`[sale:${s3[0].id}]`)) && saleDocs.filter((d) => d.deal_id === "sample-deal-2").every((d) => d.title.startsWith("[sale:oldsale")) && !saleDocs.some((d) => /closing/.test(d.title)), "the 10 sale documents are filed on those sales (Route 9's on the sale it already had; 1.1.23's listing agreement, offering memo and estoppel on Harbor Light's); the earlier closing statement is gone");
  check((sd?.auditLog ?? []).some((e) => /sample data updated automatically/.test(JSON.stringify(e))), "logged in the change log");
  // A second open: already current, so nothing is added.
  const nDocs = docs.length, nUp = uploads.length;
  await p.reload();
  await p.waitForTimeout(9000);
  check(docs.length === nDocs && uploads.length === nUp && !(await notice().isVisible().catch(() => false)), "opening again adds nothing");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
