// ─── Phase M: pipeline report ────────────────────────────────────────────────
// A summary of a fund's pipeline (the Pipeline tab's active deals targeting
// the fund), exported as PDF and Excel and saved as dated versions
// (pipeline.reports).
//   summary    deals, price, SF, equity and debt needed: by stage and
//              probability-weighted
//   closings   expected closings by quarter (equity, weighted) against the
//              fund's dry powder and sub line room
//   combined   the whole pipeline's effect on the fund (owned assets as the
//              base; deals screened into the app only), and limits breached
//   top 10     ranked by price (default), deal IRR, equity, expected close or
//              fund net IRR impact; each with a one-paragraph summary
//   rest       the other active deals

import { underwrite } from "@/lib/calculations";
import { ACTIVE_STAGES, derived, stageLabel } from "@/lib/pipeline";
import { fundImpact } from "@/lib/fundImpact";
import { quarterKey } from "@/lib/fundTimeline";

export const RANKS = [
  ["price", "Price"],
  ["irr", "Deal IRR"],
  ["equity", "Equity required"],
  ["close", "Expected close"],
  ["impact", "Fund net IRR impact"],
];
const DEFAULT_LTV = 0.65; // equity estimate for deals not yet screened

export function pipelineReport(pipeline, deals, terms, { todayISO, curve, rankBy = "price" } = {}) {
  const active = (pipeline?.deals ?? []).filter((d) => ACTIVE_STAGES.includes(d.stage) && (!terms.name || d.targetFund === terms.name));
  const owned = deals.filter((d) => d.inputs.fundName?.trim() === terms.name && (d.inputs.acquisitionDate || terms.finalClose) <= todayISO);
  const rows = active.map((p) => {
    const deal = p.dealId ? deals.find((d) => d.id === p.dealId) : null;
    let r = null;
    if (deal) { try { r = underwrite(deal.inputs); } catch { r = null; } }
    const price = deal?.inputs?.purchasePrice ?? p.askingPrice ?? 0;
    const equity = r?.debt?.equityRequired ?? price * (1 - DEFAULT_LTV);
    const debt = r?.debt?.loanAmount ?? price * DEFAULT_LTV;
    const x = derived(p);
    let impact = null;
    if (deal) { try { impact = fundImpact(owned, terms, [deal], { todayISO, curve, base: "owned" }).change.netLpIrr; } catch { impact = null; } }
    const prob = (p.probabilityPct ?? 0) / 100;
    return {
      id: p.id,
      name: p.name,
      market: p.market || [p.city, p.state].filter(Boolean).join(", "),
      sf: p.sf ?? deal?.inputs?.squareFootage ?? null,
      price,
      psf: price && (p.sf ?? deal?.inputs?.squareFootage) ? price / (p.sf ?? deal.inputs.squareFootage) : x.psf,
      goingInCap: r ? ((r.annualCashFlows[0]?.noi ?? 0) / price) * 100 : x.cap,
      exitCap: deal?.inputs?.exitCapRatePct ?? null,
      irr: r?.returns?.irr ?? null,
      em: r?.returns?.equityMultiple ?? null,
      coc: r?.returns?.yearOneCashOnCash ?? null,
      equity,
      debt,
      stage: p.stage,
      stageLabel: stageLabel(p.stage),
      probabilityPct: p.probabilityPct ?? 0,
      expectedClose: p.expectedClose || deal?.inputs?.acquisitionDate || "",
      impact,
      screened: !!deal,
      seller: p.seller,
      source: p.source,
      notes: p.notes,
      prob,
    };
  });

  const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) ?? 0), 0);
  const byStage = ACTIVE_STAGES.map((k) => {
    const xs = rows.filter((r) => r.stage === k);
    return { stage: k, label: stageLabel(k), count: xs.length, price: sum(xs, (r) => r.price), sf: sum(xs, (r) => r.sf), equity: sum(xs, (r) => r.equity), debt: sum(xs, (r) => r.debt), weightedEquity: sum(xs, (r) => r.equity * r.prob) };
  });
  const totals = { count: rows.length, price: sum(rows, (r) => r.price), sf: sum(rows, (r) => r.sf), equity: sum(rows, (r) => r.equity), debt: sum(rows, (r) => r.debt), weightedPrice: sum(rows, (r) => r.price * r.prob), weightedEquity: sum(rows, (r) => r.equity * r.prob) };

  // Expected closings by quarter vs. capital available.
  const commitments = Number(terms.targetEquity) || 0;
  const ownedEquity = owned.reduce((s, d) => { try { return s + (underwrite(d.inputs).debt?.equityRequired ?? 0); } catch { return s; } }, 0);
  const dryPowder = commitments > 0 ? commitments - ownedEquity : null;
  const lineSize = terms.subLineEnabled !== false ? commitments * ((terms.subLineSizePct ?? 0) / 100) : 0;
  const qmap = new Map();
  for (const r of rows.filter((x) => x.expectedClose)) {
    const k = quarterKey(r.expectedClose);
    const q = qmap.get(k) ?? { quarter: k, count: 0, equity: 0, weightedEquity: 0 };
    q.count++; q.equity += r.equity; q.weightedEquity += r.equity * r.prob;
    qmap.set(k, q);
  }
  let cum = 0, cumW = 0;
  const closings = [...qmap.values()].sort((a, b) => (a.quarter < b.quarter ? -1 : 1)).map((q) => {
    cum += q.equity; cumW += q.weightedEquity;
    return { ...q, cumEquity: cum, cumWeighted: cumW, enough: dryPowder == null ? null : cum <= dryPowder, enoughWeighted: dryPowder == null ? null : cumW <= dryPowder };
  });

  // Combined effect: every screened pipeline deal at once.
  const screened = rows.filter((r) => r.screened).map((r) => deals.find((d) => d.id === active.find((p) => p.id === r.id).dealId));
  let combined = null;
  if (screened.length) { try { combined = fundImpact(owned, terms, screened, { todayISO, curve, base: "owned" }); } catch { combined = null; } }

  const key = { price: (r) => -(r.price ?? 0), irr: (r) => -(r.irr ?? -Infinity), equity: (r) => -(r.equity ?? 0), close: (r) => r.expectedClose || "9999", impact: (r) => -(r.impact ?? -Infinity) }[rankBy] ?? ((r) => -(r.price ?? 0));
  const ranked = [...rows].sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
  const top = ranked.slice(0, 10).map((r) => ({ ...r, summary: summaryOf(r) }));
  return { fund: terms.name, asOf: todayISO, rankBy, totals, byStage, closings, dryPowder, lineSize, combined, top, rest: ranked.slice(10) };
}

