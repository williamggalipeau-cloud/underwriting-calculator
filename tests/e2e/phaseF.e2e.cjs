// Phase E Playwright: Documents tab on a workspace copy (mocked Supabase).
const { chromium } = require("playwright");
const fs = require("fs");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const R = FX.R;
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
// 1.1.13: these flows read, compare and apply documents that differ from the model, so they use the
// test-only copies (tests/fixtures/deal-docs). The documents the app loads tie to Model Fund I and are
// checked in tests/node/sampleTieOut.test.cjs and tests/e2e/sampleSync.e2e.cjs.
const D = R + "/tests/fixtures/deal-docs";
const abs = (n) => JSON.parse(fs.readFileSync(`${D}/abstracts/${n}.json`));
const lease02 = JSON.parse(fs.readFileSync(R + "/docs/sample-leases/abstracts/02-airport-flex-park-desert-aero.json"));
const LEASE_ID = "00000000-0000-0000-0000-0000000000aa";
const leases = [{ id: LEASE_ID, workspace_id: "w1", deal_id: "sample-deal-1", unit_ids: [], tenant: "Desert Aero Parts LLC", title: "", files: [{ path: "w1/x/a.pdf", name: "02.pdf", size: 9, kind: "lease" }], status: "abstracted", abstract: lease02, created_at: "2026-11-22T00:00:00Z" }];
let seq = 0;
const mkDoc = (n, extra = {}) => ({ id: `00000000-0000-0000-0000-00000000${String(100 + ++seq)}`, workspace_id: "w1", deal_id: "sample-deal-1", fund_name: "Model Fund I", doc_type: abs(n).doc_type, title: abs(n).title, lease_id: null, files: [{ path: `w1/sample-deal-1/x/${n}.pdf`, name: `${n}.pdf`, size: 20000 }], status: "abstracted", abstract: abs(n), applied_fields: {}, created_at: "2026-11-22T00:00:00Z", created_by_email: "t@example.com", ...extra });
const docs = [mkDoc("airport-flex-loan"), mkDoc("airport-flex-cap-2026"), mkDoc("route9-loan", { deal_id: "sample-deal-2" }), mkDoc("route9-cap-2026", { deal_id: "sample-deal-2" })];

