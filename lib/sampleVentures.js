// 1.1.26 (user, 11/27): two more sample portfolios beside Model Fund I, so the
// joint venture and separate account screens, an asset that has been sold, an
// asset behind its plan, and assets owned for several years can be tested
// without typing anything in. Everything is fictional.
//
//   Sample Industrial Venture I   joint venture, set up 2022, $80,000,000
//     A  Example Gateway Industrial Park   bought 6/2022, sold 6/2026 (Track Record)
//     B  Example Summit Business Center    bought 2/2023, on plan
//     C  Example Foundry Flex Park         bought 11/2023, part vacant, lease-up well behind plan
//     two pipeline deals (one under contract, one at LOI)
//   Sample Separate Account A     separate account, set up 2023, $25,000,000
//     D  Example Orchard Commerce Center   bought 6/2023
//
// Terms confirmed by the user 11/27: asset management 0.75% (joint venture)
// and 1.25% (separate account) of invested equity (the portfolio's fee), property management 5.0%,
// construction management 1.5%; an 8% preferred return, then 20% to a 14%
// IRR and 30% above; the sponsor co-invests 10%, half of it funded by an
// outside GP partner that takes 25% of the promote.
//
// Dates are fixed and in the past, so the figures do not move with today's
// date or the live rate curve: each asset carries its own rate path
// (sofrCurve) and cap costs. Each asset is built as it was underwritten at
// purchase (kept as inputs.uwBaseline, the closing model) and then given what
// happened since through the functions the tabs call: the leases signed since
// purchase (addLaterLease), the sale (makeSale, closeSale) and, for the asset
// behind plan, the vacant units' longer lease-up.
import { underwrite } from "@/lib/calculations";
import { DEFAULT_FUND_TERMS } from "@/lib/fundTerms";
import { sampleDealFrom } from "@/lib/samplePortfolio";
import { sampleMediaFor } from "@/lib/sampleMedia";
import { freezeBaseline } from "@/lib/uwActual";
import { addLaterLease, laterLeasesOf, leaseToday, recordMoveOut, unitToday } from "@/lib/leaseHistory";
import { factsFromRows } from "@/lib/sampleAssetFacts";
import { assetSF } from "@/lib/assetMetrics";
import { addMonthsISO, leaseEndOf } from "@/lib/leases";
import { closeSale, makeSale } from "@/lib/dispositions";
import { addPartner, applyAgreements, gpPartnersOf, saveAgreement } from "@/lib/gpPartners";
import { makePipelineDeal } from "@/lib/pipeline";

export const SAMPLE_JV_NAME = "Sample Industrial Venture I";
export const SAMPLE_SMA_NAME = "Sample Separate Account A";
export const SAMPLE_VENTURE_NAMES = [SAMPLE_JV_NAME, SAMPLE_SMA_NAME];
export const SAMPLE_JV_PARTNER = "Example Pension Fund";
export const SAMPLE_SMA_CLIENT = "Fictional Insurance Company";
export const SAMPLE_JV_GP_PARTNER = "Placeholder Capital Partners LP";
export const SAMPLE_SMA_GP_PARTNER = "Demo Holdings Family Office";
// The date the leases signed since purchase are written up to (fixed).
export const SAMPLE_VENTURE_AS_OF = "2026-11-27";
export const SAMPLE_VENTURE_BY = "Sample data";
export const isSampleVentureDeal = (id) => /^sample-(jv|sma)-\d+$/.test(String(id));

const PROMOTE = { prefPct: 8, catchUpGpPct: 0, tierMethod: "marginal", tiers: [{ irrThreshold: 14, lpSplit: 80, gpSplit: 20 }, { irrThreshold: null, lpSplit: 70, gpSplit: 30 }] };
// The asset management fee is charged at the portfolio level on invested equity (mgmtFeePct), as Model Fund I's is, so it is the sponsor's revenue in GP and Firm Economics; the assets carry none of their own.
const COMMON_TERMS = { ...PROMOTE, gpCommitPct: 10, mgmtFeeBasis: "invested", subLineEnabled: false, investmentPeriodYears: 3, termYears: 7, extensionCount: 2, extensionYears: 1, feeToMgmt: "sponsor", feeToPm: "sponsor", feeToCm: "sponsor" };

