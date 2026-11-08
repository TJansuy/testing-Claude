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
