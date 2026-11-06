// HTTP(S) requests: the setup page, /config.json and /health.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_BYTES, ROOM_NAME } from './config';
import { connectedCount } from './relay';
import { relayFor, setupPage } from './setup-page';

function send(res: ServerResponse, status: number, type: string, body: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  });
  res.end(body);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // Lets public HTTPS pages (e.g. GitHub Pages) reach this private-network server in Chromium.
  'Access-Control-Allow-Private-Network': 'true',
};

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '', CORS);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Method not allowed');

  if (url.pathname === '/health') return send(res, 200, 'text/plain', 'ok', CORS);
  if (url.pathname === '/config.json') {
    return send(res, 200, 'application/json', JSON.stringify({
      app: 'LocalChatter', room: ROOM_NAME, relay: relayFor(req).ws, online: connectedCount(), maxBytes: MAX_BYTES,
    }), CORS);
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return send(res, 200, 'text/html; charset=utf-8', setupPage(relayFor(req), connectedCount()), {
      'Content-Security-Policy': 'default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'',
    });
  }
  send(res, 404, 'text/plain', 'Not found');
}
