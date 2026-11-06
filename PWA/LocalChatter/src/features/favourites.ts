// Favourite effects, kept on this device. Yours can be resent; someone else's
// echoed. Either way it plays for everyone again.
import { effectPhrase, EFFECT_TITLES } from '../chat/effect-line';
import { $, el } from '../dom';
import { EffectName, parseEffect } from '../effects';
import { sendChat } from '../net/connection';
import { KEY, loadJson, save } from '../storage';

export interface Favourite { effect: EffectName; arg: string; from: string | null }
const MAX_FAVS = 20;

export const favKey = (f: Favourite): string => f.effect + (f.arg ? ' ' + f.arg : '') + '|' + (f.from || '').toLowerCase();
const favourites = (): Favourite[] => loadJson<Favourite[]>(KEY.favourites, []);
const saveFavourites = (list: Favourite[]): void => save(KEY.favourites, JSON.stringify(list.slice(0, MAX_FAVS)));

export function toggleFavourite(fav: Favourite): void {
  const list = favourites();
  const i = list.findIndex((f) => favKey(f) === favKey(fav));
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ effect: fav.effect, arg: fav.arg || '', from: fav.from });
  saveFavourites(list);
  renderFavourites();
}

export function paintStars(): void {
  const keys = favourites().map(favKey);
  document.querySelectorAll<HTMLElement>('.star[data-fav-key]').forEach((b) => {
    const on = keys.indexOf(b.dataset.favKey || '') >= 0;
    b.textContent = on ? '★' : '☆';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Remove from favourites' : 'Add to favourites');
  });
}

export function renderFavourites(): void {
  const list = favourites();
  const ul = $('fav-list');
  ul.textContent = '';
  list.forEach((f) => {
    const fx = parseEffect('/' + f.effect + (f.arg ? ' ' + f.arg : ''));
    if (!fx) return;
    const li = el('li');
    const label = el('span', 'fav-label');
    label.appendChild(el('span', 'fav-name', effectPhrase(fx)[0] + ' ' + EFFECT_TITLES[f.effect] + (f.arg ? ' ' + f.arg : '')));
    label.appendChild(el('span', 'fav-from', f.from ? 'from ' + f.from : 'yours'));
    li.appendChild(label);
    const go = el('button', 'fav-go', f.from ? 'Echo' : 'Resend');
    go.type = 'button';
    go.title = f.from ? 'Play ' + f.from + '\'s effect for everyone again' : 'Send it to everyone again';
    go.addEventListener('click', () => sendChat({ text: '/' + f.effect + (f.arg ? ' ' + f.arg : '') }));
    li.appendChild(go);
    const rm = el('button', 'fav-remove', '✕');
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Remove from favourites');
    rm.addEventListener('click', () => toggleFavourite(f));
    li.appendChild(rm);
    ul.appendChild(li);
  });
  $('fav-empty').hidden = list.length > 0;
  paintStars();
}
