// Phase J: printable asset-management report (underwritten vs. actual +
// projected) for one asset. jsPDF loads on export.
import { RETURN_METRICS, YEAR_METRICS } from "@/lib/uwActual";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => (v == null || !isFinite(v) ? "-" : `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`);
const val = (v, unit) => (v == null || !isFinite(v) ? "-" : unit === "$" ? money(v) : unit === "%" ? `${v.toFixed(2)}%` : `${v.toFixed(2)}x`);
const dlt = (v, unit) => (v == null || !isFinite(v) ? "-" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${unit === "$" ? money(Math.abs(v)).replace("-", "") : unit === "%" ? `${Math.abs(v).toFixed(2)} pts` : `${Math.abs(v).toFixed(2)}x`}`);
const usDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : iso || "-");

export async function uwActualPdf(name, baseline, c, attr, { asOf = new Date().toISOString().slice(0, 10), fundName = "" } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const M = 40;
  const head = { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" };
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: head };
  const red = (c2) => { const v = Number(String(c2.cell.raw).replace(/[^\d.+-]/g, "")); if (String(c2.cell.raw).startsWith("-") && v) c2.cell.styles.textColor = [200, 30, 30]; };

  doc.setFont("helvetica", "bold").setFontSize(16).text(t(`${name} - Underwritten vs. actual`), M, 50);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(t(`${fundName ? `${fundName} · ` : ""}Baseline frozen ${usDate(baseline.at?.slice(0, 10))}${baseline.by ? ` by ${baseline.by}` : ""} · ${c.actual.actualMonths} months of actual NOI · as of ${usDate(asOf)}`), M, 66);
  doc.setTextColor(30);

  autoTable(doc, { ...grid, startY: 80, tableWidth: 330, head: [["Return", "Underwritten", "Actual + projected", "Variance"]],
    body: RETURN_METRICS.map(([k, l, u]) => [l, val(c.returns[k].u, u), val(c.returns[k].a, u), dlt(c.returns[k].v, u)].map(t)),
    didParseCell: (x) => x.section === "body" && x.column.index === 3 && red(x) });
  autoTable(doc, { ...grid, startY: 80, margin: { left: 400, right: M }, head: [["IRR gap by cause", "Points", "Inputs changed"]],
    body: [...attr.rows.map((r) => [r.label, dlt(r.delta, "%"), r.changed.slice(0, 6).join(", ") + (r.changed.length > 6 ? ", …" : "")]), ["Total", dlt(attr.gap, "%"), ""]].map((r) => r.map(t)),
    columnStyles: { 2: { cellWidth: 170 } },
    didParseCell: (x) => x.section === "body" && x.column.index === 1 && red(x) });

  const y0 = Math.max(doc.lastAutoTable.finalY, 260) + 20;
  autoTable(doc, { ...grid, startY: y0, styles: { fontSize: 7, cellPadding: 2, halign: "right" }, columnStyles: { 0: { halign: "left" } },
    head: [["By year", ...c.years.map((y) => `Year ${y.year} (${y.status})`)]],
    body: YEAR_METRICS.flatMap(([k, l, u]) => [
      [`${l} - underwritten`, ...c.years.map((y) => val(y.metrics[k].u, u))],
      [`${l} - actual + projected`, ...c.years.map((y) => val(y.metrics[k].a, u))],
      [`${l} - variance`, ...c.years.map((y) => dlt(y.metrics[k].v, u))],
    ]).map((r) => r.map(t)),
    didParseCell: (x) => x.section === "body" && x.column.index > 0 && x.row.index % 3 === 2 && red(x) });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7).setTextColor(130).text(t(`Baywise · ${name} · asset-management report · page ${i} of ${pages}`), M, 590); }
  return doc.output("blob");
}
