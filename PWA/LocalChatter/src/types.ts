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

/** A poll's vote, as passed on to people who join. */
export interface WireVote { voter: string; name: string; option: number; at: number }
export interface WirePoll {
  id: string; question: string; options: string[]; secret: boolean; closed?: boolean;
  author: Peer; owner: string; at?: number; votes?: WireVote[];
  /** A quiz: only the options listed in correct are right. */
  quiz?: boolean; correct?: number[];
}
/** Polls: new, vote, close (by its author), clear (from the displays, by anyone), sync (remind someone who joined). */
export interface PollMessage {
  type: 'poll'; op: 'new' | 'vote' | 'close' | 'clear' | 'sync'; from?: Peer; at?: number;
  poll?: WirePoll; id?: string; voter?: string; option?: number; all?: boolean; to?: string; polls?: WirePoll[];
}

/** A hangman game. guessed: the letters guessed so far, in order (passed on to people who join). */
export interface WireGame { id: string; kind: 'hangman'; phrase: string; author: Peer; owner: string; at?: number; guessed?: string }
/** Games: new, clear (from the displays, by anyone), sync (remind someone who joined). */
export interface GameMessage {
  type: 'game'; op: 'new' | 'clear' | 'sync' | 'race' | 'drop' | 'stop'; from?: Peer; at?: number;
  game?: WireGame; id?: string; all?: boolean; to?: string; games?: WireGame[];
  /** Drop Race: the entry's text. */
  text?: string;
}

export type ServerMessage = WelcomeMessage | PeerMessage | ChatMessage | SystemMessage | EffectMessage | PollMessage | GameMessage | ErrorMessage;

/** What the app sends for a chat message; type/id are filled in when sending. */
export type OutgoingChat = Omit<ChatMessage, 'type' | 'id'> & { type?: 'chat'; id?: string };
