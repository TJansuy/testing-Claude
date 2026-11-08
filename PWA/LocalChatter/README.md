# LocalChatter

An open chat room for everyone on the same local network. Anyone with the app
open and connected receives every message, image and file that's sent. Nothing
is kept: messages exist only on the screens of the people who were there.

It has two parts:

| Part | Where | What it does |
| --- | --- | --- |
| **App** (PWA) | this folder, served from GitHub Pages | The chat UI. Installable, and opens with no internet once it's been loaded. |
| **Relay server** | [`server/`](server/) (Docker container) | Runs on one machine on your network. Passes messages between everyone connected, and serves a setup page that points each device at it. |

## Why not Bluetooth?

Browsers can't do device-to-device Bluetooth. Web Bluetooth can only connect
*to* accessories (it can't advertise or accept connections), and Safari on
iPhone and iPad doesn't support it at all. A small relay on the local network
works on every device, with no internet needed.

## Quick start

1. **Start the server** on a machine on your network (a laptop, a Raspberry Pi,
   a NAS…), using its LAN IP address:

   ```sh
   cd PWA/LocalChatter/server
   LOCALCHATTER_HOST=192.168.1.50 docker compose up -d --build
   ```

   No Docker? With Node.js 20+: `npm ci && ADVERTISED_HOST=192.168.1.50 npm start`.

2. **On each device**, join the same Wi-Fi (or hotspot) and open
   `https://192.168.1.50:8443/` in the browser.
3. **Accept the certificate warning.** The server makes its own certificate
   because there's no public certificate authority for a local IP address.
   Each device accepts it once.
4. Tap **Set up LocalChatter**. The app opens with the server's address filled
   in. Choose a name and tap **Save & connect**.

To install it, use the browser's *Install app* or *Add to Home Screen*.

### iPhone and iPad

Apps added to the Home Screen don't share settings with Safari. After you
install, open LocalChatter from the Home Screen, tap the settings button and
enter the server address shown on the setup page (e.g.
`wss://192.168.1.50:8443/ws`). Accept the certificate in Safari first.

## Features

| Topic | |
| --- | --- |
| [Effects](docs/effects.md) | `/fire`, `/earthquake`, `/lightning`, `/zalgo`; durations, Stop buttons, favourites, rumble. |
| [Sounds](docs/sounds.md) | Sending sounds; the admin soundboard and sound library. |
| [Scanning](docs/scanning.md) | Sending what's in a QR code or NFC tag. |
| [Roles, whispers and spying](docs/roles-and-whispers.md) | `/role`, admin debug mode, `/whisper`, `/spy`. |
| [Languages and colours](docs/languages.md) | `/languages`, `/speak`, gibberish, sender and language colours. |
| [Screens](docs/screens.md) | The dashboard and Settings, command suggestions as you type, the auto-hiding header, display mode, background messages and notifications. |
| [The relay server](docs/server.md) | Settings, endpoints, privacy and how it works. |

## Developing

The app and the relay are written in TypeScript.

| What | Source | Built to |
| --- | --- | --- |
| App | `src/` (entry `src/main.ts`) | `dist/app.js`, one plain script |
| Service worker | `src/sw.ts` | `sw.js` (it must sit at the app root) |
| Styles | `styles/*.css` | used as they are |
| Relay server | `server/src/` | `server/dist/server.js` (built by Docker or `npm start`) |

From the repository root:

```sh
npm ci          # once: installs TypeScript and esbuild
npm run build   # builds the app (and the Hello World sample)
npm run check   # type-checks everything (strict mode)
npm run watch   # rebuilds as you edit
```

The built `dist/app.js` and `sw.js` are committed, so GitHub Pages can serve
the app without a build step. Rebuild and commit them after changing `src/`,
and installed copies pick up the new version on their own (see below).

### Versions and updates

Every build is stamped with the time it was made. That's the **Last update**
shown in Settings (so people can tell which version they have), and it names
the service worker's cache, so each build is automatically a new version; there's
no cache version to bump by hand. Set `SOURCE_DATE_EPOCH` (seconds) to pin it.

The app checks for a new version when it's opened, when you come back to it and
when the device comes back online, and from **Check for updates** in Settings.
New files are fetched fresh, not from the browser's cache. Once a new version is
downloaded, the app switches to it straight away if the chat is empty (e.g. just
reopened); if there are messages on screen it offers **Reload now** instead,
since reloading clears the chat on that device.

The app is bundled into a single plain script (not a module) so it also works
when `index.html` is opened straight from disk.

### Source layout

| Folder | What's in it |
| --- | --- |
| `src/chat/` | The message list and bubbles: text, files, effect lines, sounds. |
| `src/net/` | The connection to the relay, and handling what it sends. |
| `src/ui/` | Status bar and people list, message box, dashboard, header, settings. |
| `src/features/` | Roles and debug mode, commands, whispers, favourites, Stop buttons, soundboard, background, display. |
| `src/effects/` | One file per effect, shared helpers, and the runner that times them. |
| `src/sounds/` | The sound cache (IndexedDB), library and playback. |
| `src/scan/` | The Scan button, QR codes and NFC tags. |
| `src/languages.ts` | Languages, gibberish and colours. |
| `vendor/jsQR.js` | QR decoder (jsQR 1.4.0, Apache-2.0), used where the browser has no built-in one. |
| `Display/index.html` | Opens the app in display mode, for `<app>/Display` links. |
