"use client";

// Phase Z: the Home page. Today's attention list, fund cards, workflow lanes
// (one per tab header), quick actions and recent activity, for the portfolio
// chosen in the "Working on" picker.
import { useMemo, useState } from "react";
import { attentionList, fundCards, lanes, money, recentActivity } from "@/lib/home";
import { formatValue } from "@/lib/audit";

const usDate = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const KIND = {
  rent: ["Rent", "bg-red-50 text-red-700"],
  lease: ["Lease", "bg-amber-50 text-amber-800"],
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
};
const TYPE_CLS = { Fund: "bg-blue-50 text-blue-700", "Separate Account": "bg-emerald-50 text-emerald-700", "Joint Venture": "bg-amber-50 text-amber-800" };

export default function Home({ deals = [], funds = {}, valuations = {}, pipeline, log = [], firm, curve, scopeName = "", tabLabels = {}, onOpenTab, onOpenDeal, actions = [] }) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const attention = useMemo(() => attentionList(deals, funds, valuations, { todayISO }), [deals, funds, valuations, todayISO]);
  const cards = useMemo(() => fundCards(deals, funds, valuations, { todayISO, curve }), [deals, funds, valuations, todayISO, curve]);
  const laneList = useMemo(() => lanes({ deals, funds, pipeline, attention, cards, firm, todayISO }), [deals, funds, pipeline, attention, cards, firm, todayISO]);
  const recent = useMemo(() => recentActivity(log, 10), [log]);
  const open = (a) => (a.dealId && onOpenDeal ? onOpenDeal(a.dealId, a.tab) : onOpenTab?.(a.tab));
  const [allAtt, setAllAtt] = useState(false);
  const shown = allAtt ? attention : attention.slice(0, 12);

  return (
    <div className="space-y-5 text-gray-900" data-testid="home">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Home</h2>
          <p className="text-xs text-gray-500">{scopeName ? `${scopeName}: ` : "All funds: "}what needs attention today, each fund at a glance, and every workflow one click away.</p>
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="quick-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={a.run} disabled={a.disabled} title={a.title} className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${a.primary ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>{a.label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2" data-testid="attention">
          <h3 className="mb-2 text-sm font-semibold">Today · needs attention {attention.length > 0 && <span className="ml-1 rounded-full bg-red-50 px-1.5 text-[11px] text-red-700">{attention.length}</span>}</h3>
          {attention.length === 0 ? (
            <p className="text-xs text-gray-500">Nothing due: no leases expiring in 90 days, leasing next steps due, loans maturing in 18 months, rate caps expiring in 12 months, missing marks, rent 60+ days late or budgets in the red.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-xs">
              {shown.map((a, i) => (
                <li key={`${a.kind}-${a.dealId ?? ""}-${i}`} className="flex items-center gap-2 py-1.5">
                  <span className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold ${KIND[a.kind]?.[1] ?? ""}`}>{KIND[a.kind]?.[0] ?? a.kind}</span>
                  <span className="flex-1">{a.text}</span>
                  {a.date && <span className={`whitespace-nowrap tabular-nums ${a.days != null && a.days < 0 ? "text-red-700" : "text-gray-500"}`}>{usDate(a.date)}{a.days != null ? ` · ${a.days < 0 ? `${-a.days} d ago` : `${a.days} d`}` : ""}</span>}
                  <button type="button" aria-label={`Open ${tabLabels[a.tab] ?? a.tab}: ${a.text}`} onClick={() => open(a)} className="whitespace-nowrap rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">{tabLabels[a.tab] ?? "Open"} →</button>
                </li>
              ))}
            </ul>
          )}
          {attention.length > 12 && <button type="button" onClick={() => setAllAtt(!allAtt)} className="mt-1 text-[11px] text-blue-700 hover:underline">{allAtt ? "Show fewer" : `Show all ${attention.length} (${attention.length - shown.length} more)`}</button>}
        </section>

        {/* Recent activity */}
        <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid="recent-activity">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            <button type="button" aria-label="See all recent activity" onClick={() => onOpenTab?.("changes")} className="text-[11px] text-blue-700 hover:underline">Change log →</button>
          </div>
          {recent.length === 0 ? <p className="text-xs text-gray-500">No changes recorded yet.</p> : (
            <ul className="space-y-1.5 text-[11px]">
              {recent.map((e) => (
                <li key={e.id ?? e.at} className="leading-snug">
                  <span className="text-gray-400">{usDate(e.at.slice(0, 10))}</span> <span className="font-medium">{e.user}</span>{" "}
                  <span className="text-gray-600">{e.item}{e.field ? ` › ${e.field}` : ""}</span>
                  {e.from !== undefined || e.to !== undefined ? <span className="text-gray-500">: {formatValue(e.from)} → {formatValue(e.to)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Fund cards */}
      {cards.length > 0 && (
        <section data-testid="fund-cards">
          <h3 className="mb-2 text-sm font-semibold">Funds</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <div key={c.name} className="rounded-xl border border-gray-200 bg-white p-4 text-xs" data-testid="fund-card">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_CLS[c.type] ?? ""}`}>{c.type}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-gray-500">NAV</dt><dd className="text-right font-semibold tabular-nums">{money(c.nav)}</dd>
                  <dt className="text-gray-500">Net IRR{c.targetNetIrr != null ? " vs. target" : ""}</dt><dd className="text-right tabular-nums">{c.netIrr != null ? `${c.netIrr.toFixed(1)}%` : "not yet meaningful"}{c.targetNetIrr != null ? ` / ${c.targetNetIrr}%` : ""}</dd>
                  <dt className="text-gray-500">Called</dt><dd className="text-right tabular-nums">{c.pctCalled != null ? `${c.pctCalled.toFixed(1)}%` : "—"}</dd>
                  <dt className="text-gray-500">Dry powder</dt><dd className="text-right tabular-nums">{money(c.dryPowder)}</dd>
                  <dt className="text-gray-500">Assets</dt><dd className="text-right tabular-nums">{c.assets}</dd>
                  <dt className="text-gray-500">Next key date</dt><dd className="text-right">{c.nextDate ? `${c.nextDate.label} ${usDate(c.nextDate.date)}` : "—"}</dd>
                </dl>
                <div className="mt-2 flex gap-2">
                  <button type="button" aria-label={`Open Fund Summary for ${c.name}`} onClick={() => onOpenTab?.("fundsummary")} className="text-[11px] text-blue-700 hover:underline">Fund Summary →</button>
                  <button type="button" aria-label={`Open Fund Return for ${c.name}`} onClick={() => onOpenTab?.("fund")} className="text-[11px] text-blue-700 hover:underline">Fund Return →</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Workflow lanes */}
      <section data-testid="lanes">
        <h3 className="mb-2 text-sm font-semibold">Workflows</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {laneList.map((l) => (
            <div key={l.label} className="rounded-xl border border-gray-200 bg-white p-4 text-xs" data-testid="lane">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{l.label}</p>
              <dl className="space-y-1">
                {l.stats.map((s) => (
                  <div key={s.label} className="flex justify-between gap-2"><dt className="text-gray-500">{s.label}</dt><dd className="text-right font-medium tabular-nums">{s.value}</dd></div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {l.tabs.map((t) => <button key={t} type="button" aria-label={`Open ${tabLabels[t] ?? t}`} onClick={() => onOpenTab?.(t)} className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50">{tabLabels[t] ?? t}</button>)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
