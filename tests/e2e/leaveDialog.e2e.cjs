// 1.1.12 (user, 11/27): leaving a tab with unsaved changes offers three
// choices: Save and continue, Discard changes, Stay here (no dead end).
// Fictional fixture; Supabase mocked.
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
  await ctx.addInitScript((v) => { localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); window.__baywiseLeaveModal = true; }, JSON.stringify(sess));
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
  await p.waitForTimeout(800);
  const main = p.locator("main");
  const dlg = p.getByTestId("leave-dialog");
  const tabOn = async (name) => (await p.getByRole("group").getByRole("button", { name, exact: true }).first().getAttribute("class").catch(() => "")) ?? "";

  await FX.openTab(p, "Rent Roll");
  await p.waitForTimeout(800);
  const unit = main.getByLabel("Unit name").first();
  const original = await unit.inputValue();
  const s0 = saves;

  // Stay here
  await unit.fill("EDIT-1");
  await p.waitForTimeout(400);
  await p.getByRole("group", { name: "Asset Management" }).getByRole("button", { name: "Leases", exact: true }).click();
  await p.waitForTimeout(600);
  check((await dlg.count()) === 1 && /unsaved changes/.test(await dlg.innerText()) && (await dlg.getByRole("button").allInnerTexts()).join("|") === "Stay here|Discard changes|Save and continue", "leaving with unsaved changes: Stay here, Discard changes, Save and continue");
  await dlg.getByRole("button", { name: "Stay here" }).click();
  await p.waitForTimeout(400);
  check((await dlg.count()) === 0 && (await main.getByLabel("Unit name").first().inputValue()) === "EDIT-1", "Stay here: still on the Rent Roll, the edit is kept");

  // Discard changes
  await p.getByRole("group", { name: "Asset Management" }).getByRole("button", { name: "Leases", exact: true }).click();
  await p.waitForTimeout(500);
  await dlg.getByRole("button", { name: "Discard changes" }).click();
  await p.waitForTimeout(2500);
  check((await dlg.count()) === 0 && /bg-blue-600/.test(await tabOn("Leases")) && saves === s0, "Discard changes: moved to Leases, nothing saved");
  await FX.openTab(p, "Rent Roll");
  await p.waitForTimeout(1000);
  check((await dlg.count()) === 0 && (await main.getByLabel("Unit name").first().inputValue()) === original, `the discarded edit is gone (unit ${original}) and no prompt follows`);

  // Save and continue
  await main.getByLabel("Unit name").first().fill("EDIT-2");
  await p.waitForTimeout(400);
  await p.getByRole("group", { name: "Asset Management" }).getByRole("button", { name: "Leases", exact: true }).click();
  await p.waitForTimeout(500);
  await dlg.getByRole("button", { name: "Save and continue" }).click();
  await p.waitForTimeout(2500);
  check((await dlg.count()) === 0 && /bg-blue-600/.test(await tabOn("Leases")) && saves > s0 && JSON.stringify(ws.data).includes("EDIT-2"), "Save and continue: saved, then moved to Leases");
  check(errs.length === 0, `no page errors${errs.length ? `: ${errs.join("; ")}` : ""}`);
  await b.close();
  console.log(fails ? `${fails} failed` : "all passed");
  process.exit(fails ? 1 : 0);
})();
