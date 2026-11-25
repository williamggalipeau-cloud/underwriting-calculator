// Version 1.1 (user, 11/25): the market check on the Valuation tab and the
// Asset Business Plan, with flag levels set per portfolio (defaults 50 bp
// cap rate, 10% rent, 2 pts vacancy, 1 pt rent growth; red at 1.5×).
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const C = j(R + "/lib/marketCheck.js");
const M = j(R + "/lib/market.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const fs = require("fs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;

const grid = parseCSV(fs.readFileSync(R + "/docs/sample-market/submarket-stats-sample.csv", "utf8"));
const market = M.importMarket(M.EMPTY_MARKET, grid, M.detectMarketMapping(grid), { source: "sample.csv", sourceDate: "2026-10-15" }).market;
const sm = market.submarkets.find((s) => s.name === "Example Airport Industrial");
const sum = M.submarketSummary(market, sm.id);
const mCap = sum.cap.latest, mRent = sum.smallBay.latest ?? sum.rent.latest, mVac = sum.vacancy.latest, mGrowth = sum.smallBay.annualPct ?? sum.rent.annualPct;

ok(JSON.stringify(C.flagsOf({})) === JSON.stringify({ capBp: 50, rentPct: 10, vacancyPts: 2, growthPts: 1, redMultiple: 1.5 }), "defaults: 50 bp, 10%, 2 pts, 1 pt; red at 1.5×");
ok(C.flagsOf({ marketFlags: { capBp: 75, rentPct: "" } }).capBp === 75 && C.flagsOf({ marketFlags: { capBp: 75, rentPct: "" } }).rentPct === 10, "a portfolio's own levels; blanks fall back to the defaults");

// Valuation: mark cap 55 bp above market (amber), rent 11.3% below (amber), vacancy in line
const inputs = { submarketId: sm.id, rentPerSF: mRent * (1 - 0.113), vacancyPct: mVac + 0.8, annualRentEscalationPct: mGrowth - 0.4, exitCapRatePct: mCap + 0.8 };
const v = C.marketCheck(inputs, market, { mark: { capRate: mCap + 0.55 } });
const row = (res, k) => res.rows.find((r) => r.kind === k);
ok(v.submarket?.name === "Example Airport Industrial" && v.quarter && v.source === "sample.csv", `the asset's submarket, latest quarter (${v.quarter}) and source`);
ok(close(row(v, "cap").gap, 55, 1e-6) && row(v, "cap").status === "amber" && C.statusText(row(v, "cap")) === "Above market" && C.gapLabel(row(v, "cap")) === "+55 bp", "mark cap rate +55 bp: amber, above market");
ok(close(row(v, "rent").gap, -11.3, 1e-6) && row(v, "rent").status === "amber" && C.statusText(row(v, "rent")) === "Below market", "rent 11.3% below: amber, below market");
ok(row(v, "vacancy").status === "ok" && C.statusText(row(v, "vacancy")) === "In line" && row(v, "growth").status === "ok", "vacancy +0.8 pts and rent growth −0.4 pts: in line");
ok(v.worst === "amber", "worst flag: amber");

// Business plan: exit cap 80 bp above (red past 75 = 1.5 × 50)
const p = C.marketCheck({ ...inputs, businessPlan: { revisions: [{ plan: { leasing: [{ targetRentPSF: mRent * 0.975 }, { targetRentPSF: mRent * 0.975 }] } }] } }, market, { mode: "plan" });
ok(close(row(p, "cap").gap, 80, 1e-6) && row(p, "cap").status === "red" && p.worst === "red", "plan exit cap +80 bp: red (past 1.5 × 50 bp)");
ok(close(row(p, "rent").gap, -2.5, 1e-6) && row(p, "rent").status === "ok" && /lease-up/.test(row(p, "rent").label), "plan lease-up rent −2.5%: in line");

// Per-portfolio levels change the flags
const tight = C.marketCheck(inputs, market, { mark: { capRate: mCap + 0.55 }, flags: C.flagsOf({ marketFlags: { capBp: 25 } }) });
ok(row(tight, "cap").status === "red", "a tighter portfolio level (25 bp): the same +55 bp is red");
const loose = C.marketCheck(inputs, market, { mark: { capRate: mCap + 0.55 }, flags: C.flagsOf({ marketFlags: { capBp: 100 } }) });
ok(row(loose, "cap").status === "ok", "a looser level (100 bp): in line");

// No mark cap rate: the exit cap; no submarket: nothing to compare
ok(/exit/.test(row(C.marketCheck(inputs, market, { mark: null }), "cap").label), "no mark cap rate: compares the exit cap and says so");
ok(C.marketCheck({ rentPerSF: 10 }, market).submarket === null && C.marketCheck({ rentPerSF: 10 }, market).rows.length === 0, "an asset without a submarket: nothing to compare");
ok(C.latestMark({ "2026-06-30": { value: 1, capRate: 6 }, "2026-09-30": { value: 2, capRate: 6.1 } }).quarter === "2026-09-30", "the latest mark");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
