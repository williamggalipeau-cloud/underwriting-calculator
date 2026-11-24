// Phase Y: Benchmarking (lib/benchmarks.js): uploads, time-weighted returns,
// vintage quartiles and PME, on fictional data (docs/sample-benchmarks and
// the fixture fund with its dates moved four years earlier).
const fs = require("fs");
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const B = j(R + "/lib/benchmarks.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const grid = (f) => parseCSV(fs.readFileSync(R + "/docs/sample-benchmarks/" + f, "utf8"));

// ── Parsing ──
ok(B.monthKey("2026-09-30") === "2026-09" && B.monthKey("9/30/2026") === "2026-09" && B.monthKey("Sep 2026") === "2026-09" && B.monthKey("September 2026") === "2026-09" && B.monthKey("x") === "", "month keys");
const gi = grid("ncreif-npi-industrial.csv");
const di = B.detectIndexColumns(gi);
ok(di.ok && di.map.quarter === 0 && di.map.total === 1 && di.map.income === 2 && di.map.appreciation === 3, "index columns found");
const idx = B.parseIndex(gi, di);
ok(idx.length === 31 && idx[0].q === "2019-Q1" && idx.at(-1).q === "2026-Q3" && close(idx[0].total, idx[0].income + idx[0].appreciation, 0.011), `index rows: ${idx.length}, quarters 2019-Q1 to 2026-Q3`);
const dec = B.parseIndex([["Period", "Total"], ["2026-03-31", "0.021"], ["2026-06-30", "-0.004"]], B.detectIndexColumns([["Period", "Total"]]));
ok(close(dec[0].total, 2.1) && close(dec[1].total, -0.4) && dec[0].q === "2026-Q1", "decimal returns read as %");
const gp = grid("preqin-vintage-quartiles.csv");
const dp = B.detectVintageColumns(gp);
ok(dp.ok && dp.isWide && dp.wide.irr.median >= 0 && dp.wide.tvpi.uq >= 0 && dp.wide.dpi.lq >= 0, "vintage columns (wide) found");
const pq = B.parseVintage(gp, dp);
const v22 = pq.find((r) => r.vintage === 2022 && r.strategy === "Value Added" && r.metric === "irr");
ok(pq.length === 7 * 2 * 3 && close(v22.uq, 15.4) && close(v22.median, 9.4) && close(v22.lq, 4.4), "Preqin rows: vintage × strategy × metric, % read");
const gc = grid("cambridge-vintage-quartiles.csv");
const dc = B.detectVintageColumns(gc);
const cq = B.parseVintage(gc, dc);
ok(dc.ok && !dc.isWide && cq.length === 21 && cq.find((r) => r.vintage === 2022 && r.metric === "tvpi").median === 1.12, "Cambridge rows (long form with a Metric column)");
const gm = grid("reit-monthly-returns.csv");
const dm = B.detectMonthlyColumns(gm);
ok(dm.ok && ["nareitInd", "EGP", "REXR", "TRNO", "STAG", "nareitAll", "sp500"].every((k) => dm.series[k] >= 0), `monthly series matched: ${Object.keys(dm.series).join(", ")}`);
const mo = B.parseMonthly(gm, dm);
ok(mo.nareitInd.length === 94 && mo.nareitInd[0].m === "2019-01" && close(mo.nareitInd[0].ret, 2.26), "monthly decimals read as %");

// ── Store ──
let b = { ...B.EMPTY_BENCHMARKS };
b = B.importBenchmark(b, { kind: "index", key: "npiInd", rows: idx, meta: { source: "NCREIF (sample)", fileName: "ncreif-npi-industrial.csv", by: "a@example.com" } });
b = B.importBenchmark(b, { kind: "index", key: "npi", rows: B.parseIndex(grid("ncreif-npi.csv"), B.detectIndexColumns(grid("ncreif-npi.csv"))) });
b = B.importBenchmark(b, { kind: "vintage", key: "preqin", rows: pq });
b = B.importBenchmark(b, { kind: "vintage", key: "cambridge", rows: cq });
b = B.importBenchmark(b, { kind: "monthly", series: mo, meta: { fileName: "reit-monthly-returns.csv" } });
ok(b.index.npiInd.rows.length === 31 && b.index.npiInd.by === "a@example.com" && b.monthly.STAG.rows.length === 94 && b.monthly.STAG.fileName === "reit-monthly-returns.csv", "uploads kept with source, file and who");
ok(B.benchmarksOf({ benchmarks: b }).index.npi && B.benchmarksOf(null).index && Object.keys(B.benchmarksOf({}).monthly).length === 0, "benchmarksOf reads the comps settings");

// ── Math ──
ok(close(B.chain([10, -10]), 0.99) && close(B.annualize([1, 1, 1, 1]), (1.01 ** 4 - 1) * 100) && close(B.annualize([2, 2]), (1.02 ** 2 - 1) * 100) && close(B.annualize([1, 1, 1, 1, 1, 1, 1, 1]), (1.01 ** 4 - 1) * 100), "chain-linking; annualized over a year, cumulative under");
const qrow = { uq: 15, median: 10, lq: 5 };
ok(B.quartile(16, qrow) === 1 && B.quartile(12, qrow) === 2 && B.quartile(7, qrow) === 3 && B.quartile(2, qrow) === 4 && B.quartile(null, qrow) === null, "quartiles");
// PME against a flat index: KS = TVPI; index-equivalent IRR ≈ 0.
const flat = { levels: new Map([["2020-12", 100], ...Array.from({ length: 72 }, (_, i) => [`${2021 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, 100])]), first: "2020-12", last: "2026-12" };
const fl = [{ date: "2021-03-31", amount: -100 }, { date: "2023-06-30", amount: 30 }];
const p0 = B.pme(fl, 100, "2026-09-30", flat);
ok(close(p0.ks, 1.3) && Math.abs(p0.indexIrr) < 1e-6 && p0.fundIrr > 0 && close(p0.spread, p0.fundIrr), "flat index: KS-PME = TVPI, index-equivalent IRR 0%");
// An index that doubles: KS halves.
const dbl = { ...flat, levels: new Map([...flat.levels].map(([m, v]) => [m, m >= "2024-01" ? 200 : 100])) };
const p1 = B.pme([{ date: "2021-03-31", amount: -100 }], 150, "2026-09-30", dbl);
ok(close(p1.ks, 0.75) && p1.indexIrr > p1.fundIrr && p1.spread < 0, "an index that doubled: KS-PME 0.75, the index beat the fund");
ok(B.pme([{ date: "2018-03-31", amount: -100 }], 100, "2026-09-30", flat).missing === true, "an index that starts after the first flow: not covered");
const bk = B.monthlyLevels(b.monthly, "basket");
ok(bk.peers === 4 && close(bk.levels.get("2019-01"), 100 * (1 + mo.EGP.concat().find((r) => r.m === "2019-01").ret / 400 + mo.REXR[0].ret / 400 + mo.TRNO[0].ret / 400 + mo.STAG[0].ret / 400), 1e-9), "peer basket: equal weight of the four REITs");

// ── The fund (fixture dates moved four years earlier) ──
const shift = (iso) => (iso ? `${Number(iso.slice(0, 4)) - 4}${iso.slice(4)}` : iso);
const data = FX.workspaceData();
const fn = "Model Fund I";
const terms = { ...DEFAULT_FUND_TERMS, ...data.funds[fn], name: fn, finalClose: shift(data.funds[fn].finalClose), firstClose: shift(data.funds[fn].firstClose) };
const deals = data.deals.filter((d) => d.inputs.fundName === fn).map((d) => snapshotDeal({ ...d.inputs, acquisitionDate: shift(d.inputs.acquisitionDate) }, d.id));
const base = B.fundBenchmarkBase(fn, deals, terms, {}, { todayISO: "2026-11-24" });
ok(base.vintage === 2022 && base.endQ === "2026-Q3" && base.twr.length >= 12, `fund: vintage ${base.vintage}, ${base.twr.length} quarters to ${base.endQ}`);
const tw = base.twr[3];
const den = tw.vBeg + 0.5 * tw.capex - tw.noi / 3;
ok(close(tw.income, (tw.noi / den) * 100) && close(tw.total, tw.income + tw.appreciation), "fund TWR: NCREIF-style income and appreciation");
ok(base.net && !base.net.nm && base.net.irr > 0 && base.lpFlows.some((f) => f.amount < 0) && base.lpFlows.some((f) => f.amount > 0), `net LP IRR ${base.net.irr.toFixed(1)}%, with LP flows`);
const rep = B.benchmarkReport(base, b, { strategy: "Value Added" });
const si = rep.periods.find((x) => x.period === "si"), y1 = rep.periods.find((x) => x.period === "1y");
ok(si.fund && si.index.npiInd && si.index.npi && si.index.odce === null, "since inception: fund vs. NPI Industrial and NPI (ODCE not uploaded)");
ok(y1.quarters === 4 && close(y1.fund.total, B.annualize(base.twr.slice(-4).map((r) => r.total))), "trailing year: the last four quarters, annualized");
ok(rep.periods.find((x) => x.period === "5y").fund === null, "5 years: not enough history");
ok(rep.assets.length === deals.length && rep.assets.filter((a) => a.si).every((a) => a.benchKey === "npiInd" && close(a.spread, a.si.total - a.bench.total)), "each asset vs. NPI Industrial over its own quarters");
const vq = rep.vintageQ.preqin;
ok(vq.irr.row.vintage === 2022 && vq.irr.row.strategy === "Value Added" && vq.irr.quartile === B.quartile(base.net.irr, vq.irr.row) && rep.strategies.includes("Industrial"), `Preqin 2022 Value Added: ${B.QUARTILE_LABEL[vq.irr.quartile]} on net IRR`);
ok(rep.vintageQ.cambridge.tvpi.row.metric === "tvpi" && rep.vintageQ.cambridge.tvpi.row.strategy === "Real Estate", "Cambridge: the vintage row (the only strategy)");
const main = rep.pme.find((x) => x.key === "nareitInd");
ok(main.loaded && main.by.si && main.by.si.ks > 0 && main.by.si.indexIrr != null && close(main.by.si.fundIrr, base.net.irr, 0.05), `PME vs. Nareit Industrial since inception: KS ${main.by.si.ks.toFixed(2)}, fund IRR ${main.by.si.fundIrr.toFixed(1)}% vs. index-equivalent ${main.by.si.indexIrr.toFixed(1)}%`);
ok(main.by["1y"] && main.by["1y"].ks > 0, "PME over the trailing year (the NAV a year ago as the start)");
const bas = rep.pme.find((x) => x.key === "basket");
ok(bas.loaded && bas.peers === 4 && bas.by.si.ks > 0, "PME vs. the small-bay peer basket");
ok(rep.chart.fund.length === base.twr.length && rep.chart.npiInd.length === base.twr.length && rep.chart.odce === null, "chart: growth of 100 for the fund and the indexes");
const x = B.benchmarkXlsx(rep, b);
ok(/licensed data/.test(x[0][0]) && x.some((r) => r[0] === "Public market equivalent") && x.some((r) => r[0] === "NCREIF NPI Industrial" && r[2] === "ncreif-npi-industrial.csv"), "Excel: returns, quartiles, PME and sources");
// Nothing uploaded
const none = B.benchmarkReport(base, B.benchmarksOf({}));
ok(none.periods[0].fund && none.periods[0].index.npi === null && none.vintageQ.preqin === null && none.pme.every((x) => !x.loaded), "nothing uploaded: the fund's own figures only");

// ── Change log: one summary entry per benchmark ──
const A = j(R + "/lib/audit.js");
const snap = (comps) => A.auditSnapshot({ deals: [], savedDeals: [], funds: {}, comps, valuations: {}, baseCurve: null });
const log = A.diffWorkspace(snap({ comps: [] }), snap({ comps: [], benchmarks: b }));
if (log) {
  const be = log.filter((e) => e.area === "Benchmarks");
  ok(be.length === 2 + 2 + 7 && be.some((e) => e.field === "NCREIF NPI Industrial" && /^31 rows from ncreif-npi-industrial\.csv \(NCREIF \(sample\)\)$/.test(e.to)) && !log.some((e) => e.area === "Sales comps"), `change log: ${be.length} benchmark entries, summarized`);
}

// ── The quarterly report's benchmark section ──
{
  const Q = j(R + "/lib/quarterlyReport.js");
  const rb = B.reportBenchmarks(base, b, { strategy: "Value Added" });
  ok(rb && rb.endQ === "2026-Q3" && rb.indexKeys.join() === "npi,npiInd" && rb.main === "npiInd", `report benchmarks: as of ${rb?.endQ}, indexes ${rb?.indexKeys.join(", ")}`);
  ok(rb.returns.map((x) => x.period).join() === "si,1y,3y" && rb.returns.every((x) => isFinite(x.fund) && isFinite(x.index.npiInd)), "returns since inception, 1 and 3 years vs. the indexes (no 5 years)");
  ok(close(rb.returns[0].fund, rep.periods[0].fund.total) && close(rb.returns[0].index.npiInd, rep.periods[0].index.npiInd.total), "the same figures as the Benchmarking tab");
  ok(rb.vintageRanks.length === 2 && rb.vintageRanks.every((v) => [1, 2, 3, 4].includes(v.metrics.irr.quartile)), `vintage quartiles: ${rb.vintageRanks.map((v) => `${v.label} IRR Q${v.metrics.irr.quartile}`).join(", ")}`);
  ok(rb.pme.length === 4 && rb.pme.every((x) => isFinite(x.ks)), "PME since inception for each loaded series");
  ok(rb.sources.some((x) => x.label === "NCREIF NPI Industrial" && x.source === "NCREIF (sample)"), "sources named");
  ok(B.reportBenchmarks(base, { ...B.EMPTY_BENCHMARKS }) === null, "no benchmarks loaded: no section");
  const rows = Q.benchmarkRows(rb);
  ok(rows.some((r) => /^Benchmarks \(as of 2026-Q3\)/.test(r[0] ?? "")) && rows.some((r) => r[0] === "Since inception") && rows.some((r) => r[0] === "Benchmark sources"), "report Excel rows");
  const asOf = B.fundBenchmarkBase(fn, deals, terms, {}, { todayISO: "2026-07-01" });
  ok(B.reportBenchmarks(asOf, b).endQ === "2026-Q2", "as of an earlier report quarter");
}

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
