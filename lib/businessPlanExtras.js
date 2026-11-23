// Phase L: what the full Asset Business Plan PDF adds to the plan itself:
// the cover and captioned photos, the floor plan with units coloured by lease
// status (or the schematic), the location (address, coordinates and a Google
// Maps link; no map image, since the keyless map can't be printed), actual
// NOI, and underwritten vs. actual (phase J). Runs in the browser at export.
import { STATUS_COLORS, actualNoi, coverPhoto, googleMapsLink, mapQuery, mediaOf, orderedPhotos, schematicLayout, unitStatus } from "@/lib/assetMedia";
import { assetFileLinks, imageDataUrl, isSamplePath } from "@/lib/assetPhotos";
import { attribution, compare } from "@/lib/uwActual";

export const MAX_PDF_PHOTOS = 12;

// Pure part (tested in Node): units with their status and box, and the rest
// that needs no images.
export function planExtrasData(inputs, { asOf }) {
  const media = mediaOf(inputs);
  const units = (inputs.units ?? []).filter((u) => (Number(u.squareFeet) || 0) > 0);
  const boxes = media.floorPlan?.kind === "image" && media.floorPlan.boxes ? media.floorPlan.boxes : null;
  const schematic = Object.fromEntries(schematicLayout(units).map((b) => [b.unitId, b]));
  const unitBoxes = units.map((u) => {
    const status = unitStatus(u, asOf);
    return { id: u.id, name: u.name, sf: Number(u.squareFeet) || 0, tenant: u.leaseStatus === "occupied" ? u.tenantName ?? "" : "", status, color: STATUS_COLORS[status], box: (boxes ? boxes[u.id] : schematic[u.id]) ?? null };
  });
  const q = mapQuery(inputs, media.geo);
  const address = [inputs.address, inputs.city, inputs.state, inputs.zip].filter(Boolean).join(", ");
  const noi = actualNoi(inputs, asOf);
  let uw = null;
  if (inputs.uwBaseline?.inputs) {
    try {
      uw = { baseline: inputs.uwBaseline, c: compare(inputs.uwBaseline, inputs, asOf), attr: attribution(inputs.uwBaseline, inputs, asOf) };
    } catch {
      uw = null;
    }
  }
  return {
    photos: orderedPhotos(media).slice(0, MAX_PDF_PHOTOS),
    cover: coverPhoto(media),
    floorPlan: media.floorPlan,
    planOnImage: !!boxes,
    unitBoxes,
    location: { address, lat: media.geo?.lat ?? null, lon: media.geo?.lon ?? null, manual: media.geo?.source === "manual", link: q ? googleMapsLink(q) : "" },
    actualNoi: noi,
    uw,
  };
}

// Browser part: loads the images as JPEG data URLs. Stored files need the
// person to be signed in; sample drawings load either way. Images that can't
// be loaded are left out with a note.
export async function planExtras(inputs, { asOf, signedIn = false } = {}) {
  const x = planExtrasData(inputs, { asOf });
  const notes = [];
  const want = [...x.photos.map((p) => p.path), x.floorPlan?.kind === "image" ? x.floorPlan.path : null].filter(Boolean);
  const usable = want.filter((p) => signedIn || isSamplePath(p));
  if (usable.length < want.length) notes.push("Sign in to include the stored photos and floor plan.");
  let links = {};
  try {
    links = usable.length ? await assetFileLinks(usable) : {};
  } catch (e) {
    notes.push(`Photos couldn't be loaded: ${e.message}`);
  }
  const img = async (p) => {
    if (!links[p]) return null;
    try {
      return await imageDataUrl(links[p]);
    } catch {
      notes.push("An image couldn't be read and was left out.");
      return null;
    }
  };
  const photos = [];
  for (const p of x.photos) photos.push({ ...p, img: await img(p.path) });
  const planImg = x.floorPlan?.kind === "image" ? await img(x.floorPlan.path) : null;
  return { ...x, photos, coverImg: photos.find((p) => p.id === x.cover?.id)?.img ?? null, planImg, notes };
}
