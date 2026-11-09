// Your racket: it follows the mouse or your finger (a little above the finger,
// so you can see it), or the arrow keys / WASD. Moving fast swings hard.
// Scroll, Q/E or the tilt buttons open or close the racket face.
import { toWorld } from './scene';

export class Controls {
  x = -9;
  y = 1;
  tilt = 0;
  private keys = new Set<string>();

  constructor(private canvas: HTMLCanvasElement, private mirrored: () => boolean) {
    const move = (e: PointerEvent): void => {
      const [x, y] = toWorld(canvas, e.clientX, e.clientY, mirrored());
      this.x = x;
      this.y = y + (e.pointerType === 'touch' ? 0.55 : 0);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); move(e); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.turn(-e.deltaY * 0.0015); }, { passive: false });
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === 'q') this.turn(0.08);
      else if (k === 'e') this.turn(-0.08);
      else if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) { this.keys.add(k); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  /** Tilt: + opens the face (more lift), − closes it. */
  turn(by: number): void { this.tilt = Math.max(-0.6, Math.min(0.6, this.tilt + by)); }

  /** Moves the target with the keys (screen directions, so it works mirrored too). */
  update(dt: number): void {
    const k = this.keys, speed = 9 * dt;
    const right = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const up = (k.has('arrowup') || k.has('w') ? 1 : 0) - (k.has('arrowdown') || k.has('s') ? 1 : 0);
    this.x += right * speed * (this.mirrored() ? -1 : 1);
    this.y = Math.max(0.1, Math.min(3, this.y + up * speed));
  }

  /** Starts each game from your side's home position. */
  home(x: number): void { this.x = x; this.y = 1; this.tilt = 0; }
}
