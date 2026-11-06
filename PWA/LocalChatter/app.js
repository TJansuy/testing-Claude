// LocalChatter client. A classic script (not a module) so it also runs from file://.
// Messages live only in memory on this page: nothing is saved, so nothing is kept after you leave.
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY_RELAY = 'localchatter-relay';
  var KEY_NAME = 'localchatter-name';
  var KEY_ROLE = 'localchatter-role';
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
    perms: {},
    roles: [],
    debug: false,
    adminPassword: ''  // memory only, so admin can rejoin after a reconnect; never saved
  };

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
    if (msg.spoofedBy) notes.push('really sent by ' + msg.spoofedBy.name);
    systemLine(line[0] + ' ' + who + ' ' + line[1] + (notes.length ? ' (' + notes.join(', ') + ')' : ''));
    window.LocalChatterFX.play(name);
  }

  function nameOf(id) {
    if (state.me && id === state.me.id) return state.me.name;
    var p = state.peers.get(id);
    return p ? p.name : 'someone';
  }

  function renderMessage(msg, mine) {
    var who = mine ? (msg.as ? 'You (as ' + nameOf(msg.as) + ')' : 'You') : (msg.from && msg.from.name) || 'Someone';
    var effect = !msg.file && window.LocalChatterFX && window.LocalChatterFX.parse(msg.text);
    if (effect) { renderEffect(effect, msg, who); return null; }

    var box = el('article', 'msg' + (mine ? ' mine' : ''));
    var meta = el('div', 'meta');
    meta.appendChild(el('span', 'who', who));
    if (msg.via === 'nfc') meta.appendChild(el('span', 'via', 'via NFC tag'));
    // Only people who can see system messages are told who really sent a spoofed message.
    if (msg.spoofedBy) meta.appendChild(el('span', 'spoof', 'really sent by ' + msg.spoofedBy.name));
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
    $('nfc').disabled = !connected;
    if (!connected) closeEffects();
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
        state.roles = msg.roles || [];
        applyRole(msg.role || 'member', msg.perms || {}, true);
        renderPeople();
        systemLine('You joined as ' + state.me.name);
        state.everConnected = true;
        restoreRole();
        break;
      case 'role':
        applyRole(msg.role, msg.perms || {});
        save(KEY_ROLE, msg.role);
        systemLine('Your role is now ' + msg.role + '.' + (msg.perms && msg.perms.viewSystem ? ' You\'ll see system messages.' : ''));
        break;
      case 'system':
        renderSystem(msg);
        break;
      case 'effect':
        // Triggered by an admin in debug mode. Who did it shows up as a system message for those allowed to see it.
        if (window.LocalChatterFX) window.LocalChatterFX.play(msg.name);
        break;
      case 'error':
        if (msg.about === 'role') { state.adminPassword = ''; save(KEY_ROLE, state.role); }
        systemLine(msg.message || 'Something went wrong.');
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
    var as = state.debug && state.perms.impersonate ? $('send-as').value : '';
    if (as && as !== state.me.id) payload.as = as;
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
    if (state.debug && state.perms.debug) {
      sendRaw({ type: 'effect', name: b.dataset.effect, to: $('fx-to').value || 'all' });
    } else {
      sendChat({ text: '/' + b.dataset.effect });
    }
    closeEffects();
  });

  // ------------------------------------------------------------------- NFC
  // Web NFC is only available in Chrome on Android (over https). The button
  // stays hidden everywhere else.
  var nfc = { supported: 'NDEFReader' in window, reader: null, abort: null, last: '', lastAt: 0 };
  if (nfc.supported) $('nfc').hidden = false;

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
    $('nfc').setAttribute('aria-pressed', 'false');
    $('nfc').setAttribute('aria-label', 'Scan NFC tags');
  }

  function startNfc() {
    var reader = new window.NDEFReader();
    var ctrl = new AbortController();
    nfc.abort = ctrl;
    reader.onreading = onTag;
    reader.onreadingerror = function () { systemLine('Couldn\'t read that NFC tag. Try holding it still.'); };
    reader.scan({ signal: ctrl.signal }).then(function () {
      if (nfc.abort !== ctrl) return;
      $('nfc').setAttribute('aria-pressed', 'true');
      $('nfc').setAttribute('aria-label', 'Stop scanning NFC tags');
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
    if (nfc.abort) { stopNfc(); systemLine('Stopped scanning for NFC tags.'); }
    else startNfc();
  });

  // ----------------------------------------------------------------- roles
  // The server decides what each role may do; the app only shows the matching controls.
  function applyRole(role, perms, quiet) {
    state.role = role;
    state.perms = perms;
    if (!perms.debug && state.debug) setDebug(false, quiet);
    $('role-line').textContent = 'Your role: ' + role + '. Type /role to see the others.';
    $('debug-row').hidden = !perms.debug;
    updateDebugUi();
  }

  function restoreRole() {
    var saved = load(KEY_ROLE);
    if (!saved || saved === state.role) return;
    var info = state.roles.filter(function (r) { return r.name === saved; })[0];
    if (!info) { save(KEY_ROLE, state.role); return; }
    if (info.password && !state.adminPassword) {
      systemLine('You were ' + saved + ' before. Type /role ' + saved + ' <password> to switch back.');
      save(KEY_ROLE, state.role);
      return;
    }
    sendRaw({ type: 'role', role: saved, password: info.password ? state.adminPassword : undefined });
  }

  function describeRoles() {
    var list = state.roles.map(function (r) {
      return r.name + (r.name === state.role ? ' (current)' : '') + ': ' + r.description + (r.password ? ' Needs a password.' : '');
    });
    systemLine('Your role is ' + state.role + '. Switch with /role <name>.\n' + list.join('\n'));
  }

  // Handles /role and /debug. Returns true if the text was a command (and must not be sent as chat).
  function runCommand(value) {
    var m = /^\s*\/(role|debug)\b\s*([\s\S]*)$/i.exec(value);
    if (!m) return false;
    var cmd = m[1].toLowerCase();
    var rest = m[2].trim();
    if (!state.me) { systemLine('Connect to a server first.'); return true; }

    if (cmd === 'role') {
      if (!rest) { describeRoles(); return true; }
      var parts = rest.split(/\s+/);
      var want = parts.shift().toLowerCase();
      var password = rest.replace(/^\S+\s+/, ''); // everything after the role name, spaces included
      var info = state.roles.filter(function (r) { return r.name === want; })[0];
      if (!info) { systemLine('There\'s no "' + want + '" role. Type /role to see the roles.'); return true; }
      if (info.password && !parts.length) { systemLine('The ' + want + ' role needs a password: /role ' + want + ' <password>'); return true; }
      if (info.password) state.adminPassword = password;
      sendRaw({ type: 'role', role: want, password: info.password ? password : undefined });
      return true;
    }

    // /debug [on|off]
    if (!state.perms.debug) { systemLine('Debug mode is for admins.'); return true; }
    setDebug(rest ? /^on$/i.test(rest) : !state.debug);
    return true;
  }

  function setDebug(on, quiet) {
    if (on === state.debug) return;
    state.debug = on;
    $('debug-toggle').checked = on;
    updateDebugUi();
    if (!quiet) {
      systemLine('Debug mode ' + (on ? 'on: target effects at anyone, and send messages as other people.' : 'off.'));
      sendRaw({ type: 'debug', on: on });
    }
  }

  function updateDebugUi() {
    var on = state.debug && state.perms.debug;
    $('debug-bar').hidden = !on;
    $('fx-target').hidden = !on;
    $('fx-hint').hidden = on; // in debug mode only the chosen person sees it
    $('send-as-row').hidden = !(on && state.perms.impersonate);
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

  // System messages only reach people whose role can view them (the server filters).
  function renderSystem(msg) {
    var me = state.me && state.me.id;
    var name = function (p) { return p && p.id === me ? 'You' : (p && p.name) || 'Someone'; };
    var text;
    if (msg.kind === 'role') text = name(msg.peer) + ' changed role: ' + msg.from + ' \u2192 ' + msg.to;
    else if (msg.kind === 'effect') text = name(msg.by) + ' triggered ' + msg.name + ' for ' + (msg.to ? (msg.to.id === me ? 'you' : msg.to.name) : 'everyone');
    else if (msg.kind === 'debug') text = name(msg.by) + ' turned debug mode ' + (msg.on ? 'on' : 'off');
    else return;
    var line = el('p', 'system audit', '\uD83D\uDEE1\uFE0F ' + text);
    append(line);
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
