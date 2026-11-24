// Phase E Playwright: Documents tab on a workspace copy (mocked Supabase).
const { chromium } = require("playwright");
const fs = require("fs");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const R = FX.R;
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
const D = R + "/docs/sample-deal-docs/deals";
const abs = (n) => JSON.parse(fs.readFileSync(`${D}/abstracts/${n}.json`));
const lease02 = JSON.parse(fs.readFileSync(R + "/docs/sample-leases/abstracts/02-airport-flex-park-desert-aero.json"));
const LEASE_ID = "00000000-0000-0000-0000-0000000000aa";
const leases = [{ id: LEASE_ID, workspace_id: "w1", deal_id: "sample-deal-1", unit_ids: [], tenant: "Desert Aero Parts LLC", title: "", files: [{ path: "w1/x/a.pdf", name: "02.pdf", size: 9, kind: "lease" }], status: "abstracted", abstract: lease02, created_at: "2026-11-22T00:00:00Z" }];
let seq = 0;
const mkDoc = (n, extra = {}) => ({ id: `00000000-0000-0000-0000-00000000${String(100 + ++seq)}`, workspace_id: "w1", deal_id: "sample-deal-1", fund_name: "Model Fund I", doc_type: abs(n).doc_type, title: abs(n).title, lease_id: null, files: [{ path: `w1/sample-deal-1/x/${n}.pdf`, name: `${n}.pdf`, size: 20000 }], status: "abstracted", abstract: abs(n), applied_fields: {}, created_at: "2026-11-22T00:00:00Z", created_by_email: "t@example.com", ...extra });
const docs = [mkDoc("airport-flex-appraisal-2026q3"), mkDoc("route9-appraisal-2026q2", { deal_id: "sample-deal-2" })];

const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null; const uploads = [];
let fails = 0; const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = decodeURIComponent(req.url()); const acc = req.headers()["accept"] || "";
    let body = "[]";
    const one = (x) => (acc.includes("vnd.pgrst.object") ? JSON.stringify(x) : JSON.stringify([x]));
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/deal-docs/")) { uploads.push(u); body = JSON.stringify({ Key: "x" }); }
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), applied_fields: {}, status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; docs.push(row); body = one(row); }
      else if (req.method() === "PATCH") { const id = u.match(/id=eq\.([^&]+)/)[1]; const d = docs.find((x) => x.id === id); Object.assign(d, JSON.parse(req.postData())); body = one(d); }
      else body = JSON.stringify(docs);
    } else if (u.includes("/lease_documents")) body = "[]";
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");

  await FX.openTab(p, "Documents");
  await p.waitForTimeout(1200);
  await main.getByRole("button", { name: /Whole fund/ }).click();
  await p.waitForTimeout(600);
  const af = main.getByTestId("doc-card").filter({ hasText: "Airport Flex Park appraisal" }).first();
  check((await af.getByTestId("doc-mismatch").innerText()).includes("differ"), "appraisal not applied yet: mismatch badge");
  await af.getByRole("button", { name: "Apply", exact: true }).click();
  const ap = af.getByTestId("doc-apply");
  const apt = await ap.innerText();
  check(apt.includes("Q3") && apt.includes("$7,650,000") && (await ap.getByTestId("cost-hold-warning").count()) === 0, "Airport Flex: Q3 2026 mark, outside the cost hold");
  const vs = await ap.getByTestId("appraisal-vs-uw").innerText();
  check(vs.includes("NOI vs underwritten year 1") && vs.includes("-50 bp") && vs.includes("+6.3%"), "appraisal vs underwriting (NOI, caps, value vs price)");
  await ap.getByRole("button", { name: /Apply to the .* mark/ }).click();
  await p.waitForTimeout(1200);
  check(docs[0].status === "applied" && docs[0].applied_fields["mark:2026-09-30"], "appraisal marked applied (Q3 2026 mark)");
  const r9 = main.getByTestId("doc-card").filter({ hasText: "Route 9 Small Bay appraisal" }).first();
  await r9.getByRole("button", { name: "Apply", exact: true }).click();
  check((await r9.getByTestId("cost-hold-warning").count()) === 1, "Route 9 Q2 2026: cost hold warning");

  // Valuation tab: the mark with its PDF link
  await FX.openTab(p, "Valuation");
  await p.waitForTimeout(1500);
  await main.locator("tr", { hasText: "Airport Flex Park" }).getByRole("button", { name: "Marks", exact: true }).first().click();
  await p.waitForTimeout(800);
  const pdf = main.getByTestId("mark-pdf");
  console.log("  ED:", (await main.locator("tr.bg-blue-50\\/20").first().innerText().catch(() => "none")).slice(0, 500).replace(/\s+/g, " "));
  check((await pdf.count()) >= 1 && (await pdf.first().innerText()).includes("p. 1"), "Valuation: the appraisal mark links to its PDF page");
  await p.screenshot({ path: S + "/g_val.png" });

  await p.waitForTimeout(22000);
  const mk = saved?.new_data?.valuations?.["sample-deal-1"]?.["2026-09-30"];
  check(mk?.value === 7650000 && mk?.source === "appraisal" && mk?.docId, "saved: Q3 2026 appraisal mark with its document");
  check((saved?.changes ?? []).some((c) => /2026-09-30 › Fair value/.test(c.field) && /From appraisal/.test(c.note ?? "")), "database log: the mark with its source");
  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
