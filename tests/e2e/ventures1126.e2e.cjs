// 1.1.26 Playwright: the sample joint venture and separate account on the
// screens: the Track Record, Firm Economics, GP Partners, the Pipeline and
// the Dashboard open with them and show their figures, with no page errors.
// Fictional fixture; Supabase mocked. Today is fixed at 2026-11-27.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
// The two sample portfolios, built as the load builds them, added to the fixture.
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const V = j(R + "/lib/sampleVentures.js");
const { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");
const ven = V.buildSampleVentures({ baseInputs: DEFAULT_INPUTS, gp: data.gpPartners, todayISO: "2026-11-27" });
data.deals = [...data.deals, ...ven.deals];
data.funds = { ...data.funds, ...ven.funds };
data.valuations = { ...(data.valuations ?? {}), ...ven.valuations };
data.gpPartners = ven.gp;
data.pipeline = { ...(data.pipeline ?? {}), deals: [...(data.pipeline?.deals ?? []), ...ven.pipeline] };
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  await ctx.addInitScript((v) => { localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); }, JSON.stringify(sess));
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
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);

  const text = async (sel = "main") => (await p.locator(sel).innerText()).replace(/\s+/g, " ");
  // ── Dashboard ──
  const home = await text("body");
  check(/Sample Industrial Venture I/.test(home) && /Sample Separate Account A/.test(home), "the Dashboard shows both portfolios");

  // ── Track Record: the sold asset ──
  await FX.openTab(p, "Track Record");
  await p.waitForTimeout(1500);
  const tr = await text();
  check(/Example Gateway Industrial Park/.test(tr) && /6\/30\/2026/.test(tr) && /6\/15\/2022/.test(tr), `the Track Record lists the asset sold 6/30/2026 (${tr.slice(0, 160)})`);

  // ── Firm Economics and GP Partners ──
  await FX.openTab(p, "Firm Economics");
  await p.waitForTimeout(2500);
  const fe = await text();
  check(/Sample Industrial Venture I/.test(fe) && /Sample Separate Account A/.test(fe), "Firm Economics lists both portfolios");
  await FX.openTab(p, "GP Partners");
  await p.waitForTimeout(1200);
  const gp = await text();
  check(/Placeholder Capital Partners LP/.test(gp) && /Demo Holdings Family Office/.test(gp) && /Sample Industrial Venture I/.test(gp), "GP Partners lists the two outside partners and their portfolios");

  // ── Pipeline ──
  await FX.openTab(p, "Pipeline");
  await p.waitForTimeout(1200);
  const pl = await text();
  check(/Example Ironworks Distribution Center/.test(pl) && /Example Prairie Commerce Park/.test(pl), "the Pipeline lists the two joint venture deals");

  // ── Rent Roll of an asset owned since 2023: leases in effect today ──
  await FX.openTab(p, "Assets").catch(() => {});
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 3).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
