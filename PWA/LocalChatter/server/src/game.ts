// Games that live beside the chat (hangman): rebuilt from known fields only.
// The relay keeps no games; each app works out the guesses from the chat.
import { clean, MAX_NAME } from './config';
import { Peer, publicPeer } from './sanitise';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const OPS = ['new', 'clear', 'sync', 'race', 'drop', 'stop'];
/** Drop Race messages go back to their sender too, so every device times them by the relay's clock. */
export const ECHOED = ['race', 'drop', 'stop'];
const MAX_GAMES = 20;

function person(v: unknown): Peer | null {
  if (!isObject(v)) return null;
  const p = { id: clean(v.id, 64), name: clean(v.name, MAX_NAME) };
  return p.id && p.name ? p : null;
}

function game(v: unknown, author: Peer | null): Json | null {
  if (!isObject(v) || v.kind !== 'hangman') return null;
  const id = clean(v.id, 64);
  const phrase = clean(v.phrase, 120);
  const who = author || person(v.author);
  if (!id || !/\p{L}/u.test(phrase) || !who) return null;
  const out: Json = { id, kind: 'hangman', phrase, author: who, owner: clean(v.owner, 64) };
  if (typeof v.at === 'number' && v.at > 0) out.at = Math.floor(v.at);
  // Letters guessed so far (for someone who joins mid-game).
  const guessed = typeof v.guessed === 'string' ? Array.from(v.guessed).filter((c) => /\p{L}/u.test(c)).slice(0, 80).join('') : '';
  if (guessed) out.guessed = guessed;
  return out;
}

export function sanitiseGame(msg: Json, from: Peer): Json | null {
  const op = typeof msg.op === 'string' && OPS.includes(msg.op) ? msg.op : '';
  if (!op) return null;
  const out: Json = { type: 'game', op, from: publicPeer(from), at: Date.now() };
  if (op === 'new') {
    const g = game(msg.game, publicPeer(from));
    if (!g) return null;
    g.at = out.at;
    delete g.guessed;
    return { ...out, game: g };
  }
  if (op === 'race' || op === 'drop' || op === 'stop') {
    // Drop Race: start one, enter a message, or stop it. id: the race.
    const id = clean(msg.id, 64);
    if (!id) return null;
    if (op !== 'drop') return { ...out, id };
    const text = typeof msg.text === 'string' ? msg.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300) : '';
    return text ? { ...out, id, text } : null;
  }
  if (op === 'clear') {
    if (msg.all === true) return { ...out, all: true };
    const id = clean(msg.id, 64);
    return id ? { ...out, id } : null;
  }
  const to = clean(msg.to, 64);
  const games = Array.isArray(msg.games) ? msg.games.slice(0, MAX_GAMES).map((g) => game(g, null)).filter(Boolean) : [];
  return to && games.length ? { ...out, to, games } : null;
}
