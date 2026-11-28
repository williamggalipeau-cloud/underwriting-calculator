"use client";
// 1.1.30: the office and industrial mix. Each unit's use and office SF are
// entered on the Rent Roll (UnitMixEditor, with the targets); the Asset
// Business Plan compares purchase, today and target (MixCompare); Portfolio
// Summary lists the assets and the portfolio weighted by SF (PortfolioMix).
import { UNIT_USES, mixCompare, mixOf, officeSFOf, officeTie, portfolioMix, setTarget, targetTotal, targetsOf, unitUseSet, unitUse } from "@/lib/unitMix";

const inp = "rounded border border-gray-200 bg-white px-1.5 py-1 text-xs";
const p1 = (v) => (v == null || !isFinite(v) ? "—" : `${(Math.round(v * 10) / 10).toFixed(1)}%`);
const sf = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const COLOR = { industrial: "#1d4ed8", flex: "#0d9488", office: "#b45309", retail: "#7c3aed", other: "#6b7280" };

function Bar({ mix, label }) {
  return (
    <div>
      <div className="mt-2 text-xs font-semibold text-gray-700">{label}</div>
      <div className="flex h-4 overflow-hidden rounded-lg bg-gray-100" role="img" aria-label={`${label}: ${mix.rows.filter((r) => r.sf).map((r) => `${r.label} ${p1(r.pctSF)}`).join(", ")}`}>
        {mix.rows.filter((r) => r.pctSF > 0).map((r) => <span key={r.use} style={{ width: `${r.pctSF}%`, background: COLOR[r.use] }} title={`${r.label} ${p1(r.pctSF)}`} />)}
      </div>
    </div>
  );
}
const Key = () => <div className="flex flex-wrap gap-x-3 text-[11px] text-gray-600">{UNIT_USES.map(([k, l]) => <span key={k}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COLOR[k] }} />{l}</span>)}</div>;

