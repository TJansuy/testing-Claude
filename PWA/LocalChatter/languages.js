// LocalChatter languages and sender colours.
//
// Each device has a list of languages it understands (starting with "Default" and
// "System"). Messages are in Default, System (join/leave lines and system
// notices) or a named language. Text in a language the viewer doesn't understand
// is shown as gibberish in that language's own style. The gibberish is seeded by
// the message, so it's the same every time and on every device.
(function () {
  'use strict';

  var KEY_LANGS = 'localchatter-languages';
  var KEY_SPEAK = 'localchatter-speak';
  var DEFAULTS = ['Default', 'System'];
  var MAX_LANGS = 20;

  function load(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } }

  // "elvish", " Elvish " and "ELVISH" are the same language; shown as first written.
  function id(name) { return String(name || '').trim().toLowerCase(); }
  function cleanName(name) {
    return String(name || '').replace(/[^\p{L}\p{N} '\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  }
  function split(text) {
    return String(text || '').split(',').map(cleanName).filter(Boolean);
  }

  // ------------------------------------------------------------ the list
  function known() {
    try {
      var list = JSON.parse(load(KEY_LANGS));
      if (Array.isArray(list)) return list;
    } catch (e) { /* first run */ }
    return DEFAULTS.slice();
  }
  function setKnown(list) {
    var seen = {};
    var out = [];
    list.map(cleanName).forEach(function (n) {
      if (n && !seen[id(n)] && out.length < MAX_LANGS) { seen[id(n)] = true; out.push(n); }
    });
    save(KEY_LANGS, JSON.stringify(out));
    // Can't keep writing in a language you no longer know.
    if (speaking() && !understands(speaking())) setSpeaking('');
    return out;
  }
  function add(names) { return setKnown(known().concat(names)); }
  function remove(names) {
    var drop = names.map(id);
    return setKnown(known().filter(function (n) { return drop.indexOf(id(n)) < 0; }));
  }
  function reset() { setSpeaking(''); return setKnown(DEFAULTS.slice()); }
  function understands(lang) {
    var l = id(lang || 'default');
    return known().some(function (n) { return id(n) === l; });
  }
  // How to show a language's name: your own spelling if you know it, else capitalised.
  function nameOf(lang) {
    var l = id(lang);
    var mine = known().filter(function (n) { return id(n) === l; })[0];
    if (mine) return mine;
    var n = cleanName(lang);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  // The language you write in ('' = Default).
  function speaking() { return load(KEY_SPEAK); }
  function setSpeaking(lang) {
    var n = cleanName(lang);
    save(KEY_SPEAK, id(n) === 'default' ? '' : n);
  }
  function isDefault(lang) { return !lang || id(lang) === 'default'; }

  // ------------------------------------------------------------- hashing
  function hash(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----------------------------------------------------------- gibberish
  // Each language gets one of these sound sets, picked by its name, so Elvish
  // always looks like Elvish. System looks like machine code.
  var STYLES = [
    ['ka', 'ro', 'th', 'el', 'vy', 'an', 'dur', 'mi', 'sha', 'qe', 'lo', 'zin', 'ra', 'ith', 'oth', 'ul'],
    ['grak', 'dum', 'bor', 'kaz', 'ur', 'gul', 'thrum', 'dok', 'az', 'mor', 'krag', 'un', 'gra', 'zug'],
    ['li', 'ae', 'lys', 'va', 'nel', 'thi', 'ia', 're', 'sil', 'wen', 'ea', 'or', 'lin', 'mae'],
    ['xi', 'qo', 'vek', 'ptl', 'yx', 'krr', 'ji', 'tz', 'zu', 'qa', 'xl', 'vo', 'zk'],
    ['bo', 'pi', 'nu', 'ma', 'po', 'lu', 'bi', 'mo', 'pa', 'nim', 'bup', 'lo'],
    ['ash', 'sur', 'nek', 'tha', 'mun', 'ses', 'ka', 'hiss', 'zar', 'tis', 'sa', 'ess']
  ];
  var SYSTEM_STYLE = ['0x', '1F', 'A7', '3C', 'E9', '0b', '10', '01', '11', 'FF', '7E', 'D4', '//', '##'];

  function styleFor(lang) {
    return id(lang) === 'system' ? SYSTEM_STYLE : STYLES[hash(id(lang)) % STYLES.length];
  }

  // Replaces each word with invented syllables of about the same length, keeping
  // spaces, punctuation, emoji and capital letters where they were.
  function gibberish(text, lang, seed) {
    var style = styleFor(lang);
    var r = rng(hash(id(lang) + '|' + seed));
    return String(text).replace(/[\p{L}\p{N}]+/gu, function (word) {
      var len = Array.from(word).length;
      var out = '';
      while (out.length < len) out += style[Math.floor(r() * style.length)];
      out = out.slice(0, Math.max(len, 1) + (r() < 0.3 ? 1 : 0));
      var first = Array.from(word)[0];
      if (first !== first.toLowerCase()) out = out.charAt(0).toUpperCase() + out.slice(1);
      return out;
    });
  }

  // What a viewer sees: the text if they understand the language, else gibberish.
  function render(text, lang, seed) {
    if (understands(lang || 'default')) return text;
    return gibberish(text, lang || 'default', seed);
  }

  // ------------------------------------------------------------- colours
  // A stable hue for a sender's name or a language, the same on every device.
  function hue(name) { return hash(id(name)) % 360; }

  window.LocalChatterLanguages = {
    known: known,
    setKnown: setKnown,
    add: add,
    remove: remove,
    reset: reset,
    split: split,
    understands: understands,
    nameOf: nameOf,
    cleanName: cleanName,
    speaking: speaking,
    setSpeaking: setSpeaking,
    isDefault: isDefault,
    gibberish: gibberish,
    render: render,
    hue: hue
  };
})();
