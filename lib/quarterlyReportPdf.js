// Phase L: the quarterly performance report as a PDF (shareable or internal).
// jsPDF loads on export. covers: { [assetId]: { dataUrl, w, h } } (optional).
import { QUARTILE_SHORT, summaryChange, summaryValue } from "@/lib/quarterlyReport";
const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/→/g, "->").replace(/−/g, "-").replace(/[^\x20-\xFF\n]/g, "");
const money = (v) => {
  if (v == null || !isFinite(v)) return "-";
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString("en-US")}`;
  return v < 0 ? `(${s})` : s;
};
const pct = (v) => (v == null || !isFinite(v) ? "-" : `${v.toFixed(1)}%`);
const x2 = (v) => (v == null || !isFinite(v) ? "-" : `${v.toFixed(2)}x`);
const val = (v, u) => (u === "$" ? money(v) : u === "%" ? pct(v) : u === "x" ? x2(v) : v == null ? "-" : String(Math.round(v)));
const usDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : iso || "-");

export async function quarterlyReportPdf(r, { letter = "", notes = "", covers = {}, issued = null, summary = null } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  const head = { fillColor: [30, 64, 120], textColor: 255, fontStyle: "bold" };
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 3 }, headStyles: head };
  const internal = r.kind === "internal";

  // Cover and letter
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 90, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(22).text(t(r.fund.name), M, 48);
  doc.setFont("helvetica", "normal").setFontSize(12).text(t(`Quarterly report · ${r.quarterLabel} (quarter ending ${usDate(r.qEnd)})${internal ? " · INTERNAL" : ""}`), M, 72);
  doc.setTextColor(30);
  doc.setFontSize(9).setTextColor(90).text(t(`${r.fund.type} · final close ${usDate(r.fund.finalClose)} · ${r.fund.termYears}-year term · commitments ${money(r.fund.commitments)}${issued ? ` · issued ${usDate(String(issued.at).slice(0, 10))}${issued.by ? ` by ${issued.by}` : ""} (v${issued.v})` : " · draft"}`), M, 112);
  doc.setTextColor(30).setFontSize(10);
  // Summary on top (11/24): watch list (internal only), change vs. last
  // quarter, issued reports.
  let y = 140;
  if (summary) {
    doc.setFont("helvetica", "bold").setFontSize(11).text("Summary", M, 132);
    doc.setFont("helvetica", "normal");
    const items = [];
    if (summary.watch) items.push(["Watch list (internal)", summary.watch.length ? `${summary.watch.length} asset${summary.watch.length === 1 ? "" : "s"} flagged: ${summary.watch.slice(0, 3).map((w) => `${w.name} (${w.score})`).join(", ")}` : "Nothing flagged"]);
    items.push([`Change vs. last quarter${summary.prevLabel ? ` (${summary.prevLabel})` : ""}`, summary.change ? (summary.moved.length ? summary.moved.map((c) => `${c.label} ${summaryChange(c)}`).join(" · ") : "No change") : "No prior quarter to compare with"]);
    items.push(["Issued reports", summary.issued.latest ? `${summary.issued.count} issued this quarter · latest v${summary.issued.latest.v} (${summary.issued.latest.kind}) ${usDate(String(summary.issued.latest.at).slice(0, 10))}` : "Draft (not issued)"]);
    autoTable(doc, { ...grid, startY: 138, body: items.map((x) => x.map(t)), columnStyles: { 0: { cellWidth: 170, fontStyle: "bold" } } });
    if (summary.change) {
      autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 6, styles: { fontSize: 7.5, cellPadding: 2 }, head: [["", ...summary.change.map((c) => c.label)]],
        body: [["Now", ...summary.change.map((c) => summaryValue(c.now, c.unit))], ["Last quarter", ...summary.change.map((c) => summaryValue(c.prev, c.unit))], ["Change", ...summary.change.map(summaryChange)]].map((row) => row.map(t)) });
    }
    y = doc.lastAutoTable.finalY + 22;
    doc.setFontSize(10);
  }
  const lines = doc.splitTextToSize(t(letter || ""), W - 2 * M);
  for (const ln of lines) { if (y > H - 50) { doc.addPage(); y = 50; } doc.text(ln, M, y); y += 13; }

  // Summary
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(14).text(t(`Fund summary · ${r.quarterLabel}`), M, 46);
  autoTable(doc, { ...grid, startY: 58, tableWidth: 220, head: [["Returns since inception", ""]],
    body: [["Net LP IRR", pct(r.returns.netIrr)], ["TVPI", x2(r.returns.tvpi)], ["DPI", x2(r.returns.dpi)], ["RVPI", x2(r.returns.rvpi)], ["Gross IRR", pct(r.returns.grossIrr)], ["Gross TVPI", x2(r.returns.grossTvpi)]].map((x) => x.map(t)) });
  autoTable(doc, { ...grid, startY: 58, margin: { left: M + 240, right: M }, tableWidth: 220, head: [["LP NAV movement", ""]],
    body: [["Start of quarter", money(r.nav.start)], ["Contributions", money(r.nav.contributions)], ["Distributions", money(-r.nav.distributions)], ["Change in value", money(r.nav.valueChange)], ["End of quarter", money(r.nav.end)], ["Gross asset value", money(r.nav.gav)]].map((x) => x.map(t)) });
  autoTable(doc, { ...grid, startY: 58, margin: { left: M + 480, right: M }, head: [["Capital and debt", ""]],
    body: [["Commitments", money(r.capital.commitments)], ["LP capital called", `${money(r.capital.called)} (${pct(r.capital.pctCalled)})`], ["LP distributions", money(r.capital.distributed)], ["Property debt", money(r.debt.total)], ["Loan to value", pct(r.debt.ltv)], ["Assets", `${r.fund.assets} · ${Math.round(r.fund.sf).toLocaleString("en-US")} SF`]].map((x) => x.map(t)) });
  let yy = doc.lastAutoTable.finalY + 10;
  if (r.returns.note) { doc.setFontSize(8).setTextColor(150, 80, 0).text(t(`Net returns not yet meaningful: ${r.returns.note}.`), M, yy + 4); doc.setTextColor(30); yy += 12; }
  autoTable(doc, { ...grid, startY: yy + 6, styles: { fontSize: 7.5, cellPadding: 2.5 },
    head: [["Asset", "Location", "SF", "Acquired", "Cost", "Value", "Basis", "Occupancy", "NOI (actual, ann.)", "NOI (plan, yr 1)", "Loan", "Maturity"]],
    body: r.portfolio.map((x) => [x.name, x.city, x.sf.toLocaleString("en-US"), usDate(x.acq), money(x.cost), money(x.value), x.basis, pct(x.occupancy), x.noiActual != null ? money(x.noiActual) : "-", money(x.noiPlan), money(x.loan), usDate(x.maturity)].map(t)) });

  if (r.plan) {
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(14).text(t(`Plan vs. actual (${r.plan.label}, frozen ${usDate(String(r.plan.at).slice(0, 10))})`), M, 46);
    autoTable(doc, { ...grid, startY: 58, tableWidth: 340, head: [["Since inception", "Plan", "Actual"]], body: r.plan.toDate.map((x) => [x.label, val(x.plan, x.unit), val(x.actual, x.unit)].map(t)) });
    autoTable(doc, { ...grid, startY: 58, margin: { left: 400, right: M }, head: [["Projected", "Plan", "Forecast", "Target"]], body: r.plan.projected.map((x) => [x.label, val(x.plan, x.unit), val(x.current, x.unit), val(x.target, x.unit)].map(t)) });
  }

  // Benchmarks (phase Y): returns vs. the indexes, vintage quartiles, PME.
  const bm = r.benchmarks;
  if (bm) {
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(14).text(t(`Benchmarks · ${r.quarterLabel}`), M, 46);
    autoTable(doc, { ...grid, startY: 58, head: [["Time-weighted return", "Fund", ...bm.indexKeys.map((k) => bm.indexLabels[k]), ...(bm.main ? ["Fund vs. " + bm.indexLabels[bm.main]] : [])]],
      body: bm.returns.map((x) => [x.label, pct(x.fund), ...bm.indexKeys.map((k) => pct(x.index[k])), ...(bm.main ? [x.index[bm.main] != null ? `${x.fund - x.index[bm.main] >= 0 ? "+" : ""}${(x.fund - x.index[bm.main]).toFixed(1)} pts` : "-"] : [])].map(t)) });
    if (bm.vintageRanks.length) {
      autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [[`Vintage ${bm.vintage} peers`, "Net IRR", "TVPI", "DPI"]],
        body: bm.vintageRanks.map((v) => [`${v.label}${v.strategy ? ` (${v.strategy})` : ""}`, ...["irr", "tvpi", "dpi"].map((m) => { const z = v.metrics[m]; return bm.netNm ? "n/m" : `${QUARTILE_SHORT[z.quartile] ?? "-"}${z.median != null ? ` (median ${m === "irr" ? pct(z.median) : x2(z.median)})` : ""}`; })].map(t)) });
    }
    if (bm.pme.length) {
      autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Public market equivalent (since inception)", "KS-PME", "Fund IRR", "Index-equivalent IRR", "Spread"]],
        body: bm.pme.map((x) => [x.label, x2(x.ks), pct(x.fundIrr), pct(x.indexIrr), x.spread != null ? `${x.spread >= 0 ? "+" : ""}${x.spread.toFixed(1)} pts` : "-"].map(t)) });
    }
    const src = bm.sources.map((x) => `${x.label}${x.source ? ` (${x.source})` : ""}`).join("; ");
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(110);
    doc.text(doc.splitTextToSize(t(`Fund returns are time-weighted at the property level (NCREIF method: income and appreciation on the quarter's average invested value), gross of fund fees. Quartiles compare the fund's net LP IRR, TVPI and DPI with its vintage year. KS-PME above 1.00x means the fund beat the index. Sources: ${src}.`), W - 2 * M), M, doc.lastAutoTable.finalY + 16);
    doc.setTextColor(30);
  }

  // A page per two assets
  r.portfolio.forEach((x, i) => {
    if (i % 2 === 0) doc.addPage();
    const top = i % 2 === 0 ? 40 : H / 2 + 6;
    const img = covers[x.id];
    const iw = 260, ih = img ? Math.min(195, (iw * img.h) / img.w) : 0;
    if (img) doc.addImage(img.dataUrl, "JPEG", M, top + 8, iw, ih);
    const tx = img ? M + iw + 20 : M;
    doc.setFont("helvetica", "bold").setFontSize(13).text(t(x.name), tx, top + 22);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90).text(t(`${x.city} · ${x.sf.toLocaleString("en-US")} SF · acquired ${usDate(x.acq)}`), tx, top + 36);
    doc.setTextColor(30);
    autoTable(doc, { ...grid, startY: top + 44, margin: { left: tx, right: M }, styles: { fontSize: 8, cellPadding: 2.5 },
      body: [
        ["Value", `${money(x.value)} (${x.basis}) · cost ${money(x.cost)} · ${x.unrealized >= 0 ? "+" : ""}${money(x.unrealized)}`],
        ["Occupancy", pct(x.occupancy)],
        ["NOI", `${x.noiActual != null ? `${money(x.noiActual)} actual (annualized, ${x.noiMonths} mo)` : "no actuals yet"} · plan ${money(x.noiPlan)}`],
        ["Business plan", x.planRev ? `Revision ${x.planRev}${x.recommendation ? ` · ${x.recommendation}` : ""}${x.lateMilestones ? ` · ${x.lateMilestones} milestone${x.lateMilestones > 1 ? "s" : ""} late` : ""}` : "No plan yet"],
        ["Debt", `${money(x.loan)}${x.lender ? ` · ${x.lender}` : ""}${x.spreadPct != null ? ` · SOFR + ${x.spreadPct.toFixed(2)}%` : ""}${x.maturity ? ` · matures ${usDate(x.maturity)}` : ""}`],
      ].map((row) => row.map(t)), columnStyles: { 0: { cellWidth: 80, fontStyle: "bold" } } });
  });

  if (internal && r.internal) {
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(14).text("Internal: underwritten vs. actual and budget variances", M, 46);
    autoTable(doc, { ...grid, startY: 58, head: [["Asset", "IRR underwritten", "IRR actual + projected", "Gap", "NOI var. (current year)"]],
      body: r.internal.uw.length ? r.internal.uw.map((x) => [x.name, pct(x.uwIrr), pct(x.irr), isFinite(x.gap) ? `${x.gap >= 0 ? "+" : ""}${x.gap.toFixed(2)} pts` : "-", isFinite(x.noiVarPct) ? `${x.noiVarPct.toFixed(1)}%` : "-"].map(t)) : [["No asset has a frozen baseline yet", "", "", "", ""]] });
    autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Asset", "Budget line (year to date)", "Budget", "Actual", "Variance", "Comment"]],
      body: r.internal.budget.length ? r.internal.budget.map((x) => [x.asset, x.line, money(x.current), money(x.actual), `${money(x.variance)}${isFinite(x.variancePct) ? ` (${x.variancePct.toFixed(1)}%)` : ""}`, x.comment].map(t)) : [["No flagged variances", "", "", "", "", ""]] });
    if ((r.internal.limits ?? []).length) {
      autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Fund limit", "Source", "Limit", "Actual", "Largest", "Status"]],
        body: r.internal.limits.map((l) => [l.label, `${l.source}${l.clause ? ` (${l.clause})` : ""}`, l.unit === "text" ? String(l.limit ?? "") : `${l.limit}${l.unit === "%" ? "%" : ` ${l.unit}`}`, l.actual == null ? "-" : `${l.actual.toFixed(1)}${l.unit === "%" ? "%" : ` ${l.unit}`}`, l.what, l.status].map(t)),
        didParseCell: (c) => { if (c.section === "body" && c.column.index === 5) { const st = r.internal.limits[c.row.index].status; c.cell.styles.textColor = st === "breached" ? [200, 30, 30] : st === "near" ? [180, 110, 0] : [40, 40, 40]; } } });
    }
    if (notes) {
      let ny = doc.lastAutoTable.finalY + 22;
      doc.setFont("helvetica", "bold").setFontSize(10).text("Internal notes", M, ny);
      doc.setFont("helvetica", "normal").setFontSize(9).text(doc.splitTextToSize(t(notes), W - 2 * M), M, (ny += 14));
    }
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(130).text(t(`Baywise · ${r.fund.name} · ${r.quarterLabel} quarterly report${internal ? " · INTERNAL - not for distribution" : ""} · page ${i} of ${n}`), M, H - 18);
  }
  doc.setProperties({ title: t(`${r.fund.name} ${r.quarterLabel} quarterly report${internal ? " (internal)" : ""}`), creator: "Baywise" });
  return doc.output("blob");
}
