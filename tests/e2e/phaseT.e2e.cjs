// Phase T Playwright: Property Management group: four tabs, editable
// sections on one asset, whole-fund view, summaries, key dates on Home,
// Excel. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
data.deals = data.deals.map((d) => (d.id === "sample-deal-2" ? { ...d, inputs: { ...d.inputs, propertyMgmt: { contracts: [{ id: "k1", vendor: "Example Landscaping", service: "Landscaping", start: "2026-01-01", end: plus(50), annualCost: 18000, autoRenew: true, noticeDays: 30, yardiContract: "" }] } } } : d));
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
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 }, acceptDownloads: true });
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
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);

  const groups = await p.getByRole("group").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter(Boolean));
  check(groups.indexOf("Property Management") === groups.indexOf("Asset Management") + 1, "a Property Management group after Asset Management");
  const pm = p.getByRole("group", { name: "Property Management" });
  check((await pm.getByRole("button").allInnerTexts()).join() === "Property Taxes,Insurance,Property Condition,Service Contracts", "four tabs");

  // ── Taxes ──
  await pm.getByRole("button", { name: "Property Taxes" }).click();
  await p.waitForTimeout(600);
  const tax = p.getByTestId("pm-taxes");
  const bills = p.getByTestId("pm-section-bills");
  await bills.getByRole("button", { name: "+ Add" }).click();
  const br = p.getByTestId("pm-row-bills").first();
  await br.getByLabel("Parcel").fill("001-234-56");
  await br.getByLabel("Tax year").fill(String(new Date().getFullYear()));
  await br.getByLabel("Installment").fill("2nd half");
  await br.getByLabel("Amount ($)").fill("31000");
  await br.getByLabel("Due").fill(plus(20));
  await p.waitForTimeout(400);
  check(/billed \$31,000 · paid \$0 · unpaid \$31,000/.test(await p.getByTestId("pm-summary").innerText()), "tax summary: billed, paid, unpaid");
  check(/Property tax 2nd half due \$31,000/.test(await p.getByTestId("pm-dates").innerText()), "the bill is on the tab's coming-up list");
  await p.getByTestId("pm-section-appeals").getByRole("button", { name: "+ Add" }).click();
  const ar = p.getByTestId("pm-row-appeals").first();
  await ar.getByLabel("Outcome").selectOption("Won");
  await ar.getByLabel("Savings ($)").fill("4500");
  await p.waitForTimeout(300);
  check(/appeal savings \$4,500/.test(await p.getByTestId("pm-summary").innerText()), "appeal savings");

  // ── Insurance ──
  await pm.getByRole("button", { name: "Insurance" }).click();
  await p.waitForTimeout(600);
  await p.getByTestId("pm-section-policies").getByRole("button", { name: "+ Add" }).click();
  const pr = p.getByTestId("pm-row-policies").first();
  await pr.getByLabel("Carrier").fill("Example Mutual");
  await pr.getByLabel("Limit ($)").fill("15000000");
  await pr.getByLabel("Annual premium ($)").fill("42000");
  await pr.getByLabel("Renews").fill(plus(400));
  await p.getByTestId("pm-section-claims").getByRole("button", { name: "+ Add" }).click();
  await p.getByTestId("pm-row-claims").first().getByLabel("Claimed ($)").fill("12000");
  await p.waitForTimeout(300);
  check(/1 policy · premium \$42,000\/yr · property limit \$15,000,000 · 1 open claim/.test(await p.getByTestId("pm-summary").innerText()), "insurance summary");

  // ── Condition ──
  await pm.getByRole("button", { name: "Property Condition" }).click();
  await p.waitForTimeout(600);
  await p.getByTestId("pm-section-items").getByRole("button", { name: "+ Add" }).click();
  const ir = p.getByTestId("pm-row-items").first();
  await ir.getByLabel("System").selectOption("Fire / life safety");
  await ir.getByLabel("Finding", { exact: true }).fill("Sprinkler heads corroded");
  await ir.getByLabel("Cost ($)").fill("9500");
  await p.waitForTimeout(300);
  check(/1 open of 1 · open cost \$9,500 \(Immediate \$9,500\)/.test(await p.getByTestId("pm-summary").innerText()), "condition: open cost by urgency");

  // ── Contracts: whole-fund view ──
  await pm.getByRole("button", { name: "Service Contracts" }).click();
  await p.waitForTimeout(600);
  check((await p.getByTestId("pm-row-contracts").count()) === 0, "this asset has no contracts");
  await p.getByTestId("pm-contracts").getByRole("button", { name: /^All assets|^All of/ }).click();
  await p.waitForTimeout(300);
  check((await p.getByTestId("pm-row-contracts").count()) === 1 && /Route 9 Small Bay/.test(await p.getByTestId("pm-row-contracts").innerText()), "whole-fund view lists every asset's contracts");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("pm-contracts").getByRole("button", { name: "Excel" }).click()]);
  check(/^contracts-.*\.xlsx$/.test(dl.suggestedFilename()), "Excel export");

  // ── Home ──
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.waitForTimeout(800);
  const more = p.getByTestId("attention").getByRole("button", { name: /^Show all/ });
  if (await more.count()) await more.click();
  const att = await p.getByTestId("attention").innerText();
  check(/^Repair/m.test((await p.getByTestId("attention").locator("li").first().innerText())), "an immediate repair leads the attention list");
  check(/Property tax 2nd half due \$31,000 \(Airport Flex Park\)/.test(att) && /Landscaping contract: notice deadline \(auto-renews\), Example Landscaping \(Route 9 Small Bay\)/.test(att) && /Immediate repair open: Fire \/ life safety/.test(att), "Home: tax bill, contract notice and immediate repair on the attention list");
  check(!/Property policy renews/.test(att), "a renewal more than 60 days out isn't");
  check(/Insurance premium \(annual\)\s*\$42K/.test((await p.getByTestId("lane").filter({ hasText: "Property Management" }).innerText()).replace(/\n/g, " ")), "Home: a Property Management lane");

  // ── Saved ──
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  const pmS = sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs?.propertyMgmt;
  check(pmS?.bills?.[0]?.amount === 31000 && pmS?.appeals?.[0]?.savings === 4500 && pmS?.policies?.[0]?.carrier === "Example Mutual" && pmS?.claims?.length === 1 && pmS?.items?.[0]?.system === "Fire / life safety", "saved on the asset: every section");
  await p.screenshot({ path: `${S}/property-mgmt.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
