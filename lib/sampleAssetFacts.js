// 1.1.17: fictional building and site facts for the nine Model Fund I assets,
// and the SNDA status of the leases on the two assets whose loan agreements
// are in the sample documents. Fictional, for testing only.
//
// Everything that can be derived from the fund is derived (the footprint is
// the asset's SF: single-storey buildings; the lender is the asset's own),
// so these never disagree with the fund. The sample documents for three
// assets (scripts/sample-deal-docs/asset_facts.cjs) are written from the
// values here through fund.json, and the tie-out test compares them.
import { assetSF } from "@/lib/assetMetrics";

// Per asset: [clear height, dock doors, drive-in doors, truck court, trailer
// stalls, land acres, amps, slab in, FF, FL, column W, column D, sprinklers,
// office %, roof type, roof year, roof warranty years, paving surface,
// paving year, dolly pads]
const B = {
  "sample-deal-1": [20, 2, 12, 110, 4, 1.5, 1200, 5, 30, 22, 30, 40, "Wet pipe", 12, "TPO", 2018, 20, "Asphalt", 2016, "no"],
  "sample-deal-2": [24, 6, 18, 120, 8, 2.6, 2000, 6, 35, 25, 40, 40, "Wet pipe", 10, "TPO", 2019, 20, "Asphalt", 2014, "no"],
  "sample-deal-3": [26, 8, 16, 125, 10, 2.1, 2000, 6, 38, 27, 40, 50, "ESFR", 9, "EPDM", 2015, 15, "Asphalt and concrete", 2018, "yes"],
  "sample-deal-4": [22, 4, 14, 115, 6, 1.9, 1600, 5, 32, 24, 36, 40, "Wet pipe", 11, "TPO", 2020, 20, "Asphalt", 2017, "no"],
  "sample-deal-5": [18, 0, 9, 90, 0, 1.1, 800, 5, 28, 20, 30, 30, "Wet pipe", 14, "Built-up", 2012, 10, "Asphalt", 2013, "no"],
  "sample-deal-6": [28, 10, 22, 135, 14, 3.2, 2500, 6, 40, 28, 50, 50, "ESFR", 8, "TPO", 2021, 20, "Asphalt and concrete", 2019, "yes"],
  "sample-deal-7": [22, 4, 15, 110, 5, 2.0, 1600, 5, 32, 24, 36, 40, "Wet pipe", 12, "TPO", 2017, 20, "Asphalt", 2015, "no"],
  "sample-deal-8": [24, 4, 12, 130, 6, 1.6, 1600, 6, 35, 25, 40, 40, "ESFR", 10, "PVC", 2019, 20, "Concrete", 2011, "yes"],
  "sample-deal-9": [24, 6, 18, 120, 8, 2.5, 2000, 6, 35, 25, 40, 40, "Wet pipe", 10, "TPO", 2016, 20, "Asphalt", 2015, "no"],
};
// Per asset: [port, miles, minutes, drayage trips, rail, rail miles, airport,
// airport miles, freeway, freeway miles, pop 30 (thousands), pop 60
// (thousands), Phase I date, zoning]
const S = {
  "sample-deal-1": ["Fictional Inland Port (Las Vegas)", 12, 25, 5, "Fictional Rail Ramp North", 9, "LAS", 3, "I-15", 0.6, 1400, 2300, "2025-12-05", "M-1 Light Industrial"],
  "sample-deal-2": ["Fictional Port of Puget Sound", 19, 30, 4, "Fictional Rail Yard South", 6, "SEA", 7, "SR-167", 0.8, 1100, 3400, "2026-02-10", "M1 Industrial"],
  "sample-deal-3": ["Fictional Harbor Terminal", 4, 12, 7, "Fictional Dockside Rail", 5, "LGB", 6, "I-710", 0.5, 2600, 9800, "2026-03-20", "IG General Industrial"],
  "sample-deal-4": ["Fictional Inland Port (Fort Worth)", 14, 22, 5, "Fictional Alliance Rail Ramp", 11, "DFW", 18, "I-35W", 0.9, 1500, 5200, "2026-05-08", "K Heavy Industrial"],
  "sample-deal-5": ["Fictional Ship Channel Terminal", 9, 20, 6, "Fictional Englewood Yard", 7, "HOU", 10, "I-10", 0.4, 2400, 5600, "2026-06-12", "No zoning (deed restricted industrial)"],
  "sample-deal-6": ["Fictional Port of Puget Sound", 31, 45, 3, "Fictional Rail Yard North", 4, "PAE", 3, "I-5", 1.1, 700, 2900, "2026-07-10", "LI-1 Light Industrial"],
  "sample-deal-7": ["Fictional Inland Port (Las Vegas)", 18, 30, 4, "Fictional Rail Ramp North", 16, "LAS", 9, "I-11", 0.7, 1200, 2300, "2026-08-25", "IG General Industrial"],
  "sample-deal-8": ["Fictional Harbor Terminal", 62, 85, 2, "Fictional Inland Empire Rail", 8, "ONT", 9, "I-10", 0.6, 1900, 8700, "2026-09-11", "M-2 General Industrial"],
  "sample-deal-9": ["Fictional Inland Port (Dallas)", 11, 20, 5, "Fictional South Dallas Rail", 8, "DAL", 6, "I-35E", 0.5, 2100, 6100, "2026-10-09", "IR Industrial Research"],
};
export function sampleAssetFacts(inputs, dealId) {
  const b = B[dealId], s = S[dealId];
  if (!b || !s) return null;
  const sf = assetSF(inputs);
  return {
    building: {
      clearHeightFt: b[0], dockDoors: b[1], driveInDoors: b[2], truckCourtFt: b[3], trailerStalls: b[4], landAcres: b[5], footprintSF: sf,
      powerAmps: b[6], powerVolts: 480, powerPhase: "3", slabIn: b[7], slabReinforcement: b[7] >= 6 ? "Rebar" : "Wire mesh", floorFF: b[8], floorFL: b[9],
      columnSpacingW: b[10], columnSpacingD: b[11], sprinklerType: b[12], officeSF: Math.round((sf * b[13]) / 100),
      roofType: b[14], roofYear: b[15], roofWarrantyTo: b[15] + b[16], roofLifeYears: 20, pavingSurface: b[17], pavingYear: b[18], pavingLifeYears: b[17] === "Concrete" ? 30 : 15, dollyPads: b[19],
    },
    site: {
      portName: s[0], portMiles: s[1], portMinutes: s[2], drayageTripsPerShift: s[3], railName: s[4], railMiles: s[5], airportName: s[6], airportMiles: s[7], freewayName: s[8], freewayMiles: s[9],
      pop30: s[10] * 1000, pop60: s[11] * 1000, phase1Date: s[12], phase1Result: "Clean", phase2Result: "Not needed", zoning: s[13], industrialByRight: "yes", residentialAdjacency: "None", truckRestrictions: "None", freewayNoResidential: "yes",
    },
  };
}
// Facts are added only where the asset has none (a section the user has started is left alone).
export function withSampleAssetFacts(inputs, dealId) {
  const f = sampleAssetFacts(inputs, dealId);
  if (!f) return inputs;
  const has = (o) => o && typeof o === "object" && Object.keys(o).length > 0;
  if (has(inputs.building) && has(inputs.site)) return inputs;
  return { ...inputs, building: has(inputs.building) ? inputs.building : f.building, site: has(inputs.site) ? inputs.site : f.site };
}

