// LocalChatter client. A classic script (not a module) so it also runs from file://.
// Messages live only in memory on this page: nothing is saved, so nothing is kept after you leave.
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY_RELAY = 'localchatter-relay';
  var KEY_NAME = 'localchatter-name';
  var KEY_ROLE = 'localchatter-role';
  var KEY_SOUND_ON = 'localchatter-sound-on';
  var KEY_EMBED = 'localchatter-sound-embed';
  var KEY_VIBRATE = 'localchatter-vibrate';
  var SND = window.LocalChatterSounds;
  var MAX_MESSAGES = 300;
  var DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
  var INLINE_IMAGE = /^image\/(png|jpeg|gif|webp|avif|bmp)$/;

  var state = {
    ws: null,
    relay: '',
    name: '',
    me: null,
    peers: new Map(),
    maxBytes: DEFAULT_MAX_BYTES,
    wanted: false,     // the user wants to be connected
    retry: 0,
    retryTimer: null,
    everConnected: false,
    role: 'member',
    debug: false
  };

  // Roles live entirely in the app: anyone can switch their own, and each app
  // decides what to show based on its own role. The relay just passes messages on.
  var ROLES = {
    member: { description: 'Chat as normal.' },
    monitor: { description: 'Also sees system messages, such as role changes.', viewSystem: true },
    admin: {
      description: 'Sees system messages and who really sent spoofed messages, has a soundboard, and can use debug mode.',
      viewSystem: true, debug: true, impersonate: true, seeSpoofer: true, soundboard: true
    }
  };
  function can(perm) { return !!(ROLES[state.role] || ROLES.member)[perm]; }

  // ---------------------------------------------------------------- storage
  function load(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } }

  // Accept "wss://host:port/ws", "https://host:port", or a bare "host:port".
  function normaliseRelay(input) {
    var s = String(input || '').trim();
    if (!s) return '';
    if (!/^[a-z]+:\/\//i.test(s)) s = 'wss://' + s;
    var u;
    try { u = new URL(s); } catch (e) { return ''; }
    if (u.protocol === 'https:') u.protocol = 'wss:';
    if (u.protocol === 'http:') u.protocol = 'ws:';
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return '';
    if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
    u.hash = ''; u.search = '';
    return u.toString();
  }
  function serverPage(relay) {
    try {
      var u = new URL(relay);
      return (u.protocol === 'ws:' ? 'http://' : 'https://') + u.host + '/';
    } catch (e) { return ''; }
  }

  // ------------------------------------------------------------- formatting
  function formatSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function formatTime(t) {
    return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ------------------------------------------------------------------- UI
  var list = $('messages');

  function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 120; }

  function append(node) {
    var stick = nearBottom();
    var empty = $('empty');
    if (empty) empty.remove();
    list.appendChild(node);
    // Keep memory bounded; free blob URLs of messages that drop off the top.
    while (list.children.length > MAX_MESSAGES) {
      var old = list.firstElementChild;
      old.querySelectorAll('[data-blob]').forEach(function (n) { URL.revokeObjectURL(n.dataset.blob); });
      old.remove();
    }
    if (stick) list.scrollTop = list.scrollHeight;
  }

  function systemLine(text) { append(el('p', 'system', text)); }

  function base64ToBlob(b64, type) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }

  var EFFECT_LINES = {
    fire: ['🔥', 'set the chat on fire'],
    earthquake: ['🌍', 'started an earthquake'],
    lightning: ['⚡', 'called down lightning']
  };

  // "/fire", "/earthquake" and "/lightning" play an effect for everyone instead of showing as text.
  function renderEffect(name, msg, who) {
    var line = EFFECT_LINES[name];
    var notes = [];
    if (msg.via === 'nfc') notes.push('NFC tag');
    if (msg.via === 'qr') notes.push('QR code');
    var spoofer = spoofedBy(msg);
    if (spoofer) notes.push('really sent by ' + spoofer.name);
    systemLine(line[0] + ' ' + who + ' ' + line[1] + (notes.length ? ' (' + notes.join(', ') + ')' : ''));
    window.LocalChatterFX.play(name);
  }

  function nameOf(id) {
    if (state.me && id === state.me.id) return state.me.name;
    var p = state.peers.get(id);
    return p ? p.name : 'someone';
  }

  // A spoofed message carries its real sender in "from" and the shown sender in "as".
  // Only admins are told who really sent it; for everyone else it's hidden here, in the app.
  function spoofedBy(msg) {
    return msg.as && msg.from && msg.as.id !== msg.from.id && can('seeSpoofer') ? msg.from : null;
  }

  function renderMessage(msg, mine) {
    var shown = msg.as || msg.from;
    var who = mine ? (msg.as ? 'You (as ' + msg.as.name + ')' : 'You') : (shown && shown.name) || 'Someone';
    if (msg.sound) return renderSound(msg, mine, who);
    var effect = !msg.file && window.LocalChatterFX && window.LocalChatterFX.parse(msg.text);
    if (effect) { renderEffect(effect, msg, who); return null; }

    var box = el('article', 'msg' + (mine ? ' mine' : ''));
    var meta = el('div', 'meta');
    meta.appendChild(el('span', 'who', who));
    if (msg.via === 'nfc') meta.appendChild(el('span', 'via', 'via NFC tag'));
    if (msg.via === 'qr') meta.appendChild(el('span', 'via', 'via QR code'));
    // Only people who can see system messages are told who really sent a spoofed message.
    var spoofer = !mine && spoofedBy(msg);
    if (spoofer) meta.appendChild(el('span', 'spoof', 'really sent by ' + spoofer.name));
    meta.appendChild(el('time', null, formatTime(msg.at || Date.now())));
    box.appendChild(meta);

    if (msg.text) box.appendChild(el('div', 'text', msg.text));

    if (msg.file) {
      var f = msg.file;
      var url;
      try { url = URL.createObjectURL(base64ToBlob(f.data, f.type)); } catch (e) { url = null; }
      if (!url) {
        box.appendChild(el('div', 'text', '[file could not be read]'));
      } else if (INLINE_IMAGE.test(f.type)) {
        var img = el('img');
        img.src = url;
        img.alt = f.name;
        img.loading = 'lazy';
        img.dataset.blob = url;
        img.addEventListener('click', function () { showImage(url, f.name); });
        box.appendChild(img);
      } else {
        var a = el('a', 'file');
        a.href = url;
        a.download = f.name;
        a.dataset.blob = url;
        a.appendChild(el('span', null, '📎 ' + f.name));
        a.appendChild(el('span', null, formatSize(f.size || 0)));
        box.appendChild(a);
      }
    }
    append(box);
    return box;
  }

  // ---------------------------------------------------------------- sounds
  // Plays from this device's cache, else the audio in the message, else its link.
  // If none of those work, the message just says a sound was attempted.
  var SOURCE_TEXT = { cache: 'from this device', message: 'from the message', link: 'from a link' };
  var soundOn = true;

  function soundEvent(name, source, played, reason) {
    document.dispatchEvent(new CustomEvent('localchatter:sound', { detail: { name: name, source: source, played: played, reason: reason || '' } }));
  }

  function renderSound(msg, mine, who) {
    var snd = msg.sound;
    var box = el('article', 'msg' + (mine ? ' mine' : ''));
    var meta = el('div', 'meta');
    meta.appendChild(el('span', 'who', who));
    var spoofer = !mine && spoofedBy(msg);
    if (spoofer) meta.appendChild(el('span', 'spoof', 'really sent by ' + spoofer.name));
    meta.appendChild(el('time', null, formatTime(msg.at || Date.now())));
    box.appendChild(meta);
    var body = el('div', 'sound');
    var label = el('div');
    label.appendChild(el('div', 'sound-name', '\uD83D\uDD0A ' + snd.name));
    var status = el('div', 'sound-status', 'Loading\u2026');
    label.appendChild(status);
    body.appendChild(label);
    box.appendChild(body);
    append(box);

    function unavailable(reason) {
      box.classList.add('unavailable');
      body.textContent = '';
      body.appendChild(el('div', 'text', '\uD83D\uDD07 ' + (mine ? 'You' : who) + ' tried to play "' + snd.name + '", but it isn\'t available on this device.'));
      soundEvent(snd.name, 'none', false, reason);
    }

    SND.resolve(snd).then(function (r) {
      if (r.source === 'none') { unavailable('no source'); return; }
      var btn = el('button', 'play');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Play ' + snd.name);
      btn.textContent = '\u25B6';
      body.insertBefore(btn, label);
      var where = SOURCE_TEXT[r.source];
      function go(auto) {
        status.textContent = 'Playing ' + where;
        return r.play().then(function () {
          status.textContent = 'Played ' + where;
          soundEvent(snd.name, r.source, true);
        }).catch(function (err) {
          if (err && err.name === 'NotAllowedError') {
            // The browser blocks sound until the page has been tapped.
            status.textContent = 'Tap \u25B6 to play (' + where + ')';
            soundEvent(snd.name, r.source, false, 'blocked');
          } else if (r.source === 'link') {
            unavailable('link failed'); // e.g. offline
          } else {
            status.textContent = 'Couldn\'t play this sound here';
            soundEvent(snd.name, r.source, false, 'error');
          }
        });
      }
      btn.addEventListener('click', function () { SND.unlock(); go(false); });
      if (soundOn) go(true);
      else { status.textContent = 'Sounds are off \u00b7 tap \u25B6 to play'; soundEvent(snd.name, r.source, false, 'muted'); }
    });
    return box;
  }

  function sendSound(entry) {
    if (!state.me) { systemLine('Connect to a server first.'); return; }
    SND.toMessage(entry, load(KEY_EMBED) !== 'off', state.maxBytes).then(function (sound) {
      if (!sendChat({ sound: sound })) systemLine('Not connected: "' + entry.name + '" wasn\'t sent');
    });
  }

  function showImage(url, alt) {
    var v = el('div', 'viewer');
    var img = el('img');
    img.src = url;
    img.alt = alt;
    v.appendChild(img);
    v.addEventListener('click', function () { v.remove(); });
    document.body.appendChild(v);
  }

  function setStatus(kind, text) {
    var s = $('status');
    s.dataset.state = kind;
    s.textContent = text;
    var connected = kind === 'on';
    $('send').disabled = !connected;
    $('attach').disabled = !connected;
    $('effects').disabled = !connected;
    $('scan').disabled = !connected;
    if (!connected) { closeEffects(); closeScanMenu(); }
    // Keep scanning through brief reconnects; stop only when the user disconnects.
    if (kind === 'off') stopNfc();
  }

  function onlineText() {
    var n = state.peers.size + 1;
    return 'Connected · ' + n + (n === 1 ? ' person' : ' people') + ' here';
  }

  function renderPeople() {
    var ul = $('people');
    ul.textContent = '';
    if (!state.me) {
      $('people-count').textContent = '';
      ul.appendChild(el('li', null, 'Not connected'));
      return;
    }
    $('people-count').textContent = '(' + (state.peers.size + 1) + ')';
    ul.appendChild(el('li', null, state.me.name + ' (you)'));
    state.peers.forEach(function (p) { ul.appendChild(el('li', null, p.name)); });
    setStatus('on', onlineText());
    refreshPeerSelects();
  }

  function banner(html) {
    var b = $('banner');
    if (!html) { b.hidden = true; b.textContent = ''; return; }
    b.textContent = '';
    b.appendChild(html);
    b.hidden = false;
  }

  function certBanner() {
    var page = serverPage(state.relay);
    var frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode("Can't reach the server. Check you're on the same Wi-Fi. If this is a new device, "));
    var a = el('a', null, 'open the server page');
    a.href = page;
    a.target = '_blank';
    a.rel = 'noopener';
    frag.appendChild(a);
    frag.appendChild(document.createTextNode(' and accept its certificate, then come back.'));
    return frag;
  }

  // ------------------------------------------------------------ connection
  function connect() {
    clearTimeout(state.retryTimer);
    if (!state.relay) {
      setStatus('off', 'No server set');
      openSettings();
      return;
    }
    if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
    state.wanted = true;
    setStatus('connecting', 'Connecting…');

    var ws;
    try { ws = new WebSocket(state.relay); } catch (e) {
      setStatus('error', 'Invalid server address');
      return;
    }
    state.ws = ws;
    var opened = false;

    ws.onopen = function () {
      opened = true;
      state.retry = 0;
      ws.send(JSON.stringify({ type: 'hello', name: state.name }));
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handle(msg);
    };

    ws.onclose = function () {
      if (state.ws !== ws) return;
      state.ws = null;
      var wasIn = !!state.me;
      state.me = null;
      state.peers.clear();
      renderPeople();
      if (wasIn) systemLine('Disconnected from the server');
      if (!state.wanted) { setStatus('off', 'Not connected'); return; }
      if (!opened) banner(certBanner());
      // Back off: 1s, 2s, 4s ... up to 30s.
      var delay = Math.min(30000, 1000 * Math.pow(2, state.retry++));
      setStatus('error', 'Offline · retrying in ' + Math.round(delay / 1000) + 's');
      state.retryTimer = setTimeout(connect, delay);
    };
  }

  function disconnect() {
    state.wanted = false;
    clearTimeout(state.retryTimer);
    if (state.ws) state.ws.close();
    setStatus('off', 'Not connected');
  }

  function handle(msg) {
    switch (msg.type) {
      case 'welcome':
        state.me = msg.you;
        state.maxBytes = msg.maxBytes || DEFAULT_MAX_BYTES;
        state.peers.clear();
        (msg.peers || []).forEach(function (p) { state.peers.set(p.id, p); });
        $('room').textContent = msg.room || 'LocalChatter';
        document.title = msg.room || 'LocalChatter';
        banner(null);
        renderPeople();
        systemLine('You joined as ' + state.me.name + (state.role !== 'member' ? ' (role: ' + state.role + ')' : ''));
        state.everConnected = true;
        break;
      case 'system':
        renderSystem(msg);
        break;
      case 'effect':
        // Targeted effect from someone in debug mode: everyone receives it, only the target plays it.
        var forMe = msg.to === 'all' || (state.me && msg.to === state.me.id);
        if (forMe && window.LocalChatterFX) window.LocalChatterFX.play(msg.name);
        renderSystem({ kind: 'effect', from: msg.from, name: msg.name, to: msg.to });
        break;
      case 'join':
        state.peers.set(msg.peer.id, msg.peer);
        renderPeople();
        systemLine(msg.peer.name + ' joined');
        break;
      case 'leave':
        state.peers.delete(msg.peer.id);
        renderPeople();
        systemLine(msg.peer.name + ' left');
        break;
      case 'rename':
        if (state.me && msg.peer.id === state.me.id) { state.me = msg.peer; renderPeople(); break; }
        var old = state.peers.get(msg.peer.id);
        state.peers.set(msg.peer.id, msg.peer);
        renderPeople();
        if (old) systemLine(old.name + ' is now ' + msg.peer.name);
        break;
      case 'chat':
        renderMessage(msg, false);
        break;
    }
  }

  function sendRaw(obj) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.me) return false;
    state.ws.send(JSON.stringify(obj));
    return true;
  }

  function sendChat(payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.me) return false;
    payload.type = 'chat';
    payload.id = randomId();
    // Admin debug mode: send as someone else.
    var as = state.debug && can('impersonate') ? $('send-as').value : '';
    var asPeer = as && as !== state.me.id && state.peers.get(as);
    if (asPeer) payload.as = { id: asPeer.id, name: asPeer.name };
    state.ws.send(JSON.stringify(payload));
    payload.at = Date.now();
    renderMessage(payload, true);
    return true;
  }

  // -------------------------------------------------------------- composer
  var text = $('text');

  function autosize() {
    text.style.height = 'auto';
    text.style.height = Math.min(text.scrollHeight, 160) + 'px';
  }
  text.addEventListener('input', autosize);
  text.addEventListener('keydown', function (e) {
    // Enter sends, Shift+Enter adds a new line (except while composing with an IME).
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('composer').requestSubmit();
    }
  });

  $('composer').addEventListener('submit', function (e) {
    e.preventDefault();
    var value = text.value;
    if (!value.trim()) return;
    if (runCommand(value)) {
      text.value = '';
      autosize();
      return;
    }
    if (sendChat({ text: value })) {
      text.value = '';
      autosize();
    }
  });

  $('attach').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () {
    Array.prototype.forEach.call(this.files, sendFile);
    this.value = '';
  });

  // Paste images straight into the chat.
  text.addEventListener('paste', function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) {
      e.preventDefault();
      Array.prototype.forEach.call(files, sendFile);
    }
  });

  function sendFile(file) {
    // Files travel base64-encoded (about 4/3 the size) inside a JSON message.
    var limit = Math.floor((state.maxBytes - 4096) * 3 / 4);
    if (file.size > limit) {
      systemLine('"' + file.name + '" is too big (' + formatSize(file.size) + '). The limit is ' + formatSize(limit) + '.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var data = String(reader.result);
      data = data.slice(data.indexOf(',') + 1);
      var ok = sendChat({
        file: { name: file.name || 'file', type: file.type || 'application/octet-stream', size: file.size, data: data }
      });
      if (!ok) systemLine('Not connected: "' + file.name + '" wasn\'t sent');
    };
    reader.onerror = function () { systemLine('Couldn\'t read "' + file.name + '"'); };
    reader.readAsDataURL(file);
  }

  // --------------------------------------------------------------- effects
  var tray = $('effects-tray');

  function closeEffects() {
    tray.hidden = true;
    $('effects').setAttribute('aria-expanded', 'false');
  }
  $('effects').addEventListener('click', function () {
    var open = tray.hidden;
    tray.hidden = !open;
    this.setAttribute('aria-expanded', String(open));
  });
  tray.addEventListener('click', function (e) {
    var b = e.target.closest('[data-effect]');
    if (!b) return;
    if (state.debug && can('debug')) {
      var fx = { type: 'effect', name: b.dataset.effect, to: $('fx-to').value || 'all' };
      if (sendRaw(fx)) handle(Object.assign({ from: state.me }, fx)); // show/play it here too
    } else {
      sendChat({ text: '/' + b.dataset.effect });
    }
    closeEffects();
  });

  // ------------------------------------------------------- soundboard (admin)
  function refreshSoundboard() {
    return SND.library().then(function (lib) {
      var wrap = $('sb-buttons');
      wrap.textContent = '';
      lib.forEach(function (e) {
        var b = el('button', null, '\uD83D\uDD0A ' + e.name);
        b.type = 'button';
        b.title = e.linkOnly ? 'Plays from its link' : '';
        b.addEventListener('click', function () { SND.unlock(); sendSound(e); });
        wrap.appendChild(b);
      });
      $('sb-empty').hidden = lib.length > 0;
      renderSoundList(lib);
    });
  }
  $('sb-stop').addEventListener('click', function () { SND.stopAll(); });
  $('sb-manage').addEventListener('click', function () {
    closeEffects();
    $('sound-embed').checked = load(KEY_EMBED) !== 'off';
    $('sound-status').textContent = '';
    refreshSoundboard();
    $('sounds').showModal();
  });

  function soundStatus(text) { $('sound-status').textContent = text; }

  function renderSoundList(lib) {
    var ul = $('sound-list');
    ul.textContent = '';
    if (!lib.length) { ul.appendChild(el('li', 'empty-row', 'No sounds yet.')); return; }
    lib.forEach(function (e) {
      var li = el('li');
      li.appendChild(el('span', 'name', e.name));
      li.appendChild(el('span', 'meta', e.linkOnly ? 'link' : formatSize(e.size)));
      var actions = [
        ['\u25B6', 'Preview ' + e.name + ' (only on this device)', function () { SND.unlock(); SND.playEntry(e).catch(function () { soundStatus('Couldn\'t play "' + e.name + '".'); }); }],
        ['\u270E', 'Rename ' + e.name, function () {
          var n = window.prompt('Rename sound', e.name);
          if (n && n.trim()) SND.rename(e.id, n).then(refreshSoundboard);
        }],
        ['\uD83D\uDDD1', 'Delete ' + e.name, function () {
          if (window.confirm('Delete "' + e.name + '" from this device?')) SND.remove(e.id).then(refreshSoundboard);
        }]
      ];
      actions.forEach(function (a) {
        var b = el('button', null, a[0]);
        b.type = 'button';
        b.setAttribute('aria-label', a[1]);
        b.addEventListener('click', a[2]);
        li.appendChild(b);
      });
      ul.appendChild(li);
    });
  }

  $('sound-files-add').addEventListener('click', function () { $('sound-files').click(); });
  $('sound-files').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files);
    this.value = '';
    soundStatus('Adding ' + files.length + (files.length === 1 ? ' sound\u2026' : ' sounds\u2026'));
    var added = [], failed = [];
    Promise.all(files.map(function (f) {
      return SND.addFile(f).then(function (e) { added.push(e.name); }, function (err) { failed.push(err.message); });
    })).then(function () {
      soundStatus((added.length ? 'Added ' + added.join(', ') + '. ' : '') + failed.join(' '));
      refreshSoundboard();
    });
  });

  $('sound-url-add').addEventListener('click', function () {
    var url = $('sound-url').value.trim();
    if (!url) { soundStatus('Paste a link to a sound file first.'); return; }
    soundStatus('Downloading\u2026');
    SND.addFromUrl(url, $('sound-url-name').value.trim()).then(function (e) {
      soundStatus(e.cached
        ? 'Downloaded "' + e.name + '" and saved it on this device.'
        : 'Saved "' + e.name + '" as a link: that site doesn\'t allow downloading (or you\'re offline), so it needs internet to play.');
      $('sound-url').value = '';
      $('sound-url-name').value = '';
      refreshSoundboard();
    }, function (err) { soundStatus(err.message); });
  });

  $('sound-embed').addEventListener('change', function () { save(KEY_EMBED, this.checked ? 'on' : 'off'); });

  // Browsers only allow sound after a tap; unlock audio on the first one.
  document.addEventListener('pointerdown', function () { SND.unlock(); }, { capture: true });
  document.addEventListener('keydown', function () { SND.unlock(); }, { capture: true });

  // ------------------------------------------------------------------- NFC
  // Web NFC is only available in Chrome on Android (over https). The button
  // stays hidden everywhere else.
  var nfc = { supported: 'NDEFReader' in window, reader: null, abort: null, last: '', lastAt: 0 };
  if (nfc.supported) $('nfc').hidden = false;
  function showNfcState() {
    var on = !!nfc.abort;
    $('nfc').setAttribute('aria-pressed', String(on));
    $('nfc').textContent = on ? '\uD83D\uDCF6 Stop NFC' : '\uD83D\uDCF6 NFC tags';
    $('scan').classList.toggle('nfc-on', on);
  }

  function decodeRecord(record) {
    var data = record.data;
    var text = function (enc) {
      try { return new TextDecoder(enc || 'utf-8').decode(data); } catch (e) { return new TextDecoder().decode(data); }
    };
    switch (record.recordType) {
      case 'empty':
        return '';
      case 'text':
        return text(record.encoding);
      case 'url':
      case 'absolute-url':
        return text();
      case 'smart-poster':
        try { return (record.toRecords() || []).map(decodeRecord).filter(Boolean).join('\n'); } catch (e) { return ''; }
      case 'mime':
        if (/^text\/|json|xml|vcard/i.test(record.mediaType || '')) return text();
        return '[' + (record.mediaType || 'binary') + ' data, ' + formatSize(data ? data.byteLength : 0) + ']';
      default:
        if (!data) return '';
        var s = text();
        // Only show it if it decodes to readable text.
        return /[\u0000-\u0008\u000e-\u001f�]/.test(s) ? '[' + record.recordType + ' record]' : s;
    }
  }

  function tagMessage(event) {
    var parts = (event.message && event.message.records ? Array.prototype.map.call(event.message.records, decodeRecord) : [])
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
    return 'Empty NFC tag' + (event.serialNumber ? ' (' + event.serialNumber + ')' : '');
  }

  function onTag(event) {
    var text = tagMessage(event).slice(0, 4000);
    // Phones report a tag repeatedly while it's held against them; send each tag once.
    var key = (event.serialNumber || '') + '|' + text;
    var now = Date.now();
    if (key === nfc.last && now - nfc.lastAt < 4000) return;
    nfc.last = key;
    nfc.lastAt = now;
    vibrate(50);
    if (!sendChat({ text: text, via: 'nfc' })) systemLine('Not connected: NFC tag wasn\'t sent');
  }

  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* not allowed */ } }

  function stopNfc() {
    if (nfc.abort) nfc.abort.abort();
    nfc.abort = null;
    showNfcState();
  }

  function startNfc() {
    var reader = new window.NDEFReader();
    var ctrl = new AbortController();
    nfc.abort = ctrl;
    reader.onreading = onTag;
    reader.onreadingerror = function () { systemLine('Couldn\'t read that NFC tag. Try holding it still.'); };
    reader.scan({ signal: ctrl.signal }).then(function () {
      if (nfc.abort !== ctrl) return;
      showNfcState();
      systemLine('Scanning for NFC tags. Hold a tag to the back of your phone.');
    }).catch(function (err) {
      if (nfc.abort === ctrl) nfc.abort = null;
      if (err && err.name === 'AbortError') return;
      var why = err && err.name === 'NotAllowedError' ? 'NFC permission was denied.'
        : err && err.name === 'NotReadableError' ? 'NFC is turned off. Turn it on in your phone\'s settings.'
        : 'NFC isn\'t available on this device.';
      systemLine(why);
    });
  }

  $('nfc').addEventListener('click', function () {
    closeScanMenu();
    if (nfc.abort) { stopNfc(); systemLine('Stopped scanning for NFC tags.'); }
    else startNfc();
  });

  // ------------------------------------------------------------------- QR
  // Uses the camera, so it works on iPhone and iPad too. Decodes with the browser's
  // BarcodeDetector where there is one, otherwise with the bundled jsQR library.
  var camera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var qr = { stream: null, timer: null, detector: null, canvas: null };
  var qrDialog = $('qr');
  var video = $('qr-video');
  if (camera || nfc.supported) $('scan').hidden = false;
  if (!camera) $('scan-qr').hidden = true;

  function closeScanMenu() {
    $('scan-menu').hidden = true;
    $('scan').setAttribute('aria-expanded', 'false');
  }
  $('scan').addEventListener('click', function () {
    // With only one way to scan, go straight to it.
    if (!nfc.supported) { openQr(); return; }
    if (!camera) { $('nfc').click(); return; }
    var open = $('scan-menu').hidden;
    $('scan-menu').hidden = !open;
    this.setAttribute('aria-expanded', String(open));
  });
  $('scan-qr').addEventListener('click', function () { closeScanMenu(); openQr(); });

  function qrStatus(text) { $('qr-status').textContent = text; }

  function loadJsQr() {
    if (window.jsQR) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = 'vendor/jsQR.js';
      sc.onload = resolve;
      sc.onerror = function () { reject(new Error('Couldn\'t load the QR decoder.')); };
      document.head.appendChild(sc);
    });
  }

  function getDetector() {
    if (!('BarcodeDetector' in window)) return Promise.resolve(null);
    return window.BarcodeDetector.getSupportedFormats().then(function (f) {
      return f.indexOf('qr_code') >= 0 ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    }).catch(function () { return null; });
  }

  function openQr() {
    if (qrDialog.open) return;
    closeEffects();
    qrStatus('Starting camera\u2026');
    qrDialog.showModal();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(function (stream) {
        if (!qrDialog.open) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        qr.stream = stream;
        video.srcObject = stream;
        return Promise.all([video.play(), getDetector()]).then(function (r) {
          qr.detector = r[1];
          return qr.detector ? null : loadJsQr();
        }).then(function () {
          if (qr.stream !== stream) return; // closed while starting
          qrStatus('Point the camera at a QR code.');
          scanSoon();
        });
      })
      .catch(function (err) {
        qrStatus(err && err.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it for this site in your browser settings, then try again.'
          : err && err.name === 'NotFoundError' ? 'No camera was found.'
          : (err && err.message) || 'Couldn\'t start the camera.');
      });
  }

  function scanSoon() { qr.timer = setTimeout(scanFrame, 150); }

  function decodeFrame() {
    if (qr.detector) {
      return qr.detector.detect(video).then(function (codes) { return codes.length ? codes[0].rawValue : null; })
        .catch(function () { return null; });
    }
    // Scale down to keep decoding quick on phones.
    var w = video.videoWidth, h = video.videoHeight;
    var k = Math.min(1, 720 / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
    if (!qr.canvas) qr.canvas = document.createElement('canvas');
    qr.canvas.width = w; qr.canvas.height = h;
    var ctx = qr.canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    var code = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
    return Promise.resolve(code ? code.data : null);
  }

  function scanFrame() {
    if (!qr.stream) return;
    if (video.readyState < 2 || !video.videoWidth) { scanSoon(); return; }
    decodeFrame().then(function (text) {
      if (!qr.stream) return;
      if (text && text.trim()) onQr(text);
      else scanSoon();
    });
  }

  function closeQr() {
    stopCamera(); // release the camera straight away, not when the close event arrives
    if (qrDialog.open) qrDialog.close();
  }

  function onQr(text) {
    vibrate(50);
    closeQr();
    if (!sendChat({ text: text.slice(0, 4000), via: 'qr' })) systemLine('Not connected: the QR code wasn\'t sent');
  }

  function stopCamera() {
    clearTimeout(qr.timer);
    if (qr.stream) qr.stream.getTracks().forEach(function (t) { t.stop(); });
    qr.stream = null;
    video.srcObject = null;
  }
  qrDialog.addEventListener('close', stopCamera); // also covers Escape
  $('qr-close').addEventListener('click', closeQr);

  // ----------------------------------------------------------------- roles
  function setRole(role, quiet) {
    var old = state.role;
    state.role = role;
    save(KEY_ROLE, role);
    if (!can('debug') && state.debug) setDebug(false, true);
    $('role-line').textContent = 'Your role: ' + role + '. Type /role to see the others.';
    $('debug-row').hidden = !can('debug');
    $('soundboard').hidden = !can('soundboard');
    if (can('soundboard')) refreshSoundboard();
    updateDebugUi();
    if (quiet || old === role) return;
    systemLine('Your role is now ' + role + '.' + (can('viewSystem') ? ' You\'ll see system messages.' : ''));
    // Everyone receives this; only apps whose role can view system messages show it.
    sendRaw({ type: 'system', kind: 'role', old: old, role: role });
  }

  function describeRoles() {
    var list = Object.keys(ROLES).map(function (name) {
      return name + (name === state.role ? ' (current)' : '') + ': ' + ROLES[name].description;
    });
    systemLine('Your role is ' + state.role + '. Switch with /role <name>.\n' + list.join('\n'));
  }

  // Handles /role and /debug. Returns true if the text was a command (and must not be sent as chat).
  function runCommand(value) {
    var m = /^\s*\/(role|debug|sound)\b\s*([\s\S]*)$/i.exec(value);
    if (!m) return false;
    var cmd = m[1].toLowerCase();
    if (cmd === 'sound') { soundCommand(m[2].trim()); return true; }
    var rest = m[2].trim().toLowerCase();

    if (cmd === 'role') {
      if (!rest) { describeRoles(); return true; }
      if (!ROLES[rest]) { systemLine('There\'s no "' + rest + '" role. Type /role to see the roles.'); return true; }
      setRole(rest);
      return true;
    }

    // /debug [on|off]
    if (!can('debug')) { systemLine('Debug mode is for admins. Switch with /role admin.'); return true; }
    setDebug(rest ? rest === 'on' : !state.debug);
    return true;
  }

  // /sound lists the sounds on this device; /sound <name> plays one for everyone.
  function soundCommand(name) {
    if (!name) {
      SND.list().then(function (l) {
        systemLine(l.length
          ? 'Sounds on this device: ' + l.map(function (e) { return e.name; }).join(', ') + '. Play one with /sound <name>.'
          : 'No sounds on this device yet. Sounds others send are saved here, and admins can add their own.');
      });
      return;
    }
    SND.findByName(name).then(function (e) {
      if (e) sendSound(e);
      else systemLine('There\'s no sound called "' + name + '" on this device. Type /sound to see the ones you have.');
    });
  }

  function setDebug(on, quiet) {
    if (on === state.debug) return;
    state.debug = on;
    $('debug-toggle').checked = on;
    updateDebugUi();
    if (!quiet) {
      systemLine('Debug mode ' + (on ? 'on: target effects at anyone, and send messages as other people.' : 'off.'));
      sendRaw({ type: 'system', kind: 'debug', on: on });
    }
  }

  function updateDebugUi() {
    var on = state.debug && can('debug');
    $('debug-bar').hidden = !on;
    $('fx-target').hidden = !on;
    $('fx-hint').hidden = on; // in debug mode only the chosen person sees it
    $('send-as-row').hidden = !(on && can('impersonate'));
    if (!on) $('send-as').value = '';
    document.body.classList.toggle('debugging', on);
    refreshPeerSelects();
  }

  function fillSelect(sel, first, people) {
    var keep = sel.value;
    sel.textContent = '';
    sel.appendChild(new Option(first[1], first[0]));
    people.forEach(function (p) { sel.appendChild(new Option(p.name, p.id)); });
    sel.value = keep;
    if (sel.value !== keep) sel.value = first[0]; // that person left
  }

  function refreshPeerSelects() {
    var others = [];
    state.peers.forEach(function (p) { others.push(p); });
    others.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var me = state.me ? [{ id: state.me.id, name: state.me.name + ' (you)' }] : [];
    fillSelect($('fx-to'), ['all', 'Everyone'], me.concat(others));
    fillSelect($('send-as'), ['', 'Myself'], others);
  }

  // System messages reach everyone; only apps whose role can view them show them.
  function renderSystem(msg) {
    if (!can('viewSystem')) return;
    var me = state.me && state.me.id;
    var name = function (p) { return p && p.id === me ? 'You' : (p && p.name) || 'Someone'; };
    var text;
    if (msg.kind === 'role') text = name(msg.from) + ' changed role: ' + msg.old + ' → ' + msg.role;
    else if (msg.kind === 'effect') text = name(msg.from) + ' triggered ' + msg.name + ' for ' + (msg.to === 'all' ? 'everyone' : msg.to === me ? 'you' : nameOf(msg.to));
    else if (msg.kind === 'debug') text = name(msg.from) + ' turned debug mode ' + (msg.on ? 'on' : 'off');
    else return;
    append(el('p', 'system audit', '🛡️ ' + text));
  }

  $('debug-toggle').addEventListener('change', function () { setDebug(this.checked); });
  $('debug-off').addEventListener('click', function () { setDebug(false); });

  // -------------------------------------------------------------- settings
  var dialog = $('settings');

  function openSettings() {
    $('name').value = state.name;
    $('relay').value = state.relay;
    var page = serverPage(state.relay);
    $('server-link-row').hidden = !page;
    if (page) $('server-link').href = page;
    renderPeople();
    if (!dialog.open) dialog.showModal();
  }

  $('open-settings').addEventListener('click', openSettings);
  $('status').addEventListener('click', openSettings);

  $('settings-form').addEventListener('submit', function (e) {
    var name = $('name').value.trim().slice(0, 32);
    var relay = normaliseRelay($('relay').value);
    if ($('relay').value.trim() && !relay) {
      e.preventDefault();
      $('relay').setCustomValidity('Enter an address like wss://192.168.1.50:8443/ws');
      $('relay').reportValidity();
      return;
    }
    if (name) save(KEY_NAME, name);
    if (name && name !== state.name) {
      state.name = name;
      if (state.ws && state.ws.readyState === WebSocket.OPEN && state.me) {
        state.ws.send(JSON.stringify({ type: 'rename', name: name }));
      }
    }
    var changed = relay !== state.relay;
    state.relay = relay;
    save(KEY_RELAY, relay);
    if (!relay) { disconnect(); setStatus('off', 'No server set'); return; }
    if (changed || !state.ws) { banner(null); state.retry = 0; connect(); }
  });
  $('relay').addEventListener('input', function () { this.setCustomValidity(''); });
  $('vibrate-on').addEventListener('change', function () {
    save(KEY_VIBRATE, this.checked ? 'on' : 'off');
    window.LocalChatterFX.setVibration(this.checked);
  });
  $('sound-on').addEventListener('change', function () {
    soundOn = this.checked;
    save(KEY_SOUND_ON, soundOn ? 'on' : 'off');
    if (!soundOn) SND.stopAll();
  });

  $('disconnect').addEventListener('click', function () {
    disconnect();
    dialog.close();
  });

  // ------------------------------------------------------------ lifecycle
  // Reconnect quickly when the device comes back online or the app is reopened.
  function nudge() {
    if (state.wanted && !state.ws) { state.retry = 0; connect(); }
  }
  window.addEventListener('online', nudge);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) nudge(); });

  // The server's setup page links here with #relay=<address>.
  function readSetupLink() {
    var hash = location.hash.slice(1);
    if (!hash) return;
    var relay = normaliseRelay(new URLSearchParams(hash).get('relay'));
    if (relay) save(KEY_RELAY, relay);
    history.replaceState(null, '', location.pathname + location.search);
  }

  function registerServiceWorker() {
    // Service workers need https:// or localhost; from file:// the app still works, just not offline.
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* not fatal */ });
  }

  function start() {
    readSetupLink();
    state.relay = load(KEY_RELAY);
    state.name = load(KEY_NAME);
    var firstRun = !state.name;
    if (firstRun) state.name = 'Guest ' + Math.floor(1000 + Math.random() * 9000);
    // Vibration only exists on Android browsers; the setting is hidden elsewhere.
    var vib = load(KEY_VIBRATE) !== 'off';
    $('vibrate-row').hidden = !window.LocalChatterFX.canVibrate;
    $('vibrate-on').checked = vib;
    window.LocalChatterFX.setVibration(vib);
    soundOn = load(KEY_SOUND_ON) !== 'off';
    $('sound-on').checked = soundOn;
    var savedRole = load(KEY_ROLE);
    setRole(ROLES[savedRole] ? savedRole : 'member', true);
    registerServiceWorker();
    if (state.relay && !firstRun) {
      connect();
    } else {
      // First run: pick a name (and server, if not set up yet) before joining.
      state.wanted = !!state.relay;
      setStatus('off', state.relay ? 'Choose a name to join' : 'No server set');
      openSettings();
    }
  }

  start();
})();
