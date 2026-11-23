// Phase L Playwright: Asset Return additions (GP profit, GP promote, GP ROE,
// projected fee revenue). Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
data.activeDealId = "sample-deal-2";
// Route 9 with its sample units, drawings, a baseline and six months of NOI.
{
  const Rr = require("path").resolve(__dirname, "..", "..");
  const jj = require(Rr + "/node_modules/jiti")(__filename, { alias: { "@": Rr } });
  const built = jj(Rr + "/lib/samplePortfolio.js").buildSampleDeals(jj(Rr + "/lib/testScenario.js").TEST_INPUTS)[1];
  const r9 = data.deals.find((d) => d.id === "sample-deal-2");
  r9.inputs.units = built.inputs.units;
  r9.inputs.assetMedia = built.inputs.assetMedia;
  const base = structuredClone(r9.inputs);
  delete base.assetMedia;
  r9.inputs.uwBaseline = { at: "2026-03-16T15:00:00Z", by: "am@example.com", note: "", source: "closing", inputs: base };
  r9.inputs.businessPlan = { thresholdPct: 5, revisions: [], comments: {}, actuals: Object.fromEntries(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m) => [m, { noi: 52000 }])) };
}
// Fund limits from the (fictional) LPA, and a pipeline deal for the pre-acquisition check.
data.funds["Model Fund I"].limits = [
  { key: "single_asset_pct", label: "Single asset, % of commitments", limit: 15, unit: "%", clause: "6.2(a)", quote: "no more than 15% of commitments in any one asset" },
  { key: "fund_ltv_pct", label: "Fund leverage (LTV)", limit: 65, unit: "%", clause: "6.4" },
  { key: "property_type", label: "Permitted property types", limit: "Industrial and flex only", unit: "text", clause: "6.1" },
];
{
  const src = data.deals.find((d) => d.id === "sample-deal-3");
  data.deals.push({ id: "pipe-1", inputs: { ...structuredClone(src.inputs), propertyName: "Fontana Pipeline Deal", fundName: "", purchasePrice: 60000000, city: "Fontana", state: "CA" } });
}
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
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html><body>map</body></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");

  await p.getByRole("button", { name: /^Asset Return/ }).first().click();
  await p.waitForTimeout(1500);
  const labels = (await main.getByTestId("wf-row").allInnerTexts()).map((t) => t.split("\n")[0].trim());
  check(!labels.includes("GP Promote") && labels.includes("GP profit") && labels.includes("GP promote") && labels.includes("GP ROE"), `waterfall rows: ${labels.join(", ")}`);
  const row = (l) => main.getByTestId("wf-row").filter({ hasText: new RegExp(`^${l}`) }).first();
  check(/GP upside above capital returned/.test(await row("GP profit").innerText()) && /GP upside above its pro-rata share/.test(await row("GP promote").innerText()), "sub-lines explain profit vs. promote");
  check(/\d+\.\d%$/.test((await row("GP ROE").innerText()).trim()) && /not annualized/.test(await row("GP ROE").innerText()), `GP ROE: ${(await row("GP ROE").innerText()).replace(/\s+/g, " ")}`);
  const fr = main.getByTestId("fee-revenue");
  check((await fr.count()) === 1 && /Property management/i.test(await fr.innerText()) && /Construction management/i.test(await fr.innerText()) && /fund.s management fee/.test(await fr.innerText()), "fee revenue: PM and CM by year; AM fee noted as the fund's");
  const pv8 = await fr.getByTestId("fee-pv").innerText();
  await fr.getByLabel("Fee discount rate").fill("0");
  await p.waitForTimeout(400);
  check((await fr.getByTestId("fee-pv").innerText()) === (await fr.getByTestId("fee-total").innerText()) && pv8 !== (await fr.getByTestId("fee-pv").innerText()), `PV at 0% = total (${await fr.getByTestId("fee-total").innerText()}; at 8% ${pv8})`);
  const [x1] = await Promise.all([p.waitForEvent("download"), fr.getByRole("button", { name: "Excel" }).click()]);
  check(/fee-revenue\.xlsx$/.test(x1.suggestedFilename()), `Excel: ${x1.suggestedFilename()}`);
  await p.screenshot({ path: S + "/phaseL_returns.png", fullPage: true });

  // Fund Return carries the same labels
  await p.getByRole("button", { name: /^Fund Return/ }).first().click();
  await p.waitForTimeout(1500);
  const ft = await main.innerText();
  check(/GP profit/.test(ft) && /GP promote/.test(ft) && !/GP Promote/.test(ft), "Fund Return: GP profit and GP promote");

  // Asset Business Plan: drawn photos show; the full PDF
  await p.getByRole("button", { name: "Asset Business Plan", exact: true }).click();
  await p.waitForTimeout(1500);
  const ph = main.getByTestId("asset-photos");
  check((await ph.getByTestId("photo-item").count()) === 4 && /drawing/.test(await ph.innerText()), "Route 9: four drawn sample photos with captions");
  const coverSrc = await ph.getByTestId("cover-photo").locator("img").getAttribute("src");
  check(/\/sample-media\/route-9-small-bay-exterior\.svg$/.test(coverSrc ?? ""), `cover is the exterior drawing: ${coverSrc}`);
  const bpEl = main.getByTestId("business-plan");
  await bpEl.getByRole("button", { name: "Create business plan (revision 1)" }).click();
  await p.waitForTimeout(800);
  const [pdf] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), bpEl.getByRole("button", { name: "PDF", exact: true }).click()]);
  const pdfPath = S + "/l_full_plan.pdf";
  await pdf.saveAs(pdfPath);
  const { execFileSync } = require("child_process");
  const txt = execFileSync("pdftotext", ["-layout", pdfPath, "-"]).toString();
  check(/Route 9 Small Bay - the asset/.test(txt) && /Address/.test(txt) && /google\.com\/maps/.test(txt), "PDF: the asset page with the address and a Google Maps link");
  check(/Actual NOI\s+\$[\d,]+ annualized from 6 months/.test(txt), "PDF: actual NOI, annualized from 6 months");
  check(/Front elevation and signage \(drawing\)/.test(txt) && /Truck court/.test(txt), "PDF: captioned photos");
  check(/Route 9 Small Bay - floor plan/.test(txt) && /Expires within 12 months/.test(txt) && /\b018\b/.test(txt), "PDF: floor plan with the status legend and unit table");
  check(/Underwritten vs\. actual \+ projected/.test(txt) && /IRR gap by cause/.test(txt), "PDF: underwritten vs. actual");
  check(/Budget/.test(txt) && /Revision 1/.test(txt), "PDF: still has the plan and the budget");
  const imgs = execFileSync("pdfimages", ["-list", pdfPath]).toString().trim().split("\n").length - 2;
  check(imgs >= 6, `PDF: ${imgs} images (cover, 4 photos, floor plan)`);

  // Reports tab (Library): quarterly report, internal version, issue, PDF
  await p.getByRole("button", { name: /^Reports/ }).first().click();
  await p.waitForTimeout(2000);
  const rp = main.getByTestId("reports");
  check((await rp.count()) === 1 && /Model Fund I/.test(await rp.locator("h2").innerText()), "Reports tab for Model Fund I");
  check(/2026 Q3/.test(await rp.getByLabel("Quarter").locator("option:checked").innerText()), "defaults to the last completed quarter");
  check((await rp.getByTestId("report-portfolio").locator("tbody tr").count()) >= 7, "portfolio table: assets held at quarter end");
  const letterBox = rp.getByLabel("Letter");
  check(/Dear Investors/.test(await letterBox.inputValue()) && /2026 Q3/.test(await letterBox.inputValue()), "letter drafted from the figures");
  await letterBox.fill("Dear Investors,\n\nRoute 9 leased two units this quarter (test letter).");
  await p.waitForTimeout(600);
  const [sp1] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), rp.getByRole("button", { name: /PDF \(draft\)/ }).click()]);
  const shPath = S + "/l_report_shareable.pdf"; await sp1.saveAs(shPath);
  const shTxt = execFileSync("pdftotext", ["-layout", shPath, "-"]).toString();
  check(/Route 9 leased two units this quarter/.test(shTxt) && /Fund summary · 2026 Q3/.test(shTxt) && /Route 9 Small Bay/.test(shTxt) && !/INTERNAL/.test(shTxt), "shareable PDF: the letter, summary and asset pages; not marked internal");
  const shImgs = execFileSync("pdfimages", ["-list", shPath]).toString().trim().split("\n").length - 2;
  check(shImgs >= 1, `shareable PDF: ${shImgs} asset cover photo(s)`);
  // Internal version
  await rp.getByLabel("Version").selectOption("internal");
  await p.waitForTimeout(1200);
  check((await rp.getByTestId("internal-banner").count()) === 1 && /1 asset with an underwriting baseline/.test(await rp.getByTestId("internal-summary").innerText()), "internal version: banner and Route 9's baseline counted");
  await rp.getByLabel("Internal notes").fill("Watch Route 9 taxes (test note).");
  await p.waitForTimeout(600);
  await rp.getByRole("button", { name: "Issue report" }).click();
  await p.waitForTimeout(1000);
  check((await rp.getByTestId("issued-report").count()) === 1 && /v1 · internal/.test(await rp.getByTestId("issued-report").innerText()), "internal report issued as v1");
  const [ip] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), rp.getByTestId("issued-report").getByRole("button", { name: "PDF" }).click()]);
  const inPath = S + "/l_report_internal.pdf"; await ip.saveAs(inPath);
  const inTxt = execFileSync("pdftotext", ["-layout", inPath, "-"]).toString();
  check(/INTERNAL - not for distribution/.test(inTxt) && /Watch Route 9 taxes/.test(inTxt) && /underwritten vs\. actual/i.test(inTxt) && /issued \d+\/\d+\/\d{4} by t@example\.com \(v1\)/.test(inTxt), "issued internal PDF: watermark, notes, underwritten vs. actual, who and when");
  // Fund limits
  const fl = rp.getByTestId("fund-limits");
  check((await fl.getByTestId("limit-row").count()) === 3, "fund limits: the three LPA limits");
  const ltvRow = fl.getByTestId("limit-row").filter({ hasText: "Fund leverage" });
  check(/Breached/.test(await ltvRow.innerText()) && /LPA \/ PPM §6\.4/.test(await ltvRow.innerText()), `fund LTV breached, with its clause: ${(await ltvRow.innerText()).replace(/\s+/g, " ")}`);
  check(/Within/.test(await fl.getByTestId("limit-row").filter({ hasText: "Single asset" }).innerText()) && /Review/.test(await fl.getByTestId("limit-row").filter({ hasText: "Permitted property types" }).innerText()), "single asset within; property types to review");
  await fl.getByLabel("Internal limit", { exact: true }).selectOption("hold_years");
  await fl.getByLabel("Internal limit value").fill("4");
  await fl.getByRole("button", { name: "Add", exact: true }).click();
  await p.waitForTimeout(1000);
  const hold = fl.getByTestId("limit-row").filter({ hasText: "Maximum hold" });
  check((await hold.count()) === 1 && /Internal/.test(await hold.innerText()) && /Near/.test(await hold.innerText()), `internal limit added: ${(await hold.innerText()).replace(/\s+/g, " ")}`);
  await fl.getByLabel("Pipeline deal").selectOption({ label: "Fontana Pipeline Deal" });
  await p.waitForTimeout(1500);
  const saRow = fl.getByTestId("limit-row").filter({ hasText: "Single asset" });
  check(/new breach/.test(await saRow.getByTestId("pre-status").innerText()), "pre-acquisition: the $60M pipeline deal would breach the single-asset limit");
  const [xf] = await Promise.all([p.waitForEvent("download"), fl.getByRole("button", { name: "Excel" }).click()]);
  check(/fund-limits\.xlsx$/.test(xf.suggestedFilename()), `limits Excel: ${xf.suggestedFilename()}`);

  await rp.getByLabel("Version").selectOption("shareable");
  await p.waitForTimeout(800);
  check((await rp.getByTestId("issued-report").count()) === 1, "issued list shows the quarter's issued reports");
  const [xl] = await Promise.all([p.waitForEvent("download"), rp.getByRole("button", { name: "Excel" }).first().click()]);
  check(/2026-Q3-shareable-report\.xlsx$/.test(xl.suggestedFilename()), `Excel: ${xl.suggestedFilename()}`);
  await p.screenshot({ path: S + "/phaseL_reports.png", fullPage: true });

  // Risk report (internal)
  await rp.getByRole("tab", { name: "Risk report (internal)" }).click();
  await p.waitForTimeout(2000);
  const rk = rp.getByTestId("risk-report");
  check((await rk.count()) === 1 && /Internal — not for distribution/.test(await rk.innerText()), "risk report: marked internal");
  check(/Cascade Commercial Bank/.test(await rk.getByTestId("risk-lenders").innerText()) && /Cascade Commercial Bank holds/.test(await rk.getByTestId("risk-fund-flags").innerText()), "lender concentration over 35% flagged");
  check(/Atlas Derivatives Bank/.test(await rk.getByTestId("risk-caps").innerText()) && /No provider entered/.test(await rk.getByTestId("risk-caps").innerText()), "cap counterparties, and the asset with no provider");
  check((await rk.getByTestId("risk-watch").locator("tbody tr").count()) >= 3, "watch list ranks assets");
  check(/Fund leverage/.test(await rk.getByTestId("risk-fund-limits").innerText()), "fund limits in the risk report");
  check((await rk.getByTestId("risk-stress").locator("tbody tr").count()) >= 8 && /All four together/.test(await rk.getByTestId("risk-stress").innerText()), "stress tests: fund and each asset under five shocks");
  check(/No owner's insurance certificate/.test(await rk.getByTestId("risk-insurance").innerText()) && /No abstracted leases/.test(await rk.getByTestId("risk-lease-flags").innerText()), "insurance and lease flags load from the database (none on file here)");
  const tiRows = rk.getByTestId("ti-row");
  const nTi = await tiRows.count();
  check(nTi >= 7 && (await rk.getByTestId("ti-cell").count()) === nTi * 8 && /Capital call needed/.test(await rk.getByTestId("risk-ti").innerText()), `TI heat map: ${nTi} assets × 8 quarters, capital call row`);
  const r9ti = tiRows.filter({ hasText: "Route 9 Small Bay" });
  const r9cols = await r9ti.getByTestId("ti-cell").evaluateAll((els) => els.map((e) => e.dataset.color));
  check(/\$336,000 facility, 1\.25x/.test(await r9ti.innerText()) && r9cols.includes("green"), `Route 9: $336k facility at 1.25x, covered (${r9cols.join(",")})`);
  const tip = await r9ti.getByTestId("ti-cell").filter({ hasText: /\d/ }).first().getAttribute("title");
  check(/need \$[\d,]+ · facility/.test(tip ?? "") && /capital call/.test(tip ?? ""), `hover explains the sources: ${tip}`);
  const envHl = rk.getByTestId("env-row").filter({ hasText: "Harbor Light Industrial" });
  check(/RECs without a no-further-action letter/.test(await envHl.innerText()), "environmental: Harbor Light's open REC");
  await envHl.getByLabel("No-further-action letter Harbor Light Industrial").check();
  await p.waitForTimeout(1200);
  check(!/RECs without/.test(await rk.getByTestId("env-row").filter({ hasText: "Harbor Light Industrial" }).innerText()), "ticking the NFA letter closes the REC item");
  const [rpdf] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), rk.getByRole("button", { name: "PDF", exact: true }).first().click()]);
  const rPath = S + "/l_risk.pdf"; await rpdf.saveAs(rPath);
  const rTxt = execFileSync("pdftotext", ["-layout", rPath, "-"]).toString();
  check(/Risk report/.test(rTxt) && /INTERNAL - not for distribution/.test(rTxt) && /Cascade Commercial Bank/.test(rTxt) && /Environmental/.test(rTxt), "risk PDF: internal, lenders, environmental");
  await rk.getByRole("button", { name: "Issue risk report" }).click();
  await p.waitForTimeout(1000);
  check(/v1 · issued/.test(await rk.getByTestId("risk-issued").innerText()), "risk report issued as v1");
  await p.screenshot({ path: S + "/phaseL_risk.png", fullPage: true });
  await rp.getByRole("tab", { name: "Quarterly report" }).click();
  await p.waitForTimeout(800);
  await p.waitForTimeout(22000);
  const sfr = (saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"]?.reports;
  check((await (async () => { const f = (saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"]; return f?.internalLimits?.[0]?.key === "hold_years" && f.internalLimits[0].limit === 4; })()), "saved: the internal limit on the fund");
  check(sfr?.issued?.length === 1 && sfr.issued[0].kind === "internal" && sfr.issued[0].report?.portfolio?.length >= 7 && sfr.issued[0].notes.includes("Route 9 taxes"), "saved: the issued report with its frozen figures");
  check(/test letter/.test(sfr?.drafts?.["2026-Q3"]?.letter ?? ""), "saved: the edited letter draft");
  check(sfr?.riskIssued?.length === 1 && sfr.riskIssued[0].report?.lenders?.rows?.length >= 3, "saved: the issued risk report");
  const hlSaved = (saved?.new_data ?? saved?.data)?.deals?.find((d) => d.inputs.propertyName === "Harbor Light Industrial")?.inputs;
  check(hlSaved?.envRisk?.nfa === true, "saved: Harbor Light's NFA letter on the deal");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
