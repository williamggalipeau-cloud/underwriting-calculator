"use client";

// Phase Z: the landing page, the Dashboard (opened by Home), for
// the portfolio chosen in the "Working on" picker. Sections (user, 11/24):
// Actions Needed (urgent: overdue, due within 30 days, or an issue now),
// Upcoming Events (critical action and milestone dates, a year back and a
// year ahead) and Asset Watch List (the risk report's watch list). Setup &
// Maintenance sits under the Functions tab bar on every page.
import InfoNote from "@/components/InfoNote";
import { useEffect, useMemo, useState } from "react";
import { actionsAndCalendar, planWatchList } from "@/lib/home";
import { listLeases } from "@/lib/leaseDocs";

const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const KIND = {
  rent: ["Rent", "bg-red-50 text-red-700"],
  lease: ["Lease", "bg-amber-50 text-amber-800"],
  leaseended: ["Lease ended", "bg-amber-100 text-amber-900"], // 1.1.24: ended with no newer lease recorded
  leasing: ["Leasing", "bg-indigo-50 text-indigo-800"],
  covenant: ["Covenant", "bg-red-50 text-red-700"],
  tax: ["Property tax", "bg-orange-50 text-orange-800"],
  insurance: ["Insurance", "bg-teal-50 text-teal-800"],
  contract: ["Contract", "bg-gray-100 text-gray-700"],
  condition: ["Repair", "bg-red-50 text-red-700"],
  extension: ["Extension", "bg-amber-50 text-amber-800"],
  loan: ["Loan", "bg-violet-50 text-violet-800"],
  cap: ["Rate cap", "bg-sky-50 text-sky-800"],
  appraisal: ["Appraisal", "bg-gray-100 text-gray-700"],
  budget: ["Budget", "bg-red-50 text-red-700"],
  milestone: ["Milestone", "bg-violet-50 text-violet-800"],
  acquisition: ["Purchase", "bg-sky-50 text-sky-800"],
  leasedate: ["Lease date", "bg-amber-50 text-amber-800"],
  covenanttest: ["Covenant test", "bg-violet-50 text-violet-800"],
  construction: ["Construction", "bg-orange-50 text-orange-800"],
  sale: ["Sale", "bg-emerald-50 text-emerald-800"],
  fund: ["Fund", "bg-blue-50 text-blue-700"],
  lenderreport: ["Lender report", "bg-violet-50 text-violet-800"],
  entity: ["Legal entity", "bg-blue-50 text-blue-700"],
};
// The asset has its own column: drop "(Asset)" / ", Asset)" from the text.
const shortText = (a) => (a.asset ? a.text.replace(` (${a.asset})`, "").replace(`, ${a.asset})`, ")") : a.text);
const STATUS_CLS = { "Past Due": "bg-red-50 text-red-700", "Due now": "bg-gray-900 text-white", Completed: "bg-emerald-50 text-emerald-700", Upcoming: "bg-gray-100 text-gray-600" };
const Status = ({ s }) => <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLS[s] ?? ""}`} data-testid="status">{s}</span>;
const Kind = ({ k }) => <span className={`inline-block w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold ${KIND[k]?.[1] ?? ""}`}>{KIND[k]?.[0] ?? k}</span>;
const Owner = ({ o }) => (o ? <span>{o}</span> : <span className="text-gray-500" title="Set the asset manager on the asset (Edit asset) or the portfolio manager on the fund (Edit fund)">Unassigned</span>);
const TH = "px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600"; // 1.1.11: title case, like every other table
const Head = () => (
  <thead className="border-b border-gray-200 bg-gray-50">
    <tr>
      <th className={TH}>Asset name</th>
      <th className={TH}>Due date</th>
      <th className={TH}>Action type</th>
      <th className={TH}>Owner</th>
      <th className={TH}>Status</th>
      <th className={`${TH} text-right`}>Details</th>
    </tr>
  </thead>
);
// Status (user, 11/24): the Done button is gone; choosing Completed marks the
// item done (it leaves Actions Needed); choosing its open status again undoes it.
const StatusCell = ({ a, onMarkDone }) => {
  if (!onMarkDone || a.resolved || a.state === "past") return <Status s={a.status} />;
  const open = a.date && a.days < 0 ? "Past Due" : a.days != null && a.days > 30 ? "Upcoming" : "Due now";
  const cur = a.done ? "Completed" : a.status;
  return (
    <select aria-label={`Status: ${a.text}`} data-testid="status" value={cur} onChange={(e) => (e.target.value === "Completed" ? onMarkDone(a) : a.done && onMarkDone(a, true))} className={`rounded border-0 px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLS[cur] ?? ""}`}>
      <option value={a.done ? open : cur}>{a.done ? open : cur}</option>
      <option value="Completed">Completed</option>
    </select>
  );
};
const monthLabel = (iso) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default function Home({ deals = [], funds = {}, valuations = {}, curve, scopeName = "", tabLabels = {}, onOpenTab, onOpenDeal, actions = [], pipeline = [], workspaceId = null, done = {}, onMarkDone = null }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  // Lease abstracts (critical dates) when signed in to the firm's workspace.
  const [leases, setLeases] = useState(null);
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    listLeases(workspaceId).then((l) => live && setLeases(l)).catch(() => {});
    return () => { live = false; };
  }, [workspaceId]);
  const ac = useMemo(() => actionsAndCalendar(deals, funds, valuations, { todayISO, pipeline, leases, done }), [deals, funds, valuations, todayISO, pipeline, leases, done]);
  const [showPast, setShowPast] = useState(false);
  const pastItems = ac.calendar.filter((x) => x.days < 0);
  // Default view: the next three months (user, 11/24); Show all goes to a year out.
  const [allCal, setAllCal] = useState(false);
  const d3 = new Date(`${todayISO}T00:00:00Z`); d3.setUTCMonth(d3.getUTCMonth() + 3);
  const in3 = d3.toISOString().slice(0, 10);
  const yearItems = showPast ? ac.calendar : ac.calendar.filter((x) => x.days >= 0);
  const calItems = allCal ? yearItems : yearItems.filter((x) => x.date <= in3);
  const attention = ac.actions;
  const watch = useMemo(() => planWatchList(deals, funds, valuations, { todayISO, calendar: ac.calendar }), [deals, funds, valuations, todayISO, ac.calendar]);
  const [allWatch, setAllWatch] = useState(false);
  const open = (a) => (a.dealId && onOpenDeal ? onOpenDeal(a.dealId, a.tab) : onOpenTab?.(a.tab));
  const [allAtt, setAllAtt] = useState(false);
  const shown = allAtt ? attention : attention.slice(0, 12);
  // Day counts and dates change daily, but the page is pre-rendered when the
  // site is built: render them only in the browser, so the pre-rendered HTML
  // never disagrees with today's (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="text-xs text-gray-500" data-testid="home-loading">Loading the Dashboard…</div>;

  return (
    <div className="space-y-5 text-gray-900" data-testid="home">
      <div>
        <h2 className="text-lg font-bold">Home</h2>{/* 1.1.11 (UI review): one name, matching the Home button */}
        <p className="text-xs text-gray-600">{scopeName ? `${scopeName}: ` : "All portfolios: "}what needs doing now, what&apos;s coming up and the assets on watch.</p>
      </div>

      {/* 1. Actions Needed (was "Today · needs attention"; user, 11/24) */}
      <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid="attention">
        <h3 className="mb-0.5 text-sm font-semibold">Actions Needed {attention.length > 0 && <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[11px] text-gray-700">{attention.length}</span>}{attention.length > 0 && <span className="ml-1 text-xs font-normal text-gray-600" data-testid="attention-counts">· {attention.filter((a) => a.days != null && a.days < 0).length} past due · {attention.filter((a) => !(a.days != null && a.days < 0)).length} due now</span>}</h3>
        {/* 1.1.11 (UI review): red only on the status chip; the rules behind ⓘ. */}
        <InfoNote short="What needs doing now, most urgent first." testId="attention-info">Past Due = after its date; Due now = within {ac.urgentDays} days, or an issue to fix now. Items roll on as they come due and leave once done{onMarkDone ? " (set Status to Completed)" : ""} or once the data shows them handled. Details opens the item where it&apos;s handled.</InfoNote>
        {attention.length === 0 ? (
          <p className="text-xs text-gray-500">Nothing urgent: nothing overdue or due in the next {ac.urgentDays} days, no covenant breaches, immediate repairs, missing marks, rent 60+ days late or budgets in the red.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="actions-table">
              <Head />
              <tbody className="divide-y divide-gray-100">
                {shown.map((a, i) => {
                  const od = a.days != null && a.days < 0;
                  return (
                    <tr key={`${a.kind}-${a.dealId ?? ""}-${i}`} data-testid="action-row" data-phone-more={!allAtt && i >= 5 ? "true" : undefined} className="align-top">
                      <td className="px-2 py-1.5 font-medium" data-testid="cell-asset">{a.asset || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-gray-900">{a.date ? <>{usDate(a.date)}<span className="block text-[10px] text-gray-500">{od ? `${-a.days} d ago` : `${a.days} d`}</span></> : <span className="text-gray-500">Now</span>}</td>
                      <td className="px-2 py-1.5"><div className="flex items-start gap-2"><Kind k={a.kind} /><span className={od ? "font-medium text-gray-900" : "text-gray-900"} data-overdue={od ? "yes" : "no"}>{shortText(a)}</span></div></td>
                      <td className="whitespace-nowrap px-2 py-1.5" data-testid="cell-owner"><Owner o={a.owner} /></td>
                      <td className="px-2 py-1.5"><StatusCell a={a} onMarkDone={onMarkDone} /></td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <button type="button" aria-label={`Open ${tabLabels[a.tab] ?? a.tab}: ${a.text}`} onClick={() => open(a)} className="whitespace-nowrap rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">{tabLabels[a.tab] ?? "Open"} →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {attention.length > 5 && <button type="button" onClick={() => setAllAtt(!allAtt)} className={`mt-1 text-[11px] text-blue-700 hover:underline ${attention.length <= 12 && !allAtt ? "sm:hidden" : ""}`}>{allAtt ? "Show fewer" : `Show all ${attention.length}`}</button>}
      </section>

      {/* 1b. Upcoming Events (was Calendar): critical action and milestone dates, a year back to a year ahead (user, 11/24) */}
      <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid="calendar">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="mb-0.5 text-sm font-semibold">Upcoming Events {calItems.length > 0 && <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[11px] text-gray-700">{calItems.length}</span>}</h3>
          {pastItems.length > 0 && <button type="button" onClick={() => setShowPast(!showPast)} className="text-[11px] text-blue-700 hover:underline">{showPast ? "Hide the past 12 months" : `Show the past 12 months (${pastItems.length})`}</button>}
        </div>
        <InfoNote short="Critical dates in the next three months." testId="events-info">Show all: a year ahead; the past 12 months on request. Covers leases (rent roll and abstracts{workspaceId ? "" : ", when signed in"}), debt (maturities, caps, extension notices, covenant tests and lender reporting), appraisals, property management, construction, business plan milestones, purchase and sale contracts, fund dates and legal entities\u2019 annual reports. Status: Past Due, Due now (within {ac.urgentDays} days), Upcoming, or Completed (in gray). Owner: the asset&apos;s asset manager or the fund&apos;s portfolio manager, unless the item names one.</InfoNote>
        {calItems.length === 0 && !(yearItems.length > calItems.length) ? <p className="text-xs text-gray-500">Nothing scheduled in the next 12 months.</p> : (
          <div className="space-y-2 text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="calendar-table">
                <Head />
                {Object.entries(calItems.reduce((m, x) => { (m[x.date.slice(0, 7)] ??= []).push(x); return m; }, {})).map(([mo, xs]) => (
                  <tbody key={mo} data-testid="calendar-month" className="divide-y divide-gray-100">
                    <tr><td colSpan={6} className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{monthLabel(mo)}</td></tr>
                    {xs.map((a, i) => {
                      const cls = a.state === "overdue" ? "font-medium text-gray-900" : a.state === "done" || a.state === "past" ? "text-gray-500" : "text-gray-900";
                      return (
                        <tr key={`${a.key}-${i}`} data-testid="calendar-item" data-state={a.state} data-days={a.days} className="align-top">
                          <td className={`px-2 py-1.5 font-medium ${a.state === "done" || a.state === "past" ? "text-gray-500" : ""}`} data-testid="cell-asset">{a.asset || "—"}</td>
                          <td className={`whitespace-nowrap px-2 py-1.5 tabular-nums ${cls}`}>{usDate(a.date)}<span className="block text-[10px] text-gray-500">{a.days < 0 ? `${-a.days} d ago` : `${a.days} d`}</span></td>
                          <td className="px-2 py-1.5"><div className="flex items-start gap-2"><Kind k={a.kind} /><span className={cls}>{shortText(a)}{a.state === "done" && a.done && <span className="ml-1 text-emerald-700">✓ done {usDate(String(a.done.at).slice(0, 10))}{a.done.by ? ` by ${a.done.by}` : ""}</span>}</span></div></td>
                          <td className="whitespace-nowrap px-2 py-1.5" data-testid="cell-owner"><Owner o={a.owner} /></td>
                          <td className="px-2 py-1.5"><StatusCell a={a} onMarkDone={onMarkDone} /></td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right">
                            <button type="button" aria-label={`Open ${tabLabels[a.tab] ?? a.tab}: ${a.text}`} onClick={() => open(a)} className="whitespace-nowrap rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">{tabLabels[a.tab] ?? "Open"} →</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            {(allCal || yearItems.length > calItems.length) && <button type="button" onClick={() => setAllCal(!allCal)} className="text-[11px] text-blue-700 hover:underline">{allCal ? "Show the next three months only" : `Show all ${yearItems.length}, a year out (${yearItems.length - calItems.length} more)`}</button>}
          </div>
        )}
      </section>

      {/* 2. Asset Watch List (user, 11/24): plan performance only. NOI or IRR
          under plan: up to 10% under is Off Plan, more than 10% At Risk. */}
      <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid="assets-watch">
        <h3 className="mb-0.5 text-sm font-semibold">Asset Watch List {watch.assets.length > 0 && <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[11px] text-gray-700">{watch.assets.length}</span>}</h3>
        <InfoNote short="Assets running under their business plan." testId="watch-info">Measured on NOI (year to date vs. the plan) or IRR (at the {usDate(watch.irrAsOf)} mark vs. the underwritten IRR, once held a year). At Risk: more than {watch.atRiskPct}% under; Off Plan: up to {watch.atRiskPct}% under.</InfoNote>
        {watch.assets.length === 0 ? (
          <p className="text-xs text-gray-600" data-testid="watch-empty">No assets under plan on NOI or IRR. An asset is measured once it has a business plan with actuals or a mark.{onOpenTab && <> <button type="button" onClick={() => onOpenTab("plan")} className="font-medium text-blue-700 hover:underline">Open Asset Business Plan →</button></>}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="watch-table">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className={TH}>Asset name</th>
                    <th className={TH}>Owner</th>
                    <th className={TH}>Plan status</th>
                    <th className={`${TH} text-right`}>NOI vs. plan</th>
                    <th className={`${TH} text-right`}>IRR vs. plan</th>
                    <th className={TH}>Other goals missed</th>
                    <th className={TH}>Next event</th>
                    <th className={`${TH} text-right`}>Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(allWatch ? watch.assets : watch.assets.slice(0, 8)).map((w) => (
                    <tr key={w.id} data-testid="watch-asset" className="align-top">
                      <td className="px-2 py-1.5 font-medium" data-testid="cell-asset">{w.name}<span className="block text-[10px] font-normal text-gray-500">{w.fund}</span></td>
                      <td className="whitespace-nowrap px-2 py-1.5" data-testid="cell-owner"><Owner o={w.owner} /></td>
                      <td className="px-2 py-1.5"><span data-testid="plan-status" className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${w.status === "At Risk" ? "bg-red-600 text-white" : "bg-amber-100 text-amber-800"}`}>{w.status}</span></td>
                      <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${w.noi?.pct < 0 ? "text-red-700" : ""}`}>{w.noi ? <>{w.noi.pct.toFixed(1)}%<span className="block text-[10px] text-gray-500">${Math.round(w.noi.actual / 1000).toLocaleString("en-US")}K vs ${Math.round(w.noi.plan / 1000).toLocaleString("en-US")}K · {w.noi.months} mo</span></> : <span className="text-gray-500">—</span>}</td>
                      <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${w.irr?.pct < 0 ? "text-red-700" : ""}`}>{w.irr ? <>{w.irr.actual.toFixed(1)}%<span className="block text-[10px] text-gray-500">vs {w.irr.plan.toFixed(1)}% plan</span></> : <span className="text-gray-500">—</span>}</td>
                      <td className="px-2 py-1.5 text-gray-700">{w.goals.length ? w.goals.join(" · ") : <span className="text-gray-500">None</span>}</td>
                      <td className="px-2 py-1.5">{w.next ? <>{usDate(w.next.date)}<span className="block text-[10px] text-gray-500">{shortText({ ...w.next, asset: w.name })}</span></> : <span className="text-gray-500">—</span>}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">{onOpenDeal && <button type="button" aria-label={`Open ${w.name}`} onClick={() => onOpenDeal(w.id, "plan")} className="whitespace-nowrap rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">{tabLabels.plan ?? "Open"} →</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {watch.assets.length > 8 && <button type="button" onClick={() => setAllWatch(!allWatch)} className="mt-1 text-[11px] text-blue-700 hover:underline">{allWatch ? "Show fewer" : `Show all ${watch.assets.length}`}</button>}
          </>
        )}
      </section>

    </div>
  );
}

// Setup & Maintenance (1.1.1: the last Functions area; this is the row it
// opens): New / Edit asset and fund, uploads, marks, capital activity, reports.
export function SetupMaintenance({ actions = [] }) {
  return (
    <div className="mt-1.5 border-t border-gray-100 pt-1.5" role="group" aria-label="Setup & Maintenance" data-testid="setup-maintenance">
      <span className="sr-only">Setup &amp; Maintenance</span>
      <div className="flex flex-wrap items-center gap-1.5" data-testid="setup-buttons">
        <div className="contents" data-testid="quick-actions">
          {actions.map((a) => a.kind === "select" ? (
            <select key={a.label} aria-label={a.label} value="" onChange={(e) => e.target.value && a.run(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700">
              <option value="">{a.placeholder}</option>
              {a.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <button key={a.label} type="button" onClick={a.run} disabled={a.disabled} title={a.title} className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${a.primary ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
