"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { underwrite } from "@/lib/calculations";
import { generateTestScenario } from "@/lib/testScenario";
import DealInputsPanel from "@/components/DealInputs";
import DebtSizingPanel from "@/components/DebtSizing";
import ReturnsAnalysis from "@/components/ReturnsAnalysis";
import SensitivityTables from "@/components/SensitivityTables";
import UnitRoll from "@/components/UnitRoll";
import FundAnalysis from "@/components/FundAnalysis";
import StressTest from "@/components/StressTest";
import QuickUnderwrite from "@/components/QuickUnderwrite";
import CashFlowAnalysis from "@/components/CashFlowAnalysis";
import SalesComps, { DEFAULT_COMPS_STATE } from "@/components/SalesComps";
import Valuations from "@/components/Valuations";
import { QUICK_DEFAULTS, toMainInputs } from "@/lib/quickUnderwrite";
import { buildSampleDeals, snapshotDeal, SAMPLE_FUND_NAME, OLD_SAMPLE_FUND_NAME, SAMPLE_FUND_COMMITMENTS } from "@/lib/samplePortfolio";
import { DEFAULT_CURVE } from "@/lib/forwardCurve";
import { anchorCurveToLive, fetchNyFedRates } from "@/lib/nyfed";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import FundTermsEditor from "@/components/FundTermsEditor";

