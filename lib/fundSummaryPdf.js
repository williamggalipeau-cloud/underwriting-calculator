// Phase N: a one-page fund fact sheet (PDF).
import { keyTerms, ownershipTree, roleLabel } from "@/lib/fundSummary";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[→]/g, "->").replace(/•/g, "*").replace(/[^\x20-\xFF\n]/g, "");
const m = (v) => (v == null || !isFinite(v) ? "-" : `$${(v / 1e6).toFixed(2)}M`);
const d = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "-");

export async function fundFactSheetPdf(fundName, terms, dates, cap, entities = []) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), M = 36;
  const grid = { theme: "plain", styles: { fontSize: 7.5, cellPadding: 1.8 }, columnStyles: { 0: { textColor: 110, cellWidth: 110 } } };
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 64, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(18).text(t(fundName), M, 34);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`Fund fact sheet · as of ${d(new Date().toISOString().slice(0, 10))}`), M, 52);
  doc.setTextColor(30);
  const half = (W - 2 * M - 16) / 2;
  doc.setFont("helvetica", "bold").setFontSize(10).text("Key dates", M, 86);
  autoTable(doc, { ...grid, startY: 92, margin: { left: M }, tableWidth: half, body: [["Launch", d(dates.launch)], ["Final close", d(dates.finalClose)], ["Investment period ends", `${d(dates.investmentPeriodEnd)} (${dates.ipMonthsLeft} mo left)`], ["End of term", d(dates.fundEnd)], ["Outside date", d(dates.outsideDate)]].map((r) => r.map(t)) });
  doc.setFont("helvetica", "bold").setFontSize(10).text("Capital", M + half + 16, 86);
  autoTable(doc, { ...grid, startY: 92, margin: { left: M + half + 16 }, tableWidth: half, body: [["Raised", m(cap.commitments)], ["Called", `${m(cap.called)}${cap.pctCalled != null ? ` (${cap.pctCalled.toFixed(1)}%)` : ""}`], ["Deployed", `${m(cap.deployed)} (${cap.assets} assets)`], ["Dry powder", m(cap.dryPowder)], ["Sub line", `${cap.lineDrawn != null ? m(cap.lineDrawn) : "-"} drawn of ${m(cap.lineSize)}`]].map((r) => r.map(t)) });
  let y = doc.lastAutoTable.finalY + 16;
  doc.setFont("helvetica", "bold").setFontSize(10).text("Key terms", M, y);
  autoTable(doc, { ...grid, startY: y + 6, margin: { left: M, right: M }, body: keyTerms(terms).map((r) => r.map(t)) });
  y = doc.lastAutoTable.finalY + 16;
  if (entities.length) {
    doc.setFont("helvetica", "bold").setFontSize(10).text("Ownership", M, y);
    const lines = [];
    const walk = (e, depth) => { lines.push(`${"    ".repeat(depth)}${depth ? "- " : ""}${e.name} (${roleLabel(e.role)}${e.state ? `, ${e.state}` : ""})`); e.children.forEach((c) => walk(c, depth + 1)); };
    ownershipTree(entities).forEach((e) => walk(e, 0));
    doc.setFont("helvetica", "normal").setFontSize(7.5);
    const shown = lines.slice(0, Math.max(1, Math.floor((760 - y) / 10)));
    shown.forEach((l, i) => doc.text(t(l), M, y + 14 + i * 10));
    if (shown.length < lines.length) doc.text(t(`… and ${lines.length - shown.length} more (Excel has the full list)`), M, y + 14 + shown.length * 10);
  }
  doc.setFontSize(6.5).setTextColor(130).text(t(`Baywise · ${fundName} · fact sheet. Performance: Fund Return and Valuation; portfolio: Asset Summary.`), M, 780);
  doc.setProperties({ title: t(`${fundName} fact sheet`), creator: "Baywise" });
  return doc.output("blob");
}
