// Phase W Playwright: GP Economics tab, in the Finance area (11/24): fee revenue,
// promote and co-invest with shares, by year / fund / asset, the discount
// rate, the fund-type filter, Excel and an internal PDF. Fictional fixture
// (with the sample 1.5% fund fee); Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
data.funds["Model Fund I"] = { ...data.funds["Model Fund I"], mgmtFeePct: 1.5, mgmtFeeBasis: "commitments-then-invested", cashReserveQuarters: 2, feeModel: "fund-v1" };
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  const areas = await FX.areas(p);
  check(areas.indexOf("Finance") === areas.indexOf("Portfolio Management") + 1, `a Finance area after Portfolio Management: ${areas.join(", ")}`);
  await FX.openArea(p, "GP Economics");
  const tabs = await p.getByRole("group", { name: "Finance" }).getByRole("button").allInnerTexts();
  check(tabs.length === 1 && /^GP Economics/.test(tabs[0]), "GP Economics is under Finance (user, 11/24)");
  await FX.openArea(p, "Portfolio Debt");
  check(!(await p.getByRole("group", { name: "Portfolio Management" }).innerText()).includes("GP Economics"), "and no longer under Portfolio Management");
  await FX.openTab(p, "GP Economics");
  await p.waitForTimeout(2500);
  const g = p.getByTestId("gp-economics");
  check(/Internal/.test(await g.innerText()) && /Promote is kept apart from fee revenue/.test(await g.innerText()), "marked internal; promote apart from fees");
  const money = async (id) => Number((await p.getByTestId(id).locator("p").nth(1).innerText()).replace(/[$M,]/g, ""));
  const fees = await money("gp-fees"), promote = await money("gp-promote"), co = await money("gp-coinvest"), total = await money("gp-total");
  check(fees > 0 && promote > 0 && Math.abs(fees + promote + co - total) < 0.03, `fees ${fees}M + promote ${promote}M + co-invest ${co}M = total ${total}M`);
  check(/% of GP income/.test(await p.getByTestId("gp-fees").innerText()) && !/PV/.test(await p.getByTestId("gp-fees").innerText()) && (await g.getByLabel("Discount rate").count()) === 0, "shares; no discount rate or present value (user, 11/24)");
  check((await p.getByTestId("gp-share-bar").locator("div").count()) === 3, "share bar: fees, promote, co-invest");
  // Consolidated by portfolio type (11/24): the default view
  const con = p.getByTestId("gp-by-type");
  check((await con.count()) === 1 && /Fund/.test(await con.innerText()) && /All portfolios/.test(await con.locator("tfoot").innerText()) && (await p.getByTestId("gp-type-years").count()) === 1, "Consolidated: subtotals by portfolio type, all portfolios, income by year and type");
  // By year
  await p.getByRole("tab", { name: "By year" }).click();
  await p.waitForTimeout(300);
  const yrs = p.getByTestId("gp-years");
  check((await yrs.locator("tbody tr").count()) >= 5 && /Life of portfolios/.test(await yrs.locator("tfoot").innerText()), "by year, with life-of-portfolio totals");
  // By fund, by asset
  await g.getByRole("tab", { name: "By portfolio" }).click();
  await p.waitForTimeout(300);
  const fr = await p.getByTestId("gp-funds").locator("tbody tr").first().innerText();
  check(/Model Fund I/.test(fr) && /x/.test(fr), `by fund: ${fr.replace(/\s+/g, " ").slice(0, 90)}`);
  await g.getByRole("tab", { name: "By asset" }).click();
  await p.waitForTimeout(300);
  check((await p.getByTestId("gp-assets").locator("tbody tr").count()) >= 9 && /allocated by its share of gross profit/.test(await g.innerText()), "by asset, with the allocation note");
  // Fund-type filter
  await g.getByLabel("Fund type").selectOption("Joint Venture");
  await p.waitForTimeout(400);
  check((await money("gp-total")) === 0 || /0 funds/.test(await p.getByTestId("gp-total").innerText()), "no joint ventures: nothing shown");
  await g.getByLabel("Fund type").selectOption("");
  await p.waitForTimeout(400);
  // Exports
  const [dx] = await Promise.all([p.waitForEvent("download"), g.getByRole("button", { name: "Excel" }).click()]);
  check(/^gp-economics-.*\.xlsx$/.test(dx.suggestedFilename()), "Excel");
  const [dp] = await Promise.all([p.waitForEvent("download"), g.getByRole("button", { name: "PDF", exact: true }).click()]);
  const pdfPath = `${S}/gp-economics.pdf`; await dp.saveAs(pdfPath);
  const txt = require("child_process").execFileSync("pdftotext", ["-layout", pdfPath, "-"]).toString();
  check(/GP economics/.test(txt) && /INTERNAL - not for distribution/.test(txt) && /Total GP income/.test(txt) && /Model Fund I/.test(txt), "PDF: internal, totals, funds and assets");
  await p.screenshot({ path: `${S}/gp-economics.png`, fullPage: true });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
