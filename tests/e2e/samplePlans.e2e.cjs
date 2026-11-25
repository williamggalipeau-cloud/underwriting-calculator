// 1.1.2 (user, 11/25): Sample data → Add sample business plans. The owner's
// click gives each Model Fund I sample asset a fictional plan and actuals, and
// the Dashboard's Asset Watch List shows Route 9 At Risk and Harbor Light Off
// Plan. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const SP = j(R + "/lib/samplePlans.js");
const TODAY = new Date().toISOString().slice(0, 10);
// The live firm's case: every sample asset already has a plan someone made, with no actuals.
const data2 = FX.workspaceData();
data2.deals = data2.deals.map((d) => {
  if (!d.id.startsWith("sample-deal-") || d.inputs.acquisitionDate > TODAY) return d;
  const bp = SP.samplePlanFor(d.inputs, { todayISO: TODAY });
  return { ...d, inputs: { ...d.inputs, businessPlan: { ...bp, actuals: {}, actualsSource: null, revisions: bp.revisions.map((r) => ({ ...r, by: "pm@example.com", note: "Plan made by the team" })) } } };
});
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

  check((await p.getByTestId("watch-asset").count()) === 0 && /No assets under plan/.test(await p.getByTestId("assets-watch").innerText()), "before: the Asset Watch List is empty (no business plans)");
  const sm = p.getByTestId("sample-data-menu");
  if (!(await sm.isVisible())) { await p.getByRole("button", { name: "More", exact: true }).click(); await p.waitForTimeout(200); }
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(200);
  await sm.getByRole("menuitem", { name: /Add sample business plans/ }).click();
  await p.waitForTimeout(1500);
  check(alerts.some((a) => /^Add fictional business plans/.test(a)) && alerts.some((a) => /^Added sample business plans to 9 sample assets\.$/.test(a)), `asked first, then added 9 (${alerts.slice(-1)[0]})`);

  const rows = p.getByTestId("watch-asset");
  const texts = await rows.allInnerTexts();
  check(texts.length === 2, `two assets on the Watch List (${texts.map((t) => t.split("\n")[0]).join(", ")})`);
  const r9 = texts.find((t) => /Route 9 Small Bay/.test(t)) ?? "", hl = texts.find((t) => /Harbor Light Industrial/.test(t)) ?? "";
  check(/At Risk/.test(r9) && /-1\d\.\d%/.test(r9) && /milestone late/.test(r9), `Route 9: At Risk, NOI over 10% under plan, a late milestone: ${r9.replace(/\s+/g, " ")}`);
  check(/Off Plan/.test(hl) && /-\d\.\d%/.test(hl) && /Capital .* budget/.test(hl), `Harbor Light: Off Plan, capital over budget: ${hl.replace(/\s+/g, " ")}`);
  await p.getByTestId("assets-watch").screenshot({ path: S + "/samplePlans_watch.png" });

  // ── Vacant Units (1.1.3: on Active Leasing, no longer on the Dashboard) ──
  check((await p.getByTestId("home").getByTestId("vacant-units").count()) === 0, "the Dashboard has no Vacant Units section");
  await FX.openTab(p, "Active Leasing");
  await p.waitForTimeout(800);
  const lz = p.getByTestId("leasing");
  const vu = lz.getByTestId("vacant-units");
  check((await vu.count()) === 1 && (await lz.locator("section").first().getAttribute("data-testid")) === "vacant-units", "Vacant Units is the first section on Active Leasing, above the Leasing Pipeline");
  await lz.getByRole("button", { name: /^All (of |assets)/ }).click();
  await p.waitForTimeout(400);
  const nVac = await vu.getByTestId("vacant-unit").count();
  check(nVac > 0 && (await vu.getByTestId("no-prospects").count()) === nVac && (await vu.getByTestId("cell-asset").count()) === nVac, `all assets: every vacant unit, with the Asset column, none with prospects yet (${nVac} shown; ${await vu.getByTestId("vacant-count").innerText()})`);
  check(/\$\d+\.\d\d[\s\S]*\$\d+\.\d\d/.test(await vu.getByTestId("vacant-unit").first().innerText()), "asking rent and the plan's target rent on a unit");
  // Add sample prospects: a pipeline on each asset
  if (!(await sm.isVisible())) { await p.getByRole("button", { name: "More", exact: true }).click(); await p.waitForTimeout(200); }
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(200);
  await sm.getByRole("menuitem", { name: /Add sample prospects/ }).click();
  await p.waitForTimeout(1500);
  check(alerts.some((a) => /^Added \d+ sample prospects on 9 sample assets(, and \d+ rent comps on assets that had none)?\.$/.test(a)), `prospects added: ${alerts.slice(-1)[0]}`);
  const sum = await vu.getByTestId("vacant-summary").innerText();
  const [, withP, without] = sum.match(/(\d+) with active prospects · (\d+) with none/) ?? [];
  check(Number(withP) >= 8 && Number(without) >= 3, `most units now have prospects: ${sum}`);
  const firstWith = vu.getByTestId("vacant-unit").filter({ hasNot: p.getByTestId("no-prospects") }).first();
  check(/(Tour|Proposal|LOI|Lease out|Inquiry)/.test(await firstWith.innerText()) && /\d+ d$/.test((await firstWith.innerText()).split("\n").find((l) => /· \d+ d/.test(l)) ?? "") && /avg of \d/.test(await firstWith.getByTestId("vacant-comps").innerText()), `a unit's best prospect, next step and rent comps: ${(await firstWith.innerText()).replace(/\s+/g, " ")}`);
  const pc = (await vu.getByTestId("cell-prospects").allInnerTexts()).map(Number);
  check(pc.length > 0 && pc.every((n) => Number.isInteger(n) && n >= 0) && pc.some((n) => n > 1) && pc.some((n) => n === 0), `a Prospects column with each unit's active prospects (${pc.join(", ")})`);
  const dv = await vu.getByTestId("cell-days-vacant").allInnerTexts();
  check(dv.length > 0 && dv.every((t) => /^\d[\d,]* d\s+since (\d+\/\d+\/\d{4}|acquisition)$/.test(t.trim())) && dv.some((t) => /since \d/.test(t)), `days vacant on each unit, since a date or the acquisition: ${dv.slice(0, 3).map((t) => t.replace(/\s+/g, " ")).join(" | ")}`);
  // Open asset → that asset's view: its units only, no Asset column, + Prospect
  if (await vu.getByRole("button", { name: /^Show all/ }).count()) { await vu.getByRole("button", { name: /^Show all/ }).click(); await p.waitForTimeout(200); }
  await vu.getByRole("button", { name: "Open Route 9 Small Bay" }).first().click();
  await p.waitForTimeout(800);
  const r9rows = await vu.getByTestId("vacant-unit").allInnerTexts();
  check(r9rows.length === 2 && (await vu.getByTestId("cell-asset").count()) === 0 && /Route 9 Small Bay/.test(await lz.locator("h2 + p").innerText()), `Open asset → Route 9's view: its ${r9rows.length} vacant units, no Asset column`);
  await vu.screenshot({ path: S + "/samplePlans_vacant.png" });
  const before = await lz.getByTestId("prospect-row").count();
  await vu.getByRole("button", { name: /^Add a prospect for unit/ }).last().click();
  await p.waitForTimeout(600);
  check((await lz.getByTestId("prospect-row").count()) === before + 1, `+ Prospect adds a prospect on that unit to the pipeline (${before} → ${await lz.getByTestId("prospect-row").count()})`);
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(1000);

  // The plan opens from the Watch List: Asset Business Plan on Route 9, with actuals
  await p.getByRole("button", { name: "Open Route 9 Small Bay" }).click();
  await p.waitForTimeout(1200);
  const main = await p.locator("main").innerText();
  check(/Route 9 Small Bay/.test(main) && /Net operating income/.test(main), "Open → Route 9's Asset Business Plan, with its budget vs. actual");

  // ── Dispositions → Disposition Candidates (1.1.5): first tab, empty on Model Fund I (exits in 2030) ──
  await FX.openTab(p, "Disposition Candidates");
  await p.waitForTimeout(600);
  const dtabs = await p.getByRole("group", { name: "Dispositions" }).getByRole("button").allInnerTexts();
  check(/^Disposition Candidates/.test(dtabs[0]), `Disposition Candidates is the first Dispositions tab (${dtabs.join(", ")})`);
  const dc = await p.getByTestId("disposition-candidates").innerText();
  check((await p.getByTestId("no-candidates").count()) === 1 && /No disposition candidates/.test(dc) && /Next planned exit: [^,]+, \d+\/\d+\/2030 \(business plan\)/.test(dc), `no candidates yet, with the next planned exit: ${dc.replace(/\s+/g, " ").slice(0, 220)}`);
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(800);

  // ── Add sample marks and market data (1.1.5) ──
  if (!(await sm.isVisible())) { await p.getByRole("button", { name: "More", exact: true }).click(); await p.waitForTimeout(200); }
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(200);
  await sm.getByRole("menuitem", { name: /Add sample marks and market data/ }).click();
  await p.waitForTimeout(1500);
  check(/^Added 9 sample submarkets with 72 quarters of statistics \(9 assets tagged\) and \d+ sample marks?\./.test(alerts.at(-1)), `sample market data and marks added: ${alerts.at(-1)}`);
  await FX.openTab(p, "Market Data");
  await p.waitForTimeout(800);
  const md = await p.locator("main").innerText();
  check(/Kent Small Bay \(fictional\)/.test(md) && /Long Beach Small Bay \(fictional\)/.test(md), "Market Data lists the sample submarkets");
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(800);

  // ── Load Model Fund I (1.1.4): rebuilt with sample plans and prospects ──
  if (!(await sm.isVisible())) { await p.getByRole("button", { name: "More", exact: true }).click(); await p.waitForTimeout(200); }
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(200);
  await sm.getByRole("menuitem", { name: /Load Model Fund I/ }).click();
  await p.waitForTimeout(2000);
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(1200);
  const t3 = await p.getByTestId("watch-asset").allInnerTexts();
  check(t3.length === 2 && t3.some((t) => /Route 9 Small Bay[\s\S]*At Risk/.test(t)) && t3.some((t) => /Harbor Light Industrial[\s\S]*Off Plan/.test(t)), `Load Model Fund I: the Watch List shows Route 9 At Risk and Harbor Light Off Plan at once (${t3.map((t) => t.split("\n")[0]).join(", ")})`);
  await FX.openTab(p, "Active Leasing");
  await p.waitForTimeout(800);
  await lz.getByRole("button", { name: /^All (of |assets)/ }).click();
  await p.waitForTimeout(400);
  const sum3 = await lz.getByTestId("vacant-summary").innerText();
  check(/^([89]|\d\d) with active prospects/.test(sum3) && (await lz.getByTestId("prospect-row").count()) >= 15, `and the leasing pipeline: ${sum3}; ${await lz.getByTestId("prospect-row").count()} prospects`);
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(800);

  // ── The live case: plans already there, no actuals → actuals added, plans kept ──
  ws.data = data2; ws.version += 1;
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  check((await p.getByTestId("watch-asset").count()) === 0, "existing plans without actuals: the Watch List is empty");
  if (!(await sm.isVisible())) { await p.getByRole("button", { name: "More", exact: true }).click(); await p.waitForTimeout(200); }
  await sm.getByRole("button", { name: /Sample data/ }).click();
  await p.waitForTimeout(200);
  await sm.getByRole("menuitem", { name: /Add sample business plans/ }).click();
  await p.waitForTimeout(1500);
  check(/^Added sample actuals to the existing plans on 9 assets \(the plans themselves are unchanged\)\.$/.test(alerts.at(-1)), `actuals added to the existing plans: ${alerts.at(-1)}`);
  const t2 = await p.getByTestId("watch-asset").allInnerTexts();
  check(t2.length === 2 && t2.some((t) => /Route 9 Small Bay[\s\S]*At Risk/.test(t)) && t2.some((t) => /Harbor Light Industrial[\s\S]*Off Plan/.test(t)), `then Route 9 At Risk and Harbor Light Off Plan (${t2.map((t) => t.split("\n")[0]).join(", ")})`);

  check(errs.length === 0, `no page errors ${errs.join(" | ")}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
