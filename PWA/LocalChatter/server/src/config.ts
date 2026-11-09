// Configuration, from environment variables.
import path from 'node:path';

export function toInt(v: string | undefined, d: number): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}
/** Strips control characters, trims and limits length. Non-strings become ''. */
export function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

const env = process.env;
export const PORT = toInt(env.PORT, 8443);
/** LAN address devices should use to reach this server, e.g. 192.168.1.50.
 *  When empty, the address the device used to open the setup page is used. */
export const ADVERTISED_HOST = (env.ADVERTISED_HOST || '').trim();
/** Port devices should use (when the container port is mapped to another). */
export const ADVERTISED_PORT = toInt(env.ADVERTISED_PORT, PORT);
/** Where the LocalChatter app is hosted. */
export const APP_URL = env.APP_URL || 'https://tjansuy.github.io/testing-Claude/PWA/LocalChatter/';
/** Where the Rally tennis game is hosted (by default, beside LocalChatter). */
export const RALLY_URL = env.RALLY_URL || new URL('../Rally/', APP_URL).href;
export const ROOM_NAME = clean(env.ROOM_NAME, 60) || 'LocalChatter';
/** Largest single WebSocket message, in megabytes (files are sent base64-encoded). */
export const MAX_MESSAGE_MB = Math.max(1, toInt(env.MAX_MESSAGE_MB, 25));
export const MAX_PEERS = Math.max(2, toInt(env.MAX_PEERS, 200));
/** The built server runs from dist/, so certificates default to server/certs. */
export const CERT_DIR = env.CERT_DIR || path.resolve(__dirname, '..', 'certs');
/** TLS is on by default because browsers block ws:// from HTTPS pages.
 *  TLS=off is only for local development behind something else that does TLS. */
export const USE_TLS = (env.TLS || 'on').toLowerCase() !== 'off';

export const MAX_BYTES = MAX_MESSAGE_MB * 1024 * 1024;
export const MAX_TEXT = 4000;
export const MAX_NAME = 32;
/** Drop clients that can't keep up. */
export const MAX_BUFFERED = 4 * MAX_BYTES;
