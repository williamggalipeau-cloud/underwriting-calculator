// Acquisitions → Acquisition Documents (11/24): the tab, uploads by stage
// before the SQL (new types filed as Other with "[acq]" in the title),
// existing types kept, read-only loan documents, the per-deal checklist and
// the filters. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const OLD_TYPES = ["om", "rent_roll", "t12", "loi", "psa", "ic_memo", "closing_acq", "closing_disp", "lpa", "ppm", "insurance_cert", "loan", "rate_cap", "appraisal", "estoppel", "cam", "billing", "other"];
data.activeDealId = "sample-deal-2";
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
const docs = [{ id: "loan-1", workspace_id: "w1", deal_id: "sample-deal-1", doc_type: "loan", title: "Loan agreement.pdf", files: [{ path: "w1/sample-deal-1/loan-1/loan.pdf", name: "Loan agreement.pdf" }], created_at: "2026-02-01T00:00:00Z", status: "uploaded", abstract: null }];
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
  await FX.openArea(p, "Pipeline");
  const ag = await p.getByRole("group", { name: "Acquisitions" }).getByRole("button").allInnerTexts();
  check(ag.map((t) => t.replace(/\s*\d+$/, "")).join() === "Pipeline,Deal Screener,Fund Impact,Research,Acquisition Documents", `Acquisitions tabs: ${ag.join(", ")}`);
  await FX.openTab(p, "Acquisition Documents");
  await p.waitForTimeout(1200);
  const box = p.getByTestId("acq-documents");
  check((await p.getByTestId("acq-doc-row").count()) === 1 && /read-only · Debt/.test(await box.innerText()), "an owned asset's loan agreement shows read-only (filed on Debt)");
  const opts = await box.getByLabel("Upload type").locator("option").allInnerTexts();
  check(opts.includes("Current leases") && opts.includes("Broker listing agreement") && opts.includes("Phase I environmental report") && opts.includes("Deed and title policy") && !opts.includes("Loan agreement") && !opts.includes("Rate cap confirmation"), "upload types by stage; no loan, cap or insurance uploads here");
  const up = async (deal, type, name) => {
    await box.getByLabel("Upload for deal").selectOption(deal);
    await box.getByLabel("Upload type").selectOption(type);
    await box.getByTestId("acq-file").setInputFiles({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fictional") });
    await p.waitForTimeout(1200);
  };
  await up("sample-deal-2", "om", "Example OM.pdf");
  check(docs.at(-1).doc_type === "om" && docs.at(-1).title === "[acq] Offering memo: Example OM.pdf" && docs.at(-1).deal_id === "sample-deal-2", "an OM keeps its type");
  await up("sample-deal-2", "phase1_esa", "Example ESA.pdf");
  check(refused.includes("phase1_esa") && docs.at(-1).doc_type === "other" && docs.at(-1).title === "[acq] Phase I environmental report: Example ESA.pdf", "before the SQL: a Phase I is filed as Other with its type in the title");
  await up("sample-deal-2", "current_leases", "Leases.pdf");
  const rows = p.getByTestId("acq-doc-row");
  const t = await box.innerText();
  check((await rows.count()) === 3 && /Phase I environmental report/.test(t) && /Under LOI or contract/.test(t) && /Current leases/.test(t), "listed by its real type and stage, filtered to the deal just uploaded to");
  const cl = await p.getByTestId("acq-checklist").innerText();
  check(/✓ Offering memo/.test(cl) && /✓ Phase I environmental report/.test(cl) && /○ PSA and amendments/.test(cl) && /Loan agreement \(on Debt\)/.test(cl), "the deal's checklist: what's in, what's missing");
  await p.screenshot({ path: `${S}/acq-documents-deal.png`, fullPage: true });
  await box.getByLabel("Filter stage").selectOption("screening");
  check((await rows.count()) === 2, "stage filter");
  await box.getByLabel("Filter deal").selectOption("");
  await box.getByLabel("Filter stage").selectOption("");
  check((await rows.count()) === 4, "all deals: 4 documents");
  await p.screenshot({ path: `${S}/acq-documents.png`, fullPage: true });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
