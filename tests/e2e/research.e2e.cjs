// Acquisitions → Research (11/24) Playwright: Research tab after Fund Impact;
// Comps per asset (the firm list until the first edit); Third-Party research
// by link and by PDF with a summary; all-assets view; Excel and PDF; saved on
// the asset. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// The firm comps list (before 11/24 comps were firm-wide): one fictional comp.
data.comps = { ...data.comps, comps: [{ id: "fc1", name: "Fictional Firm Comp", city: "Reno", state: "NV", saleDate: "2026-03-01", price: 10000000, sf: 50000, pricePSF: 200, capRate: 5.5, adjPct: 0, include: true }] };
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
  await FX.openArea(p, "Pipeline");
  const acq = p.getByRole("group", { name: "Acquisitions" });
  const tabs = await acq.getByRole("button").allInnerTexts();
  check(tabs.indexOf("Research") === tabs.indexOf("Fund Impact") + 1, `Research under Acquisitions: ${tabs.join(", ")}`);
  check((await p.getByRole("group", { name: "Asset Management" }).getByRole("button", { name: "Sales Comps" }).count()) === 0, "Sales Comps is no longer under Asset Management");
  await FX.openTab(p, "Research");
  await p.waitForTimeout(800);
  const rs = p.getByTestId("research");
  check((await p.locator("#asset-picker").count()) === 1, "Research has the Asset dropdown");

  // ── Comps: the firm list until the asset's first edit ──
  check((await rs.getByRole("tab", { name: "Comps" }).getAttribute("aria-selected")) === "true", "opens on Comps");
  check((await p.getByTestId("comps-firm-note").count()) === 1 && /Fictional Firm Comp/.test(await rs.innerText()), "an asset with no comps shows the firm list, with a note");
  await rs.getByRole("button", { name: "Clear" }).click();
  await p.waitForTimeout(300);
  await rs.getByRole("button", { name: "Load example comps to try the tab" }).click();
  await p.waitForTimeout(400);
  check((await p.getByTestId("comps-firm-note").count()) === 0 && !/Fictional Firm Comp/.test(await rs.innerText()), "the first edit saves the asset's own comps");
  const other = await p.locator("#asset-picker option").evaluateAll((os) => os.map((o) => o.value).find((v) => v !== "sample-deal-1" && !v.startsWith("snap:")));
  await p.locator("#asset-picker").selectOption(other);
  await p.waitForTimeout(400);
  check(/Fictional Firm Comp/.test(await p.getByTestId("research").innerText()), "another asset still starts from the firm list");
  await p.locator("#asset-picker").selectOption("sample-deal-1");
  await p.waitForTimeout(400);

  // ── Third-Party: a link with a summary ──
  await p.getByTestId("research").getByRole("tab", { name: "Third-Party" }).click();
  await p.waitForTimeout(300);
  const tp = p.getByTestId("third-party");
  check(/No third-party research yet/.test(await tp.innerText()), "empty to start");
  await tp.getByRole("button", { name: "Add research" }).click();
  const form = p.getByTestId("research-form");
  await form.getByLabel("Research type").selectOption("market");
  await form.getByLabel("Research title").fill("Q3 industrial market report");
  await form.getByLabel("Provider").fill("Example Brokerage");
  await form.getByLabel("Report date").fill("2026-10-15");
  await form.getByLabel("Research link").fill("javascript:alert(1)");
  await form.getByRole("button", { name: "Save research" }).click();
  await p.waitForTimeout(200);
  check(/must start with http/.test(await form.innerText()), "an unsafe link is refused");
  await form.getByLabel("Research link").fill("https://example.com/q3-report");
  await form.getByLabel("Market rent").check();
  await form.getByLabel("Rent growth").check();
  await form.getByLabel("Key figures").fill("Market rent $10.75/SF NNN; vacancy 4.2%");
  await form.getByLabel("Research summary").fill("Supports the market rent and growth assumptions.");
  await form.getByRole("button", { name: "Save research" }).click();
  await p.waitForTimeout(400);
  const row = p.getByTestId("research-row").first();
  check(/Market report/.test(await row.innerText()) && /Example Brokerage/.test(await row.innerText()) && /10\/15\/2026/.test(await row.innerText()) && /Market rent, Rent growth/.test(await row.innerText()), "listed with type, provider, date and assumptions");
  check((await row.getByRole("link", { name: /Open link/ }).getAttribute("href")) === "https://example.com/q3-report", "the link opens the source");

  // ── Third-Party: an uploaded PDF ──
  await tp.getByRole("button", { name: "Add research" }).click();
  await form.getByLabel("Research type").selectOption("appraisal");
  await form.getByLabel("Provider").fill("Example Valuation");
  await form.getByLabel("Exit cap rate").check();
  await form.getByLabel("Research PDF").setInputFiles({ name: "Appraisal.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictional") });
  await form.getByRole("button", { name: "Save research" }).click();
  await p.waitForTimeout(1500);
  check(docs.length === 1 && docs[0].doc_type === "other" && docs[0].deal_id === "sample-deal-1" && /^\[research:rs-[^\]]+\] Appraisal\.pdf$/.test(docs[0].title), `the PDF is filed on the asset as Other: ${docs[0]?.title}`);
  check((await p.getByTestId("research-row").count()) === 2 && /Appraisal\.pdf/.test(await tp.innerText()), "and listed with its file (title from the file name)");
  const sum = await p.getByTestId("research-summary").innerText();
  check(/2/.test(sum) && /1 PDF · 1 link/.test(sum) && /No research yet for: Vacancy \/ downtime/.test(sum), `summary: ${sum.replace(/\n/g, " ")}`);

  // ── Edit, all assets, exports ──
  await p.getByRole("button", { name: "Edit Q3 industrial market report" }).click();
  await form.getByLabel("Provider").fill("Example Brokerage West");
  await form.getByRole("button", { name: "Save research" }).click();
  await p.waitForTimeout(300);
  check(/Example Brokerage West/.test(await tp.innerText()), "edited");
  await tp.getByLabel("Research view").selectOption("fund");
  await p.waitForTimeout(300);
  check(/Airport Flex Park/.test(await p.getByTestId("research-row").first().innerText()), "all assets in view list the asset");
  const [dl] = await Promise.all([p.waitForEvent("download"), tp.getByRole("button", { name: "Excel" }).click()]);
  check(/^third-party-research-.*\.xlsx$/.test(dl.suggestedFilename()), "Excel export");
  const [dp] = await Promise.all([p.waitForEvent("download"), tp.getByRole("button", { name: "PDF", exact: true }).click()]);
  check(/^third-party-research-.*\.pdf$/.test(dp.suggestedFilename()), "PDF export");
  await tp.getByLabel("Research view").selectOption("asset");

  // ── Saved on the asset ──
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  const inp = sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs;
  check(inp?.research?.length === 2 && inp.research[0].provider === "Example Brokerage West" && inp.research[0].url === "https://example.com/q3-report" && inp.research[1].docId && inp.research[1].fileName === "Appraisal.pdf", "saved on the asset: research");
  check(inp?.salesComps?.comps?.length > 0 && inp.salesComps.market === undefined && sd?.comps?.comps?.length === 1, "saved: the asset's own comps; the firm list unchanged");
  await p.screenshot({ path: `${S}/research.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
