// Rally: the physics and rules, compiled to WebAssembly (AssemblyScript).
//
// A side view of a tennis court in metres: x runs along the court (net at 0,
// baselines at ±11.885), y is height. The ball feels gravity, air drag and the
// Magnus force from its spin; it bounces off the ground, the net and the
// rackets with restitution and friction, so spin changes how it bounces and
// how it comes off the strings. Fixed time steps; the state lives in one
// array of f64 that JavaScript reads (and, on the guest, writes) directly.

// ---- Constants (SI units)
const G: f64 = 9.81;
const R: f64 = 0.033;              // ball radius
const MASS: f64 = 0.057;
const INERTIA: f64 = (2.0 / 3.0) * MASS * R * R; // hollow sphere
const DRAG: f64 = 0.02;            // ½ρC_dA/m: a = -DRAG·|v|·v
const MAGNUS: f64 = 0.0011;        // a = MAGNUS·(ω × v)
const SPIN_DECAY: f64 = 0.12;      // per second
const GROUND_E: f64 = 0.76;        // bounce (hard court)
const GROUND_MU: f64 = 0.6;
const NET_E: f64 = 0.2;
const NET_MU: f64 = 0.3;
const STRINGS_E: f64 = 0.82;
const STRINGS_MU: f64 = 0.45;
export const BASELINE: f64 = 11.885;
export const NET_H: f64 = 0.914;
const NET_T: f64 = 0.01;           // half thickness of the net
const RACKET_HALF: f64 = 0.28;     // half the head's length (generous: easier to hit than a real 34 cm head)
const RACKET_T: f64 = 0.015;
const RACKET_SPEED: f64 = 16.0;    // fastest a racket moves
const RACKET_FOLLOW: f64 = 20.0;   // how quickly it chases the player's pointer
const REACH_LOW: f64 = 0.15;
const REACH_HIGH: f64 = 2.7;
const STEP: f64 = 1.0 / 600.0;
export const WIN_POINTS: f64 = 7;

// ---- Phases, events and why a point ended
export const SERVE: i32 = 0, RALLY: i32 = 1, POINT: i32 = 2, OVER: i32 = 3;
export const EV_HIT: i32 = 1, EV_BOUNCE: i32 = 2, EV_NET: i32 = 4, EV_POINT: i32 = 8, EV_SERVE: i32 = 16, EV_OVER: i32 = 32;
export const WHY_OUT: i32 = 1, WHY_NET: i32 = 2, WHY_TWICE: i32 = 3, WHY_DOUBLE: i32 = 4, WHY_MISS: i32 = 5;

// ---- State: one array of f64 (see the index constants; JavaScript uses the same numbers)
export const N: i32 = 42;
const S: usize = memory.data(N * 8, 8);
export const BX = 0, BY = 1, BVX = 2, BVY = 3, BW = 4, BA = 5;  // ball: position, velocity, spin, seam angle
export const R0 = 6, R1 = 11;                                    // rackets: x, y, vx, vy, tilt
export const T0 = 16, T1 = 19;                                   // targets: x, y, tilt adjustment
export const PHASE = 22, SERVER = 23, LAST = 24, BOUNCE0 = 25, BOUNCE1 = 26, SCORE0 = 27, SCORE1 = 28;
export const TIMER = 29, WINNER = 30, EVENTS = 31, TOSSES = 32, POINT_TO = 33, WHY = 34, CLOCK = 35;
export const COOL0 = 36, COOL1 = 37, RALLY_HITS = 38, CROSSED = 39, ACC = 40, SEED = 41;

@inline function g(i: i32): f64 { return load<f64>(S + (<usize>i << 3)); }
@inline function s(i: i32, v: f64): void { store<f64>(S + (<usize>i << 3), v); }

export function state(): usize { return S; }
// The random seed lives in the state too, so a copy of the state plays out exactly the same.
function rand(): f64 { const v = (<u32>g(SEED) * 1664525 + 1013904223); s(SEED, <f64>v); return <f64>(v >>> 8) / 16777216.0; }
@inline function side(x: f64): i32 { return x < 0 ? 0 : 1; }
@inline function dirOf(sd: i32): f64 { return sd == 0 ? 1.0 : -1.0; } // the way a side hits: towards the net
@inline function clamp(v: f64, lo: f64, hi: f64): f64 { return v < lo ? lo : v > hi ? hi : v; }

/** Starts a new game. */
export function init(rseed: u32): void {
  for (let i = 0; i < N; i++) s(i, 0);
  s(SEED, <f64>(rseed | 1));
  s(WINNER, -1);
  s(R0, -9); s(R0 + 1, 1); s(R1, 9); s(R1 + 1, 1);
  s(T0, -9); s(T0 + 1, 1); s(T1, 9); s(T1 + 1, 1);
  s(SERVER, 0);
  toss();
}

