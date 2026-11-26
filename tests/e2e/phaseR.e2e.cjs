// Phase R Playwright: Leasing tab: prospects and renewals with net effective
// rent and vs. the business plan, fund view, rent comps by hand and upload
// (CoStar-style), filters, set market rent from comps, Excel. Fictional
// fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
data.deals = data.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, rentPerSF: 11, units: [
  { id: "u1", name: "Suite A", squareFeet: 10000, leaseStatus: "vacant" },
  { id: "u2", name: "Suite B", squareFeet: 14000, leaseStatus: "occupied", currentRentPSF: 10, leaseEnd: plus(120), tenantName: "Example Co" },
], businessPlan: { revisions: [{ n: 1, at: "2026-01-30T00:00:00Z", plan: { leasing: [{ unitId: "u1", action: "Lease up", targetRentPSF: 12, downtimeMonths: 6, tiPSF: 8 }, { unitId: "u2", action: "Renew", targetRentPSF: 10.3, downtimeMonths: 0, tiPSF: 2 }] } }] } } } : d));
data.activeDealId = "sample-deal-1";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
const docs = [];
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const CSV = [
  "Building Address,City,Submarket,Tenant Name,SF Leased,Starting Rent,Sign Date,Lease Term,Free Rent,TI Allowance,Lease Type",
  "100 Example Way,Reno,Airport,Fictional Parts,12000,11.50,2026-03-15,60,2,5,NNN",
  "200 Sample Rd,Reno,Airport,Example Freight,30000,10.25,2025-09-01,84,4,8,NNN",
  "300 Model St,Sparks,I-80,Sample Supply,8000,12.75,2026-06-01,36,1,3,NNN",
].join("\n");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1700, height: 1200 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/storage/v1/object/sign/")) body = JSON.stringify({ signedURL: "/object/sign/x?token=t" });
    else if (u.includes("/storage/v1/object/")) body = JSON.stringify({ Key: "x" });
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), status: "uploaded", ...JSON.parse(req.postData()) }; docs.push(row); body = acc.includes("vnd.pgrst.object") ? JSON.stringify(row) : JSON.stringify([row]); }
      else body = JSON.stringify(docs);
    }
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
  await FX.openArea(p, "Debt");
  const am = p.getByRole("group", { name: "Asset Management" });
  const tabs = await am.getByRole("button").allInnerTexts();
  check(tabs.indexOf("Tenant Credit") === tabs.indexOf("Leases") + 1 && tabs.indexOf("Active Leasing") === tabs.indexOf("Leases") + 2, "Leases, then Tenant Credit (1.1.8), then Active Leasing");
  await FX.openTab(p, "Active Leasing");
  await p.waitForTimeout(800);
  const lp = p.getByTestId("leasing-pipeline");

  // ── A prospect for the vacant unit ──
  await lp.getByRole("button", { name: "+ Prospect" }).click();
  await p.waitForTimeout(300);
  const row = p.getByTestId("prospect-row").first();
  check((await row.getByLabel("Unit").inputValue()) === "u1", "a new prospect starts on the vacant unit");
  await row.getByLabel("Prospect", { exact: true }).fill("Fictional Logistics");
  await row.getByLabel("Broker").fill("Example Leasing");
  await row.getByLabel("Prospect stage").selectOption("proposal");
  await row.getByLabel("SF", { exact: true }).fill("10000");
  await row.getByLabel("Proposed rent").fill("11.4");
  await row.getByLabel("Term", { exact: true }).fill("60");
  await row.getByLabel("Free months").fill("3");
  await row.getByLabel("TI per SF").fill("10");
  await row.getByLabel("Expected start").fill(plus(240));
  await p.waitForTimeout(400);
  check((await row.getByTestId("prospect-ner").innerText()) === "$8.83", `net effective rent: ${await row.getByTestId("prospect-ner").innerText()}`);
  const vp = await row.getByTestId("prospect-vs-plan").innerText();
  check(/-5\.0%/.test(vp) && /plan \$12\.00/.test(vp), "5% below the plan's target rent");
  check(/mo/.test(await row.innerText()), "downtime against the plan");

  // ── A renewal ──
  await lp.getByRole("button", { name: "+ Renewal" }).click();
  await p.waitForTimeout(300);
  const ren = p.getByTestId("prospect-row").nth(1);
  check((await ren.getByLabel("Unit").inputValue()) === "u2" && (await ren.getByLabel("Prospect", { exact: true }).inputValue()) === "Example Co" && /Renewal/.test(await ren.innerText()), "a renewal starts on the next expiring lease, with its tenant");
  await p.getByLabel("Show signed and lost").check();
  await ren.getByLabel("Prospect stage").selectOption("lost");
  await ren.getByLabel("Lost reason").fill("Relocating");
  await p.getByLabel("Show signed and lost").uncheck();
  await p.waitForTimeout(300);
  check((await p.getByTestId("prospect-row").count()) === 1, "lost prospects hide unless shown");
  check(/Proposal 1/.test(await lp.innerText()) && /Lost 1/.test(await lp.innerText()), "counts by stage");

  // ── Fund view ──
  await p.getByRole("button", { name: /^All assets|^All of/ }).click();
  await p.waitForTimeout(300);
  check(/Airport Flex Park/.test(await p.getByTestId("prospect-row").first().innerText()) && (await p.getByTestId("rent-comps").count()) === 0, "whole-fund view lists prospects by asset");
  await p.getByRole("button", { name: "Airport Flex Park", exact: true }).click();

  // ── Rent comps ──
  const rc = p.getByTestId("rent-comps");
  await rc.getByTestId("rent-comp-file").setInputFiles({ name: "costar-lease-comps.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await p.waitForTimeout(500);
  check(/Rent \(\$\/SF\/yr\) ← "Starting Rent"/.test(await p.getByTestId("rent-comp-mapping").innerText()), "upload: columns matched and shown");
  await p.getByTestId("rent-comp-mapping").getByRole("button", { name: "Import" }).click();
  await p.waitForTimeout(400);
  check(/3 added/.test(await p.getByTestId("leasing-msg").innerText()) && (await p.getByTestId("rent-comp-row").count()) === 3, "three comps imported");
  await rc.getByRole("button", { name: "+ Comp" }).click();
  await p.waitForTimeout(300);
  check((await p.getByTestId("rent-comp-row").count()) === 4, "a comp added by hand");
  await p.getByTestId("rent-comp-row").nth(3).getByLabel("Use comp").uncheck();
  await rc.getByLabel("Submarket filter").fill("airport");
  await p.waitForTimeout(300);
  const stats = await p.getByTestId("rent-comp-stats").innerText();
  check((await p.getByTestId("rent-comp-row").count()) === 2 && /Comps \(2\): avg \$10\.6/.test(stats) && /In place \$10\.00/.test(stats), `filters and stats: ${stats.slice(0, 80)}`);
  await rc.getByRole("button", { name: "Set market rent from comps" }).click();
  await p.waitForTimeout(400);
  check(/model market rent \$10\.6\d/.test(await p.getByTestId("rent-comp-stats").innerText()), "market rent set from the comps");

  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByTestId("leasing").getByRole("button", { name: "Excel" }).click()]);
  check(/^leasing-.*\.xlsx$/.test(dl.suggestedFilename()), "Excel export");
  const [dp] = await Promise.all([p.waitForEvent("download"), p.getByTestId("leasing").getByRole("button", { name: "PDF", exact: true }).click()]);
  check(/^leasing-.*\.pdf$/.test(dp.suggestedFilename()), "PDF export");

  // ── Uploads (part 2) ──
  const pr = p.getByTestId("prospect-row").first();
  await pr.getByLabel("Leasing document type").selectOption("proposal");
  await pr.getByTestId("leasing-file").setInputFiles({ name: "Proposal.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictional") });
  await p.waitForTimeout(1500);
  const pid = (await (async () => { const sd0 = docs.at(-1); return sd0?.title ?? ""; })());
  check(docs.length === 1 && docs[0].doc_type === "other" && /^\[leasing:lp-[^\]]+\] Proposal: Proposal\.pdf$/.test(pid) && docs[0].deal_id === "sample-deal-1", "a proposal on the prospect (filed as Other, prospect in the title)");
  check(/Proposal: Proposal\.pdf/.test(await pr.innerText()), "and listed on the prospect");
  const cbox = p.getByTestId("rent-comps").getByTestId("leasing-docs");
  await cbox.getByLabel("Leasing document type").selectOption("comps");
  await cbox.getByTestId("leasing-file").setInputFiles({ name: "Comp report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictional") });
  await p.waitForTimeout(1500);
  check(docs.at(-1).title === "[leasing:comps] Rent comp report: Comp report.pdf" && /Rent comp report: Comp report\.pdf/.test(await cbox.innerText()), "a rent comp report on the comps section");

  // ── Saved ──
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  const inp = sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs;
  check(inp?.leasing?.prospects?.length === 2 && inp.leasing.prospects[0].tenant === "Fictional Logistics" && inp.leasing.prospects[1].lostReason === "Relocating", "saved on the asset: prospects");
  check(inp?.leasing?.comps?.length === 4 && inp.leasing.compMapping?.rentPSF === "Starting Rent" && inp.rentPerSF > 10.6 && inp.rentPerSF < 10.7, "saved: comps, the remembered columns and the market rent");
  await p.screenshot({ path: `${S}/leasing.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
