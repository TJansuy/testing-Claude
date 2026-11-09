// What's drawn: a dusk sky, the court, the net, the rackets and the ball (with
// its spin, trail, shadow and glow), and sparks and dust when things happen.
import { BASELINE, dirOf, EV, I, NET_H, RACKET_HALF, Side } from './physics';
import { Kind, Renderer, RGBA } from './render';

export const SIDE_COLOURS: [RGBA, RGBA] = [[1, 0.42, 0.34, 1], [0.24, 0.78, 1, 1]];
const BALL: RGBA = [0.86, 0.95, 0.25, 1];
const LINE: RGBA = [0.96, 0.97, 1, 0.95];

/** Heights are drawn stretched (the physics isn't): a court is 24 m long but the ball
 *  rarely goes above 4 m, so at true proportions it would be a thin strip. */
let K = 2.5;
const X0 = -14.2, X1 = 14.2, BOTTOM = -0.5;
function stretchFor(canvas: HTMLCanvasElement): number {
  const tall = (X1 - X0) * canvas.clientHeight / Math.max(1, canvas.clientWidth); // world units visible, unstretched
  return Math.max(1, Math.min(3.2, tall / 5.6));
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; col: RGBA; size: number }
const trail: Array<[number, number]> = [];
const sparks: Spark[] = [];

/** Adds sparks or dust for this frame's events. */
export function burst(events: number, s: Float64Array): void {
  const x = s[I.BX], y = s[I.BY];
  const add = (n: number, col: RGBA, speed: number, size: number, up = 0): void => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      sparks.push({ x, y: y * K, vx: Math.cos(a) * v, vy: Math.sin(a) * v + up, life: 1, col, size });
    }
  };
  if (events & EV.HIT) add(14, [1, 0.95, 0.6, 1], 5, 0.05);
  if (events & EV.BOUNCE) add(8, [0.85, 0.9, 1, 0.8], 1.6, 0.06, 1);
  if (events & EV.NET) add(6, [1, 1, 1, 0.8], 1.5, 0.04);
}

export function draw(r: Renderer, s: Float64Array, mirror: boolean, dt: number, canvas: HTMLCanvasElement): void {
  K = stretchFor(canvas);
  const Y = (y: number): number => y * K;
  const view = r.begin(X0, X1, BOTTOM * K, mirror);
  const top = view.top;
  // Sky and distant hills.
  const floor = BOTTOM * K;
  r.quad(Kind.Gradient, 0, (top + floor) / 2, 30, (top - floor) / 2 + 1, [0.98, 0.62, 0.45, 1], [0.12, 0.16, 0.36, 1]);
  r.quad(Kind.Glow, 6, 2.6, 9, 6, [1, 0.85, 0.6, 0.55], [1.6, 0, 0, 0]);
  for (const [hx, hr, c] of [[-9, 7, 0.24], [2, 9, 0.2], [12, 6, 0.27]] as const) r.quad(Kind.Ellipse, hx, -1.5, hr, 4.4, [c, c * 0.95, c * 1.5, 1]);
  // The court: surround, playing surface and lines.
  r.quad(Kind.Box, 0, floor / 2, 20, -floor / 2 + 0.01, [0.15, 0.32, 0.36, 1]);
  r.quad(Kind.Box, 0, -0.08, BASELINE, 0.08, [0.13, 0.46, 0.55, 1]);
  r.quad(Kind.Box, 0, -0.012, BASELINE, 0.012, LINE);
  for (const x of [-BASELINE, BASELINE, -6.4, 6.4]) r.quad(Kind.Box, x, -0.03, 0.04, 0.05, LINE);
  // The ball's shadow, stretched and fainter the higher it is.
  const bx = s[I.BX], by = s[I.BY];
  const h = Math.max(0, by);
  r.quad(Kind.Glow, bx, 0.005, 0.16 + h * 0.06, 0.035, [0, 0, 0, Math.max(0.05, 0.45 - h * 0.08)], [1.2, 0, 0, 0]);
  // The net: posts, mesh and its white tape.
  r.quad(Kind.Box, 0, Y(0.535), 0.035, Y(0.535), [0.2, 0.22, 0.26, 1], [0.02, 0, 0, 0]);
  r.quad(Kind.Net, 0, Y(NET_H / 2), 0.06, Y(NET_H / 2), [0.95, 0.97, 1, 0.75], [0.045, 0, 0, 0]);
  r.quad(Kind.Box, 0, Y(NET_H), 0.07, 0.025, [0.98, 0.98, 1, 1], [0.02, 0, 0, 0]);
  // Rackets: handle, then the strung head (face pointing towards the net).
  for (const sd of [0, 1] as Side[]) {
    const o = sd === 0 ? I.R0 : I.R1, x = s[o], y = Y(s[o + 1]), tilt = s[o + 4], dir = dirOf(sd);
    const nx = dir * Math.cos(tilt), ny = Math.sin(tilt); // face normal
    // Along the head, pointing up, in the stretched drawing.
    let ax = dir * -ny, ay = dir * nx * K;
    const len = Math.hypot(ax, ay); ax /= len; ay /= len;
    const half = RACKET_HALF * len; // its true (stretched) length, so what you see is what hits
    const angle = Math.atan2(-ax, ay);                     // turns a shape's local y onto that
    const col = SIDE_COLOURS[sd];
    const hx = x - ax * (half + 0.24), hy = y - ay * (half + 0.24);
    r.quad(Kind.Box, hx, hy, 0.03, 0.24, [0.12, 0.12, 0.16, 1], [0.03, 0, 0, 0], angle);
    r.quad(Kind.Glow, x, y, 0.7, 0.9, [col[0], col[1], col[2], 0.25], [2, 0, 0, 0]);
    r.quad(Kind.Racket, x, y, 0.16, half + 0.01, col, [0.035, 0.05, 0.95, 0], angle);
  }
  // The ball: a glowing trail, then the ball (shown a little larger than life so it's easy to follow).
  trail.push([bx, Y(by)]);
  if (trail.length > 14) trail.shift();
  trail.forEach(([tx, ty], i) => r.quad(Kind.Glow, tx, ty, 0.12, 0.12, [0.86, 0.95, 0.3, (i / trail.length) * 0.35], [1.5, 0, 0, 0]));
  r.quad(Kind.Glow, bx, Y(by), 0.3, 0.3, [0.9, 1, 0.4, 0.35], [2, 0, 0, 0]);
  r.quad(Kind.Ball, bx, Y(by), 0.11, 0.11, BALL, [s[I.BA], 0, 0, 0]);
  // Sparks and dust.
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt * K; p.life -= dt * 2.2;
    if (p.life <= 0) { sparks.splice(i, 1); continue; }
    r.quad(Kind.Glow, p.x, p.y, p.size, p.size, [p.col[0], p.col[1], p.col[2], p.col[3] * p.life], [1, 0, 0, 0]);
  }
  r.end();
}

/** Screen position (CSS pixels) → world position, for pointer control. */
export function toWorld(canvas: HTMLCanvasElement, px: number, py: number, mirror: boolean): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const per = (X1 - X0) / rect.width;
  let x = X0 + (px - rect.left) * per;
  if (mirror) x = -x;
  return [x, (BOTTOM * K + (rect.bottom - py) * per) / K];
}
