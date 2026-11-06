'use strict';

/*
 * LocalChatter relay.
 *
 * - Serves a setup page over HTTPS that points a device's LocalChatter app at
 *   this server's LAN address and port.
 * - Accepts WebSocket connections on /ws and forwards every chat message to
 *   everyone else who is connected right now.
 *
 * No history is kept: messages are forwarded and then dropped. Nothing is
 * written to disk and message contents are never logged.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

// ---------------------------------------------------------------------------
// Configuration (environment variables)
// ---------------------------------------------------------------------------

const env = process.env;
const PORT = toInt(env.PORT, 8443);
// LAN address devices should use to reach this server, e.g. 192.168.1.50.
// When empty, the address the device used to open the setup page is used.
const ADVERTISED_HOST = (env.ADVERTISED_HOST || '').trim();
// Port devices should use. Set this when the container port is mapped to a
// different host port. Defaults to PORT.
const ADVERTISED_PORT = toInt(env.ADVERTISED_PORT, PORT);
// Where the LocalChatter app is hosted.
const APP_URL = env.APP_URL || 'https://tjansuy.github.io/testing-Claude/PWA/LocalChatter/';
const ROOM_NAME = clean(env.ROOM_NAME, 60) || 'LocalChatter';
// Largest single WebSocket message accepted, in megabytes (files are sent base64-encoded).
const MAX_MESSAGE_MB = Math.max(1, toInt(env.MAX_MESSAGE_MB, 25));
const MAX_PEERS = Math.max(2, toInt(env.MAX_PEERS, 200));
const CERT_DIR = env.CERT_DIR || path.join(__dirname, 'certs');
// TLS is on by default because browsers block ws:// from HTTPS pages.
// TLS=off is only for local development behind something else that does TLS.
const USE_TLS = (env.TLS || 'on').toLowerCase() !== 'off';

const MAX_BYTES = MAX_MESSAGE_MB * 1024 * 1024;
const MAX_TEXT = 4000;
const MAX_NAME = 32;
const MAX_BUFFERED = 4 * MAX_BYTES; // drop clients that can't keep up

function toInt(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }
function clean(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// HTTP(S) server: setup page, config and health
// ---------------------------------------------------------------------------

// Address devices should connect to: env override, else the Host header the device used.
function relayFor(req) {
  if (ADVERTISED_HOST) {
    const host = ADVERTISED_HOST.includes(':') && !ADVERTISED_HOST.startsWith('[') ? `[${ADVERTISED_HOST}]` : ADVERTISED_HOST;
    return { origin: `${USE_TLS ? 'https' : 'http'}://${host}:${ADVERTISED_PORT}`, ws: `${USE_TLS ? 'wss' : 'ws'}://${host}:${ADVERTISED_PORT}/ws` };
  }
  let host = String(req.headers.host || '');
  if (!/^[A-Za-z0-9.\-:[\]]{1,255}$/.test(host)) host = `localhost:${PORT}`;
  return { origin: `${USE_TLS ? 'https' : 'http'}://${host}`, ws: `${USE_TLS ? 'wss' : 'ws'}://${host}/ws` };
}

function setupUrl(relayWs) {
  return `${APP_URL}#relay=${encodeURIComponent(relayWs)}`;
}

function send(res, status, type, body, extra) {
  res.writeHead(status, Object.assign({
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }, extra || {}));
  res.end(body);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // Lets public HTTPS pages (e.g. GitHub Pages) reach this private-network server in Chromium.
  'Access-Control-Allow-Private-Network': 'true',
};

function handleRequest(req, res) {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '', CORS);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Method not allowed');

  if (url.pathname === '/health') return send(res, 200, 'text/plain', 'ok', CORS);

  if (url.pathname === '/config.json') {
    const r = relayFor(req);
    return send(res, 200, 'application/json', JSON.stringify({
      app: 'LocalChatter', room: ROOM_NAME, relay: r.ws, online: peers.size, maxBytes: MAX_BYTES,
    }), CORS);
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return send(res, 200, 'text/html; charset=utf-8', setupPage(relayFor(req)), {
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
    });
  }

  send(res, 404, 'text/plain', 'Not found');
}

function setupPage(r) {
  const link = setupUrl(r.ws);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LocalChatter Server</title>
<style>
  :root { --bg:#f3f5f9; --fg:#18202b; --muted:#5b6575; --accent:#0f766e; --on-accent:#fff; --card:#fff; --line:#dfe3ea; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#11161d; --fg:#e8edf3; --muted:#9aa5b5; --accent:#2dd4bf; --on-accent:#062420; --card:#1a212b; --line:#2a3340; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 16px; background:var(--bg); color:var(--fg); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; line-height:1.5; }
  main { max-width:560px; margin:0 auto; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; margin-bottom:16px; }
  h1 { margin:0 0 4px; font-size:1.6rem; }
  h2 { margin:0 0 8px; font-size:1.1rem; }
  p { margin:0 0 12px; }
  .muted { color:var(--muted); }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.95em; word-break:break-all; background:var(--bg); padding:2px 6px; border-radius:6px; }
  .button { display:block; text-align:center; padding:14px 18px; border-radius:10px; background:var(--accent); color:var(--on-accent); font-weight:600; text-decoration:none; }
  ol { margin:0; padding-left:20px; }
  li { margin-bottom:6px; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(ROOM_NAME)}</h1>
  <p class="muted">LocalChatter relay server &middot; ${peers.size} connected &middot; no history is kept</p>

  <section class="card">
    <h2>Set up this device</h2>
    <p>Tap the button to open LocalChatter and point it at this server.</p>
    <a class="button" href="${escapeHtml(link)}">Set up LocalChatter</a>
  </section>

  <section class="card">
    <h2>Server address</h2>
    <p><code>${escapeHtml(r.ws)}</code></p>
    <p class="muted">If you use LocalChatter from your home screen on iPhone or iPad, open its settings and enter this address there; home-screen apps don't share settings with Safari.</p>
  </section>

  <section class="card">
    <h2>Other devices</h2>
    <ol>
      <li>Join the same Wi-Fi or hotspot as this server.</li>
      <li>Open <code>${escapeHtml(r.origin)}/</code> in the browser.</li>
      <li>Accept the certificate warning. The server uses its own certificate because it's on your local network.</li>
      <li>Tap <strong>Set up LocalChatter</strong>.</li>
    </ol>
  </section>
</main>
</body>
</html>`;
}

// Uses CERT_DIR/key.pem + cert.pem. If they don't exist yet, creates a self-signed
// certificate and saves it there, so devices only have to accept it once.
function loadTls() {
  const keyFile = path.join(CERT_DIR, 'key.pem');
  const certFile = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  }

  const selfsigned = require('selfsigned');
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }];
  if (ADVERTISED_HOST) {
    const isIp = /^[\d.]+$/.test(ADVERTISED_HOST) || ADVERTISED_HOST.includes(':');
    altNames.push(isIp ? { type: 7, ip: ADVERTISED_HOST.replace(/^\[|\]$/g, '') } : { type: 2, value: ADVERTISED_HOST });
  }
  const pems = selfsigned.generate([{ name: 'commonName', value: ADVERTISED_HOST || 'LocalChatter relay' }], {
    days: 825,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(keyFile, pems.private, { mode: 0o600 });
  fs.writeFileSync(certFile, pems.cert);
  console.log(`Created self-signed certificate in ${CERT_DIR} (fingerprint ${pems.fingerprint})`);
  return { key: pems.private, cert: pems.cert };
}

const server = USE_TLS ? https.createServer(loadTls(), handleRequest) : http.createServer(handleRequest);

// ---------------------------------------------------------------------------
// WebSocket relay
// ---------------------------------------------------------------------------

/** @type {Map<WebSocket, {id: string, name: string, alive: boolean}>} */
const peers = new Map();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_BYTES });

