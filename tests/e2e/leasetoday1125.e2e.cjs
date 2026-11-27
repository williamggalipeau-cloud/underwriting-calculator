// 1.1.25 Playwright: the lease in effect today on Tenant Credit, the SNDA
// list and Vacant Units, and the Deal Screener tab under its new name,
// Underwriter. Fictional fixture; Supabase mocked. Today is fixed at
// 2026-11-27 (tests/e2e/clock.cjs).
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
const U = (name, tenant, sf, leaseEnd, occupied = true) => ({ id: `u-${name}`, name, tenantName: occupied ? tenant : "", squareFeet: sf, currentRentPSF: 18, leaseStatus: occupied ? "occupied" : "vacant", leaseType: "NNN", leaseEnd: occupied ? leaseEnd : "", annualEscalationPct: 3, newLeaseTerm: 60, renewalProbabilityPct: 70 });
// Unit 001's purchase-day lease ended in June 2026; 002's runs to 2028; 003 was vacant at purchase.
data.deals = data.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, acquisitionDate: "2026-01-30", units: [U("001", "Alpha Fictional Co", 12000, "2026-06-30"), U("002", "Beta Example LLC", 8000, "2028-06-30"), U("003", "", 4000, "", false)].map((u) => ({ ...u, monthsRemaining: u.leaseEnd ? Math.max(1, Math.round((Date.parse(u.leaseEnd) - Date.parse("2026-01-30")) / (30.44 * 864e5))) : 0 })) } } : d));
// Since purchase: unit 001 was re-let to a new tenant, and unit 003 (vacant at purchase) was leased.
// Unit 001 carries the former tenant's signed SNDA; the loan requires one from every lease.
data.deals = data.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, loanTerms: { ...(d.inputs.loanTerms ?? {}), sndaRule: "all" }, units: d.inputs.units.map((u) => (
  u.name === "001" ? { ...u, snda: { status: "signed", signedOn: "2026-02-15", lender: "Example Bank" }, laterLeases: [{ id: "ll-1", kind: "new", tenantName: "Example Robotics LLC", start: "2026-09-01", end: "2031-08-31", rentPSF: 22, escalationPct: 0, freeMonths: 0, tiPSF: 0, lcPct: null }] }
  : u.name === "003" ? { ...u, laterLeases: [{ id: "ll-3", kind: "new", tenantName: "Sample Bike Repair", start: "2026-06-01", end: "2031-05-31", rentPSF: 21, escalationPct: 0, freeMonths: 0, tiPSF: 0, lcPct: null }] } : u)) } } : d));
data.activeDealId = "sample-deal-1";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  await ctx.addInitScript((v) => { localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); }, JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { const s = JSON.parse(req.postData()); ws.data = s.new_data ?? ws.data; body = String(++ws.version); }
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
  await FX.saveLoadUpgrade(p);

  // ── The tab's new name ──
  const areaTitles = await p.getByTestId("function-area").evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? "").join(" | "));
  check(/Underwriter/.test(areaTitles) && !/Deal Screener/.test(areaTitles), "the Deal Screener tab is now named Underwriter");

  // ── Tenant Credit: the tenants in place today ──
  await FX.openTab(p, "Tenant Credit");
  await p.waitForTimeout(800);
  const tc = p.getByTestId("tenant-credit");
  await tc.getByRole("button", { name: /^All/ }).first().click().catch(() => {});
  await p.waitForTimeout(300);
  const tcText = (await tc.innerText()).replace(/\s+/g, " ");
  check(/Example Robotics LLC/.test(tcText) && /Sample Bike Repair/.test(tcText) && !/Alpha Fictional Co/.test(tcText), "Tenant Credit lists the new tenants, not the former tenant of unit 001");
  const robRow = (await tc.getByTestId("credit-row").filter({ hasText: "Example Robotics LLC" }).first().innerText()).replace(/\s+/g, " ");
  check(/8\/31\/2031/.test(robRow) && /264,000/.test(robRow), `its row shows today's lease end and rent, 12,000 SF at $22 (${robRow.slice(0, 140)})`);

  // ── Leases → SNDAs: the former tenant's SNDA no longer counts ──
  await FX.openTab(p, "Leases");
  await p.waitForTimeout(600);
  await p.locator("main").getByRole("tab", { name: "SNDAs" }).click();
  await p.waitForTimeout(500);
  const rows = p.getByTestId("snda-row");
  const r1 = rows.filter({ hasText: "Example Robotics LLC" });
  check((await rows.count()) === 3 && (await r1.count()) === 1 && (await rows.filter({ hasText: "Alpha Fictional Co" }).count()) === 0, "the SNDA list has a row for each lease in effect today (three), with the new tenant in unit 001");
  check(/Required, not requested/.test(await r1.innerText()) && (await r1.getByTestId("snda-former").count()) === 1, "the former tenant's signed SNDA does not count for the new tenant: required again, and marked as the former tenant's");
  check(/3 outstanding/.test(await p.getByTestId("snda-coverage").first().innerText()), `coverage counts all three leases as outstanding (${(await p.getByTestId("snda-coverage").first().innerText()).replace(/\s+/g, " ").slice(0, 120)})`);
  await p.getByLabel("SNDA status for Example Robotics LLC").selectOption("signed");
  await p.waitForTimeout(500);
  check((await r1.getByTestId("snda-former").count()) === 0 && /2 outstanding/.test(await p.getByTestId("snda-coverage").first().innerText()), "marking the new tenant's SNDA signed counts, and the note goes");
  await FX.saveLoadUpgrade(p);
  await p.waitForTimeout(1500);
  const saved = ws.data.deals.find((d) => d.id === "sample-deal-1").inputs.units.find((u) => u.name === "001");
  check(saved.snda.status === "signed" && saved.snda.tenant === "Example Robotics LLC" && saved.snda.signedOn === "2026-11-27" && saved.tenantName === "Alpha Fictional Co", `saved: the SNDA is recorded for the new tenant; the rent roll at purchase is unchanged (${JSON.stringify(saved.snda)})`);

  // ── Vacant Units: the unit leased since purchase is not listed ──
  await FX.openTab(p, "Active Leasing");
  await p.waitForTimeout(800);
  const vrows = await p.getByTestId("vacant-units").getByTestId("vacant-unit").allInnerTexts();
  check(!vrows.some((t) => /\b003\b/.test(t)), `Vacant Units no longer lists unit 003 (${vrows.length} listed)`);
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
