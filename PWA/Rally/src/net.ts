// The connection to the Rally server (/rally on the LocalChatter relay).
//   → join {name}                       → in {x, y, tilt}  (the right player's racket)
//   → st {s, e}  (the game's state, from the left player)
//   ← lobby {side, names, watching}     ← start {names, seed}   ← stop {why}
//   ← in / st  (passed on from the other player)

export interface Lobby { side: -1 | 0 | 1; names: [string, string]; watching: string[] }
export interface Handlers {
  lobby(m: Lobby): void;
  start(names: [string, string]): void;
  stop(why: string): void;
  state(s: number[], events: number): void;
  input(x: number, y: number, tilt: number): void;
  closed(why: string): void;
}

export interface Link { send(msg: object): void; close(): void }

export function connect(url: string, name: string, h: Handlers): Link {
  let ws: WebSocket;
  let done = false;
  try { ws = new WebSocket(url); } catch { setTimeout(() => h.closed('That isn\'t a valid server address.'), 0); return { send() {}, close() {} }; }
  let opened = false;
  ws.onopen = () => { opened = true; ws.send(JSON.stringify({ t: 'join', name })); };
  ws.onmessage = (ev) => {
    let m: Record<string, unknown>;
    try { m = JSON.parse(String(ev.data)) as Record<string, unknown>; } catch { return; }
    if (m.t === 'lobby') h.lobby(m as unknown as Lobby);
    else if (m.t === 'start') h.start(m.names as [string, string]);
    else if (m.t === 'stop') h.stop(String(m.why || ''));
    else if (m.t === 'st' && Array.isArray(m.s)) h.state(m.s as number[], Number(m.e) || 0);
    else if (m.t === 'in') h.input(Number(m.x), Number(m.y), Number(m.tilt));
  };
  ws.onclose = () => {
    if (done) return;
    done = true;
    h.closed(opened ? 'Lost the connection to the server.' : 'Couldn\'t reach the server. Open its address in the browser once and accept its certificate, then try again.');
  };
  return {
    send(msg) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
    close() { done = true; ws.close(); },
  };
}
