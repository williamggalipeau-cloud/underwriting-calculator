// ─── Asset media (phase I part 2): photos, location map, floor plan ─────────
// Stored on the deal as inputs.assetMedia:
//   photos:    [{ id, path, name, caption, date, order, cover }]
//              files in the private "asset-photos" bucket at
//              <workspace>/<deal id>/photos/<file>
//   floorPlan: { path, name, kind: "image" | "pdf", boxes: { unitId: { x, y, w, h } } }
//              box coordinates are fractions (0–1) of the plan's width/height
//   geo:       { lat, lon, label, query, source: "manual", at } (a point
//              entered by hand; otherwise the map uses the address)
// Pure functions only; storage calls are in lib/assetPhotos.js.

export const EMPTY_MEDIA = Object.freeze({ photos: [], floorPlan: null, geo: null });

export function mediaOf(inputs) {
  const m = inputs?.assetMedia ?? {};
  return { photos: Array.isArray(m.photos) ? m.photos : [], floorPlan: m.floorPlan ?? null, geo: m.geo ?? null };
}

// ── Photos ──
export function orderedPhotos(media) {
  return [...(media.photos ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)));
}

// The cover is the one marked cover, else the first in order.
export function coverPhoto(media) {
  const ps = orderedPhotos(media);
  return ps.find((p) => p.cover) ?? ps[0] ?? null;
}

const renumber = (photos) => photos.map((p, i) => ({ ...p, order: i + 1 }));

export function addPhotos(media, files, { date = "", idPrefix = "ph" } = {}) {
  const ps = orderedPhotos(media);
  const added = files.map((f, i) => ({ id: f.id ?? `${idPrefix}-${Date.now().toString(36)}-${i}`, path: f.path, name: f.name ?? "", caption: f.caption ?? "", date: f.date ?? date, cover: false }));
  const photos = renumber([...ps, ...added]);
  if (!photos.some((p) => p.cover) && photos.length) photos[0] = { ...photos[0], cover: true };
  return { ...media, photos };
}

export function updatePhoto(media, id, patch) {
  return { ...media, photos: (media.photos ?? []).map((p) => (p.id === id ? { ...p, ...patch, id: p.id, path: p.path } : p)) };
}

export function setCover(media, id) {
  return { ...media, photos: (media.photos ?? []).map((p) => ({ ...p, cover: p.id === id })) };
}

// dir: -1 earlier, +1 later.
export function movePhoto(media, id, dir) {
  const ps = orderedPhotos(media);
  const i = ps.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ps.length) return media;
  [ps[i], ps[j]] = [ps[j], ps[i]];
  return { ...media, photos: renumber(ps) };
}

export function removePhoto(media, id) {
  const gone = (media.photos ?? []).find((p) => p.id === id);
  let photos = renumber(orderedPhotos(media).filter((p) => p.id !== id));
  if (gone?.cover && photos.length) photos = photos.map((p, i) => ({ ...p, cover: i === 0 }));
  return { ...media, photos };
}

// ── Unit status for the floor plan colours ──
export const STATUS_COLORS = {
  occupied: { fill: "#d1fae5", stroke: "#059669", label: "Leased" },
  expiring: { fill: "#fef3c7", stroke: "#d97706", label: "Expires within 12 months" },
  vacant: { fill: "#fee2e2", stroke: "#dc2626", label: "Vacant" },
};

const addMonths = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

export function unitStatus(unit, asOf) {
  if (unit?.leaseStatus !== "occupied") return "vacant";
  if (unit.leaseEnd && asOf && unit.leaseEnd <= addMonths(asOf, 12)) return "expiring";
  return "occupied";
}

