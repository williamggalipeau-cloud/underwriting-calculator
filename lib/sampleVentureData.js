// 1.1.28 (user, 11/27): the remaining tab data of the sample joint venture
// and separate account (lib/sampleVentures.js), so their Business Plan,
// Active Leasing, Tenant Credit, Property Management and Distribution
// Analysis screens can be tested without typing anything in. Fictional.
//
// Everything is made from the assets as they are (AGENTS.md: everything ties
// out; a sample record a tab saves is made by the function the tab calls):
//   - Business plan: the plan and closing budget are the closing model's
//     (inputs.uwBaseline, through seedPlan and budgetFromModel); the monthly
//     actuals are the asset's model today, with the leases signed since
//     purchase. So plan against actual is underwriting against what
//     happened, and the asset behind plan is behind for that reason.
//   - Leasing: prospects on the units vacant today (sampleLeasingFor on the
//     rent roll as of today), a renewal, and each prospect's screening.
//   - Tenant credit: one story per held asset on a tenant in place today (an
//     open flag, a conditional screening, a missing record), with the aged
//     receivables rows that go with it on the portfolio.
//   - Property management: parcels, tax bills, insurance policies, property
//     condition items and service contracts from the asset's own expense
//     assumptions and building facts. Not on the sold asset.
//   - Distribution Analysis: last quarter's proposal for each portfolio, from
//     the tab's own distributable and chooseDistribution.
// Each piece is added only where the asset or portfolio has none.
import { addRevision, addMonths, assetKpis, budgetFromModel, budgetMonth, seedPlan } from "@/lib/businessPlan";
import { inputsToday, unitToday } from "@/lib/leaseHistory";
import { isSold } from "@/lib/assetStatus";
import { assetSF } from "@/lib/assetMetrics";
import { creditOf } from "@/lib/creditReview";
import { sampleLeasingFor, SAMPLE_LEASING_MANAGERS, SAMPLE_PROSPECT_PREFIX } from "@/lib/sampleLeasing";
import { chooseDistribution, distributable } from "@/lib/distributions";
import { lastCompletedQuarterEnd } from "@/lib/valuations";
import { snapshotDeal } from "@/lib/samplePortfolio";
import { SAMPLE_JV_NAME, SAMPLE_SMA_NAME, isSampleVentureDeal } from "@/lib/sampleVentures";