const m = (v) => (v == null || !isFinite(v) ? "n/a" : `$${(v / 1e6).toFixed(1)}M`);
const p = (v) => (v == null || !isFinite(v) ? "n/a" : `${v.toFixed(1)}%`);
function summaryOf(r) {
  const parts = [`${r.name}${r.market ? ` (${r.market})` : ""}: ${r.sf ? `${Math.round(r.sf).toLocaleString("en-US")} SF ` : ""}at ${m(r.price)}${r.psf ? ` ($${Math.round(r.psf)}/SF)` : ""}, ${r.stageLabel.toLowerCase()}, ${r.probabilityPct}% likely${r.expectedClose ? `, expected to close ${r.expectedClose}` : ""}.`];
  if (r.screened) parts.push(`Screened at a ${p(r.irr)} deal IRR and ${r.em?.toFixed(2) ?? "n/a"}x multiple, ${p(r.goingInCap)} going-in cap${r.exitCap ? ` and ${p(r.exitCap)} exit cap` : ""}; needs ${m(r.equity)} of equity.${r.impact != null ? ` Changes fund net LP IRR by ${r.impact >= 0 ? "+" : ""}${r.impact.toFixed(2)} pts.` : ""}`);
  else parts.push(`Not screened yet; equity of about ${m(r.equity)} at 65% leverage.`);
  const risks = [];
  if (r.goingInCap != null && r.exitCap != null && r.exitCap < r.goingInCap) risks.push("exit cap below the going-in cap");
  if (r.probabilityPct < 30) risks.push("early stage");
  if (r.impact != null && r.impact < 0) risks.push("dilutes fund returns");
  if (risks.length) parts.push(`Key risks: ${risks.join(", ")}.`);
  if (r.notes) parts.push(`Note: ${r.notes}`);
  return parts.join(" ");
}

export function pipelineReportXlsx(rep) {
  return [
    [`${rep.fund}: pipeline report as of ${rep.asOf}`],
    [],
    ["Stage", "Deals", "Price", "SF", "Equity", "Debt", "Weighted equity"],
    ...rep.byStage.map((s) => [s.label, s.count, s.price, s.sf, s.equity, s.debt, s.weightedEquity]),
    ["Total", rep.totals.count, rep.totals.price, rep.totals.sf, rep.totals.equity, rep.totals.debt, rep.totals.weightedEquity],
    [],
    ["Expected closings", "Deals", "Equity", "Cumulative", "Cumulative weighted", `Dry powder ${rep.dryPowder ?? "n/a"}`],
    ...rep.closings.map((q) => [q.quarter, q.count, q.equity, q.cumEquity, q.cumWeighted, q.enough === false ? "short" : "ok"]),
    [],
    ...(rep.combined ? [["Whole pipeline (screened deals)", "Without", "With", "Change"], ["Net LP IRR %", rep.combined.without.returns.netLpIrr, rep.combined.with.returns.netLpIrr, rep.combined.change.netLpIrr], ["Net LP multiple", rep.combined.without.returns.netLpTvpi, rep.combined.with.returns.netLpTvpi, rep.combined.change.netLpTvpi], ["New limit breaches", rep.combined.newBreaches.map((l) => l.label).join(", ") || "none"], []] : []),
    [`Top 10 by ${RANKS.find(([k]) => k === rep.rankBy)?.[1] ?? "price"}`, "Market", "SF", "Price", "$/SF", "Going-in cap %", "Exit cap %", "Deal IRR %", "Multiple", "Cash-on-cash %", "Equity", "Stage", "Probability %", "Expected close", "Fund net IRR change (pts)", "Summary"],
    ...rep.top.map((r) => [r.name, r.market, r.sf, r.price, r.psf, r.goingInCap, r.exitCap, r.irr, r.em, r.coc, r.equity, r.stageLabel, r.probabilityPct, r.expectedClose, r.impact, r.summary]),
    ...(rep.rest.length ? [[], ["Rest of the pipeline", "Market", "Price", "Stage", "Expected close"], ...rep.rest.map((r) => [r.name, r.market, r.price, r.stageLabel, r.expectedClose])] : []),
  ];
}

