// 1.1.8 (user, 11/26): Tenant Credit (tab, screening required before Signed,
// credit-change flags), the risk report's Tenant Credit and Aged Rent
// sections, risks first, Internal-only reports. Load Model Fund I brings the
// sample tenant credit and aged receivables. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
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
    else if (u.includes("/rpc/save_workspace")) { const s = JSON.parse(req.postData()); ws.data = s.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    else if (u.includes("/storage/")) body = JSON.stringify({ Key: "x" });
    // 1.1.9: Blue Mesa's sample screening report, already uploaded (tagged to the tenant).
    else if (u.includes("/deal_documents") && req.method() === "GET") body = JSON.stringify([{ id: "dd-cr1", workspace_id: "w1", deal_id: "sample-deal-1", doc_type: "other", title: "[leasing:tenant:blue-mesa-fulfillment] Credit screening report: screening-blue-mesa-fulfillment.pdf", files: [{ name: "screening-blue-mesa-fulfillment.pdf", path: "w1/sample-deal-1/dd-cr1/f.pdf" }], created_at: "2026-11-26T00:00:00Z" }]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  const alerts = [];
  p.on("dialog", (d) => { alerts.push(d.message()); d.accept(); });
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  const main = p.locator("main");

  // ── Load Model Fund I: the complete test fund, now with tenant credit and aged rent ──
  const sm = p.getByTestId("sample-data-menu");
  if (!(await sm.isVisible())) { await FX.openSetup(p); await p.waitForTimeout(200); }
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(200);
  await sm.getByRole("menuitem", { name: /Load Model Fund I/ }).click();
  await p.waitForTimeout(6000);

  // ── Tenant Credit tab ──
  await FX.openTab(p, "Tenant Credit");
  await p.waitForTimeout(1000);
  const tc = main.getByTestId("tenant-credit");
  const tabs = await p.getByRole("group", { name: "Asset Management" }).getByRole("button").allInnerTexts();
  check(tabs.indexOf("Tenant Credit") === tabs.indexOf("Leases") + 1 && tabs.indexOf("Active Leasing") === tabs.indexOf("Tenant Credit") + 1, "Tenant Credit sits after Leases, before Active Leasing");
  await tc.getByRole("button", { name: "All assets" }).click();
  await p.waitForTimeout(600);
  const filt = await tc.getByRole("tablist", { name: "Tenant Credit filter" }).innerText();
  // 1.1.28: with the joint venture's and separate account's three credit stories (two to watch, one with no record).
  check(/Needs attention 8/.test(filt) && /All tenants \d{2,}/.test(filt), `filters: ${filt.replace(/\s+/g, " ")}`);
  const statuses = await tc.getByTestId("credit-status").allInnerTexts();
  check(statuses.filter((x) => x === "Weak").length === 6 && statuses.filter((x) => x === "Missing").length === 2, `needs attention: 6 Weak, 2 Missing (Model Fund I's 4 and 1, the two portfolios' 2 and 1) (${statuses.join(", ")})`);
  const hl = tc.getByTestId("credit-row").filter({ hasText: "Harbor Light Industrial" });
  check(/Credit change: Lost its largest customer/.test(await hl.innerText()) && /Rent 60\+ days late/.test(await hl.innerText()) && /Paydex 74 \/ 70/.test(await hl.innerText()), "Harbor Light: score passes, but a credit-change flag and rent 60+ days late → Weak");
  check(/Consumer 612 \/ 650/.test(await tc.getByTestId("credit-row").filter({ hasText: "Airport Flex Park" }).innerText()), "Airport Flex: score 612 below 650, shown in red");
  // 1.1.9: the record is read off the sample report, and links to its PDF.
  await tc.getByTestId("credit-row").filter({ hasText: "Airport Flex Park" }).getByRole("button", { name: "Open" }).click();
  await p.waitForTimeout(400);
  const det = tc.getByTestId("credit-detail");
  check(/Keystone Tenant Screening \(fictional\)/.test(await det.innerText()) && /10\/2\/2026/.test(await det.innerText()) && (await det.getByTestId("credit-report-link").count()) === 1, "Blue Mesa's record = its sample report (provider, date), with View report");
  await tc.getByTestId("credit-row").filter({ hasText: "Airport Flex Park" }).getByRole("button", { name: "Close" }).click();
  await p.waitForTimeout(200);
  // Clear the flag (logged with a note)
  await hl.getByRole("button", { name: "Open" }).click();
  await p.waitForTimeout(400);
  await tc.getByTestId("credit-detail").getByRole("button", { name: "Clear flag" }).click();
  await tc.getByTestId("credit-clear-form").getByLabel("Clear note").fill("Customer replaced (test)");
  await tc.getByTestId("credit-clear-form").getByRole("button", { name: "Clear flag" }).click();
  await p.waitForTimeout(800);
  const hl2 = await tc.getByTestId("credit-row").filter({ hasText: "Harbor Light Industrial" }).innerText();
  check(!/Credit change: Lost/.test(hl2) && /Rent 60\+ days late/.test(hl2) && /Weak/.test(hl2), "cleared: the flag no longer counts; still Weak for the late rent");
  check(/cleared .*Customer replaced \(test\)/.test(await tc.getByTestId("credit-detail").innerText()), "the cleared flag stays in the history, with its note");
  // Flag a tenant whose credit changed
  await tc.getByRole("tab", { name: /All tenants/ }).click();
  await p.waitForTimeout(400);
  // A Model Fund I tenant (the risk report below is that fund's; the list also holds the sample joint venture and separate account).
  const okRow = tc.getByTestId("credit-row").filter({ hasText: /Mill Creek Business Park|Canal Street Workshops|Lakeshore Service Center|Route 9 Small Bay/ }).filter({ has: p.getByTestId("credit-status").filter({ hasText: /^OK$/ }) }).first();
  const okTenant = (await okRow.locator("td").first().innerText()).split("\n")[0];
  await okRow.getByRole("button", { name: "Open" }).click();
  await p.waitForTimeout(300);
  await tc.getByTestId("credit-detail").getByRole("button", { name: /Flag credit change/ }).click();
  await tc.getByTestId("credit-flag-form").getByLabel("Flag reason").fill("Filed for Chapter 11 (test)");
  await tc.getByTestId("credit-flag-form").getByRole("button", { name: "Flag", exact: true }).click();
  await p.waitForTimeout(800);
  const flagged = tc.getByTestId("credit-row").filter({ hasText: okTenant }).first();
  check(/Weak/.test(await flagged.getByTestId("credit-status").innerText()) && /Filed for Chapter 11/.test(await flagged.innerText()), `flagged ${okTenant}: now Weak`);
  await p.screenshot({ path: `${S}/credit118_tab.png`, fullPage: true });

  // ── Active Leasing: screening required before Signed ──
  await FX.openTab(p, "Active Leasing");
  await p.waitForTimeout(800);
  await p.locator("#asset-picker").selectOption({ label: "Airport Flex Park" });
  await p.waitForTimeout(800);
  const idx = await main.getByTestId("prospect-row").evaluateAll((els) => els.findIndex((e) => e.querySelector('select[aria-label="Prospect stage"]')?.value === "tour"));
  const row = main.getByTestId("prospect-row").nth(idx);
  const tenant = await row.getByLabel("Prospect", { exact: true }).inputValue();
  check((await row.count()) === 1 && /Add screening/.test(await row.getByTestId("prospect-credit").innerText()), "a prospect at Tour has no screening yet");
  await row.getByLabel("Prospect stage").selectOption("signed");
  await p.waitForTimeout(600);
  check(/Record the credit screening/.test(await main.getByTestId("credit-msg").innerText()) && (await row.getByLabel("Prospect stage").inputValue()) === "tour", "Signed is refused without a screening");
  const form = main.getByTestId("prospect-screening-row").getByTestId("credit-form");
  await form.getByRole("radio", { name: "Our own assessment" }).click();
  check(/Still needed: our rating/.test(await form.innerText()), "own assessment: rating and basis required");
  await form.getByLabel("Own rating").selectOption("acceptable");
  await form.getByLabel("Assessment basis").fill("Two years of statements and a bank reference (test)");
  await form.getByRole("button", { name: "Save screening" }).click();
  await p.waitForTimeout(600);
  check(/Own: Acceptable/.test(await row.getByTestId("prospect-credit").innerText()), "screening saved on the prospect");
  await row.getByLabel("Prospect stage").selectOption("signed");
  await p.waitForTimeout(800);
  const signMsg = (await p.getByTestId("credit-msg").innerText().catch(() => "")).replace(/\s+/g, " ");
  await FX.saveLoadUpgrade(p); // Save changes now (this fixture's workspace autosaves after 20 s)
  await p.waitForTimeout(1500);
  const d1 = ws.data.deals.find((d) => d.id === "sample-deal-1")?.inputs;
  const pr = (d1?.leasing?.prospects ?? []).find((x) => x.tenant === tenant);
  const unit = (d1?.units ?? []).find((u) => u.id === pr?.unitId);
  check(pr?.stage === "signed" && (unit?.credit?.records ?? []).some((r) => r.source === "own" && r.rating === "acceptable" && r.tenant === tenant), `signed: the screening is copied to unit ${unit?.name ?? "?"}`);
  {
    // 1.1.24: the signed lease is added to the unit, or the message says why it could not be.
    const ll = (unit?.laterLeases ?? []).find((l) => l.prospectId === pr?.id);
    const expectLease = /^\d{4}-\d{2}-\d{2}$/.test(pr?.expectedStart ?? "") && pr.termMonths > 0 && (pr.proposedRentPSF > 0 || pr.askingRentPSF > 0) && pr.expectedStart > d1.acquisitionDate;
    check(expectLease ? !!ll && ll.tenantName === tenant && ll.start === pr.expectedStart && ll.rentPSF === (pr.proposedRentPSF || pr.askingRentPSF) && /was added to the unit on the Rent Roll/.test(signMsg) : !ll && /not added to the Rent Roll/.test(signMsg), `1.1.24: marking the prospect Signed ${expectLease ? "adds its lease to the unit with the prospect's terms" : "says why no lease was added"} (${signMsg.slice(0, 140)})`);
  }

  // ── Risk report: Tenant Credit and Aged Rent ──
  await FX.openTab(p, "Reports");
  await p.waitForTimeout(1500);
  const rp = main.getByTestId("reports");
  check((await rp.getByLabel("Version").count()) === 0, "Reports: Internal only (no Version choice)");
  await rp.getByRole("tab", { name: "Risk report (internal)" }).click();
  await p.waitForTimeout(2500);
  const rk = rp.getByTestId("risk-report");
  const cr = await rk.getByTestId("risk-credit").innerText();
  check(/Airport Flex Park/.test(cr) && /Ridgeway Trade Center/.test(cr) && /Own assessment: Weak/.test(cr) && /Filed for Chapter 11/.test(cr), `risk report Tenant Credit: the flagged tenants, with why (${cr.replace(/\s+/g, " ").slice(0, 700)})`);
  const ag = await rk.getByTestId("risk-aged").innerText();
  check(/Harbor Light Industrial/.test(ag) && /Southpoint Flex/.test(ag) && !/Granite Ave Industrial/.test(ag) && /Model Fund I/.test(ag), "Aged Rent: the tenants past due at assets held at the quarter end (Granite Ave, bought after it, isn't in this quarter's report), and the fund total");
  check(/\(2 tenants\)/.test(await rk.getByTestId("risk-summary-aged").innerText()), `summary: rent 60+ days past due (${(await rk.getByTestId("risk-summary-aged").innerText()).replace(/\s+/g, " ")})`);
  check((await rk.getByTestId("risk-leasing-risks").count()) === 1 && (await rk.getByTestId("risk-limit-checks").count()) === 1, "risks first: Leasing Risks and Limit Checks present");
  await p.screenshot({ path: `${S}/credit118_risk.png`, fullPage: true });

  check(errs.length === 0, `no page errors${errs.length ? `: ${errs.join("; ")}` : ""}`);
  await b.close();
  console.log(fails ? `${fails} failed` : "all passed");
  process.exit(fails ? 1 : 0);
})();
