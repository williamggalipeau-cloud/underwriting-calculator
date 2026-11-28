// 1.1.30: capital projects (lib/capitalProjects.js) and the office and
// industrial mix (lib/unitMix.js), and their sample data (lib/sampleCapital.js).
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const CP = j(R + "/lib/capitalProjects.js"), UM = j(R + "/lib/unitMix.js"), SC = j(R + "/lib/sampleCapital.js"), SL = j(R + "/lib/sampleConstructionLoad.js");
const BP = j(R + "/lib/businessPlan.js"), PM = j(R + "/lib/propertyMgmt.js"), FL = j(R + "/lib/fundLimits.js"), H = j(R + "/lib/home.js");
const { underwrite } = j(R + "/lib/calculations.js"), { DEFAULT_INPUTS } = j(R + "/lib/defaultInputs.js");
const { buildSampleFund } = j(R + "/lib/sampleFund.js"), VD = j(R + "/lib/sampleVentureData.js"), SV = j(R + "/lib/sampleVentures.js");
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log("FAIL", msg); } };
const T = "2026-11-27";

// ── Capital projects at underwriting ──
check(CP.PROJECT_TYPES.length === 15 && ["Landscaping", "Signage", "Painting", "Parking lot / paving", "Demise / Combine", "Contingency"].every((t) => CP.PROJECT_TYPES.includes(t)), "the project types include the ones the user added, and Contingency as its own type");
const base = { ...DEFAULT_INPUTS, capexBudget: 500000, acquisitionDate: "2026-01-15" };
check(!CP.hasProjects(base) && CP.projectsShown(base).length === 1 && CP.projectsShown(base)[0].budget === 500000 && CP.projectsShown(base)[0].single, "an asset with no list shows its single figure as one line");
const list = [{ id: "a", project: "Roof", type: "Roof", budget: 300000, startMonth: 3, months: 4 }, { id: "b", project: "Paving", type: "Parking lot / paving", budget: 150000, startMonth: 6, months: 2 }, { id: "c", project: "Contingency", type: "Contingency", budget: 45000, startMonth: 1, months: 0 }];
const withList = CP.setProjects(base, list);
check(withList.capexBudget === 495000 && CP.budgetTies(withList) && CP.projectsTotal(withList.capitalProjects) === 495000, "saving the list makes the Capex Budget its total");
check(underwrite({ ...base, capexBudget: 495000 }).returns.irr === underwrite(withList).returns.irr, "the model sees only the total: the list moves no return");
check(CP.setProjects(withList, []).capexBudget === 495000 && !CP.hasProjects(CP.setProjects(withList, [])), "an emptied list leaves the budget as a single figure");
check(!CP.budgetTies({ ...withList, capexBudget: 1 }), "a budget that is not the list's total is flagged");

