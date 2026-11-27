// 1.1.23: writes a fictional sample document for each document type that had
// none (tests/node/coverage1122.test.cjs), as HTML, prints them to PDF and
// writes the abstract of each: docs/sample-deal-docs/more/.
//
// Every figure a document shares with the app is read from Model Fund I as
// the app builds it (lib/sampleFund.js, on the fixed date below) and from the
// sample leases' index; nothing the app holds is typed in here (AGENTS.md:
// everything ties out). Facts the app does not hold (a broker's name on a
// listing, a fee, a signing date) are written here and nowhere else.
// Each abstract value's quote is a sentence of its document.
// Fictional only.
// Usage: node scripts/sample-deal-docs/more_docs.cjs [--no-pdf] [--check]
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund, samplePropertyCompany } = j(R + "/lib/sampleFund.js");
const { underwrite } = j(R + "/lib/calculations.js");
const { netEffective, rentCompStats } = j(R + "/lib/leasing.js");
const { SAMPLE_DOC_PROSPECT_ID } = j(R + "/lib/sampleLeasing.js");
const leases = require(R + "/docs/sample-leases/index.json");
const dir = path.join(R, "docs", "sample-deal-docs", "more");
const AS_OF = "2026-11-27";

const f = buildSampleFund({ todayISO: AS_OF });
const deal = (n) => f.deals.find((d) => d.id === `sample-deal-${n}`);
const A = deal(1).inputs, H = deal(3).inputs, M = deal(6).inputs;
const co = (n) => samplePropertyCompany(n - 1);
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const usd = (v) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;
const usd2 = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => Math.round(Number(v)).toLocaleString("en-US");
const where = (a) => `${a.address}, ${a.city}, ${a.state} ${a.zip}`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const css = `body{font:11.5px/1.55 Georgia,serif;color:#111}h1{font-size:17px;text-align:center;margin:0 0 4px}h2{font-size:12.5px;margin:16px 0 4px}p{margin:4px 0}
.banner{font:bold 11px Arial;color:#b42318;text-align:center;border:1px solid #b42318;padding:4px;margin-bottom:14px}.c{text-align:center}.muted{color:#555;font-size:10.5px}
table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left;font-size:11px}th{background:#f3f3f3}`;

