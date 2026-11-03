// Plain classic script (not a module) so it also runs when opened via file://.
(function () {
  var $ = function (id) { return document.getElementById(id); };

  $('protocol').textContent = location.protocol;

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
