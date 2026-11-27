// The asset quarterly report as a PDF (user, 11/24). jsPDF loads on export.
// cover: { dataUrl, w, h } (optional).
const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => { if (v == null || !isFinite(v)) return "-"; const a = Math.abs(v); const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`; return v < 0 ? `(${s})` : s; };
const pct = (v) => (v == null || !isFinite(v) ? "-" : `${v.toFixed(1)}%`);
const x2 = (v) => (v == null || !isFinite(v) ? "-" : `${v.toFixed(2)}x`);
const num = (v, d = 1) => (v == null || !isFinite(v) ? "-" : v.toFixed(d));
const usDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : iso || "-");

export async function assetReportPdf(r, { letter = "", notes = "", cover = null, issued = null } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [30, 64, 120], textColor: 255, fontStyle: "bold" } };
  const internal = r.kind === "internal";
  const a = r.asset, v = r.value, o = r.operations;

  doc.setFillColor(30, 64, 120).rect(0, 0, W, 90, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(22).text(t(a.name), M, 48);
  doc.setFont("helvetica", "normal").setFontSize(12).text(t(`Asset quarterly report · ${r.quarterLabel} (quarter ending ${usDate(r.qEnd)})${internal ? " · INTERNAL" : ""}`), M, 72);
  doc.setTextColor(90).setFontSize(9).text(t(`${r.fund.name} · ${a.city || ""} · ${Math.round(a.sf).toLocaleString("en-US")} SF · acquired ${usDate(a.acq)}${issued ? ` · issued ${usDate(String(issued.at).slice(0, 10))}${issued.by ? ` by ${issued.by}` : ""} (v${issued.v})` : " · draft"}${a.propertyManager ? ` · property manager: ${a.propertyManager}` : ""}`), M, 112);
  doc.setTextColor(30);
  let y = 128;
  if (cover) { const iw = 300, ih = Math.min(200, (iw * cover.h) / cover.w); doc.addImage(cover.dataUrl, "JPEG", W - M - iw, y, iw, ih); }
  autoTable(doc, { ...grid, startY: y, tableWidth: cover ? W - 2 * M - 320 : 360, head: [["At quarter end", ""]],
    body: [["Value", `${money(v.end)} (${v.basis})`], ["Change over the quarter", v.change != null ? `${money(v.change)} (${pct(v.changePct)})` : "-"], ["Cost basis", money(v.cost)], ["Unrealized gain", money(v.unrealized)], ["Implied cap rate", pct(v.impliedCap)], ["Last appraisal", v.lastAppraisal ? `${money(v.lastAppraisal.value)} (${usDate(v.lastAppraisal.quarterEnd)})` : "-"], ["Equity IRR to date (at the mark)", r.returns.irr != null ? pct(r.returns.irr) : "n/m"], ["Equity multiple", x2(r.returns.tvpi)]].map((x) => x.map(t)) });
  y = Math.max(doc.lastAutoTable.finalY, cover ? 340 : 0) + 18;
  if (r.returns.note) { doc.setFontSize(8).setTextColor(150, 80, 0).text(t(`Returns: ${r.returns.note}.`), M, y - 6); doc.setTextColor(30); }
  const lines = doc.splitTextToSize(t(letter || ""), W - 2 * M);
  doc.setFontSize(10);
  for (const ln of lines) { if (y > H - 50) { doc.addPage(); y = 50; } doc.text(ln, M, y); y += 13; }

  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(14).text(t(`Operations and plan · ${r.quarterLabel}`), M, 46);
  autoTable(doc, { ...grid, startY: 58, tableWidth: 330, head: [["Measure", "Actual", "Plan target"]],
    body: [["Occupancy", pct(o.occupancy), pct(o.occupancyTarget)], ["Average rent ($/SF)", num(o.rentPSF, 2), num(o.rentTarget, 2)], ["WALT (years)", num(o.walt), num(o.waltTarget)], ["NOI year to date", o.noiYtd ? `${money(o.noiYtd.actual)} (${o.noiYtd.months} mo)` : "no actuals yet", o.noiYtd ? `${money(o.noiYtd.plan)} (${pct(o.noiYtd.vsPlanPct)})` : "-"], ["NOI (annualized / year-1 plan)", money(o.noiAnnualized), money(o.noiPlan)], ["Vacant", `${Math.round(o.vacantSF).toLocaleString("en-US")} SF (${o.vacantUnits} units)`, ""], ["Active leasing prospects", String(o.prospects), ""]].map((x) => x.map(t)) });
  autoTable(doc, { ...grid, startY: 58, margin: { left: M + 350, right: M }, head: [["Debt", ""]],
    body: [["Loan", money(r.debt.loan)], ["Lender", r.debt.lender || "-"], ["Rate", r.debt.floating ? `SOFR + ${num(r.debt.spreadPct, 2)}%` : `${num(r.debt.rate, 2)}% fixed`], ["Maturity", usDate(r.debt.maturity)], ["LTV", pct(r.debt.ltv)]].map((x) => x.map(t)) });
  const bm = r.benchmark;
  if (bm) autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 10, margin: { left: M + 350, right: M }, head: [["Benchmark (since " + (bm.since ?? "-") + ")", ""]], body: [["Asset TWR (annualized)", pct(bm.total)], [bm.benchLabel ?? "Index", pct(bm.bench)], ["Spread", bm.spread != null ? `${bm.spread >= 0 ? "+" : ""}${bm.spread.toFixed(1)} pts` : "-"]].map((x) => x.map(t)) });
  let yy = Math.max(doc.lastAutoTable.finalY, 230) + 14;
  autoTable(doc, { ...grid, startY: yy, head: [["Leases expiring in the next 12 months", "Tenant", "SF", "Expires"]], body: o.expiring.length ? o.expiring.map((x) => [x.unit, x.tenant, Math.round(x.sf).toLocaleString("en-US"), usDate(x.leaseEnd)].map(t)) : [["None", "", "", ""]] });
  if (r.plan) {
    autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 10, head: [[`Business plan (revision ${r.plan.revision}${r.plan.recommendation ? ` · ${r.plan.recommendation}` : ""}): milestones`, "Due", "Owner", "Status"]], body: r.plan.milestones.length ? r.plan.milestones.map((m) => [m.label, usDate(m.due), m.owner, m.status].map(t)) : [["None", "", "", ""]] });
    if (r.plan.capital.length) autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 10, head: [["Capital project", "Budget", "Spent", "End"]], body: r.plan.capital.map((c) => [c.project, money(c.budget), money(c.spent), usDate(c.end)].map(t)) });
  }
  if (internal && r.internal) {
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(14).text("Internal: underwritten vs. actual and budget variances", M, 46);
    const u = r.internal.uw;
    autoTable(doc, { ...grid, startY: 58, head: [["IRR underwritten", "IRR actual + projected", "Gap"]], body: [u ? [pct(u.uwIrr), pct(u.irr), isFinite(u.gap) ? `${u.gap >= 0 ? "+" : ""}${u.gap.toFixed(2)} pts` : "-"] : ["No frozen baseline yet", "", ""]].map((x) => x.map(t)) });
    autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 12, head: [["Budget line (year to date)", "Budget", "Actual", "Variance", "Comment"]], body: r.internal.budget.length ? r.internal.budget.map((x) => [x.line, money(x.current), money(x.actual), `${money(x.variance)}${isFinite(x.variancePct) ? ` (${x.variancePct.toFixed(1)}%)` : ""}`, x.comment].map(t)) : [["No flagged variances", "", "", "", ""]] });
    if (notes) { const ny = doc.lastAutoTable.finalY + 22; doc.setFont("helvetica", "bold").setFontSize(10).text("Internal notes", M, ny); doc.setFont("helvetica", "normal").setFontSize(9).text(doc.splitTextToSize(t(notes), W - 2 * M), M, ny + 14); }
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7).setTextColor(130).text(t(`Baywise · ${a.name} (${r.fund.name}) · ${r.quarterLabel} asset report${internal ? " · INTERNAL - not for distribution" : ""} · page ${i} of ${n}`), M, H - 18); }
  doc.setProperties({ title: t(`${a.name} ${r.quarterLabel} asset report${internal ? " (internal)" : ""}`), creator: "Baywise" });
  return doc.output("blob");
}
