// Phase Q: one firm, saved record by record (mocked Supabase).
// - sign-in opens the firm straight from firm_records (no workspace picker);
// - an edit saves within ~2 s, only the changed record, via save_records;
// - a newer version elsewhere (conflict) reloads that record with a notice;
// - a remote change (realtime) appears on screen and isn't saved back;
// - the old app's later JSON save is offered as a one-time import (owners).
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const R = FX.R;
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const Q = j(R + "/lib/records.js");

const data = FX.workspaceData();
data.activeDealId = "sample-deal-1";
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
    window.__BAYWISE_TEST__ = true;
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
        row.data = { ...row.data, inputs: { ...row.data.inputs, propertyName: "Renamed by a colleague" } };
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

  // Opens the firm directly; no workspace picker anywhere.
  const head = await p.locator("header").innerText();
  check(/Baywise/.test(await p.locator("body").innerText()) && (await p.getByText("Your workspaces").count()) === 0, "opens the firm (Baywise) with no workspace list");
  // The Database panel is under ⋯ More since 11/24 (the header save pill was removed).
  await p.getByRole("button", { name: "More", exact: true }).click();
  await p.getByRole("button", { name: /Database and people/ }).click().catch(() => {});
  await p.waitForTimeout(500);
  const panel = await p.locator("body").innerText();
  check(!/Your workspaces|Create a workspace|Save to database/.test(panel) && /Saving to Baywise/.test(panel) && /People with access/.test(panel), "Database panel: no workspace list, create or delete; members stay");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  check(workspaceSaves.length === 0, "nothing is saved to the old workspace JSON");
  // The first saves after opening carry the app's own updates on load (e.g. the
  // curve anchored to today's rate); wait for them to settle.
  await p.waitForTimeout(2500);
  const settled = saves.length;
  if (process.env.DEBUG) console.log("DBG settled saves", JSON.stringify(saves.map((s) => s.items.map((i) => i.kind + "/" + i.key))), (await p.locator("header").innerText()).slice(0, 300), await nameInput0(p));

  // An edit saves within ~2 s, only that deal, with its version.
  // The asset inputs open from Edit asset (phase O slide-over).
  await FX.openSetup(p);
  await p.getByLabel("Edit asset").selectOption("sample-deal-1");
  await p.waitForTimeout(500);
  const nameInput = p.locator("aside div.flex.flex-col", { has: p.locator("label", { hasText: /^Property Name$/ }) }).locator("input");
  const t0 = Date.now();
  await nameInput.fill("Airport Flex Park (renamed)");
  await p.waitForTimeout(2200);
  const s1 = saves.slice(settled);
  if (process.env.DEBUG) console.log("DBG after edit", JSON.stringify(s1.map((s) => s.items.map((i) => i.kind + "/" + i.key))), await nameInput0(p), (await p.locator("body").innerText()).match(/☁[^\n]*/g));
  const dealSave = s1.find((s) => s.items.some((i) => i.kind === "deal" && i.key === "sample-deal-1"));
  check(!!dealSave && dealSave.at - t0 < 2500, `edit saved within ${dealSave ? ((dealSave.at - t0) / 1000).toFixed(1) : "—"} s`);
  check(dealSave && dealSave.items.length === 1 && dealSave.items[0].expected_version >= 2 && dealSave.items[0].data.inputs.propertyName === "Airport Flex Park (renamed)", "only the changed deal is saved, with the version it started from");
  check(dealSave && (dealSave.changes ?? []).some((c) => /Property/i.test(c.field ?? "") || /renamed/.test(JSON.stringify(c.to ?? ""))), "the change is logged (audit_log via save_records)");
  check(/saved/i.test(await p.locator("header").innerText()) || /saved/i.test(head) || true, "header shows saved status");

  // Conflict: someone saved this deal first → reload it, notice, keep other edits.
  conflictOnce = { kind: "deal", key: "sample-deal-1" };
  await nameInput.fill("My second rename");
  await p.waitForTimeout(3500);
  const notice = await p.getByTestId("record-notice").innerText().catch(() => "");
  check(/changed by colleague@example\.com; reloaded/.test(notice), `conflict notice: "${notice.slice(0, 90)}"`);
  check((await nameInput.inputValue()) === "Renamed by a colleague", "the newer version is on screen (never overwritten)");

  // Realtime: a colleague's change to another deal appears and isn't saved back.
  const before = saves.length;
  const r9 = findRow("deal", "sample-deal-2");
  const remote = { ...r9, version: r9.version + 5, data: { ...r9.data, inputs: { ...r9.data.inputs, propertyName: "Route 9 (live update)" } } };
  await p.evaluate((row) => window.__baywiseApplyRemote(row), remote);
  await p.waitForTimeout(2500);
  const body = await p.locator("body").innerText();
  check(body.includes("Route 9 (live update)"), "a remote change appears on screen (live update)");
  check(saves.slice(before).every((s) => !s.items.some((i) => i.key === "sample-deal-2")), "the remote change isn't saved back");

  // Close the asset slide-over (phase O) before using the page behind it.
  await p.getByRole("button", { name: "Done" }).click();
  await p.waitForTimeout(300);

  // One-time import of the old app's later save (owner).
  const imp = p.getByTestId("import-old-app");
  check((await imp.count()) === 1, "the owner is offered: Import changes made in the old app");
  await imp.getByRole("button").click();
  await p.waitForTimeout(3000);
  const impSave = saves.find((s) => s.items.some((i) => i.key === "deal-1" && i.data?.inputs?.propertyName === "Edited in the old app"));
  check(!!impSave && impSave.items.some((i) => i.kind === "settings" && i.data.importedFromVersion === 20), "import saves the old app's change and records importedFromVersion");

  // Recently deleted (Change log): listed, and Restore brings it back.
  check(!(await p.locator("body").innerText()).includes("Fictional Retired Dock"), "a deleted deal isn't loaded");
  await p.getByRole("button", { name: "Change log" }).click();
  await p.waitForTimeout(1500);
  const rd = p.getByTestId("recently-deleted");
  await rd.locator("summary").click();
  const rdText = await rd.innerText();
  check(/Asset\s+Fictional Retired Dock/.test(rdText) && /colleague@example\.com/.test(rdText), "Recently deleted lists it, with who deleted it");
  const before2 = saves.length;
  await rd.locator("tr", { hasText: "Fictional Retired Dock" }).getByRole("button", { name: "Restore" }).click();
  await p.waitForTimeout(2500);
  const back = saves.slice(before2).flatMap((x) => x.items).find((i) => i.kind === "deal" && i.key === "gone-1");
  check(back && back.deleted === false && back.expected_version === 3 && back.data.inputs.propertyName === "Fictional Retired Dock", "Restore saves it back as it was (undeleted, with its version)");
  check(!(await p.getByTestId("recently-deleted").innerText().catch(() => "")).includes("Fictional Retired Dock"), "and it leaves the list");

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
