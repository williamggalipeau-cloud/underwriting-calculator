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
  // Sample deals start without the drawn photos and plan (phase L tests add them).
  const sample = sp.buildSampleDeals(TEST_INPUTS).map((d) => ({ id: d.id, inputs: { ...d.inputs, units: [], fundName: FUND, assetMedia: undefined, salesComps: undefined, leasing: undefined } }));
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

// Functions bar (11/24): one button per function area; a tab shows once its
// area is open. openTab(p, "Debt") opens the area holding the tab (each area
// button's title lists its tabs), then clicks the tab.
async function openArea(p, tabName) {
  const want = typeof tabName === "string" ? (t) => t === tabName : (t) => tabName.test(t);
  for (const b of await p.getByTestId("function-area").all()) {
    const title = (await b.getAttribute("title")) ?? "";
    const [, list = ""] = title.split(": ");
    if (list.split(", ").some(want)) {
      if ((await b.getAttribute("aria-expanded")) !== "true") { await b.click(); await p.waitForTimeout(150); }
      return title.split(": ")[0];
    }
  }
  return null;
}
async function openTab(p, tabName) {
  const area = await openArea(p, tabName);
  const g = area ? p.getByRole("group", { name: area }) : p;
  const re = typeof tabName === "string" ? new RegExp(`^${tabName.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(\\s*\\d+)?$`) : tabName;
  await g.getByRole("button", { name: re }).first().click();
}
module.exports.openArea = openArea;
module.exports.openTab = openTab;
// The function areas in order (the old tab-group headers).
module.exports.areas = async (p) => (await p.getByTestId("function-area").evaluateAll((els) => els.map((e) => (e.getAttribute("title") ?? "").split(": ")[0])));

// The fixtures hold deals in an older format that the app upgrades on load,
// which counts as an unsaved change. Save it so the leave prompt (user, 11/24)
// doesn't stop the test's first tab change. Real workspaces are already saved
// in the current format.
module.exports.saveLoadUpgrade = async (p) => {
  const btn = p.getByTestId("save-button");
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await p.waitForTimeout(800);
  }
};

// Document Library (user, 11/24): open the first row matching text (if its
// card isn't open yet) and return the card; filter the library by asset or
// portfolio ("" for all).
module.exports.docCard = async (main, text) => {
  const card = main.getByTestId("doc-card").filter({ hasText: text }).first();
  if (await card.count()) return card;
  await main.getByTestId("doc-row").filter({ hasText: text }).first().getByTestId("doc-open").click();
  await card.waitFor();
  return card;
};
module.exports.docAsset = async (main, name) => {
  await main.getByLabel("Filter asset").selectOption(name ? { label: name } : "");
  await main.page().waitForTimeout(300);
};
module.exports.docPortfolio = async (main, name) => {
  await main.getByLabel("Filter portfolio").selectOption(name || "");
  await main.page().waitForTimeout(300);
};
