// /poll and /quiz, and the New poll form in the ✨ dashboard.
//   /poll What's for lunch? | Pizza | Tacos | Salad     a public poll
//   /poll secret Who should lead? | Ann | Bob           a secret poll
//   /quiz Capital of France? | *Paris | Lyon | Nice     a quiz: * marks the right answer(s)
//   /poll                                               show the running polls again
//   /poll close [number]                                close yours (secret/quiz: shows the results)
//   /poll clear [number | all]                          take polls off the displays (anyone)
import { systemLine } from '../chat/list';
import { $, button, el, input } from '../dom';
import { closePoll, clearPolls, createPoll, placeInChat } from './index';
import { active, device, findPoll } from './model';

export const MAX_OPTIONS = 10;
const HELP = 'Start a poll with /poll <question> | <option> | <option>, e.g. /poll Lunch? | Pizza | Tacos. ' +
  'Add "secret" first (/poll secret …) to hide the results until you close it. /poll close <number> closes yours; /poll clear <number> or /poll clear all takes polls off the displays.';
const QUIZ_HELP = 'Start a quiz with /quiz <question> | <option> | <option>, marking the right answer(s) with *, e.g. /quiz Capital of France? | *Paris | Lyon | Nice. Close it with /poll close to show who got it right.';

export interface Choice { text: string; correct: boolean }

/** Sends a poll (or a quiz, if any option is marked correct), after checking it.
 *  Returns an error message, or '' once sent. */
export function startPoll(question: string, choices: Choice[], secret: boolean, quiz = false): string {
  const q = question.replace(/\s+/g, ' ').trim().slice(0, 200);
  const opts = choices.map((c) => ({ text: c.text.replace(/\s+/g, ' ').trim().slice(0, 100), correct: c.correct })).filter((c) => c.text);
  const what = quiz ? 'quiz' : 'poll';
  if (!q) return 'Write a question for the ' + what + '.';
  if (opts.length < 2) return 'A ' + what + ' needs at least two options.';
  if (opts.length > MAX_OPTIONS) return 'A ' + what + ' can have up to ' + MAX_OPTIONS + ' options.';
  const seen = new Set(opts.map((o) => o.text.toLowerCase()));
  if (seen.size !== opts.length) return 'Each option needs to be different.';
  const correct = opts.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  if (quiz && !correct.length) return 'Mark at least one right answer.';
  if (quiz && correct.length === opts.length) return 'At least one answer needs to be wrong.';
  return createPoll(q, opts.map((o) => o.text), secret, quiz ? correct : undefined) ? '' : 'Not connected: ' + what + ' not sent.';
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
  const err = startPoll(parts[0], parts.slice(1).map((text) => ({ text, correct: false })), secret);
  if (err) systemLine(err);
}

export function quizCommand(rest: string): void {
  const parts = rest.split('|');
  if (parts.length < 3) { systemLine(QUIZ_HELP); return; }
  const choices = parts.slice(1).map((t) => ({ text: t.trim().replace(/^\*\s*/, ''), correct: /^\s*\*/.test(t) }));
  const err = startPoll(parts[0], choices, false, true);
  if (err) systemLine(err + (/right answer/.test(err) ? ' Put * before it, e.g. | *Paris' : ''));
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

// ---- The form: a poll, a secret poll or a quiz (with its right answers ticked).
const dialog = $<HTMLDialogElement>('poll-dialog');
const form = $<HTMLFormElement>('poll-form');
const optionsBox = $('poll-options');
const status = $('poll-status');
const type = (): string => (form.querySelector<HTMLInputElement>('input[name="poll-type"]:checked') || { value: 'poll' }).value;

function addOption(): void {
  if (optionsBox.children.length >= MAX_OPTIONS) return;
  const n = optionsBox.children.length + 1;
  const row = el('div', 'poll-field');
  const field = document.createElement('input');
  field.maxLength = 100;
  field.placeholder = 'Option ' + n;
  field.setAttribute('aria-label', field.placeholder);
  const tick = el('label', 'poll-correct');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.setAttribute('aria-label', 'Option ' + n + ' is a right answer');
  tick.append(box, ' Right');
  row.append(field, tick);
  optionsBox.appendChild(row);
  button('poll-add').hidden = optionsBox.children.length >= MAX_OPTIONS;
}

function setType(t: string): void {
  const r = form.querySelector<HTMLInputElement>('input[name="poll-type"][value="' + t + '"]');
  if (r) r.checked = true;
  form.classList.toggle('is-quiz', t === 'quiz');
  $('poll-title').textContent = t === 'quiz' ? 'New quiz' : 'New poll';
}

function openForm(t: string): void {
  input('poll-question').value = '';
  optionsBox.replaceChildren();
  addOption(); addOption();
  setType(t);
  status.textContent = '';
  dialog.showModal();
  input('poll-question').focus();
}

button('poll-new').addEventListener('click', () => openForm('poll'));
button('quiz-new').addEventListener('click', () => openForm('quiz'));
form.addEventListener('change', () => setType(type()));
button('poll-add').addEventListener('click', () => {
  addOption();
  (optionsBox.lastElementChild?.querySelector('input') as HTMLInputElement).focus();
});
button('poll-cancel').addEventListener('click', () => dialog.close());
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const choices = Array.from(optionsBox.children).map((row) => {
    const [text, tick] = Array.from(row.querySelectorAll('input'));
    return { text: text.value, correct: tick.checked };
  });
  const t = type();
  const err = startPoll(input('poll-question').value, choices, t === 'secret', t === 'quiz');
  if (err) { status.textContent = err; return; }
  dialog.close();
});
