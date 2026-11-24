// Phase P: Assets for Sale and Track Record as PDFs (landscape letter).
import { offersCompared, reasonLabel, saleSubject, stageLabel, trackTotals } from "@/lib/dispositions";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[→]/g, "->").replace(/[^\x20-\xFF\n]/g, "");
const m = (v) => (v == null || !Number.isFinite(Number(v)) ? "-" : `$${Math.round(Number(v)).toLocaleString("en-US")}`);
const p = (v, d = 1) => (v == null || !Number.isFinite(v) ? "-" : `${v.toFixed(d)}%`);
const d = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "-");

async function start(title, sub) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(title), 36, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(sub), 36, 46);
  doc.setTextColor(30);
  return { doc, autoTable, W };
}
const grid = { theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [235, 240, 248], textColor: 40 } };

// rows: [{ asset, fund, inputs, sale }] (active sales).
export async function salesPdf(rows, { todayISO, scopeName = "" } = {}) {
  const { doc, autoTable } = await start("Assets for Sale", `${scopeName || "All portfolios"} · ${rows.length} active sale${rows.length === 1 ? "" : "s"} · as of ${d(todayISO)}`);
  autoTable(doc, {
    ...grid, startY: 70, margin: { left: 36, right: 36 },
    head: [["Asset", "Sold", "Stage", "Reason", "Target", "Target close", "Broker", "Call for offers", "PSA", "Hard date", "Closing", "Offers", "Best net"]],
    body: rows.map((x) => {
      const s = x.sale, sub = saleSubject(x.inputs, s), offers = offersCompared(x.inputs, s, { todayISO });
      return [x.asset, s.scope === "partial" ? `Part (${Math.round(sub.sf).toLocaleString("en-US")} SF)` : "Whole", stageLabel(s.stage), reasonLabel(s.reason), m(s.targetPrice), d(s.targetClose), s.brokerChosen || "-", d(s.marketing?.callForOffers), d(s.contract?.psaDate), d(s.contract?.hardDate), d(s.contract?.closingDate), String(offers.length), m(offers[0]?.net)].map(t);
    }),
  });
  for (const x of rows) {
    const offers = offersCompared(x.inputs, x.sale, { todayISO });
    if (!offers.length) continue;
    const y = doc.lastAutoTable.finalY + 16;
    doc.setFont("helvetica", "bold").setFontSize(9).text(t(`${x.asset}: offers side by side`), 36, y);
    autoTable(doc, {
      ...grid, startY: y + 5, margin: { left: 36, right: 36 },
      head: [["Buyer", "Type", "Round", "Date", "Price", "$/SF", "Cap", "Deposit", "DD days", "Close days", "Financing", "Selling costs", "Loan payoff", "Net proceeds", "Selected"]],
      body: offers.map((o) => [o.buyer || "-", o.buyerType, o.round === "best_final" ? "Best and final" : o.round === "initial" ? "Initial" : "Other", d(o.date), m(o.price), o.psf ? `$${o.psf.toFixed(0)}` : "-", p(o.capPct, 2), m(o.deposit), o.ddDays ?? "-", o.closingDays ?? "-", o.financingContingency ? "Yes" : "No", m(o.costs), m(o.payoff), m(o.net), o.selected ? "Yes" : ""].map((v) => t(String(v)))),
    });
  }
  doc.setFontSize(6.5).setTextColor(130).text(t("Baywise · net proceeds = price - selling costs (model %) - loan payoff (model balance at the closing or target date; a partial sale's share by SF)."), 36, doc.internal.pageSize.getHeight() - 18);
  doc.setProperties({ title: "Assets for Sale", creator: "Baywise" });
  return doc.output("blob");
}

// rows: trackRecord() output.
export async function trackPdf(rows, { todayISO, scopeName = "" } = {}) {
  const { doc, autoTable } = await start("Track Record", `${scopeName || "All portfolios"} · ${rows.length} closed sale${rows.length === 1 ? "" : "s"} · as of ${d(todayISO)}`);
  autoTable(doc, {
    ...grid, startY: 70, margin: { left: 36, right: 36 },
    head: [["Asset", "Fund", "Bought", "Purchase", "Sold", "Sale price", "Net proceeds", "Hold", "IRR", "UW IRR", "Multiple", "UW multiple", "Profit", "vs. last mark"]],
    body: rows.map((r) => [r.partial ? `${r.asset} (part, ${Math.round(r.sf).toLocaleString("en-US")} SF)` : r.asset, r.fund, d(r.purchaseDate), m(r.purchasePrice), d(r.saleDate), m(r.salePrice), m(r.netProceeds), r.holdYears != null ? `${r.holdYears.toFixed(1)} yr` : "-", p(r.irr), p(r.uw?.irr), Number.isFinite(r.multiple) ? `${r.multiple.toFixed(2)}x` : "-", Number.isFinite(r.uw?.multiple) ? `${r.uw.multiple.toFixed(2)}x` : "-", m(r.profit), r.vsMarkPct != null ? `${r.vsMarkPct >= 0 ? "+" : ""}${r.vsMarkPct.toFixed(1)}%` : "no mark"].map(t)),
  });
  autoTable(doc, {
    ...grid, startY: doc.lastAutoTable.finalY + 14, margin: { left: 36 }, tableWidth: 420,
    head: [["Totals", "Sales", "Purchase", "Sale", "Net proceeds", "Profit"]],
    body: trackTotals(rows).map((x) => [x.key, String(x.sales), m(x.purchase), m(x.sale), m(x.net), m(x.profit)].map(t)),
  });
  doc.setFontSize(6.5).setTextColor(130).text(t("Baywise · UW = the frozen acquisition underwriting when there is one; partial sales cover the part sold."), 36, doc.internal.pageSize.getHeight() - 18);
  doc.setProperties({ title: "Track Record", creator: "Baywise" });
  return doc.output("blob");
}
