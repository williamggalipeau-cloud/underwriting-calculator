// Business plan PDF for one revision (phase I). jsPDF loads on export.
import { LINES, diffPlans, kpiActuals, milestoneStatus, varianceReport } from "@/lib/businessPlan";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => (v == null || v === "" || !isFinite(v) ? "-" : `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`);
const usDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : iso || "-");

// rev: the revision number to print (1-based). variance: { kind, end } or null.
export async function businessPlanPdf(inputs, { rev: n, fundName = "", fundType = "", variance = null, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const bp = inputs.businessPlan;
  const rev = bp.revisions[(n ?? bp.revisions.length) - 1];
  const prev = bp.revisions[rev.n - 2] ?? null;
  const p = rev.plan;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), M = 40;
  const head = { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" };
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: head };
  let y = 0;
  const h = (text) => { y = (doc.lastAutoTable?.finalY ?? y) + 22; if (y > 720) { doc.addPage(); y = 50; } doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(30).text(t(text), M, y); y += 6; };
  const para = (label, text) => { if (!text) return; const lines = doc.splitTextToSize(t(text), W - 2 * M); if (y + 14 + lines.length * 11 > 760) { doc.addPage(); y = 50; } doc.setFont("helvetica", "bold").setFontSize(8.5).text(t(label), M, (y += 14)); doc.setFont("helvetica", "normal").text(lines, M, (y += 11)); y += lines.length * 11; doc.lastAutoTable = { finalY: y }; };

  // Cover
  doc.setFont("helvetica", "bold").setFontSize(18).text(t(`${inputs.propertyName} - Business plan`), M, 60);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(80);
  doc.text(t(`${fundName ? `${fundName}${fundType ? ` (${fundType})` : ""} · ` : ""}Revision ${rev.n} of ${bp.revisions.length} · ${usDate(rev.at.slice(0, 10))}${rev.by ? ` · ${rev.by}` : ""}`), M, 78);
  doc.text(t(`${rev.reason}${rev.note ? `: ${rev.note}` : ""} · budget: ${rev.budget?.label ?? "-"} · printed ${usDate(asOf)}`), M, 92);
  doc.setTextColor(30);
  y = 100; doc.lastAutoTable = { finalY: 100 };
  para("Thesis", p.thesis); para("Strategy", p.strategy); para("Recommendation", p.recommendation);
  const k = kpiActuals(inputs, asOf);
  h("KPIs vs target");
  autoTable(doc, { ...grid, startY: y + 4, head: [["KPI", "Target", "Actual"]], body: (p.kpis ?? []).map((x) => [x.label, x.unit === "$" ? money(x.target) : `${x.target} ${x.unit}`, x.key === "noi" ? (isFinite(k.noi) ? `${money(k.noi)} (annualized, ${k.noiMonths} mo)` : "-") : x.unit === "$" ? money(k[x.key]) : isFinite(k[x.key]) ? `${k[x.key].toFixed(x.key === "walt" ? 1 : 2)} ${x.unit}` : "-"].map(t)) });

  h("Leasing plan");
  autoTable(doc, { ...grid, startY: y + 4, styles: { fontSize: 7.5, cellPadding: 2.5 }, head: [["Unit", "Tenant", "SF", "Lease end", "Action", "Target rent/SF", "Downtime (mo)", "TI/SF", "Note"]], body: (p.leasing ?? []).map((l) => [l.unit, l.tenant, l.sf, usDate(l.leaseEnd), l.action, l.targetRentPSF, l.downtimeMonths, l.tiPSF, l.note].map(t)) });
  h("Capital plan");
  autoTable(doc, { ...grid, startY: y + 4, head: [["Project", "Scope", "Budget", "Spent", "Start", "End", "Expected return"]], body: (p.capital ?? []).length ? p.capital.map((c) => [c.project, c.scope, money(c.budget), money(c.spent), usDate(c.start), usDate(c.end), c.expectedReturn].map(t)) : [["None", "", "", "", "", "", ""]] });
  h("Operating, financing and exit");
  autoTable(doc, { ...grid, startY: y + 4, body: [
    ["Expense targets", p.operating?.expenseTargets], ["Recoveries", p.operating?.recoveries], ["Property management", p.operating?.management], ["Tax appeal", p.operating?.taxAppeal], ["Insurance", p.operating?.insurance],
    ["Loan", `${money(p.financing?.loan)} · ${p.financing?.rate ?? ""} · ${p.financing?.maturityYears ?? "-"} yrs · ${p.financing?.lender ?? ""}`], ["Financing plan", p.financing?.plan],
    ["Exit", `Hold ${p.exit?.holdYears ?? "-"} yrs · exit cap ${p.exit?.exitCapRatePct ?? "-"}% · target ${p.exit?.targetExit ?? "-"}`], ["Sale or refinance triggers", p.exit?.triggers],
  ].map((r) => r.map(t)), columnStyles: { 0: { cellWidth: 140, fontStyle: "bold" } } });
  h("Milestones");
  autoTable(doc, { ...grid, startY: y + 4, head: [["Milestone", "Due", "Owner", "Status"]], body: (p.milestones ?? []).map((m) => [m.label, usDate(m.due), m.owner, milestoneStatus(m, asOf)].map(t)),
    didParseCell: (c) => { if (c.section === "body" && c.column.index === 3 && c.cell.raw === "late") c.cell.styles.textColor = [200, 30, 30]; } });
  h("Risks and mitigants");
  autoTable(doc, { ...grid, startY: y + 4, head: [["Risk", "Mitigant"]], body: (p.risks ?? []).length ? p.risks.map((r) => [r.risk, r.mitigant].map(t)) : [["None recorded", ""]] });

  // Budget
  doc.addPage(); y = 40; doc.lastAutoTable = { finalY: 30 };
  h(`Budget: ${rev.budget?.label ?? ""} (by hold year)`);
  const yrs = rev.budget?.years ?? [];
  autoTable(doc, { ...grid, startY: y + 4, styles: { fontSize: 7.5, cellPadding: 2.5, halign: "right" }, columnStyles: { 0: { halign: "left" } }, head: [["Line", ...yrs.map((x) => `Year ${x.year}`)]],
    body: LINES.map(([key, label]) => [label, ...yrs.map((x) => money(x.lines[key]))].map(t)) });
  if (variance && Object.keys(bp.actuals ?? {}).length) {
    const rep = varianceReport(bp, { ...variance, sf: inputs.squareFootage });
    h(`Budget vs actual: ${variance.kind === "itd" ? "since closing" : variance.kind} to ${variance.end} (${rep.months.length} months)`);
    autoTable(doc, { ...grid, startY: y + 4, styles: { fontSize: 7.5, cellPadding: 2.5, halign: "right" }, columnStyles: { 0: { halign: "left" }, 6: { halign: "left" } }, head: [["Line", "Plan (rev. 1)", "Current budget", "Actual", "Variance", "%", "Comment"]],
      body: rep.rows.map((r) => [r.label, money(r.plan), money(r.current), money(r.actual), money(r.variance), r.variancePct != null ? `${r.variancePct.toFixed(1)}%` : "-", r.comment].map(t)),
      didParseCell: (c) => { const f = rep.rows[c.row.index]?.flag; if (c.section === "body" && f && c.column.index >= 4 && c.column.index <= 5) c.cell.styles.textColor = f === "red" ? [200, 30, 30] : [180, 110, 0]; } });
  }
  // Changes since the previous revision
  doc.addPage(); y = 40; doc.lastAutoTable = { finalY: 30 };
  h(prev ? `Changes since revision ${prev.n}` : "Revision 1 (the plan at closing)");
  const ch = prev ? diffPlans(prev, rev) : [];
  autoTable(doc, { ...grid, startY: y + 4, head: [["Field", "Was", "Now"]], body: prev ? (ch.length ? ch.map((c) => [c.field, c.from, c.to].map(t)) : [["No plan changes (budget or model only)", "", ""]]) : [["The original baseline; later revisions never change it.", "", ""]] });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7).setTextColor(130).text(t(`Baywise · ${inputs.propertyName} · business plan revision ${rev.n} · page ${i} of ${pages}`), M, 780); }
  return doc.output("blob");
}