// ── SNDAs: the two assets with a sample loan agreement ──
// The loan requires one from every lease (entered in the app; the sample
// loan agreements are silent on it). By unit name: the first two leases are
// signed (each has a sample SNDA document), the next two requested, the rest
// required and not yet requested.
export const SAMPLE_SNDA_ASSETS = ["sample-deal-1", "sample-deal-2"];
export const SAMPLE_SNDA = {
  "sample-deal-1": { signed: { "001": "2026-01-22", "002": "2026-01-23" }, requested: { "003": "2026-10-30", "004": "2026-10-30" } },
  "sample-deal-2": { signed: { "001": "2026-03-09", "002": "2026-03-10" }, requested: { "003": "2026-11-05", "004": "2026-11-05" } },
};
export function withSampleSnda(inputs, dealId) {
  const plan = SAMPLE_SNDA[dealId];
  if (!plan) return inputs;
  const lender = inputs.lenderName || inputs.loanTerms?.lender || "";
  const touched = (inputs.units ?? []).some((u) => u.snda && Object.keys(u.snda).length) || inputs.loanTerms?.sndaRule;
  if (touched) return inputs; // already set (by an earlier load or by the user)
  const occupied = (u) => u.leaseStatus === "occupied" && String(u.tenantName ?? "").trim() !== "";
  return {
    ...inputs,
    loanTerms: { ...(inputs.loanTerms ?? {}), sndaRule: "all" },
    units: (inputs.units ?? []).map((u) => {
      if (!occupied(u)) return u;
      if (plan.signed[u.name]) return { ...u, snda: { status: "signed", signedOn: plan.signed[u.name], lender } };
      if (plan.requested[u.name]) return { ...u, snda: { status: "requested", requestedOn: plan.requested[u.name], lender } };
      return u;
    }),
  };
}