// One document. facts: [[key, value, sentence]] become numbered sentences
// under their heading and the abstract's fields (each quoted from its
// sentence); extra: sentences or HTML shown but not abstracted.
const docs = [];
function doc({ name, list, type, n, heading, sub, title, sections, table = "", app = {}, link = {} }) {
  const fields = [];
  let body = "";
  sections.forEach(([h, rows], si) => {
    body += `<h2>${si + 1}. ${h}</h2>`;
    rows.forEach((r, ri) => {
      const [key, value, sentence] = Array.isArray(r) ? r : [null, null, r];
      body += `<p>${si + 1}.${ri + 1} ${sentence}</p>`;
      if (key) fields.push({ key, value, status: "found", clause: `${si + 1}.${ri + 1}`, evidence: [{ quote: sentence, page: 1 }] });
    });
  });
  const a = deal(n).inputs;
  const html = `<html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="banner">SAMPLE – FICTIONAL – FOR TESTING ONLY – NOT A REAL DOCUMENT</div>
<h1>${heading.toUpperCase()}</h1><p class="c muted">${sub}</p>${body}${table}<p class="muted" style="margin-top:22px">This document is fictional and was created for software testing.</p></body></html>`;
  docs.push({ name, list, type, dealId: `sample-deal-${n}`, asset: a.propertyName, title, html, link,
    abstract: { doc_type: list === "library" || (list === "disposition" && type === "estoppel") ? type : `${list}_${type}`, title, asset: a.propertyName, summary: sub, fields, critical_dates: [], app: { made_with: "Sample (fictional)", validated: false, files: [`${name}.pdf`], ...app } } });
}
const tbl = (head, rows) => `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;

// ── Airport Flex Park: what the documents read ──
const rA = underwrite(A), cfA = rA.annualCashFlows[0];
const loanA = Math.round(rA.debt.loanAmount), equityA = Math.round(rA.debt.equityRequired), noiA = Math.round(cfA.noi);
const closingA = Object.values(A.closingCosts ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
const occupied = (a) => (a.units ?? []).filter((u) => u.leaseStatus === "occupied");
const seller = "Sample Seller Holdings LLC", sellerBroker = "Fictional Industrial Partners";
const bA = A.building ?? {}, sA = A.site ?? {};
const leaseA = leases.find((l) => l.asset === A.propertyName), leaseH = leases.find((l) => l.asset === H.propertyName);
const rentOn = (l, iso) => l.fund.schedule.find((r) => r.start <= iso && iso <= r.end);

// 1. Tenant billing (Library → Documents; checked against the lease's rent).
{
  const t = leaseA.tenant, rows = ["2026-11", "2026-12"].map((m) => ({ m, label: new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), rent: rentOn(leaseA, `${m}-01`).monthly }));
  const cam = Math.round(((A.realEstateTaxPSF + A.insurancePSF + A.maintenancePSF + A.janitorialPSF + A.utilitiesPSF) * leaseA.rsf) / 12);
  const per = `Tenant invoices for November and December 2026 at ${A.propertyName}.`;
  const line = (x) => `${t}, ${x.label}: base rent ${usd2(x.rent)}, CAM estimate ${usd2(cam)}, total ${usd2(x.rent + cam)}.`;
  doc({ name: "airport-flex-billing-2026-12", list: "library", type: "billing", n: 1, heading: "Tenant Billing", sub: `${A.propertyName} · November and December 2026`, title: `${A.propertyName} billing Nov–Dec 2026`,
    sections: [["Period", [["period", "November and December 2026", per]]], ["Charges", rows.map((x) => line(x))]], app: { lease_tenant: t } });
  docs.at(-1).abstract.charges = rows.map((x) => ({ tenant: t, month: x.m, base_rent: x.rent, cam_estimate: cam, total: Math.round((x.rent + cam) * 100) / 100, evidence: [{ quote: line(x), page: 1 }] }));
}

// 2–10. Acquisition documents (Acquisitions → Acquisition Documents).
{
  const occ = occupied(A), sub = (s) => `${A.propertyName} · ${s}`;
  doc({ name: "airport-flex-current-leases", list: "acquisition", type: "current_leases", n: 1, heading: "Schedule of Leases", sub: sub("Delivered by the seller in due diligence"), title: `${A.propertyName} schedule of leases`,
    sections: [["Property", [["seller", seller, `This schedule lists every lease at ${A.propertyName}, delivered by ${seller} in due diligence.`], ["leases", occ.length, `There are ${occ.length} leases in effect, covering ${num(occ.reduce((s, u) => s + u.squareFeet, 0))} of the ${num(A.squareFootage)} rentable square feet.`]]]],
    table: tbl(["Unit", "Tenant", "SF", "Rent / SF / yr", "Lease ends"], occ.map((u) => [u.name, u.tenantName, num(u.squareFeet), usd2(u.currentRentPSF), u.leaseEnd ? long(u.leaseEnd) : "Month to month"])) });
  doc({ name: "airport-flex-broker-listing", list: "acquisition", type: "listing_agreement", n: 1, heading: "Exclusive Listing Summary", sub: sub("The seller's broker"), title: `${A.propertyName} seller's listing summary`,
    sections: [["Engagement", [["seller", seller, `${seller} has engaged ${sellerBroker} as its exclusive broker for the sale of ${A.propertyName}.`], ["broker", sellerBroker, `All offers are to be sent to ${sellerBroker}.`]]],
      ["Property", [["square_feet", A.squareFootage, `The property is ${num(A.squareFootage)} rentable square feet in ${A.unitCount} units at ${where(A)}.`], ["commission", "Paid by the seller", "The broker's commission is paid by the seller; the buyer pays no commission."]]]] });
  doc({ name: "airport-flex-broker-model", list: "acquisition", type: "broker_model", n: 1, heading: "Broker Underwriting Summary", sub: sub("Prepared by the seller's broker"), title: `${A.propertyName} broker underwriting`,
    sections: [["Broker's figures", [["in_place_noi", A.noiYear1, `${sellerBroker} underwrites in-place net operating income of ${usd(A.noiYear1)}.`], ["price", A.purchasePrice, `At the price of ${usd(A.purchasePrice)} that is a capitalization rate of ${((A.noiYear1 / A.purchasePrice) * 100).toFixed(2)}%.`]]],
      ["Buyer's underwriting", [["buyer_noi", noiA, `The buyer's own underwriting has year-one net operating income of ${usd(noiA)}, a going-in capitalization rate of ${((noiA / A.purchasePrice) * 100).toFixed(2)}%.`]]]] });
  doc({ name: "airport-flex-site-plan", list: "acquisition", type: "site_plan", n: 1, heading: "Site and Floor Plan Summary", sub: sub("Building and site dimensions"), title: `${A.propertyName} site and floor plans`,
    sections: [["Building", [["footprint_sf", bA.footprintSF, `The building footprint is ${num(bA.footprintSF)} square feet on ${bA.landAcres} acres.`], ["clear_height", bA.clearHeightFt, `Clear height is ${bA.clearHeightFt} feet; column spacing is ${bA.columnSpacingW} by ${bA.columnSpacingD} feet.`], ["doors", `${bA.dockDoors} dock, ${bA.driveInDoors} drive-in`, `There are ${bA.dockDoors} dock doors and ${bA.driveInDoors} drive-in doors.`]]],
      ["Site", [["truck_court", bA.truckCourtFt, `The truck court is ${bA.truckCourtFt} feet deep with ${bA.trailerStalls} trailer stalls.`]]]],
    table: tbl(["Unit", "SF"], (A.units ?? []).map((u) => [u.name, num(u.squareFeet)])) });
  doc({ name: "airport-flex-zoning-report", list: "acquisition", type: "zoning", n: 1, heading: "Zoning Report", sub: sub("Fictional Zoning Advisors"), title: `${A.propertyName} zoning report`, link: { researchId: "srs-1-zoning" },
    sections: [["Zoning", [["zoning", sA.zoning, `The property is zoned ${sA.zoning}.`], ["by_right", sA.industrialByRight, `Industrial use is permitted by right: ${sA.industrialByRight}.`]]],
      ["Surroundings", [["residential_adjacency", sA.residentialAdjacency, `Residential adjacency: ${sA.residentialAdjacency}.`], ["truck_restrictions", sA.truckRestrictions, `Truck restrictions on the access route: ${sA.truckRestrictions}.`]]]] });
  doc({ name: "airport-flex-lender-appraisal", list: "acquisition", type: "lender_appraisal", n: 1, heading: "Appraisal for the Lender", sub: sub(`Prepared for ${A.lenderName}`), title: `${A.propertyName} lender appraisal`,
    sections: [["Value", [["as_is_value", A.purchasePrice, `The as-is market value of ${A.propertyName} as of ${long(addDays(A.acquisitionDate, -30))} is ${usd(A.purchasePrice)}, equal to the contract price.`], ["client", A.lenderName, `This appraisal was prepared for ${A.lenderName} for loan underwriting.`]]],
      ["Loan", [["loan_to_value", `${((loanA / A.purchasePrice) * 100).toFixed(1)}%`, `A loan of ${usd(loanA)} is ${((loanA / A.purchasePrice) * 100).toFixed(1)}% of that value.`]]]] });
  doc({ name: "airport-flex-ic-presentation", list: "acquisition", type: "ic_presentation", n: 1, heading: "Investment Committee Presentation", sub: sub("Summary slides"), title: `${A.propertyName} IC presentation`,
    sections: [["The investment", [["price", A.purchasePrice, `Purchase price ${usd(A.purchasePrice)}; total cost ${usd(A.purchasePrice + closingA + (A.capexBudget ?? 0))}.`], ["loan", loanA, `Loan ${usd(loanA)}; equity ${usd(equityA)}.`]]],
      ["Returns", [["noi1", noiA, `Year-one net operating income ${usd(noiA)}.`], ["irr", `${rA.returns.irr.toFixed(1)}%`, `Projected return ${rA.returns.irr.toFixed(1)}% and ${rA.returns.equityMultiple.toFixed(2)}x over a ${A.holdPeriodYears}-year hold, at an exit capitalization rate of ${A.exitCapRatePct}%.`]]]] });
  doc({ name: "airport-flex-loan-term-sheet", list: "acquisition", type: "loan_term_sheet", n: 1, heading: "Loan Term Sheet", sub: sub(A.lenderName), title: `${A.propertyName} loan term sheet`,
    sections: [["Loan", [["lender", A.lenderName, `${A.lenderName} proposes a first mortgage loan to ${co(1)}.`], ["amount", loanA, `Loan amount: ${usd(loanA)}.`], ["spread", `${A.spreadPct}%`, `Interest: one-month Term SOFR plus ${A.spreadPct}%.`]]],
      ["Term", [["term_years", A.loanTermYears, `Initial term: ${A.loanTermYears} years, with ${A.extensionCount} extension option${A.extensionCount === 1 ? "" : "s"} of ${A.extensionTermYears} year each.`], ["dscr_min", A.loanCovenants?.dscrMin, `Minimum debt service coverage ratio: ${A.loanCovenants?.dscrMin}x.`]]]] });
  doc({ name: "airport-flex-deed-title", list: "acquisition", type: "deed_title", n: 1, heading: "Deed and Owner's Title Policy", sub: sub("Recorded at closing"), title: `${A.propertyName} deed and title policy`,
    sections: [["Deed", [["grantor", seller, `By special warranty deed dated ${long(A.acquisitionDate)}, ${seller} conveyed ${A.propertyName}, ${where(A)}, to ${co(1)}.`], ["grantee", co(1), `The grantee is ${co(1)}.`]]],
      ["Title policy", [["policy_amount", A.purchasePrice, `The owner's policy of title insurance is in the amount of ${usd(A.purchasePrice)}.`], ["policy_date", A.acquisitionDate, `The policy is dated ${long(A.acquisitionDate)}.`]]]] });
}

