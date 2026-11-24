// Phase Y: Benchmarking as an internal PDF (licensed data).
import { benchmarkXlsx } from "@/lib/benchmarks";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");

// Uses the Excel rows (one source for both): each block after a blank row is a table.
export async function benchmarkPdf(r, b, { todayISO } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(`Benchmarking: ${r.fund}`), M, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`INTERNAL - licensed data, not for distribution · as of ${todayISO}`), M, 46);
  doc.setTextColor(30);
  const rows = benchmarkXlsx(r, b);
  doc.setFontSize(8).text(t(rows[1][0]), M, 72, { maxWidth: W - 2 * M });
  let y = 86, block = [];
  const fmt = (c) => (typeof c === "number" ? (Number.isInteger(c) ? String(c) : c.toFixed(2)) : c ?? "");
  const flush = () => {
    if (!block.length) return;
    const [head, ...body] = block;
    autoTable(doc, { theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: [30, 64, 120], textColor: 255 }, margin: { left: M, right: M }, startY: y, head: [head.map((c) => t(fmt(c)))], body: body.length ? body.map((row) => row.map((c) => t(fmt(c)))) : [["None"]] });
    y = doc.lastAutoTable.finalY + 12;
    if (y > H - 80) { doc.addPage(); y = 40; }
    block = [];
  };
  for (const row of rows.slice(3)) { if (!row.length) flush(); else block.push(row); }
  flush();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(6.5).setTextColor(130).text(t(`Baywise · ${r.fund} benchmarking · INTERNAL, licensed data · page ${i} of ${n}`), M, H - 16); }
  doc.setProperties({ title: t(`${r.fund} benchmarking (internal)`), creator: "Baywise" });
  return doc.output("blob");
}
