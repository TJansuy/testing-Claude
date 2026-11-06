// On phones the header hides itself a few seconds after you stop using it, to
// leave more room for messages. A small tab at the top brings it back. It stays
// visible while not connected, while the dashboard is open, and on wide screens.
import { $, input } from '../dom';
import { KEY, load, save } from '../storage';
import { isOpen, isWide } from './dashboard';

const HIDE_AFTER_MS = 4000;
const topbar = $('topbar');
const tab = $('header-tab');
let timer: ReturnType<typeof setTimeout> | undefined;
let isConnected = false;

export const autoHideOn = (): boolean => load(KEY.autohide) !== 'off';
const canHide = (): boolean => autoHideOn() && isConnected && !isWide() && !isOpen();

function measure(): void {
  document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
}

export function showHeader(): void {
  clearTimeout(timer);
  document.body.classList.remove('header-hidden');
  tab.hidden = true;
}

/** Shows the header and starts the countdown to hide it again. */
export function pokeHeader(): void {
  showHeader();
  timer = setTimeout(() => {
    if (!canHide()) return;
    measure();
    document.body.classList.add('header-hidden');
    tab.hidden = false;
  }, HIDE_AFTER_MS);
}

export function onStatus(connectedNow: boolean): void {
  const changed = connectedNow !== isConnected;
  isConnected = connectedNow;
  if (!connectedNow) showHeader();
  else if (changed) pokeHeader();
}

tab.addEventListener('click', pokeHeader);
topbar.addEventListener('pointerdown', pokeHeader);
// Scrolling back up through the chat brings the header back too.
let lastTop = 0;
$('messages').addEventListener('scroll', (e) => {
  const top = (e.target as HTMLElement).scrollTop;
  if (top < lastTop - 40 && document.body.classList.contains('header-hidden')) pokeHeader();
  lastTop = top;
}, { passive: true });

const box = input('autohide-on');
box.checked = autoHideOn();
box.addEventListener('change', () => {
  save(KEY.autohide, box.checked ? 'on' : 'off');
  pokeHeader();
});