// 11–13. Sale documents on Harbor Light Industrial's sale in progress (Dispositions).
{
  const sale = (H.dispositions ?? []).find((x) => x.startedFrom === "Sample sale (fictional)"), bov = sale.bovs[0];
  const rH = underwrite(H), noiH = Math.round(rH.annualCashFlows[0].noi), sub = (s) => `${H.propertyName} · ${s}`;
  doc({ name: "harbor-light-listing-agreement", list: "disposition", type: "listing_agreement", n: 3, heading: "Exclusive Listing Agreement", sub: sub(bov.broker), title: `${H.propertyName} listing agreement`,
    sections: [["Parties", [["broker", bov.broker, `${co(3)} ("Owner") engages ${bov.broker} ("Broker") as its exclusive broker for the sale of ${H.propertyName}.`]]],
      ["Terms", [["list_price", sale.targetPrice, `The list price is ${usd(sale.targetPrice)}.`], ["fee_pct", bov.feePct, `Broker's fee is ${bov.feePct.toFixed(2)}% of the sale price, earned at closing.`], ["term_months", 6, "The term of this Agreement is 6 months."], ["exclusions", "None", "No buyer is excluded from this Agreement."]]]] });
  doc({ name: "harbor-light-offering-memo", list: "disposition", type: "marketing", n: 3, heading: "Offering Memorandum", sub: sub("Offered for sale"), title: `${H.propertyName} offering memorandum`,
    sections: [["The offering", [["list_price", sale.targetPrice, `${H.propertyName} is offered at ${usd(sale.targetPrice)}.`], ["broker", bov.broker, `Offers are to be sent to ${bov.broker}.`]]],
      ["The property", [["square_feet", H.squareFootage, `The property is ${num(H.squareFootage)} rentable square feet in ${H.unitCount} units at ${where(H)}.`], ["occupancy", `${occupied(H).length} of ${H.unitCount} units`, `${occupied(H).length} of the ${H.unitCount} units are leased.`], ["noi", noiH, `Year-one net operating income is ${usd(noiH)}.`]]]] });
  const t = leaseH.tenant, iso = "2026-11-16", row = rentOn(leaseH, iso), fd = leaseH.fund;
  doc({ name: `harbor-light-sale-estoppel`, list: "disposition", type: "estoppel", n: 3, heading: `Tenant Estoppel Certificate – ${t}`, sub: sub("Delivered for the sale"), title: `${t} estoppel (sale)`, app: { lease_tenant: t },
    sections: [["Certification", [["tenant", t, `The undersigned, ${t} (Tenant), certifies to ${fd.landlord} and any buyer of the property as of ${long(iso)} as follows.`], ["premises", leaseH.suite, `Tenant leases ${leaseH.suite} at ${H.propertyName} containing ${num(leaseH.rsf)} rentable square feet.`], ["lease_date", long(fd.lease_date), `The Lease is dated ${long(fd.lease_date)} and has been amended once, by the ${leaseH.amendment}.`], ["commencement_date", long(leaseH.commencement), `The term commenced on ${long(leaseH.commencement)}.`], ["expiration_date", long(leaseH.expiration), `The term expires on ${long(leaseH.expiration)}.`]]],
      ["Rent and deposit", [["monthly_rent", usd2(row.monthly), `Current monthly base rent is ${usd2(row.monthly)}.`], ["rent_paid_through", "November 30, 2026", "Rent has been paid through November 30, 2026."], ["security_deposit", usd2(fd.deposit), `Tenant has deposited a security deposit of ${usd2(fd.deposit)} with Landlord.`], ["prepaid_rent", "$0", "No rent has been paid more than one month in advance; prepaid rent is $0."]]],
      ["Defaults and claims", [["tenant_defaults", "None", "Tenant is not in default under the Lease. There are no tenant defaults."], ["landlord_defaults", "None", "Landlord is not in default under the Lease, and Tenant has no claim, credit or offset against rent."]]]] });
  docs.at(-1).abstract.fields.splice(1, 0, { key: "estoppel_date", value: long(iso), status: "found", clause: "1.1", evidence: [{ quote: docs.at(-1).abstract.fields[0].evidence[0].quote, page: 1 }] }, { key: "amendments", value: leaseH.amendment, status: "found", clause: "1.3", evidence: [{ quote: `The Lease is dated ${long(fd.lease_date)} and has been amended once, by the ${leaseH.amendment}.`, page: 1 }] });
}