export function UnitMixEditor({ inputs, units, onUnits, onInputs }) {
  const mix = mixOf(units), tie = officeTie(inputs, units), t = targetsOf(inputs) ?? {};
  const upd = (id, patch) => onUnits(units.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const totals = { sf: targetTotal(t, "sf"), rent: targetTotal(t, "rent") };
  return (
    <details className="rounded-xl border border-gray-200 bg-white" data-testid="rr-mix-section">
      <summary className="cursor-pointer px-3 py-2 text-sm"><b>Office and industrial mix</b><span className="text-gray-600"> · {mix.rows.filter((r) => r.sf > 0).map((r) => `${p1(r.pctSF)} ${r.label.toLowerCase()}`).join(", ") || "no units"}; office build-out {p1(mix.officeBuildoutPct)}{mix.unconfirmed ? `; ${mix.unconfirmed} unit${mix.unconfirmed === 1 ? "" : "s"} not confirmed` : ""}{tie.ties ? "" : "; office SF does not tie"}</span></summary>
      <div className="space-y-3 p-3 pt-0">
        <div className="max-h-80 overflow-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[520px] text-xs" data-testid="mix-units">
            <thead className="sticky top-0 bg-gray-50 text-left text-[10.5px] uppercase tracking-wide text-gray-500"><tr><th className="px-2 py-1">Unit</th><th className="px-2 py-1">Tenant</th><th className="px-2 py-1 text-right">SF</th><th className="px-2 py-1">Use</th><th className="px-2 py-1 text-right">Office SF</th><th className="px-2 py-1 text-right">Office %</th></tr></thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className="border-t border-gray-100" data-testid="mix-unit-row">
                  <td className="px-2 py-1">{u.name ?? u.id}</td>
                  <td className="px-2 py-1">{u.leaseStatus === "occupied" ? u.tenantName || "Leased" : "Vacant"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{sf(u.squareFeet)}</td>
                  <td className="px-2 py-1"><select className={inp} value={unitUse(u)} onChange={(e) => upd(u.id, { use: e.target.value })} aria-label={`Unit ${u.name ?? u.id} use`}>{UNIT_USES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{!unitUseSet(u) && <span className="ml-1 text-[10px] text-amber-700" data-testid="mix-unconfirmed">not confirmed</span>}</td>
                  <td className="px-2 py-1 text-right"><input type="number" min={0} max={u.squareFeet} step={50} className={`${inp} w-20 text-right`} value={u.officeSF ?? (officeSFOf(u) || "")} onChange={(e) => upd(u.id, { officeSF: e.target.value === "" ? null : Math.max(0, Math.min(Number(u.squareFeet) || Infinity, Number(e.target.value))), ...(unitUseSet(u) ? {} : { use: unitUse(u) }) })} aria-label={`Unit ${u.name ?? u.id} office SF`} /></td>
                  <td className="px-2 py-1 text-right tabular-nums">{Number(u.squareFeet) ? p1((officeSFOf(u) / u.squareFeet) * 100) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={`rounded-lg border px-2.5 py-1.5 text-xs ${tie.ties && tie.hasBuilding ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`} data-testid="mix-office-tie">{tie.text}</p>
        {mix.unconfirmed > 0 && <button type="button" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium" onClick={() => onUnits(units.map((u) => (unitUseSet(u) ? u : { ...u, use: unitUse(u) })))} data-testid="mix-confirm-all">Confirm the {mix.unconfirmed} unit{mix.unconfirmed === 1 ? "" : "s"} shown as industrial</button>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs" data-testid="mix-summary">
            <thead className="text-left text-[10.5px] uppercase tracking-wide text-gray-500"><tr><th className="px-2 py-1">Use</th><th className="px-2 py-1 text-right">Units</th><th className="px-2 py-1 text-right">SF</th><th className="px-2 py-1 text-right">% of SF</th><th className="px-2 py-1 text-right">% of rent</th><th className="px-2 py-1 text-right">Target % of SF</th><th className="px-2 py-1 text-right">Target % of rent</th></tr></thead>
            <tbody>
              {mix.rows.map((r) => (
                <tr key={r.use} className="border-t border-gray-100" data-testid="mix-row" data-use={r.use}>
                  <td className="px-2 py-1">{r.label}</td><td className="px-2 py-1 text-right tabular-nums">{r.units}</td><td className="px-2 py-1 text-right tabular-nums">{sf(r.sf)}</td><td className="px-2 py-1 text-right tabular-nums">{p1(r.pctSF)}</td><td className="px-2 py-1 text-right tabular-nums">{p1(r.pctRent)}</td>
                  {["sf", "rent"].map((b) => <td key={b} className="px-2 py-1 text-right"><input type="number" min={0} max={100} className={`${inp} w-16 text-right`} value={t[b]?.[r.use] ?? ""} onChange={(e) => onInputs((prev) => setTarget(prev, b, r.use, e.target.value))} aria-label={`${r.label} target % of ${b === "sf" ? "SF" : "rent"}`} /></td>)}
                </tr>
              ))}
              <tr className="border-t-2 border-gray-800 font-semibold"><td className="px-2 py-1">Total</td><td className="px-2 py-1 text-right tabular-nums">{mix.units}</td><td className="px-2 py-1 text-right tabular-nums">{sf(mix.totalSF)}</td><td className="px-2 py-1 text-right">100.0%</td><td className="px-2 py-1 text-right">{mix.totalRent ? "100.0%" : "—"}</td>
                {["sf", "rent"].map((b) => <td key={b} className={`px-2 py-1 text-right tabular-nums ${totals[b] != null && Math.abs(totals[b] - 100) > 0.05 ? "text-red-700" : ""}`} data-testid={`mix-target-total-${b}`}>{totals[b] == null ? "—" : p1(totals[b])}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        {["sf", "rent"].some((b) => totals[b] != null && Math.abs(totals[b] - 100) > 0.05) && <p className="text-xs text-red-700" data-testid="mix-target-warning">A set of targets should add up to 100%.</p>}
        <label className="flex flex-wrap items-center gap-2 text-xs"><span>Office build-out today <b>{p1(mix.officeBuildoutPct)}</b> of the building ({sf(mix.officeSF)} SF). Target</span><input type="number" min={0} max={100} className={`${inp} w-16 text-right`} value={t.officeBuildoutPct ?? ""} onChange={(e) => onInputs((prev) => setTarget(prev, "officeBuildoutPct", null, e.target.value))} aria-label="Office build-out target %" /><span>%</span></label>
        <p className="text-[11px] text-gray-500">Use is how the unit is leased or meant to be leased; office SF is the finished office inside it, whatever its use. Percent of rent uses in-place rent, so a vacant unit counts in SF and not in rent. Recorded and shown; no return figure uses it.</p>
      </div>
    </details>
  );
}

export function MixCompare({ inputs, asOf }) {
  const c = mixCompare(inputs, asOf);
  if (!c.today.units) return null;
  const tg = c.targets?.sf && targetTotal(c.targets, "sf") != null ? { rows: UNIT_USES.map(([k, l]) => ({ use: k, label: l, sf: 1, pctSF: Number(c.targets.sf[k]) || 0 })) } : null;
  return (
    <div className="space-y-2" data-testid="plan-mix">
      <Key />
      <Bar mix={c.atPurchase} label="At purchase" /><Bar mix={c.today} label="Today" />{tg && <Bar mix={tg} label="Target" />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs" data-testid="plan-mix-table">
          <thead className="text-left text-[10.5px] uppercase tracking-wide text-gray-500"><tr><th className="px-2 py-1" /><th className="px-2 py-1 text-right">At purchase</th><th className="px-2 py-1 text-right">Today</th><th className="px-2 py-1 text-right">Target</th><th className="px-2 py-1 text-right">To go</th></tr></thead>
          <tbody>{c.rows.map((r) => <tr key={r.key} className="border-t border-gray-100" data-testid="plan-mix-row" data-key={r.key}><td className="px-2 py-1">{r.label}</td><td className="px-2 py-1 text-right tabular-nums">{p1(r.atPurchase)}</td><td className="px-2 py-1 text-right tabular-nums">{p1(r.today)}</td><td className="px-2 py-1 text-right tabular-nums">{p1(r.target)}</td><td className="px-2 py-1 text-right tabular-nums">{r.toGo == null ? "—" : `${r.toGo > 0 ? "+" : r.toGo < 0 ? "−" : ""}${Math.abs(r.toGo).toFixed(1)} pts`}</td></tr>)}</tbody>
        </table>
      </div>
      {c.today.unconfirmed > 0 && <p className="text-[11px] text-amber-700">{c.today.unconfirmed} unit{c.today.unconfirmed === 1 ? " has" : "s have"} no use entered and count as industrial (Rent Roll → Office and industrial mix).</p>}
      <p className="text-[11px] text-gray-500">Today is the rent roll as of today, so it moves when a lease is signed, a tenant moves out or a unit&apos;s use or office SF is changed. At purchase is the closing model&apos;s rent roll. Targets are set on the Rent Roll.</p>
    </div>
  );
}

export function PortfolioMix({ deals, asOf }) {
  const pm = portfolioMix(deals, asOf);
  if (!pm.assets.length) return null;
  const row = (name, m, key, bold) => (
    <tr key={key} className={bold ? "border-t-2 border-gray-800 font-semibold" : "border-t border-gray-100"} data-testid={bold ? "fs-mix-total" : "fs-mix-row"}>
      <td className="px-2 py-1">{name}</td><td className="px-2 py-1 text-right tabular-nums">{sf(m.totalSF)}</td>
      {UNIT_USES.map(([k]) => <td key={k} className="px-2 py-1 text-right tabular-nums">{p1(m.rows.find((r) => r.use === k).pctSF)}</td>)}
      <td className="px-2 py-1 text-right tabular-nums">{p1(m.officeBuildoutPct)}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto" data-testid="fs-mix">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="text-left text-[10.5px] uppercase tracking-wide text-gray-500"><tr><th className="px-2 py-1">Asset</th><th className="px-2 py-1 text-right">SF</th>{UNIT_USES.map(([k, l]) => <th key={k} className="px-2 py-1 text-right">{l}</th>)}<th className="px-2 py-1 text-right">Office build-out</th></tr></thead>
        <tbody>{pm.assets.map((a) => row(a.asset, a.mix, a.dealId, false))}{row("Portfolio (weighted by SF)", pm.total, "t", true)}</tbody>
      </table>
      <p className="mt-1 text-[11px] text-gray-500">Share of each asset&apos;s SF by the use of its units, today; sold assets are left out. A restriction on office use or office build-out is checked on Portfolio Limits.</p>
    </div>
  );
}
