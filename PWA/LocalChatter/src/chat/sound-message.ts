// Sound messages. A device plays a sound from its own cache, else the audio in
// the message, else its link. If none work, the chat says a sound was attempted.
import { $, el } from '../dom';
import { sendChat } from '../net/connection';
import type { SoundEntry } from '../sounds/db';
import { toMessage } from '../sounds/library';
import { resolve, SoundSource, unlock } from '../sounds/playback';
import { KEY, load } from '../storage';
import { state } from '../state';
import type { ChatMessage, SoundRef } from '../types';
import { formatTime } from '../util';
import { append, colourBubble, systemLine } from './list';
import { spoofedBy } from './message';

const SOURCE_TEXT: Record<Exclude<SoundSource, 'none'>, string> = {
  cache: 'from this device', message: 'from the message', link: 'from a link',
};

/** Tells anything listening (tests, mainly) what happened to a sound. */
function soundEvent(name: string, source: SoundSource, played: boolean, reason = ''): void {
  document.dispatchEvent(new CustomEvent('localchatter:sound', { detail: { name, source, played, reason } }));
}

export function renderSound(msg: ChatMessage, mine: boolean, who: string): HTMLElement {
  const missed = state.catchingUp; // arrived while away: don't play it now
  const snd = msg.sound as SoundRef;
  const box = el('article', 'msg' + (mine ? ' mine' : ''));
  if (!mine) colourBubble(box, msg.as || msg.from);
  const meta = el('div', 'meta');
  meta.appendChild(el('span', 'who', who));
  const spoofer = !mine && spoofedBy(msg);
  if (spoofer) meta.appendChild(el('span', 'spoof', 'really sent by ' + spoofer.name));
  meta.appendChild(el('time', null, formatTime(msg.at || Date.now())));
  box.appendChild(meta);
  const body = el('div', 'sound');
  const label = el('div');
  label.appendChild(el('div', 'sound-name', '🔊 ' + snd.name));
  const status = el('div', 'sound-status', 'Loading…');
  label.appendChild(status);
  body.appendChild(label);
  box.appendChild(body);
  append(box);

  function unavailable(reason: string): void {
    box.classList.add('unavailable');
    body.textContent = '';
    body.appendChild(el('div', 'text', '🔇 ' + (mine ? 'You' : who) + ' tried to play "' + snd.name + '", but it isn\'t available on this device.'));
    soundEvent(snd.name, 'none', false, reason);
  }

  void resolve(snd).then((r) => {
    if (r.source === 'none' || !r.play) { unavailable('no source'); return; }
    const source = r.source;
    const playIt = r.play;
    const btn = el('button', 'play', '▶');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Play ' + snd.name);
    body.insertBefore(btn, label);
    const where = SOURCE_TEXT[source];
    const go = (): void => {
      status.textContent = 'Playing ' + where;
      playIt().then(() => {
        status.textContent = 'Played ' + where;
        soundEvent(snd.name, source, true);
      }).catch((err: Error) => {
        if (err && err.name === 'NotAllowedError') {
          // The browser blocks sound until the page has been tapped.
          status.textContent = 'Tap ▶ to play (' + where + ')';
          soundEvent(snd.name, source, false, 'blocked');
        } else if (source === 'link') {
          unavailable('link failed'); // e.g. offline
        } else {
          status.textContent = 'Couldn\'t play this sound here';
          soundEvent(snd.name, source, false, 'error');
        }
      });
    };
    btn.addEventListener('click', () => { unlock(); go(); });
    if (missed) { status.textContent = 'Sent while you were away · tap ▶ to play'; soundEvent(snd.name, source, false, 'missed'); }
    else if (state.soundOn) go();
    else { status.textContent = 'Sounds are off · tap ▶ to play'; soundEvent(snd.name, source, false, 'muted'); }
  });
  return box;
}

export function sendSound(entry: SoundEntry): void {
  if (!state.me) { systemLine('Connect to a server first.'); return; }
  void toMessage(entry, load(KEY.embed) !== 'off', state.maxBytes).then((sound) => {
    if (!sendChat({ sound })) systemLine('Not connected: "' + entry.name + '" wasn\'t sent');
  });
}

/** Display mode: just play it, no bubble. */
export function displaySound(sound: SoundRef): void {
  void resolve(sound).then((r) => {
    if (!r.play || !state.soundOn) return;
    r.play().then(() => soundEvent(sound.name, r.source, true), (err: Error) => {
      const blocked = !!err && err.name === 'NotAllowedError';
      if (blocked) $('stage-tap').hidden = false;
      soundEvent(sound.name, r.source, false, blocked ? 'blocked' : 'error');
    });
  });
}

