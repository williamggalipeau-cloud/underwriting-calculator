// Drawn (fictional) photos and floor plans for Model Fund I's nine sample
// assets: public/sample-media/<asset>-{exterior,docks,interior,street,floorplan}.svg
// Drawings, not photographs. The floor plan lays units out with
// lib/sampleMedia.js planBoxes (schematicLayout), the same layout the app uses
// for the unit boxes. Usage: node scripts/sample-media/generate.cjs
const path = require("path");
const fs = require("fs");
const R = path.resolve(__dirname, "..", "..");
const j = require(R + "/node_modules/jiti")(__filename, { alias: { "@": R } });
const sp = j(R + "/lib/samplePortfolio.js");
const sm = j(R + "/lib/sampleMedia.js");
const { schematicLayout } = j(R + "/lib/assetMedia.js");
const { TEST_INPUTS } = j(R + "/lib/testScenario.js");
const OUT = path.join(R, "public", "sample-media");
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const PALETTES = [
  ["#d9d4c7", "#8a7f6a", "#1f4e79"], ["#cfd8dc", "#607d8b", "#b23a48"], ["#e3dccb", "#9c8b6e", "#2e7d32"],
  ["#d7ccc8", "#795548", "#1565c0"], ["#dfe6e9", "#636e72", "#e17055"], ["#e8e2d0", "#a1887f", "#00695c"],
  ["#d6dbe0", "#546e7a", "#c0392b"], ["#e0d8c3", "#8d6e63", "#283593"], ["#dcdde1", "#718093", "#e1b12c"],
];
const W = 1200, H = 800;
const svg = (body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${body}` +
  `<rect x="0" y="${H - 34}" width="${W}" height="34" fill="rgba(0,0,0,0.45)"/>` +
  `<text x="18" y="${H - 12}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#fff">${esc(label)} · drawing for the fictional sample portfolio, not a photograph</text></svg>\n`;
const sky = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5ea"/><stop offset="1" stop-color="#e6f2fa"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id})"/>`;
const tree = (x, y, s = 1) => `<rect x="${x - 6 * s}" y="${y - 40 * s}" width="${12 * s}" height="${40 * s}" fill="#6d4c41"/><circle cx="${x}" cy="${y - 70 * s}" r="${42 * s}" fill="#4caf50"/><circle cx="${x - 28 * s}" cy="${y - 52 * s}" r="${28 * s}" fill="#43a047"/><circle cx="${x + 26 * s}" cy="${y - 50 * s}" r="${30 * s}" fill="#388e3c"/>`;

function exterior(name, i, nUnits) {
  const [wall, trim, accent] = PALETTES[i % PALETTES.length];
  const doors = Math.min(10, Math.max(4, Math.round(nUnits / 2)));
  const bx = 110, bw = 980, by = 250, bh = 330;
  let b = sky("s") + `<rect y="580" width="${W}" height="220" fill="#9e9e9e"/><rect y="580" width="${W}" height="10" fill="#757575"/>`;
  b += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${wall}" stroke="${trim}" stroke-width="4"/>`;
  b += `<rect x="${bx}" y="${by}" width="${bw}" height="26" fill="${trim}"/>`;
  for (let k = 1; k < 8; k++) b += `<line x1="${bx + (bw / 8) * k}" y1="${by + 26}" x2="${bx + (bw / 8) * k}" y2="${by + bh}" stroke="${trim}" stroke-opacity="0.35" stroke-width="2"/>`;
  const dw = (bw - 80) / doors;
  for (let k = 0; k < doors; k++) {
    const x = bx + 40 + k * dw;
    if (k % 3 === 0) {
      b += `<rect x="${x + 10}" y="${by + 170}" width="${dw - 30}" height="160" fill="#37474f"/><rect x="${x + 14}" y="${by + 174}" width="${dw - 38}" height="70" fill="#90caf9" opacity="0.8"/>`;
    } else {
      b += `<rect x="${x + 6}" y="${by + 150}" width="${dw - 18}" height="180" fill="#eceff1" stroke="${trim}" stroke-width="2"/>`;
      for (let r = 1; r < 9; r++) b += `<line x1="${x + 6}" y1="${by + 150 + r * 20}" x2="${x + dw - 12}" y2="${by + 150 + r * 20}" stroke="#b0bec5" stroke-width="2"/>`;
    }
  }
  b += `<rect x="${bx + bw / 2 - 260}" y="${by + 50}" width="520" height="70" rx="6" fill="${accent}"/><text x="${bx + bw / 2}" y="${by + 97}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="bold" fill="#fff">${esc(name.toUpperCase())}</text>`;
  b += tree(70, 600, 1.1) + tree(1140, 600, 0.9);
  return svg(b, `${name}: front elevation and signage`);
}

function docks(name, i) {
  const [wall, trim, accent] = PALETTES[i % PALETTES.length];
  let b = sky("s") + `<polygon points="0,520 ${W},440 ${W},800 0,800" fill="#8d8d8d"/>`;
  b += `<polygon points="60,210 ${W - 40},170 ${W - 40},470 60,540" fill="${wall}" stroke="${trim}" stroke-width="4"/>`;
  for (let k = 0; k < 8; k++) {
    const x = 120 + k * 135, top = 250 - k * 5, bot = 470 - k * 9;
    b += `<polygon points="${x},${top + 40} ${x + 90},${top + 36} ${x + 90},${bot - 4} ${x},${bot}" fill="#eceff1" stroke="${trim}" stroke-width="2"/>`;
    b += `<rect x="${x - 4}" y="${bot - 2}" width="98" height="14" fill="#212121"/>`;
  }
  b += `<polygon points="300,560 760,520 760,650 300,700" fill="#fafafa" stroke="#607d8b" stroke-width="3"/><text x="530" y="615" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="bold" fill="${accent}">FREIGHT</text>`;
  b += `<circle cx="360" cy="705" r="22" fill="#212121"/><circle cx="700" cy="660" r="22" fill="#212121"/>`;
  return svg(b, `${name}: truck court and loading doors`);
}

function interior(name, i) {
  const [, trim, accent] = PALETTES[i % PALETTES.length];
  let b = `<rect width="${W}" height="${H}" fill="#cfd8dc"/><polygon points="0,560 ${W},560 ${W},800 0,800" fill="#b0a99f"/>`;
  b += `<rect x="0" y="0" width="${W}" height="90" fill="#90a4ae"/>`;
  for (let k = 0; k < 6; k++) b += `<rect x="${80 + k * 190}" y="96" width="120" height="10" fill="#fffde7"/><rect x="${80 + k * 190}" y="106" width="120" height="30" fill="#fff9c4" opacity="0.35"/>`;
  b += `<rect x="440" y="220" width="320" height="340" fill="#eceff1" stroke="${trim}" stroke-width="3"/>`;
  for (let r = 1; r < 17; r++) b += `<line x1="440" y1="${220 + r * 20}" x2="760" y2="${220 + r * 20}" stroke="#b0bec5" stroke-width="2"/>`;
  for (const x of [60, 880]) {
    for (let lv = 0; lv < 4; lv++) {
      b += `<rect x="${x}" y="${200 + lv * 90}" width="260" height="10" fill="${accent}"/>`;
      for (let bx = 0; bx < 4; bx++) b += `<rect x="${x + 10 + bx * 62}" y="${150 + lv * 90}" width="50" height="50" fill="#bcaaa4" stroke="#8d6e63"/>`;
    }
    b += `<rect x="${x}" y="150" width="10" height="410" fill="${trim}"/><rect x="${x + 250}" y="150" width="10" height="410" fill="${trim}"/>`;
  }
  b += `<rect x="60" y="590" width="1080" height="6" fill="#fdd835" opacity="0.8"/>`;
  return svg(b, `${name}: typical unit interior`);
}

function street(name, i) {
  const [wall, trim, accent] = PALETTES[i % PALETTES.length];
  let b = sky("s") + `<rect y="430" width="${W}" height="370" fill="#78909c"/><rect y="430" width="${W}" height="40" fill="#bdbdbd"/>`;
  b += `<rect x="260" y="250" width="680" height="180" fill="${wall}" stroke="${trim}" stroke-width="3"/><rect x="260" y="250" width="680" height="18" fill="${trim}"/>`;
  b += `<rect x="560" y="290" width="200" height="40" rx="4" fill="${accent}"/><text x="660" y="318" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="bold" fill="#fff">${esc(name.split(" ")[0].toUpperCase())}</text>`;
  for (let k = 0; k < 11; k++) b += `<line x1="${40 + k * 110}" y1="500" x2="${20 + k * 110}" y2="600" stroke="#fff" stroke-width="4"/>`;
  const cars = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#8e24aa"];
  for (let k = 0; k < 5; k++) { const x = 70 + k * 220 + (i * 37) % 60; b += `<rect x="${x}" y="525" width="80" height="40" rx="10" fill="${cars[(k + i) % 5]}"/><rect x="${x + 14}" y="512" width="52" height="22" rx="6" fill="${cars[(k + i) % 5]}"/>`; }
  b += `<rect y="640" width="${W}" height="8" fill="#fafafa" stroke-dasharray="40 30" stroke="#fafafa"/>`;
  b += tree(150, 440, 0.8) + tree(1040, 440, 0.9);
  return svg(b, `${name}: street view and parking`);
}

function floorplan(name, units) {
  const A = sm.PLAN_AREA, PW = sm.PLAN_W, PH = sm.PLAN_H;
  const X = (f) => f * PW, Y = (f) => f * PH;
  let b = `<rect width="${PW}" height="${PH}" fill="#ffffff"/>`;
  b += `<text x="${X(A.x)}" y="60" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="bold" fill="#263238">${esc(name)}</text>`;
  b += `<text x="${X(A.x)}" y="92" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#546e7a">Floor plan · ${units.length} units · ${units.reduce((s, u) => s + (Number(u.squareFeet) || 0), 0).toLocaleString("en-US")} SF · drawing, fictional</text>`;
  b += `<g transform="translate(${PW - 90},70)"><polygon points="0,-30 12,10 0,2 -12,10" fill="#263238"/><text x="0" y="34" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#263238">N</text></g>`;
  b += `<rect x="${X(A.x) - 10}" y="${Y(A.y) - 10}" width="${X(A.w) + 20}" height="${Y(A.h) + 20}" fill="none" stroke="#263238" stroke-width="10"/>`;
  for (const box of schematicLayout(units)) {
    const u = units.find((x) => x.id === box.unitId);
    const x = X(A.x + box.x * A.w), y = Y(A.y + box.y * A.h), w = X(box.w * A.w), h = Y(box.h * A.h);
    b += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fafafa" stroke="#455a64" stroke-width="3"/>`;
    b += `<rect x="${x + w * 0.3}" y="${y + h - 8}" width="${w * 0.4}" height="8" fill="#90a4ae"/>`;
    b += `<rect x="${x + 6}" y="${y + 6}" width="${Math.min(70, w * 0.35)}" height="${Math.min(50, h * 0.3)}" fill="#eceff1" stroke="#90a4ae"/>`;
    b += `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${w > 90 ? 20 : 14}" font-weight="bold" fill="#263238">${esc(u.name)}</text>`;
    b += `<text x="${x + w / 2}" y="${y + h / 2 + 22}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${w > 90 ? 14 : 11}" fill="#546e7a">${Number(u.squareFeet).toLocaleString("en-US")} SF</text>`;
  }
  b += `<text x="${X(A.x)}" y="${Y(A.y + A.h) + 50}" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#546e7a">Grey bars: grade-level / dock doors · small boxes: unit offices · truck court on the south side</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" role="img" aria-label="${esc(name)} floor plan">${b}</svg>\n`;
}

const deals = sp.buildSampleDeals(TEST_INPUTS);
let n = 0;
deals.forEach((d, i) => {
  const name = d.inputs.propertyName, s = sm.slug(name), units = d.inputs.units;
  const files = {
    [`${s}-exterior.svg`]: exterior(name, i, units.length),
    [`${s}-docks.svg`]: docks(name, i),
    [`${s}-interior.svg`]: interior(name, i),
    [`${s}-street.svg`]: street(name, i),
    [`${s}-floorplan.svg`]: floorplan(name, units),
  };
  for (const [f, body] of Object.entries(files)) { fs.writeFileSync(path.join(OUT, f), body); n++; }
});
fs.writeFileSync(path.join(OUT, "README.md"), "# Sample media (fictional drawings)\n\nDrawn exterior, truck court, interior and street views and a floor plan for each of Model Fund I's nine sample assets. Drawings for the fictional sample portfolio, not photographs. Made by `node scripts/sample-media/generate.cjs`; loaded with the sample portfolio (`lib/sampleMedia.js`).\n");
console.log(`wrote ${n} files to ${path.relative(R, OUT)}`);
