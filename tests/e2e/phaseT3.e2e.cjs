// Phase T part 3 Playwright: construction test data from the Sample data menu,
// TI spend by unit with overrun flags on Property Condition and the business
// plan, capital jobs, and uploading the construction exports. Fictional
// fixture and sample files; Supabase mocked.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const R = path.resolve(__dirname, "..", "..");
const data = FX.workspaceData();
const units = (id, names) => names.map((n) => ({ id: `${id}-u${n}`, name: n, squareFeet: 2000, leaseStatus: "occupied", tenantName: "", currentRentPSF: 12, leaseEnd: "2029-12-31" }));
data.deals = data.deals.map((d) => {
  if (d.id === "sample-deal-1") return { ...d, inputs: { ...d.inputs, units: units(d.id, ["001", "002", "012"]), businessPlan: { revisions: [{ n: 1, at: "2026-01-30T00:00:00Z", by: "", reason: "Closing", plan: { leasing: [{ unitId: "sample-deal-1-u001", unit: "001", tenant: "", sf: 2000, leaseEnd: "", action: "Re-tenant", targetRentPSF: 12, downtimeMonths: 3, tiPSF: 8, note: "" }], capital: [], milestones: [], kpis: [] }, budget: null }] } } };
  if (d.id === "sample-deal-4") return { ...d, inputs: { ...d.inputs, units: units(d.id, ["014"]) } };
  return d;
});
data.activeDealId = "sample-deal-1";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);

  // ── Sample data menu ──
  await FX.openSetup(p);
  await p.getByTestId("sample-data-menu").getByRole("button", { name: /Sample data/ }).click();
  await p.getByRole("menuitem", { name: /Add construction test data/ }).click();
  await p.waitForTimeout(800);
  const pm = p.getByRole("group", { name: "Property Management" });
  await FX.openTab(p, "Property Condition");
  await p.waitForTimeout(800);
  const con = p.getByTestId("construction");
  const rows = con.getByTestId("ti-row");
  check((await rows.count()) === 3, `TI by unit for Airport Flex Park (${await rows.count()} units)`);
  const r001 = await rows.filter({ hasText: /^001/ }).innerText();
  check(/\$16,000/.test(r001) && /\$17,248/.test(r001) && /\+7\.8%/.test(r001), "unit 001: planned $16,000, spent $17,248, +7.8%");
  check(/amber/.test(await rows.filter({ hasText: /^001/ }).getByTestId("ti-flag").getAttribute("class")), "flagged amber");
  check(/Roof replacement, Building B/.test(await p.getByTestId("capital-jobs").innerText()), "the capital job not tied to a unit");

  // Link the roof job to a condition finding.
  await p.getByTestId("pm-section-items").getByRole("button", { name: "+ Add" }).click();
  const ir = p.getByTestId("pm-row-items").first();
  await ir.getByLabel("System").selectOption("Roof");
  await ir.getByLabel("Yardi job").fill("mf1-01-J04");
  await p.waitForTimeout(400);
  check(/Finding: Roof/.test(await p.getByTestId("capital-jobs").innerText()), "a finding with the job code links to the job");

  // ── Ridgeway: red ──
  await p.locator("#asset-picker").selectOption("sample-deal-4");
  await p.waitForTimeout(800);
  const rr = p.getByTestId("construction").getByTestId("ti-row").first();
  check(/\+34\.4%/.test(await rr.innerText()) && /red/.test(await rr.getByTestId("ti-flag").getAttribute("class")), "Ridgeway unit 014: +34.4%, red");

  // ── Business plan shows it ──
  await p.locator("#asset-picker").selectOption("sample-deal-1");
  await FX.openTab(p, "Asset Business Plan");
  await p.waitForTimeout(1200);
  check(/TI spend by unit/.test(await p.locator("main").innerText()) && (await p.locator("main").getByTestId("ti-row").count()) === 3, "the business plan shows TI spend by unit");

  // ── Upload the exports again (updates, no duplicates) ──
  await FX.openTab(p, "Property Condition");
  await p.waitForTimeout(800);
  await p.getByTestId("construction-file").setInputFiles([
    { name: "construction-jobs-2026-10.csv", mimeType: "text/csv", buffer: fs.readFileSync(R + "/docs/sample-yardi/construction-jobs-2026-10.csv") },
    { name: "construction-invoices-2026-10.csv", mimeType: "text/csv", buffer: fs.readFileSync(R + "/docs/sample-yardi/construction-invoices-2026-10.csv") },
  ]);
  await p.waitForTimeout(800);
  const msg = await p.getByTestId("construction-msg").innerText();
  check(/Imported 22 jobs and 54 invoices into [2-9] assets/ /* 1.1.30: the file also holds the capital projects' jobs */.test(msg), `upload: ${msg.slice(0, 110)}`);
  check((await p.getByTestId("construction").getByTestId("ti-row").count()) === 3, "re-upload updates by job code (still 3 units)");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("construction").getByRole("button", { name: "Excel" }).click()]);
  check(/construction-ti\.xlsx$/.test(dl.suggestedFilename()), "Excel export");

  // ── Saved ──
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  const c1 = sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs?.construction;
  check(c1?.jobs?.length === 5 && c1.jobs.find((j) => j.code === "mf1-01-J01").invoices.length === 2 && c1.asOf, "saved on the asset: jobs with invoices");
  await p.screenshot({ path: `${S}/construction.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
