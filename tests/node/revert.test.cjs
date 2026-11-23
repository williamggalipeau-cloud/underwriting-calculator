// Revert from the change log (lib/revert.js) on fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const V = j(R + "/lib/revert.js");
const A = j(R + "/lib/audit.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const state = {
  deals: [{ id: "d1", inputs: { propertyName: "Fictional Dock", rentPerSF: 12, units: [{ id: "u1", tenantName: "Example Co", rent: 5000 }] } }],
  funds: { "Model Fund I": { prefPct: 9, capitalActivity: [{ id: "c1", amount: 1e6, date: "2026-01-01" }] } },
  valuations: { d1: { "2026-09-30": { value: 10e6 } } },
  pipeline: { deals: [{ id: "p1", name: "Fictional Pipeline", stage: "loi" }] },
};
const root = V.revertRoot(state);
const e = (path, from, to, extra = {}) => ({ id: `e-${path.join(".")}`, at: "2026-11-20T10:00:00Z", area: "Deal", item: "x", field: path.at(-1), path, from, to, ...extra });

// ── One field ──
const rent = e(["deals", "d1", "inputs", "rentPerSF"], 11, 12);
ok(V.revertCheck(rent, root).ok, "a deal input can be reverted while it still holds the logged value");
const r1 = V.applyRevert(rent, root);
ok(r1.ok && r1.root.deals[0].inputs.rentPerSF === 11 && root.deals[0].inputs.rentPerSF === 12, "revert puts the earlier value back (state not mutated)");
ok(r1.log.from === 12 && r1.log.to === 11 && r1.log.revertOf === rent.id && r1.log.path === rent.path, "logged as a revert of that entry");
ok(r1.root.funds === root.funds && r1.root.deals[0].inputs.units === root.deals[0].inputs.units, "nothing else is touched");

// Nested ids, funds, capital activity, marks, pipeline.
ok(V.applyRevert(e(["deals", "d1", "inputs", "units", "u1", "rent"], 4500, 5000), root).root.deals[0].inputs.units[0].rent === 4500, "a unit's rent (array by id)");
ok(V.applyRevert(e(["funds", "Model Fund I", "prefPct"], 8, 9), root).root.funds["Model Fund I"].prefPct === 8, "a fund term");
ok(V.applyRevert(e(["funds", "Model Fund I", "capitalActivity", "c1", "amount"], 2e6, 1e6), root).root.funds["Model Fund I"].capitalActivity[0].amount === 2e6, "a capital activity amount");
ok(V.applyRevert(e(["valuations", "d1", "2026-09-30", "value"], 9e6, 10e6), root).root.valuations.d1["2026-09-30"].value === 9e6, "a valuation mark");
ok(V.applyRevert(e(["pipeline", "p1", "stage"], "screening", "loi"), root).root.pipeline[0].stage === "screening", "a pipeline deal's stage");
const added = V.applyRevert(e(["deals", "d1", "inputs", "newField"], undefined, undefined), root);
ok(!added.ok, "nothing to change → no revert");
const newKey = V.applyRevert(e(["deals", "d1", "inputs", "rentPerSF"], undefined, 12), root);
ok(newKey.ok && !("rentPerSF" in newKey.root.deals[0].inputs), "a field that didn't exist before is removed");

// ── Refusals ──
ok(/Changed again/.test(V.revertCheck(e(["deals", "d1", "inputs", "rentPerSF"], 10, 11), root).reason), "a field changed again since is not reverted (no later edit overwritten)");
ok(!V.revertCheck(e(["deals", "d1"], undefined, "added"), root).ok && !V.revertCheck(e(["deals", "d1", "inputs", "units", "u9"], "present", "removed"), root).ok, "whole records added / removed: not a field");
ok(!V.revertCheck(e(["savedDeals", "s1", "inputs", "x"], 1, 2), root).ok, "saved copies are fixed snapshots");
ok(/no longer exists/.test(V.revertCheck(e(["deals", "gone", "inputs", "rentPerSF"], 1, 12), root).reason), "a deleted deal");
ok(!V.revertCheck({ id: "n", note: "Loaded sample", path: [], from: undefined, to: undefined }, root).ok, "a note");
ok(!V.revertCheck(e(["funds", "Model Fund I", "capitalActivity", "c1", "purpose"], "acquisition – Dock", "other"), root).ok, "formatted log values never match raw data → not offered");

