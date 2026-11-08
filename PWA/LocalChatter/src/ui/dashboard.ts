// The dashboard: Effects (with the soundboard and favourites) and Settings, as tabs.
// On wide screens (16:10 or wider, at least 960px) it's a column beside the chat
// that stays open. On phones it opens above the message box from the ✨ or ⚙ buttons.
import { $, select } from '../dom';
import { sendChat, sendRaw } from '../net/connection';
import { handle } from '../net/handle';
import { can, DISPLAY, state } from '../state';
import type { EffectMessage } from '../types';
import { pokeHeader, showHeader } from './header';

export const dashboard = $('effects-tray');
const effectsButton = $('effects');
const tabs = { effects: $('tab-effects'), settings: $('tab-settings') };
const panels = { effects: $('panel-effects'), settings: $('settings') };
type Tab = keyof typeof tabs;

const wideQuery = window.matchMedia('(min-aspect-ratio: 16/10) and (min-width: 960px)');
export const isWide = (): boolean => wideQuery.matches && !DISPLAY;
export const isOpen = (): boolean => !dashboard.hidden;
export const currentTab = (): Tab => (panels.settings.hidden ? 'effects' : 'settings');

export function showTab(tab: Tab): void {
  (Object.keys(tabs) as Tab[]).forEach((t) => {
    tabs[t].setAttribute('aria-selected', String(t === tab));
    panels[t].hidden = t !== tab;
  });
}

export function openDashboard(tab: Tab): void {
  const switching = currentTab() !== (DISPLAY ? 'settings' : tab) || dashboard.hidden;
  showTab(DISPLAY ? 'settings' : tab);
  dashboard.hidden = false;
  if (switching) dashboard.scrollTop = 0; // open at the top, with the tabs in view
  effectsButton.setAttribute('aria-expanded', String(tab === 'effects'));
  showHeader();
}

/** Closes it on phones; on wide screens it stays, back on Effects. */
export function closeDashboard(): void {
  effectsButton.setAttribute('aria-expanded', 'false');
  if (isWide()) { showTab('effects'); return; }
  dashboard.hidden = true;
  pokeHeader();
}

/** Closes the dashboard only if it's showing effects (used when disconnecting). */
export function closeEffectsPanel(): void {
  if (!isWide() && isOpen() && currentTab() === 'effects') closeDashboard();
}

export function applyLayout(): void {
  const wide = isWide();
  document.body.classList.toggle('wide', wide);
  effectsButton.hidden = wide;
  dashboard.hidden = !wide;
  if (wide) showTab('effects');
  effectsButton.setAttribute('aria-expanded', 'false');
  pokeHeader();
}
wideQuery.addEventListener('change', applyLayout);

effectsButton.addEventListener('click', () => {
  if (isOpen() && currentTab() === 'effects') closeDashboard();
  else openDashboard('effects');
});
tabs.effects.addEventListener('click', () => showTab('effects'));
tabs.settings.addEventListener('click', () => showTab('settings'));
$('dash-close').addEventListener('click', closeDashboard);

// Effect buttons. In debug mode they go to the chosen person; otherwise to everyone.
panels.effects.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-effect]');
  if (!b || !b.dataset.effect) return;
  if (state.debug && can('debug')) {
    const fx: EffectMessage = { type: 'effect', name: b.dataset.effect, to: select('fx-to').value || 'all' };
    if (sendRaw(fx)) handle({ ...fx, from: state.me || undefined }); // show/play it here too
  } else {
    sendChat({ text: '/' + b.dataset.effect });
  }
  closeDashboard();
});
