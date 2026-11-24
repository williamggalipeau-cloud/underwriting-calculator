// "Working on" fund picker: lib/workingOn.js on fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const W = j(R + "/lib/workingOn.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const funds = { "Model Fund I": { name: "Model Fund I" }, "Example JV II": { name: "Example JV II", type: "Joint Venture" }, "Example SMA": { type: "Separate Account" } };
const opts = W.workingOnOptions(funds, ["Model Fund I", "Loose Fund"]);
ok(opts[0].value === "" && opts[0].label === "All portfolios", "first option: All portfolios (Select Portfolio, 11/24)");
ok(opts.map((o) => o.label).join("|") === "All portfolios|Example JV II · Joint Venture|Example SMA · Separate Account|Loose Fund|Model Fund I", "each fund, SMA and JV with its type, sorted, no duplicates");
ok(W.validWorkingOn("Gone Fund", opts) === "" && W.validWorkingOn("Example SMA", opts) === "Example SMA", "a remembered fund that no longer exists falls back to All funds");

const fd = [{ id: "a", inputs: { fundName: "Model Fund I" } }, { id: "b", inputs: { fundName: "model fund i " } }, { id: "c", inputs: { fundName: "Example JV II" } }];
const resolve = (n) => (n.trim().toLowerCase() === "model fund i" ? "Model Fund I" : n.trim());
ok(W.scopeDeals(fd, "", resolve).length === 3, "All funds: every owned asset");
ok(W.scopeDeals(fd, "Model Fund I", resolve).map((d) => d.id).join() === "a,b", "a fund: its assets, whatever the spelling");
const sf = W.scopeFunds(funds, "Example JV II");
ok(Object.keys(sf).join() === "Example JV II" && sf["Example JV II"] === funds["Example JV II"] && W.scopeFunds(funds, "") === funds, "fund terms: only the chosen fund (same object, never copied back)");
ok(Object.keys(funds).length === 3, "the firm's funds are untouched");

const open = [...fd, { id: "p1", inputs: { fundName: "" } }, { id: "p2", inputs: { fundName: "" } }, { id: "p3", inputs: { fundName: "" } }, { id: "draft", inputs: { fundName: "" } }];
const pipeline = { deals: [{ dealId: "p1", targetFund: "Example JV II" }, { dealId: "p2", targetFund: "Model Fund I" }, { dealId: "p3", targetFund: "" }] };
ok(W.scopeOpenDeals(open, "", resolve, pipeline).length === 7, "All funds: every open deal, including the pipeline");
ok(W.scopeOpenDeals(open, "Example JV II", resolve, pipeline).map((d) => d.id).join() === "c,p1,draft", "a fund: its assets, pipeline deals screened for it, drafts not on the pipeline");
ok(!W.scopeOpenDeals(open, "Model Fund I", resolve, pipeline).some((d) => d.id === "p3"), "a pipeline deal with no target fund shows under All funds only");
ok(W.scopeLabel("", funds) === "Firm" && W.scopeLabel("Example JV II", funds) === "Example JV II (Joint Venture)" && W.scopeLabel("Model Fund I", funds) === "Model Fund I", "strip label");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
