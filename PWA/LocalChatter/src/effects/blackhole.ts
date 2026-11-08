// Black hole: the chat goes black, a vortex opens in the middle, and every
// message that arrives spirals into it, spinning and shrinking until it's gone.
// Swallowed messages are discarded: they don't come back when it ends.
// Messages already on screen stay, and so do effect announcements.
import { EffectControl, overlayCanvas, reducedMotion, vibrate } from './shared';

interface Mote { a: number; r: number; speed: number; size: number; hue: number }
const SWALLOW_MS = 1800;

/** Where the vortex sits: the middle of the chat (or the screen). */
function centre(): { x: number; y: number } {
  const list = document.getElementById('messages');
  const r = list && list.offsetParent ? list.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Pulls one message into the hole. The original is removed at once, and a copy
 *  of it, fixed where it was, does the spiral. */
function swallow(el: HTMLElement, calm: boolean): void {
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  el.remove(); // discarded: it never takes up space in the chat
  ghost.classList.add('fx-ghost');
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', maxWidth: 'none', margin: '0' });
  document.body.appendChild(ghost);
  let anim: Animation;
  if (calm) {
    anim = ghost.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.6)' }], { duration: 900, fill: 'forwards' });
  } else {
    const c = centre();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dist = Math.hypot(c.x - ex, c.y - ey) || 1;
    const start = Math.atan2(ey - c.y, ex - c.x);
    const turn = (Math.random() < 0.5 ? -1 : 1) * Math.PI * (2 + Math.random());
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const rad = dist * Math.pow(1 - t, 1.3);
      const a = start + turn * t;
      frames.push({
        transform: `translate(${c.x + Math.cos(a) * rad - ex}px, ${c.y + Math.sin(a) * rad - ey}px) rotate(${turn * t * 57.3}deg) scale(${1 - 0.97 * t})`,
        opacity: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
        offset: t,
      });
    }
    anim = ghost.animate(frames, { duration: SWALLOW_MS, easing: 'cubic-bezier(.45, 0, .85, .55)', fill: 'forwards' });
  }
  anim.finished.then(() => ghost.remove(), () => ghost.remove());
}

export function startBlackhole(): EffectControl {
  vibrate([80, 40, 120, 40, 200]);
  const calm = reducedMotion();
  const body = document.body;
  body.classList.remove('fx-blackhole-out');
  body.classList.add('fx-blackhole');

  // Swallow everything that arrives (except effect announcements).
  const list = document.getElementById('messages');
  const observer = new MutationObserver((recs) => recs.forEach((rec) => rec.addedNodes.forEach((n) => {
    if (n instanceof HTMLElement && !n.classList.contains('effect-line') && (n.classList.contains('msg') || n.classList.contains('system'))) swallow(n, calm);
  })));
  if (list) observer.observe(list, { childList: true });

  // The vortex: a dark core with a glowing, spinning accretion disc.
  const o = overlayCanvas('fx-blackhole-vortex');
  const { ctx, w, h, dpr } = o;
  const R = Math.min(w, h) * 0.24;
  const motes: Mote[] = [];
  const spawn = (outer: boolean): Mote => ({
    a: Math.random() * Math.PI * 2,
    r: R * (outer ? 0.95 + Math.random() * 0.1 : 0.25 + Math.random() * 0.8),
    speed: 0.6 + Math.random() * 0.9,
    size: (0.6 + Math.random() * 1.6) * dpr,
    hue: 20 + Math.random() * 260,
  });
  for (let i = 0; i < 220; i++) motes.push(spawn(false));
  const start = performance.now();
  let stoppedAt = 0;
  let last = start;

  function frame(now: number): void {
    if (!o.canvas.isConnected) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const fade = stoppedAt ? Math.max(0, 1 - (now - stoppedAt) / 900) : Math.min(1, (now - start) / 800);
    const c = centre();
    const cx = c.x * dpr;
    const cy = c.y * dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = fade;
    // Outer glow, then the motes, then the black core on top.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.25);
    halo.addColorStop(0, 'rgba(120, 60, 200, .55)');
    halo.addColorStop(0.45, 'rgba(255, 120, 40, .18)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    motes.forEach((m, i) => {
      if (!calm) {
        m.a += (m.speed * (R / Math.max(m.r, R * 0.1))) * dt * 1.4;
        m.r -= R * 0.08 * m.speed * dt;
        if (m.r < R * 0.16) motes[i] = spawn(true);
      }
      ctx.fillStyle = `hsla(${m.hue}, 90%, ${55 + 25 * (1 - m.r / R)}%, .85)`;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(m.a) * m.r, cy + Math.sin(m.a) * m.r * 0.55, m.size, m.size, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.3);
    core.addColorStop(0, 'rgba(0, 0, 0, 1)');
    core.addColorStop(0.75, 'rgba(0, 0, 0, 1)');
    core.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!stoppedAt || fade > 0) requestAnimationFrame(frame);
    else o.canvas.remove();
  }
  requestAnimationFrame(frame);

  return {
    stop(_early, hard) {
      observer.disconnect();
      if (hard) { o.canvas.remove(); body.classList.remove('fx-blackhole', 'fx-blackhole-out'); return; }
      stoppedAt = performance.now();
      body.classList.add('fx-blackhole-out');
      body.classList.remove('fx-blackhole');
      setTimeout(() => body.classList.remove('fx-blackhole-out'), 1000);
    },
  };
}
