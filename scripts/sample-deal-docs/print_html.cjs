// Prints <dir>/html/*.html to <dir>/*.pdf with the SAMPLE header and footer.
// Usage: node scripts/sample-deal-docs/print_html.cjs docs/sample-deal-docs/deals [name …]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const dir = path.resolve(process.argv[2]);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  // Optional names after the directory print only those documents.
  const only = process.argv.slice(3).map((n) => n.replace(/\.(html|pdf)$/, ""));
  const files = fs.readdirSync(path.join(dir, "html")).filter((f) => f.endsWith(".html") && (!only.length || only.includes(f.replace(/\.html$/, "")))).sort();
  for (const f of files) {
    await p.goto("file://" + path.join(dir, "html", f));
    await p.pdf({
      path: path.join(dir, f.replace(/\.html$/, ".pdf")), format: "Letter", printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
      footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document</div>',
      margin: { top: "0.7in", bottom: "0.7in", left: "0.8in", right: "0.8in" },
    });
  }
  console.log(`${files.length} PDFs`);
  await b.close();
})();
