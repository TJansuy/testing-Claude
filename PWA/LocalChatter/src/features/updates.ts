// Keeping the installed app up to date, and showing which version this is.
//
// Every build is stamped with its time (BUILD_TIME), which is shown in Settings
// as "Last update" and names the service worker's cache, so each new build is a
// new version. The app checks for one when it opens, when you come back to it
// and when the device comes back online. When a new version has been
// downloaded, it reloads straight into it if the chat is still empty;
// otherwise it offers a Reload button, because reloading clears the chat.
import { banner } from '../chat/list';
import { $, el } from '../dom';

export const BUILD_TIME = __BUILD_TIME__;
const CHECK_EVERY_MS = 30 * 1000;
const status = (text: string): void => { $('update-status').textContent = text; };

/** "8 Nov 2026, 14:03" in the viewer's own time zone. */
function formatBuild(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let registration: ServiceWorkerRegistration | null = null;
let lastCheck = 0;
let updateReady = false;

const chatIsEmpty = (): boolean => !document.querySelector('#messages .msg, #messages .effect-line');

function reloadIntoNewVersion(): void {
  // Guard against a reload loop if something goes wrong.
  try { sessionStorage.setItem('localchatter-reloaded', String(Date.now())); } catch { /* storage blocked */ }
  location.reload();
}

function offerReload(): void {
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createTextNode('A new version of LocalChatter is ready. '));
  const b = el('button', 'link-button', 'Reload now');
  b.type = 'button';
  b.addEventListener('click', reloadIntoNewVersion);
  frag.appendChild(b);
  frag.appendChild(document.createTextNode(' (this clears the chat on this device).'));
  banner(frag);
}

/** A new version has taken over. Use it now if that costs nothing, else offer it. */
function onNewVersion(): void {
  if (updateReady) return;
  updateReady = true;
  status('A new version has been downloaded.');
  let recent = 0;
  try { recent = Number(sessionStorage.getItem('localchatter-reloaded')) || 0; } catch { /* storage blocked */ }
  if (chatIsEmpty() && Date.now() - recent > 10000) { reloadIntoNewVersion(); return; }
  status('A new version is ready: reload to use it.');
  offerReload();
}

/** Asks the service worker in charge which version it has. */
function activeVersion(): Promise<string> {
  const sw = navigator.serviceWorker.controller;
  if (!sw) return Promise.resolve('');
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e: MessageEvent) => resolve(String(e.data || ''));
    sw.postMessage('version', [channel.port2]);
    setTimeout(() => resolve(''), 2000); // an older service worker doesn't answer
  });
}

/** If the service worker in charge is newer than this page, use it. This also
 *  catches a new version that took over while the page was still loading. */
function compareWithActive(): void {
  void activeVersion().then((v) => { if (v && v > BUILD_TIME) onNewVersion(); });
}

/** Asks the server for a newer version (quietly, unless asked from Settings). */
export function checkForUpdates(manual = false): void {
  if (!registration) { if (manual) status('Updates need the app to be opened from its web address (not from a file).'); return; }
  if (!manual && Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  if (!navigator.onLine) { status('Offline: will check for updates when you\'re back online.'); return; }
  if (updateReady) return;
  status('Checking for updates…');
  const reg = registration;
  reg.update().then(() => {
    if (updateReady) return;
    if (reg.installing || reg.waiting) status('Downloading the new version…');
    else status('Up to date (checked ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ').');
  }).catch(() => status('Couldn\'t check for updates right now.'));
}

export function setupUpdates(): void {
  $('version').textContent = formatBuild(BUILD_TIME);
  $('version').title = BUILD_TIME;
  $('check-update').addEventListener('click', () => checkForUpdates(true));
  // Service workers need https:// or localhost; from file:// the app still works, just not offline.
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    status('Opened from a file: updates and offline use need the app\'s web address.');
    return;
  }
  // If a service worker was already in charge, a new one taking over means a new version.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) onNewVersion(); else compareWithActive(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    registration = reg;
    compareWithActive();
    checkForUpdates();
  }).catch(() => status('Couldn\'t set up offline use and updates.'));
  window.addEventListener('online', () => checkForUpdates());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdates(); });
}

