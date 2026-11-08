// The message list: adding lines and bubbles, language-aware text, and the banner.
import { $, el } from '../dom';
import * as LANG from '../languages';
import { DISPLAY } from '../state';
import type { Peer } from '../types';

const MAX_MESSAGES = 300;
export const list = $('messages');

const nearBottom = (): boolean => list.scrollHeight - list.scrollTop - list.clientHeight < 120;

export function append(node: HTMLElement): void {
  const stick = nearBottom();
  const empty = $('empty');
  if (empty) empty.remove();
  list.appendChild(node);
  // Keep memory bounded; free blob URLs of messages that drop off the top.
  while (list.children.length > MAX_MESSAGES) {
    const old = list.firstElementChild as HTMLElement;
    old.querySelectorAll<HTMLElement>('[data-blob]').forEach((n) => URL.revokeObjectURL(n.dataset.blob || ''));
    old.remove();
  }
  if (stick) list.scrollTop = list.scrollHeight;
}

/** A line from the app itself (command replies etc.): always readable. */
export function systemLine(text: string): void {
  if (!DISPLAY) append(el('p', 'system', text));
}

// Text in a language: shown clearly if this device understands it, otherwise as
// gibberish. The original is kept so it can be shown again if the viewer later
// learns the language.
interface LangInfo { text: string; lang: string; seed: string }
const original = new WeakMap<HTMLElement, LangInfo>();
const notUnderstood = (lang: string): string => 'In ' + LANG.nameOf(lang) + ', which you don\'t understand';

export function langText<K extends 'p' | 'div'>(tag: K, cls: string, text: string, lang: string, seed: string): HTMLElementTagNameMap[K] {
  const e = el(tag, (cls ? cls + ' ' : '') + 'lc');
  original.set(e, { text, lang, seed });
  e.textContent = LANG.render(text, lang, seed);
  if (!LANG.understands(lang)) e.title = notUnderstood(lang);
  return e;
}

/** Join/leave lines and system notices are in the System language. */
export function systemNotice(text: string, cls?: string): void {
  if (!DISPLAY) append(langText('p', 'system' + (cls ? ' ' + cls : ''), text, 'system', text + '|' + Date.now()));
}

/** Re-renders language text after the viewer's languages change. */
export function refreshLanguages(): void {
  document.querySelectorAll<HTMLElement>('.lc').forEach((n) => {
    const info = original.get(n);
    if (!info) return;
    const known = LANG.understands(info.lang);
    n.textContent = LANG.render(info.text, info.lang, info.seed);
    n.title = known ? '' : notUnderstood(info.lang);
    const bubble = n.closest('.msg');
    if (bubble) bubble.classList.toggle('foreign', !known);
  });
  const sp = LANG.speaking();
  const t = $<HTMLTextAreaElement>('text');
  t.placeholder = sp ? 'Message everyone in ' + sp : 'Message everyone';
  t.classList.toggle('in-lang', !!sp);
  if (sp) t.style.setProperty('--lang-hue', String(LANG.hue(sp))); else t.style.removeProperty('--lang-hue');
}

/** Each sender gets their own bubble colour (by the name shown, so a spoof isn't given away). */
export function colourBubble(box: HTMLElement, person: Peer | undefined): void {
  if (person && person.name) box.style.setProperty('--hue', String(LANG.hue(person.name)));
}

export function banner(content: Node | null): void {
  const b = $('banner');
  b.textContent = '';
  b.hidden = !content;
  if (content) b.appendChild(content);
}
