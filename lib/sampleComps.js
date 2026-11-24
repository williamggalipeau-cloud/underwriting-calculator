// ─── Mock comps for the sample assets (user, 11/24) ─────────────────────────
// Fictional sales comps (Acquisitions → Comps, the asset's own list) and
// lease (rent) comps (Asset Management → Active Leasing) for each Model Fund I
// asset: same city and property type, sized near the asset, priced around its
// purchase price per SF and entry cap rate, and dated over the last 24 months
// (sales) or 18 months (leases). Street names, buyers, sellers and tenants are
// made up. Deterministic for a given asset and date, so tests can check them.
// Added with the sample portfolio and from Sample data → Add sample comps,
// only where the asset has none (edits kept).
import { makeComp } from "@/lib/comps";
import { makeRentComp } from "@/lib/leasing";
import { ASSET_LOCATIONS } from "@/lib/assetLocations";

export const SAMPLE_COMP_SOURCE = "Sample (fictional)";
const STREETS = ["Commerce Way", "Industrial Pkwy", "Freight Ct", "Logistics Dr", "Distribution Blvd", "Warehouse Row", "Trade Center Dr", "Foundry Ln", "Dock St", "Gateway Ave", "Flex Park Cir", "Assembly Rd"];
const BUYERS = ["Fictional Industrial REIT", "Example Capital Partners", "Sample Logistics Fund II", "Placeholder Realty Trust", "Demo Property Group", "Model Owner LLC", "Test Asset Partners", "Illustrative Holdings"];
const SELLERS = ["Example Developer LLC", "Sample Family Trust", "Fictional Investors LP", "Placeholder Properties", "Demo Industrial Owner", "Model Builders Inc.", "Test Ventures LLC", "Illustrative Land Co."];
const TENANTS = ["Fictional Fabrication Co.", "Example Auto Parts", "Sample HVAC Supply", "Placeholder Printing", "Demo Cabinetry", "Model Electrical Wholesale", "Test Kitchen Equipment", "Illustrative Signs LLC", "Example Plumbing Supply", "Sample Brewing Supply", "Fictional E-Commerce Fulfillment", "Demo Tile & Stone"];

// A small seeded generator (mulberry32) keyed by the asset name.
function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, lo, hi) => lo + (hi - lo) * r();
const pick = (r, xs) => xs[Math.floor(r() * xs.length) % xs.length];
const isoMinusDays = (todayISO, days) => new Date(Date.parse(`${todayISO}T00:00:00Z`) - Math.round(days) * 86400000).toISOString().slice(0, 10);
const round = (x, step) => Math.round(x / step) * step;

// The nine Model Fund I sample assets (not the other test deals).
export const SAMPLE_COMP_ASSETS = ["Airport Flex Park", "Route 9 Small Bay", "Harbor Light Industrial", "Ridgeway Trade Center", "Canal Street Workshops", "Mill Creek Business Park", "Southpoint Flex", "Granite Ave Industrial", "Lakeshore Service Center"];
const isSample = (inp) => SAMPLE_COMP_ASSETS.includes(inp?.propertyName);

// Six fictional sales near the asset.
export function sampleSalesComps(inp, todayISO) {
  const loc = ASSET_LOCATIONS[inp.propertyName] ?? {};
  const r = rng(`sales:${inp.propertyName}`);
  const sf0 = inp.squareFootage || 30000;
  const psf0 = (inp.purchasePrice || 9_000_000) / sf0;
  const cap0 = inp.purchasePrice ? Math.min(8, Math.max(5, ((inp.noiYear1 ?? inp.purchasePrice * 0.065) / inp.purchasePrice) * 100)) : 6.5;
  return Array.from({ length: 6 }, (_, k) => {
    const sf = round(sf0 * between(r, 0.6, 1.5), 500);
    const pricePSF = psf0 * between(r, 0.88, 1.12);
    const capRate = Math.round((cap0 + between(r, -0.45, 0.45)) * 100) / 100;
    return makeComp({
      id: `sample-sc-${inp.propertyName.replace(/\W+/g, "-").toLowerCase()}-${k + 1}`,
      name: `${100 + Math.floor(r() * 9800)} ${pick(r, STREETS)} (fictional)`,
      city: loc.city ?? "", state: loc.state ?? "", submarket: loc.city ? `${loc.city} industrial` : "",
      propertyType: "Light industrial",
      saleDate: isoMinusDays(todayISO, 30 + k * 115 + r() * 60),
      price: round(pricePSF * sf, 25000), sf,
      capRate, yearBuilt: Math.round(between(r, 1985, 2018)), clearHeight: Math.round(between(r, 18, 30)),
      occupancy: Math.round(between(r, 82, 100)),
      buyer: pick(r, BUYERS), seller: pick(r, SELLERS), example: true,
    });
  });
}

// Six fictional leases near the asset, around its market rent.
export function sampleRentComps(inp, todayISO) {
  const loc = ASSET_LOCATIONS[inp.propertyName] ?? {};
  const r = rng(`rent:${inp.propertyName}`);
  const rent0 = inp.rentPerSF || 14;
  return Array.from({ length: 6 }, (_, k) => makeRentComp({
    id: `sample-rc-${inp.propertyName.replace(/\W+/g, "-").toLowerCase()}-${k + 1}`,
    address: `${100 + Math.floor(r() * 9800)} ${pick(r, STREETS)} (fictional)`,
    city: loc.city ?? "", submarket: loc.city ? `${loc.city} industrial` : "",
    tenant: pick(r, TENANTS), sf: round(between(r, 1800, 9000), 100),
    rentPSF: Math.round(rent0 * between(r, 0.92, 1.09) * 100) / 100,
    signDate: isoMinusDays(todayISO, 20 + k * 85 + r() * 40),
    termMonths: pick(r, [36, 48, 60, 60, 63, 84]), freeMonths: pick(r, [0, 1, 2, 2, 3, 4]),
    tiPSF: Math.round(between(r, 2, 12)), leaseType: "NNN", source: SAMPLE_COMP_SOURCE,
  }));
}

// The deal with sample comps added where it has none; unchanged otherwise.
export function withSampleComps(deal, todayISO = new Date().toISOString().slice(0, 10)) {
  const inp = deal?.inputs;
  if (!isSample(inp)) return deal;
  const patch = {};
  if (!(inp.salesComps?.comps ?? []).length) {
    patch.salesComps = { marketGrowthPct: 3, spreadBp: 25, filters: { sinceISO: "", minSF: "", maxSF: "", type: "" }, ...(inp.salesComps ?? {}), comps: sampleSalesComps(inp, todayISO) };
  }
  if (!(inp.leasing?.comps ?? []).length) {
    patch.leasing = { prospects: [], compMapping: null, ...(inp.leasing ?? {}), comps: sampleRentComps(inp, todayISO) };
  }
  return Object.keys(patch).length ? { ...deal, inputs: { ...inp, ...patch } } : deal;
}
