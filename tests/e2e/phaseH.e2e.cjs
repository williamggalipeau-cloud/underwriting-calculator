// Phase H Playwright: delinquency (mock Yardi), estoppel/CAM/billing checks, fund assignment of LPA/PPM.
const { chromium } = require("playwright");
const fs = require("fs");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const R = FX.R;
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const sp = j(R + "/lib/samplePortfolio.js"); const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
const data = FX.workspaceData();
const built = sp.buildSampleDeals(TEST_INPUTS);
data.deals = data.deals.map((d) => { const b = built.find((x) => x.id === d.id); return b ? { ...d, inputs: { ...b.inputs, fundName: d.inputs.fundName } } : d; });
data.activeDealId = "sample-deal-1";
data.funds = { ...data.funds, "Model Fund II": { ...(data.funds?.["Model Fund I"] ?? {}) } };
// 1.1.13: these flows read, compare and apply documents that differ from the model, so they use the
// test-only copies (tests/fixtures/deal-docs). The documents the app loads tie to Model Fund I and are
// checked in tests/node/sampleTieOut.test.cjs and tests/e2e/sampleSync.e2e.cjs.
const D = R + "/tests/fixtures/deal-docs";
const abs = (n) => JSON.parse(fs.readFileSync(`${D}/abstracts/${n}.json`));
const L = (f) => JSON.parse(fs.readFileSync(`${R}/docs/sample-leases/abstracts/${f}.json`));
const af = data.deals.find((d) => d.id === "sample-deal-1").inputs;
const u104 = af.units.find((u) => /Desert Aero/i.test(u.tenantName ?? "")) ?? af.units[2];
const LEASE = (n) => `00000000-0000-0000-0000-0000000000a${n}`;
const leases = [
  { id: LEASE(1), workspace_id: "w1", deal_id: "sample-deal-1", unit_ids: [u104.id], tenant: "Desert Aero Parts LLC", title: "", files: [{ path: "w1/x/a.pdf", name: "02.pdf", size: 9, kind: "lease" }], status: "abstracted", abstract: L("02-airport-flex-park-desert-aero"), created_at: "2026-11-22T00:00:00Z" },
  { id: LEASE(2), workspace_id: "w1", deal_id: "sample-deal-9", unit_ids: [], tenant: "North Texas Fleet Service LLC", title: "", files: [{ path: "w1/x/b.pdf", name: "10.pdf", size: 9, kind: "lease" }], status: "abstracted", abstract: L("10-lakeshore-north-texas-fleet"), created_at: "2026-11-22T00:00:00Z" },
  { id: LEASE(3), workspace_id: "w1", deal_id: "sample-deal-9", unit_ids: [], tenant: "Citrus Belt Logistics, LLC", title: "", files: [{ path: "w1/x/c.pdf", name: "14.pdf", size: 9, kind: "lease" }], status: "abstracted", abstract: L("14-riverside-citrus-belt-logistics"), created_at: "2026-11-22T00:00:00Z" },
];
let seq = 0;
const mkDoc = (n, extra = {}) => ({ id: `00000000-0000-0000-0000-00000000${String(100 + ++seq)}`, workspace_id: "w1", deal_id: "sample-deal-1", fund_name: "Model Fund I", doc_type: abs(n).doc_type, title: abs(n).title, lease_id: null, files: [{ path: `w1/x/${n}.pdf`, name: `${n}.pdf`, size: 20000 }], status: "abstracted", abstract: abs(n), applied_fields: {}, created_at: "2026-11-22T00:00:00Z", created_by_email: "t@example.com", ...extra });
const docs = [mkDoc("airport-flex-estoppel-desert-aero", { lease_id: LEASE(1) }), mkDoc("lakeshore-cam-2025", { deal_id: "sample-deal-9" }), mkDoc("riverside-billing-2026-12", { deal_id: "sample-deal-9" })];

