// Business plan PDF for one revision (phase I). jsPDF loads on export.
import { LINES, diffPlans, kpiActuals, milestoneStatus, varianceReport } from "@/lib/businessPlan";
import { RETURN_METRICS, YEAR_METRICS } from "@/lib/uwActual";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => (v == null || v === "" || !isFinite(v) ? "-" : `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`);
const usDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : iso || "-");

const val = (v, unit) => (v == null || !isFinite(v) ? "-" : unit === "$" ? money(v) : unit === "%" ? `${v.toFixed(2)}%` : `${v.toFixed(2)}x`);
const dlt = (v, unit) => (v == null || !isFinite(v) ? "-" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${unit === "$" ? money(Math.abs(v)) : unit === "%" ? `${Math.abs(v).toFixed(2)} pts` : `${Math.abs(v).toFixed(2)}x`}`);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// rev: the revision number to print (1-based). variance: { kind, end } or null.
// extras (phase L, lib/businessPlanExtras planExtras): photos, floor plan,
// location, actual NOI, underwritten vs. actual. Without it, the plan only.
export async function businessPlanPdf(inputs, { rev: n, fundName = "", fundType = "", variance = null, asOf = new Date().toISOString().slice(0, 10), extras = null } = {}) {
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

  // Cover (with the cover photo at the top right when there is one)
  const ci = extras?.coverImg;
  const titleW = ci ? W - 2 * M - 190 : W - 2 * M;
  if (ci) {
    const iw = 180, ih = Math.min(135, (iw * ci.h) / ci.w);
    doc.addImage(ci.dataUrl, "JPEG", W - M - iw, 30, iw, ih);
    doc.setFontSize(6.5).setTextColor(120).text(t(doc.splitTextToSize(extras.cover?.caption || "", iw)[0] ?? ""), W - M - iw, 30 + ih + 8);
    doc.setTextColor(30);
  }
  doc.setFont("helvetica", "bold").setFontSize(18).text(doc.splitTextToSize(t(`${inputs.propertyName} - Business plan`), titleW)[0], M, 60);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(80);
  doc.text(t(`${fundName ? `${fundName}${fundType ? ` (${fundType})` : ""} · ` : ""}Revision ${rev.n} of ${bp.revisions.length} · ${usDate(rev.at.slice(0, 10))}${rev.by ? ` · ${rev.by}` : ""}`), M, 78, { maxWidth: titleW });
  doc.text(t(`${rev.reason}${rev.note ? `: ${rev.note}` : ""} · budget: ${rev.budget?.label ?? "-"} · printed ${usDate(asOf)}`), M, 92, { maxWidth: titleW });
  doc.setTextColor(30);
  y = ci ? 170 : 100; doc.lastAutoTable = { finalY: y };
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

  if (extras) assetPages(doc, autoTable, inputs, extras, { grid, M, W, asOf });

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
  if (extras?.uw) uwPage(doc, autoTable, extras.uw, { grid, M });

  // Changes since the previous revision
  doc.addPage(); y = 40; doc.lastAutoTable = { finalY: 30 };
  h(prev ? `Changes since revision ${prev.n}` : "Revision 1 (the plan at closing)");
  const ch = prev ? diffPlans(prev, rev) : [];
  autoTable(doc, { ...grid, startY: y + 4, head: [["Field", "Was", "Now"]], body: prev ? (ch.length ? ch.map((c) => [c.field, c.from, c.to].map(t)) : [["No plan changes (budget or model only)", "", ""]]) : [["The original baseline; later revisions never change it.", "", ""]] });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7).setTextColor(130).text(t(`Baywise · ${inputs.propertyName} · business plan revision ${rev.n} · page ${i} of ${pages}`), M, 780); }
  return doc.output("blob");
}

// The asset: location, actual NOI, photos, floor plan (phase L).
function assetPages(doc, autoTable, inputs, x, { grid, M, W, asOf }) {
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(30).text(t(`${inputs.propertyName} - the asset`), M, 50);
  const loc = x.location;
  const noi = x.actualNoi;
  autoTable(doc, { ...grid, startY: 62, columnStyles: { 0: { cellWidth: 130, fontStyle: "bold" } }, body: [
    ["Address", loc.address || "-"],
    ["Coordinates", loc.lat != null && loc.lon != null ? `${Number(loc.lat).toFixed(5)}, ${Number(loc.lon).toFixed(5)}${loc.manual ? " (entered)" : ""}` : "From the address"],
    ["Map", loc.link || "-"],
    ["Size", `${Number(inputs.squareFootage || 0).toLocaleString("en-US")} SF · ${x.unitBoxes.length} units`],
    ["Actual NOI", isFinite(noi.noi) ? `${money(noi.noi)} annualized from ${noi.months} month${noi.months === 1 ? "" : "s"} (${noi.from} to ${noi.to})` : "No actuals imported yet"],
  ].map((r) => r.map(t)),
    didDrawCell: (c) => { if (c.section === "body" && c.row.index === 2 && c.column.index === 1 && loc.link) doc.link(c.cell.x, c.cell.y, c.cell.width, c.cell.height, { url: loc.link }); } });

  // Photos: 2 across, 3 down per page
  const ps = x.photos.filter((p) => p.img);
  if (ps.length) {
    let i = 0;
    const cw = (W - 2 * M - 16) / 2, chMax = 170;
    let yTop = doc.lastAutoTable.finalY + 26;
    doc.setFont("helvetica", "bold").setFontSize(11).text("Photos", M, yTop - 8);
    for (const p of ps) {
      const ih = Math.min(chMax, (cw * p.img.h) / p.img.w);
      if (i % 2 === 0 && yTop + ih + 24 > 760) { doc.addPage(); yTop = 50; }
      const xx = M + (i % 2) * (cw + 16);
      doc.addImage(p.img.dataUrl, "JPEG", xx, yTop, cw, ih);
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(70).text(t(`${p.cover ? "Cover · " : ""}${p.caption || p.name || ""}${p.date ? ` · ${usDate(p.date)}` : ""}`), xx, yTop + ih + 10, { maxWidth: cw });
      doc.setTextColor(30);
      if (i % 2 === 1) yTop += chMax + 26;
      i++;
    }
  }
  (x.notes ?? []).forEach((note, k) => doc.setFontSize(7.5).setTextColor(150, 80, 0).text(t(note), M, 770 - k * 10));
  doc.setTextColor(30);

  // Floor plan: the image (or the schematic) with units coloured by status
  if (x.unitBoxes.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(13).text(t(`${inputs.propertyName} - floor plan`), M, 50);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(90).text(t(`Units coloured by lease status as of ${usDate(asOf)}${x.planImg ? "" : " (schematic: units sized by SF; no plan uploaded)"}`), M, 64);
    doc.setTextColor(30);
    const aw = W - 2 * M;
    const ah = x.planImg ? Math.min(420, (aw * x.planImg.h) / x.planImg.w) : 300;
    const ax = M, ay = 76;
    if (x.planImg) doc.addImage(x.planImg.dataUrl, "JPEG", ax, ay, aw, ah);
    else doc.setDrawColor(60).setLineWidth(2).rect(ax, ay, aw, ah);
    const gs = doc.GState ? new doc.GState({ opacity: x.planImg ? 0.45 : 1 }) : null;
    for (const u of x.unitBoxes) {
      if (!u.box) continue;
      const bx = ax + u.box.x * aw, by = ay + u.box.y * ah, bw = u.box.w * aw, bh = u.box.h * ah;
      if (gs) { doc.saveGraphicsState(); doc.setGState(gs); }
      doc.setFillColor(...rgb(u.color.fill)).rect(bx, by, bw, bh, "F");
      if (gs) doc.restoreGraphicsState();
      doc.setDrawColor(...rgb(u.color.stroke)).setLineWidth(1).rect(bx, by, bw, bh, "S");
      if (!x.planImg) doc.setFontSize(bw > 50 ? 7 : 5.5).setTextColor(40).text(t(u.name), bx + bw / 2, by + bh / 2, { align: "center" });
    }
    doc.setTextColor(30);
    let lx = M;
    const ly = ay + ah + 16;
    for (const c of Object.values(STATUS)) {
      doc.setFillColor(...rgb(c.fill)).setDrawColor(...rgb(c.stroke)).rect(lx, ly - 7, 10, 8, "FD");
      doc.setFontSize(7.5).text(t(c.label), lx + 14, ly);
      lx += 140;
    }
    autoTable(doc, { ...grid, startY: ly + 12, styles: { fontSize: 7, cellPadding: 2 }, head: [["Unit", "SF", "Tenant", "Status"]],
      body: x.unitBoxes.map((u) => [u.name, u.sf.toLocaleString("en-US"), u.tenant || "-", u.color.label].map(t)),
      didParseCell: (c) => { if (c.section === "body" && c.column.index === 3) c.cell.styles.textColor = rgb(x.unitBoxes[c.row.index].color.stroke); } });
  }
}

// Underwritten vs. actual + projected (phase J).
function uwPage(doc, autoTable, uw, { grid, M }) {
  const { baseline, c, attr } = uw;
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(30).text("Underwritten vs. actual + projected", M, 50);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(90).text(t(`Baseline frozen ${usDate(String(baseline.at ?? "").slice(0, 10))}${baseline.by ? ` by ${baseline.by}` : ""} · ${c.actual.actualMonths} months of actual NOI`), M, 64);
  doc.setTextColor(30);
  autoTable(doc, { ...grid, startY: 74, head: [["Return", "Underwritten", "Actual + projected", "Variance"]],
    body: RETURN_METRICS.map(([k, l, u]) => [l, val(c.returns[k].u, u), val(c.returns[k].a, u), dlt(c.returns[k].v, u)].map(t)) });
  autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["IRR gap by cause", "Points"]],
    body: [...attr.rows.map((r) => [r.label, dlt(r.delta, "%")]), ["Total", dlt(attr.gap, "%")]].map((r) => r.map(t)) });
  autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, styles: { fontSize: 6.5, cellPadding: 2, halign: "right" }, columnStyles: { 0: { halign: "left" } },
    head: [["By year", ...c.years.map((y) => `Y${y.year} (${y.status})`)]],
    body: YEAR_METRICS.flatMap(([k, l, u]) => [
      [`${l} - underwritten`, ...c.years.map((y) => val(y.metrics[k].u, u))],
      [`${l} - actual + projected`, ...c.years.map((y) => val(y.metrics[k].a, u))],
    ]).map((r) => r.map(t)) });
}

const STATUS = {
  occupied: { fill: "#d1fae5", stroke: "#059669", label: "Leased" },
  expiring: { fill: "#fef3c7", stroke: "#d97706", label: "Expires within 12 months" },
  vacant: { fill: "#fee2e2", stroke: "#dc2626", label: "Vacant" },
};
