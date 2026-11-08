// Polls: rebuilt from known fields only, like every other message. The relay
// keeps no polls and counts no votes; each app does that from what it receives.
import { clean, MAX_NAME } from './config';
import { Peer, publicPeer } from './sanitise';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const OPS = ['new', 'vote', 'close', 'clear', 'sync'];
export const MAX_OPTIONS = 10;
const MAX_POLLS = 20;
const MAX_VOTES = 500;

const option = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < MAX_OPTIONS ? v : null;
const time = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;

function person(v: unknown): Peer | null {
  if (!isObject(v)) return null;
  const p = { id: clean(v.id, 64), name: clean(v.name, MAX_NAME) };
  return p.id && p.name ? p : null;
}

/** A poll as it's announced or passed on to someone who joins. */
function poll(v: unknown, author: Peer | null): Json | null {
  if (!isObject(v)) return null;
  const id = clean(v.id, 64);
  const question = clean(v.question, 200);
  const options = Array.isArray(v.options) ? v.options.slice(0, MAX_OPTIONS).map((o) => clean(o, 100)).filter(Boolean) : [];
  if (!id || !question || options.length < 2) return null;
  const who = author || person(v.author);
  if (!who) return null;
  const out: Json = { id, question, options, secret: v.secret === true, closed: v.closed === true, author: who, owner: clean(v.owner, 64) };
  const at = time(v.at);
  if (at) out.at = at;
  if (Array.isArray(v.votes)) {
    out.votes = v.votes.slice(0, MAX_VOTES).filter(isObject).map((x) => ({
      voter: clean(x.voter, 64), name: clean(x.name, MAX_NAME), option: option(x.option), at: time(x.at) || 0,
    })).filter((x) => x.voter && x.option !== null && x.option < options.length);
  }
  return out;
}

export function sanitisePoll(msg: Json, from: Peer): Json | null {
  const op = typeof msg.op === 'string' && OPS.includes(msg.op) ? msg.op : '';
  if (!op) return null;
  const out: Json = { type: 'poll', op, from: publicPeer(from), at: Date.now() };
  const id = clean(msg.id, 64);
  const voter = clean(msg.voter, 64);
  switch (op) {
    case 'new': {
      const p = poll(msg.poll, publicPeer(from));
      if (!p) return null;
      p.at = out.at;
      p.closed = false;
      delete p.votes;
      out.poll = p;
      return out;
    }
    case 'vote': {
      const o = option(msg.option);
      if (!id || !voter || o === null) return null;
      return { ...out, id, voter, option: o };
    }
    case 'close':
      return id && voter ? { ...out, id, voter } : null;
    case 'clear':
      if (msg.all === true) return { ...out, all: true };
      return id ? { ...out, id } : null;
    default: { // sync: reminding someone who just joined about the polls running
      const to = clean(msg.to, 64);
      const polls = Array.isArray(msg.polls) ? msg.polls.slice(0, MAX_POLLS).map((p) => poll(p, null)).filter(Boolean) : [];
      return to && polls.length ? { ...out, to, polls } : null;
    }
  }
}
