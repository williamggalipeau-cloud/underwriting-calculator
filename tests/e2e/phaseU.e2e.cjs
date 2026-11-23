// Phase U Playwright: Market Data tab: upload a fictional market export,
// trends, edit a quarter, tag an asset and compare with the market, Home
// lane, Excel, saved. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const R = path.resolve(__dirname, "..", "..");
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
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
  const ctx = await b.newContext({ viewport: { width: 1700, height: 1200 }, acceptDownloads: true });
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
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);

  const groups = await p.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter(Boolean));
  check(groups.indexOf("Market") === groups.indexOf("Library") - 1, "a Market group right before Library");
  await p.getByRole("group", { name: "Market" }).getByRole("button", { name: "Market Data" }).click();
  await p.waitForTimeout(600);

  // ── Upload ──
  await p.getByTestId("market-file").setInputFiles({ name: "submarket-stats-sample.csv", mimeType: "text/csv", buffer: fs.readFileSync(R + "/docs/sample-market/submarket-stats-sample.csv") });
  await p.waitForTimeout(500);
  check(/Vacancy \(%\) ← "Vacancy Rate"/.test(await p.getByTestId("market-mapping").innerText()), "columns matched and shown");
  await p.getByTestId("market-mapping").getByRole("button", { name: "Import" }).click();
  await p.waitForTimeout(500);
  check(/7 quarters added/.test(await p.getByTestId("market-msg").innerText()), "seven quarters imported");
  const subs = await p.getByTestId("submarkets").getByRole("button").allInnerTexts();
  check(subs.includes("Example Airport Industrial") && subs.includes("Example Riverside Flex"), "two submarkets created");
  await p.getByTestId("submarkets").getByRole("button", { name: "Example Airport Industrial" }).click();
  await p.waitForTimeout(300);
  check((await p.getByTestId("market-row").count()) === 5, "five quarters for the airport submarket");
  const sm = await p.getByTestId("market-summary").innerText();
  check(/5\.9%/.test(sm) && /\+1\.1 pts/.test(sm) && /\$11\.70/.test(sm) && /\+4\.5%\/yr/.test(sm) && /6\.4%|6\.3%/.test(sm), `summary with trends: ${sm.replace(/\s+/g, " ").slice(0, 120)}`);
  check((await p.getByTestId("market-summary").getByRole("img").count()) >= 4, "trend charts");

  // Edit a figure by hand: source marked edited.
  const last = p.getByTestId("market-row").nth(4);
  await last.getByLabel("Vacancy (%)").fill("6.2");
  await p.waitForTimeout(300);
  check(/sample\.csv \(edited\)/.test(await last.innerText()), "an edited figure keeps its source, marked edited");

  // ── Tag an asset ──
  const ar = p.getByTestId("market-asset-row").filter({ hasText: "Airport Flex Park" });
  await ar.getByLabel("Submarket for Airport Flex Park").selectOption({ label: "Example Airport Industrial" });
  await p.waitForTimeout(400);
  const art = await ar.innerText();
  check(/\$14\.00/.test(art) && /\/ 6\.[34]%/.test(art), `the asset's rent and exit cap next to the market's: ${art.replace(/\s+/g, " ").slice(0, 160)}`);

  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("market-data").getByRole("button", { name: "Excel" }).click()]);
  check(/market-data\.xlsx$/.test(dl.suggestedFilename()), "Excel export");

  // ── Home lane ──
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(800);
  const lane = (await p.getByTestId("lane").filter({ hasText: "Submarkets tracked" }).innerText()).replace(/\n/g, " ");
  check(/Submarkets tracked\s*2/.test(lane) && /Assets tagged to a submarket\s*1 of/.test(lane), "Home: a Market lane");

  // ── Saved ──
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.comps?.market?.stats?.length === 7 && sd.comps.market.submarkets.length === 2 && sd.comps.market.mapping?.vacancyPct === "Vacancy Rate", "saved with the firm's comps settings: statistics, submarkets, remembered columns");
  const smId = sd?.comps?.market?.submarkets?.find((s) => s.name === "Example Airport Industrial")?.id;
  check(sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs?.submarketId === smId, "saved: the asset's submarket tag");
  await p.screenshot({ path: `${S}/market.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
