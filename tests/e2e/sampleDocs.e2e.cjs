// Sample data → Add sample documents (user, 11/25): the owner's click
// uploads the fictional Model Fund I documents with their abstracts; a
// second click adds nothing. Fictional fixture; Supabase mocked.
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
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
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
  const sm = p.getByTestId("sample-data-menu");
  const openMenu = async () => { if (!(await sm.isVisible())) { await FX.openSetup(p); await p.waitForTimeout(200); } await sm.getByRole("button", { name: /Sample data/ }).click(); await p.waitForTimeout(200); };
  await openMenu();
  await sm.getByRole("menuitem", { name: /Add sample documents/ }).click();
  for (let i = 0; i < 60 && !alerts.some((a) => /^Added|^Couldn't add/.test(a)); i++) await p.waitForTimeout(500);
  const done = alerts.find((a) => /^Added|^Couldn't add/.test(a)) ?? "";
  check(/^Added 43 sample documents/.test(done), `the upload finished: ${done.replace(/\n/g, " / ").slice(0, 400)}`);
  check(leases.length === 9 && leaseAbs.length === 9, `9 leases, each with its abstract (${leases.length}, ${leaseAbs.length})`);
  check(docs.length === 34 && dealAbs.length === 26, `26 fund, asset and sale documents, each with its abstract, + 8 credit reports (${docs.length}, ${dealAbs.length})`);
  check(docs.filter((d) => /^\[leasing:tenant:[a-z0-9-]+\] (Credit screening report|Credit report|Credit assessment memo): /.test(d.title ?? "")).length === 8, "1.1.9: the 8 sample credit reports, each on its asset tagged to its tenant");
  check(docs.filter((d) => !d.deal_id && d.fund_name === "Model Fund I").length === 2, "the LPA and PPM on Model Fund I");
  check(docs.filter((d) => /^\[sale:/.test(d.title ?? "")).length === 7 && !docs.some((d) => /closing statement/i.test(d.title ?? "") && /^\[sale:/.test(d.title ?? "")), "1.1.13: 7 sale documents filed on the three sales in progress (BOVs, offer letters, one contract; no closing statement)");
  const cert = docs.find((d) => (d.files ?? []).some((f) => f.name === "airport-flex-insurance-blue-mesa-fulfillment.pdf"));
  check(cert?.lease_id && cert.lease_id === leases.find((l) => l.tenant === "Blue Mesa Fulfillment")?.id, "the tenant's certificate is linked to its lease (a tenant on the rent roll)");
  check(uploads.length === 34 + 12, `every PDF stored (${uploads.length}: 26 documents + 8 credit reports + 12 lease files)`);
  // A second click adds nothing
  alerts.length = 0;
  await openMenu();
  await sm.getByRole("menuitem", { name: /Add sample documents/ }).click();
  for (let i = 0; i < 40 && !alerts.some((a) => /^Added|^Couldn't add/.test(a)); i++) await p.waitForTimeout(500);
  check(/^Added 0 sample documents/.test(alerts.find((a) => /^Added/.test(a)) ?? "") && docs.length === 34 && leases.length === 9, "a second click adds nothing (all skipped as already uploaded)");
  // The library shows them
  await FX.openTab(p, "Documents");
  await p.waitForTimeout(1500);
  check((await p.getByTestId("doc-row").count()) === 43, `Library → Documents lists all 43 (${await p.getByTestId("doc-row").count()})`);
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  check(["Route 9 Small Bay", "Harbor Light Industrial", "Mill Creek Business Park"].every((n) => sd?.deals?.find((d) => d.inputs?.propertyName === n)?.inputs?.dispositions?.length === 1), "a sample sale on each of the three assets with sale documents");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
