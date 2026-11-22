// ─── Model Fund I rent rolls with a 20–40% mark to market ────────────────────
// Every Model Fund I asset gets a rent roll whose market rent is 20–40% above
// its in-place rent (mark to market = market ÷ in-place − 1).
//   • Assets without a rent roll get one: their unit count, about 90% leased
//     (or 1 − the asset's vacancy), in-place rent from the asset's current
//     income (year-1 NOI ÷ leased SF for direct-NOI assets, else its rent/SF),
//     ±5% by unit, and lease ends staggered over the next five years.
//   • Assets with a rent roll keep it; only market rent is raised.
// For direct-NOI (linked) assets the rent roll is reference data; for
// rent-roll assets, higher market rent raises rents on rollover.

import { addMonthsISO, monthsRemainingFor, todayISO } from "@/lib/leases";

export const MTM_MODEL = "mtm-v1";

// Model Fund I assets in order (the index sets each one's target).
export const MTM_ORDER = [
  "Light Industrial (30k SF)", "Airport Flex Park", "Route 9 Small Bay", "Harbor Light Industrial", "Ridgeway Trade Center",
  "Canal Street Workshops", "Mill Creek Business Park", "Southpoint Flex", "Granite Ave Industrial", "Lakeshore Service Center",
  "Small Bay Industrial — Phase I", "Eastside Distribution Hub", "Northgate Flex Center", "Riverside Commerce Park",
];
export const mtmIndex = (name) => {
  const i = MTM_ORDER.indexOf(name);
  return i >= 0 ? i : [...String(name)].reduce((s, c) => s + c.charCodeAt(0), 0) % 11;
};

// Target mark to market for the i-th asset: 20–40%, varied by asset.
export const targetMtm = (i) => 0.2 + (((i * 7) % 11) / 10) * 0.2;

const round2 = (v) => Math.round(v * 100) / 100;

function unit(inputs, i, sf, rent, leaseEnd, occupied) {
  return {
    id: `mtm-${Math.random().toString(36).slice(2, 8)}-${i}`,
    name: String(i + 1).padStart(3, "0"),
    squareFeet: sf,
    tenantName: occupied ? `Tenant ${String(i + 1).padStart(3, "0")}` : "",
    businessDescription: "",
    creditRating: "",
    naicsCode: "",
    leaseStatus: occupied ? "occupied" : "vacant",
    leaseType: inputs.leaseType ?? "NNN",
    currentRentPSF: occupied ? rent : round2(inputs.rentPerSF ?? rent),
    annualEscalationPct: inputs.annualRentEscalationPct ?? 3,
    monthsRemaining: occupied ? Math.max(1, monthsRemainingFor(inputs, leaseEnd) ?? 12) : 0,
    leaseEnd: occupied ? leaseEnd : "",
    newLeaseTerm: Math.round((inputs.avgLeaseTerm ?? 3) * 12) || 36,
    renewalProbabilityPct: inputs.renewalProbabilityPct ?? 60,
    downtimeBetweenLeases: inputs.downtimeBetweenLeases ?? 2,
    creditLossPct: inputs.creditLossPct ?? 1,
    freeRentMonthsNew: inputs.freeRentMonthsNew ?? 1,
    freeRentMonthsRenewal: inputs.freeRentMonthsRenewal ?? 0,
    tiConcessionPSFNew: 0,
    tiConcessionPSFRenewal: 0,
    tiNewPSF: inputs.tiPerSFNew ?? 8,
    tiRenewalPSF: inputs.tiPerSFRenewal ?? 2,
    leasingCommissionNewPct: inputs.leasingCommissionNewPct ?? 6,
    leasingCommissionRenewalPct: inputs.leasingCommissionRenewalPct ?? 2,
    otherIncomePSF: 0,
    realEstateTaxPSF: inputs.realEstateTaxPSF,
    insurancePSF: inputs.insurancePSF,
    utilitiesPSF: inputs.utilitiesPSF,
    maintenancePSF: inputs.maintenancePSF,
    janitorialPSF: inputs.janitorialPSF,
  };
}

// Weighted in-place rent of the leased units.
export function inPlaceRent(units) {
  const leased = (units ?? []).filter((u) => u.leaseStatus === "occupied");
  const sf = leased.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0);
  return sf > 0 ? leased.reduce((s, u) => s + (Number(u.currentRentPSF) || 0) * (Number(u.squareFeet) || 0), 0) / sf : NaN;
}

