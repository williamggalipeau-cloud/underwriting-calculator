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

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
