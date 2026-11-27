// 1.1.12 (code review, 11/27): saving. Records compare with keys in a fixed
// order (the database returns them in its own), and a save conflict merges
// the two versions field by field instead of replacing one with the other.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const Q = j(R + "/lib/records.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const eq = (a, b) => Q.sameData(a, b);

// Key order doesn't make a record "changed"
const a = { pipeline: { deals: [{ id: "p1", name: "A", stage: "loi" }] }, comps: { x: 1 }, baseCurve: null };
const reordered = { baseCurve: null, comps: { x: 1 }, pipeline: { deals: [{ stage: "loi", name: "A", id: "p1" }] } };
ok(JSON.stringify(a) !== JSON.stringify(reordered) && eq(a, reordered), "the same data in another key order is the same record");
const base = new Map([[Q.recId("settings", "main"), { kind: "settings", key: "main", sort: 0, version: 7, data: reordered }]]);
ok(Q.recordItems(base, [{ kind: "settings", key: "main", sort: 0, data: a }]).length === 0, "settings as the database returns them aren't re-saved after open");
ok(Q.recordItems(base, [{ kind: "settings", key: "main", sort: 0, data: { ...a, comps: { x: 2 } } }]).length === 1 && eq({ a: undefined, b: 1 }, { b: 1 }), "a real change is still saved; undefined fields don't count");

// Two people, one asset: different parts both kept
const b0 = { id: "d1", inputs: { propertyName: "Airport Flex Park", purchasePrice: 7200000, units: [{ id: "u1", name: "001", rent: 17 }, { id: "u2", name: "002", rent: 18 }], leasing: { prospects: [{ id: "p1", tenant: "X", stage: "tour" }] } } };
const mine = { ...b0, inputs: { ...b0.inputs, units: [{ id: "u1", name: "001", rent: 19 }, { id: "u2", name: "002", rent: 18 }] } }; // I changed unit 001's rent
const theirs = { ...b0, inputs: { ...b0.inputs, purchasePrice: 7300000, units: [{ id: "u1", name: "001", rent: 17 }, { id: "u2", name: "002", rent: 18, tenantName: "New Co" }, { id: "u3", name: "003", rent: 20 }], leasing: { prospects: [{ id: "p1", tenant: "X", stage: "loi" }] } } };
const m = Q.mergeData(b0, mine, theirs);
const u = (id) => m.data.inputs.units.find((x) => x.id === id);
ok(m.conflicts.length === 0 && u("u1").rent === 19 && u("u2").tenantName === "New Co" && u("u3")?.rent === 20 && m.data.inputs.purchasePrice === 7300000 && m.data.inputs.leasing.prospects[0].stage === "loi", "one asset: my rent change, their price, their unit edit, their new unit and their prospect stage are all kept");

// Both changed the same field: mine is kept and the field is named
const c = Q.mergeData(b0, { ...b0, inputs: { ...b0.inputs, purchasePrice: 7250000 } }, theirs);
ok(c.data.inputs.purchasePrice === 7250000 && c.conflicts.join() === "inputs.purchasePrice" && c.data.inputs.units.length === 3, "the same field changed twice: this browser's edit is kept, the field is reported, the rest still merges");

// Settings: the pipeline and GP partners live together; neither clobbers the other
const s0 = { pipeline: { deals: [{ id: "p1", name: "A", stage: "watching" }] }, gpPartners: { partners: [], agreements: [] }, comps: { n: 1 } };
const sMine = { ...s0, gpPartners: { partners: [{ id: "g1", name: "Fictional Capital Partners LP" }], agreements: [] } };
const sTheirs = { ...s0, pipeline: { deals: [{ id: "p1", name: "A", stage: "loi" }, { id: "p2", name: "B", stage: "watching" }] } };
const sm = Q.mergeData(s0, sMine, sTheirs);
ok(sm.conflicts.length === 0 && sm.data.gpPartners.partners.length === 1 && sm.data.pipeline.deals.length === 2 && sm.data.pipeline.deals[0].stage === "loi", "settings: my new GP partner and their pipeline changes are both kept");

// Removals
const rm = Q.mergeData(b0, mine, { ...b0, inputs: { ...b0.inputs, units: [{ id: "u1", name: "001", rent: 17 }] } });
ok(rm.data.inputs.units.length === 1 && rm.data.inputs.units[0].rent === 19, "a unit they removed stays removed (I hadn't changed it); my edit to another unit is kept");
const keep = Q.mergeData(b0, { ...b0, inputs: { ...b0.inputs, units: [{ id: "u1", name: "001", rent: 17 }, { id: "u2", name: "002", rent: 25 }] } }, { ...b0, inputs: { ...b0.inputs, units: [{ id: "u1", name: "001", rent: 17 }] } });
ok(keep.data.inputs.units.length === 2 && keep.data.inputs.units[1].rent === 25, "a unit they removed that I had changed is kept");

// No change on one side
ok(eq(Q.mergeData(b0, b0, theirs).data, theirs) && eq(Q.mergeData(b0, mine, b0).data, mine) && eq(Q.mergeData(b0, mine, mine).data, mine), "only one side changed: that side's version");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
