// Fictional sample pipeline deals (lib/samplePipeline.js, 11/24).
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const SP = j(R + "/lib/samplePipeline.js");
const P = j(R + "/lib/pipeline.js");
const H = j(R + "/lib/home.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const T = "2026-11-24";
const rows = SP.samplePipelineDeals(T, { by: "a@example.com" });
ok(rows.length === 3 && rows.map((r) => r.id).join() === "sample-pl-1,sample-pl-2,sample-pl-3", "three deals with fixed ids");
ok(rows.map((r) => r.stage).join() === "psa,loi,screening" && rows.every((r) => P.ACTIVE_STAGES.includes(r.stage) && r.targetFund === "Model Fund I" && r.owner === "a@example.com"), "under contract, LOI and screening, for Model Fund I");
ok(rows.every((r) => /Example|fictional/i.test(r.name + r.notes) && r.askingPrice > 0 && r.sf > 0 && r.noi > 0), "fictional names, with price, SF and NOI");
const pc = rows[0];
ok(pc.ddDeadline === "2026-12-04" && pc.psaDate === "2026-11-04" && pc.expectedClose === "2027-01-08", "contract dates set from today");
const cal = H.actionsAndCalendar([], {}, {}, { todayISO: T, pipeline: rows });
ok(cal.calendar.some((x) => /Purchase: Due diligence ends \(Example Crossroads Logistics\)/.test(x.text)) && cal.actions.some((x) => /Example Crossroads Logistics/.test(x.text)), "they show on Upcoming Events and Actions Needed");
console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
