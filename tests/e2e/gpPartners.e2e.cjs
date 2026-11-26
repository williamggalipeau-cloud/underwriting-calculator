// 1.1.10 (user, 11/26): Finance → GP Partners. An agreement read by Claude
// (its abstract on the PDF) is checked and saved; a deal-level agreement is
// entered by hand; committed capital by partner with this firm's row; the
// portfolio's Parties follow; Firm Economics counts only the firm's share.
// Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const abs = require(FX.R + "/docs/sample-deal-docs/gp-agreements/abstracts/gp-co-investment-agreement-fictional-capital-partners.json");
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
const doc = { id: "dd-gpa1", workspace_id: "w1", deal_id: null, fund_name: "Model Fund I", doc_type: "other", title: "[gp-agreement:x] gp-co-investment-agreement-fictional-capital-partners.pdf", files: [{ name: "gp-co-investment-agreement-fictional-capital-partners.pdf", path: "w1/fund/dd-gpa1/f.pdf" }], abstract: abs, created_at: "2026-11-26T00:00:00Z" };
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { const s = JSON.parse(req.postData()); ws.data = s.new_data ?? ws.data; body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    else if (u.includes("/deal_documents") && req.method() === "GET") body = JSON.stringify([doc]);
    else if (u.includes("/storage/")) body = JSON.stringify({ Key: "x" });
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/maps.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await FX.saveLoadUpgrade(p);
  const money = async (loc) => Number((await loc.locator("p").nth(1).innerText()).replace(/[$M,]/g, ""));

  // Firm Economics before: the firm has all of the GP capital.
  await FX.openTab(p, "Firm Economics");
  await p.waitForTimeout(2000);
  const eq0 = await money(p.getByTestId("fe-equity"));
  const tabs = await p.getByRole("group", { name: "Finance" }).getByRole("button").allInnerTexts();
  check(tabs.map((x) => x.trim()).join("|") === "GP Economics|Sponsor Economics|Firm Economics|GP Partners", `Finance tabs: ${tabs.join(", ")}`);

  // ── GP Partners: empty, then a partner, then Claude's reading of its agreement ──
  await FX.openTab(p, "GP Partners");
  await p.waitForTimeout(2000);
  const gpp = p.getByTestId("gp-partners");
  check((await gpp.getByTestId("gpp-empty").count()) === 1 && (await gpp.getByTestId("gpp-row").count()) === 1 && /This firm \(sponsor\)/.test(await gpp.getByTestId("gpp-row").first().innerText()), "no partners yet: only this firm's row, which has all the GP capital");
  check(/Agreements read by Claude, to check \(1\)/.test(await gpp.getByTestId("gpp-to-check").innerText()), "the agreement PDF Claude read waits to be checked");
  await gpp.getByLabel("New partner name").fill("Fictional Capital Partners LP");
  await gpp.getByRole("button", { name: "+ Partner" }).click();
  await p.waitForTimeout(500);
  await gpp.getByTestId("gpp-to-check").getByRole("button", { name: "Check terms" }).click();
  await p.waitForTimeout(300);
  const form = gpp.getByTestId("gp-agreement-form");
  check(/read by Claude/.test(await form.innerText()) && (await form.getByLabel("Agreement capital share").inputValue()) === "40" && (await form.getByLabel("Agreement promote share").inputValue()) === "50" && (await form.getByLabel("Agreement effective date").inputValue()) === "2026-01-15" && (await form.getByLabel("Agreement portfolio").inputValue()) === "Model Fund I", "Claude's terms prefilled: 40% of GP capital, 50% of the GP's promote, from 1/15/2026, Model Fund I");
  check((await form.getByLabel("Agreement partner").locator("option:checked").innerText()) === "Fictional Capital Partners LP" && /fifty percent \(50%\)/.test(await form.getByTestId("gp-agreement-quotes").innerText()), "matched to the partner by name; each term with its quote");
  await form.getByRole("button", { name: "Save terms" }).click();
  await p.waitForTimeout(1200);
  const rowOf = (n) => gpp.getByTestId("gpp-row").filter({ hasText: n });
  const fcp = await rowOf("Fictional Capital Partners LP").innerText();
  check(/Model Fund I \(fund-wide\)/.test(fcp) && /40%/.test(fcp) && /1 checked/.test(fcp), `committed capital by partner: ${fcp.replace(/\s+/g, " ").slice(0, 120)}`);
  check(/60%/.test(await rowOf("This firm (sponsor)").innerText()), "this firm's row: the other 60% of the GP capital");
  check((await gpp.getByTestId("gpp-to-check").count()) === 0, "nothing left to check");

  // ── A deal-level agreement, entered by hand ──
  await gpp.getByLabel("New partner name").fill("Sample Family Office LLC");
  await gpp.getByRole("button", { name: "+ Partner" }).click();
  await p.waitForTimeout(400);
  await rowOf("Sample Family Office LLC").click();
  await p.waitForTimeout(300);
  await gpp.getByTestId("gpp-detail").getByRole("button", { name: "+ Agreement" }).click();
  const f2 = gpp.getByTestId("gp-agreement-form");
  await f2.getByLabel("Agreement portfolio").selectOption("Model Fund I");
  await f2.getByLabel("Agreement scope").selectOption({ label: "One deal: Granite Ave Industrial" });
  await f2.getByLabel("Agreement capital share").fill("50");
  await f2.getByLabel("Agreement promote share").fill("40");
  await f2.getByLabel("Agreement effective date").fill("2026-03-01");
  await f2.getByRole("button", { name: "Save terms" }).click();
  await p.waitForTimeout(1200);
  const sfo = await rowOf("Sample Family Office LLC").innerText();
  check(/Model Fund I: Granite Ave Industrial/.test(sfo) && /1 checked/.test(sfo), `deal-level partner: ${sfo.replace(/\s+/g, " ").slice(0, 100)}`);
  check(/Granite Ave Industrial only/.test(await gpp.getByTestId("gpp-agreements").innerText()), "its agreement: Granite Ave only");
  const foot = await gpp.getByTestId("gpp-table").locator("tfoot").innerText();
  check(/100%/.test(foot), `the table adds up to all GP capital (${foot.replace(/\s+/g, " ")})`);
  const [dx] = await Promise.all([p.waitForEvent("download"), gpp.getByRole("button", { name: "Excel" }).click()]);
  check(/^gp-partners-.*\.xlsx$/.test(dx.suggestedFilename()), "GP Partners Excel");
  const [dp] = await Promise.all([p.waitForEvent("download"), gpp.getByRole("button", { name: "PDF", exact: true }).click()]);
  const pdfPath = `${S}/gp-partners.pdf`; await dp.saveAs(pdfPath);
  const txt = require("child_process").execFileSync("pdftotext", ["-layout", pdfPath, "-"]).toString();
  check(/GP Partners/.test(txt) && /Fictional Capital Partners LP/.test(txt) && /INTERNAL/.test(txt), "GP Partners PDF");
  await p.screenshot({ path: `${S}/gp-partners.png`, fullPage: true });

  // ── Firm Economics now counts only the firm's share ──
  await FX.openTab(p, "Firm Economics");
  await p.waitForTimeout(2000);
  const eq1 = await money(p.getByTestId("fe-equity"));
  check(eq1 < eq0 && Math.abs(eq1 - eq0 * 0.6) < 0.15, `firm equity ${eq0}M → ${eq1}M (its 60%, less Granite Ave's deal-level share)`);
  const outside = await p.getByTestId("fe-by-portfolio").innerText();
  check(/Fictional Capital Partners LP/.test(outside) && /Sample Family Office LLC/.test(outside), "by portfolio: the outside GP partners named");

  // ── The portfolio's Parties follow the agreements ──
  await p.getByTestId("home-button").click();
  await p.waitForTimeout(800);
  await FX.openSetup(p);
  await p.getByTestId("setup-buttons").getByLabel("Edit fund").selectOption("Model Fund I");
  await p.waitForTimeout(800);
  const parties = p.getByTestId("parties");
  check((await parties.getByTestId("gp-party-from-agreement").count()) === 2 && /This firm/.test(await parties.innerText()) && (await parties.getByLabel("Sponsor / operator: who").count()) === 0 && (await parties.getByLabel("Sponsor co-invest").count()) === 0, "Parties: the two partners from their agreements; the sponsor is this firm (no outside-sponsor choice, no sponsor co-invest)");
  check((await parties.getByLabel("GP 2: partner").locator("option:checked").innerText()) === "Fictional Capital Partners LP", "the partner is picked from GP Partners, not typed");
  check(/Sponsor \(this firm\)/.test(await parties.getByTestId("fee-payees").innerText()) && (await parties.getByLabel("Property management: paid to").locator("option").allInnerTexts()).join("|") === "Sponsor (this firm)|Third party (outsourced)", "fees: the sponsor or a third party; never the GP");
  await p.keyboard.press("Escape");

  // Saved with the firm's data.
  await FX.saveLoadUpgrade(p);
  await p.waitForTimeout(1500);
  const saved = ws.data.gpPartners;
  check(saved?.partners?.length === 2 && saved.agreements.length === 2 && saved.agreements.some((a) => a.source === "claude" && a.docId === "dd-gpa1") && ws.data.funds["Model Fund I"].gpParties.some((g) => g.partnerId && g.terms?.length), "saved: partners, agreements (one read by Claude, linked to its PDF) and the fund's parties");
  check(errs.length === 0, `no page errors${errs.length ? `: ${errs.join("; ")}` : ""}`);
  await b.close();
  console.log(fails ? `${fails} failed` : "all passed");
  process.exit(fails ? 1 : 0);
})();
