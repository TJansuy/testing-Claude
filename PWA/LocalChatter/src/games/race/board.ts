// Drop Race: the board for one race, made from its seed, so it's the same on
// every device. Pins are scattered at random densities (sparse in places,
// crowded in others); a few cups of tightly packed pins can catch small, dense
// messages; and a clear path is always carved from top to bottom. Only exact
// arithmetic (no trigonometry or exp), so every browser builds the same board.

export const W = 500;
export const H = 850;
export const PIN_R = 5;
/** Half the width of the guaranteed path: messages up to about this radius can always get through. */
export const PATH_HALF = 34;
const TOP = 110;
const BOTTOM = 800;

export interface Pin { x: number; y: number; cup: boolean }
export interface Board { pins: Pin[]; path: Array<{ x: number; y: number }> }

/** Seeded random numbers (mulberry32). */
export function rng(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Squared distance from a point to a line segment. */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}
const nearPath = (path: Board['path'], x: number, y: number, clear: number): boolean => {
  for (let i = 1; i < path.length; i++) {
    if (segDist2(x, y, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y) < clear * clear) return true;
  }
  return false;
};

/** A cup: a U of pins packed too close for anything to slip through, open at the top. */
function cup(cx: number, cy: number, inner: number, depth: number): Pin[] {
  const pins: Pin[] = [];
  const half = inner / 2 + PIN_R;
  const step = 2 * PIN_R + 1;
  for (let x = -half; x <= half + 0.01; x += step) pins.push({ x: cx + x, y: cy, cup: true }); // the bottom
  for (let y = step; y <= depth; y += step) {
    pins.push({ x: cx - half - (y > depth - step ? 3 : 0), y: cy - y, cup: true }); // the sides, lips flared
    pins.push({ x: cx + half + (y > depth - step ? 3 : 0), y: cy - y, cup: true });
  }
  return pins;
}

export function makeBoard(seed: string): Board {
  const rand = rng(seed + '|board');
  // The guaranteed way down: a wandering path, kept clear of pins.
  const path: Board['path'] = [];
  let px = 70 + rand() * (W - 140);
  for (let y = 0; y <= H + 40; y += 45) {
    path.push({ x: px, y });
    px = Math.min(W - PATH_HALF - 12, Math.max(PATH_HALF + 12, px + (rand() - 0.5) * 90));
  }
  // Cups: a few, away from the path.
  const pins: Pin[] = [];
  const cups: Array<{ x: number; y: number; r: number }> = [];
  const nCups = 2 + Math.floor(rand() * 3);
  for (let tries = 0; cups.length < nCups && tries < 200; tries++) {
    const inner = 26 + rand() * 16;
    const x = 40 + rand() * (W - 80), y = 260 + rand() * 470;
    const reach = inner / 2 + 2 * PIN_R + 6;
    if (nearPath(path, x, y - 20, PATH_HALF + reach + 14)) continue;
    if (cups.some((c) => (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y) < 150 * 150)) continue;
    cups.push({ x, y, r: reach + 30 });
    pins.push(...cup(x, y, inner, 26 + rand() * 10));
  }
  // Scattered pins: crowded near a few random hot spots, sparse elsewhere.
  const spots = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({ x: rand() * W, y: TOP + rand() * (BOTTOM - TOP), s: 0.5 + rand() * 0.7, k: 90 + rand() * 120 }));
  const density = (x: number, y: number): number => {
    let d = 0.12;
    for (const p of spots) d += p.s / (1 + ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y)) / (p.k * p.k));
    return d > 1 ? 1 : d;
  };
  const scattered: Pin[] = [];
  for (let i = 0; i < 2600; i++) {
    const x = 8 + rand() * (W - 16), y = TOP + rand() * (BOTTOM - TOP);
    const gap = 96 - 58 * density(x, y); // centre to centre: 96 where it's sparse, 38 where it's crowded
    if (nearPath(path, x, y, PATH_HALF + PIN_R)) continue;
    if (cups.some((c) => (c.x - x) * (c.x - x) + (c.y - 20 - y) * (c.y - 20 - y) < c.r * c.r)) continue;
    if (scattered.some((p) => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < gap * gap)) continue;
    scattered.push({ x, y, cup: false });
  }
  return { pins: pins.concat(scattered), path };
}