// 14–19. Leasing documents on the fixed sample prospect and the rent comps (Active Leasing).
{
  const p = (A.leasing?.prospects ?? []).find((x) => x.id === SAMPLE_DOC_PROSPECT_ID), u = A.units.find((x) => x.id === p.unitId), sub = (s) => `${A.propertyName} Unit ${u.name} · ${s}`;
  const ne = netEffective(p), annual = Math.round(p.proposedRentPSF * p.sf), link = { prospectId: p.id };
  const terms = (who) => [["tenant", p.tenant, `${who} ${p.tenant} for Unit ${u.name} at ${A.propertyName}, ${num(p.sf)} rentable square feet.`], ["rent_psf", p.proposedRentPSF, `Base rent: ${usd2(p.proposedRentPSF)} per square foot per year, ${usd(annual)} a year.`], ["term_months", p.termMonths, `Term: ${p.termMonths} months from ${long(p.expectedStart)}.`], ["free_months", p.freeMonths, `Free rent: ${p.freeMonths} months.`], ["ti_psf", p.tiPSF, `Tenant improvement allowance: ${usd2(p.tiPSF)} per square foot.`], ["escalation_pct", p.escalationPct, `Annual increase: ${p.escalationPct}%.`]];
  doc({ name: "airport-flex-leasing-proposal", list: "leasing", type: "proposal", n: 1, link, heading: "Lease Proposal", sub: sub(p.tenant), title: `${p.tenant} lease proposal`,
    sections: [["Proposal", [["asking_rent_psf", p.askingRentPSF, `The asking rent for the unit is ${usd2(p.askingRentPSF)} per square foot per year.`], ...terms("Landlord proposes the following terms to")]]] });
  doc({ name: "airport-flex-leasing-loi", list: "leasing", type: "loi", n: 1, link, heading: "Letter of Intent to Lease", sub: sub(p.tenant), title: `${p.tenant} letter of intent`,
    sections: [["Terms", terms("This non-binding letter sets out the terms agreed with")], ["Broker", [["broker", p.broker, `${p.tenant} is represented by ${p.broker}.`]]]] });
  doc({ name: "airport-flex-lease-draft", list: "leasing", type: "lease_draft", n: 1, link, heading: "Lease Agreement – Draft", sub: sub(`${p.tenant} · draft for signature`), title: `${p.tenant} lease draft`,
    sections: [["Basic lease terms", [["landlord", co(1), `Landlord: ${co(1)}.`], ...terms("This draft Lease is between Landlord and")]], ["Status", ["This draft has been sent to Tenant for signature and is not yet signed."]]] });
  doc({ name: "airport-flex-lease-approval-memo", list: "leasing", type: "approval_memo", n: 1, link, heading: "Lease Approval Memo", sub: sub(p.tenant), title: `${p.tenant} lease approval memo`,
    sections: [["The lease", terms("Approval is requested for a lease to")], ["Economics", [["net_effective_psf", Math.round(ne * 100) / 100, `Net effective rent is ${usd2(ne)} per square foot per year after free rent and the allowance.`], ["vs_asking", `${(((p.proposedRentPSF / p.askingRentPSF) - 1) * 100).toFixed(1)}%`, `The base rent is ${(((p.proposedRentPSF / p.askingRentPSF) - 1) * 100).toFixed(1)}% against the asking rent of ${usd2(p.askingRentPSF)}.`]]],
      ["Approval", [["requested_by", A.leasingManager, `Requested by ${A.leasingManager}, leasing manager.`]]]] });
  doc({ name: "airport-flex-leasing-broker-report", list: "leasing", type: "broker_report", n: 1, link, heading: "Leasing Broker Report", sub: sub(p.broker), title: `${p.tenant} broker report`,
    sections: [["Prospect", [["tenant", p.tenant, `${p.broker} reports on ${p.tenant}, a prospect for Unit ${u.name} at ${A.propertyName}.`], ["stage", "Lease out", "The lease draft is out for signature."], ["next_step", p.nextStep, `Next step: ${p.nextStep}, by ${long(p.nextDate)}.`]]]] });
  const comps = A.leasing?.comps ?? [], rs = rentCompStats(comps);
  doc({ name: "airport-flex-rent-comp-report", list: "leasing", type: "comps", n: 1, link: { target: "comps", researchId: "srs-1-rent", compIds: comps.map((c) => c.id), compRents: comps.map((c) => c.rentPSF) }, heading: "Rent Comparable Report", sub: `${A.propertyName} · ${rs.count} comparable leases`, title: `${A.propertyName} rent comp report`,
    sections: [["Survey", [["count", rs.count, `This report covers ${rs.count} comparable leases near ${A.propertyName}.`], ["average_psf", rs.avg, `The average rent is ${usd2(rs.avg)} per square foot per year and the median is ${usd2(rs.median)}.`], ["range", `${usd2(rs.low)} to ${usd2(rs.high)}`, `Rents range from ${usd2(rs.low)} to ${usd2(rs.high)} per square foot per year.`]]]],
    table: tbl(["Address", "Tenant", "SF", "Rent / SF / yr", "Term (months)", "Free (months)", "TI / SF"], comps.map((c) => [c.address, c.tenant, num(c.sf), usd2(c.rentPSF), c.termMonths, c.freeMonths, usd2(c.tiPSF)])) });
}

