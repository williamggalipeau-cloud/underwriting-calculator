// 1.1.30 Playwright: capital projects (the underwriting's list, the Asset
// Business Plan's Capital plan with its tie-out, an unbudgeted project and the
// Dashboard action) and the office and industrial mix (use and office SF by
// unit, targets, purchase / today / target, Asset Summary and Portfolio
// Summary). Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
for (const k of Object.keys(data.funds)) data.funds[k].sampleDataVersion = 99; // no automatic sample load in this test
const active = data.deals.find((d) => d.id === "sample-deal-1"); // Airport Flex Park
active.inputs.capexBudget = 400000;
active.inputs.building = { ...(active.inputs.building ?? {}), officeSF: 3000 };
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null, fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => { try { localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); } catch { /* an embedded frame (the map) has no storage */ } }, JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); ws.data = saved.new_data ?? saved.data ?? ws.data; body = String(++ws.version); }
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
  const savedDeal = () => (saved?.new_data?.deals ?? saved?.data?.deals ?? []).find((d) => d.id === "sample-deal-1");
  const save = async () => { await p.getByRole("button", { name: /^Save/ }).first().click().catch(() => {}); await p.waitForTimeout(1500); };

  // ── Underwriting: the capital projects list ──
  await FX.openTab(p, /^Rent Roll/);
  await p.waitForTimeout(600);
  await p.locator("#asset-picker").selectOption({ label: active.inputs.propertyName }, { timeout: 5000 });
  await p.waitForTimeout(600);
  await main.getByRole("button", { name: "Edit inputs" }).click();
  await p.waitForTimeout(500);
  const panel = p.getByRole("dialog", { name: "Asset inputs" });
  const cp = panel.getByTestId("capital-projects");
  check(/One figure of \$400,000, not split into projects yet/.test(await cp.getByTestId("cp-single").innerText()) && (await panel.getByTestId("capex-total").count()) === 0, "an asset with no list: the single Capex Budget, shown as one figure that can be split");
  await cp.getByTestId("cp-itemize").click();
  check((await cp.getByTestId("cp-row").count()) === 1 && (await cp.getByLabel("Project 1 budget").inputValue()) === "400000" && /\$400,000/.test(await cp.getByTestId("cp-total").innerText()), "Split into projects starts with one line for the whole budget");
  await cp.getByLabel("Project 1 name").fill("Roof replacement");
  await cp.getByLabel("Project 1 type").selectOption("Roof");
  await cp.getByLabel("Project 1 budget").fill("250000");
  await cp.getByLabel("Project 1 start month").fill("3");
  await cp.getByLabel("Project 1 months").fill("4");
  await cp.getByTestId("cp-add").click();
  await cp.getByLabel("Project 2 name").fill("Parking lot");
  await cp.getByLabel("Project 2 type").selectOption("Parking lot / paving");
  await cp.getByLabel("Project 2 budget").fill("110000");
  await cp.getByTestId("cp-add").click();
  await cp.getByLabel("Project 3 name").fill("Contingency");
  await cp.getByLabel("Project 3 type").selectOption("Contingency");
  await cp.getByLabel("Project 3 budget").fill("40000");
  await cp.getByLabel("Project 3 months").fill("0");
  const types = await cp.getByLabel("Project 1 type").locator("option").allInnerTexts();
  check(types.length === 15 && ["Landscaping", "Signage", "Painting", "Demise / Combine", "Contingency"].every((t) => types.includes(t)), "the project types, with the ones added by the user");
  check(/\$400,000/.test(await cp.getByTestId("cp-total").innerText()) && /\$400,000/.test(await panel.getByTestId("capex-total").innerText()) && (await cp.getByTestId("cp-untied").count()) === 0, "the Capex Budget is the list's total and is no longer typed");
  await cp.getByLabel("Project 2 budget").fill("150000");
  check(/\$440,000/.test(await panel.getByTestId("capex-total").innerText()), "changing a project changes the Capex Budget ($440,000)");
  await cp.getByLabel("Project 2 budget").fill("110000");
  await panel.getByRole("button", { name: "Done" }).click();
  await p.waitForTimeout(300);

  // ── Rent Roll: use and office SF by unit, and the targets ──
  const mix = main.getByTestId("rr-mix-section");
  await mix.locator("summary").click();
  const rows = mix.getByTestId("mix-unit-row");
  const n = await rows.count();
  check(new RegExp(`${n} units not confirmed`).test(await mix.locator("summary").innerText()) && /100\.0% industrial/.test(await mix.locator("summary").innerText()), "a unit with no use counts as industrial, marked not confirmed");
  check(n > 5 && (await mix.getByTestId("mix-unconfirmed").count()) === n, `one row per unit (${n}), each marked not confirmed`);
  check(/3,000 below the building's Office SF of 3,000/.test(await mix.getByTestId("mix-office-tie").innerText()), "the units' office SF is checked against the building's Office SF (none entered yet: 3,000 below)");
  const unitName = (await rows.nth(0).locator("td").nth(0).innerText()).trim(), unit2 = (await rows.nth(1).locator("td").nth(0).innerText()).trim();
  const sf0 = Number((await rows.nth(0).locator("td").nth(2).innerText()).replace(/,/g, ""));
  await mix.getByLabel(`Unit ${unitName} use`).selectOption("office");
  await mix.getByLabel(`Unit ${unit2} use`).selectOption("retail");
  const uses = await mix.getByLabel(`Unit ${unit2} use`).locator("option").allInnerTexts();
  check(uses.join() === "Industrial,Flex,Office,Retail,Other", "the uses: Industrial, Flex, Office, Retail, Other");
  await mix.getByLabel(`Unit ${unit2} office SF`).fill(String(3000 - sf0));
  await p.waitForTimeout(300);
  check(/ties to the building's Office SF \(3,000\)/.test(await mix.getByTestId("mix-office-tie").innerText()), `an office unit counts in full (${sf0} SF); with ${3000 - sf0} SF in another unit the office SF ties to the building`);
  await mix.getByTestId("mix-confirm-all").click();
  check((await mix.getByTestId("mix-unconfirmed").count()) === 0, "Confirm marks the rest as industrial");
  const officeRow = await mix.locator('[data-testid="mix-row"][data-use="office"]').innerText();
  check(/Office\s+1\s/.test(officeRow), `the mix by use: ${officeRow.replace(/\s+/g, " ")}`);
  await mix.getByLabel("Industrial target % of SF").fill("90");
  await mix.getByLabel("Office target % of SF").fill("5");
  check(/95\.0%/.test(await mix.getByTestId("mix-target-total-sf").innerText()) && (await mix.getByTestId("mix-target-warning").count()) === 1, "targets that do not add to 100% are flagged");
  await mix.getByLabel("Retail target % of SF").fill("5");
  await mix.getByLabel("Industrial target % of rent").fill("100");
  await mix.getByLabel("Office build-out target %").fill("3");
  check(/100\.0%/.test(await mix.getByTestId("mix-target-total-sf").innerText()) && (await mix.getByTestId("mix-target-warning").count()) === 0, "targets by SF and by rent, and for the office build-out");

  // ── Asset Business Plan: the Capital plan and the mix ──
  await FX.openTab(p, /^Asset Business Plan/);
  await p.waitForTimeout(600);
  await main.getByRole("button", { name: /Create business plan/ }).click();
  await p.waitForTimeout(800);
  const cap = main.getByTestId("plan-capital");
  const capRows = cap.getByTestId("plan-capital-row");
  check((await capRows.count()) === 3 && (await cap.getByTestId("plan-capital-source").allInnerTexts()).every((t) => t === "Underwriting") && /Roof replacement/.test(await capRows.nth(0).innerText()) && /\$250,000/.test(await capRows.nth(0).innerText()), "the plan's Capital plan carries the underwriting's projects one by one");
  check(/Ties to the underwritten budget of \$400,000/.test(await main.getByTestId("plan-capital-tie").innerText()), "and ties to the underwritten budget");
  check(/no job linked/.test(await capRows.nth(0).getByTestId("plan-capital-spent").innerText()) && /Not started/.test(await capRows.nth(0).innerText()), "a project with no construction job shows nothing spent and says so");
  const pm = main.getByTestId("plan-mix");
  const mr = (k) => pm.locator(`[data-testid="plan-mix-row"][data-key="${k}"]`).innerText();
  check(/90\.0%/.test(await mr("sf:industrial")) && /pts/.test(await mr("sf:industrial")) && /3\.0%/.test(await mr("buildout")) && /At purchase/.test(await pm.innerText()) && /Target/.test(await pm.innerText()), "Office and industrial mix: at purchase, today and target, with the points to go");
  // An unbudgeted project
  await main.getByRole("button", { name: "Edit plan" }).click();
  await main.getByRole("button", { name: "Add project" }).click();
  await main.getByLabel("capital 3 project").fill("Dock leveler replacement");
  await main.getByLabel("capital 3 budget").fill("38000");
  await p.waitForTimeout(200);
  check((await cap.getByTestId("plan-capital-source").nth(3).innerText()) === "Unbudgeted" && /\$38,000 above the underwritten budget of \$400,000/.test(await main.getByTestId("plan-capital-tie").innerText()) && /version 1\.2/.test(await main.getByTestId("plan-capital-tie").innerText()), "a project added after underwriting is Unbudgeted and counted against the underwritten budget");
  await main.getByTestId("plan-save-bar").getByRole("button", { name: /Save/ }).first().click();
  await p.waitForTimeout(800);
  await save();
  const sd = savedDeal()?.inputs;
  check(sd?.capitalProjects?.length === 3 && sd.capexBudget === 400000 && sd.capitalProjects[0].type === "Roof" && sd.capitalProjects[0].startMonth === 3, "saved: the projects, with the Capex Budget as their total");
  check(sd?.units?.filter((u) => u.use === "office").length === 1 && sd.units.filter((u) => u.use === "retail").length === 1 && sd.units.every((u) => u.use) && sd.units.reduce((s, u) => s + (Number(u.officeSF) || (u.use === "office" && u.officeSF == null ? u.squareFeet : 0)), 0) === 3000 && sd.mixTargets?.sf?.industrial === 90 && sd.mixTargets?.rent?.industrial === 100 && sd.mixTargets?.officeBuildoutPct === 3, "saved: each unit's use and office SF, and the targets");
  const lastCap = sd?.businessPlan?.revisions?.at(-1)?.plan?.capital;
  check(sd?.businessPlan?.revisions?.length === 2 && lastCap?.length === 4 && lastCap[3].source === "unbudgeted" && lastCap[0].source === "underwriting" && lastCap[0].start && sd.businessPlan.revisions[0].plan.capital.length === 3, "saved: revision 1 holds the underwriting's projects; revision 2 adds the unbudgeted one");

  // ── Asset Summary and Portfolio Summary ──
  await FX.openTab(p, /^Portfolio Summary/);
  await p.waitForTimeout(1200);
  const fm = main.getByTestId("fs-mix");
  check((await fm.getByTestId("fs-mix-row").count()) >= 1 && /Portfolio \(weighted by SF\)/.test(await fm.getByTestId("fs-mix-total").innerText()) && /Office build-out/i.test(await fm.innerText()) && /8\.3%/.test(await fm.getByTestId("fs-mix-row").first().innerText()), "Portfolio Summary: the mix by asset and the portfolio weighted by SF");
  await FX.openTab(p, /^Asset Summary/);
  await p.waitForTimeout(1200);
  await main.locator("tbody tr", { hasText: active.inputs.propertyName }).first().getByRole("button", { name: "Details" }).click();
  await p.waitForTimeout(600);
  const asMix = await main.getByTestId("as-mix").first().innerText().catch(() => "");
  check(/Mix: .*industrial .*office .*\(by SF\); office build-out/.test(asMix), `Asset Summary: ${asMix}`);

  // ── Dashboard: the capital plan above its underwritten budget ──
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await p.getByTestId("attention").getByRole("button", { name: /Show all|all \d+/i }).first().click().catch(() => {});
  const acts = await p.getByTestId("actions-table").innerText().catch(() => "");
  check(/Capital plan \$38,000 above the underwritten budget \(1 unbudgeted project\)/.test(acts), "Actions Needed: the capital plan above its underwritten budget");

  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.join(" || ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