// Returns inputs with a rent roll and a market rent `mtm` above in-place.
export function withMarkToMarket(inputs, i, asOf = todayISO()) {
  const mtm = targetMtm(i);
  let units = inputs.units ?? [];
  if (!units.length) {
    const n = Math.max(1, Math.round(Number(inputs.unitCount) || 1));
    const sfTotal = Number(inputs.squareFootage) || 0;
    const vac = inputs.noiOverrideEnabled ? 10 : Math.max(0, Math.min(50, Number(inputs.vacancyPct) || 0));
    const leasedN = Math.max(1, Math.min(n, Math.round(n * (1 - vac / 100))));
    const base = Math.floor(sfTotal / n / 50) * 50;
    const sizes = Array.from({ length: n }, (_, k) => (k === n - 1 ? sfTotal - base * (n - 1) : base));
    const leasedSF = sizes.slice(0, leasedN).reduce((s, v) => s + v, 0);
    const rent0 = inputs.noiOverrideEnabled && inputs.noiYear1 > 0 && leasedSF > 0 ? inputs.noiYear1 / leasedSF : Number(inputs.rentPerSF) || 12;
    units = sizes.map((sf, k) => {
      const occupied = k < leasedN;
      const rent = round2(rent0 * (1 + (((k % 5) - 2) * 0.025)));
      const leaseEnd = addMonthsISO(asOf, 6 + Math.round(((k + 1) / leasedN) * 54));
      return unit(inputs, k, sf, rent, leaseEnd, occupied);
    });
  }
  const inPlace = inPlaceRent(units);
  if (!isFinite(inPlace)) return { ...inputs, units };
  return { ...inputs, units, rentPerSF: round2(inPlace * (1 + mtm)) };
}

// ─── Rent-roll NOI ───────────────────────────────────────────────────────────
// Switches a deal to rent-roll NOI (noiOverrideEnabled off) and calibrates its
// rent roll to the NOI path it had: in-place rents are scaled so year-1 NOI
// matches target.y1, and market rent (re-leasing and vacant units) is solved
// so the final hold year's NOI matches target.exit. Mark to market is then
// whatever that market rent implies (it can exceed 40%).
// target: { y1, exit } (a number is read as y1 only, with market rent at the
// asset's 20–40% target).
export function toRentRollNOI(inputs, target, i, underwrite) {
  const t = typeof target === "number" ? { y1: target } : target ?? {};
  if (!(t.y1 > 0) || !(inputs.units ?? []).length) return { ...inputs, noiOverrideEnabled: false };
  const base = inputs.units;
  const build = (k, m) => {
    const leased = base.map((u) => (u.leaseStatus === "occupied" ? { ...u, currentRentPSF: round2(u.currentRentPSF * k) } : u));
    const ip = inPlaceRent(leased);
    const market = round2(ip * (1 + m));
    const units = leased.map((u) => (u.leaseStatus === "occupied" ? u : { ...u, currentRentPSF: market }));
    return { ...inputs, noiOverrideEnabled: false, units, rentPerSF: market };
  };
  const cf = (k, m) => underwrite(build(k, m)).annualCashFlows;
  const solve = (f, x0, x1, tol, lo, hi) => {
    let a = x0, b = x1, fa = f(a), fb = f(b);
    for (let n = 0; n < 14 && Math.abs(fb) > tol; n++) {
      const c = fb === fa ? b * 1.05 : b - (fb * (b - a)) / (fb - fa);
      a = b; fa = fb; b = Math.max(lo, Math.min(hi, c)); fb = f(b);
    }
    return b;
  };
  let k = 1;
  let m = targetMtm(i);
  const tolY1 = Math.max(500, t.y1 * 0.002);
  for (let pass = 0; pass < (t.exit > 0 ? 4 : 1); pass++) {
    k = solve((x) => (cf(x, m)[0]?.noi ?? 0) - t.y1, k, k * 1.1, tolY1, 0.2, 5);
    if (t.exit > 0) {
      const last = (x) => { const c = cf(k, x); return (c[c.length - 1]?.noi ?? 0) - t.exit; };
      m = solve(last, m, m + 0.2, Math.max(1000, t.exit * 0.003), 0, 4);
    }
  }
  return build(k, m);
}