const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null; const posted = []; const patched = [];
let fails = 0; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = decodeURIComponent(req.url()); const acc = req.headers()["accept"] || "";
    let body = "[]";
    const one = (x) => (acc.includes("vnd.pgrst.object") ? JSON.stringify(x) : JSON.stringify([x]));
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); ws.data = saved.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/")) body = JSON.stringify({ Key: "x" });
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), applied_fields: {}, status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; posted.push(row); docs.push(row); body = one(row); }
      else if (req.method() === "PATCH") { const id = u.match(/id=eq\.([^&]+)/)[1]; const d = docs.find((x) => x.id === id); const pt = JSON.parse(req.postData()); patched.push(pt); Object.assign(d, pt); body = one(d); }
      else body = JSON.stringify(docs);
    } else if (u.includes("/lease_documents")) body = JSON.stringify(leases);
    else if (u.includes("/lease_credit")) body = "[]";
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");

  // ── Delinquency: upload three months of aged receivables ──
  await FX.openTab(p, /^Rent Roll/);
  await p.waitForTimeout(1200);
  const dq = main.getByTestId("delinquency");
  for (const m of ["08", "09", "10"]) {
    await dq.getByLabel("Upload aged receivables").setInputFiles(`${R}/docs/sample-yardi/aged-receivables-2026-${m}.csv`);
    await p.waitForTimeout(600);
    const dr = main.getByTestId("delinquency-draft");
    if (m === "08") console.log("  DRAFT:", (await dr.innerText()).slice(0, 400).replace(/\s+/g, " "));
    await dr.getByRole("button", { name: /^Save / }).click();
    await p.waitForTimeout(600);
  }
  await dq.getByRole("button", { name: /Whole fund/ }).click();
  await p.waitForTimeout(500);
  const dqt = await dq.innerText();
  check(dqt.includes("$42,685") && dqt.includes("+$6,127"), "fund past due $42,685 for October, +$6,127 vs September");
  check((await dq.getByTestId("delinquency-trend").innerText()).includes("Sep"), "trend shows the three months");
  const tt = await dq.getByTestId("delinquency-tenants").innerText();
  check(tt.includes("Desert Sky Tool") && /Harbor Light/.test(dqt), "tenant table lists Ridgeway's and Harbor Light's tenants");
  await dq.getByLabel("Upload tenant ledger").setInputFiles(`${R}/docs/sample-yardi/tenant-ledger.csv`);
  await p.waitForTimeout(800);
  const col = await dq.getByTestId("collections").innerText().catch(() => "");
  check(col.includes("Route 9") && col.includes("66.7"), "collections from the tenant ledger (Route 9 66.7%)");
  await p.screenshot({ path: S + "/h_delinq.png", fullPage: false });

  // Unit Roll badges on Airport Flex (Sep late caught up → no badge in Oct); estoppel flag on unit 104
  check((await main.getByTestId("unit-estoppel-flag").count()) >= 1, "Unit Roll: estoppel flag on Desert Aero's unit");

  // Portfolio Return card
  await FX.openTab(p, "Portfolio Return").catch(() => {});
  await p.waitForTimeout(1200);
  const sum = main.getByTestId("delinquency-summary");
  check((await sum.count()) > 0 && (await sum.first().innerText()).includes("42,685"), "Portfolio Return: delinquency card");

  // ── Leases: estoppel flag on the lease card ──
  await FX.openTab(p, "Leases");
  await p.waitForTimeout(1500);
  const ef = main.getByTestId("estoppel-flag");
  check((await ef.count()) > 0 && /Expiration/.test(await ef.first().innerText()) && /Landlord/.test(await ef.first().innerText()), "lease card: estoppel differs (expiration, landlord claim)");

  // ── Documents: checks ──
  await FX.openTab(p, "Documents");
  await p.waitForTimeout(1200);
  await FX.docAsset(main, "");
  await p.waitForTimeout(600);
  const est = await FX.docCard(main, "Desert Aero Parts estoppel");
  await est.getByRole("button", { name: "Check", exact: true }).click();
  const er = est.getByTestId("estoppel-row");
  const ert = await er.allInnerTexts();
  check(ert.some((x) => /⚠ Expiration/.test(x) && x.includes("2028-02-28") && x.includes("2028-02-29")) && ert.some((x) => /✓ Monthly base rent/.test(x)), "estoppel check: expiration mismatch, rent matches");
  const cam = await FX.docCard(main, "Lakeshore 2025 CAM");
  await cam.getByRole("button", { name: "Check", exact: true }).click();
  const camt = await cam.getByTestId("cam-row").first().innerText();
  check(camt.includes("5.5%") && camt.includes("6%") && camt.includes("$966") && /over the lease's 4% cap/.test(camt), "CAM check: share 6% vs 5.5%, fee over cap, +$966");
  const bill = await FX.docCard(main, "Riverside billing");
  await bill.getByRole("button", { name: "Check", exact: true }).click();
  const bt = await bill.getByTestId("billing-row").allInnerTexts();
  check(bt.length === 2 && /✓/.test(bt[0]) && /under-billed \$166\.67/.test(bt[1]), "billing check: December under-billed $166.67");
  await p.screenshot({ path: S + "/h_docs.png", fullPage: true });

  // ── Fund assignment: LPA to Model Fund II, then move it back ──
  await FX.docPortfolio(main, "Model Fund I");
  const up = main.getByTestId("doc-upload");
  await up.getByLabel("Document type").selectOption("lpa");
  const fs1 = up.getByTestId("doc-fund-select");
  check((await fs1.locator("option").allInnerTexts()).join("|") === "Model Fund I|Model Fund II", "upload: fund picker lists both funds");
  await fs1.selectOption("Model Fund II");
  await up.getByLabel("Choose document PDFs").setInputFiles(`${D}/model-fund-i-lpa.pdf`);
  await up.getByRole("button", { name: "Upload", exact: true }).click();
  await p.waitForTimeout(1200);
  const lp = posted.find((x) => x.doc_type === "lpa");
  check(lp && lp.fund_name === "Model Fund II" && lp.deal_id === null, "LPA stored with Model Fund II (no asset)");
  check((await main.getByTestId("doc-row").filter({ hasText: "Fund LPA" }).count()) === 0, "it is not listed under Model Fund I");
  // Make it visible by moving it back via the database row, then check the card's picker
  docs.find((x) => x.doc_type === "lpa").fund_name = "Model Fund I";
  await up.getByLabel("Document type").selectOption("ppm");
  check((await up.getByTestId("doc-fund-select").inputValue()) === "Model Fund II", "the fund picker keeps the last fund chosen");
  await up.getByTestId("doc-fund-select").selectOption("Model Fund I");
  await up.getByLabel("Choose document PDFs").setInputFiles(`${D}/model-fund-i-ppm.pdf`);
  await up.getByRole("button", { name: "Upload", exact: true }).click();
  await p.waitForTimeout(1200);
  const ppm = posted.find((x) => x.doc_type === "ppm");
  check(ppm && ppm.fund_name === "Model Fund I", "PPM stored with Model Fund I");
  const lpaCard = await FX.docCard(main, "Fund LPA");
  await lpaCard.getByTestId("doc-card-fund").selectOption("Model Fund II");
  await p.waitForTimeout(1000);
  check(patched.some((x) => x.fund_name === "Model Fund II"), "card: move the LPA to Model Fund II");
  check((await main.getByTestId("doc-row").filter({ hasText: "Fund LPA" }).count()) === 0, "after the move it leaves Model Fund I's list");
  check((await up.getByLabel("Document type").locator("option").allInnerTexts()).filter((x) => /\(portfolio\)/.test(x)).length === 2, "only the LPA and PPM are portfolio documents (for a fund)");

  await p.waitForTimeout(20000);
  const dl = saved?.new_data?.funds?.["Model Fund I"]?.delinquency;
  check(dl && Object.keys(dl.months).length === 3 && Object.keys(dl.mapping?.properties ?? {}).length === 9, "saved: three months and the property mapping on the fund");
  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
