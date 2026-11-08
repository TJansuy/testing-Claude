# Languages and colours

[← Back to LocalChatter](../README.md)

## Languages

Every device has a list of languages it understands, starting with **Default**
and **System**. Messages come in one of three kinds:

- **Default:** ordinary messages.
- **System:** join, leave and rename lines, and system notices for monitors and admins.
- **A named language,** such as Elvish: messages written by someone who's chosen to write in it.

If you understand a message's language, you read it normally. If you don't, it
shows as gibberish in that language's own style. Each language always looks the
same (System looks like machine code). The gibberish keeps the message's shape:
same number of words, punctuation and capitals. It's the same on every device,
and it changes back to the real text if you learn the language later.

| Command | Does |
| --- | --- |
| `/languages` | Shows what you understand and write in. |
| `/languages add Elvish, Dwarvish` | Learn languages. |
| `/languages remove Elvish` | Forget one. Removing **System** hides join/leave lines; removing **Default** hides ordinary messages. |
| `/languages reset` | Back to Default and System. |
| `/speak Elvish` | Write your messages in Elvish (one you understand). The message box says *Message everyone in Elvish*. |
| `/speak default` | Back to ordinary messages. |

Settings has the same: *Languages you understand* and *You write in*. Changes there apply straight away; you don't need to press Save.

- Messages in a named language get a coloured ring (each language its own
  colour) and a *🗣 Elvish* tag. A whisper in a language has both its dashed
  border and the ring.
- You always read your own messages, and replies to your own commands are never
  turned into gibberish.
- Effects (`/fire` and so on) aren't affected by language.
- Like whispers, the real text reaches every device and each app decides what
  to show, so anyone inspecting the traffic could read it.

## Sender colours

Each person's messages have their own bubble colour, worked out from their
name, so they look the same on every device, in light and dark mode. Your own
messages keep the app's teal. A message an admin sent *as* someone uses that
person's colour.
