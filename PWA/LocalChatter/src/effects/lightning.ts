// Lightning: strikes now, then again every 1.2-3 s until stopped. Each bolt grows
// from the top of the screen down through the chat, hitting some messages at
// random (they flash and jolt as it reaches them) and passing beside the rest.
// Each strike flashes twice, 380 ms apart, once the bolt lands; strikes are at
// least 1.2 s apart, so there are never more than two flashes in any second.
import { shock } from './marks';
import { EffectControl, overlayCanvas, reducedMotion, vibrate } from './shared';

type Point = [number, number];
interface Bolt { pts: Point[]; width: number; from: number }
interface Hit { el: HTMLElement; y: number }

const GROW_MS = 280;

/** A jagged line between two points (both ends exact, so it really hits a target). */
function jag(a: Point, b: Point, rough: number, dpr: number): Point[] {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.ceil(dist / (22 * dpr)));
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const j = i === n ? 0 : (Math.random() - 0.5) * rough;
    out.push([a[0] + (b[0] - a[0]) * t + j, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** A short side branch from a point on the bolt. */
function branch(start: Point, from: number, dpr: number): Bolt {
  const angle = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
  const len = (50 + Math.random() * 70) * dpr;
  const end: Point = [start[0] + Math.sin(angle) * len, start[1] + Math.cos(angle) * len];
  return { pts: [start, ...jag(start, end, 14 * dpr, dpr)], width: 1, from };
}

/** Plans the bolt: down through the visible messages, hitting some at random. */
function plan(w: number, h: number, dpr: number): { bolts: Bolt[]; hits: Hit[]; skipped: number } {
  const msgs = Array.from(document.querySelectorAll<HTMLElement>('#messages .msg'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.height > 0 && r.bottom > 0 && r.top < innerHeight)
    .sort((a, b) => a.r.top - b.r.top);
  const hit = msgs.map(() => Math.random() < 0.5);
  // Always hit at least one, and skip at least one when there are several.
  if (msgs.length && !hit.some(Boolean)) hit[Math.floor(Math.random() * msgs.length)] = true;
  if (msgs.length > 1 && hit.every(Boolean)) hit[Math.floor(Math.random() * msgs.length)] = false;

  const way: Point[] = [[msgs.length ? (msgs[0].r.left + Math.random() * msgs[0].r.width) * dpr : w * (0.25 + Math.random() * 0.5), 0]];
  const hits: Hit[] = [];
  msgs.forEach(({ el, r }, i) => {
    const y = (r.top + r.height / 2) * dpr;
    if (hit[i]) {
      way.push([(r.left + r.width * (0.2 + Math.random() * 0.6)) * dpr, y]);
      hits.push({ el, y });
    } else {
      // Pass beside it, on whichever side has more room.
      const x = r.left > innerWidth - r.right
        ? Math.max(6, r.left - 14 - Math.random() * 18)
        : Math.min(innerWidth - 6, r.right + 14 + Math.random() * 18);
      way.push([x * dpr, y]);
    }
  });
  const last = way[way.length - 1];
  way.push([Math.min(w, Math.max(0, last[0] + (Math.random() - 0.5) * 80 * dpr)), h]);

  const main: Point[] = [way[0]];
  for (let i = 1; i < way.length; i++) main.push(...jag(way[i - 1], way[i], 18 * dpr, dpr));
  const bolts: Bolt[] = [{ pts: main, width: 3, from: 0 }];
  for (let k = 0; k < 3; k++) {
    const at = 2 + Math.floor(Math.random() * Math.max(1, main.length - 4));
    if (main[at]) bolts.push(branch(main[at], at, dpr));
  }
  return { bolts, hits, skipped: msgs.length - hits.length };
}

function jolt(el: HTMLElement): void {
  el.classList.remove('struck');
  void el.offsetWidth; // restart the animation
  el.classList.add('struck');
  setTimeout(() => { el.classList.remove('struck'); shock(el); }, 850); // left frazzled
}

/** One strike. Removes its canvas when done. */
function strike(canvases: Set<HTMLCanvasElement>): void {
  vibrate([40, 80, 40]);
  const calm = reducedMotion();
  const o = overlayCanvas('fx-lightning');
  canvases.add(o.canvas);
  const { ctx, w, h, dpr } = o;
  const { bolts, hits, skipped } = plan(w, h, dpr);
  document.dispatchEvent(new CustomEvent('localchatter:strike', { detail: { hit: hits.length, skipped } }));
  const main = bolts[0].pts;
  const flashes = calm ? [] : [GROW_MS, GROW_MS + 380];
  const END_MS = GROW_MS + (calm ? 1400 : 1100);
  const start = performance.now();
  const struck = new Set<Hit>();

  function drawBolts(alpha: number, upTo: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(160, 200, 255, 1)';
    ctx.shadowBlur = 24 * dpr;
    bolts.forEach((b) => {
      if (b.from >= upTo) return; // the bolt hasn't reached this branch yet
      const pts = b === bolts[0] ? b.pts.slice(0, upTo + 1) : b.pts;
      ctx.beginPath();
      pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.strokeStyle = 'rgba(200, 225, 255, 1)';
      ctx.lineWidth = b.width * 2.5 * dpr;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = b.width * dpr;
      ctx.stroke();
    });
    ctx.restore();
  }

  function frame(now: number): void {
    if (!o.canvas.isConnected) return; // removed early
    // The first frame's timestamp can be slightly before start; count from zero.
    const t = Math.max(0, now - start);
    ctx.clearRect(0, 0, w, h);
    // Grow down the screen; jolt each hit message as the tip reaches it.
    const upTo = Math.min(main.length - 1, Math.ceil((main.length - 1) * Math.min(1, t / GROW_MS)));
    const tipY = main[upTo][1];
    hits.forEach((hit) => { if (!struck.has(hit) && tipY >= hit.y) { struck.add(hit); jolt(hit.el); } });
    // Brightness: full while growing, then fading after each flash.
    let a = t < GROW_MS ? 1 : 0;
    const fadeMs = calm ? 1400 : 650;
    if (t >= GROW_MS) a = Math.max(0, 1 - (t - GROW_MS) / fadeMs);
    flashes.forEach((f) => {
      if (t < f) return;
      const k = Math.max(0, 1 - (t - f) / fadeMs);
      a = Math.max(a, k);
      if (k > 0) {
        ctx.fillStyle = 'rgba(225, 235, 255, ' + 0.55 * k + ')';
        ctx.fillRect(0, 0, w, h);
      }
    });
    if (a > 0) drawBolts(calm ? a * 0.8 : a, upTo);
    if (t < END_MS) requestAnimationFrame(frame);
    else { o.canvas.remove(); canvases.delete(o.canvas); }
  }
  requestAnimationFrame(frame);
}

export function startLightning(): EffectControl {
  let stopped = false;
  let next: ReturnType<typeof setTimeout> | undefined;
  const canvases = new Set<HTMLCanvasElement>();
  (function loop() {
    if (stopped) return;
    strike(canvases);
    next = setTimeout(loop, 1200 + Math.random() * 1800);
  })();
  return {
    stop(_early, hard) {
      stopped = true;
      clearTimeout(next);
      if (hard) canvases.forEach((c) => c.remove());
    },
  };
}
