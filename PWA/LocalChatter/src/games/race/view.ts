// Drop Race: what's on screen. The board is drawn at its virtual size and
// scaled to fit above the message bar, so every screen shows the same race.
import { colourBubble } from '../../chat/list';
import { el } from '../../dom';
import { reducedMotion } from '../../effects/shared';
import { state } from '../../state';
import { confetti } from '../card';
import { Ball, H, heft, PIN_R, W, World } from './sim';

let root: HTMLElement | null = null;
let board: HTMLElement | null = null;
let label: HTMLElement | null = null;
const balls = new Map<number, HTMLElement>(); // by entry number
const burning = new Set<number>();

function layout(): void {
  if (!board) return;
  const bar = document.getElementById('composer');
  const bottom = bar && bar.offsetParent ? bar.getBoundingClientRect().top : innerHeight;
  const scale = Math.min(innerWidth / W, bottom / H);
  board.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${bottom - H * scale}px) scale(${scale})`;
}

export function openBoard(world: World): void {
  closeBoard();
  root = el('div', 'race');
  root.setAttribute('aria-hidden', 'true');
  board = el('div', 'race-board');
  board.style.width = W + 'px';
  board.style.height = H + 'px';
  world.board.pins.forEach((p) => {
    const pin = el('i', 'race-pin' + (p.cup ? ' cup' : ''));
    Object.assign(pin.style, { left: p.x - PIN_R + 'px', top: p.y - PIN_R + 'px', width: 2 * PIN_R + 'px', height: 2 * PIN_R + 'px', animationDelay: Math.round(p.y * 0.9) + 'ms' });
    pin.dataset.y = String(p.y);
    board!.appendChild(pin);
  });
  label = el('div', 'race-banner');
  label.setAttribute('role', 'status');
  root.append(board, label);
  document.body.appendChild(root);
  layout();
  addEventListener('resize', layout);
}

export function closeBoard(): void {
  removeEventListener('resize', layout);
  if (root) root.remove();
  root = board = label = null;
  balls.clear();
  burning.clear();
}

export function banner(text: string, ms = 2600): void {
  if (!label) return;
  label.textContent = text;
  label.classList.remove('show');
  void label.offsetWidth;
  label.classList.add('show');
  if (ms) setTimeout(() => { if (label && label.textContent === text) label.classList.remove('show'); }, ms);
}

function ballEl(b: Ball): HTMLElement {
  let node = balls.get(b.entry.seq);
  if (node) return node;
  node = el('div', 'race-ball');
  const mine = !!state.me && b.entry.from.id === state.me.id;
  if (mine) node.classList.add('mine'); else colourBubble(node, b.entry.from);
  node.appendChild(el('b', null, mine ? 'You' : b.entry.from.name));
  node.appendChild(el('span', null, b.entry.text));
  Object.assign(node.style, { width: 2 * b.r + 'px', height: 2 * b.r + 'px', fontSize: (b.r < 17 ? 10 : Math.max(9, b.r * 0.42)) + 'px', borderWidth: 1.5 + heft(b) * 4 + 'px' });
  node.title = b.entry.text;
  if (b.r < 17) node.classList.add('tiny'); // too small for its text: it's labelled above instead
  node.style.setProperty('--heft', heft(b).toFixed(2)); // denser messages look darker and heavier
  board!.appendChild(node);
  balls.set(b.entry.seq, node);
  return node;
}

/** Draws the world as it is now. */
export function draw(world: World): void {
  if (!board) return;
  const live = new Set<number>();
  world.balls.forEach((b) => {
    live.add(b.entry.seq);
    ballEl(b).style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
  });
  // Stuck ones burn away where they stopped.
  world.burns.forEach(({ ball }) => {
    if (burning.has(ball.entry.seq)) return;
    burning.add(ball.entry.seq);
    const node = ballEl(ball);
    node.style.transform = `translate(${ball.x - ball.r}px, ${ball.y - ball.r}px)`;
    node.classList.add('burning');
    setTimeout(() => { node.remove(); }, 1100);
  });
  balls.forEach((node, seq) => { if (!live.has(seq) && !burning.has(seq) && !(world.winner && world.winner.entry.seq === seq)) { node.remove(); balls.delete(seq); } });
}

/** The winner drops out of the bottom in a shower of confetti. */
export function celebrate(world: World, name: string): void {
  const w = world.winner;
  const node = w && balls.get(w.entry.seq);
  if (node && w) {
    node.classList.add('winner');
    node.style.transition = 'transform .8s ease-in';
    node.style.transform = `translate(${w.x - w.r}px, ${H + 3 * w.r}px)`;
  }
  const bar = board ? board.getBoundingClientRect() : null;
  if (bar && !reducedMotion()) confetti(new DOMRect(bar.left, bar.bottom - 40, bar.width, 40));
  banner('🏆 ' + name + ' won the Drop Race!', 0);
}

/** The pins sink back into the background, and the board goes. */
export function retract(after: () => void): void {
  if (!root) { after(); return; }
  root.classList.add('out');
  setTimeout(() => { closeBoard(); after(); }, 1100);
}

/** Nobody made it, twice: a giant unhappy face comes down and sweeps it all away. */
export function sadSweep(after: () => void): void {
  if (!root || !board) { after(); return; }
  banner('Nobody made it through 😞', 0);
  const face = el('div', 'race-sad', '😞');
  root.appendChild(face);
  const size = Math.min(innerWidth, innerHeight) * 0.6;
  const ms = reducedMotion() ? 1200 : 3600;
  const anim = face.animate([{ transform: `translate(-50%, ${-size}px)` }, { transform: `translate(-50%, ${innerHeight + size * 0.2}px)` }],
    { duration: ms, easing: 'cubic-bezier(.4, 0, .7, 1)', fill: 'forwards' });
  // Everything is swept off as the face's chin passes it.
  const speed = (innerHeight + size * 1.2) / ms;
  board.querySelectorAll<HTMLElement>('.race-pin, .race-ball').forEach((n) => {
    const y = n.getBoundingClientRect().top;
    setTimeout(() => n.classList.add('swept'), Math.max(0, (y + size * 0.9) / speed));
  });
  anim.finished.then(() => { closeBoard(); after(); }, () => { closeBoard(); after(); });
}

export const boardOpen = (): boolean => !!root;
