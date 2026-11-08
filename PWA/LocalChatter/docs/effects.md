# Effects

[← Back to LocalChatter](../README.md)

## Effects

Send one of these as a message, or tap the ✨ button and pick one. It plays for
everyone in the chat, including you, and shows as a line like
"🔥 Alice set the chat on fire" instead of a text bubble.

| Message | Effect |
| --- | --- |
| `/fire` | Flames rise from the bottom of the screen, and every message bubble catches fire. |
| `/earthquake` (or `/quake`) | The screen shakes and Android phones rumble. |
| `/lightning` | Lightning strikes down through the chat, hitting some messages at random (they flash and jolt) and passing beside others, with two flashes per strike. |
| `/zalgo` | Corrupts the chat: every message, the header and the dashboard turn into zalgo text, and the dashboard glitches. |

### How long they last

Every effect takes the same options after its name:

| Option | Example | Lasts |
| --- | --- | --- |
| *(none)* | `/fire` | Its usual length: a short burst for fire, earthquake and lightning; 10 seconds for zalgo. |
| seconds or minutes | `/fire 30`, `/quake 30s`, `/lightning 2m` | That long, up to 10 minutes. |
| `on` | `/zalgo on` | Until anyone sends the matching `off`. |
| `off` | `/fire off` | Stops it now ("Cara put out the fire"). |

Long fire keeps burning (messages that arrive meanwhile catch fire too); a long earthquake shakes (and rumbles) in waves; long
lightning strikes again every 1.2–3 seconds, so there are never more than two
flashes in any second. Sending an effect again while it's running resets its
timer.

Effects never overlap: only one runs at a time. Starting a different effect
replaces the current one straight away (no fading flames under the lightning),
and the sender's Stop button for the old one goes away. Commands are case-insensitive and only count when they're the whole
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
