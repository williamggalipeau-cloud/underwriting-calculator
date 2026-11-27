// 1.1.13: property manager fields, legal entities on Model Fund I, and the
// two new kinds on the Home calendar (lender reporting, entity annual reports).
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const PM = j(R + "/lib/propertyManager.js");
const H = j(R + "/lib/home.js");
const SF = j(R + "/lib/sampleFund.js");
const FS = j(R + "/lib/fundSummary.js");
const AS = j(R + "/lib/assetSummary.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const today = "2026-11-27";

// Property manager
ok(PM.propertyManagerLabel({}) === "" && PM.propertyManagerLabel({ propertyManager: "Jamie Rivera", propertyManagementFirm: { type: "sponsor" } }) === "Jamie Rivera, This firm (sponsor)", "label: name and firm; blank when nothing is entered");
ok(PM.propertyManagerLabel({ propertyManager: "Pat Lee", propertyManagementFirm: { type: "third", name: "Fictional Property Services LLC" } }) === "Pat Lee, Fictional Property Services LLC" && PM.pmFirmOf({ propertyManagementFirm: { type: "sponsor", name: "ignored" } }).name === "", "a third-party servicer shows its name; the sponsor has none");
ok(PM.pmFeeMismatch({ propertyManagementFirm: { type: "third", name: "X" } }, { feeToPm: "sponsor" }).startsWith("A third-party servicer manages") && PM.pmFeeMismatch({ propertyManagementFirm: { type: "sponsor" } }, { feeToPm: "third" }).startsWith("This firm manages") && PM.pmFeeMismatch({ propertyManagementFirm: { type: "sponsor" } }, { feeToPm: "sponsor" }) === "" && PM.pmFeeMismatch({}, { feeToPm: "third" }) === "", "flagged when the firm and the fund's property management fee payee disagree; quiet when they agree or nothing is set");

// The sample fund
const f = SF.buildSampleFund({ todayISO: today });
const terms = { ...DEFAULT_FUND_TERMS, ...SP.SAMPLE_FUND_FEE_TERMS, name: SP.SAMPLE_FUND_NAME, targetEquity: SP.SAMPLE_FUND_COMMITMENTS, ...f.termsPatch };
ok(f.deals.every((d) => d.inputs.propertyManager && d.inputs.propertyManagementFirm.type === "sponsor" && PM.pmFeeMismatch(d.inputs, terms) === ""), "every sample asset has a property manager at this firm, in line with the fund's fee terms");
const snaps = f.deals.map((d) => SP.snapshotDeal(d.inputs, d.id));
const sum = AS.assetSummary(snaps, terms, { todayISO: today, marks: f.valuations });
ok(sum.rows.every((r) => /, This firm \(sponsor\)$/.test(r.propertyManager) && !r.pmFeeMismatch), "Asset Summary rows carry the property manager");

// Legal entities
const ents = terms.entities;
const tree = FS.ownershipTree(ents);
const fundNode = tree.find((e) => e.role === "fund");
ok(ents.length === 11 && fundNode.name === "Model Fund I, L.P." && fundNode.children.length === 9 && tree.some((e) => e.role === "gp" && e.name === "Example Fund GP LLC"), "Model Fund I: the fund, its GP and nine property companies, each company under the fund");
ok(f.deals.every((d) => ents.filter((e) => e.dealId === d.id).length === 1), "each asset has exactly one property company");

// Home calendar
ok(JSON.stringify(H.lenderReporting("Quarterly within 45 days; annual within 120 days")) === JSON.stringify({ quarterlyDays: 45, annualDays: 120 }) && H.lenderReporting("As the lender requests") === null && H.lenderReporting("") === null, "lender reporting terms → days; nothing when no days are stated");
const cal = H.actionsAndCalendar(snaps, { [SP.SAMPLE_FUND_NAME]: terms }, f.valuations, { todayISO: today }).calendar;
const rep = cal.filter((x) => x.kind === "lenderreport");
ok(rep.some((x) => x.date === "2027-02-14" && /Quarterly statements due to Desert Mountain Bank for the quarter ended 2026-12-31/.test(x.text)) && rep.some((x) => x.date === "2027-04-30" && /Annual statements due to Desert Mountain Bank for 2026/.test(x.text)) && rep.every((x) => ["Airport Flex Park", "Route 9 Small Bay"].includes(x.asset)), `lender reporting: quarter end + 45 days and year end + 120 days, for the two loans whose agreements state them (${rep.length} dates)`);
const ent = cal.filter((x) => x.kind === "entity");
ok(ent.length === 11 && ent.every((x) => x.date === "2027-06-01") && ent.some((x) => x.asset === "Airport Flex Park" && /Runway Vista LLC \(DE\)/.test(x.text)), "legal entities' annual reports are on the calendar, each on its asset");
const pmItems = cal.filter((x) => ["tax", "insurance", "contract"].includes(x.kind));
ok(pmItems.every((x) => !x.dealId || x.owner === f.deals.find((d) => d.id === x.dealId).inputs.propertyManager), `property management items are owned by the property manager (${pmItems.length} items)`);
const noPm = H.actionsAndCalendar(snaps.map((d) => ({ ...d, inputs: { ...d.inputs, propertyManager: "" } })), { [SP.SAMPLE_FUND_NAME]: terms }, f.valuations, { todayISO: today }).calendar.filter((x) => ["tax", "insurance", "contract"].includes(x.kind));
ok(noPm.every((x) => !x.dealId || x.owner === f.deals.find((d) => d.id === x.dealId).inputs.assetManager), "with no property manager they stay with the asset manager");

// The asset reports and the remaining Excel exports name the property manager too.
{
  const AR = j(R + "/lib/assetReport.js"), PMG = j(R + "/lib/propertyMgmt.js");
  const d1 = f.deals[0], label = PM.propertyManagerLabel(d1.inputs);
  const rep = AR.buildAssetReport(snaps, terms, f.valuations, { assetId: d1.id, qEnd: "2026-09-30", todayISO: today });
  const x = AR.assetReportXlsx(rep);
  ok(rep.asset.propertyManager === label && x.some((r) => r[0] === "Property manager" && r[1] === label), `the asset quarterly report and its Excel name the property manager (${label})`);
  const px = PMG.pmXlsx("taxes", f.deals);
  const at = px.findIndex((r) => r[0] === "Property managers");
  ok(at > 0 && f.deals.every((d) => px.some((r) => r[0] === d.inputs.propertyName && r[1] === PM.propertyManagerLabel(d.inputs))), "the Property Management Excel lists each asset's property manager");
  ok(!PMG.pmXlsx("taxes", f.deals.map((d) => ({ ...d, inputs: { ...d.inputs, propertyManager: "", propertyManagementFirm: undefined } }))).some((r) => r[0] === "Property managers"), "with none entered, the exports are as before");
  const src = (n) => require("fs").readFileSync(R + "/lib/" + n, "utf8");
  ok(/property manager: \$\{a\.propertyManager\}/.test(src("assetReportPdf.js")) && /"Property manager", propertyManagerLabel\(inputs\)/.test(src("businessPlanPdf.js")) && /Property managers/.test(src("pmPdf.js")), "the asset report PDF, the business plan PDF and the Property Management PDF print it");
}

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exit(fail ? 1 : 0);
