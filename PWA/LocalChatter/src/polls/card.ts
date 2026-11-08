// How a poll looks: a bubble in the chat you can vote in, or a card on the
// display's poll board. Every copy on screen is redrawn when votes come in.
import { el } from '../dom';
import { device, myVote, numberOf, Poll, resultsShown, tally } from './model';

export type CardMode = 'chat' | 'board';
interface Actions { vote(p: Poll, option: number): void; close(p: Poll): void; clear(p: Poll): void }
let actions: Actions | null = null;
export const setActions = (a: Actions): void => { actions = a; };

const cards = new Map<string, Set<{ node: HTMLElement; mode: CardMode }>>();

const plural = (n: number, word: string): string => n + ' ' + word + (n === 1 ? '' : 's');

function state(p: Poll): string {
  if (p.cleared) return p.closed || !p.secret ? 'Ended' : 'Ended without results';
  return p.closed ? 'Closed' : 'Open';
}

function footer(p: Poll, total: number, mode: CardMode): string {
  const votes = plural(total, 'vote');
  if (resultsShown(p)) return votes + (p.closed || p.cleared ? ' · final results' : ' · updates live');
  if (p.cleared) return votes + ' · it was cleared before the results were shown';
  return votes + ' so far · 🔒 results when ' + (mode === 'chat' && p.owner === device ? 'you close it' : p.author.name + ' closes it');
}

function fill(node: HTMLElement, p: Poll, mode: CardMode): void {
  const t = tally(p);
  const shown = resultsShown(p);
  const mine = myVote(p);
  const canVote = mode === 'chat' && !p.closed && !p.cleared;
  const top = Math.max(1, ...t.counts);
  node.replaceChildren();
  node.classList.toggle('closed', p.closed || p.cleared);
  node.classList.toggle('secret', p.secret);

  const head = el('div', 'poll-head');
  if (!p.cleared) head.appendChild(el('span', 'poll-num', '#' + numberOf(p)));
  head.appendChild(el('span', 'poll-kind', p.secret ? '🔒 Secret poll' : '📊 Poll'));
  head.appendChild(el('span', 'poll-state', state(p)));
  node.appendChild(head);
  node.appendChild(el('p', 'poll-q', p.question));
  node.appendChild(el('p', 'poll-from', 'from ' + (p.owner === device ? 'you' : p.author.name)));

  const list = el('ol', 'poll-options');
  p.options.forEach((label, i) => {
    const row = el('li', 'poll-option');
    const pct = shown && t.total ? Math.round((t.counts[i] / t.total) * 100) : 0;
    const win = shown && (p.closed || p.cleared) && t.total > 0 && t.counts[i] === top;
    const body = canVote ? el('button', 'poll-choice') : el('div', 'poll-choice');
    if (body instanceof HTMLButtonElement) {
      body.type = 'button';
      body.setAttribute('aria-pressed', String(mine === i));
      body.addEventListener('click', () => { if (actions) actions.vote(p, i); });
    }
    if (mine === i) row.classList.add('picked');
    if (win) row.classList.add('winner');
    const bar = el('span', 'poll-bar');
    bar.style.width = pct + '%';
    body.appendChild(bar);
    body.appendChild(el('span', 'poll-label', (mine === i ? '✓ ' : '') + label));
    if (shown) body.appendChild(el('span', 'poll-count', t.counts[i] + (t.total ? ' · ' + pct + '%' : '')));
    row.appendChild(body);
    if (shown && !p.secret && t.voters[i].length) row.appendChild(el('span', 'poll-voters', t.voters[i].join(', ')));
    list.appendChild(row);
  });
  node.appendChild(list);
  node.appendChild(el('p', 'poll-foot', footer(p, t.total, mode)));

  if (mode === 'chat' && !p.cleared) {
    const row = el('div', 'poll-actions');
    if (!p.closed && p.owner === device) {
      const close = el('button', 'link-button', p.secret ? 'Close and show results' : 'Close poll');
      close.type = 'button';
      close.addEventListener('click', () => { if (actions) actions.close(p); });
      row.appendChild(close);
    }
    const clear = el('button', 'link-button', 'Clear from displays');
    clear.type = 'button';
    clear.addEventListener('click', () => { if (actions) actions.clear(p); });
    row.appendChild(clear);
    node.appendChild(row);
  }
}

/** A new card for a poll; it keeps itself up to date. */
export function card(p: Poll, mode: CardMode): HTMLElement {
  const node = el('div', 'poll-card poll-' + mode);
  node.dataset.poll = p.id;
  fill(node, p, mode);
  const set = cards.get(p.id) || new Set();
  set.add({ node, mode });
  cards.set(p.id, set);
  return node;
}

/** Redraws every copy of a poll that's still on screen. */
export function refresh(p: Poll): void {
  const set = cards.get(p.id);
  if (!set) return;
  set.forEach((c) => {
    if (c.node.isConnected) fill(c.node, p, c.mode);
    else if (!c.node.closest('.fx-ghost')) set.delete(c); // gone (scrolled off the top, or swallowed)
  });
}

/** Renumbers everything (numbers change when a poll is cleared). */
export function refreshAll(all: Iterable<Poll>): void {
  for (const p of all) refresh(p);
}
