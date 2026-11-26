"use client";

// Finance → GP Partners (user, 11/26, 1.1.10): one list of the outside GP
// capital partners, their agreements and the portfolios and deals they are
// in, with committed capital by partner (and this firm's own row, so the table
// adds up to all GP capital). An agreement's terms are read by Claude (an
// abstract saved on its PDF, like other deal documents) or entered by hand,
// and checked before saving; saving fills the portfolio's Parties and
// economics. lib/gpPartners.js holds the rules. Not a CRM: no contacts.
import { useEffect, useMemo, useState } from "react";
import FundTypeBadge from "@/components/FundTypeBadge";
import { DEFAULT_FUND_TERMS, downloadBlob } from "@/lib/fundTerms";
import { fundGpEconomics } from "@/lib/gpEconomics";
import { agreementFromAbstract, agreementMissing, gpPartnersOf, gpPartnersXlsx, partnerSummary } from "@/lib/gpPartners";
import { createDealDocWithFallback, dealFileLink, listDealDocs } from "@/lib/dealDocs";
import { writeXlsx } from "@/lib/xlsx";

const fmtM = (v) => (v == null || !isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toFixed(2)}M`);
const pct = (v, d = 0) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(d)}%`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const btn = "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-40";
const inp = "rounded border border-gray-300 px-2 py-1 text-xs";
export const GP_AGREEMENT_TAG = (partnerId) => `[gp-agreement:${partnerId}]`;
const tagOf = (title) => /^\[gp-agreement:([^\]]+)\] (.*)$/.exec(title ?? "");

