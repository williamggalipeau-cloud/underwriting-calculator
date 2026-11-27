// 1.1.21: fictional third-party research on the nine Model Fund I assets
// (Comps → Third-Party): a submarket report and a rent survey each.
// Fictional, for testing only.
//
// Both are written from what the app already holds, so they tie to it:
//   - the market report's figures are the asset's submarket statistics for
//     one quarter (Market data; the firm's sample submarkets);
//   - the rent survey's figures are the asset's own rent comps (Active
//     Leasing), through the app's own statistics.
// On three assets the market report is also a sample PDF, filed on the asset
// as "[research:<id>] …" (scripts/sample-deal-docs/research_docs.cjs); the
// item finds its file by that title.
import { rentCompStats } from "@/lib/leasing";

export const SAMPLE_RESEARCH_QUARTER = "2026-Q3"; // the quarter the sample market reports cover
const SLUG = { "sample-deal-1": "airport-flex", "sample-deal-2": "route9", "sample-deal-3": "harbor-light" };
const numOf = (dealId) => Number(String(dealId).replace("sample-deal-", ""));
const usd2 = (v) => `$${Number(v).toFixed(2)}`;
const qLabel = (q) => `Q${q.slice(-1)} ${q.slice(0, 4)}`;
const qEnd = (q) => `${q.slice(0, 4)}-${{ 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" }[q.slice(-1)]}`;
export const sampleResearchFile = (dealId) => (SLUG[dealId] ? `${SLUG[dealId]}-market-report-2026q3.pdf` : "");

// The submarket statistics a market report is written from (null when the firm has none for the asset).
export function sampleMarketStat(inputs, market, quarter = SAMPLE_RESEARCH_QUARTER) {
  const sub = (market?.submarkets ?? []).find((s) => s.id === inputs?.submarketId);
  const stats = (market?.stats ?? []).filter((s) => s.submarketId === inputs?.submarketId).sort((a, b) => (a.quarter < b.quarter ? -1 : 1));
  const stat = stats.find((s) => s.quarter === quarter) ?? stats.at(-1);
  if (!sub || !stat) return null;
  const prior = stats.find((s) => s.quarter === `${Number(stat.quarter.slice(0, 4)) - 1}${stat.quarter.slice(4)}`);
  const growth = prior?.askingRentSmallBayPSF > 0 ? Math.round((stat.askingRentSmallBayPSF / prior.askingRentSmallBayPSF - 1) * 1000) / 10 : null;
  return { sub, stat, growthPct: growth };
}

// [market report, rent survey] for one asset (either may be missing when the app holds no data for it).
export function sampleResearch(inputs, dealId, market) {
  const n = numOf(dealId);
  if (!String(dealId).startsWith("sample-deal-") || !(n >= 1 && n <= 9)) return [];
  const out = [], at = `${inputs.acquisitionDate || "2026-01-01"}T12:00:00.000Z`;
  const m = sampleMarketStat(inputs, market);
  if (m) {
    const { sub, stat, growthPct } = m, file = sampleResearchFile(dealId);
    out.push({
      id: `srs-${n}-market`, type: "market", title: `${sub.name.replace(" (fictional)", "")} industrial market report, ${qLabel(stat.quarter)}`, provider: "Fictional Market Research Group", date: qEnd(stat.quarter), url: "", docId: null, fileName: file,
      assumptions: ["marketRent", "rentGrowth", "vacancy", "exitCap"],
      keyFigures: `Small-bay asking rent ${usd2(stat.askingRentSmallBayPSF)}/SF; vacancy ${stat.vacancyPct}%; cap rate ${stat.capRatePct}%${growthPct != null ? `; small-bay rent growth ${growthPct}% over the year` : ""}`,
      summary: `${sub.metro}: ${Math.round(stat.inventorySF).toLocaleString("en-US")} SF of inventory, ${Math.round(stat.underConstructionSF).toLocaleString("en-US")} SF under construction, net absorption ${Math.round(stat.netAbsorptionSF).toLocaleString("en-US")} SF in the quarter. Sample (fictional).`,
      addedBy: "Sample (fictional)", addedAt: at,
    });
  }
  const rs = rentCompStats(inputs?.leasing?.comps);
  if (rs) {
    const dates = (inputs.leasing.comps ?? []).map((c) => c.signDate).filter(Boolean).sort();
    out.push({
      id: `srs-${n}-rent`, type: "rent_survey", title: `${inputs.propertyName} rent survey (${rs.count} leases)`, provider: "Sample Brokerage Research", date: dates.at(-1) ?? "", url: "", docId: null, fileName: "",
      assumptions: ["marketRent"],
      keyFigures: `${rs.count} comparable leases: average ${usd2(rs.avg)}/SF, median ${usd2(rs.median)}/SF, range ${usd2(rs.low)} to ${usd2(rs.high)}/SF${rs.netEffectiveAvg != null ? `; net effective ${usd2(rs.netEffectiveAvg)}/SF` : ""}`,
      summary: "The leases are the asset's rent comps in Active Leasing. Sample (fictional).",
      addedBy: "Sample (fictional)", addedAt: at,
    });
  }
  return out;
}
// Added only where the asset has no research items; nothing else on the asset changes.
export function withSampleResearch(inputs, dealId, market) {
  if (Array.isArray(inputs?.research) && inputs.research.length) return inputs;
  const items = sampleResearch(inputs, dealId, market);
  return items.length ? { ...inputs, research: items } : inputs;
}
