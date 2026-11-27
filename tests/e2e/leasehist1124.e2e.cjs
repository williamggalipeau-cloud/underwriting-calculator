// 1.1.24 Playwright: leases signed after purchase. The Rent Roll's "Leases in
// effect today" table and flags, a unit's lease history and the Add lease
// form, the Dashboard's item for ended leases, and what is saved. Fictional
// fixture; Supabase mocked. Today is fixed at 2026-11-27 (tests/e2e/clock.cjs).
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

  // ── Dashboard: a lease that has ended with nothing newer recorded ──
  const att = p.getByTestId("attention");
  const attText = async () => (await att.innerText()).replace(/\s+/g, " ");
  check(/Airport Flex Park Now Lease ended 1 lease has ended with no newer lease recorded/.test(await attText()) && !/Alpha Fictional Co expires/.test(await attText()), "the Dashboard lists the asset's ended lease once under Actions Needed, not also as a lease that expires");

  // ── Rent Roll: leases in effect today ──
  await FX.openTab(p, "Rent Roll");
  await p.waitForTimeout(800);
  const today = p.getByTestId("leases-today");
  check((await today.count()) === 1 && /0 units on a lease signed since purchase/.test(await today.getByTestId("leases-today-summary").innerText()) && /1 lease has ended with no newer lease recorded/.test(await today.getByTestId("leases-today-summary").innerText()), "Leases in effect today: none signed since purchase, one ended with nothing recorded");
  const statuses = async () => today.getByTestId("lease-today-status").allInnerTexts();
  check((await statuses()).join("|") === "Ended, no lease recorded|At purchase|Vacant", `each unit's lease today (${(await statuses()).join(" | ")})`);
  check((await p.getByTestId("unit-lease-today").allInnerTexts()).join("|") === "⚠ Ended, no lease recorded", "the ended lease is flagged on its rent roll row");

  // ── Add a renewal on unit 001 ──
  await p.getByRole("button", { name: "Lease details for unit 001" }).click();
  await p.waitForTimeout(300);
  const hist = p.getByTestId("unit-lease-history");
  check(/None recorded/.test(await hist.innerText()), "the unit's history starts empty");
  await hist.getByTestId("add-later-lease").click();
  const form = p.getByTestId("later-lease-form");
  check((await form.getByLabel("Renewal or new tenant").inputValue()) === "renewal" && (await form.getByLabel("Tenant", { exact: true }).inputValue()) === "Alpha Fictional Co", "the form starts as a renewal with the unit's tenant");
  // Refused: starts before the purchase date.
  await form.getByLabel("Lease start").fill("2026-01-01");
  await form.getByLabel("Lease end").fill("2030-12-31");
  await form.getByLabel("Rent per SF").fill("21");
  await form.getByTestId("save-later-lease").click();
  check(/purchase date/.test(await p.getByTestId("later-lease-error").innerText()), "a lease that started by the purchase date is refused, with the reason");
  await form.getByLabel("Lease start").fill("2026-07-01");
  await form.getByLabel("Lease end").fill("2031-06-30");
  await form.getByLabel("Annual increase").fill("3");
  await form.getByLabel("TI per SF").fill("2");
  await form.getByTestId("save-later-lease").click();
  await p.waitForTimeout(500);
  check((await p.getByTestId("later-lease-form").count()) === 0 && /Renewal\s+Alpha Fictional Co\s+7\/1\/2026\s+6\/30\/2031\s+\$21\.00/.test((await hist.innerText()).replace(/\s+/g, " ")), "the renewal is saved and listed in the unit's history");
  check((await statuses()).join("|") === "Renewal, signed|At purchase|Vacant" && /1 unit on a lease signed since purchase/.test(await today.getByTestId("leases-today-summary").innerText()) && !/ended/.test(await today.getByTestId("leases-today-summary").innerText()), "Leases in effect today now shows the renewal, and nothing ended");
  const row1 = (await today.getByTestId("lease-today-row").first().innerText()).replace(/\s+/g, " ");
  check(/001 Alpha Fictional Co 12,000 \$21\.\d\d 7\/1\/2026 6\/30\/2031 Renewal, signed/.test(row1), `the row shows the lease today: tenant, rent, start and end (${row1})`);
  check((await p.getByTestId("unit-lease-today").allInnerTexts()).join("|") === "Renewal, signed", "the rent roll row's flag becomes the renewal");

  // ── A new tenant on the unit that was vacant at purchase, after an overlap is refused ──
  await p.getByRole("button", { name: "Lease details for unit 003" }).click();
  await p.waitForTimeout(300);
  await p.getByTestId("unit-lease-history").getByTestId("add-later-lease").click();
  const f3 = p.getByTestId("later-lease-form");
  check((await f3.getByLabel("Renewal or new tenant").inputValue()) === "new", "on a unit vacant at purchase the form starts as a new tenant");
  await f3.getByLabel("Tenant", { exact: true }).fill("Sample Bike Repair");
  await f3.getByLabel("Lease start").fill("2026-05-01");
  await f3.getByLabel("Lease end").fill("2031-04-30");
  await f3.getByLabel("Rent per SF").fill("22");
  await f3.getByTestId("save-later-lease").click();
  await p.waitForTimeout(500);
  check((await statuses()).join("|") === "Renewal, signed|At purchase|New tenant, signed", "the vacant unit now shows its new tenant's lease");
  const h3 = (await p.getByTestId("unit-lease-history").innerText()).replace(/\s+/g, " ");
  check(/New tenant Sample Bike Repair 5\/1\/2026 4\/30\/2031/.test(h3) && /Vacant 3 months 1\/30\/2026 4\/30\/2026/.test(h3), `its history shows the lease and the three months it was vacant after purchase (${h3.slice(0, 200)})`);

  // ── Saved ──
  await FX.saveLoadUpgrade(p);
  await p.waitForTimeout(1500);
  const saved = ws.data.deals.find((d) => d.id === "sample-deal-1").inputs.units;
  const l1 = saved.find((u) => u.name === "001").laterLeases ?? [], l3 = saved.find((u) => u.name === "003").laterLeases ?? [];
  check(l1.length === 1 && l1[0].kind === "renewal" && l1[0].start === "2026-07-01" && l1[0].end === "2031-06-30" && l1[0].rentPSF === 21 && l1[0].escalationPct === 3 && l1[0].tiPSF === 2 && l1[0].lcPct === null && l3.length === 1 && l3[0].kind === "new" && l3[0].tenantName === "Sample Bike Repair", `both leases are saved on their units (${JSON.stringify(l1[0] ?? null).slice(0, 160)})`);
  check(saved.find((u) => u.name === "001").tenantName === "Alpha Fictional Co" && saved.find((u) => u.name === "001").leaseEnd === "2026-06-30" && saved.find((u) => u.name === "002").laterLeases === undefined, "the rent roll at purchase is unchanged, and the other unit is untouched");

  // ── Dashboard: the item is gone ──
  await p.locator("header").getByTestId("home-button").click();
  await p.waitForTimeout(800);
  check(!/ended with no newer lease recorded/.test(await attText()), "the Dashboard no longer lists an ended lease for the asset");

  // ── Remove the renewal: the flag comes back ──
  await FX.openTab(p, "Rent Roll");
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Lease details for unit 001" }).click();
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Remove the lease starting 2026-07-01" }).click();
  await p.waitForTimeout(500);
  check((await statuses())[0] === "Ended, no lease recorded", "removing the renewal brings the ended flag back");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