// Workspace saved in this browser (deals, funds, snapshots, curve).
const STORAGE_KEY = "uw-workspace-v1";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const MANUAL_URL = "https://github.com/williamggalipeau-cloud/underwriting-calculator/blob/main/docs/USER_MANUAL.md";

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

  holdPeriodYears: 7,
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
    inputs: toMainInputs(QUICK_DEFAULTS, {
      ...DEFAULT_INPUTS,
      propertyName: "Light Industrial (30k SF)",
      squareFootage: 30000,
      fundName: SAMPLE_FUND_NAME,
    }),
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
  { id: "debt",        label: "Debt" },
  { id: "cashflow",    label: "Cash Flow" },
  { id: "stress",      label: "Return Stress Testing" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "returns",     label: "Asset Return" },
  { id: "fund",        label: "Portfolio Return" },
  { id: "valuations",  label: "Valuations" },
  { id: "comps",       label: "Sales Comps" },
];

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
  const [deals, setDeals] = useState(initialDeals);
  const [activeDealId, setActiveDealId] = useState("deal-1");
  const [activeTab, setActiveTab] = useState("quick");
  const [savedDeals, setSavedDeals] = useState([]);
  // Fund terms by fund name (timeline, waterfall, fee).
  const [funds, setFunds] = useState(initialFunds);
  const [fundEditor, setFundEditor] = useState(null); // null | { mode: "new" } | { mode: "edit", name }
  const [savedAt, setSavedAt] = useState(null);
  const [comps, setComps] = useState(DEFAULT_COMPS_STATE);
  // Fair value marks: { [dealId]: { [quarterEndISO]: { value, source, appraiser, capRate, capex, notes } } }
  const [valuations, setValuations] = useState({});
  const hydrated = useRef(false);
  const importRef = useRef(null);
  const [importMsg, setImportMsg] = useState(null); // { ok, text }
  // Quick Underwrite inputs live on each deal. When a deal is linked, every
  // change is mapped onto its full-model inputs so all tabs stay in sync.
  function setQuick(updater) {
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
  const [baseCurve, setBaseCurve] = useState(DEFAULT_CURVE);
  const [anchorToLive, setAnchorToLive] = useState(true);
  const [live, setLive] = useState(null);
  const [liveStatus, setLiveStatus] = useState("loading"); // loading | ok | error

  function effectiveCurve(curve, anchor, liveRates) {
    return anchor && liveRates?.avg30 ? anchorCurveToLive(curve, liveRates.avg30.rate).curve : curve;
  }

  // Puts a curve on every deal; linked deals re-map onto every tab.
  function applyCurveToDeals(curve, forcePensford = false) {
    setDeals((prev) =>
      prev.map((d) => {
        const q = d.quick ?? QUICK_DEFAULTS;
        const quick = { ...q, forwardCurve: curve, sofrCurveSource: forcePensford ? "pensford" : q.sofrCurveSource };
        return { ...d, quick, inputs: d.linked ? toMainInputs(quick, d.inputs) : d.inputs };
      })
    );
  }

  // An imported Pensford curve replaces the base curve on every deal.
  function handleCurveImport(curve) {
    setBaseCurve(curve);
    applyCurveToDeals(effectiveCurve(curve, anchorToLive, live), true);
  }

  function handleAnchorToggle(on) {
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

  // On load: restore the saved workspace (if any), then fetch live NY Fed
  // rates and re-anchor the restored curve.
  useEffect(() => {
    let cancelled = false;
    let restoredBase = DEFAULT_CURVE;
    let restoredAnchor = true;
    Promise.resolve()
      .then(() => {
        let saved = null;
        try {
          saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
        } catch {
          saved = null;
        }
        if (cancelled || !saved?.deals?.length) return;
        // Fill settings added since the workspace was saved (e.g. new fees)
        // with their defaults, and re-map linked deals onto the full model.
        setDeals(
          saved.deals.map((d) => {
            if (!d.quick) return d;
            const quick = { ...QUICK_DEFAULTS, ...d.quick };
            return { ...d, quick, inputs: d.linked ? toMainInputs(quick, d.inputs) : d.inputs };
          })
        );
        setSavedDeals(saved.savedDeals ?? []);
        setFunds(saved.funds ?? initialFunds());
        if (saved.baseCurve?.points?.length) restoredBase = saved.baseCurve;
        if (typeof saved.anchorToLive === "boolean") restoredAnchor = saved.anchorToLive;
        setBaseCurve(restoredBase);
        setAnchorToLive(restoredAnchor);
        if (saved.deals.some((d) => d.id === saved.activeDealId)) setActiveDealId(saved.activeDealId);
        setSavedAt(saved.savedAt ?? null);
        if (saved.comps) setComps({ ...DEFAULT_COMPS_STATE, ...saved.comps });
        if (saved.valuations && typeof saved.valuations === "object") setValuations(saved.valuations);
      })
      .finally(() => {
        hydrated.current = true;
      })
      .then(() => fetchNyFedRates())
      .then((r) => {
        if (cancelled) return;
        setLive(r);
        setLiveStatus("ok");
        if (r.avg30 && restoredAnchor) applyCurveToDeals(anchorCurveToLive(restoredBase, r.avg30.rate).curve);
      })
      .catch(() => !cancelled && setLiveStatus("error"));
    return () => {
      cancelled = true;
    };
    // Runs once on mount; later updates go through the handlers above.
  }, []);

  // Save the workspace whenever it changes (after the initial restore).
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      try {
        const at = new Date().toISOString();
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ v: 1, savedAt: at, deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, valuations })
        );
        setSavedAt(at);
      } catch {
        // Storage full or blocked: the app keeps working, unsaved.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, valuations]);

  // ── Export / import the workspace as a JSON file (to move it between
  // browsers or computers). Same content as the browser save.
  function handleExportWorkspace() {
    const at = new Date().toISOString();
    const data = { v: 1, app: "industrial-uw", exportedAt: at, savedAt: savedAt ?? at, deals, savedDeals, funds, baseCurve, anchorToLive, activeDealId, comps, valuations };
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `underwriting-workspace-${at.slice(0, 10)}.json`);
    setImportMsg({ ok: true, text: `Exported ${plural(deals.length, "deal")}, ${plural(Object.keys(funds).length, "fund")} and ${plural(comps.comps?.length ?? 0, "comp")}.` });
  }

  async function handleImportWorkspace(file) {
    let saved;
    try {
      saved = JSON.parse(await file.text());
    } catch {
      setImportMsg({ ok: false, text: "That file isn't a workspace export (it couldn't be read as JSON)." });
      return;
    }
    if (!Array.isArray(saved?.deals) || !saved.deals.length || !saved.deals.every((d) => d && d.id && d.inputs)) {
      setImportMsg({ ok: false, text: "That file isn't a workspace export (no deals found)." });
      return;
    }
    if (!window.confirm(`Replace this browser's workspace with the file (${saved.deals.length} deals)? Your current deals, funds and comps here will be overwritten.`)) return;
    // Same migration as the browser restore: fill new settings with defaults
    // and re-map linked deals onto the full model.
    setDeals(
      saved.deals.map((d) => {
        if (!d.quick) return d;
        const quick = { ...QUICK_DEFAULTS, ...d.quick };
        return { ...d, quick, inputs: d.linked ? toMainInputs(quick, d.inputs) : d.inputs };
      })
    );
    setSavedDeals(Array.isArray(saved.savedDeals) ? saved.savedDeals : []);
    setFunds(saved.funds && typeof saved.funds === "object" ? saved.funds : initialFunds());
    const base = saved.baseCurve?.points?.length ? saved.baseCurve : DEFAULT_CURVE;
    const anchor = typeof saved.anchorToLive === "boolean" ? saved.anchorToLive : true;
    setBaseCurve(base);
    setAnchorToLive(anchor);
    setActiveDealId(saved.deals.some((d) => d.id === saved.activeDealId) ? saved.activeDealId : saved.deals[0].id);
    setComps({ ...DEFAULT_COMPS_STATE, ...(saved.comps ?? {}) });
    setValuations(saved.valuations && typeof saved.valuations === "object" ? saved.valuations : {});
    // Re-anchor the imported curve to today's live rate, as on page load.
    if (anchor && live?.avg30) applyCurveToDeals(anchorCurveToLive(base, live.avg30.rate).curve);
    setImportMsg({ ok: true, text: `Imported ${plural(saved.deals.length, "deal")}, ${plural(Object.keys(saved.funds ?? {}).length, "fund")} and ${plural(saved.comps?.comps?.length ?? 0, "comp")}.` });
  }

  function handleResetWorkspace() {
    if (!window.confirm("Reset the workspace? This removes your saved deals, funds and imported curve from this browser.")) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    const fresh = initialDeals();
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
    setSavedAt(null);
  }

  // ── Fund terms ──
  function handleFundTermsChange(name, patch) {
    setFunds((prev) => ({ ...prev, [name]: { ...DEFAULT_FUND_TERMS, ...(prev[name] ?? {}), name, ...patch } }));
  }

  function handleFundSave(terms, { addCurrentDeal } = {}) {
    setFunds((prev) => ({ ...prev, [terms.name]: terms }));
    if (addCurrentDeal) setInputs((prev) => ({ ...prev, fundName: terms.name }));
    setFundEditor(null);
  }

  function handleDeleteFund(name) {
    setFunds((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  const curveShiftBp = live?.avg30 ? anchorCurveToLive(baseCurve, live.avg30.rate).shiftBp : null;

  function setLinked(linked) {
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
    const d = newDeal();
    setDeals((prev) => [...prev, d]);
    setActiveDealId(d.id);
    setActiveTab("units");
  }

  function handleCloseDeal(id) {
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
  const liveFundDeals = useMemo(
    () =>
      deals
        .filter((d) => d.inputs.fundName?.trim())
        .map((d) => ({ ...snapshotDeal(d.inputs, d.id), live: true })),
    [deals]
  );
  const fundDeals = useMemo(() => [...liveFundDeals, ...savedDeals], [liveFundDeals, savedDeals]);

  const { debt, returns, annualCashFlows, waterfall, irrFlows } = results;

  function handleSaveDeal() {
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
    const { activeDealInputs, savedDeals: testDeals } = generateTestScenario();
    const testDealId = "test-active";
    setDeals((prev) => {
      const existing = prev.filter((d) => d.id !== testDealId);
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
    setDeals((prev) => {
      const next = prev.filter((d) => d.id !== "test-active" && !d.id.startsWith("sample-deal-"));
      return next.length > 0 ? next : [linkedDeal()];
    });
    setActiveDealId((prev) => (prev === "test-active" || prev.startsWith("sample-deal-") ? "deal-1" : prev));
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
          {savedAt ? `Saved in this browser ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Not saved yet"}
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
            {activeTab === "valuations" && (
              <Valuations
                deals={fundDeals}
                funds={funds}
                marks={valuations}
                onMarksChange={setValuations}
                curve={effectiveCurve(baseCurve, anchorToLive, live)}
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
