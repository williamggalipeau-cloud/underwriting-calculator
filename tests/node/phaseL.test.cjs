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

// ── Risk report (lib/riskReport.js) and its test data (lib/sampleRiskData.js) ──
const RK = j(R + "/lib/riskReport.js");
const SR = j(R + "/lib/sampleRiskData.js");
ok(built.every((b) => SR.SAMPLE_RISK[b.inputs.propertyName] && b.inputs.envRisk && b.inputs.lenderName !== "First National Bank"), "sample assets are built with made-up lenders and environmental entries");
const plainDeal = { id: "x", inputs: { ...built[0].inputs, lenderName: "First National Bank", capProviders: {}, envRisk: undefined } };
ok(SR.withRiskTestData(plainDeal).inputs.lenderName === "Desert Mountain Bank" && SR.withRiskTestData(plainDeal).inputs.capProviders[1] === "Atlas Derivatives Bank", "Sample data → risk test data fills the default lender and empty provider");
const own = { id: "y", inputs: { ...built[0].inputs, lenderName: "My Bank" } };
ok(SR.withRiskTestData(own).inputs.lenderName === "My Bank" && SR.withRiskTestData(built[0]) === built[0], "a lender someone entered is kept; nothing to add returns the same deal");
const rr = RK.riskReport(held7, { ...qterms, limits: lt.limits }, { asOf: "2026-09-30", values });
ok(rr.leasing.fund.by.length === 6 && rr.leasing.assets.length === 7 && rr.leasing.fund.rollover12RentPct > 0, `leasing: 6 years of expirations; 12-month rollover ${rr.leasing.fund.rollover12RentPct.toFixed(0)}% of rent`);
ok(Math.abs(rr.leasing.fund.by.reduce((t2, b2) => t2 + b2.rentPct, 0)) <= 100.0001, "expirations never exceed 100% of rent");
ok(rr.tenants.length === 10 && rr.tenants[0].rent >= rr.tenants[9].rent && rr.tenants.every((x) => x.pct > 0), "top 10 tenants by rent");
ok(rr.industry.fund.length > 3 && close(rr.industry.fund.reduce((t2, g) => t2 + g.rentPct, 0) + rr.industry.unclassifiedPct, 100, 1e-6), "industry groups + unclassified = 100% of fund rent");
const cas = rr.lenders.rows.find((l) => l.lender === "Cascade Commercial Bank");
ok(cas && cas.pct > 35 && rr.fundFlags.some((f) => /Cascade Commercial Bank holds/.test(f.text)), `lender concentration: Cascade ${cas.pct.toFixed(1)}% > 35%, flagged`);
ok(rr.lenders.hhi > 0 && rr.lenders.hhi <= 10000 && close(rr.lenders.rows.reduce((t2, l) => t2 + l.pct, 0), 100, 1e-6), `lender HHI ${rr.lenders.hhi}; shares add to 100%`);
const atlas = rr.caps.byProvider.find((x) => x.provider === "Atlas Derivatives Bank");
ok(atlas && atlas.pct > 50 && rr.caps.missing.includes("Canal Street Workshops"), `cap counterparties: Atlas ${atlas.pct.toFixed(0)}% of capped notional; Canal Street has no provider`);
ok(rr.caps.byProvider.every((p) => p.value >= 0) && rr.debt.every((d) => d.capped ? d.capEnd > "2026-09-30" : true), "cap market values (exposure) and expiries");
ok(rr.geography.states[0].valuePct >= rr.geography.states.at(-1).valuePct && close(rr.geography.states.reduce((t2, x) => t2 + x.valuePct, 0), 100, 1e-6), "geography: states by share of value");
const hl = rr.environmental.find((e) => e.name === "Harbor Light Industrial");
const rg = rr.environmental.find((e) => e.name === "Ridgeway Trade Center");
ok(hl.open.some((o) => /RECs without/.test(o)) && hl.open.some((o) => /flood zone AE/.test(o)) && rg.open.some((o) => /over 5 years old/.test(o)), "environmental: open REC, flood zone AE, old Phase I flagged");
ok(!rr.environmental.find((e) => e.name === "Mill Creek Business Park").open.some((o) => /RECs/.test(o)), "a REC with a no-further-action letter isn't open");
ok(rr.watch.length > 0 && rr.watch[0].score >= rr.watch.at(-1).score && rr.watch.every((w) => w.reasons.length), `watch list: ${rr.watch.length} assets, top ${rr.watch[0].name} (${rr.watch[0].score})`);
ok(rr.fundLimits.length === 4 && rr.fundFlags.some((f) => f.section === "Fund limits"), "fund limits included; a breach is a fund flag");
const rr2 = RK.riskReport(held7, { ...qterms, riskLimits: { lenderPct: 80 } }, { asOf: "2026-09-30", values });
ok(rr2.limits.lenderPct === 80 && !rr2.fundFlags.some((f) => /holds/.test(f.text)), "concentration limits can be changed per fund");
const rx = RK.riskXlsx("Model Fund I", rr);
{ // Grouped by similar risks (user, 11/24): Summary, Tenant and Leasing, Financial, Concentration, Operational.
  const at = (label) => rx.findIndex((r2) => r2.length === 1 && r2[0] === label);
  const idx = RK.RISK_GROUPS.map(at);
  ok(RK.RISK_GROUPS.join() === "SUMMARY,TENANT AND LEASING,FINANCIAL,CONCENTRATION,OPERATIONAL" && idx.every((x, i) => x > 0 && (i === 0 || x > idx[i - 1])), "Excel: the five groups, in order");
  const within = (label, g) => { const i = rx.findIndex((r2) => r2[0] === label); const k = RK.RISK_GROUPS.indexOf(g); return i > idx[k] && (k === idx.length - 1 || i < idx[k + 1]); };
  ok(idx[0] === 2 && within("At a glance", "SUMMARY") && within("Watch list", "SUMMARY") && within("Lease expirations (fund)", "TENANT AND LEASING") && within("Lease risk flags", "TENANT AND LEASING") || !rx.some((r2) => r2[0] === "Lease risk flags"), "summary first; leasing items under Tenant and Leasing");
  ok(within("Stress (levered IRR %)", "FINANCIAL") && within("Valuation", "FINANCIAL") && within("Tenant", "CONCENTRATION") && within("Lender", "CONCENTRATION") && within("Cap counterparty", "CONCENTRATION") && within("Environmental", "OPERATIONAL"), "stress and valuation under Financial; tenants, lenders and caps under Concentration; environmental under Operational");
  const glance = rx.find((r2) => r2[0] === "Watch list (assets flagged)");
  ok(glance && glance[1] === rr.watch.length, "summary: the watch list count");
}
ok(/INTERNAL/.test(rx[0][0]) && rx.some((r2) => r2[0] === "Lender") && rx.some((r2) => r2[0] === "Cap counterparty") && rx.some((r2) => r2[0] === "Environmental"), "Excel: internal title and every section");

