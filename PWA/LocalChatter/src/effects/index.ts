// Chat effects: fire, earthquake, lightning and zalgo. Triggered by /fire,
// /earthquake (or /quake), /lightning and /zalgo, each optionally followed by:
//   (nothing)          its usual length (a short burst; zalgo lasts 10 seconds)
//   30, 30s, 2m        that long (up to 10 minutes)
//   on                 until someone sends /<effect> off
//   off                stop it now
// Sending it again while it's running resets the timer. Only one effect runs at
// a time: starting a different one replaces it. Respects "reduce motion".
import { startBlackhole } from './blackhole';
import { startBlur } from './blur';
import { startFire } from './fire';
import { startLightning } from './lightning';
import { quakeRumble, startQuake } from './quake';
import { startRain } from './rain';
import { EffectControl, setVibration } from './shared';
import { startZalgoEffect, zalgoActive } from './zalgo';

export type EffectName = 'fire' | 'earthquake' | 'lightning' | 'zalgo' | 'blackhole' | 'blur' | 'rain';
export type EffectArg = number | 'on' | 'off' | null;
export interface ParsedEffect { name: EffectName; arg: EffectArg; argText: string }

const COMMANDS: Record<string, EffectName> = {
  fire: 'fire', earthquake: 'earthquake', quake: 'earthquake', lightning: 'lightning', zalgo: 'zalgo',
  blackhole: 'blackhole', blur: 'blur', rain: 'rain',
};
const MAX_S = 600;
export const DEFAULT_MS: Record<EffectName, number> = {
  fire: 2200, earthquake: 1600, lightning: 1100, zalgo: 10000, blackhole: 10000, blur: 10000, rain: 12000,
};
const STARTERS: Record<EffectName, () => EffectControl> = {
  fire: startFire, earthquake: startQuake, lightning: startLightning, zalgo: startZalgoEffect,
  blackhole: startBlackhole, blur: startBlur, rain: startRain,
};

/** Reads "/fire 30" etc. Anything else after the command means it's ordinary text. */
export function parseEffect(text: string | undefined): ParsedEffect | null {
  const m = /^\s*\/([a-z]+)(?:\s+(\S+))?\s*$/i.exec(String(text || ''));
  if (!m) return null;
  const name = COMMANDS[m[1].toLowerCase()];
  if (!name) return null;
  const raw = m[2];
  if (!raw) return { name, arg: null, argText: '' };
  const a = raw.toLowerCase();
  if (a === 'off' || a === 'stop') return { name, arg: 'off', argText: 'off' };
  if (a === 'on' || a === 'forever') return { name, arg: 'on', argText: 'on' };
  const d = /^(\d{1,4})(s|m)?$/.exec(a);
  if (!d) return null;
  const secs = Math.min(MAX_S, parseInt(d[1], 10) * (d[2] === 'm' ? 60 : 1));
  if (!secs) return null;
  return { name, arg: secs, argText: a };
}

// ---------------------------------------------------------------- runner
interface Running { ctrl: EffectControl; timer: ReturnType<typeof setTimeout> | undefined }
const active: Partial<Record<EffectName, Running>> = {};

function announce(name: EffectName, on: boolean): void {
  document.dispatchEvent(new CustomEvent('localchatter:fx', { detail: { name, active: on } }));
}

function stopEffect(name: EffectName, early: boolean, hard = false): void {
  const a = active[name];
  if (!a) return;
  clearTimeout(a.timer);
  delete active[name];
  try { a.ctrl.stop(early, hard); } catch { /* already gone */ }
  announce(name, false);
}

/** Starts, extends or stops an effect. arg: null (usual length), seconds, 'on' or 'off'. */
export function play(name: EffectName, arg: EffectArg = null): boolean {
  if (arg === 'off') { stopEffect(name, true); return true; }
  let a = active[name];
  if (!a) {
    // Effects never overlap: a different effect replaces whatever is running, at once.
    (Object.keys(active) as EffectName[]).forEach((other) => stopEffect(other, true, true));
    let ctrl: EffectControl;
    try { ctrl = STARTERS[name](); } catch { return false; }
    a = active[name] = { ctrl, timer: undefined };
    announce(name, true);
  }
  clearTimeout(a.timer);
  a.timer = undefined;
  if (arg === 'on') return true;
  const ms = typeof arg === 'number' ? arg * 1000 : DEFAULT_MS[name];
  a.timer = setTimeout(() => stopEffect(name, false), ms);
  return true;
}

export const isActive = (name: EffectName): boolean => !!active[name];
export const activeNames = (): EffectName[] => Object.keys(active) as EffectName[];
export const canVibrate = 'vibrate' in navigator;
export { setVibration, quakeRumble, zalgoActive };