// 20–23. Property Management documents for the sections that had none.
{
  const pm = A.propertyMgmt, parcel = pm.parcels[0], f1 = pm.items.find((x) => x.system === "Roof");
  doc({ name: "airport-flex-assessment-notice", list: "pm", type: "parcels", n: 1, heading: "Notice of Assessed Value", sub: `${A.propertyName} · Tax year ${parcel.assessmentYear}`, title: `${A.propertyName} ${parcel.assessmentYear} assessment notice`,
    sections: [["Parcel", [["parcel", parcel.apn, `Parcel number: ${parcel.apn}.`], ["owner", co(1), `Assessed owner: ${co(1)}.`]]], ["Assessment", [["assessed_value", parcel.assessedValue, `Assessed value for tax year ${parcel.assessmentYear}: ${usd(parcel.assessedValue)}.`], ["tax_rate_pct", parcel.taxRatePct, `Combined tax rate: ${parcel.taxRatePct}%.`]]]] });
  if (f1) doc({ name: "airport-flex-roof-repair-proposal", list: "pm", type: "items", n: 1, heading: "Roof Repair Proposal", sub: `${A.propertyName} · Example Roofing Contractors`, title: `${A.propertyName} roof repair proposal`,
    sections: [["Finding", [["system", f1.system, `The property condition report of ${long(f1.reportDate)} found: ${f1.finding}.`]]], ["Proposal", [["cost", f1.cost, `Example Roofing Contractors will carry out the repairs for ${usd(f1.cost)}.`], ["urgency", f1.urgency, `Recommended timing: ${f1.urgency.toLowerCase()}.`]]]] });
  const mp = M.propertyMgmt, ap = mp.appeals[0];
  doc({ name: "mill-creek-tax-appeal", list: "pm", type: "appeals", n: 6, heading: "Property Tax Appeal", sub: `${M.propertyName} · Tax year ${ap.year}`, title: `${M.propertyName} ${ap.year} tax appeal`,
    sections: [["Appeal", [["parcel", ap.parcel, `${co(6)} appeals the assessed value of parcel ${ap.parcel} for tax year ${ap.year}.`], ["filed_date", ap.filedDate, `The appeal was filed on ${long(ap.filedDate)}.`], ["hearing_date", ap.hearingDate, `The hearing is set for ${long(ap.hearingDate)}.`], ["consultant", ap.consultant, `The owner is represented by ${ap.consultant}.`]]],
      ["Value under appeal", [["assessed_value", mp.parcels[0].assessedValue, `The assessed value under appeal is ${usd(mp.parcels[0].assessedValue)}.`]]]] });
  const hp = H.propertyMgmt, cl = hp.claims[0];
  doc({ name: "harbor-light-claim-closing", list: "pm", type: "claims", n: 3, heading: "Claim Closing Letter", sub: `${H.propertyName} · ${hp.policies[0].carrier}`, title: `${H.propertyName} insurance claim closing letter`,
    sections: [["Claim", [["policy", cl.policy, `This letter closes the claim under policy ${cl.policy} for the loss of ${long(cl.date)}.`], ["cause", cl.cause, `Cause of loss: ${cl.cause}.`]]], ["Settlement", [["amount", cl.amount, `The adjusted loss is ${usd(cl.amount)}.`], ["recovery", cl.recovery, `After the ${usd(hp.policies[0].deductible)} deductible, the insurer has paid ${usd(cl.recovery)}.`], ["status", cl.status, "The claim is closed."]]]] });
}