/** The server tosses the ball up beside their racket. */
function toss(): void {
  const sv = <i32>g(SERVER);
  const rx = g(sv == 0 ? R0 : R1);
  s(BX, rx + dirOf(sv) * 0.35); s(BY, 1.3); s(BVX, 0); s(BVY, 4.6 + rand() * 0.4); s(BW, 0);
  s(PHASE, SERVE); s(LAST, -1); s(BOUNCE0, 0); s(BOUNCE1, 0); s(RALLY_HITS, 0); s(CROSSED, 0);
  s(EVENTS, <f64>(<i32>g(EVENTS) | EV_SERVE));
}

/** Where a player wants their racket: x, y and how much to tilt it (radians, + opens the face). */
export function setInput(sd: i32, x: f64, y: f64, tilt: f64): void {
  const t = sd == 0 ? T0 : T1;
  s(t, x); s(t + 1, y); s(t + 2, tilt);
}

/** Events since the last call (a bit mask of EV_*). */
export function takeEvents(): i32 { const e = <i32>g(EVENTS); s(EVENTS, 0); return e; }

function award(to: i32, why: i32): void {
  const k = to == 0 ? SCORE0 : SCORE1;
  s(k, g(k) + 1);
  s(POINT_TO, to); s(WHY, why);
  s(PHASE, POINT); s(TIMER, 1.6);
  let ev = <i32>g(EVENTS) | EV_POINT;
  const a = g(SCORE0), b = g(SCORE1);
  if ((a >= WIN_POINTS || b >= WIN_POINTS) && Math.abs(a - b) >= 2) { s(WINNER, a > b ? 0 : 1); s(PHASE, OVER); s(TIMER, 6); ev |= EV_OVER; }
  s(EVENTS, ev);
}

/** Next point: the serve changes sides every two points. */
function nextPoint(): void {
  const played = <i32>(g(SCORE0) + g(SCORE1));
  s(SERVER, <f64>(((played + 1) >> 1) & 1));
  toss();
}

/** An impulse at a contact: bounce along the normal (nx, ny), friction along the surface,
 *  which trades between the ball's speed and its spin. (sx, sy): the surface's own velocity. */
function contact(nx: f64, ny: f64, sx: f64, sy: f64, e: f64, mu: f64): f64 {
  let rvx = g(BVX) - sx, rvy = g(BVY) - sy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const jn = -(1 + e) * vn * MASS;
  rvx += (jn / MASS) * nx; rvy += (jn / MASS) * ny;
  // Slip of the contact point along the tangent t = (-ny, nx).
  const tx = -ny, ty = nx;
  const w = g(BW);
  const slip = rvx * tx + rvy * ty - w * R;
  let jt = -slip * MASS / 2.5;
  const lim = mu * jn;
  jt = clamp(jt, -lim, lim);
  rvx += (jt / MASS) * tx; rvy += (jt / MASS) * ty;
  s(BW, w - (R * jt) / INERTIA);
  s(BVX, rvx + sx); s(BVY, rvy + sy);
  return -vn;
}

function moveRacket(r: i32, t: i32, sd: i32, dt: f64): void {
  // Each player stays on their own side of the net, within reach.
  const tx = sd == 0 ? clamp(g(t), -15.0, -0.25) : clamp(g(t), 0.25, 15.0);
  const ty = clamp(g(t + 1), REACH_LOW, REACH_HIGH);
  let vx = (tx - g(r)) * RACKET_FOLLOW, vy = (ty - g(r + 1)) * RACKET_FOLLOW;
  const sp = Math.sqrt(vx * vx + vy * vy);
  if (sp > RACKET_SPEED) { vx *= RACKET_SPEED / sp; vy *= RACKET_SPEED / sp; }
  s(r, g(r) + vx * dt); s(r + 1, g(r + 1) + vy * dt); s(r + 2, vx); s(r + 3, vy);
  // The face opens low down (to lift the ball over the net) and closes up high (to hit down),
  // plus whatever tilt the player adds.
  const tilt = clamp(0.2 - 0.15 * (g(r + 1) - 0.8) + g(t + 2), -0.7, 0.9);
  s(r + 4, tilt);
}

/** The racket's head is a short segment; its face points towards the net, tilted. */
function hitRacket(sd: i32): void {
  const r = sd == 0 ? R0 : R1;
  const cool = sd == 0 ? COOL0 : COOL1;
  if (g(cool) > 0) return;
  const dir = dirOf(sd);
  const tilt = g(r + 4);
  const nx = dir * Math.cos(tilt), ny = Math.sin(tilt);   // face normal
  const ax = -ny, ay = nx;                                  // along the head
  const dx = g(BX) - g(r), dy = g(BY) - g(r + 1);
  const along = clamp(dx * ax + dy * ay, -RACKET_HALF, RACKET_HALF);
  const cx = dx - along * ax, cy = dy - along * ay;          // from the closest point to the ball
  const d2 = cx * cx + cy * cy, min = R + RACKET_T;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2);
  // Normal from the racket to the ball (either face can hit).
  let px = nx, py = ny;
  if (d > 1e-9) { px = cx / d; py = cy / d; }
  s(BX, g(BX) + px * (min - d)); s(BY, g(BY) + py * (min - d));
  if (contact(px, py, g(r + 2), g(r + 3), STRINGS_E, STRINGS_MU) <= 0) return;
  s(cool, 0.18);
  s(EVENTS, <f64>(<i32>g(EVENTS) | EV_HIT));
  const phase = <i32>g(PHASE);
  if (phase == SERVE) { if (sd != <i32>g(SERVER)) return; s(PHASE, RALLY); }
  else if (phase != RALLY) return;
  if (<i32>g(LAST) == sd && g(CROSSED) == 0 && g(RALLY_HITS) > 0) { award(1 - sd, WHY_DOUBLE); return; }
  s(LAST, sd); s(BOUNCE0, 0); s(BOUNCE1, 0); s(CROSSED, 0); s(RALLY_HITS, g(RALLY_HITS) + 1);
}

