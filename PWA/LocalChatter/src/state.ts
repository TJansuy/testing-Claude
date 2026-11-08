// Shared app state, display mode and roles.
import type { Peer } from './types';

/** Display mode: opened from <app>/Display (which forwards here with ?display). */
export const DISPLAY = new URLSearchParams(location.search).has('display');
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export const state = {
  ws: null as WebSocket | null,
  relay: '',
  name: '',
  me: null as Peer | null,
  peers: new Map<string, Peer>(),
  maxBytes: DEFAULT_MAX_BYTES,
  /** The user wants to be connected (reconnect if it drops). */
  wanted: false,
  retry: 0,
  retryTimer: 0 as ReturnType<typeof setTimeout> | 0,
  role: 'member',
  debug: false,
  soundOn: true,
  /** True while drawing messages that arrived in the background (not replayed). */
  catchingUp: false,
};

export interface Role {
  description: string;
  viewSystem?: boolean;
  spy?: boolean;
  display?: boolean;
  debug?: boolean;
  impersonate?: boolean;
  seeSpoofer?: boolean;
  soundboard?: boolean;
}
export type Permission = Exclude<keyof Role, 'description'>;

// Roles live entirely in the app: anyone can switch their own, and each app
// decides what to show based on its own role. The relay just passes messages on.
export const ROLES: Record<string, Role> = {
  member: { description: 'Chat as normal.' },
  monitor: { description: 'Also sees system messages, such as role changes.', viewSystem: true },
  spy: { description: 'Can spy on chosen people to see whispers to and from them (/spy <names>).', spy: true },
  display: { description: 'A screen that only shows effects and plays sounds, never messages. Open the app\'s /Display link.', display: true },
  admin: {
    description: 'Sees system messages and who really sent spoofed messages, has a soundboard, and can use debug mode.',
    viewSystem: true, debug: true, impersonate: true, seeSpoofer: true, soundboard: true,
  },
};

export function can(perm: Permission): boolean {
  return !!(ROLES[state.role] || ROLES.member)[perm];
}

/** A person's name from their id (you, someone here, or "someone"). */
export function nameOf(id: string | undefined): string {
  if (state.me && id === state.me.id) return state.me.name;
  const p = id ? state.peers.get(id) : undefined;
  return p ? p.name : 'someone';
}

export function connected(): boolean {
  return !!state.ws && state.ws.readyState === WebSocket.OPEN && !!state.me;
}
