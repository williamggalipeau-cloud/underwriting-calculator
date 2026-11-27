// The app's tabs, by area (moved out of app/page.jsx in 1.1.22 so the sample
// data coverage test can list them: tests/node/coverage1122.test.cjs).

// Tab order. The Change Log opens from the header button (id "changes").
// Tab groups (user, 11/22–23; docs/DEAL_DOCUMENTS_PLAN.md "App name and
// layout"). A group shows only when it has tabs: Dispositions (phase P),
// Property Management (T) and Market (U) join later.
export const TAB_GROUPS = [
  { label: "Acquisitions", tabs: [
    { id: "pipeline",    label: "Pipeline" },
    { id: "quick",       label: "Underwriter" },
    { id: "impact",      label: "Portfolio Impact" },
    { id: "research",    label: "Comps" },
    { id: "acqdocs",     label: "Acquisition Documents" },
  ] },
  { label: "Dispositions", tabs: [
    { id: "dispcand",    label: "Disposition Candidates" },
    { id: "sellhold",    label: "Sell/Hold Analysis" },
    { id: "forsale",     label: "Assets for Sale" },
    { id: "offers",      label: "Offers" },
    { id: "trackrecord", label: "Track Record" },
    { id: "dispdocs",    label: "Disposition Documents" },
  ] },
  { label: "Asset Management", tabs: [
    { id: "assets",      label: "Asset Summary" },
    { id: "plan",        label: "Asset Business Plan" },
    { id: "units",       label: "Rent Roll" },
    { id: "leases",      label: "Leases" },
    { id: "credit",      label: "Tenant Credit" }, // 1.1.8 (user, 11/26)
    { id: "leasing",     label: "Active Leasing" },
    { id: "valuations",  label: "Valuation" },
    { id: "debt",        label: "Debt" },
    { id: "cashflow",    label: "Cash Flow" },
    { id: "returns",     label: "Asset Return" },
    { id: "sensitivity", label: "Return Sensitivity" },
  ] },
  { label: "Property Management", tabs: [
    { id: "taxes",       label: "Property Taxes" },
    { id: "insurance",   label: "Insurance" },
    { id: "condition",   label: "Property Condition" },
    { id: "contracts",   label: "Service Contracts" },
  ] },
  { label: "Portfolio Management", tabs: [
    { id: "fundsummary", label: "Portfolio Summary" },
    { id: "fund",        label: "Portfolio Return" },
    { id: "funddebt",    label: "Portfolio Debt" },
    { id: "distributions", label: "Distribution Analysis" },
    { id: "stress",      label: "Stress Testing" },
    { id: "benchmark",   label: "Benchmarking" },
  ] },
  // Finance (user, 11/24): the firm's own economics.
  { label: "Finance", tabs: [
    { id: "gpecon",      label: "GP Economics" },
    { id: "sponsorecon", label: "Sponsor Economics" },
    { id: "firmecon",    label: "Firm Economics" }, // 1.1.9 (user, 11/26)
    { id: "gppartners",  label: "GP Partners" }, // 1.1.10 (user, 11/26)
  ] },
  { label: "Research", tabs: [
    { id: "market",      label: "Market Data" },
  ] },
  { label: "Library", tabs: [
    { id: "documents",   label: "Documents" },
    { id: "reports",     label: "Reports" },
  ] },
];
export const TABS = TAB_GROUPS.flatMap((g) => g.tabs);

export const TAB_COUNT_TITLES = { pipeline: "Active pipeline deals", forsale: "Sales in progress", offers: "Offers on sales in progress" };

// Tabs that show one deal: they get the Asset dropdown.
export const DEAL_TABS = new Set(["quick", "units", "leases", "credit", "leasing", "taxes", "insurance", "condition", "contracts", "plan", "debt", "cashflow", "returns", "sensitivity", "research", "sellhold"]);
