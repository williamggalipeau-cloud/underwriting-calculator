// Phase J Playwright: underwritten vs. actual + projected (Asset Summary
// Details and Portfolio Return). Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const fs = require("fs");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
// Route 9 Small Bay: a baseline underwritten at a lower exit cap than today,
// and six months of actual NOI below the model.
const r9 = data.deals.find((d) => d.id === "sample-deal-2");
const base = structuredClone(r9.inputs);
base.exitCapRatePct = r9.inputs.exitCapRatePct - 0.5;
delete base.businessPlan;
r9.inputs.uwBaseline = { at: "2026-03-16T15:00:00Z", by: "am@example.com", note: "", source: "closing", inputs: base };
r9.inputs.businessPlan = { thresholdPct: 5, revisions: [], comments: {}, actuals: Object.fromEntries(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"].map((m) => [m, { noi: 30000 }])) };

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

  // Portfolio Return: assets ranked by gap
  await FX.openTab(p, /^Portfolio Return/);
  await p.waitForTimeout(1500);
  const fu = main.getByTestId("fund-uw");
  const rows = fu.getByTestId("fund-uw-row");
  check((await rows.count()) === 1 && (await rows.first().innerText()).includes("Route 9 Small Bay"), "Portfolio Return: Route 9 has a baseline, listed");
  const gapTxt = await rows.first().locator("td").nth(3).innerText();
  check(/^[−+]\d+\.\d\d pts$/.test(gapTxt.trim()), `Route 9 IRR gap shown: ${gapTxt}`);
  check((await fu.innerText()).includes("without a baseline"), "assets without a baseline counted");
  const [dl] = await Promise.all([p.waitForEvent("download"), fu.getByRole("button", { name: "Excel" }).click()]);
  check(/underwritten-vs-actual\.xlsx$/.test(dl.suggestedFilename()), `fund Excel: ${dl.suggestedFilename()}`);

  // Asset Summary → Details for Route 9
  await FX.openTab(p, "Asset Summary");
  await p.waitForTimeout(1500);
  await main.locator("tbody tr", { hasText: "Route 9 Small Bay" }).first().getByRole("button", { name: "Details" }).click();
  await p.waitForTimeout(800);
  const uw = main.getByTestId("uw-vs-actual");
  const txt = await uw.innerText();
  check(/Baseline frozen 3\/16\/2026 by am@example\.com/.test(txt) && /6\s*months of NOI/.test(txt), "baseline date, who, and months of actuals");
  const ret = await uw.getByTestId("uw-returns").innerText();
  check(/Levered IRR/.test(ret) && /Unlevered IRR/.test(ret) && /Exit cap/.test(ret) && /\+0\.50 pts/.test(ret), "returns table: exit cap +0.50 pts vs underwritten");
  const attr = await uw.getByTestId("uw-attribution").innerText();
  // The fixture's Route 9 has no rent roll until the app generates one on
  // load, so the rent roll added after the baseline shows under leasing.
  check(/Exit cap and value\s*−\d/.test(attr) && /Rent and leasing\s*[−+]\d/.test(attr) && /Operations to date \(actual vs\. model\)\s*[−+]\d/.test(attr), `attribution: exit cap (down), rent roll and operations: ${attr.replace(/\s+/g, " ").slice(0, 220)}`);
  const pts = [...attr.matchAll(/([−+])(\d+\.\d\d) pts/g)].map((m) => (m[1] === "−" ? -1 : 1) * Number(m[2]));
  check(Math.abs(pts.slice(1).reduce((a, x) => a + x, 0) - pts[0]) < 0.06, `causes add up to the gap (${pts[0]})`);
  const yrs = await uw.getByTestId("uw-years").innerText();
  check(/Year 1\s*partial/.test(yrs) && /projected/.test(yrs) && /NOI/.test(yrs) && /DSCR/.test(yrs), "by-year table: partial year 1, projected later years");
  const [pdf] = await Promise.all([p.waitForEvent("download"), uw.getByRole("button", { name: "PDF report" }).click()]);
  const pdfPath = `${S}/j_report.pdf`; await pdf.saveAs(pdfPath);
  check(fs.statSync(pdfPath).size > 3000 && fs.readFileSync(pdfPath).slice(0, 5).toString() === "%PDF-", `asset-management PDF: ${pdf.suggestedFilename()}`);
  await p.screenshot({ path: S + "/j_asset.png", fullPage: true });

  // Freeze a baseline for another asset
  await main.getByRole("button", { name: "Close" }).first().click();
  await p.waitForTimeout(400);
  await main.locator("tbody tr", { hasText: "Airport Flex Park" }).first().getByRole("button", { name: "Details" }).click();
  await p.waitForTimeout(800);
  const uw2 = main.getByTestId("uw-vs-actual");
  check((await uw2.innerText()).includes("No underwriting baseline yet"), "Airport Flex: no baseline yet");
  await uw2.getByRole("button", { name: "Freeze underwriting baseline" }).click();
  await p.waitForTimeout(1200);
  const t2 = await main.getByTestId("uw-vs-actual").innerText();
  check(/Baseline frozen/.test(t2) && /by t@example\.com/.test(t2), "baseline frozen by the signed-in user");
  check(/Levered IRR[^\n]*\n?[^\n]*(0\.00 pts|—)/.test(await main.getByTestId("uw-returns").innerText()) || /gap: (0\.00 pts|—)/.test(await main.getByTestId("uw-attribution").innerText()), "fresh baseline: no gap");
  await FX.openTab(p, /^Portfolio Return/);
  await p.waitForTimeout(1500);
  check((await main.getByTestId("fund-uw-row").count()) === 2, "Portfolio Return now lists both assets");

  await p.waitForTimeout(22000);
  const sd = (saved?.new_data ?? saved?.data)?.deals?.find((d) => d.id === "sample-deal-1")?.inputs;
  check(sd?.uwBaseline?.by === "t@example.com" && sd.uwBaseline.inputs?.purchasePrice === sd.purchasePrice && !sd.uwBaseline.inputs.businessPlan, "saved: the frozen baseline (model inputs only)");
  check(allChanges.some((c) => /Underwriting baseline/.test(c.field ?? "")), "change log: baseline frozen");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