function publicPeer(p) { return { id: p.id, name: p.name }; }

function sendTo(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED) { ws.terminate(); return; }
  ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

function broadcast(obj, except) {
  const data = JSON.stringify(obj); // serialise once, send to everyone
  for (const [ws, p] of peers) if (ws !== except && p.name) sendTo(ws, data);
}

// Rebuild chat messages from allowed fields only, so clients can't inject anything else.
function sanitiseChat(msg, from) {
  const out = { type: 'chat', id: clean(msg.id, 64) || crypto.randomUUID(), from: publicPeer(from), at: Date.now() };
  const text = typeof msg.text === 'string' ? msg.text.slice(0, MAX_TEXT) : '';
  if (text.trim()) out.text = text;
  if (msg.via === 'nfc') out.via = 'nfc'; // sent by scanning an NFC tag
  const f = msg.file;
  if (f && typeof f === 'object' && typeof f.data === 'string' && /^[A-Za-z0-9+/=]*$/.test(f.data)) {
    out.file = {
      name: clean(f.name, 200) || 'file',
      type: /^[\w.+-]+\/[\w.+-]+$/.test(f.type || '') ? f.type.slice(0, 100) : 'application/octet-stream',
      size: Math.floor(f.data.length * 3 / 4),
      data: f.data,
    };
  }
  return out.text || out.file ? out : null;
}

