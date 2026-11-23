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
const docs = [
  mkDoc("airport-flex-t12"), mkDoc("airport-flex-ic-memo"), mkDoc("airport-flex-psa"), mkDoc("airport-flex-insurance-desert-aero", { lease_id: LEASE_ID }),
  mkDoc("model-fund-i-lpa", { deal_id: null }),
  { ...mkDoc("airport-flex-om"), status: "uploaded", abstract: null },
];
const omId = docs[5].id;
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
    else if (u.includes("/rpc/save_deal_abstract")) { const a = JSON.parse(req.postData()); const d = docs.find((x) => x.id === a.doc); d.abstract = a.abstract; d.status = "abstracted"; body = '"abstracted"'; }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/storage/v1/object/sign/")) body = JSON.stringify({ signedURL: "/storage/v1/object/sign/x?token=t" });
    else if (u.includes("/storage/v1/object/deal-docs/")) { uploads.push(u); body = JSON.stringify({ Key: "x" }); }
    else if (u.includes("/deal_documents")) {
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), applied_fields: {}, status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; docs.push(row); body = one(row); }
      else if (req.method() === "PATCH") { const id = u.match(/id=eq\.([^&]+)/)[1]; const d = docs.find((x) => x.id === id); Object.assign(d, JSON.parse(req.postData())); body = one(d); }
      else body = JSON.stringify(docs);
    } else if (u.includes("/lease_documents")) body = JSON.stringify(leases);
    else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");
  await p.getByRole("button", { name: "Documents", exact: true }).click();
  await p.waitForTimeout(1500);
  check((await main.getByTestId("doc-card").count()) === 5, `asset view: 5 Airport Flex documents (${await main.getByTestId("doc-card").count()})`);

  // Upload a document
  await main.getByLabel("Document type").selectOption("loi");
  await main.getByLabel("Choose document PDFs").setInputFiles(`${D}/airport-flex-loi.pdf`);
  await main.getByRole("button", { name: "Upload", exact: true }).click();
  await p.waitForTimeout(1200);
  check(uploads.length === 1 && docs.some((d) => d.doc_type === "loi"), "LOI uploaded to the deal-docs bucket and listed");

  // Review with Claude + Save abstract (OM)
  const omCard = main.getByTestId("doc-card").filter({ hasText: "Offering memo" }).first();
  await omCard.getByRole("button", { name: "Review with Claude" }).click();
  await omCard.getByLabel("Document abstract JSON").fill(JSON.stringify(abs("airport-flex-om")));
  await omCard.getByRole("button", { name: "Save abstract" }).click();
  await p.waitForTimeout(1200);
  check(docs.find((d) => d.id === omId).abstract?.fields?.length === 12, "OM abstract saved through save_deal_abstract");
  check((await omCard.innerText()).includes("6.48%") && (await omCard.getByTestId("doc-viewer").innerText()).includes("checked locally"), "OM viewer: values with quotes, checked locally");
  check((await omCard.getByTestId("doc-mismatch").innerText()).includes("differ"), "OM mismatch badge vs the model");

  // T-12: apply one line
  const t12 = main.getByTestId("doc-card").filter({ hasText: "T-12" }).first();
  await t12.getByRole("button", { name: "Apply", exact: true }).click();
  const ap = t12.getByTestId("doc-apply");
  const taxRow = ap.getByTestId("doc-row-real_estate_taxes→realEstateTaxPSF");
  check((await taxRow.innerText()).includes("$1.25") && (await taxRow.innerText()).includes("$1.2"), "T-12 taxes $1.25/SF vs model $1.20/SF");
  for (const k of ["insurance→insurancePSF", "utilities→utilitiesPSF", "repairs_maintenance→maintenancePSF", "janitorial→janitorialPSF", "other_income→otherIncomePSF", "management_fee→managementFeePct"]) {
    const cb = ap.getByTestId(`doc-row-${k}`).getByRole("checkbox");
    if ((await cb.count()) && (await cb.isChecked())) await cb.uncheck();
  }
  await ap.getByRole("button", { name: /^Apply 1 field/ }).click();
  await p.waitForTimeout(1200);
  const t12doc = docs.find((d) => d.doc_type === "t12");
  check(t12doc.status === "applied" && Object.keys(t12doc.applied_fields).length === 1, "T-12 marked applied with the one field");
  check((await t12.getByTestId("doc-mismatch").innerText()).match(/\d+/)[0] !== "0", "badge stays on fields not taken");

  // IC memo: baseline + conditions
  const ic = main.getByTestId("doc-card").filter({ hasText: "Final IC memo" }).first();
  await ic.getByRole("button", { name: "Apply", exact: true }).click();
  await ic.getByTestId("doc-apply").getByRole("button", { name: /^Apply 2 field/ }).click();
  await p.waitForTimeout(1200);
  const iv = await main.getByTestId("ic-variance").innerText();
  check(iv.includes("IC approved vs current") && iv.includes("29.50%") && iv.includes("$7,200,000"), "IC approved vs current table");
  const conds = main.getByTestId("ic-conditions");
  check((await conds.innerText()).includes("4 open"), "4 conditions of approval open");
  await conds.getByRole("checkbox").first().check();
  await p.waitForTimeout(600);
  check((await conds.innerText()).includes("3 open") && (await conds.innerText()).includes("t@example.com"), "condition ticked off with who and when");

  // Insurance: gap vs the lease
  const ins = main.getByTestId("doc-card").filter({ hasText: "Insurance certificate" }).first();
  await ins.getByRole("button", { name: "Check coverage" }).click();
  const gaps = await ins.getByTestId("insurance-gap").allInnerTexts();
  check(gaps.length === 1 && /umbrella \$1,000,000 is below the lease's \$2,000,000/.test(gaps[0]), `insurance gap: ${gaps.join(" | ")}`);
  await p.screenshot({ path: S + "/e_docs.png", fullPage: false });

  // Fund view: LPA limits to the fund
  await main.getByRole("button", { name: /Whole fund/ }).click();
  await p.waitForTimeout(600);
  const lpa = main.getByTestId("doc-card").filter({ hasText: "Fund LPA" }).first();
  await lpa.getByRole("button", { name: "Apply", exact: true }).click();
  const la = lpa.getByTestId("doc-apply");
  check((await la.getByRole("checkbox", { checked: true }).count()) === 8, "LPA: 8 limits differ (fund terms already match)");
  await la.getByRole("button", { name: /^Apply 8 field/ }).click();
  await p.waitForTimeout(1200);

  // Leases → Critical dates include document deadlines
  await p.getByRole("button", { name: "Leases", exact: true }).click();
  await p.waitForTimeout(1200);
  await main.getByRole("tab", { name: "Critical dates" }).click();
  await main.getByTestId("critical-dates").getByLabel("Show").selectOption("all");
  const cdt = await main.getByTestId("critical-dates").innerText();
  check(cdt.includes("Due diligence expires; deposits go hard") && cdt.includes("IC condition: asset management plan due"), "PSA and IC deadlines on Critical dates");

  // Edit fund terms: LPA panel shows limits now applied
  await p.getByRole("button", { name: /^Fund Return/ }).click();
  await p.waitForTimeout(1500);
  await main.getByRole("button", { name: "Edit all terms" }).first().click();
  await p.waitForTimeout(800);
  const panel = p.getByTestId("lpa-panel");
  check((await panel.innerText()).includes("LPA") && (await panel.getByTestId("lpa-row-limit:state_pct").innerText()).includes("✓"), "Edit fund terms: LPA panel, limits already applied show ✓");
  await p.getByRole("button", { name: "Cancel" }).click();

  // Change log + database save
  await p.waitForTimeout(22000);
  const ch = (saved?.changes ?? []).map((c) => `${c.field} | ${c.note}`); console.log("  CH:", ch.filter((x) => /Limit|Fund|limit/.test(x)).join(" // ").slice(0, 600), (saved?.changes ?? []).length);
  check(ch.some((c) => /Real estate tax \$\/SF \| From T-12/.test(c)), "database log: T-12 field with its source");
  check(ch.some((c) => /Limit: Single state.*From Fund LPA/.test(c)), "database log: LPA limit with its source");
  check(JSON.stringify(saved?.new_data?.funds?.["Model Fund I"]?.limits ?? []).includes("6.2(c)"), "fund limits saved with clause");
  const af = saved?.new_data?.deals?.find((d) => d.id === "sample-deal-1")?.inputs;
  check(af?.realEstateTaxPSF === 1.25 && af?.icApproved?.price === 7200000 && af?.purchasePrice === 7200000, "deal saved: taxes $1.25, IC baseline, price unchanged");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
