# Sounds

[← Back to LocalChatter](../README.md)

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

### Voice messages

When the message box is empty, the Send button becomes a **microphone**. Tap it
to record (a timer and level meter show it's listening; recordings stop by
themselves at 2 minutes). Tap **■ Stop** to finish, or **✕** to throw it away.

You can then play it back and rename it before you:

- **Send** it. It goes as a sound message with the audio included, so every
  device can play it, and it shows with a 🎙.
- **💾 Save to my sounds**, to send again later with `/sound <name>` (and on
  the soundboard, for admins).
- **Re-record**, or **✕** discard it.

Recordings use AAC (`.m4a`) where the browser can record it, since every device
including iPhone can play that; otherwise WebM/Opus. The browser asks for
microphone permission the first time.

### Replay, save and download

Every sound message (voice or not, yours or someone else's) has:

- **▶** to play it again,
- **💾** to save it to your sounds (then `/sound <name>` plays it for everyone),
- **⬇** to download the audio file (when the audio is on this device).

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
