// Chat bubbles: text, files and images, with sender colours, languages,
// whispers and spoof markers.
import { el } from '../dom';
import { parseEffect } from '../effects';
import { whisperNames } from '../features/whispers';
import * as LANG from '../languages';
import { can } from '../state';
import type { ChatMessage, Peer } from '../types';
import { base64ToBlob, formatSize, formatTime } from '../util';
import { renderEffect } from './effect-line';
import { append, colourBubble, langText } from './list';
import { renderSound } from './sound-message';

const INLINE_IMAGE = /^image\/(png|jpeg|gif|webp|avif|bmp)$/;

/** A spoofed message carries its real sender in "from" and the shown sender in "as".
 *  Only admins are told who really sent it; for everyone else it's hidden here, in the app. */
export function spoofedBy(msg: ChatMessage): Peer | null {
  return msg.as && msg.from && msg.as.id !== msg.from.id && can('seeSpoofer') ? msg.from : null;
}

export function renderMessage(msg: ChatMessage, mine: boolean): HTMLElement | null {
  const shown = msg.as || msg.from;
  const who = mine ? (msg.as ? 'You (as ' + msg.as.name + ')' : 'You') : (shown && shown.name) || 'Someone';
  const effect = !msg.file && !msg.sound ? parseEffect(msg.text) : null;
  if (msg.sound) return renderSound(msg, mine, who);
  if (effect) { renderEffect(effect, msg, who); return null; }

  const box = el('article', 'msg' + (mine ? ' mine' : ''));
  if (!mine) colourBubble(box, shown);
  const meta = el('div', 'meta');
  meta.appendChild(el('span', 'who', who));
  const inLang = !LANG.isDefault(msg.lang) ? msg.lang as string : '';
  if (inLang) {
    box.classList.add('in-lang');
    box.style.setProperty('--lang-hue', String(LANG.hue(inLang)));
    if (!mine && !LANG.understands(inLang)) box.classList.add('foreign');
    meta.appendChild(el('span', 'lang-tag', '🗣 ' + LANG.nameOf(inLang)));
  }
  if (msg.via === 'nfc') meta.appendChild(el('span', 'via', 'via NFC tag'));
  if (msg.via === 'qr') meta.appendChild(el('span', 'via', 'via QR code'));
  const spoofer = !mine && spoofedBy(msg);
  if (spoofer) meta.appendChild(el('span', 'spoof', 'really sent by ' + spoofer.name));
  if (msg.to) {
    box.classList.add('whisper');
    if (msg.spied) box.classList.add('spied');
    meta.appendChild(el('span', 'whisper-to', (msg.spied ? '🕵️ spied whisper to ' : '🤫 whisper to ') + whisperNames(msg.to)));
  }
  meta.appendChild(el('time', null, formatTime(msg.at || Date.now())));
  box.appendChild(meta);

  if (msg.text) {
    // You always read your own messages; others' depend on your languages.
    // Ordinary messages are in Default, which a device can also choose not to understand.
    box.appendChild(mine ? el('div', 'text', msg.text) : langText('div', 'text', msg.text, inLang || 'default', msg.id || msg.text));
    if (!mine && !inLang && !LANG.understands('default')) box.classList.add('foreign');
  }
  if (msg.file) box.appendChild(fileView(msg.file.name, msg.file.type, msg.file.size, msg.file.data));
  append(box);
  return box;
}

function fileView(name: string, type: string, size: number, data: string): HTMLElement {
  let url: string | null;
  try { url = URL.createObjectURL(base64ToBlob(data, type)); } catch { url = null; }
  if (!url) return el('div', 'text', '[file could not be read]');
  const href = url;
  if (INLINE_IMAGE.test(type)) {
    const img = el('img');
    img.src = href;
    img.alt = name;
    img.loading = 'lazy';
    img.dataset.blob = href;
    img.addEventListener('click', () => showImage(href, name));
    return img;
  }
  const a = el('a', 'file');
  a.href = href;
  a.download = name;
  a.dataset.blob = href;
  a.appendChild(el('span', null, '📎 ' + name));
  a.appendChild(el('span', null, formatSize(size || 0)));
  return a;
}

function showImage(url: string, alt: string): void {
  const v = el('div', 'viewer');
  const img = el('img');
  img.src = url;
  img.alt = alt;
  v.appendChild(img);
  v.addEventListener('click', () => v.remove());
  document.body.appendChild(v);
}
