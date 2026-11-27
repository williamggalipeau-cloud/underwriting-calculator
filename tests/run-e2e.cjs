// Serves the static build (out/) at /underwriting-calculator/ and runs every
// Playwright test in tests/e2e (npm run test:e2e). Supabase is mocked inside
// each test, so no secrets or network are needed. Exits 1 if any fails.
// Usage: node tests/run-e2e.cjs [name filter…]   (build first: npm run build)
// Each suite runs with "today" fixed at E2E_TODAY (default 2026-11-27, the
// date of the sample data): tests/e2e/clock.cjs.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const R = path.resolve(__dirname, "..");
const OUT = path.join(R, "out");
const BASE = "/underwriting-calculator";
const PORT = Number(process.env.E2E_PORT || 8765);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".pdf": "application/pdf", ".txt": "text/plain", ".woff2": "font/woff2", ".md": "text/markdown" };

if (!fs.existsSync(path.join(OUT, "index.html"))) {
  console.error("No build in out/: run `npm run build` first.");
  process.exit(1);
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!p.startsWith(BASE)) { res.writeHead(404); return res.end(); }
  p = p.slice(BASE.length) || "/";
  let file = path.join(OUT, p);
  if (!file.startsWith(OUT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const run = (file, env = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, ["-r", path.join(__dirname, "e2e", "clock.cjs"), file], { env: { ...process.env, BASE_URL: `http://localhost:${PORT}${BASE}/`, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  child.on("close", (code) => resolve({ code, out }));
});

server.listen(PORT, async () => {
  const dir = path.join(__dirname, "e2e");
  const only = process.argv.slice(2);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".e2e.cjs") && (!only.length || only.some((o) => f.includes(o)))).sort();
  // Phase D also runs as a viewer (owners-only tenant credit must be hidden).
  const jobs = files.flatMap((f) => (f.startsWith("phaseD") ? [[f, {}], [f, { ROLE: "viewer" }]] : [[f, {}]]));
  const failed = [];
  for (const [f, env] of jobs) {
    const label = f + (env.ROLE ? ` (${env.ROLE})` : "");
    const { code, out } = await run(path.join(dir, f), env);
    if (process.env.VERBOSE) console.log(out);
    const lines = out.split("\n");
    const passes = lines.filter((l) => l.startsWith("PASS")).length;
    const fails = lines.filter((l) => l.startsWith("FAIL"));
    console.log(`${code === 0 ? "✓" : "✗"} ${label}: ${passes} passed${fails.length ? `, ${fails.length} failed` : ""}`);
    if (code !== 0) {
      failed.push(label);
      console.log(fails.length ? fails.join("\n") : out.slice(-3000));
    }
  }
  server.close();
  console.log(failed.length ? `\n${failed.length} browser suite(s) failed: ${failed.join(", ")}` : `\nAll ${jobs.length} browser suites passed.`);
  process.exit(failed.length ? 1 : 0);
});
