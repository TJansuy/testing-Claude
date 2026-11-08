// Effect lines in the chat ("🔥 Bob set the chat on fire"), which also play the effect.
import { el } from '../dom';
import * as FX from '../effects';
import { addStop, removeStop } from '../features/stopdock';
import { favKey, paintStars, toggleFavourite } from '../features/favourites';
import { state } from '../state';
import type { ChatMessage } from '../types';
import { formatDuration } from '../util';
import { append } from './list';
import { spoofedBy } from './message';

export const EFFECT_LINES: Record<FX.EffectName, [string, string]> = {
  fire: ['🔥', 'set the chat on fire'],
  earthquake: ['🌍', 'started an earthquake'],
  lightning: ['⚡', 'called down lightning'],
  zalgo: ['👹', 'corrupted the chat'],
};
const EFFECT_OFF: Record<FX.EffectName, [string, string]> = {
  fire: ['🧯', 'put out the fire'],
  earthquake: ['🌍', 'stopped the earthquake'],
  lightning: ['⚡', 'stopped the lightning'],
  zalgo: ['✨', 'restored the chat'],
};
export const EFFECT_TITLES: Record<FX.EffectName, string> = { fire: 'Fire', earthquake: 'Earthquake', lightning: 'Lightning', zalgo: 'Zalgo' };

/** The emoji and wording for an effect line, e.g. "set the chat on fire for 30 s". */
export function effectPhrase(fx: FX.ParsedEffect): [string, string] {
  const line = EFFECT_LINES[fx.name];
  if (fx.arg === 'off') return EFFECT_OFF[fx.name];
  if (fx.arg === 'on') return [line[0], line[1] + ' until someone sends /' + fx.name + ' off'];
  if (typeof fx.arg === 'number') return [line[0], line[1] + ' for ' + formatDuration(fx.arg)];
  if (fx.name === 'zalgo') return [line[0], line[1] + ' for ' + formatDuration(FX.DEFAULT_MS.zalgo / 1000)];
  return line;
}

export function renderEffect(fx: FX.ParsedEffect, msg: ChatMessage, who: string): void {
  const line = effectPhrase(fx);
  const notes: string[] = [];
  if (msg.via === 'nfc') notes.push('NFC tag');
  if (msg.via === 'qr') notes.push('QR code');
  if (msg.to) notes.push('whisper');
  const spoofer = spoofedBy(msg);
  if (spoofer) notes.push('really sent by ' + spoofer.name);
  const p = el('p', 'system effect-line');
  p.appendChild(el('span', null, line[0] + ' ' + who + ' ' + line[1] + (notes.length ? ' (' + notes.join(', ') + ')' : '')));
  // Favourite it: yours can be resent, someone else's echoed.
  const shown = msg.as || msg.from;
  const mine = who.indexOf('You') === 0;
  const fav = { effect: fx.name, arg: fx.argText || '', from: mine || !shown ? null : shown.name };
  const star = el('button', 'star');
  star.type = 'button';
  star.dataset.favKey = favKey(fav);
  star.addEventListener('click', () => toggleFavourite(fav));
  p.appendChild(star);
  append(p);
  paintStars();
  // A Stop button for the sender; anyone's "off" removes it.
  if (fx.arg === 'off') removeStop(fx.name);
  if (state.catchingUp) return; // arrived while away: shown, not replayed
  FX.play(fx.name, fx.arg);
  if (fx.arg !== 'off' && mine) addStop(fx.name, fx.arg, { to: msg.to || null });
}
