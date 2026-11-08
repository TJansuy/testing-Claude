// Slash-command autocomplete. Typing "/" slides a list up from the message box
// with every command and a hint on how to use it, narrowing as you type. Once a
// command is complete (after a space), it shows just that command's usage.
//   ↑ ↓ move   Tab or Enter fill in   Esc closes   tap or click a row to fill in
// It never takes more than a third of the screen; the rest scrolls.
import { $, el } from '../dom';
import { CommandInfo, find, matching } from '../features/command-list';

const text = $<HTMLTextAreaElement>('text');
const popup = $('autocomplete');
let items: Array<{ cmd: CommandInfo; as: string }> = [];
let active = 0;
let dismissedFor: string | null = null; // Esc closes it until the text changes

text.setAttribute('aria-autocomplete', 'list');
text.setAttribute('aria-controls', 'autocomplete');
text.setAttribute('aria-expanded', 'false');

const isOpen = (): boolean => !popup.hidden;

function close(): void {
  popup.hidden = true;
  items = [];
  text.setAttribute('aria-expanded', 'false');
  text.removeAttribute('aria-activedescendant');
}

function row(cmd: CommandInfo, as: string, typed: string, i: number, usageOnly: boolean): HTMLElement {
  const li = el('li', 'ac-item');
  li.id = 'ac-' + i;
  li.setAttribute('role', 'option');
  const head = el('div', 'ac-head');
  const name = el('span', 'ac-name');
  name.appendChild(el('strong', null, '/' + as.slice(0, typed.length)));
  name.appendChild(document.createTextNode(as.slice(typed.length)));
  head.appendChild(name);
  if (cmd.args) head.appendChild(el('span', 'ac-args', cmd.args));
  li.appendChild(head);
  const aliases = [cmd.name, ...(cmd.aliases || [])].filter((n) => n !== as).map((n) => '/' + n);
  li.appendChild(el('div', 'ac-hint', cmd.hint + (aliases.length ? ' · also ' + aliases.join(', ') : '')));
  if (!usageOnly) {
    // Keep focus in the message box: act on pointerdown, before it would blur.
    li.addEventListener('pointerdown', (e) => { e.preventDefault(); active = i; complete(); });
  } else {
    li.classList.add('usage');
  }
  return li;
}

function highlight(): void {
  Array.from(popup.children).forEach((c, i) => c.setAttribute('aria-selected', String(i === active)));
  const current = popup.children[active] as HTMLElement | undefined;
  if (current) {
    text.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({ block: 'nearest' });
  }
}

/** Re-reads the message box and shows, filters or hides the list. */
export function update(): void {
  const value = text.value;
  if (dismissedFor !== null && value === dismissedFor) return;
  dismissedFor = null;
  const m = /^\/(\S*)(\s?)/.exec(value);
  if (!m || value.indexOf('\n') >= 0) { close(); return; }
  const typed = m[1];
  popup.textContent = '';
  if (m[2]) {
    // Command finished: show its usage while you type the rest.
    const cmd = find(typed);
    if (!cmd) { close(); return; }
    items = [];
    popup.appendChild(row(cmd, typed.toLowerCase(), typed, 0, true));
  } else {
    items = matching(typed);
    if (!items.length) { close(); return; }
    if (active >= items.length) active = 0;
    items.forEach((it, i) => popup.appendChild(row(it.cmd, it.as, typed, i, false)));
  }
  popup.hidden = false;
  text.setAttribute('aria-expanded', 'true');
  if (items.length) highlight(); else text.removeAttribute('aria-activedescendant');
}

/** Fills in the highlighted command, ready for what comes after it. */
function complete(): void {
  const it = items[active];
  if (!it) return;
  text.value = '/' + it.as + ' ';
  text.focus();
  text.dispatchEvent(new Event('input')); // resize, and show its usage
}

/** Handles keys while the list is open. Returns true if it used the key. */
export function autocompleteKey(e: KeyboardEvent): boolean {
  if (!isOpen() || e.isComposing) return false;
  if (e.key === 'Escape') { dismissedFor = text.value; close(); return true; }
  if (!items.length) return false; // just a usage hint: keys work as normal
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
    highlight();
    return true;
  }
  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
    // A command typed in full (e.g. "/fire") is sent by Enter, not completed again.
    const exact = find(text.value.slice(1));
    if (e.key === 'Enter' && exact && exact.standalone) { close(); return false; }
    complete();
    return true;
  }
  return false;
}

text.addEventListener('input', () => { active = text.value.length <= 1 ? 0 : active; update(); });
text.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== text) close(); }, 150));
text.addEventListener('focus', update);