wss.on('connection', (ws) => {
  if (peers.size >= MAX_PEERS) { ws.close(1013, 'Room is full'); return; }
  const peer = { id: crypto.randomUUID().slice(0, 8), name: '', alive: true };
  peers.set(ws, peer);
  ws.on('pong', () => { peer.alive = true; });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello' && !peer.name) {
      peer.name = clean(msg.name, MAX_NAME) || 'Guest';
      const others = [...peers.values()].filter((p) => p !== peer && p.name).map(publicPeer);
      sendTo(ws, { type: 'welcome', you: publicPeer(peer), room: ROOM_NAME, peers: others, maxBytes: MAX_BYTES });
      broadcast({ type: 'join', peer: publicPeer(peer) }, ws);
      log();
      return;
    }
    if (!peer.name) return; // must say hello first

    if (msg.type === 'rename') {
      const name = clean(msg.name, MAX_NAME);
      if (name && name !== peer.name) {
        peer.name = name;
        broadcast({ type: 'rename', peer: publicPeer(peer) });
      }
      return;
    }

    if (msg.type === 'chat') {
      const out = sanitiseChat(msg, peer);
      if (out) broadcast(out, ws); // forwarded, never stored
    }
  });

  ws.on('close', () => {
    peers.delete(ws);
    if (peer.name) broadcast({ type: 'leave', peer: publicPeer(peer) });
    log();
  });
  ws.on('error', () => {});
});

// Drop connections that stop answering (e.g. a phone that went to sleep).
const heartbeat = setInterval(() => {
  for (const [ws, p] of peers) {
    if (!p.alive) { ws.terminate(); continue; }
    p.alive = false;
    ws.ping();
  }
}, 30000);

function log() {
  // Only counts are logged: never names or message contents.
  console.log(`${new Date().toISOString()} ${[...peers.values()].filter((p) => p.name).length} connected`);
}

server.listen(PORT, () => {
  const scheme = USE_TLS ? 'https' : 'http';
  const host = ADVERTISED_HOST || '<this-machine-lan-ip>';
  console.log(`LocalChatter relay listening on port ${PORT}`);
  console.log(`Setup page: ${scheme}://${host}:${ADVERTISED_PORT}/`);
  console.log(`App: ${APP_URL}`);
  console.log(`Max message: ${MAX_MESSAGE_MB} MB. No history is kept.`);
});

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of peers.keys()) ws.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
