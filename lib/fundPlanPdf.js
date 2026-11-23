// Phase K: printable quarterly fund report, plan vs. actual (for LP updates).
// jsPDF loads on export.
const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => {
  if (v == null || !isFinite(v)) return "-";
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`;
  return v < 0 ? `(${s})` : s;
};
const val = (v, unit) => (v == null || !isFinite(v) ? "-" : unit === "$" ? money(v) : unit === "%" ? `${v.toFixed(1)}%` : unit === "x" ? `${v.toFixed(2)}x` : String(Math.round(v)));
const dlt = (v, unit) => (v == null || !isFinite(v) ? "-" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${unit === "$" ? money(Math.abs(v)) : unit === "%" ? `${Math.abs(v).toFixed(1)} pts` : unit === "x" ? `${Math.abs(v).toFixed(2)}x` : Math.round(Math.abs(v))}`);
const usDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : iso || "-");

export async function fundPlanPdf(fundName, plan, cmp, quarters, attr, { asOf, type = "" } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const M = 40;
  const head = { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" };
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: head };

  doc.setFont("helvetica", "bold").setFontSize(16).text(t(`${fundName} - Fund plan vs. actual`), M, 50);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(t(`${type ? `${type} · ` : ""}Plan v${plan.v} (${plan.label}), frozen ${usDate(String(plan.at).slice(0, 10))}${plan.by ? ` by ${plan.by}` : ""} · actuals through ${usDate(asOf)} · Baywise`), M, 66);
  doc.setTextColor(30);

  autoTable(doc, { ...grid, startY: 80, tableWidth: 340, head: [["Since inception", "Plan", "Actual", "Variance"]],
    body: cmp.toDate.map((r) => [r.label, val(r.plan, r.unit), val(r.actual, r.unit), dlt(r.variance, r.unit)].map(t)) });
  autoTable(doc, { ...grid, startY: 80, margin: { left: 400, right: M }, head: [["Projected (life of fund)", "Plan", "Forecast", "Change", "Target"]],
    body: cmp.projected.map((r) => [r.label, val(r.plan, r.unit), val(r.current, r.unit), dlt(r.variance, r.unit), val(r.target, r.unit)].map(t)) });

  let y = Math.max(doc.lastAutoTable.finalY, 240) + 18;
  autoTable(doc, { ...grid, startY: y, tableWidth: 340, head: [["Change in projected net profit, by cause", "Change"]],
    body: [...attr.causes.map((c) => [c.label, dlt(c.delta, "$")]), ["Total (forecast - plan)", dlt(attr.total, "$")]].map((r) => r.map(t)) });
  autoTable(doc, { ...grid, startY: y, margin: { left: 400, right: M }, head: [["By asset", "Plan profit", "Forecast profit", "Change"]],
    body: attr.byAsset.map((r) => [`${r.name}${r.status === "added" ? " (not in plan)" : r.status === "dropped" ? " (dropped)" : ""}`, money(r.planProfit), money(r.currentProfit), dlt(r.delta, "$")].map(t)) });

  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(12).text(t(`${fundName} - by quarter (LP)`), M, 44);
  autoTable(doc, { ...grid, startY: 56,
    head: [["Quarter", "Called plan", "Called actual", "Called forecast", "Distributed plan", "Distributed actual", "Distributed forecast", "Deployed plan", "Deployed forecast"]],
    body: quarters.map((q) => [q.quarter.replace("-", " "), money(q.planCalled), q.actualCalled == null ? "" : money(q.actualCalled), money(q.forecastCalled), money(q.planDistributed), q.actualDistributed == null ? "" : money(q.actualDistributed), money(q.forecastDistributed), money(q.planDeployed), money(q.forecastDeployed)].map(t)) });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(130);
    doc.text(t(`LP figures. GP promote = GP distributions above its pro-rata share. Page ${i} of ${n}`), M, doc.internal.pageSize.getHeight() - 20);
  }
  doc.setProperties({ title: t(`Baywise · ${fundName} fund plan`), creator: "Baywise" });
  return doc.output("blob");
}
