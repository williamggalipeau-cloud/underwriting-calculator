// 1.1.17 Playwright: the industrial characteristics in asset setup (Building;
// Location and site), their source documents, and SNDAs (Leases tab,
// Portfolio Debt). Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const data = FX.workspaceData();
const U = (name, tenant, sf) => ({ id: `u-${name}`, name, tenantName: tenant, squareFeet: sf, currentRentPSF: 12, leaseStatus: "occupied", leaseType: "NNN", leaseEnd: "2028-06-30", annualEscalationPct: 3 });
data.deals = data.deals.map((d) => (d.id === "sample-deal-1" ? { ...d, inputs: { ...d.inputs, lenderName: "Fictional Bank", units: [U("001", "Alpha Fictional Co", 12000), U("002", "Beta Example LLC", 8000), U("003", "Gamma Sample Inc", 4000)] } } : d));
data.activeDealId = "sample-deal-1";
const docs = [
  { id: "doc-pcr", workspace_id: "w1", deal_id: "sample-deal-1", fund_name: "Model Fund I", doc_type: "other", title: "[fact:pcr] fictional-pcr.pdf", files: [{ path: "w1/sample-deal-1/doc-pcr/fictional-pcr.pdf", name: "fictional-pcr.pdf" }], status: "abstracted",
    abstract: { doc_type: "pcr", building: { clearHeightFt: 24, truckCourtFt: 120, trailerStalls: 8, sprinklerType: "ESFR" }, quotes: { truckCourtFt: "The truck court is 120 feet deep, with 8 marked trailer stalls." } } },
  { id: "doc-snda", workspace_id: "w1", deal_id: "sample-deal-1", fund_name: "Model Fund I", doc_type: "other", title: "[snda:002] beta-snda.pdf", files: [{ path: "w1/sample-deal-1/doc-snda/beta-snda.pdf", name: "beta-snda.pdf" }], status: "abstracted",
    abstract: { doc_type: "snda", tenant: "Beta Example LLC", unit: "002", lender: "Fictional Bank", landlord: "Owner LLC", date: "2026-10-01", non_disturbance: "Not disturbed while not in default", attornment: "Attorns to the lender", lender_cure_days: 30, lender_liability: "Limited", quotes: {} } },
];
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
    else if (u.includes("/deal_documents")) body = JSON.stringify(docs);
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

  // ── Asset setup: Building; Location and site ──
  await FX.openSetup(p);
  await p.getByTestId("setup-buttons").getByLabel("Edit asset").selectOption("sample-deal-1");
  await p.waitForTimeout(800);
  const panel = p.getByTestId("asset-panel");
  const bld = panel.getByTestId("asset-building"), site = panel.getByTestId("asset-site");
  check((await bld.count()) === 1 && (await site.count()) === 1 && (await bld.locator("input, select").count()) >= 27 && (await site.locator("input, select").count()) === 22, "asset setup has a Building section and a Location and site section, with every field");
  check(/Class A 32–40\+ · older 18–24/.test(await panel.getByTestId("fact-building-clearHeightFt-hint").innerText()) && /typical 130–180/.test(await panel.getByTestId("fact-building-truckCourtFt-hint").innerText()), "typical ranges show as grey hints");
  const set = async (id, v) => { await panel.getByTestId(id).fill(String(v)); await p.waitForTimeout(120); };
  await set("fact-building-dockDoors", 6);
  await set("fact-building-landAcres", 1.5);
  await set("fact-building-footprintSF", 24000);
  await set("fact-building-officeSF", 2400);
  await set("fact-building-roofYear", 2019);
  await set("fact-building-clearHeightFt", 12);
  check((await panel.getByTestId("calc-sf-per-dock").innerText()).includes("4,000"), "SF per dock door is calculated (24,000 SF ÷ 6 doors = 4,000)");
  check((await panel.getByTestId("calc-site-coverage").innerText()).includes("36.7%") && (await panel.getByTestId("calc-office").innerText()).includes("10.0%"), "site coverage 36.7% and office share 10.0% are calculated");
  check(/\d+ years \(to 2039\)/.test(await panel.getByTestId("calc-roof-life").innerText()), "roof remaining useful life from a 20-year life (to 2039)");
  check((await panel.getByTestId("facts-flags").count()) === 0, "a clear height below the typical range is not flagged or blocked");
  await set("fact-building-pavingYear", 2013);
  check(/paving/i.test(await panel.getByTestId("facts-flags").innerText()), "a paving life that ends inside the hold is flagged");
  await panel.getByTestId("fact-site-zoning").fill("M1 Industrial");
  await panel.getByTestId("fact-site-industrialByRight").selectOption("yes");
  // Source documents.
  const fd = panel.getByTestId("fact-docs");
  check((await fd.getByTestId("fact-doc").count()) === 1 && /Property condition report/.test(await fd.innerText()) && /fictional-pcr\.pdf/.test(await fd.innerText()) && (await fd.getByTestId("fact-doc-upload").count()) === 1, "Source documents lists the asset's property condition report, with Upload PDF");
  await fd.getByTestId("fact-doc-facts").click();
  const drows = await fd.getByTestId("fact-doc-row").allInnerTexts();
  check(drows.length === 4 && drows.some((t) => /Clear height[\s\S]*24[\s\S]*12/.test(t)) && /120 feet deep/.test(drows.join(" ")), "its facts are shown next to what the asset has, with the quote; a difference is called out");
  await fd.getByTestId("fact-doc-apply").click();
  await p.waitForTimeout(300);
  check((await panel.getByTestId("fact-building-clearHeightFt").inputValue()) === "24" && (await panel.getByTestId("fact-building-truckCourtFt").inputValue()) === "120" && (await panel.getByTestId("fact-building-sprinklerType").inputValue()) === "ESFR" && (await fd.getByTestId("fact-doc-agrees").count()) === 1, "Apply fills the asset's facts from the document");
  await p.getByRole("dialog", { name: "Asset inputs" }).getByRole("button", { name: "Done" }).click();
  await p.waitForTimeout(300);
  await FX.saveLoadUpgrade(p);
  await p.waitForTimeout(1500);

  // ── Leases → SNDAs ──
  await FX.openTab(p, "Leases");
  await p.waitForTimeout(1500);
  await p.locator("main").getByRole("tab", { name: "SNDAs" }).click();
  await p.waitForTimeout(600);
  const sv = p.getByTestId("snda-view");
  check((await sv.getByTestId("snda-row").count()) === 3 && (await sv.getByTestId("snda-none").count()) === 1 && /No requirement set/.test(await sv.getByTestId("snda-coverage").innerText()), "SNDAs: a row per lease; with no rule set, none is required");
  await sv.getByTestId("snda-rule").selectOption("all");
  await p.waitForTimeout(300);
  check(/3 outstanding/.test(await sv.getByTestId("snda-coverage").innerText()) && (await sv.getByTestId("snda-badge").allInnerTexts()).every((t) => t === "Required, not requested"), "the loan requires one from all leases: three outstanding");
  await sv.getByLabel("SNDA status for Alpha Fictional Co").selectOption("signed");
  await p.waitForTimeout(300);
  check(/2 outstanding · 1 of 3 required signed · rent covered 50% · SF covered 50%/.test(await sv.getByTestId("snda-coverage").innerText()), "one lease signed: 1 of 3, 50% of rent and SF covered");
  const r2 = sv.getByTestId("snda-row").nth(1);
  check(/beta-snda\.pdf/.test(await r2.innerText()), "the signed SNDA document is on its lease");
  await r2.getByTestId("snda-terms").click();
  check(/Non-disturbance[\s\S]*Not disturbed while not in default/.test(await r2.getByTestId("snda-terms-panel").innerText()) && /Lender[\s\S]*Fictional Bank/.test(await r2.getByTestId("snda-terms-panel").innerText()), "its terms as Claude read them");
  await r2.getByTestId("snda-apply").click();
  await p.waitForTimeout(300);
  check(/1 outstanding · 2 of 3 required signed · rent covered 83% · SF covered 83%/.test(await sv.getByTestId("snda-coverage").innerText()) && (await r2.getByLabel("SNDA signed date for Beta Example LLC").inputValue()) === "2026-10-01", "applying the document marks the lease signed on the document's date");
  await FX.saveLoadUpgrade(p);
  await p.waitForTimeout(1500);

  // ── Portfolio Debt and Asset Summary ──
  await FX.openTab(p, "Portfolio Debt");
  await p.waitForTimeout(1500);
  const srow = p.getByTestId("debt-snda").getByTestId("debt-snda-row").filter({ hasText: "Airport Flex Park" });
  check((await p.getByTestId("debt-snda-row").count()) === (await p.getByTestId("debt-loan-row").count()) && /all leases[\s\S]*1 outstanding/.test(await srow.innerText()) && /83(\.\d)?%/.test(await srow.innerText()), "Portfolio Debt: SNDA coverage for every loan; Airport Flex Park 83% covered, 1 outstanding");
  await FX.openTab(p, "Asset Summary");
  await p.waitForTimeout(1500);
  const arow = p.locator("main tr", { hasText: "Airport Flex Park" }).first();
  check(/24 ft/.test(await arow.innerText()) && /4,000/.test(await arow.innerText()) && /37%/.test(await arow.innerText()), "Asset Summary: clear height, SF per dock door and site coverage");

  // ── Saved on the asset ──
  await p.waitForTimeout(1000);
  const inp = ws.data.deals.find((d) => d.id === "sample-deal-1").inputs;
  check(inp.building?.clearHeightFt === 24 && inp.building.dockDoors === 6 && inp.building.sprinklerType === "ESFR" && inp.site?.zoning === "M1 Industrial" && inp.site.industrialByRight === "yes", "saved on the asset: building and site facts");
  check(inp.loanTerms?.sndaRule === "all" && inp.units[0].snda?.status === "signed" && inp.units[1].snda?.status === "signed" && inp.units[1].snda.signedOn === "2026-10-01" && inp.units[1].snda.docId === "doc-snda" && !inp.units[2].snda, "saved on the asset: the loan's rule and each lease's SNDA status");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