export async function pipelineReportPdf(rep) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const t = (s) => String(s ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\xFF\n]/g, "");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const M = 40;
  const grid = { margin: { left: M, right: M }, theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: [30, 64, 120], textColor: 255 } };
  doc.setFont("helvetica", "bold").setFontSize(16).text(t(`${rep.fund} - Pipeline report`), M, 46);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90).text(t(`As of ${rep.asOf} · ${rep.totals.count} active deals · ${m(rep.totals.price)} total, ${m(rep.totals.weightedPrice)} probability-weighted · Baywise`), M, 62);
  doc.setTextColor(30);
  autoTable(doc, { ...grid, startY: 72, tableWidth: 360, head: [["Stage", "Deals", "Price", "Equity", "Weighted equity"]], body: [...rep.byStage.map((s) => [s.label, s.count, m(s.price), m(s.equity), m(s.weightedEquity)]), ["Total", rep.totals.count, m(rep.totals.price), m(rep.totals.equity), m(rep.totals.weightedEquity)]].map((r) => r.map(t)) });
  autoTable(doc, { ...grid, startY: 72, margin: { left: 420, right: M }, head: [["Closing quarter", "Deals", "Equity", "Cumulative", `vs. dry powder ${m(rep.dryPowder)}`]], body: rep.closings.length ? rep.closings.map((q) => [q.quarter, q.count, m(q.equity), m(q.cumEquity), q.enough === false ? "SHORT" : q.enoughWeighted === false ? "short if weighted" : "ok"].map(t)) : [["No expected closings", "", "", "", ""]] });
  let y = doc.lastAutoTable.finalY + 14;
  if (rep.combined) {
    doc.setFontSize(9).text(t(`Whole pipeline (screened deals): fund net LP IRR ${p(rep.combined.without.returns.netLpIrr)} -> ${p(rep.combined.with.returns.netLpIrr)}; multiple ${rep.combined.without.returns.netLpTvpi?.toFixed(2)}x -> ${rep.combined.with.returns.netLpTvpi?.toFixed(2)}x; new limit breaches: ${rep.combined.newBreaches.map((l) => l.label).join(", ") || "none"}.`), M, y + 6, { maxWidth: 700 });
    y += 20;
  }
  autoTable(doc, { ...grid, startY: y + 6, head: [[`Top 10 by ${RANKS.find(([k]) => k === rep.rankBy)?.[1]}`, "Market", "SF", "Price", "$/SF", "In cap", "Exit cap", "IRR", "Multiple", "Equity", "Stage", "Prob.", "Close", "Fund IRR"]],
    body: rep.top.map((r) => [r.name, r.market, r.sf ? Math.round(r.sf).toLocaleString("en-US") : "-", m(r.price), r.psf ? `$${Math.round(r.psf)}` : "-", p(r.goingInCap), p(r.exitCap), p(r.irr), r.em ? `${r.em.toFixed(2)}x` : "-", m(r.equity), r.stageLabel, `${r.probabilityPct}%`, r.expectedClose || "-", r.impact != null ? `${r.impact >= 0 ? "+" : ""}${r.impact.toFixed(2)}` : "-"].map(t)) });
  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(12).text("Top 10: summaries", M, 46);
  autoTable(doc, { ...grid, startY: 56, styles: { fontSize: 8, cellPadding: 3 }, body: rep.top.map((r, i) => [`${i + 1}. ${r.name}`, r.summary].map(t)), columnStyles: { 0: { cellWidth: 140, fontStyle: "bold" } } });
  if (rep.rest.length) autoTable(doc, { ...grid, startY: doc.lastAutoTable.finalY + 14, head: [["Rest of the pipeline", "Market", "Price", "Stage", "Close"]], body: rep.rest.map((r) => [r.name, r.market, m(r.price), r.stageLabel, r.expectedClose || "-"].map(t)) });
  return doc.output("blob");
}
