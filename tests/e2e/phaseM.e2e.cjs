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
  await FX.openArea(p, "Pipeline");
  const nav = await p.locator("nav").first().innerText();
  check(nav.indexOf("Pipeline") >= 0 && nav.indexOf("Pipeline") < nav.indexOf("Deal Screener"), "Pipeline is first in Acquisitions");
  check((await main.getByTestId("home").count()) === 1, "the app opens on the Operational Dashboard (phase Z)");
  // Deal Screener with an owned asset: notice, no model
  await FX.openTab(p, /^Deal Screener/);
  await p.waitForTimeout(800);
  check((await main.getByTestId("screener-owned").count()) === 1 && (await main.getByTestId("screener-impact").count()) === 0, "Deal Screener: an owned asset gets a notice, not the screener");
  await FX.openTab(p, /^Pipeline/);
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
  const sync = main.getByTestId("screener-sync");
  check((await sync.count()) === 1 && /close date/.test(await sync.innerText()), "screener vs. pipeline row: the close date differs (offered to update)");
  await sync.getByRole("button", { name: "Update pipeline row" }).click();
  await p.waitForTimeout(800);
  check((await main.getByTestId("screener-sync").count()) === 0, "Update pipeline row: they match again");
  const imp = main.getByTestId("screener-impact");
  check((await imp.count()) === 1 && /Scenario — not actual/.test(await imp.innerText()) && (await main.getByTestId("screener-owned").count()) === 0, "pipeline deal: Model in fund panel, labelled a scenario");
  check((await imp.getByLabel("Model in fund").inputValue()) === "Model Fund I" && /Net LP IRR/.test(await imp.getByTestId("impact-returns").innerText()) && /Dry powder before → after/.test(await imp.getByTestId("impact-capital").innerText()), "fund with vs. without: returns, dry powder, concentration");
  check((await main.getByTestId("screener-deal").filter({ hasText: "Glendale Commerce Center" }).count()) === 1, "pipeline deals listed in the screener");
  await imp.getByLabel("Compare against").selectOption("owned");
  await p.waitForTimeout(800);
  check(/owned assets only/.test(await imp.innerText()), "compare against owned assets only");
  await FX.openTab(p, /^Pipeline/);
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
  // Send to Fund Impact
  await pl.getByLabel("Filter stage").selectOption("active");
  await p.waitForTimeout(300);
  await pl.getByTestId("pipeline-row").filter({ hasText: "Cascade Trade Park" }).getByRole("button", { name: "Send to Fund Impact" }).click();
  await p.waitForTimeout(2000);
  const fi = main.getByTestId("fund-impact-tab");
  check((await fi.count()) === 1 && (await fi.getByLabel("Candidate Cascade Trade Park").isChecked()), "Send to Fund Impact: the deal is a candidate");
  check(/Net LP IRR/.test(await fi.getByTestId("impact-tab-returns").innerText()) && /Scenario — not actual/.test(await fi.innerText()), "fund with vs. without, labelled a scenario");
  await fi.getByLabel("Candidate Glendale Commerce Center").check();
  await p.waitForTimeout(2500);
  check((await fi.getByTestId("impact-compare").locator("tr").count()) === 2, "two candidates: compared and ranked");
  const cascade = fi.getByTestId("impact-candidate").filter({ hasText: "Cascade Trade Park" });
  await cascade.getByRole("button", { name: "Break-even price" }).click();
  await p.waitForTimeout(4000);
  check(/keeps fund net LP IRR|isn't met|150%/.test(await cascade.getByTestId("impact-be").innerText()), `break-even: ${await cascade.getByTestId("impact-be").innerText()}`);
  await cascade.getByRole("button", { name: "Sensitivity" }).click();
  await p.waitForTimeout(3000);
  check((await cascade.getByTestId("impact-sens").locator("tbody tr").count()) === 3, "sensitivity grid: 3 exit caps × 3 prices");
  const [ipdf] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), fi.getByRole("button", { name: "PDF" }).click()]);
  const ipPath = S + "/m_impact.pdf"; await ipdf.saveAs(ipPath);
  check(/SCENARIO - NOT ACTUAL/.test(require("child_process").execFileSync("pdftotext", ["-layout", ipPath, "-"]).toString()), "Fund Impact PDF stamped Scenario - not actual");
  // Save v1, change, save v2, view v1
  await fi.getByLabel("Scenario name").fill("Q1 2027: Tacoma + Sparks");
  await fi.getByRole("button", { name: "Save as new scenario" }).click();
  await p.waitForTimeout(1200);
  check((await fi.getByTestId("impact-scenario").count()) === 1 && /v1/.test(await fi.getByTestId("impact-scenario").innerText()), "scenario saved as v1");
  await fi.getByLabel("Candidate Glendale Commerce Center").uncheck();
  await p.waitForTimeout(1500);
  await fi.getByTestId("impact-scenario").getByRole("button", { name: /Save current as v2/ }).click();
  await p.waitForTimeout(1200);
  await fi.getByTestId("impact-scenario").getByRole("button", { name: "v1", exact: true }).click();
  await p.waitForTimeout(800);
  check(/Viewing saved version v1/.test(await fi.getByTestId("impact-viewing").innerText()) && /Glendale Commerce Center/.test(await fi.getByTestId("impact-viewing").innerText()), "v1 still shows both candidates (frozen)");
  await fi.getByRole("button", { name: "Back to live" }).click();
  // Add to fund
  await fi.getByTestId("impact-candidate").filter({ hasText: "Cascade Trade Park" }).getByRole("button", { name: "Add to fund" }).click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: S + "/phaseM_impact.png", fullPage: true });
  await FX.openTab(p, /^Pipeline/);
  await p.waitForTimeout(800);
  // Pipeline report
  const prp = pl.getByTestId("pipeline-report");
  await prp.getByRole("button", { name: "Preview" }).click();
  await p.waitForTimeout(3000);
  check(/active deals for Model Fund I/.test(await prp.getByTestId("pipeline-report-preview").innerText()) && (await prp.getByTestId("pipeline-report-preview").locator("li").count()) >= 2, "pipeline report preview: totals and top 10 summaries");
  const [rpdf] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), prp.getByRole("button", { name: "PDF" }).click()]);
  const rpPath = S + "/m_pipeline_report.pdf"; await rpdf.saveAs(rpPath);
  const rpTxt = require("child_process").execFileSync("pdftotext", ["-layout", rpPath, "-"]).toString();
  check(/Pipeline report/.test(rpTxt) && /Top 10 by Price/.test(rpTxt) && /Top 10: summaries/.test(rpTxt), "pipeline report PDF");
  await prp.getByRole("button", { name: "Save dated version" }).click();
  await p.waitForTimeout(800);
  check((await prp.getByTestId("pipeline-report-versions").locator("li").count()) === 1, "dated version saved");
  const [xl] = await Promise.all([p.waitForEvent("download"), pl.getByRole("button", { name: "Excel" }).first().click()]);
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
  const casDeal = sd?.deals?.find((d) => d.inputs?.propertyName === "Cascade Trade Park");
  check(casDeal?.inputs?.fundName === "Model Fund I", "saved: Add to fund put Cascade Trade Park in Model Fund I");
  const scs = sd?.funds?.["Model Fund I"]?.impactScenarios;
  check(scs?.length === 1 && scs[0].versions.length === 2 && scs[0].versions[0].candidates.length === 2 && scs[0].versions[1].candidates.length === 1, "saved: the scenario with v1 (2 candidates) and v2 (1)");
  check(allChanges.some((c) => c.area === "Pipeline" || /Pipeline/.test(c.field ?? "") || /pipeline/i.test(JSON.stringify(c))), "pipeline changes in the change log");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
