// The page devices open first: accepting its certificate lets the game (hosted
// on GitHub Pages) connect here, and its button opens the game pointed at this server.
import type { IncomingMessage } from 'node:http';
import { ADVERTISED_HOST, ADVERTISED_PORT, GAME_URL, PORT, USE_TLS } from './config';

export interface Address { origin: string; ws: string }

export function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

/** Address devices should connect to: env override, else the Host header the device used. */
export function addressFor(req: IncomingMessage): Address {
  const http = USE_TLS ? 'https' : 'http';
  const ws = USE_TLS ? 'wss' : 'ws';
  if (ADVERTISED_HOST) {
    const host = ADVERTISED_HOST.includes(':') && !ADVERTISED_HOST.startsWith('[') ? `[${ADVERTISED_HOST}]` : ADVERTISED_HOST;
    return { origin: `${http}://${host}:${ADVERTISED_PORT}`, ws: `${ws}://${host}:${ADVERTISED_PORT}/rally` };
  }
  let host = String(req.headers.host || '');
  if (!/^[A-Za-z0-9.\-:[\]]{1,255}$/.test(host)) host = `localhost:${PORT}`;
  return { origin: `${http}://${host}`, ws: `${ws}://${host}/rally` };
}

const STYLE = `
  :root { color-scheme: dark; --bg:#1e2a5a; --fg:#f4f6ff; --muted:#b9c1e6; --accent:#d9f23f; --card:rgb(14 20 46 / .82); --line:rgb(255 255 255 / .16); }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 16px; min-height:100vh; background:linear-gradient(#1e2a5a, #f59e73); color:var(--fg); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; line-height:1.5; }
  main { max-width:520px; margin:0 auto; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px; }
  h1 { margin:0 0 4px; font-size:2rem; }
  h2 { margin:0 0 8px; font-size:1.1rem; }
  p { margin:0 0 12px; }
  .muted { color:var(--muted); }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-all; background:rgb(0 0 0 / .3); padding:2px 6px; border-radius:6px; }
  .button { display:block; text-align:center; padding:14px 18px; border-radius:12px; background:var(--accent); color:#18210a; font-weight:700; text-decoration:none; }
  ol { margin:0; padding-left:20px; }`;

export function page(a: Address, connected: number): string {
  const play = `${GAME_URL}#server=${encodeURIComponent(a.ws)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rally Server</title>
<style>${STYLE}
</style>
</head>
<body>
<main>
  <h1>Rally</h1>
  <p class="muted">Tennis for two on your network &middot; ${connected} here now</p>
  <section class="card">
    <h2>Play</h2>
    <p>Opens the game, connected to this server. The game starts as soon as a second person joins; anyone else watches.</p>
    <a class="button" href="${escapeHtml(play)}">Play Rally</a>
  </section>
  <section class="card">
    <h2>Server address</h2>
    <p><code>${escapeHtml(a.ws)}</code></p>
    <p class="muted">If you play from a home-screen app on iPhone or iPad, enter this address in the game; home-screen apps don't share settings with Safari.</p>
  </section>
  <section class="card">
    <h2>Other devices</h2>
    <ol>
      <li>Join the same Wi-Fi or hotspot as this server.</li>
      <li>Open <code>${escapeHtml(a.origin)}/</code> in the browser.</li>
      <li>Accept the certificate warning (the server makes its own, because it's on your local network).</li>
      <li>Tap <strong>Play Rally</strong>.</li>
    </ol>
  </section>
</main>
</body>
</html>`;
}
