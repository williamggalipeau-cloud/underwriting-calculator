// Phase L Playwright: Asset Return additions (GP profit, GP promote, GP ROE,
// projected fee revenue). Fictional fixture; Supabase mocked.
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

  await p.getByRole("button", { name: /^Asset Return/ }).first().click();
  await p.waitForTimeout(1500);
  const labels = (await main.getByTestId("wf-row").allInnerTexts()).map((t) => t.split("\n")[0].trim());
  check(!labels.includes("GP Promote") && labels.includes("GP profit") && labels.includes("GP promote") && labels.includes("GP ROE"), `waterfall rows: ${labels.join(", ")}`);
  const row = (l) => main.getByTestId("wf-row").filter({ hasText: new RegExp(`^${l}`) }).first();
  check(/GP upside above capital returned/.test(await row("GP profit").innerText()) && /GP upside above its pro-rata share/.test(await row("GP promote").innerText()), "sub-lines explain profit vs. promote");
  check(/\d+\.\d%$/.test((await row("GP ROE").innerText()).trim()) && /not annualized/.test(await row("GP ROE").innerText()), `GP ROE: ${(await row("GP ROE").innerText()).replace(/\s+/g, " ")}`);
  const fr = main.getByTestId("fee-revenue");
  check((await fr.count()) === 1 && /Property management/i.test(await fr.innerText()) && /Construction management/i.test(await fr.innerText()) && /fund.s management fee/.test(await fr.innerText()), "fee revenue: PM and CM by year; AM fee noted as the fund's");
  const pv8 = await fr.getByTestId("fee-pv").innerText();
  await fr.getByLabel("Fee discount rate").fill("0");
  await p.waitForTimeout(400);
  check((await fr.getByTestId("fee-pv").innerText()) === (await fr.getByTestId("fee-total").innerText()) && pv8 !== (await fr.getByTestId("fee-pv").innerText()), `PV at 0% = total (${await fr.getByTestId("fee-total").innerText()}; at 8% ${pv8})`);
  const [x1] = await Promise.all([p.waitForEvent("download"), fr.getByRole("button", { name: "Excel" }).click()]);
  check(/fee-revenue\.xlsx$/.test(x1.suggestedFilename()), `Excel: ${x1.suggestedFilename()}`);
  await p.screenshot({ path: S + "/phaseL_returns.png", fullPage: true });

  // Fund Return carries the same labels
  await p.getByRole("button", { name: /^Fund Return/ }).first().click();
  await p.waitForTimeout(1500);
  const ft = await main.innerText();
  check(/GP profit/.test(ft) && /GP promote/.test(ft) && !/GP Promote/.test(ft), "Fund Return: GP profit and GP promote");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
