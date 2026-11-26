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
ok(rent.length === 1 && rent[0].amount === 500 && /Late Tenant LLC: \$500 60\+ days late/.test(rent[0].text) && rent[0].tab === "units", "rent 60+ days late from the latest delinquency report (61+ days only: the 1–30 and 31–60 buckets are not counted, 1.1.8)");
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

// ── Actions Needed vs. Calendar (user, 11/24) ──
{
  const d4 = deals.find((d) => d.id === "sample-deal-4");
  const withExtras = deals.map((d) => d.id === "sample-deal-4" ? { ...d, inputs: { ...d.inputs,
    dispositions: [{ id: "s1", stage: "contract", contract: { psaDate: "2026-12-01", depositDue: "2026-12-05", hardDate: "2027-01-10", ddDeadline: "2027-01-10", loanClosing: "2027-02-15", closingDate: "2027-02-28" } }],
    construction: { jobs: [{ code: "J1", name: "Roof replacement", status: "In progress", scheduledCompletion: "2027-03-31" }, { code: "J2", name: "Done job", status: "Complete", completion: "2027-04-30" }] },
  } } : d);
  const pipeline = [{ id: "p1", name: "Fictional Purchase", stage: "psa", psaDate: "2026-11-30", depositDue: "2026-12-02", ddStart: "2026-12-01", ddDeadline: "2027-01-02", hardDate: "2027-01-05", loanClosing: "2027-01-28", expectedClose: "2027-01-31" }, { id: "p2", name: "Passed Deal", stage: "passed", expectedClose: "2027-01-31" }];
  const leases = [{ id: "l1", deal_id: "sample-deal-1", tenant: "Example Tenant Co", abstract: { critical_dates: [{ date: "2027-03-01", kind: "renewal_notice", label: "Renewal option notice", notice: "6 months before expiration" }, { date: "2027-08-31", kind: "expiration", label: "Expiration" }] } }];
  const fx = { [FUND]: { ...funds[FUND], subLineMaturity: "2027-06-30" } };
  const r = H.actionsAndCalendar(withExtras, fx, marks, { todayISO: TODAY, pipeline, leases });
  const A = r.actions, C = r.calendar;
  ok(A.every((x) => x.date == null || x.days <= 30) && C.every((x) => x.days >= -365 && x.days <= 365), `split: ${A.length} actions (overdue, ≤ 30 days or undated), ${C.length} calendar items (a year back to a year ahead)`);
  ok(C.some((x) => x.days < 0) && C.some((x) => x.days > 30) && C.filter((x) => x.state === "overdue").every((x) => A.some((a) => a.key === x.key)), "the calendar keeps the past year; overdue deadlines are also actions");
  ok(C.every((x, i) => i === 0 || x.date >= C[i - 1].date), "calendar sorted by date");
  ok(A.some((x) => /Example Tenant Co expires/.test(x.text)) && C.some((x) => x.kind === "cap" && /Rate cap expires/.test(x.text)), "the lease in 30 days is an action; rate caps months away are on the calendar");
  const txt = (k) => C.filter((x) => x.kind === k).map((x) => x.text);
  ok(txt("acquisition").length === 7 && txt("acquisition").some((t) => /^Purchase: Due diligence starts/.test(t)) && txt("acquisition").some((t) => /^Purchase: Due diligence ends/.test(t)) && txt("acquisition").some((t) => /^Purchase: P&S signed \(Fictional Purchase\)/.test(t)) && txt("acquisition").some((t) => /Purchase: Deal closing/.test(t)) && !txt("acquisition").some((t) => /Passed Deal/.test(t)), "purchase dates: P&S, deposit, hard money, due diligence start and end, loan closing, deal closing (active deals only)");
  ok(txt("sale").length === 6 && txt("sale").some((t) => /Sale: Hard money due/.test(t)) && txt("sale").some((t) => /Sale: Loan closing/.test(t)), "sale contract dates");
  ok(A.some((x) => x.kind === "acquisition" && /P&S signed/.test(x.text)) && C.some((x) => x.kind === "acquisition" && /Deal closing/.test(x.text)), "near dates are actions, later ones on the calendar");
  ok(txt("leasedate").length === 1 && /Renewal notice: Renewal option notice \(Example Tenant Co, Airport Flex Park\) · 6 months/.test(txt("leasedate")[0]), "lease abstract critical dates (not the expiration, which comes from the rent roll)");
  ok(txt("construction").length === 2 && C.find((x) => /Done job/.test(x.text)).state === "done" && !A.some((x) => x.kind === "construction"), "construction: open jobs' scheduled completion; completed jobs as history, never actions");
  ok(txt("fund").some((t) => /Sub line matures \(Model Fund I\)/.test(t)), "the sub line maturity");
  ok(txt("covenanttest").length >= 3 && txt("covenanttest").every((t) => /Quarterly covenant tests: \d+ loan/.test(t)), `quarterly covenant tests (${txt("covenanttest").length})`);
  const caps = C.filter((x) => x.kind === "cap");
  ok(caps.length > 0 && !caps.some((x) => /^Buy a replacement/.test(x.text)) && new Set(caps.map((x) => x.dealId)).size === caps.length && caps.some((x) => /Rate cap expires: buy a replacement \(the loan runs to \d{4}-\d\d-\d\d\)/.test(x.text)), "one line per rate cap; it says when a replacement is needed");
  ok(C.filter((x) => x.kind === "appraisal" && /Appraisal due for/.test(x.text)).length >= 1, "appraisals from the schedule");
  // Done: an overdue action leaves Actions and shows as done on the calendar; undo brings it back.
  const od = A.find((x) => x.date && x.days < 0);
  if (od) {
    const doneMap = H.markDone({}, od, { by: "a@example.com", at: "2026-11-23T12:00:00Z" });
    const r2 = H.actionsAndCalendar(withExtras, fx, marks, { todayISO: TODAY, pipeline, leases, done: doneMap });
    ok(!r2.actions.some((x) => x.key === od.key) && r2.calendar.find((x) => x.key === od.key)?.state === "done" && r2.calendar.find((x) => x.key === od.key).done.by === "a@example.com", `marked done: "${od.text}" leaves Actions, shows done on the calendar`);
    ok(Object.keys(H.markDone(doneMap, od, { undo: true })).length === 0, "undo");
  } else ok(false, "an overdue action to mark done");
  // Past events (a P&S signed) are history, not actions.
  const past = H.actionsAndCalendar(withExtras, fx, marks, { todayISO: "2027-03-15", pipeline, leases });
  ok(past.calendar.some((x) => /Purchase: P&S signed/.test(x.text) && x.state === "past") && !past.actions.some((x) => /P&S signed/.test(x.text)) && past.actions.some((x) => /Purchase: Hard money due/.test(x.text)), "a past P&S signing is history; a past hard-money deadline stays an action until done");
  const r0 = H.actionsAndCalendar(withExtras, fx, marks, { todayISO: TODAY });
  ok(!r0.calendar.some((x) => x.kind === "leasedate"), "no lease abstract dates when not signed in");
  const ext = H.actionsAndCalendar(deals.map((d) => ({ ...d, inputs: { ...d.inputs, extensionCount: 2, extensionTermYears: 1, extensionNoticeDays: 90 } })), funds, marks, { todayISO: TODAY });
  const en = [...ext.actions, ...ext.calendar].filter((x) => x.kind === "extension" && /Extension notice due/.test(x.text));
  ok(en.length >= 1 && en.every((x) => /90 days before/.test(x.text) && !/assumed/.test(x.text)), `extension notice deadlines from the loan's notice period (${en.length})`);
  void d4;
}


