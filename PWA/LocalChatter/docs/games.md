# Games

[← Back to LocalChatter](../README.md)

Games are a kind of effect. Start them from **Games** in the ✨ tray, or by typing.

## The wall

`/wall` (or 🧱 **Wall**) calls in a brick wall that slowly comes down from the
top of the screen. Every message anyone sends flies up and hits it, knocking it
back up and cracking it. It takes somewhere between 3 and 50 hits to break; the
number is set by the `/wall` message, so it's the same on every screen. When it
breaks, the bricks tumble off the bottom of the screen and the game ends.

- Only ordinary messages count, not whispers, polls or games.
- **Every wall secretly follows one of three rules**, picked at random (the same
  on every screen) and not told to anyone until the game ends. Working out which
  one it is is part of the game. A message that doesn't meet the rule bounces off,
  greyed out, without doing any damage.

  | Rule | What does damage |
  | --- | --- |
  | Ordinary | Every message. |
  | Unique words | Only a message with at least one word nobody has used yet since the wall came in. Capitals and punctuation don't matter: "Don't stop!" and "dont STOP" use the same words. |
  | Long messages | While the wall is unbroken, any message. The more broken it gets, the longer a message has to be, or the longer one of its words: just after the first hit, about 18 letters or a 6-letter word; when it's nearly broken, about 70 letters or a 13-letter word. |

  When it ends, a line says which it was: "💥 The wall broke after 4 hits (7
  messages thrown at it, 4 did damage)! Cara landed the final blow. It was a
  unique-words wall: …". The rules read what was actually written, so languages
  and zalgo don't change what counts.
- `/wall off`, or the sender's **■ Stop** button, ends it early: the wall rises
  back up off the screen instead of breaking.
- `/wall 2m` gives it a time limit; with no time it lasts until it breaks.
- Like every effect, only one runs at a time: starting another effect replaces it.
- With **Reduce motion**, the wall stays still, cracks as it's hit, and fades
  away when it breaks.

## Drop Race

`/droprace` (or 🎯 **Drop Race**) turns the screen into a pinboard: metal pins
come out of the background, and while the race runs **the next message each
person sends is their entry**. Instead of going to the chat, it drops from the
top of the board and bounces its way down through the pins and the other
messages. The first to drop out of the bottom wins: "🏆 Bob won the Drop Race
with “hello there”!", with confetti.

- **One entry each per round.** Your messages after that go to the chat as normal.
- **Longer words are heavier**: a message with long words falls faster and
  bounces less. Long messages make bigger bubbles, and a big enough one can get
  wedged between the pins.
- **Stuck on the pins?** A message that stops moving for a moment catches fire and
  burns away, so the others can get past.
- **Nobody made it?** If every entry burns, everyone is asked for another message
  and the race runs again. If that fails too, nobody wins: a giant unhappy face
  comes down the screen and sweeps away the pins and whatever's left.
- `/droprace off` stops it (anyone); the pins sink back. One race at a time.
- Every screen plays the same race and agrees on the winner, whatever its size:
  the board is the same shape everywhere, the bounces follow the same seeded
  rules, and each entry drops at the time the relay received it. To make sure
  every entry has arrived before its turn, each screen plays the race about
  ¾ of a second behind.
- People who join during a race don't see it; their messages go to the chat.
- Drop Race needs a relay from this version or later (rebuild the Docker container).

## Hangman

`/hangman Under the weather` (or 🪢 **Hangman**) starts a game with that word or
phrase. Nobody else sees it: they get blanks, in the chat and on the displays'
board (beside the polls).

- **Every message is a guess.** The first letter of each message anyone sends
  counts as a guess, in every open game. A message that starts with something
  other than a letter isn't a guess, and nor are whispers or commands. Your own
  messages don't count in your own game.
- Letters are matched without caring about case or accents.
- Each wrong guess adds a part to the figure. **Six wrong guesses** and the game
  is lost: the phrase is shown, and the card stays on the displays until
  someone clears it.
- **Solved:** when every letter has been found, the game bursts into confetti
  that rains down the screen, and it's gone: "🎉 Hangman solved: “Under the
  weather”! Cara found the last letter."
- Several games can run at once. `/hangman` shows the running games again;
  `/hangman clear` (or **Clear from displays**) takes them off the displays.
  Anyone can clear them.
- People who join mid-game are reminded about it, with the letters guessed so
  far, by a device that's already there.

Hangman needs a relay from this version or later (rebuild the Docker container).
