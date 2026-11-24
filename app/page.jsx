"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { underwrite } from "@/lib/calculations";
import { generateTestScenario, REMOVED_TEST_ASSETS, TEST_ACQUISITION_DATES, TEST_PREVIOUS_HOLDS } from "@/lib/testScenario";
import DealInputsPanel from "@/components/DealInputs";
import DebtSizingPanel from "@/components/DebtSizing";
import ReturnsAnalysis from "@/components/ReturnsAnalysis";
import SensitivityTables from "@/components/SensitivityTables";
import AssetPicker from "@/components/AssetPicker";
import HomeView from "@/components/Home";
import Dispositions from "@/components/Dispositions";
import Leasing from "@/components/Leasing";
import FundDebt from "@/components/FundDebt";
import PropertyMgmt from "@/components/PropertyMgmt";
import MarketData from "@/components/MarketData";
import { importConstruction, parseInvoices, parseJobs } from "@/lib/construction";
import { SAMPLE_CONSTRUCTION_AS_OF, SAMPLE_CONSTRUCTION_INVOICES_CSV, SAMPLE_CONSTRUCTION_JOBS_CSV } from "@/lib/sampleConstruction";
import { ACTIVE_SALE_STAGES, makeSale } from "@/lib/dispositions";
import Leases from "@/components/Leases";
import Documents from "@/components/Documents";
import SellHold from "@/components/SellHold";
import { withLocation } from "@/lib/assetLocations";
import { MTM_MODEL, mtmIndex, toRentRollNOI, withMarkToMarket } from "@/lib/sampleRentRolls";
import { withSicCodes } from "@/lib/sicCodes";
import UnitRoll from "@/components/UnitRoll";
import FundAnalysis from "@/components/FundAnalysis";
import StressTest from "@/components/StressTest";
import QuickUnderwrite from "@/components/QuickUnderwrite";
import CashFlowAnalysis from "@/components/CashFlowAnalysis";
import { DEFAULT_COMPS_STATE } from "@/components/SalesComps";
import Research from "@/components/Research";
import GpEconomics from "@/components/GpEconomics";
import Benchmarking from "@/components/Benchmarking";
import FundNav from "@/components/FundNav";
import FundPlan from "@/components/FundPlan";
import DistributionAnalysis from "@/components/DistributionAnalysis";
import Reports from "@/components/Reports";
import AssetMedia from "@/components/AssetMedia";
import { FundUwTable } from "@/components/UwVsActual";
import { fundType } from "@/lib/fundTypes";
import Valuations from "@/components/Valuations";
import AssetSummary from "@/components/AssetSummary";
import { QUICK_DEFAULTS, capEngineFields, capSettingsFor, toMainInputs } from "@/lib/quickUnderwrite";
import { withSampleMedia } from "@/lib/sampleMedia";
import { EMPTY_PIPELINE, makePipelineDeal, toQuickInputs } from "@/lib/pipeline";
import Pipeline from "@/components/Pipeline";
import FundImpact from "@/components/FundImpact";
import FundSummary from "@/components/FundSummary";
import { entityDates } from "@/lib/fundSummary";
import ScreenerFundImpact, { ScreenerPicker } from "@/components/ScreenerFundImpact";
import { revertRoot, revertCheck, applyRevert, restoreAsOf, recentlyDeleted } from "@/lib/revert";
import { ALL_FUNDS, workingOnOptions, validWorkingOn, scopeDeals, scopeFunds, scopeOpenDeals, scopeLabel } from "@/lib/workingOn";
import { isPipeline } from "@/lib/fundImpact";
import { withRiskTestData } from "@/lib/sampleRiskData";
import { buildSampleDeals, currentSampleDate, currentSampleHold, sampleUnitCount, snapshotDeal, withSizingConstraints, SAMPLE_FUND_NAME, OLD_SAMPLE_FUND_NAME, SAMPLE_FUND_COMMITMENTS, SAMPLE_FUND_FEE_TERMS } from "@/lib/samplePortfolio";
import { DEFAULT_CURVE } from "@/lib/forwardCurve";
import { anchorCurveToLive, fetchNyFedRates } from "@/lib/nyfed";
import { DEFAULT_FUND_TERMS, downloadBlob, parseCSV } from "@/lib/fundTerms";
import { fundNameResolver, mergeFundTerms, withCanonicalFund } from "@/lib/fundNames";
import { appendChanges, auditSnapshot, BULK_LIMIT, diffWorkspace } from "@/lib/audit";
import { applyExecutedCap } from "@/lib/dealDocApply";
import { dealFileLink, listDealDocs } from "@/lib/dealDocs";
import LoanAgreementPanel from "@/components/LoanAgreement";
import Delinquency, { DelinquencySummary } from "@/components/Delinquency";
import BusinessPlan, { BudgetVsActualSummary } from "@/components/BusinessPlan";
import { aggregate as aggregateDelinquency } from "@/lib/delinquency";
import CloudPanel from "@/components/CloudPanel";
import {
  REQUIRE_SIGN_IN,
  claimInvites,
  fetchAudit,
  getSession,
  listWorkspaces,
  loadWorkspace as dbLoadWorkspace,
  onAuthChange,
  saveWorkspace as dbSaveWorkspace,
  saveWorkingOn,
  signOut,
  supabase,
} from "@/lib/cloud";
import ChangeLog from "@/components/ChangeLog";
import FundTermsEditor from "@/components/FundTermsEditor";
import { clearLegacyBrowserData, clearLegacyExtras, isWorkspace } from "@/lib/workspace";
import { FIGURE_DEFS, firmSummary, fmtAum } from "@/lib/enterprise";
import { applyRecord, dataFromRecords, loadFirm, loadLegacyJson, loadRecord, loadRecords, recId, recordItems, savableRecords, saveRecords, subscribeRecords } from "@/lib/records";

// The firm's data is saved record by record (phase Q) this many seconds after
// the last change.
const RECORD_SAVE_SECONDS = 1;
// The asset on screen is per person and per browser, not firm data.
const ACTIVE_DEAL_KEY = "baywise:activeDealId";

// Workspaces are saved only in the database, never in the browser. Changes
// save this many seconds after the last edit, on Save now, and when you leave.
const DB_SAVE_SECONDS = 20;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const MANUAL_URL = "https://github.com/williamggalipeau-cloud/underwriting-calculator/blob/main/docs/USER_MANUAL.md";

// Brings a saved deal up to date: fills settings added since it was saved
// with their defaults, moves sample assets off old default acquisition
// dates and hold periods, and re-maps linked deals onto the full model.
function migrateSavedDeal(d) {
  d = withTestDate(d);
  if (!d.quick) return d;
  const quick = { ...QUICK_DEFAULTS, ...d.quick };
  quick.acquisitionDate = currentSampleDate(d.id, quick.acquisitionDate);
  quick.holdYears = currentSampleHold(d.id, quick.holdYears);
  let inputs = d.inputs?.acquisitionDate ? { ...d.inputs, acquisitionDate: currentSampleDate(d.id, d.inputs.acquisitionDate) } : d.inputs;
  if (inputs?.holdPeriodYears != null) inputs = { ...inputs, holdPeriodYears: currentSampleHold(d.id, inputs.holdPeriodYears) };
  // Sample assets saved with the generic 20-unit default get their own count.
  if (inputs && sampleUnitCount(d.id) && inputs.unitCount === 20 && !(inputs.units ?? []).length) inputs = { ...inputs, unitCount: sampleUnitCount(d.id) };
  return { ...d, quick, inputs: d.linked ? toMainInputs(quick, inputs) : inputs };
}

// Test scenario deals saved before they had acquisition dates, or with the
// old 5–8 year holds (past Fund I's term), get the current date and 4-year
// hold. Saved snapshots are re-run so their cash flows match.
function withTestDate(d) {
  if (d?.inputs && withLocation(d.inputs) !== d.inputs) d = { ...d, inputs: withLocation(d.inputs) };
  const name = d?.inputs?.propertyName;
  if (!TEST_ACQUISITION_DATES[name] || !String(d.id).startsWith("test-")) return d;
  let inputs = d.inputs;
  if (!inputs.acquisitionDate) inputs = { ...inputs, acquisitionDate: TEST_ACQUISITION_DATES[name] };
  if (inputs.holdPeriodYears === TEST_PREVIOUS_HOLDS[name]) inputs = { ...inputs, holdPeriodYears: 4 };
  if (inputs === d.inputs) return d;
  return d.irrFlows ? { ...d, ...snapshotDeal(inputs, d.id) } : { ...d, inputs };
}

// Loads a saved workspace's deals, saved deals and funds with one spelling
// per fund: the old sample fund name ("Light Industrial Fund I") and any
// spelling that differs only in capitals or spaces join the same fund, and
// fund terms saved under those spellings are merged.
function normalizeWorkspaceFunds(saved) {
  const deals = saved.deals.map(migrateSavedDeal);
  const savedDeals = (Array.isArray(saved.savedDeals) ? saved.savedDeals : []).map(withTestDate);
  const funds = saved.funds && typeof saved.funds === "object" ? saved.funds : initialFunds();
  const resolve = fundNameResolver(funds, deals, savedDeals);
  let out = {
    deals: deals.map((d) => withCanonicalFund(d, resolve)),
    savedDeals: savedDeals.map((d) => withCanonicalFund(d, resolve)),
    funds: mergeFundTerms(funds, resolve),
  };
  // Model Fund I moved its 1.5% fee from each asset to the fund: once per
  // workspace, set the fund fee terms and remove the asset-level AM fee.
  const sample = out.funds[SAMPLE_FUND_NAME];
  if (sample && sample.feeModel !== SAMPLE_FUND_FEE_TERMS.feeModel) {
    const inFund = (d) => d.inputs?.fundName === SAMPLE_FUND_NAME;
    const noAmFee = (inputs) => ({ ...inputs, amFeeItems: (inputs.amFeeItems ?? []).filter((x) => x.id !== "quick-am-fee") });
    out = {
      funds: { ...out.funds, [SAMPLE_FUND_NAME]: { ...sample, ...SAMPLE_FUND_FEE_TERMS } },
      deals: out.deals.map((d) => {
        if (!inFund(d)) return d;
        if (d.quick) {
          const quick = { ...d.quick, amFeePct: 0 };
          return { ...d, quick, inputs: d.linked ? toMainInputs(quick, d.inputs) : noAmFee(d.inputs) };
        }
        return { ...d, inputs: noAmFee(d.inputs) };
      }),
      savedDeals: out.savedDeals.map((d) =>
        inFund(d) && (d.inputs.amFeeItems ?? []).some((x) => x.id === "quick-am-fee") ? { ...d, ...snapshotDeal(noAmFee(d.inputs), d.id) } : d
      ),
    };
  }
  // Assets removed from the sample and test data leave Model Fund I (once per
  // workspace).
  const fundT = out.funds[SAMPLE_FUND_NAME];
  if (fundT && fundT.testDataModel !== TEST_DATA_MODEL) {
    const removed = (d) => d.inputs?.fundName === SAMPLE_FUND_NAME && REMOVED_SAMPLE_ASSETS.includes(d.inputs?.propertyName);
    const left = out.deals.filter((d) => !removed(d));
    out = {
      funds: { ...out.funds, [SAMPLE_FUND_NAME]: { ...fundT, testDataModel: TEST_DATA_MODEL } },
      deals: left.length ? left : [linkedDeal()],
      savedDeals: out.savedDeals.filter((d) => !removed(d)),
    };
  }
  // Model Fund I runs on rent-roll NOI (once per workspace): direct-NOI
  // assets are unlinked from Quick Underwrite and their rent rolls calibrated
  // so year-1 NOI matches what they had. Runs after the rent rolls exist.
  const runNoi = (o) => {
    const f = o.funds[SAMPLE_FUND_NAME];
    if (!f || f.noiModel === NOI_MODEL) return o;
    const inFund = (d) => d.inputs?.fundName === SAMPLE_FUND_NAME && d.inputs?.noiOverrideEnabled && (d.inputs.units ?? []).length;
    const conv = (inputs) => {
      const c = underwrite(inputs).annualCashFlows;
      return toRentRollNOI(inputs, { y1: c[0]?.noi ?? 0, exit: c[c.length - 1]?.noi ?? 0 }, mtmIndex(inputs.propertyName), underwrite);
    };
    return {
      funds: { ...o.funds, [SAMPLE_FUND_NAME]: { ...f, noiModel: NOI_MODEL } },
      deals: o.deals.map((d) => (inFund(d) ? { ...d, linked: false, inputs: conv(d.inputs) } : d)),
      savedDeals: o.savedDeals.map((d) => (inFund(d) ? { ...d, ...snapshotDeal(conv(d.inputs), d.id) } : d)),
    };
  };
  // Model Fund I rent rolls: every asset gets a rent roll with market rent
  // 20–40% above in-place (once per workspace).
  const fundNow = out.funds[SAMPLE_FUND_NAME];
  if (fundNow && fundNow.rentRollModel !== MTM_MODEL) {
    const inFund = (d) => d.inputs?.fundName === SAMPLE_FUND_NAME;
    const mtm = (inputs) => withMarkToMarket(inputs, mtmIndex(inputs.propertyName));
    out = {
      funds: { ...out.funds, [SAMPLE_FUND_NAME]: { ...fundNow, rentRollModel: MTM_MODEL } },
      deals: out.deals.map((d) => (inFund(d) ? { ...d, inputs: mtm(d.inputs) } : d)),
      savedDeals: out.savedDeals.map((d) => (inFund(d) ? { ...d, ...snapshotDeal(mtm(d.inputs), d.id) } : d)),
    };
  }
  return runSic(runNoi(out));
}

// Tenant SIC codes (once per workspace): generic sample tenants ("Tenant
// 001") get a fictional business, and every tenant with a business and no
// SIC code gets the suggested code. Applies to every deal in the workspace.
function runSic(o) {
  return runSizing(runSicCodes(o));
}

// Loan sizing tests (once per workspace): every Model Fund I asset sizes its
// loan on the lesser of LTV, 1.25x DSCR, 75% LTC and an 8% debt yield
// (values already entered are kept).
function runSizing(o) {
  const f = o.funds[SAMPLE_FUND_NAME];
  if (!f || f.sizingModel === SIZING_MODEL) return o;
  const inFund = (d) => d.inputs?.fundName === SAMPLE_FUND_NAME;
  return {
    funds: { ...o.funds, [SAMPLE_FUND_NAME]: { ...f, sizingModel: SIZING_MODEL } },
    deals: o.deals.map((d) => (inFund(d) ? { ...d, inputs: withSizingConstraints(d.inputs) } : d)),
    savedDeals: o.savedDeals.map((d) => (inFund(d) ? { ...d, ...snapshotDeal(withSizingConstraints(d.inputs), d.id) } : d)),
  };
}