// The two portfolios' terms (funds[name]), before the GP partner agreements.
export function sampleVentureTerms() {
  return {
    [SAMPLE_JV_NAME]: { ...DEFAULT_FUND_TERMS, ...COMMON_TERMS, name: SAMPLE_JV_NAME, type: "Joint Venture", mgmtFeePct: 0.75, partnerName: SAMPLE_JV_PARTNER, finalClose: "2022-03-31", targetEquity: 80_000_000, portfolioManager: "Taylor Brooks", sampleVenture: true },
    [SAMPLE_SMA_NAME]: { ...DEFAULT_FUND_TERMS, ...COMMON_TERMS, name: SAMPLE_SMA_NAME, type: "Separate Account", mgmtFeePct: 1.25, clientName: SAMPLE_SMA_CLIENT, finalClose: "2023-03-31", targetEquity: 25_000_000, portfolioManager: "Taylor Brooks", sampleVenture: true },
  };
}

// SOFR by hold year from the purchase year (fictional, shaped like the period).
const RATES = { 2022: [2.6, 5.1, 5.2, 4.4], 2023: [5.1, 5.0, 4.2, 3.8] };
// Each asset's row (as lib/samplePortfolio.js ASSETS), with its portfolio and story.
const ASSETS = [
  { key: "A", id: "sample-jv-1", fund: SAMPLE_JV_NAME, seed: 11, leasedPct: 92, city: "Phoenix", state: "AZ", address: "4100 Example Gateway Pkwy",
    row: { propertyName: "Example Gateway Industrial Park", unitCount: 72, acquisitionDate: "2022-06-15", squareFootage: 300_000, purchasePrice: 49_500_000, noiYear1: 2_920_000, noiGrowthPct: 21, holdYears: 4, exitCapPct: 6.0, capex: 2_400_000, spreadPct: 1.90 },
    story: "sold", sale: { date: "2026-06-30", premiumPct: 2 } },
  { key: "B", id: "sample-jv-2", fund: SAMPLE_JV_NAME, seed: 12, leasedPct: 91, city: "Las Vegas", state: "NV", address: "2750 Example Summit Rd",
    row: { propertyName: "Example Summit Business Center", unitCount: 64, acquisitionDate: "2023-02-28", squareFootage: 280_000, purchasePrice: 51_000_000, noiYear1: 3_110_000, noiGrowthPct: 20, holdYears: 4, exitCapPct: 6.25, capex: 2_000_000, spreadPct: 2.00 },
    story: "plan" },
  { key: "C", id: "sample-jv-3", fund: SAMPLE_JV_NAME, seed: 13, leasedPct: 68, city: "Salt Lake City", state: "UT", address: "915 Example Foundry Way",
    row: { propertyName: "Example Foundry Flex Park", unitCount: 78, acquisitionDate: "2023-11-15", squareFootage: 320_000, purchasePrice: 48_000_000, noiYear1: 2_450_000, noiGrowthPct: 33, holdYears: 4, exitCapPct: 6.25, capex: 3_500_000, spreadPct: 2.25 },
    story: "behind" },
  { key: "D", id: "sample-sma-1", fund: SAMPLE_SMA_NAME, seed: 14, leasedPct: 90, city: "Denver", state: "CO", address: "6300 Example Orchard Ave",
    row: { propertyName: "Example Orchard Commerce Center", unitCount: 68, acquisitionDate: "2023-06-30", squareFootage: 290_000, purchasePrice: 50_500_000, noiYear1: 3_080_000, noiGrowthPct: 20, holdYears: 4, exitCapPct: 6.25, capex: 2_200_000, spreadPct: 2.00 },
    story: "plan" },
];
export const SAMPLE_VENTURE_DEAL_IDS = ASSETS.map((a) => a.id);

