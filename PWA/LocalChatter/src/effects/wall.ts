// Game: the wall. A brick wall slowly comes down from the top of the screen.
// Every message sent flies up and hits it, knocking it back up and cracking
// it. After a number of hits (3 to 50, the same on every device: it comes from
// the /wall message itself) it shatters and the pieces fall away, ending the
// game. Turned off early, it rises back up off the screen instead.
// Each wall secretly follows one of the rules in wall-rules.ts; a message that
// doesn't meet them bounces off without doing any damage.
import { rawText } from '../chat/raw';
import { EffectControl, overlayCanvas, reducedMotion, vibrate } from './shared';
import { referee, wallStrength, wallVariant } from './wall-rules';

interface Shard { sx: number; sy: number; sw: number; sh: number; x: number; y: number; vx: number; vy: number; rot: number; vr: number }
interface Dust { x: number; y: number; vx: number; vy: number; life: number }

const DESCEND_PER_S = 11; // css px
const KNOCK_BACK = 70;
const RISE_PER_S = 220;
const BRICK_H = 26;
const BRICK_W = 62;

/** Messages that count: everyone's ordinary chat (not whispers, polls or games). */
const counts = (n: Node): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('msg') &&
  !n.classList.contains('whisper') && !n.classList.contains('poll-msg') && !n.classList.contains('game-msg');

function bricks(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#cbbfb2'; // mortar
  g.fillRect(0, 0, w, h);
  const bh = BRICK_H * dpr, bw = BRICK_W * dpr, gap = 3 * dpr;
  for (let row = 0, y = h - bh; y > -bh; row++, y -= bh) {
    for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
      g.fillStyle = `hsl(${8 + Math.random() * 12} ${42 + Math.random() * 18}% ${33 + Math.random() * 12}%)`;
      g.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
      g.fillStyle = 'rgb(255 255 255 / .08)';
      g.fillRect(x + gap / 2, y + gap / 2, bw - gap, 3 * dpr);
    }
  }
  g.fillStyle = 'rgb(0 0 0 / .35)'; // shadow along the bottom edge
  g.fillRect(0, h - 4 * dpr, w, 4 * dpr);
  return c;
}