// Asset Watch List (user, 11/24): plan performance only; NOI / IRR under plan,
// > 10% under At Risk, up to 10% Off Plan. Fictional plans and actuals.
{
  const BP = j(R + "/lib/businessPlan.js");
  const withPlan = (d, k) => {
    const plan = BP.seedPlan(d.inputs), budget = BP.budgetFromModel(d.inputs);
    const actuals = {};
    for (let m = 1; m <= 10; m++) { const ym = `2026-${String(m).padStart(2, "0")}`; const b = BP.budgetMonth(budget, ym); if (b) actuals[ym] = { ...b, noi: b.noi * k }; }
    return { ...d, inputs: { ...d.inputs, assetManager: "Example Manager", businessPlan: { revisions: [{ n: 1, plan, budget }], actuals } } };
  };
  const ks = { "sample-deal-3": 0.85, "sample-deal-2": 0.95, "sample-deal-4": 1.02 };
  const pd = deals.map((d) => (ks[d.id] ? withPlan(d, ks[d.id]) : d));
  const cal = H.actionsAndCalendar(pd, funds, marks, { todayISO: TODAY }).calendar;
  const w = H.planWatchList(pd, funds, marks, { todayISO: TODAY, calendar: cal });
  const of = (id) => w.assets.find((a) => a.id === id);
  ok(of("sample-deal-3")?.status === "At Risk" && Math.abs(of("sample-deal-3").noi.pct + 15) < 0.01, `NOI 15% under plan: At Risk (${of("sample-deal-3")?.noi?.pct.toFixed(1)}%)`);
  ok(of("sample-deal-2")?.status === "Off Plan" && Math.abs(of("sample-deal-2").noi.pct + 5) < 0.01, "NOI 5% under plan: Off Plan");
  ok(!of("sample-deal-4") && w.assets.length === 2, "ahead of plan, or no plan: not listed");
  ok(w.assets[0].id === "sample-deal-3" && w.assets[0].owner === "Example Manager", "worst first, with the owner");
  ok(w.assets.every((a) => !a.next || (a.next.dealId === a.id && a.next.days >= 0)), "next event: the asset's next calendar date");
}
console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
