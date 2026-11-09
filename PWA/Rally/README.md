# Rally

A proof of concept: tennis for two on the local network, seen from the side.
The ball's flight is a real physics simulation running in **WebAssembly**, and
everything is drawn with **WebGL**. A game starts as soon as a second person
joins; anyone else who joins watches. You can also practise against the
computer, offline.

## Playing

1. Start the [Rally server](#the-server) on a machine on your network.
2. On each device, open the server's address (e.g. `https://192.168.1.50:8444/`),
   accept its certificate, and tap **Play Rally**. That opens the game with the
   server filled in.
3. Enter a name and tap **Play on the network**. When a second person joins,
   the game starts.

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

## Playing over the network

The left player's device runs the game: it gets the right player's racket from
the server and sends the game's state back about 60 times a second. The right
player's device sends its racket and also runs the physics between updates, so
the ball moves smoothly; it keeps its own steady game time and fast-forwards
each update to it, so only real differences are corrected (on a LAN at 60 fps,
its ball is within a fraction of a millimetre of the host's). Watchers do the
same without a racket. If a player leaves, the next person in takes their
place and a new game starts.

## The server

A small Node.js server in [`server/`](server/), run in Docker on any machine on
the network (a laptop, a Raspberry Pi, a NAS…):

```sh
cd PWA/Rally/server
RALLY_HOST=192.168.1.50 docker compose up -d --build
```

No Docker? With Node.js 20+: `npm ci && ADVERTISED_HOST=192.168.1.50 npm start`.

It serves a page at `https://<address>:8444/` that devices open once to accept
its certificate (it makes its own, because there's no public certificate for a
local address), with a **Play Rally** button that opens the game connected to it.
The game itself talks to it over a WebSocket on `/rally`: it pairs the first two
people as players, starts a game as soon as there are two, and passes their
messages between them. Anyone else watches; when a player leaves, the next
person takes their place. It keeps no game state and logs nothing about players.

| Compose variable | Server variable | Default | |
| --- | --- | --- | --- |
| `RALLY_HOST` | `ADVERTISED_HOST` | *(empty)* | The server's LAN address, for its certificate and page. If empty, whatever address a device used. |
| `RALLY_PORT` | `ADVERTISED_PORT` | `8444` | The port devices use. |
| `RALLY_GAME_URL` | `GAME_URL` | `https://tjansuy.github.io/testing-Claude/PWA/Rally/` | Where the game is hosted. |
| – | `PORT` | `8444` | The port inside the container. |
| – | `CERT_DIR` | `/certs` | Where the certificate is kept (a Docker volume). |
| – | `TLS` | `on` | `off` serves plain HTTP/WS, only for use behind your own TLS proxy. |

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
| `src/game.ts` | The game loop (fixed 1/120 s ticks) and its modes: demo, practice, host, guest, watch. |
| `src/render.ts` | The WebGL renderer: one shader that draws every shape as a signed-distance field. |
| `src/scene.ts` | The court, net, rackets, ball, trail, shadow and sparks. |
| `src/bot.ts` | The computer player. |
| `src/input.ts`, `src/hud.ts`, `src/sound.ts`, `src/net.ts`, `src/main.ts` | Controls, scoreboard, synthesised sounds, the connection, and the lobby. |
| `src/sw.ts` | Service worker: caches everything, so practice works offline. |

The server is in `server/` (see below).

Build from the repository root with `npm run build` (TypeScript with esbuild, and
the physics with AssemblyScript); `npm run check` type-checks both.
