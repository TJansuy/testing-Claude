// Settings, now a tab in the dashboard: name, server, languages, sounds,
// notifications, vibration, header and role.
import { banner, refreshLanguages } from '../chat/list';
import { $, input, select } from '../dom';
import * as FX from '../effects';
import * as LANG from '../languages';
import { connect, disconnect } from '../net/connection';
import { stopAll } from '../sounds/playback';
import { DISPLAY, state } from '../state';
import { KEY, save } from '../storage';
import { normaliseRelay, serverPage } from '../util';
import { closeDashboard, openDashboard } from './dashboard';
import { renderPeople, setStatus } from './status';

const nameBox = input('name');
const relayBox = input('relay');
const langsBox = input('langs');
const speakBox = select('speak');

export function openSettings(): void {
  nameBox.value = state.name;
  relayBox.value = state.relay;
  langsBox.value = LANG.known().join(', ');
  fillSpeak(LANG.known(), LANG.speaking());
  const page = serverPage(state.relay);
  $('server-link-row').hidden = !page;
  if (page) $<HTMLAnchorElement>('server-link').href = page;
  renderPeople();
  openDashboard('settings');
}

/** The "write in" choices: Default plus each language in the list. */
function fillSpeak(langs: string[], current: string): void {
  speakBox.textContent = '';
  speakBox.appendChild(new Option('Default', ''));
  langs.filter((n) => !LANG.isDefault(n)).forEach((n) => speakBox.appendChild(new Option(n, n)));
  speakBox.value = current;
  if (speakBox.value !== current) speakBox.value = '';
}
langsBox.addEventListener('input', () => fillSpeak(LANG.split(langsBox.value), speakBox.value));

// Language choices apply straight away, without needing Save (which is about
// your name and the server). "change" fires when you leave the box or pick an option.
langsBox.addEventListener('change', () => {
  LANG.setKnown(LANG.split(langsBox.value));
  fillSpeak(LANG.known(), LANG.speaking());
  refreshLanguages();
});
speakBox.addEventListener('change', () => {
  LANG.setSpeaking(speakBox.value);
  refreshLanguages();
});

$('open-settings').addEventListener('click', openSettings);
$('status').addEventListener('click', openSettings);

$<HTMLFormElement>('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameBox.value.trim().slice(0, 32);
  const relay = normaliseRelay(relayBox.value);
  if (relayBox.value.trim() && !relay) {
    relayBox.setCustomValidity('Enter an address like wss://192.168.1.50:8443/ws');
    relayBox.reportValidity();
    return;
  }
  if (name) save(DISPLAY ? KEY.displayName : KEY.name, name);
  LANG.setKnown(LANG.split(langsBox.value));
  LANG.setSpeaking(speakBox.value);
  refreshLanguages();
  if (name && name !== state.name) {
    state.name = name;
    if (state.ws && state.ws.readyState === WebSocket.OPEN && state.me) state.ws.send(JSON.stringify({ type: 'rename', name }));
  }
  const changed = relay !== state.relay;
  state.relay = relay;
  save(KEY.relay, relay);
  closeDashboard();
  if (!relay) { disconnect(); setStatus('off', 'No server set'); return; }
  if (changed || !state.ws) { banner(null); state.retry = 0; connect(); }
});
relayBox.addEventListener('input', () => relayBox.setCustomValidity(''));

$('disconnect').addEventListener('click', () => { disconnect(); closeDashboard(); });

const vibrateBox = input('vibrate-on');
vibrateBox.addEventListener('change', () => {
  save(KEY.vibrate, vibrateBox.checked ? 'on' : 'off');
  FX.setVibration(vibrateBox.checked);
});
const soundBox = input('sound-on');
soundBox.addEventListener('change', () => {
  state.soundOn = soundBox.checked;
  save(KEY.soundOn, state.soundOn ? 'on' : 'off');
  if (!state.soundOn) stopAll();
});

/** Sets the toggles from what's saved. */
export function initSettings(vibrationOn: boolean): void {
  $('vibrate-row').hidden = !FX.canVibrate;
  vibrateBox.checked = vibrationOn;
  soundBox.checked = state.soundOn;
}

