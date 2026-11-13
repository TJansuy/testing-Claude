// @ts-check
// YouTube cast receiver sidecar for SteamCast.
//
// yt-cast-receiver answers the YouTube app's DIAL discovery and talks to
// YouTube's "lounge" servers; this file turns its Player callbacks into JSON
// lines on stdout for the Python app (which drives mpv), and reads mpv's state
// back as JSON lines on stdin. Logs go to stderr.
//
// Environment: STEAMCAST_NAME, STEAMCAST_DIAL_PORT, STEAMCAST_DATA (a JSON
// file for pairing data), STEAMCAST_LOG_LEVEL (error|warn|info|debug).
import readline from 'node:readline';
import YouTubeCastReceiver, { PLAYER_STATUSES } from 'yt-cast-receiver';
import { JsonFileStore, MpvPlayer, send } from './bridge.mjs';

// stdout carries the JSON protocol: send every console log to stderr.
console.log = console.info = console.debug = (...args) => console.error(...args);

const NAME = process.env.STEAMCAST_NAME || 'SteamCast';
const PORT = Number(process.env.STEAMCAST_DIAL_PORT || 8091);
const DATA = process.env.STEAMCAST_DATA || '';
const LOG_LEVEL = /** @type {any} */ (process.env.STEAMCAST_LOG_LEVEL || 'warn');

const player = new MpvPlayer();
const receiver = new YouTubeCastReceiver(player, {
  device: { name: NAME, screenName: NAME, brand: 'SteamThings', model: 'SteamCast' },
  dial: { port: PORT },
  dataStore: new JsonFileStore(DATA),
  logLevel: LOG_LEVEL,
});

receiver.on('senderConnect', (sender) => send({ event: 'connected', name: sender.user?.name || sender.name }));
receiver.on('senderDisconnect', (sender) => send({ event: 'disconnected', name: sender.user?.name || sender.name }));
receiver.on('error', (error) => send({ event: 'error', message: String(error?.message || error) }));
receiver.on('terminate', (error) => {
  send({ event: 'error', message: `receiver stopped: ${error?.message || error}` });
  process.exit(1);
});

const pairing = receiver.getPairingCodeRequestService();
pairing.on('response', (code) => send({ event: 'pairing', code }));
pairing.on('error', (error) => send({ event: 'error', message: `TV code unavailable: ${error?.message || error}` }));

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  /** @type {any} */
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const work = msg.event === 'ended' ? player.ended()
    : msg.event === 'interrupted' ? player.notifyExternalStateChange(PLAYER_STATUSES.STOPPED)
      : msg.state ? player.update(msg.state) : Promise.resolve();
  work.catch((error) => console.error('[steamcast] player update failed:', error));
}).on('close', async () => {
  // Python went away: leave the lounge cleanly so phones don't see a ghost TV.
  pairing.stop();
  await receiver.stop().catch(() => {});
  process.exit(0);
});

try {
  await receiver.start();
  pairing.start();
  send({ event: 'ready', port: PORT });
} catch (error) {
  send({ event: 'error', message: `could not start: ${error instanceof Error ? error.message : error}` });
  process.exit(1);
}
