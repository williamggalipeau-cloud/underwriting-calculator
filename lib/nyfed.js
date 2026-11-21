// ─── Live SOFR from the New York Fed Markets Data API ────────────────────────
// Public, free API built for programmatic use; it allows cross-origin reads
// (including from this site's GitHub Pages origin), so the browser fetches it
// directly. https://markets.newyorkfed.org/static/docs/markets-api.html
//   - SOFR:            /api/rates/secured/sofr/last/1.json
//   - SOFR averages:   /api/rates/secured/sofrai/last/1.json (30/90/180-day)

const BASE = "https://markets.newyorkfed.org/api/rates/secured";

async function getJSON(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`NY Fed API returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Returns { sofr: {rate, date}, avg30: {rate, date}, avg90, avg180, fetchedAt }
// or throws if neither request succeeds.
export async function fetchNyFedRates() {
  const [sofr, avg] = await Promise.allSettled([
    getJSON(`${BASE}/sofr/last/1.json`),
    getJSON(`${BASE}/sofrai/last/1.json`),
  ]);
  const s = sofr.status === "fulfilled" ? sofr.value?.refRates?.[0] : null;
  const a = avg.status === "fulfilled" ? avg.value?.refRates?.[0] : null;
  if (!s && !a) throw new Error("Couldn't reach the NY Fed API.");
  return {
    sofr: s ? { rate: s.percentRate, date: s.effectiveDate } : null,
    avg30: a ? { rate: a.average30day, date: a.effectiveDate } : null,
    avg90: a ? { rate: a.average90day, date: a.effectiveDate } : null,
    avg180: a ? { rate: a.average180day, date: a.effectiveDate } : null,
    fetchedAt: new Date().toISOString(),
  };
}

// Parallel-shifts a forward curve so its first 30-day-average point equals the
// live NY Fed 30-day average. Returns the shifted curve and the shift in bp.
export function anchorCurveToLive(curve, liveAvg30) {
  const shift = liveAvg30 - curve.points[0][2];
  return {
    shiftBp: shift * 100,
    curve: {
      ...curve,
      anchoredTo: { rate: liveAvg30, shiftBp: shift * 100 },
      points: curve.points.map(([d, t, a]) => [d, +(t + shift).toFixed(5), +(a + shift).toFixed(5)]),
    },
  };
}