const NEW_TENANT_WORDS = ["Cobalt", "Juniper", "Marlin", "Sierra", "Copper", "Lantern", "Harvest", "Beacon", "Timber", "Quarry", "Mesa", "Falcon"];
const NEW_TENANT_KINDS = ["Supply", "Fabrication", "Logistics", "Mechanical", "Packaging", "Equipment", "Printing", "Controls"];
const newTenant = (seed, k) => `Example ${NEW_TENANT_WORDS[(seed * 3 + k * 5) % NEW_TENANT_WORDS.length]} ${NEW_TENANT_KINDS[(seed + k * 3) % NEW_TENANT_KINDS.length]} LLC`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const r2 = (v) => Math.round(v * 100) / 100;
const monthsFrom = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

// The asset as underwritten at purchase.
function atPurchase(a, baseInputs) {
  const year = Number(a.row.acquisitionDate.slice(0, 4));
  const built = sampleDealFrom(a.row, a.seed - 1, baseInputs, {
    fundName: a.fund, id: a.id, seed: a.seed, leasedPct: a.leasedPct, todayISO: SAMPLE_VENTURE_AS_OF,
    quickExtra: { amFeePct: 0, pmFeePct: 5, cmFeePct: 1.5, cmFeeBasis: "spend", sofrCurveSource: "manual", sofrCurve: RATES[year], sofrPct: RATES[year][0], capStrikePct: RATES[year][0], capRenewalStrike: "same", capPricing: "manual" },
    location: { address: a.address, city: a.city, state: a.state },
  });
  // Fixed unit ids, and the vacant units' planned lease-up spread over the first year.
  let v = 0;
  const units = built.inputs.units.map((u) => ({ ...u, id: `${a.id}-u${u.name}`, ...(u.leaseStatus !== "occupied" ? { downtimeBetweenLeases: 3 + (v++ % 4) * 3 } : {}) }));
  // Bought part vacant: a bridge loan sized on cost, not on the income in place.
  const sizing = a.story === "behind" ? { loanSizingConstraints: { ...(built.inputs.loanSizingConstraints ?? {}), minDSCREnabled: false, minDebtYieldEnabled: false } } : {};
  // The drawn floor plan is keyed by unit id, so it is redrawn for the fixed ids.
  return { ...built, inputs: { ...built.inputs, ...sizing, units, assetMedia: sampleMediaFor(a.row.propertyName, units) } };
}

// What happened since purchase: the leases signed up to `until`, written with
// the function the Rent Roll's Add lease form calls. On plan, a lease that
// ends is renewed (three in five) or re-let after two months, at the market
// rent the asset was underwritten on. Behind plan, the gaps are longer and
// the rents lower.
function withLeasesSince(inputs, a, until) {
  const behind = a.story === "behind";
  const market = (iso) => inputs.rentPerSF * Math.pow(1 + (inputs.annualRentEscalationPct ?? 3) / 100, Math.max(0, monthsFrom(inputs.acquisitionDate, iso)) / 12);
  let cur = inputs, n = 0;
  inputs.units.forEach((u, k) => {
    if (u.leaseStatus !== "occupied") return;
    let end = leaseEndOf(u, inputs), tenant = u.tenantName;
    for (let step = 0; end && end < until && step < 4; step++) {
      const renew = (k + step) % 5 < (behind ? 2 : 3);
      const gap = renew ? 0 : behind ? 5 + ((k + step) % 4) : 2;
      const start = renew ? addDays(end, 1) : `${addMonthsISO(addDays(end, 1), gap).slice(0, 8)}01`;
      const months = [36, 48, 60][(k + step) % 3];
      const leaseEnd = addDays(addMonthsISO(start, months), -1);
      if (!renew) tenant = newTenant(a.seed, n++);
      const lease = {
        id: `${u.id}-l${step + 1}`, kind: renew ? "renewal" : "new", tenantName: tenant, start, end: leaseEnd,
        rentPSF: r2(market(start) * (behind ? 0.9 : 1) * (renew ? 0.98 : 1)), escalationPct: 3,
        freeMonths: renew ? 0 : behind ? 3 : 1, tiPSF: renew ? 2 : behind ? 10 : 8, lcPct: renew ? 2 : 6, source: "Sample lease",
      };
      const r = addLaterLease(cur, u.id, lease, { by: SAMPLE_VENTURE_BY, at: `${start}T12:00:00Z`, source: "Sample lease" });
      if (r.error) break;
      cur = r.inputs; end = leaseEnd;
    }
  });
  return cur;
}

