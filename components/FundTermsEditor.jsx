"use client";

import { fundType } from "@/lib/fundTypes";
import { useEffect, useState } from "react";
import { FEE_KEYS, FEE_PAYEES, gpPartiesOf, partiesOf, firmRoleLabel } from "@/lib/gpEconomics";
import { MARKET_FLAG_FIELDS, flagsOf } from "@/lib/marketCheck";
import { compareDoc, setTermPath } from "@/lib/dealDocApply";
import { createDealDocWithFallback, listDealDocs } from "@/lib/dealDocs";
import {
  DEFAULT_FUND_TERMS,
  MAX_TIERS,
  downloadBlob,
  normalizeTerms,
  safeFileName,
  termsFromFile,
  termsToCSV,
  termsToXlsx,
  validateTerms,
} from "@/lib/fundTerms";
import { fundDates } from "@/lib/fundTimeline";
import { AUTHORITIES, INVESTOR_TYPES, RESTRICTION_KINDS, SOURCE_LABEL, addRestriction, agreementTerm, removeRestriction, restrictionsOf, reviewSections, setupSteps, setupWords, typeDefaults, withTarget } from "@/lib/portfolioSetup";
import FundTypeBadge from "@/components/FundTypeBadge";

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

function Num({ label, value, onChange, suffix, prefix, step = 1, min = 0, hint }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="flex items-center border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
        {prefix && <span className="px-2.5 py-1.5 bg-gray-50 border-r border-gray-200 text-gray-500 text-sm">{prefix}</span>}
        <input
          type="number"
          value={value ?? ""}
          min={min}
          step={step}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-sm text-gray-900 outline-none tabular-nums"
        />
        {suffix && <span className="px-2.5 py-1.5 bg-gray-50 border-l border-gray-200 text-gray-500 text-sm">{suffix}</span>}
      </span>
      {hint && <span className="text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

// New Portfolio Setup / Edit Portfolio (1.1.29; user, 11/28): a fund, a joint
// venture or a separate account is set up in its own steps (Document, Investor,
// Capital and fees, Returns, Restrictions and dates, Review), with its own
// wording and only the terms that apply. The type is chosen first, then fixed.
// The fund's LPA / PPM (Documents tab, fund-level): each term and limit read
// from them, beside the form, to use one by one. Upload here too.
// The governing document by portfolio type (user, 11/24): a fund's LPA / PPM,
// a joint venture's JVA, a separate account's SMA.
const GOV_DOCS = { Fund: [["lpa", "LPA"], ["ppm", "PPM"]], "Joint Venture": [["jva", "JVA"]], "Separate Account": [["sma", "SMA / IMA"]] };
function LpaPanel({ workspaceId, email, fundName, terms, onUse, onUseLimit }) {
  const kinds = GOV_DOCS[fundType(terms.type)] ?? GOV_DOCS.Fund;
  const docLabel = kinds.map(([, l]) => l).join(" / ");
  const [docs, setDocs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [kindPick, setKind] = useState("");
  const kind = kinds.some(([k]) => k === kindPick) ? kindPick : kinds[0][0];
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    listDealDocs(workspaceId).then((d) => alive && setDocs(d.filter((x) => !x.deal_id && ["lpa", "ppm", "jva", "sma"].includes(x.doc_type)))).catch(() => {});
    return () => {
      alive = false;
    };
  }, [workspaceId, busy]);
  if (!workspaceId) return null;
  const mine = (docs ?? []).filter((d) => d.fund_name.toLowerCase() === String(fundName ?? "").trim().toLowerCase());
  const upload = async (file) => {
    if (!file || !String(fundName ?? "").trim()) return setMsg("Enter the name first.");
    setBusy(true);
    try {
      await createDealDocWithFallback(workspaceId, { dealId: null, fundName: String(fundName).trim(), docType: kind, title: file.name.replace(/\.pdf$/i, ""), files: [file] }, email);
      setMsg(`Uploaded ${file.name}. Review it with Claude on the Documents tab; its terms then show here.`);
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 text-xs" data-testid="lpa-panel">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-gray-800">{docLabel}</p>
        {kinds.length > 1 && <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-1" aria-label="LPA or PPM">
          {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>}
        <label className="cursor-pointer rounded-lg border border-violet-300 bg-white px-2.5 py-1 font-medium text-violet-800">
          {busy ? "Uploading…" : `Upload ${docLabel}`}
          <input type="file" accept="application/pdf,.pdf" className="sr-only" aria-label={`Upload ${docLabel}`} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {msg && <span className="text-gray-600">{msg}</span>}
      </div>
      {mine.length === 0 ? (
        <p className="mt-1 text-gray-500">No {docLabel} for this {({ "Joint Venture": "JV", "Separate Account": "SMA" })[fundType(terms.type)] ?? "fund"} yet. Upload one, review it with Claude on the Documents tab, and its terms{fundType(terms.type) === "Fund" ? " and investment limits" : ""} appear here to use one by one.</p>
      ) : (
        mine.map((d) => {
          if (!d.abstract) return <p key={d.id} className="mt-1 text-gray-500">{d.doc_type.toUpperCase()} {d.title}: not reviewed yet (Documents tab → Review with Claude).</p>;
          const rows = compareDoc(d, { terms });
          return (
            <div key={d.id} className="mt-2">
              <p className="font-medium">{d.doc_type.toUpperCase()} {d.title} <span className="font-normal text-gray-500">(not connector-validated; check each clause)</span></p>
              <table className="mt-1 w-full">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-violet-100 align-top" data-testid={`lpa-row-${r.key}`}>
                      <td className="py-1 pr-2">{r.label}</td>
                      <td className="py-1 pr-2 text-gray-500">now {r.appValue == null || r.appValue === "" ? "—" : String(r.appValue)}</td>
                      <td className="py-1 pr-2 font-medium">{String(r.docValue)}{r.limit?.clause ? <span className="ml-1 text-[10px] font-normal text-gray-500">§ {r.limit.clause}</span> : null}</td>
                      <td className="py-1 text-right">
                        {r.differs ? (
                          <button type="button" onClick={() => (r.limit ? onUseLimit({ ...r.setValue, docId: d.id, quote: r.limit.evidence?.[0]?.quote ?? "" }) : onUse(r.target, r.setValue))} className="rounded border border-violet-300 bg-white px-2 py-0.5 text-violet-800">Use</button>
                        ) : <span className="text-emerald-700">✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function FundTermsEditor({ mode = "new", initial, existingNames = [], currentDealName, onSave, onClose, workspaceId, email, portfolioAssets = [], gpPartners = null }) {
  const [t, setT] = useState(() => normalizeTerms({ ...DEFAULT_FUND_TERMS, ...(initial ?? {}) }));
  const [addCurrent, setAddCurrent] = useState(mode === "new" && !!currentDealName);
  const [upload, setUpload] = useState(null); // { ok } | { error } | { warnings }
  // New: the type is chosen first (unless the caller set it), then fixed.
  const [picked, setPicked] = useState(mode === "edit" || !!initial?.type);
  const [step, setStep] = useState("doc");
  const [newR, setNewR] = useState({ kind: "other", label: "", limit: "", clause: "" });
  const set = (k) => (v) => setT((p) => ({ ...p, [k]: v }));
  const pickType = (type) => { setT((p) => ({ ...p, ...typeDefaults(type) })); setPicked(true); };
  const setTier = (i, k, v) =>
    setT((p) => {
      const tiers = p.tiers.map((x, j) => (j === i ? { ...x, [k]: v } : x));
      if (k === "lpSplit" && v !== "") tiers[i].gpSplit = +(100 - v).toFixed(2);
      if (k === "gpSplit" && v !== "") tiers[i].lpSplit = +(100 - v).toFixed(2);
      return { ...p, tiers };
    });

  // What to call it (user, 11/24): a fund, a JV or an SMA, never "fund" for the others.
  const ptype = fundType(t.type);
  const W = setupWords(ptype);
  const unit = W.unit;
  const unitLc = W.unitLc;
  const steps = setupSteps(ptype);
  const stepIx = steps.findIndex((x) => x.id === step);
  const isFund = ptype === "Fund", isJv = ptype === "Joint Venture", isSma = ptype === "Separate Account";
  const incentiveOn = isSma && Number(t.incentiveFeePct) > 0;
  const inp = "border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900";
  const lbl = "text-xs font-medium text-gray-500 uppercase tracking-wide";
  const text = (label, key, placeholder = "") => (
    <label className="flex flex-col gap-1"><span className={lbl}>{label}</span><input type="text" aria-label={label} value={t[key] ?? ""} onChange={(e) => set(key)(e.target.value)} placeholder={placeholder} className={inp} /></label>
  );
  const dateIn = (label, key, hint) => (
    <label className="flex flex-col gap-1"><span className={lbl}>{label}</span><input type="date" aria-label={label} value={t[key] ?? ""} onChange={(e) => set(key)(e.target.value)} className={inp} />{hint && <span className="text-[11px] text-gray-500">{hint}</span>}</label>
  );
  const optNum = (label, key, suffix, step2, hint) => <Num label={label} suffix={suffix} step={step2} value={t[key] ?? ""} onChange={(v) => set(key)(v === "" ? null : v)} hint={hint} />;
  const at = agreementTerm(t);
  const name = String(t.name ?? "").trim();
  const duplicate = mode === "new" && existingNames.some((n) => n.toLowerCase() === name.toLowerCase());
  const issues = [...validateTerms(t), ...(duplicate ? [`A portfolio named “${name}” already exists.`] : [])];
  const blocking = !name || duplicate || !(t.termYears > 0);
  const fd = t.finalClose ? fundDates(t) : null;

  async function handleUpload(file) {
    try {
      const { terms, warnings } = await termsFromFile(file);
      // Keep the name already typed when editing an existing fund.
      setT(mode === "edit" ? { ...terms, name: t.name } : terms);
      setUpload(warnings.length ? { warnings } : { ok: `Loaded terms from ${file.name}. Review, then ${mode === "new" ? "create" : "save"}.` });
    } catch (e) {
      setUpload({ error: e.message || "Couldn't read that file." });
    }
  }

  const template = (kind) => {
    const blank = { ...DEFAULT_FUND_TERMS, name: "" };
    if (kind === "xlsx") downloadBlob(termsToXlsx(blank), "fund_terms_template.xlsx");
    else downloadBlob(new Blob([termsToCSV(blank)], { type: "text/csv" }), "fund_terms_template.csv");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={mode === "new" ? "New portfolio setup" : "Edit portfolio"} data-testid="portfolio-setup">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-200 my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-gray-900">{mode === "new" ? (picked ? `New ${W.long}` : "New Portfolio Setup") : `Edit portfolio · ${initial?.name}`}{picked && <FundTypeBadge type={ptype} />}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        {!picked ? (
          <div className="px-6 py-6 space-y-3" data-testid="type-chooser">
            <p className="text-sm font-semibold text-gray-900">What are you setting up?</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Fund", "type-fund", "Many investors, an LPA and PPM, an investment period.", "border-blue-200 bg-blue-50/60"], ["Joint Venture", "type-jv", "One capital partner and a joint venture agreement.", "border-amber-200 bg-amber-50/60"], ["Separate Account", "type-sma", "One client and a separate account or investment management agreement.", "border-violet-200 bg-violet-50/60"]].map(([ty, id, blurb, cls]) => (
                <button key={ty} type="button" data-testid={id} onClick={() => pickType(ty)} className={`rounded-xl border p-3 text-left hover:shadow ${cls}`}>
                  <span className="block text-sm font-semibold text-gray-900">{ty}</span>
                  <span className="block text-xs text-gray-600">{blurb}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">The type is fixed once chosen. Each type has its own steps and wording.</p>
            <div className="flex justify-end"><button type="button" onClick={onClose} className="text-sm text-gray-600 border border-gray-200 bg-white rounded-lg px-4 py-2">Cancel</button></div>
          </div>
        ) : (<>
        <div className="flex gap-1.5 overflow-x-auto border-b border-gray-200 px-6 py-2.5" data-testid="setup-steps">
          {steps.map((x, i) => (
            <button key={x.id} type="button" data-testid={`step-${x.id}`} aria-current={x.id === step ? "step" : undefined} onClick={() => setStep(x.id)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${x.id === step ? "border-gray-900 bg-gray-900 text-white" : i < stepIx ? "border-emerald-200 bg-white text-emerald-700" : "border-gray-200 bg-white text-gray-600"}`}>
              {x.n ? `${x.n} ` : ""}{x.label}
            </button>
          ))}
        </div>
        <div className="px-6 py-5 space-y-6">
          {step === "doc" && (
            <section className="space-y-3" data-testid="step-doc-body">
              <h3 className="text-sm font-semibold text-gray-900" data-testid="terms-unit">{unit}</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className={lbl}>{unit} name</span>
                  <input type="text" aria-label="Portfolio name" value={t.name} disabled={mode === "edit"} onChange={(e) => set("name")(e.target.value)} placeholder={isFund ? "e.g. Light Industrial Fund II" : isJv ? "e.g. Industrial Venture I" : "e.g. Separate Account A"} className={`${inp} disabled:bg-gray-50 disabled:text-gray-500`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={lbl}>Portfolio manager</span>
                  <input type="text" aria-label="Portfolio manager" value={t.portfolioManager ?? ""} onChange={(e) => set("portfolioManager")(e.target.value)} placeholder={`Owner of ${unitLc}-level actions`} className={inp} />
                </label>
              </div>
              <p className="text-xs text-gray-500" data-testid="type-fixed">Type: <b>{ptype}</b> (fixed). Upload the {W.docLong} below and Claude reads it; each term it finds is listed here to use one by one, and you check every step before saving.</p>
            </section>
          )}
          {step === "doc" && <LpaPanel
            workspaceId={workspaceId}
            email={email}
            fundName={t.name}
            terms={t}
            onUse={(k, v) => setT((p) => ({ ...setTermPath(p, k, v), termSources: { ...(p.termSources ?? {}), [k]: "doc" }, ...(k === "subLineSizePct" ? { subLineEnabled: v > 0 } : {}), ...(k === "revenueYieldBasis" ? { revenueYieldBasisSource: "doc" } : {}) }))}
            onUseLimit={(l) => setT((p) => ({ ...p, limits: [...(p.limits ?? []).filter((x) => x.key !== l.key), l] }))}
          />}
          {/* Upload / template (a fund's terms sheet) */}
          {step === "doc" && isFund && <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 text-xs text-gray-700 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 cursor-pointer">
                Upload terms (Excel or CSV)
                <input
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-gray-500">Need the format?</span>
              <button type="button" onClick={() => template("xlsx")} className="font-medium text-blue-700 hover:underline">Download template (Excel)</button>
              <span className="text-gray-300">/</span>
              <button type="button" onClick={() => template("csv")} className="font-medium text-blue-700 hover:underline">CSV</button>
            </div>
            {upload?.ok && <p className="text-emerald-700">{upload.ok}</p>}
            {upload?.error && <p className="text-red-600">{upload.error}</p>}
            {upload?.warnings && (
              <ul className="text-amber-800 list-disc ml-4">
                {upload.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>}

          {/* Investor (joint venture, separate account): who the capital partner / client is */}
          {step === "investor" && !isFund && (
            <section className="space-y-3" data-testid="investor">
              <h3 className="text-sm font-semibold text-gray-900">{isJv ? "Capital partner" : "Client"}</h3>
              <div className="grid grid-cols-2 gap-3">
                {isJv ? (
                  <label className="flex flex-col gap-1"><span className={lbl}>Capital partner</span><input aria-label="JV partner" value={t.partnerName ?? ""} onChange={(e) => set("partnerName")(e.target.value)} placeholder="From the JVA" className={inp} /></label>
                ) : (
                  <label className="flex flex-col gap-1"><span className={lbl}>Client</span><input aria-label="Client" value={t.clientName ?? ""} onChange={(e) => set("clientName")(e.target.value)} placeholder="From the SMA" className={inp} /></label>
                )}
                <label className="flex flex-col gap-1"><span className={lbl}>Investor type</span>
                  <select aria-label="Investor type" value={t.investorType ?? ""} onChange={(e) => set("investorType")(e.target.value)} className={`${inp} bg-white`}>
                    <option value="">Not set</option>
                    {INVESTOR_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </label>
                {isSma && (
                  <label className="flex flex-col gap-1"><span className={lbl}>Authority</span>
                    <select aria-label="Authority" value={t.authority ?? ""} onChange={(e) => set("authority")(e.target.value)} className={`${inp} bg-white`}>
                      <option value="">Not set</option>
                      {AUTHORITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <span className="text-[11px] text-gray-500">Recorded here; the approval step itself comes with Workflow (v1.2)</span>
                  </label>
                )}
                {text(isJv ? "Partner's entity in the venture" : "Client's entity", "investorEntity")}
                {isJv && text("Sponsor's entity in the venture", "sponsorEntity")}
                {text("Contact name", "investorContactName")}
                {text("Contact email", "investorContactEmail")}
                <label className="col-span-2 flex flex-col gap-1"><span className={lbl}>Notes</span><textarea aria-label="Investor notes" rows={2} value={t.investorNotes ?? ""} onChange={(e) => set("investorNotes")(e.target.value)} className={inp} /></label>
              </div>
            </section>
          )}
          {step === "investor" && isFund && <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600" data-testid="fund-investors-note">A fund&apos;s investors are kept in your CRM, not here. This step is the sponsor and the GP parties.</p>}

          {/* Capital and fees */}
          {step === "capital" && (
            <section className="space-y-3" data-testid="capital">
              <h3 className="text-sm font-semibold text-gray-900">Capital</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Num label={isFund ? "Total commitments" : W.equity} prefix="$" step={1_000_000} value={t.targetEquity} onChange={set("targetEquity")} hint={isFund ? "Fund size; drives dry powder" : isJv ? "Partner and sponsor together" : "The client's allocation"} />
                {isSma ? (
                  <label className="flex flex-col gap-1"><span className={lbl}>Sponsor co-investment</span>
                    <span className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" aria-label="Sponsor co-invests" checked={Number(t.gpCommitPct) > 0} onChange={(e) => set("gpCommitPct")(e.target.checked ? 5 : 0)} />{Number(t.gpCommitPct) > 0 ? "Yes" : "None"}</span>
                  </label>
                ) : null}
                {(!isSma || Number(t.gpCommitPct) > 0) && <Num label={isFund ? "GP commitment" : isJv ? "Sponsor's ownership" : "Sponsor co-investment"} suffix="% of equity" step={0.5} value={t.gpCommitPct} onChange={set("gpCommitPct")} hint={isJv ? `Partner ${100 - (Number(t.gpCommitPct) || 0)}% / sponsor ${Number(t.gpCommitPct) || 0}%` : undefined} />}
                <Num label={`${unit} cash reserve`} suffix="qtrs" step={1} value={t.cashReserveQuarters ?? 2} onChange={set("cashReserveQuarters")} hint={`Quarters of projected ${unitLc} expenses`} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Fees</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Num label={W.fee} suffix="%/yr" step={0.25} value={t.mgmtFeePct} onChange={set("mgmtFeePct")} hint={isFund ? "Quarterly in advance, LPs only" : "Quarterly in advance, to the sponsor"} />
                <label className="flex flex-col gap-1">
                  <span className={lbl}>Fee basis</span>
                  <select aria-label="Fee basis" value={t.mgmtFeeBasis ?? "commitments-then-invested"} onChange={(e) => set("mgmtFeeBasis")(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                    <option value="commitments-then-invested">Commitments, then invested</option>
                    <option value="invested">Invested capital</option>
                  </select>
                  <span className="text-[10px] text-gray-500">{isFund ? "Commitments during the investment period, then invested capital in assets held" : "Invested capital in assets held is usual here"}</span>
                </label>
                <Num label="Acquisition fee" suffix="% of price" step={0.25} value={t.acqFeePct ?? 0} onChange={set("acqFeePct")} hint="Paid to the sponsor when an asset is bought" />
                <Num label="Disposition fee" suffix="% of sale" step={0.25} value={t.dispFeePct ?? 0} onChange={set("dispFeePct")} hint="Paid to the sponsor when an asset is sold" />
                <label className="flex flex-col gap-1 col-span-2">
                  <span className={lbl}>Revenue Yield basis</span>
                  <select aria-label="Revenue Yield basis" value={t.revenueYieldBasis === "lp" ? "lp" : "lp+gp"} onChange={(e) => setT((p) => ({ ...p, revenueYieldBasis: e.target.value, revenueYieldBasisSource: "user" }))} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                    <option value="lp+gp">LP + GP commitments (default)</option>
                    <option value="lp">LP commitments only</option>
                  </select>
                  <span className="text-[10px] text-gray-500">{t.revenueYieldBasisSource === "doc" ? `Read in from the ${W.doc}` : t.revenueYieldBasisSource === "user" ? "Set by you" : "Default"}: the commitments GP fees are measured against on GP Economics</span>
                </label>
              </div>
            </section>
          )}

          {/* Returns: the target, then the preferred return and promote or the incentive fee */}
          {step === "returns" && (
            <section className="space-y-3" data-testid="target-return">
              <h3 className="text-sm font-semibold text-gray-900">Target return <span className="font-normal text-gray-500">({W.net})</span></h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Num label="Target IRR" suffix="%" step={0.5} value={t.fundPlanTargets?.netIrrPct ?? ""} onChange={(v) => setT((p) => withTarget(p, "netIrrPct", v))} />
                <Num label="Target equity multiple" suffix="x" step={0.05} value={t.fundPlanTargets?.netMultiple ?? ""} onChange={(v) => setT((p) => withTarget(p, "netMultiple", v))} />
                <Num label="Target cash yield" suffix="%/yr" step={0.25} value={t.fundPlanTargets?.cashYieldPct ?? ""} onChange={(v) => setT((p) => withTarget(p, "cashYieldPct", v))} hint="Operating distributions ÷ capital called" />
                <label className="flex flex-col gap-1">
                  <span className={lbl}>Hurdle rate</span>
                  <div className="flex items-center rounded-lg border border-gray-200 bg-white">
                    <input type="number" aria-label="Hurdle rate" step={0.5} min={0} value={t.hurdleRatePct ?? ""} placeholder={`${t.prefPct ?? 9} (pref)`} onChange={(e) => set("hurdleRatePct")(e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value) || 0))} className="w-full rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none" />
                    <span className="pr-2 text-xs text-gray-500">%/yr</span>
                  </div>
                  <span className="text-[10px] text-gray-500">Cost of capital; blank = the preferred return</span>
                </label>
              </div>
              <p className="text-[11px] text-gray-500">These are the targets the portfolio plan on Portfolio Summary tracks, beside the plan and the current projection. They change no calculation.</p>
              {isSma && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="sma-terms">
                  <Num label="Incentive fee" suffix="% of profit" step={1} value={t.incentiveFeePct ?? 0} onChange={(v) => set("incentiveFeePct")(v || null)} hint="Above the hurdle; replaces the promote tiers. 0 = preferred return and promote" />
                  <Num label="Incentive hurdle" suffix="% IRR" step={0.5} value={t.incentiveHurdlePct ?? t.prefPct ?? 0} onChange={set("incentiveHurdlePct")} hint="Client IRR before the incentive fee" />
                </div>
              )}
            </section>
          )}

          {/* Market check flag levels (1.1, user 11/25): per portfolio. */}
          {step === "restrictions" && <section className="space-y-2" data-testid="market-flags">
            <h3 className="text-sm font-semibold text-gray-900">Market check flag levels</h3>
            <p className="text-[11px] text-gray-500">When an asset&apos;s valuation or business plan assumption differs from its submarket (Research → Market Data) by more than these, it&apos;s flagged amber; past the multiple, red. Shown on the Valuation tab and the Asset Business Plan.</p>
            <div className="grid grid-cols-5 gap-3">
              {MARKET_FLAG_FIELDS.map(([k, label, unit]) => (
                <Num key={k} label={label} suffix={unit} step={k === "redMultiple" ? 0.25 : k === "capBp" ? 5 : 0.5} value={flagsOf(t)[k]} onChange={(v) => setT((p) => ({ ...p, marketFlags: { ...flagsOf(p), [k]: v === "" ? null : Number(v) } }))} />
              ))}
            </div>
          </section>}

          {/* Parties and economics (user, 11/24): the parties on the Investor step, who is paid each fee on Capital and fees */}
          {(step === "investor" || step === "capital") && (() => {
            const P = partiesOf(t);
            const sel = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900";
            const doc = unit === "Fund" ? "LPA" : unit === "JV" ? "JVA" : "SMA";
            const termsOf = (k) => ({ mgmt: `${t.mgmtFeePct ?? 0}%/yr`, pm: "from each asset's model", cm: "from each asset's model", acq: `${t.acqFeePct ?? 0}% of price`, disp: `${t.dispFeePct ?? 0}% of sale` }[k]);
            const overrides = Object.entries(P.promoteGpPctByAsset);
            const gps = gpPartiesOf(t);
            const setGps = (fn) => setT((p) => ({ ...p, gpParties: fn(gpPartiesOf(p)) }));
            const setGp = (i, k, v) => setGps((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
            const num = (v) => Math.min(100, Math.max(0, Number(v) || 0));
            const partnerList = gpPartners?.partners ?? [];
            const setOverride = (id, v) => setT((p) => { const o = { ...(p.promoteGpPctByAsset ?? {}) }; if (v === null) delete o[id]; else o[id] = v; return { ...p, promoteGpPctByAsset: o }; });
            return (
              <section className="space-y-3" data-testid="parties">
                {step === "investor" && (<>
                <h3 className="text-sm font-semibold text-gray-900">Parties and economics</h3>
                <p className="text-[11px] text-gray-500">This firm is the sponsor (it manages the assets and earns the fees). The GP parties are the capital partners: this firm and any outside GP partners, each with its share of the GP capital commitment and of the promote, from their agreements (Finance → GP Partners). The GP earns no fees, only its share of the promote.</p>
                <table className="w-full text-sm" data-testid="party-table">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-gray-500"><th className="py-1">Role</th><th>Who</th><th>Name</th><th className="text-right">Share of GP capital</th><th className="text-right">Share of promote</th><th /></tr></thead>
                  <tbody>
                    <tr className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 font-medium">Sponsor / operator</td>
                      <td className="pr-2 text-xs text-emerald-700">This firm</td>
                      <td className="pr-2 text-xs text-gray-500">always this firm (1.1.10)</td>
                      <td className="text-right text-xs text-gray-500">its capital: this firm&apos;s GP share below</td>
                      <td className="text-right text-sm font-medium" data-testid="sponsor-promote">{P.sponsorPromotePct}%</td>
                      <td />
                    </tr>
                    {gps.map((g, i) => (
                      <tr key={g.id} className="border-t border-gray-100" data-testid="gp-party">
                        <td className="py-1.5 pr-2 font-medium">GP{gps.length > 1 ? ` ${i + 1}` : ""} (capital partner)</td>
                        <td className="pr-2"><select aria-label={`GP ${i + 1}: who`} value={g.who} onChange={(e) => setGp(i, "who", e.target.value)} className={sel}><option value="firm">This firm</option><option value="external">External GP</option></select></td>
                        <td className="pr-2">{g.who === "external" ? (
                          // 1.1.10: an outside GP partner is picked from Finance → GP Partners (not typed in).
                          <select aria-label={`GP ${i + 1}: partner`} value={g.partnerId ?? (g.name ? "legacy" : "")} disabled={!!g.terms?.length} onChange={(e) => setGps((gs) => gs.map((x, j) => (j === i ? { ...x, partnerId: e.target.value || undefined, name: partnerList.find((pp) => pp.id === e.target.value)?.name ?? "" } : x)))} className={`${sel} w-56`}>
                            <option value="">Choose a GP partner…</option>
                            {partnerList.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                            {!g.partnerId && g.name && <option value="legacy">{g.name} (typed in; not in GP Partners)</option>}
                          </select>
                        ) : <span className="text-xs text-emerald-700">This firm</span>}</td>
                        {g.terms?.length ? (
                          <td colSpan={2} className="text-right text-[11px] text-gray-500" data-testid="gp-party-from-agreement">{g.capitalPct}% · {g.promotePct}% today, from its agreement{g.terms.length > 1 ? "s" : ""} (Finance → GP Partners)</td>
                        ) : (<>
                          <td className="text-right"><span className="inline-flex items-center gap-1 whitespace-nowrap"><input aria-label={`GP ${i + 1}: share of GP capital`} type="number" min={0} max={100} step={5} value={g.capitalPct} onChange={(e) => setGp(i, "capitalPct", num(e.target.value))} className={`${sel} w-16 text-right`} />%</span></td>
                          <td className="text-right"><span className="inline-flex items-center gap-1 whitespace-nowrap"><input aria-label={`GP ${i + 1}: share of promote`} type="number" min={0} max={100} step={5} value={g.promotePct} onChange={(e) => setGp(i, "promotePct", num(e.target.value))} className={`${sel} w-16 text-right`} />%</span></td>
                        </>)}
                        <td className="text-right">{gps.length > 1 && <button type="button" onClick={() => setGps((gs) => gs.filter((_, j) => j !== i))} className="text-xs text-gray-500 hover:text-red-600">Remove</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <button type="button" onClick={() => setGps((gs) => [...gs, { id: `gp${Date.now().toString(36)}`, who: "external", name: "", capitalPct: 0, promotePct: 0 }])} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium" data-testid="add-gp-party">+ Add a GP party</button>
                  {!partnerList.length && <span className="text-gray-500">Outside GP partners are added in Finance → GP Partners (with their agreements).</span>}
                  <span className="text-gray-500">The GP commitment is {t.gpCommitPct ?? 0}% of equity; the GP parties&apos; capital shares split it{P.capitalPctTotal !== 100 ? "" : "."}</span>
                  {P.capitalPctTotal !== 100 && <span className="font-medium text-amber-700" data-testid="gp-capital-warning">Shares of GP capital add to {P.capitalPctTotal}%, not 100%.</span>}
                  {gps.reduce((a, g) => a + g.promotePct, 0) > 100 && <span className="font-medium text-amber-700">GP promote shares add to more than 100%.</span>}
                </div>
                <p className="text-[11px] text-gray-500">A partner&apos;s capital and promote shares come from its agreement with the firm, saved in Finance → GP Partners (often a separate agreement, not the {doc}); without one they can be entered here. The sponsor (this firm) has whatever promote the GP parties don&apos;t.</p>
                <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900" data-testid="firm-role">This firm&apos;s role in this {unitLc}: <b>{firmRoleLabel(P.firmRole)}</b>. {P.firmRole === "both" ? "Its GP return and its fees appear on GP Economics and Sponsor Economics; Firm Economics adds them up." : "It is the sponsor, with no GP capital of its own here: its fees and the sponsor's promote appear on Sponsor Economics and Firm Economics."}</p>
                </>)}
                {step === "capital" && (<>
                <h3 className="text-sm font-semibold text-gray-900">Who is paid each fee</h3>
                <table className="w-full text-sm" data-testid="fee-payees">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-gray-500"><th className="py-1">Fee</th><th>Terms</th><th>Paid to</th><th /></tr></thead>
                  <tbody>
                    {FEE_KEYS.map(([k, label, key]) => (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="py-1.5 pr-2">{label}</td>
                        <td className="pr-2 text-xs text-gray-500">{termsOf(k)}</td>
                        <td className="pr-2">{k === "pm" || k === "cm" ? <select aria-label={`${label}: paid to`} value={P.feeTo[k]} onChange={(e) => set(key)(e.target.value)} className={sel}>{FEE_PAYEES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : <span className="text-xs text-gray-700" aria-label={`${label}: paid to`}>Sponsor (this firm)</span>}</td>
                        <td>{k === "pm" && <span className="mr-2 text-[10px] text-gray-500" data-testid="pm-fee-default-note">Default only: an asset with its property management firm set in asset setup is paid as set there.</span>}{P.feeTo[k] === "third" && (k === "pm" || k === "cm") && <input aria-label={`${label}: third party`} value={t[k === "pm" ? "pmThirdParty" : "cmThirdParty"] ?? ""} onChange={(e) => set(k === "pm" ? "pmThirdParty" : "cmThirdParty")(e.target.value)} placeholder="Provider (optional)" className={`${sel} w-44`} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-500">Outsourced property or construction management is still an expense of the asset (NOI and returns don&apos;t change), but nobody&apos;s revenue: it isn&apos;t counted for the sponsor, the GP or Revenue Yield.</p>
                </>)}
                {step === "investor" && (<>
                <div className="flex flex-wrap items-end gap-3">
                  <p className="text-xs text-gray-500">GP side of the promote: <b>{P.promoteGpPct}%</b> · sponsor <b>{P.sponsorPromotePct}%</b> (portfolio default). An asset can have its own GP-side share; the GP parties split it in proportion to their shares.</p>
                  {portfolioAssets.length > 0 && (
                    <label className="flex flex-col gap-1 text-xs"><span className="font-medium uppercase tracking-wide text-gray-500">Asset with its own promote split</span>
                      <select aria-label="Add an asset promote split" value="" onChange={(e) => e.target.value && setOverride(e.target.value, P.promoteGpPct)} className={sel}>
                        <option value="">+ Add an asset…</option>
                        {portfolioAssets.filter((a) => !(a.id in P.promoteGpPctByAsset)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {overrides.length > 0 && (
                  <table className="w-full text-sm" data-testid="promote-overrides">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wide text-gray-500"><th className="py-1">Asset</th><th className="text-right">GP side %</th><th className="text-right">Sponsor %</th><th /></tr></thead>
                    <tbody>
                      {overrides.map(([id, v]) => (
                        <tr key={id} className="border-t border-gray-100">
                          <td className="py-1">{portfolioAssets.find((a) => a.id === id)?.name ?? id}</td>
                          <td className="text-right"><input aria-label="Asset GP share of promote" type="number" min={0} max={100} step={5} value={v} onChange={(e) => setOverride(id, Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className={`${sel} w-20 text-right`} /></td>
                          <td className="text-right text-gray-600">{100 - Number(v)}</td>
                          <td className="text-right"><button type="button" onClick={() => setOverride(id, null)} className="text-xs text-gray-500 hover:text-red-600">Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                </>)}
              </section>
            );
          })()}

          {/* Restrictions (the agreement's limits) and dates */}
          {step === "restrictions" && (
            <section className="space-y-3" data-testid="restrictions">
              <h3 className="text-sm font-semibold text-gray-900">{isFund ? "Investment limits and restrictions" : "Restrictions"}</h3>
              <p className="text-[11px] text-gray-500">From the {W.docLong} (Document step: Use each one), or added here. The ones Baywise can measure show actual against limit on Portfolio Limits; the rest are listed for reference.</p>
              {restrictionsOf(t).length > 0 && (
                <table className="w-full text-sm" data-testid="restriction-table">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-gray-500"><th className="py-1">Restriction</th><th>Limit</th><th>Clause</th><th>Checked</th><th /></tr></thead>
                  <tbody>
                    {restrictionsOf(t).map((r) => (
                      <tr key={r.key} className="border-t border-gray-100 align-top" data-testid="restriction-row">
                        <td className="py-1.5 pr-2">{r.label}</td>
                        <td className="pr-2">{String(r.limit ?? "")}{r.unit === "%" ? "%" : r.unit === "years" ? " years" : ""}</td>
                        <td className="pr-2 text-xs text-gray-500">{r.clause ? `§ ${r.clause}` : ""}</td>
                        <td className="pr-2 text-xs">{r.measured ? <span className="text-emerald-700">Against actual</span> : <span className="text-gray-500">Listed for reference</span>}</td>
                        <td className="text-right"><button type="button" aria-label={`Remove ${r.label}`} onClick={() => setT((p) => removeRestriction(p, r.key))} className="text-xs text-gray-500 hover:text-red-600">Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2" data-testid="add-restriction">
                <select aria-label="Restriction kind" value={newR.kind} onChange={(e) => setNewR((p) => ({ ...p, kind: e.target.value }))} className={`${inp} bg-white col-span-2`}>
                  {RESTRICTION_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input aria-label="Restriction text" value={newR.label} onChange={(e) => setNewR((p) => ({ ...p, label: e.target.value }))} placeholder="What it says (optional for a measured limit)" className={`${inp} col-span-2 sm:col-span-3`} />
                <input aria-label="Restriction limit" value={newR.limit} onChange={(e) => setNewR((p) => ({ ...p, limit: e.target.value }))} placeholder="Limit (e.g. 60)" className={inp} />
                <input aria-label="Restriction clause" value={newR.clause} onChange={(e) => setNewR((p) => ({ ...p, clause: e.target.value }))} placeholder="Clause (e.g. 6.2)" className={inp} />
                <button type="button" data-testid="add-restriction-btn" disabled={!newR.label.trim() && !String(newR.limit).trim()} onClick={() => { setT((p) => addRestriction(p, newR)); setNewR({ kind: "other", label: "", limit: "", clause: "" }); }} className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium disabled:opacity-40">+ Add restriction</button>
              </div>

              <h3 className="text-sm font-semibold text-gray-900">{isFund ? "Timeline" : "Term of the agreement"}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <label className="flex flex-col gap-1">
                  <span className={lbl}>{W.start}</span>
                  <input type="date" aria-label={W.start} value={t.finalClose} onChange={(e) => e.target.value && set("finalClose")(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
                </label>
                <Num label="Investment period" suffix="yrs" step={0.5} value={t.investmentPeriodYears} onChange={set("investmentPeriodYears")} hint={isFund ? undefined : "If the agreement has one"} />
                <Num label="Term" suffix="yrs" value={t.termYears} onChange={set("termYears")} min={1} />
                <Num label="Extensions" suffix="#" value={t.extensionCount} onChange={set("extensionCount")} />
                <Num label="Each extension" suffix="yrs" value={t.extensionYears} onChange={set("extensionYears")} />
              </div>
              {fd && (
                <p className="text-xs text-gray-500" data-testid="term-dates">
                  Investment period ends {fmtDate(fd.investmentPeriodEnd)} · term ends {fmtDate(fd.fundEnd)} · fully extended {fmtDate(fd.extendedEnd)}. These dates are on Upcoming Events.
                </p>
              )}
              {isJv && (
                <div className="grid grid-cols-2 gap-3" data-testid="jv-dates">
                  {dateIn("Outside sale date", "outsideSaleDate", "The date by which the venture must sell, if the JVA sets one")}
                  {dateIn("Buy-sell available from", "buySellDate", "When either partner may start the buy-sell")}
                </div>
              )}
              {isSma && (
                <div className="grid grid-cols-2 gap-3" data-testid="sma-dates">
                  {optNum("Termination notice", "terminationNoticeDays", "days", 30, "Notice the client must give to end the agreement")}
                  <p className="self-end text-[11px] text-gray-500">The term ends {at.end ? fmtDate(at.end) : "—"}{at.extensionCount ? `, or ${fmtDate(at.extendedEnd)} with every extension` : ""}.</p>
                </div>
              )}
            </section>
          )}

          {/* Waterfall */}
          {step === "returns" && <section className="space-y-3" data-testid="waterfall">
            <h3 className="text-sm font-semibold text-gray-900">Waterfall</h3>
            {fundType(t.type) === "Separate Account" && Number(t.incentiveFeePct) > 0 && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="incentive-note">This separate account uses its incentive fee ({t.incentiveFeePct}% of profit above a {t.incentiveHurdlePct ?? t.prefPct}% IRR hurdle, no catch-up) in place of the preferred return, catch-up and promote tiers below.</p>}
            <div className="grid grid-cols-3 gap-3">
              <Num label="Preferred return" suffix="%/yr" step={0.25} value={t.prefPct} onChange={set("prefPct")} />
              {!isSma && <Num label={isFund ? "GP catch-up" : "Sponsor catch-up"} suffix="%" step={5} value={t.catchUpGpPct} onChange={set("catchUpGpPct")} />}
              {/* 1.1.12 (user, 11/27): marginal by default; read from the LPA where it says. */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">Promote tier method</span>
                <select aria-label="Promote tier method" value={t.tierMethod === "cliff" ? "cliff" : "marginal"} onChange={(e) => set("tierMethod")(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900" title="Marginal: each tier's split applies only to the distributions that take the LPs' IRR from one hurdle to the next (the usual LPA waterfall). Cliff: the tier the portfolio's IRR lands in applies to every dollar after the pref.">
                  <option value="marginal">Marginal (each split within its IRR band)</option>
                  <option value="cliff">Cliff (one split on all profit)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Distribution policy</span>
                <select
                  value={t.distributionPolicy ?? "reserve"}
                  onChange={(e) => set("distributionPolicy")(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                >
                  <option value="reserve">Income above reserve</option>
                  <option value="payout">Payout % of income</option>
                </select>
              </label>
              {(t.distributionPolicy ?? "reserve") === "reserve" ? (
                <Num label="Reserve" suffix="yrs" step={0.25} value={t.reserveYears} onChange={set("reserveYears")} hint="× debt service + TI + mgmt fees" />
              ) : (
                <Num label="Quarterly income payout" suffix="%" step={5} value={t.incomePayoutPct} onChange={set("incomePayoutPct")} hint="Rest is reserved, returned at exit" />
              )}
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Income distributions</span>
                <select
                  value={t.incomeTreatment ?? "prefThenROC"}
                  onChange={(e) => set("incomeTreatment")(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                >
                  <option value="prefThenROC">Pref, then return of capital (promote only from sales)</option>
                  <option value="full">Full waterfall each quarter</option>
                </select>
              </label>
            </div>
            {!incentiveOn && <div className="rounded-xl border border-gray-200 overflow-hidden" data-testid="promote-tiers">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Promote tier</th>
                    <th className="px-3 py-2 text-left font-semibold">{isFund ? "Fund IRR up to (%)" : isJv ? "Partner IRR up to (%)" : "Client IRR up to (%)"}</th>
                    <th className="px-3 py-2 text-left font-semibold">{isFund ? "LP %" : isJv ? "Partner %" : "Client %"}</th>
                    <th className="px-3 py-2 text-left font-semibold">{isFund ? "GP %" : "Sponsor %"}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {t.tiers.map((x, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-600">Tier {i + 1}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step={0.5}
                          value={x.irrThreshold ?? ""}
                          placeholder="above all"
                          onChange={(e) => setTier(i, "irrThreshold", e.target.value === "" ? null : Number(e.target.value))}
                          className="w-28 border border-gray-200 rounded-md px-2 py-1 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step={5} value={x.lpSplit} onChange={(e) => setTier(i, "lpSplit", e.target.value === "" ? "" : Number(e.target.value))} className="w-20 border border-gray-200 rounded-md px-2 py-1 tabular-nums" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" step={5} value={x.gpSplit} onChange={(e) => setTier(i, "gpSplit", e.target.value === "" ? "" : Number(e.target.value))} className="w-20 border border-gray-200 rounded-md px-2 py-1 tabular-nums" />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {t.tiers.length > 1 && (
                          <button type="button" onClick={() => setT((p) => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i) }))} className="text-xs text-gray-500 hover:text-red-500">
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {t.tiers.length < MAX_TIERS && (
                <button
                  type="button"
                  onClick={() => setT((p) => ({ ...p, tiers: [...p.tiers, { irrThreshold: null, lpSplit: 50, gpSplit: 50 }] }))}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-blue-600 hover:bg-gray-50 border-t border-gray-100"
                >
                  + Add tier
                </button>
              )}
            </div>}
            {!incentiveOn && <p className="text-[11px] text-gray-500">
              Distributions: pref → return of capital → {isSma ? "" : `${isFund ? "GP" : "sponsor"} catch-up → `}split by the tier the {unitLc}&apos;s IRR falls in. Leave the top tier&apos;s hurdle blank.
            </p>}
          </section>}

          {/* Subscription line */}
          {step === "capital" && <section className="space-y-3" data-testid="sub-line">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Subscription line</h3>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={t.subLineEnabled !== false} onChange={(e) => set("subLineEnabled")(e.target.checked)} />
                {isFund ? "Fund" : `This ${unit}`} has a subscription line
              </label>
            </div>
            {t.subLineEnabled !== false && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Num label="Size" suffix="% of commitments" step={5} value={t.subLineSizePct} onChange={set("subLineSizePct")} />
                <Num label="Spread over SOFR" suffix="%" step={0.05} value={t.subLineSpreadPct} onChange={set("subLineSpreadPct")} hint="30-day average SOFR" />
                <Num label="Unused fee" suffix="%/yr" step={0.05} value={t.subLineUnusedFeePct} onChange={set("subLineUnusedFeePct")} />
                <Num label="Max days outstanding" suffix="days" step={30} value={t.subLineMaxDays} onChange={set("subLineMaxDays")} hint="Then repaid by an LP call" />
                <label className="flex flex-col gap-0.5 text-xs text-gray-600">Facility maturity<input aria-label="Sub line maturity" type="date" value={t.subLineMaturity ?? ""} onChange={(e) => set("subLineMaturity")(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /><span className="text-[11px] text-gray-500">Shown on the Dashboard&apos;s Calendar</span></label>
              </div>
            )}
          </section>}

          {/* Review: every term by step, and where it came from */}
          {step === "review" && (
            <section className="space-y-4" data-testid="review">
              <p className="text-xs text-gray-500">Check each step. Nothing is saved until you press {mode === "new" ? `Create ${unitLc}` : "Save terms"}.</p>
              {reviewSections(t).map((sec) => (
                <div key={sec.id} className="rounded-xl border border-gray-200" data-testid={`review-${sec.id}`}>
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5">
                    <h3 className="text-sm font-semibold text-gray-900">{sec.title}</h3>
                    <button type="button" onClick={() => setStep(sec.id)} className="text-xs font-medium text-blue-700 hover:underline">Edit</button>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {sec.rows.map((r) => (
                        <tr key={r.label} className="border-t border-gray-100 align-top" data-testid="review-row">
                          <td className="w-2/5 px-3 py-1.5 text-gray-600">{r.label}</td>
                          <td className={`px-3 py-1.5 ${r.source === "unset" ? "text-gray-400" : "text-gray-900"}`}>{r.value}</td>
                          <td className={`px-3 py-1.5 text-right text-[11px] ${r.source === "doc" ? "text-emerald-700" : "text-gray-500"}`}>{SOURCE_LABEL[r.source]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          )}

          {issues.length > 0 && (
            <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 list-disc ml-0 pl-6">
              {issues.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          {mode === "new" && currentDealName ? (
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={addCurrent} onChange={(e) => setAddCurrent(e.target.checked)} />
              Add the current deal ({currentDealName}) to this {unitLc}
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {mode === "edit" && (
              <button type="button" onClick={() => downloadBlob(termsToXlsx(t), `${safeFileName(t.name)}_fund_terms.xlsx`)} className="text-sm text-blue-600 border border-blue-200 bg-white rounded-lg px-4 py-2">
                Export (Excel)
              </button>
            )}
            <button type="button" onClick={onClose} className="text-sm text-gray-600 border border-gray-200 bg-white rounded-lg px-4 py-2">
              Cancel
            </button>
            {stepIx > 0 && <button type="button" data-testid="step-back" onClick={() => setStep(steps[stepIx - 1].id)} className="text-sm text-gray-600 border border-gray-200 bg-white rounded-lg px-4 py-2">Back</button>}
            {step !== "review" && <button type="button" data-testid="step-next" onClick={() => setStep(steps[stepIx + 1].id)} className={`text-sm rounded-lg px-4 py-2 ${mode === "new" ? "font-medium text-white bg-blue-600 hover:bg-blue-700" : "text-gray-700 border border-gray-200 bg-white"}`}>Next</button>}
            {/* A new portfolio is created from the review page; an edit can be saved from any step. */}
            {(mode === "edit" || step === "review") && (
              <button
                type="button"
                disabled={blocking}
                onClick={() => onSave(normalizeTerms({ ...t, type: fundType(t.type), name }), { addCurrentDeal: addCurrent })}
                className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 disabled:opacity-40"
              >
                {mode === "new" ? `Create ${unitLc}` : "Save terms"}
              </button>
            )}
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
