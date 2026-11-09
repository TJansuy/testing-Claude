// A computer player that thinks with the real physics: it copies the game into
// a second physics module, looks ahead to find where it can reach the ball,
// then tries a few racket tilts and heights until one sends the ball in.
// Used for practice, and for the demo/test autoplay.
import { BASELINE, dirOf, EV, I, N, PHASE, Physics, racketOf, Side } from './physics';

interface Plan { key: number; ix: number; iy: number; at: number; dy: number; tilt: number; power: number; brush: number }
const HOME = 10.5;
const LEAD = 0.075; // seconds before reaching the ball to start the swing

export class Bot {
  private plan: Plan | null = null;
  private planned = -1;
  fallbacks = 0;
  constructor(private sd: Side, private look: Physics, private skill = 1) {}

  /** What the bot wants its racket to do now: [x, y, tilt]. */
  input(s: Float64Array): [number, number, number] {
    const sd = this.sd, dir = dirOf(sd);
    const phase = s[I.PHASE];
    // A new ball to deal with: a serve of ours, or a shot coming our way.
    const mine = phase === PHASE.SERVE ? s[I.SERVER] === sd : phase === PHASE.RALLY && s[I.LAST] !== sd;
    const key = phase === PHASE.SERVE ? 1000 + s[I.SCORE0] * 50 + s[I.SCORE1] + s[I.TOSSES] * 7 : s[I.RALLY_HITS];
    if (!mine) { this.plan = null; return [-dir * HOME, 1.1, 0]; }
    if (this.planned !== key) { this.planned = key; this.plan = this.think(s, key); }
    const p = this.plan;
    if (!p) return [-dir * HOME, 1.1, 0];
    return this.follow(p, s);
  }

  private copy(s: Float64Array): void {
    this.look.s.set(s.subarray(0, N));
    this.look.takeEvents();
  }

  /** Looks ahead (with the other racket out of the way) for places to hit the ball. */
  private intercepts(s: Float64Array): Array<{ x: number; y: number; at: number }> {
    const sd = this.sd, dir = dirOf(sd), L = this.look, o = 1 - sd as Side;
    this.copy(s);
    const out: Array<{ x: number; y: number; at: number }> = [];
    const serving = s[I.PHASE] === PHASE.SERVE;
    for (let i = 0; i < 180; i++) {
      L.setInput(o, dirOf(o) * -16, 0.2, 0);
      L.setInput(sd, -dir * HOME, 1.1, 0);
      L.s[racketOf(sd)] = -dir * 16; // keep our racket out of the way while we look
      L.step(1 / 120);
      const x = L.s[I.BX], y = L.s[I.BY], vy = L.s[I.BVY];
      if ((x < 0) !== (sd === 0) || Math.abs(x) > BASELINE + 2.5 || Math.abs(x) < 0.7) continue;
      const good = serving ? vy < 0 && y > 1.5 && y < 2.4 : y > 0.35 && y < 2.2 && (L.s[sd === 0 ? I.BOUNCE0 : I.BOUNCE1] > 0 || y > 0.8);
      if (good && (!out.length || L.s[I.CLOCK] - out[out.length - 1].at > 0.06)) out.push({ x, y, at: L.s[I.CLOCK] });
      if (L.s[I.PHASE] !== s[I.PHASE] && !serving) break;
    }
    return out.slice(0, 9);
  }

  /** Tries swings at each place until one lands in on the other side. */
  private think(s: Float64Array, key: number): Plan | null {
    const sd = this.sd, L = this.look, o = 1 - sd as Side;
    const tilts = [0, 0.1, -0.1, 0.2, -0.2, 0.3, 0.4];
    let fallback: Plan | null = null;
    for (const at of this.intercepts(s)) {
      // Swing speed (how far through the ball) and brushing up the back of it (topspin).
      for (const [power, brush] of [[0.6, 0.6], [0.4, 0.4], [0.9, 0.9], [0.6, 0.15], [0.3, 0.1], [1.5, 0.5], [0.25, 0.5], [0.8, 1.4]]) for (const tilt of tilts) {
        for (const dy of [0, -0.05, 0.05]) {
          const plan: Plan = { key, ix: at.x, iy: at.y, at: at.at, dy, tilt, power, brush };
          if (!fallback) fallback = plan;
          if (this.lands(s, plan, o)) return this.blur(plan);
        }
      }
    }
    this.fallbacks++;
    return fallback;
  }

  /** Plays a swing out in the look-ahead: does the shot's first bounce land in on the other side? */
  private lands(s: Float64Array, plan: Plan, o: Side): boolean {
    const sd = this.sd, L = this.look;
    this.copy(s);
    for (let i = 0; i < 360 && L.s[I.PHASE] < PHASE.POINT; i++) {
      const [x, y, t] = this.follow(plan, L.s);
      L.setInput(sd, x, y, t);
      L.setInput(o, dirOf(o) * -16, 0.2, 0);
      L.s[racketOf(o)] = dirOf(o) * -16;
      L.step(1 / 120);
      if ((L.takeEvents() & EV.BOUNCE) && L.s[I.LAST] === sd) {
        const x2 = L.s[I.BX];
        return (x2 < 0) === (o === 0) && Math.abs(x2) <= BASELINE - 0.3 && L.s[I.CROSSED] > 0;
      }
    }
    return false;
  }

  private follow(p: Plan, s: Float64Array): [number, number, number] {
    const dir = dirOf(this.sd);
    // Wait behind the ball, then swing through it: how far through sets the racket's speed.
    return p.at - s[I.CLOCK] > LEAD ? [p.ix - dir * 0.85, p.iy + p.dy, p.tilt] : [p.ix + dir * p.power, p.iy + p.dy + p.brush, p.tilt];
  }

  /** A less skilful bot aims a little off. */
  private blur(p: Plan): Plan {
    if (this.skill >= 1) return p;
    const k = 1 - this.skill;
    return { ...p, dy: p.dy + (Math.random() - 0.5) * 0.12 * k, tilt: p.tilt + (Math.random() - 0.5) * 0.3 * k };
  }
}
