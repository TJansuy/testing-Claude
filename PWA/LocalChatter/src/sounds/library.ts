// The sound library: adding files and links, listing, renaming, and building
// the "sound" part of chat messages.
import type { SoundRef } from '../types';
import { all, del, get, put, SoundEntry } from './db';

const MAX_RECEIVED = 40;
export const MAX_SOUND_BYTES = 10 * 1024 * 1024;

function hex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return out;
}
/** SHA-256 where available (https/localhost); a simple FNV-1a fallback elsewhere (e.g. file://). */
function hashBytes(buf: ArrayBuffer): Promise<string> {
  if (window.crypto && crypto.subtle) {
    return crypto.subtle.digest('SHA-256', buf).then((d) => 'sha256-' + hex(new Uint8Array(d)).slice(0, 40));
  }
  const b = new Uint8Array(buf);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ b.length;
  for (let i = 0; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 16777619); h2 = Math.imul(h2 ^ b[i], 2246822519); }
  return Promise.resolve('fnv-' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + '-' + b.length);
}
const hashText = (s: string): Promise<string> => hashBytes(new TextEncoder().encode(s).buffer as ArrayBuffer);

function cleanName(name: string | undefined): string {
  return String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) || 'sound';
}
function isAudioType(type: string, name: string): boolean {
  return /^audio\//.test(type || '') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(name || '');
}
export function guessType(name: string | undefined): string {
  const ext = ((/\.([a-z0-9]+)$/i.exec(name || '') || [])[1] || '').toLowerCase();
  const types: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm' };
  return types[ext] || 'audio/mpeg';
}
export function safeUrl(u: string | undefined): string {
  try { const x = new URL(String(u), location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Adds audio you have (a file, or bytes downloaded from a link) to the cache. */
export function addBlob(blob: Blob, name: string, source: SoundEntry['source'], url?: string): Promise<SoundEntry> {
  if (blob.size > MAX_SOUND_BYTES) return Promise.reject(new Error('"' + name + '" is over ' + (MAX_SOUND_BYTES >> 20) + ' MB.'));
  return blob.arrayBuffer().then(hashBytes).then((id) => get(id).then((old) => {
    const entry: SoundEntry = {
      id,
      name: source === 'library' || !old ? cleanName(name) : old.name,
      type: blob.type || guessType(name),
      size: blob.size,
      blob,
      url: safeUrl(url) || (old && old.url) || '',
      // Never downgrade a library sound to "received".
      source: old && old.source === 'library' ? 'library' : source,
      addedAt: old ? old.addedAt : Date.now(),
      usedAt: Date.now(),
    };
    return put(entry).then(() => (source === 'received' ? trimReceived() : undefined)).then(() => entry);
  }));
}

export function addFile(file: File): Promise<SoundEntry> {
  if (!isAudioType(file.type, file.name)) return Promise.reject(new Error('"' + file.name + '" isn\'t an audio file.'));
  return addBlob(file, file.name, 'library');
}

/** Downloads and caches a sound from a link. Many sites don't allow other sites to
 *  download their files; then it's saved as a link only, played straight from the site. */
export function addFromUrl(url: string, name?: string): Promise<SoundEntry & { cached: boolean }> {
  const href = safeUrl(url);
  if (!href) return Promise.reject(new Error('Enter a link starting with https:// or http://'));
  const fallbackName = cleanName(name || decodeURIComponent(href.split(/[?#]/)[0].split('/').pop() || 'sound'));
  return fetch(href, { mode: 'cors' }).then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.blob();
  }).then((blob) => {
    if (!isAudioType(blob.type, href)) throw new Error('not audio');
    const typed = /^audio\//.test(blob.type) ? blob : new Blob([blob], { type: guessType(href) });
    return addBlob(typed, name || fallbackName, 'library', href).then((e) => ({ ...e, cached: true }));
  }).catch((err: Error) => {
    if (/not audio/.test(err.message)) throw new Error('That link isn\'t an audio file.');
    // Couldn't download it (offline, or the site blocks it): keep it as a link.
    return hashText(href).then((h) => {
      const entry: SoundEntry = { id: 'url-' + h, name: fallbackName, type: guessType(href), size: 0, blob: null, url: href, source: 'library', addedAt: Date.now(), usedAt: Date.now(), linkOnly: true };
      return put(entry).then(() => ({ ...entry, cached: false }));
    });
  });
}

function trimReceived(): Promise<unknown> {
  return all().then((list) => {
    const received = list.filter((e) => e.source === 'received').sort((a, b) => b.usedAt - a.usedAt);
    return Promise.all(received.slice(MAX_RECEIVED).map((e) => del(e.id)));
  });
}

export function list(): Promise<SoundEntry[]> {
  return all().then((items) => items.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'library' ? -1 : 1;
    return a.name.localeCompare(b.name);
  }));
}
export const library = (): Promise<SoundEntry[]> => list().then((l) => l.filter((e) => e.source === 'library'));
export function findByName(name: string): Promise<SoundEntry | null> {
  const n = String(name || '').trim().toLowerCase();
  return list().then((l) => l.filter((e) => e.name.toLowerCase() === n)[0] || null);
}
export function rename(id: string, name: string): Promise<SoundEntry | null> {
  return get(id).then((e) => {
    if (!e) return null;
    e.name = cleanName(name);
    return put(e).then(() => e);
  });
}
export const remove = del;

/** Builds the "sound" part of a chat message. The audio itself is included when
 *  embed is on and it fits, so devices that don't have it can still play it. */
export function toMessage(entry: SoundEntry, embed: boolean, maxBytes: number): Promise<SoundRef> {
  const out: SoundRef = { id: entry.id, name: entry.name, type: entry.type };
  if (entry.url) out.url = entry.url;
  const room = Math.floor(((maxBytes || 25 * 1024 * 1024) - 8192) * 3 / 4);
  if (!embed || !entry.blob || entry.blob.size > room) return Promise.resolve(out);
  return blobToBase64(entry.blob).then((b64) => { out.data = b64; return out; });
}
