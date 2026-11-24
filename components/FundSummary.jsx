"use client";

// Phase N: Portfolio Summary tab (Portfolio Management, first). One page of key
// facts about a fund, with links to the tabs that hold performance, the
// portfolio and upcoming dates.
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FUND_TERMS, downloadBlob, safeFileName } from "@/lib/fundTerms";
import { fundOptionLabel } from "@/lib/fundTypes";
import { writeXlsx } from "@/lib/xlsx";
import { createDealDoc, dealFileLink, deleteDealDoc, listDealDocs } from "@/lib/dealDocs";
import { DOC_CATEGORIES, ENTITY_ROLES, capitalSummary, einLast4, keyDates, keyTerms, ownershipTree, roleLabel, suggestAssetEntities, summaryXlsx } from "@/lib/fundSummary";
import FundTypeBadge from "@/components/FundTypeBadge";

const fmtM = (n) => (n == null || !isFinite(n) ? "—" : `$${(n / 1e6).toFixed(2)}M`);
const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "—");
const btn = "rounded-lg border px-3 py-1.5 text-xs font-medium";
const cell = "w-full rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:border-transparent disabled:bg-transparent";

function Box({ title, testId, children, right }) {
  return (
    <section className="rounded-xl border border-gray-200 p-3" data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-gray-800">{title}</h3>{right}</div>
      {children}
    </section>
  );
}

function OrgNode({ e, depth = 0 }) {
  const cls = { fund: "border-blue-400 bg-blue-50", gp: "border-emerald-400 bg-emerald-50", manager: "border-violet-400 bg-violet-50", asset: "border-gray-300 bg-white", other: "border-gray-300 bg-gray-50" }[e.role] ?? "border-gray-300";
  return (
    <div className={depth ? "ml-6 border-l border-gray-300 pl-3" : ""}>
      <div className={`my-1 inline-block rounded-lg border px-2.5 py-1 text-xs ${cls}`} data-testid="org-node">
        <span className="font-semibold">{e.name}</span> <span className="text-gray-500">· {roleLabel(e.role)}{e.state ? ` · ${e.state}` : ""}</span>
      </div>
      {e.children.map((c) => <OrgNode key={c.id} e={c} depth={depth + 1} />)}
    </div>
  );
}

