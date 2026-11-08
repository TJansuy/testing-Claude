// /poll, and the New poll form in the ✨ dashboard.
//   /poll What's for lunch? | Pizza | Tacos | Salad     a public poll
//   /poll secret Who should lead? | Ann | Bob           a secret poll
//   /poll                                               show the running polls again
//   /poll close [number]                                close yours (secret: shows the results)
//   /poll clear [number | all]                          take polls off the displays (anyone)
import { systemLine } from '../chat/list';
import { $, button, input } from '../dom';
import { closePoll, clearPolls, createPoll, placeInChat } from './index';
import { active, device, findPoll } from './model';

export const MAX_OPTIONS = 10;
const HELP = 'Start a poll with /poll <question> | <option> | <option>, e.g. /poll Lunch? | Pizza | Tacos. ' +
  'Add "secret" first (/poll secret …) to hide the results until you close it. /poll close <number> closes yours; /poll clear <number> or /poll clear all takes polls off the displays.';

/** Sends a poll, after checking it. Returns an error message, or '' once sent. */
export function startPoll(question: string, options: string[], secret: boolean): string {
  const q = question.replace(/\s+/g, ' ').trim().slice(0, 200);
  const opts = options.map((o) => o.replace(/\s+/g, ' ').trim().slice(0, 100)).filter(Boolean);
  if (!q) return 'Write a question for the poll.';
  if (opts.length < 2) return 'A poll needs at least two options.';
  if (opts.length > MAX_OPTIONS) return 'A poll can have up to ' + MAX_OPTIONS + ' options.';
  const seen = new Set(opts.map((o) => o.toLowerCase()));
  if (seen.size !== opts.length) return 'Each option needs to be different.';
  return createPoll(q, opts, secret) ? '' : 'Not connected: poll not sent.';
}

export function pollCommand(rest: string): void {
  const m = /^(close|end|clear)\b\s*(.*)$/i.exec(rest);
  if (m) { manage(m[1].toLowerCase(), m[2].trim()); return; }
  if (!rest) {
    const list = active();
    if (!list.length) { systemLine('No polls are running. ' + HELP); return; }
    systemLine('📊 Polls running (' + list.length + '):');
    list.forEach(placeInChat);
    return;
  }
  const secret = /^secret\b/i.test(rest);
  const parts = rest.replace(/^(secret|public)\b\s*/i, '').split('|');
  if (parts.length < 3) { systemLine(HELP); return; }
  const err = startPoll(parts[0], parts.slice(1), secret);
  if (err) systemLine(err);
}

function manage(verb: string, ref: string): void {
  if (verb === 'clear') {
    if (!ref || /^all$/i.test(ref)) { clearPolls(active(), true); return; }
    const p = findPoll(ref);
    if (p) clearPolls([p], false); else systemLine('There\'s no poll ' + ref + ' on the displays. Type /poll to see them.');
    return;
  }
  // Close: the number given, or your most recent open poll.
  const p = ref ? findPoll(ref) : active().filter((x) => x.owner === device && !x.closed).pop();
  if (p) closePoll(p);
  else systemLine(ref ? 'There\'s no poll ' + ref + '. Type /poll to see them.' : 'You have no open polls to close.');
}

// ---- The form
const dialog = $<HTMLDialogElement>('poll-dialog');
const optionsBox = $('poll-options');
const status = $('poll-status');

function addOption(value = ''): void {
  if (optionsBox.children.length >= MAX_OPTIONS) return;
  const field = document.createElement('input');
  field.maxLength = 100;
  field.value = value;
  field.placeholder = 'Option ' + (optionsBox.children.length + 1);
  field.setAttribute('aria-label', field.placeholder);
  optionsBox.appendChild(field);
  button('poll-add').hidden = optionsBox.children.length >= MAX_OPTIONS;
}

function openForm(): void {
  input('poll-question').value = '';
  input('poll-secret').checked = false;
  optionsBox.replaceChildren();
  addOption(); addOption();
  status.textContent = '';
  dialog.showModal();
  input('poll-question').focus();
}

button('poll-new').addEventListener('click', openForm);
button('poll-add').addEventListener('click', () => {
  addOption();
  (optionsBox.lastElementChild as HTMLInputElement).focus();
});
button('poll-cancel').addEventListener('click', () => dialog.close());
$<HTMLFormElement>('poll-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const options = Array.from(optionsBox.querySelectorAll('input')).map((i) => i.value);
  const err = startPoll(input('poll-question').value, options, input('poll-secret').checked);
  if (err) { status.textContent = err; return; }
  dialog.close();
});
