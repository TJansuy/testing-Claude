// Short connection codes. A WebRTC session description is a few kilobytes, too
// much for a QR code you can scan from across a table. A data-only connection
// needs just five things from it: the ICE username and password, the
// certificate fingerprint, its role, and the addresses to try. So that's all a
// code holds, and the other side rebuilds a standard description from it.
//
//   R1.<o|a|p>.<ufrag>.<pwd>.<fingerprint, base64url>.<address,port~address,port…>
//
// Addresses are the device's own on the local network (no internet servers are
// asked), or browser-made name.local names that only resolve on the same network.
// o: an offer; a / p: an answer that takes the active / passive role.

export interface Desc { type: 'offer' | 'answer'; passive: boolean; ufrag: string; pwd: string; fingerprint: string; candidates: string[] }

/** ICE usernames and passwords use letters, digits, + and /: swapped for - and _ so codes are safe in links. */
const urlSafe = (s: string): string => s.replace(/\+/g, '-').replace(/\//g, '_');
const unUrlSafe = (s: string): string => s.replace(/-/g, '+').replace(/_/g, '/');

const b64 = (hex: string): string => btoa(String.fromCharCode(...hex.split(':').map((h) => parseInt(h, 16))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (s: string): string => Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(':');

/** Reads what a code needs out of a full session description. */
export function compact(sdp: RTCSessionDescriptionInit): string {
  const text = sdp.sdp || '';
  const get = (re: RegExp): string => (re.exec(text) || [])[1] || '';
  const ufrag = get(/a=ice-ufrag:(\S+)/), pwd = get(/a=ice-pwd:(\S+)/), fp = get(/a=fingerprint:sha-256 (\S+)/i);
  // UDP candidates only (host, and server-reflexive if a browser adds any): address and port.
  const cands = Array.from(text.matchAll(/a=candidate:\S+ \d+ udp \d+ (\S+) (\d+) typ (host|srflx)/gi), (m) => m[1] + ',' + m[2]);
  if (!ufrag || !pwd || !fp || !cands.length) throw new Error('This device didn\'t find a network to connect over. Are you on Wi-Fi?');
  if (/[.\s]/.test(ufrag + pwd)) throw new Error('Unexpected connection details');
  const passive = /a=setup:passive/.test(text);
  return ['R1', sdp.type === 'answer' ? (passive ? 'p' : 'a') : 'o', urlSafe(ufrag), urlSafe(pwd), b64(fp), [...new Set(cands)].join('~')].join('.');
}

/** Reads a code (or a link with one in it); null if it isn't one. */
export function parse(code: string): Desc | null {
  const m = /R1\.([oap])\.([^.\s]+)\.([^.\s]+)\.([A-Za-z0-9_-]{43})\.([^\s#&]+)/.exec(decodeURIComponent(code.trim()));
  if (!m) return null;
  const candidates = m[5].split('~').filter((c) => /^[A-Za-z0-9.:\-[\]]+,\d{1,5}$/.test(c));
  if (!candidates.length) return null;
  return { type: m[1] === 'o' ? 'offer' : 'answer', passive: m[1] === 'p', ufrag: unUrlSafe(m[2]), pwd: unUrlSafe(m[3]), fingerprint: hex(m[4]), candidates };
}

/** Rebuilds a full session description for a data channel. */
export function expand(d: Desc): RTCSessionDescriptionInit {
  const lines = [
    'v=0', `o=- ${Math.floor(Math.random() * 1e15)} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0',
    'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${d.ufrag}`, `a=ice-pwd:${d.pwd}`, 'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${d.fingerprint}`,
    // The offerer can take either role; the answer says which it took.
    `a=setup:${d.type === 'offer' ? 'actpass' : d.passive ? 'passive' : 'active'}`,
    'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
    ...d.candidates.map((c, i) => {
      const [addr, port] = c.split(',');
      return `a=candidate:${i + 1} 1 udp ${2122260223 - i} ${addr} ${port} typ host generation 0`;
    }),
    'a=end-of-candidates',
  ];
  return { type: d.type, sdp: lines.join('\r\n') + '\r\n' };
}
