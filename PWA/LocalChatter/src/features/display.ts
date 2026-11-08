// Display mode: a screen that plays the chat's effects and sounds and never
// shows messages. Opened from <app>/Display.
import { $ } from '../dom';
import { unlock, unlocked } from '../sounds/playback';

function keepScreenOn(): void {
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => { /* not allowed right now */ });
}

export function startDisplay(): void {
  document.body.classList.add('display-mode');
  $('stage').hidden = false;
  const tap = $('stage-tap');
  tap.hidden = unlocked();
  tap.addEventListener('click', () => { unlock(); tap.hidden = true; });
  const exit = $('exit-display');
  exit.hidden = false;
  exit.addEventListener('click', () => location.assign('./'));
  keepScreenOn();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepScreenOn(); });
}
