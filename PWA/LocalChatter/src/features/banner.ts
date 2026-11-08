// /banner: a banner across the top of every display (display mode only).
//   /banner Doors open at 7pm            normal speed
//   /banner fast Doors open at 7pm       slow | normal | fast
//   /banner 25px Doors open at 7pm       exact speed, in pixels per second
//   /banner off                          take it down
// It's centred; text too wide for the screen stays on one line and scrolls
// slowly to reveal the rest, pausing at each end. Other devices don't show it;
// the sender gets a confirmation line.
import { $, el } from '../dom';
import { reducedMotion } from '../effects/shared';
import { DISPLAY } from '../state';

export type Banner = { off: true } | { off: false; text: string; speed: number; speedText: string };

const SPEEDS: Record<string, number> = { slow: 30, normal: 60, medium: 60, fast: 120 };
const DEFAULT_SPEED = 60;
const MAX_TEXT = 300;
const PAUSE_MS = 1500;

/** Reads "/banner …". Returns null if it isn't a usable banner command. */
export function parseBanner(text: string | undefined): Banner | null {
  const m = /^\s*\/banner\b\s*([\s\S]*)$/i.exec(String(text || ''));
  if (!m) return null;
  let rest = m[1].trim();
  if (/^(off|clear|stop)$/i.test(rest)) return { off: true };
  // A speed on its own isn't a banner.
  if (SPEEDS[rest.toLowerCase()] || /^\d{1,3}px(?:\/s)?$/i.test(rest)) return null;
  let speed = DEFAULT_SPEED;
  let speedText = '';
  const first = /^(\S+)\s+([\s\S]+)$/.exec(rest);
  if (first) {
    const word = first[1].toLowerCase();
    const px = /^(\d{1,3})px(?:\/s)?$/.exec(word);
    if (SPEEDS[word]) { speed = SPEEDS[word]; speedText = word; rest = first[2]; }
    else if (px) { speed = Math.min(600, Math.max(5, parseInt(px[1], 10))); speedText = speed + 'px'; rest = first[2]; }
  }
  rest = rest.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  return rest ? { off: false, text: rest, speed, speedText } : null;
}

const banner = $('display-banner');
const label = $('display-banner-text');
let current: { text: string; speed: number } | null = null;
let anim: Animation | null = null;

/** Lays the banner out: centred if it fits, otherwise scrolling back and forth. */
function layout(): void {
  if (anim) { anim.cancel(); anim = null; }
  if (!current) return;
  const calm = reducedMotion();
  banner.classList.toggle('calm', calm);
  const room = (banner.firstElementChild as HTMLElement).clientWidth;
  const dist = label.scrollWidth - room;
  banner.classList.toggle('overflowing', dist > 0 && !calm);
  if (dist <= 0 || calm || !label.animate) return;
  // Pause, scroll to the end at the chosen speed, pause, scroll back. Repeat.
  const travel = (dist / current.speed) * 1000;
  const total = PAUSE_MS * 2 + travel * 2;
  const at = (x: number, offset: number): Keyframe => ({ transform: 'translateX(' + x + 'px)', offset });
  anim = label.animate([
    at(0, 0), at(0, PAUSE_MS / total), at(-dist, (PAUSE_MS + travel) / total), at(-dist, (2 * PAUSE_MS + travel) / total), at(0, 1),
  ], { duration: total, iterations: Infinity, easing: 'linear' });
}

export function showBanner(b: Banner): void {
  if (!DISPLAY) return;
  if (b.off) { current = null; banner.hidden = true; layout(); return; }
  current = { text: b.text, speed: b.speed };
  label.textContent = b.text;
  banner.hidden = false;
  requestAnimationFrame(layout); // measure once it's on screen
}

if (DISPLAY && 'ResizeObserver' in window) new ResizeObserver(() => requestAnimationFrame(layout)).observe(banner);

/** The line the sender sees in their own chat. */
export function bannerConfirmation(b: Banner): HTMLElement {
  return el('p', 'system', b.off
    ? '📢 You took down the display banner.'
    : '📢 Banner on the displays: “' + b.text + '”' + (b.speedText ? ' (' + b.speedText + ')' : ''));
}