function Card({ label, value, sub, testId }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3" data-testid={testId}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

export default function GpPartners({ deals = [], funds = {}, curve, gp: gpRaw, canEdit = false, workspaceId = null, email = null, scopeName = "", onAddPartner, onSaveAgreement, onRemoveAgreement }) {
  const gp = gpPartnersOf(gpRaw);
  const todayISO = new Date().toISOString().slice(0, 10);
  const [sel, setSel] = useState(null); // selected row key
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState(null); // agreement being entered or checked
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState([]);
  const reload = () => (workspaceId ? listDealDocs(workspaceId).then((d) => setDocs(d.filter((x) => tagOf(x.title)))).catch(() => {}) : Promise.resolve());
  useEffect(() => { reload(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => [...new Set(deals.map((d) => d.inputs?.fundName?.trim()).filter(Boolean))].sort(), [deals]);
  const perFund = useMemo(() => names.map((n) => {
    try { return fundGpEconomics(n, deals.filter((d) => d.inputs?.fundName?.trim() === n), { ...DEFAULT_FUND_TERMS, ...(funds[n] ?? {}), name: n }, { todayISO, curve }); } catch { return null; }
  }).filter(Boolean), [names.join("|"), deals, funds, todayISO, curve]); // eslint-disable-line react-hooks/exhaustive-deps
  const fundTerms = useMemo(() => Object.fromEntries(names.map((n) => [n, { ...DEFAULT_FUND_TERMS, ...(funds[n] ?? {}) }])), [names, funds]);
  const S = useMemo(() => partnerSummary(perFund, fundTerms, gp, { todayISO }), [perFund, fundTerms, gp, todayISO]);
  const t = S.totals;
  const row = S.rows.find((r) => r.key === sel) ?? S.rows.find((r) => !r.firm) ?? null;
  const partner = row && !row.firm ? gp.partners.find((p) => p.id === row.partnerId) ?? null : null;
  const pAgreements = partner ? gp.agreements.filter((a) => a.partnerId === partner.id).sort((a, b) => (a.effective < b.effective ? -1 : 1)) : [];
  // Agreement PDFs Claude has read that aren't saved as an agreement yet.
  const toCheck = docs.filter((d) => d.abstract?.doc_type === "gp_agreement" && !gp.agreements.some((a) => a.docId === d.id)).map((d) => ({ doc: d, draft: agreementFromAbstract(d.abstract, { gp, funds: fundTerms, deals, docId: d.id, fileName: d.files?.[0]?.name ?? tagOf(d.title)?.[2] ?? "" }) })).filter((x) => x.draft);
  const dealsOf = (portfolio) => deals.filter((d) => d.inputs?.fundName?.trim() === portfolio);
  const title = scopeName || "All portfolios";
  const openDoc = async (docId) => { const d = docs.find((x) => x.id === docId); const f = d?.files?.[0]; if (f) window.open(await dealFileLink(f.path), "_blank", "noopener"); };

  async function saveDraft() {
    const miss = agreementMissing(draft);
    if (miss.length) { setMsg(`Still needed: ${miss.join(", ")}.`); return; }
    setBusy(true);
    try {
      let docId = draft.docId ?? null, fileName = draft.fileName ?? "";
      if (file && workspaceId) {
        const row0 = await createDealDocWithFallback(workspaceId, { dealId: null, fundName: draft.portfolio, docType: "other", title: `${GP_AGREEMENT_TAG(draft.partnerId)} ${file.name}`, files: [file] }, email);
        docId = row0?.id ?? null; fileName = file.name;
        await reload();
      }
      const err = onSaveAgreement?.({ ...draft, docId, fileName, source: draft.source ?? "user" });
      if (err) { setMsg(err); return; }
      setDraft(null); setFile(null); setMsg("Agreement saved: the portfolio's Parties and economics now follow it.");
    } catch (e) { setMsg(`Couldn't save: ${e.message || e}`); } finally { setBusy(false); }
  }

  const form = draft && (
    <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-xs" data-testid="gp-agreement-form">
      <p className="font-semibold text-gray-800">{draft.source === "claude" ? <>Agreement terms read by Claude <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">to check</span></> : "Agreement terms"}{draft.fileName ? <span className="font-normal text-gray-500"> · {draft.fileName}</span> : null}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col"><span className="text-[10px] text-gray-500">Partner (legal name)</span>
          <select aria-label="Agreement partner" value={draft.partnerId} onChange={(e) => setDraft({ ...draft, partnerId: e.target.value })} className={inp}><option value="">Choose…</option>{gp.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {draft.source === "claude" && !draft.partnerId && draft.partnerName && <span className="text-[10px] text-amber-700">Claude read &quot;{draft.partnerName}&quot;: add it as a partner or choose one.</span>}
        </label>
        <label className="flex flex-col"><span className="text-[10px] text-gray-500">Portfolio</span>
          <select aria-label="Agreement portfolio" value={draft.portfolio} onChange={(e) => setDraft({ ...draft, portfolio: e.target.value, dealId: null })} className={inp}><option value="">Choose…</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="flex flex-col"><span className="text-[10px] text-gray-500">Scope</span>
          <select aria-label="Agreement scope" value={draft.dealId ?? ""} onChange={(e) => setDraft({ ...draft, dealId: e.target.value || null })} className={inp}><option value="">Fund-wide</option>{dealsOf(draft.portfolio).map((d) => <option key={d.id} value={d.id}>One deal: {d.inputs.propertyName}</option>)}</select></label>
        <label className="flex flex-col"><span className="text-[10px] text-gray-500">Share of the GP capital commitment (%)</span><input aria-label="Agreement capital share" type="number" min={0} max={100} value={draft.capitalPct} onChange={(e) => setDraft({ ...draft, capitalPct: e.target.value })} className={inp} /></label>
        <label className="flex flex-col"><span className="text-[10px] text-gray-500">Share of the promote paid to the GP (%)</span><input aria-label="Agreement promote share" type="number" min={0} max={100} value={draft.gpSideSharePct} onChange={(e) => setDraft({ ...draft, gpSideSharePct: e.target.value })} className={inp} /></label>
        <label className="flex flex-col"><span className="text-[10px] text-gray-500">Effective</span><input aria-label="Agreement effective date" type="date" value={draft.effective} onChange={(e) => setDraft({ ...draft, effective: e.target.value })} className={inp} /></label>
      </div>
      {Object.keys(draft.quotes ?? {}).length > 0 && (
        <ul className="space-y-0.5 text-[10.5px] italic text-gray-500" data-testid="gp-agreement-quotes">{Object.entries(draft.quotes).map(([k, q]) => <li key={k}><span className="not-italic text-gray-600">{k.replace(/_/g, " ")}:</span> &quot;{q}&quot;</li>)}</ul>
      )}
      {draft.source === "claude" && draft.fees && <p className="text-[11px] text-gray-600">Fees: {draft.fees} (the GP earns no fees).</p>}
      {draft.source !== "claude" && !draft.docId && <label className="flex items-center gap-2"><span className="text-[10px] text-gray-500">Agreement PDF (optional)</span><input aria-label="Agreement PDF" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={saveDraft} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Save terms</button>
        <button type="button" onClick={() => { setDraft(null); setFile(null); }} className={btn}>Cancel</button>
        {draft.docId && <button type="button" onClick={() => openDoc(draft.docId)} className={btn}>Open PDF</button>}
        <span className="text-[11px] text-gray-500">Saving fills {draft.portfolio || "the portfolio"} → Parties and economics: the partner{draft.dealId ? " on that deal only" : ""}, this firm the rest. An amendment is a new agreement with a later effective date; earlier periods keep the old terms.</span>
      </div>
    </div>
  );

  return (
    <section className="space-y-4" data-testid="gp-partners">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">GP Partners <span className="text-sm font-normal text-gray-500">· {title}</span></h2>
          <p className="max-w-4xl text-xs text-gray-500">Every outside GP capital partner, with its agreements and the portfolios and deals it&apos;s in. Each agreement&apos;s terms (share of the GP capital commitment, share of the GP&apos;s promote, fund-wide or one deal, effective date) are read by Claude or entered, and checked before saving; they fill each portfolio&apos;s <b>Parties and economics</b>, so GP, Sponsor and Firm Economics follow the agreements. This firm is the sponsor. Not a CRM: just the legal entity. Internal.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={async () => downloadBlob(await writeXlsx(gpPartnersXlsx(S, { title }), { sheetName: "GP Partners", title: `Baywise · ${title} GP Partners (internal)` }), `gp-partners-${todayISO}.xlsx`)} className={btn}>Excel</button>
          <button type="button" onClick={async () => { const { gpPartnersPdf } = await import("@/lib/gpEconomicsPdf"); downloadBlob(await gpPartnersPdf(S, { title, todayISO }), `gp-partners-${todayISO}.pdf`); }} className={btn}>PDF</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="gp-partner-cards">
        <Card testId="gpp-committed" label="Total GP capital committed" value={fmtM(t.committed)} sub={`${t.portfolios} portfolio${t.portfolios === 1 ? "" : "s"} · this firm ${fmtM(t.firmCommitted)} (${pct(t.committed ? (t.firmCommitted / t.committed) * 100 : null)}) · partners ${fmtM(t.partnersCommitted)} (${pct(t.committed ? (t.partnersCommitted / t.committed) * 100 : null)})`} />
        <Card testId="gpp-invested" label="Invested to date" value={fmtM(t.invested)} sub={`${pct(t.committed ? (t.invested / t.committed) * 100 : null)} of committed`} />
        <Card testId="gpp-unfunded" label="Unfunded" value={fmtM(t.unfunded)} sub={`partners ${fmtM(t.partnersUnfunded)} · this firm ${fmtM(t.firmUnfunded)}`} />
        <Card testId="gpp-promote" label="Partners' promote (projected)" value={fmtM(t.partnersPromote)} sub={`${fmtM(t.realized)} realized · this firm keeps ${fmtM(t.firmPromote)} (GP and sponsor sides)`} />
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900">Committed capital by partner</h3>
          {canEdit && (
            <div className="flex items-center gap-2 text-xs">
              <input aria-label="New partner name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Partner's legal name" className={`${inp} w-60`} />
              <button type="button" disabled={!newName.trim()} onClick={() => { const err = onAddPartner?.(newName); if (err) setMsg(err); else { setMsg(""); setNewName(""); } }} className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white disabled:opacity-40">+ Partner</button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200" data-testid="gpp-table">
          <table className="w-full text-xs tabular-nums">
            <thead className="bg-gray-50 text-gray-500"><tr>{["Partner", "Portfolios / deals", "Committed", "Share of all GP capital", "Invested to date", "Unfunded", "Promote (projected)", "Realized", "Agreements"].map((h, i) => <th key={h} className={`px-2.5 py-2 font-medium ${i >= 2 && i <= 7 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>{S.rows.map((r) => (
              <tr key={r.key} onClick={() => !r.firm && setSel(r.key)} className={`border-t border-gray-100 ${!r.firm ? "cursor-pointer hover:bg-gray-50" : ""} ${row?.key === r.key ? "bg-blue-50/60" : ""}`} data-testid="gpp-row">
                <td className="px-2.5 py-1.5">{r.firm ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">This firm (sponsor)</span> : <><b>{r.name}</b> <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">Outside GP</span></>}</td>
                <td className="px-2.5 py-1.5">{r.portfolios.length ? r.portfolios.map((p) => `${p.fund}${p.scope && p.scope !== "fund-wide" ? `: ${p.scope}` : r.firm ? "" : " (fund-wide)"}`).join(" · ") : <span className="text-gray-400">No agreement yet</span>}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(r.committed)}</td>
                <td className="px-2.5 py-1.5 text-right">{pct(r.share)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(r.invested)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(r.unfunded)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(r.promote)}</td>
                <td className="px-2.5 py-1.5 text-right">{fmtM(r.realized)}</td>
                <td className="px-2.5 py-1.5">{r.firm ? "—" : <>{r.agreements.checked > 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">{r.agreements.checked} checked</span>} {toCheck.some((x) => x.draft.partnerId === r.partnerId) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">to check</span>}</>}</td>
              </tr>
            ))}</tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold"><tr><td className="px-2.5 py-1.5">Total</td><td className="px-2.5 py-1.5">{t.portfolios} portfolio{t.portfolios === 1 ? "" : "s"}</td><td className="px-2.5 py-1.5 text-right">{fmtM(t.committed)}</td><td className="px-2.5 py-1.5 text-right">{t.committed ? "100%" : "—"}</td><td className="px-2.5 py-1.5 text-right">{fmtM(t.invested)}</td><td className="px-2.5 py-1.5 text-right">{fmtM(t.unfunded)}</td><td className="px-2.5 py-1.5 text-right">{fmtM(t.promote)}</td><td className="px-2.5 py-1.5 text-right">{fmtM(t.realized)}</td><td /></tr></tfoot>
          </table>
        </div>
        <p className="text-[11px] text-gray-500">Committed = each portfolio&apos;s GP commitment (its commitments × the GP commitment %) × the partner&apos;s capital share, or for a one-deal agreement that deal&apos;s GP equity × its share. Invested to date = its share of the GP equity in assets acquired by today. Promote from each portfolio&apos;s waterfall at the partner&apos;s share of the GP&apos;s promote; this firm&apos;s row is what&apos;s left, plus the sponsor side.</p>
      </div>
      {msg && <p className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700" data-testid="gpp-msg">{msg}</p>}

      {toCheck.length > 0 && !draft && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs" data-testid="gpp-to-check">
          <p className="font-semibold text-amber-900">Agreements read by Claude, to check ({toCheck.length})</p>
          {toCheck.map(({ doc, draft: d0 }) => (
            <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{d0.partnerName || "Partner?"} · {d0.portfolio || "portfolio?"}{d0.dealName ? ` · ${d0.dealName}` : ""} · {d0.fileName}</span>
              {canEdit && <button type="button" onClick={() => { setDraft(d0); setMsg(""); }} className={btn}>Check terms</button>}
            </div>
          ))}
        </div>
      )}
      {form}

      {partner && row && (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="gpp-detail">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-xs">
            <div className="flex items-center justify-between"><p className="text-sm font-bold text-gray-900">{partner.name}</p>{canEdit && !draft && <button type="button" onClick={() => { setDraft({ partnerId: partner.id, portfolio: names[0] ?? "", dealId: null, capitalPct: "", gpSideSharePct: "", effective: todayISO, source: "user", quotes: {} }); setMsg(""); }} className={btn}>+ Agreement</button>}</div>
            <p className="font-semibold text-gray-700">Portfolios and deals</p>
            {row.portfolios.length ? (
              <table className="w-full tabular-nums"><thead className="text-gray-500"><tr><th className="text-left font-medium">Portfolio</th><th className="text-left font-medium">Scope</th><th className="text-right font-medium">{row.portfolios.some((p) => p.scope !== "fund-wide") ? "GP commitment (fund)" : "GP commitment"}</th><th className="text-right font-medium">Committed</th><th className="text-right font-medium">Invested</th><th className="text-right font-medium">Capital share</th><th className="text-right font-medium">Share of the GP&apos;s promote</th></tr></thead>
                <tbody>{row.portfolios.map((p) => <tr key={p.fund} className="border-t border-gray-100"><td className="py-1"><span className="flex items-center gap-1">{p.fund}<FundTypeBadge type={p.type} /></span></td><td>{p.scope}</td><td className="text-right">{fmtM(p.gpCommitment)}</td><td className="text-right">{fmtM(p.committed)}</td><td className="text-right">{fmtM(p.invested)}</td><td className="text-right">{pct(p.capitalShare)}</td><td className="text-right">{pct(p.gpSideShare)}</td></tr>)}</tbody></table>
            ) : <p className="text-gray-500">No agreement saved yet.</p>}
            <p className="font-semibold text-gray-700">Earned with the firm (projected)</p>
            <p>Co-invest profit {fmtM(row.coinvest)} · promote {fmtM(row.promote)} · total {fmtM(row.coinvest + row.promote)}</p>
          </div>
          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-xs">
            <p className="font-semibold text-gray-700">Agreements</p>
            {pAgreements.length ? (
              <ul className="space-y-1" data-testid="gpp-agreements">{pAgreements.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 px-2 py-1">
                  <span>{a.portfolio}{a.dealId ? ` · ${deals.find((d) => d.id === a.dealId)?.inputs?.propertyName ?? "one deal"} only` : " · fund-wide"} · {a.capitalPct}% of GP capital · {a.gpSideSharePct}% of the GP&apos;s promote · from {usDate(a.effective)}<span className="text-gray-400"> · {a.source === "claude" ? "read by Claude, " : ""}checked {a.checkedBy ? `by ${a.checkedBy} ` : ""}{usDate(String(a.checkedAt ?? "").slice(0, 10))}</span></span>
                  <span className="flex gap-1">{a.docId && <button type="button" onClick={() => openDoc(a.docId)} className={btn}>PDF</button>}{canEdit && <button type="button" onClick={() => { if (window.confirm("Remove this agreement? The portfolio's parties are rebuilt without it.")) onRemoveAgreement?.(a.id); }} className={btn}>Remove</button>}</span>
                </li>
              ))}</ul>
            ) : <p className="text-gray-500">None yet. Upload the agreement (+ Agreement) or ask Claude to read it into the Document Library.</p>}
          </div>
        </div>
      )}
      {!gp.partners.length && <p className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-xs text-gray-500" data-testid="gpp-empty">No outside GP partners yet: this firm has all of the GP capital and the promote. Add a partner by its legal name, then its agreement.</p>}
    </section>
  );
}
