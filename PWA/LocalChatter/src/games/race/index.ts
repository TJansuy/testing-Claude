// Drop Race: starting and stopping it, entering, and keeping time.
//   /droprace        start a race (or 🎯 Drop Race in the ✨ tray)
//   /droprace off    stop it (anyone)
// While it runs, the next message each person sends is their entry: instead of
// going to the chat it drops from the top of the board. The relay stamps every
// race message with its own clock, and every device plays the race a moment
// behind that clock, so entries are always in place before they drop.
import { refreshLanguages, systemLine } from '../../chat/list';
import { $ } from '../../dom';
import { sendRaw } from '../../net/connection';
import { DISPLAY, state } from '../../state';
import type { GameMessage } from '../../types';
import { randomId } from '../../util';
import { Entry, HZ, World } from './sim';
import { banner, celebrate, draw, openBoard, retract, sadSweep } from './view';

const DELAY_MS = 700;

interface Race { id: string; start: number; by: string; entries: Entry[]; stopAt: number; world: World; seen: Set<string>; ended: boolean }
let race: Race | null = null;
let offset = -Infinity; // the relay's clock minus ours (from the timestamps it sends)
let seq = 0;
let entered = 0; // the round this device last entered

const send = (msg: Omit<GameMessage, 'type'>): boolean => sendRaw({ type: 'game', ...msg });
const serverNow = (): number => Date.now() + (offset === -Infinity ? 0 : offset);
const nameOf = (id: string, name: string): string => (state.me && id === state.me.id ? 'You' : name);

export const raceRunning = (): boolean => !!race && !race.ended;

/** Rebuilds the world from scratch: everything follows from the entries alone. */
function rebuild(r: Race): void {
  const stopStep = r.stopAt ? Math.max(1, Math.ceil(((r.stopAt - r.start) / 1000) * HZ)) : Infinity;
  const world = new World(r.id, r.start, r.entries, stopStep);
  world.advance(r.world.step);
  r.world = world;
}

function placeholder(): void {
  refreshLanguages();
  const t = $<HTMLTextAreaElement>('text');
  if (raceRunning() && race && entered < roundOpen(race.world)) t.placeholder = '🎯 Your Drop Race entry';
}
const roundOpen = (w: World): number => (w.phase === 'prompt' ? w.round + 1 : w.round);

/** Sending a message while a race runs: your first one each round is your entry. */
export function raceEntry(text: string): boolean {
  if (!race || race.ended || DISPLAY || /^\s*\//.test(text)) return false;
  const round = roundOpen(race.world);
  if (entered >= round) return false; // you're already in this round: it goes to the chat
  if (!send({ op: 'drop', id: race.id, text })) return false;
  entered = round;
  placeholder();
  systemLine('🎯 Your message is in the Drop Race: watch it fall!');
  return true;
}

export function raceCommand(rest: string): void {
  if (/^(off|stop)$/i.test(rest)) {
    if (!raceRunning() || !race) { systemLine('There\'s no Drop Race running.'); return; }
    if (!send({ op: 'stop', id: race.id })) systemLine('Not connected');
    return;
  }
  if (raceRunning()) { systemLine('A Drop Race is already running. /droprace off stops it.'); return; }
  if (!send({ op: 'race', id: randomId() })) systemLine('Not connected: race not started.');
}

export function handleRace(msg: GameMessage): void {
  if (msg.at) offset = Math.max(offset, msg.at - Date.now());
  if (!msg.id || !msg.at || !msg.from) return;
  if (msg.op === 'race') {
    if (raceRunning()) return; // one at a time
    const entries: Entry[] = [];
    const r: Race = { id: msg.id, start: msg.at, by: '', entries, stopAt: 0, world: new World(msg.id, msg.at, entries), seen: new Set(), ended: false };
    race = r;
    entered = 0;
    openBoard();
    banner('🎯 Drop Race! Send a message: it drops from the top', 3500);
    systemLine('🎯 ' + nameOf(msg.from.id, msg.from.name) + ' started a Drop Race! Your next message is your entry: it drops from the top, and the first to reach the bottom wins. Longer words are heavier.');
    placeholder();
    requestAnimationFrame(frame);
    return;
  }
  if (!race || msg.id !== race.id || race.ended) return;
  if (msg.op === 'drop' && msg.text) {
    const e: Entry = { from: msg.from, text: msg.text, at: msg.at, seq: seq++ };
    race.entries.push(e);
    race.entries.sort((a, b) => a.at - b.at || a.seq - b.seq);
    // Normally it arrives before its turn; if not, replay the race with it in.
    if (race.world.stepOf(e.at) <= race.world.step) rebuild(race);
  } else if (msg.op === 'stop' && !race.stopAt) {
    race.stopAt = msg.at;
    rebuild(race);
    race.by = nameOf(msg.from.id, msg.from.name);
  }
}

function frame(): void {
  const r = race;
  if (!r || r.ended) return;
  const target = Math.floor(((serverNow() - DELAY_MS - r.start) / 1000) * HZ);
  r.world.advance(target);
  draw(r.world);
  react(r);
  if (!r.ended) requestAnimationFrame(frame);
}

/** Things that happen once: a new round, a winner, nobody, stopped. */
function react(r: Race): void {
  const w = r.world;
  const once = (key: string): boolean => (r.seen.has(key) ? false : (r.seen.add(key), true));
  if (w.phase === 'prompt' && once('prompt')) {
    banner('Nobody made it! Send another message for round 2', 3200);
    systemLine('🔥 Nobody made it through the Drop Race. Send another message for round 2!');
    placeholder();
  }
  if (w.phase === 'running' && w.round === 2 && once('round2')) { banner('Round 2: go!', 1800); placeholder(); }
  if (!w.over) return;
  r.ended = true;
  placeholder();
  const done = (): void => { if (race === r) race = null; placeholder(); };
  if (w.phase === 'won' && w.winner) {
    const who = nameOf(w.winner.entry.from.id, w.winner.entry.from.name);
    celebrate(w, who);
    systemLine('🏆 ' + who + ' won the Drop Race with “' + w.winner.entry.text + '”!');
    setTimeout(() => retract(done), 4000);
  } else if (w.phase === 'failed') {
    systemLine('😞 Nobody made it through the Drop Race, twice. Nobody wins.');
    sadSweep(done);
  } else {
    systemLine('🎯 ' + r.by + ' stopped the Drop Race.');
    retract(done);
  }
}
