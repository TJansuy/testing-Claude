# SteamCast

Turns a SteamOS machine (a Steam Deck in its dock, or a living-room PC running
SteamOS) that's plugged into a TV and surround system into a cast receiver.
It runs as a normal SteamOS app, in Desktop Mode or from Game Mode as a
non-Steam game, and shows whatever you send it fullscreen on the TV.

| Receiver | Senders that work | Notes |
| --- | --- | --- |
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
   ./scripts/install.sh                  # Cast + DLNA + remote page
   ./scripts/install.sh --with-airplay   # also AirPlay (UxPlay in a distrobox)
   ```

   The installer only writes inside your home directory, so it survives SteamOS
   updates and doesn't need `steamos-readonly disable` or a sudo password. It:
   - copies the app to `~/.local/share/steamcast` and adds a `steamcast` command,
   - installs mpv from Flathub (`io.mpv.Mpv`) if you don't already have mpv,
   - writes default settings to `~/.config/steamcast/steamcast.ini`,
   - adds a **SteamCast** shortcut to your Steam library (if Steam is running;
     otherwise use *Add a Game → Add a Non-Steam Game → SteamCast*).
3. Go back to Game Mode and launch **SteamCast** from the library. The TV shows
   the receiver's name and the remote-page address. Quit it with Steam's
   *Exit game*.

Uninstall with `./scripts/uninstall.sh` (`--purge` also removes settings and the
AirPlay container).

There's nothing to build. It's plain Python 3 (standard library only, so the
Python that ships with SteamOS is enough) plus mpv. On other Linux systems, run
it from the checkout with `scripts/steamcast.sh` after installing `mpv`.

## Using it

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

## Limitations

- **Google Cast authentication.** Chrome, Android's system cast picker, and apps
  like YouTube and Netflix only connect to devices that answer a challenge with
  a key Google installs in certified Chromecast hardware. No open-source
  receiver can do that, so those senders won't list or won't connect to
  SteamCast. Senders that skip the check work fully. Apps that need their own
  receiver app (YouTube, Netflix…) also need code that only runs on real Cast
  devices. For phones, DLNA is usually the dependable route.
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
  remote.py/.html phone remote page and JSON API
  web.py          tiny HTTP server shared by DLNA and the remote page
scripts/          steamcast.sh launcher, install.sh, uninstall.sh
tests/            unit tests plus socket-level tests of the DLNA and Cast servers
```

Run the tests with `python3 -m unittest discover -s tests -t .`.
