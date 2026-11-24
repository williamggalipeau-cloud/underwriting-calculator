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
  autoTable(doc, { ...grid, startY: 70, tableWidth: 360, head: [["Life of portfolios", "Amount", "Share"]],
    body: [["Fee income", m(T.fees), p(T.feesShare)], ["  Asset management (fund management fee)", m(T.mgmtFee), ""], ["  Property management", m(T.pm), ""], ["  Construction management", m(T.cm), ""], ["Capital gains", m(T.capitalGains), p(T.capitalGainsShare)], ["  Promote / incentive fee", m(T.promote), p(T.promoteShare)], ["    of which realized", m(T.promoteRealized), ""], ["  Co-invest profit (on sale)", m(T.coinvest), p(T.coinvestShare)], ["Total GP economics", m(T.total), "100%"], ["Revenue Yield (fees ÷ committed capital)", p(T.revenueYield?.pct, 2), ""], ["  per year", p(T.revenueYield?.perYearPct, 2), T.revenueYield?.lifeYears ? `${T.revenueYield.lifeYears.toFixed(1)} yrs` : ""], ["  to date", p(T.revenueYield?.toDatePct, 2), ""], ["  committed capital", m(T.revenueYield?.committed), T.revenueYield?.anyFallback ? "*" : ""]].map((r) => r.map(t)) });
  autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Year", "Asset mgmt", "Property mgmt", "Construction mgmt", "Acq. / disp. fees", "Fee income", "Promote", "Co-invest profit", "Capital gains", "Total"]],
    body: firm.years.map((y) => [y.year, m(y.mgmtFee), m(y.pm), m(y.cm), m((y.acqFee ?? 0) + (y.dispFee ?? 0)), m(y.fees), m(y.promote), m(y.coinvest), m(y.capitalGains), m(y.total)].map(t)) });
  doc.addPage();
  autoTable(doc, { ...grid, startY: 40, head: [["Fund", "Type", "Fee income", "Promote", "Realized", "GP equity", "Co-invest profit", "GP ROE", "GP IRR", "GP multiple", "Committed", "Revenue Yield", "Per year", "To date"]],
    body: firm.funds.map((f) => [f.fund, f.type, m(f.fees.total), m(f.promote.total), m(f.promote.realized), m(f.coinvest.equity), m(f.coinvest.profit), p(f.coinvest.roe, 0), p(f.coinvest.irr), f.coinvest.multiple != null ? `${f.coinvest.multiple.toFixed(2)}x` : "-", `${m(f.revenueYield?.committed)}${f.revenueYield?.fromCommitments ? "" : "*"}`, p(f.revenueYield?.pct, 2), p(f.revenueYield?.perYearPct, 2), p(f.revenueYield?.toDatePct, 2)].map(t)) });
  autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Asset", "Fund", "Status", "Property mgmt", "Construction mgmt", "Fee income", "Promote (allocated)", "Co-invest profit", "Share of gross profit"]],
    body: firm.assets.map((a) => [a.name, a.fund, a.sold ? "Realized" : "Held", m(a.pm), m(a.cm), m(a.fees), m(a.promote), m(a.coinvest), p(a.promoteWeight)].map(t)) });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5).setTextColor(130).text(t(`Baywise · GP economics · INTERNAL · Revenue Yield = GP fees (no promote / co-invest) / committed capital; * total equity, no commitments; fee income is kept apart from capital gains (promote, co-invest profit); asset promote is the fund's promote allocated by share of gross profit · page ${i} of ${n}`), M, H - 16);
  }
  doc.setProperties({ title: t(`GP economics: ${title} (internal)`), creator: "Baywise" });
  return doc.output("blob");
}

// GP / Sponsor Economics (11/24): the same sections as the Excel.
export async function partyPdf(role, firm, { title = "", todayISO = "" } = {}) {
  const { partySections } = await import("@/lib/gpEconomics");
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
  const grid = { theme: "grid", styles: { fontSize: 7, cellPadding: 2.2 }, headStyles: { fillColor: [30, 64, 120], textColor: 255 }, margin: { left: M, right: M } };
  const fmt = (k, v) => (v == null || v === "" ? "-" : k === "money" ? m(v) : k === "pct" ? p(v) : k === "x" ? `${Number(v).toFixed(2)}x` : String(v));
  const [head, ...secs] = partySections(role, firm, { title });
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(head.title), M, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`INTERNAL - not for distribution · as of ${todayISO}`), M, 46);
  doc.setTextColor(30).setFontSize(8).text(doc.splitTextToSize(t(head.note), W - 2 * M), M, 72);
  let y = 92;
  for (const s of secs) {
    if (!s.rows.length) continue;
    doc.setFont("helvetica", "bold").setFontSize(9).text(t(s.title), M, y);
    autoTable(doc, { ...grid, startY: y + 5, head: [s.head.map(t)], body: s.rows.map((r) => r.map((v, i) => t(fmt(s.kinds[i], v)))) });
    y = doc.lastAutoTable.finalY + 18;
    if (y > H - 80) { doc.addPage(); y = 40; }
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(6.5).setTextColor(130).text(t(`Baywise · ${role === "gp" ? "GP" : "Sponsor"} economics · INTERNAL · page ${i} of ${n}`), M, H - 16); }
  doc.setProperties({ title: t(head.title), creator: "Baywise" });
  return doc.output("blob");
}