/** The rules, when the ball lands at x. */
function landed(x: f64): void {
  const phase = <i32>g(PHASE);
  if (phase == SERVE) {
    // A toss nobody hit: toss again (three misses lose the point).
    const n = g(TOSSES) + 1;
    s(TOSSES, n);
    if (n >= 3) { s(TOSSES, 0); award(1 - <i32>g(SERVER), WHY_MISS); } else { s(BVY, 0); toss(); }
    return;
  }
  if (phase != RALLY) return;
  const hitter = <i32>g(LAST);
  const sd = side(x);
  if (sd == hitter) { award(1 - hitter, g(CROSSED) == 0 ? WHY_NET : WHY_TWICE); return; }
  if (Math.abs(x) > BASELINE && (sd == 1 ? g(BOUNCE1) : g(BOUNCE0)) == 0) { award(1 - hitter, WHY_OUT); return; }
  const k = sd == 0 ? BOUNCE0 : BOUNCE1;
  s(k, g(k) + 1);
  if (g(k) >= 2) award(hitter, WHY_TWICE);
}

function tick(dt: f64): void {
  s(CLOCK, g(CLOCK) + dt);
  moveRacket(R0, T0, 0, dt);
  moveRacket(R1, T1, 1, dt);
  s(COOL0, Math.max(0, g(COOL0) - dt)); s(COOL1, Math.max(0, g(COOL1) - dt));
  const phase = <i32>g(PHASE);
  if (phase == POINT || phase == OVER) {
    s(TIMER, g(TIMER) - dt);
    if (g(TIMER) <= 0) { if (phase == OVER) init(<u32>g(SEED)); else nextPoint(); return; }
  }
  // Forces: gravity, drag and the Magnus force from spin.
  let vx = g(BVX), vy = g(BVY);
  const w = g(BW);
  const sp = Math.sqrt(vx * vx + vy * vy);
  const ax = -DRAG * sp * vx + MAGNUS * (-w * vy);
  const ay = -G - DRAG * sp * vy + MAGNUS * (w * vx);
  vx += ax * dt; vy += ay * dt;
  s(BVX, vx); s(BVY, vy);
  const before = g(BX);
  s(BX, g(BX) + vx * dt); s(BY, g(BY) + vy * dt);
  s(BW, w * (1 - SPIN_DECAY * dt));
  s(BA, g(BA) + g(BW) * dt);
  if ((before < 0) != (g(BX) < 0) && g(BY) > NET_H) s(CROSSED, 1);
  // The net: a thin wall from the ground to NET_H at x = 0.
  const bx = g(BX), by = g(BY);
  if (Math.abs(bx) < R + NET_T && by < NET_H + R) {
    if (by > NET_H) {
      // Over the tape: bounce off its rounded top.
      const dx = bx, dy = by - NET_H, d = Math.sqrt(dx * dx + dy * dy);
      if (d < R + NET_T && d > 1e-9) {
        s(BX, dx / d * (R + NET_T)); s(BY, NET_H + dy / d * (R + NET_T));
        if (contact(dx / d, dy / d, 0, 0, NET_E, NET_MU) > 0.5) s(EVENTS, <f64>(<i32>g(EVENTS) | EV_NET));
      }
    } else {
      const nx: f64 = before < 0 ? -1 : 1;
      s(BX, nx * (R + NET_T));
      if (contact(nx, 0, 0, 0, NET_E, NET_MU) > 0.5) s(EVENTS, <f64>(<i32>g(EVENTS) | EV_NET));
    }
  }
  // The ground.
  if (g(BY) < R) {
    s(BY, R);
    const hit = contact(0, 1, 0, 0, GROUND_E, GROUND_MU);
    if (hit > 0.6) { s(EVENTS, <f64>(<i32>g(EVENTS) | EV_BOUNCE)); landed(g(BX)); }
    else if (hit > 0 && <i32>g(PHASE) == RALLY) landed(g(BX)); // rolling: still counts
  }
  // Rackets.
  hitRacket(0);
  hitRacket(1);
  // Gone off the screen without landing: out.
  if (Math.abs(g(BX)) > 22 && <i32>g(PHASE) == RALLY) award(1 - <i32>g(LAST), WHY_OUT);
}

/** Advances the game by dt seconds, in fixed steps (the remainder is kept in the state). */
export function step(dt: f64): void {
  let acc = g(ACC) + Math.min(dt, 0.1);
  while (acc >= STEP - 1e-9) { tick(STEP); acc -= STEP; }
  s(ACC, acc < 0 ? 0 : acc);
}
