// Phase I part 2: photos, map, floor plan, demising / combining, actual NOI
// (lib/assetMedia.js) on fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const M = j(R + "/lib/assetMedia.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ── Photos ──
let m = M.mediaOf({});
ok(m.photos.length === 0 && m.floorPlan === null && m.geo === null, "empty media");
m = M.addPhotos(m, [{ path: "w/d/photos/a.jpg", name: "a.jpg", id: "p1" }, { path: "w/d/photos/b.jpg", name: "b.jpg", id: "p2" }], { date: "2026-11-01" });
ok(m.photos.length === 2 && m.photos[0].cover && !m.photos[1].cover && m.photos.every((p) => p.date === "2026-11-01"), "first photo becomes the cover; date stamped");
m = M.addPhotos(m, [{ path: "w/d/photos/c.jpg", name: "c.jpg", id: "p3" }]);
ok(M.orderedPhotos(m).map((p) => p.id).join() === "p1,p2,p3" && M.orderedPhotos(m).map((p) => p.order).join() === "1,2,3", "order 1…n in upload order");
m = M.movePhoto(m, "p3", -1);
ok(M.orderedPhotos(m).map((p) => p.id).join() === "p1,p3,p2", "move earlier");
ok(M.movePhoto(m, "p1", -1) === m, "can't move the first photo earlier");
m = M.setCover(m, "p2");
ok(M.coverPhoto(m).id === "p2" && m.photos.filter((p) => p.cover).length === 1, "one cover at a time");
m = M.updatePhoto(m, "p2", { caption: "Dock doors, east side", date: "2026-10-15", path: "evil" });
ok(m.photos.find((p) => p.id === "p2").caption === "Dock doors, east side" && m.photos.find((p) => p.id === "p2").path === "w/d/photos/b.jpg", "caption and date edit; the file path can't change");
m = M.removePhoto(m, "p2");
ok(M.coverPhoto(m).id === "p1" && m.photos.length === 2 && M.orderedPhotos(m).map((p) => p.order).join() === "1,2", "deleting the cover makes the first photo the cover");

// ── Unit status and schematic ──
const U = (id, sf, status, leaseEnd = "", rent = 12) => ({ id, name: id, squareFeet: sf, leaseStatus: status, leaseEnd, tenantName: status === "occupied" ? `T${id}` : "", currentRentPSF: rent });
ok(M.unitStatus(U("1", 1, "occupied", "2030-01-31"), "2026-11-23") === "occupied" && M.unitStatus(U("1", 1, "occupied", "2027-06-30"), "2026-11-23") === "expiring" && M.unitStatus(U("1", 1, "vacant"), "2026-11-23") === "vacant", "leased / expiring within 12 months / vacant");
const units = [U("001", 5000, "occupied", "2030-01-31"), U("002", 5000, "vacant"), U("003", 10000, "vacant", "", 10), U("004", 2500, "occupied", "2027-03-31"), U("005", 2500, "vacant", "", 14), U("006", 7500, "occupied", "2029-12-31")];
const sch = M.schematicLayout(units);
ok(sch.length === units.length && sch.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= 1 + 1e-9 && b.y + b.h <= 1 + 1e-9), "schematic: every unit inside the plan");
const rowsSF = {};
for (const b of sch) rowsSF[b.y] = (rowsSF[b.y] ?? 0) + b.w;
ok(Object.values(rowsSF).every((w) => close(w, 1)), "schematic: each row spans the full width");
const row0 = sch.filter((b) => b.y === sch[0].y);
const u0 = units.find((u) => u.id === row0[0].unitId), u1 = units.find((u) => u.id === row0[1]?.unitId);
ok(!u1 || close(row0[0].w / row0[1].w, u0.squareFeet / u1.squareFeet), "schematic: width in proportion to SF");
ok(M.schematicLayout([]).length === 0, "no units, no schematic");

