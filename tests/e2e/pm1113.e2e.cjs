// 1.1.13 (user, 11/27): the property manager is set in asset setup (the
// Property section of the asset inputs): a name and a firm, this firm or a
// third-party servicer. It shows on Asset Summary and the Property Management
// tabs, and is flagged when it disagrees with who the fund pays the property
// management fee to. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let fails = 0, saves = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => { localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); }, JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { const s = JSON.parse(req.postData()); ws.data = s.new_data ?? ws.data; saves++; body = String(++ws.version); }
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
  await FX.openSetup(p);
  await p.getByTestId("setup-buttons").getByLabel("Edit asset").selectOption("sample-deal-3");
  await p.waitForTimeout(600);
  const panel = p.getByTestId("asset-panel");
  const field = (label) => panel.locator("div.flex.flex-col", { has: p.locator("label", { hasText: new RegExp(`^${label}$`) }) }).locator("input").first();
  const labels = await panel.locator("label").allInnerTexts();
  const at = (t) => labels.findIndex((l) => l.trim().toLowerCase() === t);
  check(at("leasing manager") >= 0 && at("property manager") === at("leasing manager") + 1 && at("property management firm") === at("property manager") + 1, "Property Manager and Property Management Firm sit right under Leasing Manager");
  await field("Property Manager").fill("Pat Lee");
  const firm = panel.getByTestId("pm-firm");
  check((await firm.locator("select").inputValue()) === "sponsor" && (await firm.getByLabel("Property management firm name").count()) === 0 && (await firm.getByTestId("pm-fee-mismatch").count()) === 0, "the firm starts as this firm (sponsor): no name box, no flag");
  await firm.locator("select").selectOption("third");
  await firm.getByLabel("Property management firm name").fill("Fictional Property Services LLC");
  await p.waitForTimeout(300);
  check(/third-party servicer manages this asset, but the fund's terms pay the property management fee to the sponsor/.test(await firm.getByTestId("pm-fee-mismatch").innerText()), "a third-party servicer is flagged while the fund pays the fee to the sponsor");
  await panel.getByRole("button", { name: /^Done/ }).click().catch(() => {});
  await p.waitForTimeout(400);
  await FX.openTab(p, /^Asset Summary/);
  await p.waitForTimeout(1200);
  const cells = await p.getByTestId("cell-property-manager").allInnerTexts();
  check(cells.some((c) => /Pat Lee, Fictional Property Services LLC/.test(c) && /⚠/.test(c)), `Asset Summary shows the property manager and its firm, flagged (${cells.slice(0, 3).join(" | ")})`);
  await FX.openTab(p, /^Insurance/);
  await p.waitForTimeout(800);
  const pm = p.getByTestId("pm-manager");
  check((await pm.count()) === 1 && /Property manager: Pat Lee, Fictional Property Services LLC/.test(await pm.innerText()), "the Property Management tabs show it, read-only");
  check((await p.getByTestId("pm-insurance").locator("input[aria-label='Property management firm name']").count()) === 0, "it can only be changed in the asset's inputs");
  await p.waitForTimeout(2500);
  const d3 = ws.data.deals.find((d) => d.id === "sample-deal-3")?.inputs;
  check(saves > 0 && d3?.propertyManager === "Pat Lee" && d3?.propertyManagementFirm?.type === "third" && d3.propertyManagementFirm.name === "Fictional Property Services LLC", "saved on the asset");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
