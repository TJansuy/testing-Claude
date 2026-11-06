// LocalChatter chat effects: fire, earthquake and lightning.
// Triggered by the messages /fire, /earthquake (or /quake) and /lightning.
// Respects "reduce motion": no shaking, no flashing, just a gentle glow instead.
(function () {
  'use strict';

  var COMMANDS = {
    fire: 'fire',
    earthquake: 'earthquake',
    quake: 'earthquake',
    lightning: 'lightning'
  };
  var playing = {};

  function reducedMotion() {
    return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not allowed */ }
  }

  // Returns the effect name for a message like "/fire", or null.
  function parse(text) {
    var m = /^\s*\/([a-z]+)\s*$/i.exec(String(text || ''));
    return m ? COMMANDS[m[1].toLowerCase()] || null : null;
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

  function glow(cls, ms) {
    var d = document.createElement('div');
    d.className = 'fx fx-glow ' + cls;
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, ms);
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

  function fire(done) {
    vibrate([60, 40, 60]);
    if (reducedMotion()) { glow('fx-fire-glow', 2500); return setTimeout(done, 2500); }

    var o = overlayCanvas('fx-fire');
    var ctx = o.ctx, w = o.w, h = o.h, dpr = o.dpr;
    var sprite = getFlameSprite();
    var parts = [];
    var EMIT_MS = 2200, END_MS = 3400;
    var start = performance.now();
    var perFrame = Math.max(8, Math.round(w / (28 * dpr)));

    function frame(now) {
      var t = now - start;
      if (t < EMIT_MS) {
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
      // Warm glow along the bottom, fading out at the end.
      var fade = t < EMIT_MS ? Math.min(1, t / 300) : Math.max(0, 1 - (t - EMIT_MS) / (END_MS - EMIT_MS));
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
      if (t < END_MS || parts.length) requestAnimationFrame(frame);
      else { o.canvas.remove(); done(); }
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ earthquake
  function earthquake(done) {
    vibrate([120, 60, 180, 60, 240]);
    if (reducedMotion()) { glow('fx-quake-glow', 1600); return setTimeout(done, 1600); }
    var root = document.body;
    root.classList.remove('fx-shake');
    void root.offsetWidth; // restart the animation
    root.classList.add('fx-shake');
    setTimeout(function () { root.classList.remove('fx-shake'); done(); }, 1600);
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

  function lightning(done) {
    vibrate([40, 80, 40]);
    var calm = reducedMotion();
    var o = overlayCanvas('fx-lightning');
    var ctx = o.ctx, w = o.w, h = o.h, dpr = o.dpr;
    var bolts = boltPath(w * (0.25 + Math.random() * 0.5), 0, h * 0.85, (Math.random() - 0.5) * 0.3, 40 * dpr, 2, []);
    // Two strikes, well under the 3-flashes-per-second safety limit.
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
      // Brightness of the most recent strike.
      var a = 0;
      strikes.forEach(function (s) { if (t >= s) a = Math.max(a, 1 - (t - s) / (calm ? 1400 : 650)); });
      a = Math.max(0, a);
      if (!calm && a > 0) {
        ctx.fillStyle = 'rgba(225, 235, 255, ' + 0.55 * a + ')';
        ctx.fillRect(0, 0, w, h);
      }
      if (a > 0) drawBolt(calm ? a * 0.8 : a);
      if (t < END_MS) requestAnimationFrame(frame);
      else { o.canvas.remove(); done(); }
    }
    requestAnimationFrame(frame);
  }

  var EFFECTS = { fire: fire, earthquake: earthquake, lightning: lightning };

  // Plays an effect; a second request for one that's already playing is ignored.
  function play(name) {
    var fn = EFFECTS[name];
    if (!fn || playing[name]) return false;
    playing[name] = true;
    try {
      fn(function () { playing[name] = false; });
    } catch (e) {
      playing[name] = false;
      return false;
    }
    return true;
  }

  window.LocalChatterFX = { parse: parse, play: play, names: Object.keys(EFFECTS) };
})();
