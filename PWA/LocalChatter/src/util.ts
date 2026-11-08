// Formatting and conversions.

export function formatSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(s: number): string {
  return s >= 60 && s % 60 === 0 ? (s / 60) + ' min' : s + ' s';
}

export function randomId(): string {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function vibrate(pattern: number | number[]): void {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* not allowed */ }
}

/** Accepts "wss://host:port/ws", "https://host:port" or a bare "host:port". */
export function normaliseRelay(value: string | null | undefined): string {
  let s = String(value || '').trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s)) s = 'wss://' + s;
  let u: URL;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol === 'https:') u.protocol = 'wss:';
  if (u.protocol === 'http:') u.protocol = 'ws:';
  if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return '';
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/ws';
  u.hash = '';
  u.search = '';
  return u.toString();
}

/** The relay's setup page, where a device accepts its certificate. */
export function serverPage(relay: string): string {
  try {
    const u = new URL(relay);
    return (u.protocol === 'ws:' ? 'http://' : 'https://') + u.host + '/';
  } catch {
    return '';
  }
}
