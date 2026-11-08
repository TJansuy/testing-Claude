// How a hangman game looks: a bubble in the chat and a card on the display's
// board (beside the polls). Solved games explode into confetti and are gone.
import { el } from '../dom';
import { overlayCanvas, reducedMotion } from '../effects/shared';
import { found, Hangman, MAX_WRONG, mine, wrongGuesses } from './hangman';

export type GameMode = 'chat' | 'board';
let onClear: ((g: Hangman) => void) | null = null;
export const setClear = (fn: (g: Hangman) => void): void => { onClear = fn; };

const cards = new Map<string, Set<{ node: HTMLElement; mode: GameMode }>>();
const SVG = 'http://www.w3.org/2000/svg';

/** The gallows, with one more part of the figure for each wrong guess. */
function gallows(wrong: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 120');
  svg.setAttribute('class', 'hm-gallows');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', wrong + ' of ' + MAX_WRONG + ' wrong guesses');
  const parts = [
    'M10 115 H70 M25 115 V8 H70 V20', // the gallows
    'circle', 'M70 42 V75', 'M70 50 L55 64', 'M70 50 L85 64', 'M70 75 L57 95', 'M70 75 L83 95',
  ];
  parts.forEach((d, i) => {
    if (i > wrong) return;
    const shape = d === 'circle' ? document.createElementNS(SVG, 'circle') : document.createElementNS(SVG, 'path');
    if (d === 'circle') { shape.setAttribute('cx', '70'); shape.setAttribute('cy', '31'); shape.setAttribute('r', '11'); }
    else shape.setAttribute('d', d);
    shape.setAttribute('class', i ? 'hm-part' : 'hm-frame');
    svg.appendChild(shape);
  });
  return svg;
}

function phrase(g: Hangman, mode: GameMode): HTMLElement {
  const box = el('p', 'hm-phrase');
  const reveal = g.state !== 'open' || (mode === 'chat' && mine(g));
  g.phrase.split(/\s+/).forEach((word) => {
    const w = el('span', 'hm-word');
    Array.from(word).forEach((c) => {
      const got = found(g, c);
      const letter = el('span', 'hm-letter' + (got ? '' : reveal ? ' hm-missing' : ' hm-blank'), got || reveal ? c : '');
      w.appendChild(letter);
    });
    box.appendChild(w);
  });
  box.setAttribute('aria-label', Array.from(g.phrase).map((c) => (found(g, c) || g.state !== 'open' ? c : 'blank')).join(' '));
  return box;
}

function fill(node: HTMLElement, g: Hangman, mode: GameMode): void {
  const wrong = wrongGuesses(g);
  node.replaceChildren();
  node.classList.toggle('lost', g.state === 'lost');
  const head = el('div', 'poll-head');
  head.appendChild(el('span', 'poll-kind', '🪢 Hangman'));
  head.appendChild(el('span', 'poll-state', g.state === 'open' ? 'Open' : g.state === 'won' ? 'Solved!' : 'Lost'));
  node.appendChild(head);
  node.appendChild(el('p', 'poll-from', 'from ' + (mode === 'chat' && mine(g) ? 'you' : g.author.name)));
  const body = el('div', 'hm-body');
  body.appendChild(gallows(wrong.length));
  body.appendChild(phrase(g, mode));
  node.appendChild(body);
  node.appendChild(el('p', 'hm-wrong', 'Wrong (' + wrong.length + '/' + MAX_WRONG + '): ' + (wrong.join(' ') || '—')));
  if (g.last && g.state === 'open') node.appendChild(el('p', 'hm-last', g.last.by + ' guessed ' + g.last.letter + (g.last.hit ? ' ✓' : ' ✗')));
  const foot = g.state === 'lost' ? '💀 Out of guesses. The phrase was “' + g.phrase + '”.'
    : mode === 'chat' && mine(g) ? 'Your phrase: everyone else\'s messages are guesses.'
      : 'Send a message: its first letter is your guess.';
  node.appendChild(el('p', 'poll-foot', foot));
  if (mode === 'chat' && !g.cleared) {
    const row = el('div', 'poll-actions');
    const b = el('button', 'link-button', 'Clear from displays');
    b.type = 'button';
    b.addEventListener('click', () => { if (onClear) onClear(g); });
    row.appendChild(b);
    node.appendChild(row);
  }
}

export function gameCard(g: Hangman, mode: GameMode): HTMLElement {
  const node = el('div', 'poll-card game-card hangman in-' + mode);
  node.dataset.game = g.id;
  fill(node, g, mode);
  const set = cards.get(g.id) || new Set();
  set.add({ node, mode });
  cards.set(g.id, set);
  return node;
}

export function refreshGame(g: Hangman): void {
  const set = cards.get(g.id);
  if (!set) return;
  set.forEach((c) => { if (c.node.isConnected) fill(c.node, g, c.mode); else set.delete(c); });
}

/** Solved: every copy bursts into confetti that rains down, and is gone. */
export function explode(g: Hangman): void {
  const set = cards.get(g.id);
  cards.delete(g.id);
  if (!set) return;
  set.forEach(({ node }) => {
    if (!node.isConnected) return;
    const target = (node.closest('.game-msg') as HTMLElement) || node;
    const r = target.getBoundingClientRect();
    if (!reducedMotion()) confetti(r);
    const out = target.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.15)' }], { duration: 260, fill: 'forwards' });
    out.finished.then(() => target.remove(), () => target.remove());
  });
}

const COLOURS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6', '#facc15'];
export function confetti(r: DOMRect): void {
  const o = overlayCanvas('fx-confetti');
  const { ctx, w, h, dpr } = o;
  const bits = Array.from({ length: 160 }, () => ({
    x: (r.left + Math.random() * r.width) * dpr, y: (r.top + Math.random() * r.height) * dpr,
    vx: (Math.random() - 0.5) * 520 * dpr, vy: (-150 - Math.random() * 450) * dpr,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, sway: Math.random() * 6,
    size: (5 + Math.random() * 5) * dpr, colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
  }));
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    bits.forEach((b) => {
      b.vy = Math.min(b.vy + 900 * dpr * dt, 260 * dpr); // flutters down slowly
      b.vx *= 1 - 1.5 * dt;
      b.x += (b.vx + Math.sin(now / 300 + b.sway) * 40 * dpr) * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.colour;
      ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      ctx.restore();
    });
    if (bits.some((b) => b.y < h + 20 * dpr)) requestAnimationFrame(frame);
    else o.canvas.remove();
  }
  requestAnimationFrame(frame);
}
