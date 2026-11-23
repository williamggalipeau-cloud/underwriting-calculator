// 11/23 layout release: Baywise header, grouped tabs, firm-wide strip, SOFR
// panel on Debt, fund NAV on Fund Return, Asset Return targets, fund type tag.
// Fictional fixture; Supabase mocked (JSON workspace path).
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
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
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
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
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");
  const tab = (name) => p.getByRole("button", { name: new RegExp(`^${name.replace("/", "\\/")}`) }).first();

  // Name and title
  check((await p.title()) === "Baywise · Industrial Real Estate Management", `browser tab title: ${await p.title()}`);
  check((await p.locator("header h1").innerText()).trim() === "Baywise", "header: Baywise");
  check((await p.locator("header").innerText()).includes("Industrial Real Estate Management"), "header: tagline");

  // Tab groups, in order, with the renamed tabs
  const groups = await p.getByTestId("tab-group").allInnerTexts();
  check(groups.map((g) => g.trim().split("\n")[0].trim()).join(" | ").toUpperCase() === "ACQUISITIONS | DISPOSITIONS | ASSET MANAGEMENT | PORTFOLIO MANAGEMENT | LIBRARY", `tab groups: ${groups.map((g) => g.trim().split("\n")[0]).join(" | ")}`);
  const nav = await p.locator("nav").first().innerText();
  const order = ["Pipeline", "Deal Screener", "Fund Impact", "Assets for Sale", "Offers", "Track Record", "Sale Documents", "Asset Business Plan", "Asset Summary", "Unit Roll", "Leases", "Leasing", "Valuation", "Sales Comps", "Debt", "Cash Flow", "Asset Return", "Return Sensitivity", "Sell/Hold Analysis", "Fund Summary", "Fund Plan", "Fund Return", "Distribution Analysis", "Stress Testing", "Documents", "Reports"];
  // Each tab found after the previous one (names can contain earlier ones, e.g. "Sale Documents").
  const pos = [];
  for (const t of order) pos.push(nav.indexOf(t, pos.length ? pos[pos.length - 1] + 1 : 0));
  check(pos.every((x) => x >= 0) && pos.every((x, i) => i === 0 || x > pos[i - 1]), "tabs in the agreed order with the new names");
  check(!/Portfolio Return|Valuations|Sell \/ Hold|Return Stress Testing|Quick Underwrite/.test(nav), "no old tab names");

  // Backup buttons (11/23): no Reset; Download backup; owner-only Restore
  check((await p.getByRole("button", { name: /Reset workspace|Export workspace|Import workspace/ }).count()) === 0, "workspace buttons removed");
  check((await p.getByRole("button", { name: "Download backup" }).count()) === 1 && (await p.getByRole("button", { name: "Restore from backup" }).count()) === 1, "Download backup, and Restore from backup for an owner");

  // Sample data menu (11/23): one owner-only menu with a warning, not three loose buttons
  check((await p.getByRole("button", { name: /^(Load test scenario|Load Model Fund I|Clear test data)$/ }).count()) === 0, "sample-data buttons not loose in the header");
  const sm = p.getByTestId("sample-data-menu");
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(300);
  const items = await sm.getByRole("menuitem").allInnerTexts();
  check(items.length === 5 && /Load Model Fund I/.test(items[0]) && /Add drawn photos/.test(items[1]) && /Add risk test data/.test(items[2]) && /Load test scenario/.test(items[3]) && /Clear test data/.test(items[4]), `sample menu items: ${items.map((t) => t.split("\n")[0]).join(", ")}`);
  check(/for everyone/.test(await sm.innerText()) && /fictional/.test(await sm.innerText()), "sample menu warns it changes everyone's data");
  await sm.getByRole("button", { name: /Sample data/ }).click();

  // Firm-wide strip
  const figs = p.getByTestId("firm-figure");
  check((await figs.count()) === 5, `firm strip: ${await figs.count()} figures`);
  const strip = (await figs.allInnerTexts()).join(" | ");
  check(/AUM/.test(strip) && /Square feet/.test(strip) && /Assets/.test(strip) && /across \d+ funds?/.test(strip) && /Tenants/.test(strip) && /Occupancy/.test(strip), `firm strip figures: ${strip.replace(/\s+/g, " ")}`);
  const titles = await figs.evaluateAll((els) => els.map((e) => e.getAttribute("title") || ""));
  check(titles.every((t) => t.length > 10), "each figure has a hover definition");
  check(!/Committed|IRR|DSCR/.test(strip), "no committed capital or per-asset metrics in the strip");

  // SOFR panel only on Debt
  check((await p.getByTestId("sofr-panel").count()) === 0, "SOFR panel not on other tabs");
  await tab("Debt").click();
  await p.waitForTimeout(800);
  const sofr = p.getByTestId("sofr-panel");
  check((await sofr.count()) === 1 && (await sofr.innerText()).includes("NY Fed live"), "SOFR panel at the top of Debt");
  const sofrY = (await sofr.boundingBox())?.y ?? 0;
  const firstHeading = await main.locator("h2, h3").first().boundingBox();
  check(firstHeading && sofrY <= firstHeading.y, "SOFR panel is above the Debt content");

  // Asset Return: DSCR and the below-target warnings
  await tab("Asset Return").click();
  await p.waitForTimeout(800);
  check((await main.getByText("DSCR (year 1)").count()) === 1, "Asset Return shows DSCR");
  const warn = main.getByTestId("kpi-below-target");
  const wt = await warn.evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  check(wt.every((t) => /^Below target: .* under \d/.test(t)), `below-target warnings carry their threshold: ${JSON.stringify(wt)}`);
  await p.screenshot({ path: S + "/layout_returns.png" });

  // Fund NAV moved to Fund Return; link both ways
  await tab("Valuation").click();
  await p.waitForTimeout(1200);
  check((await main.getByText("Fund NAV ·").count()) === 0 && (await main.getByTestId("fund-nav-moved").count()) === 1, "Valuation: no fund NAV, a pointer to Fund Return");
  check((await main.getByRole("button", { name: "Export PDF" }).count()) === 1, "Valuation keeps the valuation PDF");
  await main.getByTestId("fund-nav-moved").getByRole("button", { name: /Fund Return/ }).click();
  await p.waitForTimeout(1500);
  const fn = main.getByTestId("fund-nav");
  check((await fn.count()) === 1 && /Fund NAV ·/.test(await fn.innerText()) && /Net LP/.test(await fn.innerText()) && /Net LP TVPI/.test(await fn.innerText()), "Fund Return: fund NAV, net LP interim returns and the quarter-by-quarter table");
  await fn.getByRole("button", { name: /Valuation PDF and marks/ }).click();
  await p.waitForTimeout(800);
  check((await main.getByTestId("fund-nav-moved").count()) === 1, "Fund Return links back to Valuation");

  // Fund type tag
  await tab("Fund Return").click();
  await p.waitForTimeout(1200);
  check((await main.getByTestId("fund-type-badge").first().innerText()) === "Fund", "existing fund reads as type Fund");
  await main.getByRole("button", { name: "New fund", exact: true }).click();
  await p.waitForTimeout(500);
  const dlg = p.getByRole("dialog", { name: "New fund" });
  await dlg.getByPlaceholder("e.g. Light Industrial Fund II").fill("Harbor SMA");
  await dlg.getByLabel("Fund type").selectOption("Separate Account");
  const addCur = dlg.getByRole("checkbox", { name: /Add the current deal/ });
  if (await addCur.count()) await addCur.uncheck();
  await dlg.getByRole("button", { name: "Create fund", exact: true }).click();
  await p.waitForTimeout(1200);
  const badges = await main.getByTestId("fund-type-badge").allInnerTexts();
  check(badges.includes("Separate Account"), `new fund tagged Separate Account: ${badges.join(", ")}`);
  await main.getByLabel("Filter funds by type").selectOption("Separate Account");
  await p.waitForTimeout(500);
  const h3 = (await main.locator("h3").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  check(h3.some((t) => t.startsWith("Harbor SMA")) && !h3.some((t) => /^Model Fund I( Fund)?$/.test(t)), `type filter shows only Separate Accounts: ${h3.filter((t) => /Fund I|Harbor/.test(t)).join(" / ")}`);
  await main.getByLabel("Filter funds by type").selectOption("All");
  await p.screenshot({ path: S + "/layout_fund.png" });
  await p.waitForTimeout(22000);
  const sf = saved?.new_data?.funds?.["Harbor SMA"] ?? saved?.data?.funds?.["Harbor SMA"];
  check(sf?.type === "Separate Account", `saved: funds["Harbor SMA"].type = ${sf?.type}`);

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