function LegalDocs({ workspaceId, fundName, canEdit, email }) {
  const [docs, setDocs] = useState(null);
  const [cat, setCat] = useState(DOC_CATEGORIES[0]);
  const [msg, setMsg] = useState("");
  const ref = useRef(null);
  const load = () => listDealDocs(workspaceId).then((all) => setDocs(all.filter((d) => d.fund_name === fundName && !d.deal_id && d.doc_type === "other" && DOC_CATEGORIES.some((c) => (d.title ?? "").startsWith(`${c}: `))))).catch((e) => setMsg(e.message));
  useEffect(() => { if (workspaceId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, fundName]);
  if (!workspaceId) return <p className="text-xs text-gray-400">Sign in to upload and open org charts and formation documents.</p>;
  return (
    <div className="space-y-2 text-xs" data-testid="legal-docs">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Document type" value={cat} onChange={(e) => setCat(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">{DOC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <button type="button" onClick={() => ref.current?.click()} className={`${btn} border-blue-200 bg-blue-50 text-blue-700`}>Upload PDF</button>
          <input ref={ref} type="file" accept="application/pdf" className="hidden" data-testid="legal-file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { await createDealDoc(workspaceId, { fundName, docType: "other", title: `${cat}: ${f.name}`, files: [f] }, email); setMsg(`Uploaded ${f.name}.`); load(); } catch (err) { setMsg(err.message); } }} />
        </div>
      )}
      {msg && <p className="text-gray-600">{msg}</p>}
      {docs == null ? <p className="text-gray-400">Loading…</p> : docs.length === 0 ? <p className="text-gray-400">No legal documents yet.</p> : (
        <ul className="space-y-1">{docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded border border-gray-100 px-2 py-1" data-testid="legal-doc">
            <span>{d.title}</span>
            <span className="flex gap-2">
              <button type="button" onClick={async () => d.files?.[0] && window.open(await dealFileLink(d.files[0].path), "_blank", "noopener")} className="text-blue-700 hover:underline">Open</button>
              {canEdit && <button type="button" onClick={async () => { if (!window.confirm(`Delete ${d.title}?`)) return; await deleteDealDoc(d); load(); }} className="text-gray-400 hover:text-red-600">Delete</button>}
            </span>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

export default function FundSummary({ deals, funds, canEdit, email, workspaceId, onFundTermsChange, onOpenTab, planSlot = null }) {
  const names = Object.keys(funds);
  const [pick, setPick] = useState(null);
  const fund = names.includes(pick) ? pick : names[0];
  const terms = useMemo(() => (fund ? { ...DEFAULT_FUND_TERMS, ...(funds[fund] ?? {}), name: fund } : null), [funds, fund]);
  const today = new Date().toISOString().slice(0, 10);
  const fundDeals = useMemo(() => deals.filter((d) => d.inputs.fundName?.trim() === fund), [deals, fund]);
  const dates = useMemo(() => (terms ? keyDates(terms, today) : null), [terms, today]);
  const cap = useMemo(() => (terms ? capitalSummary(terms, fundDeals, today) : null), [terms, fundDeals, today]);
  if (!terms) return <p className="text-sm text-gray-500">Set up a fund first (Portfolio Return → New fund).</p>;
  const entities = terms.entities ?? [];
  const setT = (patch) => canEdit && onFundTermsChange(fund, patch);
  const setEnt = (id, patch) => setT({ entities: entities.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const fundEnt = entities.find((e) => e.role === "fund");
  const tree = ownershipTree(entities);

  return (
    <section className="space-y-3" data-testid="fund-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">Portfolio Summary <span className="text-sm font-normal text-gray-500">· {fund}</span><FundTypeBadge type={terms.type} /></h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {names.length > 1 && <select aria-label="Fund" value={fund} onChange={(e) => setPick(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5">{names.map((n) => <option key={n} value={n}>{fundOptionLabel(n, funds)}</option>)}</select>}
          <button type="button" onClick={async () => { const { fundFactSheetPdf } = await import("@/lib/fundSummaryPdf"); downloadBlob(await fundFactSheetPdf(fund, terms, dates, cap, entities), `${safeFileName(fund)}-fact-sheet.pdf`); }} className={`${btn} border-gray-300 bg-white text-gray-700`}>Fact sheet (PDF)</button>
          <button type="button" onClick={() => downloadBlob(writeXlsx(summaryXlsx(fund, terms, dates, cap, entities), { sheetName: "Fund summary", title: `Baywise · ${fund} fund summary` }), `${safeFileName(fund)}-fund-summary.xlsx`)} className={`${btn} border-gray-300 bg-white text-gray-700`}>Excel</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Box title="Key dates" testId="fs-dates">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-gray-500">Launch</dt><dd>{canEdit ? <input aria-label="Launch date" type="date" value={terms.launchDate ?? ""} onChange={(e) => setT({ launchDate: e.target.value })} className="rounded border border-gray-300 px-1 py-0.5" /> : usDate(dates.launch)}</dd>
            <dt className="text-gray-500">Final close</dt><dd>{usDate(dates.finalClose)}</dd>
            <dt className="text-gray-500">Investment period ends</dt><dd>{usDate(dates.investmentPeriodEnd)} <span className="text-gray-400">({dates.ipMonthsLeft} months left)</span></dd>
            <dt className="text-gray-500">End of term</dt><dd>{usDate(dates.fundEnd)} <span className="text-gray-400">({dates.termMonthsLeft} months left)</span></dd>
            <dt className="text-gray-500">Outside date (all extensions)</dt><dd>{usDate(dates.outsideDate)}</dd>
          </dl>
        </Box>
        <Box title="Capital" testId="fs-capital">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
            <dt className="text-gray-500">Raised (commitments)</dt><dd>{fmtM(cap.commitments)}</dd>
            <dt className="text-gray-500">Called</dt><dd>{fmtM(cap.called)} {cap.pctCalled != null && <span className="text-gray-500">({cap.pctCalled.toFixed(1)}% of commitments)</span>} <span className="text-[10px] text-gray-400">{cap.calledSource}</span></dd>
            <dt className="text-gray-500">Deployed in assets</dt><dd>{fmtM(cap.deployed)} <span className="text-gray-400">({cap.assets} assets)</span></dd>
            <dt className="text-gray-500">Available (dry powder)</dt><dd>{fmtM(cap.dryPowder)}</dd>
            <dt className="text-gray-500">After fund reserves</dt><dd>{fmtM(cap.dryPowderAfterReserves)}</dd>
            <dt className="text-gray-500">Sub line drawn / capacity</dt><dd>{cap.lineDrawn != null ? fmtM(cap.lineDrawn) : "—"} / {fmtM(cap.lineSize)}</dd>
          </dl>
        </Box>
      </div>

      <Box title="Key terms" testId="fs-terms" right={<span className="text-[11px] text-gray-500">From the fund&apos;s terms (Portfolio Return → Edit fund; the LPA / PPM on the Documents tab)</span>}>
        <table className="w-full text-xs"><tbody>
          {keyTerms(terms).filter(([k]) => k !== "Key person" && k !== "GP removal").map(([k, v]) => <tr key={k} className="border-t border-gray-100 first:border-0"><td className="w-48 py-1 align-top text-gray-500">{k}</td><td className="py-1">{v}</td></tr>)}
          {[["keyPerson", "Key person"], ["removal", "GP removal"]].map(([k, l]) => (
            <tr key={k} className="border-t border-gray-100"><td className="py-1 align-top text-gray-500">{l}</td><td className="py-1">{canEdit ? <input aria-label={l} defaultValue={terms[k] ?? ""} placeholder="From the LPA, if it has one" onBlur={(e) => e.target.value !== (terms[k] ?? "") && setT({ [k]: e.target.value })} className="w-full rounded border border-gray-300 px-1.5 py-0.5" /> : terms[k] || "—"}</td></tr>
          ))}
        </tbody></table>
      </Box>

      <Box title="Legal entities" testId="fs-entities" right={canEdit && (
        <span className="flex gap-2 text-xs">
          <button type="button" onClick={() => setT({ entities: [...entities, { id: `ent-${Date.now().toString(36)}`, name: entities.length ? "New entity" : `${fund} LP`, role: entities.some((e) => e.role === "fund") ? "other" : "fund", state: "", formed: "", einLast4: "", agent: "", annualReportDue: "", dealId: null, parentId: null }] })} className={`${btn} border-gray-300 bg-white text-gray-700`}>Add entity</button>
          <button type="button" onClick={() => { const add = suggestAssetEntities(entities, fundDeals, fundEnt?.id ?? null); if (add.length) setT({ entities: [...entities, ...add] }); }} className={`${btn} border-gray-300 bg-white text-gray-700`}>Add a company for each asset</button>
        </span>
      )}>
        {entities.length === 0 ? <p className="text-xs text-gray-400">No entities yet. Add the fund, GP and manager, then a property company for each asset.</p> : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500"><tr>{["Name", "Role", "State", "Formed", "EIN (last 4)", "Registered agent", "Annual report due", "Owned by", ""].map((h) => <th key={h} className="px-1 py-1 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {entities.map((e) => (
                    <tr key={e.id} className="border-t border-gray-100" data-testid="entity-row">
                      <td className="min-w-[200px] px-1 py-0.5"><input aria-label={`Entity name ${e.name}`} disabled={!canEdit} defaultValue={e.name} onBlur={(x) => x.target.value !== e.name && setEnt(e.id, { name: x.target.value })} className={cell} /></td>
                      <td className="min-w-[140px] px-1 py-0.5"><select aria-label={`Role ${e.name}`} disabled={!canEdit} value={e.role} onChange={(x) => setEnt(e.id, { role: x.target.value })} className={cell}>{ENTITY_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                      <td className="w-12 px-1 py-0.5"><input aria-label={`State ${e.name}`} disabled={!canEdit} defaultValue={e.state} maxLength={2} onBlur={(x) => x.target.value !== e.state && setEnt(e.id, { state: x.target.value.toUpperCase() })} className={cell} /></td>
                      <td className="px-1 py-0.5"><input aria-label={`Formed ${e.name}`} type="date" disabled={!canEdit} value={e.formed ?? ""} onChange={(x) => setEnt(e.id, { formed: x.target.value })} className={cell} /></td>
                      <td className="w-20 px-1 py-0.5"><input key={`ein-${e.id}-${e.einLast4 ?? ""}`} aria-label={`EIN ${e.name}`} disabled={!canEdit} defaultValue={e.einLast4 ? `••••${e.einLast4}` : ""} placeholder="last 4" onBlur={(x) => { const v = einLast4(x.target.value); if (v !== (e.einLast4 ?? "")) setEnt(e.id, { einLast4: v }); }} className={cell} title="Only the last 4 digits are kept" /></td>
                      <td className="px-1 py-0.5"><input aria-label={`Agent ${e.name}`} disabled={!canEdit} defaultValue={e.agent} onBlur={(x) => x.target.value !== e.agent && setEnt(e.id, { agent: x.target.value })} className={cell} /></td>
                      <td className="px-1 py-0.5"><input aria-label={`Annual report ${e.name}`} type="date" disabled={!canEdit} value={e.annualReportDue ?? ""} onChange={(x) => setEnt(e.id, { annualReportDue: x.target.value })} className={cell} /></td>
                      <td className="min-w-[170px] px-1 py-0.5"><select aria-label={`Owned by ${e.name}`} disabled={!canEdit} value={e.parentId ?? ""} onChange={(x) => setEnt(e.id, { parentId: x.target.value || null })} className={cell}><option value="">{e.role === "asset" && fundEnt ? `(the fund)` : "—"}</option>{entities.filter((o) => o.id !== e.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
                      <td className="px-1 py-0.5">{canEdit && <button type="button" aria-label={`Remove ${e.name}`} onClick={() => window.confirm(`Remove ${e.name}?`) && setT({ entities: entities.filter((o) => o.id !== e.id).map((o) => (o.parentId === e.id ? { ...o, parentId: null } : o)) })} className="text-gray-400 hover:text-red-600">×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-gray-400">Only the last 4 digits of an EIN are kept. Annual-report due dates appear on Leases → Critical dates.</p>
            </div>
            <div data-testid="org-chart"><div className="mb-1 text-xs font-medium text-gray-600">Ownership chart</div>{tree.map((e) => <OrgNode key={e.id} e={e} />)}</div>
          </div>
        )}
      </Box>

      <Box title="Org charts and formation documents" testId="fs-docs"><LegalDocs workspaceId={workspaceId} fundName={fund} canEdit={canEdit} email={email} /></Box>

      {/* Plan vs. actual (the former Fund Plan tab; user, 11/24) */}
      {planSlot && <div className="rounded-xl border border-gray-200 p-4" data-testid="fs-plan">{planSlot(fund)}</div>}

      <Box title="Elsewhere" testId="fs-links">
        <div className="flex flex-wrap gap-2 text-xs">
          {[["fund", "Performance: Portfolio Return"], ["valuations", "Valuation and NAV"], ["assets", "Portfolio: Asset Summary"], ["leases", "Upcoming dates: Leases → Critical dates"], ["reports", "Reports"]].map(([tab, l]) => (
            <button key={tab} type="button" onClick={() => onOpenTab?.(tab)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-blue-700 hover:bg-gray-50">{l} →</button>
          ))}
        </div>
      </Box>
    </section>
  );
}
