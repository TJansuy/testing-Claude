// Earthquake: shakes in 1.6 s waves (each strong, then easing) and rumbles each
// wave on phones that can vibrate, until stopped.
import { EffectControl, holdGlow, reducedMotion, vibrate } from './shared';

// Phones can only switch the motor on and off, not set its strength. Short pulses
// with more "on" per pulse feel stronger, so intensity (0-1) becomes the share of
// each pulse the motor is on. Chrome accepts at most 99 steps, which sets the length.
const PULSE_MS = 40;
const MAX_STEPS = 98;
function rumblePattern(intensities: number[]): number[] {
  const pattern: number[] = [];
  let rest = 0;
  for (let i = 0; i < intensities.length && pattern.length < MAX_STEPS - 1; i++) {
    const k = Math.max(0, Math.min(1, intensities[i]));
    const on = Math.round(PULSE_MS * k);
    if (on < 6) { rest += PULSE_MS; continue; } // too short to feel: treat as a pause
    if (pattern.length === 0 && rest) pattern.push(0); // patterns start with "on"
    if (rest) pattern.push(rest);
    pattern.push(on);
    rest = PULSE_MS - on;
  }
  return pattern;
}

/** A quick build, a main shock with random jolts, then fading aftershocks.
 *  Randomised, so no two quakes feel the same. Matches the 1.6 s shake. */
export function quakeRumble(): number[] {
  const steps = Math.round(1600 / PULSE_MS);
  const peakAt = 0.12 + Math.random() * 0.1;
  const aftershock = 0.55 + Math.random() * 0.2;
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    let envelope = t < peakAt ? t / peakAt : Math.pow(1 - (t - peakAt) / (1 - peakAt), 1.6);
    envelope += 0.35 * Math.exp(-Math.pow((t - aftershock) / 0.06, 2)); // a smaller second wave
    const jolt = 0.65 + Math.random() * 0.35;
    out.push(Math.min(1, envelope * jolt));
  }
  return rumblePattern(out);
}

export function startQuake(): EffectControl {
  let next: ReturnType<typeof setTimeout>;
  const rumbleWave = (): void => vibrate(quakeRumble());
  rumbleWave();
  // The next wave's rumble starts just after 1.6 s, so a single quake rumbles once.
  next = setTimeout(function loop() { rumbleWave(); next = setTimeout(loop, 1600); }, 1650);
  if (reducedMotion()) {
    const g = holdGlow('fx-quake-glow');
    return { stop(early, hard) { clearTimeout(next); if (early) vibrate(0); g.stop(early, hard); } };
  }
  const root = document.body;
  root.classList.remove('fx-shake');
  void root.offsetWidth; // restart the animation
  root.classList.add('fx-shake');
  return {
    stop(early) {
      clearTimeout(next);
      if (early) vibrate(0);
      root.classList.remove('fx-shake');
    },
  };
}
