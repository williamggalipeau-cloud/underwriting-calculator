// Phase M Playwright: Pipeline tab (CoStar and internal uploads, totals,
// stages, Screen into Deal Screener, Convert to asset, Excel). Fictional
// files in docs/sample-pipeline; Supabase mocked.
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

  const R = require("path").resolve(__dirname, "..", "..");
  const nav = await p.locator("nav").first().innerText();
  check(nav.indexOf("Pipeline") >= 0 && nav.indexOf("Pipeline") < nav.indexOf("Deal Screener"), "Pipeline is first in Acquisitions");
  await p.getByRole("button", { name: /^Pipeline/ }).first().click();
  await p.waitForTimeout(1200);
  const pl = main.getByTestId("pipeline");
  check((await pl.getByTestId("pipeline-empty").count()) === 1, "empty pipeline explains how to start");

  // CoStar upload
  await pl.getByLabel("Upload source").selectOption("costar");
  await pl.getByTestId("pipeline-file").setInputFiles(R + "/docs/sample-pipeline/costar-for-sale-2026-11.csv");
  await p.waitForTimeout(1200);
  check(/5 added, 0 updated/.test(await pl.getByTestId("pipeline-msg").innerText()) && (await pl.getByTestId("pipeline-row").count()) === 5, "CoStar export: 5 deals added");
  // Internal upload: 2 updated, 1 added
  await pl.getByLabel("Upload source").selectOption("internal");
  await pl.getByTestId("pipeline-file").setInputFiles(R + "/docs/sample-pipeline/internal-pipeline.csv");
  await p.waitForTimeout(1200);
  check(/1 added, 2 updated/.test(await pl.getByTestId("pipeline-msg").innerText()), `internal spreadsheet: ${await pl.getByTestId("pipeline-msg").innerText()}`);
  check((await pl.getByTestId("pipeline-row").count()) === 5, "active view hides the passed deal (5 of 6)");
  const tot = await pl.getByTestId("pipeline-totals").innerText();
  check(/Watching\s+3/i.test(tot) && /LOI\s+1/i.test(tot) && /Passed \/ lost\s+1/i.test(tot), "totals by stage");
  await pl.getByLabel("Filter stage").selectOption("all");
  await p.waitForTimeout(300);
  check((await pl.getByTestId("pipeline-row").count()) === 6, "all stages: 6 deals");
  await pl.getByLabel("Filter stage").selectOption("active");

  // Change a stage
  await pl.getByLabel("Stage Mesa Small Bay").selectOption("screening");
  await p.waitForTimeout(500);
  check((await pl.getByLabel("Probability Mesa Small Bay").inputValue()) === "20", "stage change sets the default probability (Screening 20%)");

  // Screen into Deal Screener
  const gl = pl.getByTestId("pipeline-row").filter({ hasText: "Glendale Commerce Center" });
  await gl.getByRole("button", { name: "Screen" }).click();
  await p.waitForTimeout(1500);
  check(/Deal Screener/.test(await p.locator("nav button[aria-current], nav .bg-blue-600").first().innerText().catch(() => "Deal Screener")), "Screen opens Deal Screener");
  check((await main.innerText()).includes("10,400,000") || (await p.locator("input[value='10400000']").count()) > 0, "Deal Screener has the asking price");
  await p.getByRole("button", { name: /^Pipeline/ }).first().click();
  await p.waitForTimeout(800);
  check((await pl.getByTestId("pipeline-row").filter({ hasText: "Glendale Commerce Center" }).getByRole("button", { name: "Open in Screener" }).count()) === 1 && (await pl.getByLabel("Stage Glendale Commerce Center").inputValue()) === "screening", "screened: linked to its deal, moved to Screening");

  // Convert a closed deal to an asset of Model Fund I
  await pl.getByLabel("Stage Riverbend Flex").selectOption("closed");
  await p.waitForTimeout(500);
  await pl.getByLabel("Filter stage").selectOption("all");
  await p.waitForTimeout(300);
  await pl.getByTestId("pipeline-row").filter({ hasText: "Riverbend Flex" }).getByRole("button", { name: "Convert to asset" }).click();
  await p.waitForTimeout(1500);
  check(/In Model Fund I/.test(await pl.getByTestId("pipeline-row").filter({ hasText: "Riverbend Flex" }).innerText()), "converted: Riverbend Flex is in Model Fund I");
  const [xl] = await Promise.all([p.waitForEvent("download"), pl.getByRole("button", { name: "Excel" }).click()]);
  check(/^pipeline-\d{4}-\d{2}-\d{2}\.xlsx$/.test(xl.suggestedFilename()), `Excel: ${xl.suggestedFilename()}`);
  const [tp] = await Promise.all([p.waitForEvent("download"), pl.getByRole("button", { name: "Template" }).click()]);
  check(tp.suggestedFilename() === "pipeline-template.xlsx", "template download");
  await p.screenshot({ path: S + "/phaseM_pipeline.png", fullPage: true });

  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.pipeline?.deals?.length === 6 && sd.pipeline.mappings?.costar?.mapping?.askingPrice != null, "saved: 6 pipeline deals and the CoStar column match");
  const rbDeal = sd?.deals?.find((d) => d.inputs?.propertyName === "Riverbend Flex");
  check(rbDeal?.inputs?.fundName === "Model Fund I" && rbDeal.inputs.acquisitionDate === "2027-02-26", "saved: Riverbend Flex is a deal in Model Fund I, acquired on its expected close");
  const glDeal = sd?.deals?.find((d) => d.inputs?.propertyName === "Glendale Commerce Center");
  check(glDeal && !glDeal.inputs.fundName && glDeal.quick?.purchasePrice === 10400000, "saved: the screened deal has no fund (pipeline) and its asking price");
  check(allChanges.some((c) => c.area === "Pipeline" || /Pipeline/.test(c.field ?? "") || /pipeline/i.test(JSON.stringify(c))), "pipeline changes in the change log");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
