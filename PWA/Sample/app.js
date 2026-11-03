// Plain classic script (not a module) so it also runs when opened via file://.
(function () {
  var $ = function (id) { return document.getElementById(id); };

  $('protocol').textContent = location.protocol;

  // Counter, saved to localStorage so it survives reloads and app restarts.
  // localStorage is on-device, so this works fully offline (and from file://).
  var KEY = 'hello-pwa-counter';
  var count = 0;
  try { count = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { /* storage blocked */ }
  function render() { $('count').textContent = count; }
  function setCount(n) {
    count = n;
    try { localStorage.setItem(KEY, String(count)); } catch (e) { /* storage blocked: keep in memory */ }
    render();
  }
  $('inc').addEventListener('click', function () { setCount(count + 1); });
  $('dec').addEventListener('click', function () { setCount(count - 1); });
  $('reset').addEventListener('click', function () { setCount(0); });
  // Keep other open tabs/windows of the app in sync.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { count = parseInt(e.newValue, 10) || 0; render(); }
  });
  render();

  // Network status
  function updateNet() { $('net-status').textContent = navigator.onLine ? 'online' : 'offline'; }
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  updateNet();

  // Service worker: browsers only allow it in a secure context (https:// or http://localhost).
  // When opened from file:// the page still works; it just isn't installable/offline-cached.
  var sw = $('sw-status');
  if (!('serviceWorker' in navigator)) {
    sw.textContent = 'not supported in this browser';
  } else if (location.protocol === 'file:') {
    sw.textContent = 'skipped (file:// — serve over https to enable)';
  } else {
    navigator.serviceWorker.register('sw.js')
      .then(function (reg) { sw.textContent = 'registered (scope: ' + reg.scope + ')'; })
      .catch(function (err) { sw.textContent = 'failed: ' + err.message; });
  }

  // Custom install button (Chromium browsers fire beforeinstallprompt).
  var deferred = null;
  var btn = $('install');
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.finally(function () { deferred = null; btn.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { btn.hidden = true; });
})();
