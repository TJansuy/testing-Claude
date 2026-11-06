// LocalChatter relay.
//
// - Serves a setup page over HTTPS that points a device's LocalChatter app at
//   this server's LAN address and port.
// - Accepts WebSocket connections on /ws and forwards every chat message to
//   everyone else who is connected right now.
//
// No history is kept: messages are forwarded and then dropped. Nothing is
// written to disk (except the TLS certificate) and message contents are never logged.
import http from 'node:http';
import https from 'node:https';
import { ADVERTISED_HOST, ADVERTISED_PORT, APP_URL, MAX_MESSAGE_MB, PORT, USE_TLS } from './config';
import { handleRequest } from './http';
import { startRelay } from './relay';
import { loadTls } from './tls';

const server = USE_TLS ? https.createServer(loadTls(), handleRequest) : http.createServer(handleRequest);
const stopRelay = startRelay(server);

server.listen(PORT, () => {
  console.log(`LocalChatter relay listening on port ${PORT}`);
  console.log(`Setup page: ${USE_TLS ? 'https' : 'http'}://${ADVERTISED_HOST || '<this-machine-lan-ip>'}:${ADVERTISED_PORT}/`);
  console.log(`App: ${APP_URL}`);
  console.log(`Max message: ${MAX_MESSAGE_MB} MB. No history is kept.`);
});

function shutdown(): void {
  stopRelay();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
