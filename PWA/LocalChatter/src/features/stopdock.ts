// While an effect you sent is running, a Stop button sits in a corner above all
// the effects (not shaken, not corrupted). It stops the effect for everyone it
// was sent to: the whole chat, a whisper's recipients, or an admin's target.
import { EFFECT_LINES, EFFECT_TITLES } from '../chat/effect-line';
import { $, el } from '../dom';
import { DEFAULT_MS, EffectArg, EffectName } from '../effects';
import { sendChat, sendRaw } from '../net/connection';
import { handle } from '../net/handle';
import { DISPLAY, state } from '../state';
import type { EffectMessage, Peer } from '../types';
import { formatDuration } from '../util';

interface How { to?: Peer[] | null; target?: string }
interface Stop { how: How; endsAt: number; timer?: ReturnType<typeof setTimeout>; button: HTMLButtonElement; left: HTMLElement }

const stops: Partial<Record<EffectName, Stop>> = {};
const dock = $('fx-dock');

export function addStop(name: EffectName, arg: EffectArg, how: How): void {
  if (DISPLAY) return;
  removeStop(name);
  const ms = arg === 'on' ? Infinity : typeof arg === 'number' ? arg * 1000 : DEFAULT_MS[name];
  const button = el('button');
  button.type = 'button';
  button.dataset.stop = name;
  button.appendChild(el('span', null, '■ Stop ' + EFFECT_LINES[name][0] + ' ' + EFFECT_TITLES[name]));
  const left = el('span', 'left');
  button.appendChild(left);
  button.addEventListener('click', () => sendStop(name));
  dock.appendChild(button);
  const entry: Stop = { how, endsAt: Date.now() + ms, button, left };
  if (ms !== Infinity) entry.timer = setTimeout(() => removeStop(name), ms);
  stops[name] = entry;
  tickStops();
}

export function removeStop(name: EffectName): void {
  const e = stops[name];
  if (!e) return;
  clearTimeout(e.timer);
  e.button.remove();
  delete stops[name];
}

function sendStop(name: EffectName): void {
  const e = stops[name];
  if (!e) return;
  removeStop(name);
  if (e.how.target) {
    const fx: EffectMessage = { type: 'effect', name: name + ' off', to: e.how.target };
    if (sendRaw(fx)) handle({ ...fx, from: state.me || undefined });
  } else if (e.how.to) {
    sendChat({ text: '/' + name + ' off', to: e.how.to });
  } else {
    sendChat({ text: '/' + name + ' off' });
  }
}

/** Shows the time left on longer effects. */
function tickStops(): void {
  (Object.keys(stops) as EffectName[]).forEach((name) => {
    const e = stops[name] as Stop;
    const left = Math.ceil((e.endsAt - Date.now()) / 1000);
    e.left.textContent = e.endsAt === Infinity ? '· on' : left > 2 ? '· ' + formatDuration(left) : '';
  });
}
setInterval(tickStops, 1000);

// If an effect that was running here ends some other way (replaced, or turned
// off by someone else), drop its button too.
document.addEventListener('localchatter:fx', (ev) => {
  const d = (ev as CustomEvent<{ name: EffectName; active: boolean }>).detail;
  const e = stops[d.name];
  if (!d.active && e && !e.how.target && e.endsAt - Date.now() > 300) removeStop(d.name);
});
