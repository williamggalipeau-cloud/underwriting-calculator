// Phase R: the Leasing tab as a PDF (pipeline vs. plan, and rent comps with stats).
import { RENT_COMP_FIELDS, netEffective, rentCompStats, stageLabel, vsPlan } from "@/lib/leasing";

const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
const ps = (v) => (v == null || !Number.isFinite(v) ? "-" : `$${v.toFixed(2)}`);
const pc = (v) => (v == null || !Number.isFinite(v) ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const d = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "-");

// rows: allProspects() output; comps: rent comps (with optional asset).
export async function leasingPdf({ title, rows, comps = [], todayISO }) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 64, 120).rect(0, 0, W, 56, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(16).text(t(`Leasing: ${title}`), 36, 30);
  doc.setFont("helvetica", "normal").setFontSize(9).text(t(`${rows.length} prospect${rows.length === 1 ? "" : "s"} · ${comps.length} rent comp${comps.length === 1 ? "" : "s"} · as of ${d(todayISO)}`), 36, 46);
  doc.setTextColor(30);
  const grid = { theme: "grid", styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [235, 240, 248], textColor: 40 }, margin: { left: 36, right: 36 } };
  doc.setFont("helvetica", "bold").setFontSize(10).text("Leasing pipeline", 36, 74);
  autoTable(doc, {
    ...grid, startY: 80,
    head: [["Asset", "Unit", "Prospect / tenant", "Kind", "Stage", "SF", "Proposed", "Term", "Free", "TI/SF", "Net effective", "Start", "vs. plan rent", "Downtime / plan", "Next step"]],
    body: rows.map((x) => {
      const p = x.p, v = vsPlan(x.inputs, p, todayISO), u = (x.inputs.units ?? []).find((z) => z.id === p.unitId);
      return [x.asset, u?.name ?? "", p.tenant, p.kind === "renewal" ? "Renewal" : "New", `${stageLabel(p.stage)}${p.lostReason ? ` (${p.lostReason})` : ""}`, p.sf ?? "", ps(p.proposedRentPSF ?? p.askingRentPSF), p.termMonths ?? "", p.freeMonths ?? "", ps(p.tiPSF), ps(netEffective(p)), d(p.expectedStart), v ? `${pc(v.rentVsPct)} (plan ${ps(v.targetRentPSF)})` : "no plan", v?.downtime != null ? `${v.downtime} / ${v.targetDowntime ?? "-"} mo` : "-", `${p.nextStep ?? ""}${p.nextDate ? ` ${d(p.nextDate)}` : ""}`].map((c) => t(String(c)));
    }),
  });
  if (comps.length) {
    const y = doc.lastAutoTable.finalY + 18;
    const st = rentCompStats(comps);
    doc.setFont("helvetica", "bold").setFontSize(10).text("Rent comps", 36, y);
    if (st) doc.setFont("helvetica", "normal").setFontSize(8).text(t(`${st.count} used: average ${ps(st.avg)} (SF-weighted), median ${ps(st.median)}, range ${ps(st.low)} - ${ps(st.high)}${st.netEffectiveAvg != null ? `, net effective ${ps(st.netEffectiveAvg)}` : ""}`), 120, y);
    autoTable(doc, {
      ...grid, startY: y + 6,
      head: [["Asset", ...RENT_COMP_FIELDS.map((f) => f.label), "Net effective", "Used"]],
      body: comps.map((c) => [c.asset ?? "", ...RENT_COMP_FIELDS.map((f) => (f.key === "rentPSF" || f.key === "tiPSF" ? ps(c[f.key]) : f.key === "signDate" ? d(c.signDate) : c[f.key] ?? "")), ps(netEffective({ askingRentPSF: c.rentPSF, termMonths: c.termMonths, freeMonths: c.freeMonths, tiPSF: c.tiPSF })), c.include === false ? "No" : "Yes"].map((v) => t(String(v)))),
    });
  }
  doc.setFontSize(6.5).setTextColor(130).text(t("Baywise · net effective = rent over the term (with escalations) less free rent and TI, per year. Plan = the latest business plan revision's leasing row."), 36, doc.internal.pageSize.getHeight() - 18);
  doc.setProperties({ title: `Leasing ${title}`, creator: "Baywise" });
  return doc.output("blob");
}
