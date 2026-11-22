// Printable lease abstraction report (PDF) for one asset or the whole fund.
// jsPDF is loaded only when the user exports.
import { groupedFields, STATUS_TEXT } from "@/lib/leaseAbstract";
import { criticalDates, riskFlags } from "@/lib/leaseViews";

const usDate = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};
const money = (v) => (v == null || !isFinite(v) ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
// jsPDF's standard fonts are Latin-1: replace characters they can't draw.
const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");

// leases: rows with abstracts; title: "Airport Flex Park" or "Model Fund I".
export async function leaseReportPdf(leases, { title, assetName = (id) => id, asOf = new Date().toISOString().slice(0, 10), credit = null } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const withAbs = leases.filter((l) => l.abstract).sort((a, b) => assetName(a.deal_id).localeCompare(assetName(b.deal_id)) || (a.tenant || "").localeCompare(b.tenant || ""));
  const head = { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" };

  // Cover: summary, upcoming dates and risk flags across the leases
  doc.setFont("helvetica", "bold").setFontSize(16).text(t(`${title} - Lease abstraction report`), M, 50);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(t(`${withAbs.length} abstracted lease${withAbs.length === 1 ? "" : "s"} of ${leases.length} · as of ${usDate(asOf)} · abstracts validated against the PDFs with the CREparser connector where marked`), M, 66);
  autoTable(doc, {
    startY: 80, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: head,
    head: [["Asset", "Tenant", "Premises", "SF", "Expires", "Current rent", "Status", "Validated"]],
    body: withAbs.map((l) => {
      const f = (k) => l.abstract.fields?.find((x) => x.key === k)?.value ?? "";
      return [assetName(l.deal_id), l.tenant || l.abstract.title, f("premises"), f("rentable_area").replace(/ rentable square feet.*/, ""), f("expiration_date"), f("base_rent").replace(/^.*currently /, "").slice(0, 40), l.status, l.abstract.app?.validated ? "Yes" : "No"].map(t);
    }),
  });
  const dates = criticalDates(withAbs, { assetName, asOf, credit, includeHistory: false }).filter((d) => d.date && d.status !== "past").slice(0, 25);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(30).text("Upcoming critical dates", M, doc.lastAutoTable.finalY + 24);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 30, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: head,
    head: [["Date", "Days", "Asset", "Tenant", "Event", "Action"]],
    body: dates.length ? dates.map((d) => [usDate(d.date), d.days, d.asset, d.tenant, d.label, d.action].map(t)) : [["No upcoming dates", "", "", "", "", ""]],
    didParseCell: (c) => { if (c.section === "body" && dates[c.row.index]?.status === "soon") c.cell.styles.fillColor = [255, 247, 230]; },
  });
  const risks = riskFlags(withAbs, { assetName });
  doc.setFont("helvetica", "bold").setFontSize(11).text("Risk flags", M, doc.lastAutoTable.finalY + 24);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 30, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: head,
    head: [["Severity", "Asset", "Tenant", "Risk", "Clause", "Detail"]],
    body: risks.length ? risks.map((r) => [r.severity, r.asset, r.tenant, r.title, r.clause, r.detail].map(t)) : [["None", "", "", "", "", ""]],
    columnStyles: { 5: { cellWidth: 200 } },
    didParseCell: (c) => { if (c.section === "body" && c.column.index === 0) c.cell.styles.textColor = { high: [200, 30, 30], medium: [180, 110, 0] }[risks[c.row.index]?.severity] ?? 60; },
  });

  // One section per lease
  for (const l of withAbs) {
    const a = l.abstract;
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(30).text(t(a.title || l.tenant), M, 46, { maxWidth: W - 2 * M });
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(80);
    const sumLines = doc.splitTextToSize(t(a.summary || ""), W - 2 * M);
    doc.text(sumLines, M, 64);
    let y = 64 + sumLines.length * 10 + 6;
    doc.setFontSize(7.5).text(t(`${assetName(l.deal_id)} · ${l.status === "applied" ? "applied to rent roll" : l.status} · ${a.app?.validated ? "validated against the PDF" : "not validated"}${a.app?.draft_id ? ` (draft ${a.app.draft_id.slice(0, 8)})` : ""}${(a.documents ?? []).length > 1 ? ` · documents: ${a.documents.map((d) => `${d.title} pp. ${d.start_page}-${d.end_page}`).join("; ")}` : ""}`), M, y, { maxWidth: W - 2 * M });
    const body = [];
    for (const g of groupedFields(a)) {
      body.push([{ content: t(g.label), colSpan: 3, styles: { fontStyle: "bold", fillColor: [249, 250, 251] } }]);
      for (const f of g.fields) body.push([t(f.label || f.key.replace(/_/g, " ")), t(`${f.value}${f.governed_by ? " (amended)" : ""}`), t(`${f.clause ? `§ ${f.clause}` : ""} ${STATUS_TEXT[f.status] ?? ""}`)]);
    }
    autoTable(doc, { startY: y + 12, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: head, head: [["Term", "Value", "Clause / status"]], body, columnStyles: { 0: { cellWidth: 110 }, 2: { cellWidth: 80 } } });
    const rent = a.rent_schedule ?? [];
    if (rent.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 14, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: head,
        head: [["Rent period", "From", "To", "$/SF/yr", "Monthly"]],
        body: rent.map((r) => [t(`${r.period}${r.space ? ` · ${r.space}` : ""}`), usDate(r.start), usDate(r.end), r.rate != null ? money(r.rate) : "—", money(r.monthly_rent)]),
      });
    }
    const cds = [...(a.critical_dates ?? [])].sort((x, z) => (x.date < z.date ? -1 : 1));
    if (cds.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 14, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: head,
        head: [["Date", "Event", "Notice", "Action", "Clause"]],
        body: cds.map((c) => [usDate(c.date), t(c.label), t(c.notice ?? ""), t(c.action ?? ""), t(c.clause ?? "")]),
      });
    }
    if ((a.risks ?? []).length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 14, margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: head,
        head: [["Risk", "Severity", "Clause", "Detail and quote"]],
        body: a.risks.map((r) => [t(r.title), r.severity, t(r.clause ?? ""), t(`${r.detail}${r.evidence?.[0]?.quote ? `\n"${r.evidence[0].quote}"` : ""}`)]),
        columnStyles: { 3: { cellWidth: 260 } },
      });
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(130);
    const H = doc.internal.pageSize.getHeight();
    doc.text(t(`${title} · lease abstraction report · ${usDate(asOf)} · values from the lease abstracts; check the lease before acting`), M, H - 20);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 20, { align: "right" });
  }
  return doc.output("blob");
}