// ── Schematic (no uploaded plan): units as boxes in rows, width ∝ SF ──
// Returns [{ unitId, x, y, w, h }] in fractions of a 1 × 1 plan.
export function schematicLayout(units, { rows } = {}) {
  const us = (units ?? []).filter((u) => (Number(u.squareFeet) || 0) > 0);
  if (!us.length) return [];
  const n = rows ?? Math.max(1, Math.round(Math.sqrt(us.length / 3)));
  const total = us.reduce((s, u) => s + Number(u.squareFeet), 0);
  const target = total / n;
  const lines = [[]];
  let acc = 0;
  for (const u of us) {
    if (acc >= target * 0.999 && lines.length < n) { lines.push([]); acc = 0; }
    lines.at(-1).push(u);
    acc += Number(u.squareFeet);
  }
  const h = 1 / lines.length;
  return lines.flatMap((line, r) => {
    const sum = line.reduce((s, u) => s + Number(u.squareFeet), 0);
    let x = 0;
    return line.map((u) => {
      const w = Number(u.squareFeet) / sum;
      const box = { unitId: u.id, x, y: r * h, w, h };
      x += w;
      return box;
    });
  });
}

// ── Floor plan boxes ──
const clamp01 = (v) => Math.min(1, Math.max(0, v));
export function normBox({ x, y, w, h }) {
  const x0 = clamp01(Math.min(x, x + w)), y0 = clamp01(Math.min(y, y + h));
  const x1 = clamp01(Math.max(x, x + w)), y1 = clamp01(Math.max(y, y + h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function setFloorPlan(media, plan) {
  return { ...media, floorPlan: plan ? { boxes: {}, ...(media.floorPlan ?? {}), ...plan } : null };
}

export function setBox(media, unitId, box) {
  const fp = media.floorPlan ?? { boxes: {} };
  const boxes = { ...(fp.boxes ?? {}) };
  if (box) boxes[unitId] = normBox(box);
  else delete boxes[unitId];
  return { ...media, floorPlan: { ...fp, boxes } };
}

// ── Demising and combining units (vacant units only) ──
const sf = (u) => Number(u.squareFeet) || 0;
const letters = "ABCDEFGHIJ";

// parts: [sqft, sqft, …] summing to the unit's SF. New units are vacant, at
// the unit's market rent, named 014-A, 014-B, … Returns { units, ids } or { error }.
export function demiseUnit(units, unitId, parts) {
  const u = units.find((x) => x.id === unitId);
  if (!u) return { error: "Unit not found." };
  if (u.leaseStatus === "occupied") return { error: `Unit ${u.name ?? u.id} is leased; only vacant units can be demised.` };
  const ps = (parts ?? []).map(Number);
  if (ps.length < 2 || ps.length > letters.length) return { error: "Demise into 2 to 10 units." };
  if (ps.some((p) => !(p > 0))) return { error: "Each new unit needs a positive size." };
  const total = ps.reduce((s, p) => s + p, 0);
  if (Math.abs(total - sf(u)) > 0.5) return { error: `The parts add up to ${total.toLocaleString("en-US")} SF, not the unit's ${sf(u).toLocaleString("en-US")} SF.` };
  const base = u.name ?? u.id;
  const made = ps.map((p, i) => ({ ...u, id: `${u.id}-${letters[i]}`, name: `${base}-${letters[i]}`, squareFeet: p, tenantName: "", leaseStatus: "vacant", leaseEnd: "", monthsRemaining: 0, demisedFrom: u.id }));
  const i = units.indexOf(u);
  return { units: [...units.slice(0, i), ...made, ...units.slice(i + 1)], ids: made.map((m) => m.id) };
}

// Combines vacant units into one, at the SF-weighted market rent, named
// "012/013". It takes the first unit's place in the roll.
export function combineUnits(units, ids) {
  const picked = units.filter((u) => ids.includes(u.id));
  if (picked.length < 2) return { error: "Choose at least two units to combine." };
  const leased = picked.filter((u) => u.leaseStatus === "occupied");
  if (leased.length) return { error: `Only vacant units can be combined (${leased.map((u) => u.name ?? u.id).join(", ")} leased).` };
  const total = picked.reduce((s, u) => s + sf(u), 0);
  const rent = total ? picked.reduce((s, u) => s + sf(u) * (Number(u.currentRentPSF) || 0), 0) / total : 0;
  const first = picked[0];
  const merged = { ...first, id: picked.map((u) => u.id).join("+"), name: picked.map((u) => u.name ?? u.id).join("/"), squareFeet: total, currentRentPSF: Math.round(rent * 100) / 100, tenantName: "", leaseStatus: "vacant", leaseEnd: "", monthsRemaining: 0, combinedFrom: picked.map((u) => u.id) };
  const out = [];
  for (const u of units) {
    if (u.id === first.id) out.push(merged);
    else if (!ids.includes(u.id)) out.push(u);
  }
  return { units: out, id: merged.id };
}

// Keeps the drawn boxes in step: a demised unit's box is split left to
// right by SF; combined units get the box that covers all of theirs.
export function boxesAfterDemise(media, unitId, newUnits) {
  const b = media.floorPlan?.boxes?.[unitId];
  if (!b) return media;
  const total = newUnits.reduce((s, u) => s + sf(u), 0);
  let x = b.x;
  let next = setBox(media, unitId, null);
  for (const u of newUnits) {
    const w = (b.w * sf(u)) / total;
    next = setBox(next, u.id, { x, y: b.y, w, h: b.h });
    x += w;
  }
  return next;
}

export function boxesAfterCombine(media, ids, newId) {
  const bs = ids.map((id) => media.floorPlan?.boxes?.[id]).filter(Boolean);
  let next = media;
  for (const id of ids) next = setBox(next, id, null);
  if (!bs.length) return next;
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
  return setBox(next, newId, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

// ── Actual NOI (from the business plan's imported actuals) ──
// Trailing 12 months on or before asOf, annualized when fewer are in.
export function actualNoi(inputs, asOf) {
  const acts = inputs?.businessPlan?.actuals ?? {};
  const months = Object.keys(acts).filter((m) => !asOf || m <= asOf.slice(0, 7)).sort().slice(-12);
  const withNoi = months.filter((m) => isFinite(acts[m]?.noi));
  if (!withNoi.length) return { noi: NaN, months: 0, from: null, to: null };
  const sum = withNoi.reduce((s, m) => s + acts[m].noi, 0);
  return { noi: (sum * 12) / withNoi.length, months: withNoi.length, from: withNoi[0], to: withNoi.at(-1) };
}

// Cap rate implied by a value on actual NOI (%), and value at a cap.
export const capOnActual = (noi, value) => (isFinite(noi) && value > 0 ? (noi / value) * 100 : NaN);
export const valueAtCap = (noi, capPct) => (isFinite(noi) && capPct > 0 ? noi / (capPct / 100) : NaN);

// ── Google Maps (keyless embed; user's choice 11/23 until an Embed API key
// is set up). Google finds the address itself; a point entered by hand wins.
export function mapQuery(inputs, geo) {
  if (geo?.source === "manual" && isFinite(geo.lat) && isFinite(geo.lon)) return `${geo.lat},${geo.lon}`;
  return [inputs?.address, inputs?.city, inputs?.state, inputs?.zip].filter(Boolean).join(", ");
}

// view: "map" (roadmap) or "satellite". With a Maps Embed API key (set at
// build time from the GOOGLE_MAPS_EMBED_KEY repository secret) the official
// Embed API is used; without one, Google's keyless embed.
export const GOOGLE_EMBED_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || "";
export function googleEmbedUrl(q, { view = "map", zoom = 16, key = GOOGLE_EMBED_KEY } = {}) {
  if (key) return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=${zoom}&maptype=${view === "satellite" ? "satellite" : "roadmap"}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=${view === "satellite" ? "k" : "m"}&z=${zoom}&output=embed`;
}

export function googleMapsLink(q) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
