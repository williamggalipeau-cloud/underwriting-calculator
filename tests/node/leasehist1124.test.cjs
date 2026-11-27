// 1.1.24: leases signed after purchase (lib/leaseHistory.js) and how the model
// uses them (lib/calculations.js). A unit with no later leases must behave
// exactly as before; with them, the model earns the signed rent, is vacant
// for the actual gap, and charges the signed lease's costs.
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund } = j(R + "/lib/sampleFund.js");
const { underwrite } = j(R + "/lib/calculations.js");
const LH = j(R + "/lib/leaseHistory.js");
const C = j(R + "/lib/creditReview.js");

let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const T = "2026-11-27";
const f = buildSampleFund({ todayISO: T });
const A = f.deals[0].inputs; // bought 2026-01-30, four-year hold
const u0 = A.units.find((x) => x.name === "001"); // occupied, lease ends 2026-07-30
const vac = A.units.find((x) => x.leaseStatus !== "occupied");
// One unit on its own, so the yearly figures are that unit's.
const one = (unit) => ({ ...A, units: [unit], squareFootage: unit.squareFeet, unitCount: 1 });
const run = (unit) => underwrite(one(unit)).annualCashFlows;
const sf = u0.squareFeet, esc = Math.pow(1 + u0.annualEscalationPct / 100, 1 / 12);
const firstSix = Array.from({ length: 6 }, (_, m) => (u0.currentRentPSF * Math.pow(esc, m) * sf) / 12).reduce((s, v) => s + v, 0);
const market = (m) => A.rentPerSF * Math.pow(1 + A.annualRentEscalationPct / 100, m / 12);

// ── Nothing changes without later leases ──
check(u0.monthsRemaining === 6 && u0.leaseEnd === "2026-07-30" && !u0.rentSteps?.length, `the test unit: 6 months left at purchase, no rent steps (${u0.monthsRemaining}, ${u0.leaseEnd})`);
check(JSON.stringify(run(u0)) === JSON.stringify(run({ ...u0, laterLeases: [] })) && JSON.stringify(run(u0)) === JSON.stringify(run({ ...u0, laterLeases: [{ id: "bad", start: "", end: "", rentPSF: 20 }] })), "a unit with no later leases, or only an unusable one, is modelled exactly as before");
check(f.deals.every((d) => d.inputs.units.every((x) => !(x.laterLeases ?? []).length)), "Model Fund I has no later leases, so none of its figures move");
const base = run(u0);

// ── A renewal: the signed rent, no gap, no assumed rollover ──
const renewal = { id: "r1", kind: "renewal", tenantName: u0.tenantName, start: "2026-08-01", end: "2031-07-31", rentPSF: 20, escalationPct: 0, freeMonths: 0, tiPSF: 0, lcPct: 0 };
const rA = run({ ...u0, laterLeases: [renewal] });
check(near(rA[0].grossRevenue, firstSix + (6 * 20 * sf) / 12) && [1, 2, 3].every((y) => near(rA[y].grossRevenue, 20 * sf)), `renewal: year one is six months of the purchase lease and six at $20; the later years are $20 × SF (${rA.map((y) => Math.round(y.grossRevenue))})`);
check(rA.every((y) => near(y.physicalVacancy, 0) && near(y.tiAndLeasing, 0)), "renewal with no costs entered: no vacancy and no leasing costs in any year (the rollover assumptions are not applied)");
check(base[0].tiAndLeasing > 0, "without it, the model applies the rollover assumptions when the purchase lease ends");
// The yearly increase compounds as the model grows an in-place lease.
const rEsc = run({ ...u0, laterLeases: [{ ...renewal, escalationPct: 3 }] });
check(near(rEsc[1].grossRevenue, Array.from({ length: 12 }, (_, k) => (20 * Math.pow(1.03, (6 + k) / 12) * sf) / 12).reduce((s, v) => s + v, 0), 1), "a 3% yearly increase grows the rent month by month from the lease's start");
// Rent steps on the later lease.
const rSteps = run({ ...u0, laterLeases: [{ ...renewal, rentSteps: [{ start: "2026-08-01", end: "2027-07-31", rentPSF: 20 }, { start: "2027-08-01", end: "2031-07-31", rentPSF: 24 }] }] });
check(near(rSteps[2].grossRevenue, 24 * sf) && near(rSteps[1].grossRevenue, (6 * 20 * sf + 6 * 24 * sf) / 12), "rent steps on a later lease set each month's rent");