// ── TI funding coverage (lib/tiFunding.js) ──
const TI = j(R + "/lib/tiFunding.js");
const tic = TI.tiCoverage(qdeals, qterms, { asOf: "2026-11-23" });
ok(tic.quarters.length === 8 && tic.quarters[0].label === "2026 Q4" && tic.quarters[7].label === "2028 Q3", "8 quarters from 2026 Q4");
const colors = new Set(tic.assets.flatMap((a) => a.cells.map((c) => c.color)));
ok(["green", "lightgreen", "amber", "red", "grey"].every((c) => colors.has(c)), `the test data shows every colour (${[...colors].join(", ")})`);
ok(tic.assets.every((a) => a.cells.every((c) => Math.abs(c.fromFacility + c.fromCash + c.fromLine + c.call - c.need) < 1e-6)), "each quarter's need = facility + cash flow + sub line + capital call");
const rgw = tic.assets.find((a) => a.name === "Ridgeway Trade Center");
ok(rgw.cells[0].testFailed && rgw.cells[0].color === "red" && rgw.cells[0].dscr < 1.45 && rgw.cells.slice(2).every((c) => !c.testFailed), "Ridgeway misses its 1.45x draw test at first, passes later");
const lks = tic.assets.find((a) => a.name === "Lakeshore Service Center");
const q28 = lks.cells.find((c) => c.label === "2028 Q1");
ok(q28.need >= 400000 && q28.fromLine === 0 && q28.call > 0 && tic.fundCall[5] > 0 && tic.lineExpires === "2027-12-31", "Lakeshore's 2028 re-tenanting: sub line expired, capital call needed");
ok(tic.assets.every((a) => !a.facility || a.cells.every((c, i) => i === 0 || c.facilityLeft <= a.cells[i - 1].facilityLeft + 1e-6)), "facility balance only goes down");
const cnl = tic.assets.find((a) => a.name === "Canal Street Workshops");
ok(!cnl.facility && cnl.cells.some((c) => c.color === "amber") && cnl.cells.every((c) => c.fromFacility === 0), "no facility: cash flow, then the sub line");
ok(TI.facilityOf({ tiReserve: { enabled: true, reservePSF: 8, minDrawDSCR: 1.1 } }, 1000).total === 8000 && TI.facilityOf({}, 1000) === null, "facility from the model's TI reserve when no loan facility is set");
const rrt = RK.riskReport(qdeals.filter((d) => sh.portfolio.some((x) => x.id === d.id)), qterms, { asOf: "2026-09-30", values, tiAsOf: "2026-11-23" });
ok(rrt.ti && rrt.watch.some((w) => w.reasons.some((x) => /TI draw test/.test(x))), "risk report: TI heat map and draw-test flags on the watch list");

