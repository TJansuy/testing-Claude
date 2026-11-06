// NFC tags (Web NFC: Chrome on Android over https). Each tag read sends its
// contents to the chat. The option is hidden everywhere else.
import { systemLine } from '../chat/list';
import { $ } from '../dom';
import { sendChat } from '../net/connection';
import { formatSize, vibrate } from '../util';

export const nfcSupported = 'NDEFReader' in window;
const nfc = { abort: null as AbortController | null, last: '', lastAt: 0 };

function showNfcState(): void {
  const on = !!nfc.abort;
  const b = $('nfc');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? '📶 Stop NFC' : '📶 NFC tags';
  $('scan').classList.toggle('nfc-on', on);
}

function decodeRecord(record: NDEFRecord): string {
  const data = record.data;
  const text = (enc?: string): string => {
    try { return new TextDecoder(enc || 'utf-8').decode(data); } catch { return new TextDecoder().decode(data); }
  };
  switch (record.recordType) {
    case 'empty': return '';
    case 'text': return text(record.encoding);
    case 'url':
    case 'absolute-url': return text();
    case 'smart-poster':
      try { return (record.toRecords ? record.toRecords() : []).map(decodeRecord).filter(Boolean).join('\n'); } catch { return ''; }
    case 'mime':
      if (/^text\/|json|xml|vcard/i.test(record.mediaType || '')) return text();
      return '[' + (record.mediaType || 'binary') + ' data, ' + formatSize(data ? data.byteLength : 0) + ']';
    default: {
      if (!data) return '';
      const s = text();
      // Only show it if it decodes to readable text.
      return /[\u0000-\u0008\u000e-\u001f�]/.test(s) ? '[' + record.recordType + ' record]' : s;
    }
  }
}

function tagMessage(event: NDEFReadingEvent): string {
  const parts = (event.message ? Array.from(event.message.records).map(decodeRecord) : []).map((s) => s.trim()).filter(Boolean);
  if (parts.length) return parts.join('\n');
  return 'Empty NFC tag' + (event.serialNumber ? ' (' + event.serialNumber + ')' : '');
}

function onTag(event: NDEFReadingEvent): void {
  const text = tagMessage(event).slice(0, 4000);
  // Phones report a tag repeatedly while it's held against them; send each tag once.
  const key = (event.serialNumber || '') + '|' + text;
  const now = Date.now();
  if (key === nfc.last && now - nfc.lastAt < 4000) return;
  nfc.last = key;
  nfc.lastAt = now;
  vibrate(50);
  if (!sendChat({ text, via: 'nfc' })) systemLine('Not connected: NFC tag wasn\'t sent');
}

export function stopNfc(): void {
  if (nfc.abort) nfc.abort.abort();
  nfc.abort = null;
  if (nfcSupported) showNfcState();
}

function startNfc(): void {
  const reader = new NDEFReader();
  const ctrl = new AbortController();
  nfc.abort = ctrl;
  reader.onreading = onTag;
  reader.onreadingerror = () => systemLine('Couldn\'t read that NFC tag. Try holding it still.');
  reader.scan({ signal: ctrl.signal }).then(() => {
    if (nfc.abort !== ctrl) return;
    showNfcState();
    systemLine('Scanning for NFC tags. Hold a tag to the back of your phone.');
  }).catch((err: Error) => {
    if (nfc.abort === ctrl) nfc.abort = null;
    if (err && err.name === 'AbortError') return;
    systemLine(err && err.name === 'NotAllowedError' ? 'NFC permission was denied.'
      : err && err.name === 'NotReadableError' ? 'NFC is turned off. Turn it on in your phone\'s settings.'
        : 'NFC isn\'t available on this device.');
  });
}

export function toggleNfc(): void {
  if (nfc.abort) { stopNfc(); systemLine('Stopped scanning for NFC tags.'); } else startNfc();
}
