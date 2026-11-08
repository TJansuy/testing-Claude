// Playing sounds, and deciding where a received sound plays from.
import type { SoundRef } from '../types';
import { base64ToBlob } from '../util';
import { get, put, SoundEntry } from './db';
import { addBlob, guessType, safeUrl } from './library';

let ctx: AudioContext | null = null;
const playing = new Set<AudioBufferSourceNode | HTMLAudioElement>();
let unlockedOnce = false;

function audioContext(): AudioContext | null {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!ctx && AC) ctx = new AC();
  return ctx;
}

/** Browsers only allow sound after the user has touched the page; call this from a tap. */
export function unlock(): void {
  const c = audioContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  if (c && !unlockedOnce) {
    // A silent blip fully unlocks audio on iOS.
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start(0);
    unlockedOnce = true;
  }
}
export function unlocked(): boolean { const c = audioContext(); return !!c && c.state === 'running'; }

function playElement(src: string): Promise<void> {
  const a = new Audio(src);
  playing.add(a);
  a.addEventListener('ended', () => playing.delete(a));
  return a.play().catch((err: Error) => { playing.delete(a); throw err; });
}

function playBlob(blob: Blob): Promise<void> {
  const c = audioContext();
  // Not unlocked yet: an audio element may still be allowed (desktop browsers).
  if (!c || c.state !== 'running') return playElement(URL.createObjectURL(blob));
  return blob.arrayBuffer().then((buf) => c.decodeAudioData(buf)).then((audio) => {
    const src = c.createBufferSource();
    src.buffer = audio;
    src.connect(c.destination);
    playing.add(src);
    src.onended = () => playing.delete(src);
    src.start();
  }).catch((err: Error) => {
    if (err && err.name === 'NotAllowedError') throw err;
    // Format Web Audio can't decode: let the browser's audio element try.
    return playElement(URL.createObjectURL(blob));
  });
}

export function stopAll(): void {
  playing.forEach((p) => {
    try { if (p instanceof HTMLAudioElement) p.pause(); else p.stop(); } catch { /* already stopped */ }
  });
  playing.clear();
}

/** Plays a library/cached entry (from its audio, or from its link if it's link-only). */
export function playEntry(entry: SoundEntry): Promise<void> {
  entry.usedAt = Date.now();
  put(entry).catch(() => {});
  return entry.blob ? playBlob(entry.blob) : playElement(entry.url);
}

export type SoundSource = 'cache' | 'message' | 'link' | 'none';
/** How to play a received sound, plus its audio (or link) so it can be saved. */
export interface Resolved { source: SoundSource; play: (() => Promise<void>) | null; blob?: Blob | null; url?: string }

/** Works out how to play a received sound: from the cache, then from the audio in
 *  the message, then from its link. Audio from a message is cached for next time. */
export function resolve(sound: SoundRef): Promise<Resolved> {
  return get(String(sound.id || '')).catch(() => undefined).then((hit) => {
    if (hit && (hit.blob || hit.url)) return { source: 'cache' as const, play: () => playEntry(hit), blob: hit.blob, url: hit.url };
    if (sound.data) {
      let blob: Blob | null;
      try { blob = base64ToBlob(sound.data, /^audio\//.test(sound.type || '') ? sound.type as string : guessType(sound.name)); } catch { blob = null; }
      if (blob) {
        const b = blob;
        // Cached under the hash of the audio actually received, so a message can't
        // overwrite another sound by claiming its id.
        return addBlob(b, sound.name, 'received', sound.url).catch(() => null)
          .then(() => ({ source: 'message' as const, play: () => playBlob(b), blob: b, url: safeUrl(sound.url) }));
      }
    }
    const url = safeUrl(sound.url);
    if (url) return { source: 'link' as const, play: () => playElement(url), url };
    return { source: 'none' as const, play: null };
  });
}
