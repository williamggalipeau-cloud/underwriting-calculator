// 1.1.7 (user, 11/25): hosting moves to Vercel. The same code builds for
// GitHub Pages (under /underwriting-calculator) and for Vercel (at the root;
// Vercel sets VERCEL=1 during its builds), and the browser code that builds
// URLs by hand follows the same base path.
const { execFileSync } = require("child_process");
const R = require("path").resolve(__dirname, "..", "..");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const probe = (env) => JSON.parse(execFileSync(process.execPath, ["-e", `
  const j = require(${JSON.stringify(R + "/node_modules/jiti")})(${JSON.stringify(R + "/x.cjs")}, { alias: { "@": ${JSON.stringify(R)} } });
  const c = j(${JSON.stringify(R + "/next.config.js")}).default;
  process.env.NEXT_PUBLIC_BASE_PATH = c.env.NEXT_PUBLIC_BASE_PATH;
  const ap = j(${JSON.stringify(R + "/lib/assetPhotos.js")});
  console.log(JSON.stringify({ basePath: c.basePath, env: c.env.NEXT_PUBLIC_BASE_PATH, output: c.output, sample: ap.sampleUrl("sample:a.svg") }));
`], { env: { ...process.env, VERCEL: "", ...env }, encoding: "utf8" }).trim());
const gh = probe({});
ok(gh.basePath === "/underwriting-calculator" && gh.env === "/underwriting-calculator" && gh.output === "export", "GitHub Pages build: under /underwriting-calculator, static export");
ok(gh.sample === "/underwriting-calculator/sample-media/a.svg", "GitHub Pages: sample photos under the base path");
const v = probe({ VERCEL: "1" });
ok(v.basePath === "" && v.env === "" && v.output === "export", "Vercel build: at the root, static export");
ok(v.sample === "/sample-media/a.svg", "Vercel: sample photos at the root");
console.log(fail ? `${fail} failed` : "all passed");
process.exit(fail ? 1 : 0);
