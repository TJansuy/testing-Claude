// WebSocket endpoints share the one HTTP(S) server: /ws (LocalChatter's chat
// relay) and /rally (the Rally tennis game). Upgrades are routed by path.
import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';

const routes = new Map<string, WebSocketServer>();

export function route(path: string, wss: WebSocketServer): void {
  routes.set(path, wss);
}

export function attachUpgrades(server: Server): void {
  server.on('upgrade', (req, socket, head) => {
    const wss = routes.get(new URL(req.url || '/', 'http://x').pathname);
    if (!wss) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}
