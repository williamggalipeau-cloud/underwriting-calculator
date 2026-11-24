"use client";

import { FUND_TYPES, fundType } from "@/lib/fundTypes";
import { useEffect, useState } from "react";
import { compareDoc } from "@/lib/dealDocApply";
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
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

// Modal to create a fund or edit all of its terms, with template download
// and Excel / CSV upload.
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
                      <td className="py-1 pr-2 font-medium">{String(r.docValue)}{r.limit?.clause ? <span className="ml-1 text-[10px] font-normal text-gray-400">§ {r.limit.clause}</span> : null}</td>
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

export default function FundTermsEditor({ mode = "new", initial, existingNames = [], currentDealName, onSave, onClose, workspaceId, email }) {
  const [t, setT] = useState(() => normalizeTerms({ ...DEFAULT_FUND_TERMS, ...(initial ?? {}) }));
  const [addCurrent, setAddCurrent] = useState(mode === "new" && !!currentDealName);
  const [upload, setUpload] = useState(null); // { ok } | { error } | { warnings }
  const set = (k) => (v) => setT((p) => ({ ...p, [k]: v }));
  const setTier = (i, k, v) =>
    setT((p) => {
      const tiers = p.tiers.map((x, j) => (j === i ? { ...x, [k]: v } : x));
      if (k === "lpSplit" && v !== "") tiers[i].gpSplit = +(100 - v).toFixed(2);
      if (k === "gpSplit" && v !== "") tiers[i].lpSplit = +(100 - v).toFixed(2);
      return { ...p, tiers };
    });

  // What to call it (user, 11/24): a fund, a JV or an SMA, never "fund" for the others.
  const unit = { "Joint Venture": "JV", "Separate Account": "SMA" }[fundType(t.type)] ?? "Fund";
  const unitLc = unit === "Fund" ? "fund" : unit;
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={mode === "new" ? "New fund" : "Edit fund terms"}>
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-200 my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{mode === "new" ? `New ${unitLc}` : `Edit terms · ${initial?.name}`}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <LpaPanel
            workspaceId={workspaceId}
            email={email}
            fundName={t.name}
            terms={t}
            onUse={(k, v) => setT((p) => ({ ...p, [k]: v, ...(k === "subLineSizePct" ? { subLineEnabled: v > 0 } : {}) }))}
            onUseLimit={(l) => setT((p) => ({ ...p, limits: [...(p.limits ?? []).filter((x) => x.key !== l.key), l] }))}
          />
          {/* Upload / template */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 text-xs text-gray-700 space-y-2">
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
          </div>

          {/* Fund */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900" data-testid="terms-unit">{unit}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{unit} name</span>
                <input
                  type="text"
                  value={t.name}
                  disabled={mode === "edit"}
                  onChange={(e) => set("name")(e.target.value)}
                  placeholder="e.g. Light Industrial Fund II"
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </label>
              <label className="flex flex-col gap-1 col-span-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Portfolio manager</span>
                <input
                  type="text"
                  aria-label="Portfolio manager"
                  value={t.portfolioManager ?? ""}
                  onChange={(e) => set("portfolioManager")(e.target.value)}
                  placeholder={`Owner of ${unitLc}-level actions`}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</span>
                <select
                  value={fundType(t.type)}
                  onChange={(e) => set("type")(e.target.value)}
                  aria-label="Fund type"
                  title="Fund, JV or SMA: each uses its own terms (from its LPA, JVA or SMA)"
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
                >
                  {FUND_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <Num label="Total commitments" prefix="$" step={1_000_000} value={t.targetEquity} onChange={set("targetEquity")} hint={`${unit} size; drives dry powder`} />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hurdle rate</span>
                <div className="flex items-center rounded-lg border border-gray-200 bg-white">
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={t.hurdleRatePct ?? ""}
                    placeholder={`${t.prefPct ?? 9} (pref)`}
                    onChange={(e) => set("hurdleRatePct")(e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-lg px-2.5 py-1.5 text-sm text-gray-900 outline-none"
                  />
                  <span className="pr-2 text-xs text-gray-400">%/yr</span>
                </div>
                <span className="text-[10px] text-gray-400">Cost of capital; blank = the preferred return</span>
              </label>
              <Num label="Mgmt fee" suffix="%/yr" step={0.25} value={t.mgmtFeePct} onChange={set("mgmtFeePct")} hint="Quarterly in advance, LPs only" />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fee basis</span>
                <select value={t.mgmtFeeBasis ?? "commitments-then-invested"} onChange={(e) => set("mgmtFeeBasis")(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900">
                  <option value="commitments-then-invested">Commitments, then invested</option>
                  <option value="invested">Invested capital</option>
                </select>
                <span className="text-[10px] text-gray-400">Commitments during the investment period, then invested capital in assets held</span>
              </label>
              <Num label={`${unit} cash reserve`} suffix="qtrs" step={1} value={t.cashReserveQuarters ?? 2} onChange={set("cashReserveQuarters")} hint="Quarters of projected fund expenses" />
              <Num label="Acquisition fee" suffix="% of price" step={0.25} value={t.acqFeePct ?? 0} onChange={set("acqFeePct")} hint="Paid to the sponsor when an asset is bought" />
              <Num label="Disposition fee" suffix="% of sale" step={0.25} value={t.dispFeePct ?? 0} onChange={set("dispFeePct")} hint="Paid to the sponsor when an asset is sold" />
            </div>
            {fundType(t.type) === "Joint Venture" && (
              <div className="grid grid-cols-2 gap-3" data-testid="jv-terms">
                <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">JV partner</span><input aria-label="JV partner" value={t.partnerName ?? ""} onChange={(e) => set("partnerName")(e.target.value)} placeholder="From the JVA" className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" /></label>
                <p className="self-end text-[11px] text-gray-500">The partner&apos;s promote structure is the waterfall below (preferred return and tiers); the sponsor co-invest is the GP commitment.</p>
              </div>
            )}
            {fundType(t.type) === "Separate Account" && (
              <div className="grid grid-cols-3 gap-3" data-testid="sma-terms">
                <label className="flex flex-col gap-1"><span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client</span><input aria-label="Client" value={t.clientName ?? ""} onChange={(e) => set("clientName")(e.target.value)} placeholder="From the SMA" className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900" /></label>
                <Num label="Incentive fee" suffix="% of profit" step={1} value={t.incentiveFeePct ?? 0} onChange={(v) => set("incentiveFeePct")(v || null)} hint="Above the hurdle; replaces the promote tiers" />
                <Num label="Incentive hurdle" suffix="% IRR" step={0.5} value={t.incentiveHurdlePct ?? t.prefPct ?? 0} onChange={set("incentiveHurdlePct")} hint="Client IRR before the incentive fee" />
              </div>
            )}
          </section>

          {/* Timeline */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Timeline</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Final close</span>
                <input type="date" value={t.finalClose} onChange={(e) => e.target.value && set("finalClose")(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
              </label>
              <Num label="Investment period" suffix="yrs" step={0.5} value={t.investmentPeriodYears} onChange={set("investmentPeriodYears")} />
              <Num label="Term" suffix="yrs" value={t.termYears} onChange={set("termYears")} min={1} />
              <Num label="Extensions" suffix="#" value={t.extensionCount} onChange={set("extensionCount")} />
              <Num label="Each extension" suffix="yrs" value={t.extensionYears} onChange={set("extensionYears")} />
            </div>
            {fd && (
              <p className="text-xs text-gray-500">
                Investment period ends {fmtDate(fd.investmentPeriodEnd)} · term ends {fmtDate(fd.fundEnd)} · fully extended {fmtDate(fd.extendedEnd)}
              </p>
            )}
          </section>

          {/* Waterfall */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Waterfall</h3>
            {fundType(t.type) === "Separate Account" && Number(t.incentiveFeePct) > 0 && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="incentive-note">This separate account uses its incentive fee ({t.incentiveFeePct}% of profit above a {t.incentiveHurdlePct ?? t.prefPct}% IRR hurdle, no catch-up) in place of the preferred return, catch-up and promote tiers below.</p>}
            <div className="grid grid-cols-3 gap-3">
              <Num label="GP commitment" suffix="% of equity" step={0.5} value={t.gpCommitPct} onChange={set("gpCommitPct")} />
              <Num label="Preferred return" suffix="%/yr" step={0.25} value={t.prefPct} onChange={set("prefPct")} />
              <Num label="GP catch-up" suffix="%" step={5} value={t.catchUpGpPct} onChange={set("catchUpGpPct")} />
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
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Promote tier</th>
                    <th className="px-3 py-2 text-left font-semibold">Fund IRR up to (%)</th>
                    <th className="px-3 py-2 text-left font-semibold">LP %</th>
                    <th className="px-3 py-2 text-left font-semibold">GP %</th>
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
                          <button type="button" onClick={() => setT((p) => ({ ...p, tiers: p.tiers.filter((_, j) => j !== i) }))} className="text-xs text-gray-400 hover:text-red-500">
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
            </div>
            <p className="text-[11px] text-gray-400">
              Distributions: pref → return of capital → GP catch-up → split by the tier the {unitLc}&apos;s IRR falls in. Leave the top tier&apos;s hurdle blank.
            </p>
          </section>

          {/* Subscription line */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Subscription line</h3>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={t.subLineEnabled !== false} onChange={(e) => set("subLineEnabled")(e.target.checked)} />
                Fund has a subscription line
              </label>
            </div>
            {t.subLineEnabled !== false && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Num label="Size" suffix="% of commitments" step={5} value={t.subLineSizePct} onChange={set("subLineSizePct")} />
                <Num label="Spread over SOFR" suffix="%" step={0.05} value={t.subLineSpreadPct} onChange={set("subLineSpreadPct")} hint="30-day average SOFR" />
                <Num label="Unused fee" suffix="%/yr" step={0.05} value={t.subLineUnusedFeePct} onChange={set("subLineUnusedFeePct")} />
                <Num label="Max days outstanding" suffix="days" step={30} value={t.subLineMaxDays} onChange={set("subLineMaxDays")} hint="Then repaid by an LP call" />
                <label className="flex flex-col gap-0.5 text-xs text-gray-600">Facility maturity<input aria-label="Sub line maturity" type="date" value={t.subLineMaturity ?? ""} onChange={(e) => set("subLineMaturity")(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" /><span className="text-[11px] text-gray-400">Shown on the Dashboard&apos;s Calendar</span></label>
              </div>
            )}
          </section>

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
            <button
              type="button"
              disabled={blocking}
              onClick={() => onSave(normalizeTerms({ ...t, type: fundType(t.type), name }), { addCurrentDeal: addCurrent })}
              className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 disabled:opacity-40"
            >
              {mode === "new" ? `Create ${unitLc}` : "Save terms"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