// ── appendChanges: a revert is always its own entry ──
const log = A.appendChanges([], [{ ...rent, id: undefined }], { user: "a@example.com", at: "2026-11-23T10:00:00Z" });
const log2 = A.appendChanges(log, [r1.log], { user: "a@example.com", at: "2026-11-23T10:00:20Z" });
ok(log2.length === 2 && log2[1].revertOf === rent.id, "a revert within a minute of the edit is still logged (not merged away)");

// ── Restore as of a date ──
const hist = [
  { id: "h1", at: "2026-11-01T09:00:00Z", path: ["deals", "d1", "inputs", "rentPerSF"], field: "Market rent", from: 10, to: 10.5 },
  { id: "h2", at: "2026-11-10T09:00:00Z", path: ["deals", "d1", "inputs", "rentPerSF"], field: "Market rent", from: 10.5, to: 11 },
  { id: "h3", at: "2026-11-15T09:00:00Z", path: ["deals", "d1", "inputs", "rentPerSF"], field: "Market rent", from: 11, to: 12 },
  { id: "h4", at: "2026-11-16T09:00:00Z", path: ["deals", "d1", "inputs", "propertyName"], field: "Property name", from: "Old Dock", to: "Fictional Dock" },
  { id: "h5", at: "2026-11-17T09:00:00Z", path: ["funds", "Model Fund I", "prefPct"], field: "Pref", from: 8, to: 9 },
  { id: "h6", at: "2026-11-18T09:00:00Z", path: ["deals", "d1", "inputs", "units", "u2"], field: "Units › u2", from: "present", to: "removed" },
];
const rs = V.restoreAsOf(root, hist, ["deals", "d1"], "2026-11-05");
const d = rs.root.deals[0].inputs;
ok(d.rentPerSF === 10.5 && d.propertyName === "Old Dock", "restore as of 11/5: rent back to 10.5 (two later edits undone), name back");
ok(rs.changes.length === 2 && rs.changes.find((c) => c.field === "Market rent").now === 12, "preview: one row per field, now → restored");
ok(rs.root.funds === root.funds, "the fund is not touched when restoring a deal");
ok(rs.skipped.length === 1 && rs.undone === 3, "a removed unit can't be undone here; it's listed as skipped");
ok(V.restoreAsOf(root, hist, ["deals", "d1"], "2026-11-30").changes.length === 0, "nothing after the date → nothing to restore");

// ── Recently deleted ──
const rows = [
  { kind: "deal", key: "g1", deleted: true, data: { id: "g1", inputs: { propertyName: "Fictional Retired Dock" } }, updated_at: "2026-11-20T10:00:00Z", updated_by_email: "colleague@example.com" },
  { kind: "fund", key: "Old Fund", deleted: true, data: { name: "Old Fund" }, updated_at: "2026-11-22T10:00:00Z" },
  { kind: "deal", key: "d1", deleted: true, data: { id: "d1", inputs: {} }, updated_at: "2026-11-23T10:00:00Z" },
  { kind: "valuation", key: "g1", deleted: true, data: {} },
  { kind: "deal", key: "live", deleted: false, data: { id: "live", inputs: {} } },
];
const rd = V.recentlyDeleted(rows, state);
ok(rd.map((x) => `${x.type}:${x.name}`).join() === "Fund:Old Fund,Asset:Fictional Retired Dock", "deleted deals and funds, newest first; marks, live rows and ones already back are left out");
ok(rd[1].by === "colleague@example.com" && rd[1].data.inputs.propertyName === "Fictional Retired Dock", "with who deleted it and the record as it was");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
