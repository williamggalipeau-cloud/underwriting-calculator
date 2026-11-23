// Revert from the change log Playwright: Revert one field, refuse a field
// changed since, restore a fund as of a date with a preview. Fictional
// fixture; Supabase mocked.
const { chromium } = require("playwright");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const FUND = "Model Fund I";
data.funds[FUND].prefPct = 9;
data.funds[FUND].mgmtFeePct = 1.5;
const at = (d) => `${d}T15:00:00.000Z`;
data.auditLog = [
  { id: "a1", at: at("2026-11-01"), user: "colleague@example.com", area: "Fund terms", item: FUND, field: "Management fee (%)", path: ["funds", FUND, "mgmtFeePct"], from: 1.25, to: 1.5 },
  { id: "a2", at: at("2026-11-10"), user: "colleague@example.com", area: "Fund terms", item: FUND, field: "Preferred return (%)", path: ["funds", FUND, "prefPct"], from: 8, to: 8.5 },
  { id: "a3", at: at("2026-11-12"), user: "colleague@example.com", area: "Fund terms", item: FUND, field: "Preferred return (%)", path: ["funds", FUND, "prefPct"], from: 8.5, to: 9 },
  { id: "a4", at: at("2026-11-15"), user: "colleague@example.com", area: "Deal", item: "Airport Flex Park", field: "Property name", path: ["deals", "sample-deal-1", "inputs", "propertyName"], from: "Old Airport Flex", to: "Airport Flex Park" },
  { id: "a5", at: at("2026-11-16"), user: "colleague@example.com", area: "Deal", item: "Route 9 Small Bay", field: "Property name", path: ["deals", "sample-deal-2", "inputs", "propertyName"], from: "Route 9", to: "Route 9 (renamed later)" },
];
data.activeDealId = "sample-deal-1";
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
    if (process.env.DEBUG && req.method() !== "GET") console.log("DBG", req.method(), u.replace(/.*supabase.co/, ""));
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
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  await p.getByRole("button", { name: "Change log" }).click();
  await p.waitForTimeout(800);
  const main = p.locator("main");
  await main.getByRole("button", { name: "Working log" }).click(); // the mocked database log is empty
  await p.waitForTimeout(300);
  const row = (text) => main.locator("tbody tr", { hasText: text });

  // ── Offered only where the field still holds the logged value ──
  check((await row("Old Airport Flex").getByTestId("revert").count()) === 1, "Revert offered: the name still holds the logged value");
  check((await row("Route 9 (renamed later)").getByTestId("revert").count()) === 0, "no Revert where the field was changed again since");
  check((await main.getByTestId("revert").count()) === 3, "three of five entries are revertable (latest pref, fee, name)");

  // ── Revert one field ──
  await row("Old Airport Flex").getByTestId("revert").click();
  await p.waitForTimeout(2500);
  check(/Reverted Airport Flex Park › Property name to Old Airport Flex/.test(await p.getByTestId("revert-msg").innerText()), "confirmation message");
  check((await row("Old Airport Flex").first().getByTestId("revert").count()) <= 1, "the revert entry itself can be reverted (redo)");

  // ── Restore the fund as of 11/5 ──
  await main.getByRole("button", { name: /Restore a deal or fund as of a date/ }).click();
  const panel = p.getByTestId("restore-panel");
  await panel.getByLabel("Restore record").selectOption({ label: `Fund: ${FUND}` });
  await panel.getByLabel("Restore date").fill("2026-11-05");
  await panel.getByRole("button", { name: "Preview" }).click();
  await p.waitForTimeout(300);
  const pv = await p.getByTestId("restore-preview").innerText();
  check(/Preferred return/.test(pv) && /\b9\b/.test(pv) && /\b8\b/.test(pv) && !/Management fee/.test(pv), `preview: pref 9 → 8 (two later edits undone), fee unchanged (before the date)`);
  await panel.getByRole("button", { name: "Apply restore" }).click();
  await p.waitForTimeout(2500);
  check(/Restored 1 field/.test(await p.getByTestId("restore-msg").innerText()), "restore applied");
  await p.waitForTimeout(22000); // the workspace autosave
  const sd = saved?.new_data ?? saved?.data;
  check(sd?.deals?.find((d) => d.id === "sample-deal-1")?.inputs?.propertyName === "Old Airport Flex", "the reverted value is saved");
  check(sd?.deals?.find((d) => d.id === "sample-deal-2")?.inputs?.propertyName === data.deals.find((d) => d.id === "sample-deal-2").inputs.propertyName, "nothing else changed");
  const rev = (sd?.auditLog ?? []).find((e) => e.revertOf === "a4");
  check(rev && rev.from === "Airport Flex Park" && rev.to === "Old Airport Flex" && rev.user === "t@example.com" && rev.source === "Revert", "logged as a revert, by whom and when");
  const sd2 = sd;
  check(sd2?.funds?.[FUND]?.prefPct === 8 && sd2?.funds?.[FUND]?.mgmtFeePct === 1.5, "saved: pref restored to 8; the fee (changed before the date) kept");
  check((sd2?.auditLog ?? []).some((e) => e.source === "Restore as of 2026-11-05" && e.from === 9 && e.to === 8), "the restore is logged");
  await p.screenshot({ path: `${S}/revert.png` });
  check(errs.length === 0, `no page errors${errs.length ? ": " + errs.slice(0, 2).join(" / ") : ""}`);
  await b.close();
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exitCode = fails ? 1 : 0;
})();
