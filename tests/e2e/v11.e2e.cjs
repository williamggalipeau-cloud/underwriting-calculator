// Version 1.1 Playwright (user, 11/25): Claude-read disposition documents
// applied through the screens (the sample Route 9 LOI to its offer, with the
// earlier terms kept in the offer's history; the sample PSA to the sale's
// contract), the market check on the Valuation tab and the Asset Business
// Plan, and the per-portfolio flag levels. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const fs = require("fs");
const FX = require("./fixture.cjs");
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const M = j(R + "/lib/market.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const S = FX.outDir();
const data = FX.workspaceData();
const grid = parseCSV(fs.readFileSync(R + "/docs/sample-market/submarket-stats-sample.csv", "utf8"));
const market = M.importMarket(M.EMPTY_MARKET, grid, M.detectMarketMapping(grid), { source: "sample.csv", sourceDate: "2026-10-15" }).market;
const sm = market.submarkets[0];
data.comps = { ...data.comps, market };
const sale = {
  id: "sale-r9", scope: "whole", unitIds: [], reason: "plan_complete", targetPrice: 14e6, targetCapPct: null, targetClose: "2027-01-31", stage: "offers", withdrawnReason: "",
  bovs: [], brokerChosen: "", listing: { feePct: null, termMonths: null, exclusions: "" }, marketing: { casSigned: 0, tours: 0, callForOffers: "" },
  contract: { psaDate: "", deposit: null, depositDue: "", hardDate: "", ddStart: "", ddDeadline: "", loanClosing: "", closingDate: "", priceLog: [] }, closing: null,
  offers: [{ id: "offer-r9", buyer: "Example Logistics REIT", buyerType: "REIT", broker: "", date: "2026-10-20", round: "initial", price: 13.9e6, deposit: 200000, ddDays: 45, closingDays: 30, financingContingency: true, notes: "", selected: true }],
  startedFrom: "", createdAt: "2026-10-01T00:00:00Z",
};
data.deals = data.deals.map((d) => (d.id === "sample-deal-2" ? { ...d, inputs: { ...d.inputs, submarketId: sm.id, dispositions: [sale] } } : d));
data.activeDealId = "sample-deal-2";
const ab = (n) => JSON.parse(fs.readFileSync(`${R}/tests/fixtures/dispositions/abstracts/${n}.json`, "utf8"));
const docs = [
  { id: "doc-loi", deal_id: "sample-deal-2", doc_type: "other", title: "[sale:sale-r9/offer:offer-r9] Offer letter / LOI: route9-loi.pdf", status: "abstracted", abstract: ab("route9-loi"), files: [{ path: "w1/sample-deal-2/doc-loi/route9-loi.pdf", name: "route9-loi.pdf" }], created_at: "2026-11-20T00:00:00Z" },
  { id: "doc-psa", deal_id: "sample-deal-2", doc_type: "psa", title: "[sale:sale-r9] PSA / amendment: route9-psa.pdf", status: "abstracted", abstract: ab("route9-psa"), files: [{ path: "w1/sample-deal-2/doc-psa/route9-psa.pdf", name: "route9-psa.pdf" }], created_at: "2026-12-01T00:00:00Z" },
];
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
const patched = [];
let saved = null;
let fails = 0;
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
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); ws.data = saved.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/deal_documents")) {
      if (req.method() === "PATCH") { const pt = JSON.parse(req.postData()); patched.push(pt); for (const d of docs) if (u.includes(d.id)) Object.assign(d, pt); body = "[]"; }
      else body = JSON.stringify(docs);
    } else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  const main = p.locator("main");

  // ── Disposition Documents: review / apply ──
  await FX.openTab(p, "Disposition Documents");
  await p.waitForTimeout(1200);
  const rows = main.getByTestId("disp-doc-row");
  check((await rows.count()) === 2 && /Abstracted – review/.test(await rows.first().innerText()), "the two documents, abstracted and ready to review");
  await rows.filter({ hasText: "route9-loi" }).getByTestId("disp-doc-review").click();
  await main.getByTestId("disp-apply-open").click();
  const ap = main.getByTestId("disp-apply");
  const apt = await ap.innerText();
  check(/Apply to the offer from Example Logistics REIT/.test(apt) && /\$13,900,000/.test(apt) && /\$14,400,000/.test(apt) && /The Purchase Price is \$14,400,000/.test(apt), "LOI: the offer now vs. the LOI, with the quote");
  check(/Apply 5 fields/.test(await main.getByTestId("disp-apply-go").innerText()), `the changed fields are ticked (${await main.getByTestId("disp-apply-go").innerText()})`);
  await main.getByTestId("disp-apply-go").click();
  await p.waitForTimeout(800);
  check(patched.some((x) => x.status === "applied"), "the document is marked applied");
  await FX.openTab(p, "Offers");
  await p.waitForTimeout(800);
  check((await main.getByLabel("Offer price").first().inputValue()) === "14400000" && (await main.getByLabel("DD days").first().inputValue()) === "30", "Offers: the offer takes the LOI's price and due diligence");
  await main.getByTestId("offer-history").first().locator("summary").click();
  check(/History \(1\)/.test(await main.getByTestId("offer-history").first().innerText()) && /\$13,900,000/.test(await main.getByTestId("offer-history").first().innerText()), "the earlier terms are in the offer's history (user, 11/25)");

  await FX.openTab(p, "Disposition Documents");
  await p.waitForTimeout(800);
  await main.getByTestId("disp-doc-row").filter({ hasText: "route9-psa" }).getByTestId("disp-doc-review").click();
  await main.getByTestId("disp-apply-open").click();
  check(/Apply to the sale's contract/.test(await main.getByTestId("disp-apply").innerText()) && /Under contract/.test(await main.getByTestId("disp-apply").innerText()), "PSA: to the sale's contract; the stage moves to Under contract");
  await main.getByTestId("disp-apply-go").click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${S}/v11-disp.png`, fullPage: true });

  // ── Valuation: market check ──
  await FX.openTab(p, "Valuation");
  await p.waitForTimeout(1500);
  const vm = main.getByTestId("valuation-market-check");
  const r9 = await vm.getByTestId("valuation-market-row").filter({ hasText: "Route 9 Small Bay" }).innerText();
  check(/Example Airport Industrial/.test(r9) && /(In line|Above market|Below market)/.test(r9) && /bp/.test(r9), `Valuation: Route 9 vs. its submarket (${r9.replace(/\s+/g, " ").slice(0, 120)})`);
  check(/not tagged/.test(await vm.innerText()) && /±50 bp, ±10%, ±2 pts, ±1 pt; red past 1.5×/.test(await vm.innerText()), "untagged assets say so; the default flag levels");
  await p.screenshot({ path: `${S}/v11-valuation.png`, fullPage: true });

  // ── Asset Business Plan: market check on the plan ──
  await FX.openTab(p, "Asset Business Plan");
  await p.waitForTimeout(1200);
  const pm = main.getByTestId("plan-market-check");
  check((await pm.getByTestId("market-check-row").count()) === 4 && /Exit cap rate/.test(await pm.innerText()) && /plan assumptions/.test(await pm.innerText()), "Business Plan: exit cap, lease-up rent, vacancy and growth vs. the market");

  // ── Flag levels per portfolio ──
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(800);
  await FX.openSetup(p);
  await p.getByTestId("setup-buttons").getByLabel("Edit portfolio").selectOption("Model Fund I");
  await p.waitForTimeout(800);
  await FX.setupStep(p, "restrictions");
  const mf = p.getByTestId("market-flags");
  check((await mf.getByRole("spinbutton").count()) === 5 && (await mf.getByRole("spinbutton").first().inputValue()) === "50", "fund terms: the five flag levels, 50 bp by default");
  await mf.getByRole("spinbutton").first().fill("25");
  await p.getByRole("button", { name: "Save terms" }).click();
  await p.waitForTimeout(800);
  await FX.openTab(p, "Valuation");
  await p.waitForTimeout(1200);
  check(/±25 bp/.test(await main.getByTestId("valuation-market-check").innerText()), "the portfolio's own level is used on the Valuation tab");

  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  const s2 = sd?.deals?.find((d) => d.id === "sample-deal-2")?.inputs?.dispositions?.[0];
  check(s2?.offers?.[0]?.price === 14400000 && s2.offers[0].history?.length === 1 && s2.contract?.price === 14500000 && s2.contract?.closingDate === "2027-01-29" && s2.stage === "contract", "saved: the offer, its history, the contract and the stage");
  check(sd?.funds?.["Model Fund I"]?.marketFlags?.capBp === 25, "saved: the fund's flag level");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