// ── Stress section ──
ok(rrt.stress.assets.length === 7 && rrt.stress.shocks.length === 5, "stress: 7 assets × 5 shocks");
ok(rrt.stress.assets.every((a) => a.results.every((x) => x.irr == null || x.irr <= a.baseIrr + 1e-6)), "every shock lowers (never raises) the IRR");
const combI = rrt.stress.fund.byShock.find((x) => x.key === "combined").irr;
ok(combI < Math.min(...rrt.stress.fund.byShock.filter((x) => x.key !== "combined").map((x) => x.irr)) + 1e-6, `all four together hurts most: fund IRR ${rrt.stress.fund.baseIrr.toFixed(1)}% → ${combI.toFixed(1)}%`);
ok(RK.riskXlsx("F", rrt).some((r2) => r2[0] === "Stress (levered IRR %)"), "Excel: stress block");

// ── Insurance and lease risk flags (documents from the database) ──
const h7 = qdeals.filter((d) => sh.portfolio.some((x) => x.id === d.id));
const docs = {
  leases: [
    { id: "L1", deal_id: h7[0].id, tenant: "Ironwood Electrical Contractors", abstract: { risks: [{ severity: "high", title: "Tenant termination right after year 3", clause: "4.2" }, { severity: "low", title: "Relocation clause", clause: "9.1" }], insurance: {} } },
    { id: "L2", deal_id: h7[0].id, tenant: "Evergreen Food Distributors", abstract: { risks: [] } },
  ],
  dealDocs: [
    { id: "D1", deal_id: h7[0].id, doc_type: "insurance_cert", lease_id: null, abstract: { policies: [{ coverage: "property", policy_no: "P-1", expiry: "2026-10-01" }] } },
    { id: "D2", deal_id: h7[0].id, doc_type: "insurance_cert", lease_id: "L1", abstract: { policies: [{ coverage: "cgl", policy_no: "G-7", expiry: "2027-06-30", per_occurrence: 1000000, aggregate: 2000000 }] } },
  ],
};
const rd = RK.riskReport(h7, qterms, { asOf: "2026-11-23", values, docs });
const ins0 = rd.insurance.find((x) => x.id === h7[0].id);
ok(ins0.certificates === 2 && ins0.gaps.some((g) => g.severity === "high" && /property policy P-1 expired 2026-10-01/.test(g.text)), "insurance: the owner's property policy has expired (high)");
ok(ins0.gaps.some((g) => /No tenant certificate for Evergreen Food Distributors/.test(g.text)), "insurance: a lease with no tenant certificate");
ok(rd.insurance.filter((x) => x.id !== h7[0].id).every((x) => x.gaps.some((g) => /No owner's insurance certificate/.test(g.text))), "insurance: assets with no owner's certificate");
ok(rd.leaseFlags.rows.length === 2 && rd.leaseFlags.byType.some((t) => t.type === "Termination rights" && t.high === 1), "lease risk flags by type, with the high ones");
ok(rd.watch.find((w) => w.id === h7[0].id).reasons.some((x) => /Insurance: property policy/.test(x)) && rd.watch.find((w) => w.id === h7[0].id).reasons.some((x) => /Lease risk: Ironwood/.test(x)), "the expired policy and the termination right go on the watch list");
ok(RK.riskReport(h7, qterms, { asOf: "2026-11-23", values }).insurance === null, "signed out (no documents loaded): no insurance section");

// ── TI scenario actions ──
const lkId = lks.id, q281 = q28.quarter;
const postponed = TI.tiCoverage(qdeals, qterms, { asOf: "2026-11-23", actions: [{ dealId: lkId, quarter: q281, kind: "postpone", to: "2028-09-30" }] });
const lk2 = postponed.assets.find((a) => a.id === lkId);
ok(lk2.cells.find((c) => c.quarter === q281).need === 0 && close(lk2.cells.at(-1).need, lks.cells.at(-1).need + q28.need), "postpone: the quarter's need moves to the later quarter");
const cutS = TI.tiCoverage(qdeals, qterms, { asOf: "2026-11-23", actions: [{ dealId: lkId, quarter: q281, kind: "cut", pct: 50 }] });
ok(close(cutS.assets.find((a) => a.id === lkId).cells.find((c) => c.quarter === q281).need, q28.need / 2), "cut 50%: half the need");
const callS = TI.tiCoverage(qdeals, qterms, { asOf: "2026-11-23", actions: [{ dealId: lkId, quarter: q281, kind: "call", amount: 1_000_000 }] });
const cc = callS.assets.find((a) => a.id === lkId).cells.find((c) => c.quarter === q281);
ok(cc.color === "blue" && cc.call === 0 && cc.fromPlanned > 0 && callS.fundCall[5] < tic.fundCall[5], "planned call: the capital call is planned (blue), not a surprise");
ok(TI.tiCoverage(qdeals, qterms, { asOf: "2026-11-23", actions: [{ dealId: lkId, quarter: q281, kind: "postpone", to: "2026-12-31" }] }).assets.find((a) => a.id === lkId).cells.find((c) => c.quarter === q281).need === q28.need, "can't postpone into an earlier quarter");

// ── Change vs. last quarter ──
const q2 = QR.buildQuarterlyReport(qdeals, qterms, {}, { qEnd: "2026-06-30", todayISO: "2026-11-23", kind: "shareable" });
const prevDeals = qdeals.filter((d) => q2.portfolio.some((x) => x.id === d.id));
const rPrev = RK.riskReport(prevDeals, qterms, { asOf: "2026-06-30", values: Object.fromEntries(q2.portfolio.map((x) => [x.id, x.value])) });
const ch = RK.concentrationChange(rr, rPrev);
ok(ch.length === 10 && ch.every((c) => c.now == null || c.prev == null || close(c.change, c.now - c.prev)), "change = now − last quarter for each concentration");
ok(prevDeals.length < h7.length && ch.find((c) => c.key === "state").prev !== ch.find((c) => c.key === "state").now, `fewer assets last quarter (${prevDeals.length} vs ${h7.length}): the state concentration moved`);
ok(RK.concentrationChange(rr, null).every((c) => c.prev == null && c.change == null), "no prior quarter: no change shown");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
