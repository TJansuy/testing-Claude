// Roles, admin debug mode and system messages.
import { systemLine, systemNotice } from '../chat/list';
import { $, input, select } from '../dom';
import { sendRaw } from '../net/connection';
import { can, nameOf, ROLES, state } from '../state';
import { KEY, save } from '../storage';
import type { Peer, SystemMessage } from '../types';
import { refreshSoundboard } from './soundboard';

export function setRole(role: string, quiet = false): void {
  const old = state.role;
  state.role = role;
  if (role !== 'display') save(KEY.role, role); // display comes from the link, not a saved choice
  if (!can('debug') && state.debug) setDebug(false, true);
  $('role-line').textContent = 'Your role: ' + role + '. Type /role to see the others.';
  $('debug-row').hidden = !can('debug');
  $('soundboard').hidden = !can('soundboard');
  if (can('soundboard')) void refreshSoundboard();
  updateDebugUi();
  if (quiet || old === role) return;
  systemLine('Your role is now ' + role + '.' + (can('viewSystem') ? ' You\'ll see system messages.' : ''));
  // Everyone receives this; only apps whose role can view system messages show it.
  sendRaw({ type: 'system', kind: 'role', old, role });
}

export function describeRoles(): void {
  const list = Object.keys(ROLES).map((name) => name + (name === state.role ? ' (current)' : '') + ': ' + ROLES[name].description);
  systemLine('Your role is ' + state.role + '. Switch with /role <name>.\n' + list.join('\n'));
}

export function setDebug(on: boolean, quiet = false): void {
  if (on === state.debug) return;
  state.debug = on;
  input('debug-toggle').checked = on;
  updateDebugUi();
  if (!quiet) {
    systemLine('Debug mode ' + (on ? 'on: target effects at anyone, and send messages as other people.' : 'off.'));
    sendRaw({ type: 'system', kind: 'debug', on });
  }
}

function updateDebugUi(): void {
  const on = state.debug && can('debug');
  $('debug-bar').hidden = !on;
  $('fx-target').hidden = !on;
  $('fx-hint').hidden = on; // in debug mode only the chosen person sees it
  $('send-as-row').hidden = !(on && can('impersonate'));
  if (!on) select('send-as').value = '';
  document.body.classList.toggle('debugging', on);
  refreshPeerSelects();
}

function fillSelect(sel: HTMLSelectElement, first: [string, string], people: Peer[]): void {
  const keep = sel.value;
  sel.textContent = '';
  sel.appendChild(new Option(first[1], first[0]));
  people.forEach((p) => sel.appendChild(new Option(p.name, p.id)));
  sel.value = keep;
  if (sel.value !== keep) sel.value = first[0]; // that person left
}

export function refreshPeerSelects(): void {
  const others = Array.from(state.peers.values()).sort((a, b) => a.name.localeCompare(b.name));
  const me = state.me ? [{ id: state.me.id, name: state.me.name + ' (you)' }] : [];
  fillSelect(select('fx-to'), ['all', 'Everyone'], me.concat(others));
  fillSelect(select('send-as'), ['', 'Myself'], others);
}

/** System messages reach everyone; only apps whose role can view them show them. */
export function renderSystem(msg: SystemMessage): void {
  if (!can('viewSystem')) return;
  const me = state.me && state.me.id;
  const name = (p: Peer | undefined): string => (p && p.id === me ? 'You' : (p && p.name) || 'Someone');
  let text: string;
  if (msg.kind === 'role') text = name(msg.from) + ' changed role: ' + msg.old + ' → ' + msg.role;
  else if (msg.kind === 'effect') text = name(msg.from) + ' triggered ' + msg.name + ' for ' + (msg.to === 'all' ? 'everyone' : msg.to === me ? 'you' : nameOf(msg.to));
  else if (msg.kind === 'debug') text = name(msg.from) + ' turned debug mode ' + (msg.on ? 'on' : 'off');
  else return;
  systemNotice('🛡️ ' + text, 'audit');
}

const debugToggle = input('debug-toggle');
debugToggle.addEventListener('change', () => setDebug(debugToggle.checked));
$('debug-off').addEventListener('click', () => setDebug(false));
