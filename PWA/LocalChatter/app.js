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
  var KEY_DISPLAY_NAME = 'localchatter-display-name';
  var KEY_SPY = 'localchatter-spy';
  var KEY_FAVS = 'localchatter-favourites';
  var MAX_FAVS = 20;
  // Display mode: opened from <app>/Display (which forwards here with ?display).
  var DISPLAY = new URLSearchParams(location.search).has('display');
  var SND = window.LocalChatterSounds;
  var LANG = window.LocalChatterLanguages;
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
    spy: { description: 'Can spy on chosen people to see whispers to and from them (/spy <names>).', spy: true },
    display: { description: 'A screen that only shows effects and plays sounds, never messages. Open the app\'s /Display link.', display: true },
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

  function systemLine(text) { if (!DISPLAY) append(el('p', 'system', text)); }

  // Text in a language: shown clearly if this device understands it, otherwise as
  // gibberish. The original is kept on the element so it can be shown again if
  // the viewer later learns the language.
  function langText(tag, cls, text, lang, seed) {
    var e = el(tag, (cls ? cls + ' ' : '') + 'lc');
    e._lc = { text: text, lang: lang, seed: seed };
    e.textContent = LANG.render(text, lang, seed);
    if (!LANG.understands(lang)) e.title = 'In ' + LANG.nameOf(lang) + ', which you don\'t understand';
    return e;
  }
  // Join/leave lines and system notices are in the System language.
  function systemNotice(text, cls) {
    if (!DISPLAY) append(langText('p', 'system' + (cls ? ' ' + cls : ''), text, 'system', text + '|' + Date.now()));
  }
  function refreshLanguages() {
    document.querySelectorAll('.lc').forEach(function (n) {
      if (!n._lc) return;
      var known = LANG.understands(n._lc.lang);
      n.textContent = LANG.render(n._lc.text, n._lc.lang, n._lc.seed);
      n.title = known ? '' : 'In ' + LANG.nameOf(n._lc.lang) + ', which you don\'t understand';
      var bubble = n.closest('.msg');
      if (bubble) bubble.classList.toggle('foreign', !known);
    });
    var sp = LANG.speaking();
    var t = $('text');
    t.placeholder = sp ? 'Message everyone in ' + sp : 'Message everyone';
    t.classList.toggle('in-lang', !!sp);
    if (sp) t.style.setProperty('--lang-hue', LANG.hue(sp)); else t.style.removeProperty('--lang-hue');
  }
  // Each sender gets their own bubble colour (by the name shown, so a spoof isn't given away).
  function colourBubble(box, person) {
    if (person && person.name) box.style.setProperty('--hue', LANG.hue(person.name));
  }

  function base64ToBlob(b64, type) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }

  var EFFECT_LINES = {
    fire: ['🔥', 'set the chat on fire'],
    earthquake: ['🌍', 'started an earthquake'],
    lightning: ['⚡', 'called down lightning'],
    zalgo: ['👹', 'corrupted the chat']
  };

  var EFFECT_OFF = {
    fire: ['\uD83E\uDDEF', 'put out the fire'],
    earthquake: ['\uD83C\uDF0D', 'stopped the earthquake'],
    lightning: ['\u26A1', 'stopped the lightning'],
    zalgo: ['\u2728', 'restored the chat']
  };
  var EFFECT_TITLES = { fire: 'Fire', earthquake: 'Earthquake', lightning: 'Lightning', zalgo: 'Zalgo' };

  // The emoji and wording for an effect line, e.g. "set the chat on fire for 30 s".
  function effectPhrase(fx) {
    var line = EFFECT_LINES[fx.name];
    if (fx.arg === 'off') return EFFECT_OFF[fx.name];
    if (fx.arg === 'on') return [line[0], line[1] + ' until someone sends /' + fx.name + ' off'];
    if (typeof fx.arg === 'number') return [line[0], line[1] + ' for ' + formatDuration(fx.arg)];
    if (fx.name === 'zalgo') return [line[0], line[1] + ' for ' + formatDuration(window.LocalChatterFX.defaultMs.zalgo / 1000)];
    return line;
  }
  function formatDuration(s) {
    return s >= 60 && s % 60 === 0 ? (s / 60) + ' min' : s + ' s';
  }

  // "/fire", "/earthquake" and "/lightning" play an effect for everyone instead of showing as text.
  function renderEffect(fx, msg, who) {
    var name = fx.name;
    var line = effectPhrase(fx);
    var notes = [];
    if (msg.via === 'nfc') notes.push('NFC tag');
    if (msg.via === 'qr') notes.push('QR code');
    if (msg.to) notes.push('whisper');
    var spoofer = spoofedBy(msg);
    if (spoofer) notes.push('really sent by ' + spoofer.name);
    var p = el('p', 'system effect-line');
    p.appendChild(el('span', null, line[0] + ' ' + who + ' ' + line[1] + (notes.length ? ' (' + notes.join(', ') + ')' : '')));
    // Favourite it: yours can be resent, someone else's can be echoed back to them.
    var shown = msg.as || msg.from;
    var fav = { effect: name, arg: fx.argText || '', from: who.indexOf('You') === 0 || !shown ? null : shown.name };
    var star = el('button', 'star');
    star.type = 'button';
    star.dataset.favKey = favKey(fav);
    star.addEventListener('click', function () { toggleFavourite(fav); });
    p.appendChild(star);
    append(p);
    paintStars();
    window.LocalChatterFX.play(name, fx.arg);
    // A Stop button for the sender; anyone's "off" removes it.
    if (fx.arg === 'off') removeStop(name);
    else if (who.indexOf('You') === 0) addStop(name, fx.arg, { to: msg.to || null });
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
    var effect = !msg.file && !msg.sound && window.LocalChatterFX && window.LocalChatterFX.parseFull(msg.text);
    if (DISPLAY) {
      // A display only plays effects and sounds; it never shows messages.
      if (effect) window.LocalChatterFX.play(effect.name, effect.arg);
      else if (msg.sound) displaySound(msg.sound);
      return null;
    }
    if (msg.sound) return renderSound(msg, mine, who);
    if (effect) { renderEffect(effect, msg, who); return null; }

    var box = el('article', 'msg' + (mine ? ' mine' : ''));
    if (!mine) colourBubble(box, shown);
    var meta = el('div', 'meta');
    meta.appendChild(el('span', 'who', who));
    var inLang = !LANG.isDefault(msg.lang) ? msg.lang : '';
    if (inLang) {
      box.classList.add('in-lang');
      box.style.setProperty('--lang-hue', LANG.hue(inLang));
      if (!mine && !LANG.understands(inLang)) box.classList.add('foreign');
      meta.appendChild(el('span', 'lang-tag', '\uD83D\uDDE3 ' + LANG.nameOf(inLang)));
    }
    if (msg.via === 'nfc') meta.appendChild(el('span', 'via', 'via NFC tag'));
    if (msg.via === 'qr') meta.appendChild(el('span', 'via', 'via QR code'));
    // Only people who can see system messages are told who really sent a spoofed message.
    var spoofer = !mine && spoofedBy(msg);
    if (spoofer) meta.appendChild(el('span', 'spoof', 'really sent by ' + spoofer.name));
    if (msg.to) {
      box.classList.add('whisper');
      if (msg.spied) box.classList.add('spied');
      meta.appendChild(el('span', 'whisper-to', (msg.spied ? '\uD83D\uDD75\uFE0F spied whisper to ' : '\uD83E\uDD2B whisper to ') + whisperNames(msg.to)));
    }
    meta.appendChild(el('time', null, formatTime(msg.at || Date.now())));
    box.appendChild(meta);

    if (msg.text) {
      // You always read your own messages; others' depend on your languages.
      // Ordinary messages are in Default, which a device can also choose not to understand.
      box.appendChild(mine ? el('div', 'text', msg.text) : langText('div', 'text', msg.text, inLang || 'default', msg.id || msg.text));
      if (!mine && !inLang && !LANG.understands('default')) box.classList.add('foreign');
    }

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
    if (!mine) colourBubble(box, msg.as || msg.from);
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
    tray.classList.toggle('offline', !connected);
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
    state.peers.forEach(function (p) {
      var li = el('li');
      if (DISPLAY) { li.textContent = p.name; ul.appendChild(li); return; }
      var b = el('button', 'link-button', p.name);
      b.type = 'button';
      b.title = 'Whisper to ' + p.name;
      b.addEventListener('click', function () {
        dialog.close();
        text.value = '/whisper ' + p.name + ': ';
        text.focus();
        autosize();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
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
        var tfx = window.LocalChatterFX && window.LocalChatterFX.parseFull('/' + msg.name);
        if (forMe && tfx) window.LocalChatterFX.play(tfx.name, tfx.arg);
        if (tfx && msg.from && state.me && msg.from.id === state.me.id) {
          if (tfx.arg === 'off') removeStop(tfx.name);
          else addStop(tfx.name, tfx.arg, { target: msg.to });
        }
        renderSystem({ kind: 'effect', from: msg.from, name: msg.name, to: msg.to });
        break;
      case 'join':
        state.peers.set(msg.peer.id, msg.peer);
        renderPeople();
        systemNotice(msg.peer.name + ' joined');
        break;
      case 'leave':
        state.peers.delete(msg.peer.id);
        renderPeople();
        systemNotice(msg.peer.name + ' left');
        break;
      case 'rename':
        if (state.me && msg.peer.id === state.me.id) { state.me = msg.peer; renderPeople(); break; }
        var old = state.peers.get(msg.peer.id);
        state.peers.set(msg.peer.id, msg.peer);
        renderPeople();
        if (old) systemNotice(old.name + ' is now ' + msg.peer.name);
        break;
      case 'chat':
        // Whispers reach every device; each app only shows them to their recipients
        // (and to spies watching those people).
        if (msg.to) {
          var seen = whisperVisibility(msg);
          if (!seen) break;
          if (seen === 'spy') msg.spied = true;
        }
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
    // Written in your chosen language (effects stay effects, in no language).
    var sp = LANG.speaking();
    if (sp && payload.text && !window.LocalChatterFX.parseFull(payload.text)) payload.lang = sp;
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

  // Wide screens (16:10 or wider, at least 960px): the tray is a permanent dashboard.
  var wideQuery = window.matchMedia('(min-aspect-ratio: 16/10) and (min-width: 960px)');
  function isWide() { return wideQuery.matches && !DISPLAY; }
  function applyLayout() {
    var wide = isWide();
    document.body.classList.toggle('wide', wide);
    $('effects').hidden = wide;
    tray.hidden = !wide;
    $('effects').setAttribute('aria-expanded', 'false');
  }
  if (wideQuery.addEventListener) wideQuery.addEventListener('change', applyLayout);
  else if (wideQuery.addListener) wideQuery.addListener(applyLayout);

  function closeEffects() {
    if (isWide()) return; // the dashboard stays open
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

  // ------------------------------------------------------------ stop dock
  // While an effect you sent is running, a Stop button sits in a corner above all
  // the effects (not shaken, not corrupted). It stops the effect for everyone it
  // was sent to: the whole chat, a whisper's recipients, or an admin's target.
  var stops = {}; // name -> { arg, how, endsAt, timer, button }
  var dock = $('fx-dock');

  function addStop(name, arg, how) {
    if (DISPLAY) return;
    removeStop(name);
    var ms = arg === 'on' ? Infinity : typeof arg === 'number' ? arg * 1000 : window.LocalChatterFX.defaultMs[name];
    var entry = { arg: arg, how: how, endsAt: Date.now() + ms, timer: null };
    var b = el('button');
    b.type = 'button';
    b.dataset.stop = name;
    b.appendChild(el('span', null, '\u25A0 Stop ' + EFFECT_LINES[name][0] + ' ' + EFFECT_TITLES[name]));
    entry.left = el('span', 'left');
    b.appendChild(entry.left);
    b.addEventListener('click', function () { sendStop(name); });
    entry.button = b;
    dock.appendChild(b);
    if (ms !== Infinity) entry.timer = setTimeout(function () { removeStop(name); }, ms);
    stops[name] = entry;
    tickStops();
  }

  function removeStop(name) {
    var e = stops[name];
    if (!e) return;
    clearTimeout(e.timer);
    e.button.remove();
    delete stops[name];
  }

  function sendStop(name) {
    var e = stops[name];
    if (!e) return;
    removeStop(name);
    if (e.how.target) {
      var fx = { type: 'effect', name: name + ' off', to: e.how.target };
      if (sendRaw(fx)) handle(Object.assign({ from: state.me }, fx));
    } else if (e.how.to) {
      sendChat({ text: '/' + name + ' off', to: e.how.to });
    } else {
      sendChat({ text: '/' + name + ' off' });
    }
  }

  // Shows the time left on longer effects.
  function tickStops() {
    Object.keys(stops).forEach(function (name) {
      var e = stops[name];
      var left = Math.ceil((e.endsAt - Date.now()) / 1000);
      e.left.textContent = e.endsAt === Infinity ? '\u00b7 on' : left > 2 ? '\u00b7 ' + formatDuration(left) : '';
    });
  }
  setInterval(tickStops, 1000);

  // If an effect that was running here ends some other way, drop its button too.
  document.addEventListener('localchatter:fx', function (ev) {
    var e = stops[ev.detail.name];
    if (!ev.detail.active && e && !e.how.target && e.endsAt - Date.now() > 300) removeStop(ev.detail.name);
  });

  // ------------------------------------------------------------ favourites
  // Stored on this device: { effect, from } where from is null for your own.
  function favKey(f) { return f.effect + (f.arg ? ' ' + f.arg : '') + '|' + (f.from || '').toLowerCase(); }
  function favourites() {
    try { return JSON.parse(load(KEY_FAVS) || '[]'); } catch (e) { return []; }
  }
  function saveFavourites(list) { save(KEY_FAVS, JSON.stringify(list.slice(0, MAX_FAVS))); }

  function toggleFavourite(fav) {
    var list = favourites();
    var key = favKey(fav);
    var i = list.findIndex(function (f) { return favKey(f) === key; });
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ effect: fav.effect, arg: fav.arg || '', from: fav.from });
    saveFavourites(list);
    renderFavourites();
  }

  function paintStars() {
    var keys = favourites().map(favKey);
    document.querySelectorAll('.star[data-fav-key]').forEach(function (b) {
      var on = keys.indexOf(b.dataset.favKey) >= 0;
      b.textContent = on ? '\u2605' : '\u2606';
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
    });
  }

  function renderFavourites() {
    var list = favourites();
    var ul = $('fav-list');
    ul.textContent = '';
    list.forEach(function (f) {
      var fx = window.LocalChatterFX.parseFull('/' + f.effect + (f.arg ? ' ' + f.arg : ''));
      if (!fx) return;
      var line = effectPhrase(fx);
      var li = el('li');
      var label = el('span', 'fav-label');
      var title = EFFECT_TITLES[f.effect] + (f.arg ? ' ' + f.arg : '');
      label.appendChild(el('span', 'fav-name', line[0] + ' ' + title));
      label.appendChild(el('span', 'fav-from', f.from ? 'from ' + f.from : 'yours'));
      li.appendChild(label);
      var go = el('button', 'fav-go', f.from ? 'Echo' : 'Resend');
      go.type = 'button';
      go.title = f.from ? 'Play ' + f.from + '\'s effect for everyone again' : 'Send it to everyone again';
      go.addEventListener('click', function () { useFavourite(f); });
      li.appendChild(go);
      var rm = el('button', 'fav-remove', '\u2715');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove from favourites');
      rm.addEventListener('click', function () { toggleFavourite(f); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
    $('fav-empty').hidden = list.length > 0;
    paintStars();
  }

  // Resend your own, or echo someone else's: either way it plays for everyone.
  function useFavourite(f) {
    sendChat({ text: '/' + f.effect + (f.arg ? ' ' + f.arg : '') });
  }

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
    if (role !== 'display') save(KEY_ROLE, role); // display comes from the link, not a saved choice
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
    var m = /^\s*\/(role|debug|sound|whisper|w|spy|languages|language|langs|speak)\b\s*([\s\S]*)$/i.exec(value);
    if (!m) return false;
    var cmd = m[1].toLowerCase();
    if (cmd === 'sound') { soundCommand(m[2].trim()); return true; }
    if (cmd === 'whisper' || cmd === 'w') { whisperCommand(m[2]); return true; }
    if (cmd === 'spy') { spyCommand(m[2].trim()); return true; }
    if (cmd === 'speak') { speakCommand(m[2].trim()); return true; }
    if (cmd === 'languages' || cmd === 'language' || cmd === 'langs') { languagesCommand(m[2].trim()); return true; }
    var rest = m[2].trim().toLowerCase();

    if (cmd === 'role') {
      if (!rest) { describeRoles(); return true; }
      if (!ROLES[rest]) { systemLine('There\'s no "' + rest + '" role. Type /role to see the roles.'); return true; }
      if (rest === 'display') { location.assign('Display/'); return true; }
      setRole(rest);
      return true;
    }

    // /debug [on|off]
    if (!can('debug')) { systemLine('Debug mode is for admins. Switch with /role admin.'); return true; }
    setDebug(rest ? rest === 'on' : !state.debug);
    return true;
  }

  // ------------------------------------------------------------- languages
  // /languages                       what you understand and write in
  // /languages add Elvish, Dwarvish  learn languages
  // /languages remove Elvish         forget one
  // /languages reset                 back to Default and System
  function languagesCommand(rest) {
    var m = /^(add|remove|forget|learn|reset)\b\s*([\s\S]*)$/i.exec(rest);
    if (!rest) { describeLanguages(); return; }
    if (!m) { systemLine('Use /languages add <names>, /languages remove <names> or /languages reset.'); return; }
    var verb = m[1].toLowerCase();
    var names = LANG.split(m[2]);
    if (verb === 'reset') { LANG.reset(); refreshLanguages(); describeLanguages(); return; }
    if (!names.length) { systemLine('Name the languages, e.g. /languages ' + verb + ' Elvish, Dwarvish'); return; }
    if (verb === 'add' || verb === 'learn') LANG.add(names); else LANG.remove(names);
    refreshLanguages();
    describeLanguages();
  }
  function describeLanguages() {
    var list = LANG.known();
    systemLine('You understand: ' + (list.length ? list.join(', ') : 'nothing at all') + '. You write in ' + (LANG.speaking() || 'Default') +
      '.\nChange with /languages add <names>, /languages remove <names>, /languages reset, and /speak <language>.');
  }
  // /speak Elvish   write your messages in Elvish (must be one you understand)
  // /speak default  back to Default
  function speakCommand(rest) {
    if (!rest) { systemLine('You write in ' + (LANG.speaking() || 'Default') + '. Change with /speak <language>.'); return; }
    var lang = LANG.cleanName(rest);
    if (!LANG.isDefault(lang) && !LANG.understands(lang)) {
      systemLine('You don\'t understand ' + lang + '. Add it first with /languages add ' + lang + '.');
      return;
    }
    LANG.setSpeaking(LANG.isDefault(lang) ? '' : LANG.nameOf(lang)); // use your own spelling
    refreshLanguages();
    systemLine('You now write in ' + (LANG.speaking() || 'Default') + '.');
  }

  // -------------------------------------------------------------- whispers
  // /whisper Bob, Cara: message   (or /w). Only Bob and Cara's apps show it.
  function whisperNames(to) {
    return to.map(function (t) { return state.me && t.id === state.me.id ? 'you' : t.name; }).join(', ');
  }

  function whisperCommand(rest) {
    var m = /^([^:]+):\s*([\s\S]*\S[\s\S]*)$/.exec(rest);
    if (!m) { systemLine('Whisper with /whisper <names>: <message>, e.g. /whisper Bob, Cara: see you at 5'); return; }
    var wanted = m[1].split(',').map(function (n) { return n.trim().replace(/^@/, ''); }).filter(Boolean);
    var to = [], missing = [];
    wanted.forEach(function (n) {
      var found = null;
      state.peers.forEach(function (p) { if (!found && p.name.toLowerCase() === n.toLowerCase()) found = p; });
      if (found) { if (to.indexOf(found) < 0) to.push(found); } else missing.push(n);
    });
    if (missing.length) { systemLine('No one called ' + missing.map(function (n) { return '"' + n + '"'; }).join(', ') + ' is here. Whisper not sent.'); return; }
    if (!sendChat({ text: m[2].trim(), to: to.map(function (p) { return { id: p.id, name: p.name }; }) })) {
      systemLine('Not connected: whisper not sent');
    }
  }

  function spyTargets() {
    try { return JSON.parse(load(KEY_SPY) || '[]'); } catch (e) { return []; }
  }

  // Returns true for a recipient, 'spy' for a spy watching anyone involved, else false.
  function whisperVisibility(msg) {
    var me = state.me && state.me.id;
    if (msg.to.some(function (t) { return t.id === me; })) return true;
    if (!can('spy')) return false;
    var targets = spyTargets();
    if (targets.indexOf('*') >= 0) return 'spy';
    var involved = msg.to.map(function (t) { return t.name; });
    if (msg.from) involved.push(msg.from.name);
    if (msg.as) involved.push(msg.as.name);
    return involved.some(function (n) { return targets.indexOf(n.toLowerCase()) >= 0; }) ? 'spy' : false;
  }

  // /spy               who you're spying on
  // /spy Bob, Cara     spy on whispers to or from Bob and Cara
  // /spy all | off
  function spyCommand(rest) {
    if (!can('spy')) { systemLine('Spying is for the spy role. Switch with /role spy.'); return; }
    var lower = rest.toLowerCase();
    if (!rest) {
      var t = spyTargets();
      systemLine(t.length ? 'Spying on ' + (t[0] === '*' ? 'everyone' : t.join(', ')) + '. Change with /spy <names>, /spy all or /spy off.'
        : 'Not spying on anyone. Use /spy <names> or /spy all.');
      return;
    }
    var list = lower === 'off' ? [] : lower === 'all' ? ['*']
      : rest.split(',').map(function (n) { return n.trim().replace(/^@/, '').toLowerCase(); }).filter(Boolean);
    save(KEY_SPY, JSON.stringify(list));
    systemLine(!list.length ? 'Stopped spying.' : 'Spying on ' + (list[0] === '*' ? 'everyone' : rest.split(',').map(function (n) { return n.trim(); }).join(', ')) + '. You\'ll see their whispers.');
  }

  // ---------------------------------------------------------- display mode
  function displaySound(sound) {
    SND.resolve(sound).then(function (r) {
      if (!r.play || !soundOn) return;
      r.play().then(function () { soundEvent(sound.name, r.source, true); }, function (err) {
        if (err && err.name === 'NotAllowedError') $('stage-tap').hidden = false;
        soundEvent(sound.name, r.source, false, err && err.name === 'NotAllowedError' ? 'blocked' : 'error');
      });
    });
  }

  function keepScreenOn() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').catch(function () { /* not allowed right now */ });
  }

  function startDisplay() {
    document.body.classList.add('display-mode');
    $('stage').hidden = false;
    $('stage-tap').hidden = SND.unlocked();
    $('stage-tap').addEventListener('click', function () { SND.unlock(); this.hidden = true; });
    $('exit-display').hidden = false;
    $('exit-display').addEventListener('click', function () { location.assign('./'); });
    keepScreenOn();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) keepScreenOn(); });
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
    systemNotice('🛡️ ' + text, 'audit');
  }

  $('debug-toggle').addEventListener('change', function () { setDebug(this.checked); });
  $('debug-off').addEventListener('click', function () { setDebug(false); });

  // -------------------------------------------------------------- settings
  var dialog = $('settings');

  function openSettings() {
    $('name').value = state.name;
    $('relay').value = state.relay;
    fillLanguageSettings();
    var page = serverPage(state.relay);
    $('server-link-row').hidden = !page;
    if (page) $('server-link').href = page;
    renderPeople();
    if (!dialog.open) dialog.showModal();
  }

  function fillLanguageSettings() {
    $('langs').value = LANG.known().join(', ');
    var sel = $('speak');
    sel.textContent = '';
    sel.appendChild(new Option('Default', ''));
    LANG.known().filter(function (n) { return !LANG.isDefault(n); }).forEach(function (n) { sel.appendChild(new Option(n, n)); });
    sel.value = LANG.speaking();
    if (sel.value !== LANG.speaking()) sel.value = '';
  }
  // Update the "write in" choices as the list is edited.
  $('langs').addEventListener('input', function () {
    var keep = $('speak').value;
    var sel = $('speak');
    sel.textContent = '';
    sel.appendChild(new Option('Default', ''));
    LANG.split(this.value).filter(function (n) { return !LANG.isDefault(n); }).forEach(function (n) { sel.appendChild(new Option(n, n)); });
    sel.value = keep;
    if (sel.value !== keep) sel.value = '';
  });

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
    if (name) save(DISPLAY ? KEY_DISPLAY_NAME : KEY_NAME, name);
    LANG.setKnown(LANG.split($('langs').value));
    LANG.setSpeaking($('speak').value);
    refreshLanguages();
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
    state.name = load(DISPLAY ? KEY_DISPLAY_NAME : KEY_NAME) || (DISPLAY ? 'Display' : '');
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
    applyLayout();
    renderFavourites();
    refreshLanguages();
    if (DISPLAY) { setRole('display', true); startDisplay(); }
    else setRole(ROLES[savedRole] && savedRole !== 'display' ? savedRole : 'member', true);
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
