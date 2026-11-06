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

Send one of these as a message, or tap the ✨ button and pick one. It plays for
everyone in the chat, including you, and shows as a line like
"🔥 Alice set the chat on fire" instead of a text bubble.

| Message | Effect |
| --- | --- |
| `/fire` | Flames rise from the bottom of the screen. |
| `/earthquake` (or `/quake`) | The screen shakes and Android phones rumble. |
| `/lightning` | Lightning strikes, with two flashes per strike. |
| `/zalgo` | Corrupts the chat: every message, the header and the dashboard turn into zalgo text, and the dashboard glitches. |

### How long they last

Every effect takes the same options after its name:

| Option | Example | Lasts |
| --- | --- | --- |
| *(none)* | `/fire` | Its usual length: a short burst for fire, earthquake and lightning; 10 seconds for zalgo. |
| seconds or minutes | `/fire 30`, `/quake 30s`, `/lightning 2m` | That long, up to 10 minutes. |
| `on` | `/zalgo on` | Until anyone sends the matching `off`. |
| `off` | `/fire off` | Stops it now ("Cara put out the fire"). |

Long fire keeps burning; a long earthquake shakes (and rumbles) in waves; long
lightning strikes again every 1.2–3 seconds, so there are never more than two
flashes in any second. Sending an effect again while it's running resets its
timer. Commands are case-insensitive and only count when they're the whole
message, so "I like /fire" and "/fire banana" are sent as normal text.

While the chat is corrupted by zalgo, messages that arrive are corrupted too,
but the message box stays readable and the dashboard buttons keep working.
When it ends, every bit of text goes back exactly as it was.

If a device has **Reduce motion** turned on, it shows a soft glow for as long
as the effect lasts instead: no shaking, no flashing, no glitching (zalgo still
scrambles the text).

### Stopping your own effects

While an effect **you** sent is running, a **■ Stop** button appears in the
corner of your screen (with the time left). It stays on top of the flames and
flashes, isn't shaken by earthquakes and isn't scrambled by zalgo. Tapping it
stops the effect for everyone it went to: the whole chat, the recipients of a
whisper, or the person an admin aimed it at. It disappears when the effect
ends, or when someone else turns it off.

### Favourites

Every effect line in the chat has a ☆. Tap it to keep that effect in
**Favourites** (in the ✨ tray, or the dashboard on wide screens):

- Your own effects get **Resend**; someone else's get **Echo** (labelled
  *from Bob*). Either way it plays for everyone again, sent by you.
- ✕ removes a favourite. Favourites are kept on the device (up to 20).

### Rumble

On Android, an earthquake makes the phone rumble along with the shake: a quick
build, a main shock with random jolts, a smaller aftershock, then a fade. It's
randomised, so each earthquake feels different. Fire and lightning give a short buzz.

Phones can only switch the vibration motor on and off, not set its strength, so
intensity is made from very short pulses: more "on" per pulse feels stronger.

- Turn it off in Settings (*Vibrate for effects*). The setting only appears on
  devices that can vibrate.
- iPhone and iPad can't vibrate from web pages, so they only shake on screen.
- Android only vibrates after you've tapped the page at least once, and not
  when the phone's vibration or battery saver blocks it.

## Wide screens (dashboard)

On screens 16:10 or wider and at least 960 px across (laptops, and tablets in
landscape), the ✨ tray becomes a dashboard beside the chat that stays open:
**Effects**, the **Soundboard** (admins) and **Favourites**. Using it doesn't
close it. Narrower screens, 4:3 tablets and portrait screens keep the normal
layout, and it switches live when you rotate or resize. Display mode never
shows the dashboard.

## Sounds

Anyone can send a sound with `/sound <name>`; `/sound` lists the sounds on
your device. Admins also get a **soundboard** in the ✨ tray.

When a sound arrives, each device plays it from the first of these that works:

1. **This device's cache.** Sounds are identified by a fingerprint (hash) of
   their audio, so a device that already has a sound plays its own copy.
2. **The audio in the message.** If the sender included it (on by default), it
   plays from there and is saved on the device for next time.
3. **The sound's link,** if it came from one.

If none works (for example, no copy, no audio in the message, and the link is
unreachable offline), the chat just shows "Alice tried to play "airhorn", but
it isn't available on this device."

- Sounds received from others are saved, so you can send them on with
  `/sound`. The 40 most recently used are kept; older ones are removed.
- Turn sounds off in Settings (*Play sounds sent to the chat*). Sound messages
  still appear, with a ▶ button to play them yourself.
- Phones don't allow sound until you've tapped the page once. If a sound
  arrives before that, it shows *Tap ▶ to play*.

### Soundboard (admins)

Open the ✨ tray. Tap a sound to play it for everyone (in debug mode, *Send as*
works for sounds too). **Stop sounds** stops everything playing on your device.

