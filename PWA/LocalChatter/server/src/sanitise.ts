// Rebuilds client messages from known fields only, so clients can't inject
// anything else. The relay doesn't interpret them: roles, whispers, languages
// and effects are all decided by each app.
import crypto from 'node:crypto';
import { clean, MAX_NAME, MAX_TEXT } from './config';

export interface Peer { id: string; name: string }
type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const BASE64 = /^[A-Za-z0-9+/=]*$/;

export const publicPeer = (p: Peer): Peer => ({ id: p.id, name: p.name });

export function sanitiseChat(msg: Json, from: Peer): Json | null {
  const out: Json = { type: 'chat', id: clean(msg.id, 64) || crypto.randomUUID(), from: publicPeer(from), at: Date.now() };
  const text = typeof msg.text === 'string' ? msg.text.slice(0, MAX_TEXT) : '';
  if (text.trim()) out.text = text;
  if (msg.via === 'nfc' || msg.via === 'qr') out.via = msg.via; // sent by scanning an NFC tag or QR code
  // The language it's written in.
  const lang = clean(msg.lang, 24);
  if (lang) out.lang = lang;
  // "Send as" (admin debug mode in the app).
  if (isObject(msg.as)) {
    const as = { id: clean(msg.as.id, 64), name: clean(msg.as.name, MAX_NAME) };
    if (as.id && as.name) out.as = as;
  }
  // Whisper recipients. A whisper without valid recipients is dropped, never sent as public.
  if (msg.to !== undefined) {
    const to = Array.isArray(msg.to) ? msg.to.slice(0, 50).filter(isObject)
      .map((t) => ({ id: clean(t.id, 64), name: clean(t.name, MAX_NAME) }))
      .filter((t) => t.id && t.name) : [];
    if (!to.length) return null;
    out.to = to;
  }
  // Sound: a hash id and name, plus optionally a link and/or the audio itself.
  const snd = msg.sound;
  if (isObject(snd) && typeof snd.id === 'string' && /^[\w-]{1,80}$/.test(snd.id)) {
    const sound: Json = { id: snd.id, name: clean(snd.name, 60) || 'sound' };
    if (typeof snd.type === 'string' && /^audio\/[\w.+-]+$/.test(snd.type)) sound.type = snd.type.slice(0, 60);
    if (typeof snd.url === 'string' && /^https?:\/\//i.test(snd.url)) sound.url = snd.url.slice(0, 2000);
    if (typeof snd.data === 'string' && BASE64.test(snd.data)) sound.data = snd.data;
    out.sound = sound;
  }
  const f = msg.file;
  if (isObject(f) && typeof f.data === 'string' && BASE64.test(f.data)) {
    out.file = {
      name: clean(f.name, 200) || 'file',
      type: typeof f.type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(f.type) ? f.type.slice(0, 100) : 'application/octet-stream',
      size: Math.floor(f.data.length * 3 / 4),
      data: f.data,
    };
  }
  return out.text || out.file || out.sound ? out : null;
}

/** Small app-level notices (role changes, targeted effects, debug mode). */
export function sanitiseNotice(msg: Json, from: Peer): Json {
  const out: Json = { type: msg.type, from: publicPeer(from), at: Date.now() };
  for (const k of ['kind', 'name', 'to', 'role', 'old']) {
    if (typeof msg[k] === 'string') out[k] = clean(msg[k], 64);
  }
  if (typeof msg.on === 'boolean') out.on = msg.on;
  return out;
}
