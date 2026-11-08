// The WebSocket connection to the relay, and sending.
import { banner, systemLine } from '../chat/list';
import { renderMessage } from '../chat/message';
import { select } from '../dom';
import { parseEffect } from '../effects';
import * as LANG from '../languages';
import { can, connected, state } from '../state';
import type { ChatMessage, OutgoingChat, ServerMessage } from '../types';
import { certBanner, renderPeople, setStatus } from '../ui/status';
import { openSettings } from '../ui/settings';
import { randomId } from '../util';
import { chatGuess } from '../games';
import { handle } from './handle';

export function connect(): void {
  clearTimeout(state.retryTimer);
  if (!state.relay) {
    setStatus('off', 'No server set');
    openSettings();
    return;
  }
  if (state.ws) { state.ws.onclose = null; state.ws.close(); state.ws = null; }
  state.wanted = true;
  setStatus('connecting', 'Connecting…');

  let ws: WebSocket;
  try { ws = new WebSocket(state.relay); } catch {
    setStatus('error', 'Invalid server address');
    return;
  }
  state.ws = ws;
  let opened = false;

  ws.onopen = () => {
    opened = true;
    state.retry = 0;
    ws.send(JSON.stringify({ type: 'hello', name: state.name }));
  };
  ws.onmessage = (ev: MessageEvent) => {
    let msg: ServerMessage;
    try { msg = JSON.parse(String(ev.data)) as ServerMessage; } catch { return; }
    handle(msg);
  };
  ws.onclose = () => {
    if (state.ws !== ws) return;
    state.ws = null;
    const wasIn = !!state.me;
    state.me = null;
    state.peers.clear();
    renderPeople();
    if (wasIn) systemLine('Disconnected from the server');
    if (!state.wanted) { setStatus('off', 'Not connected'); return; }
    if (!opened) banner(certBanner());
    // Back off: 1s, 2s, 4s ... up to 30s.
    const delay = Math.min(30000, 1000 * Math.pow(2, state.retry++));
    setStatus('error', 'Offline · retrying in ' + Math.round(delay / 1000) + 's');
    state.retryTimer = setTimeout(connect, delay);
  };
}

export function disconnect(): void {
  state.wanted = false;
  clearTimeout(state.retryTimer);
  if (state.ws) state.ws.close();
  setStatus('off', 'Not connected');
}

/** Reconnect quickly when the device comes back online or the app is reopened. */
export function nudge(): void {
  if (state.wanted && !state.ws) { state.retry = 0; connect(); }
}

export function sendRaw(obj: object): boolean {
  if (!connected() || !state.ws) return false;
  state.ws.send(JSON.stringify(obj));
  return true;
}

/** Sends a chat message and shows it here. Returns false when not connected. */
export function sendChat(payload: OutgoingChat): boolean {
  if (!connected() || !state.ws || !state.me) return false;
  const msg = payload as ChatMessage;
  msg.type = 'chat';
  msg.id = randomId();
  // Written in your chosen language (effects stay effects, in no language).
  const sp = LANG.speaking();
  if (sp && msg.text && !parseEffect(msg.text)) msg.lang = sp;
  // Admin debug mode: send as someone else.
  const as = state.debug && can('impersonate') ? select('send-as').value : '';
  const asPeer = as && as !== state.me.id ? state.peers.get(as) : undefined;
  if (asPeer) msg.as = { id: asPeer.id, name: asPeer.name };
  state.ws.send(JSON.stringify(msg));
  msg.at = Date.now();
  renderMessage(msg, true);
  chatGuess(msg, state.me);
  return true;
}
