// Browser features TypeScript's DOM types don't include (yet), and the bundled QR library.

interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  encoding?: string;
  data?: DataView;
  toRecords?(): NDEFRecord[];
}
interface NDEFReadingEvent extends Event {
  serialNumber?: string;
  message?: { records: NDEFRecord[] };
}
declare class NDEFReader {
  onreading: ((event: NDEFReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
  scan(options?: { signal?: AbortSignal }): Promise<void>;
}

interface DetectedBarcode { rawValue: string }
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface JsQrResult { data: string }
type JsQr = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: string }) => JsQrResult | null;

/** When this build was made (set by the build). */
declare const __BUILD_TIME__: string;

interface WakeLock { request(type: 'screen'): Promise<unknown> }

interface Window {
  jsQR?: JsQr;
  webkitAudioContext?: typeof AudioContext;
  LocalChatterFX?: unknown;
}
interface Navigator { wakeLock?: WakeLock }
