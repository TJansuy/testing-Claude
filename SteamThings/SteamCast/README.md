# SteamCast

Turns a SteamOS machine (a Steam Deck in its dock, or a living-room PC running
SteamOS) that's plugged into a TV and surround system into a cast receiver.
It runs as a normal SteamOS app, in Desktop Mode or from Game Mode as a
non-Steam game, and shows whatever you send it fullscreen on the TV.

| Receiver | Senders that work | Notes |
| --- | --- | --- |
| **YouTube** (DIAL + YouTube's "lounge", via [yt-cast-receiver](https://github.com/patrickkfkan/yt-cast-receiver)) | The cast button in the YouTube and YouTube Music apps on phones and tablets; "Link with TV code" from anywhere | See [YouTube](#youtube) |
| **DLNA / UPnP renderer** | Windows "Cast to Device", BubbleUPnP, Web Video Caster, VLC-for-mobile style "cast" apps, Kodi, most phone gallery apps with a "play on TV" button | Fully supported |
| **Google Cast** (CASTV2, port 8009) | Senders that don't check device certificates: `catt`, `go-chromecast`, pychromecast-based tools and Home Assistant, some third-party apps | See the limitation below |
| **AirPlay** (via [UxPlay](https://github.com/FDH2/UxPlay)) | iPhone / iPad / Mac screen mirroring and AirPlay audio | Optional, set up with `--with-airplay` |
| **Remote page** `http://<deck-ip>:8090/` | Any browser: paste a video, audio or stream link | Play / pause / seek / volume |

All playback goes through one long-running fullscreen **mpv** window. mpv
decodes 5.1 and 7.1 audio and sends it over HDMI as multichannel PCM, or
passes AC-3, E-AC-3, DTS and TrueHD through untouched to an AV receiver
(see [Surround sound](#surround-sound)).

## Install on SteamOS

1. Switch to **Desktop Mode** and open **Konsole**.
2. Get this folder (clone the repository or download it) and run:

   ```sh
   cd SteamThings/SteamCast
   ./scripts/install.sh                  # YouTube + Cast + DLNA + remote page
   ./scripts/install.sh --with-airplay   # also AirPlay (UxPlay in a distrobox)
   ./scripts/install.sh --no-youtube     # skip the Node.js / yt-dlp downloads
   ```

   The installer only writes inside your home directory, so it survives SteamOS
   updates and doesn't need `steamos-readonly disable` or a sudo password. It:
   - copies the app to `~/.local/share/steamcast` and adds a `steamcast` command,
   - installs mpv from Flathub (`io.mpv.Mpv`) if you don't already have mpv,
   - for YouTube: downloads Node.js (the current LTS, only if the system has no
     Node 18 or newer) and yt-dlp, both checked against their published SHA-256
     sums, and installs the YouTube receiver's locked dependencies,
   - writes default settings to `~/.config/steamcast/steamcast.ini`,
   - adds a **SteamCast** shortcut to your Steam library (if Steam is running;
     otherwise use *Add a Game → Add a Non-Steam Game → SteamCast*).
3. Go back to Game Mode and launch **SteamCast** from the library. The TV shows
   the receiver's name and the remote-page address. Quit it with Steam's
   *Exit game*.

Uninstall with `./scripts/uninstall.sh` (`--purge` also removes settings and the
AirPlay container).

There's nothing to build. The app is plain Python 3 (standard library only, so
the Python that ships with SteamOS is enough) plus mpv. The YouTube receiver is
a small Node.js sidecar. On other Linux systems, run
it from the checkout with `scripts/steamcast.sh` after installing `mpv`.

## Using it

- **YouTube:** tap the cast button in the YouTube app and pick the receiver.
  Your phone has to be on the same network the first time. After that, or from
  a phone on another network, use *Settings → Watch on TV → Enter TV code* with
  the code shown on the TV's idle screen and on the remote page.
- **DLNA:** pick the receiver ("SteamCast (steamdeck)" by default) in the app's
  cast / play-to menu.
- **Google Cast:** for example `catt -d "SteamCast (steamdeck)" cast https://…/movie.mkv`.
- **AirPlay:** Control Centre → Screen Mirroring on iPhone or iPad, or the AirPlay
  button in a music app.
- **Remote page:** open `http://<deck-ip>:8090/` on a phone. The TV shows the
  address while it's idle.

Run `steamcast --help` for the command-line options. All settings are in
[`steamcast.example.ini`](steamcast.example.ini).

## Surround sound

- Dock the Deck or connect the PC to an AV receiver or soundbar over HDMI (or
  through the TV with eARC).
- In Desktop Mode → *System Settings → Audio*, set the HDMI device's profile to
  **Digital Surround 5.1 / 7.1 (HDMI)**. SteamOS defaults to stereo, and mpv
  can only use the channels PipeWire exposes.
- `audio_channels = auto` (the default) plays 5.1 and 7.1 tracks as discrete
  channels and leaves stereo as stereo. Set `5.1` or `7.1` to force a layout.
- To let the receiver decode Dolby and DTS itself, set
  `passthrough = ac3,eac3,dts-hd,truehd`.
- AirPlay audio is stereo. That's a limit of what the open AirPlay receivers
  get from Apple devices, not something this app can upmix around.

## YouTube

The YouTube app doesn't use Google Cast for TVs. It finds smart TVs with DIAL
and then talks to them through YouTube's servers. SteamCast does the same thing
with [yt-cast-receiver](https://github.com/patrickkfkan/yt-cast-receiver), running
`youtube/receiver.mjs` on Node.js next to the Python app. YouTube sends a video
ID, and mpv plays it through yt-dlp. Queues, autoplay of the next video,
play/pause/seek/volume from the phone, and pausing from the TV side all sync
both ways.

- The DIAL port is 8091 (`youtube_port`). The receiver needs internet access to
  reach YouTube. If it starts before Wi-Fi is up, it keeps retrying.
- Streams are picked by `youtube_format`. The default is up to 1080p60 and never
  AV1, so the Deck can decode in hardware. Raise it to 2160 for a 4K TV.
- yt-dlp updates itself once a day, since YouTube changes often. If videos stop
  loading, check the log; it's usually fixed by the next yt-dlp update.
- This uses YouTube's unofficial TV protocol. YouTube can change it without
  notice, which breaks casting until yt-cast-receiver is updated. Re-run
  `install.sh` after pulling a newer version.

## Smooth playback

SteamCast sets mpv up for the Deck:

- **Hardware decoding** (`hwdec = auto-safe`, VA-API): H.264, HEVC and VP9 are
  decoded by the GPU. The log and the remote page show the decoder in use and
  the number of dropped frames while a video plays, for example
  `video: hevc 3840x2160 @ 23.976 fps, hardware (vaapi) decoding`.
- **Frame pacing** (`smooth_motion`): frames are timed to the TV's refresh and
  blended. Without this, 24 fps film on a 60 Hz TV has a regular hitch, which
  is the most common "stutter" on any PC player.
- **Network buffering** (`cache_mb`): reads up to 400 MB ahead and, if the
  buffer runs dry, waits for a few seconds of video instead of stuttering
  through an empty buffer.
- **The `gpu-next` renderer**, with a fallback to `gpu` on older mpv builds.

If it still stutters:

1. Check the decoder on the remote page. **software** on a large video means
   hardware decoding isn't working. AV1 is the usual cause on the Deck, since
   it has no AV1 decoder; pick a different source or stream.
2. In Game Mode, open Quick Access → Performance and turn off the **framerate
   limit**, and set the refresh rate to 60 Hz. A 30/40 fps limit applies to
   SteamCast too.
3. For 4K output, try `video_profile = fast`.
4. Press <kbd>i</kbd> (or map a button to it in Steam Input) to show mpv's own
   playback statistics on screen.

## Limitations

- **Google Cast authentication.** Chrome, Android's system cast picker, and apps
  like Netflix only connect to devices that answer a challenge with a key Google
  installs in certified Chromecast hardware. No open-source receiver can do
  that, so those senders won't list or won't connect to SteamCast. Senders that
  skip the check work fully. YouTube is covered by its own receiver (above).
  For other phone apps, DLNA is usually the dependable route.
- **AirPlay in Game Mode.** UxPlay opens its own window. Gamescope (Game Mode's
  compositor) may keep showing the SteamCast window instead, because UxPlay runs
  in a distrobox container rather than as a child process. AirPlay works in
  Desktop Mode. In Game Mode, use the Steam button to switch windows if needed.
  UxPlay also needs `avahi-daemon` running on the host
  (`sudo systemctl enable --now avahi-daemon`). The installer warns if it isn't.
- **DLNA eventing** is not sent. Control points that rely on it fall back to
  polling, which all common ones do.
- One thing plays at a time. A new cast replaces the current one.

## Layout

```
steamcast/
  app.py          wiring, start-up and shutdown
  config.py       settings (INI + command line)
  player.py       the mpv window, driven over JSON IPC
  mdns.py         mDNS / DNS-SD responder (avahi fallback)
  ssdp.py         SSDP discovery for DLNA
  dlna.py         UPnP MediaRenderer control (SOAP)
  dlna_scpd.py    UPnP service descriptions
  cast/           Google Cast: TLS socket, protobuf framing, receiver + media channels
  airplay.py      runs and supervises UxPlay
  mpv_options.py   decoding, frame pacing, caching and audio options for mpv
  youtube.py      runs the YouTube sidecar and connects it to the player
  ytdlp.py        finds and auto-updates yt-dlp
  remote.py/.html phone remote page and JSON API
  web.py          tiny HTTP server shared by DLNA and the remote page
youtube/          Node.js sidecar: receiver.mjs (yt-cast-receiver) and bridge.mjs
scripts/          steamcast.sh launcher, install.sh, uninstall.sh
tests/            unit tests plus socket-level tests of the DLNA and Cast servers
```

Run the tests with `python3 -m unittest discover -s tests -t .` and, for the
YouTube sidecar, `npm ci && npm test` in `youtube/`.