export const SAMPLE_VENTURE_DATA_BY = "Sample data (fictional)";
const BEHIND = "sample-jv-3";
const ORDER = ["sample-jv-1", "sample-jv-2", "sample-jv-3", "sample-sma-1"];
const OPEX = ["taxes", "insurance", "utilities", "repairs", "management", "otherOpex"];
const r0 = (x) => Math.round(Number(x) || 0);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const ym = (iso) => String(iso).slice(0, 7);
const addDays = (iso, k) => new Date(Date.parse(`${iso}T12:00:00Z`) + Math.round(k) * 86400000).toISOString().slice(0, 10);
const addYears = (iso, k) => `${Number(iso.slice(0, 4)) + k}${iso.slice(4)}`;
const monthEnd = (iso, back) => { const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
// The last day the asset was owned on or before a date (its sale date once sold).
const ownedTo = (inputs, todayISO) => (isSold(inputs, todayISO) ? inputs.realizedSaleDate : todayISO);

// ── Business plan ──
// Monthly actuals: the asset's model today, month by month, from its first
// full month to the month before today (or the month of its sale).
export function sampleVentureActuals(inputs, { todayISO }) {
  const now = budgetFromModel(inputs, { label: "Model today", at: `${todayISO}T12:00:00.000Z` });
  const acq = inputs.acquisitionDate, sold = isSold(inputs, todayISO);
  const first = addMonths(ym(acq), Number(acq.slice(8, 10)) > 1 ? 1 : 0);
  const last = sold ? ym(inputs.realizedSaleDate) : addMonths(ym(todayISO), -1);
  const out = {};
  for (let m = first; m <= last; m = addMonths(m, 1)) {
    const b = budgetMonth(now, m);
    if (!b) continue;
    const L = { rent: b.rent, recoveries: b.recoveries, vacancy: b.vacancy };
    for (const k of OPEX) L[k] = b[k];
    L.egr = L.rent + L.recoveries + L.vacancy;
    L.opex = OPEX.reduce((s, k) => s + L[k], 0);
    L.noi = b.noi;
    for (const k of Object.keys(L)) L[k] = r2(L[k]);
    out[m] = L;
  }
  return out;
}
export function sampleVenturePlan(inputs, dealId, { todayISO }) {
  const closing = inputs.uwBaseline?.inputs;
  if (!closing || !inputs.acquisitionDate) return null;
  const at = `${inputs.acquisitionDate}T12:00:00.000Z`, behind = dealId === BEHIND, until = ownedTo(inputs, todayISO);
  const plan = seedPlan(closing, { asOf: inputs.acquisitionDate });
  const budget = budgetFromModel(closing, { label: "Closing budget", at });
  plan.thesis ||= "Fictional sample plan: buy below replacement cost, lease the vacancy and mark rents to market.";
  plan.strategy ||= "Value-add: lease-up, rent growth on rollover, light capital.";
  // KPI targets the asset meets today (rounded down), so only the asset behind plan shows misses.
  if (!behind && !isSold(inputs, todayISO)) {
    const now = assetKpis(inputs, todayISO), down = (x, d) => Math.floor(x * 10 ** d) / 10 ** d;
    plan.kpis = plan.kpis.map((k) => {
      if (k.key === "occupancy" && isFinite(now.occupancy)) return { ...k, target: down(Math.min(k.target, now.occupancy), 1) };
      if (k.key === "rentPSF" && isFinite(now.rentPSF)) return { ...k, target: down(Math.min(k.target, now.rentPSF), 2) };
      if (k.key === "walt" && isFinite(now.walt)) return { ...k, target: down(Math.min(k.target, now.walt), 1) };
      return k;
    });
  }
  // Milestones already due: done; the asset behind plan keeps its lease-up milestones open (late).
  plan.milestones = plan.milestones.map((m) => (!(m.due && m.due < until) || (behind && /^Lease unit/.test(m.label)) ? m : { ...m, status: "done" }));
  plan.capital = plan.capital.map((c) => ({ ...c, spent: r0(c.budget) })); // the capital plan is complete, on budget
  if (behind) plan.risks = [{ id: "r1", risk: "Lease-up is well behind the closing plan: the vacant units are leasing slower and at lower rents than underwritten, and one tenant has moved out.", mitigation: "Leasing plan reset with the broker; rents and concessions reviewed each month." }];
  const bp = addRevision({}, { plan, budget, inputs: closing, by: SAMPLE_VENTURE_DATA_BY, at, note: "Fictional sample plan (the closing model)", reason: "Closing" });
  return { ...bp, actuals: sampleVentureActuals(inputs, { todayISO }), actualsSource: { file: "Sample actuals (fictional)", importedAt: `${todayISO}T12:00:00.000Z`, by: SAMPLE_VENTURE_DATA_BY } };
}

// ── Leasing ──
// Prospects on the units vacant today and a renewal, and the Vacant since
// date of a unit that has been vacant since purchase. Not on the sold asset.
export function sampleVentureLeasing(inputs, dealId, { todayISO }) {
  if (isSold(inputs, todayISO)) return null;
  const today = inputsToday(inputs, todayISO), k = ORDER.indexOf(dealId);
  const { prospects } = sampleLeasingFor(today, { todayISO, start: k * 5 });
  // A prospect at LOI or lease out has its screening.
  const screened = prospects.map((p, j) => (["loi", "leaseout"].includes(p.stage) ? { ...p, screening: { source: "app", provider: "Keystone Tenant Screening (fictional)", reportDate: addDays(todayISO, -(10 + (j % 9))), scoreType: "consumer", score: 700 + ((k * 7 + j * 11) % 60), rating: "", result: "approved", issues: "", conditions: "", basis: "", by: SAMPLE_VENTURE_DATA_BY, at: `${addDays(todayISO, -(10 + (j % 9)))}T12:00:00.000Z` } } : p));
  return { prospects: screened, leasingManager: SAMPLE_LEASING_MANAGERS[(k + 1) % SAMPLE_LEASING_MANAGERS.length] };
}

// ── Tenant credit stories ──
// One per held asset, on a tenant in place today (by unit name, so it is the
// same tenant each time): [which tenant, the story].
const tenantsToday = (inputs, todayISO) => (inputs.units ?? []).map((u) => ({ u, t: unitToday(u, inputs, todayISO) })).filter(({ t }) => t.leaseStatus === "occupied" && String(t.tenantName ?? "").trim())
  .sort((a, b) => (Number(b.t.currentRentPSF) || 0) * (Number(b.u.squareFeet) || 0) - (Number(a.t.currentRentPSF) || 0) * (Number(a.u.squareFeet) || 0) || String(a.u.name).localeCompare(String(b.u.name)));
const CREDIT_STORY = {
  "sample-jv-2": { pick: 0, flag: "Asked to defer one month's rent after a slow quarter.", aged: (m) => [{ d30: r0(m) }, { d30: r0(m), d60: r0(m) }] },
  "sample-jv-3": { pick: 1, weak: { score: 598, result: "conditional", issues: "Thin credit file; one collection account.", conditions: "Two months' security deposit and a personal guaranty." }, aged: (m) => [{ d60: r0(0.5 * m) }, { d90: r0(0.5 * m) }] },
  "sample-sma-1": { pick: 2, missing: true, aged: (m) => [null, { d30: r0(0.5 * m) }] },
};
// The unit's sample credit story applied, or null when there is none to apply
// (no story for this asset, or the story's tenant already has it).
export function sampleVentureCredit(inputs, dealId, { todayISO }) {
  const s = CREDIT_STORY[dealId];
  if (!s || isSold(inputs, todayISO)) return null;
  const row = tenantsToday(inputs, todayISO)[s.pick];
  if (!row) return null;
  const { u, t } = row, c = creditOf(u), id = `sample-vcs-${u.id}`;
  const date = addDays(todayISO, -8), mine = (x) => x.by === SAMPLE_VENTURE_DATA_BY;
  const others = c.records.filter((x) => !mine(x)), flags = c.flags.filter((x) => !mine(x));
  let records = others;
  if (s.weak) records = [...others.filter((x) => x.tenant !== t.tenantName), { id, kind: "screening", tenant: t.tenantName, source: "app", provider: "Screening app (fictional report)", reportDate: addDays(todayISO, -200), date: addDays(todayISO, -200), scoreType: "consumer", score: s.weak.score, rating: "", result: s.weak.result, issues: s.weak.issues, conditions: s.weak.conditions, basis: "", by: SAMPLE_VENTURE_DATA_BY, at: `${addDays(todayISO, -200)}T12:00:00.000Z` }];
  if (s.missing) records = others.filter((x) => x.tenant !== t.tenantName); // no record on file for today's tenant
  const flag = s.flag ? [{ id: `sample-vcf-${u.id}`, date, reason: s.flag, by: SAMPLE_VENTURE_DATA_BY, at: `${date}T12:00:00.000Z`, status: "open", clearedAt: "", clearedBy: "", clearNote: "" }] : [];
  const monthly = ((Number(t.currentRentPSF) || 0) * (Number(u.squareFeet) || 0)) / 12 || 1500;
  return { unitId: u.id, unit: u.name, tenant: t.tenantName, credit: { ...c, records, flags: [...flags, ...flag] }, aged: s.aged(monthly), monthly, securityDeposit: Number(u.securityDeposit) > 0 ? null : r0(2 * monthly) };
}

// ── Property management ──
const COUNTY = { AZ: "Maricopa County", NV: "Clark County", UT: "Salt Lake County", CO: "Denver County" };
const CONTRACTS = [["Landscaping", "Fictional Grounds Co.", 0.32], ["HVAC", "Sample Mechanical Services", 0.28], ["Fire / life safety", "Example Fire Protection", 0.16], ["Waste", "Demo Waste & Recycling", 0.24]];
// The latest anniversary of a date on or before another (a policy or contract year in force).
const anniversary = (start, on) => { let d = `${on.slice(0, 4)}${start.slice(4)}`; if (d > on) d = addYears(d, -1); return d < start ? start : d; };
export function sampleVenturePropertyMgmt(inputs, dealId, { todayISO }) {
  const n = ORDER.indexOf(dealId) + 1;
  if (!n || !inputs?.acquisitionDate || isSold(inputs, todayISO)) return null;
  const sf = assetSF(inputs), acq = inputs.acquisitionDate, year = Number(todayISO.slice(0, 4)), id = (k, i) => `svpm-${n}-${k}${i}`;
  const annual = (psf) => r0((Number(psf) || 0) * sf);
  const apn = `${200 + n}-${String(40 + n).padStart(3, "0")}-${String(n).padStart(3, "0")}`;
  const tax = annual(inputs.realEstateTaxPSF);
  const parcels = [{ id: id("p", 1), apn, address: [inputs.address, inputs.city, inputs.state].filter(Boolean).join(", "), assessedValue: inputs.purchasePrice, taxRatePct: inputs.purchasePrice > 0 ? Math.round((tax / inputs.purchasePrice) * 1000000) / 10000 : null, assessmentYear: year, notes: `${COUNTY[inputs.state] ?? "County"} assessor (fictional)` }];
  const half = r0(tax / 2);
  const bills = [
    { id: id("b", 1), parcel: apn, year, installment: "1st half", amount: half, dueDate: `${year}-01-15`, paidDate: `${year}-01-12` },
    { id: id("b", 2), parcel: apn, year, installment: "2nd half", amount: tax - half, dueDate: `${year}-07-15`, paidDate: `${year}-07-10` },
    { id: id("b", 3), parcel: apn, year: year + 1, installment: "1st half", amount: half, dueDate: `${year + 1}-01-15`, paidDate: "" },
  ];
  // One appeal: the asset behind plan asks for a lower assessment.
  const appeals = dealId === BEHIND ? [{ id: id("a", 1), parcel: apn, year: year + 1, filedDate: addDays(todayISO, -40), hearingDate: `${year + 1}-02-10`, outcome: "Pending", savings: null, consultant: "Fictional Property Tax Advisors" }] : [];
  const premium = annual(inputs.insurancePSF), prop = r0(premium * 0.7), gl = r0(premium * 0.2), um = premium - prop - gl, from = anniversary(acq, todayISO), base = 66120 + n * 10;
  const policy = (i, type, no, limit, deductible, prem) => ({ id: id("i", i), type, carrier: "Fictional Mutual Insurance Company", policyNo: no, limit, deductible, premium: prem, effective: from, renewalDate: addYears(from, 1), broker: "Sample Risk Advisors" });
  const policies = [policy(1, "Property", `PR-${base}`, Math.round((inputs.purchasePrice * 13) / 12 / 100000) * 100000, 25000, prop), policy(2, "General liability", `GL-${base + 1}`, 1000000, 0, gl), policy(3, "Umbrella", `UM-${base + 2}`, 5000000, 0, um)];
  const claims = dealId === "sample-jv-2" ? [{ id: id("c", 1), date: addDays(from, 45), cause: "Vehicle impact to a dock door", policy: `PR-${base}`, amount: 41200, status: "Closed", recovery: 16200, notes: "Paid net of the $25,000 deductible" }] : [];
  const b = inputs.building ?? {}, s = inputs.site ?? {}, reportDate = addDays(acq, -35), items = [];
  const urgency = (left) => (left <= 0 ? "Immediate" : left <= 1 ? "Within 1 year" : left <= 5 ? "1–5 years" : "5+ years");
  if (b.roofYear && b.roofLifeYears) { const left = b.roofYear + b.roofLifeYears - year; items.push({ id: id("f", 1), source: "PCA", reportDate, system: "Roof", finding: `${b.roofType ?? "Roof"} installed ${b.roofYear}; about ${Math.max(0, left)} year${left === 1 ? "" : "s"} of its ${b.roofLifeYears}-year life left${left > 5 ? "; seam and flashing repairs" : "; plan the replacement"}`, cost: r0(sf * (left > 5 ? 0.35 : 6)), urgency: urgency(left), status: left > 5 ? "Done" : "Open", yardiJob: "" }); }
  if (b.pavingYear && b.pavingLifeYears) { const left = b.pavingYear + b.pavingLifeYears - year; items.push({ id: id("f", 2), source: "PCA", reportDate, system: "Paving / parking", finding: `${b.pavingSurface ?? "Paving"} from ${b.pavingYear}; about ${Math.max(0, left)} year${left === 1 ? "" : "s"} of its ${b.pavingLifeYears}-year life left${left > 5 ? "; crack seal and restripe" : "; resurface the truck court and parking"}`, cost: r0(sf * (left > 5 ? 0.15 : 2.5)), urgency: urgency(left), status: left > 5 ? "Done" : "Open", yardiJob: "" }); }
  if (b.sprinklerType) items.push({ id: id("f", 3), source: "PCA", reportDate, system: "Fire / life safety", finding: `${b.sprinklerType} sprinkler system: five-year internal inspection completed, tags current`, cost: r0(sf * 0.1), urgency: "Within 1 year", status: "Done", yardiJob: "" });
  if (s.phase1Date) items.push({ id: id("f", 4), source: "Phase I", reportDate: s.phase1Date, system: "Environmental", finding: `${s.phase1Result === "Clean" ? "No recognized environmental conditions" : s.phase1Result}; Phase II ${String(s.phase2Result ?? "not needed").toLowerCase()}`, cost: 0, urgency: "5+ years", status: "Done", yardiJob: "" });
  const contracted = r0(annual((Number(inputs.maintenancePSF) || 0) + (Number(inputs.janitorialPSF) || 0)) * 0.75);
  let left = contracted;
  const contracts = CONTRACTS.map(([service, vendor, share], i) => { const annualCost = i === CONTRACTS.length - 1 ? left : r0(contracted * share); left -= annualCost; return { id: id("s", i + 1), vendor, service, start: from, end: addDays(addYears(from, 1), -1), annualCost, autoRenew: i < 2, noticeDays: i < 2 ? 60 : 30, yardiContract: "" }; });
  return { parcels, bills, appeals, policies, claims, items, contracts };
}
export const SAMPLE_VENTURE_PM_SECTIONS = ["parcels", "bills", "appeals", "policies", "claims", "items", "contracts"];

// ── All of an asset's pieces, each only where the asset has none ──
export function withSampleVentureData(inputs, dealId, { todayISO }) {
  if (!isSampleVentureDeal(dealId) || !inputs) return inputs;
  let out = inputs;
  if (!(out.businessPlan?.revisions ?? []).length) { const bp = sampleVenturePlan(out, dealId, { todayISO }); if (bp) out = { ...out, businessPlan: bp }; }
  if (!(out.leasing?.prospects ?? []).some((p) => String(p.id).startsWith(SAMPLE_PROSPECT_PREFIX))) {
    const l = sampleVentureLeasing(out, dealId, { todayISO });
    if (l) {
      const cur = out.leasing ?? {};
      // A unit vacant since purchase, with nothing recorded since, has been vacant since the purchase date.
      const units = (out.units ?? []).map((u) => (u.leaseStatus !== "occupied" && !u.vacantSince && !(u.laterLeases ?? []).length ? { ...u, vacantSince: out.acquisitionDate } : u));
      out = { ...out, units, leasingManager: String(out.leasingManager ?? "").trim() || l.leasingManager, leasing: { compMapping: null, ...cur, prospects: [...(cur.prospects ?? []), ...l.prospects], comps: cur.comps ?? [] } };
    }
  }
  const story = sampleVentureCredit(out, dealId, { todayISO });
  if (story && !(out.units ?? []).some((u) => { const c = creditOf(u); return [...c.records, ...c.flags].some((x) => x.by === SAMPLE_VENTURE_DATA_BY) || u.sampleCreditStory; })) {
    out = { ...out, units: out.units.map((u) => (u.id === story.unitId ? { ...u, credit: story.credit, sampleCreditStory: true, ...(story.securityDeposit ? { securityDeposit: story.securityDeposit } : {}) } : u)) };
  }
  const rows = sampleVenturePropertyMgmt(out, dealId, { todayISO });
  if (rows) {
    const cur = out.propertyMgmt ?? {};
    const add = Object.fromEntries(SAMPLE_VENTURE_PM_SECTIONS.filter((k) => !(Array.isArray(cur[k]) && cur[k].length) && rows[k].length).map((k) => [k, rows[k]]));
    if (Object.keys(add).length) out = { ...out, propertyMgmt: { ...cur, ...add } };
  }
  return out;
}

// ── Portfolio records: aged receivables and last quarter's distribution proposal ──
export const SAMPLE_VENTURE_AGED_FILE = "Sample aged receivables (fictional)";
// deals: the firm's deals (the portfolio's sample assets are picked out);
// terms: the portfolio's terms. Returns the fields to add ({} when none).
export function sampleVentureFundData(name, deals, terms, { todayISO, curve } = {}) {
  if (![SAMPLE_JV_NAME, SAMPLE_SMA_NAME].includes(name) || !terms) return {};
  const mine = (deals ?? []).filter((d) => isSampleVentureDeal(d.id) && d.inputs?.fundName === name).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  if (!mine.length) return {};
  const patch = {};
  // Aged receivables: the rows of each asset's credit story, for the last two month ends.
  if (!Object.keys(terms.delinquency?.months ?? {}).length) {
    const lastM = monthEnd(todayISO, 1), prevM = monthEnd(todayISO, 2), rows = { [prevM]: [], [lastM]: [] }, mapping = { properties: {}, tenants: {} };
    for (const d of mine) {
      const s = CREDIT_STORY[d.id], u = (d.inputs.units ?? []).find((x) => x.sampleCreditStory);
      if (!s || !u || isSold(d.inputs, todayISO)) continue;
      const t = unitToday(u, d.inputs, todayISO), monthly = ((Number(t.currentRentPSF) || 0) * (Number(u.squareFeet) || 0)) / 12 || 1500;
      const prop = `SV-${ORDER.indexOf(d.id) + 1}`, code = `sv${ORDER.indexOf(d.id) + 1}-${u.name}`;
      mapping.properties[prop] = d.id;
      s.aged(monthly).forEach((b, i) => {
        if (!b) return;
        const row = { property: prop, propertyName: d.inputs.propertyName, tenantCode: code, tenant: t.tenantName, unit: u.name || "", charge: "rent", current: 0, d30: 0, d60: 0, d90: 0, d180: 0, over180: 0, prepay: 0, ...b };
        rows[i === 0 ? prevM : lastM].push({ ...row, total: row.d30 + row.d60 + row.d90 + row.d180 + row.over180 });
        mapping.tenants[code] = u.id;
      });
    }
    if (rows[lastM].length) patch.delinquency = { ...(terms.delinquency ?? {}), mapping, months: Object.fromEntries([prevM, lastM].map((mo) => [mo, { rows: rows[mo], file: SAMPLE_VENTURE_AGED_FILE, uploadedAt: `${mo}T12:00:00.000Z`, by: SAMPLE_VENTURE_DATA_BY }])) };
  }
  // Distribution Analysis: last quarter's proposal, at all of the distributable cash.
  if (!(terms.distributions?.proposals ?? []).length) {
    const qEnd = lastCompletedQuarterEnd(todayISO);
    const calc = distributable(mine.map((d) => (d.irrFlows ? d : snapshotDeal(d.inputs, d.id))), terms, qEnd, { todayISO, curve });
    const choice = { mode: "pct", value: 100 }, pick = calc ? chooseDistribution(calc, terms, choice) : null;
    if (pick && pick.amount > 0) patch.distributions = { ...(terms.distributions ?? {}), proposals: [{ id: `dp-sample-${calc.quarter}`, quarter: calc.quarter, qEnd, amount: pick.amount, lp: pick.lp, gp: pick.gp, distributable: calc.total, projectedCash: calc.split.projectedBalance, choice, by: SAMPLE_VENTURE_DATA_BY, savedAt: `${addDays(qEnd, 20)}T17:00:00.000Z`, status: "proposed" }] };
  }
  return patch;
}

// The two portfolios to add to a firm (lib/sampleVentures.js
// sampleVenturesToAdd: only what is missing), with this file's data on the
// assets and portfolios being added. The load in app/page.jsx and the Load
// Model Fund I button both call this.
export function sampleVenturesFull(have = {}, opts = {}, toAdd) {
  const v = toAdd(have, opts), todayISO = opts.todayISO;
  const deals = v.deals.map((d) => (isSampleVentureDeal(d.id) ? { ...d, inputs: withSampleVentureData(d.inputs, d.id, { todayISO }) } : d));
  const all = [...(have.deals ?? []), ...deals];
  const funds = Object.fromEntries(Object.entries(v.funds).map(([name, t]) => [name, { ...t, ...sampleVentureFundData(name, all, t, { todayISO, curve: opts.curve }) }]));
  return { ...v, deals, funds };
}
