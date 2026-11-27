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

// 1.1.23: research items of the remaining types, so each type has a sample
// and a sample file. Each summarises what the asset already holds and names
// the sample document it is read from (filed again under the research item):
//   Airport Flex Park: its appraisal (the appraisal mark), Phase I report
//   (site facts), property condition report (the condition findings), a
//   tenant's credit report (the tenant's credit record) and a zoning report
//   (site facts); Harbor Light Industrial: the broker opinion of its sale.
// valuations: { dealId: marks }.
const usd0 = (v) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;
export function sampleResearchExtra(inputs, dealId, { valuations = {} } = {}) {
  const n = numOf(dealId), out = [], by = "Sample (fictional)";
  if (!String(dealId).startsWith("sample-deal-")) return out;
  const item = (key, o) => out.push({ id: `srs-${n}-${key}`, url: "", docId: null, addedBy: by, addedAt: `${o.date || inputs.acquisitionDate || "2026-01-01"}T12:00:00.000Z`, ...o });
  if (n === 1) {
    const marks = valuations[dealId] ?? {};
    const q = Object.keys(marks).filter((k) => marks[k]?.source === "appraisal").sort().at(-1);
    if (q) item("appraisal", { type: "appraisal", title: `${inputs.propertyName} appraisal, ${q}`, provider: marks[q].appraiser || "Appraiser", date: q, fileName: "airport-flex-appraisal-2026q3.pdf", assumptions: ["value", "exitCap"],
      keyFigures: `Market value ${usd0(marks[q].value)}${marks[q].capRate ? `; cap rate ${marks[q].capRate}%` : ""}`, summary: "The value is the asset's appraisal mark on the Valuation tab. Sample (fictional)." });
    const s = inputs.site ?? {};
    if (s.phase1Date) item("environmental", { type: "environmental", title: `${inputs.propertyName} Phase I environmental site assessment`, provider: "Fictional Environmental Consultants", date: s.phase1Date, fileName: "airport-flex-phase1.pdf", assumptions: ["other"],
      keyFigures: `Phase I: ${s.phase1Result}; Phase II: ${s.phase2Result ?? "not needed"}`, summary: "The result is the asset's environmental fact on Asset Summary. Sample (fictional)." });
    const pca = (inputs.propertyMgmt?.items ?? []).filter((x) => x.source === "PCA");
    if (pca.length) item("pca", { type: "pca", title: `${inputs.propertyName} property condition report`, provider: "Sample Building Consultants", date: pca[0].reportDate, fileName: "airport-flex-pcr.pdf", assumptions: ["capex"],
      keyFigures: `${pca.length} findings; open cost ${usd0(pca.filter((x) => x.status === "Open").reduce((t, x) => t + (Number(x.cost) || 0), 0))}`, summary: "The findings are the asset's Property Condition rows. Sample (fictional)." });
    const rec = (inputs.units ?? []).flatMap((u) => u.credit?.records ?? []).find((r) => r.file);
    if (rec) item("credit", { type: "credit", title: `${rec.tenant} credit screening report`, provider: rec.provider, date: rec.reportDate, fileName: rec.file, assumptions: ["credit"],
      keyFigures: `Score ${rec.score}; result: ${rec.result}${rec.conditions ? `; ${rec.conditions}` : ""}`, summary: "The report is the tenant's record on Tenant Credit. Sample (fictional)." });
    if (s.zoning) item("zoning", { type: "zoning", title: `${inputs.propertyName} zoning report`, provider: "Fictional Zoning Advisors", date: s.phase1Date || inputs.acquisitionDate, fileName: "airport-flex-zoning-report.pdf", assumptions: ["other"],
      keyFigures: `Zoning ${s.zoning}; industrial use by right: ${s.industrialByRight ?? "not stated"}`, summary: "The zoning is the asset's site fact on Asset Summary. Sample (fictional)." });
  }
  if (n === 3) {
    const bov = (inputs.dispositions ?? []).find((x) => x.startedFrom === "Sample sale (fictional)")?.bovs?.[0];
    if (bov) item("bov", { type: "bov", title: `${inputs.propertyName} broker opinion of value`, provider: bov.broker, date: (/dated (\d{4}-\d{2}-\d{2})/.exec(bov.notes ?? "") ?? [])[1] ?? "", fileName: "harbor-light-bov.pdf", assumptions: ["value", "exitCap"],
      keyFigures: `Most likely value ${usd0(bov.price)}${bov.capPct ? `; cap rate ${bov.capPct}%` : ""}`, summary: "The value is the broker opinion on the asset's sale in Assets for Sale. Sample (fictional)." });
  }
  return out;
}
// Adds each of them the asset does not have (by id); nothing else on the asset changes.
export function withSampleResearchExtra(inputs, dealId, opts) {
  const have = new Set((inputs?.research ?? []).map((r) => r.id));
  const add = sampleResearchExtra(inputs, dealId, opts).filter((r) => !have.has(r.id));
  return add.length ? { ...inputs, research: [...(inputs.research ?? []), ...add] } : inputs;
}
