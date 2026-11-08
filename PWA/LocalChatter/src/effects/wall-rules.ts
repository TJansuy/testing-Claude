// The wall's hidden rules. Each wall is one of these, chosen from the /wall
// message (so it's the same on every device) and not told to anyone until the
// game ends; working out which it is is part of the game.
//   any      every message does damage
//   unique   only messages with a word nobody has used yet (since the wall came
//            in) do damage; case and punctuation don't matter
//   long     the more broken the wall, the longer a message (or one of its
//            words) has to be to do damage; at first anything will do

export type WallVariant = 'any' | 'unique' | 'long';
const VARIANTS: WallVariant[] = ['any', 'unique', 'long'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The number of hits it takes, from the message's id: 3 to 50. */
export const wallStrength = (seed: string): number => 3 + (hash(seed) % 48);
export const wallVariant = (seed: string): WallVariant => VARIANTS[hash(seed + '|variant') % VARIANTS.length];

/** Words as the game sees them: lower case, no punctuation ("Don't!" → "dont"). */
export function words(text: string): string[] {
  return text.toLowerCase().normalize('NFKC').split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
}

/** For the long-message wall, at a given level of damage (0 to 1): a message
 *  needs this many letters and digits, or one word this long. */
export function lengthNeeded(level: number): { chars: number; word: number } {
  if (level <= 0) return { chars: 0, word: 0 };
  return { chars: Math.round(8 + level * 62), word: Math.round(4 + level * 9) };
}

export const DESCRIBE: Record<WallVariant, string> = {
  any: 'an ordinary wall: every message did damage',
  unique: 'a unique-words wall: only messages with a word nobody had used yet did damage',
  long: 'a long-messages wall: the more broken it got, the longer a message (or one of its words) had to be',
};

/** Judges messages for one wall, in the order they arrive. */
export function referee(variant: WallVariant, strength: number): (text: string, planned: number) => boolean {
  const used = new Set<string>();
  return (text, planned) => {
    const ws = words(text);
    if (variant === 'unique') {
      const fresh = ws.some((w) => !used.has(w));
      ws.forEach((w) => used.add(w));
      return fresh;
    }
    if (variant === 'long') {
      const need = lengthNeeded(planned / strength);
      const chars = ws.join('').length;
      const longest = ws.reduce((m, w) => Math.max(m, w.length), 0);
      return chars >= need.chars || (need.word > 0 && longest >= need.word);
    }
    return true;
  };
}