// ── The business plan ──
const seeded = BP.seedPlan(withList, { asOf: "2026-01-15" });
check(seeded.capital.length === 3 && seeded.capital.every((c) => c.source === "underwriting") && seeded.capital[0].start === "2026-03-15" && seeded.capital[0].end === "2026-07-15" && seeded.capital[2].start === "" && seeded.kpis.find((k) => k.key === "capex").target === 495000, "a new plan carries the projects one by one, dated from their start month and months; contingency is undated");
const legacy = BP.seedPlan(base, { asOf: "2026-01-15" });
check(legacy.capital.length === 1 && legacy.capital[0].id === "c1" && legacy.capital[0].budget === 500000, "an asset with no list still seeds one line");
let inp = { ...withList, businessPlan: BP.addRevision({}, { plan: seeded, budget: null, inputs: withList, at: "2026-01-15T12:00:00Z" }) };
let tie = CP.capitalTieOut(inp, inp.businessPlan.revisions.at(-1).plan);
check(tie.ties && /Ties to the underwritten budget of \$495,000/.test(tie.text) && tie.spent === 0 && tie.rows.every((r) => r.spentFrom === "entered" && r.status === "notStarted"), "the closing plan ties to the underwritten budget");
// Spent from the construction invoices of the project's jobs
const jobs = [
  { code: "J1", name: "roof", category: "Capital Improvements", status: "In progress", invoiced: 999, invoices: [{ amount: 100000 }, { amount: 20500.5 }] },
  { code: "J2", name: "Lot work", category: "Capital Improvements", status: "Complete", invoiced: 150000, invoices: [], planProjectId: "b" },
  { code: "J3", name: "Roof", category: "Tenant Improvements", status: "Complete", invoiced: 7777 },
];
inp = { ...inp, construction: { jobs } };
tie = CP.capitalTieOut(inp, inp.businessPlan.revisions.at(-1).plan);
check(tie.rows[0].spent === 120500.5 && tie.rows[0].spentFrom === "invoices" && tie.rows[0].status === "underway" && tie.rows[0].jobs.join() === "J1", "a job with the project's name: spent is the sum of its invoices (TI jobs are not capital)");
check(tie.rows[1].spent === 150000 && tie.rows[1].status === "complete" && tie.rows[1].remaining === 0 && tie.rows[2].spentFrom === "entered", "a job linked to the project counts (its total when it has no invoice lines); a project with no job keeps the figure entered");
check(BP.kpiActuals(inp, T).capex === 270500.5, "the plan's capex KPI reads the same spent");
// A finding added to the plan is unbudgeted
inp = { ...inp, propertyMgmt: { items: [{ id: "i1", system: "Dock", finding: "leveler failed", cost: 38000, urgency: "Immediate", yardiJob: "J9" }] } };
const added = PM.addToCapitalPlan(inp, "i1", { by: "t", at: "2026-11-01T00:00:00Z", addRevision: BP.addRevision });
const inp2 = added?.inputs ?? added;
const plan2 = inp2.businessPlan.revisions.at(-1).plan;
tie = CP.capitalTieOut(inp2, plan2);
check(plan2.capital.at(-1).source === "unbudgeted" && tie.unbudgetedCount === 1 && tie.unbudgeted === 38000 && tie.diff === 38000 && !tie.ties && /\$38,000 above the underwritten budget of \$495,000/.test(tie.text) && /1 project was added after underwriting/.test(tie.text), "a Property Condition finding added to the plan is Unbudgeted and counted against the underwritten budget");
check(CP.capitalOverBudget(inp2)?.diff === 38000 && CP.capitalOverBudget(inp) === null, "the Dashboard's check: over only when above the budget or holding unbudgeted projects");
const withJ9 = { ...inp2, construction: { jobs: [...jobs, { code: "J9", name: "Leveler", category: "Capital Improvements", status: "In progress", invoiced: 5000 }] } };
check(CP.capitalRows(withJ9, plan2).at(-1).spent === 5000, "a job named on the finding is the project's job");
// A row with no source: by the closing plan
const noSrc = { revisions: [{ plan: { capital: [{ id: "x", budget: 1 }] } }, { plan: { capital: [{ id: "x", budget: 1 }, { id: "y", budget: 2 }] } }] };
check(CP.rowSource({ id: "x" }, noSrc) === "underwriting" && CP.rowSource({ id: "y" }, noSrc) === "unbudgeted", "a row saved before 1.1.30 is Underwriting when the closing plan held it, else Unbudgeted");
check(CP.capitalSheet([{ id: "d", inputs: inp2 }]).length === 5 && CP.capitalSheet([{ id: "d", inputs: inp2 }])[4][3] === "Unbudgeted", "the Excel rows list each project with its source");

