// Writes scripts/sample-deal-docs/fund.json: Model Fund I as the app builds
// it (lib/sampleFund.js), for the sample document generators. Every figure
// the documents share with the app is read from this file, never typed into
// a generator (AGENTS.md: everything ties out).
//   node scripts/sample-deal-docs/export_fund.cjs          writes the file
//   node scripts/sample-deal-docs/export_fund.cjs --check  exits 1 if it is stale
// The date is fixed so the file doesn't change from day to day.
const fs = require("fs");
const path = require("path");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const { buildSampleFund, samplePropertyCompany } = j(R + "/lib/sampleFund.js");
const { underwrite } = j(R + "/lib/calculations.js");
const SP = j(R + "/lib/samplePortfolio.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");

const AS_OF = "2026-11-27";
const r2 = (x) => Math.round(x * 100) / 100;
function fundJson() {
  // docTerms: false = the fund before the sample documents' own terms are
  // added, so the generators never read back what they wrote.
  const f = buildSampleFund({ todayISO: AS_OF, docTerms: false });
  const terms = { ...DEFAULT_FUND_TERMS, ...SP.SAMPLE_FUND_FEE_TERMS, name: SP.SAMPLE_FUND_NAME, targetEquity: SP.SAMPLE_FUND_COMMITMENTS };
  const assets = f.deals.map((d) => {
    const a = d.inputs, r = underwrite(a), cf = r.annualCashFlows[0];
    const closing = Object.values(a.closingCosts ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
    return {
      id: d.id, name: a.propertyName, address: a.address, city: a.city, state: a.state, zip: a.zip,
      sf: a.squareFootage, unitCount: a.unitCount, price: a.purchasePrice, acquisitionDate: a.acquisitionDate,
      closingCosts: closing, capex: a.capexBudget ?? 0, holdYears: a.holdPeriodYears, exitCapPct: a.exitCapRatePct, noiYear1Input: a.noiYear1,
      assetManager: a.assetManager, leasingManager: a.leasingManager,
      expensesPSF: { realEstateTax: a.realEstateTaxPSF, insurance: a.insurancePSF, utilities: a.utilitiesPSF, maintenance: a.maintenancePSF, janitorial: a.janitorialPSF, otherIncome: a.otherIncomePSF },
      managementFeePct: a.managementFeePct,
      loan: {
        lender: a.lenderName, amount: Math.round(r.debt.loanAmount), spreadPct: a.spreadPct, termYears: a.loanTermYears, extensionCount: a.extensionCount, extensionTermYears: a.extensionTermYears,
        extensionFee: a.extensionFeeAmount, extensionNoticeDays: a.extensionNoticeDays, ioYears: a.ioPeriodYears, amortizationYears: a.amortizationYears, dscrMin: a.loanCovenants?.dscrMin,
        capProvider: a.capProviders?.[1] ?? "", capStrikePct: r2((a.capStrikeRatesByYear?.[0] ?? a.capStrikeRatePct) - (Number(a.spreadPct) || 0)), /* the strike on SOFR: the model holds the all-in rate */ capPremium: a.capPremiumAmount, capTermYears: a.capTermYears,
      },
      model: {
        equity: Math.round(r.debt.equityRequired), noi1: Math.round(cf.noi), goingInCapPct: r2((cf.noi / a.purchasePrice) * 100), irrPct: Math.round(r.returns.irr * 10) / 10,
        multiple: r2(r.returns.equityMultiple), coc1Pct: Math.round(r.returns.yearOneCashOnCash * 10) / 10, totalCost: a.purchasePrice + closing + (a.capexBudget ?? 0),
      },
      propertyCompany: samplePropertyCompany(Number(d.id.replace("sample-deal-", "")) - 1),
      building: a.building ?? {}, site: a.site ?? {}, sndaRule: a.loanTerms?.sndaRule ?? "none", /* 1.1.17 */
      marks: Object.fromEntries(Object.entries(f.valuations[d.id] ?? {}).map(([q, m]) => [q, { value: m.value, capRate: m.capRate, source: m.source }])),
      units: (a.units ?? []).map((u) => ({
        name: u.name, tenant: u.tenantName ?? "", sf: u.squareFeet, status: u.leaseStatus, leaseType: u.leaseType, rentPSF: u.currentRentPSF, leaseEnd: u.leaseEnd ?? "",
        escalationPct: u.annualEscalationPct, business: u.businessDescription ?? "", sic: u.sicCode ?? "", securityDeposit: u.securityDeposit ?? null, snda: u.snda ?? null,
      })),
    };
  });
  return { asOf: AS_OF, fund: { name: SP.SAMPLE_FUND_NAME, commitments: SP.SAMPLE_FUND_COMMITMENTS, gpCommitPct: terms.gpCommitPct ?? null, mgmtFeePct: terms.mgmtFeePct, prefPct: terms.preferredReturnPct ?? terms.prefPct ?? null, tiers: terms.tiers, tierMethod: terms.tierMethod }, assets };
}
const out = JSON.stringify(fundJson(), null, 1) + "\n";
const file = path.join(__dirname, "fund.json");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (cur !== out) { console.error("fund.json is stale: run node scripts/sample-deal-docs/export_fund.cjs and regenerate the sample documents"); process.exit(1); }
  console.log("fund.json is current");
} else { fs.writeFileSync(file, out); console.log("wrote", file, out.length, "bytes"); }
module.exports = { fundJson };
