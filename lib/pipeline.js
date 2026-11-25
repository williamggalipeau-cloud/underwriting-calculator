// ─── Phase M: Pipeline (Acquisitions) ────────────────────────────────────────
// Every deal being watched, one row each, saved with the firm's settings
// (data.pipeline = { deals: [...], mappings: { [source]: mapping } }).
// Rows come from hand entry, a CoStar export or an internal spreadsheet (CSV
// or Excel: columns matched like the Sales Comps import, the match remembered
// per source); a re-upload updates the deal with the same name and address
// instead of adding a copy. Actions elsewhere: Screen (Deal Screener), Send
// to Portfolio Impact, Convert to asset once closed.

export const EMPTY_PIPELINE = Object.freeze({ deals: [], mappings: {} });

export const STAGES = [
  ["watching", "Watching"],
  ["screening", "Screening"],
  ["loi", "LOI"],
  ["psa", "Under contract (PSA)"],
  ["closed", "Closed"],
  ["passed", "Passed / lost"],
];
export const stageLabel = (k) => STAGES.find(([v]) => v === k)?.[1] ?? k;
export const ACTIVE_STAGES = ["watching", "screening", "loi", "psa"];
// Default probability of closing by stage (editable per deal).
export const STAGE_PROBABILITY = { watching: 10, screening: 20, loi: 40, psa: 75, closed: 100, passed: 0 };

export const PIPELINE_FIELDS = [
  { key: "name", label: "Property name", synonyms: ["property name", "building name", "name", "property", "deal", "deal name", "asset"] },
  { key: "address", label: "Address", synonyms: ["property address", "address", "street address", "street"] },
  { key: "city", label: "City", synonyms: ["city", "property city"] },
  { key: "state", label: "State", synonyms: ["state", "property state", "st"] },
  { key: "market", label: "Market / submarket", synonyms: ["market", "submarket", "submarket name", "market name", "costar submarket"] },
  { key: "sf", label: "Building SF", synonyms: ["rba", "building sf", "sf", "square feet", "size", "bldg sf", "rentable building area", "total sf"] },
  { key: "askingPrice", label: "Asking price ($)", synonyms: ["asking price", "for sale price", "price", "list price", "sale price", "asking"] },
  { key: "capRatePct", label: "Cap rate (%)", synonyms: ["cap rate", "asking cap rate", "cap", "going in cap"] },
  { key: "noi", label: "NOI ($)", synonyms: ["noi", "net operating income", "in place noi", "year 1 noi"] },
  { key: "source", label: "Broker / source", synonyms: ["broker", "listing broker", "listing broker company", "source", "brokerage"] },
  { key: "seller", label: "Seller", synonyms: ["seller", "owner", "true owner", "recorded owner", "owner name"] },
  { key: "stage", label: "Stage", synonyms: ["stage", "status", "deal stage"] },
  { key: "owner", label: "Deal lead", synonyms: ["deal lead", "lead", "assigned to", "analyst", "our owner"] },
  { key: "targetFund", label: "Target fund", synonyms: ["target fund", "fund"] },
  { key: "expectedClose", label: "Expected close", synonyms: ["expected close", "close date", "target close", "closing date"] },
  { key: "notes", label: "Notes", synonyms: ["notes", "comments", "note"] },
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s_]+/g, " ").replace(/[()$%]/g, "").trim();
const num = (v) => {
  const s = String(v ?? "").trim();
  if (!s || /^(n\/a|na|-|—)$/i.test(s)) return null;
  const n = parseFloat(s.replace(/[$,%\s]/g, ""));
  return isFinite(n) ? n : null;
};
function toISODate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const n = Number(s);
  if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  return "";
}
const stageOf = (v) => {
  const s = norm(v);
  if (!s) return "";
  if (/pass|lost|dead|declin/.test(s)) return "passed";
  if (/closed|acquired|owned/.test(s)) return "closed";
  if (/psa|contract|due diligence/.test(s)) return "psa";
  if (/loi|letter of intent|offer/.test(s)) return "loi";
  if (/screen|underwrit|review/.test(s)) return "screening";
  return "watching";
};

