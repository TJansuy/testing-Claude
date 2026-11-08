// Voice messages: record from the microphone, review, then send or save.
// The mic button takes the Send button's place while the message box is empty.
// A recording is sent as a sound message with its audio included, so every
// device can play it (and cache it, replay it, save it or download it).
import { systemLine } from '../chat/list';
import { $, button, input } from '../dom';
import { sendChat } from '../net/connection';
import { addBlob, toMessage } from '../sounds/library';
import { state } from '../state';
import { refreshSoundboard } from './soundboard';

const MAX_MS = 2 * 60 * 1000;
// AAC in MP4 plays everywhere (including iPhone); otherwise WebM/Opus.
const TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
export const voiceSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof MediaRecorder !== 'undefined';

const panel = $('voice');
const recView = $('voice-recording');
const reviewView = $('voice-review');
const mic = button('mic');
const send = button('send');
const text = $<HTMLTextAreaElement>('text');
const audio = $<HTMLAudioElement>('voice-audio');
const nameBox = input('voice-name');
const voiceStatus = (t: string): void => { $('voice-status').textContent = t; };

interface Recording {
  recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; discard: boolean;
  tick?: ReturnType<typeof setInterval>; meter?: number; ctx?: AudioContext;
}
let rec: Recording | null = null;
let clip: { blob: Blob; ms: number; url: string } | null = null;

const clock = (ms: number): string => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/** The mic shows instead of Send while there's nothing typed. */
export function syncMic(): void {
  const empty = !text.value.trim();
  const showMic = voiceSupported && empty && panel.hidden;
  mic.hidden = !showMic;
  // While recording or reviewing, the recorder's own buttons do the sending.
  send.hidden = showMic || (!panel.hidden && empty);
}

function show(view: 'recording' | 'review' | null): void {
  panel.hidden = !view;
  recView.hidden = view !== 'recording';
  reviewView.hidden = view !== 'review';
  syncMic();
}

function stopTracks(r: Recording): void {
  clearInterval(r.tick);
  if (r.meter) cancelAnimationFrame(r.meter);
  r.stream.getTracks().forEach((t) => t.stop());
  if (r.ctx) r.ctx.close().catch(() => {});
}

/** A level meter, so you can see it's hearing you. */
function startMeter(r: Recording): void {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(r.stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const bar = $('voice-level');
  const draw = (): void => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    bar.style.transform = 'scaleX(' + Math.min(1, Math.sqrt(sum / data.length) * 4).toFixed(3) + ')';
    r.meter = requestAnimationFrame(draw);
  };
  r.ctx = ctx;
  draw();
}

function startRecording(): void {
  if (rec) return;
  discardClip();
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((stream) => {
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    const r: Recording = { recorder, stream, chunks: [], started: Date.now(), discard: false };
    rec = r;
    recorder.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
    recorder.onstop = () => {
      stopTracks(r);
      rec = null;
      if (r.discard || !r.chunks.length) { show(null); return; }
      const blob = new Blob(r.chunks, { type: (recorder.mimeType || type || 'audio/webm').split(';')[0] });
      review(blob, Date.now() - r.started);
    };
    recorder.start(250);
    $('voice-time').textContent = '0:00';
    r.tick = setInterval(() => {
      const ms = Date.now() - r.started;
      $('voice-time').textContent = clock(ms) + ' / ' + clock(MAX_MS);
      if (ms >= MAX_MS) recorder.stop(); // long enough
    }, 250);
    startMeter(r);
    show('recording');
  }).catch((err: Error) => {
    systemLine(err && err.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it for this site in your browser settings, then try again.'
      : err && err.name === 'NotFoundError' ? 'No microphone was found.' : 'Couldn\'t start recording: ' + ((err && err.message) || 'unknown error'));
  });
}

function review(blob: Blob, ms: number): void {
  clip = { blob, ms, url: URL.createObjectURL(blob) };
  audio.src = clip.url;
  nameBox.value = 'Voice message (' + clock(ms) + ')';
  voiceStatus('');
  button('voice-save').disabled = false;
  show('review');
}

function discardClip(): void {
  if (clip) URL.revokeObjectURL(clip.url);
  clip = null;
  audio.removeAttribute('src');
}

const clipName = (): string => nameBox.value.trim() || 'Voice message (' + clock(clip ? clip.ms : 0) + ')';

function sendClip(): void {
  if (!clip) return;
  const c = clip;
  // Cached here too, so your own message plays (and replays) from this device.
  addBlob(c.blob, clipName(), 'received').then((entry) => toMessage(entry, true, state.maxBytes)).then((sound) => {
    if (!sound.data) { voiceStatus('That recording is too long to send.'); return; }
    if (!sendChat({ sound })) { voiceStatus('Not connected: not sent yet.'); return; }
    audio.pause();
    discardClip();
    show(null);
  }, (err: Error) => voiceStatus(err.message));
}

function saveClip(): void {
  if (!clip) return;
  addBlob(clip.blob, clipName(), 'library').then((e) => {
    voiceStatus('Saved to your sounds as “' + e.name + '”. Play it any time with /sound ' + e.name + '.');
    button('voice-save').disabled = true;
    void refreshSoundboard();
  }, (err: Error) => voiceStatus(err.message));
}

mic.addEventListener('click', startRecording);
$('voice-stop').addEventListener('click', () => { if (rec) rec.recorder.stop(); });
$('voice-cancel').addEventListener('click', () => { if (rec) { rec.discard = true; rec.recorder.stop(); } });
$('voice-send').addEventListener('click', sendClip);
$('voice-save').addEventListener('click', saveClip);
$('voice-again').addEventListener('click', () => { audio.pause(); startRecording(); });
$('voice-discard').addEventListener('click', () => { audio.pause(); discardClip(); show(null); });
text.addEventListener('input', syncMic);
document.addEventListener('localchatter:library', () => { void refreshSoundboard(); });
syncMic();
