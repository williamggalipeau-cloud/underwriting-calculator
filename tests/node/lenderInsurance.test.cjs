// Phase L leftover (11/24): the lender's insurance requirements (loan
// agreement abstract) vs. the owner's insurance certificate. Fictional values.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const D = j(R + "/lib/dealDocApply.js");
const T = j(R + "/lib/dealDocTypes.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const f = (k, v) => ({ key: k, value: v, status: "found" });
ok(["ins_property_min", "ins_max_deductible", "ins_cgl_occurrence", "ins_umbrella", "ins_loss_of_rents_months", "ins_flood", "ins_min_rating", "ins_lender_named"].every((k) => T.fieldsOf("loan").some(([x]) => x === k)), "the loan abstract asks for the insurance terms");
const loan = { fields: [f("lender", "Example Bank, N.A."), f("ins_property_min", "$10,000,000"), f("ins_max_deductible", "$50,000"), f("ins_cgl_occurrence", "$1,000,000"), f("ins_cgl_aggregate", "$2,000,000"), f("ins_umbrella", "$5,000,000"), f("ins_loss_of_rents_months", "12 months"), f("ins_flood", "Required (zone AE)"), f("ins_min_rating", "A- VIII"), f("ins_lender_named", "Mortgagee and loss payee")] };
const bad = { fields: [f("holder", "Other Lender LLC"), f("insurer_rating", "B++ IX")], policies: [{ coverage: "property", limit: 8000000, deductible: 100000 }, { coverage: "cgl", per_occurrence: 1000000, aggregate: 2000000 }, { coverage: "umbrella", limit: 5000000 }] };
const g = D.lenderInsuranceGaps(bad, loan);
const has = (re, sev) => g.some((x) => re.test(x.text) && (!sev || x.severity === sev));
ok(has(/Property limit \$8,000,000 is below the loan's \$10,000,000/, "high"), "property limit below the loan's");
ok(has(/property deductible \$100,000 is above the loan's maximum \$50,000/, "medium"), "deductible over the loan's maximum");
ok(has(/No loss of rents cover.*12 months/, "high") && has(/No flood policy/, "high"), "missing loss of rents and flood");
ok(has(/Insurer rated B\+\+, below the loan's minimum A-/, "medium"), "insurer rating below the minimum");
ok(has(/Example Bank, N\.A\. not shown as certificate holder/, "medium"), "lender not the certificate holder");
ok(!has(/general liability/) && !has(/umbrella/), "liability and umbrella that meet the loan: no gap");
const good = { fields: [f("holder", "Example Bank, N.A., its successors and assigns"), f("insurer_rating", "A+ XV")], policies: [{ coverage: "property", limit: 12000000, deductible: 25000 }, { coverage: "cgl", per_occurrence: 1000000, aggregate: 2000000 }, { coverage: "umbrella", limit: 5000000 }, { coverage: "loss_of_rents", limit: 1500000 }, { coverage: "flood", limit: 500000 }] };
ok(D.lenderInsuranceGaps(good, loan).length === 0, "a certificate that meets every requirement: no gaps");
ok(D.lenderInsuranceGaps(bad, { fields: [f("lender", "X")] }).length === 0 && D.loanInsuranceRequirements({ fields: [f("lender", "X")] }) === null, "a loan with no insurance terms read in: nothing to check");
ok(D.lenderInsuranceGaps(good, { fields: [f("lender", "X"), f("ins_flood", "Not required")] }).length === 0, "flood not required");
console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