// Behind plan: of the units vacant at purchase, one in four was leased (late);
// the rest are still vacant, and the model now carries them vacant through the hold.
function withSlowLeaseUp(inputs, a, until) {
  let v = 0, n = 100, cur = inputs;
  for (const u of inputs.units.filter((x) => x.leaseStatus !== "occupied")) {
    const k = v++;
    if (k % 4 === 0) {
      const start = `${addMonthsISO(inputs.acquisitionDate, 14 + (k % 3) * 5).slice(0, 8)}01`;
      if (start >= until) continue;
      const r = addLaterLease(cur, u.id, { id: `${u.id}-l1`, kind: "new", tenantName: newTenant(a.seed, n++), start, end: addDays(addMonthsISO(start, 60), -1), rentPSF: r2(inputs.rentPerSF * 0.8), escalationPct: 3, freeMonths: 4, tiPSF: 12, lcPct: 6, source: "Sample lease" }, { by: SAMPLE_VENTURE_BY, at: `${start}T12:00:00Z`, source: "Sample lease" });
      if (!r.error) cur = r.inputs;
    } else {
      cur = { ...cur, units: cur.units.map((x) => (x.id === u.id ? { ...x, downtimeBetweenLeases: 60 } : x)) };
    }
  }
  return cur;
}

// A clean tenant screening for each tenant in place on the date (the tenant
// of the lease in effect, so a tenant that moved in since purchase has its
// own record), dated two months before its lease began or a month before the
// purchase. The record has the fields a screening saved on Tenant Credit has.
function withScreenings(inputs, a, asOf) {
  const units = inputs.units.map((u, k) => {
    const t = unitToday(u, inputs, asOf);
    const tenant = String(t.tenantName ?? "").trim();
    if (t.leaseStatus !== "occupied" || !tenant) return u;
    const date = addDays(t.leaseTodayStart || inputs.acquisitionDate, t.leaseTodayStart ? -60 : -30);
    const record = { id: `sample-vcr-${u.id}`, kind: "screening", tenant, source: "app", provider: "Screening app (fictional report)", reportDate: date, date, scoreType: "consumer", score: 690 + ((a.seed * 13 + k * 29) % 71), rating: "", result: "approved", issues: "", conditions: "", basis: "", by: SAMPLE_VENTURE_BY, at: `${date}T12:00:00.000Z` };
    return { ...u, credit: { records: [record], flags: [] } };
  });
  return { ...inputs, units };
}

