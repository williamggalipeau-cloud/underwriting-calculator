// Phase D Playwright: critical dates, risk flags, exports, tenant credit, Asset Summary (mocked Supabase).
const { chromium } = require("playwright");
const fs = require("fs");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const R = FX.R;
const role = process.env.ROLE || "owner";
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
const dir = R + "/tests/fixtures/sample-leases/abstracts";
const DEAL = { "02": "sample-deal-1", "03": "sample-deal-2", "04": "sample-deal-3", "05": "sample-deal-4", "06": "sample-deal-5", "07": "sample-deal-6", "08": "sample-deal-7", "09": "sample-deal-8", "10": "sample-deal-9", "12": FX.SAVED_IDS[0], "13": FX.SAVED_IDS[1], "14": FX.SAVED_IDS[2] };
const leases = fs.readdirSync(dir).sort().map((f, i) => {
  const a = JSON.parse(fs.readFileSync(`${dir}/${f}`));
  return { id: `00000000-0000-0000-0000-0000000000${String(10 + i)}`, workspace_id: "w1", deal_id: DEAL[f.slice(0, 2)], unit_ids: [], tenant: a.fields.find((x) => x.key === "tenant").value.split(",")[0], title: "", files: [{ path: `w1/${DEAL[f.slice(0, 2)]}/L${i}/a.pdf`, name: f.replace(".json", ".pdf"), size: 9000, kind: "lease" }], status: "abstracted", abstract: a, created_at: "2026-11-22T00:00:00Z", abstracted_at: "2026-11-22T00:00:00Z" };
});
const credit = [];
const exp = JSON.parse(fs.readFileSync(R + "/tests/fixtures/tenant-credit/expected.json"));
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const uploads = [];
let creditReads = 0;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = decodeURIComponent(req.url()); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) body = String(++ws.version);
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role, email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/leases/")) { uploads.push(u.replace(/^.*object\/leases\//, "")); body = JSON.stringify({ Key: "leases/x" }); }
    else if (u.includes("/lease_credit_documents")) {
      if (req.method() === "POST") {
        const row = { id: "c" + credit.length, created_at: new Date().toISOString(), uploaded_by_email: "t@example.com", figures: {}, ...JSON.parse(req.postData()) };
        credit.push(row);
        body = acc.includes("vnd.pgrst.object") ? JSON.stringify(row) : JSON.stringify([row]);
      } else if (req.method() === "PATCH") {
        const id = u.match(/id=eq\.([^&]+)/)[1]; const row = credit.find((c) => c.id === id); Object.assign(row, JSON.parse(req.postData()));
        body = acc.includes("vnd.pgrst.object") ? JSON.stringify(row) : JSON.stringify([row]);
      } else { creditReads++; body = role === "viewer" ? "[]" : JSON.stringify(credit); }
    } else if (u.includes("/lease_documents")) {
      if (req.method() === "PATCH") {
        const id = u.match(/id=eq\.([^&]+)/)[1]; const l = leases.find((x) => x.id === id); Object.assign(l, JSON.parse(req.postData()));
        body = acc.includes("vnd.pgrst.object") ? JSON.stringify(l) : JSON.stringify([l]);
      } else body = JSON.stringify(leases);
    }
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");
  await FX.openTab(p, "Leases");
  await p.waitForTimeout(1200);

  if (role === "viewer") {
    check((await main.getByRole("button", { name: /Tenant credit/ }).count()) === 0, "viewer: no Tenant credit section");
    check(creditReads === 0, "viewer: credit documents never requested");
    await main.getByRole("tab", { name: "Critical dates" }).click();
    check(!(await main.getByTestId("critical-dates").innerText()).includes("Financial statements due"), "viewer: no statements-due rows");
    console.log("errors", errs); console.log(fails ? `${fails} FAILED` : "ALL PASS"); await b.close(); process.exitCode = fails ? 1 : 0; return;
  }

  // Whole fund → Critical dates
  await main.getByRole("button", { name: /Whole fund/ }).click();
  await main.getByRole("tab", { name: "Critical dates" }).click();
  await p.waitForTimeout(600);
  const cdv = main.getByTestId("critical-dates");
  const txt = await cdv.innerText();
  check(txt.includes("Route 9 Small Bay") && txt.includes("Renewal notice deadline"), "fund critical dates include Route 9's renewal notice");
  check((await cdv.locator("tr[data-status=soon]").count()) >= 5, `amber rows within 90 days: ${await cdv.locator("tr[data-status=soon]").count()}`);
  await cdv.getByLabel("Show").selectOption("all");
  await p.waitForTimeout(300);
  check((await cdv.locator("tr[data-status=past]").count()) >= 10, `all dates incl. history: red past rows ${await cdv.locator("tr[data-status=past]").count()}`);
  await cdv.getByLabel("Show").selectOption("upcoming");
  check(txt.includes("Eastside Distribution Hub") && txt.includes("Riverside Commerce Park"), "saved deals' leases included");
  await cdv.getByLabel("Type").selectOption("renewal_notice");
  await p.waitForTimeout(300);
  const rnRows = await cdv.locator("tbody tr").count();
  check(rnRows >= 4 && rnRows <= 8, `filter by type: ${rnRows} renewal notices`);
  await cdv.getByLabel("Asset").selectOption("Route 9 Small Bay");
  check((await cdv.locator("tbody tr").count()) === 1, "filter by asset: one row");
  await cdv.getByLabel("Asset").selectOption("all"); await cdv.getByLabel("Type").selectOption("all");
  const [dl1] = await Promise.all([p.waitForEvent("download"), cdv.getByRole("button", { name: "Export to Excel" }).click()]);
  const x1 = S + "/d_dates.xlsx"; await dl1.saveAs(x1);
  check(fs.statSync(x1).size > 3000 && dl1.suggestedFilename().includes("critical-dates"), `critical dates Excel: ${dl1.suggestedFilename()}`);
  await p.screenshot({ path: S + "/d_dates.png" });

  // Risk flags
  await main.getByRole("tab", { name: "Risk flags" }).click();
  await p.waitForTimeout(500);
  const rfv = main.getByTestId("risk-flags");
  const nAll = await rfv.getByTestId("risk-row").count();
  check(nAll === 48, `48 risk flags across the fund: ${nAll}`);
  await rfv.getByLabel("Type").selectOption("relocation");
  check((await rfv.getByTestId("risk-row").count()) === 2, "relocation filter: 2");
  await rfv.getByLabel("Type").selectOption("all");
  await rfv.getByLabel("Severity").selectOption("high");
  const nHigh = await rfv.getByTestId("risk-row").count();
  check(nHigh > 0 && nHigh < nAll, `high only: ${nHigh}`);
  const [dl2] = await Promise.all([p.waitForEvent("download"), rfv.getByRole("button", { name: "Export to Excel" }).click()]);
  check(dl2.suggestedFilename().includes("risk-flags"), `risk flags Excel: ${dl2.suggestedFilename()}`);
  const [dl3] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), rfv.getByRole("button", { name: "Abstraction report (PDF)" }).click()]);
  const pdf = S + "/d_report.pdf"; await dl3.saveAs(pdf);
  check(fs.readFileSync(pdf).slice(0, 4).toString() === "%PDF" && dl3.suggestedFilename().includes("Model-Fund-I") || dl3.suggestedFilename().includes("lease-abstraction-report"), `fund PDF report: ${dl3.suggestedFilename()} (${Math.round(fs.statSync(pdf).size / 1024)} KB)`);
  await p.screenshot({ path: S + "/d_risks.png" });

  // Tenant credit on Airport Flex (this asset)
  await main.getByRole("button", { name: "Airport Flex Park", exact: true }).click();
  await main.getByRole("tab", { name: /^Leases/ }).click();
  await p.waitForTimeout(500);
  const card = main.locator("div.rounded-xl", { hasText: "02-airport-flex-park-desert-aero.pdf" }).first();
  await card.getByRole("button", { name: /Tenant credit/ }).click();
  const tcp = card.getByTestId("tenant-credit");
  check((await tcp.innerText()).includes("No credit report or financial statements on file"), "empty: missing flag");
  for (const d of exp.documents.filter((x) => x.lease.startsWith("02"))) {
    await tcp.getByRole("button", { name: /Add credit report/ }).click();
    await tcp.getByLabel("Document type").selectOption(d.kind);
    await tcp.getByLabel("Whose").selectOption(d.subject);
    if (d.subject === "guarantor") await tcp.getByLabel("Guarantor name").fill(d.subject_name);
    await tcp.getByLabel("Source").fill(d.source);
    if (d.kind === "credit_report") await tcp.getByLabel("Report date").fill(d.report_date);
    else await tcp.getByLabel("Period end").fill(d.period_end);
    await tcp.getByLabel("Credit document PDF").setInputFiles(R + "/tests/fixtures/tenant-credit/" + d.file);
    for (const [k, v] of Object.entries(d.figures)) {
      const label = { score: "Credit score", rating: "Rating", revenue: "Revenue", netIncome: "Net income", ebitda: "EBITDA", currentAssets: "Current assets", currentLiabilities: "Current liabilities", totalDebt: "Total debt", equity: "Equity" }[k];
      await tcp.getByLabel(label, { exact: true }).fill(String(v));
    }
    await tcp.getByRole("button", { name: "Save credit document" }).click();
    await p.waitForTimeout(700);
  }
  check(credit.length === 5 && uploads.filter((x) => /\/credit\//.test(x)).length === 5, `5 documents saved, files under credit/ (${uploads[0]})`);
  const flags = await tcp.getByTestId("credit-flag").allInnerTexts();
  check(flags.some((f) => /score fell from 78/.test(f)) && flags.some((f) => /Debt \/ equity rose from 0\.60/.test(f)) && flags.some((f) => /guarantor statements/.test(f)), `flags: ${flags.join(" | ")}`);
  check((await tcp.innerText()).includes("Current ratio 1.31x"), "current ratio calculated from its parts");
  await p.screenshot({ path: S + "/d_credit.png" });

  // Apply rating needs a linked unit: link the lease to the first Airport Flex unit
  await card.getByRole("button", { name: "Edit tenant / units" }).click();
  await p.waitForTimeout(500);
  await card.getByRole("checkbox").first().check();
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await p.waitForTimeout(1000);
  // (the mock doesn't persist unit_ids; skip if the button isn't offered)
  const applyBtn = tcp.getByRole("button", { name: /Apply rating/ });
  check((await applyBtn.count()) === 1, "Apply rating offered once the lease is linked to a unit");
  await applyBtn.click(); await p.waitForTimeout(800);
  check((await tcp.innerText()).includes("credit rating: Moderate risk (3 of 5) ✓"), "latest rating applied to the unit's Credit rating");

  // Asset Summary: Leases column and Details
  await FX.openTab(p, "Asset Summary");
  await p.waitForTimeout(1500);
  const head = await main.locator("thead").innerText();
  check(head.includes("Leases abstracted"), "Asset Summary has a Leases abstracted column");
  const row = main.locator("tbody tr", { hasText: "Route 9 Small Bay" }).first();
  check((await row.innerText()).includes("1 of 1"), "Route 9: 1 of 1");
  await row.getByRole("button", { name: "Details" }).click();
  await p.waitForTimeout(600);
  const al = await main.getByTestId("asset-leases").innerText();
  check(al.includes("1 of 1") && al.includes("11/30/26") && /Risk flags:\s*\d/.test(al), `details: ${al.replace(/\s+/g, " ").slice(0, 160)}`);
  await main.getByTestId("asset-leases").getByRole("button", { name: "Open Leases tab" }).click();
  await p.waitForTimeout(800);
  check((await main.innerText()).includes("Cascade Cabinet Works"), "Open Leases tab goes to Route 9's leases");
  await p.screenshot({ path: S + "/d_asset.png" });

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
