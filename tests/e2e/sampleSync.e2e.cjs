// 1.1.12 (user, 11/27: "doing this manually is NOT an option"): when an owner
// opens a firm whose Model Fund I sample material is behind, Baywise adds it
// by itself: tenant credit and aged rent, the sample documents and credit
// reports, and the GP partners. No clicks. A second open adds nothing.
// Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
const docs = [], leases = [], uploads = [], dealAbs = [], leaseAbs = [];
let saved = null, fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => { localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v); window.__baywiseSampleSync = true; }, JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    const one = (x) => (acc.includes("vnd.pgrst.object") ? JSON.stringify(x) : JSON.stringify([x]));
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); ws.data = saved.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/rpc/save_deal_abstract")) { dealAbs.push(JSON.parse(req.postData())); body = '"abstracted"'; }
    else if (u.includes("/rpc/save_lease_abstract")) { leaseAbs.push(JSON.parse(req.postData())); body = '"abstracted"'; }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/")) { if (req.method() === "POST" || req.method() === "PUT") uploads.push(u); body = JSON.stringify({ Key: "x" }); }
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; docs.push(row); body = one(row); }
      else body = JSON.stringify(docs);
    } else if (u.includes("/lease_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; leases.push(row); body = one(row); }
      else body = JSON.stringify(leases);
    } else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
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
  // Nothing is clicked from here on.
  const notice = () => p.getByText(/Model Fund I sample data updated:/).first();
  for (let i = 0; i < 120 && !(await notice().isVisible().catch(() => false)); i++) await p.waitForTimeout(500);
  const msg = (await notice().innerText().catch(() => "")) || "";
  check(/tenant credit and aged rent, 49 sample documents and \d+ GP agreements? added/.test(msg), `the update ran by itself: ${msg.slice(0, 200)}`);
  check(leases.length === 9 && leaseAbs.length === 9, `9 leases with abstracts (${leases.length}, ${leaseAbs.length})`);
  const gpa = docs.filter((d) => /^\[gp-agreement:/.test(d.title ?? ""));
  const credit = docs.filter((d) => /^\[leasing:tenant:/.test(d.title ?? ""));
  check(credit.length === 8 && gpa.length >= 1 && docs.length === 40 + gpa.length, `8 credit reports and ${gpa.length} GP agreement(s) among ${docs.length} documents`);
  for (let i = 0; i < 60 && !(saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"]?.sampleDataVersion; i++) await p.waitForTimeout(500);
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.funds?.["Model Fund I"]?.sampleDataVersion === 2, `the fund records the sample data version, saved without a click (${sd?.funds?.["Model Fund I"]?.sampleDataVersion})`);
  const withCredit = (sd?.deals ?? []).filter((d) => (d.inputs?.units ?? []).some((u) => u.credit)).length;
  check(withCredit >= 5 && sd?.gpPartners?.partners?.length === 2 && gpa.length === 2 && (sd?.gpPartners?.agreements?.length ?? 0) === 0, `tenant credit on ${withCredit} assets; 2 GP partners listed, their 2 agreements filed to check (nothing applied to the fund)`);
  check((sd?.auditLog ?? []).some((e) => /sample data updated automatically/.test(JSON.stringify(e))), "logged in the change log");
  // A second open: already current, so nothing is added.
  const nDocs = docs.length, nUp = uploads.length;
  await p.reload();
  await p.waitForTimeout(9000);
  check(docs.length === nDocs && uploads.length === nUp && !(await notice().isVisible().catch(() => false)), "opening again adds nothing");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
