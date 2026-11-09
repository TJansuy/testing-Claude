// The setup page devices open to accept the certificate and point their app here.
import type { IncomingMessage } from 'node:http';
import { ADVERTISED_HOST, ADVERTISED_PORT, APP_URL, PORT, ROOM_NAME, USE_TLS } from './config';

export interface RelayAddress { origin: string; ws: string }

export function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

/** Address devices should connect to: env override, else the Host header the device used. */
export function relayFor(req: IncomingMessage): RelayAddress {
  const http = USE_TLS ? 'https' : 'http';
  const ws = USE_TLS ? 'wss' : 'ws';
  if (ADVERTISED_HOST) {
    const host = ADVERTISED_HOST.includes(':') && !ADVERTISED_HOST.startsWith('[') ? `[${ADVERTISED_HOST}]` : ADVERTISED_HOST;
    return { origin: `${http}://${host}:${ADVERTISED_PORT}`, ws: `${ws}://${host}:${ADVERTISED_PORT}/ws` };
  }
  let host = String(req.headers.host || '');
  if (!/^[A-Za-z0-9.\-:[\]]{1,255}$/.test(host)) host = `localhost:${PORT}`;
  return { origin: `${http}://${host}`, ws: `${ws}://${host}/ws` };
}

function setupUrl(relayWs: string, display = false): string {
  return `${APP_URL}${display ? 'Display/' : ''}#relay=${encodeURIComponent(relayWs)}`;
}

const STYLE = `
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
  .button.secondary { background:transparent; color:var(--accent); box-shadow:inset 0 0 0 2px var(--accent); }
  ol { margin:0; padding-left:20px; }
  li { margin-bottom:6px; }`;

export function setupPage(r: RelayAddress, connected: number): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LocalChatter Server</title>
<style>${STYLE}
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(ROOM_NAME)}</h1>
  <p class="muted">LocalChatter relay server &middot; ${connected} connected &middot; no history is kept</p>

  <section class="card">
    <h2>Set up this device</h2>
    <p>Tap the button to open LocalChatter and point it at this server.</p>
    <a class="button" href="${escapeHtml(setupUrl(r.ws))}">Set up LocalChatter</a>
  </section>

  <section class="card">
    <h2>Set up a display</h2>
    <p>For a TV, tablet or spare screen: it plays effects and sounds from the chat, and never shows messages.</p>
    <a class="button secondary" href="${escapeHtml(setupUrl(r.ws, true))}">Set up as a display</a>
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
