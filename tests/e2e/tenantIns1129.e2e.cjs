// 1.1.29 Playwright: the Insurance tab's two sections. Property insurance is
// the sponsor's policies and claims (as before); Tenant insurance is one row
// per tenant in place today, checked against its lease and its certificate.
// A tenant only on the rent roll gets a row and a Dashboard action to upload
// its lease. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const fs = require("fs");
const lease02 = JSON.parse(fs.readFileSync(FX.R + "/tests/fixtures/sample-leases/abstracts/02-airport-flex-park-desert-aero.json"));
const today = new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pol = (expiry, o = {}) => ({ coverage: "cgl", policy_no: "P1", per_occurrence: 1000000, aggregate: 2000000, expiry, additional_insured: true, waiver_of_subrogation: true, ...o });
// Filled in once the tab has shown who the tenants are (the app's own sample rent roll).
let leases = [], certs = [];
const DEAL = "sample-deal-1";
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/lease_documents")) body = JSON.stringify(leases);
    else if (u.includes("/deal_documents")) body = JSON.stringify(certs);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");
  const tab = (name) => ({ click: () => FX.openTab(p, name) });


  // Who the tenants are: the Insurance tab with no lease or certificate on file yet.
  await FX.openTab(p, /^Insurance/);
  await p.waitForTimeout(1500);
  const first = p.getByTestId("tenant-insurance");
  const names = (await first.getByTestId("ti-row").allInnerTexts()).map((x) => x.split("\t")[0].trim());
  const tenants = names.length;
  check(tenants > 3 && (await first.getByTestId("ti-status").allInnerTexts()).every((x) => x === "No lease on file"), `with no lease on file, every tenant in place has a row marked so (${tenants} tenants)`);
  const [T1, T2, T3] = names.map((n) => ({ tenantName: n }));
  leases = [T1, T2].map((t, i) => ({ id: `L${i + 1}`, deal_id: DEAL, tenant: t.tenantName, unit_ids: [], title: "Lease", files: [], status: "abstracted", abstract: lease02, created_at: "2026-01-05T00:00:00Z" }));
  certs = [{ id: "C1", workspace_id: "w1", deal_id: DEAL, fund_name: "Model Fund I", doc_type: "insurance_cert", lease_id: "L1", title: "Tenant certificate", files: [], created_at: "2026-02-01T00:00:00Z",
    abstract: { doc_type: "insurance_cert", fields: [], policies: [pol(plus(20)), { coverage: "umbrella", limit: 1000000, expiry: plus(20), waiver_of_subrogation: true }, { coverage: "auto", limit: 1000000, expiry: plus(20) }, { coverage: "workers_comp", expiry: plus(20) }] } }];
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);

  // ── Dashboard: the actions and the expiry ──
  await p.getByTestId("attention").getByRole("button", { name: /Show all|all \d+/i }).first().click().catch(() => {});
  const acts = await p.getByTestId("actions-table").innerText().catch(() => "");
  check(/Tenant insurance/.test(acts) && /Upload \d+ leases: \d+ tenants have no lease on file/.test(acts) && new RegExp(`Get proof of insurance: ${esc(T2.tenantName)}`).test(acts), "Actions Needed: upload the leases (one line per asset), and get proof from the tenant with none");
  check(new RegExp(`Tenant insurance expires: ${esc(T1.tenantName)}`).test(acts), "a certificate expiring within 30 days is an action too");

  // ── Insurance tab ──
  await FX.openTab(p, /^Insurance/);
  await p.waitForTimeout(1500);
  const pm = p.getByTestId("pm-insurance");
  check((await pm.getByTestId("ins-property-heading").count()) === 1 && (await pm.getByTestId("pm-section-policies").count()) === 1 && (await pm.getByTestId("pm-section-claims").count()) === 1, "Property insurance: the sponsor's policies and claims, as before");
  const ti = pm.getByTestId("tenant-insurance");
  check((await ti.getByTestId("ti-row").count()) === tenants, `Tenant insurance: one row per tenant in place (${tenants})`);
  const sum = await ti.getByTestId("ti-summary").innerText();
  check(new RegExp(`${tenants} tenants`).test(sum) && new RegExp(`${tenants - 2} with no lease on file`).test(sum) && /1 with no proof/.test(sum) && /1 below the lease/.test(sum), `summary: ${sum.split("\n")[0]}`);
  const row = (t) => ti.getByTestId("ti-row").filter({ hasText: t }).first();
  const r1 = await row(T1.tenantName).innerText();
  check(/Below the lease/.test(r1) && /General liability \$1,000,000 \/ \$2,000,000/.test(r1) && /Tenant certificate/.test(r1) && /umbrella \$1,000,000 is below the lease's \$2,000,000/.test(r1), "a tenant with a lease and a certificate: the requirement, the proof, its expiry and the shortfall");
  check(/No proof on file/.test(await row(T2.tenantName).innerText()), "a tenant with a lease and no certificate: no proof on file");
  const rollOnly = T3;
  check(/No lease on file/.test(await row(rollOnly.tenantName).innerText()) && /No lease requirements on file/.test(await row(rollOnly.tenantName).innerText()), "a tenant only on the rent roll: a row marked no lease requirements on file");
  check(/Dashboard as an action/.test(await ti.getByTestId("ti-no-lease-note").innerText()), "the note points to the Dashboard action");
  await ti.getByLabel("Only tenants needing attention").check();
  check((await ti.getByTestId("ti-row").count()) === tenants, "everyone needs attention here (no tenant fully in place)");
  await ti.getByLabel("Only tenants needing attention").uncheck();

  // Proof requested is recorded on the asset
  await ti.getByLabel(`Proof requested: ${T2.tenantName}`).fill("2026-11-20");
  await ti.getByLabel(`Notes: ${T2.tenantName}`).fill("Asked the broker");
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: /^Save/ }).first().click().catch(() => {});
  await p.waitForTimeout(1500);
  const sd = (saved?.new_data?.deals ?? saved?.data?.deals ?? []).find((d) => d.id === DEAL);
  const tk = Object.values(sd?.inputs?.tenantInsurance ?? {})[0];
  check(tk?.requested === "2026-11-20" && tk.notes === "Asked the broker" && sd.inputs.units.length > 0, "saved: proof requested and the note, on the asset");

  // The whole portfolio, and Excel
  await pm.getByRole("button", { name: /^All/ }).click();
  await p.waitForTimeout(600);
  check((await ti.getByTestId("ti-row").count()) > tenants && (await ti.getByLabel(`Proof requested: ${T2.tenantName}`).isDisabled()), "all assets: every tenant, read-only");
  const [dl] = await Promise.all([p.waitForEvent("download"), ti.getByRole("button", { name: "Excel" }).click()]);
  check(/^tenant-insurance-.*\.xlsx$/.test(dl.suggestedFilename()), "Excel of the tenant section");
  await ti.getByTestId("ti-upload-lease").click();
  await p.waitForTimeout(800);
  check((await p.getByRole("tab", { selected: true }).innerText().catch(() => "")).includes("Lease") || (await p.locator("main").innerText()).includes("Lease"), "Upload leases opens the Leases tab");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
