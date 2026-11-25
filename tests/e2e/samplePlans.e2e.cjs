// 1.1.2 (user, 11/25): Sample data → Add sample business plans. The owner's
// click gives each Model Fund I sample asset a fictional plan and actuals, and
// the Dashboard's Asset Watch List shows Route 9 At Risk and Harbor Light Off
// Plan. Fictional fixture; Supabase mocked.
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

  // The plan opens from the Watch List: Asset Business Plan on Route 9, with actuals
  await p.getByRole("button", { name: "Open Route 9 Small Bay" }).click();
  await p.waitForTimeout(1200);
  const main = await p.locator("main").innerText();
  check(/Route 9 Small Bay/.test(main) && /Net operating income/.test(main), "Open → Route 9's Asset Business Plan, with its budget vs. actual");

  check(errs.length === 0, `no page errors ${errs.join(" | ")}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exit(fails ? 1 : 0);
})();
