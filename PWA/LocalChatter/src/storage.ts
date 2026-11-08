// Settings kept on this device (localStorage). Reads and writes never throw:
// storage can be blocked (private modes) and the app must still work.

export const KEY = {
  relay: 'localchatter-relay',
  name: 'localchatter-name',
  displayName: 'localchatter-display-name',
  role: 'localchatter-role',
  soundOn: 'localchatter-sound-on',
  embed: 'localchatter-sound-embed',
  vibrate: 'localchatter-vibrate',
  spy: 'localchatter-spy',
  favourites: 'localchatter-favourites',
  notify: 'localchatter-notify',
  autohide: 'localchatter-autohide',
  languages: 'localchatter-languages',
  speak: 'localchatter-speak',
  device: 'localchatter-device',
} as const;

export function load(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

export function save(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(load(key)) as unknown;
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}
