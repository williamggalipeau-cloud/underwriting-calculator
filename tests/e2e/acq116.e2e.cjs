// 1.1.6 (user, 11/25): the Acquisitions flow. The Underwriter's Pipeline
// Deal dropdown reads the Pipeline (Active / History); picking a deal not yet
// screened builds its model from the Pipeline figures; the screened deal
// pre-loads Portfolio Impact (in its target fund) and opens Comps; passed
// deals are read-only; closed deals point to their asset. Also: Fund terms at
// the top of Portfolio Return; Load Model Fund I pre-screens the sample
// pipeline deals. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const FUND = "Model Fund I";
const MESA_ASSET = data.deals.find((d) => d.id === "sample-deal-3").inputs.propertyName;
const row = (o) => ({ probabilityPct: 20, address: "", city: "Reno", state: "NV", market: "", source: "Fictional", seller: "", owner: "", nextStep: "", nextDate: "", psaDate: "", depositDue: "", hardDate: "", ddStart: "", ddDeadline: "", loanClosing: "", passReason: "", notes: "", omDocId: null, dealId: null, dateAdded: "2026-10-01", stageDate: "", ...o });
data.deals.push({ id: "pipe-pass", inputs: { ...structuredClone(data.deals[0].inputs), propertyName: "Fictional Ridge Flex", fundName: "", acquisitionDate: "2027-06-30", units: [] } });
data.pipeline = {
  mappings: {},
  deals: [
    row({ id: "r-canyon", name: "Fictional Canyon Flex", stage: "loi", targetFund: FUND, askingPrice: 6850000, noi: 466000, sf: 36000, capRatePct: 6.8, expectedClose: "2027-02-28" }),
    row({ id: "r-harbor", name: "Fictional Harbor Small Bay", stage: "screening", targetFund: FUND, askingPrice: 7200000, noi: 425000, sf: 29000, expectedClose: "2027-04-24" }),
    row({ id: "r-ridge", name: "Fictional Ridge Flex", stage: "passed", targetFund: FUND, askingPrice: 5400000, noi: 356000, sf: 31000, passReason: "Seller's price 8% above our bid", stageDate: "2026-09-30", dealId: "pipe-pass" }),
    row({ id: "r-mesa", name: "Fictional Mesa Distribution", stage: "closed", targetFund: FUND, askingPrice: 9000000, noi: 560000, sf: 30000, stageDate: "2026-03-14", dealId: "sample-deal-3", converted: true }),
  ],
};
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: FUND, version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { const s = JSON.parse(req.postData()); ws.data = s.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    else if (u.includes("/storage/")) body = JSON.stringify({ Key: "x" });
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  const alerts = [];
  p.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  const main = p.locator("main");
  const picked = () => p.locator("#pipeline-deal-picker option:checked").innerText();

  // ── The dropdown reads the Pipeline ──
  await FX.openTab(p, /^Underwriter/);
  await p.waitForTimeout(800);
  const groups = await p.locator("#pipeline-deal-picker optgroup").evaluateAll((gs) => gs.map((g) => `${g.label}: ${[...g.querySelectorAll("option")].map((o) => o.textContent).join(" | ")}`));
  check(groups[0] === "Active: Fictional Canyon Flex · LOI · not screened yet | Fictional Harbor Small Bay · Screening · not screened yet", `Active, by stage: ${groups[0]}`);
  check(groups[1] === "History: Fictional Ridge Flex · Passed / lost 9/30/2026 · read-only | Fictional Mesa Distribution · Closed 3/14/2026 → asset", `History, newest first: ${groups[1]}`);
  check((await main.getByTestId("screener-owned").count()) === 1, "an owned asset on screen: the notice, and no deal picked");

  // ── Picking a deal not screened yet builds its model ──
  await p.locator("#pipeline-deal-picker").selectOption({ label: "Fictional Canyon Flex · LOI · not screened yet" });
  await p.waitForTimeout(1200);
  const just = main.getByTestId("screener-just-screened");
  check((await just.count()) === 1 && /Fictional Canyon Flex was screened from its Pipeline row just now/.test(await just.innerText()) && /\$6,850,000[\s\S]*\$466,000[\s\S]*36,000 SF[\s\S]*2\/28\/2027/.test(await just.innerText()), "picked: screened from the Pipeline figures (price, NOI, size, close)");
  check((await picked()).startsWith("Fictional Canyon Flex · LOI · screened"), `the dropdown now says screened (${await picked()})`);
  check((await main.getByTestId("screener-impact").count()) === 1 && (await p.locator("input[value='6850000']").count()) > 0, "the Screener shows its model, at the asking price");
  check(alerts.length === 0, "screening on pick asks nothing (user, 11/25)");
  await p.screenshot({ path: S + "/acq116_screened.png" });

  // ── Portfolio Impact pre-loaded, in the target fund ──
  await main.getByTestId("screener-next").getByRole("button", { name: `Portfolio Impact in ${FUND} →` }).click();
  await p.waitForTimeout(2000);
  const fi = main.getByTestId("fund-impact-tab");
  check((await fi.count()) === 1 && (await fi.getByLabel("Candidate Fictional Canyon Flex").isChecked()) && (await fi.getByLabel("Fund").inputValue()) === FUND, "Portfolio Impact opens with it as the candidate, in Model Fund I");

  // ── Comps opens on the same deal ──
  await FX.openTab(p, /^Underwriter/);
  await p.waitForTimeout(800);
  await main.getByTestId("screener-next").getByRole("button", { name: "Comps →" }).click();
  await p.waitForTimeout(1200);
  check((await p.locator("#asset-picker option:checked").innerText()) === "Fictional Canyon Flex", "Comps opens on the Screener's deal");

  // ── Passed / lost: read-only ──
  await FX.openTab(p, /^Underwriter/);
  await p.waitForTimeout(800);
  await p.locator("#pipeline-deal-picker").selectOption({ label: "Fictional Ridge Flex · Passed / lost 9/30/2026 · read-only" });
  await p.waitForTimeout(1000);
  const pass = main.getByTestId("screener-passed");
  check((await pass.count()) === 1 && /READ-ONLY/.test(await pass.innerText()) && /Seller's price 8% above our bid/.test(await pass.innerText()), "passed: read-only, with the reason");
  const ro = main.getByTestId("screener-readonly");
  check((await ro.count()) === 1 && (await ro.evaluate((f) => f.disabled)) && (await ro.locator("input").first().isDisabled()), "its screening is shown greyed, inputs disabled");
  check((await main.getByTestId("screener-sync").count()) === 0 && (await main.getByTestId("screener-next").count()) === 0, "no next steps or Pipeline updates for a decided deal");

  // ── Closed: points to the asset ──
  await p.locator("#pipeline-deal-picker").selectOption({ label: "Fictional Mesa Distribution · Closed 3/14/2026 → asset" });
  await p.waitForTimeout(800);
  const cl = main.getByTestId("screener-closed");
  check((await cl.count()) === 1 && /now an asset of Model Fund I/.test(await cl.innerText()) && (await main.getByTestId("screener-impact").count()) === 0, "closed: points to the asset, no screener");
  await cl.getByRole("button", { name: "Open asset →" }).click();
  await p.waitForTimeout(1200);
  check((await p.locator("#asset-picker option:checked").innerText()) === MESA_ASSET, `Open asset → opens that asset (${MESA_ASSET})`);

  // ── Portfolio Return: Fund terms at the top of the card ──
  await FX.openTab(p, "Portfolio Return");
  await p.waitForTimeout(1500);
  const txt = await main.innerText();
  const iTerms = txt.indexOf("Fund terms"), iGp = txt.indexOf("GP commitment"), iSub = txt.indexOf("Subscription line");
  check(iTerms > 0 && iTerms < iGp && iTerms < iSub, `Fund terms sits above GP commitment and the subscription line (${iTerms} < ${iGp}, ${iSub})`);

  // ── Load Model Fund I: the sample pipeline deals come pre-screened ──
  const sm = p.getByTestId("sample-data-menu");
  if (!(await sm.isVisible())) { await FX.openSetup(p); await p.waitForTimeout(200); }
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(200);
  await sm.getByRole("menuitem", { name: /Load Model Fund I/ }).click();
  await p.waitForTimeout(6000);
  check(alerts.some((a) => /tenant-named sample leases/.test(a)), "Load Model Fund I says unnamed sample leases are replaced");
  await FX.openTab(p, /^Underwriter/);
  await p.waitForTimeout(1000);
  const active = await p.locator("#pipeline-deal-picker optgroup[label='Active'] option").allInnerTexts();
  const samples = active.filter((t) => /^Example /.test(t));
  check(samples.length === 5 && samples.every((t) => / · screened$/.test(t)), `the five sample pipeline deals (three for Model Fund I, two for the sample joint venture) are pre-screened (${samples.join(" | ")})`);

  check(errs.length === 0, `no page errors${errs.length ? `: ${errs.join("; ")}` : ""}`);
  await b.close();
  console.log(fails ? `${fails} failed` : "all passed");
  process.exit(fails ? 1 : 0);
})();
