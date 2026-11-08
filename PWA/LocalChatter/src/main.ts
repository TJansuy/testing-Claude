// LocalChatter: starts the app. Messages live only in memory on this page;
// nothing is kept after you leave.
import { refreshLanguages } from './chat/list';
import * as FX from './effects';
import { catchUp, setupNotifySetting } from './features/background';
import { startDisplay } from './features/display';
import { renderFavourites } from './features/favourites';
import { setRole } from './features/roles';
import { setupUpdates } from './features/updates';
import { connect, nudge } from './net/connection';
import { DISPLAY, ROLES, state } from './state';
import { KEY, load, save } from './storage';
import { applyLayout } from './ui/dashboard';
import { initSettings, openSettings } from './ui/settings';
import { setStatus } from './ui/status';
import { normaliseRelay } from './util';
import './features/soundboard';
import './polls/commands';
import './games';
import './scan/menu';
import './ui/composer';

// For debugging and tests: the effects API.
window.LocalChatterFX = FX;

/** The server's setup page links here with #relay=<address>. */
function readSetupLink(): void {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const relay = normaliseRelay(new URLSearchParams(hash).get('relay'));
  if (relay) save(KEY.relay, relay);
  history.replaceState(null, '', location.pathname + location.search);
}

function start(): void {
  readSetupLink();
  state.relay = load(KEY.relay);
  state.name = load(DISPLAY ? KEY.displayName : KEY.name) || (DISPLAY ? 'Display' : '');
  const firstRun = !state.name;
  if (firstRun) state.name = 'Guest ' + Math.floor(1000 + Math.random() * 9000);
  const vibration = load(KEY.vibrate) !== 'off';
  FX.setVibration(vibration);
  state.soundOn = load(KEY.soundOn) !== 'off';
  initSettings(vibration);
  applyLayout();
  renderFavourites();
  refreshLanguages();
  setupNotifySetting();
  const savedRole = load(KEY.role);
  if (DISPLAY) { setRole('display', true); startDisplay(); }
  else setRole(ROLES[savedRole] && savedRole !== 'display' ? savedRole : 'member', true);
  setupUpdates();
  if (state.relay && !firstRun) {
    connect();
  } else {
    // First run: pick a name (and server, if not set up yet) before joining.
    state.wanted = !!state.relay;
    setStatus('off', state.relay ? 'Choose a name to join' : 'No server set');
    openSettings();
  }
}

window.addEventListener('online', nudge);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  catchUp(); // show what arrived while away
  nudge();
});

start();
