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
  p.on("dialog", (d) => d.accept()); // leave prompts: save and continue
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  const areas = await FX.areas(p);
  check(areas.indexOf("Finance") === areas.indexOf("Portfolio Management") + 1, `a Finance area after Portfolio Management: ${areas.join(", ")}`);
  await FX.openArea(p, "GP Economics");
  const tabs = await p.getByRole("group", { name: "Finance" }).getByRole("button").allInnerTexts();
  check(tabs.length === 4 && /^GP Economics/.test(tabs[0]) && /^Sponsor Economics/.test(tabs[1]) && /^Firm Economics/.test(tabs[2]) && /^GP Partners/.test(tabs[3]), "Finance: GP Economics, Sponsor Economics, Firm Economics (1.1.9) and GP Partners (1.1.10)");
  await FX.openArea(p, "Portfolio Debt");
  check(!(await p.getByRole("group", { name: "Portfolio Management" }).innerText()).includes("GP Economics"), "and not under Portfolio Management");
  const money = async (id) => Number((await p.getByTestId(id).locator("p").nth(1).innerText()).replace(/[$M,]/g, ""));

  // ── GP Economics: the capital partner ──
  await FX.openTab(p, "GP Economics");
  await p.waitForTimeout(2500);
  const g = p.getByTestId("gp-economics");
  check(/Internal/.test(await g.innerText()) && /return on invested capital/.test(await g.innerText()), "GP: internal; return on invested capital and promote share");
  check(/^Consolidated/.test(await p.getByTestId("gp-totals-label").innerText()) && /this firm is a GP/.test(await p.getByTestId("gp-totals-label").innerText()), "cards labelled Consolidated, portfolios where this firm is a GP");
  const eq = await money("gp-equity"), co = await money("gp-coinvest"), pr = await money("gp-promote"), tot = await money("gp-total");
  check(eq > 0 && pr > 0 && Math.abs(co + pr - tot) < 0.03, `GP: co-invest ${co}M + promote share ${pr}M = total GP economics ${tot}M (no fees by default)`);
  check(/This firm/.test(await p.getByTestId("gp-by-party").innerText()) && /Total GP economics/.test(await p.getByTestId("gp-by-party").locator("tfoot").innerText()), "total GP economics, then split by GP party");
  check(/\d+%/.test(await p.getByTestId("gp-roic").innerText()) && /x multiple/.test(await p.getByTestId("gp-roic").innerText()) && (await g.getByTestId("gp-revenue-yield").count()) === 0, "GP: return on invested capital; no Revenue Yield here");
  check(/add up to its total/.test(await p.getByTestId("firm-both-total").innerText()), "the firm is both: the two tabs add up to its total");
  await g.getByRole("tab", { name: "By year" }).click(); await p.waitForTimeout(300);
  check(/Promote share \(on sale\)/.test(await p.getByTestId("gp-years").locator("thead").innerText()) && !/Asset management/.test(await p.getByTestId("gp-years").locator("thead").innerText()), "GP by year: capital gains on sale, no fee columns");
  await g.getByRole("tab", { name: "By portfolio" }).click(); await p.waitForTimeout(300);
  const fr = await p.getByTestId("gp-funds").locator("tbody tr").first().innerText();
  check(/Model Fund I/.test(fr) && /GP \+ sponsor/.test(fr) && /100%/.test(fr) && /x/.test(fr), `GP by portfolio: ${fr.replace(/\s+/g, " ").slice(0, 100)}`);
  await g.getByRole("tab", { name: "By asset" }).click(); await p.waitForTimeout(300);
  check((await p.getByTestId("gp-assets").locator("tbody tr").count()) >= 9 && /allocated by its share of gross profit/.test(await g.innerText()), "GP by asset, with the allocation note");
  const [dx] = await Promise.all([p.waitForEvent("download"), g.getByRole("button", { name: "Excel" }).click()]);
  check(/^gp-economics-.*\.xlsx$/.test(dx.suggestedFilename()), "GP Excel");
  const [dp] = await Promise.all([p.waitForEvent("download"), g.getByRole("button", { name: "PDF", exact: true }).click()]);
  const pdfPath = `${S}/gp-economics.pdf`; await dp.saveAs(pdfPath);
  const txt = require("child_process").execFileSync("pdftotext", ["-layout", pdfPath, "-"]).toString();
  check(/GP Economics/.test(txt) && /INTERNAL - not for distribution/.test(txt) && /Total GP economics/.test(txt) && /Split by GP party/.test(txt) && /Model Fund I/.test(txt), "GP PDF: internal, totals, portfolios");
  await p.screenshot({ path: `${S}/gp-economics.png`, fullPage: true });

  // ── Firm Economics (1.1.9): the firm is both GP and sponsor ──
  await FX.openTab(p, "Firm Economics");
  await p.waitForTimeout(2500);
  const fe = p.getByTestId("firm-economics");
  const fv = async (id) => Number((await fe.getByTestId(id).locator("p").nth(1).innerText()).replace(/[$M,]/g, ""));
  const fEq = await fv("fe-equity"), fFees = await fv("fe-fees"), fPr = await fv("fe-promote"), fCo = await fv("fe-coinvest"), fTot = await fv("fe-total");
  check(Math.abs(fEq - eq) < 0.02 && Math.abs(fPr - pr) < 0.02 && Math.abs(fCo - co) < 0.02, `Firm Economics: equity ${fEq}M, promote ${fPr}M and co-invest ${fCo}M match GP Economics (the only GP)`);
  check(fFees > 0 && Math.abs(fFees + fPr + fCo - fTot) < 0.03, `fees ${fFees}M + promote + co-invest = total to the firm ${fTot}M`);
  check(/capital only/.test(await fe.getByTestId("fe-roe").innerText()) && /with fees/.test(await fe.getByTestId("fe-roe").innerText()) && /\d/.test(await fe.getByTestId("fe-irr").innerText()) && /\/ yr/.test(await fe.getByTestId("fe-ry").innerText()), "ROE / IRR / multiple on capital only (with fees beside), Revenue Yield a year");
  check(/Model Fund I/.test(await fe.getByTestId("fe-by-portfolio").innerText()) && /None/.test(await fe.getByTestId("fe-by-portfolio").innerText()), "by portfolio: Model Fund I, no outside GP partner");
  for (const [tb, id] of [["By year", "fe-by-year"], ["Fees by type", "fe-fees-by-type"], ["Promote split", "fe-promote-split"], ["By asset", "fe-by-asset"]]) { await fe.getByRole("tab", { name: tb }).click(); await p.waitForTimeout(250); check((await fe.getByTestId(id).locator("tbody tr").count()) > 0, `Firm Economics: ${tb}`); }
  const [fx] = await Promise.all([p.waitForEvent("download"), fe.getByRole("button", { name: "Excel" }).click()]);
  check(/^firm-economics-.*\.xlsx$/.test(fx.suggestedFilename()), "Firm Economics Excel");
  const [fp] = await Promise.all([p.waitForEvent("download"), fe.getByRole("button", { name: "PDF", exact: true }).click()]);
  const fpPath = `${S}/firm-economics.pdf`; await fp.saveAs(fpPath);
  const ftxt = require("child_process").execFileSync("pdftotext", ["-layout", fpPath, "-"]).toString();
  check(/Firm Economics/.test(ftxt) && /INTERNAL - not for distribution/.test(ftxt) && /Promote split/.test(ftxt) && /capital only/i.test(ftxt), "Firm Economics PDF");
  await p.screenshot({ path: `${S}/firm-economics.png`, fullPage: true });

  // ── Sponsor Economics: the operator ──
  await FX.openTab(p, "Sponsor Economics");
  await p.waitForTimeout(2500);
  const sp = p.getByTestId("sponsor-economics");
  const fees = await money("gp-fees"), spt = await money("sp-total");
  check(fees > 0 && spt >= fees && /this firm is the sponsor/.test(await p.getByTestId("gp-totals-label").innerText()), `Sponsor: fee income ${fees}M, total ${spt}M`);
  const ryc = await p.getByTestId("gp-revenue-yield").innerText();
  check(/Revenue Yield/i.test(ryc) && /\d+\.\d\d%/.test(ryc) && /a year/.test(ryc) && /To date:/.test(ryc) && /committed/.test(ryc), `Revenue Yield card: ${ryc.replace(/\s+/g, " ")}`);
  check(/Committed capital/i.test(await p.getByTestId("gp-by-type").locator("thead").innerText()) && /never promote, co-invest profit or outsourced fees/.test(await p.getByTestId("gp-ry-note").innerText()), "Sponsor consolidated: Revenue Yield columns and the definition");
  await sp.getByRole("tab", { name: "By year" }).click(); await p.waitForTimeout(300);
  check(/Asset management/.test(await p.getByTestId("gp-years").locator("thead").innerText()) && /Life of portfolios/.test(await p.getByTestId("gp-years").locator("tfoot").innerText()), "Sponsor by year: fee columns");
  await sp.getByRole("tab", { name: "By portfolio" }).click(); await p.waitForTimeout(300);
  const sr = await p.getByTestId("gp-funds").locator("tbody tr").first().innerText();
  check(/This firm/.test(sr) && /LP \+ GP \(default\)/.test(sr) && /\d+\.\d\d%/.test(sr), `Sponsor by portfolio: ${sr.replace(/\s+/g, " ").slice(-80)}`);
  // Fund-type filter
  await sp.getByLabel("Fund type").selectOption("Joint Venture");
  await p.waitForTimeout(400);
  check((await money("sp-total")) === 0, "no joint ventures: nothing counted");
  await sp.getByLabel("Fund type").selectOption("");
  await p.waitForTimeout(300);
  const [sx] = await Promise.all([p.waitForEvent("download"), sp.getByRole("button", { name: "Excel" }).click()]);
  check(/^sponsor-economics-.*\.xlsx$/.test(sx.suggestedFilename()), "Sponsor Excel");

  // ── Parties (1.1.10): the sponsor is always this firm; the GP earns no fees ──
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(800);
  await FX.openSetup(p);
  await p.getByTestId("setup-buttons").getByLabel("Edit fund").selectOption("Model Fund I");
  await p.waitForTimeout(800);
  const parties = p.getByTestId("parties");
  if (await parties.count()) {
    check((await parties.getByLabel("Sponsor / operator: who").count()) === 0 && (await parties.getByLabel("Sponsor co-invest").count()) === 0 && /always this firm/.test(await parties.getByTestId("party-table").innerText()), "the sponsor is always this firm: no outside-operator choice, no separate sponsor co-invest");
    check(/Sponsor \(this firm\)/.test(await parties.getByLabel("Asset management: paid to").innerText()) && (await parties.getByLabel("Property management: paid to").locator("option").allInnerTexts()).join("|") === "Sponsor (this firm)|Third party (outsourced)", "fees: the sponsor (this firm) or, for PM / CM, a third party; never the GP");
    await parties.getByLabel("Property management: paid to").selectOption("third");
    // A second GP party (no partner in GP Partners yet: shares entered here)
    await parties.getByTestId("add-gp-party").click();
    check((await parties.getByLabel("GP 2: partner").locator("option").allInnerTexts()).join("|") === "Choose a GP partner…" && /added in Finance → GP Partners/.test(await parties.innerText()), "an outside GP is picked from GP Partners (none yet)");
    await parties.getByLabel("GP 1: share of GP capital").fill("70");
    await parties.getByLabel("GP 2: share of GP capital").fill("30");
    await parties.getByLabel("GP 1: share of promote").fill("30");
    await parties.getByLabel("GP 2: share of promote").fill("20");
    check((await parties.getByTestId("sponsor-promote").innerText()) === "50%" && (await parties.getByTestId("gp-capital-warning").count()) === 0, "two GP parties: capital 70 / 30, promote 30 / 20, the sponsor's 50% follows");
    await p.getByRole("button", { name: "Save terms" }).click();
    await p.waitForTimeout(1000);
    await FX.openTab(p, "Sponsor Economics");
    await p.waitForTimeout(2000);
    check(/\(1\)/.test(await p.getByTestId("gp-totals-label").innerText()) && (await money("gp-fees")) > 0 && (await money("sp-outsourced")) > 0 && (await p.getByTestId("include-external").count()) === 0, "Sponsor Economics: still the firm's; outsourced PM shown apart; no outside-sponsor toggle");
    check((await p.getByRole("group", { name: "Finance" }).innerText()).includes("Firm Economics"), "Firm Economics stays (the firm is always the sponsor)");
    await FX.openTab(p, "GP Economics");
    await p.waitForTimeout(2000);
    const bp = await p.getByTestId("gp-by-party").locator("tbody tr").allInnerTexts();
    check(bp.length === 2 && /This firm/.test(bp[0]) && /External GP/.test(bp[1]) && !/Fees paid to the GP/.test(await p.getByTestId("gp-by-party").locator("thead").innerText()), `GP Economics split by party, no GP fee column: ${bp.map((x) => x.split("\t")[0]).join(", ")}`);
  } else check(false, "the fund editor's Parties and economics section");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
