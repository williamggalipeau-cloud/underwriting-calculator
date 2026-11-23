"use client";

import { useEffect, useRef, useState } from "react";
import { capChecks, covenantTests } from "@/lib/dealDocApply";
import { createDealDoc, dealFileLink, listDealDocs } from "@/lib/dealDocs";

const usd = (n) => (n == null || !isFinite(n) ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const pct = (n, d = 2) => (n == null || !isFinite(n) ? "—" : `${Number(n).toFixed(d)}%`);
const x = (n) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`);
const btn = "rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-40";
const SEV = { high: "border-red-200 bg-red-50 text-red-800", medium: "border-amber-200 bg-amber-50 text-amber-800", low: "border-gray-200 bg-white text-gray-600" };

// Debt tab: the applied loan agreement (terms and covenant tests by year)
// and the executed rate caps (from their confirmations), with checks against
// the loan's cap requirement. Upload a cap confirmation here or on the
// Documents tab; it's reviewed and applied there.
export default function LoanAgreementPanel({ deal, results, workspaceId, canEdit, email, fundName, onOpenDocuments }) {
  const inputs = deal.inputs;
  const lt = inputs.loanTerms ?? null;
  const cov = inputs.loanCovenants ?? null;
  const caps = inputs.executedCaps ?? [];
  const [docs, setDocs] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    listDealDocs(workspaceId).then((d) => alive && setDocs(d.filter((x) => x.deal_id === deal.id && (x.doc_type === "loan" || x.doc_type === "rate_cap")))).catch(() => {});
    return () => {
      alive = false;
    };
  }, [workspaceId, deal.id, busy]);
  const tests = cov ? covenantTests(inputs, results) : [];
  const open = async (docId) => {
    const d = docs.find((x) => x.id === docId);
    if (!d?.files?.[0]) return;
    try { window.open(await dealFileLink(d.files[0].path), "_blank", "noopener"); } catch (e) { setMsg(e.message || String(e)); }
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await createDealDoc(workspaceId, { dealId: deal.id, fundName, docType: "rate_cap", title: file.name.replace(/\.pdf$/i, ""), files: [file] }, email);
      setMsg(`Uploaded ${file.name}. Review it with Claude and apply it on the Documents tab.`);
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const pendingLoan = docs.find((d) => d.doc_type === "loan" && d.status !== "applied");
  const pendingCaps = docs.filter((d) => d.doc_type === "rate_cap" && d.status !== "applied");

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-900" data-testid="loan-agreement">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Loan agreement and executed rate caps</h3>
        <div className="flex gap-2">
          {canEdit && workspaceId && (
            <>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Upload rate cap confirmation" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${btn} border-violet-300 bg-white text-violet-800`}>{busy ? "Uploading…" : "Upload cap confirmation"}</button>
            </>
          )}
          <button type="button" onClick={onOpenDocuments} className={`${btn} border-blue-200 bg-blue-50 text-blue-700`}>Documents tab</button>
        </div>
      </div>
      {msg && <p className="text-gray-600">{msg}</p>}
      {(pendingLoan || pendingCaps.length > 0) && (
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
          Not applied yet: {[pendingLoan && "the loan agreement", pendingCaps.length && `${pendingCaps.length} cap confirmation${pendingCaps.length === 1 ? "" : "s"}`].filter(Boolean).join(" and ")}. Review and apply on the Documents tab.
        </p>
      )}

      {lt ? (
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="loan-terms">
          <p>Lender: <span className="font-medium">{lt.lender || "—"}</span>{lt.docId && <button type="button" onClick={() => open(lt.docId)} className="ml-1 text-blue-600 hover:underline">PDF</button>}</p>
          <p>Loan: <span className="font-medium">{usd(inputs.loanAmountActual)}</span> (sizing tests replaced)</p>
          <p>Rate: index + <span className="font-medium">{pct(inputs.spreadPct)}</span>{isFinite(lt.floorPct) ? `, floor ${pct(lt.floorPct)}` : ""}</p>
          <p>Initial maturity: <span className="font-medium">{lt.maturityDate || "—"}</span> · {inputs.extensionCount ?? 0} × {inputs.extensionTermYears ?? 1}-yr extensions</p>
          <p>Cap requirement: strike ≤ {pct(lt.capMaxStrikePct)} · rating {lt.capMinRating || "—"} or better · replace {lt.capReplacementDays ?? 30} days before expiry</p>
          {lt.prepayment && <p>Prepayment: {lt.prepayment}</p>}
          {lt.reserves && <p>Reserves: {lt.reserves}</p>}
          {lt.reporting && <p>Reporting: {lt.reporting}</p>}
        </div>
      ) : (
        <p className="text-gray-500">No loan agreement applied. Upload it on the Documents tab (type Loan agreement), review it with Claude (validated by the CREparser connector) and apply the terms you want: loan amount, spread, term and extensions, IO and amortization, covenants and the rate cap requirement.</p>
      )}

      {cov && (
        <div className="overflow-x-auto rounded-lg border border-gray-100" data-testid="covenant-tests">
          <p className="px-2.5 pt-1.5 font-semibold">Covenant tests (model, by year){cov.testing ? ` · tested ${cov.testing}` : ""}</p>
          <table className="w-full tabular-nums">
            <thead className="text-gray-500"><tr>{["Year", `DSCR (min ${isFinite(cov.dscr) ? x(cov.dscr) : "—"})`, `Debt yield (min ${pct(cov.debtYieldPct)})`, `LTV on price (max ${pct(cov.ltvPct, 0)})`].map((h) => <th key={h} className="px-2.5 py-1 text-right font-medium first:text-left">{h}</th>)}</tr></thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.year} className="border-t border-gray-100">
                  <td className="px-2.5 py-1">Year {t.year}</td>
                  <td className={`px-2.5 py-1 text-right ${t.dscrOk ? "" : "font-semibold text-red-700"}`}>{x(t.dscr)}{t.dscrOk ? "" : " ✗"}</td>
                  <td className={`px-2.5 py-1 text-right ${t.dyOk ? "" : "font-semibold text-red-700"}`}>{pct(t.debtYield)}{t.dyOk ? "" : " ✗"}</td>
                  <td className={`px-2.5 py-1 text-right ${t.ltvOk ? "" : "font-semibold text-red-700"}`}>{pct(t.ltv, 1)}{t.ltvOk ? "" : " ✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cov.cure && <p className="px-2.5 pb-1.5 text-[11px] text-gray-500">Cure: {cov.cure}</p>}
        </div>
      )}

      {caps.length > 0 ? (
        <div className="space-y-1.5" data-testid="executed-caps">
          {caps.map((c) => {
            const checks = capChecks(c, inputs);
            return (
              <div key={c.holdYear} className="rounded-lg border border-gray-100 px-2.5 py-1.5">
                <p>
                  <span className="mr-1.5 rounded bg-violet-100 px-1 text-[10px] font-medium uppercase text-violet-800">executed</span>
                  Hold year {c.holdYear} ({c.holdYear === 1 ? "initial" : "renewal"}): <span className="font-medium">{c.provider}</span>{c.rating ? ` (${c.rating})` : ""} · strike {pct(c.strikePct)} {c.index} · {c.effective} to {c.termination} · notional {usd(c.notional)} · premium {usd(c.premium)}
                  {c.docId && <button type="button" onClick={() => open(c.docId)} className="ml-1 text-blue-600 hover:underline">PDF</button>}
                </p>
                {checks.map((k, i) => <p key={i} className={`mt-1 rounded border px-2 py-0.5 text-[11px] ${SEV[k.severity]}`} data-testid="cap-check">{k.severity === "low" ? "" : "⚠ "}{k.text}</p>)}
              </div>
            );
          })}
          <p className="text-[11px] text-gray-500">Executed caps use their actual provider, strike, dates and premium in the cash flows; renewals not yet bought stay modeled (rate cap schedule above).</p>
        </div>
      ) : (
        <p className="text-gray-500">No executed cap confirmations applied: the rate cap schedule above is modeled.</p>
      )}
    </div>
  );
}
