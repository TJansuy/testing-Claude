// The polls this device knows about, and their votes. Nothing is kept on the
// relay: every app counts the votes it receives, and people who join are
// reminded of the running polls by the devices already here.
import { KEY, load, save } from '../storage';
import type { Peer, WirePoll, WireVote } from '../types';
import { randomId } from '../util';

export interface Poll {
  id: string;
  question: string;
  options: string[];
  /** Secret: anonymous, and no results until it's closed. */
  secret: boolean;
  closed: boolean;
  /** Taken off the displays (and voting ended). */
  cleared: boolean;
  author: Peer;
  /** The author's device, which alone can close it. */
  owner: string;
  at: number;
  votes: Map<string, WireVote>;
}

export const polls = new Map<string, Poll>();
/** Votes that arrived before their poll (e.g. while being reminded). */
const early = new Map<string, WireVote[]>();

/** This device's id: votes are per device, so reconnecting doesn't double-vote. */
export const device: string = load(KEY.device) || (() => { const id = randomId().slice(0, 18); save(KEY.device, id); return id; })();

/** Applies a vote; a later vote from the same device replaces the earlier one. */
export function vote(p: Poll, v: WireVote): boolean {
  if (p.cleared || p.closed || v.option < 0 || v.option >= p.options.length) return false;
  const had = p.votes.get(v.voter);
  if (had && had.at > v.at) return false;
  p.votes.set(v.voter, v);
  return true;
}

export function voteLater(id: string, v: WireVote): void {
  const list = early.get(id) || [];
  list.push(v);
  early.set(id, list);
}

/** Adds a poll, or merges what someone else knows about one we have. Returns it if it's new here. */
export function merge(w: WirePoll, at?: number): { poll: Poll; isNew: boolean } {
  let p = polls.get(w.id);
  const isNew = !p;
  if (!p) {
    p = {
      id: w.id, question: w.question, options: w.options.slice(0, 10), secret: !!w.secret, closed: false, cleared: false,
      author: w.author, owner: w.owner || '', at: w.at || at || Date.now(), votes: new Map(),
    };
    polls.set(p.id, p);
  }
  const target = p;
  // Votes first (a closed poll takes no more), then whether it's closed.
  (w.votes || []).forEach((v) => {
    const had = target.votes.get(v.voter);
    if (v.option < target.options.length && (!had || had.at < v.at)) target.votes.set(v.voter, v);
  });
  (early.get(w.id) || []).forEach((v) => vote(target, v));
  early.delete(w.id);
  if (w.closed) target.closed = true;
  return { poll: target, isNew };
}

export function toWire(p: Poll): WirePoll {
  return {
    id: p.id, question: p.question, options: p.options, secret: p.secret, closed: p.closed,
    author: p.author, owner: p.owner, at: p.at, votes: Array.from(p.votes.values()),
  };
}

/** Polls still on the displays, oldest first: their numbers are the same on every screen. */
export function active(): Poll[] {
  return Array.from(polls.values()).filter((p) => !p.cleared).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

export const numberOf = (p: Poll): number => active().indexOf(p) + 1;

/** Finds an active poll by its number or the start of its question. */
export function findPoll(ref: string): Poll | undefined {
  const list = active();
  if (/^#?\d+$/.test(ref)) return list[parseInt(ref.replace('#', ''), 10) - 1];
  const r = ref.toLowerCase();
  return list.find((p) => p.question.toLowerCase().startsWith(r)) || list.find((p) => p.question.toLowerCase().includes(r));
}

export interface Tally { counts: number[]; voters: string[][]; total: number }
export function tally(p: Poll): Tally {
  const counts = p.options.map(() => 0);
  const voters: string[][] = p.options.map(() => []);
  p.votes.forEach((v) => { counts[v.option]++; voters[v.option].push(v.name); });
  return { counts, voters, total: p.votes.size };
}

/** Whether results can be shown: public polls always; secret ones once closed. */
export const resultsShown = (p: Poll): boolean => !p.secret || p.closed;
/** This device's vote, if any. */
export const myVote = (p: Poll): number | undefined => p.votes.get(device)?.option;
