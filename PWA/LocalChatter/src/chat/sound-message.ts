// Sound messages. A device plays a sound from its own cache, else the audio in
// the message, else its link. If none work, the chat says a sound was attempted.
import { $, el } from '../dom';
import { sendChat } from '../net/connection';
import type { SoundEntry } from '../sounds/db';
import { addBlob, addFromUrl, toMessage } from '../sounds/library';
import { Resolved, resolve, SoundSource, unlock } from '../sounds/playback';
import { KEY, load } from '../storage';
import { DISPLAY, state } from '../state';
import type { ChatMessage, SoundRef } from '../types';
import { formatTime } from '../util';
import { append, colourBubble, systemLine } from './list';
import { spoofedBy } from './message';

const SOURCE_TEXT: Record<Exclude<SoundSource, 'none'>, string> = {
  cache: 'from this device', message: 'from the message', link: 'from a link',
};

/** Voice messages are sounds named "Voice message (0:05)"; they get a 🎙. */
export const isVoice = (name: string): boolean => /^voice message\b/i.test(name);
const extFor = (type: string): string => ({ 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/aac': 'aac', 'audio/flac': 'flac' } as Record<string, string>)[type.split(';')[0]] || 'audio';

/** 💾 save to your sounds, and ⬇ download the audio file. */
function soundActions(r: Resolved, snd: SoundRef, status: HTMLElement): HTMLElement {
  const wrap = el('div', 'sound-actions');
  const save = el('button', 'sound-act', '💾');
  save.type = 'button';
  save.title = 'Save to my sounds';
  save.setAttribute('aria-label', 'Save ' + snd.name + ' to my sounds');
  save.addEventListener('click', () => {
    const saving = r.blob ? addBlob(r.blob, snd.name, 'library', r.url) : r.url ? addFromUrl(r.url, snd.name) : null;
    if (!saving) return;
    saving.then((e) => {
      status.textContent = 'Saved to your sounds as “' + e.name + '” (play it with /sound ' + e.name + ')';
      save.disabled = true;
      document.dispatchEvent(new CustomEvent('localchatter:library'));
    }, (err: Error) => { status.textContent = err.message; });
  });
  wrap.appendChild(save);
  if (r.blob) {
    const blob = r.blob;
    const dl = el('a', 'sound-act', '⬇');
    dl.title = 'Download';
    dl.setAttribute('aria-label', 'Download ' + snd.name);
    dl.download = snd.name.replace(/[\\/:*?"<>|]/g, '').trim() + '.' + extFor(blob.type || snd.type || '');
    // Made when tapped, so a long chat doesn't hold an object URL per sound.
    dl.href = '#';
    dl.addEventListener('click', () => {
      const url = URL.createObjectURL(blob);
      dl.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    wrap.appendChild(dl);
  }
  return wrap;
}

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
  label.appendChild(el('div', 'sound-name', (isVoice(snd.name) ? '🎙 ' : '🔊 ') + snd.name));
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
    body.appendChild(soundActions(r, snd, status));
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
          if (DISPLAY) $('stage-tap').hidden = false; // a display has one big button for this
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
