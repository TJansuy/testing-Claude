// Display mode: a big-screen view for a TV or spare screen. It shows the chat,
// plays effects and sounds, and has no message box. Opened from <app>/Display,
// /role display, or the Display toggle in Settings.
import { $, input } from '../dom';
import { unlock, unlocked } from '../sounds/playback';
import { DISPLAY } from '../state';

function keepScreenOn(): void {
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => { /* not allowed right now */ });
}

/** The Settings toggle switches between the normal app and display mode. */
const toggle = input('display-on');
toggle.checked = DISPLAY;
toggle.addEventListener('change', () => location.assign(toggle.checked ? 'Display/' : './'));

export function startDisplay(): void {
  document.body.classList.add('display-mode');
  // Browsers only play sound after a tap; a display gets one big button for it.
  const tap = $('stage-tap');
  tap.hidden = unlocked();
  tap.addEventListener('click', () => { unlock(); tap.hidden = true; });
  keepScreenOn();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepScreenOn(); });
}