(async () => {
  const noPdf = process.argv.includes("--no-pdf"), check = process.argv.includes("--check");
  const index = docs.map((d) => ({ name: d.name, list: d.list, type: d.type, asset: d.asset, dealId: d.dealId, file: `${d.name}.pdf`, title: d.title, link: d.link }));
  if (check) {
    const stale = docs.filter((d) => { const p = path.join(dir, "html", `${d.name}.html`); return !fs.existsSync(p) || fs.readFileSync(p, "utf8") !== d.html; }).map((d) => d.name);
    const idx = fs.existsSync(path.join(dir, "index.json")) ? fs.readFileSync(path.join(dir, "index.json"), "utf8") : "";
    if (stale.length || idx !== JSON.stringify(index, null, 1)) { console.error(`docs/sample-deal-docs/more is stale (${stale.join(", ") || "index"}): run node scripts/sample-deal-docs/more_docs.cjs`); process.exit(1); }
    console.log(`${docs.length} documents are current`); return;
  }
  for (const d of docs) for (const fl of d.abstract.fields) for (const e of fl.evidence) if (!d.html.includes(e.quote)) throw new Error(`${d.name}: the quote for ${fl.key} is not in the document`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "html"), { recursive: true });
  fs.mkdirSync(path.join(dir, "abstracts"), { recursive: true });
  let b = null, p = null;
  if (!noPdf) { const { chromium } = require("playwright"); b = await chromium.launch(); p = await b.newPage(); }
  for (const d of docs) {
    const hp = path.join(dir, "html", `${d.name}.html`);
    fs.writeFileSync(hp, d.html);
    fs.writeFileSync(path.join(dir, "abstracts", `${d.name}.json`), JSON.stringify(d.abstract, null, 1));
    if (p) {
      await p.goto("file://" + hp);
      await p.pdf({ path: path.join(dir, `${d.name}.pdf`), format: "Letter", printBackground: true, displayHeaderFooter: true,
        headerTemplate: '<div style="font:7px Arial;color:#b42318;width:100%;text-align:center">SAMPLE – FICTIONAL – FOR TESTING ONLY</div>',
        footerTemplate: '<div style="font:7px Arial;color:#666;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · Sample document</div>',
        margin: { top: "0.8in", bottom: "0.8in", left: "0.9in", right: "0.9in" } });
    }
  }
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index, null, 1));
  console.log(`${docs.length} documents: ${[...new Set(docs.map((d) => d.list))].map((l) => `${docs.filter((d) => d.list === l).length} ${l}`).join(", ")}`);
  if (b) await b.close();
})();
