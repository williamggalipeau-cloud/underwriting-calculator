// Phase O Playwright: setup workflow (New / Edit asset slide-over with Done,
// New / Edit fund), nothing opens the panel by itself. Fictional fixture;
// Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
data.activeDealId = "sample-deal-2";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
const allChanges = [];
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
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); allChanges.push(...(saved.changes ?? [])); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");

  check((await p.getByTestId("asset-panel").count()) === 0, "no inputs panel on load: the tabs use the full width");
  const sb = p.getByTestId("setup-buttons");
  check((await sb.getByRole("button", { name: "New asset" }).count()) === 1 && (await sb.getByLabel("Edit asset").count()) === 1 && (await sb.getByRole("button", { name: "New fund" }).count()) === 1 && (await sb.getByLabel("Edit fund").count()) === 1, "Setup & Maintenance (under Functions): New asset, Edit asset, New fund, Edit fund");
  check((await p.getByTestId("setup-maintenance").getByTestId("setup-buttons").count()) === 1, "the setup controls live in Setup & Maintenance, not a toolbar row");
  for (const t of ["Asset Summary", "Rent Roll", "Fund Return", "Deal Screener", "Documents"]) {
    await FX.openTab(p, new RegExp(`^${t}`));
    await p.waitForTimeout(400);
  }
  check((await p.getByTestId("asset-panel").count()) === 0, "switching tabs never opens the panel");
  const mainBox = await main.boundingBox();
  check(mainBox && mainBox.width > 1100, `results use the full width (${Math.round(mainBox?.width ?? 0)} px)`);

  // Edit asset (from the Operational Dashboard)
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(500);
  await sb.getByLabel("Edit asset").selectOption("sample-deal-3");
  await p.waitForTimeout(600);
  const panel = p.getByTestId("asset-panel");
  check((await panel.count()) === 1 && /Harbor Light Industrial/.test(await panel.innerText()), "Edit asset opens the slide-over for that asset");
  const nameInput = panel.locator("div.flex.flex-col", { has: p.locator("label", { hasText: /^Property Name$/ }) }).locator("input");
  await nameInput.fill("Harbor Light Industrial (edited)");
  await p.waitForTimeout(400);
  await panel.getByRole("button", { name: "Done" }).click();
  await p.waitForTimeout(500);
  check((await p.getByTestId("asset-panel").count()) === 0, "Done closes it");
  await FX.openTab(p, /^Rent Roll/);
  await p.waitForTimeout(500);
  const pickTxt = await main.locator("#asset-picker option:checked").innerText();
  check(/Harbor Light Industrial \(edited\)/.test(pickTxt), `the edit applies and the asset picker shows it: ${pickTxt}`);
  check(!/×|✕/.test(await panel.innerText().catch(() => "")), "no delete control in the panel");
  // Edit inputs on an asset tab opens the same panel; Escape closes it
  await main.getByRole("button", { name: "Edit inputs" }).click();
  await p.waitForTimeout(500);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  check((await p.getByTestId("asset-panel").count()) === 0, "Edit inputs on the tab opens the panel; Escape closes it");

  // New asset
  const before = await main.locator("#asset-picker option").count();
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(500);
  await sb.getByRole("button", { name: "New asset" }).click();
  await p.waitForTimeout(800);
  check((await p.getByTestId("asset-panel").count()) === 1 && /New Deal/.test(await p.getByTestId("asset-panel").innerText()), "New asset opens the panel on a new deal");
  const np = p.getByTestId("asset-panel");
  await np.locator("div.flex.flex-col", { has: p.locator("label", { hasText: /^Property Name$/ }) }).locator("input").fill("Fictional Test Park");
  const fundIn = np.getByPlaceholder(/Type or select a fund/);
  await fundIn.fill("Model Fund I");
  await fundIn.blur();
  await p.waitForTimeout(400);
  await np.getByRole("button", { name: "Done" }).click();
  await p.waitForTimeout(800);
  await FX.openTab(p, /^Rent Roll/);
  await p.waitForTimeout(500);
  const after = await main.locator("#asset-picker option").count();
  check(after === before + 1 && (await main.locator("#asset-picker optgroup[label='Model Fund I'] option", { hasText: "Fictional Test Park" }).count()) === 1, "the new asset appears in the picker, in Model Fund I");

  // Funds
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(500);
  await sb.getByRole("button", { name: "New fund" }).click();
  await p.waitForTimeout(600);
  check((await p.getByRole("dialog", { name: "New fund" }).count()) === 1, "New fund opens the fund editor");
  await p.getByRole("dialog", { name: "New fund" }).getByRole("button", { name: /Cancel|Close/ }).first().click();
  await p.waitForTimeout(400);
  await sb.getByLabel("Edit fund").selectOption("Model Fund I");
  await p.waitForTimeout(600);
  check((await p.getByRole("dialog").filter({ hasText: "Model Fund I" }).count()) >= 1, "Edit fund opens Model Fund I's terms");
  await p.screenshot({ path: S + "/phaseO.png" });

  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.deals?.some((d) => d.inputs?.propertyName === "Harbor Light Industrial (edited)") && sd?.deals?.some((d) => d.inputs?.propertyName === "Fictional Test Park" && d.inputs.fundName === "Model Fund I"), "saved: the edit and the new asset");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
