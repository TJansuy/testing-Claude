// The WebAssembly physics (assembly/physics.ts, built to physics.wasm), and
// names for the slots in its state array. Keep these in step with the indices
// in assembly/physics.ts.

export const I = {
  BX: 0, BY: 1, BVX: 2, BVY: 3, BW: 4, BA: 5,
  R0: 6, R1: 11, // x, y, vx, vy, tilt
  PHASE: 22, SERVER: 23, LAST: 24, BOUNCE0: 25, BOUNCE1: 26, SCORE0: 27, SCORE1: 28,
  TIMER: 29, WINNER: 30, TOSSES: 32, POINT_TO: 33, WHY: 34, CLOCK: 35, RALLY_HITS: 38, CROSSED: 39, ACC: 40, SEED: 41,
} as const;
export const N = 42;
export const PHASE = { SERVE: 0, RALLY: 1, POINT: 2, OVER: 3 } as const;
export const EV = { HIT: 1, BOUNCE: 2, NET: 4, POINT: 8, SERVE: 16, OVER: 32 } as const;
export const WHY = ['', 'out', 'into the net', 'two bounces', 'hit twice', 'missed the serve'];
export const BASELINE = 11.885;
export const NET_H = 0.914;
export const RACKET_HALF = 0.28;
export type Side = 0 | 1;
export const dirOf = (sd: Side): number => (sd === 0 ? 1 : -1);
export const racketOf = (sd: Side): number => (sd === 0 ? I.R0 : I.R1);

interface Exports {
  memory: WebAssembly.Memory;
  state(): number;
  init(seed: number): void;
  setInput(side: number, x: number, y: number, tilt: number): void;
  step(dt: number): void;
  takeEvents(): number;
}

export interface Physics {
  /** The live state (a view into the module's memory). */
  s: Float64Array;
  init(seed: number): void;
  setInput(side: Side, x: number, y: number, tilt: number): void;
  step(dt: number): void;
  takeEvents(): number;
}

function wrap(x: Exports): Physics {
  const s = new Float64Array(x.memory.buffer, x.state(), N);
  return { s, init: (v) => x.init(v >>> 0), setInput: (sd, a, b, t) => x.setInput(sd, a, b, t), step: (dt) => x.step(dt), takeEvents: () => x.takeEvents() };
}

/** Compiles the module once; each call to the result is a separate game. */
export async function loadPhysics(bytes: BufferSource): Promise<() => Physics> {
  const imports = { env: { abort: () => { throw new Error('physics aborted'); } } };
  const mod = await WebAssembly.compile(bytes);
  return () => wrap(new WebAssembly.Instance(mod, imports).exports as unknown as Exports);
}
