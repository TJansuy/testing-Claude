// Hello World PWA: a persistent counter, service worker registration, status and
// an install button. Bundled into a plain script so it also runs from file://.

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

$('protocol').textContent = location.protocol;

// Counter, saved to localStorage so it survives reloads and app restarts.
// localStorage is on-device, so this works fully offline (and from file://).
const KEY = 'hello-pwa-counter';
let count = 0;
try { count = parseInt(localStorage.getItem(KEY) || '', 10) || 0; } catch { /* storage blocked */ }

function render(): void { $('count').textContent = String(count); }
function setCount(n: number): void {
  count = n;
  try { localStorage.setItem(KEY, String(count)); } catch { /* storage blocked: keep in memory */ }
  render();
}
$('inc').addEventListener('click', () => setCount(count + 1));
$('dec').addEventListener('click', () => setCount(count - 1));
$('reset').addEventListener('click', () => setCount(0));
// Keep other open tabs/windows of the app in sync.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) { count = parseInt(e.newValue || '', 10) || 0; render(); }
});
render();

// Network status
function updateNet(): void { $('net-status').textContent = navigator.onLine ? 'online' : 'offline'; }
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
updateNet();

// Service worker: browsers only allow it in a secure context (https:// or http://localhost).
// When opened from file:// the page still works; it just isn't installable/offline-cached.
const sw = $('sw-status');
if (!('serviceWorker' in navigator)) {
  sw.textContent = 'not supported in this browser';
} else if (location.protocol === 'file:') {
  sw.textContent = 'skipped (file:// — serve over https to enable)';
} else {
  navigator.serviceWorker.register('sw.js')
    .then((reg) => { sw.textContent = 'registered (scope: ' + reg.scope + ')'; })
    .catch((err: Error) => { sw.textContent = 'failed: ' + err.message; });
}

// Custom install button (Chromium browsers fire beforeinstallprompt).
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}
let deferred: InstallPromptEvent | null = null;
const btn = $<HTMLButtonElement>('install');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  btn.hidden = false;
});
btn.addEventListener('click', () => {
  if (!deferred) return;
  void deferred.prompt();
  deferred.userChoice.finally(() => { deferred = null; btn.hidden = true; });
});
window.addEventListener('appinstalled', () => { btn.hidden = true; });
