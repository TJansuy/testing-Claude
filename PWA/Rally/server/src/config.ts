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
export const PORT = toInt(env.PORT, 8444);
/** LAN address devices should use to reach this server, e.g. 192.168.1.50.
 *  When empty, the address the device used to open the setup page is used. */
export const ADVERTISED_HOST = (env.ADVERTISED_HOST || '').trim();
/** Port devices should use (when the container port is mapped to another). */
export const ADVERTISED_PORT = toInt(env.ADVERTISED_PORT, PORT);
/** Where the Rally game is hosted. */
export const GAME_URL = env.GAME_URL || 'https://tjansuy.github.io/testing-Claude/PWA/Rally/';
/** The built server runs from dist/, so certificates default to server/certs. */
export const CERT_DIR = env.CERT_DIR || path.resolve(__dirname, '..', 'certs');
/** TLS is on by default because browsers block ws:// from HTTPS pages.
 *  TLS=off is only for local development behind something else that does TLS. */
export const USE_TLS = (env.TLS || 'on').toLowerCase() !== 'off';
