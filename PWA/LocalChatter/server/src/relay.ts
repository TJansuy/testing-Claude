// The WebSocket relay on /ws: forwards every message to everyone else connected
// right now, then drops it. No history; contents are never logged.
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { clean, MAX_BUFFERED, MAX_BYTES, MAX_NAME, MAX_PEERS, ROOM_NAME } from './config';
import { sanitiseGame } from './game';
import { sanitisePoll } from './poll';
import { Peer, publicPeer, sanitiseChat, sanitiseNotice } from './sanitise';

interface Connection extends Peer { alive: boolean }
const peers = new Map<WebSocket, Connection>();

export const connectedCount = (): number => peers.size;

function sendTo(ws: WebSocket, obj: object | string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED) { ws.terminate(); return; }
  ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

function broadcast(obj: object, except?: WebSocket): void {
  const data = JSON.stringify(obj); // serialise once, send to everyone
  for (const [ws, p] of peers) if (ws !== except && p.name) sendTo(ws, data);
}

function log(): void {
  // Only counts are logged: never names or message contents.
  console.log(`${new Date().toISOString()} ${[...peers.values()].filter((p) => p.name).length} connected`);
}

function onMessage(ws: WebSocket, peer: Connection, raw: Buffer): void {
  let msg: unknown;
  try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
  const m = msg as Record<string, unknown>;

  if (m.type === 'hello' && !peer.name) {
    peer.name = clean(m.name, MAX_NAME) || 'Guest';
    const others = [...peers.values()].filter((p) => p !== peer && p.name).map(publicPeer);
    sendTo(ws, { type: 'welcome', you: publicPeer(peer), room: ROOM_NAME, peers: others, maxBytes: MAX_BYTES });
    broadcast({ type: 'join', peer: publicPeer(peer) }, ws);
    log();
    return;
  }
  if (!peer.name) return; // must say hello first

  switch (m.type) {
    case 'rename': {
      const name = clean(m.name, MAX_NAME);
      if (name && name !== peer.name) {
        peer.name = name;
        broadcast({ type: 'rename', peer: publicPeer(peer) });
      }
      return;
    }
    case 'chat': {
      const out = sanitiseChat(m, peer);
      if (out) broadcast(out, ws); // forwarded, never stored
      return;
    }
    case 'game': {
      const out = sanitiseGame(m, peer);
      if (out) broadcast(out, ws);
      return;
    }
    case 'poll': {
      const out = sanitisePoll(m, peer);
      if (out) broadcast(out, ws);
      return;
    }
    case 'system':
    case 'effect':
      broadcast(sanitiseNotice(m, peer), ws);
  }
}

/** Starts the relay on an HTTP(S) server. Returns a function that stops it. */
export function startRelay(server: Server): () => void {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_BYTES });
  wss.on('connection', (ws) => {
    if (peers.size >= MAX_PEERS) { ws.close(1013, 'Room is full'); return; }
    const peer: Connection = { id: crypto.randomUUID().slice(0, 8), name: '', alive: true };
    peers.set(ws, peer);
    ws.on('pong', () => { peer.alive = true; });
    ws.on('message', (raw, isBinary) => { if (!isBinary) onMessage(ws, peer, raw as Buffer); });
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

  return () => {
    clearInterval(heartbeat);
    for (const ws of peers.keys()) ws.close(1001, 'Server shutting down');
  };
}
