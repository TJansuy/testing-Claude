// QR codes: drawing them (qrcode-generator, bundled), and reading them with
// the camera (the browser's BarcodeDetector where there is one, otherwise the
// jsQR decoder in vendor/, loaded only when needed).
import qrcode from 'qrcode-generator';

declare global {
  interface Window { jsQR?: (data: Uint8ClampedArray, w: number, h: number, o?: object) => { data: string } | null }
  // eslint-disable-next-line no-var
  var BarcodeDetector: { new (o: { formats: string[] }): { detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>> }; getSupportedFormats(): Promise<string[]> } | undefined;
}

/** Draws text as a QR code filling the canvas (dark on light, with a quiet border). */
export function drawQr(canvas: HTMLCanvasElement, text: string): void {
  const q = qrcode(0, 'L');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), quiet = 3, cells = n + quiet * 2;
  const size = Math.max(cells * 4, Math.round(canvas.clientWidth * Math.min(2, devicePixelRatio || 1)) || 320);
  const k = Math.floor(size / cells);
  canvas.width = canvas.height = k * cells;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#111';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + quiet) * k, (y + quiet) * k, k, k);
  canvas.dataset.text = text;
}

export const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

function loadJsQr(): Promise<void> {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/jsQR.js';
    sc.onload = () => resolve();
    sc.onerror = () => reject(new Error('Couldn\'t load the QR reader.'));
    document.head.appendChild(sc);
  });
}

const dialog = document.getElementById('scanner') as HTMLDialogElement;
const video = document.getElementById('scan-video') as HTMLVideoElement;
const note = document.getElementById('scan-note') as HTMLElement;
let stream: MediaStream | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function stop(): void {
  clearTimeout(timer);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}
dialog.addEventListener('close', stop);
(document.getElementById('scan-close') as HTMLElement).addEventListener('click', () => dialog.close());

/** Opens the camera and calls found() with the first QR code it sees that accept() likes. */
export function scan(title: string, accept: (text: string) => boolean, found: (text: string) => void): void {
  (document.getElementById('scan-title') as HTMLElement).textContent = title;
  note.textContent = 'Starting the camera…';
  dialog.showModal();
  const canvas = document.createElement('canvas');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(async (s) => {
    if (!dialog.open) { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s;
    video.srcObject = s;
    await video.play();
    let detector: { detect(src: CanvasImageSource): Promise<Array<{ rawValue: string }>> } | null = null;
    if (window.BarcodeDetector) {
      const formats = await window.BarcodeDetector.getSupportedFormats().catch(() => [] as string[]);
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
    if (!detector) await loadJsQr();
    note.textContent = 'Point the camera at the code on the other screen.';
    const frame = async (): Promise<void> => {
      if (stream !== s) return;
      let text: string | null = null;
      if (video.readyState >= 2 && video.videoWidth) {
        if (detector) text = (await detector.detect(video).catch(() => []))[0]?.rawValue || null;
        else {
          const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
          const g = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
          g.drawImage(video, 0, 0, canvas.width, canvas.height);
          text = window.jsQR?.(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data || null;
        }
      }
      if (text && accept(text)) { dialog.close(); found(text); return; }
      if (text) note.textContent = 'That\'s not the right code. Point the camera at the code on the other player\'s screen.';
      timer = setTimeout(() => void frame(), 150);
    };
    void frame();
  }).catch((e: Error) => {
    note.textContent = e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it for this page, or copy and paste the code instead.'
      : e.name === 'NotFoundError' ? 'No camera was found. Copy and paste the code instead.' : e.message || 'Couldn\'t start the camera.';
  });
}
