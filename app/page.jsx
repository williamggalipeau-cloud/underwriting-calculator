"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { underwrite } from "@/lib/calculations";
import { generateTestScenario, TEST_ACQUISITION_DATES, TEST_PREVIOUS_HOLDS } from "@/lib/testScenario";
import DealInputsPanel from "@/components/DealInputs";
import DebtSizingPanel from "@/components/DebtSizing";
import ReturnsAnalysis from "@/components/ReturnsAnalysis";
import SensitivityTables from "@/components/SensitivityTables";
import AssetPicker from "@/components/AssetPicker";
import Leases from "@/components/Leases";
import { withLocation } from "@/lib/assetLocations";
import UnitRoll from "@/components/UnitRoll";
import FundAnalysis from "@/components/FundAnalysis";
import StressTest from "@/components/StressTest";
import QuickUnderwrite from "@/components/QuickUnderwrite";
import CashFlowAnalysis from "@/components/CashFlowAnalysis";
import SalesComps, { DEFAULT_COMPS_STATE } from "@/components/SalesComps";
import Valuations from "@/components/Valuations";
import AssetSummary from "@/components/AssetSummary";
import { QUICK_DEFAULTS, toMainInputs } from "@/lib/quickUnderwrite";
import { buildSampleDeals, currentSampleDate, currentSampleHold, sampleUnitCount, snapshotDeal, SAMPLE_FUND_NAME, OLD_SAMPLE_FUND_NAME, SAMPLE_FUND_COMMITMENTS } from "@/lib/samplePortfolio";
import { DEFAULT_CURVE } from "@/lib/forwardCurve";
import { anchorCurveToLive, fetchNyFedRates } from "@/lib/nyfed";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import { fundNameResolver, mergeFundTerms, withCanonicalFund } from "@/lib/fundNames";
import { appendChanges, auditSnapshot, BULK_LIMIT, diffWorkspace } from "@/lib/audit";
import CloudPanel from "@/components/CloudPanel";
import {
  REQUIRE_SIGN_IN,
  claimInvites,
  createWorkspace as dbCreateWorkspace,
  deleteWorkspace as dbDeleteWorkspace,
  fetchAudit,
  getSession,
  listWorkspaces,
  loadWorkspace as dbLoadWorkspace,
  onAuthChange,
  saveWorkspace as dbSaveWorkspace,
  signOut,
  supabase,
} from "@/lib/cloud";
import ChangeLog from "@/components/ChangeLog";
import FundTermsEditor from "@/components/FundTermsEditor";
import { clearLegacyBrowserData, clearLegacyExtras, isWorkspace, readLegacyWorkspace } from "@/lib/workspace";

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
  return {
    deals: deals.map((d) => withCanonicalFund(d, resolve)),
    savedDeals: savedDeals.map((d) => withCanonicalFund(d, resolve)),
    funds: mergeFundTerms(funds, resolve),
  };
}

function initialFunds() {
  return { [SAMPLE_FUND_NAME]: { ...DEFAULT_FUND_TERMS, name: SAMPLE_FUND_NAME, targetEquity: SAMPLE_FUND_COMMITMENTS } };
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
    minDSCREnabled:     false,
    minDSCR:            1.25,
    maxLTCEnabled:      false,
    maxLTCPct:          75,
    minDebtYieldEnabled: false,
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


// The starting deal: driven by the Quick Underwrite tab (direct NOI), so
// every tab analyses the same light-industrial acquisition.
function linkedDeal(id = "deal-1") {
  return {
    id,
    linked: true,
    quick: QUICK_DEFAULTS,
    inputs: toMainInputs(QUICK_DEFAULTS, withLocation({
      ...DEFAULT_INPUTS,
      propertyName: "Light Industrial (30k SF)",
      squareFootage: 30000,
      fundName: SAMPLE_FUND_NAME,
    })),
  };
}

// The app opens with a live fund: the linked deal plus nine sample assets,
// all editable deals in Model Fund I.
function initialDeals() {
  return [linkedDeal(), ...buildSampleDeals(DEFAULT_INPUTS)];
}

function newDeal(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    inputs: { ...DEFAULT_INPUTS, propertyName: "New Deal", ...overrides },
  };
}

