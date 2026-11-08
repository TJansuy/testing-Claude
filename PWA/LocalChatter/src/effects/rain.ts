// Rain: drops fall from the top of the screen and splash on the message bubbles
// they hit; the rest collect in a puddle that rises on top of the message bar.
// Bubbles soak up the rain and go soggy; soaked ones drip onto the ones below.
// When it ends, the rain stops, the last drops land, and the puddle drains away.
import { wet } from './marks';
import { EffectControl, overlayCanvas, reducedMotion, vibrate } from './shared';

interface Drop { x: number; y: number; vy: number; len: number }
interface Bit { x: number; y: number; vx: number; vy: number; life: number }
interface Ripple { x: number; r: number; life: number }
interface Ledge { el: HTMLElement; left: number; right: number; top: number; bottom: number }

const MAX_LEVEL = 46; // css px
const DRAIN_PER_S = 34; // css px

export function startRain(): EffectControl {
  vibrate(20);
  const calm = reducedMotion();
  const o = overlayCanvas('fx-rain');
  const { ctx, w, h, dpr } = o;
  const drops: Drop[] = [];
  const bits: Bit[] = [];
  const ripples: Ripple[] = [];
  let ledges: Ledge[] = [];
  let level = 0; // canvas px
  let stoppedAt = 0;
  let last = performance.now();
  let ledgeAt = 0;
  const perSecond = Math.max(40, Math.round(w / dpr / 4));

  /** The tops of the bubbles on screen, which drops hit on the way down. */
  function readLedges(): void {
    ledges = Array.from(document.querySelectorAll<HTMLElement>('#messages .msg'))
      .map((m) => ({ m, r: m.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 0 && r.bottom > 0 && r.top < innerHeight)
      .map(({ m, r }) => ({ el: m, left: r.left * dpr, right: r.right * dpr, top: r.top * dpr, bottom: r.bottom * dpr }));
  }
  /** The puddle sits on the message bar (or the bottom of the screen). */
  function floor(): number {
    const bar = document.getElementById('composer');
    const r = bar && bar.offsetParent ? bar.getBoundingClientRect() : null;
    return (r ? r.top : innerHeight) * dpr;
  }

  function frame(now: number): void {
    if (!o.canvas.isConnected) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (now - ledgeAt > 250) { readLedges(); ledgeAt = now; }
    const surface = floor() - level;

    // New drops while it's raining (with reduce motion, the puddle just rises).
    if (!stoppedAt && !calm) {
      let n = perSecond * dt;
      while (n > 0) {
        if (n >= 1 || Math.random() < n) drops.push({ x: Math.random() * w, y: -20 * dpr, vy: (700 + Math.random() * 400) * dpr, len: (10 + Math.random() * 12) * dpr });
        n -= 1;
      }
    }
    if (!stoppedAt && calm) {
      level = Math.min(MAX_LEVEL * dpr, level + 4 * dpr * dt);
      ledges.forEach((l) => wet(l.el, dt * 2)); // no drops to watch: bubbles just soak slowly
    }

    // Move the drops: splash on a bubble, or land in the puddle.
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      const prev = d.y;
      d.y += d.vy * dt;
      const hit = ledges.find((l) => d.x >= l.left && d.x <= l.right && prev < l.top && d.y >= l.top);
      if (hit) {
        for (let k = 0; k < 4; k++) bits.push({ x: d.x, y: hit.top, vx: (Math.random() - 0.5) * 160 * dpr, vy: -(60 + Math.random() * 120) * dpr, life: 1 });
        drops.splice(i, 1);
        // A soaked bubble drips from its bottom edge onto whatever is below.
        if (wet(hit.el) && Math.random() < 0.35) drops.push({ x: d.x, y: hit.bottom + 1, vy: 260 * dpr, len: 6 * dpr });
      } else if (d.y >= surface) {
        ripples.push({ x: d.x, r: 2 * dpr, life: 1 });
        if (!stoppedAt) level = Math.min(MAX_LEVEL * dpr, level + 0.09 * dpr);
        drops.splice(i, 1);
      }
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.vy += 900 * dpr * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt * 2.2;
      if (b.life <= 0) bits.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].r += 40 * dpr * dt;
      ripples[i].life -= dt * 2;
      if (ripples[i].life <= 0) ripples.splice(i, 1);
    }
    // Once it stops, the puddle drains away.
    if (stoppedAt) level = Math.max(0, level - DRAIN_PER_S * dpr * dt);

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(150, 190, 255, .55)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    drops.forEach((d) => { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1.5 * dpr, d.y - d.len); });
    ctx.stroke();
    ctx.fillStyle = 'rgba(170, 205, 255, .8)';
    bits.forEach((b) => { ctx.globalAlpha = Math.max(0, b.life); ctx.fillRect(b.x, b.y, 2 * dpr, 2 * dpr); });
    ctx.globalAlpha = 1;
    if (level > 0.5) {
      const base = floor();
      const top = base - level;
      const wave = calm ? 0 : 2.2 * dpr;
      const g = ctx.createLinearGradient(0, top, 0, base);
      g.addColorStop(0, 'rgba(110, 165, 235, .45)');
      g.addColorStop(1, 'rgba(45, 95, 185, .65)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, base);
      for (let x = 0; x <= w; x += 8 * dpr) ctx.lineTo(x, top + Math.sin(x / (26 * dpr) + now / 260) * wave);
      ctx.lineTo(w, base);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 238, 255, .7)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8 * dpr) ctx[x ? 'lineTo' : 'moveTo'](x, top + Math.sin(x / (26 * dpr) + now / 260) * wave);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 238, 255, .5)';
      ripples.forEach((rp) => {
        ctx.globalAlpha = rp.life;
        ctx.beginPath();
        ctx.ellipse(rp.x, top, rp.r, rp.r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    if (!stoppedAt || drops.length || bits.length || level > 0) requestAnimationFrame(frame);
    else o.canvas.remove();
  }
  requestAnimationFrame(frame);

  return {
    stop(_early, hard) {
      if (hard) { o.canvas.remove(); return; }
      if (!stoppedAt) stoppedAt = performance.now();
    },
  };
}
