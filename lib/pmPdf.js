// Phase T: a Property Management tab as a PDF (summary and every section, by asset).
import { PM_TABS, rowsOf } from "@/lib/propertyMgmt";
import { propertyManagerLabel } from "@/lib/propertyManager";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : `$${Math.round(Number(v)).toLocaleString("en-US")}`);
const d = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");

// summaries: [{ asset, text }] already worded by the caller.
export async function pmPdf(tab, deals, { title, summaries = [], todayISO }) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const T = PM_TABS[tab];
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(`${T.label}: ${title}`), 36, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`As of ${d(todayISO)}`), 36, 46);
  doc.setTextColor(30);
  let y = 74;
  if (summaries.length) {
    autoTable(doc, { theme: "plain", startY: y, margin: { left: 36, right: 36 }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 160 } }, body: summaries.map((s) => [t(s.asset), t(s.text)]) });
    y = doc.lastAutoTable.finalY + 14;
  }
  // 1.1.13: who manages each asset (set in asset setup).
  const managed = deals.filter((dl) => propertyManagerLabel(dl.inputs));
  if (managed.length) {
    doc.setFont("helvetica", "bold").setFontSize(10).text("Property managers", 36, y);
    autoTable(doc, { theme: "plain", startY: y + 4, margin: { left: 36, right: 36 }, styles: { fontSize: 8, cellPadding: 2 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 160 } }, body: managed.map((dl) => [t(dl.inputs.propertyName), t(propertyManagerLabel(dl.inputs))]) });
    y = doc.lastAutoTable.finalY + 14;
  }
  const many = deals.length > 1;
  for (const s of T.sections) {
    const rows = deals.flatMap((dl) => rowsOf(dl.inputs, s.key).map((r) => [...(many ? [dl.inputs.propertyName] : []), ...s.cols.map(([k, , type]) => (type === "money" ? money(r[k]) : type === "date" ? d(r[k]) : type === "check" ? (r[k] ? "Yes" : "") : r[k] ?? ""))]));
    doc.setFont("helvetica", "bold").setFontSize(10).text(t(`${s.label} (${rows.length})`), 36, y);
    autoTable(doc, {
      theme: "grid", startY: y + 5, margin: { left: 36, right: 36 }, styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [235, 240, 248], textColor: 40 },
      head: [[...(many ? ["Asset"] : []), ...s.cols.map(([, l]) => l)]],
      body: rows.length ? rows.map((r) => r.map((c) => t(String(c)))) : [[...(many ? [""] : []), "None", ...s.cols.slice(1).map(() => "")]],
    });
    y = doc.lastAutoTable.finalY + 16;
  }
  doc.setProperties({ title: `${T.label} ${title}`, creator: "Baywise" });
  return doc.output("blob");
}