function runSicCodes(o) {
  const f = o.funds[SAMPLE_FUND_NAME];
  if (!f || f.sicModel === SIC_MODEL) return o;
  const has = (d) => (d.inputs?.units ?? []).length > 0;
  const sic = (inputs) => ({ ...inputs, units: withSicCodes(inputs.units, mtmIndex(inputs.propertyName)) });
  return {
    funds: { ...o.funds, [SAMPLE_FUND_NAME]: { ...f, sicModel: SIC_MODEL } },
    deals: o.deals.map((d) => (has(d) ? { ...d, inputs: sic(d.inputs) } : d)),
    savedDeals: o.savedDeals.map((d) => (has(d) ? { ...d, ...snapshotDeal(sic(d.inputs), d.id) } : d)),
  };
}

function initialFunds() {
  return { [SAMPLE_FUND_NAME]: { ...DEFAULT_FUND_TERMS, name: SAMPLE_FUND_NAME, targetEquity: SAMPLE_FUND_COMMITMENTS, ...SAMPLE_FUND_FEE_TERMS, rentRollModel: MTM_MODEL, testDataModel: TEST_DATA_MODEL, noiModel: NOI_MODEL, sicModel: SIC_MODEL, sizingModel: SIZING_MODEL } };
}

function fmtISODate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}/${d}/${y}`;
}

const DEFAULT_INPUTS = {
  propertyName: "Small Bay Industrial",
  fundName: "",
  squareFootage: 60000,
  purchasePrice: 9000000,
  closingCosts: {
    titleInsuranceOwner:  27000,
    titleInsuranceLender: 11700,
    transferTax:          45000,
    loanOrigination:      58500,
    acquisitionFee:       90000,
    legalFees:            15000,
    environmentalReport:  3500,
    appraisal:            7500,
    surveyAndPCA:         5000,
    miscClosingCosts:     2500,
  },

  unitCount: 20,
  avgLeaseTerm: 2,
  renewalProbabilityPct: 60,
  downtimeBetweenLeases: 2,

  leaseType: "NNN",

  rentPerSF: 14.0,
  annualRentEscalationPct: 3.0,
  vacancyPct: 10,
  creditLossPct: 1.0,
  otherIncomePSF: 0.25,

  realEstateTaxPSF: 1.20,
  insurancePSF: 0.35,
  utilitiesPSF: 0.50,
  maintenancePSF: 0.40,
  janitorialPSF: 0.20,

  managementFeePct: 5,
  cmFeePct: 1.5, // construction management, % of purchase price per year
  leasingFeesPSF: 0.10,
  capitalReservesPSF: 0.30,

  constructionCosts: {
    demolition:           0.25,
    partitionWalls:       0.75,
    electrical:           1.50,
    plumbing:             0.50,
    hvac:                 1.25,
    flooring:             0.75,
    painting:             0.30,
    lighting:             0.60,
    doorsHardware:        0.35,
    overheadDoors:        0.50,
    landscaping:          0.15,
    roofing:              0.50,
    signage:              0.10,
    miscConstruction:     0.25,
    generalConditionsPct: 10,
    overheadProfitPct:    10,
    contingencyPct:        5,
  },
  tiPerSFNew: 8.0,
  tiPerSFRenewal: 2.0,
  leasingCommissionNewPct: 6.0,
  leasingCommissionRenewalPct: 2.0,

  loanCovenants: {
    dscrEnabled:      true,
    dscrMin:          1.25,
    debtYieldEnabled: false,
    debtYieldMin:     8.0,
    ltvEnabled:       false,
    ltvMax:           75,
    occupancyEnabled: false,
    occupancyMin:     85,
  },

  lenderName: "",

  loanSizingConstraints: {
    minDSCREnabled:     true,
    minDSCR:            1.25,
    maxLTCEnabled:      true,
    maxLTCPct:          75,
    minDebtYieldEnabled: true,
    minDebtYieldPct:    8.0,
  },

  tiReserve: {
    enabled:        false,
    reservePSF:     8.0,
    minDrawDSCR:    1.10,
  },

  ltvPct: 65,
  interestRatePct: 7.50,
  amortizationYears: 25,
  loanTermYears: 3,
  extensionCount: 2,
  extensionTermYears: 1,
  extensionFeePct: 0.25,
  ioPeriodYears: 0,

  floatingRate: true,
  indexRatePct: 5.25,
  spreadPct: 2.50,
  sofrForwardCurve: [],   // [] = use flat indexRatePct; populated = per-year SOFR

  hedgingType: "cap",
  capStrikeRatePct: 9.50,
  capTermYears: 3,
  capPremiumPct: 1.00,
  swapFixedRatePct: 7.75,
  swapTermYears: 3,

  holdPeriodYears: 4,
  exitCapRatePct: 6.75,
  sellingCostsPct: 2.0,
  sellingCosts: {
    brokerCommissionPct:  2.00,
    transferTaxPct:       0.50,
    titleInsurancePct:    0.20,
    legalFees:            15000,
    miscDispositionCosts: 5000,
  },

  freeRentMonthsNew: 1,
  freeRentMonthsRenewal: 0,
  tiConcessionPSFNew: 0,
  tiConcessionPSFRenewal: 0,

  amFeeItems: [],
  customRolloverItems: [],
  customIncomeItems: [],
  customExpenseItems: [],
  customDispositionItems: [],

  waterfallEnabled: true,
  waterfall: {
    lpEquityPct: 90,
    preferredReturnPct: 9.0,
    catchUpGpPct: 100,
    tiers: [
      { irrThreshold: 12,   lpSplit: 80, gpSplit: 20 },
      { irrThreshold: 18,   lpSplit: 70, gpSplit: 30 },
      { irrThreshold: null, lpSplit: 60, gpSplit: 40 },
    ],
  },

  units: [],
};


// A blank working deal (not in a fund) for when no deals are left open,
// on rent-roll NOI like every new deal.
function linkedDeal(id = "deal-1") {
  return { id, inputs: { ...DEFAULT_INPUTS, propertyName: "New Deal", fundName: "" } };
}

// Assets removed from Model Fund I's sample and test data.
const REMOVED_SAMPLE_ASSETS = ["Light Industrial (30k SF)", ...REMOVED_TEST_ASSETS];
const TEST_DATA_MODEL = "v2";
const NOI_MODEL = "rentroll-v1";
const SIC_MODEL = "sic-v1";
const SIZING_MODEL = "lsc-v1";

// The app opens with a live fund: the nine sample assets, all editable
// deals in Model Fund I.
function initialDeals() {
  return buildSampleDeals(DEFAULT_INPUTS);
}

function newDeal(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    inputs: { ...DEFAULT_INPUTS, propertyName: "New Deal", ...overrides },
  };
}

// Tab order. The Change Log opens from the header button (id "changes").
// Tab groups (user, 11/22–23; docs/DEAL_DOCUMENTS_PLAN.md "App name and
// layout"). A group shows only when it has tabs: Dispositions (phase P),
// Property Management (T) and Market (U) join later.
const TAB_GROUPS = [
  { label: "Acquisitions", tabs: [
    { id: "pipeline",    label: "Pipeline" },
    { id: "quick",       label: "Deal Screener" },
    { id: "impact",      label: "Fund Impact" },
    { id: "research",    label: "Research" },
  ] },
  { label: "Dispositions", tabs: [
    { id: "forsale",     label: "Assets for Sale" },
    { id: "offers",      label: "Offers" },
    { id: "trackrecord", label: "Track Record" },
    { id: "dispdocs",    label: "Sale Documents" },
  ] },
  { label: "Asset Management", tabs: [
    { id: "plan",        label: "Asset Business Plan" },
    { id: "assets",      label: "Asset Summary" },
    { id: "units",       label: "Unit Roll" },
    { id: "leases",      label: "Leases" },
    { id: "leasing",     label: "Leasing" },
    { id: "valuations",  label: "Valuation" },
    { id: "debt",        label: "Debt" },
    { id: "cashflow",    label: "Cash Flow" },
    { id: "returns",     label: "Asset Return" },
    { id: "sensitivity", label: "Return Sensitivity" },
    { id: "sellhold",    label: "Sell/Hold Analysis" },
  ] },
  { label: "Property Management", tabs: [
    { id: "taxes",       label: "Property Taxes" },
    { id: "insurance",   label: "Insurance" },
    { id: "condition",   label: "Property Condition" },
    { id: "contracts",   label: "Service Contracts" },
  ] },
  { label: "Portfolio Management", tabs: [
    { id: "fundsummary", label: "Fund Summary" },
    { id: "fundplan",    label: "Fund Plan" },
    { id: "fund",        label: "Fund Return" },
    { id: "gpecon",      label: "GP Economics" },
    { id: "funddebt",    label: "Fund Debt" },
    { id: "distributions", label: "Distribution Analysis" },
    { id: "stress",      label: "Stress Testing" },
    { id: "benchmark",   label: "Benchmarking" },
  ] },
  { label: "Market", tabs: [
    { id: "market",      label: "Market Data" },
  ] },
  { label: "Library", tabs: [
    { id: "documents",   label: "Documents" },
    { id: "reports",     label: "Reports" },
  ] },
];
const TABS = TAB_GROUPS.flatMap((g) => g.tabs);

// Tabs that show one deal: they get the Asset dropdown.
const DEAL_TABS = new Set(["quick", "units", "leases", "leasing", "taxes", "insurance", "condition", "contracts", "documents", "plan", "debt", "cashflow", "returns", "sensitivity", "research", "sellhold"]);


export default function Home() {
  const [deals, setDealsRaw] = useState(initialDeals);
  const [activeDealId, setActiveDealId] = useState("sample-deal-1");
  const [activeTab, setActiveTab] = useState("home"); // the app opens on Home (phase Z)
  const [savedDeals, setSavedDealsRaw] = useState([]);
  // Fund terms by fund name (timeline, waterfall, fee).
  const [funds, setFundsRaw] = useState(initialFunds);
  const [fundEditor, setFundEditor] = useState(null); // null | { mode: "new" } | { mode: "edit", name }
  const [comps, setCompsRaw] = useState(DEFAULT_COMPS_STATE);
  const [pipeline, setPipelineRaw] = useState(EMPTY_PIPELINE);
  // "Working on" fund picker (11/23): a filter; "" = All funds. Remembered on
  // the person's sign-in (or this browser when signed out).
  const [workingOn, setWorkingOnRaw] = useState(ALL_FUNDS);
  // Fair value marks: { [dealId]: { [quarterEndISO]: { value, source, appraiser, capRate, capex, notes } } }
  const [valuations, setValuationsRaw] = useState({});
  // Change log (lib/audit): entries saved with the workspace. Signed-in users
  // are recorded by email; the typed name is kept in memory only.
  const [auditLog, setAuditLog] = useState([]);
  const [auditUser, setAuditUser] = useState("");
  const auditBaseline = useRef(null); // last tracked snapshot (null = take a new baseline)
  const auditNote = useRef(null); // bulk action to record instead of field-by-field changes
  const auditLogRef = useRef(auditLog);
  useEffect(() => {
    auditLogRef.current = auditLog;
  });
  function changeAuditUser(name) {
    setAuditUser(name);
  }
  // Records a bulk action (import, reset, …) as one log entry: the next save
  // logs this note and takes a new baseline.
  function noteAudit(note) {
    auditNote.current = note;
  }
  // Changes made by applying a lease abstract: logged field by field with
  // their source instead of as one rent roll change.
  const auditSource = useRef(null); // { label, entries: [{ area, item, field, path, from, to }] } (full workspace paths)
  const hydrated = useRef(false);
  const importRef = useRef(null);
  const [importMsg, setImportMsg] = useState(null); // { ok, text }
  // Database (Supabase): signed-in session and the open workspace. The
  // database is the only place the workspace is saved.
  const [session, setSession] = useState(null);
  const [dbLink, setDbLink] = useState(null); // { id, name, version, role, savedAt, dirty, error, conflict }
  const [cloudOpen, setCloudOpen] = useState(false);
  // True after a "Forgot password?" link is opened: the panel asks for a new password.
  const [pwRecovery, setPwRecovery] = useState(false);
  const [dbLog, setDbLog] = useState(null);
  const [deletedRows, setDeletedRows] = useState([]); // firm_records marked deleted (Recently deleted)
  const [ready, setReady] = useState(false); // first load finished
  const dbBaseline = useRef(null); // snapshot at the last database save/open ("pending" = take on next save)
  const dbLinkRef = useRef(null);
  const dbSaving = useRef(false);
  useEffect(() => {
    dbLinkRef.current = dbLink;
  });
  const editorName = session?.user?.email || auditUser;
  const latestData = useRef(null); // latest workspace snapshot to save
  const dbTimer = useRef(null); // pending save after the last edit
  // Phase Q: the saved version of every record (Map recId → { kind, key, sort,
  // data, deleted, version }); what differs from it is saved.
  const recBase = useRef(new Map());
  const [recordNotice, setRecordNotice] = useState(null); // "X was changed by …; reloaded"
  const activeDealIdRef = useRef(null);
  useEffect(() => {
    activeDealIdRef.current = activeDealId;
  });
  // Quick Underwrite inputs live on each deal. When a deal is linked, every
  // change is mapped onto its full-model inputs so all tabs stay in sync.
  function setQuick(updater) {
    if (!requireEdit()) return;
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== activeDealId) return d;
        const current = d.quick ?? QUICK_DEFAULTS;
        const quick = typeof updater === "function" ? updater(current) : updater;
        return { ...d, quick, inputs: d.linked ? toMainInputs(quick, d.inputs) : d.inputs };
      })
    );
  }

  // Rate cap settings (Debt tab). They live with the deal's quick settings;
  // linked deals re-map as usual, and unlinked deals get the cap fields
  // priced on their own loan, hold, spread and acquisition date.
  function setCap(patch) {
    if (!requireEdit()) return;
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== activeDealId) return d;
        const quick = { ...(d.quick ?? QUICK_DEFAULTS), ...patch };
        if (d.linked) return { ...d, quick, inputs: toMainInputs(quick, d.inputs) };
        const loan = underwrite(d.inputs).debt.loanAmount;
        // Executed caps (applied confirmations) keep their actual terms.
        const modeled = { ...d.inputs, ...capEngineFields(capSettingsFor(quick, d.inputs), loan) };
        return { ...d, quick, inputs: (d.inputs.executedCaps ?? []).reduce(applyExecutedCap, modeled) };
      })
    );
  }

  // ── Forward curve + live NY Fed rates ──
  // baseCurve: the Pensford curve (built-in snapshot or latest import).
  // When anchoring is on and live rates are in, deals use the curve shifted
  // in parallel so it starts at today's NY Fed 30-day average SOFR.
  const [baseCurve, setBaseCurveRaw] = useState(DEFAULT_CURVE);
  const [anchorToLive, setAnchorToLiveRaw] = useState(true);
  // Sign-in required to change data (lib/cloud REQUIRE_SIGN_IN): every data
  // edit goes through these guarded setters, which do nothing while the app
  // is view-only. System updates (restoring the saved workspace, anchoring
  // the curve to live SOFR, opening a database workspace) use the raw ones.
  const lockedRef = useRef(true);
  const [lockHint, setLockHint] = useState(0);
  const guarded = (raw) => (u) => {
    if (lockedRef.current) {
      setLockHint(Date.now());
      return;
    }
    raw(u);
  };
  // Returns false (and flashes the view-only banner) when edits aren't allowed.
  const requireEdit = () => {
    if (!lockedRef.current) return true;
    setLockHint(Date.now());
    return false;
  };
  const setDeals = guarded(setDealsRaw);
  const setSavedDeals = guarded(setSavedDealsRaw);
  const setFunds = guarded(setFundsRaw);
  const setComps = guarded(setCompsRaw);
  const setPipeline = guarded(setPipelineRaw);
  const setValuations = guarded(setValuationsRaw);
  const setBaseCurve = guarded(setBaseCurveRaw);
  const setAnchorToLive = guarded(setAnchorToLiveRaw);
  // View-only until signed in with a database workspace open (changes are
  // saved only there), and for viewers of a database workspace.
  const viewerOnly = !!(session && dbLink?.id && dbLink.role === "viewer");
  const noWorkspace = !!session && !dbLink?.id;
  const locked = REQUIRE_SIGN_IN && (!session || viewerOnly || noWorkspace);
  useEffect(() => {
    lockedRef.current = locked;
  });
  const [lockFlash, setLockFlash] = useState(false);
  useEffect(() => {
    if (!lockHint) return;
    const t0 = setTimeout(() => setLockFlash(true), 0);
    const t1 = setTimeout(() => setLockFlash(false), 1200);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [lockHint]);
  const [live, setLive] = useState(null);
  const [liveStatus, setLiveStatus] = useState("loading"); // loading | ok | error

  function effectiveCurve(curve, anchor, liveRates) {
    return anchor && liveRates?.avg30 ? anchorCurveToLive(curve, liveRates.avg30.rate).curve : curve;
  }

  // Puts a curve on every deal; linked deals re-map onto every tab.
  function applyCurveToDeals(curve, forcePensford = false) {
    setDealsRaw((prev) =>
      prev.map((d) => {
        const q = d.quick ?? QUICK_DEFAULTS;
        const quick = { ...q, forwardCurve: curve, sofrCurveSource: forcePensford ? "pensford" : q.sofrCurveSource };
        return { ...d, quick, inputs: d.linked ? toMainInputs(quick, d.inputs) : d.inputs };
      })
    );
  }

  // An imported Pensford curve replaces the base curve on every deal.
  function handleCurveImport(curve) {
    if (!requireEdit()) return;
    setBaseCurve(curve);
    applyCurveToDeals(effectiveCurve(curve, anchorToLive, live), true);
  }

  function handleAnchorToggle(on) {
    if (!requireEdit()) return;
    setAnchorToLive(on);
    applyCurveToDeals(effectiveCurve(baseCurve, on, live));
  }

  function loadLiveRates() {
    setLiveStatus("loading");
    return fetchNyFedRates()
      .then((r) => {
        setLive(r);
        setLiveStatus("ok");
        return r;
      })
      .catch(() => {
        setLiveStatus("error");
        return null;
      });
  }

  // On load: fetch live NY Fed rates and anchor the default curve. Nothing is
  // restored from the browser: the workspace opens from the database after
  // sign-in. Old browser data (other than an unmigrated workspace) is deleted.
  useEffect(() => {
    let cancelled = false;
    clearLegacyExtras();
    hydrated.current = true;
    Promise.resolve()
      .then(() => setReady(true))
      .then(() => fetchNyFedRates())
      .then((r) => {
        if (cancelled) return;
        setLive(r);
        setLiveStatus("ok");
        if (r.avg30) applyCurveToDeals(anchorCurveToLive(DEFAULT_CURVE, r.avg30.rate).curve);
      })
      .catch(() => !cancelled && setLiveStatus("error"));
    return () => {
      cancelled = true;
    };
    // Runs once on mount; later updates go through the handlers above.
  }, []);

  // Database sign-in: follow the Supabase session (confirmation and password
  // reset links land here).
  useEffect(() => {
    let stop = false;
    let unsub = () => {};
    Promise.resolve()
      .then(async () => {
        if (!supabase()) return;
        unsub = onAuthChange((sess, event) => {
          if (stop) return;
          setSession(sess);
          if (event === "PASSWORD_RECOVERY") {
            setPwRecovery(true);
            setCloudOpen(true);
          }
        });
        const sess = await getSession();
        if (!stop) setSession(sess);
      })
      .catch(() => {});
    return () => {
      stop = true;
      unsub();
    };
  }, []);
  // After signing in: claim invites, then open the firm (phase Q: one firm,
  // no workspaces to choose). Data an older version left in this browser is
  // cleared, never imported. Someone with no access sees a message; nothing
  // is created for them.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId || !ready) return;
    let stop = false;
    claimInvites()
      .catch(() => {})
      .then(async () => {
        if (stop || dbLinkRef.current) return;
        clearLegacyBrowserData();
        const firm = await loadFirm(userId);
        if (stop || dbLinkRef.current) return;
        if (!firm) {
          setDbLink({ id: null, name: "", error: "You don't have access to the firm's data yet. Ask an owner to add you (☁ Database → People with access)." });
          return;
        }
        if (firm.storage === "records") await openFirm(firm);
        else await openDbWorkspace(firm);
      })
      .catch((e) => !stop && setDbLink({ id: null, name: "", error: e.message }));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready]);
  // Live updates: other people's saves appear on screen (phase Q).
  const firmId = dbLink?.mode === "records" ? dbLink.id : null;
  const applyRemoteRef = useRef(null);
  useEffect(() => {
    if (!firmId) return;
    return subscribeRecords(firmId, (row) => applyRemoteRef.current?.(row));
  }, [firmId]);
  useEffect(() => {
    applyRemoteRef.current = applyRemote;
    if (typeof window !== "undefined" && window.__BAYWISE_TEST__) window.__baywiseApplyRemote = applyRemote;
  });
  // The asset on screen is remembered per browser.
  useEffect(() => {
    try {
      if (activeDealId) localStorage.setItem(ACTIVE_DEAL_KEY, activeDealId);
    } catch {}
  }, [activeDealId]);
  // Verified change log for the Change Log tab.
  useEffect(() => {
    if (activeTab !== "changes" || !dbLink?.id || !session) return;
    let stop = false;
    fetchAudit(dbLink.id)
      .then((r) => !stop && setDbLog(r))
      .catch(() => {});
    if (dbLink.mode === "records") loadRecords(dbLink.id).then((rows) => !stop && setDeletedRows(rows.filter((r) => r.deleted))).catch(() => {});
    return () => {
      stop = true;
    };
  }, [activeTab, dbLink?.id, dbLink?.version, session]);

  // Save to the database DB_SAVE_SECONDS after the last change (scheduled in
  // the effect below), on Save now, and when the tab is hidden or closed.
  // Leaving with unsaved changes asks first, because nothing is kept in the
  // browser.
  const saveRef = useRef(null);
  useEffect(() => {
    saveRef.current = () => saveToDbNow().catch(() => {});
  });
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveRef.current?.();
    const onLeave = (e) => {
      const l = dbLinkRef.current;
      if (l && (l.dirty || dbSaving.current) && l.role !== "viewer") {
        saveRef.current?.();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onLeave);
      clearTimeout(dbTimer.current);
    };
  }, []);

  // Track every change: update the change log and schedule a database save.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      // Change log: compare with the last snapshot and record what changed.
      const snap = auditSnapshot({ deals, savedDeals, funds, comps, valuations, baseCurve, pipeline });
      let log = auditLogRef.current;
      if (auditBaseline.current && !auditNote.current) {
        let changes = diffWorkspace(auditBaseline.current, snap);
        const src = auditSource.current;
        auditSource.current = null;
        if (src) {
          // Replace the generic diff of what was applied with field-level entries.
          const prefix = (path) => JSON.stringify(path.slice(0, path[0] === "funds" ? 3 : 4));
          const prefixes = new Set(src.entries.map((e) => prefix(e.path)));
          changes = changes.filter((c) => !(c.path && prefixes.has(prefix(c.path))));
          changes.push(...src.entries.map((e) => ({ ...e, source: src.label })));
        }
        if (changes.length) log = appendChanges(log, changes, { user: editorName });
      } else if (auditNote.current) {
        log = appendChanges(log, [], { user: editorName, note: auditNote.current });
        auditNote.current = null;
      }
      auditBaseline.current = snap;
      // Database: take the baseline after opening, or mark unsaved changes.
      let schedule = false;
      if (dbLinkRef.current?.mode === "records") {
        // Phase Q: unsaved = any record that differs from its saved version.
        const pending = recordItems(recBase.current, savableRecords({ deals, savedDeals, funds, baseCurve, anchorToLive, comps, pipeline, valuations, v: 1, app: "industrial-uw" })).length > 0;
        if (pending) {
          if (!dbLinkRef.current.dirty) {
            dbLinkRef.current = { ...dbLinkRef.current, dirty: true };
            setDbLink((l) => (l ? { ...l, dirty: true } : l));
          }
          schedule = true;
        }
      } else if (dbLinkRef.current) {
        if (!dbBaseline.current || dbBaseline.current === "pending") dbBaseline.current = snap;
        else if (dbLinkRef.current.dirty) schedule = true;
        else if (diffWorkspace(dbBaseline.current, snap).length) {
          dbLinkRef.current = { ...dbLinkRef.current, dirty: true };
          setDbLink((l) => (l ? { ...l, dirty: true } : l));
          schedule = true;
        }
      }
      if (log !== auditLogRef.current) {
        auditLogRef.current = log;
        setAuditLog(log);
      }
      latestData.current = { v: 1, app: "industrial-uw", deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, pipeline, valuations, auditLog: log };
      if (schedule) {
        clearTimeout(dbTimer.current);
        dbTimer.current = setTimeout(() => saveRef.current?.(), (dbLinkRef.current?.mode === "records" ? RECORD_SAVE_SECONDS : DB_SAVE_SECONDS) * 1000);
      }
    }, dbLinkRef.current?.mode === "records" ? 150 : 400);
    return () => clearTimeout(t);
    // auditLog/auditUser are read through refs/closure; changes to them alone don't need a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, pipeline, valuations]);

  // ── Export / import the workspace as a JSON file (a backup copy you keep,
  // or to load one into the open database workspace).
  function handleExportWorkspace() {
    const at = new Date().toISOString();
    const data = { v: 1, app: "industrial-uw", exportedAt: at, savedAt: dbLink?.savedAt ?? at, deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, pipeline, valuations, auditLog };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `baywise-data-${at.slice(0, 10)}.json`);
    setImportMsg({ ok: true, text: `Backup downloaded: ${plural(deals.length, "deal")}, ${plural(Object.keys(funds).length, "fund")} and ${plural(comps.comps?.length ?? 0, "comp")}.` });
  }

  async function handleImportWorkspace(file) {
    if (!requireEdit()) return;
    let saved;
    try {
      saved = JSON.parse(await file.text());
    } catch {
      setImportMsg({ ok: false, text: "That file isn't a workspace export (it couldn't be read as JSON)." });
      return;
    }
    if (!isWorkspace(saved)) {
      setImportMsg({ ok: false, text: "That file isn't a workspace export (no deals found)." });
      return;
    }
    if (session && dbLink?.role !== "owner") {
      setImportMsg({ ok: false, text: "Only an owner can restore from a backup." });
      return;
    }
    if (!window.confirm(`Restore from ${file.name}? This replaces ALL of the firm's data, for everyone, with the backup (${plural(saved.deals.length, "deal")}). Anything not in the backup is removed from the app. A backup of the current data downloads first.`)) return;
    handleExportWorkspace(); // safety copy of what's there now
    applyWorkspace(saved, `Restored from backup ${file.name}`);
    setImportMsg({ ok: true, text: `Restored ${plural(saved.deals.length, "deal")}, ${plural(Object.keys(saved.funds ?? {}).length, "fund")} and ${plural(saved.comps?.comps?.length ?? 0, "comp")} from ${file.name}. The data from before is in the backup that just downloaded.` });
  }

  // Loads a saved workspace (database row or export) into the app.
  function applyWorkspace(saved, note) {
    // Fill settings added since it was saved with their defaults and re-map
    // linked deals onto the full model.
    const w = normalizeWorkspaceFunds(saved);
    setDealsRaw(w.deals);
    setSavedDealsRaw(w.savedDeals);
    setFundsRaw(w.funds);
    const base = saved.baseCurve?.points?.length ? saved.baseCurve : DEFAULT_CURVE;
    const anchor = typeof saved.anchorToLive === "boolean" ? saved.anchorToLive : true;
    setBaseCurveRaw(base);
    setAnchorToLiveRaw(anchor);
    setActiveDealId(w.deals.some((d) => d.id === saved.activeDealId) ? saved.activeDealId : w.deals[0].id);
    setCompsRaw({ ...DEFAULT_COMPS_STATE, ...(saved.comps ?? {}) });
    setPipelineRaw({ ...EMPTY_PIPELINE, ...(saved.pipeline ?? {}) });
    setValuationsRaw(saved.valuations && typeof saved.valuations === "object" ? saved.valuations : {});
    // The loaded workspace brings its own change log; the load itself is logged.
    const loaded = Array.isArray(saved.auditLog) ? saved.auditLog : [];
    auditLogRef.current = loaded;
    setAuditLog(loaded);
    noteAudit(note || "Loaded a workspace");
    // Re-anchor the imported curve to today's live rate, as on page load.
    if (anchor && live?.avg30) applyCurveToDeals(anchorCurveToLive(base, live.avg30.rate).curve);
  }

  // ── Database (Supabase) ──
  function linkDb(ws, extra = {}) {
    const link = { id: ws.id, name: ws.name, version: ws.version, role: ws.role, savedAt: null, dirty: false, error: null, conflict: false, ...extra };
    dbLinkRef.current = link;
    setDbLink(link);
  }

  // Opens a database workspace (replacing what's on screen).
  async function openDbWorkspace(w) {
    clearTimeout(dbTimer.current);
    const meta = (await listWorkspaces()).find((x) => x.id === w.id);
    if (!meta) throw new Error("You no longer have access to that workspace.");
    const row = await dbLoadWorkspace(w.id);
    if (!isWorkspace(row.data)) throw new Error("That database workspace has no deals yet.");
    applyWorkspace(row.data, `Opened database workspace ${row.name} (version ${row.version})`);
    // Baseline = the stored version, so updates applied on open (new terms,
    // dates, fees) count as changes and are saved as a new version.
    dbBaseline.current = auditSnapshot({ deals: [], savedDeals: [], funds: {}, comps: null, valuations: {}, baseCurve: null, ...row.data });
    linkDb({ ...meta, version: row.version }, { savedAt: row.updated_at });
  }

  // Phase Q: opens the firm from its records.
  async function openFirm(firm) {
    clearTimeout(dbTimer.current);
    const rows = await loadRecords(firm.id);
    const data = dataFromRecords(rows);
    if (!isWorkspace(data)) throw new Error("The firm's data has no deals yet.");
    let active = null;
    try {
      active = localStorage.getItem(ACTIVE_DEAL_KEY);
    } catch {}
    recBase.current = new Map(rows.map((r) => [recId(r.kind, r.key), r]));
    applyWorkspace({ ...data, activeDealId: active || data.activeDealId }, `Opened ${firm.name}`);
    dbBaseline.current = auditSnapshot({ deals: [], savedDeals: [], funds: {}, comps: null, valuations: {}, baseCurve: null, ...data });
    // The old app may have saved the workspace JSON after the migration.
    const imported = Math.max(firm.records_from_version ?? 0, data.importedFromVersion ?? 0);
    const importPending = firm.records_from_version != null && firm.version > imported;
    const savedAt = rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), "") || null;
    linkDb(firm, { mode: "records", savedAt, importPending });
  }

  // Puts one record into what's on screen without logging it as this
  // person's edit (a remote change, or a reload after a conflict).
  function putRecord(row) {
    const cur = latestData.current ?? workspaceData();
    const next = applyRecord(cur, row);
    latestData.current = { ...cur, ...next };
    auditBaseline.current = auditSnapshot(next);
    dbBaseline.current = auditSnapshot(next);
    if (row.kind === "deal") {
      setDealsRaw(next.deals);
      if (row.deleted && activeDealIdRef.current === row.key && next.deals.length) setActiveDealId(next.deals[0].id);
    } else if (row.kind === "saved_deal") setSavedDealsRaw(next.savedDeals);
    else if (row.kind === "fund") setFundsRaw(next.funds);
    else if (row.kind === "valuation") setValuationsRaw(next.valuations);
    else if (row.kind === "settings") {
      setCompsRaw({ ...DEFAULT_COMPS_STATE, ...(next.comps ?? {}) });
      setPipelineRaw({ ...EMPTY_PIPELINE, ...(next.pipeline ?? {}) });
      if (next.baseCurve?.points?.length) setBaseCurveRaw(next.baseCurve);
      if (typeof next.anchorToLive === "boolean") setAnchorToLiveRaw(next.anchorToLive);
    }
  }

  // Live update from the database (another person's save).
  function applyRemote(row) {
    const l = dbLinkRef.current;
    if (!l || l.mode !== "records" || !row || row.kind === "local_log") return;
    const id = recId(row.kind, row.key);
    const base = recBase.current.get(id);
    if (base && row.version <= base.version) return; // our own save, or older
    const cur = latestData.current;
    if (!cur) return;
    if (base) {
      // An unsaved edit here to the same record wins locally; its save then
      // meets the conflict and reloads that record.
      const mine = savableRecords(cur).find((r) => r.kind === row.kind && r.key === row.key);
      if (mine && JSON.stringify(mine.data) !== JSON.stringify(base.data)) return;
    }
    recBase.current.set(id, { ...row });
    putRecord(row);
  }

  const recordLabel = (kind, key) =>
    kind === "deal" || kind === "saved_deal"
      ? [...deals, ...savedDeals].find((d) => d.id === key)?.inputs?.propertyName || "A deal"
      : kind === "fund" ? `Fund terms of ${key}` : kind === "valuation" ? "Valuation marks" : "Settings";

  // A save met a newer version: reload that record and keep everything else.
  async function reloadConflict(l, c) {
    const row = await loadRecord(l.id, c.kind, c.key);
    const label = recordLabel(c.kind, c.key);
    if (row) {
      recBase.current.set(recId(c.kind, c.key), row);
      putRecord(row);
    } else {
      recBase.current.delete(recId(c.kind, c.key));
    }
    setRecordNotice(`${label} was changed by ${row?.updated_by_email || "someone else"}; reloaded. Your other changes are kept.`);
  }

  // One-time import of what the old app saved after the move (owners).
  async function importFromOldApp() {
    const l = dbLinkRef.current;
    if (!l || l.mode !== "records") return;
    const legacy = await loadLegacyJson(l.id);
    const data = { ...legacy.data, importedFromVersion: legacy.version };
    const items = recordItems(recBase.current, savableRecords(data));
    await saveRecords(l.id, items, [{ area: "Workspace", item: l.name, field: "Import", note: `Imported changes saved by the old app (version ${legacy.version})` }]);
    dbLinkRef.current = null;
    await openFirm(await loadFirm(session.user.id));
    setRecordNotice(`Imported ${items.length} change${items.length === 1 ? "" : "s"} saved by the old app.`);
  }



  // Saves to the linked database workspace with the field-level changes since
  // the last save (stamped with the signed-in user by the database).
  async function saveToDbNow(force = false) {
    const l = dbLinkRef.current;
    if (!l || !session || l.role === "viewer" || dbSaving.current) return;
    if (!force && !l.dirty) return;
    if (l.conflict && !force) return;
    const data = latestData.current ?? workspaceData();
    const snap = auditSnapshot(data);
    let changes = dbBaseline.current && dbBaseline.current !== "pending" ? diffWorkspace(dbBaseline.current, snap) : [];
    const notes = (data.auditLog ?? [])
      .filter((e) => e.note && (!l.savedAt || e.at > l.savedAt))
      .map((e) => ({ area: "Workspace", item: e.item, field: e.field, note: e.note }));
    // Rent roll fields set from a lease abstract: logged field by field with
    // their source (the note) instead of as one rent roll change.
    const sourced = (data.auditLog ?? []).filter((e) => e.source && (!l.savedAt || e.at > l.savedAt));
    if (sourced.length) {
      const prefix = (path) => JSON.stringify(path.slice(0, path[0] === "funds" ? 3 : 4));
      const prefixes = new Set(sourced.map((e) => prefix(e.path)));
      changes = changes.filter((c) => !(c.path && prefixes.has(prefix(c.path))));
    }
    if (changes.length > BULK_LIMIT) changes = [{ area: "Workspace", item: "Bulk change", field: `${changes.length} fields changed`, note: "Bulk change" }];
    changes.push(...sourced.map((e) => ({ area: e.area, item: e.item, field: e.field, path: e.path, from: e.from, to: e.to, note: e.source })));
    if (l.mode === "records") return saveRecordsNow(l, data, snap, [...notes, ...changes]);
    dbSaving.current = true;
    try {
      const version = await dbSaveWorkspace(l.id, l.version, data, [...notes, ...changes]);
      dbBaseline.current = snap;
      const at = new Date().toISOString();
      const next = { ...l, version, savedAt: at, dirty: false, error: null, conflict: false };
      dbLinkRef.current = next;
      setDbLink(next);
      if (activeTab === "changes") fetchAudit(l.id).then(setDbLog).catch(() => {});
    } catch (e) {
      setDbLink((x) => (x ? { ...x, error: e.message, conflict: !!e.conflict } : x));
      throw e;
    } finally {
      dbSaving.current = false;
    }
  }

  // Phase Q: saves only the records that changed, each checked against the
  // version it was loaded at. A newer version elsewhere reloads that record
  // (never overwritten) and the rest is saved.
  async function saveRecordsNow(l, data, snap, changes, attempt = 0) {
    const items = recordItems(recBase.current, savableRecords(data));
    const clean = () => {
      dbBaseline.current = snap;
      const next = { ...dbLinkRef.current, savedAt: new Date().toISOString(), dirty: false, error: null, conflict: false };
      dbLinkRef.current = next;
      setDbLink(next);
    };
    if (!items.length) return clean();
    dbSaving.current = true;
    try {
      const res = await saveRecords(l.id, items, changes);
      for (const it of items) {
        const id = recId(it.kind, it.key);
        const prev = recBase.current.get(id);
        const v = res.find((x) => x.kind === it.kind && x.key === it.key)?.version ?? (prev?.version ?? 0) + 1;
        recBase.current.set(id, { ...prev, kind: it.kind, key: it.key, sort: it.sort ?? prev?.sort ?? 0, data: it.deleted ? prev?.data : it.data, deleted: !!it.deleted, version: v });
      }
      clean();
      if (activeTab === "changes") fetchAudit(l.id).then(setDbLog).catch(() => {});
    } catch (e) {
      if (e.conflict?.kind && attempt < 3) {
        dbSaving.current = false;
        await reloadConflict(l, e.conflict);
        return saveRecordsNow(l, latestData.current ?? data, auditSnapshot(latestData.current ?? data), [], attempt + 1);
      }
      setDbLink((x) => (x ? { ...x, error: e.message } : x));
      throw e;
    } finally {
      dbSaving.current = false;
    }
  }

  // Conflict: keep this browser's version and save it over the newer one
  // (the newer one stays in the database's version history).
  async function overwriteDb() {
    const l = dbLinkRef.current;
    if (!l) return;
    const row = await dbLoadWorkspace(l.id);
    const next = { ...l, version: row.version, conflict: false, error: null, dirty: true };
    dbLinkRef.current = next;
    setDbLink(next);
    await saveToDbNow(true);
  }



  const workspaceData = () => ({ v: 1, app: "industrial-uw", savedAt: new Date().toISOString(), deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, pipeline, valuations, auditLog });



  // ── Fund terms ──
  function handleFundTermsChange(name, patch) {
    if (!requireEdit()) return;
    setFunds((prev) => ({ ...prev, [name]: { ...DEFAULT_FUND_TERMS, ...(prev[name] ?? {}), name, ...patch } }));
  }

  function handleFundSave(terms, { addCurrentDeal } = {}) {
    if (!requireEdit()) return;
    // Keep data stored on the fund that the terms editor doesn't edit (capital activity).
    setFunds((prev) => ({ ...prev, [terms.name]: { ...(prev[terms.name] ?? {}), ...terms } }));
    if (addCurrentDeal) setInputs((prev) => ({ ...prev, fundName: terms.name }));
    setFundEditor(null);
  }

  function handleDeleteFund(name) {
    if (!requireEdit()) return;
    setFunds((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  const curveShiftBp = live?.avg30 ? anchorCurveToLive(baseCurve, live.avg30.rate).shiftBp : null;

  function setLinked(linked) {
    if (!requireEdit()) return;
    setDeals((prev) =>
      prev.map((d) =>
        d.id === activeDealId
          ? {
              ...d,
              linked,
              inputs: linked
                ? toMainInputs(d.quick ?? QUICK_DEFAULTS, d.inputs)
                : { ...d.inputs, noiOverrideEnabled: d.inputs.noiOverrideEnabled },
            }
          : d
      )
    );
  }

  const activeDeal = deals.find((d) => d.id === activeDealId) ?? deals[0];
  const inputs = activeDeal.inputs;

  function setInputs(updater) {
    if (!requireEdit()) return;
    setDeals((prev) =>
      prev.map((d) =>
        d.id === activeDealId
          ? { ...d, inputs: typeof updater === "function" ? updater(d.inputs) : updater }
          : d
      )
    );
  }

  // Leases tab → Apply to rent roll: replaces the deal's units (open or
  // saved) and logs each field as from the lease abstract.
  // Leases and Documents tabs: change a deal's inputs (open or saved) and log
  // each field as from the document. entries: [{ field, from, to, key?,
  // unitId?, unitName? }] (unit entries are logged under the unit).
  function applyToDeal(dealId, nextInputs, entries, label) {
    if (!requireEdit()) return false;
    const key = deals.some((d) => d.id === dealId) ? "deals" : savedDeals.some((d) => d.id === dealId) ? "savedDeals" : null;
    if (!key) return false;
    const deal = (key === "deals" ? deals : savedDeals).find((d) => d.id === dealId);
    const area = key === "deals" ? "Deal" : "Saved deal";
    auditSource.current = {
      label,
      entries: entries.map((e) => ({
        area,
        item: deal.inputs.propertyName || dealId,
        field: e.unitId ? `Unit ${e.unitName} › ${e.field}` : e.field,
        path: e.unitId ? [key, dealId, "inputs", "units", e.unitId, e.key] : [key, dealId, "inputs", ...String(e.key).split(".")],
        from: e.from,
        to: e.to,
      })),
    };
    const set = (list) => list.map((d) => (d.id === dealId ? { ...d, inputs: typeof nextInputs === "function" ? nextInputs(d.inputs) : nextInputs } : d));
    if (key === "deals") setDeals(set);
    else setSavedDeals(set);
    return true;
  }
  function handleApplyLease(dealId, units, entries, label) {
    return applyToDeal(dealId, (inp) => ({ ...inp, units }), entries, label);
  }
  // Documents tab → a quarter's valuation mark from an appraisal.
  function applyToMark(dealId, quarter, mark, entries, label) {
    if (!requireEdit()) return false;
    const deal = firmFundDeals.find((d) => d.id === dealId);
    auditSource.current = { label, entries: entries.map((e) => ({ area: "Valuation", item: deal?.inputs?.propertyName || dealId, field: `${quarter} › ${e.field}`, path: ["valuations", dealId, quarter, e.key], from: e.from, to: e.to })) };
    setValuations((prev) => ({ ...prev, [dealId]: { ...(prev[dealId] ?? {}), [quarter]: { ...((prev[dealId] ?? {})[quarter] ?? {}), ...mark } } }));
    return true;
  }
  // Unit Roll → rent delinquency (Yardi) stored with the fund. An import is
  // logged as one note; per-tenant notes as normal changes.
  function setDelinquency(fundName, updater, note) {
    if (!requireEdit()) return;
    if (note) noteAudit(note);
    setFunds((prev) => {
      const cur = prev[fundName] ?? { ...DEFAULT_FUND_TERMS, name: fundName };
      return { ...prev, [fundName]: { ...cur, delinquency: updater(cur.delinquency) } };
    });
  }
  // Documents tab → fund terms and limits from the LPA / PPM.
  function applyToFund(fundName, nextTerms, entries, label) {
    if (!requireEdit()) return false;
    auditSource.current = { label, entries: entries.map((e) => ({ area: "Fund terms", item: fundName, field: e.field, path: ["funds", fundName, ...String(e.key).split(".")], from: e.from, to: e.to })) };
    setFunds((prev) => ({ ...prev, [fundName]: { ...DEFAULT_FUND_TERMS, ...(prev[fundName] ?? {}), name: fundName, ...nextTerms } }));
    return true;
  }
  // Documents tab → New deal from an offering memo.
  function handleNewDealFrom(overrides, note) {
    if (!requireEdit()) return null;
    const d = newDeal(overrides);
    noteAudit(note);
    setDeals((prev) => [...prev, d]);
    setActiveDealId(d.id);
    return d.id;
  }

  // Exit cap from the Sales Comps tab: linked deals change the Quick
  // Underwrite input (which re-maps to every tab); others change the model.
  function handleSetExitCap(pct) {
    if (activeDeal.linked) setQuick((q) => ({ ...q, exitCapPct: pct }));
    else setInputs((prev) => ({ ...prev, exitCapRatePct: pct }));
  }

  // Pipeline (phase M): Screen opens the deal in Deal Screener (a deal with
  // no fund, so it stays out of the fund until it's converted).
  function pipelineToDeal(pl) {
    // No expected close: the end of the quarter about three months out.
    const d0 = new Date();
    const close = pl.expectedClose || new Date(Date.UTC(d0.getUTCFullYear(), Math.floor((d0.getUTCMonth() + 3) / 3) * 3 + 3, 0)).toISOString().slice(0, 10);
    const quick = { ...QUICK_DEFAULTS, ...toQuickInputs(pl), acquisitionDate: close };
    const base = { ...DEFAULT_INPUTS, propertyName: pl.name || "Pipeline deal", address: pl.address, city: pl.city, state: pl.state, ...(pl.sf ? { squareFootage: pl.sf } : {}), fundName: "", units: [] };
    return { id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, linked: true, quick, inputs: toMainInputs(quick, base), pipelineId: pl.id };
  }
  function handleScreenPipeline(pl) {
    if (!requireEdit()) return;
    const have = pl.dealId && deals.find((d) => d.id === pl.dealId);
    if (have) { setActiveDealId(have.id); setActiveTab("quick"); return; }
    const d = pipelineToDeal(pl);
    noteAudit(`Screened pipeline deal ${pl.name}`);
    setDeals((prev) => [...prev, d]);
    setPipeline((p) => ({ ...p, deals: p.deals.map((x) => (x.id === pl.id ? { ...x, dealId: d.id, stage: x.stage === "watching" ? "screening" : x.stage } : x)) }));
    setActiveDealId(d.id);
    setActiveTab("quick");
  }
  // Documents tab: an offering memo starts a pipeline row (phase M).
  function handleAddPipelineFromOM(inp, doc) {
    if (!requireEdit()) return false;
    const row = makePipelineDeal({ name: inp.propertyName || doc.title || "Deal from OM", address: inp.address, city: inp.city, state: inp.state, sf: inp.squareFootage, askingPrice: inp.purchasePrice, noi: inp.noiYear1, source: `OM${doc.title ? `: ${doc.title}` : ""}`, omDocId: doc.id, stage: "screening" }, { by: session?.user?.email ?? "" });
    noteAudit(`Added ${row.name} to the pipeline from an offering memo`);
    setPipeline((p) => ({ ...p, deals: [...(p.deals ?? []), row] }));
    return true;
  }

  // Fund Impact: the one deliberate step that puts a candidate in a fund.
  function handleAddToFund(dealId, fund) {
    if (!requireEdit()) return;
    const d = deals.find((x) => x.id === dealId);
    if (!d) return;
    noteAudit(`Added ${d.inputs.propertyName} to ${fund} from Fund Impact`);
    setDeals((prev) => prev.map((x) => (x.id === dealId ? { ...x, inputs: { ...x.inputs, fundName: fund } } : x)));
    setPipeline((p) => ({ ...p, deals: p.deals.map((x) => (x.dealId === dealId ? { ...x, targetFund: fund } : x)) }));
  }
  const [impactPreselect, setImpactPreselect] = useState([]);
  function handleSendToFundImpact(pl) {
    if (!requireEdit()) return;
    let id = pl.dealId && deals.find((d) => d.id === pl.dealId)?.id;
    if (!id) {
      const d = pipelineToDeal(pl);
      id = d.id;
      noteAudit(`Sent pipeline deal ${pl.name} to Fund Impact`);
      setDeals((prev) => [...prev, d]);
      setPipeline((p) => ({ ...p, deals: p.deals.map((x) => (x.id === pl.id ? { ...x, dealId: d.id } : x)) }));
    }
    setImpactPreselect([id]);
    setActiveTab("impact");
  }

  function handleConvertPipeline(pl) {
    if (!requireEdit()) return;
    const fund = pl.targetFund || "";
    if (!fund) { window.alert(`Choose a target fund for ${pl.name} first.`); return; }
    const close = pl.expectedClose || new Date().toISOString().slice(0, 10);
    if (!window.confirm(`Convert ${pl.name} to an asset of ${fund}, acquired ${close}? It becomes a normal deal in the fund (logged).`)) return;
    const existing = pl.dealId && deals.find((d) => d.id === pl.dealId);
    const d = existing ?? pipelineToDeal(pl);
    const next = { ...d, inputs: { ...d.inputs, fundName: fund, acquisitionDate: close }, ...(d.quick ? { quick: { ...d.quick, acquisitionDate: close } } : {}) };
    noteAudit(`Converted pipeline deal ${pl.name} to an asset of ${fund}`);
    setDeals((prev) => (existing ? prev.map((x) => (x.id === d.id ? next : x)) : [...prev, next]));
    setPipeline((p) => ({ ...p, deals: p.deals.map((x) => (x.id === pl.id ? { ...x, dealId: next.id, converted: true, stage: "closed" } : x)) }));
  }

  function handleAddDeal() {
    if (!requireEdit()) return;
    const d = newDeal();
    setDeals((prev) => [...prev, d]);
    setActiveDealId(d.id);
    setActiveTab("units");
  }

  // Opens a saved fund snapshot as a live deal (moved out of the saved list
  // so the fund counts it once).
  function handleOpenSnapshot(id) {
    if (!requireEdit()) return;
    const snap = savedDeals.find((d) => d.id === id);
    if (!snap) return;
    setDeals((prev) => (prev.some((d) => d.id === id) ? prev : [...prev, { id, inputs: snap.inputs }]));
    setSavedDeals((prev) => prev.filter((d) => d.id !== id));
    setActiveDealId(id);
  }

  const results = useMemo(() => underwrite(inputs), [inputs]);

  // Live fund membership: every open deal with a fund name is in that fund
  // and recalculates as it is edited. Saved snapshots ("Add to Fund") are
  // fixed copies and sit alongside them.
  // One spelling per fund (see lib/fundNames), so every tab groups the same
  // assets together even if a Fund field was typed differently.
  const resolveFund = useMemo(() => fundNameResolver(funds, deals, savedDeals), [funds, deals, savedDeals]);
  const liveFundDeals = useMemo(
    () =>
      deals
        .filter((d) => d.inputs.fundName?.trim())
        .map((d) => ({ ...snapshotDeal({ ...d.inputs, fundName: resolveFund(d.inputs.fundName) }, d.id), live: true })),
    [deals, resolveFund]
  );
  const firmFundDeals = useMemo(
    () => [...liveFundDeals, ...savedDeals.map((d) => withCanonicalFund(d, resolveFund))],
    [liveFundDeals, savedDeals, resolveFund]
  );
  // "Working on": every tab below sees only the chosen fund (All funds = the firm).
  const workingOptions = useMemo(() => workingOnOptions(funds, firmFundDeals.map((d) => d.inputs.fundName)), [funds, firmFundDeals]);
  const scope = validWorkingOn(workingOn, workingOptions);
  const fundDeals = useMemo(() => scopeDeals(firmFundDeals, scope, resolveFund), [firmFundDeals, scope, resolveFund]);
  const viewFunds = useMemo(() => scopeFunds(funds, scope), [funds, scope]);
  const viewDeals = useMemo(() => scopeOpenDeals(deals, scope, resolveFund, pipeline), [deals, scope, resolveFund, pipeline]);
  // A deal outside the chosen fund isn't left open: switch to the fund's first asset.
  useEffect(() => {
    if (scope && viewDeals.length && !viewDeals.some((d) => d.id === activeDealId)) setActiveDealId(viewDeals[0].id);
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  // Remembered choice: the sign-in's saved value, else this browser's.
  useEffect(() => {
    let v = session?.user?.user_metadata?.working_on;
    if (v == null) { try { v = localStorage.getItem("baywise.workingOn"); } catch {} }
    if (typeof v === "string") setWorkingOnRaw(v);
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Revert from the change log: put one field back (only if unchanged since).
  function handleRevert(entry) {
    if (!requireEdit()) return { ok: false, reason: "View only" };
    const root = revertRoot({ deals, funds, valuations, pipeline });
    const r = applyRevert(entry, root);
    if (!r.ok) return r;
    auditSource.current = { label: "Revert", entries: [r.log] };
    const key = entry.path[0];
    if (key === "deals") setDeals(r.root.deals);
    else if (key === "funds") setFunds(r.root.funds);
    else if (key === "valuations") setValuations(r.root.valuations);
    else if (key === "pipeline") setPipeline((p) => ({ ...p, deals: r.root.pipeline }));
    return r;
  }
  // Restore one deal / fund / pipeline deal as of a date (preview, then apply).
  function restorePreview(recordPath, dateISO) {
    // The database log when there is one (verified), else the working log.
    const log = session && dbLink?.id && dbLog?.length ? dbLog : auditLog;
    return restoreAsOf(revertRoot({ deals, funds, valuations, pipeline }), log, recordPath, dateISO);
  }
  function handleRestore(recordPath, dateISO, item) {
    if (!requireEdit()) return { ok: false, reason: "View only" };
    const r = restorePreview(recordPath, dateISO);
    if (!r.changes.length) return { ok: false, reason: "Nothing to restore" };
    auditSource.current = { label: `Restore as of ${dateISO}`, entries: r.changes.map((c) => ({ area: recordPath[0] === "funds" ? "Fund terms" : recordPath[0] === "pipeline" ? "Pipeline" : "Deal", item, field: c.field, path: c.path, from: c.now, to: c.restored, revertOf: "restore" })) };
    if (recordPath[0] === "deals") setDeals(r.root.deals);
    else if (recordPath[0] === "funds") setFunds(r.root.funds);
    else if (recordPath[0] === "pipeline") setPipeline((p) => ({ ...p, deals: r.root.pipeline }));
    return { ok: true, count: r.changes.length };
  }
  // Recently deleted: bring a deal, saved copy or fund back as it was.
  function handleUndelete(item) {
    if (!requireEdit()) return false;
    if (item.kind === "deal") setDeals((prev) => (prev.some((d) => d.id === item.key) ? prev : [...prev, item.data]));
    else if (item.kind === "saved_deal") setSavedDeals((prev) => (prev.some((d) => d.id === item.key) ? prev : [...prev, item.data]));
    else if (item.kind === "fund") setFunds((prev) => (item.key in prev ? prev : { ...prev, [item.key]: item.data }));
    else return false;
    setDeletedRows((rows) => rows.filter((r) => !(r.kind === item.kind && r.key === item.key)));
    return true;
  }
  // Dispositions (phase P): edit one asset's inputs (its sales).
  function updateDealInputs(dealId, fn) {
    if (!requireEdit()) return;
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, inputs: fn(d.inputs) } : d)));
  }
  // Sell/Hold → Start sale: a new sale on the asset (or open the one in progress).
  const [saleOpen, setSaleOpen] = useState(null);
  function handleStartSale(dealId) {
    const d = deals.find((x) => x.id === dealId);
    if (!d) return;
    const cur = (d.inputs.dispositions ?? []).find((s) => ACTIVE_SALE_STAGES.includes(s.stage));
    if (cur) { setSaleOpen(cur.id); setActiveTab("forsale"); return; }
    if (!requireEdit()) return;
    const sale = makeSale({ reason: "hold_reached", startedFrom: "sellhold" });
    noteAudit(`Started a sale of ${d.inputs.propertyName || "an asset"} from Sell/Hold Analysis`);
    updateDealInputs(dealId, (inp) => ({ ...inp, dispositions: [...(inp.dispositions ?? []), sale] }));
    setSaleOpen(sale.id);
    setActiveTab("forsale");
  }
  function setWorkingOn(v) {
    setWorkingOnRaw(v);
    try { localStorage.setItem("baywise.workingOn", v); } catch {}
    if (session) saveWorkingOn(v).catch(() => {});
  }
  // Open deals that aren't in any fund (shown on Portfolio Return so they
  // can be added back with one click).
  const unassignedDeals = deals.filter((d) => !d.inputs.fundName?.trim());
  function handleAssignFund(id, fundName) {
    if (!requireEdit()) return;
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, inputs: { ...d.inputs, fundName } } : d)));
  }

  const { debt, returns, annualCashFlows, waterfall, irrFlows } = results;

  function handleSaveDeal() {
    if (!requireEdit()) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // A deal with a fund name is already in the fund live; label the copy.
    const isLive = !!inputs.fundName?.trim();
    setSavedDeals((prev) => [
      ...prev,
      {
        id,
        inputs: isLive
          ? { ...inputs, propertyName: `${inputs.propertyName || "Deal"} (snapshot)` }
          : { ...inputs },
        irrFlows: [...(irrFlows ?? [])],
        opFlows: annualCashFlows.map((cf) => cf.pretaxCashFlow),
        reversion: returns.equityReversion,
        reserveBasis: annualCashFlows.map((cf) => (cf.debtService ?? 0) + (cf.tiAndLeasing ?? 0) + (cf.assetMgmtFees ?? cf.belowLineAMFees ?? 0) + (cf.managementFee ?? 0) + (cf.constructionMgmtFee ?? 0)),
        metrics: {
          irr: returns.irr,
          equityMultiple: returns.equityMultiple,
          yearOneCashOnCash: returns.yearOneCashOnCash,
          equityRequired: debt.equityRequired,
          loanAmount: debt.loanAmount,
        },
      },
    ]);
  }

  function handleRemoveDeal(id) {
    if (!requireEdit()) return;
    // Live deals leave the fund (fund name cleared) but stay open.
    if (deals.some((d) => d.id === id)) {
      setDeals((prev) =>
        prev.map((d) => (d.id === id ? { ...d, inputs: { ...d.inputs, fundName: "" } } : d))
      );
      return;
    }
    setSavedDeals((prev) => prev.filter((d) => d.id !== id));
  }

  const [sampleOpen, setSampleOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // asset inputs slide-over (phase O)
  const testLoaded = savedDeals.some((d) => d.id.startsWith("test-"));

  function handleLoadTest() {
    if (!requireEdit()) return;
    noteAudit("Loaded the test scenario");
    const { savedDeals: testDeals } = generateTestScenario();
    // Three saved Model Fund I assets; earlier test deals are replaced.
    setDeals((prev) => {
      const existing = prev.filter((d) => !d.id.startsWith("test-"));
      return existing.length ? existing : [linkedDeal()];
    });
    setActiveDealId((prev) => (prev.startsWith("test-") ? deals.find((d) => !d.id.startsWith("test-"))?.id ?? "deal-1" : prev));
    setSavedDeals((prev) => [...prev.filter((d) => !d.id.startsWith("test-")), ...testDeals]);
    setActiveTab("fund");
  }

  // Re-creates the nine sample deals (discarding edits to them), puts the
  // active deal in the sample fund, and opens the Portfolio Return tab.
  function handleLoadSamplePortfolio() {
    if (!requireEdit()) return;
    noteAudit("Loaded Model Fund I (sample assets rebuilt)");
    setDeals((prev) => [
      ...prev.filter((d) => !d.id.startsWith("sample-deal-")),
      ...buildSampleDeals(DEFAULT_INPUTS),
    ]);
    // Make sure the fund has terms (a workspace saved before the rename
    // keeps the terms it had under the old name) and $100M of commitments
    // unless commitments were already entered.
    setFunds((prev) => {
      const terms = prev[SAMPLE_FUND_NAME] ?? { ...DEFAULT_FUND_TERMS, ...(prev[OLD_SAMPLE_FUND_NAME] ?? {}), name: SAMPLE_FUND_NAME };
      return { ...prev, [SAMPLE_FUND_NAME]: { ...terms, targetEquity: terms.targetEquity > 0 ? terms.targetEquity : SAMPLE_FUND_COMMITMENTS, ...(terms.feeModel ? {} : SAMPLE_FUND_FEE_TERMS), rentRollModel: MTM_MODEL, testDataModel: TEST_DATA_MODEL, noiModel: NOI_MODEL, sicModel: SIC_MODEL, sizingModel: SIZING_MODEL } };
    });
    setActiveTab("fund");
  }

  // Drawn photos and floor plans for the sample assets (phase L), added to
  // sample assets with no photos or plan; edits to them are kept.
  function handleAddSampleMedia() {
    if (!requireEdit()) return;
    const n = deals.filter((d) => withSampleMedia(d) !== d).length;
    if (!n) { window.alert("Every sample asset already has photos or a floor plan."); return; }
    noteAudit(`Added drawn sample photos and floor plans to ${n} sample asset${n === 1 ? "" : "s"}`);
    setDeals((prev) => prev.map(withSampleMedia));
  }

  // Risk test data (phase L): made-up lenders, cap counterparties and
  // environmental entries on the sample assets, only where still empty.
  function handleAddRiskTestData() {
    if (!requireEdit()) return;
    const n = deals.filter((d) => withRiskTestData(d) !== d).length;
    if (!n) { window.alert("The sample assets already have lenders, cap providers and environmental entries."); return; }
    noteAudit(`Added risk test data (lenders, cap providers, environmental) to ${n} sample asset${n === 1 ? "" : "s"}`);
    setDeals((prev) => prev.map(withRiskTestData));
  }

  // Sample data menu: the fictional construction jobs and invoices (mock TI actuals) for Model Fund I.
  function handleAddConstructionTestData() {
    if (!requireEdit()) return;
    const jobs = parseJobs(parseCSV(SAMPLE_CONSTRUCTION_JOBS_CSV));
    const invoices = parseInvoices(parseCSV(SAMPLE_CONSTRUCTION_INVOICES_CSV));
    const r = importConstruction(deals.filter((d) => d.id.startsWith("sample-deal-")), { jobs, invoices, asOf: SAMPLE_CONSTRUCTION_AS_OF, source: "sample" });
    const ids = Object.keys(r.updates);
    if (!ids.length) { window.alert("Load Model Fund I first: the construction test data matches its sample assets."); return; }
    noteAudit(`Added construction test data (${jobs.length} jobs, ${invoices.length} invoices) to ${ids.length} sample asset${ids.length === 1 ? "" : "s"}`);
    setDeals((prev) => prev.map((d) => (r.updates[d.id] ? { ...d, inputs: { ...d.inputs, construction: r.updates[d.id] } } : d)));
  }

  function handleClearTest() {
    if (!requireEdit()) return;
    noteAudit("Cleared test and sample data");
    setDeals((prev) => {
      const next = prev.filter((d) => !d.id.startsWith("test-") && !d.id.startsWith("sample-deal-"));
      return next.length > 0 ? next : [linkedDeal()];
    });
    setActiveDealId((prev) => (prev.startsWith("test-") || prev.startsWith("sample-deal-") ? deals.find((d) => !d.id.startsWith("test-") && !d.id.startsWith("sample-deal-"))?.id ?? "deal-1" : prev));
    setSavedDeals((prev) => prev.filter((d) => !d.id.startsWith("test-") && !d.id.startsWith("sample-")));
  }

  // Firm-wide header strip (consolidated; owned assets only).
  const firm = firmSummary(fundDeals, valuations, viewFunds, { todayISO: new Date().toISOString().slice(0, 10) });
  const firmItems = [
    { key: "aum", label: "AUM", value: fmtAum(firm.aum) },
    { key: "sf", label: "Square feet", value: Math.round(firm.sf).toLocaleString("en-US") },
    { key: "assets", label: "Assets", value: `${firm.assets} across ${firm.funds} fund${firm.funds === 1 ? "" : "s"}` },
    { key: "tenants", label: "Tenants", value: firm.tenants.toLocaleString("en-US") },
    { key: "occupancy", label: "Occupancy", value: isFinite(firm.occupancy) ? `${firm.occupancy.toFixed(1)}%` : "—" },
  ];

  // NY Fed live SOFR panel: shown at the top of the Debt tab (11/23); the
  // rates still load app-wide for every deal's forward curve.
  const liveRatesPanel = (
  <div className="mb-4" data-testid="sofr-panel">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
      <span className="flex items-center gap-1.5 font-semibold text-gray-800">
        <span className={`w-2 h-2 rounded-full ${liveStatus === "ok" ? "bg-emerald-500" : liveStatus === "loading" ? "bg-gray-300" : "bg-red-500"}`} />
        NY Fed live
      </span>
      {liveStatus === "ok" && live ? (
        <>
          {live.sofr && (
            <span>
              SOFR <span className="font-semibold text-gray-900 tabular-nums">{live.sofr.rate.toFixed(2)}%</span>{" "}
              <span className="text-gray-400">({fmtISODate(live.sofr.date)})</span>
            </span>
          )}
          {live.avg30 && (
            <span>
              30D avg SOFR <span className="font-semibold text-gray-900 tabular-nums">{live.avg30.rate.toFixed(5)}%</span>{" "}
              <span className="text-gray-400">({fmtISODate(live.avg30.date)})</span>
            </span>
          )}
        </>
      ) : liveStatus === "loading" ? (
        <span className="text-gray-400">Loading…</span>
      ) : (
        <span className="text-red-600">Couldn&apos;t reach the NY Fed API; using the curve as published.</span>
      )}
      <span className="text-gray-300">|</span>
      <span>
        Forward curve: {baseCurve.source} as of <span className="font-medium text-gray-800">{fmtISODate(baseCurve.asOf)}</span>
        {curveShiftBp != null && (
          <span className="text-gray-400">
            {" "}· live 30D avg {curveShiftBp >= 0 ? "+" : "−"}{Math.abs(curveShiftBp).toFixed(1)} bp vs. curve start
          </span>
        )}
      </span>
      <label className={`flex items-center gap-1.5 ${live?.avg30 ? "" : "opacity-40"}`}>
        <input
          type="checkbox"
          checked={anchorToLive}
          disabled={!live?.avg30}
          onChange={(e) => handleAnchorToggle(e.target.checked)}
        />
        Shift curve to live rate
      </label>
      <button
        type="button"
        onClick={() => loadLiveRates().then((r) => r && applyCurveToDeals(effectiveCurve(baseCurve, anchorToLive, r)))}
        className="ml-auto text-blue-600 hover:text-blue-700 font-medium"
      >
        Refresh
      </button>
    </div>
  </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 mr-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Baywise</h1>
              <p className="text-xs text-gray-400 leading-tight">Industrial Real Estate Management</p>
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-1">
            <label className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800" title="Choose the portfolio to work on. Every tab shows only that fund; All funds shows the whole firm.">
              <span className="font-semibold">Working on</span>
              <select aria-label="Working on" data-testid="working-on" value={scope} onChange={(e) => setWorkingOn(e.target.value)} className="rounded border border-blue-200 bg-white px-1.5 py-0.5 text-xs text-gray-800">
                {workingOptions.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            {scope && <span className="text-[11px] font-semibold text-blue-800" data-testid="firm-scope">{scopeLabel(scope, funds)}:</span>}
            {firmItems.map(({ key, label, value }) => (
              <div key={key} title={FIGURE_DEFS[key]} data-testid="firm-figure" className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 cursor-help">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-xs font-bold tabular-nums text-gray-900">{value}</span>
              </div>
            ))}
            <a
              href={MANUAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M4 3.5A1.5 1.5 0 0 1 5.5 2H15a1 1 0 0 1 1 1v12.5a.5.5 0 0 1-.5.5H6a1 1 0 0 0 0 2h9.5a.5.5 0 0 1 0 1H6a2 2 0 0 1-2-2V3.5Z" />
              </svg>
              User manual
            </a>
            <button
              type="button"
              onClick={() => setActiveTab("changes")}
              aria-pressed={activeTab === "changes"}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                activeTab === "changes" ? "border-gray-700 bg-gray-800 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
              title="What changed, when, and who changed it"
            >
              <span aria-hidden="true">↺</span>
              Change log
            </button>
            {/* Signed out, sign in from the View only banner; this button is only the database panel. */}
            {session && (
              <button
                type="button"
                onClick={() => setCloudOpen(true)}
                title={`Signed in as ${session.user.email}. Open the database panel.`}
                className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
              >
                <span aria-hidden="true">☁</span>
                {dbLink?.id ? `${dbLink.name}${dbLink.dirty ? " · unsaved" : ""}` : "Database"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sample data menu (11/23): owners only, since it changes everyone's data. */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pt-4 flex flex-wrap items-center gap-2">
        {/* Setup (phase O, 11/23): the asset inputs open only from here, as a slide-over. */}
        <div className="flex flex-wrap items-center gap-1.5" data-testid="setup-buttons">
          {!locked && (
            <button type="button" onClick={() => { handleAddDeal(); setPanelOpen(true); }} className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5">New asset</button>
          )}
          <select aria-label="Edit asset" value="" onChange={(e) => { if (!e.target.value) return; setActiveDealId(e.target.value); setPanelOpen(true); }} className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700">
            <option value="">Edit asset…</option>
            {[...deals].sort((x, y) => (x.inputs.propertyName || "").localeCompare(y.inputs.propertyName || "")).map((d) => <option key={d.id} value={d.id}>{d.inputs.propertyName || "Unnamed deal"}{d.inputs.fundName ? ` · ${d.inputs.fundName}` : " · pipeline"}</option>)}
          </select>
          {!locked && <button type="button" onClick={() => setFundEditor({ mode: "new" })} className="text-xs font-medium text-blue-700 border border-blue-200 bg-white hover:bg-blue-50 rounded-lg px-3 py-1.5">New fund</button>}
          <select aria-label="Edit fund" value="" onChange={(e) => { if (!e.target.value) return; setFundEditor({ mode: "edit", name: e.target.value }); }} className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700">
            <option value="">Edit fund…</option>
            {Object.keys(funds).sort().map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {(!session || dbLink?.role === "owner") && (
          <div className="relative" data-testid="sample-data-menu">
            <button
              type="button"
              aria-expanded={sampleOpen}
              aria-haspopup="menu"
              onClick={() => setSampleOpen((o) => !o)}
              title="Owners only: load or remove the fictional sample fund and test deals"
              className="text-xs text-gray-500 hover:text-amber-700 border border-gray-200 hover:border-amber-300 bg-white rounded-lg px-3 py-1.5 transition-colors"
            >
              Sample data ▾
            </button>
            {sampleOpen && (
              <div role="menu" className="absolute left-0 z-30 mt-1 w-80 rounded-lg border border-amber-200 bg-white p-2 shadow-lg">
                <p className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
                  For demos and testing. These change the firm&apos;s data for everyone and are logged in the change log. The sample assets and addresses are fictional.
                </p>
                {[
                  { label: "Load Model Fund I", sub: "Rebuild the nine fictional sample assets (edits to them are lost)", run: handleLoadSamplePortfolio, ask: "Load Model Fund I? This rebuilds the nine fictional sample assets in the firm's data for everyone; any edits to them are lost." },
                  { label: "Add drawn photos to the sample assets", sub: "Drawn photos and floor plans for sample assets with none (edits kept)", run: handleAddSampleMedia, ask: "Add drawn (fictional) photos and floor plans to the sample assets that have none? Nothing else on them changes." },
                  { label: "Add risk test data to the sample assets", sub: "Made-up lenders, cap providers and environmental entries (where empty)", run: handleAddRiskTestData, ask: "Add made-up lenders, rate cap providers and environmental entries to the sample assets where they're empty? Nothing else changes." },
                  { label: "Add construction test data", sub: "Fictional TI and capital jobs with invoices for the sample assets (replaces earlier sample jobs)", run: handleAddConstructionTestData, ask: "Add the fictional construction jobs and invoices (mock TI actuals) to the sample assets? Earlier sample jobs are replaced; nothing else changes." },
                  { label: "Load test scenario", sub: "Add three fictional test deals to Model Fund I", run: handleLoadTest, ask: "Load the test scenario? This adds three fictional test deals to the firm's data for everyone." },
                  { label: "Clear test data", sub: "Remove all sample and test deals", run: handleClearTest, ask: "Clear test data? This removes every sample and test deal from the firm's data for everyone. Your own deals are not touched." },
                ].map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSampleOpen(false);
                      if (window.confirm(a.ask)) a.run();
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span className={`block text-xs font-medium ${a.label.startsWith("Clear") ? "text-red-600" : "text-gray-800"}`}>{a.label}</span>
                    <span className="block text-[11px] text-gray-500">{a.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <span className="ml-auto text-[11px] text-gray-400">
          {!session ? "Not saved. Sign in to save to the database" : !dbLink ? "Opening the firm's data…" : null}
        </span>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportWorkspace(f);
            e.target.value = "";
          }}
        />
        {session && dbLink?.id ? (
          <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${dbLink.conflict || dbLink.error ? "border-red-200 bg-red-50 text-red-800" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
            <span aria-hidden="true">☁</span>
            <button type="button" onClick={() => setCloudOpen(true)} className="font-semibold hover:underline" title="Database">{dbLink.name}</button>
            {dbLink.mode !== "records" && <span className="text-sky-700">v{dbLink.version}</span>}
            {dbLink.conflict ? (
              <>
                <span>· someone else saved a newer version</span>
                <button type="button" onClick={() => openDbWorkspace(dbLink).catch((e) => setDbLink((l) => ({ ...l, error: e.message })))} className="rounded border border-red-300 bg-white px-1.5 py-0.5 font-medium">Open latest</button>
                <button type="button" onClick={() => window.confirm("Save your version over the newer one? The newer one stays in the database's version history.") && overwriteDb().catch(() => {})} className="rounded border border-red-300 bg-white px-1.5 py-0.5 font-medium">Keep mine</button>
              </>
            ) : dbLink.error ? (
              <span>· {dbLink.error}</span>
            ) : dbLink.role === "viewer" ? (
              <span className="text-sky-700">· view only</span>
            ) : dbLink.dirty ? (
              <span className="text-amber-700">· unsaved changes</span>
            ) : (
              dbLink.savedAt && <span className="text-sky-700">· saved {new Date(dbLink.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            )}
            {dbLink.role !== "viewer" && !dbLink.conflict && (
              <button type="button" onClick={() => saveToDbNow(true).catch(() => {})} className="ml-1 rounded border border-sky-300 bg-white px-1.5 py-0.5 font-medium text-sky-800 hover:bg-sky-100">Save now</button>
            )}
          </span>
        ) : session && dbLink?.error ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
            <span aria-hidden="true">☁</span> Couldn&apos;t open the firm&apos;s data: {dbLink.error}
            <button type="button" onClick={() => setCloudOpen(true)} className="rounded border border-red-300 bg-white px-1.5 py-0.5 font-medium">Database…</button>

          </span>
        ) : null}
        {recordNotice && (
          <span className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" role="status" data-testid="record-notice">
            {recordNotice}
            <button type="button" onClick={() => setRecordNotice(null)} aria-label="Dismiss" className="text-amber-700">✕</button>
          </span>
        )}
        {dbLink?.importPending && dbLink.role === "owner" && (
          <span className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900" data-testid="import-old-app">
            Changes were saved by the old app after the move.
            <button type="button" onClick={() => importFromOldApp().catch((e) => setRecordNotice(e.message))} className="rounded border border-violet-300 bg-white px-1.5 py-0.5 font-medium">Import changes made in the old app</button>
          </span>
        )}
        {cloudOpen && (
          <CloudPanel
            session={session}
            link={dbLink?.id ? dbLink : null}
            recovery={pwRecovery}
            onRecoveryDone={() => setPwRecovery(false)}
            onClose={() => setCloudOpen(false)}
            onSaveNow={() => saveToDbNow(true)}
            onSignOut={async () => {
              await saveToDbNow().catch(() => {});
              await signOut();
              // Clear the workspace from the screen: nothing stays in the browser.
              window.location.reload();
            }}
          />
        )}
        <button
          type="button"
          onClick={handleExportWorkspace}
          title="Download a copy of all the firm's data (deals, funds, capital activity, valuations, comps, curve, change log) to keep"
          className="text-xs text-gray-600 hover:text-blue-700 border border-gray-200 hover:border-blue-200 bg-white rounded-lg px-3 py-1.5 transition-colors"
        >
          Download backup
        </button>
        {(!session || dbLink?.role === "owner") && (
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            title="Owners only: replace all of the firm's data with a backup file (a backup of the current data downloads first)"
            className="text-xs text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-200 bg-white rounded-lg px-3 py-1.5 transition-colors"
          >
            Restore from backup
          </button>
        )}
        {importMsg && (
          <p className={`basis-full text-right text-[11px] ${importMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
            {importMsg.text}
            <button type="button" onClick={() => setImportMsg(null)} className="ml-2 text-gray-400 hover:text-gray-700" aria-label="Dismiss">✕</button>
          </p>
        )}
      </div>

      {/* Asset inputs slide-over (phase O): opens only from New asset / Edit asset. */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Asset inputs" onKeyDown={(e) => e.key === "Escape" && setPanelOpen(false)}>
          <div className="absolute inset-0 bg-gray-900/20" onClick={() => setPanelOpen(false)} />
          <aside className="relative z-10 flex h-full w-[26rem] max-w-full flex-col bg-white shadow-2xl" data-testid="asset-panel">
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-gray-400">Asset inputs</div>
                <div className="truncate text-sm font-semibold text-gray-900">{inputs.propertyName || "Unnamed deal"}</div>
              </div>
              <button type="button" autoFocus onClick={() => setPanelOpen(false)} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Done</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <DealInputsPanel
                linked={!!activeDeal.linked}
                key={activeDealId}
                inputs={inputs}
                onChange={setInputs}
                fundNames={[...new Set([...Object.keys(funds), ...fundDeals.map((d) => d.inputs.fundName?.trim()).filter(Boolean)])]}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Body */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 flex gap-6 items-start">

        {/* Right: results */}
        <main className="flex-1 min-w-0 space-y-5">
          {locked && (
            <div
              role="status"
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                lockFlash ? "border-amber-400 bg-amber-100 ring-2 ring-amber-300" : "border-amber-200 bg-amber-50"
              } text-amber-900`}
            >
              <span>
                <span className="font-semibold">View only.</span>{" "}
                {viewerOnly
                  ? `You have viewer access to ${dbLink.name}. Ask an owner for editor access to make changes.`
                  : noWorkspace
                    ? dbLink?.error
                      ? `Couldn't open your workspace: ${dbLink.error}`
                      : "Opening your workspace from the database…"
                    : "Sign in to enter or change data. You can still look around every tab. Nothing is saved until you sign in."}
              </span>
              {noWorkspace && dbLink?.error && (
                <button type="button" onClick={() => setCloudOpen(true)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                  ☁ Database…
                </button>
              )}
              {!session && (
                <button type="button" onClick={() => setCloudOpen(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                  ☁ Sign in
                </button>
              )}
            </div>
          )}

          {/* Tab bar: grouped, with a small header over each group */}
          <nav className="flex flex-wrap items-end gap-x-2 gap-y-2 bg-white border border-gray-200 rounded-xl p-1.5 w-fit max-w-full shadow-sm" aria-label="Tabs">
            <div className="flex flex-col gap-0.5 pr-1" role="group" aria-label="Home">
              <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">&nbsp;</span>
              <button type="button" onClick={() => setActiveTab("home")} className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeTab === "home" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"}`}>Home</button>
            </div>
            {TAB_GROUPS.filter((g) => g.tabs.length).map((g, gi) => (
              <div key={g.label} className={`flex flex-col gap-0.5 border-l border-gray-200 pl-2`} role="group" aria-label={g.label} data-testid="tab-group">
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</span>
                <div className="flex flex-wrap gap-1">
                  {g.tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        activeTab === tab.id
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {tab.label}
                      {tab.id === "units" && inputs.units.length > 0 && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "units" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                          {inputs.units.length}
                        </span>
                      )}
                      {tab.id === "fund" && fundDeals.length > 0 && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === "fund" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>
                          {fundDeals.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {activeTab === "home" && (
              <HomeView
                market={comps?.market ?? null}
                deals={fundDeals}
                funds={viewFunds}
                valuations={valuations}
                pipeline={scope ? { ...pipeline, deals: (pipeline?.deals ?? []).filter((d) => d.targetFund === scope) } : pipeline}
                log={session && dbLink?.id && dbLog?.length ? dbLog : auditLog}
                firm={firm}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                scopeName={scope ? scopeLabel(scope, funds) : ""}
                tabLabels={{ ...Object.fromEntries(TAB_GROUPS.flatMap((g) => g.tabs.map((t) => [t.id, t.label]))), changes: "Change log" }}
                onOpenTab={setActiveTab}
                onOpenDeal={(id, tab) => { if (deals.some((d) => d.id === id)) setActiveDealId(id); setActiveTab(tab); }}
                actions={[
                  { label: "New asset", primary: true, disabled: locked, run: () => { handleAddDeal(); setPanelOpen(true); } },
                  { label: "New fund setup", disabled: locked, run: () => setFundEditor({ mode: "new" }) },
                  { label: "Upload rent roll", title: "Unit Roll tab: upload a rent roll for the asset", run: () => setActiveTab("units") },
                  { label: "Upload Yardi actuals", title: "Asset Business Plan tab: upload monthly actuals", run: () => setActiveTab("plan") },
                  { label: "Import marks", title: "Valuation tab: import quarterly marks", run: () => setActiveTab("valuations") },
                  { label: "Record capital activity", title: "Fund Return tab: capital calls, distributions and line draws", run: () => setActiveTab("fund") },
                  { label: "New report", title: "Reports tab: quarterly and risk reports", run: () => setActiveTab("reports") },
                ]}
              />
            )}
            {["forsale", "offers", "trackrecord", "dispdocs"].includes(activeTab) && (
              <Dispositions
                key={`disp-${saleOpen ?? ""}`}
                initialOpen={saleOpen}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                email={session?.user?.email ?? null}
                funds={funds}
                fundDeals={firmFundDeals}
                view={activeTab}
                deals={viewDeals}
                valuations={valuations}
                canEdit={!locked}
                onUpdate={updateDealInputs}
                scopeName={scope ? scopeLabel(scope, funds) : ""}
              />
            )}
            {DEAL_TABS.has(activeTab) && (
              <AssetPicker
                deals={viewDeals}
                snapshots={savedDeals.filter((s) => !deals.some((d) => d.id === s.id))}
                activeId={activeDealId}
                onPick={setActiveDealId}
                onOpenSnapshot={handleOpenSnapshot}
                label={`${viewDeals.length} open${scope ? ` in ${scope}` : ""}${savedDeals.length ? ` · ${savedDeals.length} saved` : ""}`}
              />
            )}
            {["taxes", "insurance", "condition", "contracts"].includes(activeTab) && (
              <PropertyMgmt
                key={activeTab}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                email={session?.user?.email ?? null}
                tab={activeTab}
                deal={activeDeal}
                deals={viewDeals.filter((d) => d.inputs.fundName?.trim())}
                canEdit={!locked}
                onUpdate={updateDealInputs}
                scopeName={scope ? scopeLabel(scope, funds) : ""}
              />
            )}
            {activeTab === "market" && (
              <MarketData comps={comps} onChange={setComps} deals={viewDeals.filter((d) => d.inputs.fundName?.trim())} canEdit={!locked} onUpdateDeal={updateDealInputs} />
            )}
            {activeTab === "funddebt" && (
              <FundDebt deals={viewDeals.filter((d) => d.inputs.fundName?.trim()).map((d) => ({ ...d, inputs: { ...d.inputs, fundName: resolveFund(d.inputs.fundName) } }))} funds={viewFunds} marks={valuations} />
            )}
            {activeTab === "leasing" && (
              <Leasing
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                email={session?.user?.email ?? null}
                deal={activeDeal}
                deals={viewDeals.filter((d) => d.inputs.fundName?.trim())}
                canEdit={!locked}
                onUpdate={updateDealInputs}
                scopeName={scope ? scopeLabel(scope, funds) : ""}
              />
            )}
            {activeTab === "units" && (
              <UnitRoll
                units={inputs.units}
                inputs={inputs}
                onChange={(units) => setInputs((prev) => ({ ...prev, units }))}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                dealId={activeDeal.id}
                delinquencyByUnit={(() => {
                  const dq = funds[resolveFund(inputs.fundName)]?.delinquency;
                  const ms = Object.keys(dq?.months ?? {}).sort();
                  if (!ms.length) return null;
                  const a = aggregateDelinquency(dq.months[ms.at(-1)], dq.mapping, [{ id: activeDeal.id, inputs }]);
                  return { month: ms.at(-1), byUnit: Object.fromEntries(a.tenants.filter((t) => t.unitId).map((t) => [t.unitId, t])) };
                })()}
              />
            )}
            {activeTab === "units" && inputs.fundName?.trim() && (
              <div className="mt-4">
                <Delinquency
                  fundName={resolveFund(inputs.fundName)}
                  deals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === resolveFund(inputs.fundName)).map((d) => ({ id: d.id, inputs: (deals.find((x) => x.id === d.id) ?? d).inputs }))}
                  dealId={activeDeal.id}
                  delinq={funds[resolveFund(inputs.fundName)]?.delinquency ?? {}}
                  canEdit={!locked}
                  onChange={(updater, note) => setDelinquency(resolveFund(inputs.fundName), updater, note)}
                />
              </div>
            )}
            {activeTab === "quick" && (() => {
              // Deal Screener: pipeline deals only (phase M, 11/23).
              const today = new Date().toISOString().slice(0, 10);
              const owned = !isPipeline(activeDeal, today);
              const pl = (pipeline.deals ?? []).find((x) => x.dealId === activeDeal.id);
              return (
                <div className="space-y-4">
                  <ScreenerPicker activeDeal={activeDeal} deals={deals} todayISO={today} owned={owned} onSelect={(id) => setActiveDealId(id)} pipelineRow={pl ?? null} onSyncRow={locked ? null : (patch) => { if (!requireEdit()) return; noteAudit(`Updated pipeline row ${pl.name} from Deal Screener`); setPipeline((p) => ({ ...p, deals: p.deals.map((x) => (x.id === pl.id ? { ...x, ...patch } : x)) })); }} />
                  {!owned && (
                    <>
                      <ScreenerFundImpact activeDeal={activeDeal} deals={deals} funds={viewFunds} todayISO={today} curve={effectiveCurve(baseCurve, anchorToLive, live)} defaultFund={pl?.targetFund || ""} />
                      <QuickUnderwrite
                        inputs={activeDeal.quick ?? QUICK_DEFAULTS}
                        onChange={setQuick}
                        linked={!!activeDeal.linked}
                        onLinkChange={setLinked}
                        onCurveImport={handleCurveImport}
                      />
                    </>
                  )}
                </div>
              );
            })()}
            {activeTab === "cashflow" && <CashFlowAnalysis inputs={inputs} results={results} />}
            {activeTab === "debt" && liveRatesPanel}
            {activeTab === "debt" && (
              <DebtSizingPanel
                debt={debt}
                cashFlows={annualCashFlows}
                inputs={inputs}
                cap={capSettingsFor(activeDeal.quick, inputs)}
                onCapChange={setCap}
              />
            )}
            {activeTab === "debt" && (
              <LoanAgreementPanel
                deal={activeDeal}
                results={results}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                canEdit={!!(session && dbLink?.id && dbLink.role !== "viewer")}
                email={session?.user?.email ?? null}
                fundName={resolveFund(inputs.fundName)}
                onOpenDocuments={() => setActiveTab("documents")}
              />
            )}
{activeTab === "returns" && (
              <ReturnsAnalysis returns={returns} cashFlows={annualCashFlows} waterfall={waterfall} inputs={inputs} savedDeals={fundDeals.filter((d) => d.id !== activeDealId)} dscr={debt.dscr} />
            )}
            {activeTab === "sensitivity" && (
              <SensitivityTables
                inputs={inputs}
                baseIRR={returns.irr}
                baseEM={returns.equityMultiple}
              />
            )}
            {activeTab === "stress" && (
              <StressTest
                market={comps?.market ?? null}
                inputs={inputs}
                results={results}
                savedDeals={fundDeals}
              />
            )}
            {activeTab === "pipeline" && (
              <Pipeline
                key={`pipeline-${scope}`}
                workingOn={scope}
                pipeline={pipeline}
                onChange={setPipeline}
                fundNames={Object.keys(funds)}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                onScreen={handleScreenPipeline}
                onConvert={handleConvertPipeline}
                onSendToFundImpact={handleSendToFundImpact}
                deals={deals}
                funds={viewFunds}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
              />
            )}
            {activeTab === "impact" && (
              <FundImpact
                key={impactPreselect.join(",")}
                deals={deals}
                funds={viewFunds}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                preselect={impactPreselect}
                onFundTermsChange={handleFundTermsChange}
                onAddToFund={handleAddToFund}
              />
            )}
            {activeTab === "reports" && (
              <Reports
                pipeline={unassignedDeals}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                onApplyDeal={applyToDeal}
                deals={fundDeals}
                funds={viewFunds}
                marks={valuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                onFundTermsChange={handleFundTermsChange}
              />
            )}
            {activeTab === "distributions" && (
              <DistributionAnalysis
                deals={fundDeals}
                funds={viewFunds}
                marks={valuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                onFundTermsChange={handleFundTermsChange}
              />
            )}
            {activeTab === "fundsummary" && (
              <FundSummary
                deals={deals}
                funds={viewFunds}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                onFundTermsChange={handleFundTermsChange}
                onOpenTab={setActiveTab}
              />
            )}
            {activeTab === "fundplan" && (
              <FundPlan
                deals={fundDeals}
                funds={viewFunds}
                marks={valuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                onFundTermsChange={handleFundTermsChange}
              />
            )}
            {activeTab === "benchmark" && (
              <Benchmarking deals={fundDeals} funds={viewFunds} marks={valuations} curve={effectiveCurve(baseCurve, anchorToLive, live)} comps={comps} onChange={setComps} canEdit={!locked} email={session?.user?.email ?? null} />
            )}
            {activeTab === "gpecon" && (
              <GpEconomics deals={fundDeals} funds={viewFunds} curve={effectiveCurve(baseCurve, anchorToLive, live)} scopeName={scope ? scopeLabel(scope, funds) : ""} />
            )}
            {activeTab === "fund" && (
              <>
              {Object.entries(viewFunds).filter(([, f]) => Object.keys(f?.delinquency?.months ?? {}).length).map(([name, f]) => (
                <div key={name} className="mb-4">
                  <DelinquencySummary
                    delinq={f.delinquency}
                    deals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === name).map((d) => ({ id: d.id, inputs: (deals.find((x) => x.id === d.id) ?? d).inputs }))}
                    title={`${name} rent delinquency`}
                    onOpen={() => setActiveTab("units")}
                  />
                </div>
              ))}
              <FundNav
                deals={fundDeals}
                funds={viewFunds}
                marks={valuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                onOpenValuation={() => setActiveTab("valuations")}
              />
              {[...new Set(fundDeals.map((d) => resolveFund(d.inputs.fundName)).filter(Boolean))].map((name) => (
                <FundUwTable
                  key={`uw-${name}`}
                  fundName={name}
                  deals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === name).map((d) => ({ id: d.id, inputs: (deals.find((x) => x.id === d.id) ?? d).inputs }))}
                  onOpen={() => setActiveTab("assets")}
                />
              ))}
              <div className="mb-4">
                <BudgetVsActualSummary deals={fundDeals.map((d) => ({ id: d.id, inputs: (deals.find((x) => x.id === d.id) ?? d).inputs }))} onOpen={() => setActiveTab("plan")} />
              </div>
              <FundAnalysis
                savedDeals={fundDeals}
                unassigned={unassignedDeals.map((d) => ({ id: d.id, name: d.inputs.propertyName || "Unnamed deal" }))}
                onAssignFund={handleAssignFund}
                allAssets={[
                  ...deals.map((d) => ({ id: d.id, inputs: d.inputs })),
                  ...savedDeals.filter((s) => !deals.some((d) => d.id === s.id)),
                ]}
                currentDeal={{ inputs, irrFlows: irrFlows ?? [], metrics: { irr: returns.irr, equityMultiple: returns.equityMultiple, yearOneCashOnCash: returns.yearOneCashOnCash, equityRequired: debt.equityRequired, loanAmount: debt.loanAmount } }}
                onSave={handleSaveDeal}
                onRemove={handleRemoveDeal}
                funds={viewFunds}
                onFundTermsChange={handleFundTermsChange}
                onNewFund={() => setFundEditor({ mode: "new" })}
                onEditFund={(name) => setFundEditor({ mode: "edit", name })}
                onDeleteFund={handleDeleteFund}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
              />
              </>
            )}
            {activeTab === "assets" && (
              <AssetSummary
                deals={fundDeals}
                funds={viewFunds}
                marks={valuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                onOpenDeal={(id) => {
                  if (!deals.some((d) => d.id === id)) return;
                  setActiveDealId(id);
                  setActiveTab("plan"); // owned assets open on their business plan (Deal Screener is for the pipeline)
                }}
                onOpenLeases={(id) => {
                  if (!deals.some((d) => d.id === id)) return;
                  setActiveDealId(id);
                  setActiveTab("leases");
                }}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                onApplyDeal={applyToDeal}
              />
            )}
            {activeTab === "sellhold" && (
              <SellHold
                deal={fundDeals.find((d) => d.id === activeDealId) ?? null}
                fundDeals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === resolveFund(inputs.fundName))}
                fundName={resolveFund(inputs.fundName)}
                terms={inputs.fundName?.trim() ? { ...DEFAULT_FUND_TERMS, ...(funds[resolveFund(inputs.fundName)] ?? {}), name: resolveFund(inputs.fundName) } : null}
                canEdit={!locked}
                onTermsChange={(patch) => handleFundTermsChange(resolveFund(inputs.fundName), patch)}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                onStartSale={handleStartSale}
                saleInProgress={(inputs.dispositions ?? []).some((s) => ACTIVE_SALE_STAGES.includes(s.stage))}
              />
            )}
            {activeTab === "valuations" && (
              <Valuations
                deals={fundDeals}
                funds={viewFunds}
                marks={valuations}
                onMarksChange={setValuations}
                onOpenFundReturn={() => setActiveTab("fund")}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                onOpenDoc={session && dbLink?.id ? async (docId, page) => {
                  const d = (await listDealDocs(dbLink.id)).find((x) => x.id === docId);
                  if (d?.files?.[0]) window.open(`${await dealFileLink(d.files[0].path)}${page ? `#page=${page}` : ""}`, "_blank", "noopener");
                } : null}
              />
            )}
            {activeTab === "changes" && (
              <ChangeLog
                log={auditLog}
                user={auditUser}
                onUserChange={changeAuditUser}
                signedInEmail={session?.user?.email ?? null}
                dbLog={dbLink?.id && session ? dbLog : null}
                dbName={dbLink?.name}
                canRevert={locked ? null : (e) => revertCheck(e, revertRoot({ deals, funds, valuations, pipeline }))}
                onRevert={locked ? null : handleRevert}
                restoreRecords={[
                  ...deals.map((d) => ({ path: ["deals", d.id], label: `Asset: ${d.inputs.propertyName || "Unnamed deal"}` })),
                  ...Object.keys(funds).sort().map((n) => ({ path: ["funds", n], label: `Fund: ${n}` })),
                  ...(pipeline?.deals ?? []).map((d) => ({ path: ["pipeline", d.id], label: `Pipeline: ${d.name || "Pipeline deal"}` })),
                ]}
                restorePreview={restorePreview}
                onRestore={locked ? null : handleRestore}
                deleted={recentlyDeleted(deletedRows, { deals, savedDeals, funds })}
                onUndelete={locked ? null : handleUndelete}
              />
            )}
            {activeTab === "leases" && (
              <Leases
                workspace={session && dbLink?.id ? dbLink : null}
                signedIn={!!session}
                email={session?.user?.email ?? null}
                userId={session?.user?.id ?? null}
                canEdit={!!(session && dbLink?.id && dbLink.role !== "viewer")}
                deal={activeDeal}
                fundDeals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === resolveFund(inputs.fundName))}
                fundName={resolveFund(inputs.fundName)}
                dealInputs={(id) => (deals.find((d) => d.id === id) ?? savedDeals.find((d) => d.id === id))?.inputs ?? null}
                onApplyUnits={handleApplyLease}
                extraDates={entityDates(funds[resolveFund(inputs.fundName)]?.entities ?? [], resolveFund(inputs.fundName))}
              />
            )}
            {activeTab === "plan" && (
              <BusinessPlan
                key={activeDealId}
                dealId={activeDealId}
                inputs={inputs}
                fundName={resolveFund(inputs.fundName)}
                fundType={inputs.fundName?.trim() ? fundType(funds[resolveFund(inputs.fundName)]?.type) : ""}
                fundDeals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === resolveFund(inputs.fundName)).map((d) => ({ id: d.id, inputs: (deals.find((x) => x.id === d.id) ?? d).inputs }))}
                canEdit={!locked}
                email={session?.user?.email ?? null}
                onApplyDeal={applyToDeal}
              />
            )}
            {activeTab === "plan" && (
              <div className="mt-6">
                <AssetMedia
                  key={`media-${activeDealId}`}
                  dealId={activeDealId}
                  inputs={inputs}
                  canEdit={!locked}
                  workspaceId={session && dbLink?.id ? dbLink.id : null}
                  onApplyDeal={applyToDeal}
                />
              </div>
            )}
            {activeTab === "documents" && (
              <Documents
                workspace={session && dbLink?.id ? dbLink : null}
                signedIn={!!session}
                email={session?.user?.email ?? null}
                userId={session?.user?.id ?? null}
                canEdit={!!(session && dbLink?.id && dbLink.role !== "viewer")}
                deal={activeDeal}
                fundDeals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === resolveFund(inputs.fundName))}
                fundName={resolveFund(inputs.fundName)}
                funds={funds}
                dealInputs={(id) => (deals.find((d) => d.id === id) ?? savedDeals.find((d) => d.id === id))?.inputs ?? null}
                onApplyDeal={applyToDeal}
                onApplyFund={applyToFund}
                onNewDeal={handleNewDealFrom}
                onAddPipeline={handleAddPipelineFromOM}
                marks={valuations}
                onApplyMark={applyToMark}
              />
            )}
            {activeTab === "research" && (
              <Research
                deal={activeDeal}
                deals={viewDeals}
                firmComps={comps}
                canEdit={!locked}
                onUpdate={updateDealInputs}
                workspaceId={session && dbLink?.id ? dbLink.id : null}
                email={session?.user?.email ?? null}
                scopeName={scope ? scopeLabel(scope, funds) : ""}
                subject={{
                  name: inputs.propertyName,
                  price: inputs.purchasePrice,
                  sf: inputs.squareFootage,
                  noi1: annualCashFlows[0]?.noi ?? 0,
                  exitNOI: annualCashFlows[(inputs.holdPeriodYears ?? annualCashFlows.length) - 1]?.noi ?? 0,
                  exitValue: returns.exitValue,
                  exitCap: returns.exitCapRate,
                  holdYears: inputs.holdPeriodYears,
                  acquisitionDate: inputs.acquisitionDate || activeDeal.quick?.acquisitionDate,
                }}
                onSetExitCap={handleSetExitCap}
              />
            )}
            {fundEditor && (
              <FundTermsEditor
                key={fundEditor.mode + (fundEditor.name ?? "")}
                mode={fundEditor.mode}
                initial={fundEditor.mode === "edit" ? { ...DEFAULT_FUND_TERMS, ...(funds[fundEditor.name] ?? {}), name: fundEditor.name } : undefined}
                existingNames={[...new Set([...Object.keys(funds), ...fundDeals.map((d) => d.inputs.fundName?.trim()).filter(Boolean)])]}
                currentDealName={inputs.propertyName}
                onSave={handleFundSave}
                onClose={() => setFundEditor(null)}
                workspaceId={session && dbLink?.id && dbLink.role !== "viewer" ? dbLink.id : null}
                email={session?.user?.email ?? null}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
