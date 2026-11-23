// Phase P Playwright: Dispositions: start a sale, BOVs and broker, offers
// with net proceeds and selection, closing statement, track record, Excel,
// Home lane. Fictional fixture; Supabase mocked.
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
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Roof credit" : undefined));
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");

  // ── Tab group ──
  const groups = await p.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter(Boolean));
  check(groups.indexOf("Dispositions") === groups.indexOf("Acquisitions") + 1, "a Dispositions group right after Acquisitions");
  const dg = p.getByRole("group", { name: "Dispositions" });
  check((await dg.getByRole("button").allInnerTexts()).join() === "Assets for Sale,Offers,Track Record,Sale Documents", "its tabs: Assets for Sale, Offers, Track Record, Sale Documents");

  // ── Start a sale ──
  await dg.getByRole("button", { name: "Assets for Sale" }).click();
  await p.waitForTimeout(600);
  const ns = p.getByTestId("new-sale");
  await ns.getByLabel("Sale asset").selectOption({ label: "Airport Flex Park" });
  await ns.getByLabel("Sale reason").selectOption("hold_reached");
  await ns.getByRole("button", { name: "Start sale" }).click();
  await p.waitForTimeout(600);
  check((await p.getByTestId("sale-row").count()) === 1 && /Airport Flex Park/.test(await p.getByTestId("sale-row").innerText()) && /Preparing/.test(await p.getByTestId("sale-row").innerText()), "a sale starts in Preparing");
  const card = p.getByTestId("sale-card");
  await card.getByLabel("Target price").fill("9000000");
  await card.getByLabel("Target close").fill("2027-03-31");
  await card.getByRole("button", { name: "+ Add BOV" }).click();
  await card.getByLabel("BOV broker").fill("Example Brokerage");
  await card.getByLabel("BOV price").fill("9200000");
  await card.getByRole("button", { name: "Choose" }).click();
  await card.getByLabel("Listing fee").fill("1.25");
  await card.getByLabel("CAs signed").fill("14");
  await p.waitForTimeout(300);
  check(/Chosen/.test(await card.innerText()), "BOV recorded and broker chosen");

  // ── Offers ──
  await card.getByRole("button", { name: /Add offer/ }).click();
  await card.getByRole("button", { name: /Add offer/ }).click();
  await p.waitForTimeout(300);
  check(/Offers/.test(await p.getByTestId("sale-row").innerText()), "adding an offer moves the sale to Offers");
  await dg.getByRole("button", { name: "Offers" }).click();
  await p.waitForTimeout(600);
  const og = p.getByTestId("offer-group");
  await og.getByLabel("Buyer", { exact: true }).nth(0).fill("Example REIT");
  await og.getByLabel("Offer price").nth(0).fill("8800000");
  await og.getByLabel("Buyer", { exact: true }).nth(1).fill("Fictional Fund");
  await og.getByLabel("Offer price").nth(1).fill("9400000");
  await p.waitForTimeout(500);
  const nets = await og.getByTestId("offer-net").allInnerTexts();
  const val = (s) => Number(s.replace(/[^0-9.]/g, ""));
  check(nets.length === 2 && val(nets[1]) > val(nets[0]) && val(nets[1]) < 9400000 && /best/.test(nets[1]), `net proceeds after costs and loan payoff, the best marked: ${nets.join(" / ")}`);
  await og.getByRole("button", { name: "Select" }).nth(1).click();
  await p.waitForTimeout(300);
  check((await og.getByRole("button", { name: "Selected ✓" }).count()) === 1, "one offer selected");

  // ── Contract and closing ──
  await dg.getByRole("button", { name: "Assets for Sale" }).click();
  await p.waitForTimeout(500);
  if (!(await p.getByTestId("sale-card").count())) await p.getByTestId("sale-row").locator("button").first().click();
  await p.waitForTimeout(300);
  const so = await p.getByTestId("sale-offers").innerText();
  check(so.indexOf("Fictional Fund") < so.indexOf("Example REIT"), "the sale's summary lists offers best net first");
  const c2 = p.getByTestId("sale-card");
  await c2.getByLabel("Stage").selectOption("contract");
  await c2.getByLabel("PSA date").fill("2026-11-01");
  await c2.getByLabel("Contract price").fill("9300000");
  await c2.getByLabel("Contract price").blur();
  await p.waitForTimeout(400);
  check(/\$9,400,000 → \$9,300,000 \(Roof credit\)/.test(await c2.innerText()), "a price change under contract is logged with its reason");
  await c2.getByRole("button", { name: /Record closing statement/ }).click();
  await c2.getByLabel("Closed on").fill("2026-11-20");
  await c2.getByLabel("Sale price").fill("9300000");
  await c2.getByRole("button", { name: "Record closing" }).click();
  await p.waitForTimeout(800);
  check((await p.getByTestId("sale-row").count()) === 0, "a closed sale leaves the active list");
  await p.getByLabel(/Include closed/).check();
  if (!(await p.getByTestId("sale-card").count())) await p.getByTestId("sale-row").locator("button").first().click();
  check(/Closed 11\/20\/2026: price \$9,300,000/.test(await p.getByTestId("sale-closed").innerText()), "closing statement shown: price, costs, payoff, net");

  // ── Track record ──
  await dg.getByRole("button", { name: "Track Record" }).click();
  await p.waitForTimeout(800);
  const trt = await p.getByTestId("track-record").innerText();
  check(/Airport Flex Park/.test(trt) && /\$9,300,000/.test(trt) && /%/.test(trt), "Track Record: the sale with IRR");
  check(/Model Fund I/.test(await p.getByTestId("track-totals").innerText()) && /Firm/.test(await p.getByTestId("track-totals").innerText()), "fund and firm totals");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("track-record").getByRole("button", { name: "Excel" }).click()]);
  check(/track-record-.*\.xlsx$/.test(dl.suggestedFilename()), "Track Record Excel");

  // ── Home lane ──
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(800);
  const lane = p.getByTestId("lane").filter({ hasText: "Dispositions" });
  check((await lane.count()) === 1 && /Closed in \d{4}\s*1/.test((await lane.innerText()).replace(/\n/g, " ")), "Home: a Dispositions lane");

  // ── Saved ──
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  const dd = sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs;
  const s0 = dd?.dispositions?.[0];
  check(s0 && s0.stage === "closed" && s0.offers.length === 2 && s0.bovs[0].broker === "Example Brokerage" && s0.brokerChosen === "Example Brokerage" && s0.contract.priceLog.length === 1, "saved on the asset: sale, BOV, offers, price log");
  check(dd?.realizedSalePrice === 9300000 && dd?.realizedSaleDate === "2026-11-20", "saved: the asset's realized sale");
  await p.screenshot({ path: `${S}/dispositions.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
