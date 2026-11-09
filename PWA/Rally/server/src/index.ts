// The Rally server: a small server on your local network for the Rally game.
//
// - Serves a page over HTTPS that devices open once, to accept its
//   certificate, with a button that opens the game connected here.
// - Accepts WebSocket connections on /rally: pairs the first two people as
//   players, starts a game as soon as there are two, and passes their
//   messages between them. Everyone else watches. No game state is kept here.
import http from 'node:http';
import https from 'node:https';
import { ADVERTISED_HOST, ADVERTISED_PORT, GAME_URL, PORT, USE_TLS } from './config';
import { addressFor, page } from './page';
import { playing, rallyServer } from './rally';
import { loadTls } from './tls';

function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
  const path = new URL(req.url || '/', 'http://x').pathname;
  const send = (status: number, type: string, body: string, extra: Record<string, string> = {}): void => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed');
  if (path === '/health') return send(200, 'text/plain', 'ok');
  if (path === '/' || path === '/index.html') {
    return send(200, 'text/html; charset=utf-8', page(addressFor(req), playing()), {
      'Content-Security-Policy': 'default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'',
    });
  }
  send(404, 'text/plain', 'Not found');
}

const server = USE_TLS ? https.createServer(loadTls(), handle) : http.createServer(handle);
const stop = rallyServer(server);

server.listen(PORT, () => {
  console.log(`Rally server listening on port ${PORT}`);
  console.log(`Open: ${USE_TLS ? 'https' : 'http'}://${ADVERTISED_HOST || '<this-machine-lan-ip>'}:${ADVERTISED_PORT}/`);
  console.log(`Game: ${GAME_URL}`);
});

function shutdown(): void {
  stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
