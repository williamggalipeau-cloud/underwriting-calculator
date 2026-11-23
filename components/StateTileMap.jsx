"use client";

// Phase L leftover: the fund's assets on a drawn US state grid (no map image),
// each state's circle sized by its share of fund value.
const TILES = {
  AK: [0, 0], ME: [10, 0], VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], WI: [6, 2], MI: [7, 2], NY: [8, 2], RI: [9, 2], MA: [10, 2],
  OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3],
  CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
  HI: [0, 7], TX: [3, 7], FL: [8, 7],
};
export const TILE_STATES = Object.keys(TILES);

export default function StateTileMap({ states = [], limitPct = null }) {
  const S = 34, G = 3;
  const by = new Map(states.map((s) => [String(s.name ?? "").toUpperCase(), s]));
  const max = Math.max(1, ...states.map((s) => s.valuePct ?? 0));
  return (
    <svg viewBox={`0 0 ${11 * (S + G)} ${8 * (S + G)}`} className="w-full max-w-md" role="img" aria-label="Fund assets by state, sized by share of value" data-testid="state-map">
      {Object.entries(TILES).map(([st, [c, r]]) => {
        const s = by.get(st);
        const x = c * (S + G), y = r * (S + G);
        const over = s && limitPct != null && s.valuePct > limitPct;
        return (
          <g key={st} data-testid={s ? "state-tile-held" : undefined}>
            <rect x={x} y={y} width={S} height={S} rx="4" fill={s ? (over ? "#fee2e2" : "#dbeafe") : "#f3f4f6"} stroke={s ? (over ? "#dc2626" : "#2563eb") : "#e5e7eb"} />
            {s && <circle cx={x + S / 2} cy={y + S / 2 + 3} r={4 + 11 * Math.sqrt((s.valuePct ?? 0) / max)} fill={over ? "#dc2626" : "#2563eb"} opacity="0.55" />}
            <text x={x + S / 2} y={y + 11} textAnchor="middle" fontSize="9" fontWeight={s ? 700 : 400} fill={s ? "#111827" : "#9ca3af"}>{st}</text>
            {s && <title>{`${st}: ${s.valuePct.toFixed(1)}% of fund value, ${s.assets} asset${s.assets === 1 ? "" : "s"}`}</title>}
          </g>
        );
      })}
    </svg>
  );
}
