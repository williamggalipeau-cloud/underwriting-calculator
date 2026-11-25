// Sample data → Add sample marks and market data (user, 11/25, 1.1.5).
//
// Market data: one fictional submarket per Model Fund I sample asset (its
// city's small-bay industrial), with eight quarters of statistics to the last
// completed quarter, set near the asset's own assumptions so the market check
// mostly reads "In line"; two assets are off on purpose:
//   Route 9 Small Bay: its market rent is ~13% above the submarket (amber).
//   Harbor Light Industrial: its exit cap is ~85 bp below the market (red).
// Each sample asset is tagged to its submarket (inputs.submarketId).
//
// Marks: for each sample asset, every completed quarter after its first six
// months (held at cost before that, so marks there would be ignored): an
// appraisal at Q2 / Q4 and an internal mark at Q1 / Q3, near cost with small
// moves (Route 9 and Harbor Light marked down a little).
//
// Deterministic for a given asset and date. Earlier sample submarkets, stats
// and marks are replaced; a user's own submarkets, stats, marks and asset tags
// are kept.
import { ASSET_LOCATIONS } from "@/lib/assetLocations";
import { lastCompletedQuarterEnd, quarterEnd } from "@/lib/valuations";

export const SAMPLE_SM_PREFIX = "sample-sm-";
export const SAMPLE_MS_PREFIX = "sample-ms-";
export const SAMPLE_MARK_SOURCE = "Sample (fictional)";
export const SAMPLE_APPRAISER = "Example Valuation Advisors (fictional)";
// How far each asset sits from its submarket: rent (asset ÷ market − 1),
// cap (asset − market, bp), vacancy (asset − market, pts), growth (pts),
// and its marks' drift from cost per year held.
const STORIES = {
  "Route 9 Small Bay": { rent: 0.13, cap: 20, vacancy: 0.6, growth: 0.3, drift: -0.03 },
  "Harbor Light Industrial": { rent: 0.03, cap: -85, vacancy: 0.4, growth: -0.2, drift: -0.015 },
};
const QUIET = [
  { rent: 0.03, cap: 15, vacancy: 0.5, growth: 0.3, drift: 0.02 },
  { rent: -0.02, cap: -10, vacancy: -0.4, growth: -0.2, drift: 0.03 },
  { rent: 0.04, cap: 20, vacancy: 0.8, growth: 0.4, drift: 0.015 },
  { rent: -0.03, cap: -15, vacancy: -0.6, growth: 0.2, drift: 0.025 },
];
const slug = (s) => String(s).replace(/\W+/g, "-").toLowerCase();
const r2 = (x) => Math.round(x * 100) / 100;
const qKey = (iso) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
function prevQuarterEnd(iso) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 3;
  const yy = m <= 0 ? y - 1 : y, mm = m <= 0 ? m + 12 : m;
  return new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
}
function nextQuarterEnd(iso) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) + 3;
  const yy = m > 12 ? y + 1 : y, mm = m > 12 ? m - 12 : m;
  return new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
}
const addMonths = (iso, k) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10); };
const storyOf = (name, i) => STORIES[name] ?? QUIET[i % QUIET.length];
const sampleDeals = (deals) => deals.filter((d) => d.id.startsWith("sample-deal-")).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

// The submarkets and eight quarters of statistics; { submarkets, stats, tags: { dealId: submarketId } }.
export function sampleMarket(deals, { todayISO }) {
  const lastQ = lastCompletedQuarterEnd(todayISO);
  const quarters = [];
  for (let q = lastQ, k = 0; k < 8; k++, q = prevQuarterEnd(q)) quarters.unshift(q);
  const submarkets = [], stats = [], tags = {};
  sampleDeals(deals).forEach((d, i) => {
    const inp = d.inputs, name = inp.propertyName;
    const city = ASSET_LOCATIONS[name]?.city ?? name;
    const st = storyOf(name, i);
    const id = `${SAMPLE_SM_PREFIX}${slug(city)}`;
    if (!submarkets.some((s) => s.id === id)) submarkets.push({ id, name: `${city} Small Bay (fictional)`, metro: `${city}, ${ASSET_LOCATIONS[name]?.state ?? ""}`.replace(/, $/, ""), propertyType: "Industrial" });
    tags[d.id] = id;
    const rent = (Number(inp.rentPerSF) || 14) / (1 + st.rent);
    const cap = (Number(inp.exitCapRatePct) || 6.5) - st.cap / 100;
    const vac = Math.max(1, (Number(inp.vacancyPct) || 5) - st.vacancy);
    const growth = ((Number(inp.annualRentEscalationPct) || 3) - st.growth) / 100;
    quarters.forEach((q, k) => {
      const back = (quarters.length - 1 - k) / 4; // years before the latest quarter
      const smallBay = rent / Math.pow(1 + growth, back);
      stats.push({
        id: `${SAMPLE_MS_PREFIX}${slug(city)}-${qKey(q)}`, submarketId: id, quarter: qKey(q),
        inventorySF: Math.round((8 + i) * 1e6 + k * 60000), vacancyPct: r2(vac + (quarters.length - 1 - k) * 0.1 * (i % 2 ? 1 : -1)),
        availabilityPct: r2(vac + 2.1), netAbsorptionSF: Math.round(40000 + ((i * 7 + k * 13) % 9) * 15000 - 50000),
        askingRentPSF: r2(smallBay * 0.88), askingRentSmallBayPSF: r2(smallBay),
        deliveriesSF: k % 3 ? 0 : 150000, underConstructionSF: 300000 + (k % 4) * 50000,
        salesVolume: Math.round((20 + ((i + k) % 5) * 6) * 1e6), capRatePct: r2(cap + (quarters.length - 1 - k) * 0.02),
        source: SAMPLE_MARK_SOURCE, sourceDate: lastQ,
      });
    });
  });
  return { submarkets, stats, tags };
}

