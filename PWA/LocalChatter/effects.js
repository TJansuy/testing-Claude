// LocalChatter chat effects: fire, earthquake, lightning and zalgo.
// Triggered by the messages /fire, /earthquake (or /quake), /lightning and /zalgo,
// each optionally followed by a duration, "on" or "off".
// Respects "reduce motion": no shaking, no flashing, just a gentle glow instead.
(function () {
  'use strict';

  var COMMANDS = {
    fire: 'fire',
    earthquake: 'earthquake',
    quake: 'earthquake',
    lightning: 'lightning',
    zalgo: 'zalgo'
  };

  function reducedMotion() {
    return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  // Vibration (Android browsers; iPhone/iPad Safari has none). The app can turn it off.
  var vibrationOn = true;
  function vibrate(pattern) {
    if (!vibrationOn) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not allowed */ }
  }

  // Phones can only switch the motor on and off, not set its strength. Short pulses
  // with more "on" per pulse feel stronger, so intensity (0-1) becomes the share of
  // each pulse the motor is on. Chrome accepts at most 99 steps, which sets the length.
  var PULSE_MS = 40;
  var MAX_STEPS = 98;
  function rumblePattern(intensities) {
    var pattern = [];
    var rest = 0;
    for (var i = 0; i < intensities.length && pattern.length < MAX_STEPS - 1; i++) {
      var k = Math.max(0, Math.min(1, intensities[i]));
      var on = Math.round(PULSE_MS * k);
      if (on < 6) { rest += PULSE_MS; continue; } // too short to feel: treat as a pause
      if (pattern.length === 0 && rest) pattern.push(0); // patterns start with "on"
      if (rest) pattern.push(rest);
      pattern.push(on);
      rest = PULSE_MS - on;
    }
    return pattern;
  }

  // An earthquake: a quick build, a main shock with random jolts, then fading
  // aftershocks. Randomised, so no two quakes feel the same. Matches the 1.6 s shake.
  function quakeRumble() {
    var steps = Math.round(1600 / PULSE_MS);
    var peakAt = 0.12 + Math.random() * 0.1;
    var aftershock = 0.55 + Math.random() * 0.2;
    var out = [];
    for (var i = 0; i < steps; i++) {
      var t = i / steps;
      var envelope = t < peakAt ? t / peakAt : Math.pow(1 - (t - peakAt) / (1 - peakAt), 1.6);
      // A smaller second wave partway through.
      envelope += 0.35 * Math.exp(-Math.pow((t - aftershock) / 0.06, 2));
      var jolt = 0.65 + Math.random() * 0.35;
      out.push(Math.min(1, envelope * jolt));
    }
    return rumblePattern(out);
  }

  // --------------------------------------------------------------- commands
  // Every effect takes the same options:
  //   /fire              its usual length (a short burst; zalgo lasts 10 seconds)
  //   /fire 30, 30s, 2m  that long (up to 10 minutes)
  //   /fire on           until someone sends /fire off
  //   /fire off          stop it now
  // Sending it again while it's running resets the timer.
  var MAX_S = 600;
  var DEFAULT_MS = { fire: 2200, earthquake: 1600, lightning: 1100, zalgo: 10000 };

  // Returns the effect name for a message like "/fire", or null.
  function parse(text) {
    var fx = parseFull(text);
    return fx ? fx.name : null;
  }

  // Returns { name, arg, argText } or null. arg is null (usual length), a number
  // of seconds, 'on' or 'off'. Anything else after the command means it's ordinary text.
  function parseFull(text) {
    var m = /^\s*\/([a-z]+)(?:\s+(\S+))?\s*$/i.exec(String(text || ''));
    if (!m) return null;
    var name = COMMANDS[m[1].toLowerCase()];
    if (!name) return null;
    var raw = m[2];
    if (!raw) return { name: name, arg: null, argText: '' };
    var a = raw.toLowerCase();
    if (a === 'off' || a === 'stop') return { name: name, arg: 'off', argText: 'off' };
    if (a === 'on' || a === 'forever') return { name: name, arg: 'on', argText: 'on' };
    var d = /^(\d{1,4})(s|m)?$/.exec(a);
    if (!d) return null;
    var secs = Math.min(MAX_S, parseInt(d[1], 10) * (d[2] === 'm' ? 60 : 1));
    if (!secs) return null;
    return { name: name, arg: secs, argText: a };
  }

  // Full-screen canvas sized for the device pixel ratio, removed when done.
  function overlayCanvas(cls) {
    var c = document.createElement('canvas');
    c.className = 'fx ' + (cls || '');
    c.setAttribute('aria-hidden', 'true');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(innerWidth * dpr);
    c.height = Math.round(innerHeight * dpr);
    document.body.appendChild(c);
    return { canvas: c, ctx: c.getContext('2d'), dpr: dpr, w: c.width, h: c.height };
  }

  // A soft full-screen glow used instead of motion when "reduce motion" is on.
  // Stays until stopped, then fades out.
  function holdGlow(cls) {
    var d = document.createElement('div');
    d.className = 'fx fx-glow-hold ' + cls;
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    return {
      stop: function () {
        d.classList.add('out');
        setTimeout(function () { d.remove(); }, 700);
      }
    };
  }

  // ------------------------------------------------------------------ fire
  var flameSprite = null;
  function getFlameSprite() {
    if (flameSprite) return flameSprite;
    var s = document.createElement('canvas');
    s.width = s.height = 64;
    var g = s.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 245, 200, 1)');
    grad.addColorStop(0.25, 'rgba(255, 190, 60, 0.9)');
    grad.addColorStop(0.6, 'rgba(240, 80, 20, 0.45)');
    grad.addColorStop(1, 'rgba(200, 30, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    flameSprite = s;
    return s;
  }

  // Flames keep rising until stopped, then die down over about a second.
  function startFire() {
    vibrate([60, 40, 60]);
    if (reducedMotion()) return holdGlow('fx-fire-glow');

    var o = overlayCanvas('fx-fire');
    var ctx = o.ctx, w = o.w, h = o.h, dpr = o.dpr;
    var sprite = getFlameSprite();
    var parts = [];
    var FADE_MS = 1200;
    var start = performance.now();
    var stoppedAt = 0;
    var perFrame = Math.max(8, Math.round(w / (28 * dpr)));

    function frame(now) {
      var t = now - start;
      if (!stoppedAt) {
        for (var i = 0; i < perFrame; i++) {
          parts.push({
            x: Math.random() * w,
            y: h + 20 * dpr,
            vx: (Math.random() - 0.5) * 1.2 * dpr,
            vy: -(3 + Math.random() * 5) * dpr,
            size: (40 + Math.random() * 70) * dpr,
            life: 1,
            decay: 0.012 + Math.random() * 0.016
          });
        }
      }
      ctx.clearRect(0, 0, w, h);
      // Warm glow along the bottom, fading out once stopped.
      var fade = !stoppedAt ? Math.min(1, t / 300) : Math.max(0, 1 - (now - stoppedAt) / FADE_MS);
      var base = ctx.createLinearGradient(0, h, 0, h * 0.55);
      base.addColorStop(0, 'rgba(255, 90, 0, ' + 0.45 * fade + ')');
      base.addColorStop(1, 'rgba(255, 90, 0, 0)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';
      for (var j = parts.length - 1; j >= 0; j--) {
        var p = parts[j];
        p.x += p.vx + Math.sin((now + j * 37) / 180) * 0.6 * dpr;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) { parts.splice(j, 1); continue; }
        var s = p.size * (0.4 + p.life * 0.6);
        ctx.globalAlpha = p.life * 0.8;
        ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
      }
      if (!stoppedAt || parts.length || fade > 0) requestAnimationFrame(frame);
      else o.canvas.remove();
    }
    requestAnimationFrame(frame);
    return { stop: function () { if (!stoppedAt) stoppedAt = performance.now(); } };
  }

  // ------------------------------------------------------------ earthquake
  // Shakes in 1.6 s waves (each strong, then easing) and rumbles each wave, until stopped.
  function startQuake() {
    var next = null;
    function rumbleWave() { vibrate(quakeRumble()); }
    rumbleWave();
    // The next wave's rumble starts just after 1.6 s, so a single quake rumbles once.
    next = setTimeout(function loop() { rumbleWave(); next = setTimeout(loop, 1600); }, 1650);
    if (reducedMotion()) {
      var g = holdGlow('fx-quake-glow');
      return { stop: function (early) { clearTimeout(next); if (early) vibrate(0); g.stop(); } };
    }
    var root = document.body;
    root.classList.remove('fx-shake');
    void root.offsetWidth; // restart the animation
    root.classList.add('fx-shake');
    return {
      stop: function (early) {
        clearTimeout(next);
        if (early) vibrate(0);
        root.classList.remove('fx-shake');
      }
    };
  }

  // ------------------------------------------------------------- lightning
  // Jagged bolt from the top towards the bottom, with a couple of side branches.
  function boltPath(x, y, len, angle, rough, depth, out) {
    var pts = [[x, y]];
    var steps = 14;
    for (var i = 1; i <= steps; i++) {
      x += Math.sin(angle) * len / steps + (Math.random() - 0.5) * rough;
      y += Math.cos(angle) * len / steps;
      pts.push([x, y]);
      if (depth > 0 && Math.random() < 0.12) {
        boltPath(x, y, len * 0.4, angle + (Math.random() < 0.5 ? -0.7 : 0.7), rough * 0.6, depth - 1, out);
      }
    }
    out.push({ pts: pts, width: depth + 1 });
    return out;
  }

  // One strike: a bolt with two flashes 380 ms apart. Removes itself when done.
  function strike() {
    vibrate([40, 80, 40]);
    var calm = reducedMotion();
    var o = overlayCanvas('fx-lightning');
    var ctx = o.ctx, w = o.w, h = o.h, dpr = o.dpr;
    var bolts = boltPath(w * (0.25 + Math.random() * 0.5), 0, h * 0.85, (Math.random() - 0.5) * 0.3, 40 * dpr, 2, []);
    var strikes = calm ? [0] : [0, 380];
    var END_MS = calm ? 1400 : 1100;
    var start = performance.now();

    function drawBolt(alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(160, 200, 255, 1)';
      ctx.shadowBlur = 24 * dpr;
      bolts.forEach(function (b) {
        ctx.strokeStyle = 'rgba(200, 225, 255, 1)';
        ctx.lineWidth = b.width * 2.5 * dpr;
        ctx.beginPath();
        b.pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = b.width * dpr;
        ctx.stroke();
      });
      ctx.restore();
    }

    function frame(now) {
      var t = now - start;
      ctx.clearRect(0, 0, w, h);
      var a = 0;
      strikes.forEach(function (s) { if (t >= s) a = Math.max(a, 1 - (t - s) / (calm ? 1400 : 650)); });
      a = Math.max(0, a);
      if (!calm && a > 0) {
        ctx.fillStyle = 'rgba(225, 235, 255, ' + 0.55 * a + ')';
        ctx.fillRect(0, 0, w, h);
      }
      if (a > 0) drawBolt(calm ? a * 0.8 : a);
      if (t < END_MS) requestAnimationFrame(frame);
      else o.canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  // Strikes now, then again every 1.2-3 s until stopped. Strikes are at least
  // 1.2 s apart, so there are never more than two flashes in any second.
  function startLightning() {
    var stopped = false;
    var next = null;
    (function loop() {
      if (stopped) return;
      strike();
      next = setTimeout(loop, 1200 + Math.random() * 1800);
    })();
    return { stop: function () { stopped = true; clearTimeout(next); } };
  }

  // ------------------------------------------------------------------ zalgo
  // Turns all the chat's text into zalgo text and glitches the dashboard, until a
  // timer runs out or "/zalgo off" arrives. Text typed in the message box stays
  // readable. Every original is remembered and put back exactly.
  var ZALGO_TARGETS = ['.topbar', '#messages', '#effects-tray', '#stage', '#banner'];
  var zalgo = { active: false, observer: null, nodes: new Map() };

  function randomMark() {
    var c;
    do { c = 0x300 + Math.floor(Math.random() * 0x70); } while (c === 0x34F); // skip the invisible joiner
    return String.fromCharCode(c);
  }
  function zalgoify(text, strength) {
    var out = '';
    Array.from(text).forEach(function (ch) {
      out += ch;
      if (/\s/.test(ch)) return;
      var n = 1 + Math.floor(Math.random() * strength);
      for (var i = 0; i < n; i++) out += randomMark();
    });
    return out;
  }
  function skip(node) {
    var p = node.parentElement;
    return !p || !!p.closest('textarea, input, select, script, style, dialog, .fx-dock');
  }
  function corrupt(node) {
    if (skip(node) || !node.nodeValue.trim()) return;
    var rec = zalgo.nodes.get(node);
    if (rec && node.nodeValue === rec.mangled) return; // our own change
    var strength = node.parentElement.closest('#effects-tray') ? 8 : 5;
    rec = { orig: node.nodeValue, mangled: zalgoify(node.nodeValue, strength) };
    zalgo.nodes.set(node, rec);
    node.nodeValue = rec.mangled;
  }
  function corruptTree(root) {
    if (root.nodeType === 3) { corrupt(root); return; }
    if (root.nodeType !== 1) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var list = [];
    while (walker.nextNode()) list.push(walker.currentNode);
    list.forEach(corrupt);
  }

  function startZalgo() {
    if (zalgo.active) return;
    zalgo.active = true;
    document.body.classList.add('fx-zalgo');
    ZALGO_TARGETS.forEach(function (sel) { document.querySelectorAll(sel).forEach(corruptTree); });
    // Keep corrupting anything new: incoming messages, status updates and so on.
    zalgo.observer = new MutationObserver(function (records) {
      records.forEach(function (r) {
        if (r.type === 'characterData') corrupt(r.target);
        else r.addedNodes.forEach(corruptTree);
      });
    });
    ZALGO_TARGETS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        zalgo.observer.observe(el, { childList: true, subtree: true, characterData: true });
      });
    });
  }

  function stopZalgo() {
    if (!zalgo.active) return;
    zalgo.active = false;
    if (zalgo.observer) zalgo.observer.disconnect();
    zalgo.observer = null;
    zalgo.nodes.forEach(function (rec, node) {
      // Only restore text we changed; if the app has since replaced it, leave that alone.
      if (node.isConnected && node.nodeValue === rec.mangled) node.nodeValue = rec.orig;
    });
    zalgo.nodes.clear();
    document.body.classList.remove('fx-zalgo');
  }

  function startZalgoEffect() {
    vibrate([30, 30, 30, 30, 30]);
    startZalgo();
    return { stop: stopZalgo };
  }

  // ------------------------------------------------------------- runner
  // One place handles durations for every effect: start it if it isn't running,
  // (re)set its timer, or stop it. Each starter returns { stop(early) }.
  var STARTERS = { fire: startFire, earthquake: startQuake, lightning: startLightning, zalgo: startZalgoEffect };
  var active = {}; // name -> { ctrl, timer, until }

  function announce(name, on) {
    document.dispatchEvent(new CustomEvent('localchatter:fx', { detail: { name: name, active: on } }));
  }

  function stopEffect(name, early) {
    var a = active[name];
    if (!a) return;
    clearTimeout(a.timer);
    delete active[name];
    try { a.ctrl.stop(early); } catch (e) { /* already gone */ }
    announce(name, false);
  }

  // arg: null (usual length), seconds, 'on' or 'off'.
  function play(name, arg) {
    var starter = STARTERS[name];
    if (!starter) return false;
    if (arg === 'off') { stopEffect(name, true); return true; }
    var a = active[name];
    if (!a) {
      var ctrl;
      try { ctrl = starter(); } catch (e) { return false; }
      a = active[name] = { ctrl: ctrl, timer: null, until: 0 };
      announce(name, true);
    }
    clearTimeout(a.timer);
    a.timer = null;
    if (arg === 'on') { a.until = Infinity; return true; }
    var ms = typeof arg === 'number' ? arg * 1000 : DEFAULT_MS[name];
    a.until = Date.now() + ms;
    a.timer = setTimeout(function () { stopEffect(name, false); }, ms);
    return true;
  }

  window.LocalChatterFX = {
    parse: parse,
    parseFull: parseFull,
    play: play,
    names: Object.keys(STARTERS),
    defaultMs: DEFAULT_MS,
    isActive: function (name) { return !!active[name]; },
    zalgoActive: function () { return zalgo.active; },
    setVibration: function (on) { vibrationOn = !!on; if (!on) vibrate(0); },
    canVibrate: 'vibrate' in navigator,
    quakeRumble: quakeRumble
  };
})();
