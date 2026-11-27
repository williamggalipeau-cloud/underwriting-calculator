// 1.1.21: fictional Property Management rows for the nine Model Fund I
// assets: property taxes (a parcel, tax bills, one appeal), insurance (the
// owner's policies, one claim), property condition findings and service
// contracts. Fictional, for testing only.
//
// Everything that can be derived from the asset is derived, so the rows tie
// to the rest of the app (AGENTS.md: everything ties out):
//   - tax bills for a year add up to the year's tax line in the asset's
//     business plan budget (the months it is owned);
//   - the policies' premiums add up to a year of the budget's insurance line;
//   - the service contracts' annual cost is three quarters of a year of the
//     budget's repairs line (the rest is unscheduled repairs);
//   - the condition findings come from the asset's building and site facts
//     (roof and paving age against their life, the Phase I result), and
//     their open cost is inside the capital plan's budget.
// The owner's policies on Airport Flex Park are the ones its sample
// insurance certificate states (the tie-out test compares them).
import { budgetMonth } from "@/lib/businessPlan";
import { assetSF } from "@/lib/assetMetrics";

const TAX_YEAR = 2026; // the year the nine assets were bought in
const REPORT_YEAR = 2026;
const r0 = (v) => Math.round(v);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400000));
const addYears = (s, n) => `${Number(s.slice(0, 4)) + n}${s.slice(4)}`;
const numOf = (dealId) => Number(String(dealId).replace("sample-deal-", ""));

const COUNTY = { NV: "Clark County", WA: "King County", CA: "Los Angeles County", TX: "Tarrant County" };
const VENDORS = {
  Landscaping: "Fictional Grounds Co.", HVAC: "Sample Mechanical Services", "Fire / life safety": "Example Fire Protection", Waste: "Demo Waste & Recycling",
};
// Share of the contracted cost (itself 75% of the repairs budget) by service.
const CONTRACT_MIX = [["Landscaping", 0.32], ["HVAC", 0.28], ["Fire / life safety", 0.16], ["Waste", 0.24]];
const SAMPLE_PM_INSURER = "Fictional Mutual Insurance Company";
const SAMPLE_PM_BROKER = "Sample Risk Advisors";

// A year of one budget line from the asset's latest plan (the months that
// have a budget), as a positive number; falls back to the asset's $/SF.
function budgetYear(inputs, line, year, psf) {
  const rev = inputs?.businessPlan?.revisions?.at(-1);
  let total = 0, months = 0;
  if (rev?.budget) {
    for (let m = 1; m <= 12; m++) {
      const l = budgetMonth(rev.budget, `${year}-${String(m).padStart(2, "0")}`);
      if (l?.[line] != null) { total += -l[line]; months++; }
    }
  }
  if (months) return { total, months };
  const acq = inputs.acquisitionDate || `${year}-01-01`;
  const owned = Number(acq.slice(0, 4)) < year ? 12 : Number(acq.slice(0, 4)) > year ? 0 : 13 - Number(acq.slice(5, 7));
  return { total: (psf * assetSF(inputs) * owned) / 12, months: owned };
}
const annualOf = (inputs, psf) => r0((Number(psf) || 0) * assetSF(inputs));

