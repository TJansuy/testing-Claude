// Rally: tennis for two on the local network. Loads the physics
// (WebAssembly), the renderer (WebGL) and the game, and runs the lobby.
//   ?autoplay   the computer plays your side (demos and tests)
//   #server=…   the server's address (the server's setup page links here with it)
import { Game, Mode } from './game';
import { Hud } from './hud';
import { Controls } from './input';
import { connect, Link } from './net';
import { loadPhysics } from './physics';
import { Renderer } from './render';
import { isMuted, setMuted, unlockSound } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const KEY = { name: 'rally-name', server: 'rally-server', muted: 'rally-muted' };
const store = { get: (k: string): string => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
const autoplay = new URLSearchParams(location.search).has('autoplay');
const seed = (): number => Math.floor(Math.random() * 2 ** 31);

function readServer(): void {
  const s = new URLSearchParams(location.hash.slice(1)).get('server');
  if (s) { store.set(KEY.server, s); history.replaceState(null, '', location.pathname + location.search); }
}

async function boot(): Promise<void> {
  readServer();
  const canvas = $<HTMLCanvasElement>('court');
  let renderer: Renderer;
  try { renderer = new Renderer(canvas); } catch (e) { $('lobby-status').textContent = 'This browser can\'t run Rally: ' + (e as Error).message; return; }
  const bytes = await (await fetch('physics.wasm')).arrayBuffer();
  const make = await loadPhysics(bytes);
  const hud = new Hud();
  const controls: Controls = new Controls(canvas, (): boolean => game.side === 1);
  const game: Game = new Game(make(), make, renderer, controls, canvas);
  let link: Link | null = null;
  let mySide: -1 | 0 | 1 = -1;
  let leftWhy = ''; // e.g. "Ann left", shown while waiting for someone new
  game.start('demo', seed());
  setInterval(() => hud.update(game.phys.s, game.side === 1), 100);

  const name = $<HTMLInputElement>('name'), server = $<HTMLInputElement>('server');
  name.value = store.get(KEY.name);
  server.value = store.get(KEY.server);
  setMuted(store.get(KEY.muted) === '1');
  $('mute').textContent = isMuted() ? '🔇' : '🔊';

  const show = (lobby: boolean): void => { $('lobby').hidden = !lobby; $('leave').hidden = lobby; document.body.classList.toggle('playing', !lobby); };
  const waitText = (): string => (leftWhy ? leftWhy + '. ' : '') + 'Waiting for someone else to join… (the game starts as soon as they do)';
  function play(mode: Mode, names: [string, string], me: -1 | 0 | 1): void {
    hud.names = names; hud.me = me; hud.waiting = '';
    game.start(mode, seed(), autoplay);
    hud.update(game.phys.s, game.side === 1); // straight away, not on the next refresh
  }
  function leave(why = ''): void {
    if (link) { const l = link; link = null; l.close(); }
    game.link = null;
    hud.waiting = ''; hud.me = -1; hud.names = ['', '']; leftWhy = '';
    game.start('demo', seed());
    $('lobby-status').textContent = why;
    show(true);
  }

  $('practice').addEventListener('click', () => {
    unlockSound();
    play('practice', [name.value.trim() || 'You', 'Computer'], 0);
    show(false);
  });
  $<HTMLFormElement>('join').addEventListener('submit', (e) => {
    e.preventDefault();
    unlockSound();
    const url = server.value.trim();
    if (!/^wss?:\/\//i.test(url)) { $('lobby-status').textContent = 'Enter the server\'s address, e.g. wss://192.168.1.50:8443/rally (its setup page has a Play Rally link that fills this in).'; return; }
    store.set(KEY.name, name.value.trim());
    store.set(KEY.server, url);
    $('lobby-status').textContent = 'Connecting…';
    link = connect(url, name.value.trim() || 'Player', {
      lobby(m) {
        mySide = m.side;
        if (game.mode === 'demo') { hud.names = m.names; hud.waiting = m.side === -1 ? 'Watching: ' + m.names.filter(Boolean).join(' v ') : waitText(); show(false); }
        $('watching').textContent = m.watching.length ? '👀 ' + m.watching.join(', ') : '';
      },
      start(names) {
        game.link = link;
        leftWhy = '';
        play(mySide === 0 ? 'host' : mySide === 1 ? 'guest' : 'watch', names, mySide);
        show(false);
      },
      stop(why) { leftWhy = why; hud.waiting = waitText(); game.link = null; game.start('demo', seed()); },
      state(s, ev) { game.hostState(s, ev); },
      input(x, y, t) { game.remoteInput(x, y, t); },
      closed(why) { leave(why); },
    });
  });
  $('leave').addEventListener('click', () => leave());
  $('mute').addEventListener('click', () => { setMuted(!isMuted()); store.set(KEY.muted, isMuted() ? '1' : ''); $('mute').textContent = isMuted() ? '🔇' : '🔊'; });
  $('tilt-up').addEventListener('click', () => controls.turn(0.1));
  $('tilt-down').addEventListener('click', () => controls.turn(-0.1));
  // For tests and debugging.
  (window as unknown as { rally: unknown }).rally = { game, hud, controls };
}

void boot();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}); });
}
