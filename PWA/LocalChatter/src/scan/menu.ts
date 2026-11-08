// The Scan button: QR codes (any device with a camera) and NFC tags (Chrome on
// Android). With only one way to scan, it goes straight to it.
import { $ } from '../dom';
import { nfcSupported, toggleNfc } from './nfc';
import { cameraAvailable, openQr } from './qr';

const scan = $('scan');
const menu = $('scan-menu');

export function closeScanMenu(): void {
  menu.hidden = true;
  scan.setAttribute('aria-expanded', 'false');
}

if (cameraAvailable || nfcSupported) scan.hidden = false;
if (!cameraAvailable) $('scan-qr').hidden = true;
if (nfcSupported) $('nfc').hidden = false;

scan.addEventListener('click', () => {
  if (!nfcSupported) { openQr(); return; }
  if (!cameraAvailable) { toggleNfc(); return; }
  const open = menu.hidden;
  menu.hidden = !open;
  scan.setAttribute('aria-expanded', String(open));
});
$('scan-qr').addEventListener('click', () => { closeScanMenu(); openQr(); });
$('nfc').addEventListener('click', () => { closeScanMenu(); toggleNfc(); });
