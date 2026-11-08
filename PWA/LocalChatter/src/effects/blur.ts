// Blur: everything slowly drifts out of focus into a fuzzy cloud, then clears
// smoothly when it ends. The Stop button stays sharp.
import { EffectControl, vibrate } from './shared';

export function startBlur(): EffectControl {
  vibrate(30);
  const body = document.body;
  const fog = document.createElement('div');
  fog.className = 'fx fx-fog';
  fog.setAttribute('aria-hidden', 'true');
  body.appendChild(fog);
  body.classList.remove('fx-blur-out');
  void body.offsetWidth; // start the slow fade from sharp
  body.classList.add('fx-blur');
  requestAnimationFrame(() => fog.classList.add('on'));
  let done: ReturnType<typeof setTimeout> | undefined;
  return {
    stop(_early, hard) {
      clearTimeout(done);
      if (hard) { body.classList.remove('fx-blur', 'fx-blur-out'); fog.remove(); return; }
      // Clear up faster than it fogged over.
      body.classList.add('fx-blur-out');
      body.classList.remove('fx-blur');
      fog.classList.add('out');
      fog.classList.remove('on');
      done = setTimeout(() => { body.classList.remove('fx-blur-out'); fog.remove(); }, 1700);
    },
  };
}