// ── A new tenant after a gap: actual downtime and the signed lease's costs ──
const newT = { id: "n1", kind: "new", tenantName: "Sample Bike Repair", start: "2026-11-01", end: "2031-10-31", rentPSF: 22, escalationPct: 0, freeMonths: 2, tiPSF: 5, lcPct: 6 };
const rB = run({ ...u0, laterLeases: [newT] });
const gapLoss = [6, 7, 8].reduce((s, m) => s + (market(m) * sf) / 12, 0);
check(near(rB[0].grossRevenue - rB[0].physicalVacancy, firstSix + (3 * 22 * sf) / 12, 1) && near(rB[0].physicalVacancy, gapLoss, 1), `new tenant: three vacant months at market, then three at $22 (collected ${Math.round(rB[0].grossRevenue - rB[0].physicalVacancy)}, vacancy ${Math.round(rB[0].physicalVacancy)})`);
check(near(rB[0].tiAndLeasing, (5 + 22 * 5 * 0.06 + (2 / 12) * 22) * sf, 1) && [1, 2, 3].every((y) => near(rB[y].tiAndLeasing, 0)), `its TI, commission and free rent are charged in the month it starts (${Math.round(rB[0].tiAndLeasing)})`);
// With no commission entered, the unit's own rate for that kind of lease applies.
const rLc = run({ ...u0, laterLeases: [{ ...newT, lcPct: null, tiPSF: 0, freeMonths: 0 }] });
check(near(rLc[0].tiAndLeasing, 22 * 5 * ((u0.leasingCommissionNewPct ?? A.leasingCommissionNewPct) / 100) * sf, 1), "no commission entered: the unit's new-lease commission rate");

// ── After the last recorded lease, the rollover assumptions come back ──
const short = { ...renewal, end: "2028-07-31" };
const rC = run({ ...u0, laterLeases: [short] });
check(near(rC[0].tiAndLeasing, 0) && near(rC[1].tiAndLeasing, 0) && rC[2].tiAndLeasing > 0, `a later lease that ends in year three: no leasing costs before, rollover costs in that year (${rC.map((y) => Math.round(y.tiAndLeasing))})`);
// Two later leases with a gap between them.
const rD = run({ ...u0, laterLeases: [short, { ...newT, id: "n2", start: "2028-11-01", end: "2033-10-31", tiPSF: 0, lcPct: 0, freeMonths: 0 }] });
check(near(rD[2].tiAndLeasing, 0) && rD[2].physicalVacancy > 0 && near(rD[3].grossRevenue, 22 * sf), "two later leases: the gap between them is vacant, with no assumed rollover, and the second lease's rent follows");

// ── A unit vacant at purchase ──
const lv = { id: "v1", kind: "new", tenantName: "Example Tile Supply", start: "2026-06-01", end: "2031-05-31", rentPSF: 30, escalationPct: 0, freeMonths: 0, tiPSF: 0, lcPct: 0 };
const rV = run({ ...vac, laterLeases: [lv] }), vsf = vac.squareFeet;
check(near(rV[0].grossRevenue - rV[0].physicalVacancy, (8 * 30 * vsf) / 12, 1) && near(rV[0].tiAndLeasing, 0) && near(rV[1].grossRevenue, 30 * vsf), "vacant at purchase: vacant until the recorded lease starts (four months), with no assumed lease-up costs");

// ── The lease in effect today ──
const today = (unit, d = T) => LH.leaseToday(unit, A, d);
check(today(u0).status === "ended" && today(u0).kind === "purchase" && today(u0).end === "2026-07-30", "no later lease: the purchase lease has ended and nothing newer is recorded");
check(today(u0, "2026-05-01").status === "purchase", "before it ends, the purchase lease is the lease today");
const tA = today({ ...u0, laterLeases: [renewal] });
check(tA.status === "later" && tA.kind === "renewal" && tA.end === "2031-07-31" && tA.rentPSF === 20, "with the renewal: it is the lease today");
check(today({ ...u0, laterLeases: [newT] }, "2026-09-15").status === "gap" && today({ ...u0, laterLeases: [newT] }).tenantName === "Sample Bike Repair", "between the purchase lease and the new tenant the unit is vacant; then the new tenant's lease");
check(today({ ...u0, laterLeases: [short] }, "2029-01-01").status === "ended" && today({ ...u0, laterLeases: [short] }, "2029-01-01").kind === "renewal", "after the last later lease: ended, nothing newer recorded");
check(today(vac).status === "vacant" && today({ ...vac, laterLeases: [lv] }).status === "later" && today({ ...vac, laterLeases: [lv] }, "2026-03-01").status === "gap", "a unit vacant at purchase: vacant, then its recorded lease");
const ut = LH.unitToday({ ...u0, laterLeases: [newT] }, A, T);
check(ut.tenantName === "Sample Bike Repair" && ut.leaseEnd === "2031-10-31" && ut.currentRentPSF === 22 && ut.leaseStatus === "occupied" && LH.unitToday(u0, A, T) === u0, "the Rent Roll's view of a unit is the lease today; a unit with no later leases is returned as it is");
check(LH.unitToday({ ...u0, laterLeases: [newT] }, A, "2026-09-15").leaseStatus === "vacant", "in the gap, the unit reads as vacant");
check(LH.inputsToday(A, T) === A, "an asset with no later leases is returned as it is");

