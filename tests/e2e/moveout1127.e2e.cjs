// 1.1.27 Playwright: a tenant that moved out with no replacement. The Rent
// Roll's "Tenant moved out" form on a unit, what the Leases in effect today
// table, the unit's flag and the Dashboard then show, and what is saved.
// Fictional fixture; Supabase mocked. Today is fixed at 2026-11-27 (tests/e2e/clock.cjs).
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
const U = (name, tenant, sf, leaseEnd, occupied = true) => ({ id: `u-${name}`, name, tenantName: occupied ? tenant : "", squareFeet: sf, currentRentPSF: 18, leaseStatus: occupied ? "occupied" : "vacant", leaseType: "NNN", leaseEnd: occupied ? leaseEnd : "", annualEscalationPct: 3, newLeaseTerm: 60, renewalProbabilityPct: 70 });
// Unit 001's purchase-day lease ended in June 2026; 002's runs to 2028; 003 was vacant at purchase.
data.deals = data.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, acquisitionDate: "2026-01-30", units: [U("001", "Alpha Fictional Co", 12000, "2026-06-30"), U("002", "Beta Example LLC", 8000, "2028-06-30"), U("003", "", 4000, "", false)].map((u) => ({ ...u, monthsRemaining: u.leaseEnd ? Math.max(1, Math.round((Date.parse(u.leaseEnd) - Date.parse("2026-01-30")) / (30.44 * 864e5))) : 0 })) } } : d));
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

  const att = p.getByTestId("attention");
  const attText = async () => (await att.innerText()).replace(/\s+/g, " ");
  check(/1 lease has ended with no newer lease recorded/.test(await attText()), "before: the Dashboard lists the ended lease under Actions Needed");

  await FX.openTab(p, "Rent Roll");
  await p.waitForTimeout(800);
  const today = p.getByTestId("leases-today");
  const statuses = async () => today.getByTestId("lease-today-status").allInnerTexts();
  check((await statuses()).join("|") === "Ended, no lease recorded|At purchase|Vacant", `before: each unit's lease today (${(await statuses()).join(" | ")})`);

  // ── Unit 001: the tenant left when its lease ended ──
  await p.getByRole("button", { name: "Lease details for unit 001" }).click();
  await p.waitForTimeout(300);
  const hist = p.getByTestId("unit-lease-history");
  await hist.getByTestId("add-move-out").click();
  const form = hist.getByTestId("move-out-form");
  await form.getByTestId("save-move-out").click();
  check(/Enter the date the tenant moved out/.test(await form.getByTestId("move-out-error").innerText()), "a move-out needs its date");
  await form.getByLabel("Move-out date").fill("2025-12-31");
  await form.getByTestId("save-move-out").click();
  check(/before the purchase date/.test(await form.getByTestId("move-out-error").innerText()), "a date before the purchase is refused");
  await form.getByLabel("Move-out date").fill("2026-06-30");
  await form.getByLabel("Move-out reason").selectOption("expired");
  await form.getByLabel("Move-out note").fill("Did not renew");
  await form.getByTestId("save-move-out").click();
  await p.waitForTimeout(500);
  const rows = (await hist.getByTestId("lease-history-row").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  check(rows.length === 2 && /^Moved out Alpha Fictional Co — 6\/30\/2026 Lease expired: Did not renew\. Vacant from the next day\./.test(rows[0]) && /^At purchase/.test(rows[1]) && (await hist.getByTestId("add-move-out").count()) === 0, `the history shows the move-out above the lease at purchase (${rows[0]?.slice(0, 90)})`);
  check((await statuses()).join("|") === "Vacant, tenant moved out|At purchase|Vacant" && /Was Alpha Fictional Co/.test((await today.getByTestId("lease-today-row").first().innerText())), `the unit is vacant today and names who left (${(await statuses()).join(" | ")})`);
  check(/0 units on a lease signed since purchase/.test(await today.getByTestId("leases-today-summary").innerText()) && !/ended with no newer lease/.test(await today.getByTestId("leases-today-summary").innerText()), "it is no longer counted as a lease that ended with nothing recorded");
  check((await p.getByTestId("unit-lease-today").allInnerTexts()).join("|") === "Vacant, tenant moved out", "the rent roll row is flagged vacant, tenant moved out");

  // ── Saved; the Dashboard no longer asks for a lease ──
  await FX.saveLoadUpgrade(p);
  await p.waitForTimeout(800);
  const saved = ws.data.deals.find((d) => d.id === "sample-deal-1").inputs.units.find((u) => u.name === "001");
  check(saved.moveOut?.date === "2026-06-30" && saved.moveOut.reason === "expired" && saved.moveOut.tenantName === "Alpha Fictional Co" && saved.moveOut.note === "Did not renew" && saved.moveOut.by === "t@example.com" && saved.tenantName === "Alpha Fictional Co" && saved.leaseStatus === "occupied", `saved: the move-out is on the unit; the rent roll at purchase is unchanged (${JSON.stringify(saved.moveOut)}, ${saved.tenantName}, ${saved.leaseStatus})`);
  await p.locator("header").getByTestId("home-button").click();
  await p.waitForTimeout(800);
  check(!/lease has ended with no newer lease recorded/.test(await attText()), "the Dashboard no longer lists an ended lease");

  // ── A lease signed afterwards takes over; the move-out can be removed ──
  await FX.openTab(p, "Rent Roll");
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Lease details for unit 001" }).click();
  await p.waitForTimeout(300);
  await hist.getByTestId("add-later-lease").click();
  const lf = hist.getByTestId("later-lease-form");
  await lf.getByLabel("Renewal or new tenant").selectOption("new");
  await lf.getByLabel("Tenant", { exact: true }).fill("Gamma Sample Inc");
  await lf.getByLabel("Lease start").fill("2026-10-01");
  await lf.getByLabel("Lease end").fill("2031-09-30");
  await lf.getByLabel("Rent per SF").fill("19");
  await lf.getByTestId("save-later-lease").click();
  await p.waitForTimeout(500);
  check((await statuses())[0] === "New tenant, signed" && (await hist.getByTestId("lease-history-row").count()) === 4, `a lease signed after the move-out takes over, with the vacant months between shown (${(await statuses())[0]})`);
  await hist.getByRole("button", { name: "Remove the move-out" }).click();
  await p.waitForTimeout(400);
  check((await hist.getByTestId("lease-history-row").allInnerTexts()).every((t) => !/^Moved out/.test(t)) && (await hist.getByTestId("add-move-out").count()) === 1, "the move-out can be removed");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
