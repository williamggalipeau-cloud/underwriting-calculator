// Phase N Playwright: Fund Summary (dates, capital, key terms, legal entities
// with the ownership chart, fact sheet PDF, Excel, links; annual-report dates
// on Leases → Critical dates). Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
data.activeDealId = "sample-deal-2";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
const allChanges = [];
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 }, acceptDownloads: true });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); allChanges.push(...(saved.changes ?? [])); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");

  await FX.openArea(p, "Fund Summary");
  const nav = await p.locator("nav").first().innerText();
  check(nav.indexOf("Fund Summary") > 0 && nav.indexOf("Fund Summary") < nav.indexOf("Fund Return"), "Fund Summary is first in Portfolio Management");
  await FX.openTab(p, /^Fund Summary/);
  await p.waitForTimeout(1200);
  const fs = main.getByTestId("fund-summary");
  check((await fs.count()) === 1 && /Model Fund I/.test(await fs.locator("h2").innerText()), "Fund Summary for Model Fund I");
  const dt = await fs.getByTestId("fs-dates").innerText();
  check(/12\/31\/2025/.test(dt) && /12\/31\/2027/.test(dt) && /12\/31\/2030/.test(dt) && /12\/31\/2032/.test(dt) && /months left/.test(dt), "key dates: final close, investment period, term, outside date");
  await fs.getByLabel("Launch date").fill("2025-06-01");
  const capTxt = await fs.getByTestId("fs-capital").innerText();
  check(/\$100\.00M/.test(capTxt) && /% of commitments/.test(capTxt) && /Sub line drawn \/ capacity/.test(capTxt), "capital: raised, called, deployed, dry powder, sub line");
  const terms = await fs.getByTestId("fs-terms").innerText();
  check(/Preferred return/.test(terms) && /Promote tiers/.test(terms) && /Management fee/.test(terms) && /Subscription line/.test(terms) && /Investment limits/.test(terms), "all key terms");
  await fs.getByLabel("Key person", { exact: true }).fill("Two of three named principals (fictional)");
  await fs.getByLabel("Key person", { exact: true }).blur();
  // Entities
  await fs.getByRole("button", { name: "Add entity" }).click();
  await p.waitForTimeout(500);
  await fs.getByRole("button", { name: "Add a company for each asset" }).click();
  await p.waitForTimeout(800);
  const nEnt = await fs.getByTestId("entity-row").count();
  check(nEnt >= 8 && (await fs.getByLabel(/^Role /).first().inputValue()) === "fund", `entities: the fund plus a company per asset (${nEnt})`);
  await fs.getByRole("button", { name: "Add entity" }).click();
  await p.waitForTimeout(500);
  const last = fs.getByTestId("entity-row").last();
  await last.getByLabel(/^Entity name/).fill("Model GP LLC");
  await last.getByLabel(/^Entity name/).blur();
  await p.waitForTimeout(400);
  await fs.getByTestId("entity-row").last().getByLabel(/^Role/).selectOption("gp");
  await fs.getByTestId("entity-row").last().getByLabel(/^Annual report/).fill("2027-03-01");
  await fs.getByTestId("entity-row").last().getByLabel(/^EIN/).fill("12-3456789");
  await fs.getByTestId("entity-row").last().getByLabel(/^EIN/).blur();
  await p.waitForTimeout(800);
  check((await fs.getByTestId("entity-row").last().getByLabel(/^EIN/).inputValue()) === "••••6789", "EIN kept as the last 4 digits only");
  const chart = await fs.getByTestId("org-chart").innerText();
  check(/Model GP LLC · General partner/.test(chart) && /Model Fund I LP · Fund/.test(chart) && (await fs.getByTestId("org-node").count()) === nEnt + 1, "ownership chart: GP and the fund with its property companies");
  check((await fs.getByTestId("fs-docs").innerText()).includes("Upload PDF"), "org chart / formation document uploads (signed in)");
  // Exports
  const [pdf] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), fs.getByRole("button", { name: "Fact sheet (PDF)" }).click()]);
  const pPath = S + "/n_fact_sheet.pdf"; await pdf.saveAs(pPath);
  const cp = require("child_process");
  const txt = cp.execFileSync("pdftotext", ["-layout", pPath, "-"]).toString();
  const pages = Number((cp.execFileSync("pdfinfo", [pPath]).toString().match(/Pages:\s+(\d+)/) ?? [])[1]);
  check(pages === 1 && /Fund fact sheet/.test(txt) && /Key terms/.test(txt) && /Ownership/.test(txt) && /Model GP LLC/.test(txt), `fact sheet: one page with dates, terms and ownership (${pages} page)`);
  const [xl] = await Promise.all([p.waitForEvent("download"), fs.getByRole("button", { name: "Excel" }).click()]);
  check(/fund-summary\.xlsx$/.test(xl.suggestedFilename()), `Excel: ${xl.suggestedFilename()}`);
  await p.screenshot({ path: S + "/phaseN_summary.png", fullPage: true });
  // Links
  await fs.getByTestId("fs-links").getByRole("button", { name: /Performance: Fund Return/ }).click();
  await p.waitForTimeout(1200);
  check((await main.getByTestId("fund-nav").count()) === 1, "link opens Fund Return");
  // Annual-report date on Leases → Critical dates (fund scope)
  await FX.openTab(p, /^Leases/);
  await p.waitForTimeout(1500);
  await main.getByRole("button", { name: /^Whole fund/ }).click();
  await p.waitForTimeout(800);
  await main.getByRole("tab", { name: "Critical dates" }).click();
  await p.waitForTimeout(1500);
  check(/Annual report: Model GP LLC/.test(await main.innerText()), "annual-report date on the critical-dates list");

  await p.waitForTimeout(22000);
  const sf = (saved?.new_data ?? saved?.data)?.funds?.["Model Fund I"];
  check(sf?.launchDate === "2025-06-01" && /Two of three/.test(sf?.keyPerson ?? "") && sf?.entities?.some((e) => e.role === "gp" && e.einLast4 === "6789" && e.annualReportDue === "2027-03-01"), "saved: launch date, key person and entities on the fund");
  check(!JSON.stringify(sf?.entities ?? []).includes("3456789"), "saved: never the full EIN");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
