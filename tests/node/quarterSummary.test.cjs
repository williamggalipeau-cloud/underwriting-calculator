// Summary on top of the quarterly report (11/24): quarterSummary and the
// Excel rows, on fictional report figures.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const Q = j(R + "/lib/quarterlyReport.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const rep = (o = {}) => ({
  kind: "shareable", quarterLabel: "Q3 2026", quarter: "2026-Q3",
  fund: { name: "Fictional Fund", assets: 2, sf: 300000 },
  nav: { end: 50e6, start: 48e6, contributions: 0, distributions: 0, valueChange: 2e6 },
  returns: { netIrr: 9.5, tvpi: 1.2, dpi: 0.1, rvpi: 1.1, grossIrr: 12 },
  capital: { pctCalled: 60, commitments: 100e6, called: 60e6, distributed: 6e6 },
  debt: { ltv: 52 },
  portfolio: [{ id: "a", name: "Fictional Dock", sf: 100000, occupancy: 90 }, { id: "b", name: "Sample Yard", sf: 200000, occupancy: 100 }],
  ...o,
});
const now = rep();
const prev = rep({ quarterLabel: "Q2 2026", nav: { end: 48e6 }, returns: { netIrr: 8.5, tvpi: 1.15, dpi: 0.1 }, capital: { pctCalled: 55 }, debt: { ltv: 52 }, portfolio: [{ id: "a", name: "Fictional Dock", sf: 100000, occupancy: 80 }, { id: "b", name: "Sample Yard", sf: 200000, occupancy: 100 }] });

ok(Math.abs(Q.occupancyOf(now) - (90 * 1 + 100 * 2) / 3) < 1e-9, "occupancy weighted by SF");
const s = Q.quarterSummary(now, prev, { issued: [{ v: 1, kind: "shareable", at: "2026-10-20T00:00:00Z", by: "a@example.com" }, { v: 2, kind: "shareable", at: "2026-10-22T00:00:00Z", by: "a@example.com" }], watch: [{ name: "Fictional Dock", score: 4, reasons: ["rollover"] }] });
const c = Object.fromEntries(s.change.map((x) => [x.label, x]));
ok(c["LP NAV"].change === 2e6 && Math.abs(c["Net LP IRR"].change - 1) < 1e-9 && Math.abs(c["TVPI"].change - 0.05) < 1e-9 && c["LP capital called"].change === 5, "change vs. last quarter by measure");
ok(Math.abs(c["Occupancy"].change - 10 / 3) < 1e-9 && c["Loan to value"].change === 0 && c["Assets"].change === 0, "occupancy moved; LTV and asset count did not");
ok(s.moved.map((x) => x.label).join() === "LP NAV,Net LP IRR,TVPI,LP capital called,Occupancy", `measures that moved: ${s.moved.map((x) => x.label)}`);
ok(s.prevLabel === "Q2 2026" && s.issued.count === 2 && s.issued.latest.v === 2, "prior quarter label and the latest issued version");
ok(s.watch === null, "the watch list never goes in the shareable version");
const si = Q.quarterSummary({ ...now, kind: "internal" }, prev, { watch: [{ name: "Fictional Dock", score: 4, reasons: ["rollover"] }] });
ok(si.watch.length === 1 && si.watch[0].name === "Fictional Dock" && si.issued.latest === null, "internal version: the watch list; nothing issued yet");
ok(Q.quarterSummary(now, null).change === null, "no prior quarter: no change table");
ok(Q.quarterSummary(rep({ returns: { note: "too early", netIrr: 50 } }), prev).change.find((x) => x.label === "Net LP IRR").change === null, "net IRR not yet meaningful: no change shown");

ok(Q.summaryChange(c["LP NAV"]) === "+$2.00M" || /^\+\$2/.test(Q.summaryChange(c["LP NAV"])), `money change: ${Q.summaryChange(c["LP NAV"])}`);
ok(Q.summaryChange(c["Net LP IRR"]) === "+1.0 pts" && Q.summaryChange({ unit: "x", change: -0.05 }) === "-0.05x" && Q.summaryChange({ unit: "n", change: null }) === "n/a", "change labels");
ok(Q.summaryValue(9.5, "%") === "9.5%" && Q.summaryValue(1.2, "x") === "1.20x" && Q.summaryValue(null, "%") === "n/a", "value labels");

// Excel: the summary first
const x = Q.reportXlsx({ ...now, kind: "internal", internal: { uw: [], budget: [] } }, { summary: si });
ok(x[2][0] === "Summary" && x[3][0] === "Watch list (internal)" && x[4][0] === "Issued reports", "Excel opens with the summary");
ok(x.some((row) => row[0] === "Change vs. last quarter (Q2 2026)") && x.some((row) => row[0] === "Watch list" && row[1] === "Score"), "with the change table and the watch list");
ok(Q.reportXlsx(now)[2][0] === "Returns since inception", "no summary passed: the report as before");

// Issued versions keep their summary
const st = Q.issueReport({}, now, { by: "a@example.com", at: "2026-10-20T00:00:00Z", summary: s });
ok(st.issued[0].summary.issued.count === 1 && st.issued[0].summary.issued.latest.v === 1 && st.issued[0].summary.change.length === 8 && st.issued[0].v === 1, "issuing freezes the summary with the report (counting this version)");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
