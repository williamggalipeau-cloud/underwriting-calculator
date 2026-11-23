// Phase N: Fund Summary (lib/fundSummary.js) on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const N = j(R + "/lib/fundSummary.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const TODAY = "2026-11-23";

const data = FX.workspaceData();
const terms = { ...DEFAULT_FUND_TERMS, ...data.funds["Model Fund I"], name: "Model Fund I", launchDate: "2025-06-01", keyPerson: "Two of three named principals (fictional)", capitalActivity: [], limits: [{ key: "single_asset_pct", label: "Single asset", limit: 15, unit: "%" }] };
const deals = data.deals.filter((d) => d.inputs.fundName === "Model Fund I");

// ── Key dates ──
const kd = N.keyDates(terms, TODAY);
ok(kd.launch === "2025-06-01" && kd.finalClose === "2025-12-31" && kd.investmentPeriodEnd === "2027-12-31" && kd.fundEnd === "2030-12-31" && kd.outsideDate === "2032-12-31", "key dates: launch, final close, investment period, term, outside date");
ok(kd.ipMonthsLeft === 13 && kd.termMonthsLeft === 49, `months left: investment period ${kd.ipMonthsLeft}, term ${kd.termMonthsLeft}`);

// ── Key terms ──
const kt = Object.fromEntries(N.keyTerms(terms));
ok(/\$100,000,000/.test(kt.Commitments) && /GP \$5,000,000/.test(kt.Commitments) && kt["Preferred return"] === "9%", "commitments (LP / GP) and pref");
ok(/80\/20/.test(kt["Promote tiers (LP/GP)"]) && /SOFR \+ 1\.75%/.test(kt["Subscription line"]) && /Single asset: 15%/.test(kt["Investment limits"]) && /Two of three/.test(kt["Key person"]), "tiers, sub line, limits, key person");
ok(N.keyTerms(terms).length === 16, "16 key terms");

// ── Capital ──
const cap = N.capitalSummary(terms, deals, TODAY);
const held = deals.filter((d) => (d.inputs.acquisitionDate || terms.finalClose) <= TODAY);
const eq = held.reduce((s, d) => s + underwrite(d.inputs).debt.equityRequired, 0);
ok(close(cap.deployed, eq, 1) && cap.assets === held.length && cap.calledSource.startsWith("model"), `deployed: ${held.length} assets, $${(eq / 1e6).toFixed(1)}M equity (model, no capital activity)`);
ok(close(cap.dryPowder, 100e6 - cap.called, 1) && close(cap.pctCalled, (cap.called / 100e6) * 100) && cap.lineSize === 80e6 && cap.lineDrawn === null, "dry powder, % called, sub line capacity");
const withAct = N.capitalSummary({ ...terms, capitalActivity: [{ date: "2026-03-01", type: "call", amount: 20e6 }, { date: "2026-04-01", type: "draw", amount: 5e6 }] }, deals, TODAY);
ok(withAct.called === 20e6 && withAct.lineDrawn === 5e6 && withAct.dryPowder === 75e6 && withAct.calledSource === "capital activity", "with capital activity: called $20M, line $5M drawn, $75M available");

// ── Entities ──
ok(N.einLast4("12-3456789") === "6789" && N.einLast4("••••4321") === "4321", "EIN: only the last 4 digits");
const ents = [
  { id: "f", name: "Model Fund I LP", role: "fund", state: "DE" },
  { id: "g", name: "Model GP LLC", role: "gp", state: "DE", annualReportDue: "2027-03-01" },
  { id: "m", name: "Model Manager LLC", role: "manager" },
];
const added = N.suggestAssetEntities(ents, deals.slice(0, 3), "f");
ok(added.length === 3 && added.every((e) => e.role === "asset" && e.parentId === "f" && / LLC$/.test(e.name) && e.dealId), "a property company for each asset, owned by the fund");
ok(N.suggestAssetEntities([...ents, ...added], deals.slice(0, 3), "f").length === 0, "never twice for the same asset");
const tree = N.ownershipTree([...ents, ...added]);
ok(tree.map((e) => e.role).join() === "gp,fund,manager" && tree[1].children.length === 3, "ownership chart: GP, fund (3 property companies beneath), manager");
const moved = N.ownershipTree([...ents, { ...added[0], parentId: "g" }]);
ok(moved.find((e) => e.id === "g").children.length === 1, "an entity's owner can be changed");
const dates = N.entityDates([...ents, ...added], "Model Fund I");
ok(dates.length === 1 && dates[0].date === "2027-03-01" && /Annual report: Model GP LLC \(DE\)/.test(dates[0].label) && dates[0].kind === "milestone", "annual-report dates go to the critical-dates list");

// ── Excel ──
const x = N.summaryXlsx("Model Fund I", terms, kd, cap, [...ents, ...added]);
ok(x.some((r) => r[0] === "Outside date (all extensions)") && x.some((r) => r[0] === "Model GP LLC") && x.some((r) => r[0] === "Legal entity"), "Excel: dates, terms, capital and entities");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
