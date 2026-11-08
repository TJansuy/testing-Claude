// While the app is in the background (another app or tab, screen off), messages
// are held instead of drawn, and a notification shows the latest one. Only the
// newest BACKLOG_MAX are kept; older ones are dropped and counted. On return
// they're shown, but effects and sounds from while you were away aren't replayed.
import { effectPhrase } from '../chat/effect-line';
import { list, systemLine } from '../chat/list';
import { $, input } from '../dom';
import { parseEffect } from '../effects';
import * as LANG from '../languages';
import { DISPLAY, state } from '../state';
import { KEY, load, save } from '../storage';
import type { ChatMessage } from '../types';

const BACKLOG_MAX = 50;
const TAG = 'localchatter-chat';
let backlog: { items: Array<() => void>; skipped: number } = { items: [], skipped: 0 };
let notifyCount = 0;

export const away = (): boolean => document.hidden && !DISPLAY;

/** Runs a drawing step now, or holds it until the app is back in view. */
export function show(fn: () => void): void {
  if (!away()) { fn(); return; }
  backlog.items.push(fn);
  if (backlog.items.length > BACKLOG_MAX) { backlog.items.shift(); backlog.skipped++; }
}

export function catchUp(): void {
  const b = backlog;
  backlog = { items: [], skipped: 0 };
  clearNotifications();
  if (!b.items.length && !b.skipped) return;
  if (b.skipped) {
    const one = b.skipped === 1;
    systemLine(b.skipped + ' older ' + (one ? 'message' : 'messages') + ' arrived while you were away and ' +
      (one ? 'was' : 'were') + ' skipped. Here are the latest ' + b.items.length + '.');
  }
  state.catchingUp = true;
  try { b.items.forEach((fn) => fn()); } finally { state.catchingUp = false; }
  list.scrollTop = list.scrollHeight;
}

const supported = (): boolean =>
  'Notification' in window && 'serviceWorker' in navigator && location.protocol !== 'file:' && !DISPLAY;
const enabled = (): boolean => load(KEY.notify) === 'on' && supported() && Notification.permission === 'granted';

/** A short, safe preview: languages and whispers are respected, effects described. */
function previewText(msg: ChatMessage): string {
  const fx = !msg.file && !msg.sound ? parseEffect(msg.text) : null;
  if (fx) return effectPhrase(fx).join(' ');
  if (msg.sound) return '🔊 ' + msg.sound.name;
  if (msg.file) return '📎 ' + msg.file.name;
  const lang = !LANG.isDefault(msg.lang) ? msg.lang as string : 'default';
  const t = LANG.render(msg.text || '', lang, msg.id || msg.text || '');
  return (msg.to ? '🤫 ' : '') + (t.length > 140 ? t.slice(0, 139) + '…' : t);
}

/** One notification, replaced each time: the latest message, plus how many came in. */
export function notify(msg: ChatMessage): void {
  notifyCount++;
  if (!enabled()) return;
  const who = (msg.as || msg.from || { name: 'Someone' }).name;
  const count = notifyCount;
  navigator.serviceWorker.ready.then((reg) => reg.showNotification(count > 1 ? count + ' new messages' : who, {
    body: count > 1 ? who + ': ' + previewText(msg) : previewText(msg),
    tag: TAG,
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: location.href },
  } as NotificationOptions)).catch(() => { /* not allowed right now */ });
}

function clearNotifications(): void {
  notifyCount = 0;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration()
    .then((reg) => (reg ? reg.getNotifications({ tag: TAG }) : []))
    .then((ns) => ns.forEach((n) => n.close()))
    .catch(() => {});
}

export function setupNotifySetting(): void {
  const box = input('notify-on');
  const hint = $('notify-hint');
  if (DISPLAY) { $('notify-row').hidden = true; return; }
  if (!supported()) {
    box.checked = false;
    box.disabled = true;
    hint.hidden = false;
    hint.textContent = 'Not available in this browser. On iPhone and iPad, web apps can only notify through internet push, which LocalChatter doesn\'t use; messages still catch up when you come back.';
    return;
  }
  box.checked = enabled();
  box.addEventListener('change', () => {
    if (!box.checked) { save(KEY.notify, 'off'); hint.hidden = true; return; }
    void Notification.requestPermission().then((p) => {
      if (p === 'granted') { save(KEY.notify, 'on'); hint.hidden = true; return; }
      box.checked = false;
      save(KEY.notify, 'off');
      hint.hidden = false;
      hint.textContent = 'Notifications are blocked for this site. Allow them in your browser settings, then try again.';
    });
  });
}
