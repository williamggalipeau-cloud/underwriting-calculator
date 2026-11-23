// "Working on" fund picker Playwright: a header filter over all tabs,
// remembered on the person's sign-in, never changes the data. Fictional
// fixture with a second (Joint Venture) fund; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const JV = "Example JV II";
data.funds[JV] = { ...data.funds["Model Fund I"], name: JV, type: "Joint Venture", capitalActivity: [] };
data.deals = data.deals.map((d) => (d.id === "sample-deal-3" ? { ...d, inputs: { ...d.inputs, fundName: JV } } : d));
data.deals.push({ id: "pipe-1", inputs: { ...data.deals[1].inputs, propertyName: "Fictional Pipeline Dock", fundName: "", acquisitionDate: "2027-03-31" } });
data.pipeline = { deals: [{ id: "pl1", name: "Fictional Pipeline Dock", stage: "screening", probabilityPct: 25, targetFund: JV, dealId: "pipe-1" }], mappings: {} };
data.activeDealId = "sample-deal-1";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com", user_metadata: {} } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saves = 0;
const metaPuts = [];
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  await ctx.addInitScript((v) => { if (!localStorage.getItem("sb-nydqmigxorahfkfpkjnq-auth-token")) localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); }, JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saves++; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) {
      if (req.method() === "PUT") { const d = JSON.parse(req.postData() || "{}"); metaPuts.push(d); sess.user.user_metadata = { ...sess.user.user_metadata, ...(d.data ?? {}) }; }
      body = JSON.stringify(sess.user);
    }
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");
  const pick = p.getByTestId("working-on");
  const assetsFig = async () => (await p.getByTestId("firm-figure").filter({ hasText: "Assets" }).innerText()).replace(/\s+/g, " ");

  // ── Options ──
  const opts = await pick.locator("option").allInnerTexts();
  check(opts[0] === "All funds" && opts.includes("Model Fund I") && opts.includes(`${JV} · Joint Venture`), `picker: ${opts.join(" | ")}`);
  check((await pick.inputValue()) === "", "opens on All funds");
  const firmAssets = await assetsFig();
  check(/across 2 funds/.test(firmAssets), `firm strip (All funds): ${firmAssets}`);
  check((await p.getByTestId("firm-scope").count()) === 0, "no scope label under All funds");
  const savesBefore = saves;

  // ── Choose the JV ──
  await pick.selectOption(JV);
  await p.waitForTimeout(800);
  const jvAssets = await assetsFig();
  check(/^Assets 1 across 1 fund$/.test(jvAssets), `firm strip follows the picker: ${jvAssets}`);
  check(/Example JV II \(Joint Venture\)/.test(await p.getByTestId("firm-scope").innerText()), "the strip is labelled with the fund");
  await p.getByRole("button", { name: /^Asset Summary/ }).first().click();
  await p.waitForTimeout(800);
  let t = await main.innerText();
  check(t.includes("Harbor Light Industrial") && !t.includes("Airport Flex Park") && !t.includes("Route 9 Small Bay"), "Asset Summary shows only the JV's asset");
  await p.getByRole("button", { name: /^Fund Return/ }).first().click();
  await p.waitForTimeout(800);
  t = await main.innerText();
  check(t.includes(JV) && !/Airport Flex Park/.test(t), "Fund Return shows only the JV");
  await p.getByRole("button", { name: /^Valuation/ }).first().click();
  await p.waitForTimeout(800);
  t = await main.innerText();
  check(t.includes("Harbor Light Industrial") && !t.includes("Granite Ave Industrial"), "Valuation shows only the JV's asset");
  await p.getByRole("button", { name: /^Pipeline/ }).first().click();
  await p.waitForTimeout(800);
  t = await main.innerText();
  check(t.includes("Fictional Pipeline Dock"), "Pipeline: a deal screened for the JV shows under the JV");
  // Deal tabs: the asset list is the JV's asset plus its pipeline deal.
  await p.getByRole("button", { name: /^Unit Roll/ }).first().click();
  await p.waitForTimeout(800);
  t = await main.innerText();
  check(/2 open/.test(t), `asset list scoped: ${(t.match(/\d+ open[^\n]*/) || [""])[0]}`);
  check(saves === savesBefore, "choosing a fund changes no data (nothing saved)");
  check(metaPuts.some((d) => d.data?.working_on === JV), "remembered on the person's sign-in (user metadata)");

  // ── Model Fund I: the pipeline deal for the JV is not listed ──
  await pick.selectOption("Model Fund I");
  await p.waitForTimeout(800);
  const mfAssets = await assetsFig();
  check(/across 1 fund$/.test(mfAssets) && !/^Assets 1 /.test(mfAssets), `Model Fund I strip: ${mfAssets}`);
  await p.getByRole("button", { name: /^Pipeline/ }).first().click();
  await p.waitForTimeout(800);
  check(!(await main.innerText()).includes("Fictional Pipeline Dock"), "a deal screened for another fund is hidden");

  // ── Reopen: the choice comes back ──
  await p.reload();
  await p.waitForTimeout(3500);
  check((await p.getByTestId("working-on").inputValue()) === "Model Fund I", "reopens on the fund last worked on");

  // ── Back to All funds ──
  const savesAfterReload = saves;
  await p.getByTestId("working-on").selectOption("");
  await p.waitForTimeout(800);
  check((await assetsFig()) === firmAssets, "All funds: the whole firm again");
  await p.getByRole("button", { name: /^Pipeline/ }).first().click();
  await p.waitForTimeout(800);
  check((await main.innerText()).includes("Fictional Pipeline Dock"), "All funds: every pipeline deal");
  await p.screenshot({ path: `${S}/picker.png` });
  check(saves === savesAfterReload, "still nothing saved");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
