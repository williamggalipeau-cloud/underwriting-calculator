// Writes lib/sampleBenchmarks.json: the fictional benchmark files in
// docs/sample-benchmarks read by the app's own parsers (lib/benchmarks.js),
// exactly as an upload on the Benchmarking tab reads them. The automatic
// sample load adds these series to a firm that has none (1.1.22).
//   node scripts/sample-benchmarks/make_benchmarks.cjs          writes the file
//   node scripts/sample-benchmarks/make_benchmarks.cjs --check  exits 1 if it is stale
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const B = j(R + "/lib/benchmarks.js");
const { parseCSV } = j(R + "/lib/fundTerms.js");

const DIR = path.join(R, "docs", "sample-benchmarks");
const FILES = [
  ["index", "npi", "ncreif-npi.csv"], ["index", "npiInd", "ncreif-npi-industrial.csv"], ["index", "odce", "ncreif-odce.csv"],
  ["vintage", "preqin", "preqin-vintage-quartiles.csv"], ["vintage", "cambridge", "cambridge-vintage-quartiles.csv"],
  ["monthly", null, "reit-monthly-returns.csv"],
];
const out = { index: {}, vintage: {}, monthly: {} };
for (const [kind, key, file] of FILES) {
  const grid = parseCSV(fs.readFileSync(path.join(DIR, file), "utf8"));
  const det = kind === "index" ? B.detectIndexColumns(grid) : kind === "vintage" ? B.detectVintageColumns(grid) : B.detectMonthlyColumns(grid);
  if (!det.ok) { console.error(`${file}: columns not recognised`); process.exit(1); }
  if (kind === "index") out.index[key] = { fileName: file, rows: B.parseIndex(grid, det) };
  else if (kind === "vintage") out.vintage[key] = { fileName: file, rows: B.parseVintage(grid, det) };
  else for (const [k, rows] of Object.entries(B.parseMonthly(grid, det))) out.monthly[k] = { fileName: file, rows };
}
const text = JSON.stringify(out) + "\n";
const target = path.join(R, "lib", "sampleBenchmarks.json");
if (process.argv.includes("--check")) {
  if ((fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "") !== text) { console.error("lib/sampleBenchmarks.json is stale: run node scripts/sample-benchmarks/make_benchmarks.cjs"); process.exit(1); }
  console.log("lib/sampleBenchmarks.json is current");
} else {
  fs.writeFileSync(target, text);
  console.log(`wrote lib/sampleBenchmarks.json: ${Object.keys(out.index).length} indexes, ${Object.keys(out.vintage).length} vintage sources, ${Object.keys(out.monthly).length} monthly series`);
}
