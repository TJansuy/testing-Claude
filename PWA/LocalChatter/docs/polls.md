# Polls

[← Back to LocalChatter](../README.md)

Ask everyone a question. Each person votes in the chat, and every display shows
the results as the votes come in.

## Starting a poll

- Tap ✨ and then **📊 New poll**, write the question and the options (2 to 10),
  and tick **Secret** if you want one. Or:
- Type `/poll What's for lunch? | Pizza | Tacos | Salad`, with a `|` between
  the question and each option. Start with `secret` for a secret poll:
  `/poll secret Who should lead? | Ann | Bob`.

| | Public poll | Secret poll |
| --- | --- | --- |
| Results | Shown live, to everyone and on the displays | Hidden (only the number of votes so far) until its author closes it |
| Who voted for what | Shown under each option | Never shown, even after it closes |

Tap an option to vote. Tap another to change your vote. Votes are per device, so
reconnecting doesn't let anyone vote twice.

## Quizzes

A quiz is a poll with right answers. Type `/quiz Capital of France? | *Paris | Lyon | Nice`,
putting `*` before each right answer, or use ✨ → **🧠 New quiz** and tick **Right**
beside them. At least one answer must be right and at least one wrong.

- Everyone answers once. Your quiz turns **green** if you got it right and
  **red** if not; that's only on your screen, and the right answer isn't given
  away until the quiz closes.
- Whoever set it sees the right answers and doesn't answer.
- Until it's closed, the displays only show how many people have answered.
- **Closed** (`/poll close` or **Close and show answers**): the displays show the
  right answer, the totals, and who got it right and who got it wrong.

## On the displays

Displays show every poll on a board above the chat, numbered **#1**, **#2**…
(oldest first; the numbers are the same on every screen). Several polls can run
at once. A poll stays on the board, even after it closes, until someone clears it.

## Closing and clearing

| Command | Who | What happens |
| --- | --- | --- |
| `/poll close` or **Close poll** | The poll's author | Voting ends. A secret poll shows its results. `/poll close 2` closes poll #2. |
| `/poll clear 2` or **Clear from displays** | Anyone | Poll #2 comes off the displays and voting ends. You can also name it by the start of its question: `/poll clear lunch`. |
| `/poll clear` (or `/poll clear all`) | Anyone | Clears every poll from the displays. |
| `/poll` | Anyone | Shows the running polls in your chat again. |

A secret poll that's cleared before its author closes it never shows its results.

## People who join later

There's no history, so the relay knows nothing about polls. When someone joins
while polls are running, a device that's already here (a display if there is
one) reminds them: "📊 Ann reminded you about 2 polls that are running", with
each poll and its current totals. Only one device sends the reminder; the
others see it and stay quiet. Displays that join later get the polls the same way.

Polls need a relay from this version or later (rebuild the Docker container).
An older relay drops poll messages.
