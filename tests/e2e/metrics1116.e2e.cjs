// 1.1.16 Playwright: the comps of a sale (the disposition set), price per SF
// and break-even occupancy, each figure checked against lib/assetMetrics.js.
// Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const R = FX.R;
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const M = j(R + "/lib/assetMetrics.js");
const DS = j(R + "/lib/dispositions.js");
const FD = j(R + "/lib/fundDebt.js");
const { makeComp } = j(R + "/lib/comps.js");
const data = FX.workspaceData();
const today = new Date().toISOString().slice(0, 10);
const acq = [
  makeComp({ id: "ac-1", name: "100 Fictional Way", city: "Phoenix", state: "AZ", saleDate: "2026-06-01", price: 9000000, sf: 30000, capRate: 6.4, occupancy: 92 }),
  makeComp({ id: "ac-2", name: "200 Example Rd", city: "Phoenix", state: "AZ", saleDate: "2026-08-15", price: 7200000, sf: 25000, capRate: 6.6, occupancy: 95 }),
];
const sale = { ...DS.makeSale({ reason: "plan_complete", targetPrice: 8200000 }), id: "sale-t1", stage: "offers", bovs: [{ ...DS.makeBov(), id: "bov-t1", broker: "Fictional Brokers", price: 8000000 }], offers: [{ ...DS.makeOffer(), id: "off-t1", buyer: "Example Buyer", price: 7900000, selected: true }] };
data.deals = data.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, salesComps: { comps: acq, marketGrowthPct: 3, spreadBp: 25, filters: { sinceISO: "", minSF: "", maxSF: "", type: "" } }, dispositions: [sale] } } : d));
data.deals = [...data.deals, { ...data.deals.find((d) => d.id === "sample-deal-1"), id: "pipe-t1", inputs: { ...data.deals.find((d) => d.id === "sample-deal-1").inputs, propertyName: "Fictional Pipeline Deal", fundName: "", dispositions: [] } }];
data.activeDealId = "sample-deal-1";
const d1 = data.deals.find((d) => d.id === "sample-deal-1");
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
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
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
  p.on("dialog", (d) => d.accept()); // leaving a tab with unsaved changes asks; the test leaves
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);

  // With unsaved changes, moving to another tab asks; the test saves and continues.
  const go = async (tab) => { await FX.openTab(p, tab); await p.waitForTimeout(400); const dlg = p.getByTestId("leave-dialog"); if (await dlg.count()) { await dlg.getByRole("button", { name: "Save and continue" }).click(); await p.waitForTimeout(1200); } };

  // Portfolio Debt: break-even occupancy next to DSCR, the lib's figure.
  await FX.openTab(p, "Portfolio Debt");
  await p.waitForTimeout(1500);
  const loans = FD.fundLoans(data.deals.filter((d) => d.inputs.fundName === d1.inputs.fundName), data.valuations ?? {}, today);
  const cells = await p.getByTestId("debt-break-even").allInnerTexts();
  const rowNames = await p.getByTestId("debt-loan-row").evaluateAll((els) => els.map((e) => e.children[0].textContent));
  if (process.env.DEBUG) console.log("DBG debt", cells, rowNames, loans.map((l) => [l.name, l.breakEven?.breakEvenPct]));
  const debtBe = cells[rowNames.indexOf("Airport Flex Park")] ?? "";
  check(cells.length === rowNames.length && cells.length === loans.filter((l) => rowNames.includes(l.name)).length && cells.every((c) => /^\d+\.\d%/.test(c)), `Portfolio Debt: break-even occupancy on every loan row (${cells.length} loans; Airport Flex Park ${debtBe})`);

  // Assets for Sale: the sale's comps.
  await FX.openTab(p, "Assets for Sale");
  await p.waitForTimeout(800);
  if (!(await p.getByTestId("sale-card").count())) await p.getByTestId("sale-row").locator("button").first().click();
  const sc = p.getByTestId("sale-comps");
  check(/Disposition set/.test(await sc.innerText()) && /None yet/.test(await sc.innerText()) && (await p.getByTestId("sale-comp-row").count()) === 0, "a sale starts with no comps of its own (the disposition set)");
  await p.getByTestId("sale-comps-copy").click();
  await p.waitForTimeout(400);
  check((await p.getByTestId("sale-comp-row").count()) === 2, "Copy from the acquisition set adds the asset's two acquisition comps");
  await p.getByTestId("sale-comps-copy").click();
  await p.waitForTimeout(300);
  check((await p.getByTestId("sale-comp-row").count()) === 2, "copying again adds nothing twice");
  const withComps = { ...sale, comps: M.copyAcquisitionComps(d1.inputs, sale, { todayISO: today }).state };
  const v = M.saleCompsView(d1.inputs, withComps, { todayISO: today });
  const implied = await p.getByTestId("sale-comps-implied-row").allInnerTexts();
  if (process.env.DEBUG) console.log("DBG implied", implied, JSON.stringify(v.rows));
  const money = (x) => `$${Math.round(x).toLocaleString("en-US")}`;
  check(implied.length === 5 && implied[0].includes(money(v.rows[0].price)) && implied[0].includes(`$${v.rows[0].psf.toFixed(0)}`) && /Comps, by cap rate\s+\$[\d,]+/.test(implied[1]) && implied[1].includes(`${v.avgCapPct.toFixed(2)}%`), `what the comps imply: ${money(v.rows[0].price)} by $/SF (the comps' $${v.avgPsf.toFixed(0)} / SF over the asset's SF), and a value at their ${v.avgCapPct.toFixed(2)}% average cap rate`);
  check(/Broker opinion \(Fictional Brokers\)/.test(implied[2]) && implied[2].includes("$8,000,000") && /Asking price/.test(implied[3]) && implied[3].includes("$8,200,000") && /Selected offer \(Example Buyer\)/.test(implied[4]) && implied[4].includes("$7,900,000"), "next to the broker opinion, the asking price and the selected offer");
  check(/Average of the 2 comps in use/.test(await p.getByTestId("sale-comps-avg").innerText()) && (await p.getByTestId("sale-comps-avg").innerText()).includes(`$${v.avgPsf.toFixed(0)}`), `average of the comps in use: $${v.avgPsf.toFixed(0)} / SF`);
  // Leaving a comp out changes the average.
  await p.getByTestId("sale-comp-row").first().getByLabel("Use comp").uncheck();
  await p.waitForTimeout(300);
  check(/Average of the 1 comp in use/.test(await p.getByTestId("sale-comps-avg").innerText()), "unticking Use leaves a comp out of the average");
  await p.getByTestId("sale-comp-row").first().getByLabel("Use comp").check();
  await p.getByTestId("sale-comps-add").click();
  await p.waitForTimeout(300);
  check((await p.getByTestId("sale-comp-row").count()) === 3, "+ Comp adds a blank comp to this sale");
  await p.getByTestId("sale-comp-row").nth(2).getByRole("button", { name: "Remove comp" }).click();
  await p.waitForTimeout(300);

  // Sell/Hold: value per SF next to basis per SF, and break-even occupancy.
  await go("Sell/Hold Analysis");
  await p.waitForTimeout(2500);
  const sf = M.assetSF(d1.inputs), basis = M.allInBasis(d1.inputs);
  check((await p.getByTestId("sh-basis-psf").innerText()).includes(`$${(basis / sf).toFixed(0)} / SF`) && /\$\d+ \/ SF/.test(await p.getByTestId("sh-price-psf").innerText()), `Sell/Hold: sale value per SF next to basis per SF ($${(basis / sf).toFixed(0)} / SF)`);
  const shBe = (await p.getByTestId("sh-break-even").innerText()).match(/\d+\.\d%/)?.[0] ?? "";
  check(shBe && debtBe.startsWith(shBe) && /pts/.test(await p.getByTestId("sh-cushion").innerText()), `Sell/Hold: the same break-even occupancy as Portfolio Debt for this asset (${shBe} and ${debtBe})`);

  // Research: the asset's own comps are named the acquisition comps.
  await go("Comps");
  await p.waitForTimeout(800);
  check((await p.getByTestId("research").getByRole("tab", { name: "Acquisition Comps" }).count()) === 1, "Research: the asset's comps are the Acquisition Comps");

  // Saved on the sale, not on the asset's acquisition comps.
  await FX.saveLoadUpgrade(p);
  await p.waitForTimeout(22000);
  const sd = (saved?.new_data ?? saved?.data)?.deals?.find((d) => d.id === "sample-deal-1")?.inputs;
  check(sd?.dispositions?.[0]?.comps?.comps?.length === 2 && sd.dispositions[0].comps.comps.every((c) => /^dc-/.test(c.id)) && sd.salesComps.comps.length === 2 && sd.salesComps.comps[0].id === "ac-1", "saved: the sale holds its own two comps; the acquisition comps are untouched");
  // Underwriter: purchase price and all-in basis per SF, break-even occupancy.
  // A deal still in the pipeline (no portfolio yet) is the open deal.
  ws.data = { ...data, activeDealId: "pipe-t1" };
  await p.reload();
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  await FX.openTab(p, "Underwriter");
  await p.waitForTimeout(1500);
  const sm = p.getByTestId("screener-metrics");
  if (await sm.count()) {
    check(/\$\d+ \/ SF/.test(await p.getByTestId("screener-price-psf").innerText()) && /\$\d+ \/ SF/.test(await p.getByTestId("screener-basis-psf").innerText()) && /\d+\.\d%/.test(await p.getByTestId("screener-break-even").innerText()) && /pts/.test(await p.getByTestId("screener-cushion").innerText()), "Underwriter: price and basis per SF, break-even occupancy and its cushion");
  } else check(false, "Underwriter: the price per SF and break-even tiles are shown");

  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
