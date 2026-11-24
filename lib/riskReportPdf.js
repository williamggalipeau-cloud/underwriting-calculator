// Phase L: the internal risk report as a PDF, watermarked on every page.
import { RISK_GROUPS, riskXlsx } from "@/lib/riskReport";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[→]/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const fmt = (v) => (typeof v === "number" ? (Math.abs(v) >= 1000 ? `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}` : Number.isInteger(v) ? String(v) : v.toFixed(2)) : v ?? "");

// Uses the Excel rows (one source for both): each block (a header row then
// its rows, separated by empty rows) becomes a table.
export async function riskReportPdf(fundName, r, { issued = null } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: [127, 29, 29], textColor: 255, fontStyle: "bold" } };
  doc.setFont("helvetica", "bold").setFontSize(18).text(t(`${fundName} - Risk report`), M, 50);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(150, 30, 30).text(t(`INTERNAL - not for distribution · as of ${r.asOf}${issued ? ` · issued ${String(issued.at).slice(0, 10)}${issued.by ? ` by ${issued.by}` : ""} (v${issued.v})` : " · draft"}`), M, 68);
  doc.setTextColor(30);
  const rows = riskXlsx(fundName, r).slice(2);
  let block = [];
  let y = 84;
  const flush = () => {
    if (!block.length) return;
    const [head, ...body] = block;
    autoTable(doc, { ...grid, startY: y, head: [head.map((c) => t(fmt(c)))], body: body.length ? body.map((row) => row.map((c) => t(fmt(c)))) : [["None"]] });
    y = doc.lastAutoTable.finalY + 14;
    block = [];
  };
  for (const row of rows) {
    if (!row.length) { flush(); continue; }
    // A group heading (Tenant and Leasing, Financial, Concentration, Operational).
    if (row.length === 1 && RISK_GROUPS.includes(row[0])) {
      flush();
      if (y > H - 90) { doc.addPage(); y = 50; }
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(127, 29, 29).text(t(row[0]), M, y + 6);
      doc.setDrawColor(127, 29, 29).setLineWidth(0.8).line(M, y + 10, W - M, y + 10);
      doc.setFont("helvetica", "normal").setTextColor(30);
      y += 20;
      continue;
    }
    block.push(row);
  }
  flush();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.saveGraphicsState?.();
    if (doc.GState) doc.setGState(new doc.GState({ opacity: 0.08 }));
    doc.setFont("helvetica", "bold").setFontSize(54).setTextColor(180, 0, 0).text("INTERNAL - NOT FOR DISTRIBUTION", W / 2, H / 2, { align: "center", angle: 25 });
    doc.restoreGraphicsState?.();
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(130).text(t(`Baywise · ${fundName} · risk report · INTERNAL - not for distribution · page ${i} of ${n}`), M, H - 18);
  }
  doc.setProperties({ title: t(`${fundName} risk report (internal)`), creator: "Baywise" });
  return doc.output("blob");
}
