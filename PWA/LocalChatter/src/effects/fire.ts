// Fire: flames rise from the bottom of the screen and every message bubble
// catches light, until stopped; then it all dies down over about a second.
import { char } from './marks';
import { EffectControl, holdGlow, overlayCanvas, reducedMotion, vibrate } from './shared';

interface Particle { x: number; y: number; vx: number; vy: number; size: number; life: number; decay: number }

let flameSprite: HTMLCanvasElement | null = null;
function getFlameSprite(): HTMLCanvasElement {
  if (flameSprite) return flameSprite;
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 245, 200, 1)');
  grad.addColorStop(0.25, 'rgba(255, 190, 60, 0.9)');
  grad.addColorStop(0.6, 'rgba(240, 80, 20, 0.45)');
  grad.addColorStop(1, 'rgba(200, 30, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  flameSprite = s;
  return s;
}

/** Sets every message alight (CSS flames on each bubble; new ones catch too).
 *  A bubble that's been burning for a moment is charred for good. */
function burnMessages(): EffectControl {
  const body = document.body;
  body.classList.remove('fx-burnout');
  body.classList.add('fx-burning');
  let out: ReturnType<typeof setTimeout> | undefined;
  const lit = new Map<HTMLElement, number>();
  const scorch = setInterval(() => {
    const now = performance.now();
    document.querySelectorAll<HTMLElement>('#messages .msg:not(.charred)').forEach((m) => {
      const since = lit.get(m);
      if (since === undefined) lit.set(m, now);
      else if (now - since >= 700) char(m);
    });
  }, 250);
  return {
    stop(_early, hard) {
      clearInterval(scorch);
      clearTimeout(out);
      if (hard) { body.classList.remove('fx-burning', 'fx-burnout'); return; }
      body.classList.add('fx-burnout'); // flames die down, then go
      out = setTimeout(() => body.classList.remove('fx-burning', 'fx-burnout'), 1000);
    },
  };
}

export function startFire(): EffectControl {
  vibrate([60, 40, 60]);
  const bubbles = burnMessages();
  if (reducedMotion()) {
    const glow = holdGlow('fx-fire-glow');
    return { stop(early, hard) { glow.stop(early, hard); bubbles.stop(early, hard); } };
  }

  const o = overlayCanvas('fx-fire');
  const { ctx, w, h, dpr } = o;
  const sprite = getFlameSprite();
  const parts: Particle[] = [];
  const FADE_MS = 1200;
  const start = performance.now();
  let stoppedAt = 0;
  let gone = false;
  const perFrame = Math.max(8, Math.round(w / (28 * dpr)));

  function frame(now: number): void {
    if (gone) return;
    const t = now - start;
    if (!stoppedAt) {
      for (let i = 0; i < perFrame; i++) {
        parts.push({
          x: Math.random() * w,
          y: h + 20 * dpr,
          vx: (Math.random() - 0.5) * 1.2 * dpr,
          vy: -(3 + Math.random() * 5) * dpr,
          size: (40 + Math.random() * 70) * dpr,
          life: 1,
          decay: 0.012 + Math.random() * 0.016,
        });
      }
    }
    ctx.clearRect(0, 0, w, h);
    // Warm glow along the bottom, fading out once stopped.
    const fade = !stoppedAt ? Math.min(1, t / 300) : Math.max(0, 1 - (now - stoppedAt) / FADE_MS);
    const base = ctx.createLinearGradient(0, h, 0, h * 0.55);
    base.addColorStop(0, 'rgba(255, 90, 0, ' + 0.45 * fade + ')');
    base.addColorStop(1, 'rgba(255, 90, 0, 0)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j];
      p.x += p.vx + Math.sin((now + j * 37) / 180) * 0.6 * dpr;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) { parts.splice(j, 1); continue; }
      const s = p.size * (0.4 + p.life * 0.6);
      ctx.globalAlpha = p.life * 0.8;
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    if (!stoppedAt || parts.length || fade > 0) requestAnimationFrame(frame);
    else o.canvas.remove();
  }
  requestAnimationFrame(frame);
  return {
    stop(early, hard) {
      bubbles.stop(early, hard);
      if (hard) { gone = true; o.canvas.remove(); return; } // replaced: vanish at once
      if (!stoppedAt) stoppedAt = performance.now();
    },
  };
}
