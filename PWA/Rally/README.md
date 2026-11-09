# Rally

A proof of concept: tennis for two, seen from the side, played straight from
one device to another. The ball's flight is a real physics simulation running
in **WebAssembly**, and everything is drawn with **WebGL**. There's no server
at all: the two devices connect directly over the Wi-Fi they share (or one
phone's hotspot), with no internet needed. The game starts as soon as they're
connected. You can also practise against the computer, offline.

## Playing

1. Both devices open Rally and join the same Wi-Fi, or one connects to the
   other's hotspot.
2. One player taps **Host a game**. A QR code appears.
3. The other player scans it with their phone's camera (it's a link that opens
   Rally ready to join), or taps **Join a game** and scans it there. A QR code
   appears on their screen too: their reply.
4. The host taps **Scan their reply** and scans it (or scans it with their
   phone's own camera: the link hands the reply to the waiting game).
5. The devices connect, and the game starts.

No camera? Each code can be copied and pasted instead, e.g. sent in a message.

| | |
| --- | --- |
| Move | Your racket follows the mouse or your finger (it sits a little above your finger so you can see it), or the arrow keys / WASD. |
| Hit | Swing the racket through the ball. A faster swing hits harder. |
| Spin | Swing upwards to brush the back of the ball: topspin, which makes it dip into the court and kick up off the bounce. Swing down for backspin, which floats. |
| Tilt | Low down the face opens to lift the ball over the net; up high it closes to hit down. Add more with scroll, Q/E or ⤴ ⤵. |
| Rules | Clear the net and land in. One bounce on your side, then you must hit it back (or volley it before it bounces). Serves alternate every two points. First to 7, winning by 2; a new game starts by itself. |

Each player sees themselves on the left (the right player's view is mirrored).
Turn phones sideways.

## The physics (`assembly/physics.ts` → `physics.wasm`)

Written in [AssemblyScript](https://www.assemblyscript.org/) (a TypeScript-like
language that compiles to WebAssembly), in SI units, in fixed steps of 1/600 s:

- **Ball**: a real tennis ball (radius 3.3 cm, 57 g, a hollow sphere for its spin).
- **Gravity**, and **air drag** proportional to the speed squared.
- **Magnus force** from spin (ω × v): topspin pulls the ball down, backspin holds it up. Spin slowly decays.
- **Contacts** with the ground, the net (and its rounded tape) and the rackets: an
  impulse along the normal with a restitution (how bouncy), and friction along
  the surface that trades the ball's speed for spin and back. So spin changes
  how it bounces, and the racket's motion across the ball puts spin on it.
- **Rackets** chase where the player points, up to 16 m/s, and stay on their own
  side of the net. The head is 56 cm long: generous on purpose, so it's
  playable with a mouse (a real one is about 34 cm). Everything else is life size.
- The **rules** (what counts as out, into the net, two bounces, a double hit, a
  missed serve) are worked out in the same module.

The whole game is one array of numbers in the module's memory, which JavaScript
reads to draw, and which the network copies.

Heights are drawn stretched (about 2.8× on a widescreen) because a court is 24 m
long but the ball rarely goes above 4 m; the physics isn't stretched.

## Playing device to device (`src/p2p.ts`, `src/sdp.ts`, `src/lobby.ts`)

The two devices talk directly with **WebRTC** data channels. Setting up a WebRTC
connection normally needs a server to pass each side's connection details to the
other; here people pass them by hand instead, as QR codes:

- WebRTC describes a connection in a few kilobytes of text, too much for a QR
  code you can scan across a table. A data-only connection needs just five
  things from it (the ICE username and password, the certificate fingerprint,
  its role, and the addresses to try), so that's all a code holds: about 100
  characters. The other device rebuilds a standard description from it.
- No internet servers are asked for addresses (no STUN or TURN), so it works on
  a network with no internet at all. That also means both devices have to be on
  the same network.
- Browsers hide a device's local address behind a random `name.local` name,
  which the other device looks up on the local network (mDNS). Most home and
  hotspot networks allow that. Some guest or office Wi-Fi networks block devices
  from seeing each other, and then they can't connect.
- Two channels: one for the game's state and rackets, unordered and never
  resent (a late update is useless, the next is on its way), and a reliable one
  for everything else.

The host's device runs the game: it gets the other player's racket and sends
the game's state back about 60 times a second. The other device sends its
racket and also runs the physics between updates, so the ball moves smoothly;
it keeps its own steady game time and fast-forwards each update to it, so only
real differences are corrected (at 60 fps, its ball stays within a millimetre or
so of the host's). If either player leaves, the other is told and goes back to
the start. It's two players only: there's no watching.

## The computer player (`src/bot.ts`)

It plays with the real physics: it copies the game into a second WebAssembly
instance, looks ahead to find where it can reach the ball, then tries swings
(how hard, how much topspin, the tilt) until one lands in. It's your practice
opponent, and both players in the demo that plays while you wait.

## Files

| File | |
| --- | --- |
| `assembly/physics.ts` | The physics and rules (AssemblyScript), built to `physics.wasm`. |
| `src/physics.ts` | Loads the module, and names the slots in its state. |
| `src/game.ts` | The game loop (fixed 1/120 s ticks) and its modes: demo, practice, host, guest. |
| `src/render.ts` | The WebGL renderer: one shader that draws every shape as a signed-distance field. |
| `src/scene.ts` | The court, net, rackets, ball, trail, shadow and sparks. |
| `src/bot.ts` | The computer player. |
| `src/p2p.ts`, `src/sdp.ts` | The direct connection (WebRTC) and its short codes. |
| `src/lobby.ts`, `src/qr.ts` | Hosting and joining, and drawing and scanning QR codes. |
| `src/input.ts`, `src/hud.ts`, `src/sound.ts`, `src/main.ts` | Controls, scoreboard, synthesised sounds, and starting up. |
| `src/sw.ts` | Service worker: caches everything, so it opens with no internet. |
| `vendor/jsQR.js` | QR decoder (jsQR 1.4.0, Apache-2.0), for browsers without a built-in one. QR codes are drawn with qrcode-generator (MIT), bundled. |


Build from the repository root with `npm run build` (TypeScript with esbuild, and
the physics with AssemblyScript); `npm run check` type-checks both. Rally is all
static files: GitHub Pages (or any web server) serves it as it is.
