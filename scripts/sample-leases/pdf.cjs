// Prints docs/sample-leases/html/*.html to docs/sample-leases/*.pdf.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "..", "docs", "sample-leases");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const files = fs.readdirSync(path.join(dir, "html")).filter((f) => f.endsWith(".html")).sort();
  for (const f of files) {
    await p.goto("file://" + path.join(dir, "html", f));
    await p.pdf({
      path: path.join(dir, f.replace(/\.html$/, ".pdf")),
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
      footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document – not a real lease</div>',
      margin: { top: "0.8in", bottom: "0.8in", left: "0.85in", right: "0.85in" },
    });
  }
  console.log(`${files.length} PDFs`);
  await b.close();
})();