// ── 1.1.27: what the two portfolios' sample documents read ──
// Building and site facts (the column order of lib/sampleAssetFacts.js). The
// Phase I of the asset behind plan recognized a condition, so it has a Phase
// II, which came back clean.
const FACT_ROWS = {
  "sample-jv-1": [[30, 40, 72, 135, 30, 17.2, 4000, 6, 40, 28, 50, 50, "ESFR", 7, "TPO", 2019, 20, "Asphalt and concrete", 2019, "yes"], ["Fictional Inland Port (Phoenix)", 9, 18, 6, "Fictional Rail Ramp West", 7, "PHX", 8, "I-10", 0.7, 3100, 4600, "2022-05-12", "A-1 Light Industrial"]],
  "sample-jv-2": [[28, 32, 64, 130, 24, 16.0, 4000, 6, 38, 27, 50, 50, "ESFR", 8, "TPO", 2020, 20, "Asphalt and concrete", 2018, "yes"], ["Fictional Inland Port (Las Vegas)", 14, 26, 5, "Fictional Rail Ramp North", 11, "LAS", 6, "I-15", 0.9, 1500, 2300, "2023-01-24", "M-1 Light Industrial"]],
  "sample-jv-3": [[24, 26, 78, 120, 16, 18.4, 3000, 6, 35, 25, 40, 50, "Wet pipe", 12, "Built-up", 2011, 15, "Asphalt", 2012, "no"], ["Fictional Inland Port (Salt Lake City)", 6, 14, 6, "Fictional Intermodal Hub", 5, "SLC", 5, "I-80", 0.5, 1300, 2400, "2023-10-10", "M-1 Light Manufacturing"]],
  "sample-sma-1": [[28, 34, 68, 130, 26, 16.6, 4000, 6, 38, 27, 50, 50, "ESFR", 8, "TPO", 2018, 20, "Asphalt and concrete", 2017, "yes"], ["Fictional Inland Port (Denver)", 12, 22, 5, "Fictional Rail Yard East", 9, "DEN", 14, "I-70", 0.6, 2100, 3600, "2023-05-25", "I-A Light Industrial"]],
};
export const SAMPLE_PHASE2_DEAL = "sample-jv-3";
export const SAMPLE_PHASE2 = { phase1Result: "Recognized environmental condition", phase2Date: "2023-10-31", phase2Result: "Clean" };
export function sampleVentureFacts(inputs, dealId) {
  const rows = FACT_ROWS[dealId];
  if (!rows) return null;
  const f = factsFromRows(rows[0], rows[1], assetSF(inputs));
  return dealId === SAMPLE_PHASE2_DEAL ? { ...f, site: { ...f.site, ...SAMPLE_PHASE2 } } : f;
}
// Facts are added only where the asset has none (a section the user has started is left alone).
export function withSampleVentureFacts(inputs, dealId) {
  const f = sampleVentureFacts(inputs, dealId);
  if (!f) return inputs;
  const has = (o) => o && typeof o === "object" && Object.keys(o).length > 0;
  if (has(inputs.building) && has(inputs.site)) return inputs;
  return { ...inputs, building: has(inputs.building) ? inputs.building : f.building, site: has(inputs.site) ? inputs.site : f.site };
}
// A tenant that moved out with no replacement, on the asset behind plan
// (the Rent Roll's "Tenant moved out", lib/leaseHistory.js recordMoveOut):
// the first unit, by name, that is on a lease signed since purchase and has
// more than a year to run. Only where no unit of the asset has a move-out.
export const SAMPLE_MOVE_OUT = { dealId: "sample-jv-3", date: "2026-08-31", reason: "terminated", note: "Sample data: the tenant closed this location and surrendered the unit" };
export function withSampleMoveOut(inputs, dealId) {
  if (dealId !== SAMPLE_MOVE_OUT.dealId || (inputs.units ?? []).some((u) => u.moveOut)) return inputs;
  const pick = [...(inputs.units ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name))).find((u) => { const t = leaseToday(u, inputs, SAMPLE_MOVE_OUT.date); return t.status === "later" && t.end >= "2027-12-31"; });
  if (!pick) return inputs;
  const r = recordMoveOut(inputs, pick.id, SAMPLE_MOVE_OUT, { by: SAMPLE_VENTURE_BY, at: `${SAMPLE_MOVE_OUT.date}T12:00:00.000Z` });
  return r.error ? inputs : r.inputs;
}

// The sold asset's sale, closed on its date at a price a little over the model's exit value.
function withClosedSale(inputs, a) {
  const exit = underwrite(inputs).returns.exitValue;
  const price = Math.round((exit * (1 + a.sale.premiumPct / 100)) / 50_000) * 50_000;
  const sale = { ...makeSale({ reason: "plan_complete", targetPrice: Math.round(exit / 50_000) * 50_000, targetClose: a.sale.date, startedFrom: "Sample data" }), id: `${a.id}-sale-1`, createdAt: "2025-12-01T12:00:00Z", brokerChosen: "Example Industrial Advisors" };
  return closeSale({ ...inputs, dispositions: [sale] }, sale.id, { date: a.sale.date, price });
}

