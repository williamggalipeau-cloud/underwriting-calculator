// Sample data → tenant credit and aged rent (user, 11/26, 1.1.8): fictional
// credit records, a credit-change flag, prospect screenings and a Yardi-style
// aged receivables report for the Model Fund I sample assets, so the Tenant
// Credit tab and the risk report's Tenant Credit and Aged Rent sections show
// something. Loaded by Load Model Fund I.
//
// The stories (largest-rent tenant of each asset):
//   Harbor Light Industrial: D&B Paydex 74 (passes), then a credit-change flag
//     (lost its largest customer) and rent 60+ days late → Weak.
//   Airport Flex Park: screening app report, consumer score 612 (below 650),
//     approved with conditions, issues noted → Weak.
//   Ridgeway Trade Center: our own assessment "Weak" → Weak.
//   Southpoint Flex: rent 91–180 days late → Weak.
//   Granite Ave Industrial: its largest tenant has no credit record → Missing;
//     another tenant 1–30 days late.
//   Every other occupied unit: a clean screening (approved, consumer 690–760).
// Deterministic for a given date. Earlier sample entries are replaced; a
// user's own records, flags and aged receivables uploads are kept.
import { creditOf } from "@/lib/creditReview";

export const SAMPLE_CREDIT_BY = "Sample data (fictional)";
export const SAMPLE_AGED_FILE = "Sample aged receivables (fictional)";
const rentOf = (u) => (u.leaseStatus === "occupied" ? (Number(u.currentRentPSF) || 0) * (Number(u.squareFeet) || 0) : 0);
const r0 = (x) => Math.round(x);
const monthEnd = (iso, back) => { const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const num = (id) => Number(String(id).replace(/\D+/g, "")) || 0;

const rec = (o) => ({ id: `sample-cr-${o.key}`, kind: o.source === "own" ? "assessment" : "screening", tenant: o.tenant, source: o.source, provider: o.provider ?? "", reportDate: o.date ?? "", date: o.date ?? "", scoreType: o.scoreType ?? "", score: o.score ?? null, rating: o.rating ?? "", result: o.result ?? "", issues: o.issues ?? "", conditions: o.conditions ?? "", basis: o.basis ?? "", by: SAMPLE_CREDIT_BY, at: `${o.date}T12:00:00.000Z` });

// { updates: { dealId: { units, leasing? } }, delinquency: { [fundName]: … } | null, counts }
export function addSampleCredit(deals, { todayISO, funds = {}, fundName = "Model Fund I" } = {}) {
  const sample = deals.filter((d) => d.id.startsWith("sample-deal-")).sort((a, b) => num(a.id) - num(b.id));
  const updates = {};
  const counts = { records: 0, flags: 0, screenings: 0, aged: 0 };
  const lastM = monthEnd(todayISO, 1), prevM = monthEnd(todayISO, 2);
  const agedRows = { [prevM]: [], [lastM]: [] };
  const mapping = { properties: {}, tenants: {} };
  for (const d of sample) {
    const n = num(d.id);
    const inp = d.inputs;
    const occ = (inp.units ?? []).filter((u) => u.leaseStatus === "occupied" && String(u.tenantName ?? "").trim());
    const top = [...occ].sort((a, b) => rentOf(b) - rentOf(a))[0];
    const second = occ.find((x) => x.id !== top?.id);
    const prop = `MF1-${n}`;
    mapping.properties[prop] = d.id;
    const units = (inp.units ?? []).map((u, i) => {
      if (u.leaseStatus !== "occupied" || !String(u.tenantName ?? "").trim()) return u;
      const c = creditOf(u);
      const keep = { records: c.records.filter((x) => x.by !== SAMPLE_CREDIT_BY), flags: c.flags.filter((x) => x.by !== SAMPLE_CREDIT_BY) };
      const t = u.tenantName;
      const isTop = top && u.id === top.id;
      const k = `${n}-${i}`;
      let add = [], flags = [];
      if (isTop && n === 3) {
        add = [rec({ key: k, tenant: t, source: "agency", provider: "D&B (fictional report)", date: addDays(todayISO, -255), scoreType: "paydex", score: 74, result: "approved" })];
        flags = [{ id: `sample-cf-${k}`, date: addDays(todayISO, -6), reason: "Lost its largest customer contract; asked to pay rent in two installments.", by: SAMPLE_CREDIT_BY, at: `${addDays(todayISO, -6)}T12:00:00.000Z`, status: "open", clearedAt: "", clearedBy: "", clearNote: "" }];
      } else if (isTop && n === 1) {
        add = [rec({ key: k, tenant: t, source: "app", provider: "TurboTenant (fictional report)", date: addDays(todayISO, -55), scoreType: "consumer", score: 612, result: "conditions", issues: "Two late payments to a supplier in 2025", conditions: "Personal guaranty; 2 months' deposit" })];
      } else if (isTop && n === 4) {
        add = [rec({ key: k, tenant: t, source: "own", date: addDays(todayISO, -169), rating: "weak", basis: "Thin financials; new business (two years of statements)" })];
      } else if (isTop && n === 8) {
        add = []; // no credit record: Missing
      } else {
        add = [rec({ key: k, tenant: t, source: "app", provider: "Screening app (fictional report)", date: addDays(todayISO, -(120 + ((n * 37 + i * 53) % 600))), scoreType: "consumer", score: 690 + ((n * 13 + i * 29) % 71), result: "approved" })];
      }
      counts.records += add.length; counts.flags += flags.length;
      let next = { ...u, credit: { ...c, records: [...keep.records, ...add], flags: [...keep.flags, ...flags] } };
      // Aged receivables rows (monthly rent m).
      const m = rentOf(u) / 12 || 1500; // a unit with no rent entered still shows an amount
      const code = `t${n}-${i + 1}`;
      const row = (month, b) => { agedRows[month].push({ property: prop, propertyName: inp.propertyName, tenantCode: code, tenant: t, unit: u.name || "", charge: "rent", current: 0, d30: 0, d60: 0, d90: 0, d180: 0, over180: 0, prepay: 0, ...b, total: 0 }); mapping.tenants[code] = u.id; };
      if (isTop && n === 3) { row(prevM, { d30: r0(m), d60: r0(0.5 * m) }); row(lastM, { d30: r0(m), d60: r0(m), d90: r0(0.5 * m) }); }
      if (isTop && n === 7) { row(prevM, { d90: r0(0.6 * m) }); row(lastM, { d180: r0(0.6 * m) }); }
      if (n === 8 && second && u.id === second.id) row(lastM, { d30: r0(0.5 * m) });
      if (Object.values(agedRows).some((rows) => rows.some((x) => x.tenantCode === code)) && !(Number(u.securityDeposit) > 0)) next = { ...next, securityDeposit: r0(2 * m) };
      return next;
    });
    const upd = { units };
    // Prospect screenings: prospects at LOI or lease out have one.
    const ps = inp.leasing?.prospects ?? [];
    if (ps.length) {
      upd.leasing = { ...inp.leasing, prospects: ps.map((p, j) => {
        if (!["loi", "leaseout"].includes(p.stage) || (p.screening && p.screening.by !== SAMPLE_CREDIT_BY)) return p;
        counts.screenings++;
        return { ...p, screening: { source: "app", provider: "TurboTenant (fictional report)", reportDate: addDays(todayISO, -(10 + j)), scoreType: "consumer", score: 700 + ((n * 7 + j * 11) % 60), rating: "", result: "approved", issues: "", conditions: "", basis: "", by: SAMPLE_CREDIT_BY, at: `${addDays(todayISO, -(10 + j))}T12:00:00.000Z` } };
      }) };
    }
    updates[d.id] = upd;
  }
  for (const rows of Object.values(agedRows)) for (const r of rows) r.total = r.d30 + r.d60 + r.d90 + r.d180 + r.over180;
  counts.aged = agedRows[lastM].length;
  // Aged receivables on the fund: only when the fund has no upload of its own.
  const cur = funds?.[fundName]?.delinquency;
  const own = cur && Object.values(cur.months ?? {}).some((x) => x.file !== SAMPLE_AGED_FILE);
  const delinquency = own ? null : {
    ...(cur ?? {}),
    mapping: { ...(cur?.mapping ?? {}), properties: { ...(cur?.mapping?.properties ?? {}), ...mapping.properties }, tenants: { ...(cur?.mapping?.tenants ?? {}), ...mapping.tenants } },
    months: Object.fromEntries([prevM, lastM].map((mo) => [mo, { rows: agedRows[mo], file: SAMPLE_AGED_FILE, uploadedAt: `${mo}T12:00:00.000Z`, by: SAMPLE_CREDIT_BY }])),
  };
  return { updates, delinquency, counts };
}
