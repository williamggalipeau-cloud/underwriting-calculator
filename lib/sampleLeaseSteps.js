// 1.1.21: the rent steps each Model Fund I sample lease states, on its
// tenant's unit. With them the model pays the lease's rent on the lease's
// dates (one step a year, on the anniversary) instead of raising the unit's
// rent a little each month. Where a lease and the unit's escalation
// disagree, the lease wins (lib/calculations.js, phase C).
//
// lib/sampleLeaseSteps.json is written from the lease abstracts by
// scripts/sample-leases/make_steps.cjs.
import STEPS from "@/lib/sampleLeaseSteps.json";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
export const sampleLeaseSteps = (dealId) => STEPS[dealId] ?? null;
// Sets only `rentSteps`, only on the unit that still has the lease's tenant
// and holds no steps of its own.
export function withSampleLeaseSteps(inputs, dealId) {
  const by = STEPS[dealId];
  if (!by || !Array.isArray(inputs?.units)) return inputs;
  let changed = false;
  const units = inputs.units.map((u) => {
    const p = by[u.name];
    if (!p || !same(u.tenantName, p.tenant) || u.leaseStatus !== "occupied" || (Array.isArray(u.rentSteps) && u.rentSteps.length)) return u;
    changed = true;
    return { ...u, rentSteps: p.rentSteps.map((s) => ({ ...s })) };
  });
  return changed ? { ...inputs, units } : inputs;
}