// Marks: year-end and the latest quarters, moving from cost toward nine tenths
// of the way to the value the asset's model now gives at its exit (so the
// asset behind plan is marked below cost, and a sale closes a little above its last mark).
function marksFor(a, inputs, lastQ = "2026-09-30") {
  const cost = (Number(inputs.purchasePrice) || 0) + (Number(inputs.capexBudget) || 0);
  // Behind plan: today's value is marked under the exit the model still reaches (the lease-up is not done).
  const target = underwrite({ ...inputs, realizedSalePrice: 0, realizedSaleDate: "" }).returns.exitValue * (a.story === "behind" ? 0.86 : 1);
  const hold = Number(inputs.holdPeriodYears) || 4;
  const stop = a.sale ? a.sale.date : lastQ;
  const out = {};
  const qs = [];
  for (let y = Number(inputs.acquisitionDate.slice(0, 4)); y <= 2026; y++) qs.push(`${y}-12-31`);
  qs.push(lastQ, "2026-06-30", "2026-03-31");
  for (const q of [...new Set(qs)].sort()) {
    if (q <= addMonthsISO(inputs.acquisitionDate, 6) || q > stop || q > lastQ) continue;
    const years = monthsFrom(inputs.acquisitionDate, q) / 12;
    const appraisal = q.endsWith("12-31");
    out[q] = { value: Math.round((cost + (target - cost) * Math.min(1, years / hold) * 0.9) / 50_000) * 50_000, source: appraisal ? "appraisal" : "internal", appraiser: appraisal ? "Example Valuation Advisors" : "", capRate: null, capex: 0, notes: `Sample data ${appraisal ? "appraisal" : "internal mark"}` };
  }
  return out;
}

// The four assets, their marks, the two portfolios' terms, their outside GP
// partners (added to `gp`, the firm's GP partner list) and two pipeline deals.
// Fixed: none of it depends on today's date except the pipeline deals' dates.
export function buildSampleVentures({ baseInputs, gp = null, todayISO = SAMPLE_VENTURE_AS_OF } = {}) {
  const valuations = {};
  const deals = ASSETS.map((a) => {
    const closing = atPurchase(a, baseInputs);
    const uwBaseline = freezeBaseline(closing.inputs, { by: SAMPLE_VENTURE_BY, at: `${a.row.acquisitionDate}T12:00:00Z`, note: "Closing model (sample data)" });
    const until = a.sale ? a.sale.date : SAMPLE_VENTURE_AS_OF;
    let inputs = withLeasesSince(closing.inputs, a, until);
    // Behind plan: slow lease-up, and the exit now assumed at a higher cap rate and lower market rent than underwritten.
    if (a.story === "behind") inputs = { ...withSlowLeaseUp(inputs, a, until), exitCapRatePct: 7.0, rentPerSF: r2(closing.inputs.rentPerSF * 0.97) };
    inputs = withScreenings(inputs, a, until);
    inputs = withSampleMoveOut(inputs, a.id); // 1.1.27
    if (a.sale) inputs = withClosedSale(inputs, a);
    inputs = withSampleVentureFacts(inputs, a.id); // 1.1.27
    inputs = { ...inputs, uwBaseline, propertyManager: ["Jamie Rivera", "Taylor Kim", "Robin Castillo"][a.seed % 3], propertyManagementFirm: { type: "sponsor", name: "" }, sampleVenture: true };
    valuations[a.id] = marksFor(a, inputs);
    return { ...closing, inputs };
  });
  // Outside GP partners and their agreements (fund-wide, from each portfolio's start).
  let g = gpPartnersOf(gp);
  const partner = (name) => {
    const have = g.partners.find((p) => p.name === name);
    if (have) return have;
    const r = addPartner(g, name, { by: SAMPLE_VENTURE_BY, at: "2022-03-31T12:00:00Z" });
    g = { ...r.gp, partners: r.gp.partners.map((p) => (p.id === r.partner.id ? { ...p, id: `gpp-sample-${name === SAMPLE_JV_GP_PARTNER ? "jv" : "sma"}` } : p)) };
    return g.partners.find((p) => p.name === name);
  };
  for (const [portfolio, name, effective, id] of [[SAMPLE_JV_NAME, SAMPLE_JV_GP_PARTNER, "2022-03-31", "gpa-sample-jv"], [SAMPLE_SMA_NAME, SAMPLE_SMA_GP_PARTNER, "2023-03-31", "gpa-sample-sma"]]) {
    const p = partner(name);
    if (g.agreements.some((x) => x.id === id)) continue;
    const r = saveAgreement(g, { id, partnerId: p.id, portfolio, dealId: null, capitalPct: 50, gpSideSharePct: 25, effective, status: "checked", source: "user", checkedBy: SAMPLE_VENTURE_BY, checkedAt: `${effective}T12:00:00Z`, note: "Sample data" }, { by: SAMPLE_VENTURE_BY, at: `${effective}T12:00:00Z` });
    if (!r.error) g = r.gp;
  }
  const base = sampleVentureTerms();
  const funds = Object.fromEntries(Object.entries(base).map(([name, t]) => [name, applyAgreements(t, name, g, { todayISO })]));
  return { deals, valuations, funds, gp: g, pipeline: sampleVenturePipeline(todayISO) };
}

