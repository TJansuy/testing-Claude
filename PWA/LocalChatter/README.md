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

## Effects

Send one of these on its own as a message, or tap the ✨ button and pick one.
It plays for everyone in the chat, including you, and shows as a line like
"🔥 Alice set the chat on fire" instead of a text bubble.

| Message | Effect |
| --- | --- |
| `/fire` | Flames rise from the bottom of the screen. |
| `/earthquake` (or `/quake`) | The screen shakes. Phones also vibrate. |
| `/lightning` | A lightning bolt strikes, with two flashes. |

Commands are case-insensitive. They only count when they're the whole message,
so "I like /fire" is sent as normal text.

If a device has **Reduce motion** turned on, it shows a soft glow instead:
no shaking and no flashing. Lightning flashes twice, which stays under the
three-flashes-a-second limit in accessibility guidelines.

## NFC tags

On **Chrome for Android**, an NFC button appears next to the message box. Tap it
to start scanning, then hold a tag to the back of the phone: the tag's contents
are sent to the chat as a message marked *via NFC tag*. Tap the button again to stop.

- Text and URL records are sent as text, one per line. Smart posters, and
  text-like MIME records such as JSON, are read too.
- Binary data is summarised (e.g. `[image/png data, 4 B]`) rather than sent raw.
- An empty tag sends its serial number.
- Holding the same tag in place doesn't send it again; tap it again after a few
  seconds to resend.
- A tag that contains `/fire`, `/earthquake` or `/lightning` plays that effect for everyone.

Web NFC only exists in Chrome on Android, so the button doesn't appear on
iPhone, iPad, desktop or other browsers. The phone's NFC must be turned on, and
Chrome asks for permission the first time.

## Server settings

Set these as environment variables (or the `LOCALCHATTER_*` names with Docker Compose).

| Compose variable | Server variable | Default | Meaning |
| --- | --- | --- | --- |
| `LOCALCHATTER_HOST` | `ADVERTISED_HOST` | *(empty)* | LAN address devices use to reach the server. Goes in the certificate and on the setup page. If empty, the address a device opened the setup page with is used. |
| `LOCALCHATTER_PORT` | `ADVERTISED_PORT` | `8443` | Port devices use. |
| `LOCALCHATTER_APP_URL` | `APP_URL` | `https://tjansuy.github.io/testing-Claude/PWA/LocalChatter/` | Where the app is hosted. Change this if your GitHub Pages URL differs. |
| `LOCALCHATTER_ROOM` | `ROOM_NAME` | `LocalChatter` | Room name shown in the app. |
| `LOCALCHATTER_MAX_MB` | `MAX_MESSAGE_MB` | `25` | Largest message in MB. Files are sent base64-encoded, so the largest file is about ¾ of this. |
| – | `MAX_PEERS` | `200` | Most people connected at once. |
| – | `PORT` | `8443` | Port the server listens on inside the container. |
| – | `CERT_DIR` | `/certs` | Where the TLS certificate is kept. |
| – | `TLS` | `on` | `off` serves plain HTTP/WS. Only for use behind your own TLS proxy: the HTTPS-hosted app can't connect to a plain `ws://` address. |

To use your own certificate, put `key.pem` and `cert.pem` in the `certs`
volume. If you change `LOCALCHATTER_HOST`, run `docker compose down -v` first
so a new certificate is made for the new address (devices will need to accept it again).

### Endpoints

| Path | Purpose |
| --- | --- |
| `/` | Setup page with the **Set up LocalChatter** button and the server address. |
| `/ws` | WebSocket the app connects to. |
| `/config.json` | Room name, relay address, number connected. |
| `/health` | Returns `ok` (used by the Docker health check). |

## Privacy

- The server forwards each message to everyone else connected and then drops it.
  It writes nothing to disk except its TLS certificate, and logs only how many
  people are connected: never names or message contents.
- The app keeps messages in memory only. Close or reload it and they're gone.
  It saves just your name and the server address on the device.
- Someone who joins later sees nothing sent before they arrived.
- Traffic is encrypted between each device and the server (TLS). The server
  itself can read messages as it passes them on, so run it on a machine you trust.

## How it works

```
 phone ──┐                         ┌── laptop
         │   wss://192.168.1.50    │
 tablet ─┼──────► relay server ◄───┼── phone
         │     (Docker, no disk)   │
```

Each device opens a secure WebSocket to the relay. Text is sent as JSON;
images and files are base64-encoded inside the same JSON message. The relay
checks each message, keeps only the expected fields, stamps the sender's name
and the time, and sends it to everyone else. Effects are ordinary messages
(`/fire` etc.) that each app recognises and animates, so the server needs no
special support for them.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app, including NFC scanning. |
| `effects.js` | Fire, earthquake and lightning animations. |
| `sw.js` | Service worker: caches the app so it opens offline. Bump `CACHE` when you change files. |
| `manifest.webmanifest`, `icons/` | Install metadata and icons. |
| `server/server.js` | Relay server and setup page. |
| `server/Dockerfile`, `server/docker-compose.yml` | Container build and run config. |
