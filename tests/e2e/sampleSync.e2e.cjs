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
  check(credit.length === 8 && gpa.length >= 1 && docs.length === 18 + 7 + credit.length + gpa.length + 2, `18 fund and asset documents, 7 sale documents, 8 credit reports and ${gpa.length} GP agreement(s), with the user's 2, among ${docs.length} documents (the sample LOI is skipped: the user already has a document of that name)`);
  const names = (d) => (d.files ?? []).map((f) => f.name);
  check(removed.map((d) => d.id).sort().join() === "old-om,old-r9sale,old-sale-doc" && docs.some((d) => d.id === "mine-1") && docs.some((d) => d.id === "mine-2"), `the earlier sample copies were removed; the user's own documents were kept (removed: ${removed.map((d) => d.id).join(", ")})`);
  check(docs.filter((d) => d.deal_id === "sample-deal-1" && names(d).includes("airport-flex-om.pdf")).length === 1 && !docs.some((d) => !/^\[sale:/.test(d.title ?? "") && names(d).includes("route9-closing-disp.pdf")), "the rewritten offering memo is there once; the retired Route 9 test sale statement is gone");
  for (let i = 0; i < 60 && !(saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"]?.sampleDataVersion; i++) await p.waitForTimeout(500);
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.funds?.["Model Fund I"]?.sampleDataVersion === 4, `the fund records the sample data version, saved without a click (${sd?.funds?.["Model Fund I"]?.sampleDataVersion})`);
  const withCredit = (sd?.deals ?? []).filter((d) => (d.inputs?.units ?? []).some((u) => u.credit)).length;
  check(withCredit >= 5 && sd?.gpPartners?.partners?.length === 2 && gpa.length === 2 && (sd?.gpPartners?.agreements ?? []).filter((a) => a.status === "checked").length === 2, `tenant credit on ${withCredit} assets; 2 GP partners, their 2 agreements switched on`);
  const parties = (sd?.funds?.["Model Fund I"]?.gpParties ?? []).filter((x) => x.partnerId);
  const fcp = parties.find((x) => /Fictional Capital/.test(x.name)), sfo = parties.find((x) => /Sample Family/.test(x.name));
  check(fcp?.capitalPct === 40 && sfo?.terms?.[0]?.dealId && sfo.terms[0].capitalPct === 50, `the fund's GP parties match the agreements: Fictional Capital Partners 40% of GP capital fund-wide; Sample Family Office 50% on Granite Ave only (${JSON.stringify(parties.map((x) => [x.name, x.capitalPct]))})`);
  const d1 = sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs, mf = sd?.funds?.["Model Fund I"];
  check(d1?.loanTerms?.lender === "Desert Mountain Bank" && d1?.dealTerms?.psaDate === "2025-11-14" && d1?.executedCaps?.[0]?.provider === "Atlas Derivatives Bank" && d1?.icApproved?.approval_date === "2025-12-18", "the terms the documents state are on the asset (lender, contract dates, executed cap, IC approval)");
  check((sd?.deals ?? []).filter((d) => d.id.startsWith("sample-deal-")).every((d) => d.inputs.propertyManager && d.inputs.propertyManagementFirm?.type === "sponsor"), "every sample asset has a property manager");
  check((mf?.entities ?? []).length === 11 && mf.entities.some((e) => e.name === "Model Fund I, L.P.") && (mf?.limits ?? []).length === 8, `Model Fund I has its legal entities and the LPA's limits (${mf?.entities?.length} entities, ${mf?.limits?.length} limits)`);
  // The sales in progress: the earlier, empty sample sale keeps its id and now holds what the documents state.
  const s9 = sd?.deals?.find((d) => d.id === "sample-deal-2")?.inputs?.dispositions ?? [], s3 = sd?.deals?.find((d) => d.id === "sample-deal-3")?.inputs?.dispositions ?? [];
  check(s9.length === 1 && s9[0].id === "oldsale" && s9[0].stage === "contract" && s9[0].bovs.length === 1 && s9[0].offers.length === 1 && s9[0].contract.closingDate === "2027-01-20" && !s9[0].closing, `Route 9's sample sale kept its id and is under contract as its documents state (BOV $${s9[0]?.bovs?.[0]?.price?.toLocaleString("en-US")}, offer $${s9[0]?.offers?.[0]?.price?.toLocaleString("en-US")}, closing ${s9[0]?.contract?.closingDate}); nothing is sold`);
  check(s3.length === 1 && s3[0].stage === "offers" && saleDocs.length === 7 && saleDocs.filter((d) => d.deal_id === "sample-deal-2").every((d) => d.title.startsWith("[sale:oldsale")) && !saleDocs.some((d) => /closing/.test(d.title)), "the 7 new sale documents are filed on those sales (Route 9's on the sale it already had); the earlier closing statement is gone");
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
