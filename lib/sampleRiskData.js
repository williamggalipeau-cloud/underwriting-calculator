// ─── Phase L: risk test data for the sample assets (fictional) ──────────────
// Made-up lenders, rate cap counterparties, environmental / climate
// entries and TI facilities for Model Fund I's nine sample assets, set so the risk report's
// concentration and environmental sections show something to test: one lender
// over the 35% limit, one counterparty writing most caps, one asset with no
// provider entered, an open REC, a flood zone, high heat and an old Phase I.
// Applied when the sample portfolio is built and from the Sample data menu
// (owners), only where a field is still empty or the default lender.

export const RISK_TEST_MODEL = "risk-v1";
const DEFAULT_LENDER = "First National Bank";

// TI / LC facilities on the loans (a $/SF holdback, a DSCR draw test, some a
// debt yield test or an end date) and one planned re-tenanting, set so the TI
// heat map shows every colour: most assets covered by their facility; two
// with none (their cash flow, then the sub line); Ridgeway missing its 1.45x
// draw test in the first quarters; and Lakeshore's re-tenanting after the sub
// line ends, needing a capital call.
export const SAMPLE_TI = {
  "Airport Flex Park": { tiFacility: { psf: 6, minDscr: 1.2 } },
  "Route 9 Small Bay": { tiFacility: { psf: 8, minDscr: 1.25 } },
  "Harbor Light Industrial": { tiFacility: { psf: 5, minDscr: 1.2, minDebtYieldPct: 8 } },
  "Ridgeway Trade Center": { tiFacility: { psf: 5, minDscr: 1.45 } },
  "Mill Creek Business Park": { tiFacility: { psf: 10, minDscr: 1.2 } },
  "Southpoint Flex": { tiFacility: { psf: 6, minDscr: 1.25, availableUntil: "2028-06-30" } },
  "Granite Ave Industrial": { tiFacility: { psf: 4, minDscr: 1.1 } },
  "Canal Street Workshops": {},
  "Lakeshore Service Center": { tiPlanned: [{ date: "2028-02-15", amount: 400000, note: "Re-tenant units 017-018 for a single user (fictional)" }] },
};

export const SAMPLE_RISK = {
  "Airport Flex Park": { lenderName: "Desert Mountain Bank", cap: "Atlas Derivatives Bank", env: { phase1Date: "2025-11-20", floodZone: "X", wildfire: "low", heat: "high" } },
  "Route 9 Small Bay": { lenderName: "Cascade Commercial Bank", cap: "Atlas Derivatives Bank", env: { phase1Date: "2026-01-28", floodZone: "X", wildfire: "low", heat: "low" } },
  "Harbor Light Industrial": { lenderName: "Cascade Commercial Bank", cap: "Atlas Derivatives Bank", env: { phase1Date: "2026-03-05", recs: "Former drum storage, NW corner (fictional)", phase2: "Soil sampling scheduled", nfa: false, hazmatTenants: "Copper Canyon Tile & Stone (sealants)", floodZone: "AE", wildfire: "low", heat: "moderate" } },
  "Ridgeway Trade Center": { lenderName: "Gulf Coast Capital", cap: "Northbridge Bank", env: { phase1Date: "2019-04-10", floodZone: "X", wildfire: "moderate", heat: "high" } },
  "Canal Street Workshops": { lenderName: "Gulf Coast Capital", cap: "", env: { phase1Date: "2026-05-22", floodZone: "X", wildfire: "low", heat: "high" } },
  "Mill Creek Business Park": { lenderName: "Cascade Commercial Bank", cap: "Atlas Derivatives Bank", env: { phase1Date: "2026-06-30", recs: "Historic dry cleaner, adjoining parcel (fictional)", phase2: "Vapor survey complete", nfa: true, floodZone: "X", wildfire: "moderate", heat: "low" } },
  "Southpoint Flex": { lenderName: "Cascade Commercial Bank", cap: "Atlas Derivatives Bank", env: { phase1Date: "2026-08-25", floodZone: "X", wildfire: "low", heat: "high" } },
  "Granite Ave Industrial": { lenderName: "Desert Mountain Bank", cap: "Northbridge Bank", env: { phase1Date: "2026-09-15", floodZone: "X", wildfire: "low", heat: "moderate" } },
  "Lakeshore Service Center": { lenderName: "Lakeshore Life Insurance", cap: "Atlas Derivatives Bank", env: { phase1Date: "2026-10-01", floodZone: "AE", wildfire: "low", heat: "low" } },
};

// Fills only what's empty (and replaces the default lender); returns the same
// deal when there's nothing to add.
export function withRiskTestData(deal) {
  const inp = deal.inputs ?? {};
  const s = SAMPLE_RISK[inp.propertyName];
  if (!s) return deal;
  const patch = {};
  if (!inp.lenderName || inp.lenderName === DEFAULT_LENDER) if (inp.lenderName !== s.lenderName) patch.lenderName = s.lenderName;
  if (s.cap && !Object.keys(inp.capProviders ?? {}).length) patch.capProviders = { 1: s.cap };
  if (!inp.envRisk) patch.envRisk = s.env;
  const ti = SAMPLE_TI[inp.propertyName] ?? {};
  if (ti.tiFacility && !inp.tiFacility) patch.tiFacility = ti.tiFacility;
  if (ti.tiPlanned && !(inp.tiPlanned ?? []).length) patch.tiPlanned = ti.tiPlanned;
  return Object.keys(patch).length ? { ...deal, inputs: { ...inp, ...patch } } : deal;
}
