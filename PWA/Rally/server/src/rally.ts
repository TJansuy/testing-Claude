// The game on /rally: pairs players and passes their messages on. The first two people in are the players; a game
// starts as soon as there are two, and anyone else watches. The left player's
// device runs the physics and sends the game's state; the right player's
// device sends its racket. The server keeps no game state: it only knows who
// is playing, and checks the shape of what it forwards.
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { clean } from './config';

interface Client { ws: WebSocket; name: string; side: -1 | 0 | 1; alive: boolean }
const clients = new Set<Client>();
const MAX_CLIENTS = 32;
const MAX_STATE = 64;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (v: number): number => Math.round(v * 10000) / 10000;

function send(c: Client, obj: object): void {
  if (c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 1 << 20) c.ws.send(JSON.stringify(obj));
}
const player = (side: 0 | 1): Client | undefined => [...clients].find((c) => c.side === side);
const names = (): [string, string] => [player(0)?.name || '', player(1)?.name || ''];
const ready = (): boolean => !!player(0) && !!player(1);

/** Tells everyone who's playing and watching (and each client its own side). */
function lobby(): void {
  const watching = [...clients].filter((c) => c.side === -1 && c.name).map((c) => c.name);
  for (const c of clients) if (c.name) send(c, { t: 'lobby', side: c.side, names: names(), watching });
}

function start(): void {
  const seed = Math.floor(Math.random() * 2 ** 31);
  for (const c of clients) if (c.name) send(c, { t: 'start', names: names(), seed });
}

/** Fills empty sides from the people watching; the left side always runs the game. */
function fill(): void {
  const right = player(1);
  if (!player(0) && right) right.side = 0;
  for (const side of [0, 1] as const) {
    if (player(side)) continue;
    const next = [...clients].find((c) => c.side === -1 && c.name);
    if (next) next.side = side;
  }
}

function onMessage(c: Client, raw: Buffer): void {
  if (raw.length > 4096) return;
  let m: Record<string, unknown>;
  try { m = JSON.parse(raw.toString('utf8')) as Record<string, unknown>; } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join' && !c.name) {
    c.name = clean(m.name, 24) || 'Player';
    const wasReady = ready();
    fill();
    lobby();
    if (!wasReady && ready()) start();
    else if (ready()) send(c, { t: 'start', names: names(), seed: 0, watching: true });
    return;
  }
  if (!c.name) return;
  // The right player's racket, for the left player's device.
  if (m.t === 'in' && c.side === 1 && finite(m.x) && finite(m.y) && finite(m.tilt)) {
    const host = player(0);
    if (host) send(host, { t: 'in', x: round(m.x), y: round(m.y), tilt: round(m.tilt) });
    return;
  }
  // The game's state, from the left player's device, for everyone else.
  if (m.t === 'st' && c.side === 0 && Array.isArray(m.s) && m.s.length <= MAX_STATE && m.s.every(finite)) {
    const out = JSON.stringify({ t: 'st', s: (m.s as number[]).map(round), e: Number.isInteger(m.e) ? m.e : 0 });
    for (const o of clients) if (o !== c && o.name && o.ws.readyState === WebSocket.OPEN && o.ws.bufferedAmount < 1 << 20) o.ws.send(out);
  }
}

export const playing = (): number => [...clients].filter((c) => c.name).length;

export function rallyServer(server: Server): () => void {
  const wss = new WebSocketServer({ server, path: '/rally', maxPayload: 4096 });
  wss.on('connection', (ws) => {
    if (clients.size >= MAX_CLIENTS) { ws.close(1013, 'Too many people'); return; }
    const c: Client = { ws, name: '', side: -1, alive: true };
    clients.add(c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (raw, binary) => { if (!binary) onMessage(c, raw as Buffer); });
    ws.on('close', () => {
      const wasPlaying = c.side !== -1 && ready();
      clients.delete(c);
      if (!c.name) return;
      if (wasPlaying) for (const o of clients) if (o.name) send(o, { t: 'stop', why: c.name + ' left' });
      fill();
      lobby();
      if (wasPlaying && ready()) start();
    });
    ws.on('error', () => {});
  });
  const heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, 15000);
  return () => { clearInterval(heartbeat); for (const c of clients) c.ws.close(1001, 'Server shutting down'); };
}
