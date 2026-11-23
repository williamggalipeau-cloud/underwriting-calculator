// Phase X: printable distribution analysis for one fund and quarter.
// jsPDF loads on export.
import { FUND_MONTHS, WC_MONTHS } from "@/lib/distributions";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => {
  if (v == null || !isFinite(v)) return "-";
  const s = `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
  return v < 0 ? `(${s})` : s;
};
const pct = (v) => (v == null || !isFinite(v) ? "-" : `${v.toFixed(2)}%`);

export async function distributionPdf(fundName, calc, pick, y, hist, { type = "" } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const M = 40;
  const head = { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" };
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: head };
  const q = calc.quarter.replace("-", " ");

  doc.setFont("helvetica", "bold").setFontSize(16).text(t(`${fundName} - Distribution analysis, ${q}`), M, 50);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(t(`${type ? `${type} · ` : ""}Quarter ending ${calc.qEnd} · Baywise`), M, 66);
  doc.setTextColor(30);

  autoTable(doc, { ...grid, startY: 80,
    head: [["Asset", "Cash", "Source", "Lender reserves", "Committed TI / capex", `Working capital (${WC_MONTHS} mo.)`, "Distributable"]],
    body: [
      ...calc.held.map((a) => [a.name, money(a.balance), a.source === "projected" ? "projected, no balance entered" : a.source === "yardi" ? "Yardi" : "entered", money(a.reserves), money(a.committed), money(a.wc), money(a.distributable)]),
      ["Assets", money(calc.split.actualBalance + calc.split.projectedBalance), `${money(calc.split.projectedBalance)} projected`, "", "", "", money(calc.assetsTotal)],
    ].map((r) => r.map(t)) });

  const y0 = doc.lastAutoTable.finalY + 16;
  autoTable(doc, { ...grid, startY: y0, tableWidth: 340, head: [["Distributable cash", "Amount"]],
    body: [
      ["Assets", money(calc.assetsTotal)],
      [`Fund cash (${calc.fund.cashSource})`, money(calc.fund.cash)],
      [`Less fund minimum (${FUND_MONTHS} months of expenses)`, money(-calc.fund.min)],
      [`Less sub line repayment (${calc.subLine.rule})`, money(-calc.subLine.repay)],
      ["Distributable cash", money(calc.total)],
      ["Distribution", money(pick.amount)],
      ["  to LPs", money(pick.lp)],
      ["  to the GP", money(pick.gp)],
      ...(pick.heldBack > 1 ? [["  held by the waterfall", money(pick.heldBack)]] : []),
      ["Stays in reserve", money(pick.retained)],
      ["Yield on LP contributed capital (annualized)", pct(y.onContributed)],
      ["Yield on LP NAV (annualized)", pct(y.onNav)],
    ].map((r) => r.map(t)) });
  autoTable(doc, { ...grid, startY: y0, margin: { left: 400, right: M }, head: [["Quarter", "Distributed", "Yield (annualized)"]],
    body: [
      ...hist.quarters.map((h) => [h.quarter.replace("-", " "), money(h.amount), pct(h.yield)]),
      ["Trailing 12 months", money(hist.ttm), pct(hist.ttmYield)],
      [`${q} proposed`, money(pick.amount), pct(y.onContributed)],
    ].map((r) => r.map(t)) });

  doc.setFontSize(7).setTextColor(130);
  doc.text(t("LP / GP split per the fund's waterfall and income treatment. Projected cash is the model's operating cash for the quarter where no balance was entered."), M, doc.internal.pageSize.getHeight() - 20);
  doc.setProperties({ title: t(`Baywise · ${fundName} distribution ${q}`), creator: "Baywise" });
  return doc.output("blob");
}
