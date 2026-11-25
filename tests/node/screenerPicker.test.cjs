// 1.1.6: Deal Screener → the Pipeline Deal dropdown (lib/screenerPicker.js):
// every Pipeline deal, grouped Active / History; what picking each shows;
// the blank-tenant sample leases Load Model Fund I replaces (lib/sampleDocs.js).
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const S = j(R + "/lib/screenerPicker.js");
const P = j(R + "/lib/pipeline.js");
const D = j(R + "/lib/sampleDocs.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const row = (id, stage, more = {}) => P.makePipelineDeal({ id, name: id, stage, askingPrice: 5e6, noi: 3e5, sf: 30000, expectedClose: "2027-03-31", targetFund: "Fund A", ...more }, { today: "2026-11-01" });
const rows = [
  row("Watch", "watching"),
  row("Screen", "screening", { dealId: "d-screen" }),
  row("Contract", "psa", { dealId: "d-psa" }),
  row("Loi", "loi"),
  row("OldPass", "passed", { stageDate: "2026-06-30", passReason: "price", dealId: "d-pass" }),
  row("NewPass", "passed", { stageDate: "2026-10-15" }),
  row("Closed", "closed", { stageDate: "2026-03-14", dealId: "d-closed" }),
  row("ClosedPending", "closed", { expectedClose: "2026-09-01" }),
  row("OtherFund", "screening", { targetFund: "Fund B" }),
];
const deals = [
  { id: "d-screen", inputs: { propertyName: "Screen", fundName: "" } },
  { id: "d-psa", inputs: { propertyName: "Contract", fundName: "" } },
  { id: "d-pass", inputs: { propertyName: "OldPass", fundName: "" } },
  { id: "d-closed", inputs: { propertyName: "Closed", fundName: "Fund A", acquisitionDate: "2026-03-14" } },
  { id: "d-loose", inputs: { propertyName: "Loose deal", fundName: "" } },
  { id: "d-owned", inputs: { propertyName: "Owned", fundName: "Fund A", acquisitionDate: "2024-01-01" } },
];
const isPipelineDeal = (d) => !d.inputs.fundName;

const g = S.screenerOptions(rows, deals, { isPipelineDeal });
ok(g.active.map((o) => o.rowId).join() === "Contract,Loi,OtherFund,Screen,Watch", `Active by stage (PSA, LOI, screening, watching), then name: ${g.active.map((o) => o.rowId).join()}`);
ok(g.history.map((o) => o.rowId).join() === "NewPass,ClosedPending,OldPass,Closed", `History newest first: ${g.history.map((o) => o.rowId).join()}`);
ok(g.active.find((o) => o.rowId === "Loi").meta === "LOI · not screened yet" && g.active.find((o) => o.rowId === "Contract").meta === "Under contract (PSA) · screened", "Active rows say their stage and whether they're screened");
ok(g.history.find((o) => o.rowId === "Closed").meta === "Closed 3/14/2026 → asset" && g.history.find((o) => o.rowId === "ClosedPending").meta === "Closed 9/1/2026 → not converted yet", "closed rows point to the asset (or say not converted yet)");
ok(g.history.find((o) => o.rowId === "OldPass").meta === "Passed / lost 6/30/2026 · read-only", "passed rows are read-only, dated when the stage was set");
ok(g.other.map((o) => o.dealId).join() === "d-loose", "a pipeline deal with no Pipeline row is still listed (Not on the Pipeline); owned assets never are");

const gA = S.screenerOptions(rows, deals, { scope: "Fund A", isPipelineDeal });
ok(!gA.active.some((o) => o.rowId === "OtherFund") && gA.active.length === 4, "Select Portfolio: rows targeting another fund are left out");

const kind = (id) => S.screenerState(rows.find((r) => r.id === id), deals).kind;
ok(kind("Contract") === "screened" && kind("Loi") === "new" && kind("OldPass") === "passed" && kind("Closed") === "closed", "states: screened, new, passed, closed");
ok(S.screenerState(rows.find((r) => r.id === "Closed"), deals).asset?.id === "d-closed" && !S.screenerState(rows.find((r) => r.id === "ClosedPending"), deals).asset, "closed: the asset it became, if converted");
ok(S.screenerState(row("Gone", "loi", { dealId: "deleted-deal" }), deals).kind === "new", "a row whose model was deleted counts as not screened");

ok(S.selectedRow(rows, deals, { activeDealId: "d-psa" })?.id === "Contract", "the row linked to the deal on screen is selected");
ok(S.selectedRow(rows, deals, { activeDealId: "d-psa", pickedRowId: "Loi" })?.id === "Loi", "a picked row with no model (a viewer's pick) is shown instead");
ok(S.selectedRow(rows, deals, { activeDealId: "d-psa", pickedRowId: "Screen" })?.id === "Contract", "a picked row with a model gives way to the deal on screen (the pick sets it)");
ok(S.selectedRow(rows, deals, { activeDealId: "d-owned" }) === null, "an owned asset on screen: no row selected");

ok(P.makePipelineDeal({ name: "x", stageDate: "2026-11-02" }).stageDate === "2026-11-02" && P.makePipelineDeal({ name: "x" }).stageDate === "", "pipeline rows keep the date their stage was set");

const leases = [
  { id: 1, deal_id: "sample-deal-1", tenant: "" },
  { id: 2, deal_id: "sample-deal-2", tenant: "  " },
  { id: 3, deal_id: "sample-deal-3", tenant: "Acme Fabrication" },
  { id: 4, deal_id: "user-deal-1", tenant: "" },
];
ok(D.blankSampleLeases(leases).map((l) => l.id).join() === "1,2", "Load Model Fund I replaces only sample assets' leases with no tenant name");

console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
