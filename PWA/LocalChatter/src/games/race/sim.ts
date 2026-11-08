// Drop Race: the simulation. Every device runs exactly the same race: a fixed
// virtual board, seeded randomness, plain arithmetic, fixed time steps, and
// every entry dropped at the step given by the relay's timestamp. So the same
// message wins everywhere, whatever the screen size. The board itself (pins and
// cups) is made from the race's seed in board.ts.

import { Board, H, makeBoard, Pin, PIN_R, rng, W } from './board';

export { H, W, PIN_R };
export const HZ = 120;
const DT = 1 / HZ;
const MAX_SPEED = 900; // so nothing passes clean through a pin in one step
export const READY = Math.round(1.6 * HZ); // pins take this long to come out
const STUCK_MOVE = 14; // a message that moves less than this…
const STUCK_STEPS = Math.round(1.4 * HZ); // …in this long is stuck
const MAX_AGE = 25 * HZ;
const QUIET = 6 * HZ; // after the last ball is gone, wait this long for more entries
const EMPTY_ROUND = 45 * HZ;
const PROMPT = 3 * HZ; // between rounds

export type { Pin };
export interface Entry { from: { id: string; name: string }; text: string; at: number; seq: number }
export interface Ball {
  n: number; entry: Entry; x: number; y: number; vx: number; vy: number; r: number;
  /** How dense it is (from the length of its words), how heavy, and how it falls and bounces. */
  density: number; mass: number; gravity: number; drag: number; bounce: number;
  age: number; round: number;
  /** Where it was when it last moved a fair way, and when. */
  ax: number; ay: number; aStep: number;
}
export type Phase = 'pins' | 'running' | 'prompt' | 'won' | 'failed' | 'stopped';
export interface Burn { ball: Ball; step: number }

const wordsOf = (text: string): string[] => text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);

/** How a message behaves:
 *  - size from how many words it has (one word: tiny; a long sentence: big);
 *  - density from how long its words are (one very long word: extremely dense);
 *  - mass = density × area, so a big, light sentence can outweigh a small, dense
 *    word and shove it aside;
 *  - denser messages fall faster (more gravity, less air drag) and bounce less. */
export function physicsOf(text: string): { r: number; density: number; mass: number; gravity: number; drag: number; bounce: number } {
  const words = wordsOf(text);
  const n = Math.max(1, words.length);
  const avg = words.length ? words.reduce((t, w) => t + w.length, 0) / words.length : 1;
  const r = Math.min(40, 10 + 7 * Math.sqrt(n - 1));
  const density = Math.min(16, 0.5 + (avg * avg) / 16);
  const root = Math.sqrt(density);
  return {
    r, density, mass: density * r * r,
    gravity: 360 * (1 + 0.25 * root),
    drag: 1.3 / (1 + 0.5 * density),
    bounce: 0.75 / (1 + 0.18 * density),
  };
}
/** 0 (light and fluffy) to 1 (as dense as it gets), for drawing. */
export const heft = (b: Ball): number => Math.min(1, (b.density - 0.5) / 15.5);

export class World {
  step = 0;
  phase: Phase = 'pins';
  round = 1;
  roundStart = READY;
  lastDrop = 0;
  inRound = new Set<string>();
  balls: Ball[] = [];
  burns: Burn[] = [];
  winner: Ball | null = null;
  phaseStep = 0;
  private count = 0;
  private next = 0;
  private rand: () => number;
  readonly board: Board;

  /** entries: sorted by the relay's time; stopStep: when someone stopped it. */
  constructor(seed: string, private start: number, private entries: Entry[], private stopStep = Infinity) {
    this.rand = rng(seed);
    this.board = makeBoard(seed);
  }

  /** The step an entry arrives at (by the relay's clock). */
  stepOf(at: number): number { return Math.max(0, Math.ceil(((at - this.start) / 1000) * HZ)); }

  private setPhase(p: Phase): void { this.phase = p; this.phaseStep = this.step; }
  get over(): boolean { return this.phase === 'won' || this.phase === 'failed' || this.phase === 'stopped'; }

  /** Runs the race forward to the given step. */
  advance(to: number): void {
    while (this.step < to && !this.over) this.tick();
  }

