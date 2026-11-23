// ─── Phase L: mock (drawn) photos and floor plans for the sample assets ─────
// Drawings, not photographs: SVG files in public/sample-media/, made by
// scripts/sample-media/generate.cjs (fictional, like the rest of the sample
// data). Loaded with the sample portfolio (buildSampleDeals), so each sample
// asset's business plan, report page and PDF show what a full plan looks
// like. Paths use the "sample:" prefix (lib/assetPhotos), so they never touch
// storage and show even when signed out.
//
// The floor plan is drawn with the units laid out by schematicLayout inside
// PLAN_AREA; the same layout gives each unit's box (fractions of the image),
// so the coloured boxes sit on the drawn units.

import { schematicLayout } from "@/lib/assetMedia";

export const PLAN_W = 1200;
export const PLAN_H = 800;
// The building's interior on the drawn plan (fractions of the image).
export const PLAN_AREA = { x: 0.07, y: 0.16, w: 0.86, h: 0.66 };

export const PHOTO_KINDS = [
  ["exterior", "Front elevation and signage"],
  ["docks", "Truck court and loading doors"],
  ["interior", "Typical unit interior"],
  ["street", "Street view and parking"],
];

// The nine sample assets that have drawings.
export const SAMPLE_MEDIA_ASSETS = [
  "Airport Flex Park", "Route 9 Small Bay", "Harbor Light Industrial", "Ridgeway Trade Center", "Canal Street Workshops",
  "Mill Creek Business Park", "Southpoint Flex", "Granite Ave Industrial", "Lakeshore Service Center",
];
export const hasSampleMedia = (name) => SAMPLE_MEDIA_ASSETS.includes(name);

// Adds the drawings to sample assets that have no photos and no floor plan,
// keeping everything else on the deal (Sample data menu, owners only).
export function withSampleMedia(deal) {
  const m = deal.inputs?.assetMedia ?? {};
  if (!hasSampleMedia(deal.inputs?.propertyName) || (m.photos ?? []).length || m.floorPlan) return deal;
  return { ...deal, inputs: { ...deal.inputs, assetMedia: { ...sampleMediaFor(deal.inputs.propertyName, deal.inputs.units ?? []), geo: m.geo ?? null } } };
}

export const slug = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function planBoxes(units) {
  const out = {};
  for (const b of schematicLayout(units)) {
    out[b.unitId] = {
      x: PLAN_AREA.x + b.x * PLAN_AREA.w,
      y: PLAN_AREA.y + b.y * PLAN_AREA.h,
      w: b.w * PLAN_AREA.w,
      h: b.h * PLAN_AREA.h,
    };
  }
  return out;
}

// assetMedia for a sample asset. date: when the drawings are "dated".
export function sampleMediaFor(propertyName, units, { date = "2026-10-15" } = {}) {
  const s = slug(propertyName);
  return {
    photos: PHOTO_KINDS.map(([kind, caption], i) => ({
      id: `sample-${s}-${kind}`,
      path: `sample:${s}-${kind}.svg`,
      name: `${s}-${kind}.svg`,
      caption: `${caption} (drawing)`,
      date,
      order: i + 1,
      cover: i === 0,
    })),
    floorPlan: { path: `sample:${s}-floorplan.svg`, name: `${s}-floorplan.svg`, kind: "image", boxes: planBoxes(units) },
    geo: null,
  };
}
