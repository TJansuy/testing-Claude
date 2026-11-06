# Scanning QR codes and NFC tags

[← Back to LocalChatter](../README.md)

## Scanning QR codes and NFC tags

Tap the **Scan** button next to the message box. Whatever the QR code or tag
holds is sent to the chat, marked *via QR code* or *via NFC tag*. A code or
tag containing `/fire`, `/earthquake` or `/lightning` plays that effect for everyone.

### QR codes (every device with a camera, including iPhone and iPad)

The camera opens. Point it at a QR code; as soon as it's read, the scanner
closes and the contents are sent. The camera is switched off when the scanner closes.

Decoding uses the browser's built-in barcode reader where there is one, and
otherwise the bundled [jsQR](https://github.com/cozmo/jsQR) library
(`vendor/jsQR.js`, Apache-2.0). That makes it work offline and on Safari.
The browser asks for camera permission the first time.

### NFC tags (Chrome on Android)

Where Web NFC exists, **Scan** offers *QR code* or *NFC tags*. Choose
*NFC tags*, then hold tags to the back of the phone. It keeps listening, and
the Scan button pulses, until you choose *Stop NFC*.

- Text and URL records are sent as text, one per line. Smart posters, and
  text-like MIME records such as JSON, are read too.
- Binary data is summarised (e.g. `[image/png data, 4 B]`) rather than sent raw.
- An empty tag sends its serial number.
- Holding the same tag in place doesn't send it again; tap it again after a few
  seconds to resend.

Web NFC only exists in Chrome on Android. Elsewhere, Scan goes straight to the
QR scanner. The phone's NFC must be turned on, and Chrome asks for permission
the first time.