// ── Unit mix ──
const u = (id, sf, use, officeSF, rent = 10, status = "occupied") => ({ id, name: id, squareFeet: sf, use, officeSF, currentRentPSF: rent, leaseStatus: status, tenantName: status === "occupied" ? `T ${id}` : "" });
const units = [u("1", 12000, "industrial", 900, 11.4), u("2", 8000, "flex", 2400, 14.25), u("3", 3000, "office", 3000, 19.5), u("4", 6000, "industrial", 600, 0, "vacant")];
const m = UM.mixOf(units);
check(UM.UNIT_USES.map(([k]) => k).join() === "industrial,flex,office,retail,other", "the uses are Industrial, Flex, Office, Retail and Other");
check(m.totalSF === 29000 && m.officeSF === 6900 && Math.abs(m.officeBuildoutPct - 23.793) < 0.01 && Math.abs(UM.pctOf(m, "industrial") - 62.069) < 0.01 && Math.abs(UM.pctOf(m, "office") - 10.345) < 0.01, "the mix by SF and the office build-out");
const rentTot = 12000 * 11.4 + 8000 * 14.25 + 3000 * 19.5;
check(Math.abs(m.totalRent - rentTot) < 1e-6 && Math.abs(UM.pctOf(m, "industrial", "rent") - (12000 * 11.4 / rentTot) * 100) < 1e-9 && m.rows.find((r) => r.use === "industrial").units === 2, "the mix by rent uses in-place rent: a vacant unit counts in SF, not in rent");
const noUse = UM.mixOf([{ id: "9", squareFeet: 1000, leaseStatus: "vacant" }]);
check(noUse.unconfirmed === 1 && UM.pctOf(noUse, "industrial") === 100 && UM.unitUse({}) === "industrial" && !UM.unitUseSet({}), "a unit with no use counts as industrial, marked not confirmed");
check(UM.officeSFOf({ use: "office", squareFeet: 500 }) === 500 && UM.officeSFOf({ use: "flex", squareFeet: 500 }) === 0 && UM.officeSFOf({ use: "flex", squareFeet: 500, officeSF: 900 }) === 500, "office SF: entered (never more than the unit), else the whole unit when its use is office");
const tieOk = UM.officeTie({ building: { officeSF: 6900 } }, units), tieOff = UM.officeTie({ building: { officeSF: 8100 } }, units), tieNone = UM.officeTie({}, units);
check(tieOk.ties && /ties to the building's Office SF \(6,900\)/.test(tieOk.text) && !tieOff.ties && /1,200 below the building's Office SF of 8,100/.test(tieOff.text) && !tieNone.hasBuilding, "the units' office SF is checked against the building's Office SF, and a difference is stated");
let mi = { units, acquisitionDate: "2026-01-15" };
mi = UM.setTarget(UM.setTarget(UM.setTarget(mi, "sf", "industrial", "70"), "sf", "flex", 25), "sf", "office", 5);
mi = UM.setTarget(UM.setTarget(mi, "rent", "industrial", 60), "officeBuildoutPct", null, "15");
check(mi.mixTargets.sf.industrial === 70 && UM.targetTotal(mi.mixTargets, "sf") === 100 && UM.targetTotal(mi.mixTargets, "rent") === 60 && mi.mixTargets.officeBuildoutPct === 15 && UM.targetTotal({}, "sf") === null && UM.setTarget(mi, "sf", "flex", "").mixTargets.sf.flex === null, "targets by SF and by rent, and for the office build-out; a set's total is shown");
const cmp = UM.mixCompare(mi, T);
const row = (k) => cmp.rows.find((r) => r.key === k);
check(Math.abs(row("sf:industrial").toGo - 7.9) < 1e-9 && row("sf:industrial").target === 70 && Math.abs(row("buildout").toGo + 8.8) < 1e-9 && row("rent:flex").target === null && row("rent:flex").toGo === null && !row("sf:retail"), "purchase, today and target side by side; to go is target less today, in points");
check(UM.mixAtPurchase({ units, uwBaseline: { inputs: { units: [u("1", 100, "office", 100)] } } }).officeBuildoutPct === 100, "at purchase is the closing model's rent roll where the asset has one");
check(/62\.1% industrial · 27\.6% flex · 10\.3% office \(by SF\); office build-out 23\.8%/.test(UM.mixLine(m)), "the one-line mix for Asset Summary");
const dA = { id: "A", inputs: { propertyName: "A", units } }, dB = { id: "B", inputs: { propertyName: "B", units: [u("b1", 71000, "industrial", 0)] } }, dSold = { id: "S", inputs: { propertyName: "S", realizedSaleDate: "2026-06-01", units: [u("s1", 50000, "office", 50000)] } };
const pm = UM.portfolioMix([dA, dB, dSold], T);
check(pm.assets.length === 2 && pm.total.totalSF === 100000 && UM.pctOf(pm.total, "office") === 3 && Math.abs(pm.total.officeBuildoutPct - 6.9) < 1e-9, "the portfolio is weighted by SF and leaves out a sold asset");
// Measured restrictions on Portfolio Limits
const li = FL.limitInputs([dA, dB, dSold], { todayISO: T });
check(FL.MEASURED.includes("office_use_pct") && FL.MEASURED.includes("office_buildout_pct") && FL.actualFor("office_use_pct", li, 1).value === 3 && Math.abs(FL.actualFor("office_buildout_pct", li, 1).value - 6.9) < 1e-9 && FL.statusOf(3, 10) === "within" && FL.statusOf(6.9, 5) === "breached", "office use and office build-out are measured restrictions");
check(UM.mixSheet([dA], T).length === 5 && UM.mixSheet([dA], T)[4][1] === "Total", "the Excel rows");