const TABS = [
  { id: "quick",       label: "Quick Underwrite" },
  { id: "units",       label: "Unit Roll" },
  { id: "leases",      label: "Leases" },
  { id: "debt",        label: "Debt" },
  { id: "cashflow",    label: "Cash Flow" },
  { id: "stress",      label: "Return Stress Testing" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "returns",     label: "Asset Return" },
  { id: "fund",        label: "Portfolio Return" },
  { id: "assets",      label: "Asset Summary" },
  { id: "valuations",  label: "Valuations" },
  { id: "comps",       label: "Sales Comps" },
  { id: "changes",     label: "Change Log" },
];

// Tabs that show one deal: they get the Asset dropdown.
const DEAL_TABS = new Set(["quick", "units", "leases", "debt", "cashflow", "returns", "sensitivity", "comps"]);

function fmtPct(n) {
  return isFinite(n) ? `${n.toFixed(1)}%` : "—";
}
function fmtX(n) {
  return isFinite(n) ? `${n.toFixed(2)}x` : "—";
}
function fmtDollarM(n) {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function Home() {
  const [deals, setDealsRaw] = useState(initialDeals);
  const [activeDealId, setActiveDealId] = useState("deal-1");
  const [activeTab, setActiveTab] = useState("quick");
  const [savedDeals, setSavedDealsRaw] = useState([]);
  // Fund terms by fund name (timeline, waterfall, fee).
  const [funds, setFundsRaw] = useState(initialFunds);
  const [fundEditor, setFundEditor] = useState(null); // null | { mode: "new" } | { mode: "edit", name }
  const [comps, setCompsRaw] = useState(DEFAULT_COMPS_STATE);
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
  // After signing in: claim invites, move any workspace an earlier version
  // saved in this browser into the database, then open the most recently
  // saved workspace (creating one if the user has none).
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId || !ready) return;
    let stop = false;
    claimInvites()
      .catch(() => {})
      .then(async () => {
        if (stop || dbLinkRef.current) return;
        const legacy = readLegacyWorkspace();
        if (legacy) {
          const name = `Moved from browser ${new Date().toLocaleDateString()}`;
          const id = await dbCreateWorkspace(name, { ...legacy, app: "industrial-uw" });
          clearLegacyBrowserData();
          if (!stop) await openDbWorkspace({ id });
          return;
        }
        const list = await listWorkspaces();
        if (stop || dbLinkRef.current) return;
        if (list.length) {
          await openDbWorkspace(list[0]);
        } else {
          const id = await dbCreateWorkspace(SAMPLE_FUND_NAME, workspaceData());
          if (!stop) await openDbWorkspace({ id });
        }
      })
      .catch((e) => !stop && setDbLink({ id: null, name: "", error: e.message }));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready]);
  // Verified change log for the Change Log tab.
  useEffect(() => {
    if (activeTab !== "changes" || !dbLink?.id || !session) return;
    let stop = false;
    fetchAudit(dbLink.id)
      .then((r) => !stop && setDbLog(r))
      .catch(() => {});
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
      const snap = auditSnapshot({ deals, savedDeals, funds, comps, valuations, baseCurve });
      let log = auditLogRef.current;
      if (auditBaseline.current && !auditNote.current) {
        const changes = diffWorkspace(auditBaseline.current, snap);
        if (changes.length) log = appendChanges(log, changes, { user: editorName });
      } else if (auditNote.current) {
        log = appendChanges(log, [], { user: editorName, note: auditNote.current });
        auditNote.current = null;
      }
      auditBaseline.current = snap;
      // Database: take the baseline after opening, or mark unsaved changes.
      let schedule = false;
      if (dbLinkRef.current) {
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
      latestData.current = { v: 1, app: "industrial-uw", deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, valuations, auditLog: log };
      if (schedule) {
        clearTimeout(dbTimer.current);
        dbTimer.current = setTimeout(() => saveRef.current?.(), DB_SAVE_SECONDS * 1000);
      }
    }, 400);
    return () => clearTimeout(t);
    // auditLog/auditUser are read through refs/closure; changes to them alone don't need a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, valuations]);

  // ── Export / import the workspace as a JSON file (a backup copy you keep,
  // or to load one into the open database workspace).
  function handleExportWorkspace() {
    const at = new Date().toISOString();
    const data = { v: 1, app: "industrial-uw", exportedAt: at, savedAt: dbLink?.savedAt ?? at, deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, valuations, auditLog };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `underwriting-workspace-${at.slice(0, 10)}.json`);
    setImportMsg({ ok: true, text: `Exported ${plural(deals.length, "deal")}, ${plural(Object.keys(funds).length, "fund")} and ${plural(comps.comps?.length ?? 0, "comp")}.` });
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
    if (!window.confirm(`Replace the open workspace${dbLink?.name ? ` (${dbLink.name})` : ""} with the file (${saved.deals.length} deals)? It saves to the database as a new version; the current one stays in the version history.`)) return;
    applyWorkspace(saved, `Imported workspace file ${file.name}`);
    setImportMsg({ ok: true, text: `Imported ${plural(saved.deals.length, "deal")}, ${plural(Object.keys(saved.funds ?? {}).length, "fund")} and ${plural(saved.comps?.comps?.length ?? 0, "comp")}.` });
  }

  // Loads a saved workspace (database row or export) into the app.
  function applyWorkspace(saved, note) {
    // Fill settings added since it was saved with their defaults and re-map
    // linked deals onto the full model.
    {
      const w = normalizeWorkspaceFunds(saved);
      setDealsRaw(w.deals);
      setSavedDealsRaw(w.savedDeals);
      setFundsRaw(w.funds);
    }
    const base = saved.baseCurve?.points?.length ? saved.baseCurve : DEFAULT_CURVE;
    const anchor = typeof saved.anchorToLive === "boolean" ? saved.anchorToLive : true;
    setBaseCurveRaw(base);
    setAnchorToLiveRaw(anchor);
    setActiveDealId(saved.deals.some((d) => d.id === saved.activeDealId) ? saved.activeDealId : saved.deals[0].id);
    setCompsRaw({ ...DEFAULT_COMPS_STATE, ...(saved.comps ?? {}) });
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
    dbBaseline.current = "pending";
    linkDb({ ...meta, version: row.version }, { savedAt: row.updated_at });
  }

  async function createDbWorkspace(name) {
    const data = workspaceData();
    const id = await dbCreateWorkspace(name, data);
    dbBaseline.current = auditSnapshot(data);
    linkDb({ id, name, version: 1, role: "owner" }, { savedAt: new Date().toISOString() });
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
    if (changes.length > BULK_LIMIT) changes = [{ area: "Workspace", item: "Bulk change", field: `${changes.length} fields changed`, note: "Bulk change" }];
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

  function unlinkDb() {
    clearTimeout(dbTimer.current);
    dbLinkRef.current = null;
    setDbLink(null);
    setDbLog(null);
  }

  const workspaceData = () => ({ v: 1, app: "industrial-uw", savedAt: new Date().toISOString(), deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, valuations, auditLog });

  function handleResetWorkspace() {
    if (!requireEdit()) return;
    if (!window.confirm(`Reset ${dbLink?.name ? `"${dbLink.name}"` : "the workspace"} to the starting deals? Your deals, funds and imported curve are replaced; the current version stays in the database's version history.`)) return;
    const fresh = initialDeals();
    noteAudit("Reset the workspace");
    setSavedDeals([]);
    setComps(DEFAULT_COMPS_STATE);
    setValuations({});
    setFunds(initialFunds());
    setBaseCurve(DEFAULT_CURVE);
    setAnchorToLive(true);
    setActiveDealId(fresh[0].id);
    setDeals(live?.avg30 ? fresh.map((d) => {
      const quick = { ...d.quick, forwardCurve: anchorCurveToLive(DEFAULT_CURVE, live.avg30.rate).curve };
      return { ...d, quick, inputs: toMainInputs(quick, d.inputs) };
    }) : fresh);
  }

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

  // Exit cap from the Sales Comps tab: linked deals change the Quick
  // Underwrite input (which re-maps to every tab); others change the model.
  function handleSetExitCap(pct) {
    if (activeDeal.linked) setQuick((q) => ({ ...q, exitCapPct: pct }));
    else setInputs((prev) => ({ ...prev, exitCapRatePct: pct }));
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

  function handleCloseDeal(id) {
    if (!requireEdit()) return;
    setDeals((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (next.length === 0) {
        const fresh = newDeal({ propertyName: "Small Bay Industrial" });
        setActiveDealId(fresh.id);
        return [fresh];
      }
      if (id === activeDealId) {
        setActiveDealId(next[next.length - 1].id);
      }
      return next;
    });
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
  const fundDeals = useMemo(
    () => [...liveFundDeals, ...savedDeals.map((d) => withCanonicalFund(d, resolveFund))],
    [liveFundDeals, savedDeals, resolveFund]
  );
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

  const testLoaded = savedDeals.some((d) => d.id.startsWith("test-"));

  function handleLoadTest() {
    if (!requireEdit()) return;
    noteAudit("Loaded the test scenario");
    const { activeDealInputs, savedDeals: testDeals } = generateTestScenario();
    const testDealId = "test-active";
    setDeals((prev) => {
      const existing = prev.filter((d) => d.id !== testDealId && !d.id.startsWith("test-"));
      return [{ id: testDealId, inputs: activeDealInputs }, ...existing];
    });
    setActiveDealId(testDealId);
    setActiveTab("units");
    // The active test deal is in Fund I live, so drop its saved copy.
    setSavedDeals((prev) => [
      ...prev.filter((d) => !d.id.startsWith("test-")),
      ...(activeDealInputs.fundName?.trim() ? testDeals.slice(1) : testDeals),
    ]);
  }

  // Re-creates the nine sample deals (discarding edits to them), puts the
  // active deal in the sample fund, and opens the Portfolio Return tab.
  function handleLoadSamplePortfolio() {
    if (!requireEdit()) return;
    noteAudit("Loaded Model Fund I (sample assets rebuilt)");
    setDeals((prev) => [
      ...prev
        .filter((d) => !d.id.startsWith("sample-deal-"))
        .map((d) => (d.id === activeDealId ? { ...d, inputs: { ...d.inputs, fundName: SAMPLE_FUND_NAME } } : d)),
      ...buildSampleDeals(DEFAULT_INPUTS),
    ]);
    // Make sure the fund has terms (a workspace saved before the rename
    // keeps the terms it had under the old name) and $100M of commitments
    // unless commitments were already entered.
    setFunds((prev) => {
      const terms = prev[SAMPLE_FUND_NAME] ?? { ...DEFAULT_FUND_TERMS, ...(prev[OLD_SAMPLE_FUND_NAME] ?? {}), name: SAMPLE_FUND_NAME };
      return { ...prev, [SAMPLE_FUND_NAME]: { ...terms, targetEquity: terms.targetEquity > 0 ? terms.targetEquity : SAMPLE_FUND_COMMITMENTS } };
    });
    setActiveTab("fund");
  }

  function handleClearTest() {
    if (!requireEdit()) return;
    noteAudit("Cleared test and sample data");
    setDeals((prev) => {
      const next = prev.filter((d) => !d.id.startsWith("test-") && !d.id.startsWith("sample-deal-"));
      return next.length > 0 ? next : [linkedDeal()];
    });
    setActiveDealId((prev) => (prev.startsWith("test-") || prev.startsWith("sample-deal-") ? "deal-1" : prev));
    setSavedDeals((prev) => prev.filter((d) => !d.id.startsWith("test-") && !d.id.startsWith("sample-")));
  }

  const summaryItems = [
    { label: "IRR", value: fmtPct(returns.irr), good: returns.irr >= 14 },
    { label: "Eq. Multiple", value: fmtX(returns.equityMultiple), good: returns.equityMultiple >= 2 },
    { label: "CoC Y1", value: fmtPct(returns.yearOneCashOnCash), good: returns.yearOneCashOnCash >= 7 },
    { label: "Cap Rate", value: fmtPct(returns.goingInCapRate), good: true },
    { label: "DSCR", value: `${debt.dscr.toFixed(2)}x`, good: debt.dscr >= 1.25 },
    { label: "Equity", value: fmtDollarM(debt.equityRequired), good: true },
  ];

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
              <h1 className="text-sm font-bold text-gray-900 leading-tight">Industrial UW</h1>
              <p className="text-xs text-gray-400 leading-tight">
                {inputs.propertyName || "Unnamed Deal"}
                {inputs.fundName && <span className="ml-1.5 text-gray-300">· {inputs.fundName}</span>}
              </p>
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-1">
            {summaryItems.map(({ label, value, good }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5"
              >
                <span className="text-xs text-gray-500">{label}</span>
                <span className={`text-xs font-bold tabular-nums ${good ? "text-gray-900" : "text-red-600"}`}>
                  {value}
                </span>
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

      {/* Live rates */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pt-4">
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

      {/* Test scenario buttons */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleLoadTest}
          className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 bg-white rounded-lg px-3 py-1.5 transition-colors font-medium"
        >
          Load test scenario
        </button>
        <button
          type="button"
          onClick={handleLoadSamplePortfolio}
          className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 bg-white rounded-lg px-3 py-1.5 transition-colors font-medium"
        >
          Load Model Fund I
        </button>
        <button
          type="button"
          onClick={handleClearTest}
          className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 bg-white rounded-lg px-3 py-1.5 transition-colors"
        >
          Clear test data
        </button>
        <span className="ml-auto text-[11px] text-gray-400">
          {!session ? "Not saved. Sign in to save to the database" : !dbLink ? "Opening your workspace…" : null}
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
            <span className="text-sky-700">v{dbLink.version}</span>
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
            <span aria-hidden="true">☁</span> Couldn&apos;t open your database workspace: {dbLink.error}
            <button type="button" onClick={() => setCloudOpen(true)} className="rounded border border-red-300 bg-white px-1.5 py-0.5 font-medium">Database…</button>

          </span>
        ) : null}
        {cloudOpen && (
          <CloudPanel
            session={session}
            link={dbLink?.id ? dbLink : null}
            recovery={pwRecovery}
            onRecoveryDone={() => setPwRecovery(false)}
            onClose={() => setCloudOpen(false)}
            onCreate={createDbWorkspace}
            onOpen={(w) => openDbWorkspace(w)}
            onSaveNow={() => saveToDbNow(true)}
            onDelete={async (w) => {
              await dbDeleteWorkspace(w.id);
              if (dbLinkRef.current?.id === w.id) unlinkDb();
            }}
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
          title="Download your deals, funds, comps and curve as a file"
          className="text-xs text-gray-600 hover:text-blue-700 border border-gray-200 hover:border-blue-200 bg-white rounded-lg px-3 py-1.5 transition-colors"
        >
          Export workspace
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          title="Load a workspace file exported from another browser or computer"
          className="text-xs text-gray-600 hover:text-blue-700 border border-gray-200 hover:border-blue-200 bg-white rounded-lg px-3 py-1.5 transition-colors"
        >
          Import workspace
        </button>
        <button
          type="button"
          onClick={handleResetWorkspace}
          className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 bg-white rounded-lg px-3 py-1.5 transition-colors"
        >
          Reset workspace
        </button>
        {importMsg && (
          <p className={`basis-full text-right text-[11px] ${importMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
            {importMsg.text}
            <button type="button" onClick={() => setImportMsg(null)} className="ml-2 text-gray-400 hover:text-gray-700" aria-label="Dismiss">✕</button>
          </p>
        )}
      </div>

      {/* Body */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 flex gap-6 items-start">
        {/* Left: inputs */}
        <aside className="w-80 shrink-0 sticky top-[73px] max-h-[calc(100vh-90px)] flex flex-col gap-0">
          {/* Deal switcher */}
          <div className="bg-white rounded-t-2xl border border-b-0 border-gray-200 shadow-sm px-3 pt-3 pb-0">
            <div className="flex items-center gap-1 overflow-x-auto pb-0 scrollbar-hide">
              {deals.map((deal) => {
                const isActive = deal.id === activeDealId;
                return (
                  <div
                    key={deal.id}
                    className={`flex items-center gap-1 shrink-0 rounded-t-lg px-3 py-2 cursor-pointer border-b-2 transition-all ${
                      isActive
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                    onClick={() => setActiveDealId(deal.id)}
                  >
                    <span className="text-xs font-medium max-w-[100px] truncate">
                      {deal.inputs.propertyName || "Unnamed"}
                    </span>
                    {deals.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleCloseDeal(deal.id); }}
                        className={`ml-0.5 rounded-full w-4 h-4 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors ${isActive ? "text-blue-400" : "text-gray-300"}`}
                        title="Close deal"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
              {/* New deal button */}
              <button
                type="button"
                onClick={handleAddDeal}
                title="Add new deal"
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors ml-0.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Inputs panel */}
          <div className="bg-white rounded-b-2xl border border-gray-200 shadow-sm p-5 overflow-y-auto flex-1">
            <DealInputsPanel
              linked={!!activeDeal.linked}
              key={activeDealId}
              inputs={inputs}
              onChange={setInputs}
              fundNames={[...new Set([...Object.keys(funds), ...fundDeals.map((d) => d.inputs.fundName?.trim()).filter(Boolean)])]}
            />
          </div>
        </aside>

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

          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit max-w-full shadow-sm">
            {TABS.map((tab) => (
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

          {/* Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {DEAL_TABS.has(activeTab) && (
              <AssetPicker
                deals={deals}
                snapshots={savedDeals.filter((s) => !deals.some((d) => d.id === s.id))}
                activeId={activeDealId}
                onPick={setActiveDealId}
                onOpenSnapshot={handleOpenSnapshot}
                label={`${deals.length} open${savedDeals.length ? ` · ${savedDeals.length} saved` : ""}`}
              />
            )}
            {activeTab === "units" && (
              <UnitRoll
                units={inputs.units}
                inputs={inputs}
                onChange={(units) => setInputs((prev) => ({ ...prev, units }))}
              />
            )}
            {activeTab === "quick" && (
              <QuickUnderwrite
                inputs={activeDeal.quick ?? QUICK_DEFAULTS}
                onChange={setQuick}
                linked={!!activeDeal.linked}
                onLinkChange={setLinked}
                onCurveImport={handleCurveImport}
              />
            )}
            {activeTab === "cashflow" && <CashFlowAnalysis inputs={inputs} results={results} />}
            {activeTab === "debt" && <DebtSizingPanel debt={debt} cashFlows={annualCashFlows} inputs={inputs} />}
{activeTab === "returns" && (
              <ReturnsAnalysis returns={returns} cashFlows={annualCashFlows} waterfall={waterfall} inputs={inputs} savedDeals={fundDeals.filter((d) => d.id !== activeDealId)} />
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
                inputs={inputs}
                results={results}
                savedDeals={fundDeals}
              />
            )}
            {activeTab === "fund" && (
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
                funds={funds}
                onFundTermsChange={handleFundTermsChange}
                onNewFund={() => setFundEditor({ mode: "new" })}
                onEditFund={(name) => setFundEditor({ mode: "edit", name })}
                onDeleteFund={handleDeleteFund}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
              />
            )}
            {activeTab === "assets" && (
              <AssetSummary
                deals={fundDeals}
                funds={funds}
                marks={valuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
                onOpenDeal={(id) => {
                  if (!deals.some((d) => d.id === id)) return;
                  setActiveDealId(id);
                  setActiveTab("quick");
                }}
              />
            )}
            {activeTab === "valuations" && (
              <Valuations
                deals={fundDeals}
                funds={funds}
                marks={valuations}
                onMarksChange={setValuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
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
              />
            )}
            {activeTab === "leases" && (
              <Leases
                workspace={session && dbLink?.id ? dbLink : null}
                signedIn={!!session}
                email={session?.user?.email ?? null}
                canEdit={!!(session && dbLink?.id && dbLink.role !== "viewer")}
                deal={activeDeal}
                fundDeals={fundDeals.filter((d) => resolveFund(d.inputs.fundName) === resolveFund(inputs.fundName))}
                fundName={resolveFund(inputs.fundName)}
              />
            )}
            {activeTab === "comps" && (
              <SalesComps
                state={comps}
                onChange={setComps}
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
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
