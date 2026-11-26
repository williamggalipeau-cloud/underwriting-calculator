// Phase Z Playwright: the Home page (the app opens on it): attention list
// opening the right tab, fund cards, workflow lanes, quick actions, recent
// activity, and the Working on picker. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const JV = "Example JV II";
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
data.funds[JV] = { ...data.funds["Model Fund I"], name: JV, type: "Joint Venture", capitalActivity: [] };
data.deals = data.deals.map((d) => {
  if (d.id === "sample-deal-1") return { ...d, inputs: { ...d.inputs, units: [{ id: "u1", name: "Suite A", tenantName: "Example Tenant Co", leaseStatus: "occupied", squareFeet: 10000, baseRentPerSF: 10, leaseStart: "2021-01-01", leaseEnd: plus(30) }] } };
  if (d.id === "sample-deal-3") return { ...d, inputs: { ...d.inputs, fundName: JV } };
  return d;
});
data.auditLog = [{ id: "a1", at: new Date(Date.now() - 3600000).toISOString(), user: "colleague@example.com", area: "Fund terms", item: "Model Fund I", field: "Preferred return (%)", path: ["funds", "Model Fund I", "prefPct"], from: 8, to: 9 }];
data.activeDealId = "sample-deal-2";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com", user_metadata: {} } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let fails = 0;
let saves = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saves++; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const home = p.getByTestId("home");

  check((await home.count()) === 1, "the app opens on Home");
  check((await p.locator("header").getByTestId("home-button").count()) === 1 && (await p.locator("nav").getByRole("button", { name: "Home", exact: true }).count()) === 0 && /^Home/.test(await p.getByTestId("home").locator("h2").innerText()), "Home is in the header (not in Functions); the landing page is Home (1.1.11: one name)");

  // ── Actions Needed (urgent) and Calendar (upcoming), user 11/24 ──
  const att = p.getByTestId("attention");
  const at = await att.innerText();
  const leaseRow = att.getByTestId("action-row").filter({ hasText: "Example Tenant Co expires" });
  check((await leaseRow.count()) === 1 && (await leaseRow.getByTestId("cell-asset").innerText()) === "Airport Flex Park" && /30 d/.test(await leaseRow.innerText()), "Actions Needed: the lease expiring in 30 days, its asset in the first column");
  // Columns (user, 11/24): Asset name, Due date, Action type, Owner, Status
  const heads = (await att.locator("thead th").allInnerTexts()).map((t) => t.trim().toUpperCase()).filter(Boolean);
  check(heads.join("|") === "ASSET NAME|DUE DATE|ACTION TYPE|OWNER|STATUS|DETAILS", `Actions Needed headers: ${heads.join(", ")}`);
  const calHeads = (await p.getByTestId("calendar").locator("thead th").allInnerTexts()).map((t) => t.trim().toUpperCase()).filter(Boolean);
  check(calHeads.join("|") === "ASSET NAME|DUE DATE|ACTION TYPE|OWNER|STATUS|DETAILS", "Upcoming Events: the same headers");
  check((await leaseRow.getByTestId("status").inputValue()) === "Due now" && (await leaseRow.getByTestId("cell-owner").innerText()).trim().length > 0, `the lease row: Due now, owner ${await leaseRow.getByTestId("cell-owner").innerText()}`);
  const stats = new Set(await att.getByTestId("status").evaluateAll((els) => els.map((e) => e.value ?? e.textContent)));
  check([...stats].every((x) => ["Due now", "Past Due"].includes(x)) && stats.has("Past Due"), `Actions Needed statuses: ${[...stats].join(", ")}`);
  check(/without a \d{4}-\d{2}-\d{2} mark/.test(at) && !/Rate cap expires/.test(at), "Actions Needed: missing marks (overdue); rate caps months away are not urgent");
  const color = async (re) => att.getByTestId("action-row").filter({ hasText: re }).locator("[data-overdue]").evaluate((e) => [e.dataset.overdue, e.className]);
  const [od, odCls] = await color(/without a \d{4}-\d{2}-\d{2} mark/);
  const [soon, soonCls] = await color(/Example Tenant Co expires/);
  check(od === "yes" && !/red/.test(odCls) && soon === "no" && /text-gray-900/.test(soonCls) && !/red/.test(soonCls), "1.1.11: red only on the status chip (overdue marked by its Past Due chip), not the text");
  // Done: the overdue item leaves Actions Needed and shows done on the Calendar
  const nAct = await att.getByTestId("action-row").count();
  check((await att.getByRole("button", { name: /^Done/ }).count()) === 0, "no Done button: Status marks it");
  await att.getByRole("combobox", { name: /^Status: .*without a \d{4}-\d{2}-\d{2} mark/ }).selectOption("Completed");
  await p.waitForTimeout(500);
  check((await att.getByTestId("action-row").count()) === nAct - 1 && !/without a \d{4}-\d{2}-\d{2} mark/.test(await att.innerText()), "Status set to Completed: it leaves Actions Needed");
  await p.getByTestId("calendar").getByRole("button", { name: /Show the past 12 months/ }).click();
  await p.waitForTimeout(300);
  const doneRow = p.getByTestId("calendar-item").filter({ hasText: /without a \d{4}-\d{2}-\d{2} mark/ });
  check((await doneRow.getAttribute("data-state")) === "done" && (await doneRow.getByTestId("status").inputValue()) === "Completed" && /✓ done \d+\/\d+\/\d{4} by t@example\.com/.test(await doneRow.innerText()), "and shows done (who and when) in Upcoming Events' past 12 months");
  await doneRow.getByRole("combobox", { name: /^Status: / }).selectOption("Past Due");
  await p.waitForTimeout(400);
  check(/without a \d{4}-\d{2}-\d{2} mark/.test(await att.innerText()), "setting Status back to Past Due puts it back");
  await p.getByTestId("calendar").getByRole("button", { name: /Hide the past 12 months/ }).click();
  await p.waitForTimeout(300);
  const cal = p.getByTestId("calendar");
  const ct = await cal.innerText();
  check(/^Upcoming Events/.test(ct) && /Rate cap expires/.test(ct) && (await p.getByTestId("calendar-month").count()) >= 2, "Calendar: upcoming dates by month, incl. rate caps expiring");
  check(/Quarterly covenant tests/.test(ct) || /Appraisal due/.test(ct) || /Extension notice due/.test(ct) || (await p.getByTestId("calendar-item").count()) >= 10, "Calendar: debt and appraisal dates");
  const calDays = await p.getByTestId("calendar-item").evaluateAll((els) => els.map((e) => Number(e.dataset.days)));
  const calStats = new Set(await cal.getByTestId("status").evaluateAll((els) => els.map((e) => e.value || e.textContent)));
  check([...calStats].every((x) => ["Due now", "Past Due", "Upcoming", "Completed"].includes(x)) && calStats.has("Upcoming"), `Upcoming Events statuses: ${[...calStats].join(", ")}`);
  check(calDays.length > 0 && calDays.every((d) => d >= 0 && d <= 92), `Upcoming Events (default view): the next three months (${Math.min(...calDays)}–${Math.max(...calDays)} d)`);
  await cal.getByRole("button", { name: /^Show all \d+, a year out/ }).click();
  await p.waitForTimeout(300);
  const allDays = await p.getByTestId("calendar-item").evaluateAll((els) => els.map((e) => Number(e.dataset.days)));
  check(allDays.length > calDays.length && Math.max(...allDays) > 92 && allDays.every((d) => d >= 0 && d <= 366), `Show all: a year out (${allDays.length} items, to ${Math.max(...allDays)} d)`);
  await cal.getByRole("button", { name: "Show the next three months only" }).click();
  await p.waitForTimeout(200);

  // ── Removed (user 11/24): Funds, Workflows, Recent activity ──
  check((await p.getByTestId("fund-card").count()) === 0 && (await p.getByTestId("lanes").count()) === 0 && (await p.getByTestId("recent-activity").count()) === 0, "no Funds, Workflows or Recent activity sections");
  check((await p.getByTestId("functions-title").innerText()) === "Functions" && (await p.getByRole("navigation", { name: "Functions" }).count()) === 1, "the tab bar is titled Functions");

  // ── Order: Functions (Setup & Maintenance is its last area, 1.1.1); then Actions Needed, Upcoming Events, Asset Watch List ──
  const areaNames = await p.getByTestId("function-areas").getByRole("button").evaluateAll((els) => els.map((e) => e.textContent.replace(/[▾▴\d]/g, "").trim()));
  check(areaNames.at(-1) === "Setup & Maintenance" && (await p.getByTestId("setup-maintenance").count()) === 0, `Setup & Maintenance is the last Functions area, closed by default (${areaNames.join(" | ")})`);
  await FX.openSetup(p);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
  const ys = [];
  for (const id of ["functions-title", "setup-maintenance", "attention", "calendar", "assets-watch"]) ys.push((await p.getByTestId(id).boundingBox())?.y ?? -1);
  check(ys.every((y, i) => y >= 0 && (i === 0 || y > ys[i - 1])), `order: Functions, its Setup & Maintenance row, Actions Needed, Upcoming Events, Asset Watch List (${ys.map(Math.round).join(", ")})`);
  check((await p.getByTestId("home").getByTestId("setup-maintenance").count()) === 0, "Setup & Maintenance is under Functions, not inside the dashboard");
  check(/^Actions Needed/.test(await p.getByTestId("attention").locator("h3").innerText()) && (await p.getByTestId("setup-maintenance").getByRole("button", { name: "New asset" }).count()) === 1, "Actions Needed; Setup & Maintenance holds the quick actions");
  const aw = await p.getByTestId("assets-watch").innerText();
  check(/^Asset Watch List/.test(aw) && /business plan/.test(aw) && !/risk report/i.test(aw) && ((await p.getByTestId("watch-asset").count()) > 0 || /No assets under plan/.test(aw)), `Asset Watch List: plan performance only: ${aw.replace(/\s+/g, " ").slice(0, 140)}`);

  // ── The lease opens its asset on Leases ──
  await att.getByTestId("action-row").filter({ hasText: "Example Tenant Co" }).getByRole("button", { name: /^Open / }).click();
  await p.waitForTimeout(1000);
  const main = await p.locator("main").innerText();
  check((await p.getByTestId("home").count()) === 0 && /Airport Flex Park/.test(main), "an attention item opens its tab on that asset");

  // ── Home returns to the dashboard; quick action ──
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(800);
  await FX.openSetup(p);
  await p.getByTestId("quick-actions").getByRole("button", { name: "New fund setup" }).click();
  await p.waitForTimeout(600);
  check((await p.getByRole("dialog", { name: "New fund" }).count()) === 1, "quick action: New fund setup opens the fund editor");
  await p.getByRole("dialog", { name: "New fund" }).getByRole("button", { name: /Cancel|Close/ }).first().click();
  await p.waitForTimeout(400);
  await FX.openSetup(p);
  const qa = await p.getByTestId("quick-actions").innerText();
  check(["New asset", "New fund setup", "Upload rent roll", "Upload Yardi actuals", "Import marks", "Record capital activity", "New report"].every((x) => qa.includes(x)), "all seven quick actions");

  // ── Working on: the JV only ──
  await p.getByTestId("working-on").selectOption(JV);
  await p.waitForTimeout(1000);
  check(!/Model Fund I/.test(await p.getByTestId("assets-watch").innerText()), "Home follows the Working on picker: the JV's watch list only");
  check(!/Example Tenant Co/.test(await p.getByTestId("attention").innerText()), "and only the JV's attention items");
  check(/Example JV II \(Joint Venture\)/.test(await p.getByTestId("home").locator("p").first().innerText()), "the page says which portfolio it shows");
  // Save bar and leave prompt (user, 11/24): a Save button appears with each
  // change; leaving with unsaved changes asks first (OK saves, Cancel stays).
  check((await p.locator("header").getByText(/Save now/).count()) === 0, "no save button in the header");
  let before = saves;
  await p.getByTestId("attention").getByRole("combobox", { name: /^Status: / }).first().selectOption("Completed");
  await p.waitForTimeout(900);
  check(/Unsaved changes/.test(await p.getByTestId("save-bar").innerText().catch(() => "")) && (await p.getByTestId("save-button").count()) === 1, "an edit shows the Save changes button");
  await p.getByTestId("save-button").click();
  await p.waitForTimeout(800);
  check(saves === before + 1 && /Saved/.test(await p.getByTestId("save-bar").innerText().catch(() => "")), "Save changes saves; the bar says Saved");
  await p.waitForTimeout(3300);
  check((await p.getByTestId("save-bar").count()) === 0, "then the bar goes away");
  // Leaving with unsaved changes: Cancel stays, OK saves and leaves.
  // The edit: reopen the action just completed (its row in Upcoming Events).
  before = saves;
  const cal2 = p.getByTestId("calendar");
  for (const re of [/^Show the past 12 months/, /^Show all/]) { const b = cal2.getByRole("button", { name: re }); if (await b.count()) await b.click(); }
  await p.waitForTimeout(300);
  const reopen = cal2.locator('[data-state="done"]').getByRole("combobox").first();
  await reopen.selectOption({ index: 0 });
  await p.waitForTimeout(900);
  check(/Unsaved changes/.test(await p.getByTestId("save-bar").innerText().catch(() => "")), "reopening it is an unsaved change");
  const prompts = [];
  p.removeAllListeners("dialog");
  p.on("dialog", (d) => { prompts.push(d.message()); return prompts.length === 1 ? d.dismiss() : d.accept(); });
  await FX.openTab(p, /^Pipeline/);
  await p.waitForTimeout(500);
  check(prompts.length === 1 && /unsaved changes/i.test(prompts[0]) && (await p.getByTestId("home").count()) === 1 && saves === before, "leaving with unsaved changes asks; Cancel stays on the page");
  await FX.openTab(p, /^Pipeline/);
  await p.waitForTimeout(1200);
  check(prompts.length === 2 && saves === before + 1 && (await p.getByTestId("home").count()) === 0, "OK saves, then leaves");
  p.removeAllListeners("dialog");
  p.on("dialog", (d) => d.accept());
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(800);
  check((await p.getByTestId("home").count()) === 1, "nothing unsaved: Home goes straight back");
  // The Baywise logo returns to the landing page too
  await FX.openTab(p, /^Pipeline/);
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Baywise: go to Home" }).click();
  await p.waitForTimeout(600);
  check((await p.getByTestId("home").count()) === 1, "the Baywise logo returns to Home");
  await p.screenshot({ path: `${S}/home.png`, fullPage: true });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
