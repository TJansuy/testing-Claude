// Little synthesised sounds (no audio files): the strings, a bounce, the net,
// and a chime for each point. Browsers only allow sound after a tap or key.
import { EV } from './physics';

let ctx: AudioContext | null = null;
let muted = false;
export const setMuted = (m: boolean): void => { muted = m; };
export const isMuted = (): boolean => muted;

export function unlockSound(): void {
  if (!ctx) { try { ctx = new AudioContext(); } catch { return; } }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, len: number, type: OscillatorType, vol: number, slide = 1, when = 0): void {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * slide, t + len);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

/** Plays the sounds for a frame's events. */
export function play(events: number, won: boolean): void {
  if (events & EV.HIT) { tone(520, 0.08, 'triangle', 0.35, 0.5); tone(1800, 0.03, 'square', 0.06); }
  if (events & EV.BOUNCE) tone(180, 0.09, 'sine', 0.3, 0.6);
  if (events & EV.NET) tone(110, 0.18, 'sawtooth', 0.12, 0.8);
  if (events & EV.POINT) { tone(won ? 660 : 330, 0.15, 'sine', 0.18); tone(won ? 990 : 262, 0.25, 'sine', 0.15, 1, 0.12); }
}
