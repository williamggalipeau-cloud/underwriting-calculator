// Mock comps for the sample assets (lib/sampleComps.js, user 11/24): six
// fictional sales comps and six rent comps per Model Fund I asset, in its
// city, sized and priced near it, recent, deterministic, added only where the
// asset has none. Loaded with the sample portfolio.
const R = require("path").resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const C = j(R + "/lib/sampleComps.js");
const sp = j(R + "/lib/samplePortfolio.js");
const { compStats } = j(R + "/lib/comps.js");
const { rentCompStats } = j(R + "/lib/leasing.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

const today = "2026-11-24";
const deals = sp.buildSampleDeals(TEST_INPUTS);
ok(deals.length === 9 && deals.every((d) => d.inputs.salesComps?.comps?.length === 6 && d.inputs.leasing?.comps?.length === 6), "every sample asset loads with 6 sales comps and 6 rent comps");
const af = deals.find((d) => d.inputs.propertyName === "Airport Flex Park");
const s = C.sampleSalesComps(af.inputs, today);
ok(s.every((c) => c.city === "Las Vegas" && c.state === "NV" && c.example && /\(fictional\)/.test(c.name)), "sales comps: same city, marked as examples and fictional");
const psf = af.inputs.purchasePrice / af.inputs.squareFootage;
ok(s.every((c) => c.pricePSF > psf * 0.85 && c.pricePSF < psf * 1.15), `priced near the asset's $${psf.toFixed(0)}/SF`);
ok(s.every((c) => c.sf >= af.inputs.squareFootage * 0.55 && c.sf <= af.inputs.squareFootage * 1.55), "sized near the asset");
ok(s.every((c) => c.capRate >= 4.5 && c.capRate <= 8.5) && compStats(s, {}).used === 6, "cap rates in range; the statistics use all six");
const ages = s.map((c) => (Date.parse(today) - Date.parse(c.saleDate)) / 86400000);
ok(ages.every((d) => d > 0 && d <= 730), "sold within the last 24 months");
ok(JSON.stringify(C.sampleSalesComps(af.inputs, today)) === JSON.stringify(s), "deterministic");

const r = C.sampleRentComps(af.inputs, today);
const rent = af.inputs.rentPerSF;
ok(r.every((c) => c.city === "Las Vegas" && c.source === C.SAMPLE_COMP_SOURCE && c.leaseType === "NNN" && c.tenant), "rent comps: same city, fictional source, NNN, a tenant each");
ok(r.every((c) => c.rentPSF >= rent * 0.9 && c.rentPSF <= rent * 1.1), `rents near the asset's market rent ($${rent}/SF)`);
ok(r.every((c) => (Date.parse(today) - Date.parse(c.signDate)) / 86400000 <= 550) && rentCompStats(r).count === 6, "signed within about 18 months; statistics use all six");

const own = { ...af, inputs: { ...af.inputs, salesComps: { comps: [{ id: "mine" }] }, leasing: { prospects: [{ id: "p" }], comps: [{ id: "mine" }] } } };
ok(C.withSampleComps(own, today) === own, "an asset with comps of its own is left alone");
const bare = { ...af, inputs: { ...af.inputs, salesComps: undefined, leasing: { prospects: [{ id: "p" }], comps: [] } } };
const filled = C.withSampleComps(bare, today);
ok(filled.inputs.salesComps.comps.length === 6 && filled.inputs.leasing.comps.length === 6 && filled.inputs.leasing.prospects.length === 1, "an asset without comps gets them; its prospects are kept");
const other = { id: "x", inputs: { propertyName: "Some Real Asset", fundName: "Fund A" } };
ok(C.withSampleComps(other, today) === other, "real (non-sample) assets are never touched");

console.log(fail ? `${fail} FAILED` : "ALL PASS");
process.exitCode = fail ? 1 : 0;
