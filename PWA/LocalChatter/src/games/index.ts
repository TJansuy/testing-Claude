// Games beside the chat. Hangman: /hangman <phrase> starts one; every other
// message anyone sends is a guess (its first letter) in every open game. The
// display shows them on its board with the polls. Also announces the wall game.
//   /hangman <phrase>        start a game (others never see the phrase)
//   /hangman                 show the running games again
//   /hangman clear [n | all] take games off the displays (anyone)
import { append, systemLine, systemNotice } from '../chat/list';
import { $, button, el, input } from '../dom';
import { show } from '../features/background';
import { sendRaw } from '../net/connection';
import { device } from '../polls/model';
import { connected, DISPLAY, state } from '../state';
import type { ChatMessage, GameMessage, Peer, WireGame } from '../types';
import { randomId } from '../util';
import { handleRace, raceCommand } from './race';
import { DESCRIBE, WallVariant } from '../effects/wall-rules';
import { explode, gameCard, refreshGame, setClear } from './card';
import { games, guess, guessIn, Hangman, isLetter, mergeGame, open, shown, toWire } from './hangman';

const send = (msg: Omit<GameMessage, 'type'>): boolean => sendRaw({ type: 'game', ...msg });
const board = $('poll-board');

/** The display's board: games go after the polls. */
function updateBoard(): void {
  if (!DISPLAY) return;
  const list = shown();
  board.querySelectorAll<HTMLElement>('[data-game]').forEach((c) => {
    if (!list.some((g) => g.id === c.dataset.game) && !c.getAnimations().length) c.remove();
  });
  list.forEach((g) => {
    if (!board.querySelector('[data-game="' + CSS.escape(g.id) + '"]')) board.appendChild(gameCard(g, 'board'));
  });
  board.hidden = !board.children.length;
}

function placeInChat(g: Hangman): void {
  if (DISPLAY || g.state === 'won') return;
  const box = el('div', 'msg game-msg' + (g.owner === device ? ' mine' : ''));
  box.appendChild(gameCard(g, 'chat'));
  append(box);
}

function changed(g: Hangman, by: string): void {
  if (g.state === 'won') {
    explode(g);
    show(() => systemNotice('🎉 Hangman solved: “' + g.phrase + '”! ' + by + ' found the last letter.'));
  } else {
    refreshGame(g);
    if (g.state === 'lost') show(() => systemNotice('💀 Hangman lost: the phrase was “' + g.phrase + '”.'));
  }
  updateBoard();
}

/** Every chat message (sent or received, not whispers) is a guess in the open games. */
export function chatGuess(msg: ChatMessage, sender: Peer | null | undefined): void {
  if (msg.to || msg.file || msg.sound || !sender || /^\s*\//.test(msg.text || '')) return;
  const letter = guessIn(msg.text);
  if (!letter) return;
  const meSending = !!state.me && sender.id === state.me.id;
  open().forEach((g) => {
    if (sender.id === g.author.id || (meSending && g.owner === device)) return; // not your own phrase
    if (guess(g, letter, meSending ? 'You' : sender.name) !== null) changed(g, meSending ? 'You' : sender.name);
  });
}

export function startHangman(text: string): string {
  const phrase = text.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!Array.from(phrase).some(isLetter)) return 'Give a word or phrase to guess, e.g. /hangman Under the weather';
  if (!connected() || !state.me) return 'Not connected: game not started.';
  const w: WireGame = { id: randomId(), kind: 'hangman', phrase, author: state.me, owner: device, at: Date.now() };
  send({ op: 'new', game: w });
  placeInChat(mergeGame(w).game);
  updateBoard();
  return '';
}

function clearLocal(g: Hangman): void {
  g.cleared = true;
  refreshGame(g);
  updateBoard();
}
function clearGames(list: Hangman[], all: boolean): void {
  if (!list.length) { systemLine('There are no hangman games on the displays.'); return; }
  if (!send(all ? { op: 'clear', all: true } : { op: 'clear', id: list[0].id })) { systemLine('Not connected: nothing cleared'); return; }
  list.forEach(clearLocal);
  systemLine('🧹 You cleared ' + (all ? 'the hangman games' : 'the hangman game') + ' from the displays.');
}
setClear((g) => clearGames([g], false));

