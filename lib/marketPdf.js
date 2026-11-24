// Phase U: Market Data summary as a PDF (each submarket's latest figures and
// trends, its quarterly statistics, and the assets tagged to it vs. the market).
import { STAT_FIELDS, assetVsMarket, quarterLabel, seriesFor, submarketSummary } from "@/lib/market";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
const f = (v, u) => (v == null || !Number.isFinite(Number(v)) ? "-" : u === "pct" ? `${Number(v).toFixed(1)}%` : u === "psf" ? `$${Number(v).toFixed(2)}` : u === "money" ? `$${(Number(v) / 1e6).toFixed(1)}M` : Math.round(Number(v)).toLocaleString("en-US"));

export async function marketPdf(market, deals = [], { todayISO = new Date().toISOString().slice(0, 10) } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text("Market summary", 36, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`${market.submarkets.length} submarkets · as of ${todayISO}`), 36, 46);
  doc.setTextColor(30);
  const grid = { theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [235, 240, 248], textColor: 40 }, margin: { left: 36, right: 36 } };
  autoTable(doc, { ...grid, startY: 70, head: [["Submarket", "Latest", "Vacancy", "Change (4Q, pts)", "Asking rent", "Growth %/yr", "Small-bay rent", "Cap rate", "Absorption (4Q, SF)"]],
    body: market.submarkets.map((sm) => { const x = submarketSummary(market, sm.id); return [sm.name, quarterLabel(x.latest?.quarter), f(x.vacancy.latest, "pct"), x.vacancy.change != null ? x.vacancy.change.toFixed(1) : "-", f(x.rent.latest, "psf"), x.rent.annualPct != null ? `${x.rent.annualPct.toFixed(1)}%` : "-", f(x.smallBay.latest, "psf"), f(x.cap.latest, "pct"), f(x.absorption, "sf")].map(t); }) });
  for (const sm of market.submarkets) {
    const s = seriesFor(market, sm.id);
    if (!s.length) continue;
    const y = doc.lastAutoTable.finalY + 16;
    doc.setFont("helvetica", "bold").setFontSize(10).text(t(sm.name), 36, y);
    autoTable(doc, { ...grid, startY: y + 5, head: [["Quarter", ...STAT_FIELDS.map(([, l]) => l), "Source"]], body: s.map((q) => [quarterLabel(q.quarter), ...STAT_FIELDS.map(([k, , u]) => f(q[k], u)), `${q.source ?? ""}${q.sourceDate ? ` ${q.sourceDate}` : ""}`].map(t)) });
  }
  const tagged = deals.map((d) => ({ d, v: assetVsMarket(d.inputs, market) })).filter((x) => x.v);
  if (tagged.length) {
    const y = doc.lastAutoTable.finalY + 16;
    doc.setFont("helvetica", "bold").setFontSize(10).text("Assets vs. their market", 36, y);
    const cell = (v, k, u) => { const r = v.rows.find((x) => x.key === k); return `${f(r.asset, u)} / ${f(r.market, u)}`; };
    autoTable(doc, { ...grid, startY: y + 5, head: [["Asset", "Submarket", "Rent (asset / market)", "Rent growth", "Vacancy", "Exit cap / market cap"]], body: tagged.map(({ d, v }) => [d.inputs.propertyName, v.submarket.name, cell(v, "rent", "psf"), cell(v, "growth", "pct"), cell(v, "vacancy", "pct"), cell(v, "exitCap", "pct")].map(t)) });
  }
  doc.setProperties({ title: "Market summary", creator: "Baywise" });
  return doc.output("blob");
}
