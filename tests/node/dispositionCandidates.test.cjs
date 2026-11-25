// 1.1.5: Dispositions → Disposition Candidates (lib/dispositionCandidates.js):
// assets whose business plan exit falls in the next 12 months or has passed
// (still owned), from the latest plan revision; the saved Sell/Hold decision.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const C = j(R + "/lib/dispositionCandidates.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const T = "2026-11-25";
const plan = (hold, extra = {}) => ({ revisions: [{ n: 1, plan: { exit: { holdYears: hold, targetExit: "" }, recommendation: "Hold" } }, { n: 2, plan: { exit: { holdYears: hold, targetExit: "", ...extra }, recommendation: "Sell" } }] });
const deal = (id, acq, bp, more = {}) => ({ id, inputs: { propertyName: id, fundName: "F", acquisitionDate: acq, businessPlan: bp, ...more } });
const deals = [
  deal("A", "2023-03-16", plan(4)),                                   // exit 2027-03-16: 4 months
  deal("B", "2022-10-31", plan(5)),                                   // exit 2027-10-31: 11 months
  deal("C", "2022-06-30", plan(4)),                                   // exit 2026-06-30: past (5 months)
  deal("D", "2022-01-15", plan(4)),                                   // exit 2026-01-15: past, decision hold
  deal("E", "2026-01-30", plan(4)),                                   // exit 2030: later
  deal("F", "2024-01-01", null),                                      // no plan: not listed
  deal("G", "2023-01-01", plan(10, { targetExit: "2027-06-30" })),    // target date wins
  deal("H", "2022-12-01", plan(4), { dispositions: [{ id: "s1", stage: "closed", scope: "whole" }] }), // sold
  deal("I", "2023-05-01", plan(4), { dispositions: [{ id: "s2", stage: "marketing" }] }),             // active sale
];
const funds = { F: { sellHold: { decisions: { D: { decision: "hold", years: 6 }, A: { decision: "sell" } } } } };
const { rows, next } = C.dispositionCandidates(deals, funds, { todayISO: T });
const by = Object.fromEntries(rows.map((r) => [r.dealId, r]));
ok(rows.map((r) => r.dealId).join() === "D,C,A,I,G,B", `the candidates, by planned exit: ${rows.map((r) => `${r.dealId} ${r.exit}`).join(", ")}`);
ok(!by.E && !by.F && !by.H, "not listed: exit more than 12 months out, no business plan, or sold");
ok(by.A.exit === "2027-03-16" && by.A.monthsLeft === 4 && by.A.planRev === 2 && by.A.recommendation === "Sell", "exit = acquisition + the latest revision's hold years; months left; plan revision and recommendation");
ok(by.G.exit === "2027-06-30" && by.G.exitBasis === "target", "a full target exit date in the plan is used");
ok(by.C.past && by.C.monthsLeft < 0 && !by.C.heldLonger && !by.C.decision, "past the plan exit with no Sell/Hold decision: flagged");
ok(by.D.past && by.D.heldLonger && by.D.decision.text === "Hold to year 6", "past the plan exit with a decision to hold longer: Held past plan, Hold to year 6");
ok(by.A.decision.text === "Sell now" && !by.A.heldLonger, "a saved Sell now decision shows");
ok(by.I.sale?.stage === "marketing" && by.I.sale.label === "Marketing" && !by.A.sale, "an active sale shows its stage");
ok(next?.dealId === "E" && next.exit === "2030-01-30", "next exit beyond the window, for the empty state");
// Empty: Model Fund I in 2026 (4-year holds from 2026)
const empty = C.dispositionCandidates([deal("E", "2026-01-30", plan(4)), deal("E2", "2026-11-13", plan(4))], {}, { todayISO: T });
ok(empty.rows.length === 0 && empty.next.dealId === "E", "no candidates when every exit is more than 12 months away");
process.exit(fail ? 1 : 0);
