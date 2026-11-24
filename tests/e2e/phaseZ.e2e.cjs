// Phase Z Playwright: the Home page (the app opens on it): attention list
// opening the right tab, fund cards, workflow lanes, quick actions, recent
// activity, and the Working on picker. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const JV = "Example JV II";
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
data.funds[JV] = { ...data.funds["Model Fund I"], name: JV, type: "Joint Venture", capitalActivity: [] };
data.deals = data.deals.map((d) => {
  if (d.id === "sample-deal-1") return { ...d, inputs: { ...d.inputs, units: [{ id: "u1", name: "Suite A", tenantName: "Example Tenant Co", leaseStatus: "occupied", squareFeet: 10000, baseRentPerSF: 10, leaseStart: "2021-01-01", leaseEnd: plus(30) }] } };
  if (d.id === "sample-deal-3") return { ...d, inputs: { ...d.inputs, fundName: JV } };
  return d;
});
data.auditLog = [{ id: "a1", at: new Date(Date.now() - 3600000).toISOString(), user: "colleague@example.com", area: "Fund terms", item: "Model Fund I", field: "Preferred return (%)", path: ["funds", "Model Fund I", "prefPct"], from: 8, to: 9 }];
data.activeDealId = "sample-deal-2";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com", user_metadata: {} } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) body = String(++ws.version);
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
  const home = p.getByTestId("home");

  check((await home.count()) === 1, "the app opens on Home");
  check((await p.getByRole("group", { name: "Home" }).getByRole("button", { name: "Home" }).count()) === 1, "a Home button leads the tab bar");

  // ── Today ──
  const att = p.getByTestId("attention");
  const at = await att.innerText();
  check(/Example Tenant Co expires \(Airport Flex Park\)/.test(at) && /30 d/.test(at), "attention: the lease expiring in 30 days");
  check(/without a \d{4}-\d{2}-\d{2} mark/.test(at) && /Rate cap expires/.test(at), "attention: missing marks and rate caps expiring");

  // ── Recent activity ──
  const ra = await p.getByTestId("recent-activity").innerText();
  check(/colleague@example\.com/.test(ra) && /Preferred return/.test(ra), "recent activity from the change log");

  // ── Fund cards ──
  const cards = p.getByTestId("fund-card");
  check((await cards.count()) === 2, "a card per fund");
  const jvCard = await cards.filter({ hasText: JV }).innerText();
  check(/Joint Venture/.test(jvCard) && /NAV/.test(jvCard) && /Dry powder/.test(jvCard) && /Next key date/.test(jvCard), "the JV card: type badge, NAV, dry powder, next key date");

  // ── Section order (user, 11/24): Watch List, Setup & Maintenance, Workflows ──
  const ys = [];
  for (const id of ["attention", "setup-maintenance", "lanes", "fund-cards"]) ys.push((await p.getByTestId(id).boundingBox())?.y ?? -1);
  check(ys.every((y, i) => y >= 0 && (i === 0 || y > ys[i - 1])), `sections in order: Watch List, Setup & Maintenance, Workflows, then funds (${ys.map(Math.round).join(", ")})`);
  check(/^Watch List/.test(await p.getByTestId("attention").locator("h3").innerText()) && /Setup & Maintenance/.test(await p.getByTestId("setup-maintenance").innerText()) && !/needs attention ·|Today · needs attention/.test(await p.getByTestId("home").innerText()), "renamed Watch List; Setup & Maintenance holds the quick actions");

  // ── Lanes ──
  const lanes = p.getByTestId("lane");
  const labels = await lanes.evaluateAll((els) => els.map((e) => e.querySelector("p")?.textContent));
  check(labels.join() === "Acquisitions,Dispositions,Asset Management,Property Management,Portfolio Management,Market,Library", `lanes in tab-bar order: ${labels.join(", ")}`);
  check(/Occupancy/.test(await lanes.filter({ hasText: "Asset Management" }).innerText()) && /NAV/.test(await lanes.filter({ hasText: "Portfolio Management" }).innerText()), "lanes carry live numbers");

  // ── The lease opens its asset on Leases ──
  await att.locator("li", { hasText: "Example Tenant Co" }).getByRole("button").click();
  await p.waitForTimeout(1000);
  const main = await p.locator("main").innerText();
  check((await p.getByTestId("home").count()) === 0 && /Airport Flex Park/.test(main), "an attention item opens its tab on that asset");

  // ── Lane link and quick action ──
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(800);
  await lanes.first().getByRole("button", { name: "Open Pipeline" }).click();
  await p.waitForTimeout(800);
  check((await p.getByTestId("home").count()) === 0 && /pipeline/i.test(await p.locator("main").innerText()), "a lane link opens its tab");
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(800);
  await p.getByTestId("quick-actions").getByRole("button", { name: "New fund setup" }).click();
  await p.waitForTimeout(600);
  check((await p.getByRole("dialog", { name: "New fund" }).count()) === 1, "quick action: New fund setup opens the fund editor");
  await p.getByRole("dialog", { name: "New fund" }).getByRole("button", { name: /Cancel|Close/ }).first().click();
  await p.waitForTimeout(400);
  const qa = await p.getByTestId("quick-actions").innerText();
  check(["New asset", "New fund setup", "Upload rent roll", "Upload Yardi actuals", "Import marks", "Record capital activity", "New report"].every((x) => qa.includes(x)), "all seven quick actions");

  // ── Working on: the JV only ──
  await p.getByTestId("working-on").selectOption(JV);
  await p.waitForTimeout(1000);
  check((await p.getByTestId("fund-card").count()) === 1 && /Joint Venture/.test(await p.getByTestId("fund-card").innerText()), "Home follows the Working on picker: the JV's card only");
  check(!/Example Tenant Co/.test(await p.getByTestId("attention").innerText()), "and only the JV's attention items");
  check(/Example JV II \(Joint Venture\)/.test(await p.getByTestId("home").locator("p").first().innerText()), "the page says which portfolio it shows");
  await p.screenshot({ path: `${S}/home.png`, fullPage: true });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
