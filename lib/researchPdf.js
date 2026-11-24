// Acquisitions → Research → Third-Party as a PDF.
import { assumptionLabel, researchSummary, researchTypeLabel, safeLink } from "@/lib/research";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
const d = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "-");

export async function researchPdf({ title, items, todayISO }) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const sum = researchSummary(items);
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(`Third-party research: ${title}`), 36, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`${sum.count} report${sum.count === 1 ? "" : "s"} · as of ${d(todayISO)}`), 36, 46);
  doc.setTextColor(30).setFontSize(8.5);
  doc.text(t(`Assumptions supported: ${sum.covered.map(assumptionLabel).join(", ") || "none"}`), 36, 74);
  if (sum.missing.length) doc.text(t(`No research yet for: ${sum.missing.map(assumptionLabel).join(", ")}`), 36, 86);
  autoTable(doc, {
    theme: "grid", styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" }, headStyles: { fillColor: [235, 240, 248], textColor: 40 }, margin: { left: 36, right: 36 },
    startY: 96,
    head: [["Asset", "Type", "Title", "Provider", "Date", "Supports", "Key figures", "Summary", "Source"]],
    columnStyles: { 7: { cellWidth: 190 } },
    body: items.map(({ asset, r }) => [asset, researchTypeLabel(r.type), r.title, r.provider, d(r.date), (r.assumptions ?? []).map(assumptionLabel).join(", "), r.keyFigures, r.summary, [safeLink(r.url), r.fileName].filter(Boolean).join("\n")].map((c) => t(c ?? ""))),
  });
  doc.setFontSize(6.5).setTextColor(130).text("Baywise · third-party research is summarized by the team; see the source report for the full text.", 36, doc.internal.pageSize.getHeight() - 18);
  doc.setProperties({ title: t(`Third-party research: ${title}`), creator: "Baywise" });
  return doc.output("blob");
}
