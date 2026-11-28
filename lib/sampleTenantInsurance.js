// 1.1.29: sample tenant insurance records for Model Fund I (the Insurance
// tab's Tenant insurance section). The nine sample leases and the one sample
// tenant certificate are already documents of the fund; this adds when proof
// was requested and received, so the section's dates are not empty.
//   - The tenant with a sample certificate: received on the certificate's
//     date, requested 14 days before.
//   - Each other tenant with a sample lease: requested 14 days before the
//     sample data's date, not yet received.
// Nothing here is a figure of its own: the tenants are the sample leases'
// (lib/sampleDocTerms.json) and the dates follow the certificate's.
import TERMS from "@/lib/sampleDocTerms.json";
import { tenantKey } from "@/lib/tenantInsurance";

// The sample tenant certificate: its asset, tenant and certificate date (as the document states; tests/node/sampleTieOut checks it).
export const SAMPLE_TENANT_CERT = { dealId: "sample-deal-1", tenant: "Blue Mesa Fulfillment", certDate: "2026-05-04" };
export const SAMPLE_PROOF_LEAD_DAYS = 14;
const minusDays = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

// { [tenantKey]: { requested, received, notes } } for one sample asset.
export function sampleTenantInsurance(dealId) {
  const out = {};
  for (const u of Object.values(TERMS.units?.[dealId] ?? {})) {
    const cert = SAMPLE_TENANT_CERT.dealId === dealId && SAMPLE_TENANT_CERT.tenant === u.tenant;
    out[tenantKey(u.tenant)] = cert
      ? { requested: minusDays(SAMPLE_TENANT_CERT.certDate, SAMPLE_PROOF_LEAD_DAYS), received: SAMPLE_TENANT_CERT.certDate, notes: "Sample data: certificate on file" }
      : { requested: minusDays(TERMS.asOf, SAMPLE_PROOF_LEAD_DAYS), received: "", notes: "Sample data: proof requested from the tenant" };
  }
  return out;
}

// The load step (version 14): a tenant's record only where the asset has none for it.
export function withSampleTenantInsurance(inputs, dealId) {
  const add = sampleTenantInsurance(dealId), cur = inputs?.tenantInsurance ?? {};
  const missing = Object.keys(add).filter((k) => !cur[k]);
  if (!missing.length) return inputs;
  return { ...inputs, tenantInsurance: { ...cur, ...Object.fromEntries(missing.map((k) => [k, add[k]])) } };
}
