// 1.1.14: the automatic sample load on a firm saved record by record, with the
// production save timing (the 2-minute autosave, not the 1-second test one).
// On the firm's live data (11/27) version 3 saved the fund's terms but not the
// nine assets' changes. Cause: the asset changes sat unsaved while the
// documents uploaded; moving to another tab then showed the unsaved-changes
// box, and Discard changes threw them away while the load carried on. Here
// the person moves to another tab mid-load; the asset changes must still be
// saved, and the version recorded. Fictional fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const R = FX.R;
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const Q = j(R + "/lib/records.js");

const SF = j(R + "/lib/sampleFund.js"); const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const data = FX.workspaceData();
// a fund as 1.1.12 left it: assets without the 1.1.13 terms, version 2
const built = SF.buildSampleFund({ todayISO: "2026-11-27", docTerms: false });
const bd = built.deals ?? built.built ?? built;
data.deals = (Array.isArray(bd) ? bd : []).map((d) => { const i = { ...d.inputs }; delete i.propertyManager; delete i.propertyManagementFirm; delete i.dispositions; return { id: d.id, inputs: i }; });
data.funds = { "Model Fund I": { ...DEFAULT_FUND_TERMS, name: "Model Fund I", targetEquity: 100000000, sampleDataVersion: 2 } };
data.activeDealId = "sample-deal-1";
let uploading = false, discarded = false, sawDialog = false;
const rows = Q.recordsFromData(data).map((r) => ({ ...r, deleted: false, version: 2, updated_at: "2026-11-22T20:00:00Z", updated_by_email: "t@example.com" }));
// A deal deleted earlier: kept in the database, marked deleted (Recently deleted).
rows.push({ kind: "deal", key: "gone-1", sort: 99, data: { ...data.deals[1], id: "gone-1", inputs: { ...data.deals[1].inputs, propertyName: "Fictional Retired Dock" } }, deleted: true, version: 3, updated_at: "2026-11-21T18:00:00Z", updated_by_email: "colleague@example.com" });
const firm = { id: "w1", name: "Baywise", version: 20, storage: "records", archived: false, records_from_version: 19, updated_at: "2026-11-22T20:00:00Z" };
const legacy = { data: { ...data, deals: data.deals.map((d) => (d.id === "deal-1" ? { ...d, inputs: { ...d.inputs, propertyName: "Edited in the old app" } } : d)) }, version: 20 };

const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const saves = [];
let conflictOnce = null; // { kind, key } to refuse once
const workspaceSaves = [];
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const nameInput0 = async (p) => p.locator("aside div.flex.flex-col", { has: p.locator("label", { hasText: /^Property Name$/ }) }).locator("input").inputValue().catch((e) => "ERR " + e.message.slice(0, 80));
const findRow = (kind, key) => rows.find((r) => r.kind === kind && r.key === key);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => {
    localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v);
    window.__BAYWISE_TEST__ = true; Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
  }, JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", async (r) => {
    const req = r.request();
    const u = decodeURIComponent(req.url());
    const acc = req.headers()["accept"] || "";
    const single = acc.includes("vnd.pgrst.object");
    let body = "[]";
    let status = 200;
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_records")) {
      const p = JSON.parse(req.postData());
      if (conflictOnce && p.items.some((i) => i.kind === conflictOnce.kind && i.key === conflictOnce.key)) {
        const c = conflictOnce;
        conflictOnce = null;
        const row = findRow(c.kind, c.key);
        row.version += 1;
        row.data = { ...row.data, inputs: { ...row.data.inputs, propertyName: "Renamed by a colleague", city: "Colleague City" } };
        row.updated_by_email = "colleague@example.com";
        status = 400;
        body = JSON.stringify({ code: "40001", message: `conflict: ${c.kind}/${c.key} is at version ${row.version}`, details: null, hint: null });
      } else {
        saves.push({ at: Date.now(), ...p });
        body = JSON.stringify(p.items.map((i) => {
          const row = findRow(i.kind, i.key);
          if (row) { row.version += 1; if (i.data) row.data = i.data; if (i.sort != null) row.sort = i.sort; row.deleted = !!i.deleted; return { kind: i.kind, key: i.key, version: row.version }; }
          rows.push({ kind: i.kind, key: i.key, sort: i.sort ?? 0, data: i.data, deleted: false, version: 1 });
          return { kind: i.kind, key: i.key, version: 1 };
        }));
      }
    } else if (u.includes("/rpc/save_workspace")) { workspaceSaves.push(1); body = "1"; }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/firm_records")) {
      const kind = u.match(/kind=eq\.([^&]+)/)?.[1];
      const key = u.match(/key=eq\.([^&]+)/)?.[1];
      body = kind ? JSON.stringify(findRow(kind, key) ?? null) : JSON.stringify(rows);
    } else if (u.includes("/storage/v1/object/")) { body = JSON.stringify({ Key: "x" });
    } else if (u.includes("/rpc/save_deal_abstract") || u.includes("/rpc/save_lease_abstract")) { body = '"abstracted"';
    } else if (u.includes("/deal_documents") || u.includes("/lease_documents") || u.includes("/lease_credit_documents")) {
      if (req.method() === "POST" && u.includes("/deal_documents")) uploading = true;
      if (req.method() === "POST") { const row = { created_at: new Date().toISOString(), status: "uploaded", abstract: null, ...JSON.parse(req.postData()) }; body = single ? JSON.stringify(row) : JSON.stringify([row]); } else body = "[]";
    } else if (u.includes("/workspaces")) {
      if (u.includes("select=data")) body = single ? JSON.stringify(legacy) : JSON.stringify([legacy]);
      else body = single ? JSON.stringify(firm) : JSON.stringify([firm]);
    } else if (u.includes("/audit_log")) body = "[]";
    r.fulfill({ status, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);

  // While the documents upload, the person moves to another tab. If the box
  // about unsaved changes appears, they choose Discard changes.
  for (let i = 0; i < 240; i++) {
    await p.waitForTimeout(250);
    if (uploading && !discarded) {
      discarded = true;
      await FX.openTab(p, "Debt").catch(() => {});
      const dlg = p.getByTestId("leave-dialog");
      if (await dlg.isVisible().catch(() => false)) { sawDialog = true; await dlg.getByRole("button", { name: "Discard changes" }).click(); }
    }
    if (saves.some((s) => s.items.some((x) => x.kind === "fund" && x.data?.sampleDataVersion >= 3))) break;
  }
  await p.waitForTimeout(4000);
  const fund = findRow("fund", "Model Fund I");
  const assets = rows.filter((r) => r.kind === "deal" && r.key.startsWith("sample-deal-"));
  check(discarded, `the person moved to another tab during the load (${sawDialog ? "the unsaved-changes box appeared and they chose Discard" : "no unsaved-changes box: the asset changes were already saved"})`);
  check(fund?.data?.sampleDataVersion === 4 && (fund.data.entities ?? []).length === 11, `the fund's version and legal entities are saved (version ${fund?.data?.sampleDataVersion}, ${(fund?.data?.entities ?? []).length} entities)`);
  const noPm = assets.filter((r) => !r.data.inputs.propertyManager).map((r) => r.key);
  check(assets.length === 9 && noPm.length === 0, `all nine assets are saved with their property manager${noPm.length ? " — missing on: " + noPm.join(", ") : ""}`);
  check(assets.every((r) => r.data.inputs.icApproved || r.data.inputs.lenderName) && ["sample-deal-2", "sample-deal-3", "sample-deal-6"].every((k) => (findRow("deal", k).data.inputs.dispositions ?? []).length === 1), "the document terms and the three sales in progress are saved on the assets");
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