export function hangmanCommand(rest: string): void {
  const m = /^clear\b\s*(.*)$/i.exec(rest);
  if (m) {
    const list = shown();
    const n = parseInt(m[1], 10);
    if (!m[1] || /^all$/i.test(m[1])) clearGames(list, true);
    else if (list[n - 1]) clearGames([list[n - 1]], false);
    else systemLine('There\'s no hangman game ' + m[1] + '. Type /hangman to see them.');
    return;
  }
  if (!rest) {
    const list = shown();
    if (!list.length) { systemLine('No hangman games are running. Start one with /hangman <phrase>: everyone else\'s messages are guesses (their first letter).'); return; }
    systemLine('🪢 Hangman games running (' + list.length + '):');
    list.forEach(placeInChat);
    return;
  }
  const err = startHangman(rest);
  if (err) systemLine(err);
}

export function handleGame(msg: GameMessage): void {
  if (msg.op === 'race' || msg.op === 'drop' || msg.op === 'stop') { handleRace(msg); return; }
  const g = msg.id ? games.get(msg.id) : undefined;
  if (msg.op === 'new' && msg.game) {
    const r = mergeGame(msg.game, msg.at);
    if (r.isNew) show(() => placeInChat(r.game));
    updateBoard();
  } else if (msg.op === 'clear') {
    const list = msg.all ? shown() : g && !g.cleared ? [g] : [];
    list.forEach(clearLocal);
    if (list.length) show(() => systemNotice('🧹 ' + (msg.from ? msg.from.name : 'Someone') + ' cleared ' + (msg.all ? 'the hangman games' : 'a hangman game') + ' from the displays.'));
  } else if (msg.op === 'sync') {
    if (msg.to) cancelReminder(msg.to);
    const forMe = !!state.me && msg.to === state.me.id;
    const added: Hangman[] = [];
    (msg.games || []).forEach((w) => {
      const had = games.get(w.id);
      if (had && had.cleared) return;
      const r = mergeGame(w);
      if (r.isNew) added.push(r.game); else refreshGame(r.game);
    });
    if (added.length) {
      show(() => {
        if (forMe && msg.from) systemNotice('🪢 ' + msg.from.name + ' reminded you about ' + (added.length === 1 ? 'a hangman game' : added.length + ' hangman games') + ':');
        added.forEach(placeInChat);
      });
    }
    updateBoard();
  }
}

// ---- Reminding people who join (the first device to answer does; the rest stand down).
const reminders = new Map<string, ReturnType<typeof setTimeout>>();
function cancelReminder(id: string): void { clearTimeout(reminders.get(id)); reminders.delete(id); }
export function remindAboutGames(peer: Peer): void {
  if (!shown().length || (state.me && peer.id === state.me.id)) return;
  cancelReminder(peer.id);
  reminders.set(peer.id, setTimeout(() => {
    reminders.delete(peer.id);
    const list = shown().map(toWire);
    if (list.length && state.peers.has(peer.id)) send({ op: 'sync', to: peer.id, games: list });
  }, (DISPLAY ? 150 : 450) + Math.random() * 900));
}

// ---- The wall: a line when it breaks.
// When it's over, say which hidden rule it was following.
document.addEventListener('localchatter:game', (ev) => {
  const d = (ev as CustomEvent<{ game: string; result: string; hits: number; by?: string; variant: WallVariant; sent: number }>).detail;
  if (d.game !== 'wall') return;
  const plural = (n: number, w: string): string => n + ' ' + w + (n === 1 ? '' : 's');
  const tally = d.sent > d.hits ? ' (' + plural(d.sent, 'message') + ' thrown at it, ' + d.hits + ' did damage)' : '';
  if (d.result === 'broken') systemLine('💥 The wall broke after ' + plural(d.hits, 'hit') + tally + '! ' + d.by + ' landed the final blow. It was ' + DESCRIBE[d.variant] + '.');
  else systemLine('🧱 The wall went back up after ' + plural(d.hits, 'hit') + tally + '. It was ' + DESCRIBE[d.variant] + '.');
});

// ---- Drop Race from the ✨ tray
button('race-new').addEventListener('click', () => raceCommand(''));

// ---- The New hangman form
const dialog = $<HTMLDialogElement>('hangman-dialog');
button('hangman-new').addEventListener('click', () => {
  input('hangman-phrase').value = '';
  $('hangman-status').textContent = '';
  dialog.showModal();
});
button('hangman-cancel').addEventListener('click', () => dialog.close());
$<HTMLFormElement>('hangman-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = startHangman(input('hangman-phrase').value);
  if (err) { $('hangman-status').textContent = err; return; }
  dialog.close();
});
