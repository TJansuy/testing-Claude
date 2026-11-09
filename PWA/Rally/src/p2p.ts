// The connection between the two devices: WebRTC, straight from one to the
// other over the local network. No server is involved, not even to set it up:
// the host's invite code and the guest's reply are passed between the devices
// by hand (a QR code, a link, or copy and paste), and no internet servers are
// asked for addresses, so it works on a network with no internet at all.
//
// Two data channels: "play" for the game's state and rackets (unordered, never
// resent: a late update is useless, the next one is coming), and "talk" for
// everything else (reliable).
import { compact, expand, parse } from './sdp';

export interface Link { send(msg: object): void; close(): void }
export interface Handlers {
  open(): void;
  message(m: Record<string, unknown>): void;
  closed(why: string): void;
}

const FAST = new Set(['st', 'in']);
const GATHER_MS = 2500;

export class Peer implements Link {
  private pc = new RTCPeerConnection({ iceServers: [] });
  private play: RTCDataChannel;
  private talk: RTCDataChannel;
  private opened = 0;
  private done = false;

  constructor(private h: Handlers) {
    // Both channels are agreed in advance (negotiated), so neither side has to announce them.
    this.play = this.pc.createDataChannel('play', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    this.talk = this.pc.createDataChannel('talk', { negotiated: true, id: 1 });
    for (const ch of [this.play, this.talk]) {
      ch.onopen = () => { if (++this.opened === 2) h.open(); };
      ch.onmessage = (ev) => {
        let m: unknown;
        try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m && typeof m === 'object') h.message(m as Record<string, unknown>);
      };
      ch.onclose = () => this.end('The other player left.');
    }
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.end(this.opened ? 'The connection dropped.' : 'Couldn\'t connect. Are both devices on the same network?');
      else if (s === 'disconnected' && this.opened) setTimeout(() => { if (this.pc.connectionState === 'disconnected') this.end('The connection dropped.'); }, 3000);
    };
  }

  /** Waits until this device has found its addresses (or a moment has passed). */
  private gathered(): Promise<RTCSessionDescriptionInit> {
    return new Promise((resolve) => {
      const finish = (): void => resolve(this.pc.localDescription as RTCSessionDescription);
      if (this.pc.iceGatheringState === 'complete') { finish(); return; }
      const t = setTimeout(finish, GATHER_MS);
      this.pc.onicegatheringstatechange = () => { if (this.pc.iceGatheringState === 'complete') { clearTimeout(t); finish(); } };
    });
  }

  /** Host: makes the invite code. */
  async invite(): Promise<string> {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    return compact(await this.gathered());
  }

  /** Host: takes the guest's reply. Returns an error message, or ''. */
  async accept(code: string): Promise<string> {
    const d = parse(code);
    if (!d || d.type !== 'answer') return d ? 'That\'s an invite, not a reply. Scan the code on the other player\'s screen after they\'ve joined.' : 'That isn\'t a Rally reply code.';
    try { await this.pc.setRemoteDescription(expand(d)); } catch (e) { return 'That reply didn\'t work: ' + (e as Error).message; }
    return '';
  }

  /** Guest: takes the host's invite, and makes the reply code. */
  async reply(code: string): Promise<string> {
    const d = parse(code);
    if (!d || d.type !== 'offer') throw new Error(d ? 'That\'s a reply code. Scan or paste the invite from the player who\'s hosting.' : 'That isn\'t a Rally invite.');
    await this.pc.setRemoteDescription(expand(d));
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    return compact(await this.gathered());
  }

  send(msg: object): void {
    const ch = FAST.has(String((msg as { t?: unknown }).t)) ? this.play : this.talk;
    if (ch.readyState === 'open') { try { ch.send(JSON.stringify(msg)); } catch { /* closing */ } }
  }

  private end(why: string): void {
    if (this.done) return;
    this.done = true;
    this.pc.close();
    this.h.closed(why);
  }

  close(): void { this.done = true; this.pc.close(); }
}
