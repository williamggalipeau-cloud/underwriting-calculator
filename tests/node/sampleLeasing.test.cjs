// 1.1.2: Sample data → Add sample prospects (lib/sampleLeasing.js) and the
// Dashboard's Vacant Units (lib/home.js vacantUnits) on the fictional Model
// Fund I fixture with its sample rent rolls.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const L = j(R + "/lib/sampleLeasing.js");
const H = j(R + "/lib/home.js");
const M = j(R + "/lib/sampleRentRolls.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const T = "2026-11-25";
const data = FX.workspaceData();
let deals = data.deals.filter((d) => d.inputs.fundName === "Model Fund I").map((d) => ({ ...d, inputs: M.withMarkToMarket(d.inputs, M.mtmIndex(d.inputs.propertyName), T) }));
const sample = deals.filter((d) => d.id.startsWith("sample-deal-"));
const vacantOf = (d) => (d.inputs.units ?? []).filter((u) => u.leaseStatus !== "occupied");

// Vacant Units before: every vacant unit, none with prospects
const before = H.vacantUnits(deals, { todayISO: T });
const nVac = deals.filter((d) => d.inputs.acquisitionDate <= T).reduce((s, d) => s + vacantOf(d).length, 0);
ok(before.length === nVac && nVac > 0, `every vacant unit on the owned assets' rent rolls (${before.length})`);
ok(before.every((v) => v.prospects === 0 && !v.best && v.askingRentPSF > 0 && v.sf > 0), "before prospects: asking rent and SF on each, no prospects");
ok(before.every((v, i) => i === 0 || before[i - 1].asset <= v.asset), "sorted by asset");

const { updates, counts } = L.addSampleLeasing(deals, { todayISO: T });
ok(counts.assets === sample.length && Object.keys(updates).every((id) => id.startsWith("sample-deal-")), `a pipeline on each of the ${sample.length} sample assets, only those`);
deals = deals.map((d) => (updates[d.id] ? { ...d, inputs: { ...d.inputs, ...updates[d.id] } } : d));
for (const d of deals.filter((x) => updates[x.id])) {
  const ps = d.inputs.leasing.prospects;
  ok(ps.length >= 1 && ps.some((p) => p.kind === "renewal") && ps.every((p) => p.id.startsWith(L.SAMPLE_PROSPECT_PREFIX) && (d.inputs.units ?? []).some((u) => u.id === p.unitId)), `${d.inputs.propertyName}: ${ps.length} prospects incl. a renewal, each on one of its units`);
}
const all = deals.flatMap((d) => d.inputs.leasing?.prospects ?? []);
ok(new Set(all.map((p) => p.stage)).size >= 5 && all.some((p) => p.stage === "lost" && p.lostReason), `stages from inquiry to lease out, and one lost with a reason (${[...new Set(all.map((p) => p.stage))].join(", ")})`);
ok(all.filter((p) => p.stage !== "lost").every((p) => p.nextStep && p.nextDate > T && p.nextDate <= "2026-12-23"), "active prospects have a next step in the coming four weeks");
ok(all.some((p) => p.nextDate && p.nextDate <= "2026-12-02"), "some next steps fall within 7 days (Actions Needed)");
const comps = deals.flatMap((d) => (d.inputs.leasing?.comps ?? []).filter((c) => c.id.startsWith(L.SAMPLE_UNIT_COMP_PREFIX)));
ok(comps.length === sample.reduce((s, d) => s + vacantOf(d).length, 0) * 3, `three rent comps per sample vacant unit (${comps.length})`);
ok(comps.every((c) => /\(fictional\)/.test(c.address) && c.signDate < T && c.rentPSF > 0 && c.leaseType === "NNN"), "comps: fictional addresses, signed in the past, NNN");

// Vacant Units after
const after = H.vacantUnits(deals, { todayISO: T });
const withP = after.filter((v) => v.prospects > 0), none = after.filter((v) => !v.prospects);
ok(withP.length >= 8 && none.length >= 3, `most vacant units have prospects, some none (${withP.length} with, ${none.length} without)`);
const best = withP.find((v) => v.prospects > 1);
ok(best && ["tour", "proposal", "loi", "leaseout"].includes(best.best.stage) && best.next?.text && best.next.days >= 0, `best prospect is the furthest along, with the soonest next step: ${best?.asset} ${best?.unit} ${best?.best?.stage}`);
ok(after.filter((v) => v.dealId.startsWith("sample-deal-")).every((v) => v.comps >= 3 && Math.abs(v.compAvgPSF / v.askingRentPSF - 1) < 0.07), "each sample vacant unit: rent comps near its size, averaging within 7% of the asking rent");
ok(after.every((v) => v.planTargetPSF == null), "no plan target without a business plan");
ok(after.filter((v) => v.dealId.startsWith("sample-deal-")).every((v) => L.SAMPLE_LEASING_MANAGERS.includes(v.leasingManager)), "every sample vacant unit has a leasing manager");
const hl = after.filter((v) => v.asset === "Harbor Light Industrial");
ok(hl.length >= 2 && hl[0].leasingManager !== hl[1].leasingManager, `a unit can have its own leasing manager (Harbor Light: ${hl.map((v) => v.leasingManager).join(", ")})`);
ok(after.filter((v) => !v.dealId.startsWith("sample-deal-")).every((v) => v.leasingManager === ""), "no manager set: blank (shown as Unassigned)");
const own = L.addSampleLeasing(deals.map((d) => (d.id === "sample-deal-4" ? { ...d, inputs: { ...d.inputs, leasingManager: "Pat Example" } } : d)), { todayISO: T });
ok(own.updates["sample-deal-4"].leasingManager === "Pat Example", "an asset's own leasing manager is kept");

// Reruns and user data
const mine = deals.map((d) => (d.id === "sample-deal-2" ? { ...d, inputs: { ...d.inputs, leasing: { ...d.inputs.leasing, prospects: [...d.inputs.leasing.prospects, { id: "lp-mine", unitId: vacantOf(d)[0].id, stage: "tour", tenant: "My Own Prospect" }], comps: [...d.inputs.leasing.comps, { id: "rc-mine", rentPSF: 10, sf: 2000 }] } } } : d));
const again = L.addSampleLeasing(mine, { todayISO: T });
const r9 = again.updates["sample-deal-2"].leasing;
ok(r9.prospects.filter((p) => p.id === "lp-mine").length === 1 && r9.prospects.length === updates["sample-deal-2"].leasing.prospects.length + 1, "a rerun replaces the sample prospects and keeps the user's");
ok(r9.comps.filter((c) => c.id === "rc-mine").length === 1 && r9.comps.length === updates["sample-deal-2"].leasing.comps.length + 1, "and keeps the user's comps");
ok(JSON.stringify(again.updates["sample-deal-3"].leasing) === JSON.stringify(updates["sample-deal-3"].leasing) && again.updates["sample-deal-3"].leasingManager === updates["sample-deal-3"].leasingManager, "same pipeline, comps and manager on a rerun the same day");
ok(L.addSampleLeasing(deals.filter((d) => !d.id.startsWith("sample-deal-")), { todayISO: T }).counts.assets === 0, "no sample assets: nothing added");
process.exit(fail ? 1 : 0);
