// Phase K Playwright: Fund Plan tab (freeze, re-forecast, plan vs. actual,
// exports) and the Sell/Hold fund impact (all-asset hold change, past-term
// flags, TVPI / DPI / GP promote). Fictional fixture; Supabase mocked.
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

  // Tab placement: Portfolio Management, before Fund Return
  const nav = await p.locator("nav").first().innerText();
  check(nav.indexOf("Fund Plan") > 0 && nav.indexOf("Fund Plan") < nav.indexOf("Fund Return"), "Fund Plan tab sits before Fund Return");
  await p.getByRole("button", { name: /^Fund Plan/ }).first().click();
  await p.waitForTimeout(1500);
  const fp = main.getByTestId("fund-plan");
  check((await fp.count()) === 1 && (await fp.locator("h2").innerText()).includes("Model Fund I"), "Fund Plan for Model Fund I");
  check((await fp.getByTestId("no-plan").count()) === 1 && /Today.s forecast: net LP IRR \d/.test(await fp.getByTestId("no-plan").innerText()), "no plan yet: shows today's forecast");

  // Freeze the original plan
  await fp.getByPlaceholder(/Note \(optional\)/).fill("Final close model");
  await fp.getByRole("button", { name: "Freeze the original plan" }).click();
  await p.waitForTimeout(1200);
  check((await fp.getByTestId("no-plan").count()) === 0 && /v1 · Original plan/.test(await fp.getByTestId("plan-meta").innerText()) && /t@example\.com/.test(await fp.getByTestId("plan-meta").innerText()) && /Final close model/.test(await fp.getByTestId("plan-meta").innerText()), "original plan frozen: v1, by whom, with the note");
  const td = await fp.getByTestId("plan-to-date").innerText();
  check(/LP capital called/.test(td) && /Equity deployed/.test(td) && /Assets acquired/.test(td) && /DPI/.test(td) && /LP NAV/.test(td), "since inception: called, deployed, assets, DPI, NAV");
  const pr = await fp.getByTestId("plan-returns").innerText();
  check(/Net LP IRR/.test(pr) && /GP promote/.test(pr) && /Gross IRR/.test(pr), "projected: net LP IRR, gross IRR, GP promote");
  const firstRow = (await fp.getByTestId("plan-returns").locator("tbody tr").first().locator("td").allInnerTexts()).map((s) => s.trim());
  check(firstRow[1] === firstRow[2] && /0\.0 pts/.test(firstRow[3]), `unchanged model: plan = forecast (${firstRow.slice(1, 4).join(" | ")})`);
  check((await fp.getByTestId("plan-chart").locator("polyline").count()) === 6, "chart: plan, actual and forecast lines for called and distributed");
  check((await fp.getByTestId("plan-assets").locator("tbody tr").count()) >= 5 && (await fp.getByTestId("plan-causes").innerText()).includes("Total (forecast − plan)"), "attribution by asset and by cause");
  await fp.getByRole("button", { name: /By quarter/ }).click();
  await p.waitForTimeout(300);
  check((await fp.getByTestId("plan-quarters").locator("tbody tr").count()) >= 4, "by-quarter table opens");

  // Target below the forecast is flagged
  await fp.getByLabel("Net LP IRR %").fill("99");
  await p.waitForTimeout(800);
  const irrCell = fp.getByTestId("plan-returns").locator("tbody tr").first().locator("td").nth(2);
  check(/Below the target of 99\.0%/.test((await irrCell.getAttribute("title")) ?? ""), "forecast below the target is flagged");

  // Exports
  const [x1] = await Promise.all([p.waitForEvent("download"), fp.getByRole("button", { name: "Excel" }).click()]);
  check(/fund-plan\.xlsx$/.test(x1.suggestedFilename()), `Excel: ${x1.suggestedFilename()}`);
  const [x2] = await Promise.all([p.waitForEvent("download"), fp.getByRole("button", { name: "PDF report" }).click()]);
  check(/fund-plan-report\.pdf$/.test(x2.suggestedFilename()), `PDF: ${x2.suggestedFilename()}`);
  await x2.saveAs(S + "/fund-plan-report.pdf");

  // Re-forecast keeps the original
  await fp.getByPlaceholder(/Why re-forecast/).fill("Q4 update");
  await fp.getByRole("button", { name: "Save a re-forecast" }).click();
  await p.waitForTimeout(1200);
  const opts = await fp.getByLabel("Plan version").locator("option").allInnerTexts();
  check(opts.length === 2 && /v1 · Original plan/.test(opts[0]) && /v2 · Re-forecast 1/.test(opts[1]), `versions: ${opts.join(" / ")}`);
  await fp.getByLabel("Plan version").selectOption({ index: 0 });
  await p.waitForTimeout(500);
  check(/v1 · Original plan/.test(await fp.getByTestId("plan-meta").innerText()), "can switch back to the original plan");
  await p.screenshot({ path: S + "/phaseK_fundplan.png", fullPage: true });

  // Sell/Hold: change every hold, flags, new fund rows
  await p.getByRole("button", { name: /^Sell\/Hold Analysis/ }).first().click();
  await p.waitForTimeout(1500);
  await main.getByRole("button", { name: /^Whole fund/ }).click();
  await p.waitForTimeout(1500);
  const fi = main.getByTestId("fund-impact");
  const fiTxt = await fi.innerText();
  check(/Net LP multiple \(TVPI\)/.test(fiTxt) && /LP DPI by the end of the term/.test(fiTxt) && /GP promote \(above its pro-rata share\)/.test(fiTxt), "fund table: TVPI, DPI by term end, GP promote");
  const ah = main.getByTestId("all-hold");
  await ah.getByLabel("Change every hold").selectOption("set");
  await ah.getByLabel("Years").fill("99");
  await ah.getByRole("button", { name: "Apply to all" }).click();
  await p.waitForTimeout(2000);
  check((await main.getByTestId("hold-capped").count()) === 1 && /past the final extended term/.test(await main.getByTestId("hold-capped").innerText()), "holds past the extended term are capped, with a note");
  const tf = main.getByTestId("term-flags");
  check((await tf.count()) === 1 && /Past the fund.s term/.test(await tf.innerText()) && /extension/.test(await tf.innerText()), "past-term flag shown");
  const irrRow = (await fi.locator("tbody tr").filter({ hasText: "Net LP IRR" }).first().locator("td").allInnerTexts()).map((s) => s.trim());
  check(irrRow[1] !== irrRow[2] && /pts/.test(irrRow[3]), `before / after net LP IRR: ${irrRow.slice(1).join(" | ")}`);
  await ah.getByLabel("Change every hold").selectOption("shift");
  await ah.getByLabel("Years").fill("0");
  await ah.getByRole("button", { name: "Apply to all" }).click();
  await p.waitForTimeout(1500);
  const irrRow0 = (await fi.locator("tbody tr").filter({ hasText: "Net LP IRR" }).first().locator("td").allInnerTexts()).map((s) => s.trim());
  check(irrRow0[1] === irrRow0[2], "+0 years puts every asset back on the base plan");
  await p.screenshot({ path: S + "/phaseK_sellhold.png", fullPage: true });

  // Saved to the fund's record
  await p.waitForTimeout(22000);
  const sf = (saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"];
  check(sf?.fundPlan?.versions?.length === 2 && sf.fundPlan.versions[0].label === "Original plan" && sf.fundPlan.versions[0].quarters?.length > 0, "saved: two plan versions on the fund");
  check(sf?.fundPlanTargets?.netIrrPct === 99, "saved: targets on the fund");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