// ── Sample data: all 13 sample assets ──
const fund = buildSampleFund({ todayISO: T });
const ven = VD.sampleVenturesFull({ deals: fund.deals, funds: {}, valuations: {}, gp: {}, pipeline: [] }, { baseInputs: DEFAULT_INPUTS, todayISO: T }, SV.sampleVenturesToAdd);
const all = [...fund.deals, ...ven.deals];
check(all.length === 13, "13 sample assets");
const off = [];
const typesSeen = new Set(), usesSeen = new Set();
for (const d of all) {
  const i = d.inputs, n = i.propertyName, bp = i.businessPlan, plan = bp.revisions.at(-1).plan, t = CP.capitalTieOut(i, plan, bp);
  if (!CP.hasProjects(i) || i.capitalProjects.length < 3) off.push(`${n}: no project list`);
  if (CP.projectsTotal(i.capitalProjects) !== i.capexBudget) off.push(`${n}: projects ${CP.projectsTotal(i.capitalProjects)} ≠ Capex Budget ${i.capexBudget}`);
  if (i.capitalProjects.filter((p) => p.type === "Contingency").length !== 1) off.push(`${n}: contingency is not one line of its own`);
  if (!i.capitalProjects.every((p) => CP.PROJECT_TYPES.includes(p.type) && p.project && p.budget > 0)) off.push(`${n}: a project has no name, type or budget`);
  i.capitalProjects.forEach((p) => typesSeen.add(p.type));
  if (!t.ties || t.rows.length !== i.capitalProjects.length || !t.rows.every((r) => r.source === "underwriting")) off.push(`${n}: the plan's Capital plan does not tie (${t.text})`);
  if (bp.revisions.some((r) => r.plan.capital.length === 1 && r.plan.capital[0].id === "c1")) off.push(`${n}: a revision still holds the single line`);
  if (plan.kpis.find((k) => k.key === "capex").target !== i.capexBudget) off.push(`${n}: the capex KPI target is not the budget`);
  const mx = UM.mixOf(i.units), ot = UM.officeTie(i);
  if (mx.unconfirmed || !i.units.every((x) => UM.unitUseSet(x) && x.officeSF >= 0 && x.officeSF <= x.squareFeet)) off.push(`${n}: a unit has no use or a bad office SF`);
  if (!ot.hasBuilding || !ot.ties) off.push(`${n}: ${ot.text}`);
  i.units.forEach((x) => usesSeen.add(x.use));
  const mt = i.mixTargets;
  if (!mt || UM.targetTotal(mt, "sf") !== 100 || UM.targetTotal(mt, "rent") !== 100 || !(mt.officeBuildoutPct >= 0)) off.push(`${n}: mix targets missing or not adding to 100`);
  if (SC.withSample1130(i, d.id) !== i) off.push(`${n}: applying the sample step again changes something`);
  const bare = { ...i, capitalProjects: undefined, mixTargets: undefined, units: i.units.map(({ use, officeSF, ...x }) => x) };
  if (underwrite(bare).returns.irr !== underwrite(i).returns.irr) off.push(`${n}: the sample data moves the return`);
  if (i.uwBaseline?.inputs) { const b = i.uwBaseline.inputs; if (CP.projectsTotal(b.capitalProjects ?? []) !== b.capexBudget || UM.mixOf(b.units).unconfirmed) off.push(`${n}: the closing model has no projects or mix`); }
}
check(off.length === 0, `every sample asset: the projects total the Capex Budget, the plan ties, the units' office SF ties to the building, targets add to 100, nothing moves a return, and the step runs once (${off.slice(0, 4).join("; ")})`);
check(CP.PROJECT_TYPES.filter((t) => t !== "Other").every((t) => typesSeen.has(t)), `every project type but Other is used somewhere in the sample data (missing: ${CP.PROJECT_TYPES.filter((t) => !typesSeen.has(t)).join(", ")})`);
check(["industrial", "flex", "office", "retail"].every((k) => usesSeen.has(k)), "industrial, flex, office and retail units all appear in the sample data");
// Model Fund I: spent is the sample construction jobs' invoices
const spent = Object.fromEntries(fund.deals.map((d) => { const i = d.inputs; return [i.propertyName, CP.capitalTieOut(i, i.businessPlan.revisions.at(-1).plan)]; }));
check(spent["Airport Flex Park"].spent === 105000 && spent["Harbor Light Industrial"].spent === 488000 && spent["Route 9 Small Bay"].spent === 350000 && spent["Lakeshore Service Center"].spent === 0, "Model Fund I: spent is what the plans showed before (a third of the budget; Harbor Light 22% over), and nothing yet on the newest assets");
check(fund.deals.every((d) => d.inputs.businessPlan.revisions.at(-1).plan.capital.every((c) => !c.spent)) && fund.deals.every((d) => CP.capitalRows(d.inputs, d.inputs.businessPlan.revisions.at(-1).plan).every((r) => r.spent === 0 || r.spentFrom === "invoices")), "no Model Fund I project carries a spent figure of its own: every dollar is a construction invoice");
for (const d of fund.deals) {
  const want = SC.sampleCapitalJobs(d.inputs, d.id), rows = CP.capitalRows(d.inputs, d.inputs.businessPlan.revisions.at(-1).plan);
  if (!want.every((w) => rows.find((r) => r.id === w.projectId)?.spent === w.invoiced)) off.push(`${d.inputs.propertyName}: a job's invoices are not the project's spent`);
}
check(off.length === 0, `each sample capital job's invoices are its project's spent (${off.join("; ")})`);
const harbor = fund.deals.find((d) => d.inputs.propertyName === "Harbor Light Industrial");
check(BP.kpiActuals(harbor.inputs, T).capex === 488000, "Harbor Light's capital plan is still over its budget (the Watch List's reason)");
// Ventures: no construction file, so the figure entered stays, split by project
check(ven.deals.every((d) => { const t = CP.capitalTieOut(d.inputs, d.inputs.businessPlan.revisions.at(-1).plan); return t.spent === d.inputs.capexBudget && t.rows.every((r) => r.spentFrom === "entered"); }), "the joint venture's and separate account's plans keep the figure entered (complete, on budget), split across the projects");
// The load onto an asset saved before 1.1.30
const before = buildSampleFund({ todayISO: T }).deals.map((d) => { const i = d.inputs; const { capitalProjects, mixTargets, ...rest } = i; const cap = [{ id: "c1", project: "Capital plan (underwriting)", scope: "", budget: i.capexBudget, start: i.acquisitionDate, end: "", spent: Math.round(i.capexBudget * 0.35), expectedReturn: "" }]; return { ...d, inputs: { ...rest, units: i.units.map(({ use, officeSF, ...x }) => x), construction: { ...i.construction, jobs: (i.construction?.jobs ?? []).filter((x) => !SC.sampleCapitalJobs(i, d.id).some((w) => !w.kept && w.name === x.name)) }, businessPlan: { ...i.businessPlan, revisions: i.businessPlan.revisions.map((r) => ({ ...r, plan: { ...r.plan, capital: cap } })) } } }; });
const loaded = before.map((d) => ({ ...d, inputs: SL.withSampleCapitalJobs(SC.withSample1130(d.inputs, d.id), d.id) }));
check(loaded.every((d, k) => { const a = d.inputs, f = fund.deals[k].inputs; return JSON.stringify(a.capitalProjects) === JSON.stringify(f.capitalProjects) && CP.capitalTieOut(a, a.businessPlan.revisions.at(-1).plan).spent === CP.capitalTieOut(f, f.businessPlan.revisions.at(-1).plan).spent && JSON.stringify(a.mixTargets) === JSON.stringify(f.mixTargets) && UM.officeTie(a).ties; }), "a Model Fund I saved before 1.1.30 comes out as the fund the app builds: projects, spent from the jobs, unit mix and targets");
check(loaded.every((d) => SL.withSampleCapitalJobs(SC.withSample1130(d.inputs, d.id), d.id) === d.inputs), "the load runs once");
const mine = { ...before[0], inputs: { ...before[0].inputs, capitalProjects: [{ id: "u", project: "Mine", type: "Other", budget: before[0].inputs.capexBudget }], units: before[0].inputs.units.map((x, k) => (k === 0 ? { ...x, use: "retail" } : x)), mixTargets: { sf: { industrial: 100 } } } };
const kept = SC.withSample1130(mine.inputs, mine.id);
check(kept.capitalProjects[0].id === "u" && kept.units[1].use === undefined && kept.mixTargets.sf.industrial === 100, "a list, a unit use or targets the user entered are left as they are");
check(SC.withSample1130({ capexBudget: 5, units: [{}] }, "pl-1") .capitalProjects === undefined, "an asset that is not a sample asset is not touched");
console.log(`capitalMix1130: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