/** Cracks spreading up from where a message hit. */
function crack(g: CanvasRenderingContext2D, x: number, h: number, dpr: number, hurt: number): void {
  g.strokeStyle = 'rgb(25 12 6 / .85)';
  g.lineWidth = (1.2 + hurt) * dpr;
  for (let b = 0; b < 2 + Math.round(hurt * 3); b++) {
    let px = x, py = h;
    g.beginPath();
    g.moveTo(px, py);
    const len = (30 + Math.random() * 70 * (1 + hurt)) * dpr;
    const dir = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    for (let d = 0; d < len; d += 9 * dpr) {
      px += Math.cos(dir + (Math.random() - 0.5) * 1.2) * 9 * dpr;
      py += Math.sin(dir + (Math.random() - 0.5) * 1.2) * 9 * dpr;
      g.lineTo(px, py);
    }
    g.stroke();
  }
  // A chunk knocked out of the bottom edge.
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.ellipse(x, h, (8 + Math.random() * 14) * dpr, (6 + Math.random() * 10) * dpr, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function startWall(seed: string, done: () => void): EffectControl {
  vibrate([40, 30, 40]);
  const calm = reducedMotion();
  const strength = wallStrength(seed);
  const variant = wallVariant(seed);
  const judge = referee(variant, strength);
  let planned = 0; // damaging messages so far, counting those still in the air
  const o = overlayCanvas('fx-wall');
  const { ctx, w, h, dpr } = o;
  const wallH = Math.round(Math.min(170, Math.max(110, innerHeight * 0.2)));
  const tex = bricks(w, wallH * dpr, dpr);
  const tg = tex.getContext('2d') as CanvasRenderingContext2D;
  const composer = document.getElementById('composer');
  const lowest = (): number => Math.min(innerHeight * 0.6, (composer && composer.offsetParent ? composer.getBoundingClientRect().top : innerHeight) - 90);
  let bottom = calm ? wallH + 20 : Math.round(wallH * 0.3); // css px: where the wall's lower edge is (it starts just peeking in)
  let shake = 0;
  let hits = 0;
  let mode: 'up' | 'rising' | 'broken' | 'gone' = 'up';
  const shards: Shard[] = [];
  const dust: Dust[] = [];
  const ghosts = new Set<HTMLElement>();
  let last = performance.now();

  function finish(by: string): void {
    mode = 'broken';
    observer.disconnect();
    vibrate([120, 40, 200]);
    document.dispatchEvent(new CustomEvent('localchatter:game', { detail: { game: 'wall', result: 'broken', hits, by, variant, sent } }));
    if (calm) { o.canvas.classList.add('fx-fade'); setTimeout(end, 700); return; }
    const top = (bottom - wallH) * dpr;
    for (let y = 0; y < tex.height; y += BRICK_H * dpr) {
      for (let x = 0; x < w; x += BRICK_W * dpr) {
        shards.push({ sx: x, sy: y, sw: BRICK_W * dpr, sh: BRICK_H * dpr, x, y: top + y, vx: (Math.random() - 0.5) * 260 * dpr, vy: (-80 - Math.random() * 220) * dpr, rot: 0, vr: (Math.random() - 0.5) * 8 });
      }
    }
  }
  function end(): void {
    if (mode === 'gone') return;
    mode = 'gone';
    o.canvas.remove();
    done();
  }

  function impact(x: number, by: string): void {
    if (mode !== 'up') return;
    hits++;
    if (hits >= strength) { finish(by); return; }
    crack(tg, x * dpr, tex.height, dpr, Math.min(1, hits / strength));
    if (!calm) {
      bottom = Math.min(bottom, Math.max(24, bottom - KNOCK_BACK)); // up, but never quite off the screen
      shake = 1;
      for (let i = 0; i < 10; i++) dust.push({ x: x * dpr, y: bottom * dpr, vx: (Math.random() - 0.5) * 220 * dpr, vy: (Math.random() * 160 - 40) * dpr, life: 1 });
    }
    vibrate(25);
  }

  /** A message that doesn't meet the wall's rules: a little jolt, no damage. */
  function bounce(): void {
    if (mode !== 'up') return;
    if (!calm) shake = Math.max(shake, 0.25);
  }

  /** A copy of the new message flies up and hits the wall's lower edge
   *  (and bounces back off if it doesn't meet the rules). Judged as it's sent,
   *  so the order is the same on every device. */
  let sent = 0;
  function launch(box: HTMLElement): void {
    if (mode !== 'up' || planned >= strength) return; // already on its way down
    sent++;
    const who = (box.querySelector('.who') || { textContent: '' }).textContent || 'Someone';
    const hurts = judge(rawText(box), planned);
    if (hurts) planned++;
    const r = box.getBoundingClientRect();
    const x = r.left + r.width / 2;
    if (calm || !r.height) { if (hurts) impact(x, who); else bounce(); return; }
    const ghost = box.cloneNode(true) as HTMLElement;
    ghost.classList.add('fx-ghost');
    Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', maxWidth: 'none', margin: '0' });
    document.body.appendChild(ghost);
    ghosts.add(ghost);
    const rise = Math.max(0, r.top - bottom);
    if (!hurts) ghost.classList.add('fx-dud');
    const tilt = (Math.random() - 0.5) * 16;
    const frames: Keyframe[] = hurts ? [
      { transform: 'translateY(0) scale(1)' },
      { transform: `translateY(${-rise}px) scale(.85) rotate(${tilt}deg)`, offset: 0.92 },
      { transform: `translateY(${-rise + 6}px) scale(.6)`, opacity: 0 },
    ] : [
      // Bounces off: up, a clink, then tumbles back down and fades.
      { transform: 'translateY(0) scale(1)' },
      { transform: `translateY(${-rise}px) scale(.85) rotate(${tilt}deg)`, offset: 0.55 },
      { transform: `translateY(${-rise * 0.55}px) scale(.7) rotate(${-tilt * 3}deg)`, opacity: 0 },
    ];
    const anim = ghost.animate(frames, { duration: hurts ? 320 + rise * 0.9 : 520 + rise * 1.4, easing: hurts ? 'cubic-bezier(.5, 0, .9, .6)' : 'ease-in-out', fill: 'forwards' });
    if (!hurts) setTimeout(bounce, (520 + rise * 1.4) * 0.55);
    const land = (): void => { ghost.remove(); ghosts.delete(ghost); };
    anim.finished.then(() => { land(); if (hurts) impact(x, who); }, land);
  }

  const list = document.getElementById('messages');
  const observer = new MutationObserver((recs) => recs.forEach((rec) => rec.addedNodes.forEach((n) => { if (counts(n)) launch(n); })));
  if (list) observer.observe(list, { childList: true });

  function frame(now: number): void {
    if (mode === 'gone') return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (mode === 'up' && !calm) bottom = Math.min(lowest(), bottom + DESCEND_PER_S * dt);
    if (mode === 'rising') bottom -= RISE_PER_S * dt;
    shake = Math.max(0, shake - dt * 3);
    ctx.clearRect(0, 0, w, h);
    if (mode === 'broken' && !calm) {
      shards.forEach((s) => {
        s.vy += 1700 * dpr * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        ctx.save();
        ctx.translate(s.x + s.sw / 2, s.y + s.sh / 2);
        ctx.rotate(s.rot);
        ctx.drawImage(tex, s.sx, s.sy, s.sw, s.sh, -s.sw / 2, -s.sh / 2, s.sw, s.sh);
        ctx.restore();
      });
      if (shards.every((s) => s.y > h)) { end(); return; }
    } else {
      const jx = shake ? (Math.random() - 0.5) * 10 * shake * dpr : 0;
      ctx.drawImage(tex, jx, (bottom - wallH) * dpr + (shake ? (Math.random() - 0.5) * 6 * shake * dpr : 0));
      if (mode === 'rising' && bottom <= 0) { end(); return; }
    }
    ctx.fillStyle = 'rgb(190 170 150)';
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.vy += 500 * dpr * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt * 1.6;
      if (d.life <= 0) { dust.splice(i, 1); continue; }
      ctx.globalAlpha = d.life;
      ctx.fillRect(d.x, d.y, 3 * dpr, 3 * dpr);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    stop(_early, hard) {
      observer.disconnect();
      ghosts.forEach((g) => g.remove());
      if (hard || mode === 'broken') { if (hard) { mode = 'gone'; o.canvas.remove(); } return; }
      document.dispatchEvent(new CustomEvent('localchatter:game', { detail: { game: 'wall', result: 'stopped', hits, variant, sent } }));
      if (calm) { o.canvas.classList.add('fx-fade'); setTimeout(() => { mode = 'gone'; o.canvas.remove(); }, 700); return; }
      mode = 'rising'; // goes back up off the top of the screen
    },
  };
}
