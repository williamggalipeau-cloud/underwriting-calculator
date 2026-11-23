// Phase S: covenant compliance certificates (one page per loan) and the Fund Debt tab as PDFs.
import { extensionTest, lenderConcentration, maturityLadder, rateExposure } from "@/lib/fundDebt";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/÷/g, "/").replace(/[^\x20-\xFF\n]/g, "");
const m = (v) => (v == null || !Number.isFinite(v) ? "-" : `$${Math.round(v).toLocaleString("en-US")}`);
const mm = (v) => (v == null || !Number.isFinite(v) ? "-" : `$${(v / 1e6).toFixed(2)}M`);
const f = (v, u) => (v == null || !Number.isFinite(v) ? "-" : u === "x" ? `${v.toFixed(2)}x` : `${v.toFixed(2)}%`);
const d = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "-");

async function lib() {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  return { jsPDF, autoTable };
}

export async function certificatesPdf(certs) {
  const { jsPDF, autoTable } = await lib();
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), M = 48;
  certs.forEach((c, i) => {
    if (i) doc.addPage();
    doc.setTextColor(30).setFont("helvetica", "bold").setFontSize(15).text("Covenant Compliance Certificate", M, 64);
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(90).text(t(`For the quarter ended ${d(c.quarterEnd)}`), M, 82);
    doc.setTextColor(30);
    autoTable(doc, { theme: "plain", startY: 100, margin: { left: M, right: M }, styles: { fontSize: 9, cellPadding: 2.5 }, columnStyles: { 0: { textColor: 110, cellWidth: 150 } },
      body: [["Lender", c.lender || "-"], ["Borrower asset", c.asset], ["Fund", c.fund], ["Loan balance", m(c.balance)], ["NOI (hold year, model)", m(c.noi)], ["Debt service", m(c.debtService)], ["Value", `${m(c.value)} (${c.valueBasis})`]].map((r) => r.map(t)) });
    autoTable(doc, { theme: "grid", startY: doc.lastAutoTable.finalY + 14, margin: { left: M, right: M }, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [235, 240, 248], textColor: 40 },
      head: [["Covenant", "Actual", "Required", "In compliance"]],
      body: c.rows.map((r) => [r.test, f(r.actual, r.unit), `${r.kind === "min" ? "at least" : "at most"} ${f(r.required, r.unit)}`, r.pass ? "Yes" : "NO"].map(t)),
      didParseCell: (h) => { if (h.section === "body" && h.column.index === 3 && h.cell.raw === "NO") h.cell.styles.textColor = [185, 28, 28]; } });
    let y = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(7.5).setTextColor(110);
    c.rows.forEach((r) => { doc.text(t(`${r.test}: ${r.calc}`), M, y); y += 10; });
    y += 8;
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(c.compliant ? 20 : 185, c.compliant ? 110 : 28, c.compliant ? 60 : 28).text(t(c.compliant ? "The borrower is in compliance with the covenants above." : `Not in compliance: ${c.breaches.join(", ")}.`), M, y);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(30);
    y += 60;
    for (const [lbl, x] of [["Authorized signatory", M], ["Title", M + 200], ["Date", M + 380]]) { doc.line(x, y, x + 160, y); doc.text(lbl, x, y + 12); }
    doc.setFontSize(6.5).setTextColor(130).text(t("Prepared by Baywise from the asset model and valuation marks; review against the loan agreement's definitions before signing."), M, doc.internal.pageSize.getHeight() - 30);
  });
  doc.setProperties({ title: "Covenant compliance certificates", creator: "Baywise" });
  return doc.output("blob");
}

export async function fundDebtPdf(fundName, loans, asOf) {
  const { jsPDF, autoTable } = await lib();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(`${fundName}: Fund Debt`), 36, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`${loans.length} loans · ${mm(loans.reduce((s, l) => s + l.balance, 0))} · as of ${d(asOf)}`), 36, 46);
  doc.setTextColor(30);
  const grid = { theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [235, 240, 248], textColor: 40 }, margin: { left: 36, right: 36 } };
  autoTable(doc, { ...grid, startY: 70, head: [["Asset", "Lender", "Balance", "Rate", "Maturity", "Fully extended", "Ext. left", "DSCR", "Debt yield", "LTV", "Next extension test"]],
    body: loans.map((l) => { const e = extensionTest(l); return [l.name, l.lender || "-", mm(l.balance), l.floating ? `${l.hedge} S+${l.spreadPct.toFixed(2)}%` : `fixed ${f(l.fixedRatePct, "%")}`, d(l.currentMaturity), d(l.finalMaturity), String(l.extensionsLeft), f(l.dscr, "x"), f(l.debtYieldPct, "%"), f(l.ltvPct, "%"), e.status === "fail" ? `Fails: ${e.checks.filter((c) => !c.pass).map((c) => c.test).join(", ")}` : e.status].map(t); }) });
  const half = (W - 72 - 16) / 2;
  const y = doc.lastAutoTable.finalY + 16;
  autoTable(doc, { ...grid, startY: y, margin: { left: 36 }, tableWidth: half, head: [["Year", "Maturing", "% of debt", "If fully extended"]], body: maturityLadder(loans).map((r) => [r.year, mm(r.current), `${r.currentPct.toFixed(1)}%`, mm(r.extended)]) });
  const ex = rateExposure(loans, asOf);
  autoTable(doc, { ...grid, startY: y, margin: { left: 36 + half + 16 }, tableWidth: half, head: [["Rate type", "Balance", "% of debt"]], body: ex.rows.map((r) => [r.label, mm(r.balance), `${r.pct.toFixed(1)}%`]) });
  const lc = lenderConcentration(loans);
  autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 12, margin: { left: 36 + half + 16 }, tableWidth: half, head: [["Lender", "Balance", "% of debt"]], body: [...lc.rows.map((r) => [t(r.lender), mm(r.balance), `${r.pct.toFixed(1)}%`]), ["HHI", String(lc.hhi), ""]] });
  doc.setProperties({ title: `${fundName} fund debt`, creator: "Baywise" });
  return doc.output("blob");
}
