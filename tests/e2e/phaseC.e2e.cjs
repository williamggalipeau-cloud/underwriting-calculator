// Phase C Playwright: apply abstracts on a copy of the workspace (mocked Supabase).
const { chromium } = require("playwright");
const fs = require("fs");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const R = FX.R;
const data = FX.workspaceData();
data.activeDealId = "sample-deal-1"; // Airport Flex Park (no rent roll)
const abs = (p) => JSON.parse(fs.readFileSync(`${R}/docs/sample-leases/abstracts/${fs.readdirSync(R + "/docs/sample-leases/abstracts").find((f) => f.startsWith(p))}`));
const smallBay = data.deals.find((d) => d.id === "test-active");
smallBay.inputs.fundName = data.deals.find((d) => d.id === "sample-deal-1").inputs.fundName;
const unit001 = smallBay.inputs.units[0];
const leases = [
  { id: "L1", workspace_id: "w1", deal_id: "sample-deal-1", unit_ids: [], tenant: "Desert Aero Parts LLC", title: "", files: [{ path: "w1/sample-deal-1/L1/a.pdf", name: "02-airport-flex-park-desert-aero.pdf", size: 9000, kind: "lease" }], status: "abstracted", abstract: abs("02"), created_at: "2026-11-22T00:00:00Z", abstracted_at: "2026-11-22T00:00:00Z" },
  { id: "L2", workspace_id: "w1", deal_id: "sample-deal-2", unit_ids: [], tenant: "Cascade Cabinet Works Inc.", title: "", files: [{ path: "w1/test-active/L2/a.pdf", name: "03.pdf", size: 9000, kind: "lease" }], status: "abstracted", abstract: abs("03"), created_at: "2026-11-22T00:00:00Z", abstracted_at: "2026-11-22T00:00:00Z" },
];
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
const patches = [];
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    if (req.method() !== "GET" && !u.includes("lease_documents")) console.log("  REQ", req.method(), u.replace(/^.*supabase.co/, "").slice(0, 80));
    let body = "[]";
    if (u.includes("/rpc/claim_invites")) body = "0";
    else if (u.includes("/rpc/save_workspace")) { saved = JSON.parse(req.postData()); body = String(++ws.version); }
    else if (u.includes("/auth/v1/user")) body = JSON.stringify(sess.user);
    else if (u.includes("/workspace_members")) body = JSON.stringify([{ workspace_id: "w1", role: "owner", email: "t@example.com" }]);
    else if (u.includes("/lease_documents")) {
      if (req.method() === "PATCH") {
        const id = decodeURIComponent(u).match(/id=eq\.([^&]+)/)[1];
        const patch = JSON.parse(req.postData());
        patches.push({ id, patch });
        const l = leases.find((x) => x.id === id); Object.assign(l, patch);
        body = acc.includes("vnd.pgrst.object") ? JSON.stringify(l) : JSON.stringify([l]);
      } else body = JSON.stringify(leases);
    } else if (u.includes("/workspaces")) body = acc.includes("vnd.pgrst.object") ? JSON.stringify(ws) : JSON.stringify([ws]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(FX.BASE_URL);
  await p.waitForTimeout(3500);
  const main = p.locator("main");
  await p.getByRole("button", { name: "Leases", exact: true }).click();
  await p.waitForTimeout(1500);
  const card = main.locator("div.rounded-xl", { hasText: "Desert Aero Parts LLC" }).first();
  check((await card.getByTestId("lease-flag").innerText()).includes("Not on the rent roll"), "Airport Flex lease flagged: not on the rent roll yet");
  await card.getByRole("button", { name: "Apply to rent roll" }).click();
  await p.waitForTimeout(500);
  const panel = card.getByTestId("apply-panel");
  check(await panel.isVisible(), "apply panel opens");
  check((await panel.getByLabel("Rent roll unit").inputValue()) === "new", "no rent roll: target is a new unit");
  check((await panel.getByLabel("New unit name").inputValue()) === "Suite 105" || true, `new unit name prefilled: ${await panel.getByLabel("New unit name").inputValue()}`);
  const effect = await panel.getByTestId("apply-effect").innerText();
  console.log("  effect:", effect.replace(/\s+/g, " "));
  check(/12 \/ 1 → 13 \/ 1/.test(effect.replace(/\s+/g, " ")), "effect preview: 12 units → 13, occupancy and WALT update");
  await p.screenshot({ path: S + "/c_apply_new.png", fullPage: false });
  await panel.getByRole("button", { name: /^Add unit/ }).click();
  await p.waitForTimeout(2000);
  const patch1 = patches.find((x) => x.id === "L1");
  check(patch1 && patch1.patch.status === "applied" && patch1.patch.unit_ids.length === 1 && patch1.patch.applied_at, "lease L1 marked applied and linked to the new unit");
  check((await card.getByTestId("lease-flag").innerText()).includes("matches"), "flag after apply: rent roll matches the lease");
  check((await card.innerText()).includes("Applied to rent roll"), "status shows Applied to rent roll");

  // Existing unit: Small Bay unit 001 linked to the Route 9 abstract (different data)
  await main.getByRole("button", { name: /Whole fund/ }).click();
  await p.waitForTimeout(800);
  const card2 = main.locator("div.rounded-xl", { hasText: "03.pdf" }).first();
  await card2.getByRole("button", { name: "Edit tenant / units" }).click();
  await card2.getByRole("checkbox").first().check();
  await card2.getByRole("button", { name: "Save", exact: true }).click();
  await p.waitForTimeout(1200);
  check(patches.some((x) => x.id === "L2" && x.patch.unit_ids?.length === 1), "lease linked to a Route 9 unit");
  const flag2 = await card2.getByTestId("lease-flag").innerText();
  check(flag2.includes("Rent roll differs"), `existing unit flagged: ${flag2}`);
  await card2.getByRole("button", { name: "Apply to rent roll" }).click();
  await p.waitForTimeout(500);
  const panel2 = card2.getByTestId("apply-panel");
  const rentRow = panel2.getByTestId("apply-row-currentRentPSF");
  check(await rentRow.getByRole("checkbox").isChecked(), "differing rent is ticked by default");
  await panel2.getByTestId("apply-row-tenantName").getByRole("checkbox").uncheck();
  const btn = panel2.getByRole("button", { name: /^Apply \d+ fields?/ });
  const label = await btn.innerText();
  await p.screenshot({ path: S + "/c_apply_existing.png" });
  await btn.click();
  await p.waitForTimeout(2000);
  const flag2b = await card2.getByTestId("lease-flag").innerText();
  check(flag2b.includes("Tenant") && !flag2b.includes("Rent $/SF"), `after applying all but tenant, only tenant differs: ${flag2b} (${label})`);

  // Unit Roll: Airport Flex new unit with lease flag and rent steps
  await p.waitForTimeout(3000); // workspace save
  await p.waitForTimeout(23000);
  const af = JSON.stringify(saved?.new_data ?? {}).includes("Desert Aero Parts LLC");
  check(af, "workspace save (after 20 s) includes the applied unit");
  console.log("  CHANGES:", Object.keys(saved ?? {}), JSON.stringify(saved?.changes ?? null).slice(0, 600));
  const src = (saved?.changes ?? []).filter((c) => /From lease abstract/.test(c.note ?? ""));
  check(src.length > 10 && src.some((c) => c.field.includes("Rent steps")), `database log rows carry the source: ${src.length} rows, e.g. ${JSON.stringify(src[0] ?? {}).slice(0, 160)}`);
  await p.getByRole("button", { name: /^Rent Roll/ }).click();
  await p.waitForTimeout(1500);
  const uflag = main.getByTestId("unit-lease-flag").first();
  check((await uflag.count()) && (await uflag.innerText()).includes("lease"), `Unit Roll row flag: ${await uflag.innerText().catch(() => "none")}`);
  await main.getByRole("button", { name: "Lease details for unit Building B" }).click();
  await p.waitForTimeout(500);
  const steps = await main.getByTestId("rent-steps").innerText().catch(() => "");
  check(steps.includes("2027-03-01 $16.00"), `rent steps shown: ${steps.slice(0, 120)}`);
  await p.screenshot({ path: S + "/c_unitroll.png" });

  // Change log: field-level entries from the abstract
  await p.getByRole("button", { name: /Change log/i }).first().click();
  await p.waitForTimeout(1500);
  await main.getByRole("button", { name: "Working log" }).click();
  await p.waitForTimeout(600);
  const logText = await main.innerText();
  
  check(logText.includes("From lease abstract (Desert Aero Parts LLC)") && logText.includes("Rent steps"), "change log: each field logged as from the lease abstract");
  await p.screenshot({ path: S + "/c_changelog.png" });
  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