let seq = 0;
export const newPipelineId = () => `pl-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export function makePipelineDeal(raw = {}, { today = new Date().toISOString().slice(0, 10), by = "" } = {}) {
  const stage = raw.stage && STAGES.some(([k]) => k === raw.stage) ? raw.stage : stageOf(raw.stage) || "watching";
  return {
    id: raw.id ?? newPipelineId(),
    name: String(raw.name ?? "").trim(),
    address: String(raw.address ?? "").trim(),
    city: String(raw.city ?? "").trim(),
    state: String(raw.state ?? "").trim().toUpperCase().slice(0, 2),
    market: String(raw.market ?? "").trim(),
    sf: num(raw.sf),
    askingPrice: num(raw.askingPrice),
    capRatePct: num(raw.capRatePct),
    noi: num(raw.noi),
    source: String(raw.source ?? "").trim(),
    seller: String(raw.seller ?? "").trim(),
    stage,
    probabilityPct: num(raw.probabilityPct) ?? STAGE_PROBABILITY[stage],
    owner: String(raw.owner ?? by ?? "").trim(),
    targetFund: String(raw.targetFund ?? "").trim(),
    nextStep: String(raw.nextStep ?? "").trim(),
    nextDate: toISODate(raw.nextDate) || "",
    expectedClose: toISODate(raw.expectedClose) || "",
    // Contract dates (11/24): shown on the Dashboard's Calendar.
    psaDate: toISODate(raw.psaDate) || "",
    depositDue: toISODate(raw.depositDue) || "",
    hardDate: toISODate(raw.hardDate) || "",
    ddStart: toISODate(raw.ddStart) || "",
    ddDeadline: toISODate(raw.ddDeadline) || "",
    loanClosing: toISODate(raw.loanClosing) || "",
    // The date the stage was last set (1.1.6): dates and sorts History in the
    // Deal Screener's dropdown.
    stageDate: toISODate(raw.stageDate) || "",
    passReason: String(raw.passReason ?? "").trim(),
    notes: String(raw.notes ?? "").trim(),
    omDocId: raw.omDocId ?? null,
    dealId: raw.dealId ?? null,
    dateAdded: raw.dateAdded ?? today,
  };
}

// Derived figures: $/SF, and NOI ↔ cap rate from the asking price.
export function derived(d) {
  const psf = d.askingPrice > 0 && d.sf > 0 ? d.askingPrice / d.sf : null;
  const noi = d.noi ?? (d.askingPrice > 0 && d.capRatePct > 0 ? (d.askingPrice * d.capRatePct) / 100 : null);
  const cap = d.capRatePct ?? (d.askingPrice > 0 && d.noi > 0 ? (d.noi / d.askingPrice) * 100 : null);
  return { psf, noi, cap };
}

// ── Import ──
export function detectPipelineMapping(grid, remembered = null) {
  if (remembered?.headers) {
    const r = grid.findIndex((row) => JSON.stringify((row ?? []).map((h) => String(h ?? ""))) === JSON.stringify(remembered.headers));
    if (r >= 0) return { headerRow: r, headers: remembered.headers, mapping: remembered.mapping, remembered: true };
  }
  let best = { row: -1, score: 0, mapping: {} };
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const headers = (grid[r] ?? []).map(norm);
    const mapping = {};
    for (const f of PIPELINE_FIELDS) {
      let idx = headers.findIndex((h) => f.synonyms.includes(h));
      if (idx < 0) idx = headers.findIndex((h) => h && f.synonyms.some((syn) => syn.length > 3 && h.startsWith(syn)));
      if (idx >= 0 && !Object.values(mapping).includes(idx)) mapping[f.key] = idx;
    }
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { row: r, score, mapping };
  }
  if (best.score < 2 || (best.mapping.name == null && best.mapping.address == null)) throw new Error("Couldn't find pipeline columns (e.g. Property Name or Address, RBA, Asking Price). Check the file or use the template.");
  return { headerRow: best.row, headers: grid[best.row].map((h) => String(h ?? "")), mapping: best.mapping, remembered: false };
}

export const dealKey = (d) => `${norm(d.name)}|${norm(d.address)}`;

// Rows from a grid with a mapping; merged into the list: a row with the same
// name and address updates that deal's imported fields (stage, owner, notes
// and next steps set in the app are kept unless the file has them).
export function importPipeline(existing, grid, info, { source = "upload", today, by = "" } = {}) {
  const rows = grid.slice(info.headerRow + 1).filter((r) => r && r.some((c) => String(c ?? "").trim()));
  const list = [...existing];
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows) {
    const raw = {};
    for (const [k, i] of Object.entries(info.mapping)) raw[k] = r[i];
    if (!String(raw.name ?? "").trim() && !String(raw.address ?? "").trim()) { skipped++; continue; }
    if (!raw.name) raw.name = raw.address;
    if (!raw.source) raw.source = source === "costar" ? "CoStar" : source === "internal" ? "Internal list" : "";
    const fresh = makePipelineDeal(raw, { today, by });
    const i = list.findIndex((d) => dealKey(d) === dealKey(fresh));
    if (i >= 0) {
      const keep = list[i];
      const merged = { ...keep };
      for (const k of Object.keys(info.mapping)) if (fresh[k] != null && fresh[k] !== "") merged[k] = fresh[k];
      if (info.mapping.stage == null) merged.stage = keep.stage;
      else if (merged.stage !== keep.stage) merged.probabilityPct = STAGE_PROBABILITY[merged.stage];
      list[i] = merged;
      updated++;
    } else {
      list.push(fresh);
      added++;
    }
  }
  return { deals: list, added, updated, skipped };
}

export function templateRows() {
  return [
    PIPELINE_FIELDS.map((f) => f.label),
    ["Fictional Commerce Center", "100 Example Way", "Reno", "NV", "Reno / Sparks", 48000, 9600000, 6.25, "", "Example Brokerage", "Example Seller LLC", "Screening", "", "Model Fund I", "2027-03-31", "Small-bay flex, 12 units"],
  ];
}

// ── Views ──
export function filterPipeline(deals, f = {}) {
  return deals.filter((d) =>
    (!f.stage || f.stage === "all" || (f.stage === "active" ? ACTIVE_STAGES.includes(d.stage) : d.stage === f.stage)) &&
    (!f.fund || d.targetFund === f.fund) &&
    (!f.market || d.market === f.market) &&
    (!f.owner || d.owner === f.owner));
}

export function totalsByStage(deals) {
  return STAGES.map(([k, label]) => {
    const ds = deals.filter((d) => d.stage === k);
    const value = ds.reduce((s, d) => s + (d.askingPrice ?? 0), 0);
    return { stage: k, label, count: ds.length, sf: ds.reduce((s, d) => s + (d.sf ?? 0), 0), value, weighted: ds.reduce((s, d) => s + (d.askingPrice ?? 0) * ((d.probabilityPct ?? 0) / 100), 0) };
  });
}

export function pipelineXlsx(deals) {
  return [
    ["Name", "Address", "City", "State", "Market", "SF", "Asking price", "$/SF", "Cap rate %", "NOI", "Source", "Seller", "Stage", "Probability %", "Deal lead", "Target fund", "Next step", "Next date", "Expected close", "Pass reason", "Notes", "Added"],
    ...deals.map((d) => { const x = derived(d); return [d.name, d.address, d.city, d.state, d.market, d.sf, d.askingPrice, x.psf, x.cap, x.noi, d.source, d.seller, stageLabel(d.stage), d.probabilityPct, d.owner, d.targetFund, d.nextStep, d.nextDate, d.expectedClose, d.passReason, d.notes, d.dateAdded]; }),
  ];
}

// Deal Screener inputs from a pipeline deal (lib/quickUnderwrite field names).
export function toQuickInputs(d) {
  const x = derived(d);
  return {
    ...(d.askingPrice ? { purchasePrice: d.askingPrice } : {}),
    ...(x.noi ? { noiYear1: Math.round(x.noi) } : {}),
    ...(d.expectedClose ? { acquisitionDate: d.expectedClose } : {}),
  };
}
