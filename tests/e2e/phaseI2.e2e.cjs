// Phase I part 2 Playwright: photos, location map, floor plan, demise /
// combine, actual NOI in Valuation and Sell/Hold. Fictional fixture; Supabase
// storage, Nominatim and the OpenStreetMap embed are mocked.
const { chromium } = require("playwright");
const zlib = require("zlib");
const FX = require("./fixture.cjs");
const S = FX.outDir();
const data = FX.workspaceData();
const DEAL = "sample-deal-2"; // Route 9 Small Bay (Kent, WA; the street is fictional)
const deal = data.deals.find((d) => d.id === DEAL);
// Six months of actual NOI for the business plan (fictional).
deal.inputs.businessPlan = { thresholdPct: 5, revisions: [], comments: {}, actuals: Object.fromEntries(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m, i) => [m, { noi: 60000 + i * 1000 }])) };

// A small PNG for photos and the floor plan.
function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const IMG = png(60, 40, [120, 160, 200]);
const PLAN = png(300, 100, [240, 240, 240]);

const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256" })}.${b64({ sub: "u1", email: "t@example.com", role: "authenticated", exp: now + 3600, aud: "authenticated" })}.sig`;
const sess = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user: { id: "u1", email: "t@example.com" } };
const ws = { id: "w1", name: "Model Fund I", version: 1, data, updated_at: new Date().toISOString(), updated_by_email: "t@example.com" };
let saved = null;
const allChanges = [];
const uploads = [], removed = [];
let geocodes = 0;
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
  const errs = [];
  await ctx.addInitScript((v) => localStorage.setItem("sb-nydqmigxorahfkfpkjnq-auth-token", v), JSON.stringify(sess));
  await ctx.route("**/nominatim.openstreetmap.org/**", (r) => {
    geocodes++;
    const q = decodeURIComponent(new URL(r.request().url()).searchParams.get("q") || "");
    // The street is fictional: only the city query matches.
    const body = /^\d/.test(q) ? "[]" : JSON.stringify([{ lat: "47.3809", lon: "-122.2348", display_name: "Kent, King County, Washington" }]);
    r.fulfill({ status: 200, contentType: "application/json", body });
  });
  await ctx.route("**/www.openstreetmap.org/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html><body>map</body></html>" }));
  await ctx.route("**/nydqmigxorahfkfpkjnq.supabase.co/**", (r) => {
    const req = r.request(); const u = req.url(); const acc = req.headers()["accept"] || "";
    if (u.includes("/storage/v1/object/sign/") && req.method() === "GET") return r.fulfill({ status: 200, contentType: "image/png", body: u.includes("floorplan") ? PLAN : IMG });
    if (u.includes("/storage/v1/object/sign/asset-photos")) {
      const { paths } = JSON.parse(req.postData());
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(paths.map((p) => ({ path: p, signedURL: `/object/sign/asset-photos/${p}?token=t`, error: null }))) });
    }
    if (u.includes("/storage/v1/object/asset-photos") && req.method() === "DELETE") { removed.push(...(JSON.parse(req.postData()).prefixes ?? [])); return r.fulfill({ status: 200, contentType: "application/json", body: "[]" }); }
    if (u.includes("/storage/v1/object/asset-photos/")) { const path = decodeURIComponent(u.split("/storage/v1/object/asset-photos/")[1]); uploads.push(path); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: `asset-photos/${path}` }) }); }
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
  await p.locator("div.cursor-pointer", { hasText: "Route 9 Small Bay" }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: /^Asset Business Plan/ }).first().click();
  await p.waitForTimeout(1200);
  const media = main.getByTestId("asset-media");
  check((await media.count()) === 1, "Asset Business Plan: photos, location and floor plan sections");

  // Photos
  await media.getByLabel("Upload photos").setInputFiles([{ name: "front.png", mimeType: "image/png", buffer: IMG }, { name: "dock.png", mimeType: "image/png", buffer: IMG }]);
  await p.waitForTimeout(1500);
  const items = media.getByTestId("photo-item");
  check((await items.count()) === 2 && uploads.filter((x) => x.startsWith("w1/sample-deal-2/photos/")).length === 2, `two photos uploaded to w1/sample-deal-2/photos/ (${uploads.join(", ")})`);
  check((await media.getByTestId("cover-photo").innerText()).includes("front.png"), "the first photo is the cover");
  const img = await media.getByTestId("cover-photo").locator("img").evaluate((e) => e.complete && e.naturalWidth);
  check(img === 60, "cover image loads from its signed link");
  await items.nth(1).getByLabel("Caption").fill("Dock doors, east side");
  await items.nth(1).getByLabel("Caption").blur();
  await items.nth(1).getByRole("button", { name: "Make cover" }).click();
  await p.waitForTimeout(500);
  check((await media.getByTestId("cover-photo").innerText()).includes("Dock doors, east side"), "caption and cover change");
  await items.nth(1).getByRole("button", { name: "Move earlier" }).click();
  await p.waitForTimeout(400);
  check((await items.nth(0).getByLabel("Caption").inputValue()) === "Dock doors, east side", "reordered");
  const bad = await media.getByLabel("Upload photos").setInputFiles([{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") }]).then(() => p.waitForTimeout(400)).then(() => main.getByTestId("media-msg").innerText());
  check(/isn't an image/.test(bad), "non-image files are refused");

  // Map: geocoded once (street not found → city), stored, attributed
  const map = media.getByTestId("asset-map");
  await map.getByRole("button", { name: "Locate on map" }).click();
  await p.waitForTimeout(1200);
  const src = await map.getByTestId("map-frame").getAttribute("src");
  check(src?.includes("openstreetmap.org/export/embed.html") && src.includes("marker=47.380900,-122.234800"), "map placed at the city when the street isn't found");
  check(geocodes === 2 && (await map.innerText()).includes("OpenStreetMap contributors"), `geocoded with ${geocodes} lookups; attribution shown`);

  // Floor plan: schematic first, coloured by status
  const fp = media.getByTestId("floor-plan");
  const boxes = fp.getByTestId("unit-box");
  const unitCount = await boxes.count();
  const info = await boxes.evaluateAll((els) => els.map((e) => ({ status: e.getAttribute("data-status"), name: e.querySelector("text").textContent, sf: Number((e.querySelector("title").textContent.match(/· ([\d,]+) SF/) || [])[1]?.replace(/,/g, "")) })));
  const vac = info.filter((x) => x.status === "vacant");
  const leased = info.find((x) => x.status !== "vacant");
  check(unitCount > 3 && vac.length >= 1 && !!leased, `schematic: ${unitCount} unit boxes, ${vac.length} vacant, coloured by status (${[...new Set(info.map((x) => x.status))].join(", ")})`);
  const pickBox = (name) => fp.locator(`g[data-testid="unit-box"]`).filter({ has: p.locator("text", { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`) }) }).first();

  // Demise a vacant unit into two, then combine them back
  const v = vac[0];
  await pickBox(v.name).click();
  const a = Math.round(v.sf * 0.4);
  await fp.getByLabel("New unit sizes (SF)").fill(`${a}, ${v.sf - a}`);
  await fp.getByRole("button", { name: "Demise", exact: true }).click();
  await p.waitForTimeout(600);
  check((await boxes.count()) === unitCount + 1 && (await fp.innerText()).includes(`${v.name}-A`) && (await fp.innerText()).includes(`${v.name}-B`), `demised ${v.name} into ${v.name}-A and ${v.name}-B`);
  await pickBox(`${v.name}-A`).click();
  await pickBox(`${v.name}-B`).click();
  await fp.getByRole("button", { name: "Combine 2 units" }).click();
  await p.waitForTimeout(600);
  const comb = `${v.name}-A/${v.name}-B`;
  check((await boxes.count()) === unitCount && (await fp.innerText()).includes(comb), `combined back into ${comb}`);
  await pickBox(leased.name).click();
  await fp.getByLabel("New unit sizes (SF)").fill("100, 100");
  await fp.getByRole("button", { name: "Demise", exact: true }).click();
  await p.waitForTimeout(300);
  check(/leased; only vacant/.test(await main.getByTestId("media-msg").innerText()), "a leased unit can't be demised");
  await fp.getByRole("button", { name: "Clear" }).click();

  // Upload a plan and draw a unit on it
  await fp.getByLabel("Upload floor plan").setInputFiles([{ name: "plan.png", mimeType: "image/png", buffer: PLAN }]);
  await p.waitForTimeout(1500);
  check(uploads.some((x) => x.startsWith("w1/sample-deal-2/floorplan/")) && (await boxes.count()) === 0, "plan uploaded; no units placed yet");
  const firstName = info[0].name;
  await fp.getByLabel("Unit to place").selectOption({ label: firstName });
  const svg = fp.getByTestId("floor-plan-svg");
  const bb = await svg.boundingBox();
  await p.mouse.move(bb.x + bb.width * 0.1, bb.y + bb.height * 0.2);
  await p.mouse.down();
  await p.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.7, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  check((await boxes.count()) === 1 && (await boxes.first().getAttribute("data-status")) !== null, `unit ${firstName} drawn on the plan`);
  await p.screenshot({ path: S + "/i2_media.png", fullPage: true });

  // Actual NOI in Valuation and Sell/Hold
  await p.getByRole("button", { name: "Valuation", exact: true }).click();
  await p.waitForTimeout(1500);
  const capCell = main.locator("tr", { hasText: "Route 9 Small Bay" }).getByTestId("actual-noi-cap");
  check((await capCell.count()) === 1 && /% on actual/.test(await capCell.innerText()), `Valuation: cap on actual NOI (${(await capCell.innerText().catch(() => "")).trim()})`);
  await p.getByRole("button", { name: /^Sell\/Hold Analysis/ }).first().click();
  await p.waitForTimeout(1500);
  const sh = await main.innerText();
  check(/Actual NOI/.test(sh) && /6 mo annualized/.test(sh), "Sell/Hold: actual NOI tile (6 months annualized)");

  // Saved
  await p.waitForTimeout(22000);
  const sd = (saved?.new_data ?? saved?.data)?.deals?.find((d) => d.id === DEAL)?.inputs;
  const am = sd?.assetMedia;
  check(am?.photos?.length === 2 && am.photos.some((x) => x.caption === "Dock doors, east side" && x.cover && x.order === 1), "saved: photos with caption, cover and order");
  check(am?.geo?.lat === 47.3809 && am.geo.query === "Kent, WA, 98032", "saved: the map point and the query it came from");
  check(am?.floorPlan?.path?.startsWith("w1/sample-deal-2/floorplan/") && Object.values(am.floorPlan.boxes ?? {}).some((b) => b.w > 0.15), "saved: the plan and the drawn box");
  check(sd?.units?.length === unitCount && sd.units.some((u) => u.name === comb && u.leaseStatus === "vacant"), "saved: the demised-then-combined unit in the rent roll");
  // Demise then combine within 60 s merge into one rent roll entry (the log's
  // usual rule for repeat edits to one field).
  check(allChanges.some((c) => /Units combined|Unit demised/.test(c.field ?? "")) && allChanges.some((c) => /Cover photo/.test(c.field ?? "")) && allChanges.some((c) => /Map location/.test(c.field ?? "")), `change log: rent roll, cover photo and map entries (${allChanges.map((c) => c.field).filter(Boolean).join(", ")})`);

  console.log("errors", errs);
  if (errs.length) fails++;
  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  await b.close(); process.exitCode = fails ? 1 : 0;
})();
