// Connection status, the people list and the "can't reach the server" banner.
import { $, button, el } from '../dom';
import { refreshPeerSelects } from '../features/roles';
import { stopNfc } from '../scan/nfc';
import { closeScanMenu } from '../scan/menu';
import { DISPLAY, state } from '../state';
import { serverPage } from '../util';
import { prefill } from './composer';
import { closeEffectsPanel, dashboard } from './dashboard';
import { onStatus } from './header';

export type StatusKind = 'on' | 'off' | 'connecting' | 'error';

export function setStatus(kind: StatusKind, text: string): void {
  const s = $('status');
  s.dataset.state = kind;
  s.textContent = text;
  $('header-tab').dataset.state = kind;
  const isOn = kind === 'on';
  ['send', 'mic', 'attach', 'effects', 'scan'].forEach((id) => { button(id).disabled = !isOn; });
  if (!isOn) { closeEffectsPanel(); closeScanMenu(); }
  dashboard.classList.toggle('offline', !isOn);
  // Keep scanning through brief reconnects; stop only when the user disconnects.
  if (kind === 'off') stopNfc();
  onStatus(isOn);
}

function onlineText(): string {
  const n = state.peers.size + 1;
  return 'Connected · ' + n + (n === 1 ? ' person' : ' people') + ' here';
}

export function renderPeople(): void {
  const ul = $('people');
  ul.textContent = '';
  if (!state.me) {
    $('people-count').textContent = '';
    ul.appendChild(el('li', null, 'Not connected'));
    return;
  }
  $('people-count').textContent = '(' + (state.peers.size + 1) + ')';
  ul.appendChild(el('li', null, state.me.name + ' (you)'));
  state.peers.forEach((p) => {
    const li = el('li');
    if (DISPLAY) { li.textContent = p.name; ul.appendChild(li); return; }
    // Tap a name to start a whisper to them.
    const b = el('button', 'link-button', p.name);
    b.type = 'button';
    b.title = 'Whisper to ' + p.name;
    b.addEventListener('click', () => prefill('/whisper ' + p.name + ': '));
    li.appendChild(b);
    ul.appendChild(li);
  });
  setStatus('on', onlineText());
  refreshPeerSelects();
}

export function certBanner(): DocumentFragment {
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createTextNode('Can\'t reach the server. Check you\'re on the same Wi-Fi. If this is a new device, '));
  const a = el('a', null, 'open the server page');
  a.href = serverPage(state.relay);
  a.target = '_blank';
  a.rel = 'noopener';
  frag.appendChild(a);
  frag.appendChild(document.createTextNode(' and accept its certificate, then come back.'));
  return frag;
}
