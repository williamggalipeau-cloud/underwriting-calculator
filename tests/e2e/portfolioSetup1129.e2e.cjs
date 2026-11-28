// 1.1.29 Playwright: New Portfolio Setup / Edit Portfolio. The type is chosen
// first and then fixed; a fund, a joint venture and a separate account each
// have their own steps and wording; what is entered is what is saved.
// Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
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
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); body = String(++ws.version); }
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
  const tab = (name) => ({ click: () => FX.openTab(p, name) });


  const sb = await FX.openSetup(p);
  const fundsSaved = () => saved?.new_data?.funds ?? saved?.data?.funds ?? {};
  const step = (id) => FX.setupStep(p, id);

  // ── Joint venture ──
  await sb.getByRole("button", { name: "New Portfolio Setup" }).click();
  await p.waitForTimeout(400);
  const dlg = p.getByTestId("portfolio-setup");
  check((await dlg.getByTestId("type-chooser").getByRole("button").count()) === 4 && (await dlg.getByTestId("setup-steps").count()) === 0, "the first screen is the type: Fund, Joint Venture or Separate Account (and Cancel)");
  await dlg.getByTestId("type-jv").click();
  const pills = await dlg.getByTestId("setup-steps").getByRole("button").allInnerTexts();
  check(pills.join("|") === "1 Document|2 Investor|3 Capital & fees|4 Returns|5 Restrictions & dates|Review", `the joint venture's steps: ${pills.join(" | ")}`);
  check(/Type: Joint Venture \(fixed\)/.test(await dlg.getByTestId("type-fixed").innerText()) && (await dlg.getByLabel("Fund type").count()) === 0 && (await dlg.getByTestId("lpa-panel").innerText()).includes("JVA"), "step 1: the type is fixed, and the document is the joint venture agreement");
  check((await dlg.getByRole("button", { name: /^Create/ }).count()) === 0 && (await dlg.getByTestId("step-next").count()) === 1, "a new portfolio is created from the review page, not before");
  await dlg.getByLabel("Portfolio name").fill("Harbor Venture");
  await dlg.getByTestId("step-next").click();
  check((await dlg.getByTestId("investor").count()) === 1 && (await dlg.getByLabel("Authority").count()) === 0, "step 2: the capital partner (no client authority on a joint venture)");
  await dlg.getByLabel("JV partner").fill("Example Pension Fund");
  await dlg.getByLabel("Investor type").selectOption("Pension fund");
  await dlg.getByLabel("Contact name").fill("Jordan Example");
  await step("capital");
  const capText = await dlg.getByTestId("capital").innerText();
  check(/TOTAL EQUITY/i.test(capText) && /SPONSOR'S OWNERSHIP/i.test(capText) && /Partner 90% \/ sponsor 10%/.test(capText) && !/GP COMMITMENT\n/.test(capText), "step 3: total equity and the ownership split, in the venture's words");
  check(!(await dlg.getByTestId("sub-line").getByRole("checkbox").isChecked()), "a new joint venture has no subscription line unless switched on");
  await step("returns");
  const tr = dlg.getByTestId("target-return");
  await tr.getByRole("spinbutton").nth(0).fill("14");
  await tr.getByRole("spinbutton").nth(1).fill("1.8");
  await tr.getByRole("spinbutton").nth(2).fill("6");
  check(/Partner IRR up to/.test(await dlg.getByTestId("promote-tiers").innerText()) && /Sponsor %/.test(await dlg.getByTestId("promote-tiers").innerText()), "step 4: the target return, then the promote in partner and sponsor terms");
  await step("restrictions");
  const add = dlg.getByTestId("add-restriction");
  await add.getByLabel("Restriction kind").selectOption("asset_ltv_pct");
  await add.getByLabel("Restriction limit").fill("60");
  await add.getByLabel("Restriction clause").fill("6.2");
  await dlg.getByTestId("add-restriction-btn").click();
  await add.getByLabel("Restriction text").fill("A sale or refinancing needs the partner's consent");
  await add.getByLabel("Restriction clause").fill("7.4");
  await dlg.getByTestId("add-restriction-btn").click();
  await add.getByLabel("Restriction text").fill("Sponsor exclusivity in the target markets");
  await dlg.getByTestId("add-restriction-btn").click();
  const rr = await dlg.getByTestId("restriction-row").allInnerTexts();
  check(rr.length === 3 && /60%/.test(rr[0]) && /Against actual/.test(rr[0]) && /Listed for reference/.test(rr[1]) && /Listed for reference/.test(rr[2]), `step 5: a measured restriction and two listed for reference: ${rr.map((x) => x.replace(/\s+/g, " ")).join(" / ")}`);
  await dlg.getByLabel("Agreement date").fill("2024-03-31");
  await dlg.getByLabel("Outside sale date").fill("2031-03-31");
  await dlg.getByLabel("Buy-sell available from").fill("2027-03-31");
  check(/term ends 3\/31\/2029/.test(await dlg.getByTestId("term-dates").innerText()), "the term of the agreement: its end date is worked out");
  await step("review");
  const rev = await dlg.getByTestId("review").innerText();
  check(/Example Pension Fund/.test(rev) && /14% IRR · 1.8x equity multiple · 6% cash yield/.test(rev) && /90% \/ 10%/.test(rev) && /\(reference\)/.test(rev) && /Not set/.test(rev) && /ends 3\/31\/2029/.test(rev), "the review page lists every step's terms, with what is not set");
  const addCur = dlg.getByRole("checkbox", { name: /Add the current deal/ });
  if (await addCur.count()) await addCur.uncheck();
  await dlg.getByRole("button", { name: "Create JV" }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^Save/ }).first().click().catch(() => {});
  await p.waitForTimeout(1500);
  const jv = fundsSaved()["Harbor Venture"];
  check(jv?.type === "Joint Venture" && jv.partnerName === "Example Pension Fund" && jv.investorType === "Pension fund" && jv.subLineEnabled === false && jv.mgmtFeeBasis === "invested", `saved: the venture, its partner and its type defaults (${jv?.type}, ${jv?.partnerName})`);
  check(jv?.fundPlanTargets?.netIrrPct === 14 && jv.fundPlanTargets.netMultiple === 1.8 && jv.fundPlanTargets.cashYieldPct === 6, "saved: the target return (IRR, multiple, cash yield)");
  check(jv?.limits?.length === 3 && jv.limits.some((l) => l.key === "asset_ltv_pct" && l.limit === 60 && l.clause === "6.2") && jv.limits.filter((l) => l.unit === "text").length === 2, "saved: the three restrictions");
  check(jv?.finalClose === "2024-03-31" && jv.outsideSaleDate === "2031-03-31" && jv.buySellDate === "2027-03-31", "saved: the agreement's dates");

  // ── Edit Portfolio: the same steps, the type fixed ──
  await FX.openSetup(p);
  const opts = await sb.getByLabel("Edit portfolio").locator("option").allInnerTexts();
  check(opts.includes("Harbor Venture · Joint Venture"), `Edit Portfolio lists each portfolio with its type: ${opts.join(", ")}`);
  await sb.getByLabel("Edit portfolio").selectOption("Harbor Venture");
  await p.waitForTimeout(500);
  check((await dlg.getByTestId("type-chooser").count()) === 0 && /Type: Joint Venture \(fixed\)/.test(await dlg.getByTestId("type-fixed").innerText()) && (await dlg.getByRole("button", { name: "Save terms" }).count()) === 1, "Edit Portfolio: no type choice, and it can be saved from any step");
  await step("investor");
  check((await dlg.getByLabel("JV partner").inputValue()) === "Example Pension Fund", "the capital partner is as saved");
  await dlg.getByRole("button", { name: "Cancel" }).click();

  // ── Separate account ──
  await FX.openSetup(p);
  await sb.getByRole("button", { name: "New Portfolio Setup" }).click();
  await dlg.getByTestId("type-sma").click();
  await dlg.getByLabel("Portfolio name").fill("Harbor Account");
  await step("investor");
  await dlg.getByLabel("Client", { exact: true }).fill("Fictional Insurance Company");
  check((await dlg.getByLabel("Authority").inputValue()) === "approval" && /Workflow \(v1.2\)/.test(await dlg.getByTestId("investor").innerText()), "separate account: the client approves each deal by default; recorded only");
  await step("capital");
  check(/ALLOCATION/i.test(await dlg.getByTestId("capital").innerText()) && !(await dlg.getByLabel("Sponsor co-invests").isChecked()), "separate account: an allocation, and no sponsor co-investment unless switched on");
  await step("returns");
  check((await dlg.getByTestId("promote-tiers").count()) === 1 && !/catch-up/i.test(await dlg.getByTestId("waterfall").innerText()), "separate account: no catch-up");
  await dlg.getByTestId("sma-terms").getByRole("spinbutton").first().fill("15");
  check((await dlg.getByTestId("promote-tiers").count()) === 0 && (await dlg.getByTestId("incentive-note").count()) === 1, "an incentive fee replaces the promote tiers");
  await step("restrictions");
  check((await dlg.getByTestId("sma-dates").count()) === 1 && (await dlg.getByTestId("jv-dates").count()) === 0, "separate account: termination notice, no buy-sell or outside sale date");
  await dlg.getByTestId("sma-dates").getByRole("spinbutton").fill("90");
  await step("review");
  if (await addCur.count()) await addCur.uncheck();
  await dlg.getByRole("button", { name: "Create SMA" }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /^Save/ }).first().click().catch(() => {});
  await p.waitForTimeout(1500);
  const sma = fundsSaved()["Harbor Account"];
  check(sma?.type === "Separate Account" && sma.clientName === "Fictional Insurance Company" && sma.authority === "approval" && sma.gpCommitPct === 0 && sma.incentiveFeePct === 15 && sma.terminationNoticeDays === 90, `saved: the separate account (${sma?.type}, notice ${sma?.terminationNoticeDays})`);

  // ── Fund ──
  await FX.openSetup(p);
  await sb.getByRole("button", { name: "New Portfolio Setup" }).click();
  await dlg.getByTestId("type-fund").click();
  const fp = await dlg.getByTestId("setup-steps").getByRole("button").allInnerTexts();
  check(fp[1] === "2 Parties", "a fund's second step is its parties");
  await step("investor");
  check((await dlg.getByTestId("fund-investors-note").count()) === 1 && (await dlg.getByTestId("investor").count()) === 0 && (await dlg.getByTestId("parties").count()) === 1, "fund: no investor list (kept in the CRM); the sponsor and GP parties");
  await step("capital");
  check(/TOTAL COMMITMENTS/i.test(await dlg.getByTestId("capital").innerText()) && /GP COMMITMENT/i.test(await dlg.getByTestId("capital").innerText()) && (await dlg.getByTestId("sub-line").getByRole("checkbox").isChecked()), "fund: commitments, GP commitment and a subscription line, as before");
  await step("restrictions");
  check((await dlg.getByLabel("Final close").count()) === 1 && (await dlg.getByTestId("jv-dates").count()) === 0 && (await dlg.getByTestId("sma-dates").count()) === 0, "fund: final close and its timeline");
  await dlg.getByRole("button", { name: "Cancel" }).click();

  // ── Portfolio Summary shows the investor, the target and the agreement ──
  await FX.openTab(p, /^Portfolio Summary/);
  await p.waitForTimeout(1200);
  await p.getByTestId("fund-summary").getByLabel("Fund").selectOption("Harbor Venture");
  await p.waitForTimeout(600);
  const inv = await p.getByTestId("fs-investor").innerText();
  check(/Example Pension Fund/.test(inv) && /Pension fund/.test(inv) && /14% IRR/.test(inv) && /3\/31\/2031/.test(inv) && /3 \(1 measured, 2 for reference\)/.test(inv), "Portfolio Summary: the capital partner, target return, dates and restrictions");
  check((await p.getByTestId("plan-targets").getByLabel("Net LP IRR %").inputValue()) === "14" && (await p.getByTestId("plan-targets").getByLabel("Cash yield %").inputValue()) === "6", "the portfolio plan's targets are the same targets (one set)");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
