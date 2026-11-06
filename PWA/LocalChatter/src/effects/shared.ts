// Helpers shared by the effects: reduced motion, vibration and overlays.

export function reducedMotion(): boolean {
  return !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Vibration (Android browsers; iPhone/iPad Safari has none). The app can turn it off.
let vibrationOn = true;
export function setVibration(on: boolean): void { vibrationOn = on; if (!on) vibrate(0); }
export function vibrate(pattern: number | number[]): void {
  if (!vibrationOn) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not allowed */ }
}

export interface Overlay { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; dpr: number; w: number; h: number }

/** Full-screen canvas sized for the device pixel ratio. */
export function overlayCanvas(cls: string): Overlay {
  const c = document.createElement('canvas');
  c.className = 'fx ' + cls;
  c.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.round(innerWidth * dpr);
  c.height = Math.round(innerHeight * dpr);
  document.body.appendChild(c);
  return { canvas: c, ctx: c.getContext('2d') as CanvasRenderingContext2D, dpr, w: c.width, h: c.height };
}

/** Every effect, once started, can be stopped. early: stopped by "off" rather
 *  than its timer. hard: replaced by another effect, so vanish at once. */
export interface EffectControl { stop(early?: boolean, hard?: boolean): void }

/** A soft full-screen glow used instead of motion when "reduce motion" is on.
 *  Stays until stopped, then fades out. */
export function holdGlow(cls: string): EffectControl {
  const d = document.createElement('div');
  d.className = 'fx fx-glow-hold ' + cls;
  d.setAttribute('aria-hidden', 'true');
  document.body.appendChild(d);
  return {
    stop(_early, hard) {
      if (hard) { d.remove(); return; }
      d.classList.add('out');
      setTimeout(() => d.remove(), 700);
    },
  };
}
