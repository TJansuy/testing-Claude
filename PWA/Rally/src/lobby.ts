// Setting up a game between two devices, with no server:
//   Host:  shows an invite (a QR code of a link). The other player scans it with
//          their phone's camera, or with Join → Scan, or pastes the link.
//   Guest: then shows a reply (a QR code). The host scans it with "Scan their
//          reply" (or their phone's camera), or pastes it.
// As soon as the two devices connect, the game starts.
// Opening a reply link on the hosting device (scanned with the phone's own
// camera, so it opens in a new tab) hands the reply to the waiting tab.
import { Game } from './game';
import { Peer } from './p2p';
import { drawQr, hasCamera, scan } from './qr';
import { parse } from './sdp';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const base = (): string => location.origin + location.pathname;
const relay = 'BroadcastChannel' in window ? new BroadcastChannel('rally') : null;

export interface Hooks {
  game: Game;
  name(): string;
  /** Connected: start the game as this side. */
  started(peer: Peer, side: 0 | 1, names: [string, string]): void;
  /** The connection ended (or never happened). */
  ended(why: string): void;
}

export function setupLobby(h: Hooks): { reset(): void } {
  let peer: Peer | null = null;
  let hosting = false;
  let theirName = '';
  const status = (t: string): void => { $('lobby-status').textContent = t; };
  const pane = (which: 'home' | 'host' | 'join'): void => {
    $('home').hidden = which !== 'home';
    $('host-pane').hidden = which !== 'host';
    $('join-pane').hidden = which !== 'join';
    $('back').hidden = which === 'home';
  };

  function connection(): Peer {
    if (peer) peer.close();
    theirName = '';
    const p: Peer = new Peer({
      open() { status('Connected!'); p.send({ t: 'hello', name: h.name() }); },
      message(m) {
        if (m.t === 'st' && Array.isArray(m.s)) h.game.hostState(m.s as number[], Number(m.e) || 0);
        else if (m.t === 'in') h.game.remoteInput(Number(m.x), Number(m.y), Number(m.tilt));
        else if (m.t === 'hello') {
          theirName = String(m.name || '').slice(0, 24) || 'Player';
          // The host starts the game as soon as it knows who it's playing.
          if (hosting) { const names: [string, string] = [h.name(), theirName]; p.send({ t: 'start', names }); h.started(p, 0, names); }
        } else if (m.t === 'bye') {
          // They tapped Leave.
          if (peer === p) { peer = null; p.close(); h.ended((theirName || 'The other player') + ' left the game.'); }
        } else if (m.t === 'start' && !hosting && Array.isArray(m.names)) {
          h.started(p, 1, [String(m.names[0] || theirName), String(m.names[1] || h.name())]);
        }
      },
      closed(why) { if (peer === p) { peer = null; h.ended(why); } },
    });
    peer = p;
    return p;
  }

  // ---- Hosting
  async function host(): Promise<void> {
    hosting = true;
    pane('host');
    status('Getting ready…');
    // Clear any old invite straight away: it can't be used again.
    $<HTMLInputElement>('reply-code').value = '';
    $<HTMLInputElement>('invite-text').value = '';
    const qr = $<HTMLCanvasElement>('invite-qr');
    qr.width = qr.height = 0;
    try {
      const code = await connection().invite();
      const link = base() + '#join=' + code;
      drawQr($<HTMLCanvasElement>('invite-qr'), link);
      $<HTMLInputElement>('invite-text').value = link;
      status('Waiting for the other player…');
    } catch (e) { status((e as Error).message); }
  }
  async function accept(code: string): Promise<void> {
    if (!peer || !hosting) return;
    status('Connecting…');
    const err = await peer.accept(code);
    if (err) status(err);
  }
  relay?.addEventListener('message', (ev) => {
    const d = ev.data as { t?: string; code?: string };
    if (d.t === 'reply' && d.code && peer && hosting && !$('host-pane').hidden) { relay.postMessage({ t: 'got' }); void accept(d.code); }
  });

  // ---- Joining
  async function join(code: string): Promise<void> {
    hosting = false;
    pane('join');
    $('join-reply').hidden = true;
    status('Joining…');
    $<HTMLInputElement>('reply-text').value = '';
    try {
      const reply = await connection().reply(code);
      drawQr($<HTMLCanvasElement>('reply-qr'), base() + '#reply=' + reply);
      $<HTMLInputElement>('reply-text').value = reply;
      $('join-get').hidden = true;
      $('join-reply').hidden = false;
      status('Waiting for the host to scan your reply…');
    } catch (e) { status((e as Error).message); }
  }

  const copy = (id: string, done: string): void => {
    const input = $<HTMLInputElement>(id);
    const ok = (): void => status(done);
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(ok, () => { input.select(); status('Select and copy the code above.'); });
    else { input.select(); status('Select and copy the code above.'); }
  };
  const isInvite = (t: string): boolean => parse(t)?.type === 'offer';
  const isReply = (t: string): boolean => parse(t)?.type === 'answer';

  $('host-btn').addEventListener('click', () => void host());
  $('join-btn').addEventListener('click', () => { hosting = false; pane('join'); $('join-get').hidden = false; $('join-reply').hidden = true; status(''); });
  $('back').addEventListener('click', () => { if (peer) { peer.close(); peer = null; } pane('home'); status(''); });
  $('invite-copy').addEventListener('click', () => copy('invite-text', 'Invite link copied: send it to the other player.'));
  $('reply-copy').addEventListener('click', () => copy('reply-text', 'Reply copied: send it to the host.'));
  $('reply-go').addEventListener('click', () => void accept($<HTMLInputElement>('reply-code').value));
  $('invite-go').addEventListener('click', () => void join($<HTMLInputElement>('invite-code').value));
  $('reply-scan').addEventListener('click', () => scan('Scan their reply', isReply, (t) => void accept(t)));
  $('invite-scan').addEventListener('click', () => scan('Scan the invite', isInvite, (t) => void join(t)));
  for (const id of ['reply-scan', 'invite-scan']) $(id).hidden = !hasCamera;

  // ---- Opened from a link
  const hash = /^#(join|reply)=(.+)$/.exec(location.hash);
  const invite = hash && hash[1] === 'join' ? decodeURIComponent(hash[2]) : null;
  const reply = hash && hash[1] === 'reply' ? decodeURIComponent(hash[2]) : null;
  if (invite || reply) history.replaceState(null, '', location.pathname + location.search);
  if (invite) void join(invite);
  else if (reply) {
    // A reply scanned on the hosting device: pass it to the tab that's waiting for it.
    status('Passing the reply to your game…');
    let got = false;
    relay?.addEventListener('message', (ev) => { if ((ev.data as { t?: string }).t === 'got') { got = true; status('Done: the game is in your other Rally tab. You can close this one.'); } });
    relay?.postMessage({ t: 'reply', code: reply });
    setTimeout(() => { if (!got) status('No game on this device is waiting for a reply. On the hosting device, tap Host a game, then scan the reply with Scan their reply.'); }, 1500);
  }

  return { reset() { if (peer) { peer.close(); peer = null; } pane('home'); } };
}
