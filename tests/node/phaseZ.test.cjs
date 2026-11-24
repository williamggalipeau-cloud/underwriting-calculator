// Phase Z: Home page data (lib/home.js) on fictional data.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const H = j(R + "/lib/home.js");
const { snapshotDeal } = j(R + "/lib/samplePortfolio.js");
const FX = require(R + "/tests/e2e/fixture.cjs");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const TODAY = "2026-11-23";

const data = FX.workspaceData();
const FUND = "Model Fund I";
const base = data.deals.filter((d) => d.inputs.fundName === FUND);
// Fictional situations on two assets: a lease ending in 30 days, a loan maturing in a year.
const tweak = (d) => {
  if (d.id === "sample-deal-1") return { ...d, inputs: { ...d.inputs, units: [{ id: "u1", name: "Suite A", tenantName: "Example Tenant Co", leaseStatus: "occupied", squareFeet: 10000, leaseEnd: "2026-12-23" }, { id: "u2", name: "Suite B", tenantName: "Later Tenant", leaseStatus: "occupied", squareFeet: 5000, leaseEnd: "2029-01-31" }] } };
  if (d.id === "sample-deal-2") return { ...d, inputs: { ...d.inputs, loanTermYears: (Date.parse("2027-11-23") - Date.parse(d.inputs.acquisitionDate)) / (365.25 * 86400000) } };
  return d;
};
const deals = base.map(tweak).map((d) => ({ ...snapshotDeal(d.inputs, d.id), live: true }));
const funds = { [FUND]: { ...data.funds[FUND], delinquency: { months: { "2026-10": { rows: [{ property: "P1", tenantCode: "t1", tenant: "Late Tenant LLC", charge: "RENT", current: 0, d30: 1000, d60: 2500, d90: 0, d180: 0, over180: 500, prepay: 0 }] } }, mapping: { properties: { P1: "sample-deal-3" }, tenants: {} } } } };
const marks = { "sample-deal-4": { "2026-09-30": { value: 1e7 } } };

ok(H.lastQuarterEnd("2026-11-23") === "2026-09-30" && H.lastQuarterEnd("2027-02-10") === "2026-12-31" && H.lastQuarterEnd("2026-03-31") === "2025-12-31", "last completed quarter end");

const att = H.attentionList(deals, funds, marks, { todayISO: TODAY });
const by = (k) => att.filter((a) => a.kind === k);
ok(by("lease").length === 1 && by("lease")[0].days === 30 && /Example Tenant Co expires \(Airport Flex Park\)/.test(by("lease")[0].text) && by("lease")[0].tab === "leases", "a lease ending in 30 days (not one in 2029)");
ok(by("loan").length === 1 && by("loan")[0].dealId === "sample-deal-2" && by("loan")[0].tab === "debt", "a loan maturing within 18 months");
ok(by("cap").every((a) => a.days >= 0 && a.days <= 366), "rate caps expiring within 12 months only");
const ap = by("appraisal")[0];
ok(ap && ap.assets.length === deals.filter((d) => d.inputs.acquisitionDate <= "2026-09-30").length - 1 && !ap.assets.includes("Ridgeway Trade Center") && ap.tab === "valuations", `appraisals: ${ap?.assets.length} held assets without a 9/30 mark (the marked one excluded)`);
const rent = by("rent");
ok(rent.length === 1 && rent[0].amount === 3000 && /Late Tenant LLC: \$3,000 60\+ days late/.test(rent[0].text) && rent[0].tab === "units", "rent 60+ days late from the latest delinquency report (30-day bucket not counted)");
ok(att.findIndex((a) => !a.date && !["covenant", "condition"].includes(a.kind)) > att.findIndex((a) => a.kind === "lease"), "dated items before other undated ones");
ok(att.findIndex((a) => ["covenant", "condition"].includes(a.kind) && !a.date) <= 0 && att.filter((a) => a.date).every((a, i, xs) => i === 0 || a.date >= xs[i - 1].date), "urgent undated items (covenant breach, immediate repair) lead; dated ones by date");

const cards = H.fundCards(deals, funds, marks, { todayISO: TODAY });
ok(cards.length === 1 && cards[0].name === FUND && cards[0].type === "Fund" && cards[0].nav > 0 && cards[0].dryPowder > 0 && cards[0].nextDate?.label === "Investment period ends", "fund card: type, NAV, dry powder, next key date");
const jv = H.fundCards(deals, { ...funds, "Example JV II": { type: "Joint Venture", targetEquity: 1e7 } }, marks, { todayISO: TODAY });
ok(jv.length === 2 && jv[0].name === "Example JV II" && jv[0].type === "Joint Venture" && jv[0].assets === 0, "a card per fund / SMA / JV with its type");

const pl = { deals: [{ stage: "loi", askingPrice: 1e7 }, { stage: "screening" }, { stage: "screening" }, { stage: "passed" }] };
const L = H.lanes({ deals, funds, pipeline: pl, attention: att, cards, firm: { occupancy: 95.5 }, todayISO: TODAY });
ok(L.map((l) => l.label).join() === "Acquisitions,Dispositions,Asset Management,Property Management,Portfolio Management,Market,Library", "lanes in the tab bar's order (headers that have tabs)");
const st = (lane, label) => L.find((l) => l.label === lane).stats.find((s) => s.label === label)?.value;
ok(st("Acquisitions", "Active pipeline") === "3 deals" && /Screening 2 · LOI 1/.test(st("Acquisitions", "By stage")), "acquisitions: active pipeline by stage");
ok(st("Asset Management", "Occupancy") === "95.5%" && st("Asset Management", "Leases expiring in 2026") === "1" && st("Asset Management", "Appraisals due") === String(ap.assets.length), "asset management: occupancy, leases expiring this year, appraisals due");
ok(st("Portfolio Management", "Loans maturing in 18 months") === "1" && /^\$/.test(st("Portfolio Management", "NAV")), "portfolio management: NAV and loans maturing");
ok(L.every((l) => l.tabs.length >= 1), "each lane links to its tabs");

ok(H.money(56241799) === "$56.2M" && H.money(1.5e9) === "$1.50B" && H.money(null) === "—", "money format");
const log = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, at: `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00Z` }));
const rec = H.recentActivity(log);
ok(rec.length === 10 && rec[0].id === "e14" && rec[9].id === "e5", "recent activity: last 10, newest first");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
