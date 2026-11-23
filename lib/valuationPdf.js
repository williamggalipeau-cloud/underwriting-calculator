// PDF summary of quarter-over-quarter valuation adjustments (Valuations tab).
// jsPDF is loaded only when the user exports.
import { quarterLabel } from "@/lib/valuations";

const money = (n) => {
  if (n == null || !isFinite(n)) return "—";
  const s = `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
  return n < 0 ? `(${s})` : s;
};
const signedMoney = (n) => (n == null || !isFinite(n) ? "—" : n > 0 ? `+${money(n)}` : money(n));
const pct = (n, d = 2) => (n == null || !isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(d)}%`);
const plainPct = (n, d = 2) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(d)}%`);
const BASIS = { appraisal: "Appraisal", internal: "Internal mark", rollforward: "Roll-forward", cost: "Cost" };
const usDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
};

// valuation: fundValuation(); trend: valueTrend(); returns a PDF Blob.
// impact: valuationImpact() for the same quarters (optional).
export async function valueTrendPdf(valuation, trend, { fundName, fundType = "Fund", todayISO = new Date().toISOString().slice(0, 10), impact = null } = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 36;
  const qs = trend.quarters;
  const asOf = qs.at(-1);

  doc.setFont("helvetica", "bold").setFontSize(15).text(`${fundName} — Quarterly valuation adjustments`, M, 44);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(`${fundType} · Quarters ${quarterLabel(qs[0])} to ${quarterLabel(asOf)} (as of ${usDate(asOf)}) · prepared ${usDate(todayISO)}`, M, 60);

  // Fund summary
  const last = trend.fund.at(-1);
  autoTable(doc, {
    startY: 72,
    margin: { left: M, right: M },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" },
    head: [["Fund", ...qs.map(quarterLabel)]],
    body: [
      ["Gross asset value", ...trend.fund.map((f) => money(f.value))],
      ["Change vs prior quarter ($)", ...trend.fund.map((f) => signedMoney(f.change))],
      ["Change vs prior quarter (%)", ...trend.fund.map((f) => pct(f.changePct))],
      ["Same-store change (%)", ...trend.fund.map((f) => pct(f.sameStorePct))],
    ],
    columnStyles: Object.fromEntries(qs.map((_, i) => [i + 1, { halign: "right" }])),
  });
  doc.setFontSize(8).setTextColor(90);
  doc.text(
    `Fund exit cap (plan, value-weighted): ${plainPct(trend.fundExitCapPct)}. Same-store counts only assets valued in both quarters; the total also reflects acquisitions and sales. Latest quarter: ${signedMoney(last.change)} (${pct(last.changePct)}).`,
    M,
    doc.lastAutoTable.finalY + 12,
    { maxWidth: W - 2 * M }
  );

  // By asset: value and change each quarter
  const head = [["Asset", ...qs.flatMap((q) => [`${quarterLabel(q)} value`, "Change $", "Change %"]), "Exit cap (plan)", "Implied cap now"]];
  const body = trend.assets.map((a) => [
    a.name,
    ...a.cells.flatMap((c) =>
      !c ? ["—", "", ""] : c.acquired ? [money(c.value), "Acquired", ""] : [money(c.value), signedMoney(c.change), pct(c.changePct)]
    ),
    plainPct(a.exitCapPct),
    plainPct(a.impliedCap),
  ]);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 30,
    margin: { left: M, right: M },
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 2.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    head,
    body,
    columnStyles: Object.fromEntries(Array.from({ length: qs.length * 3 + 2 }, (_, i) => [i + 1, { halign: "right" }])),
    didParseCell: (d) => {
      if (d.section !== "body" || d.column.index === 0) return;
      const t = String(d.cell.raw);
      if (t.startsWith("+")) d.cell.styles.textColor = [4, 120, 87];
      else if (t.startsWith("(") || t.startsWith("-")) d.cell.styles.textColor = [220, 38, 38];
    },
  });

  // Adjustment detail: every quarter whose value changed, with its basis and support.
  const detail = [];
  for (const a of trend.assets) {
    const va = valuation.assets.find((x) => x.id === a.id);
    a.cells.forEach((c, i) => {
      if (!c || c.acquired || !c.change) return;
      const m = va?.byQuarter.get(qs[i])?.mark ?? {};
      const support = [m.appraiser, m.capRate ? `cap ${m.capRate}%` : "", m.capex ? `capex ${money(Number(m.capex))}` : "", m.notes]
        .filter(Boolean)
        .join(" · ");
      detail.push([a.name, quarterLabel(qs[i]), money(c.value - c.change), money(c.value), signedMoney(c.change), pct(c.changePct), BASIS[c.basis] ?? c.basis, support || "—"]);
    });
  }
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(30);
  let y = doc.lastAutoTable.finalY + 26;
  if (y > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage();
    y = 44;
  }
  doc.text("Adjustment detail", M, y);
  autoTable(doc, {
    startY: y + 6,
    margin: { left: M, right: M },
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" },
    head: [["Asset", "Quarter", "Prior value", "New value", "Change $", "Change %", "Basis", "Support (appraiser, cap rate, capex, notes)"]],
    body: detail.length ? detail : [["No value changes in these quarters", "", "", "", "", "", "", ""]],
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });

  // Effect of the adjustments on returns (with vs. without each quarter's adjustments)
  if (impact?.some((x) => x.adjusted.length)) {
    const irrTxt = (n, years) => (years < 1 ? "n/m" : plainPct(n, 1));
    const ppTxt = (a, b, years) => (years < 1 || !isFinite(a) || !isFinite(b) ? "—" : `${a - b >= 0 ? "+" : ""}${(a - b).toFixed(2)} pts`);
    const xTxt = (n) => (n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`);
    const dx = (a, b) => (!isFinite(a) || !isFinite(b) ? "—" : `${a - b >= 0 ? "+" : ""}${(a - b).toFixed(3)}x`);
    const pair = (w, wo, f) => `${f(wo)} / ${f(w)}`;
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(30).text("Effect of valuation adjustments on returns", M, 44);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(90);
    doc.text(
      "Each quarter compares returns with the adjustments against carrying each adjusted asset at its prior-quarter value plus capex (shown as without / with). Returns are interim, using NAV as the ending value. Valuations don't change cash, so cash-on-cash on invested equity is the same either way; the cash yield on current equity value (trailing-12-month distributions ÷ equity NAV) does change.",
      M, 58, { maxWidth: W - 2 * M }
    );
    let y2 = 84;
    for (const x of impact.filter((i) => i.adjusted.length)) {
      const rows = x.assets.map((a) => [
        a.name,
        signedMoney(a.adjustment),
        pct(a.adjustmentPct),
        pair(a.with.irr, a.without.irr, (n) => irrTxt(n, a.yearsHeld)),
        ppTxt(a.with.irr, a.without.irr, a.yearsHeld),
        pair(a.with.multiple, a.without.multiple, xTxt),
        dx(a.with.multiple, a.without.multiple),
        plainPct(a.with.cocOnEquity),
        pair(a.with.yieldOnNav, a.without.yieldOnNav, (n) => plainPct(n)),
      ]);
      const f = x.fund;
      rows.push([
        "Fund (gross, asset level)",
        signedMoney(x.totalAdjustment),
        pct((x.totalAdjustment / (f.without.nav || NaN)) * 100),
        pair(f.with.irr, f.without.irr, (n) => irrTxt(n, f.yearsSinceFirstCall)),
        ppTxt(f.with.irr, f.without.irr, f.yearsSinceFirstCall),
        pair(f.with.multiple, f.without.multiple, xTxt),
        dx(f.with.multiple, f.without.multiple),
        plainPct(f.with.cocOnEquity),
        pair(f.with.yieldOnNav, f.without.yieldOnNav, (n) => plainPct(n)),
      ]);
      rows.push([
        "Fund (net LP)",
        "",
        "",
        isFinite(f.with.netIrr) ? pair(f.with.netIrr, f.without.netIrr, (n) => irrTxt(n, f.yearsSinceFirstCall)) : "n/m",
        ppTxt(f.with.netIrr, f.without.netIrr, f.yearsSinceFirstCall),
        isFinite(f.with.netMultiple) ? pair(f.with.netMultiple, f.without.netMultiple, xTxt) : "n/m",
        dx(f.with.netMultiple, f.without.netMultiple),
        "",
        "",
      ]);
      if (y2 > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y2 = 44; }
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(30).text(quarterLabel(x.quarterEnd), M, y2);
      autoTable(doc, {
        startY: y2 + 5,
        margin: { left: M, right: M },
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 2.5 },
        headStyles: { fillColor: [243, 244, 246], textColor: 40, fontStyle: "bold" },
        head: [["Asset", "Adjustment $", "Adj. %", "Interim IRR (without / with)", "IRR change", "Equity multiple (without / with)", "Multiple change", "Cash-on-cash (T12, on equity)", "Cash yield on equity NAV (without / with)"]],
        body: rows,
        columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [i, { halign: "right" }])),
        didParseCell: (d) => {
          if (d.section === "body" && d.row.index >= rows.length - 2) d.cell.styles.fontStyle = "bold";
          if (d.section !== "body" || ![1, 2, 4, 6].includes(d.column.index)) return;
          const t = String(d.cell.raw);
          if (t.startsWith("+")) d.cell.styles.textColor = [4, 120, 87];
          else if (t.startsWith("(") || t.startsWith("-")) d.cell.styles.textColor = [220, 38, 38];
        },
      });
      y2 = doc.lastAutoTable.finalY + 22;
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(130);
    const H = doc.internal.pageSize.getHeight();
    doc.text(
      "Values: entered appraisal or internal mark, otherwise the last mark rolled forward plus capex; assets are held at cost in the acquisition quarter and the first 6 months. Change is versus the prior quarter's fair value.",
      M,
      H - 22,
      { maxWidth: W - 2 * M - 60 }
    );
    doc.text(`Baywise · Page ${p} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  return doc.output("blob");
}
