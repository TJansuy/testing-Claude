// Languages and sender colours.
//
// Each device has a list of languages it understands (starting with "Default" and
// "System"). Messages are in Default, System (join/leave lines and system
// notices) or a named language. Text in a language the viewer doesn't understand
// is shown as gibberish in that language's own style. The gibberish is seeded by
// the message, so it's the same every time and on every device.
import { KEY, load, save } from './storage';

const DEFAULTS = ['Default', 'System'];
const MAX_LANGS = 20;

// "elvish", " Elvish " and "ELVISH" are the same language; shown as first written.
const id = (name: string | undefined): string => String(name || '').trim().toLowerCase();

export function cleanName(name: string | undefined): string {
  return String(name || '').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}
export function split(text: string): string[] {
  return String(text || '').split(',').map(cleanName).filter(Boolean);
}

// ------------------------------------------------------------- the list
export function known(): string[] {
  try {
    const list = JSON.parse(load(KEY.languages)) as unknown;
    if (Array.isArray(list)) return list.map(String);
  } catch { /* first run */ }
  return DEFAULTS.slice();
}
export function setKnown(list: string[]): string[] {
  const seen: Record<string, true> = {};
  const out: string[] = [];
  list.map(cleanName).forEach((n) => {
    if (n && !seen[id(n)] && out.length < MAX_LANGS) { seen[id(n)] = true; out.push(n); }
  });
  save(KEY.languages, JSON.stringify(out));
  // Can't keep writing in a language you no longer know.
  if (speaking() && !understands(speaking())) setSpeaking('');
  return out;
}
export const add = (names: string[]): string[] => setKnown(known().concat(names));
export function remove(names: string[]): string[] {
  const drop = names.map(id);
  return setKnown(known().filter((n) => drop.indexOf(id(n)) < 0));
}
export function reset(): string[] { setSpeaking(''); return setKnown(DEFAULTS.slice()); }

export function understands(lang: string | undefined): boolean {
  const l = id(lang || 'default');
  return known().some((n) => id(n) === l);
}
/** How to show a language's name: your own spelling if you know it, else capitalised. */
export function nameOf(lang: string): string {
  const l = id(lang);
  const mine = known().filter((n) => id(n) === l)[0];
  if (mine) return mine;
  const n = cleanName(lang);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** The language you write in ('' = Default). */
export const speaking = (): string => load(KEY.speak);
export function setSpeaking(lang: string): void {
  const n = cleanName(lang);
  save(KEY.speak, id(n) === 'default' ? '' : n);
}
export const isDefault = (lang: string | undefined): boolean => !lang || id(lang) === 'default';

// --------------------------------------------------------------- hashing
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- gibberish
// Each language gets one of these sound sets, picked by its name, so Elvish
// always looks like Elvish. System looks like machine code.
const STYLES = [
  ['ka', 'ro', 'th', 'el', 'vy', 'an', 'dur', 'mi', 'sha', 'qe', 'lo', 'zin', 'ra', 'ith', 'oth', 'ul'],
  ['grak', 'dum', 'bor', 'kaz', 'ur', 'gul', 'thrum', 'dok', 'az', 'mor', 'krag', 'un', 'gra', 'zug'],
  ['li', 'ae', 'lys', 'va', 'nel', 'thi', 'ia', 're', 'sil', 'wen', 'ea', 'or', 'lin', 'mae'],
  ['xi', 'qo', 'vek', 'ptl', 'yx', 'krr', 'ji', 'tz', 'zu', 'qa', 'xl', 'vo', 'zk'],
  ['bo', 'pi', 'nu', 'ma', 'po', 'lu', 'bi', 'mo', 'pa', 'nim', 'bup', 'lo'],
  ['ash', 'sur', 'nek', 'tha', 'mun', 'ses', 'ka', 'hiss', 'zar', 'tis', 'sa', 'ess'],
];
const SYSTEM_STYLE = ['0x', '1F', 'A7', '3C', 'E9', '0b', '10', '01', '11', 'FF', '7E', 'D4', '//', '##'];

const styleFor = (lang: string): string[] =>
  id(lang) === 'system' ? SYSTEM_STYLE : STYLES[hash(id(lang)) % STYLES.length];

/** Replaces each word with invented syllables of about the same length, keeping
 *  spaces, punctuation, emoji and capital letters where they were. */
export function gibberish(text: string, lang: string, seed: string): string {
  const style = styleFor(lang);
  const r = rng(hash(id(lang) + '|' + seed));
  return String(text).replace(/[\p{L}\p{N}]+/gu, (word) => {
    const len = Array.from(word).length;
    let out = '';
    while (out.length < len) out += style[Math.floor(r() * style.length)];
    out = out.slice(0, Math.max(len, 1) + (r() < 0.3 ? 1 : 0));
    const first = Array.from(word)[0];
    if (first !== first.toLowerCase()) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
  });
}

/** What a viewer sees: the text if they understand the language, else gibberish. */
export function render(text: string, lang: string | undefined, seed: string): string {
  if (understands(lang || 'default')) return text;
  return gibberish(text, lang || 'default', seed);
}

/** A stable hue for a sender's name or a language, the same on every device. */
export const hue = (name: string): number => hash(id(name)) % 360;