const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
const allChanges = []; // every save's change entries (the autosave can split a session)
const uploads = [];
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
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); allChanges.push(...(saved.changes ?? [])); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/deal-docs/")) { uploads.push(u); body = JSON.stringify({ Key: "x" }); }
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), applied_fields: {}, status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; docs.push(row); body = one(row); }
      else if (req.method() === "PATCH") { const id = u.match(/id=eq\.([^&]+)/)[1]; const d = docs.find((x) => x.id === id); Object.assign(d, JSON.parse(req.postData())); body = one(d); }
      else body = JSON.stringify(docs);
    } else if (u.includes("/lease_documents")) body = "[]";
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");

  // Debt tab before: nothing applied; pending documents noted
  await FX.openTab(p, "Debt");
  await p.waitForTimeout(1200);
  const panel = main.getByTestId("loan-agreement");
  check((await panel.innerText()).includes("Not applied yet: the loan agreement and 1 cap confirmation"), "Debt tab lists the documents not applied yet");
  // Upload a confirmation from the Debt tab
  await panel.getByLabel("Upload rate cap confirmation").setInputFiles(`${D}/airport-flex-cap-2026.pdf`);
  await p.waitForTimeout(1200);
  check(uploads.length === 1 && docs.filter((d) => d.doc_type === "rate_cap").length === 3, "cap confirmation uploaded from the Debt tab (deal-docs)");

  // Documents: apply the loan agreement (all differing fields)
  await FX.openTab(p, "Documents");
  await p.waitForTimeout(1200);
  const loan = await FX.docCard(main, "Loan agreement");
  await loan.getByRole("button", { name: "Apply", exact: true }).click();
  const la = loan.getByTestId("doc-apply");
  check(!(await la.getByTestId("doc-row-spread_pct→spreadPct").getByRole("checkbox").isEnabled()), "spread matches the model (2.00%): nothing to apply");
  await la.getByRole("button", { name: /^Apply \d+ field/ }).click();
  await p.waitForTimeout(1200);
  // Apply the executed cap
  const cap = await FX.docCard(main, "Airport Flex Park cap");
  await cap.getByRole("button", { name: "Apply", exact: true }).click();
  const ca = cap.getByTestId("doc-apply");
  const checks = await ca.getByTestId("insurance-gap").allInnerTexts();
  check(checks.some((t) => /replacement cap is needed/.test(t)) && !checks.some((t) => /below|above/.test(t)), `cap checked against the loan: ${checks.join(" | ")}`);
  await ca.getByRole("button", { name: /^Apply 1 field/ }).click();
  await p.waitForTimeout(1200);

  // Debt tab after
  await FX.openTab(p, "Debt");
  await p.waitForTimeout(1200);
  const pt = await main.getByTestId("loan-terms").innerText();
  check(pt.includes("Fictional Bank, N.A.") && pt.includes("$4,980,000") && pt.includes("2029-01-30") && pt.includes("rating A or better"), "loan terms on the Debt tab");
  const cov = await main.getByTestId("covenant-tests").innerText();
  check(cov.includes("min 1.30x") && cov.includes("Year 4") && !cov.includes("✗"), "covenant tests by year, all passing");
  const ex = await main.getByTestId("executed-caps").innerText();
  check(ex.includes("EXECUTED") || ex.toLowerCase().includes("executed"), "executed cap listed");
  check((await main.getByTestId("executed-cap-row").innerText()).includes("Fictional Capital Markets LLC"), "rate cap schedule: year 1 marked executed with the provider");
  await p.screenshot({ path: S + "/f_debt.png", fullPage: true });

  // Route 9: cap flagged against its loan
  await main.getByRole("combobox").first().selectOption({ label: "Route 9 Small Bay" }).catch(() => {});
  await FX.openTab(p, "Documents");
  await p.waitForTimeout(800);
  await FX.docAsset(main, "");
  await p.waitForTimeout(800);
  const r9loan = await FX.docCard(main, "Route 9 Small Bay loan agreement");
  await r9loan.getByRole("button", { name: "Apply", exact: true }).click();
  await r9loan.getByTestId("doc-apply").getByRole("button", { name: /^Apply \d+ field/ }).click();
  await p.waitForTimeout(1200);
  const r9cap = await FX.docCard(main, "Route 9 Small Bay cap");
  await r9cap.getByRole("button", { name: "Apply", exact: true }).click();
  const r9checks = await r9cap.getByTestId("doc-apply").getByTestId("insurance-gap").allInnerTexts();
  check(r9checks.some((t) => /BBB\+, below the loan's minimum A/.test(t)) && r9checks.some((t) => /Notional \$9,000,000 is below/.test(t)), `Route 9 cap flagged: ${r9checks.join(" | ")}`);

  // Critical dates: cap expiry and replacement deadline
  await FX.openTab(p, "Leases");
  await p.waitForTimeout(1200);
  await main.getByRole("button", { name: /Whole fund/ }).click();
  await main.getByRole("tab", { name: "Critical dates" }).click();
  const cdt = await main.getByTestId("critical-dates").innerText();
  check(cdt.includes("Replacement rate cap due to the lender") && cdt.includes("12/31/26") && cdt.includes("Rate cap (Fictional Capital Markets LLC) expires"), "cap replacement deadline (12/31/26) and expiry on Critical dates");

  await p.waitForTimeout(22000);
  const afs = saved?.new_data?.deals?.find((d) => d.id === "sample-deal-1")?.inputs;
  check(afs?.loanAmountActual === 4980000 && afs?.executedCaps?.[0]?.provider === "Fictional Capital Markets LLC" && afs?.capPremiumAmount === 27858, "saved: actual loan and executed cap");
  check(allChanges.some((c) => /Executed cap, hold year 1/.test(c.field) && /From Rate cap confirmation/.test(c.note ?? "")), "database log: executed cap with its source");
  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