// ── Floor plan boxes ──
let fpm = M.setFloorPlan(M.mediaOf({}), { path: "w/d/floorplan/plan.png", name: "plan.png", kind: "image" });
fpm = M.setBox(fpm, "003", { x: 0.6, y: 0.5, w: -0.4, h: -0.3 });
const b3 = fpm.floorPlan.boxes["003"];
ok(close(b3.x, 0.2) && close(b3.y, 0.2) && close(b3.w, 0.4) && close(b3.h, 0.3), "a box dragged up and left is normalized");
fpm = M.setBox(fpm, "005", { x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
ok(close(fpm.floorPlan.boxes["005"].x + fpm.floorPlan.boxes["005"].w, 1), "boxes are clamped to the plan");
fpm = M.setBox(fpm, "002", { x: 0.0, y: 0.2, w: 0.2, h: 0.3 });

// ── Demise ──
ok(!!M.demiseUnit(units, "001", [2500, 2500]).error, "a leased unit can't be demised");
ok(/add up to/.test(M.demiseUnit(units, "003", [4000, 5000]).error), "parts must add up to the unit's SF");
ok(!!M.demiseUnit(units, "003", [10000]).error, "at least two parts");
const d = M.demiseUnit(units, "003", [4000, 6000]);
ok(!d.error && d.units.length === 7 && d.ids.join() === "003-A,003-B", "003 demised into 003-A and 003-B");
ok(d.units.findIndex((u) => u.id === "003-A") === 2 && d.units.find((u) => u.id === "003-B").squareFeet === 6000 && d.units.every((u) => u.id !== "003"), "new units take the old unit's place");
const sumSF = (us) => us.reduce((s, u) => s + u.squareFeet, 0);
ok(sumSF(d.units) === sumSF(units), "total SF unchanged");
ok(d.units.filter((u) => u.demisedFrom === "003").every((u) => u.leaseStatus === "vacant" && u.currentRentPSF === 10), "new units vacant at the market rent");
const fpD = M.boxesAfterDemise(fpm, "003", d.units.filter((u) => d.ids.includes(u.id)));
ok(!fpD.floorPlan.boxes["003"] && close(fpD.floorPlan.boxes["003-A"].w, 0.16) && close(fpD.floorPlan.boxes["003-B"].x, 0.36) && close(fpD.floorPlan.boxes["003-B"].w, 0.24), "the box is split left to right by SF");

// ── Combine ──
ok(!!M.combineUnits(units, ["001", "002"]).error, "a leased unit can't be combined");
ok(!!M.combineUnits(units, ["002"]).error, "need two units");
const c = M.combineUnits(units, ["002", "005"]);
const merged = c.units.find((u) => u.id === c.id);
ok(!c.error && c.units.length === 5 && merged.name === "002/005" && merged.squareFeet === 7500, "002 + 005 → 002/005, 7,500 SF");
ok(close(merged.currentRentPSF, (5000 * 12 + 2500 * 14) / 7500, 0.006) && merged.leaseStatus === "vacant", "SF-weighted market rent; vacant");
ok(c.units.findIndex((u) => u.id === c.id) === 1 && sumSF(c.units) === sumSF(units), "takes the first unit's place; total SF unchanged");
const fpC = M.boxesAfterCombine(fpm, ["002", "005"], c.id);
const bc = fpC.floorPlan.boxes[c.id];
ok(!fpC.floorPlan.boxes["002"] && !fpC.floorPlan.boxes["005"] && close(bc.x, 0) && close(bc.y, 0.2) && close(bc.x + bc.w, 1) && close(bc.y + bc.h, 1), "combined box covers both");

// Demising and combining feed the model (rent-roll deals).
const fx = FX.workspaceData().deals.find((x) => (x.inputs.units ?? []).some((u) => u.leaseStatus !== "occupied") && x.inputs.units.length > 3);
if (fx) {
  const vac = fx.inputs.units.filter((u) => u.leaseStatus !== "occupied");
  const before = underwrite(fx.inputs);
  const dd = M.demiseUnit(fx.inputs.units, vac[0].id, [Math.floor(vac[0].squareFeet / 2), vac[0].squareFeet - Math.floor(vac[0].squareFeet / 2)]);
  const after = underwrite({ ...fx.inputs, units: dd.units });
  ok(!dd.error && isFinite(after.returns.irr) && dd.units.length === fx.inputs.units.length + 1, `${fx.inputs.propertyName}: demised unit ${vac[0].name} runs through the model (IRR ${before.returns.irr.toFixed(2)}% → ${after.returns.irr.toFixed(2)}%)`);
} else ok(false, "fixture deal with a vacant unit");

// ── Map (Google Maps, keyless embed) ──
const inp = { address: "6230 Runway Vista Drive", city: "Las Vegas", state: "NV", zip: "89119" };
ok(M.mapQuery(inp, null) === "6230 Runway Vista Drive, Las Vegas, NV, 89119", "map query: the full address");
ok(M.mapQuery(inp, { lat: 36.084, lon: -115.1537, source: "manual" }) === "36.084,-115.1537", "a point entered by hand wins");
ok(M.mapQuery({}, null) === "", "no address, no map");
const g = M.googleEmbedUrl(M.mapQuery(inp, null));
ok(g === "https://maps.google.com/maps?q=6230%20Runway%20Vista%20Drive%2C%20Las%20Vegas%2C%20NV%2C%2089119&t=m&z=16&output=embed", "Google embed URL (map)");
ok(M.googleEmbedUrl("x", { view: "satellite" }).includes("&t=k&"), "satellite view");
ok(M.googleEmbedUrl("Kent, WA", { key: "TESTKEY", view: "satellite" }) === "https://www.google.com/maps/embed/v1/place?key=TESTKEY&q=Kent%2C%20WA&zoom=16&maptype=satellite", "with a key: the Maps Embed API");
ok(M.cleanKey(' "AIzaTEST-key_1"\n') === "AIzaTEST-key_1" && M.googleEmbedUrl("x", { key: " AIzaTEST\n" }).includes("key=AIzaTEST&"), "spaces, line breaks and quotes around the key are dropped");
ok(M.cleanKey("GOOGLE_MAPS_EMBED_KEY=AIzaSyA1234567890abcdefghijklmnopqrstu\n") === "AIzaSyA1234567890abcdefghijklmnopqrstu", "a key pasted with its name in front is pulled out");
ok(M.GOOGLE_EMBED_KEY === "" && !g.includes("key="), "no key set in tests: keyless embed");
ok(M.googleMapsLink("Las Vegas, NV") === "https://www.google.com/maps/search/?api=1&query=Las%20Vegas%2C%20NV", "Open in Google Maps link");

// ── Actual NOI ──
const acts = {};
for (let i = 1; i <= 14; i++) acts[`2025-${String(((i - 1) % 12) + 1).padStart(2, "0")}`.replace("2025", i > 12 ? "2026" : "2025")] = { noi: i * 1000 };
const a12 = M.actualNoi({ businessPlan: { actuals: acts } }, "2026-11-23");
ok(a12.months === 12 && a12.from === "2025-03" && a12.to === "2026-02" && a12.noi === (3 + 14) * 12 / 2 * 1000, `trailing 12 months: $${a12.noi.toLocaleString()} (${a12.from} to ${a12.to})`);
const a3 = M.actualNoi({ businessPlan: { actuals: { "2026-07": { noi: 10000 }, "2026-08": { noi: 11000 }, "2026-09": { noi: 12000 } } } }, "2026-11-23");
ok(a3.months === 3 && a3.noi === 132000, "fewer than 12 months annualized");
ok(M.actualNoi({ businessPlan: { actuals: { "2026-12": { noi: 5 } } } }, "2026-11-23").months === 0, "months after the as-of date ignored");
ok(M.actualNoi({}, "2026-11-23").months === 0 && isNaN(M.actualNoi({}).noi), "no actuals");
ok(close(M.capOnActual(600000, 10000000), 6) && close(M.valueAtCap(600000, 6), 10000000) && isNaN(M.capOnActual(NaN, 1)), "cap on actual and value at a cap");

if (fail) { console.log(`\n${fail} failed`); process.exitCode = 1; } else console.log("\nall passed");
