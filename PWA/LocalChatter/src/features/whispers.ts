// Whispers (/whisper Bob, Cara: message) and spying (/spy). Whispers reach every
// device; each app only shows them to the recipients and to spies watching them.
import { systemLine } from '../chat/list';
import { sendChat } from '../net/connection';
import { can, state } from '../state';
import { KEY, loadJson, save } from '../storage';
import type { ChatMessage, Peer } from '../types';

export function whisperNames(to: Peer[]): string {
  return to.map((t) => (state.me && t.id === state.me.id ? 'you' : t.name)).join(', ');
}

export function whisperCommand(rest: string): void {
  const m = /^([^:]+):\s*([\s\S]*\S[\s\S]*)$/.exec(rest);
  if (!m) { systemLine('Whisper with /whisper <names>: <message>, e.g. /whisper Bob, Cara: see you at 5'); return; }
  const wanted = m[1].split(',').map((n) => n.trim().replace(/^@/, '')).filter(Boolean);
  const to: Peer[] = [];
  const missing: string[] = [];
  wanted.forEach((n) => {
    const found = Array.from(state.peers.values()).find((p) => p.name.toLowerCase() === n.toLowerCase());
    if (found) { if (to.indexOf(found) < 0) to.push(found); } else missing.push(n);
  });
  if (missing.length) { systemLine('No one called ' + missing.map((n) => '"' + n + '"').join(', ') + ' is here. Whisper not sent.'); return; }
  if (!sendChat({ text: m[2].trim(), to: to.map((p) => ({ id: p.id, name: p.name })) })) systemLine('Not connected: whisper not sent');
}

const spyTargets = (): string[] => loadJson<string[]>(KEY.spy, []);

/** true for a recipient, 'spy' for a spy watching anyone involved, else false. */
export function whisperVisibility(msg: ChatMessage): boolean | 'spy' {
  const to = msg.to || [];
  const me = state.me && state.me.id;
  if (to.some((t) => t.id === me)) return true;
  if (!can('spy')) return false;
  const targets = spyTargets();
  if (targets.indexOf('*') >= 0) return 'spy';
  const involved = to.map((t) => t.name);
  if (msg.from) involved.push(msg.from.name);
  if (msg.as) involved.push(msg.as.name);
  return involved.some((n) => targets.indexOf(n.toLowerCase()) >= 0) ? 'spy' : false;
}

// /spy | /spy Bob, Cara | /spy all | /spy off
export function spyCommand(rest: string): void {
  if (!can('spy')) { systemLine('Spying is for the spy role. Switch with /role spy.'); return; }
  const lower = rest.toLowerCase();
  if (!rest) {
    const t = spyTargets();
    systemLine(t.length ? 'Spying on ' + (t[0] === '*' ? 'everyone' : t.join(', ')) + '. Change with /spy <names>, /spy all or /spy off.'
      : 'Not spying on anyone. Use /spy <names> or /spy all.');
    return;
  }
  const list = lower === 'off' ? [] : lower === 'all' ? ['*']
    : rest.split(',').map((n) => n.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  save(KEY.spy, JSON.stringify(list));
  systemLine(!list.length ? 'Stopped spying.'
    : 'Spying on ' + (list[0] === '*' ? 'everyone' : rest.split(',').map((n) => n.trim()).join(', ')) + '. You\'ll see their whispers.');
}