// ── Ended with nothing recorded (Rent Roll flag, Dashboard) ──
const ended = LH.endedLeases(A, T);
check(ended.some((e) => e.unit === "001" && e.ended === "2026-07-30") && ended.every((e) => e.ended < T), `units whose last recorded lease has ended are listed (${ended.length})`);
const fixed = { ...A, units: A.units.map((x) => (x.id === u0.id ? { ...x, laterLeases: [renewal] } : x)) };
check(!LH.endedLeases(fixed, T).some((e) => e.unit === "001") && LH.endedLeases({ ...A, acquisitionDate: "2027-06-01" }, T).length === 0, "a unit with a recorded lease is not listed; an asset not yet bought lists none");

// ── Adding a lease ──
const add = (l) => LH.addLaterLease(A, u0.id, l, { by: "t@example.com" });
check(add(renewal).inputs.units.find((x) => x.id === u0.id).laterLeases.length === 1 && add(renewal).lease.addedBy === "t@example.com", "a lease is added to its unit, with who added it");
check(/start and end/.test(add({ ...renewal, start: "" }).error) && /ends on or before/.test(add({ ...renewal, end: "2026-07-01" }).error) && /rent per SF/.test(add({ ...renewal, rentPSF: 0 }).error) && /purchase date/.test(add({ ...renewal, start: "2026-01-15" }).error), "refused without dates or a rent, when it ends before it starts, or when it started by the purchase date");
const twice = LH.addLaterLease(add(renewal).inputs, u0.id, { ...newT, start: "2028-01-01" });
check(/overlaps/.test(twice.error ?? ""), "refused when it overlaps a recorded lease");
const edited = LH.addLaterLease(add(renewal).inputs, u0.id, { ...renewal, rentPSF: 21 });
check(edited.inputs.units.find((x) => x.id === u0.id).laterLeases.length === 1 && edited.inputs.units.find((x) => x.id === u0.id).laterLeases[0].rentPSF === 21, "saving the same lease again replaces it");
check(LH.removeLaterLease(add(renewal).inputs, u0.id, "r1").units.find((x) => x.id === u0.id).laterLeases.length === 0, "a lease can be removed");
const hist = LH.leaseHistory({ ...u0, laterLeases: [newT] }, A);
check(hist.map((h) => h.type).join() === "later,gap,purchase" && hist[1].months === 3, `the history lists the new lease, the three-month gap and the purchase lease, newest first (${hist.map((h) => h.type)})`);

// ── A signed prospect adds its lease ──
{
  const p = A.leasing.prospects.find((x) => x.id === "sample-dlp-airport-flex-park-1");
  const withS = { ...A, leasing: { ...A.leasing, prospects: A.leasing.prospects.map((x) => (x.id === p.id ? { ...x, screening: { source: "app", provider: "Keystone Tenant Screening (fictional)", reportDate: "2026-11-20", scoreType: "consumer", score: 720, result: "approved" } } : x)) } };
  const res = C.signProspect(withS, p.id, { by: "t@example.com", at: "2026-11-27T12:00:00.000Z" });
  const unit = res.inputs.units.find((x) => x.id === p.unitId), l = unit.laterLeases?.[0];
  check(res.lease && l && l.tenantName === p.tenant && l.start === p.expectedStart && l.end === "2032-01-31" && l.rentPSF === p.proposedRentPSF && l.freeMonths === p.freeMonths && l.tiPSF === p.tiPSF && l.escalationPct === p.escalationPct && l.kind === "new" && l.prospectId === p.id, `marking the prospect Signed adds its lease to the unit with the prospect's terms (${l?.start} to ${l?.end} at ${l?.rentPSF})`);
  check(res.inputs.leasing.prospects.find((x) => x.id === p.id).stage === "signed" && unit.credit.records.length >= 1, "and it is signed with its credit screening on the unit, as before");
  const before = underwrite(withS).annualCashFlows, afterS = underwrite(res.inputs).annualCashFlows;
  check(afterS[1].noi !== before[1].noi && Number.isFinite(afterS[3].noi), "the model's NOI now follows the signed lease");
  const again = C.signProspect(res.inputs, p.id, { by: "t@example.com" });
  check(again.inputs.units.find((x) => x.id === p.unitId).laterLeases.length === 1, "signing twice does not add the lease twice");
  const noStart = C.signProspect({ ...withS, leasing: { ...withS.leasing, prospects: withS.leasing.prospects.map((x) => (x.id === p.id ? { ...x, expectedStart: "" } : x)) } }, p.id);
  check(noStart.inputs && /expected start/.test(noStart.leaseError ?? "") && noStart.inputs.leasing.prospects.find((x) => x.id === p.id).stage === "signed", "with no start date the prospect is still signed, and the reason no lease was added is returned");
}

console.log(`leasehist1124: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
