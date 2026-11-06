// LocalChatter sounds: a local sound cache (IndexedDB) and playback.
//
// Each sound is identified by a hash of its audio, so "do I already have this
// sound?" is a simple lookup. Sounds you add yourself are your library and are
// kept until you delete them. Sounds received from others are cached too, so they
// play locally next time; only the most recent MAX_RECEIVED of those are kept.
(function () {
  'use strict';

  var DB_NAME = 'localchatter';
  var STORE = 'sounds';
  var MAX_RECEIVED = 40;
  var MAX_SOUND_BYTES = 10 * 1024 * 1024;

  // ------------------------------------------------------------- storage
  var memory = new Map(); // fallback when IndexedDB is unavailable (e.g. some private modes)
  var dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }

  // Runs one request against the store; falls back to memory if IndexedDB fails.
  function store(mode, action, arg) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var s = t.objectStore(STORE);
        var req = action === 'all' ? s.getAll() : s[action](arg);
        t.oncomplete = function () { resolve(req.result); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    }).catch(function () {
      if (action === 'get') return memory.get(arg);
      if (action === 'put') { memory.set(arg.id, arg); return arg.id; }
      if (action === 'delete') { memory.delete(arg); return undefined; }
      return Array.from(memory.values());
    });
  }
  var get = function (id) { return store('readonly', 'get', id); };
  var put = function (entry) { return store('readwrite', 'put', entry); };
  var del = function (id) { return store('readwrite', 'delete', id); };
  var all = function () { return store('readonly', 'all'); };

  // --------------------------------------------------------------- hashing
  function hex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return out;
  }
  // SHA-256 where available (https/localhost); a simple FNV-1a fallback elsewhere (e.g. file://).
  function hashBytes(buf) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest('SHA-256', buf).then(function (d) { return 'sha256-' + hex(new Uint8Array(d)).slice(0, 40); });
    }
    var b = new Uint8Array(buf), h1 = 0x811c9dc5, h2 = 0x01000193 ^ b.length;
    for (var i = 0; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 16777619); h2 = Math.imul(h2 ^ b[i], 2246822519); }
    return Promise.resolve('fnv-' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + '-' + b.length);
  }
  function hashText(s) { return hashBytes(new TextEncoder().encode(s).buffer); }

  // --------------------------------------------------------------- helpers
  function cleanName(name) {
    return String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'sound';
  }
  function isAudioType(type, name) {
    return /^audio\//.test(type || '') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(name || '');
  }
  function guessType(name) {
    var ext = (/\.([a-z0-9]+)$/i.exec(name || '') || [])[1] || '';
    return { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm' }[ext.toLowerCase()] || 'audio/mpeg';
  }
  function safeUrl(u) {
    try { var x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; }
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function base64ToBlob(b64, type) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type || 'audio/mpeg' });
  }

  // ------------------------------------------------------------- library
  // Adds audio you have (a file, or bytes downloaded from a link) to the cache.
  function addBlob(blob, name, source, url) {
    if (blob.size > MAX_SOUND_BYTES) return Promise.reject(new Error('"' + name + '" is over ' + (MAX_SOUND_BYTES >> 20) + ' MB.'));
    return blob.arrayBuffer().then(hashBytes).then(function (id) {
      return get(id).then(function (old) {
        var entry = {
          id: id,
          name: source === 'library' || !old ? cleanName(name) : old.name,
          type: blob.type || guessType(name),
          size: blob.size,
          blob: blob,
          url: safeUrl(url) || (old && old.url) || '',
          // Never downgrade a library sound to "received".
          source: old && old.source === 'library' ? 'library' : source,
          addedAt: old ? old.addedAt : Date.now(),
          usedAt: Date.now()
        };
        return put(entry).then(function () { return source === 'received' ? trimReceived().then(function () { return entry; }) : entry; });
      });
    });
  }

  function addFile(file) {
    if (!isAudioType(file.type, file.name)) return Promise.reject(new Error('"' + file.name + '" isn\'t an audio file.'));
    return addBlob(file, file.name, 'library');
  }

  // Downloads and caches a sound from a link. Many sites don't allow other sites to
  // download their files; then it's saved as a link only, played straight from the site.
  function addFromUrl(url, name) {
    var href = safeUrl(url);
    if (!href) return Promise.reject(new Error('Enter a link starting with https:// or http://'));
    var fallbackName = cleanName(name || decodeURIComponent(href.split(/[?#]/)[0].split('/').pop() || 'sound'));
    return fetch(href, { mode: 'cors' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    }).then(function (blob) {
      if (!isAudioType(blob.type, href)) throw new Error('not audio');
      if (!/^audio\//.test(blob.type)) blob = new Blob([blob], { type: guessType(href) });
      return addBlob(blob, name || fallbackName, 'library', href).then(function (e) { e.cached = true; return e; });
    }).catch(function (err) {
      if (/not audio/.test(err.message)) throw new Error('That link isn\'t an audio file.');
      // Couldn't download it (offline, or the site blocks it): keep it as a link.
      return hashText(href).then(function (h) {
        var entry = { id: 'url-' + h, name: fallbackName, type: guessType(href), size: 0, blob: null, url: href, source: 'library', addedAt: Date.now(), usedAt: Date.now(), linkOnly: true };
        return put(entry).then(function () { entry.cached = false; return entry; });
      });
    });
  }

  function trimReceived() {
    return all().then(function (list) {
      var received = list.filter(function (e) { return e.source === 'received'; })
        .sort(function (a, b) { return b.usedAt - a.usedAt; });
      return Promise.all(received.slice(MAX_RECEIVED).map(function (e) { return del(e.id); }));
    });
  }

  function list() {
    return all().then(function (items) {
      return items.sort(function (a, b) {
        if (a.source !== b.source) return a.source === 'library' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    });
  }
  function library() { return list().then(function (l) { return l.filter(function (e) { return e.source === 'library'; }); }); }
  function findByName(name) {
    var n = String(name || '').trim().toLowerCase();
    return list().then(function (l) { return l.filter(function (e) { return e.name.toLowerCase() === n; })[0] || null; });
  }
  function rename(id, name) {
    return get(id).then(function (e) { if (!e) return null; e.name = cleanName(name); return put(e).then(function () { return e; }); });
  }

  // Builds the "sound" part of a chat message. The audio itself is included when
  // embed is on and it fits, so devices that don't have it can still play it.
  function toMessage(entry, embed, maxBytes) {
    var out = { id: entry.id, name: entry.name, type: entry.type };
    if (entry.url) out.url = entry.url;
    var room = Math.floor(((maxBytes || 25 * 1024 * 1024) - 8192) * 3 / 4);
    if (!embed || !entry.blob || entry.blob.size > room) return Promise.resolve(out);
    return blobToBase64(entry.blob).then(function (b64) { out.data = b64; return out; });
  }

  // ------------------------------------------------------------- playback
  var ctx = null;
  var playing = new Set();

  function audioContext() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    return ctx;
  }

  // Browsers only allow sound after the user has touched the page; call this from a tap.
  function unlock() {
    var c = audioContext();
    if (c && c.state === 'suspended') c.resume().catch(function () {});
    if (c && !unlock.done) {
      // A silent blip fully unlocks audio on iOS.
      var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
      unlock.done = true;
    }
  }
  function unlocked() { var c = audioContext(); return !!c && c.state === 'running'; }

  function playElement(src) {
    var a = new Audio(src);
    playing.add(a);
    a.addEventListener('ended', function () { playing.delete(a); });
    return a.play().catch(function (err) { playing.delete(a); throw err; });
  }

  function playBlob(blob) {
    var c = audioContext();
    if (!c || c.state !== 'running') {
      // Not unlocked yet: an audio element may still be allowed (desktop browsers).
      return playElement(URL.createObjectURL(blob));
    }
    return blob.arrayBuffer().then(function (buf) { return c.decodeAudioData(buf); }).then(function (audio) {
      var src = c.createBufferSource();
      src.buffer = audio;
      src.connect(c.destination);
      playing.add(src);
      src.onended = function () { playing.delete(src); };
      src.start();
    }).catch(function (err) {
      if (err && err.name === 'NotAllowedError') throw err;
      // Format Web Audio can't decode: let the browser's audio element try.
      return playElement(URL.createObjectURL(blob));
    });
  }

  function stopAll() {
    playing.forEach(function (p) { try { if (p.stop) p.stop(); else p.pause(); } catch (e) { /* already stopped */ } });
    playing.clear();
  }

  // Plays a library/cached entry (from its audio, or from its link if it's link-only).
  function playEntry(entry) {
    entry.usedAt = Date.now();
    put(entry).catch(function () {});
    return entry.blob ? playBlob(entry.blob) : playElement(entry.url);
  }

  // Works out how to play a received sound: from the cache, then from the audio in
  // the message, then from its link. Resolves to { source, play } where source is
  // 'cache' | 'message' | 'link' | 'none'. Audio from a message is cached for next time.
  function resolve(sound) {
    sound = sound || {};
    return get(String(sound.id || '')).catch(function () { return null; }).then(function (hit) {
      if (hit && (hit.blob || hit.url)) return { source: 'cache', play: function () { return playEntry(hit); } };
      if (sound.data) {
        var blob;
        try { blob = base64ToBlob(sound.data, /^audio\//.test(sound.type || '') ? sound.type : guessType(sound.name)); } catch (e) { blob = null; }
        if (blob) {
          // Cached under the hash of the audio actually received, so a message can't
          // overwrite another sound by claiming its id.
          return addBlob(blob, sound.name, 'received', sound.url).catch(function () { return null; }).then(function () {
            return { source: 'message', play: function () { return playBlob(blob); } };
          });
        }
      }
      var url = safeUrl(sound.url);
      if (url) return { source: 'link', play: function () { return playElement(url); } };
      return { source: 'none', play: null };
    });
  }

  window.LocalChatterSounds = {
    addFile: addFile,
    addFromUrl: addFromUrl,
    list: list,
    library: library,
    findByName: findByName,
    rename: rename,
    remove: del,
    toMessage: toMessage,
    resolve: resolve,
    playEntry: playEntry,
    stopAll: stopAll,
    unlock: unlock,
    unlocked: unlocked,
    MAX_SOUND_BYTES: MAX_SOUND_BYTES
  };
})();
