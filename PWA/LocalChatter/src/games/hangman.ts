// Hangman: someone sets a phrase; the first letter of every message anyone
// else sends is a guess, in every open game. Six wrong guesses and it's lost.
// Each device works the guesses out from the chat it sees; people who join
// are passed the letters guessed so far.
import { device } from '../polls/model';
import type { Peer, WireGame } from '../types';

export const MAX_WRONG = 6;

export interface Hangman {
  id: string;
  phrase: string;
  author: Peer;
  owner: string;
  at: number;
  /** Letters guessed, in order (normalised: upper case, no accents). */
  guessed: string[];
  state: 'open' | 'won' | 'lost';
  /** Taken off the displays. */
  cleared: boolean;
  last?: { letter: string; by: string; hit: boolean };
}

export const games = new Map<string, Hangman>();

/** "é" → "E": guesses and phrase letters compare without case or accents. */
export const norm = (c: string): string => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const isLetter = (c: string): boolean => /^\p{L}$/u.test(norm(c));

export function lettersOf(g: Hangman): Set<string> {
  return new Set(Array.from(g.phrase).map(norm).filter(isLetter));
}
export const wrongGuesses = (g: Hangman): string[] => {
  const l = lettersOf(g);
  return g.guessed.filter((c) => !l.has(c));
};
export const found = (g: Hangman, c: string): boolean => !isLetter(c) || g.guessed.indexOf(norm(c)) >= 0;

function settle(g: Hangman): void {
  if (g.state !== 'open') return;
  if (Array.from(lettersOf(g)).every((c) => g.guessed.indexOf(c) >= 0)) g.state = 'won';
  else if (wrongGuesses(g).length >= MAX_WRONG) g.state = 'lost';
}

/** The guess in a message: its first character, if it's a letter. */
export function guessIn(text: string | undefined): string {
  const first = Array.from(String(text || '').trim())[0] || '';
  return first && isLetter(first) ? norm(first) : '';
}

/** Applies a guess. Returns whether it was right, or null if it changed nothing. */
export function guess(g: Hangman, letter: string, by: string): boolean | null {
  if (g.state !== 'open' || g.cleared || !letter || g.guessed.indexOf(letter) >= 0) return null;
  g.guessed.push(letter);
  const hit = lettersOf(g).has(letter);
  g.last = { letter, by, hit };
  settle(g);
  return hit;
}

/** Adds a game, or merges in the letters someone else has seen guessed. */
export function mergeGame(w: WireGame, at?: number): { game: Hangman; isNew: boolean } {
  let g = games.get(w.id);
  const isNew = !g;
  if (!g) {
    g = { id: w.id, phrase: w.phrase, author: w.author, owner: w.owner || '', at: w.at || at || Date.now(), guessed: [], state: 'open', cleared: false };
    games.set(g.id, g);
  }
  const target = g;
  Array.from(w.guessed || '').map(norm).forEach((c) => { if (isLetter(c) && target.guessed.indexOf(c) < 0) target.guessed.push(c); });
  settle(target);
  return { game: target, isNew };
}

export const toWire = (g: Hangman): WireGame => ({
  id: g.id, kind: 'hangman', phrase: g.phrase, author: g.author, owner: g.owner, at: g.at, guessed: g.guessed.join(''),
});

/** Games still on the displays (not won and gone, not cleared), oldest first. */
export const shown = (): Hangman[] => Array.from(games.values()).filter((g) => !g.cleared && g.state !== 'won').sort((a, b) => a.at - b.at);
export const open = (): Hangman[] => Array.from(games.values()).filter((g) => !g.cleared && g.state === 'open');
export const mine = (g: Hangman): boolean => g.owner === device;
