// Phase Q: record-by-record storage (lib/records.js) on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const Q = j(R + "/lib/records.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const eq = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// Same split as the SQL migration, and a lossless round trip.
const data = { ...FX.workspaceData(), auditLog: [{ id: "a1", at: "2026-11-01T00:00:00Z", field: "x" }], valuations: { "sample-deal-1": { "2026-09-30": { value: 7650000 } } } };
delete data.baseCurve;
const recs = Q.recordsFromData(data);
const kinds = recs.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }), {});
ok(kinds.deal === data.deals.length && kinds.saved_deal === 3 && kinds.fund === 1 && kinds.valuation === 1 && kinds.settings === 1 && kinds.local_log === 1, `records by kind: ${JSON.stringify(kinds)}`);
ok(recs.filter((r) => r.kind === "deal").map((r) => r.sort).join() === data.deals.map((_, i) => i + 1).join(), "deals keep their order (sort 1…n)");
ok(eq(Q.dataFromRecords(recs), data), "rebuild(records) equals the original data exactly");
const shuffled = [...recs].reverse().map((r, i) => ({ ...r, version: 1 + (i % 3) }));
ok(eq(Q.dataFromRecords(shuffled), data), "rebuild doesn't depend on row order");
ok(!("auditLog" in recs.find((r) => r.kind === "settings").data) && recs.find((r) => r.kind === "local_log").data.entries.length === 1, "the working log is its own record, not in settings");

// Saving: only what changed, with the version it started from.
const base = new Map(recs.map((r) => [Q.recId(r.kind, r.key), { ...r, version: 3 }]));
const save0 = Q.savableRecords(data);
ok(!save0.some((r) => r.kind === "local_log") && !("activeDealId" in save0.find((r) => r.kind === "settings").data), "the working log and per-person view state are never saved");
const baseSav = new Map(save0.map((r) => [Q.recId(r.kind, r.key), { ...r, version: 3 }]));
ok(Q.recordItems(baseSav, save0).length === 0, "nothing changed → nothing to save");
const edited = structuredClone(data);
edited.deals[2].inputs.exitCapRatePct = 7.1;
edited.funds["Model Fund I"].prefPct = 9.75;
let items = Q.recordItems(baseSav, Q.savableRecords(edited));
ok(items.length === 2 && items.every((i) => i.expected_version === 3) && items.some((i) => i.kind === "deal" && i.key === edited.deals[2].id) && items.some((i) => i.kind === "fund"), "an edit saves only the changed deal and fund, each with its version");
const added = structuredClone(data);
added.deals.push({ id: "new-1", inputs: { propertyName: "New" } });
items = Q.recordItems(baseSav, Q.savableRecords(added));
ok(items.length === 1 && items[0].key === "new-1" && items[0].expected_version === null && items[0].sort === added.deals.length, "a new deal is inserted (no expected version)");
const removed = structuredClone(data);
const gone = removed.deals.splice(1, 1)[0];
items = Q.recordItems(baseSav, Q.savableRecords(removed));
ok(items.some((i) => i.key === gone.id && i.deleted === true && i.expected_version === 3) && items.filter((i) => !i.deleted).every((i) => i.kind === "deal" && "sort" in i), "a removed deal is marked deleted (never hard-deleted); the others are re-sorted");
const back = new Map(baseSav);
back.set(Q.recId("deal", gone.id), { ...baseSav.get(Q.recId("deal", gone.id)), deleted: true, version: 4 });
items = Q.recordItems(back, Q.savableRecords(data));
ok(items.length === 1 && items[0].key === gone.id && items[0].deleted === false && items[0].expected_version === 4, "restoring a deleted deal un-deletes it");

// Conflicts and remote changes.
ok(JSON.stringify(Q.conflictOf("Couldn't save: conflict: deal/sample-deal-1 is at version 4")) === JSON.stringify({ kind: "deal", key: "sample-deal-1" }), "conflict message → which record");
ok(Q.conflictOf("conflict: fund/Model Fund I no longer exists")?.key === "Model Fund I" && Q.conflictOf("network error") === null, "conflict parsing: names with spaces; non-conflicts ignored");
const remote = { kind: "deal", key: data.deals[3].id, data: { ...data.deals[3], inputs: { ...data.deals[3].inputs, exitCapRatePct: 8 } }, version: 9 };
let next = Q.applyRecord(data, remote);
ok(next.deals[3].inputs.exitCapRatePct === 8 && next.deals.length === data.deals.length && next.deals[2] === data.deals[2], "a remote deal change replaces just that deal");
next = Q.applyRecord(data, { kind: "deal", key: "x-new", data: { id: "x-new", inputs: {} } });
ok(next.deals.at(-1).id === "x-new", "a remote new deal is added");
next = Q.applyRecord(data, { kind: "deal", key: data.deals[0].id, deleted: true });
ok(next.deals.length === data.deals.length - 1 && !next.deals.some((d) => d.id === data.deals[0].id), "a remote deletion removes the deal");
next = Q.applyRecord({ ...data, activeDealId: "keep-me" }, { kind: "settings", key: "main", data: { anchorToLive: false, activeDealId: "theirs" } });
ok(next.anchorToLive === false && next.activeDealId === "keep-me", "remote settings apply, but not another person's view state");
next = Q.applyRecord(data, { kind: "fund", key: "Model Fund I", data: { ...data.funds["Model Fund I"], prefPct: 10 } });
ok(next.funds["Model Fund I"].prefPct === 10, "a remote fund change applies");

// Matches the SQL migration's split (supabase/firm_records.sql).
const sql = require("fs").readFileSync(R + "/supabase/firm_records.sql", "utf8");
ok(/d - 'deals' - 'savedDeals' - 'funds' - 'valuations' - 'auditLog'/.test(sql) && /'local_log', 'main', jsonb_build_object\('entries'/.test(sql), "settings and local_log split the same way as the migration");
console.log(fail ? fail + " FAILED" : "ALL PASS"); process.exit(fail ? 1 : 0);
