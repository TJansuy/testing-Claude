# Roles, whispers and spying

[← Back to LocalChatter](../README.md)

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
