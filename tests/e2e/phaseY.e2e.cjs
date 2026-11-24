// Phase Y Playwright: Benchmarking tab after Stress Testing: the fund's own
// TWR, uploads of the fictional sample benchmarks (NCREIF, Preqin,
// Cambridge, monthly REIT returns), TWR vs. NCREIF, vintage quartiles with a
// strategy filter, PME, assets, Excel and PDF, saved with the firm settings
// and summarized in the change log. The fixture fund's dates are moved four
// years earlier so it has history. Supabase mocked.
const { chromium } = require("playwright");
const path = require("path");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const SB = path.resolve(__dirname, "..", "..", "docs", "sample-benchmarks") + "/";
const data = FX.workspaceData();
const shift = (iso) => (iso ? `${Number(iso.slice(0, 4)) - 4}${iso.slice(4)}` : iso);
const fn = "Model Fund I";
data.funds[fn] = { ...data.funds[fn], finalClose: shift(data.funds[fn].finalClose), firstClose: shift(data.funds[fn].firstClose) };
data.deals = data.deals.map((d) => (d.inputs.fundName === fn ? { ...d, inputs: { ...d.inputs, acquisitionDate: shift(d.inputs.acquisitionDate) } } : d));
data.valuations = {};
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
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
  await FX.openArea(p, "Portfolio Debt");
  const pm = p.getByRole("group", { name: "Portfolio Management" });
  const tabs = await pm.getByRole("button").allInnerTexts();
  check(tabs.findIndex((t) => /^Benchmarking/.test(t)) === tabs.findIndex((t) => /^Stress Testing/.test(t)) + 1, "a Benchmarking tab after Stress Testing");
  await FX.openTab(p, "Benchmarking");
  await p.waitForTimeout(2500);
  const bm = p.getByTestId("benchmarking");
  check(/Licensed data/.test(await p.getByTestId("bm-license").innerText()), "marked licensed data, internal by default");
  check(/vintage 2022/.test(await bm.innerText()) && /No benchmarks uploaded yet/.test(await p.getByTestId("bm-sources").innerText()), "vintage 2022; nothing uploaded yet");
  const si0 = await p.getByTestId("bm-period").first().innerText();
  check(/Since inception/.test(si0) && /\d+\.\d%/.test(si0), `the fund's own TWR without benchmarks: ${si0.replace(/\s+/g, " ")}`);

  // ── Uploads ──
  await bm.getByRole("button", { name: "Upload benchmark" }).click();
  const up = p.getByTestId("bm-upload");
  const send = async (kind, key, file, source) => {
    await up.getByLabel("Benchmark kind").selectOption(kind);
    if (key) await up.getByLabel("Benchmark", { exact: true }).selectOption(key);
    await up.getByLabel("Benchmark source").fill(source);
    await up.getByTestId("bm-file").setInputFiles(SB + file);
    await p.waitForTimeout(500);
    const map = await p.getByTestId("bm-mapping").innerText();
    await p.getByTestId("bm-mapping").getByRole("button", { name: "Import" }).click();
    await p.waitForTimeout(500);
    return { map, msg: await p.getByTestId("bm-msg").innerText() };
  };
  let r = await send("index", "npiInd", "ncreif-npi-industrial.csv", "Sample (fictional)");
  check(/Quarter ← "Quarter" · Total ← "Total Return"/.test(r.map) && /Imported 31 quarters of NCREIF NPI Industrial/.test(r.msg), `NCREIF upload: ${r.msg}`);
  await send("index", "npi", "ncreif-npi.csv", "Sample (fictional)");
  r = await send("vintage", "preqin", "preqin-vintage-quartiles.csv", "Sample (fictional)");
  check(/Imported 42 Preqin quartile rows/.test(r.msg), `Preqin upload: ${r.msg}`);
  await send("vintage", "cambridge", "cambridge-vintage-quartiles.csv", "Sample (fictional)");
  r = await send("monthly", null, "reit-monthly-returns.csv", "Sample (fictional)");
  check(/FTSE Nareit Industrial/.test(r.msg) && /STAG/.test(r.msg) && /S&P 500/.test(r.msg), `monthly upload: ${r.msg}`);
  const srcTxt = await p.getByTestId("bm-sources").innerText();
  check(/NCREIF NPI Industrial \(Sample \(fictional\)\), \d{4}-\d\d-\d\d/.test(srcTxt), `sources listed with their note and date: ${srcTxt.slice(0, 160)}`);

  // ── TWR vs NCREIF ──
  const si = await p.getByTestId("bm-period").first().innerText();
  check(/pts\)/.test(si) && (si.match(/\d+\.\d%/g) ?? []).length >= 4, `since inception vs. NPI Industrial and NPI: ${si.replace(/\s+/g, " ")}`);
  check(/not enough history/.test(await p.getByTestId("bm-period").nth(3).innerText()), "5 years: not enough history");
  check((await p.getByTestId("bm-chart").locator("polyline").count()) === 3, "chart: fund, NPI Industrial, NPI");
  // ── Vintage quartiles ──
  const pq = await p.getByTestId("bm-vintage-preqin").innerText();
  check(/Value Added/.test(pq) && /(Top|Second|Third|Bottom) quartile/.test(pq), `Preqin: ${pq.replace(/\s+/g, " ").slice(0, 120)}`);
  await bm.getByLabel("Strategy").selectOption("Industrial");
  await p.waitForTimeout(300);
  check(/Industrial/.test(await p.getByTestId("bm-vintage-preqin").innerText()), "strategy filter");
  check(/Real Estate/.test(await p.getByTestId("bm-vintage-cambridge").innerText()), "Cambridge: its one strategy");
  // ── PME ──
  const pme = await p.getByTestId("bm-pme-row").first().innerText();
  check(/FTSE Nareit Industrial/.test(pme) && /\d\.\d\d · \d+\.\d% vs -?\d+\.\d%/.test(pme), `PME vs. Nareit Industrial: ${pme.replace(/\s+/g, " ")}`);
  check(/\d\.\d\d/.test(await p.getByTestId("bm-pme-row").nth(1).innerText()), "PME vs. the peer basket");
  check(/part of any gap is leverage/.test(await bm.innerText()), "leverage note");
  // ── Assets ──
  check((await p.getByTestId("bm-assets").locator("tbody tr").count()) >= 9 && /NPI Industrial/.test(await p.getByTestId("bm-assets").innerText()), "assets vs. NPI Industrial");
  // ── Exports ──
  const [dx] = await Promise.all([p.waitForEvent("download"), bm.getByRole("button", { name: "Excel" }).click()]);
  check(/^benchmarking-.*\.xlsx$/.test(dx.suggestedFilename()), "Excel");
  const [dp] = await Promise.all([p.waitForEvent("download"), bm.getByRole("button", { name: "PDF", exact: true }).click()]);
  const pdfPath = `${S}/benchmarking.pdf`; await dp.saveAs(pdfPath);
  const txt = require("child_process").execFileSync("pdftotext", ["-layout", pdfPath, "-"]).toString();
  check(/Benchmarking: Model Fund I/.test(txt) && /licensed data/.test(txt) && /Public market equivalent/.test(txt) && /Sources/.test(txt), "PDF: internal, licensed, PME and sources");
  // ── Saved with the firm settings, one log entry each ──
  await p.waitForTimeout(22000);
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.comps?.benchmarks?.index?.npiInd?.rows?.length === 31 && sd.comps.benchmarks.monthly.STAG.rows.length === 94 && sd.comps.benchmarks.vintage.preqin.by === "t@example.com", "saved with the firm's settings");
  const logged = (sd?.auditLog ?? []).filter((e) => e.area === "Benchmarks");
  check(logged.length >= 11 && logged.every((e) => /rows from/.test(e.to)), `change log: ${logged.length} summary entries`);
  await p.screenshot({ path: `${S}/benchmarking.png`, fullPage: true });

  // ── The quarterly report's Benchmarks section (plan: Y feeds the report) ──
  await FX.openTab(p, "Reports");
  await p.waitForTimeout(1500);
  const rbm = p.getByTestId("report-benchmarks");
  const rt = await rbm.innerText().catch(() => "");
  check(/Benchmarks/.test(rt) && /as of 2026-Q3/.test(rt) && /not in the shareable version/.test(rt), "Reports (shareable): a Benchmarks section, marked not in the shareable version by default");
  check((await p.getByTestId("report-bench-returns").locator("tbody tr").count()) === 3 && /NPI Industrial/.test(rt) && /(Top|2nd|3rd|Bottom) quartile/.test(rt) && /\d\.\d\dx/.test(await p.getByTestId("report-bench-pme").innerText()), "returns (since inception, 1 and 3 years), vintage quartiles and PME");
  const [s1] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "PDF (draft)" }).click()]);
  await s1.saveAs(`${S}/report-shareable.pdf`);
  check(!/Benchmarks ·/.test(require("child_process").execFileSync("pdftotext", ["-layout", `${S}/report-shareable.pdf`, "-"]).toString()), "shareable PDF: no benchmark page until included");
  await rbm.getByLabel("Include benchmarks in the shareable version").check();
  await p.waitForTimeout(600);
  check(!/not in the shareable version/.test(await rbm.innerText()), "included in the shareable version");
  const [s2] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "PDF (draft)" }).click()]);
  await s2.saveAs(`${S}/report-shareable2.pdf`);
  const t2 = require("child_process").execFileSync("pdftotext", ["-layout", `${S}/report-shareable2.pdf`, "-"]).toString();
  check(/Benchmarks · /.test(t2) && /Time-weighted return/.test(t2) && /Vintage 2022 peers/.test(t2) && /Public market equivalent/.test(t2) && /Sources: /.test(t2), "the report PDF gets a Benchmarks page with its sources");
  await rbm.screenshot({ path: `${S}/report-benchmarks.png` });

  // ── Report on one asset (user, 11/24) ──
  const ron = await p.getByLabel("Report on").locator("option").allInnerTexts();
  const pickName = ron.find((x) => x === "Route 9 Small Bay") ?? ron[1];
  await p.getByLabel("Report on").selectOption({ label: pickName });
  await p.waitForTimeout(1200);
  const ar = p.getByTestId("asset-report");
  const at = await ar.innerText().catch(() => "");
  check(at.includes(pickName) && /Equity IRR to date/i.test(at) && /Occupancy/i.test(at) && (await p.getByTestId("report-benchmarks").count()) === 0, "Report on an asset: the asset's report (value, returns, operations), no fund sections");
  check(/Benchmark since \d{4}-Q\d: asset -?\d+\.\d% a year vs\. NCREIF NPI Industrial/.test(await p.getByTestId("asset-report-bench").innerText()), "the asset's benchmark line (included in the shareable version)");
  check((await ar.getByLabel("Letter").inputValue()).includes(pickName), `a draft letter for the asset (${pickName}; options: ${ron.slice(0, 4).join(", ")})`);
  const [ap] = await Promise.all([p.waitForEvent("download"), ar.getByRole("button", { name: "PDF (draft)" }).click()]);
  await ap.saveAs(`${S}/asset-report.pdf`);
  const apt = require("child_process").execFileSync("pdftotext", ["-layout", `${S}/asset-report.pdf`, "-"]).toString();
  check(/Asset quarterly report/.test(apt) && apt.includes(pickName) && /Operations and plan/.test(apt) && /Leases expiring/.test(apt), "asset report PDF");
  await ar.getByRole("button", { name: "Issue report" }).click();
  await p.waitForTimeout(600);
  check((await ar.getByTestId("issued-report").count()) === 1 && /v1 · shareable/.test(await ar.getByTestId("issued-report").innerText()), "issued for the asset");
  await p.screenshot({ path: `${S}/asset-report.png`, fullPage: true });
  await p.getByLabel("Report on").selectOption("");
  await p.waitForTimeout(800);
  check((await p.getByTestId("report-stats").count()) === 1 && (await p.getByTestId("report-issued").getByTestId("issued-report").count()) === 0, "back to the portfolio: the fund report, its own issued list");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
