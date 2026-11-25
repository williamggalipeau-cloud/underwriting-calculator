// Sample data → Add sample prospects (user, 11/25, 1.1.2): a fictional leasing
// pipeline for every Model Fund I asset (Asset Management → Active Leasing):
//   - prospects on the vacant units, at different stages (inquiry to lease
//     out, one lost); some units have none, so the Dashboard's Vacant Units
//     shows what still needs a tenant;
//   - a renewal on each asset's next lease to expire, so every asset has a
//     pipeline;
//   - three rent comps sized near each vacant unit, around its asking rent;
//   - a fictional leasing manager on each asset (one unit has its own).
// Next steps fall over the coming weeks (some within 7 days, so they show in
// Actions Needed). Deterministic for a given asset and date. Earlier sample
// prospects and unit comps are replaced; anything a user entered is kept.
import { makeProspect, makeRentComp } from "@/lib/leasing";
import { ASSET_LOCATIONS } from "@/lib/assetLocations";

export const SAMPLE_PROSPECT_PREFIX = "sample-lp-";
export const SAMPLE_UNIT_COMP_PREFIX = "sample-rcu-";
const SOURCE = "Sample (fictional)";
const TENANTS = ["Example Drone Works", "Sample Cabinetry LLC", "Fictional Marine Supply", "Placeholder Coffee Roasters", "Demo Fitness Equipment", "Model Signworks", "Test Brewing Co.", "Illustrative Auto Detailing", "Example Lighting Supply", "Sample Pet Products", "Fictional Print Shop", "Demo Solar Installers", "Placeholder Tile Distributors", "Model Bike Assembly", "Test Kitchen Commissary", "Illustrative Flooring Co.", "Example Medical Supply", "Sample Glass & Mirror", "Fictional HVAC Services", "Demo Event Rentals"];
const BROKERS = ["Example Realty Advisors", "Sample Commercial Brokers", "Fictional Industrial Partners", "Direct (no broker)"];
// Fictional leasing managers, one per asset (in turn); one unit is handled by another.
export const SAMPLE_LEASING_MANAGERS = ["Casey Morgan", "Riley Chen", "Avery Santos"];
const STREETS = ["Commerce Way", "Industrial Pkwy", "Freight Ct", "Logistics Dr", "Trade Center Dr", "Foundry Ln", "Dock St", "Gateway Ave", "Flex Park Cir", "Assembly Rd"];
const NEXT = {
  inquiry: ["Send the flyer and floor plan", "Schedule a tour"],
  tour: ["Second tour with the owner", "Follow up after the tour"],
  proposal: ["Counter on TI and free rent", "Send the revised proposal"],
  loi: ["Send the lease draft", "Credit review of financials"],
  leaseout: ["Comments back on the lease draft", "Lease out for signature"],
};
// Prospects on each vacant unit, by the unit's place in the fund (repeats).
const PATTERN = [["loi", "tour"], ["tour"], [], ["proposal", "inquiry", "lost"], ["leaseout"], ["inquiry"], [], ["tour", "proposal"], ["loi"], ["proposal"], [], ["inquiry", "tour"], []];

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
const between = (r, a, b) => a + r() * (b - a);
const pick = (r, xs) => xs[Math.floor(r() * xs.length) % xs.length];
const r2 = (x) => Math.round(x * 100) / 100;
const addDays = (iso, k) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + Math.round(k)); return t.toISOString().slice(0, 10); };
const slug = (s) => String(s).replace(/\W+/g, "-").toLowerCase();
const asking = (inp, u) => Number(u.marketRentPSF) || Number(inp.rentPerSF) || Number(u.currentRentPSF) || 14;

