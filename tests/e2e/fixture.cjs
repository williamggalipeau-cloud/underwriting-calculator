// A fictional workspace for the browser tests, built from the app's own sample
// portfolio and default fund terms. Never a copy of a real workspace.
const path = require("path");
const os = require("os");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const sp = j(R + "/lib/samplePortfolio.js");
const { TEST_INPUTS, generateTestScenario } = j(R + "/lib/testScenario.js");
const { DEFAULT_FUND_TERMS } = j(R + "/lib/fundTerms.js");

const FUND = sp.SAMPLE_FUND_NAME; // "Model Fund I"
const SAVED_IDS = ["test-fx-eastside", "test-fx-northgate", "test-fx-riverside"];

// workspace data in the shape the app saves:
// - "test-active": the Small Bay Industrial test deal with a 20-unit rent roll;
// - "deal-1": a second open deal without a rent roll;
// - sample-deal-1…9: the nine sample assets (rent rolls cleared, as a fresh
//   workspace has them before the app's sample migrations run);
// - one fund with default terms and no capital activity.
function workspaceData() {
  const testRoll = generateTestScenario().savedDeals[0].inputs.units.map((u, i) => ({ ...u, id: `fx-unit-${i + 1}` }));
  const sample = sp.buildSampleDeals(TEST_INPUTS).map((d) => ({ id: d.id, inputs: { ...d.inputs, units: [], fundName: FUND } }));
  return {
    v: 1,
    savedAt: "2026-11-22T00:00:00.000Z",
    deals: [
      { id: "test-active", inputs: { ...TEST_INPUTS, fundName: FUND, units: testRoll } },
      { id: "deal-1", inputs: { ...TEST_INPUTS, propertyName: "Light Industrial (30k SF)", squareFootage: 30000, acquisitionDate: "2026-02-13", fundName: FUND, units: [] } },
      ...sample,
    ],
    // Three saved fund snapshots (Eastside, Northgate, Riverside), fixed ids.
    savedDeals: generateTestScenario().savedDeals.map((d, i) => ({ ...d, id: SAVED_IDS[i] })),
    funds: { [FUND]: { ...DEFAULT_FUND_TERMS, name: FUND, finalClose: "2025-12-31", targetEquity: sp.SAMPLE_FUND_COMMITMENTS, capitalActivity: [] } },
    baseCurve: undefined,
    anchorToLive: true,
    activeDealId: "sample-deal-1",
    comps: { comps: [], marketGrowthPct: 3, spreadBp: 25, filters: { sinceISO: "", minSF: "", maxSF: "", type: "" } },
    valuations: {},
    auditLog: [],
  };
}

// Where tests write screenshots and downloads.
const outDir = () => {
  const d = process.env.TEST_OUT || path.join(os.tmpdir(), "baywise-e2e");
  require("fs").mkdirSync(d, { recursive: true });
  return d;
};
const BASE_URL = process.env.BASE_URL || "http://localhost:8765/underwriting-calculator/";

module.exports = { workspaceData, outDir, BASE_URL, R, SAVED_IDS };