// Two joint venture pipeline deals in process (dates from today, like the other sample pipeline deals).
export function sampleVenturePipeline(today = new Date().toISOString().slice(0, 10), { by = SAMPLE_VENTURE_BY } = {}) {
  const plus = (n) => addDays(today, n);
  return [
    { id: "sample-pl-jv-1", name: "Example Ironworks Distribution Center", address: "500 Example Ironworks Dr", city: "Tucson", state: "AZ", market: "Tucson Airport",
      sf: 310_000, askingPrice: 52_500_000, capRatePct: 6.1, noi: 3_200_000, source: "Broker (fictional)", seller: "Sample Seller Holdings LLC",
      stage: "psa", targetFund: SAMPLE_JV_NAME, nextStep: "Lender appraisal and survey", nextDate: plus(8),
      psaDate: plus(-25), depositDue: plus(-22), ddStart: plus(-25), ddDeadline: plus(12), hardDate: plus(12), loanClosing: plus(50), expectedClose: plus(55),
      notes: "Fictional sample: under contract for the joint venture." },
    { id: "sample-pl-jv-2", name: "Example Prairie Commerce Park", address: "77 Example Prairie Ln", city: "Albuquerque", state: "NM", market: "Albuquerque North",
      sf: 275_000, askingPrice: 47_800_000, capRatePct: 6.4, noi: 3_060_000, source: "Off-market (fictional)", seller: "Placeholder Industrial Trust",
      stage: "loi", targetFund: SAMPLE_JV_NAME, nextStep: "Seller response to LOI", nextDate: plus(4), expectedClose: plus(110),
      notes: "Fictional sample: LOI submitted for the joint venture." },
  ].map((r) => makePipelineDeal(r, { today, by }));
}

// For checks: the leases signed since purchase on an asset.
export const sampleLaterLeaseCount = (inputs) => (inputs?.units ?? []).reduce((s, u) => s + laterLeasesOf(u).length, 0);

// Adds the two portfolios to what a firm holds, only where each piece is
// missing (the load in app/page.jsx and the Load Model Fund I button both
// call this). have: { deals, funds, valuations, gp, pipeline: [rows] };
// toDeal(row): the Underwriter deal of a pipeline row (app/page.jsx
// pipelineToDeal), so the pipeline deals come screened like the others.
// Returns the pieces to add: { deals, funds, valuations, gp, pipeline, added }.
export function sampleVenturesToAdd(have = {}, { baseInputs, todayISO, toDeal = null } = {}) {
  const v = buildSampleVentures({ baseInputs, gp: have.gp, todayISO });
  const dealIds = new Set((have.deals ?? []).map((d) => d.id));
  const deals = v.deals.filter((d) => !dealIds.has(d.id));
  const funds = Object.fromEntries(Object.entries(v.funds).filter(([name]) => !have.funds?.[name]));
  const valuations = Object.fromEntries(Object.entries(v.valuations).filter(([id]) => !Object.keys(have.valuations?.[id] ?? {}).length));
  const rowIds = new Set((have.pipeline ?? []).map((r) => r.id));
  const screened = [];
  const pipeline = v.pipeline.filter((r) => !rowIds.has(r.id)).map((r) => {
    if (!toDeal) return r;
    const d = toDeal(r);
    screened.push(d);
    return { ...r, dealId: d.id };
  });
  return { deals: [...deals, ...screened], funds, valuations, gp: v.gp, pipeline, added: { assets: deals.length, portfolios: Object.keys(funds).length, pipeline: pipeline.length } };
}