  private tick(): void {
    const s = ++this.step;
    if (s >= this.stopStep) { this.setPhase('stopped'); return; }
    if (this.phase === 'pins' && s >= READY) this.setPhase('running');
    if (this.phase === 'prompt' && s - this.phaseStep >= PROMPT) { this.round++; this.roundStart = s; this.inRound.clear(); this.setPhase('running'); }
    // New entries: one per person per round. While the pins come out, or between
    // rounds, they wait at the top.
    while (this.next < this.entries.length && this.stepOf(this.entries[this.next].at) <= s && this.phase === 'running') {
      const e = this.entries[this.next++];
      if (this.inRound.has(e.from.id)) continue;
      this.inRound.add(e.from.id);
      this.drop(e);
    }
    if (this.phase !== 'running') return;
    this.physics();
    // Nobody made it: everything burned (and no one's entered for a while), or nobody entered at all.
    if (!this.balls.length && (this.inRound.size ? s - this.lastDrop >= QUIET : s - this.roundStart >= EMPTY_ROUND)) {
      this.setPhase(this.round === 1 ? 'prompt' : 'failed');
    }
  }

  private drop(e: Entry): void {
    const ph = physicsOf(e.text);
    // Dropped from anywhere along the top.
    this.balls.push({
      n: this.count++, entry: e, ...ph,
      x: ph.r + this.rand() * (W - 2 * ph.r), y: -ph.r - this.rand() * 30, vx: (this.rand() - 0.5) * 80, vy: 30 + this.rand() * 40,
      age: 0, round: this.round, ax: 0, ay: -1e9, aStep: 0,
    });
    this.lastDrop = this.step;
  }

  private burn(b: Ball): void {
    this.balls.splice(this.balls.indexOf(b), 1);
    this.burns.push({ ball: b, step: this.step });
    this.lastDrop = Math.max(this.lastDrop, this.step - QUIET + 2 * HZ); // a moment for anyone still typing
  }

  private physics(): void {
    const balls = this.balls;
    for (const b of balls) {
      b.vy += b.gravity * DT;
      b.vx *= 1 - b.drag * DT; // light messages drift, dense ones plummet
      b.vy *= 1 - b.drag * DT;
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > MAX_SPEED * MAX_SPEED) { const k = MAX_SPEED / Math.sqrt(sp2); b.vx *= k; b.vy *= k; }
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.age++;
      const e = b.bounce;
      // Pins (only the rows near the ball).
      for (const p of this.board.pins) {
        if (p.y < b.y - b.r - PIN_R || p.y > b.y + b.r + PIN_R) continue;
        const dx = b.x - p.x, dy = b.y - p.y;
        const min = b.r + PIN_R;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        b.x += nx * (min - d);
        b.y += ny * (min - d);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + e) * vn * nx;
          b.vy -= (1 + e) * vn * ny;
          b.vx += (this.rand() - 0.5) * 30 * e; // pins aren't perfectly round
        }
      }
      // The sides of the board.
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * e; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * e; }
    }
    // Messages bump into each other (heavier ones push lighter ones about).
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const push = (min - d) / (a.mass + b.mass);
        a.x -= nx * push * b.mass; a.y -= ny * push * b.mass;
        b.x += nx * push * a.mass; b.y += ny * push * a.mass;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const e = Math.min(a.bounce, b.bounce);
          const imp = (-(1 + e) * vn) / (1 / a.mass + 1 / b.mass);
          a.vx -= (imp / a.mass) * nx; a.vy -= (imp / a.mass) * ny;
          b.vx += (imp / b.mass) * nx; b.vy += (imp / b.mass) * ny;
        }
      }
    }
    // Through the bottom: the first one wins. Stuck (or bouncing about too long): it burns.
    for (const b of balls.slice()) {
      if (b.y - b.r > H) { this.winner = b; this.setPhase('won'); return; }
      const mx = b.x - b.ax, my = b.y - b.ay;
      if (mx * mx + my * my > STUCK_MOVE * STUCK_MOVE) { b.ax = b.x; b.ay = b.y; b.aStep = b.age; }
      if (b.age - b.aStep >= STUCK_STEPS || b.age >= MAX_AGE) this.burn(b);
    }
  }
}