// The sample rows for one asset: { parcels, bills, appeals, policies, claims, items, contracts }.
export function samplePropertyMgmt(inputs, dealId) {
  const n = numOf(dealId);
  if (!String(dealId).startsWith("sample-deal-") || !(n >= 1 && n <= 9) || !inputs?.acquisitionDate) return null;
  const sf = assetSF(inputs), acq = inputs.acquisitionDate, id = (k, i) => `spm-${n}-${k}${i}`;
  const apn = `${String(100 + n)}-${String(20 + n).padStart(3, "0")}-${String(n).padStart(3, "0")}`;

  // ── Property taxes ──
  const annualTax = annualOf(inputs, inputs.realEstateTaxPSF);
  const owned = budgetYear(inputs, "taxes", TAX_YEAR, inputs.realEstateTaxPSF);
  const next = budgetYear(inputs, "taxes", TAX_YEAR + 1, inputs.realEstateTaxPSF);
  const parcels = [{ id: id("p", 1), apn, address: [inputs.address, inputs.city, inputs.state].filter(Boolean).join(", "), assessedValue: inputs.purchasePrice, taxRatePct: inputs.purchasePrice > 0 ? Math.round((annualTax / inputs.purchasePrice) * 1000000) / 10000 : null, assessmentYear: TAX_YEAR, notes: `${COUNTY[inputs.state] ?? "County"} assessor; reassessed at the ${acq.slice(0, 4)} purchase` }];
  const bills = [
    { id: id("b", 1), parcel: apn, year: TAX_YEAR, installment: `${owned.months} month${owned.months === 1 ? "" : "s"} owned (prorated at closing)`, amount: r0(owned.total), dueDate: acq, paidDate: acq },
    { id: id("b", 2), parcel: apn, year: TAX_YEAR + 1, installment: "1st half", amount: r0(next.total / 2), dueDate: `${TAX_YEAR + 1}-01-15`, paidDate: "" },
    { id: id("b", 3), parcel: apn, year: TAX_YEAR + 1, installment: "2nd half", amount: r0(next.total) - r0(next.total / 2), dueDate: `${TAX_YEAR + 1}-07-15`, paidDate: "" },
  ];
  // One appeal in the fund: the largest purchase, reassessed the most.
  const appeals = n === 6 ? [{ id: id("a", 1), parcel: apn, year: TAX_YEAR + 1, filedDate: addDays(acq, 45), hearingDate: `${TAX_YEAR + 1}-01-20`, outcome: "Pending", savings: null, consultant: "Fictional Property Tax Advisors" }] : [];

  // ── Insurance: the owner's three policies ──
  const premium = annualOf(inputs, inputs.insurancePSF);
  const prop = r0(premium * 0.7), gl = r0(premium * 0.2), um = premium - prop - gl;
  const base = 55120 + (n - 1) * 10, glFrom = addDays(acq, -15);
  const policies = [
    { id: id("i", 1), type: "Property", carrier: SAMPLE_PM_INSURER, policyNo: `PR-${base}`, limit: Math.round((inputs.purchasePrice * 13) / 12 / 100000) * 100000, deductible: 25000, premium: prop, effective: acq, renewalDate: addYears(acq, 1), broker: SAMPLE_PM_BROKER },
    { id: id("i", 2), type: "General liability", carrier: SAMPLE_PM_INSURER, policyNo: `GL-${base + 1}`, limit: 1000000, deductible: 0, premium: gl, effective: glFrom, renewalDate: addYears(glFrom, 1), broker: SAMPLE_PM_BROKER },
    { id: id("i", 3), type: "Umbrella", carrier: SAMPLE_PM_INSURER, policyNo: `UM-${base + 2}`, limit: 5000000, deductible: 0, premium: um, effective: glFrom, renewalDate: addYears(glFrom, 1), broker: SAMPLE_PM_BROKER },
  ];
  // One claim in the fund, closed and recovered net of the deductible.
  const claims = n === 3 ? [{ id: id("c", 1), date: addDays(acq, 60), cause: "Wind damage to a roll-up door", policy: `PR-${base}`, amount: 38500, status: "Closed", recovery: 13500, notes: "Paid net of the $25,000 deductible" }] : [];

  // ── Property condition: from the building and site facts ──
  const b = inputs.building ?? {}, s = inputs.site ?? {};
  const reportDate = addDays(acq, -35); // the property condition report, as its sample document is dated
  const urgency = (left) => (left <= 0 ? "Immediate" : left <= 1 ? "Within 1 year" : left <= 5 ? "1–5 years" : "5+ years");
  const items = [];
  if (b.roofYear && b.roofLifeYears) {
    const left = b.roofYear + b.roofLifeYears - REPORT_YEAR;
    items.push({ id: id("f", 1), source: "PCA", reportDate, system: "Roof", finding: `${b.roofType ?? "Roof"} installed ${b.roofYear}; about ${Math.max(0, left)} year${left === 1 ? "" : "s"} of its ${b.roofLifeYears}-year life left${left > 5 ? "; seam and flashing repairs now" : "; plan the replacement"}`, cost: r0(sf * (left > 5 ? 0.45 : 8)), urgency: left > 5 ? "Within 1 year" : urgency(left), status: "Open", yardiJob: "" });
  }
  if (b.pavingYear && b.pavingLifeYears) {
    const left = b.pavingYear + b.pavingLifeYears - REPORT_YEAR;
    items.push({ id: id("f", 2), source: "PCA", reportDate, system: "Paving / parking", finding: `${b.pavingSurface ?? "Paving"} from ${b.pavingYear}; about ${Math.max(0, left)} year${left === 1 ? "" : "s"} of its ${b.pavingLifeYears}-year life left${left > 5 ? "; crack seal and restripe" : "; resurface the truck court and parking"}`, cost: r0(sf * (left > 5 ? 0.3 : 1.5)), urgency: left > 5 ? "1–5 years" : urgency(left), status: "Open", yardiJob: "" });
  }
  if (b.sprinklerType) items.push({ id: id("f", 3), source: "PCA", reportDate, system: "Fire / life safety", finding: `${b.sprinklerType} sprinkler system: five-year internal inspection completed, tags current`, cost: r0(sf * 0.1), urgency: "Within 1 year", status: "Done", yardiJob: "" });
  if (s.phase1Date) items.push({ id: id("f", 4), source: "Phase I", reportDate: s.phase1Date, system: "Environmental", finding: `${s.phase1Result === "Clean" ? "No recognized environmental conditions" : s.phase1Result}; Phase II ${String(s.phase2Result ?? "not needed").toLowerCase()}`, cost: 0, urgency: "5+ years", status: "Done", yardiJob: "" });

  // ── Service contracts ──
  const contracted = r0(annualOf(inputs, (Number(inputs.maintenancePSF) || 0) + (Number(inputs.janitorialPSF) || 0)) * 0.75);
  let left = contracted;
  const contracts = CONTRACT_MIX.map(([service, share], i) => {
    const annualCost = i === CONTRACT_MIX.length - 1 ? left : r0(contracted * share);
    left -= annualCost;
    return { id: id("s", i + 1), vendor: VENDORS[service], service, start: acq, end: addDays(addYears(acq, 1), -1), annualCost, autoRenew: i < 2, noticeDays: i < 2 ? 60 : 30, yardiContract: "" };
  });
  return { parcels, bills, appeals, policies, claims, items, contracts };
}

export const SAMPLE_PM_SECTIONS = ["parcels", "bills", "appeals", "policies", "claims", "items", "contracts"];
// Fills only the sections the asset has no rows in (a section the user has
// started is left alone), and changes nothing else on the asset.
export function withSamplePropertyMgmt(inputs, dealId) {
  const rows = samplePropertyMgmt(inputs, dealId);
  if (!rows) return inputs;
  const cur = inputs.propertyMgmt ?? {};
  const add = Object.fromEntries(SAMPLE_PM_SECTIONS.filter((k) => !(Array.isArray(cur[k]) && cur[k].length) && rows[k].length).map((k) => [k, rows[k]]));
  return Object.keys(add).length ? { ...inputs, propertyMgmt: { ...cur, ...add } } : inputs;
}
