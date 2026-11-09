// The game loop, in fixed 1/120 s ticks.
//   demo      two computer players (while you wait, or before you join)
//   practice  you (left) against the computer
//   host      against another device, left side: this device runs the physics and sends the state
//   guest     against another device, right side: sends its racket; runs the physics too, between
//             updates, so the ball moves smoothly, and takes the host's state as it comes,
//             moved on to its own (smoothly kept) game time, so only real differences get corrected
import { Bot } from './bot';
import { Controls } from './input';
import type { Link } from './p2p';
import { EV, I, N, Physics, Side } from './physics';
import { Renderer } from './render';
import { burst, draw } from './scene';
import { play } from './sound';

export type Mode = 'demo' | 'practice' | 'host' | 'guest';
const TICK = 1 / 120;
const SEND_EVERY = 2; // ticks between state updates (60 a second)

export class Game {
  mode: Mode = 'demo';
  link: Link | null = null;
  /** Called with each frame's events (for the scoreboard and messages). */
  onEvents: (events: number) => void = () => {};
  private bots: [Bot | null, Bot | null] = [null, null];
  private remote: [number, number, number] = [9, 1, 0];
  private ahead = 0;   // how far our game time runs ahead of the host's updates, smoothed (guest)
  private acc = 0;
  private last = 0;
  private ticks = 0;
  private dirty = false; // time to send an update (at most one per frame)
  private pending = 0; // events since the last state update (host)
  private heard = 0;   // events from the host since the last frame (guest)
  /** How far our ball was from the host's, when its updates arrive (metres; median of the last 120). */
  readonly drift: number[] = [];

  constructor(readonly phys: Physics, private makeLook: () => Physics, private renderer: Renderer, private controls: Controls, private canvas: HTMLCanvasElement) {
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Which side this device plays (−1 if none). */
  get side(): -1 | Side { return this.mode === 'guest' ? 1 : this.mode === 'demo' ? -1 : 0; }

  /** Starts a fresh game in a mode. autoplay: the computer plays your side too (demos and tests). */
  start(mode: Mode, seed: number, autoplay = false): void {
    this.mode = mode;
    this.phys.init(seed || 1);
    this.phys.takeEvents();
    const local = mode === 'demo' || mode === 'practice';
    this.bots = [
      mode === 'demo' || (autoplay && (mode === 'practice' || mode === 'host')) ? new Bot(0, this.makeLook()) : null,
      mode === 'demo' || mode === 'practice' || (autoplay && mode === 'guest') ? new Bot(1, this.makeLook(), local && mode === 'practice' ? 0.8 : 1) : null,
    ];
    this.remote = [9, 1, 0];
    this.controls.home(this.side === 1 ? 9 : -9);
    this.acc = 0;
  }

  /** The other player's racket (host). */
  remoteInput(x: number, y: number, tilt: number): void { this.remote = [x, y, tilt]; }

  /** The host's state (guest): take it all, except our own racket. */
  hostState(s: number[], events: number): void {
    if (s.length < N - 2) return;
    const st = this.phys.s;
    const keep = this.mode === 'guest' ? Array.from(st.subarray(I.R1, I.R1 + 5)) : null;
    const acc = st[I.ACC];
    const bx = st[I.BX], by = st[I.BY];
    // Our game time is ahead of this update by however long it took to get here.
    const diff = Math.min(0.2, Math.max(0, st[I.CLOCK] - s[I.CLOCK]));
    // (A new game resets the clock: start again from a small guess.)
    this.ahead = s[I.CLOCK] < 0.05 ? 0.02 : Math.abs(diff - this.ahead) > 0.15 ? diff : this.ahead * 0.92 + diff * 0.08;
    st.set(s.slice(0, N));
    st[I.ACC] = acc;
    if (keep) st.set(keep, I.R1);
    // Bring it up to our game time.
    this.phys.step(this.ahead);
    this.phys.takeEvents();
    if (keep) st.set(keep, I.R1);
    this.drift.push(Math.hypot(st[I.BX] - bx, st[I.BY] - by));
    if (this.drift.length > 120) this.drift.shift();
    this.heard |= events;
  }

  private input(sd: Side): [number, number, number] {
    const bot = this.bots[sd];
    if (bot) return bot.input(this.phys.s);
    if (sd === this.side) return [this.controls.x, this.controls.y, this.controls.tilt];
    return this.remote;
  }

  private tick(): number {
    const p = this.phys;
    if (this.mode === 'guest') {
      const [x, y, t] = this.input(1);
      p.setInput(1, x, y, t);
      p.step(TICK);
      p.takeEvents(); // the host decides what happened
      if (++this.ticks % SEND_EVERY === 0) this.dirty = true;
      return 0;
    }
    for (const sd of [0, 1] as Side[]) { const [x, y, t] = this.input(sd); p.setInput(sd, x, y, t); }
    p.step(TICK);
    const ev = p.takeEvents();
    if (this.mode === 'host') {
      this.pending |= ev;
      if (++this.ticks % SEND_EVERY === 0) this.dirty = true;
    }
    return ev;
  }

  /** Sends this frame's update: the host's state, or the guest's racket. */
  private send(): void {
    this.dirty = false;
    const p = this.phys, link = this.link as Link;
    if (this.mode === 'host') { link.send({ t: 'st', s: Array.from(p.s), e: this.pending }); this.pending = 0; }
    else if (this.mode === 'guest') { const [x, y, t] = this.input(1); link.send({ t: 'in', x, y, tilt: t }); }
  }

  private frame(now: number): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.controls.update(dt);
    this.acc += dt;
    let events = 0;
    while (this.acc >= TICK) { events |= this.tick(); this.acc -= TICK; }
    if (this.mode === 'guest') { events |= this.heard; this.heard = 0; }
    if (this.dirty && this.link) this.send();
    if (events) {
      burst(events, this.phys.s);
      if (this.mode !== 'demo') play(events, this.phys.s[I.POINT_TO] === this.side);
      this.onEvents(events);
    }
    draw(this.renderer, this.phys.s, this.side === 1, dt, this.canvas);
    requestAnimationFrame((t) => this.frame(t));
  }
}

export { EV };
