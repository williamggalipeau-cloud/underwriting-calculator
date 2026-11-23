// Phase U: Market Data (lib/market.js) on the fictional sample export.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const M = j(R + "/lib/market.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const fs = require("fs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;

ok(["2026 Q3", "Q3 2026", "3Q26", "2026-09-30", "2026-08", "9/30/2026", "2026-Q3"].every((v) => M.quarterKey(v) === "2026-Q3") && M.quarterKey("soon") === "", "quarters in any common form");
const grid = parseCSV(fs.readFileSync(R + "/docs/sample-market/submarket-stats-sample.csv", "utf8"));
const det = M.detectMarketMapping(grid);
ok(det.ok && det.headerRow === 1 && det.names.vacancyPct === "Vacancy Rate" && det.names.askingRentSmallBayPSF === "Small Bay Asking Rent" && det.names.capRatePct === "Market Cap Rate", "columns matched by name (header row found)");
const r = M.importMarket(M.EMPTY_MARKET, grid, det, { source: "sample.csv", sourceDate: "2026-11-23" });
ok(r.added === 7 && r.market.submarkets.length === 2 && r.market.mapping.quarter === "Period", "7 quarters in 2 new submarkets; columns remembered");
const air = r.market.submarkets.find((s) => s.name === "Example Airport Industrial");
const ser = M.seriesFor(r.market, air.id);
ok(ser.length === 5 && ser[0].quarter === "2025-Q3" && ser[4].vacancyPct === 5.9 && ser[4].salesVolume === 44e6 && ser[4].source === "sample.csv", "values cleaned (%, $, commas), sorted, with source");
const again = M.importMarket(r.market, [grid[1], ["Example Airport Industrial", "2026 Q3", "", "6.0%"]], { ...det, headerRow: 0 });
ok(again.updated === 1 && again.added === 0 && M.seriesFor(again.market, air.id)[4].vacancyPct === 6 && M.seriesFor(again.market, air.id)[4].capRatePct === 6.35, "the same submarket and quarter updates in place (other figures kept)");
const one = M.importMarket(r.market, [["Period", "Vacancy Rate", "Market Cap Rate"], ["2026 Q4", "6.1", "6.4"]], { headerRow: 0, mapping: { quarter: 0, vacancyPct: 1, capRatePct: 2 } }, { defaultSubmarket: "Example Airport Industrial" });
ok(one.added === 1 && one.market.submarkets.length === 2, "a file without a submarket column goes to the chosen submarket");

const sum = M.submarketSummary(r.market, air.id);
ok(sum.vacancy.latest === 5.9 && close(sum.vacancy.change, 5.9 - 4.8) && close(sum.rent.annualPct, (11.70 / 11.20 - 1) * 100) && sum.absorption === 180000 + 95000 + 120000 + 60000, "trends: vacancy change, asking-rent growth over 4 quarters, absorption");
const riv = M.submarketSummary(r.market, r.market.submarkets.find((s) => s.name === "Example Riverside Flex").id);
ok(close(riv.rent.annualPct, (Math.pow(13.55 / 13.40, 4) - 1) * 100), "fewer quarters: growth annualized");

const v = M.assetVsMarket({ submarketId: air.id, rentPerSF: 13.5, annualRentEscalationPct: 3, vacancyPct: 5, exitCapRatePct: 6.75 }, r.market);
const row = (k) => v.rows.find((x) => x.key === k);
ok(v.submarket.id === air.id && v.quarter === "2026-Q3" && row("rent").market === 14 && close(row("rent").diff, -0.5) && close(row("exitCap").diff, 0.4), "asset vs. market: rent vs. small-bay asking, exit cap vs. market cap");
ok(close(row("growth").market, (14 / 13.10 - 1) * 100), "rent growth vs. the small-bay asking-rent trend");
ok(M.assetVsMarket({ submarketId: "nope" }, r.market) === null, "untagged asset: no comparison");

const x = M.marketXlsx(r.market);
ok(x.filter((row) => row[0] === "Example Airport Industrial").length === 6 && x.some((row) => row[0] === "Submarket" && row[1] === "Latest quarter"), "Excel: every quarter and a summary per submarket");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