// One asset's sample prospects and unit comps. start: the asset's first
// vacant unit's place in the fund (so the pattern runs across assets).
export function sampleLeasingFor(inp, { todayISO, start = 0 }) {
  const r = rng(`leasing:${inp.propertyName}:${todayISO}`);
  const loc = ASSET_LOCATIONS[inp.propertyName] ?? {};
  const units = inp.units ?? [];
  const vacant = units.filter((u) => u.leaseStatus !== "occupied");
  const prospects = [], comps = [];
  let t = Math.floor(r() * TENANTS.length);
  vacant.forEach((u, i) => {
    const ask = asking(inp, u);
    PATTERN[(start + i) % PATTERN.length].forEach((stage, k) => {
      const tenant = TENANTS[t++ % TENANTS.length];
      const lost = stage === "lost";
      const far = ["proposal", "loi", "leaseout"].includes(stage);
      prospects.push(makeProspect({
        id: `${SAMPLE_PROSPECT_PREFIX}${slug(inp.propertyName)}-${slug(u.name || u.id)}-${k + 1}`,
        unitId: u.id, kind: "new", tenant, source: pick(r, ["Broker", "Broker", "Direct", "Sign call", "Website"]), broker: pick(r, BROKERS),
        stage, lostReason: lost ? "Chose a larger space elsewhere" : "",
        sf: Number(u.squareFeet) || null, askingRentPSF: r2(ask),
        proposedRentPSF: far || lost ? r2(ask * between(r, 0.95, 0.99)) : null,
        termMonths: pick(r, [36, 48, 60, 60, 63]), freeMonths: pick(r, [0, 1, 1, 2, 3]), tiPSF: Math.round(between(r, 2, 10)), escalationPct: 3.5,
        expectedStart: addDays(todayISO, between(r, 45, 120)),
        nextStep: lost ? "" : pick(r, NEXT[stage]), nextDate: lost ? "" : addDays(todayISO, between(r, 1, 21)),
        notes: "Fictional sample prospect.", createdAt: `${addDays(todayISO, -between(r, 10, 60))}T12:00:00.000Z`,
      }));
    });
    // Three leases near the unit's size, around its asking rent.
    for (let k = 0; k < 3; k++) {
      comps.push(makeRentComp({
        id: `${SAMPLE_UNIT_COMP_PREFIX}${slug(inp.propertyName)}-${slug(u.name || u.id)}-${k + 1}`,
        address: `${100 + Math.floor(r() * 9800)} ${pick(r, STREETS)} (fictional)`,
        city: loc.city ?? "", submarket: loc.city ? `${loc.city} industrial` : "",
        tenant: pick(r, TENANTS), sf: Math.round(((Number(u.squareFeet) || 2000) * between(r, 0.85, 1.15)) / 50) * 50,
        rentPSF: r2(ask * between(r, 0.94, 1.06)), signDate: addDays(todayISO, -between(r, 20, 330)),
        termMonths: pick(r, [36, 48, 60, 60]), freeMonths: pick(r, [0, 1, 1, 2]), tiPSF: Math.round(between(r, 2, 8)),
        leaseType: "NNN", source: SOURCE,
      }));
    }
  });
  // A renewal on the next lease to expire, so every asset has a pipeline.
  const next = units.filter((u) => u.leaseStatus === "occupied" && u.leaseEnd && u.leaseEnd >= todayISO).sort((a, b) => (a.leaseEnd < b.leaseEnd ? -1 : 1))[0];
  if (next) {
    prospects.push(makeProspect({
      id: `${SAMPLE_PROSPECT_PREFIX}${slug(inp.propertyName)}-${slug(next.name || next.id)}-renewal`,
      unitId: next.id, kind: "renewal", tenant: next.tenantName || "Existing tenant", source: "Existing tenant", broker: "",
      stage: pick(r, ["proposal", "inquiry", "tour"]), sf: Number(next.squareFeet) || null,
      askingRentPSF: r2(asking(inp, next)), proposedRentPSF: r2(asking(inp, next) * 0.97), termMonths: 60, freeMonths: 0, tiPSF: 2, escalationPct: 3.5,
      expectedStart: next.leaseEnd, nextStep: "Renewal proposal to the tenant", nextDate: addDays(todayISO, between(r, 3, 28)),
      notes: "Fictional sample renewal.", createdAt: `${addDays(todayISO, -20)}T12:00:00.000Z`,
    }));
  }
  return { prospects, comps };
}

// { updates: { dealId: { leasingManager, leasing, units? } }, counts: { prospects, comps, assets } }.
export function addSampleLeasing(deals, { todayISO } = {}) {
  const updates = {};
  let start = 0, np = 0, nc = 0, k = 0;
  const sample = deals.filter((d) => d.id.startsWith("sample-deal-")).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (const d of sample) {
    const inp = d.inputs;
    const { prospects, comps } = sampleLeasingFor(inp, { todayISO, start });
    start += (inp.units ?? []).filter((u) => u.leaseStatus !== "occupied").length;
    const cur = inp.leasing ?? {};
    // The asset's leasing manager (kept if set); Harbor Light's second vacant
    // unit goes to another manager, to show a unit-level assignment.
    const manager = String(inp.leasingManager ?? "").trim() || SAMPLE_LEASING_MANAGERS[k++ % SAMPLE_LEASING_MANAGERS.length];
    const vac = (inp.units ?? []).filter((u) => u.leaseStatus !== "occupied");
    const units = inp.propertyName === "Harbor Light Industrial" && vac[1] && !vac[1].leasingManager
      ? (inp.units ?? []).map((u) => (u.id === vac[1].id ? { ...u, leasingManager: SAMPLE_LEASING_MANAGERS.find((m) => m !== manager) } : u))
      : null;
    updates[d.id] = { leasingManager: manager, ...(units ? { units } : {}), leasing: {
      prospects: [], compMapping: null, ...cur,
      prospects: [...(cur.prospects ?? []).filter((p) => !String(p.id).startsWith(SAMPLE_PROSPECT_PREFIX)), ...prospects],
      comps: [...(cur.comps ?? []).filter((c) => !String(c.id).startsWith(SAMPLE_UNIT_COMP_PREFIX)), ...comps],
    } };
    np += prospects.length; nc += comps.length;
  }
  return { updates, counts: { prospects: np, comps: nc, assets: Object.keys(updates).length } };
}
