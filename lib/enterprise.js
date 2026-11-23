// Firm-wide figures for the header strip (user, 11/23). Consolidated across
// every fund; owned assets only: acquired by today and not sold (no pipeline,
// Deal Screener or unassigned deals; they aren't fund deals).
import { assetValuation } from "@/lib/valuations";
import { DEFAULT_FUND } from "@/lib/fundTimeline";

export const FIGURE_DEFS = {
  aum: "Sum of each owned asset's latest fair value (Valuation mark on or before today); purchase price while in the 6-month cost hold or with no mark.",
  sf: "Total square feet of owned assets.",
  assets: "Owned assets: in a fund, acquired by today and not sold.",
  tenants: "Occupied units on the rent rolls, each tenant counted once per asset.",
  occupancy: "Leased square feet ÷ total square feet of owned assets (assets without a rent roll use 100% less their vacancy assumption).",
};

const soldBy = (inputs, today) => !!inputs.realizedSaleDate && inputs.realizedSaleDate <= today;

// fundDeals: [{ id, inputs, irrFlows, … }] (live fund deals and saved
// snapshots); valuations: { dealId: { quarterEnd: mark } };
// funds: { name: terms }. Returns { aum, sf, assets, funds, tenants, occupancy, leasedSF }.
export function firmSummary(fundDeals, valuations = {}, funds = {}, { todayISO = new Date().toISOString().slice(0, 10) } = {}) {
  let aum = 0, sf = 0, leasedSF = 0, tenants = 0, assets = 0;
  const fundNames = new Set();
  for (const d of fundDeals) {
    const inp = d.inputs ?? {};
    if (!inp.fundName) continue;
    const acq = inp.acquisitionDate;
    if (!acq || acq > todayISO || soldBy(inp, todayISO)) continue;
    const terms = funds[inp.fundName] ? { ...DEFAULT_FUND, ...funds[inp.fundName] } : DEFAULT_FUND;
    let value = Number(inp.purchasePrice) || 0;
    if (d.irrFlows?.length) {
      try {
        const v = assetValuation(d, valuations[d.id] ?? {}, { todayISO, fund: terms });
        if (v.exit && v.exit <= todayISO) continue; // past its exit: treated as sold
        const last = [...(v.rows ?? [])].reverse().find((r) => r.quarterEnd <= todayISO && isFinite(r.value));
        if (last) value = last.value;
      } catch {
        // keep the purchase price
      }
    }
    assets += 1;
    fundNames.add(inp.fundName);
    aum += value;
    const units = inp.units ?? [];
    const assetSF = Number(inp.squareFootage) || units.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0);
    sf += assetSF;
    if (units.length) {
      const occ = units.filter((u) => u.leaseStatus === "occupied");
      leasedSF += occ.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0) * (assetSF / (units.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0) || assetSF || 1));
      tenants += new Set(occ.map((u) => (u.tenantName || u.id || "").trim().toLowerCase())).size;
    } else {
      leasedSF += assetSF * (1 - (Number(inp.vacancyPct) || 0) / 100);
    }
  }
  return { aum, sf, assets, funds: fundNames.size, tenants, leasedSF, occupancy: sf ? (leasedSF / sf) * 100 : NaN };
}

export function fmtAum(n) {
  if (!isFinite(n) || n <= 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  return `$${(n / 1e6).toFixed(1)}M`;
}
