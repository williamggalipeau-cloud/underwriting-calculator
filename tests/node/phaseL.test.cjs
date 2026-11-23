// Phase L: Asset Return additions (lib/assetFees.js): GP profit, GP promote,
// GP ROE and projected fee revenue, on the fictional fixture.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const F = j(R + "/lib/assetFees.js");
const { underwrite } = j(R + "/lib/calculations.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ── The user's example (11/23) ──
const ex = F.gpEconomics({ lpEquity: 9_000_000, gpEquity: 1_000_000, lpTotalDistributions: 17_400_000, gpTotalDistributions: 2_600_000 });
ok(close(ex.gpProfit, 1_600_000) && close(ex.gpPromote, 600_000) && close(ex.gpRoe, 160), "example: GP profit $1.6M, GP promote $0.6M, GP ROE 160%");
ok(F.gpEconomics({ lpEquity: 1, gpEquity: 0, lpTotalDistributions: 2, gpTotalDistributions: 0 }).gpRoe === null, "no GP equity: no ROE");

// ── On a real deal ──
const d = FX.workspaceData().deals.find((x) => x.id === "sample-deal-2");
const r = underwrite(d.inputs);
const g = F.gpEconomics(r.waterfall);
ok(close(g.gpProfit, r.waterfall.gpPromote), "GP profit = the waterfall's old 'GP Promote' (GP distributions − GP equity)");
ok(g.gpPromote <= g.gpProfit + 1e-6 && g.gpPromote >= -1e-6, `GP promote ${(g.gpPromote / 1e3).toFixed(0)}k ≤ GP profit ${(g.gpProfit / 1e3).toFixed(0)}k`);
ok(close(g.gpRoe, (g.gpProfit / r.waterfall.gpEquity) * 100), `GP ROE ${g.gpRoe.toFixed(1)}% = profit ÷ GP equity`);

// ── Fee revenue ──
const inputs = { ...d.inputs, cmFeePct: 0.5 };
const r2 = underwrite(inputs);
const fr = F.feeRevenue(r2.annualCashFlows, 8);
ok(fr.rows.length === r2.annualCashFlows.length && fr.rows.every((x) => close(x.total, x.pm + x.cm)), "one row per hold year: PM + CM");
ok(close(fr.rows[0].pm, r2.annualCashFlows[0].managementFee) && close(fr.rows[0].cm, inputs.purchasePrice * 0.005), "PM fee from the cash flow; CM fee 0.5% of price");
ok(close(fr.total, fr.pm + fr.cm) && fr.pv < fr.total && fr.pv > 0, `total ${Math.round(fr.total).toLocaleString()}, PV at 8% ${Math.round(fr.pv).toLocaleString()}`);
ok(close(F.feeRevenue(r2.annualCashFlows, 0).pv, fr.total), "PV at 0% = total");
ok(F.feeRevenue([], 8).total === 0, "no cash flows: zero");
const rows = F.feeRevenueXlsx("Route 9", fr, g);
ok(rows.some((x) => x[0] === "Present value") && rows.some((x) => /GP promote/.test(x[0])) && !rows.some((x) => /asset management fee/i.test(x[0]) && typeof x[1] === "number"), "Excel: PV and GP rows; no per-asset AM fee line");

// ── Sample drawings (lib/sampleMedia.js) ──
const fs = require("fs");
const SM = j(R + "/lib/sampleMedia.js");
const AP = j(R + "/lib/assetPhotos.js");
const sp = j(R + "/lib/samplePortfolio.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
const built = sp.buildSampleDeals(TEST_INPUTS);
ok(built.length === 9 && built.every((b) => b.inputs.assetMedia.photos.length === 4 && b.inputs.assetMedia.photos[0].cover && b.inputs.assetMedia.floorPlan.kind === "image"), "every sample asset is built with 4 drawn photos (exterior as cover) and a drawn plan");
const files = built.flatMap((b) => [...b.inputs.assetMedia.photos.map((p) => p.path), b.inputs.assetMedia.floorPlan.path]);
ok(files.every((f) => AP.isSamplePath(f) && fs.existsSync(R + "/public/sample-media/" + f.slice(7))), `all ${files.length} drawings exist in public/sample-media`);
ok(AP.sampleUrl("sample:x.svg") === "/underwriting-calculator/sample-media/x.svg", "sample path → app URL under the base path");
const b2 = built[1].inputs;
ok(b2.units.every((u) => b2.assetMedia.floorPlan.boxes[u.id]) && Object.values(b2.assetMedia.floorPlan.boxes).every((x) => x.x >= SM.PLAN_AREA.x - 1e-9 && x.x + x.w <= SM.PLAN_AREA.x + SM.PLAN_AREA.w + 1e-9), "a box for every unit, inside the drawn building");
const planSvg = fs.readFileSync(R + "/public/sample-media/route-9-small-bay-floorplan.svg", "utf8");
ok(b2.units.every((u) => planSvg.includes(`>${u.name}<`)), "the drawn plan labels every unit");
const keep = { id: "sample-deal-2", inputs: { ...b2, assetMedia: { photos: [{ id: "mine", path: "w/x.jpg" }] } } };
ok(SM.withSampleMedia(keep) === keep, "Sample data → add drawings: an asset with its own photos is left alone");
const bare = { id: "sample-deal-2", inputs: { ...b2, assetMedia: undefined, address: "kept" } };
const added = SM.withSampleMedia(bare);
ok(added.inputs.assetMedia.photos.length === 4 && added.inputs.address === "kept", "an asset with none gets the drawings; nothing else changes");
ok(SM.withSampleMedia({ id: "x", inputs: { propertyName: "My Real Building" } }).inputs.assetMedia === undefined, "non-sample assets never get drawings");
ok(!AP.isSamplePath("w1/sample-deal-2/photos/1-a.jpg"), "stored paths aren't sample paths");

// ── Full business plan PDF data (lib/businessPlanExtras.js) ──
const BX = j(R + "/lib/businessPlanExtras.js");
const xin = { ...b2, uwBaseline: { at: "2026-03-16T00:00:00Z", by: "am@example.com", inputs: { ...b2, assetMedia: undefined } }, businessPlan: { revisions: [], actuals: { "2026-08": { noi: 50000 }, "2026-09": { noi: 54000 } } } };
const xd = BX.planExtrasData(xin, { asOf: "2026-11-23" });
ok(xd.photos.length === 4 && xd.cover.id.endsWith("exterior") && xd.planOnImage, "photos, cover and the plan image");
ok(xd.unitBoxes.length === b2.units.length && xd.unitBoxes.every((u) => u.box && u.color && ["occupied", "expiring", "vacant"].includes(u.status)), "each unit with its box and lease-status colour");
ok(/^https:\/\/www\.google\.com\/maps\//.test(xd.location.link) && xd.location.address.includes("Kent"), `location: ${xd.location.address}`);
ok(close(xd.actualNoi.noi, 52000 * 12) && xd.actualNoi.months === 2, "actual NOI annualized");
ok(xd.uw && xd.uw.c.returns.irr && xd.uw.attr.rows.length > 0, "underwritten vs. actual included when there is a baseline");
const plain = BX.planExtrasData({ ...b2, assetMedia: undefined }, { asOf: "2026-11-23" });
ok(!plain.planOnImage && plain.photos.length === 0 && plain.unitBoxes.every((u) => u.box) && plain.uw === null, "no media: the schematic boxes, no photos, no baseline section");

// ── Quarterly report (lib/quarterlyReport.js) ──
const QR = j(R + "/lib/quarterlyReport.js");
const FP = j(R + "/lib/fundPlan.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const fdata = FX.workspaceData();
const qterms = { ...DEFAULT_FUND_TERMS, ...fdata.funds["Model Fund I"], name: "Model Fund I", capitalActivity: [] };
const qdeals = built.map((b) => sp.snapshotDeal(b.inputs, b.id));
const Q3 = "2026-09-30";
const sh = QR.buildQuarterlyReport(qdeals, qterms, {}, { qEnd: Q3, todayISO: "2026-11-23", kind: "shareable" });
ok(sh.quarter === "2026-Q3" && sh.quarterLabel === "2026 Q3" && sh.portfolio.length === 7 && sh.fund.assets === 7, "Q3 2026: the seven assets held at quarter end");
ok(sh.portfolio.every((x) => x.value > 0 && x.cost > 0 && x.loan > 0 && x.cover && x.occupancy > 0), "each asset: value, cost, loan, cover photo, occupancy");
ok(close(sh.nav.end - sh.nav.start, sh.nav.contributions - sh.nav.distributions + sh.nav.valueChange, 1e-6), "NAV movement adds up: start + contributions − distributions + change = end");
ok(sh.returns.note && sh.returns.netIrr === null && isFinite(sh.returns.grossIrr), `net returns n/m while LPs haven't funded (${sh.returns.note})`);
ok(!sh.internal && sh.plan === null, "shareable: no internal section; no plan until one is frozen");
ok(close(sh.debt.total, sh.portfolio.reduce((t2, x) => t2 + x.loan, 0)) && sh.debt.ltv > 0 && sh.debt.ltv < 100, `debt ${Math.round(sh.debt.total).toLocaleString()}, LTV ${sh.debt.ltv.toFixed(1)}%`);
const later = QR.buildQuarterlyReport(qdeals, qterms, {}, { qEnd: "2027-12-31", todayISO: "2028-02-01", kind: "shareable" });
ok(!later.returns.note && isFinite(later.returns.netIrr) && isFinite(later.returns.tvpi) && later.capital.called > 0, `2027 Q4: net LP IRR ${later.returns.netIrr.toFixed(1)}%, TVPI ${later.returns.tvpi.toFixed(2)}x`);
const letter = QR.draftLetter(later);
ok(/Dear Investors/.test(letter) && /2027 Q4/.test(letter) && /net LP IRR of -?\d/.test(letter) && /\[Add the quarter.s highlights/.test(letter), "letter drafted from the figures, with a placeholder for highlights");
ok(/Gross asset value was \$/.test(QR.draftLetter(sh)), "before LPs fund: the letter describes gross asset value instead of NAV");
const withPlan = { ...qterms, fundPlan: FP.addPlanVersion(undefined, FP.freezePlan(FP.fundProjection(qdeals, qterms, { todayISO: "2026-11-23" }))) };
const wp = QR.buildQuarterlyReport(qdeals, withPlan, {}, { qEnd: Q3, todayISO: "2026-11-23", kind: "shareable" });
ok(wp.plan && wp.plan.toDate.length >= 5 && wp.plan.projected.length >= 5, "plan vs. actual included once a plan is frozen (phase K)");
const xin2 = qdeals.map((d, i) => (i === 1 ? { ...d, inputs: { ...d.inputs, uwBaseline: { at: "2026-03-16T00:00:00Z", inputs: { ...d.inputs, exitCapRatePct: d.inputs.exitCapRatePct - 0.5 } } } } : d));
const it = QR.buildQuarterlyReport(xin2, qterms, {}, { qEnd: Q3, todayISO: "2026-11-23", kind: "internal" });
ok(it.internal && it.internal.uw.length === 1 && Array.isArray(it.internal.budget), "internal: underwritten vs. actual (1 asset with a baseline) and budget variances");
let reps = QR.issueReport(undefined, sh, { letter: "Hello", by: "cfo@example.com", at: "2026-10-20T10:00:00Z" });
reps = QR.issueReport(reps, it, { letter: "Hi", notes: "watch Harbor", by: "cfo@example.com" });
reps = QR.issueReport(reps, sh, { letter: "Hello again" });
ok(reps.issued.length === 3 && reps.issued[0].v === 1 && reps.issued[2].v === 2 && reps.issued[1].notes === "watch Harbor" && reps.issued[0].notes === "", "issued versions numbered per quarter and version; notes only on internal");
sh.nav.end = 1; ok(reps.issued[0].report.nav.end !== 1, "an issued report's figures are frozen copies");
const xr = QR.reportXlsx(it, { letter: "L", notes: "N" });
ok(xr[0][0].includes("internal") && xr.some((r2) => r2[0] === "Internal notes") && !QR.reportXlsx(wp, {}).some((r2) => r2[0] === "Internal notes"), "Excel: internal rows only in the internal version");

// ── Fund limits (lib/fundLimits.js) ──
const FL = j(R + "/lib/fundLimits.js");
const held7 = qdeals.filter((d) => sh.portfolio.some((x) => x.id === d.id));
const values = Object.fromEntries(sh.portfolio.map((x) => [x.id, x.value]));
const li = FL.limitInputs(held7, { values, lineBalance: 20_000_000 });
ok(li.assets.length === 7 && li.assets.every((a) => a.value > 0 && a.equity > 0 && a.loan > 0), "limit inputs: value, equity and loan per asset");
const lt = { ...qterms, targetEquity: 100_000_000, limits: [
  { key: "single_asset_pct", label: "Single asset", limit: 15, unit: "%", clause: "6.2(a)", quote: "no more than 15% of commitments in any one asset" },
  { key: "fund_ltv_pct", label: "Fund leverage", limit: 65, unit: "%", clause: "6.4" },
  { key: "state_pct", label: "Single state", limit: 40, unit: "%" },
  { key: "property_type", label: "Property types", limit: "Industrial and flex only", unit: "text" },
], internalLimits: [{ key: "borrowing_pct", label: "Sub line", limit: 21, unit: "%" }] };
const rowsL = FL.checkLimits(lt, li);
const rk = (k) => rowsL.find((x) => x.key === k);
const bigEq = Math.max(...li.assets.map((a) => a.equity));
ok(close(rk("single_asset_pct").actual, bigEq / 1e6) && rk("single_asset_pct").status === "within" && rk("single_asset_pct").clause === "6.2(a)", `single asset ${rk("single_asset_pct").actual.toFixed(1)}% of commitments: within, with its clause`);
const ltv = (li.assets.reduce((t2, a) => t2 + a.loan, 0) / li.assets.reduce((t2, a) => t2 + a.value, 0)) * 100;
ok(close(rk("fund_ltv_pct").actual, ltv) && rk("fund_ltv_pct").status === (ltv > 65 ? "breached" : ltv >= 58.5 ? "near" : "within"), `fund LTV ${ltv.toFixed(1)}% vs 65%: ${rk("fund_ltv_pct").status}`);
ok(rk("state_pct").what && rk("state_pct").actual > 0 && rk("state_pct").actual <= 100, `largest state: ${rk("state_pct").what} ${rk("state_pct").actual.toFixed(1)}%`);
ok(rk("property_type").status === "review" && /Industrial/.test(rk("property_type").what), "text limit: review, with the fund's property types");
ok(rk("borrowing_pct").source === "internal" && close(rk("borrowing_pct").actual, 20) && rk("borrowing_pct").status === "near" && close(rk("borrowing_pct").headroom, 1), "internal limit: sub line 20% of commitments vs 21%: near, 1 pt headroom");
ok(FL.statusOf(10, 10) === "near" && FL.statusOf(10.01, 10) === "breached" && FL.statusOf(8.99, 10) === "within" && FL.statusOf(null, 10) === "review", "status thresholds: within < 90% ≤ near ≤ limit < breached");
const tenantDeal = { id: "t", inputs: { propertyName: "T", purchasePrice: 1e6, units: [{ tenantName: "Acme", leaseStatus: "occupied", currentRentPSF: 10, squareFeet: 3000 }, { tenantName: "Beta", leaseStatus: "occupied", currentRentPSF: 10, squareFeet: 1000 }, { tenantName: "Acme", leaseStatus: "occupied", currentRentPSF: 10, squareFeet: 1000 }] } };
ok(close(FL.actualFor("single_tenant_pct", FL.limitInputs([tenantDeal]), 0).value, 80) && FL.actualFor("single_tenant_pct", FL.limitInputs([tenantDeal]), 0).what === "Acme", "largest tenant: Acme 80% of rent (units summed by tenant)");
const big = { id: "pipe", inputs: { ...held7[0].inputs, propertyName: "Big Pipeline Deal", purchasePrice: 60_000_000, state: "CA", city: "Fontana" } };
const pre = FL.preAcquisition(lt, held7, big, { values, lineBalance: 20_000_000 });
ok(pre.find((x) => x.key === "single_asset_pct").newBreach && pre.find((x) => x.key === "single_asset_pct").before.status === "within", "pre-acquisition: a $60M deal would breach the 15% single-asset limit (new breach)");
ok(FL.limitsXlsx("Model Fund I", rowsL).length === rowsL.length + 3, "Excel rows");
const itl = QR.buildQuarterlyReport(qdeals, lt, {}, { qEnd: Q3, todayISO: "2026-11-23", kind: "internal" });
ok(itl.internal.limits.length === 5 && itl.internal.limits.some((x) => x.source === "internal"), "internal report summarises the fund limits");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
