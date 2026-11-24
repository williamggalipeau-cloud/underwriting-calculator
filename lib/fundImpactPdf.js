// Phase M: Portfolio Impact as a PDF (the live view or a saved scenario version),
// stamped with the scenario name, version, date, author and "Scenario - not
// actual" on every page. Built from the Excel rows (one source for both).
import { impactXlsx } from "@/lib/fundImpact";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[→]/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const fmt = (v) => (typeof v === "number" ? (Math.abs(v) >= 1000 ? `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}` : v.toFixed(2)) : v ?? "");

export async function fundImpactPdf(fundName, result, { scenario = "", version = null } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const H = doc.internal.pageSize.getHeight(), M = 40;
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [67, 56, 202], textColor: 255 } };
  const stamp = `${scenario ? `${scenario}${version ? ` v${version.v}` : ""}` : "Live view"}${version ? ` · saved ${String(version.at).slice(0, 10)}${version.by ? ` by ${version.by}` : ""}${version.note ? ` · ${version.note}` : ""}` : ` · ${new Date().toISOString().slice(0, 10)}`}`;
  doc.setFont("helvetica", "bold").setFontSize(16).text(t(`${fundName} - Fund impact`), M, 46);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(67, 56, 202).text(t(`SCENARIO - NOT ACTUAL · ${stamp}`), M, 62);
  doc.setTextColor(30);
  const rows = impactXlsx(fundName, result, { scenario }).slice(1);
  doc.setFontSize(9).text(t(String(rows[0][0])), M, 78, { maxWidth: 700 });
  let block = [];
  let y = 92;
  const flush = () => {
    if (!block.length) return;
    const [head, ...body] = block;
    autoTable(doc, { ...grid, startY: y, head: [head.map((c) => t(fmt(c)))], body: body.map((r) => r.map((c) => t(fmt(c)))) });
    y = doc.lastAutoTable.finalY + 14;
    block = [];
  };
  for (const r of rows.slice(2)) {
    if (!r.length) flush();
    else block.push(r);
  }
  flush();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(130).text(t(`Baywise · ${fundName} · fund impact · Scenario - not actual · ${stamp} · page ${i} of ${n}`), M, H - 18);
  }
  doc.setProperties({ title: t(`${fundName} fund impact (scenario)`), creator: "Baywise" });
  return doc.output("blob");
}
