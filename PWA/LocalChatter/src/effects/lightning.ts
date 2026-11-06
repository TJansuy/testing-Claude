// Lightning: strikes now, then again every 1.2-3 s until stopped. Each strike
// is a bolt with two flashes 380 ms apart, and strikes are at least 1.2 s apart,
// so there are never more than two flashes in any second.
import { EffectControl, overlayCanvas, reducedMotion, vibrate } from './shared';

interface Bolt { pts: Array<[number, number]>; width: number }

// Jagged bolt from the top towards the bottom, with a couple of side branches.
function boltPath(x: number, y: number, len: number, angle: number, rough: number, depth: number, out: Bolt[]): Bolt[] {
  const pts: Array<[number, number]> = [[x, y]];
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    x += Math.sin(angle) * len / steps + (Math.random() - 0.5) * rough;
    y += Math.cos(angle) * len / steps;
    pts.push([x, y]);
    if (depth > 0 && Math.random() < 0.12) {
      boltPath(x, y, len * 0.4, angle + (Math.random() < 0.5 ? -0.7 : 0.7), rough * 0.6, depth - 1, out);
    }
  }
  out.push({ pts, width: depth + 1 });
  return out;
}

/** One strike. Removes its canvas when done. */
function strike(canvases: Set<HTMLCanvasElement>): void {
  vibrate([40, 80, 40]);
  const calm = reducedMotion();
  const o = overlayCanvas('fx-lightning');
  canvases.add(o.canvas);
  const { ctx, w, h, dpr } = o;
  const bolts = boltPath(w * (0.25 + Math.random() * 0.5), 0, h * 0.85, (Math.random() - 0.5) * 0.3, 40 * dpr, 2, []);
  const strikes = calm ? [0] : [0, 380];
  const END_MS = calm ? 1400 : 1100;
  const start = performance.now();

  function drawBolt(alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(160, 200, 255, 1)';
    ctx.shadowBlur = 24 * dpr;
    bolts.forEach((b) => {
      ctx.strokeStyle = 'rgba(200, 225, 255, 1)';
      ctx.lineWidth = b.width * 2.5 * dpr;
      ctx.beginPath();
      b.pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = b.width * dpr;
      ctx.stroke();
    });
    ctx.restore();
  }

  function frame(now: number): void {
    if (!o.canvas.isConnected) return; // removed early
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    let a = 0;
    strikes.forEach((s) => { if (t >= s) a = Math.max(a, 1 - (t - s) / (calm ? 1400 : 650)); });
    a = Math.max(0, a);
    if (!calm && a > 0) {
      ctx.fillStyle = 'rgba(225, 235, 255, ' + 0.55 * a + ')';
      ctx.fillRect(0, 0, w, h);
    }
    if (a > 0) drawBolt(calm ? a * 0.8 : a);
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