**Manage sounds** opens your library:

- **Choose files…** adds audio files from your device (up to 10 MB each).
- **Add from a link** downloads a sound and keeps it on the device, so it works
  offline. If the site doesn't allow downloading from other sites, or you're
  offline, it's saved as a link instead and needs internet to play.
- ▶ previews a sound on your device only; ✎ renames; 🗑 deletes.
- **Include the audio in messages** (on by default) lets devices that don't
  have a sound play it. Turn it off to send only the name and link, which is
  lighter but means devices without the sound can't play it.

Sounds are stored in the browser's IndexedDB on each device. Nothing is stored
on the server.

Playing a sound from its link makes each device fetch that link, so the site
hosting it can see those devices' internet addresses.

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

## Roles

Type `/role` to see your role and the others. Switch with `/role <name>`.
`/role` commands are never sent to the chat. Anyone can switch to any role,
and the app remembers your role on this device.

| Role | Sees |
| --- | --- |
| `member` (default) | The chat. |
| `monitor` | The chat, plus **system messages**. |
| `spy` | The chat, plus **whispers** to or from the people they're spying on. |
| `display` | Only effects and sounds, never messages. Opened from the `/Display` link (see below). |
| `admin` | The chat, system messages, and who really sent a spoofed message. Has a **soundboard** and can use **debug mode**. |

**System messages** are role changes ("🛡️ Bob changed role: member → monitor"),
targeted effects ("🛡️ Alice triggered lightning for Bob") and debug mode being
turned on or off.

Roles live entirely in the app. The relay server keeps no role state and
enforces nothing: it passes every message to everyone, and each app decides
what to show based on its own role. So hidden things (system messages,
"really sent by") are hidden on screen, but they're still in the data each
device receives. Someone inspecting the traffic could see them.

### Debug mode (admins)

Turn it on with `/debug` (or `/debug on` / `/debug off`), or in Settings.

- **Effects for anyone.** The ✨ tray gets a *For* picker: play any effect for
  one person, or everyone. Only the people chosen play it, and they aren't told
  who triggered it. Monitors and admins see a system message.
- **Send as someone else.** A *Send as* picker above the message box sends
  messages (and effects) that appear to come from another person in the room.
  Only **admins** see the message marked *really sent by Alice*. Everyone else,
  monitors included, sees it as genuine.

## Whispers

`/whisper Bob, Cara: see you at 5` (or `/w`) sends a message only Bob and Cara
see. Names are matched case-insensitively against the people in the room. You
can also open Settings and tap someone's name under *People here* to start a
whisper to them.

Whispers show with a dashed border and *whisper to you, Cara*. An effect
command in a whisper (`/whisper Bob: /fire`) only plays for the recipients.

Like everything else, the relay sends whispers to every device, and each app
only shows them to the recipients. Anyone inspecting the traffic could read them.

### Spying

In the `spy` role:

- `/spy Bob, Cara` shows whispers sent to or from Bob or Cara (including ones
  an admin sent *as* them), marked *spied whisper*.
- `/spy all` shows every whisper; `/spy off` stops; `/spy` says who you're spying on.

Spy targets are matched by name and remembered on the device.

## Display

A display is a screen (a TV, tablet or spare phone) that plays the chat's
effects and sounds, and never shows messages, whispers or system messages.

- Open `<app>/Display`, e.g.
  `https://tjansuy.github.io/testing-Claude/PWA/LocalChatter/Display`. Note the
  capital **D**: GitHub Pages is case-sensitive.
- Or tap **Set up as a display** on the server's setup page, or type
  `/role display` in the app.
- It joins as "Display" (rename it in Settings) and keeps the screen awake
  where the browser allows.
- Sound needs one tap on the screen first (*Tap to turn on sound*).
- Effects aimed at the display by an admin in debug mode, and whispered effects
  sent to it, play too.
- The display role isn't saved: opening the normal link on the same device
  gives your usual role. *Exit display* in Settings goes back to the chat.

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
| `index.html`, `styles.css`, `app.js` | The app, including roles and QR/NFC scanning. |
| `vendor/jsQR.js` | QR decoder (jsQR 1.4.0, Apache-2.0), used where the browser has no built-in one. |
| `effects.js` | Fire, earthquake and lightning animations. |
| `sounds.js` | Sound cache (IndexedDB) and playback. |
| `Display/index.html` | Opens the app in display mode, for `<app>/Display` links. |
| `sw.js` | Service worker: caches the app so it opens offline. Bump `CACHE` when you change files. |
| `manifest.webmanifest`, `icons/` | Install metadata and icons. |
| `server/server.js` | Relay server and setup page. |
| `server/Dockerfile`, `server/docker-compose.yml` | Container build and run config. |
