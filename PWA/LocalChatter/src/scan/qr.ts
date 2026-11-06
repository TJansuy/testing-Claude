// QR codes, using the camera, so it works on iPhone and iPad too. Decodes with
// the browser's BarcodeDetector where there is one, otherwise with the bundled
// jsQR library (loaded only when needed). Whatever the code holds is sent to the chat.
import { systemLine } from '../chat/list';
import { $ } from '../dom';
import { sendChat } from '../net/connection';
import { vibrate } from '../util';

export const cameraAvailable = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const qr = {
  stream: null as MediaStream | null,
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  detector: null as BarcodeDetector | null,
  canvas: null as HTMLCanvasElement | null,
};
const dialog = $<HTMLDialogElement>('qr');
const video = $<HTMLVideoElement>('qr-video');
const qrStatus = (text: string): void => { $('qr-status').textContent = text; };

function loadJsQr(): Promise<void> {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/jsQR.js';
    sc.onload = () => resolve();
    sc.onerror = () => reject(new Error('Couldn\'t load the QR decoder.'));
    document.head.appendChild(sc);
  });
}

function getDetector(): Promise<BarcodeDetector | null> {
  if (!('BarcodeDetector' in window)) return Promise.resolve(null);
  return BarcodeDetector.getSupportedFormats()
    .then((f) => (f.indexOf('qr_code') >= 0 ? new BarcodeDetector({ formats: ['qr_code'] }) : null))
    .catch(() => null);
}

export function openQr(): void {
  if (dialog.open) return;
  qrStatus('Starting camera…');
  dialog.showModal();
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then((stream) => {
      if (!dialog.open) { stream.getTracks().forEach((t) => t.stop()); return; }
      qr.stream = stream;
      video.srcObject = stream;
      return Promise.all([video.play(), getDetector()]).then(([, detector]) => {
        qr.detector = detector;
        return detector ? undefined : loadJsQr();
      }).then(() => {
        if (qr.stream !== stream) return; // closed while starting
        qrStatus('Point the camera at a QR code.');
        scanSoon();
      });
    })
    .catch((err: Error) => {
      qrStatus(err && err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it for this site in your browser settings, then try again.'
        : err && err.name === 'NotFoundError' ? 'No camera was found.'
          : (err && err.message) || 'Couldn\'t start the camera.');
    });
}

function scanSoon(): void { qr.timer = setTimeout(scanFrame, 150); }

function decodeFrame(): Promise<string | null> {
  if (qr.detector) {
    return qr.detector.detect(video).then((codes) => (codes.length ? codes[0].rawValue : null)).catch(() => null);
  }
  // Scale down to keep decoding quick on phones.
  const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.round(video.videoWidth * k);
  const h = Math.round(video.videoHeight * k);
  const canvas = qr.canvas || (qr.canvas = document.createElement('canvas'));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(video, 0, 0, w, h);
  const code = window.jsQR ? window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' }) : null;
  return Promise.resolve(code ? code.data : null);
}

function scanFrame(): void {
  if (!qr.stream) return;
  if (video.readyState < 2 || !video.videoWidth) { scanSoon(); return; }
  void decodeFrame().then((text) => {
    if (!qr.stream) return;
    if (text && text.trim()) onQr(text);
    else scanSoon();
  });
}

function stopCamera(): void {
  clearTimeout(qr.timer);
  if (qr.stream) qr.stream.getTracks().forEach((t) => t.stop());
  qr.stream = null;
  video.srcObject = null;
}

function closeQr(): void {
  stopCamera(); // release the camera straight away, not when the close event arrives
  if (dialog.open) dialog.close();
}

function onQr(text: string): void {
  vibrate(50);
  closeQr();
  if (!sendChat({ text: text.slice(0, 4000), via: 'qr' })) systemLine('Not connected: the QR code wasn\'t sent');
}

dialog.addEventListener('close', stopCamera); // also covers Escape
$('qr-close').addEventListener('click', closeQr);
