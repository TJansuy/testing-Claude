// Rally: tennis for two, device to device. Loads the physics (WebAssembly),
// the renderer (WebGL) and the game, and the lobby that connects two devices.
//   ?autoplay        the computer plays your side (demos and tests)
//   #join=<invite>   join a game (the host's invite QR code is a link like this)
//   #reply=<reply>   a guest's reply, opened on the hosting device
import { Game, Mode } from './game';
import { Hud } from './hud';
import { Controls } from './input';
import { setupLobby } from './lobby';
import type { Peer } from './p2p';
import { loadPhysics } from './physics';
import { Renderer } from './render';
import { isMuted, setMuted, unlockSound } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const KEY = { name: 'rally-name', muted: 'rally-muted' };
const store = { get: (k: string): string => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
const autoplay = new URLSearchParams(location.search).has('autoplay');
const seed = (): number => Math.floor(Math.random() * 2 ** 31);

async function boot(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('court');
  let renderer: Renderer;
  try { renderer = new Renderer(canvas); } catch (e) { $('lobby-status').textContent = 'This browser can\'t run Rally: ' + (e as Error).message; return; }
  const bytes = await (await fetch('physics.wasm')).arrayBuffer();
  const make = await loadPhysics(bytes);
  const hud = new Hud();
  const controls: Controls = new Controls(canvas, (): boolean => game.side === 1);
  const game: Game = new Game(make(), make, renderer, controls, canvas);
  let peer: Peer | null = null;
  game.start('demo', seed());
  setInterval(() => hud.update(game.phys.s, game.side === 1), 100);

  const name = $<HTMLInputElement>('name');
  name.value = store.get(KEY.name);
  name.addEventListener('change', () => store.set(KEY.name, name.value.trim()));
  const myName = (): string => name.value.trim() || 'Player';
  setMuted(store.get(KEY.muted) === '1');
  $('mute').textContent = isMuted() ? '🔇' : '🔊';

  const show = (lobby: boolean): void => { $('lobby').hidden = !lobby; $('leave').hidden = lobby; document.body.classList.toggle('playing', !lobby); };
  function play(mode: Mode, names: [string, string], me: 0 | 1): void {
    hud.names = names; hud.me = me; hud.waiting = '';
    game.start(mode, seed(), autoplay);
    hud.update(game.phys.s, game.side === 1); // straight away, not on the next refresh
    show(false);
  }
  const lobby = setupLobby({
    game,
    name: myName,
    started(p, side, names) {
      peer = p;
      game.link = p;
      unlockSound();
      play(side === 0 ? 'host' : 'guest', names, side);
    },
    ended(why) { leave(why); },
  });
  function leave(why = ''): void {
    if (peer) { const p = peer; peer = null; p.send({ t: 'bye' }); setTimeout(() => p.close(), 200); } // say goodbye first
    game.link = null;
    hud.waiting = ''; hud.me = -1; hud.names = ['', ''];
    game.start('demo', seed());
    lobby.reset();
    $('lobby-status').textContent = why;
    show(true);
  }

  $('practice').addEventListener('click', () => {
    unlockSound();
    play('practice', [name.value.trim() || 'You', 'Computer'], 0);
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
