# Games

[← Back to LocalChatter](../README.md)

Games are a kind of effect. Start them from **Games** in the ✨ tray, or by typing.

## The wall

`/wall` (or 🧱 **Wall**) calls in a brick wall that slowly comes down from the
top of the screen. Every message anyone sends flies up and hits it, knocking it
back up and cracking it. It takes somewhere between 3 and 50 hits to break; the
number is set by the `/wall` message, so it's the same on every screen. When it
breaks, the bricks tumble off the bottom of the screen and the game ends:
"💥 The wall broke after 17 messages! Bob landed the final blow."

- Only ordinary messages count, not whispers, polls or games.
- `/wall off`, or the sender's **■ Stop** button, ends it early: the wall rises
  back up off the screen instead of breaking.
- `/wall 2m` gives it a time limit; with no time it lasts until it breaks.
- Like every effect, only one runs at a time: starting another effect replaces it.
- With **Reduce motion**, the wall stays still, cracks as it's hit, and fades
  away when it breaks.

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
