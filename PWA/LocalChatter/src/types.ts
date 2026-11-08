// Messages exchanged with the relay.

export interface Peer { id: string; name: string }

export interface FileData { name: string; type: string; size: number; data: string }

export interface SoundRef { id: string; name: string; type?: string; url?: string; data?: string }

export interface ChatMessage {
  type: 'chat';
  id?: string;
  from?: Peer;
  /** Who it appears to be from (admin "send as"). */
  as?: Peer;
  at?: number;
  text?: string;
  file?: FileData;
  sound?: SoundRef;
  via?: 'nfc' | 'qr';
  /** Whisper recipients. */
  to?: Peer[];
  lang?: string;
  /** Set locally when a spy sees someone else's whisper. */
  spied?: boolean;
}

export interface SystemMessage {
  type: 'system';
  kind: 'role' | 'effect' | 'debug';
  from?: Peer;
  at?: number;
  name?: string;
  to?: string;
  role?: string;
  old?: string;
  on?: boolean;
}

/** An effect aimed at one person (or "all") by an admin in debug mode. */
export interface EffectMessage { type: 'effect'; name: string; to: string; from?: Peer; at?: number }

export interface WelcomeMessage { type: 'welcome'; you: Peer; room?: string; peers?: Peer[]; maxBytes?: number }
export interface PeerMessage { type: 'join' | 'leave' | 'rename'; peer: Peer }
export interface ErrorMessage { type: 'error'; message?: string; about?: string }

export type ServerMessage = WelcomeMessage | PeerMessage | ChatMessage | SystemMessage | EffectMessage | ErrorMessage;

/** What the app sends for a chat message; type/id are filled in when sending. */
export type OutgoingChat = Omit<ChatMessage, 'type' | 'id'> & { type?: 'chat'; id?: string };