// Marks by asset: { dealId: { quarterEnd: mark } }.
export function sampleMarks(deals, { todayISO }) {
  const lastQ = lastCompletedQuarterEnd(todayISO);
  const out = {};
  sampleDeals(deals).forEach((d, i) => {
    const inp = d.inputs;
    if (!inp.acquisitionDate || inp.acquisitionDate > lastQ) return;
    const st = storyOf(inp.propertyName, i);
    const cost = (Number(inp.purchasePrice) || 0) + (Number(inp.capexBudget) || 0);
    if (!cost) return;
    const costUntil = addMonths(inp.acquisitionDate, 6);
    const marks = {};
    for (let q = quarterEnd(inp.acquisitionDate); q <= lastQ; q = nextQuarterEnd(q)) {
      if (q <= costUntil) continue; // held at cost: a mark here would be ignored
      const years = (Date.parse(q) - Date.parse(inp.acquisitionDate)) / (365.25 * 864e5);
      const value = Math.round((cost * (1 + st.drift * years)) / 1000) * 1000;
      const appraisal = ["06", "12"].includes(q.slice(5, 7));
      const noi = Number(inp.noiYear1) || 0;
      marks[q] = {
        value, source: appraisal ? "appraisal" : "internal", appraiser: appraisal ? SAMPLE_APPRAISER : "",
        capRate: noi && value ? r2((noi / value) * 100) : null, capex: 0, notes: `${SAMPLE_MARK_SOURCE} ${appraisal ? "appraisal" : "internal mark"}`,
      };
    }
    if (Object.keys(marks).length) out[d.id] = marks;
  });
  return out;
}

// Merges into what the firm has: sample entries replaced, a user's kept.
//   market: comps.market; valuations: { dealId: marks }; deals: for the tags.
// Returns { market, valuations, tags: { dealId: submarketId } (only assets
// with no tag of their own), counts }.
export function addSampleMarketAndMarks({ market = null, valuations = {}, deals = [], todayISO }) {
  const m = sampleMarket(deals, { todayISO });
  const cur = { submarkets: [], stats: [], mapping: null, ...(market ?? {}) };
  const nextMarket = {
    ...cur,
    submarkets: [...cur.submarkets.filter((s) => !String(s.id).startsWith(SAMPLE_SM_PREFIX)), ...m.submarkets],
    stats: [...cur.stats.filter((s) => !String(s.id).startsWith(SAMPLE_MS_PREFIX)), ...m.stats],
  };
  const tags = Object.fromEntries(Object.entries(m.tags).filter(([id]) => {
    const t = deals.find((d) => d.id === id)?.inputs?.submarketId;
    return !t || String(t).startsWith(SAMPLE_SM_PREFIX);
  }));
  const marks = sampleMarks(deals, { todayISO });
  const nextVal = { ...valuations };
  let nMarks = 0;
  for (const [id, qs] of Object.entries(marks)) {
    const have = { ...(valuations[id] ?? {}) };
    for (const [q, mk] of Object.entries(qs)) {
      const old = have[q];
      if (old && old.value > 0 && !String(old.notes ?? "").startsWith(SAMPLE_MARK_SOURCE)) continue; // a user's mark is kept
      have[q] = mk; nMarks++;
    }
    nextVal[id] = have;
  }
  return { market: nextMarket, valuations: nextVal, tags, counts: { submarkets: m.submarkets.length, stats: m.stats.length, marks: nMarks, tagged: Object.keys(tags).length } };
}
