// Phase P part 2 Playwright: Start sale from Sell/Hold, documents on a sale
// and an offer (before the doc-type SQL: filed under Other with the type in
// the title), Sale Documents tab, LP / GP split on closing, PDFs. Fictional
// fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const OLD_TYPES = ["om", "rent_roll", "t12", "loi", "psa", "ic_memo", "closing_acq", "closing_disp", "lpa", "ppm", "insurance_cert", "loan", "rate_cap", "appraisal", "estoppel", "cam", "billing", "other"];
data.deals = data.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, dispositions: [{
  id: "sale-fx1", scope: "whole", unitIds: [], reason: "plan_complete", targetPrice: 9e6, targetCapPct: 6, targetClose: "2026-12-31", stage: "contract", withdrawnReason: "",
  bovs: [], brokerChosen: "Example Brokerage", listing: { feePct: 1, termMonths: 6, exclusions: "" }, marketing: { casSigned: 10, tours: 4, callForOffers: "2026-10-01" },
  contract: { psaDate: "2026-11-01", deposit: 250000, hardDate: "2026-11-30", ddDeadline: "2026-11-30", closingDate: "2026-12-15", priceLog: [] }, closing: null,
  offers: [{ id: "offer-fx1", buyer: "Fictional Fund", buyerType: "Institutional fund", broker: "", date: "2026-10-10", round: "best_final", price: 9.2e6, deposit: 250000, ddDays: 30, closingDays: 45, financingContingency: false, notes: "", selected: true }],
  startedFrom: "", createdAt: "2026-09-01T00:00:00Z",
}] } } : d));
data.activeDealId = "sample-deal-2";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
const docs = [];
const refused = [];
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
    const one = (x) => (acc.includes("vnd.pgrst.object") ? JSON.stringify(x) : JSON.stringify([x]));
    let body = "[]", status = 200;
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); ws.data = saved.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/sign/")) body = JSON.stringify({ signedURL: "/object/sign/x?token=t" });
    else if (u.includes("/storage/v1/object/")) body = JSON.stringify({ Key: "x" });
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") {
        const row = { created_at: new Date().toISOString(), status: "uploaded", abstract: null, ...JSON.parse(req.postData()) };
        if (!OLD_TYPES.includes(row.doc_type)) { refused.push(row.doc_type); status = 400; body = JSON.stringify({ code: "23514", message: 'new row for relation "deal_documents" violates check constraint "deal_documents_doc_type_check"' }); }
        else { docs.push(row); body = one(row); }
      } else body = JSON.stringify(docs);
    } else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const dg = p.getByRole("group", { name: "Dispositions" });
  await FX.openArea(p, "Offers");
  check((await dg.getByRole("button").allInnerTexts()).map((t) => t.replace(/\s*\d+$/, "")).join() === "Sell/Hold Analysis,Assets for Sale,Offers,Track Record,Sale Documents", "Dispositions tabs: Sell/Hold Analysis first, incl. Sale Documents");

  // ── Start sale from Sell/Hold (Route 9, the open asset) ──
  await FX.openTab(p, "Sell/Hold Analysis");
  await p.waitForTimeout(1500);
  await p.locator("main").getByRole("button", { name: "Start sale" }).click();
  await p.waitForTimeout(800);
  const rows = p.getByTestId("sale-row");
  check((await rows.count()) === 2 && (await p.getByTestId("sale-card").count()) === 1 && /Route 9 Small Bay[\s\S]*Preparing[\s\S]*Hold period reached/.test(await rows.filter({ hasText: "Route 9" }).innerText()), "Start sale on Sell/Hold opens a new sale on Assets for Sale");
  await FX.openTab(p, "Sell/Hold Analysis");
  await p.waitForTimeout(1200);
  check((await p.locator("main").getByRole("button", { name: /Sale in progress/ }).count()) === 1, "Sell/Hold then shows the sale in progress");

  // ── Documents on the sale (before the SQL) ──
  await FX.openTab(p, "Assets for Sale");
  await p.waitForTimeout(600);
  const air = rows.filter({ hasText: "Airport Flex Park" });
  if (!(await air.getByTestId("sale-card").count())) await air.locator("button").first().click();
  const card = air.getByTestId("sale-card");
  const box = card.getByTestId("disp-docs");
  await box.getByLabel("Document type").selectOption("bov");
  await box.getByTestId("disp-file").setInputFiles({ name: "Example BOV.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictional") });
  await p.waitForTimeout(1500);
  check(refused.includes("bov") && docs.length === 1 && docs[0].doc_type === "other" && docs[0].title === "[sale:sale-fx1] BOV: Example BOV.pdf" && docs[0].deal_id === "sample-deal-1", "before the SQL: the BOV is filed as Other, sale and type in the title");
  check(/BOV: Example BOV\.pdf/.test(await box.innerText()), "and listed on the sale");
  await box.getByLabel("Document type").selectOption("psa");
  await box.getByTestId("disp-file").setInputFiles({ name: "PSA.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictional") });
  await p.waitForTimeout(1500);
  check(docs.at(-1).doc_type === "psa", "a PSA keeps its existing type");

  // ── Offer letter on the offer ──
  await FX.openTab(p, "Offers");
  await p.waitForTimeout(800);
  const og = p.getByTestId("offer-group").filter({ hasText: "Airport Flex Park" });
  await og.getByTestId("disp-file").first().setInputFiles({ name: "LOI.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictional") });
  await p.waitForTimeout(1500);
  check(docs.at(-1).title === "[sale:sale-fx1/offer:offer-fx1] Offer letter / LOI: LOI.pdf", "an offer letter on the offer");

  // ── Sale Documents tab ──
  await FX.openTab(p, "Sale Documents");
  await p.waitForTimeout(1000);
  check((await p.getByTestId("disp-doc-row").count()) === 3, "Sale Documents lists every disposition document");
  await p.getByLabel("Filter type").selectOption("offer_letter");
  check((await p.getByTestId("disp-doc-row").count()) === 1 && /Fictional Fund/.test(await p.getByTestId("disp-doc-row").innerText()), "filter by type; the offer's buyer shown");

  // ── Closing → LP / GP split ──
  await FX.openTab(p, "Assets for Sale");
  await p.waitForTimeout(600);
  if (!(await air.getByTestId("sale-card").count())) await air.locator("button").first().click();
  await card.getByRole("button", { name: /Record closing statement/ }).click();
  await card.getByLabel("Closed on").fill("2026-11-20");
  await card.getByLabel("Sale price").fill("9200000");
  await card.getByRole("button", { name: "Record closing" }).click();
  await p.waitForTimeout(800);
  await p.getByLabel(/Include closed/).check();
  if (!(await air.getByTestId("sale-card").count())) await air.locator("button").first().click();
  const split = await air.getByTestId("sale-split").innerText().catch(() => "");
  check(/Through Model Fund I.s waterfall: LPs \$[\d,]+, GP \$[\d,]+/.test(split), `closing shows the LP / GP split: ${split.slice(0, 90)}`);
  check((await air.getByTestId("disp-docs").getByLabel("Document type").locator("option").allInnerTexts()).includes("Distribution notice"), "a closed sale also takes the distribution notice and true-ups");

  // ── PDFs ──
  const [d1] = await Promise.all([p.waitForEvent("download"), p.getByTestId("for-sale").getByRole("button", { name: "PDF", exact: true }).click()]);
  check(/assets-for-sale-.*\.pdf$/.test(d1.suggestedFilename()), "Assets for Sale PDF");
  await FX.openTab(p, "Track Record");
  await p.waitForTimeout(800);
  const [d2] = await Promise.all([p.waitForEvent("download"), p.getByTestId("track-record").getByRole("button", { name: "PDF", exact: true }).click()]);
  check(/track-record-.*\.pdf$/.test(d2.suggestedFilename()), "Track Record PDF");
  await p.screenshot({ path: `${S}/dispositions2.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
