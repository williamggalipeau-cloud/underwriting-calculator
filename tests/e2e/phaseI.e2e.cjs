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
const D = R + "/docs/sample-deal-docs/deals";
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
  // The Asset Business Plan tab embeds a Google map; serve a stub offline.
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html><body>map</body></html>" }));
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

  // Documents: issue badges on estoppel, CAM and billing cards (from phase H)
  await p.getByRole("button", { name: "Documents", exact: true }).click();
  await p.waitForTimeout(1200);
  await main.getByRole("button", { name: /Whole fund/ }).click();
  await p.waitForTimeout(600);
  const badge = async (t) => (await main.getByTestId("doc-card").filter({ hasText: t }).first().getByTestId("doc-issues").innerText().catch(() => ""));
  const be = await badge("Desert Aero Parts estoppel"), bc = await badge("Lakeshore 2025 CAM"), bb = await badge("Riverside billing");
  check(/2 issues: Expiration; Landlord/.test(be) && /over-billed \$966/.test(bc) && /under-billed \$166\.67/.test(bb), `issue badges on the cards: ${be} | ${bc} | ${bb}`);

  // Business Plan: create revision 1
  await p.getByRole("button", { name: "Asset Business Plan", exact: true }).click();
  await p.waitForTimeout(1000);
  const bpEl = main.getByTestId("business-plan");
  await bpEl.getByRole("button", { name: "Create business plan (revision 1)" }).click();
  await p.waitForTimeout(800);
  check((await bpEl.innerText()).includes("Revision 1 of 1 (current)") && (await bpEl.getByTestId("plan-leasing").locator("tbody tr").count()) === af.units.length, "revision 1 created with a leasing row per unit");
  // Edit: add a capital project and a milestone, change a unit's action
  await bpEl.getByRole("button", { name: "Edit plan" }).click();
  await bpEl.getByLabel("Why we bought it").fill("Infill flex below replacement cost");
  await bpEl.getByRole("button", { name: "Add project" }).click();
  await bpEl.getByLabel("capital 1 project").fill("Roof replacement").catch(async () => bpEl.getByLabel("capital 0 project").fill("Roof replacement"));
  await bpEl.getByRole("button", { name: "Add milestone" }).click();
  const mrows = bpEl.getByTestId("milestone-row");
  const last = mrows.last();
  await last.locator("input").first().fill("Lease unit 012 by Q3");
  await last.locator('input[type="date"]').fill("2026-09-30");
  await bpEl.getByLabel(`Unit ${af.units[0].name} action`).selectOption("Re-tenant");
  await bpEl.getByLabel("Revision note").fill("Roof and leasing update");
  await bpEl.getByRole("button", { name: "Save as revision 2" }).click();
  await p.waitForTimeout(800);
  const t2 = await bpEl.innerText();
  check(t2.includes("Revision 2 of 2 (current)") && t2.includes("Roof and leasing update") && (await bpEl.getByTestId("plan-revisions").count()) === 1, "saved as revision 2 with its note; revision history");
  check((await bpEl.getByTestId("milestone-row").filter({ hasText: "Lease unit 012 by Q3" }).innerText()).includes("late"), "milestone past due shows late");
  await bpEl.getByLabel("Compare with").selectOption("1");
  const cmp = await bpEl.getByTestId("plan-compare").innerText();
  check(/thesis/.test(cmp) && /Re-tenant/.test(cmp) && /Roof replacement/.test(cmp), "compare revision 1 → 2 lists the changes");
  await bpEl.getByLabel("Revision").selectOption("1");
  await p.waitForTimeout(300);
  check((await bpEl.innerText()).includes("Revision 1 of 2") && !(await bpEl.innerText()).includes("Infill flex"), "revision 1 is unchanged");
  await bpEl.getByLabel("Revision").selectOption("2");
  // Import actuals for the whole fund
  await bpEl.getByLabel("Import actuals").setInputFiles(`${R}/docs/sample-yardi/income-statement-2026.csv`);
  await p.waitForTimeout(1000);
  check(/8 assets matched/.test(await bpEl.getByTestId("plan-msg").innerText()), "income statement imported: 8 assets matched");
  const util = bpEl.locator('[data-testid="variance-row"][data-line="utilities"]');
  check((await util.getAttribute("data-flag")) === "red" && (await util.innerText()).includes("12.0%"), "YTD utilities 12% over budget, flagged red");
  await util.getByLabel("Comment Utilities").fill("Summer HVAC load; new tenant meters in Q1");
  await util.getByLabel("Comment Utilities").blur();
  await p.waitForTimeout(500);
  await bpEl.getByLabel("Period").selectOption("month");
  await bpEl.getByLabel("Through month").selectOption("2026-10");
  check((await util.getAttribute("data-flag")) === "", "October utilities on budget");
  await bpEl.getByLabel("Period").selectOption("ytd");
  check((await util.getByLabel("Comment Utilities").inputValue()) === "Summer HVAC load; new tenant meters in Q1", "variance comment kept");
  // Exports
  const [pdf] = await Promise.all([p.waitForEvent("download"), bpEl.getByRole("button", { name: "PDF", exact: true }).click()]);
  const pdfPath = S + "/i_plan.pdf"; await pdf.saveAs(pdfPath);
  check(fs.statSync(pdfPath).size > 5000 && pdf.suggestedFilename().includes("rev2"), `PDF ${pdf.suggestedFilename()} (${fs.statSync(pdfPath).size} bytes)`);
  const [xl] = await Promise.all([p.waitForEvent("download"), bpEl.getByRole("button", { name: "Excel", exact: true }).click()]);
  check(xl.suggestedFilename().endsWith("-budget.xlsx"), "Excel budget export");
  await p.screenshot({ path: S + "/i_plan.png", fullPage: true });
  // Model change banner
  await p.getByRole("button", { name: /^Rent Roll/ }).first().click();
  await p.waitForTimeout(600);
  // Fund Return roll-up
  await p.getByRole("button", { name: /^Fund Return/ }).first().click();
  await p.waitForTimeout(1000);
  const sum = await main.getByTestId("budget-summary").innerText().catch(() => "");
  check(sum.includes("Airport Flex Park") && sum.includes("Route 9 Small Bay") && sum.includes("Fund"), "Fund Return: NOI vs budget by asset");
  // Critical dates: the milestone
  await p.getByRole("button", { name: "Leases", exact: true }).click();
  await p.waitForTimeout(1200);
  await main.getByRole("tab", { name: "Critical dates", exact: true }).first().click();
  await p.waitForTimeout(600);
  const allBtn = main.getByLabel("Show");
  if (await allBtn.count()) await allBtn.selectOption("all").catch(() => {});
  await p.waitForTimeout(400);
  check((await main.innerText()).includes("Lease unit 012 by Q3"), "milestone on Leases → Critical dates");

  await p.waitForTimeout(20000);
  const sbp = saved?.new_data?.deals?.find((d) => d.id === "sample-deal-1")?.inputs?.businessPlan;
  check(sbp?.revisions?.length === 2 && Object.keys(sbp.actuals ?? {}).length === 10 && Object.values(sbp.comments ?? {}).includes("Summer HVAC load; new tenant meters in Q1"), "saved: 2 revisions, 10 months of actuals, the comment");
  check((saved?.changes ?? []).some((c) => /Business plan/.test(c.note ?? "") || /Business plan/.test(c.field ?? "")), "database log: business plan changes");
  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
