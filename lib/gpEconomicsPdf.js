// Phase W: GP Economics as an internal PDF (same figures as the Excel).
const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
const m = (v) => (v == null || !isFinite(v) ? "-" : `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toFixed(2)}M`);
const p = (v, d = 1) => (v == null || !isFinite(v) ? "-" : `${v.toFixed(d)}%`);

export async function gpEconomicsPdf(title, firm, { todayISO } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
  const grid = { theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: [30, 64, 120], textColor: 255 }, margin: { left: M, right: M } };
  const T = firm.totals;
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(`GP economics: ${title}`), M, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`INTERNAL - not for distribution · as of ${todayISO}`), M, 46);
  doc.setTextColor(30);
  autoTable(doc, { ...grid, startY: 70, tableWidth: 360, head: [["Life of fund", "Amount", "Share"]],
    body: [["Fee revenue", m(T.fees), p(T.feesShare)], ["  Asset management (fund management fee)", m(T.mgmtFee), ""], ["  Property management", m(T.pm), ""], ["  Construction management", m(T.cm), ""], ["Promote", m(T.promote), p(T.promoteShare)], ["  of which realized", m(T.promoteRealized), ""], ["Co-invest profit", m(T.coinvest), p(T.coinvestShare)], ["Total GP income", m(T.total), "100%"], [`Fee revenue PV at ${T.discountPct}% (this year on)`, m(T.feesPv), ""]].map((r) => r.map(t)) });
  autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Year", "Asset mgmt", "Property mgmt", "Construction mgmt", "Fee revenue", "Promote", "Co-invest profit", "Total"]],
    body: firm.years.map((y) => [y.year, m(y.mgmtFee), m(y.pm), m(y.cm), m(y.fees), m(y.promote), m(y.coinvest), m(y.total)].map(t)) });
  doc.addPage();
  autoTable(doc, { ...grid, startY: 40, head: [["Fund", "Type", "Fee revenue", "Promote", "Realized", "GP equity", "GP distributions", "Co-invest profit", "GP ROE", "GP IRR", "GP multiple"]],
    body: firm.funds.map((f) => [f.fund, f.type, m(f.fees.total), m(f.promote.total), m(f.promote.realized), m(f.coinvest.equity), m(f.coinvest.distributions), m(f.coinvest.profit), p(f.coinvest.roe, 0), p(f.coinvest.irr), f.coinvest.multiple != null ? `${f.coinvest.multiple.toFixed(2)}x` : "-"].map(t)) });
  autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Asset", "Fund", "Status", "Property mgmt", "Construction mgmt", "Fee revenue", "Promote (allocated)", "Share of gross profit"]],
    body: firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", m(a.pm), m(a.cm), m(a.fees), m(a.promote), p(a.promoteWeight)].map(t)) });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5).setTextColor(130).text(t(`Baywise · GP economics · INTERNAL · promote is never fee revenue; asset promote is the fund's promote allocated by share of gross profit · page ${i} of ${n}`), M, H - 16);
  }
  doc.setProperties({ title: t(`GP economics: ${title} (internal)`), creator: "Baywise" });
  return doc.output("blob");
}
