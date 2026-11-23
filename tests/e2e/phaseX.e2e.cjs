// Phase X Playwright: Distribution Analysis (Yardi cash upload with the
// projected fallback, entered cash, sub line rule, choosing the distribution,
// proposal, record as paid, exports). Fictional fixture and Yardi file;
// Supabase mocked.
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
  const num = (s) => Number(String(s).replace(/[^\d.-]/g, "")) * (/^\(/.test(String(s).trim()) ? -1 : 1) * (/M$/.test(String(s).trim()) ? 1e6 : 1);

  const nav = await p.locator("nav").first().innerText();
  check(nav.indexOf("Distribution Analysis") > nav.indexOf("Fund Return") && nav.indexOf("Distribution Analysis") < nav.indexOf("Stress Testing"), "Distribution Analysis sits after Fund Return");
  await p.getByRole("button", { name: /^Distribution Analysis/ }).first().click();
  await p.waitForTimeout(1500);
  const da = main.getByTestId("distribution-analysis");
  check((await da.count()) === 1 && /Model Fund I/.test(await da.locator("h2").innerText()), "Distribution Analysis for Model Fund I");
  check(/2026 Q3/.test(await da.getByLabel("Quarter").locator("option:checked").innerText()), "defaults to the last completed quarter (2026 Q3)");
  const rows = da.getByTestId("dist-asset-row");
  const n = await rows.count();
  check(n >= 7 && (await da.getByText("projected, no balance entered").count()) === n, `${n} assets held; all projected before any balance`);

  // Upload the fictional Yardi cash report
  await da.getByTestId("yardi-cash-file").setInputFiles(R + "/docs/sample-yardi/cash-balances-2026-09.csv");
  await p.waitForTimeout(1500);
  const msg = await da.getByTestId("dist-msg").innerText();
  check(/Loaded 6 balances for 2026 Q3/.test(msg) && /No balance for .*Southpoint Flex/.test(msg), `upload message: ${msg}`);
  const sp = rows.filter({ hasText: "Southpoint Flex" });
  check((await sp.getByText("projected, no balance entered").count()) === 1, "Southpoint Flex falls back to projected cash");
  check((await rows.filter({ hasText: "Route 9 Small Bay" }).getByText("Yardi", { exact: true }).count()) === 1 && (await da.getByLabel("Cash Route 9 Small Bay").inputValue()) === "312904.66", "Route 9: Yardi balance $312,904.66");
  const note = await da.getByTestId("dist-projected-note").innerText();
  check(/\$941,639 actual/.test(note) && /projected/.test(note), `actual vs. projected split: ${note}`);

  // Enter Southpoint's balance by hand
  await da.getByLabel("Cash Southpoint Flex").fill("150000");
  await p.waitForTimeout(800);
  check((await sp.getByText("entered", { exact: true }).count()) === 1, "Southpoint: entered by hand");
  const projLeft = await da.getByText("projected, no balance entered").count();
  check(projLeft === n - 7, `projected left only for assets not in the Yardi file (${projLeft})`);

  // Sub line clean-down, then back to none
  const tot = async () => num(await da.getByTestId("dist-total").locator("span.text-lg").innerText());
  const t0 = await tot();
  await da.getByLabel("Sub line rule").selectOption("clean-down");
  await p.waitForTimeout(800);
  const fundTxt = await da.getByTestId("dist-fund").innerText();
  check((await tot()) <= t0 && /Less sub line repayment\s*\(\$/.test(fundTxt), `clean-down repays the line first (total ${t0} → ${await tot()})`);
  await da.getByLabel("Sub line rule").selectOption("none");
  await p.waitForTimeout(800);
  check(Math.abs((await tot()) - t0) < 1, "no repayment: back to the full total");

  // Choose 50%
  await da.getByLabel("Distribution value").fill("50");
  await p.waitForTimeout(500);
  const amt = num(await da.getByTestId("dist-amount").innerText());
  check(Math.abs(amt - t0 / 2) <= t0 * 0.01, `50% of distributable: ${amt} (total shown ${t0})`);
  check(/Yield on LP contributed capital/.test(await da.getByTestId("dist-yield").innerText()) && /Yield on LP NAV/.test(await da.getByTestId("dist-yield").innerText()), "yields on contributed capital and NAV shown");
  check((await da.getByTestId("dist-history").locator("tbody tr").count()) === 6, "history: 4 quarters, trailing 12 months, proposed");

  // Save a proposal, record it as paid
  await da.getByRole("button", { name: "Save proposal" }).click();
  await p.waitForTimeout(800);
  check((await da.getByTestId("dist-proposal").count()) === 1, "proposal saved");
  await da.getByLabel("Paid date").fill("2026-10-15");
  await da.getByRole("button", { name: "Record as paid" }).click();
  await p.waitForTimeout(1000);
  check(/Paid 10\/15\/2026/.test(await da.getByTestId("dist-proposal").innerText()), "proposal marked paid 10/15/2026");

  // Exports
  const [x1] = await Promise.all([p.waitForEvent("download"), da.getByRole("button", { name: "Excel" }).click()]);
  check(/distribution-2026-Q3\.xlsx$/.test(x1.suggestedFilename()), `Excel: ${x1.suggestedFilename()}`);
  const [x2] = await Promise.all([p.waitForEvent("download"), da.getByRole("button", { name: "PDF" }).click()]);
  check(/distribution-2026-Q3\.pdf$/.test(x2.suggestedFilename()), `PDF: ${x2.suggestedFilename()}`);
  await x2.saveAs(S + "/distribution-2026-Q3.pdf");
  await p.screenshot({ path: S + "/phaseX_distribution.png", fullPage: true });

  // Saved on the fund's record
  await p.waitForTimeout(22000);
  const sf = (saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"];
  const q3 = sf?.distributions?.cash?.["2026-Q3"] ?? {};
  check(Object.values(q3).filter((e) => e.source === "yardi").length === 6 && Object.values(q3).some((e) => e.source === "manual" && e.balance === 150000), "saved: 6 Yardi balances and 1 entered");
  check(sf?.distributions?.yardiMapping?.r9sb01 === "sample-deal-2", "saved: Yardi property codes mapped");
  const paid = (sf?.capitalActivity ?? []).filter((a) => a.type === "distribution");
  check(paid.length === 1 && paid[0].date === "2026-10-15" && Math.abs(paid[0].amount - amt) < 2 && sf.distributions.proposals[0].status === "paid", "saved: the distribution in capital activity, the proposal paid");
  check(allChanges.length > 0, `change log entries recorded (${allChanges.length})`);

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
