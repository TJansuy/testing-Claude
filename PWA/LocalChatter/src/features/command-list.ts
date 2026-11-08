// Every slash command, with a short usage hint, for the autocomplete popup.
// Keep in step with features/commands.ts and effects/index.ts.

export interface CommandInfo {
  name: string;
  /** Other names that work the same (e.g. /quake). */
  aliases?: string[];
  /** What goes after the command; empty for none. */
  args: string;
  hint: string;
  /** Whether it can be sent with nothing after it. */
  standalone: boolean;
}

export const COMMANDS: CommandInfo[] = [
  { name: 'whisper', aliases: ['w'], args: '<names>: <message>', hint: 'Message only the people you name', standalone: false },
  { name: 'fire', args: '[30 | 2m | on | off]', hint: 'Set the chat on fire', standalone: true },
  { name: 'earthquake', aliases: ['quake'], args: '[30 | 2m | on | off]', hint: 'Shake everyone\'s screen', standalone: true },
  { name: 'lightning', args: '[30 | 2m | on | off]', hint: 'Lightning strikes the chat', standalone: true },
  { name: 'zalgo', args: '[30 | 2m | on | off]', hint: 'Corrupt the chat (10 s unless you say)', standalone: true },
  { name: 'blackhole', args: '[30 | 2m | on | off]', hint: 'Everything that arrives gets sucked into a black hole (and is gone)', standalone: true },
  { name: 'blur', args: '[30 | 2m | on | off]', hint: 'Everything slowly fades into a fuzzy cloud', standalone: true },
  { name: 'wall', args: '[30 | 2m | off]', hint: 'Game: knock down a wall with your messages', standalone: true },
  { name: 'rain', args: '[30 | 2m | on | off]', hint: 'Rain on the chat, puddling on the message bar', standalone: true },
  { name: 'poll', args: '[secret] <question> | <option> | <option> · close · clear [n | all]', hint: 'Ask everyone a question; results show on the displays', standalone: true },
  { name: 'quiz', args: '<question> | *<right answer> | <option>…', hint: 'A quiz: * marks the right answer(s)', standalone: false },
  { name: 'droprace', args: '[off]', hint: 'Game: everyone\'s next message drops through the pins; first to the bottom wins', standalone: true },
  { name: 'hangman', args: '<phrase> · clear [n | all]', hint: 'Start a game of hangman: everyone\'s messages are guesses', standalone: true },
  { name: 'banner', args: '[slow | fast | 40px] <text> | off', hint: 'Put a banner across the top of the displays', standalone: false },
  { name: 'sound', args: '[name]', hint: 'Play a sound for everyone, or list the ones you have', standalone: true },
  { name: 'speak', args: '<language | default>', hint: 'Write your messages in a language', standalone: true },
  { name: 'languages', aliases: ['langs'], args: '[add | remove <names> | reset]', hint: 'The languages you understand', standalone: true },
  { name: 'role', args: '[member | monitor | spy | admin | display]', hint: 'See or change your role', standalone: true },
  { name: 'spy', args: '[<names> | all | off]', hint: 'Spy role: see whispers to and from people', standalone: true },
  { name: 'debug', args: '[on | off]', hint: 'Admins: target effects and send as others', standalone: true },
];

/** Commands whose name or alias starts with what's typed (without the slash). */
export function matching(typed: string): Array<{ cmd: CommandInfo; as: string }> {
  const t = typed.toLowerCase();
  const out: Array<{ cmd: CommandInfo; as: string }> = [];
  COMMANDS.forEach((cmd) => {
    const as = [cmd.name, ...(cmd.aliases || [])].find((n) => n.startsWith(t));
    if (as) out.push({ cmd, as });
  });
  return out;
}

/** The command a name or alias belongs to. */
export function find(name: string): CommandInfo | undefined {
  const n = name.toLowerCase();
  return COMMANDS.find((c) => c.name === n || (c.aliases || []).indexOf(n) >= 0);
}
