// Slash commands typed in the message box (never sent as chat):
// /role, /debug, /sound, /whisper (/w), /spy, /languages, /speak, /banner, /poll, /quiz, /hangman.
import { refreshLanguages, systemLine } from '../chat/list';
import { sendSound } from '../chat/sound-message';
import * as LANG from '../languages';
import { findByName, list } from '../sounds/library';
import { sendChat } from '../net/connection';
import { can, ROLES, state } from '../state';
import { hangmanCommand } from '../games';
import { pollCommand, quizCommand } from '../polls/commands';
import { parseBanner } from './banner';
import { describeRoles, setDebug, setRole } from './roles';
import { spyCommand, whisperCommand } from './whispers';

/** Returns true if the text was a command. */
export function runCommand(value: string): boolean {
  const m = /^\s*\/(role|debug|sound|whisper|w|spy|languages|language|langs|speak|banner|poll|quiz|hangman)\b\s*([\s\S]*)$/i.exec(value);
  if (!m) return false;
  const cmd = m[1].toLowerCase();
  const raw = m[2];
  const rest = raw.trim();
  switch (cmd) {
    case 'sound': soundCommand(rest); return true;
    case 'banner': bannerCommand(value); return true;
    case 'poll': pollCommand(rest); return true;
    case 'quiz': quizCommand(rest); return true;
    case 'hangman': hangmanCommand(rest); return true;
    case 'whisper': case 'w': whisperCommand(raw); return true;
    case 'spy': spyCommand(rest); return true;
    case 'speak': speakCommand(rest); return true;
    case 'languages': case 'language': case 'langs': languagesCommand(rest); return true;
    case 'role': roleCommand(rest.toLowerCase()); return true;
    default: debugCommand(rest.toLowerCase()); return true;
  }
}

function roleCommand(rest: string): void {
  if (!rest) { describeRoles(); return; }
  if (!ROLES[rest]) { systemLine('There\'s no "' + rest + '" role. Type /role to see the roles.'); return; }
  if (rest === 'display') { location.assign('Display/'); return; }
  setRole(rest);
}

/** /banner [slow | normal | fast | <n>px] <text> | off: sent to the displays. */
function bannerCommand(value: string): void {
  if (!parseBanner(value)) {
    systemLine('Put a banner on the displays with /banner <text>, e.g. /banner fast Doors open at 7pm. Speeds: slow, normal, fast or e.g. 40px (per second). /banner off takes it down.');
    return;
  }
  if (!sendChat({ text: value.trim() })) systemLine('Not connected: banner not sent');
}

/** /debug [on|off] */
function debugCommand(rest: string): void {
  if (!can('debug')) { systemLine('Debug mode is for admins. Switch with /role admin.'); return; }
  setDebug(rest ? rest === 'on' : !state.debug);
}

/** /sound lists the sounds on this device; /sound <name> plays one for everyone. */
function soundCommand(name: string): void {
  if (!name) {
    void list().then((l) => systemLine(l.length
      ? 'Sounds on this device: ' + l.map((e) => e.name).join(', ') + '. Play one with /sound <name>.'
      : 'No sounds on this device yet. Sounds others send are saved here, and admins can add their own.'));
    return;
  }
  void findByName(name).then((e) => {
    if (e) sendSound(e);
    else systemLine('There\'s no sound called "' + name + '" on this device. Type /sound to see the ones you have.');
  });
}

// /languages | /languages add Elvish, Dwarvish | /languages remove Elvish | /languages reset
function languagesCommand(rest: string): void {
  if (!rest) { describeLanguages(); return; }
  const m = /^(add|remove|forget|learn|reset)\b\s*([\s\S]*)$/i.exec(rest);
  if (!m) { systemLine('Use /languages add <names>, /languages remove <names> or /languages reset.'); return; }
  const verb = m[1].toLowerCase();
  const names = LANG.split(m[2]);
  if (verb === 'reset') { LANG.reset(); refreshLanguages(); describeLanguages(); return; }
  if (!names.length) { systemLine('Name the languages, e.g. /languages ' + verb + ' Elvish, Dwarvish'); return; }
  if (verb === 'add' || verb === 'learn') LANG.add(names); else LANG.remove(names);
  refreshLanguages();
  describeLanguages();
}
function describeLanguages(): void {
  const known = LANG.known();
  systemLine('You understand: ' + (known.length ? known.join(', ') : 'nothing at all') + '. You write in ' + (LANG.speaking() || 'Default') +
    '.\nChange with /languages add <names>, /languages remove <names>, /languages reset, and /speak <language>.');
}

// /speak Elvish (must be one you understand) | /speak default
function speakCommand(rest: string): void {
  if (!rest) { systemLine('You write in ' + (LANG.speaking() || 'Default') + '. Change with /speak <language>.'); return; }
  const lang = LANG.cleanName(rest);
  if (!LANG.isDefault(lang) && !LANG.understands(lang)) {
    systemLine('You don\'t understand ' + lang + '. Add it first with /languages add ' + lang + '.');
    return;
  }
  LANG.setSpeaking(LANG.isDefault(lang) ? '' : LANG.nameOf(lang)); // use your own spelling
  refreshLanguages();
  systemLine('You now write in ' + (LANG.speaking() || 'Default') + '.');
}
