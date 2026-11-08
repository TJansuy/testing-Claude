// How a poll or quiz looks: a bubble in the chat you can vote in, or a card on
// the display's board. Every copy on screen is redrawn when votes come in.
// A quiz turns green for you if your answer was right and red if not; once
// it's closed it shows the right answer and who got it right and wrong.
import { el } from '../dom';
import { device, isCorrect, marks, myVote, numberOf, Poll, resultsShown, tally } from './model';

export type CardMode = 'chat' | 'board';
interface Actions { vote(p: Poll, option: number): void; close(p: Poll): void; clear(p: Poll): void }
let actions: Actions | null = null;
export const setActions = (a: Actions): void => { actions = a; };

const cards = new Map<string, Set<{ node: HTMLElement; mode: CardMode }>>();

const plural = (n: number, word: string): string => n + ' ' + word + (n === 1 ? '' : 's');
const button = (cls: string, text: string, onClick: () => void): HTMLButtonElement => {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

function state(p: Poll): string {
  if (p.cleared) return p.closed || (!p.secret && !p.quiz) ? 'Ended' : 'Ended without results';
  return p.closed ? 'Closed' : 'Open';
}

function kind(p: Poll): string {
  return p.quiz ? '🧠 Quiz' : p.secret ? '🔒 Secret poll' : '📊 Poll';
}

function footer(p: Poll, total: number, mode: CardMode): string {
  const votes = plural(total, p.quiz ? 'answer' : 'vote');
  if (resultsShown(p)) return votes + (p.closed || p.cleared ? ' · final results' : ' · updates live');
  if (p.cleared) return votes + ' · it was cleared before the results were shown';
  const closer = mode === 'chat' && p.owner === device ? 'you close it' : p.author.name + ' closes it';
  return votes + ' so far · 🔒 ' + (p.quiz ? 'answers' : 'results') + ' when ' + closer;
}

function fill(node: HTMLElement, p: Poll, mode: CardMode): void {
  const t = tally(p);
  const shown = resultsShown(p);
  const mine = myVote(p);
  const owner = p.owner === device;
  // In a quiz you answer once, and the person who wrote it doesn't answer.
  const canVote = mode === 'chat' && !p.closed && !p.cleared && !(p.quiz && (mine !== undefined || owner));
  const over = p.closed || p.cleared;
  const top = Math.max(1, ...t.counts);
  node.replaceChildren();
  node.classList.toggle('closed', over);
  node.classList.toggle('secret', p.secret);
  node.classList.toggle('quiz', p.quiz);
  // Your quiz answer: the whole card turns green or red, for you.
  const verdict = p.quiz && mode === 'chat' && mine !== undefined ? (isCorrect(p, mine) ? 'right' : 'wrong') : '';
  node.classList.toggle('right', verdict === 'right');
  node.classList.toggle('wrong', verdict === 'wrong');

  const head = el('div', 'poll-head');
  if (!p.cleared) head.appendChild(el('span', 'poll-num', '#' + numberOf(p)));
  head.appendChild(el('span', 'poll-kind', kind(p)));
  head.appendChild(el('span', 'poll-state', state(p)));
  node.appendChild(head);
  node.appendChild(el('p', 'poll-q', p.question));
  node.appendChild(el('p', 'poll-from', 'from ' + (owner ? 'you' : p.author.name)));
  if (verdict) node.appendChild(el('p', 'quiz-verdict', verdict === 'right' ? '✅ You got it right!' : '❌ Not quite.' + (over ? '' : ' The answer is shown when the quiz closes.')));

  const list = el('ol', 'poll-options');
  p.options.forEach((label, i) => {
    const row = el('li', 'poll-option');
    const pct = shown && t.total ? Math.round((t.counts[i] / t.total) * 100) : 0;
    // A quiz's right answers show once it's closed (and always to its author).
    const answer = p.quiz && isCorrect(p, i) && (shown || (owner && mode === 'chat'));
    const win = shown && !p.quiz && over && t.total > 0 && t.counts[i] === top;
    const body = canVote ? button('poll-choice', '', () => { if (actions) actions.vote(p, i); }) : el('div', 'poll-choice');
    if (body instanceof HTMLButtonElement) body.setAttribute('aria-pressed', String(mine === i));
    if (mine === i) row.classList.add('picked');
    if (win) row.classList.add('winner');
    if (answer) row.classList.add('answer');
    const bar = el('span', 'poll-bar');
    bar.style.width = pct + '%';
    body.appendChild(bar);
    body.appendChild(el('span', 'poll-label', (mine === i ? '✓ ' : '') + label + (answer ? ' ✔ correct' : '')));
    if (shown) body.appendChild(el('span', 'poll-count', t.counts[i] + (t.total ? ' · ' + pct + '%' : '')));
    row.appendChild(body);
    if (shown && !p.secret && !p.quiz && t.voters[i].length) row.appendChild(el('span', 'poll-voters', t.voters[i].join(', ')));
    list.appendChild(row);
  });
  node.appendChild(list);

  if (p.quiz && shown) {
    // Who was right and who was wrong.
    const m = marks(p);
    const who = el('div', 'quiz-results');
    who.appendChild(el('p', 'quiz-right', '✅ Right (' + m.right.length + '): ' + (m.right.join(', ') || 'nobody')));
    who.appendChild(el('p', 'quiz-wrong', '❌ Wrong (' + m.wrong.length + '): ' + (m.wrong.join(', ') || 'nobody')));
    node.appendChild(who);
  }
  node.appendChild(el('p', 'poll-foot', footer(p, t.total, mode)));

  if (mode === 'chat' && !p.cleared) {
    const row = el('div', 'poll-actions');
    if (!p.closed && owner) row.appendChild(button('link-button', p.quiz ? 'Close and show answers' : p.secret ? 'Close and show results' : 'Close poll', () => { if (actions) actions.close(p); }));
    row.appendChild(button('link-button', 'Clear from displays', () => { if (actions) actions.clear(p); }));
    node.appendChild(row);
  }
}

/** A new card for a poll; it keeps itself up to date. */
export function card(p: Poll, mode: CardMode): HTMLElement {
  const node = el('div', 'poll-card in-' + mode);
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
