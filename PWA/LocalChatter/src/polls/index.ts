// Polls: sending them, voting, closing and clearing, the display's poll board,
// and reminding people who join about the polls that are running.
import { append, systemLine, systemNotice } from '../chat/list';
import { $, el } from '../dom';
import { show } from '../features/background';
import { sendRaw } from '../net/connection';
import { connected, DISPLAY, state } from '../state';
import type { Peer, PollMessage, WirePoll } from '../types';
import { randomId } from '../util';
import { card, refreshAll, setActions } from './card';
import { active, device, merge, Poll, polls, toWire, vote, voteLater } from './model';

const send = (msg: Omit<PollMessage, 'type'>): boolean => sendRaw({ type: 'poll', ...msg });
const quote = (p: Poll): string => '“' + p.question + '”';
const by = (from: Peer | undefined): string => (from ? from.name : 'Someone');

/** Redraws every poll on screen, and the display's board. */
function redraw(also?: Poll): void {
  refreshAll(also ? [...active(), also] : active());
  updateBoard();
}

/** A poll's bubble in the chat (the display shows it on its board instead). */
export function placeInChat(p: Poll): void {
  if (DISPLAY) return;
  const box = el('div', 'msg poll-msg' + (p.owner === device ? ' mine' : ''));
  box.appendChild(card(p, 'chat'));
  append(box);
}

// ---- The display's board: every poll that hasn't been cleared, oldest first.
const board = $('poll-board');
function updateBoard(): void {
  if (!DISPLAY) return;
  const list = active();
  // Polls come first; hangman games (games/index.ts) follow them.
  board.querySelectorAll<HTMLElement>('[data-poll]').forEach((c) => {
    if (!list.some((p) => p.id === c.dataset.poll)) c.remove();
  });
  list.forEach((p, i) => {
    const node = board.querySelector<HTMLElement>('[data-poll="' + CSS.escape(p.id) + '"]') || card(p, 'board');
    if (board.children[i] !== node) board.insertBefore(node, board.children[i] || null);
  });
  board.hidden = !board.children.length;
}

// ---- What this device does
/** correct: for a quiz, which options are right. */
export function createPoll(question: string, options: string[], secret: boolean, correct?: number[]): boolean {
  if (!connected() || !state.me) return false;
  const w: WirePoll = { id: randomId(), question, options, secret, author: state.me, owner: device, at: Date.now() };
  if (correct && correct.length) { w.quiz = true; w.correct = correct; w.secret = false; }
  send({ op: 'new', poll: w });
  const { poll } = merge(w);
  placeInChat(poll);
  redraw();
  return true;
}

function castVote(p: Poll, option: number): void {
  if (!state.me || !send({ op: 'vote', id: p.id, voter: device, option })) { systemLine('Not connected: vote not sent'); return; }
  if (vote(p, { voter: device, name: state.me.name, option, at: Date.now() })) redraw();
}

export function closePoll(p: Poll): void {
  if (p.owner !== device) { systemLine('Only ' + p.author.name + ', who started it, can close the poll ' + quote(p) + '.'); return; }
  if (p.closed) { systemLine('The poll ' + quote(p) + ' is already closed.'); return; }
  if (!send({ op: 'close', id: p.id, voter: device })) { systemLine('Not connected: poll not closed'); return; }
  p.closed = true;
  redraw();
  systemLine('📊 You closed ' + (p.quiz ? 'the quiz ' : 'the poll ') + quote(p) + (p.quiz ? ': the answers are on the displays.' : p.secret ? ': the results are on the displays.' : '.'));
}

function clearLocal(p: Poll): void {
  p.cleared = true;
  redraw(p);
}

export function clearPolls(list: Poll[], all: boolean): void {
  if (!list.length) { systemLine('There are no polls on the displays.'); return; }
  if (!send(all ? { op: 'clear', all: true } : { op: 'clear', id: list[0].id })) { systemLine('Not connected: nothing cleared'); return; }
  list.forEach(clearLocal);
  systemLine('🧹 You cleared ' + (all ? 'all the polls' : 'the poll ' + quote(list[0])) + ' from the displays.');
}

setActions({ vote: castVote, close: closePoll, clear: (p) => clearPolls([p], false) });

// ---- What others do
export function handlePoll(msg: PollMessage): void {
  const p = msg.id ? polls.get(msg.id) : undefined;
  switch (msg.op) {
    case 'new': {
      if (!msg.poll) return;
      const r = merge(msg.poll, msg.at);
      if (r.isNew) show(() => placeInChat(r.poll));
      redraw();
      return;
    }
    case 'vote': {
      if (!msg.id || !msg.voter || msg.option === undefined) return;
      const v = { voter: msg.voter, name: by(msg.from), option: msg.option, at: msg.at || Date.now() };
      if (!p) voteLater(msg.id, v);
      else if (vote(p, v)) redraw();
      return;
    }
    case 'close':
      if (!p || p.closed || p.cleared || msg.voter !== p.owner) return; // only its author's device can close it
      p.closed = true;
      redraw();
      show(() => systemNotice('📊 ' + by(msg.from) + ' closed ' + (p.quiz ? 'the quiz ' : 'the poll ') + quote(p) + '.'));
      return;
    case 'clear': {
      const list = msg.all ? active() : p && !p.cleared ? [p] : [];
      if (!list.length) return;
      list.forEach(clearLocal);
      show(() => systemNotice('🧹 ' + by(msg.from) + ' cleared ' + (msg.all ? 'all the polls' : 'the poll ' + quote(list[0])) + ' from the displays.'));
      return;
    }
    case 'sync':
      if (msg.to) cancelReminder(msg.to); // someone else got there first
      remembered(msg.polls || [], msg.to === (state.me && state.me.id) ? msg.from : undefined);
  }
}

/** Polls someone passed on. New ones join the chat; cleared ones stay cleared. */
function remembered(list: WirePoll[], reminder: Peer | undefined): void {
  const added: Poll[] = [];
  list.forEach((w) => {
    const had = polls.get(w.id);
    if (had && had.cleared) return;
    const r = merge(w);
    if (r.isNew) added.push(r.poll);
  });
  if (!added.length) { redraw(); return; }
  show(() => {
    if (reminder) systemNotice('📊 ' + reminder.name + ' reminded you about ' + (added.length === 1 ? 'a poll that\'s' : added.length + ' polls that are') + ' running:');
    added.forEach(placeInChat);
  });
  redraw();
}

// ---- Reminding people who join. Every device here could; the first to answer
// does, and the others stand down when they see it.
const reminders = new Map<string, ReturnType<typeof setTimeout>>();
function cancelReminder(id: string): void {
  clearTimeout(reminders.get(id));
  reminders.delete(id);
}
export function remindNewcomer(peer: Peer): void {
  if (!active().length || (state.me && peer.id === state.me.id)) return;
  cancelReminder(peer.id);
  // Displays answer first (they keep every poll on screen); others wait a moment.
  const wait = (DISPLAY ? 100 : 400) + Math.random() * 900;
  reminders.set(peer.id, setTimeout(() => {
    reminders.delete(peer.id);
    const list = active().map(toWire);
    if (list.length && state.peers.has(peer.id)) send({ op: 'sync', to: peer.id, polls: list });
  }, wait));
}
