// Runs every Node check in tests/node (npm test). Exits 1 if any fails.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "node");
const only = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".test.cjs") && (!only.length || only.some((o) => f.includes(o)))).sort();
let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
  const passes = out.split("\n").filter((l) => l.startsWith("PASS")).length;
  console.log(`${r.status === 0 ? "✓" : "✗"} ${f}: ${passes} passed${fails.length ? `, ${fails.length} failed` : ""}`);
  if (r.status !== 0) {
    failed.push(f);
    console.log(fails.length ? fails.join("\n") : out.slice(-2000));
  }
}
console.log(failed.length ? `\n${failed.length} suite(s) failed: ${failed.join(", ")}` : `\nAll ${files.length} Node suites passed.`);
process.exit(failed.length ? 1 : 0);
